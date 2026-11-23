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
import type { FileWant, Finding, MergeOpWant } from "../adapters/types";
import { applyProjection, PROJECTION_OPS, projCounts, projLine, projOpJson, projSummary, stateOf, type Cur, type ProjOp } from "../projection/engine";
import { prepare } from "../projection/flow";
import { mergeWith, missingWith } from "../projection/merge";
import { loadSpecOrNull } from "../projection/spec";

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

function applyRepair(target: string, inst: Installed, ops: RepairOp[], projection: ProjectionRepair | null): void {
  const restored = new Map(ops.filter((o) => o.action === "restore").map((o) => [o.path, o.want as Want]));
  let current = "";
  try {
    for (const [rel, w] of restored) {
      current = rel;
      writeFileAtomic(full(target, rel), w.content, w.executable);
    }
    current = "배치(mirror · render · merge)";
    if (projection) applyProjection(target, projection.ops);
    const copies = inst.lock.entries.map((e) => {
      const w = restored.get(e.path);
      return w ? { ...e, sha256: w.sha256, layer: w.layer } : e;
    });
    const entries = projection ? [...copies.filter((e) => !projection.touched.has(e.path)), ...projection.entries] : copies;
    current = LOCK_REL;
    writeFileAtomic(full(target, LOCK_REL), Buffer.from(serializeLock({ ...inst.lock, entries }), "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current}`);
  }
}

interface ProjectionRepair {
  ops: ProjOp[];
  /** 새로 적을 lock 항목(touched 경로의 것) */
  entries: LockEntry[];
  touched: Set<string>;
  unrestorable: number;
  findings: Finding[];
}

function chosen(only: string[], kind: string): boolean {
  return only.includes(kind);
}

/** 배치 항목을 지금 원본으로 되살린다(design §6.4). 킷 판 번호와 무관하다. */
function repairProjection(ctx: Ctx, target: string, inst: Installed, only: string[]): ProjectionRepair | null {
  const { io } = ctx;
  // 배치 항목이 없는 설치(배치를 모르는 킷으로 깐 리포)에는 배치를 새로 만들지 않는다.
  if (!inst.lock.entries.some((e) => PROJECTION_OPS.has(e.op))) return null;
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io.env, cliFile: io.cliFile, cwd: io.cwd, version: VERSION });
  const spec = loadSpecOrNull(loc.dir);
  if (!spec) return null;
  const layout = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout, selection, inst.meta, io.env, target);
  const p = prepare({ target, spec, tokens, agents: selection.agents });
  const out: ProjectionRepair = { ops: [], entries: [], touched: new Set(), unrestorable: 0, findings: p.findings };
  const byPath = new Map(inst.lock.entries.map((e) => [e.path, e]));
  for (const w of [...p.wants].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const r = w.op === "merge" ? repairMerge(target, w, byPath.get(w.path), only) : repairFile(target, w, byPath.get(w.path), only);
    if (!r) continue;
    out.touched.add(w.path);
    if (r.op) out.ops.push(r.op);
    if (r.entry) out.entries.push(r.entry);
  }
  const wanted = new Set(p.wants.map((w) => w.path));
  for (const e of inst.lock.entries) {
    if (!PROJECTION_OPS.has(e.op) || e.owner !== "kit" || wanted.has(e.path) || e.op === "merge") continue;
    out.unrestorable += 1;
    out.ops.push({ path: e.path, op: e.op, harness: "", action: "unrestorable", reason: "원본이 없다 — update 가 지운다" });
  }
  return out;
}

type Repaired = { op?: ProjOp; entry?: LockEntry } | null;

function repairMerge(target: string, w: MergeOpWant, e: LockEntry | undefined, only: string[]): Repaired {
  const p = full(target, w.path);
  const cur = fs.existsSync(p) && fs.lstatSync(p).isFile() ? fs.readFileSync(p, "utf8") : null;
  const keys = e && Array.isArray(e.keys) ? (e.keys as string[]) : undefined;
  const lost = cur === null ? ["(파일 없음)"] : keys ? missingWith(w.kind, cur, keys, w.want) : [];
  if ((lost.length === 0 && e) || !chosen(only, cur === null ? "missing" : "merge")) return null;
  const r = mergeWith(w.kind, cur, w.want, keys);
  if (!r.ok) return { op: { path: w.path, op: "merge", harness: w.harness, action: "conflict", reason: r.reason } };
  const created = e?.createdByKit === true || r.created;
  const entry: LockEntry = created ? { path: w.path, op: "merge", owner: "kit", keys: r.keys, createdByKit: true } : { path: w.path, op: "merge", owner: "kit", keys: r.keys };
  if (cur === r.text) return { entry };
  return { op: { path: w.path, op: "merge", harness: w.harness, action: cur === null ? "restore" : "remerge", effect: { text: r.text } }, entry };
}

function fileOp(w: FileWant, action: string, extra: Partial<ProjOp> = {}): ProjOp {
  return { path: w.path, op: w.op, harness: w.harness, action, ...extra, effect: { ...extra.effect, write: w } };
}

/** 고친 생성물: 다른 파일을 .bak 으로 옮기고 다시 만든다(design §6.4, D5). */
function backupOp(w: FileWant, cur: Cur): ProjOp {
  const have = cur.kind === "file" ? (cur.files ?? new Map<string, Buffer>()) : new Map<string, Buffer>();
  const same = (rel: string): boolean => w.files.some((f) => f.rel === rel && f.bytes.equals(have.get(rel) as Buffer));
  const backups = w.kind === "dir" ? [...have.keys()].filter((rel) => !same(rel)).map((rel) => `${w.path}/${rel}.bak`) : [`${w.path}.bak`];
  const renames = backups.map((b) => [b.slice(0, -".bak".length), b] as [string, string]);
  return fileOp(w, "backup", { reason: "생성 파일을 직접 고쳤다 — 수정본을 .bak 으로 옮겼다", backups, effect: { renames } });
}

function repairFile(target: string, w: FileWant, e: LockEntry | undefined, only: string[]): Repaired {
  if (w.deferred || (e && e.owner !== "kit")) return null;
  const cur = stateOf(target, w.path, w.kind === "dir");
  const entry: LockEntry = { path: w.path, op: w.op, owner: "kit", sha256: w.sha256, from: w.from, fromSha256: w.fromSha256 };
  const when = (kind: string, op: ProjOp): Repaired => (chosen(only, kind) ? { op, entry } : null);
  if (!e) {
    if (cur.kind === "none") return when("missing", fileOp(w, "create"));
    return cur.kind === "file" && cur.sha === w.sha256 ? { entry } : null;
  }
  if (cur.kind === "other") return null;
  if (cur.kind === "link") return when("drifted", fileOp(w, "relink", { reason: "symlink-found" }));
  if (cur.kind === "none") return when("missing", fileOp(w, "restore"));
  if (cur.sha === w.sha256) return { entry };
  if (typeof e.sha256 === "string" && cur.sha === e.sha256) return when("stale", fileOp(w, "regenerate", { reason: "원본이 바뀌었다" }));
  return when("drifted", backupOp(w, cur));
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
  const projection = repairProjection(ctx, target, inst, only);
  const projectionWrites = (projection?.ops ?? []).some((o) => o.effect) || (projection?.entries ?? []).some((e) => JSON.stringify(e) !== JSON.stringify(inst.lock.entries.find((x) => x.path === e.path)));
  if (!dryRun && (count("restore") > 0 || projectionWrites)) applyRepair(target, inst, ops, projection);

  const counts = { ok: s.ok, drifted: s.drifted, missing: s.missing.length, restore: count("restore"), "needs-update": count("needs-update"), unrestorable: count("unrestorable") + (projection?.unrestorable ?? 0), skipped: s.skipped };
  const hints = (["needs-update", "unrestorable"] as const).filter((a) => counts[a] > 0).map((a) => HINTS[a] as string);
  const code = hints.length || (projection?.ops ?? []).some((o) => o.action === "conflict") ? EXIT.HUMAN : EXIT.OK;
  const opsJson = ops.map((o) => ({ path: o.path, layer: o.layer, action: o.action, ...(o.reason ? { reason: o.reason } : {}) }));
  const data: Record<string, unknown> = { command: "repair", target, dryRun, kit: { lock: lockVersion, cli: VERSION }, only, counts, ops: opsJson, hints };
  if (projection) data.projection = { counts: projCounts(projection.ops), ops: projection.ops.map(projOpJson), findings: projection.findings };
  if (source) data.templates = source.templates;
  const lines = [
    `harness-kit repair — ${target}`,
    `  킷: lock ${lockVersion ?? "?(v1)"} · CLI ${VERSION}`,
    ...ops.map((o) => `  ${o.action.padEnd(13)} ${o.path}${o.reason ? `  ${o.reason}` : ""}`),
    `  copy 항목: ok ${counts.ok} · drifted ${counts.drifted}(사람이 고친 파일 — 그대로 둔다) · missing ${counts.missing}`,
    `  되살림 ${counts.restore} · update 필요 ${counts["needs-update"]} · 킷에 없음 ${counts.unrestorable}`,
    ...(projection ? [...projection.ops.map(projLine), projSummary(projection.ops)] : []),
    ...hints.map((h) => `  다음: ${h}`),
    ...(dryRun ? ["  (dry-run — 쓰지 않았다)"] : []),
  ];
  return { code, data, lines };
}
