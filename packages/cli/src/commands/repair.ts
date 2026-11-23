/** repair — 킷 판 그대로 missing 을 되살린다. 사람이 고친 copy 는 그대로 둔다(HK-11 design §4, 설계 02 §3.12). */
import fs from "node:fs";
import path from "node:path";
import { bool, str } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { EXIT, fsError, usageError } from "../core/errors";
import { writeFileAtomic } from "../core/fsx";
import { sha256 } from "../core/hash";
import { entryKind, loadInstalled, ownerKind, selectionFromMeta, tokensFromMeta, type Installed } from "../core/installed";
import { loadLayout } from "../core/layout";
import { LOCK_REL, serializeLock, type LockEntry } from "../core/lock";
import { AncestorCheck, existing } from "../core/plan";
import { locateTemplates } from "../core/templates";
import { wanted, type Want } from "../core/update-plan";
import { VERSION } from "../core/version";

export const REPAIR_KINDS = ["missing", "drifted", "stale", "merge"];

type RepairAction = "restore" | "needs-update" | "unrestorable";

interface RepairOp {
  path: string;
  action: RepairAction;
  layer: string | null;
  reason?: string;
  want?: Want;
}

interface Survey {
  ok: number;
  drifted: number;
  skipped: number;
  missing: LockEntry[];
}

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

function parseOnly(raw: string | undefined): string[] {
  if (raw === undefined) return [...REPAIR_KINDS];
  const only = raw.split(/[\s,]+/).filter(Boolean);
  const unknown = only.filter((k) => !REPAIR_KINDS.includes(k));
  if (unknown.length || only.length === 0) throw usageError(`모르는 repair 종류: ${unknown.join(" ") || "(빈 값)"}`, `사용 가능: ${REPAIR_KINDS.join(" ")}`);
  return only;
}

/** copy · kit 항목을 ok · drifted · missing 으로 나눈다. 그 밖의 주인 · op none 은 skipped. */
function survey(target: string, inst: Installed): Survey {
  const ancestors = new AncestorCheck(target, fs.realpathSync(target));
  const out: Survey = { ok: 0, drifted: 0, skipped: 0, missing: [] };
  for (const e of inst.lock.entries) {
    if (ownerKind(e.owner) !== "kit" || entryKind(e) !== "copy") {
      out.skipped += 1;
      continue;
    }
    if (ancestors.state(e.path) === "blocked") {
      out.drifted += 1;
      continue;
    }
    const cur = existing(full(target, e.path));
    if (cur.kind === "none") out.missing.push(e);
    else if (cur.kind === "file" && e.sha256 && sha256(cur.bytes) === e.sha256) out.ok += 1;
    else out.drifted += 1;
  }
  return out;
}

function wantFor(ctx: Ctx, target: string, inst: Installed): { want: Map<string, Want>; templates: string } {
  const { io } = ctx;
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io.env, cliFile: io.cliFile, cwd: io.cwd, version: VERSION });
  const layout = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout, selection, inst.meta, io.env, target);
  return { want: wanted({ layout, templatesDir: loc.dir, selection, tokens }).want, templates: loc.dir };
}

function judgeMissing(e: LockEntry, lockVersion: string | null, want: Map<string, Want> | null): RepairOp {
  const base = { path: e.path, layer: e.layer ?? null };
  if (lockVersion !== VERSION || !want) {
    const reason = lockVersion ? `lock 의 킷 판 ${lockVersion} ≠ CLI ${VERSION}` : "lock 에 킷 판이 없다(v1)";
    return { ...base, action: "needs-update", reason };
  }
  const w = want.get(e.path);
  if (!w) return { ...base, action: "unrestorable", reason: "이 킷에 없는 경로다" };
  if (e.sha256 && w.sha256 !== e.sha256) return { ...base, action: "needs-update", reason: "킷 내용이 lock 기록과 다르다" };
  return { ...base, action: "restore", want: w };
}

function applyRepair(target: string, inst: Installed, ops: RepairOp[]): void {
  const restored = new Map(ops.filter((o) => o.action === "restore").map((o) => [o.path, o.want as Want]));
  let current = "";
  try {
    for (const [rel, w] of restored) {
      current = rel;
      writeFileAtomic(full(target, rel), w.content, w.executable);
    }
    const entries = inst.lock.entries.map((e) => {
      const w = restored.get(e.path);
      return w ? { ...e, sha256: w.sha256, layer: w.layer } : e;
    });
    current = LOCK_REL;
    writeFileAtomic(full(target, LOCK_REL), Buffer.from(serializeLock({ ...inst.lock, entries }), "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current}`);
  }
}

const HINTS: Record<string, string> = {
  "needs-update": "harness-kit update 로 킷 판을 맞춘다(되살리는 일도 update 가 한다)",
  unrestorable: "킷에서 빠진 경로다. lock 에서 빼려면 harness-kit update --prune, 받지 않으려면 --forget <경로>",
};

export function runRepair(ctx: Ctx): CommandResult {
  const target = targetOf(ctx);
  const only = parseOnly(str(ctx.values, "only"));
  const inst = loadInstalled(target, "repair");
  const lockVersion = inst.lock.kit.version;
  const s = survey(target, inst);
  const doMissing = only.includes("missing") && s.missing.length > 0;
  const source = doMissing && lockVersion === VERSION ? wantFor(ctx, target, inst) : null;
  const ops = doMissing ? s.missing.map((e) => judgeMissing(e, lockVersion, source?.want ?? null)) : [];
  const dryRun = bool(ctx.values, "dry-run");
  const count = (a: RepairAction): number => ops.filter((o) => o.action === a).length;
  if (!dryRun && count("restore") > 0) applyRepair(target, inst, ops);

  const counts = { ok: s.ok, drifted: s.drifted, missing: s.missing.length, restore: count("restore"), "needs-update": count("needs-update"), unrestorable: count("unrestorable"), skipped: s.skipped };
  const hints = (["needs-update", "unrestorable"] as const).filter((a) => counts[a] > 0).map((a) => HINTS[a] as string);
  const code = hints.length ? EXIT.HUMAN : EXIT.OK;
  const opsJson = ops.map((o) => ({ path: o.path, layer: o.layer, action: o.action, ...(o.reason ? { reason: o.reason } : {}) }));
  const data: Record<string, unknown> = { command: "repair", target, dryRun, kit: { lock: lockVersion, cli: VERSION }, only, counts, ops: opsJson, hints };
  if (source) data.templates = source.templates;
  const lines = [
    `harness-kit repair — ${target}`,
    `  킷: lock ${lockVersion ?? "?(v1)"} · CLI ${VERSION}`,
    ...ops.map((o) => `  ${o.action.padEnd(13)} ${o.path}${o.reason ? `  ${o.reason}` : ""}`),
    `  copy 항목: ok ${counts.ok} · drifted ${counts.drifted}(사람이 고친 파일 — 그대로 둔다) · missing ${counts.missing}`,
    `  되살림 ${counts.restore} · update 필요 ${counts["needs-update"]} · 킷에 없음 ${counts.unrestorable}`,
    ...hints.map((h) => `  다음: ${h}`),
    ...(dryRun ? ["  (dry-run — 쓰지 않았다)"] : []),
  ];
  return { code, data, lines };
}
