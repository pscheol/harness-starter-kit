/** doctor — 읽기만 한다(HK-8 design §7.1, 설계 02 §3.11 중 copy · 메타 · lock · 버전 · .gitignore · 진입 파일). */
import fs from "node:fs";
import path from "node:path";
import { bool, str } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { CliError, EXIT, usageError } from "../core/errors";
import { lstatOrNull } from "../core/fsx";
import { sha256File } from "../core/hash";
import { LOCK_REL, readLock, type LockV2 } from "../core/lock";
import { META_REL, readMeta, type MetaV2 } from "../core/meta";
import { isSafeRelPath } from "../core/plan";
import { compareSemver, VERSION } from "../core/version";

export type Severity = "error" | "warn" | "info";

export interface Finding {
  kind: string;
  severity: Severity;
  path?: string;
  owner?: string;
  hint?: string;
  detail?: Record<string, unknown>;
}

export const DOCTOR_KINDS = ["meta-invalid", "lock-invalid", "lock-v1", "version-mismatch", "missing", "drifted", "gitignore", "entry-size"];
export const GITIGNORE_NEEDS = [".agents/state/", ".agents/local/", ".agents/reports/"];
export const ENTRY_FILES = ["AGENTS.md", "CLAUDE.md"];
export const ENTRY_LIMIT = 24 * 1024;

function versionFindings(meta: MetaV2 | null, lock: LockV2 | null): Finding[] {
  const out: Finding[] = [];
  const installed = meta && meta.kit.version !== "unknown" ? meta.kit.version : null;
  if (installed) {
    const cmp = compareSemver(installed, VERSION);
    if (cmp === null || cmp !== 0) {
      const newer = cmp !== null && cmp > 0;
      out.push({
        kind: "version-mismatch",
        severity: newer ? "error" : "warn",
        path: META_REL,
        hint: newer
          ? `설치된 킷(${installed})이 이 CLI(${VERSION})보다 새것이다. 새 CLI 로 다시 실행한다`
          : `설치 ${installed} · CLI ${VERSION}. 킷을 올리려면 harness-kit update(다음 조각)`,
        detail: { installed, cli: VERSION },
      });
    }
  }
  const lockVersion = lock?.kit.version ?? null;
  if (installed && lockVersion && lockVersion !== installed) {
    out.push({ kind: "version-mismatch", severity: "warn", path: LOCK_REL, hint: "메타와 lock 의 킷 버전이 다르다", detail: { meta: installed, lock: lockVersion } });
  }
  return out;
}

function fileState(full: string, sha: string | null | undefined): "ok" | "missing" | "drifted" | { unreadable: string } {
  const st = lstatOrNull(full);
  if (!st || !st.isFile()) return "missing";
  try {
    return sha && sha256File(full) === sha ? "ok" : "drifted";
  } catch (err) {
    return { unreadable: (err as NodeJS.ErrnoException).code ?? String(err) };
  }
}

function copyFindings(target: string, lock: LockV2): { ok: number; findings: Finding[] } {
  let ok = 0;
  const findings: Finding[] = [];
  const unsafe: string[] = [];
  for (const e of lock.entries) {
    if (!isSafeRelPath(e.path)) {
      unsafe.push(e.path);
      continue;
    }
    if (e.op !== "copy" || e.owner !== "kit") continue;
    const state = fileState(path.join(target, ...e.path.split("/")), e.sha256);
    if (state === "ok") ok += 1;
    else if (state === "missing") {
      findings.push({ kind: "missing", severity: "error", path: e.path, owner: e.owner, hint: "킷 파일이 없다. 다시 받으려면 harness-kit repair(다음 조각)" });
    } else if (state === "drifted") {
      findings.push({ kind: "drifted", severity: "info", path: e.path, owner: e.owner, hint: "사람이 고친 파일이다. update 때 .new 로 받는다" });
    } else {
      findings.push({ kind: "missing", severity: "error", path: e.path, owner: e.owner, hint: `파일을 읽지 못했다(${state.unreadable})` });
    }
  }
  if (unsafe.length) {
    findings.unshift({ kind: "lock-invalid", severity: "error", path: LOCK_REL, hint: "리포 밖이나 .git 을 가리키는 항목이 있다(보지 않았다)", detail: { paths: unsafe } });
  }
  return { ok, findings };
}

function gitignoreFinding(target: string): Finding | null {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(path.join(target, ".gitignore"), "utf8").split(/\r?\n/).map((l) => l.trim());
  } catch {
    lines = [];
  }
  const has = (want: string): boolean => {
    const bare = want.replace(/\/$/, "");
    return [want, bare, `/${want}`, `/${bare}`].some((v) => lines.includes(v));
  };
  const missing = GITIGNORE_NEEDS.filter((w) => !has(w));
  if (missing.length === 0) return null;
  return { kind: "gitignore", severity: "warn", path: ".gitignore", hint: `커밋하지 않는 폴더 ${missing.join(" · ")} 를 넣는다`, detail: { missing } };
}

function entrySizeFinding(target: string): Finding | null {
  let bytes = 0;
  for (const f of ENTRY_FILES) {
    const st = lstatOrNull(path.join(target, f));
    if (st?.isFile()) bytes += st.size;
  }
  if (bytes <= ENTRY_LIMIT) return null;
  return {
    kind: "entry-size",
    severity: "warn",
    path: "AGENTS.md",
    hint: `AGENTS.md + CLAUDE.md = ${bytes}바이트(상한 ${ENTRY_LIMIT}). 세부는 .agents/rules/ 로 옮긴다`,
    detail: { bytes, limit: ENTRY_LIMIT },
  };
}

const MARK: Record<Severity, string> = { error: "✖", warn: "⚠", info: "·" };

function parseOnly(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  const only = raw.split(/[\s,]+/).filter(Boolean);
  const unknown = only.filter((k) => !DOCTOR_KINDS.includes(k));
  if (unknown.length) throw usageError(`모르는 검사 종류: ${unknown.join(" ")}`, `사용 가능: ${DOCTOR_KINDS.join(" ")}`);
  return only;
}

interface Collected {
  meta: MetaV2 | null;
  lock: LockV2 | null;
  ok: number;
  findings: Finding[];
}

/** 검사 전부. 메타가 없으면(설치 안 됨) exit 3. */
function collect(target: string): Collected {
  const metaRead = readMeta(path.join(target, META_REL));
  if (metaRead.status === "missing") {
    throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, "설치는 harness-kit init");
  }
  const findings: Finding[] = [];
  const meta = metaRead.status === "ok" ? metaRead.meta : null;
  if (metaRead.status === "invalid") findings.push({ kind: "meta-invalid", severity: "error", path: META_REL, hint: metaRead.error });

  const lockRead = readLock(path.join(target, LOCK_REL));
  const lock = lockRead.status === "ok" ? lockRead.lock : null;
  if (lockRead.status === "ok" && lockRead.format === "v1") {
    findings.push({ kind: "lock-v1", severity: "info", path: LOCK_REL, hint: "v1(TSV) lock 이다. update 가 v2 로 바꾼다" });
  }
  if (lockRead.status !== "ok") {
    findings.push({ kind: "lock-invalid", severity: "error", path: LOCK_REL, hint: lockRead.status === "missing" ? "lock 이 없다" : lockRead.error });
  }
  findings.push(...versionFindings(meta, lock));
  const copy = lock ? copyFindings(target, lock) : { ok: 0, findings: [] };
  findings.push(...copy.findings);
  for (const f of [gitignoreFinding(target), entrySizeFinding(target)]) if (f) findings.push(f);
  return { meta, lock, ok: copy.ok, findings };
}

function summarize(findings: Finding[], ok: number): Record<string, number> {
  const count = (pred: (f: Finding) => boolean): number => findings.filter(pred).length;
  return {
    ok,
    drifted: count((f) => f.kind === "drifted"),
    missing: count((f) => f.kind === "missing"),
    errors: count((f) => f.severity === "error"),
    warnings: count((f) => f.severity === "warn"),
    infos: count((f) => f.severity === "info"),
  };
}

function findingLine(f: Finding): string {
  const hint = f.hint ? ` — ${f.hint}` : "";
  return `  ${MARK[f.severity]} ${f.kind.padEnd(16)} ${f.path ?? ""}${hint}`;
}

export function runDoctor(ctx: Ctx): CommandResult {
  const target = targetOf(ctx);
  const only = parseOnly(str(ctx.values, "only"));
  const c = collect(target);
  const findings = only ? c.findings.filter((f) => only.includes(f.kind)) : c.findings;
  const summary = summarize(findings, c.ok);
  const code = bool(ctx.values, "check") && (summary.errors ?? 0) > 0 ? EXIT.CHECK : EXIT.OK;
  const kit = { installed: c.meta?.kit.version ?? null, lock: c.lock?.kit.version ?? null, cli: VERSION };
  const lines = [
    `harness-kit doctor — ${target}`,
    `  킷: 설치 ${kit.installed ?? "?"} · lock ${kit.lock ?? "?"} · CLI ${kit.cli}`,
    `  copy 항목: ok ${summary.ok} · drifted ${summary.drifted} · missing ${summary.missing}`,
    `  오류 ${summary.errors} · 경고 ${summary.warnings} · 정보 ${summary.infos}`,
    ...(ctx.quiet ? [] : findings.map(findingLine)),
  ];
  return { code, data: { command: "doctor", target, kit, summary, findings }, lines };
}
