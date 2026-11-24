/**
 * `update --packs`(설계 04 §3.4 · §3.5 · §3.11, HK-14 design §3.3): 메타 `packs` 를 받아 팩 파일을 판정 · 쓰고 lock 에 `pack:<이름>` 으로 적는다.
 * 킷 판은 바꾸지 않는다. 팩끼리 같은 경로 · id 는 아무것도 쓰지 않고 exit 4, 팩 검사에 걸리면 exit 3.
 */
import fs from "node:fs";
import path from "node:path";
import { bool, str } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { CliError, EXIT, fsError } from "../core/errors";
import { byteCompare, writeFileAtomic } from "../core/fsx";
import { sha256 } from "../core/hash";
import { loadInstalled, selectionFromMeta, tokensFromMeta } from "../core/installed";
import { loadLayout } from "../core/layout";
import { LOCK_REL, serializeLock, type LockEntry } from "../core/lock";
import { fetchPack, planPack, type FetchedPack, type PackWant } from "../core/packs";
import { removeEmptyDirs, removeFile } from "../core/remove";
import { locateTemplates } from "../core/templates";
import { wanted, type UpdateAction, type UpdateOp, type UpdatePlan } from "../core/update-plan";
import { VERSION } from "../core/version";
import { applyProjection, PROJECTION_OPS } from "../projection/engine";
import { mergeEntries, needsHuman, projectionConflicts, projectionData, projectionLines } from "../projection/flow";
import { loadSpec } from "../projection/spec";
import { projectionForUpdate } from "./update";
import { renameLegacyState } from "../core/legacy-names";

export interface PackRecord {
  name: string;
  version: string;
  source: string;
  resolved: string;
  requiresKit: string;
}

type Cur = { kind: "none" } | { kind: "file"; sha: string } | { kind: "other" };

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

function current(target: string, rel: string): Cur {
  try {
    const st = fs.lstatSync(full(target, rel));
    if (!st.isFile()) return { kind: "other" };
    return { kind: "file", sha: sha256(fs.readFileSync(full(target, rel))) };
  } catch {
    return { kind: "none" };
  }
}

const isPack = (owner: string): boolean => owner.startsWith("pack:");

interface Judged {
  op: UpdateOp;
  entry: LockEntry | null;
}

/** 팩이 원하는 경로 하나(04 §3.11 주인 이전 표 · 02 §3.10 의 3방향 비교, B = lock 기준 해시). */
function judgeWant(target: string, dest: string, w: PackWant, owner: string, e: LockEntry | undefined, live: Set<string>): Judged {
  const cur = current(target, dest);
  const entry: LockEntry = { path: dest, op: "copy", owner, sha256: w.sha256, layer: w.layer };
  const op = (action: UpdateAction, extra: Partial<UpdateOp> = {}): UpdateOp => ({ path: dest, op: "copy", owner, layer: w.layer, action, content: w.content, sha256: w.sha256, executable: w.executable, ...extra });
  if (cur.kind === "other") return { op: { path: dest, op: "copy", owner: e?.owner ?? "user", layer: w.layer, action: "skip-user", reason: "파일이 아닌 것이 있다" }, entry: e ?? null };
  if (e?.owner.startsWith("external:")) return { op: { path: dest, op: e.op, owner: e.owner, layer: e.layer ?? null, action: "skip-external" }, entry: e };
  if (!e) {
    if (cur.kind === "none") return { op: op("new"), entry };
    if (cur.sha === w.sha256) return { op: op("same"), entry };
    return { op: { path: dest, op: "copy", owner: "user", layer: w.layer, action: "skip-user", reason: "사람이 둔 파일이다(팩 판과 다르다)" }, entry: { path: dest, op: "copy", owner: "user", sha256: null, layer: w.layer } };
  }
  if (e.owner === "user") {
    if (cur.kind === "file" && cur.sha === w.sha256) return { op: op("same", { reason: "프로젝트 판이 팩 판과 같아 주인을 팩으로 바꾼다" }), entry };
    return { op: { path: dest, op: e.op, owner: "user", layer: e.layer ?? null, action: "skip-user", reason: "프로젝트 판이 팩 판과 다르다" }, entry: e };
  }
  // 같은 팩이거나, 킷 · 빠진 팩이 갖던 경로를 이 팩이 가져간다(overrides).
  const mine = e.owner === owner;
  if (isPack(e.owner) && !mine && live.has(e.owner)) return { op: op("conflict", { reason: `${e.owner} 와 겹친다` }), entry: e };
  if (cur.kind === "none") return { op: op(mine ? "restore" : "new"), entry };
  if (cur.sha === w.sha256) return { op: op("same"), entry };
  if (e.sha256 && cur.sha === e.sha256) return { op: op("update", mine ? {} : { reason: `${e.owner}${e.layer ? `(${e.layer})` : ""} → ${owner}` }), entry };
  return { op: op("conflict", { newFile: `${dest}.new` }), entry: e };
}

/** 팩이 더 이상 주지 않는 lock 항목. 킷이 그 경로를 가지면 킷 판으로 돌아간다(04 §3.4). */
function judgeGone(target: string, e: LockEntry, kit: Map<string, { layer: string; content: Buffer; sha256: string; executable: boolean }>): Judged {
  const cur = current(target, e.path);
  const unmodified = cur.kind === "none" || (cur.kind === "file" && e.sha256 !== undefined && e.sha256 !== null && cur.sha === e.sha256);
  const k = kit.get(e.path);
  if (k) {
    if (unmodified) return { op: { path: e.path, op: "copy", owner: "kit", layer: k.layer, action: cur.kind === "none" ? "restore" : "update", content: k.content, sha256: k.sha256, executable: k.executable, reason: `${e.owner} 가 뺐다 — 킷 판으로` }, entry: { path: e.path, op: "copy", owner: "kit", sha256: k.sha256, layer: k.layer } };
    return { op: { path: e.path, op: "copy", owner: "user", layer: e.layer ?? null, action: "orphan", modified: true, reason: `${e.owner} 가 뺐고 사람이 고쳤다 — 주인을 user 로` }, entry: { ...e, owner: "user", sha256: null } };
  }
  if (cur.kind === "none") return { op: { path: e.path, op: "copy", owner: e.owner, layer: e.layer ?? null, action: "delete", reason: "파일이 이미 없다" }, entry: null };
  if (unmodified) return { op: { path: e.path, op: "copy", owner: e.owner, layer: e.layer ?? null, action: "delete", removeFile: true }, entry: null };
  return { op: { path: e.path, op: "copy", owner: "user", layer: e.layer ?? null, action: "orphan", modified: true, reason: `${e.owner} 가 뺐고 사람이 고쳤다 — 주인을 user 로` }, entry: { ...e, owner: "user", sha256: null } };
}

function conflictsBetween(plans: { pack: FetchedPack; wants: Map<string, PackWant> }[]): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const { pack, wants } of plans) {
    const me = `pack:${pack.manifest.name}@${pack.manifest.version}`;
    for (const dest of wants.keys()) {
      const other = seen.get(dest);
      if (other) out.push(`  ${dest.padEnd(44)} ${other}  ↔  ${me}`);
      else seen.set(dest, me);
    }
    for (const id of [...(pack.manifest.provides.hooks ?? []).map((h) => `hooks.json id ${h}`), ...(pack.manifest.provides.verifyChecks ?? []).map((c) => `verify-checks id ${c}`)]) {
      const other = seen.get(id);
      if (other) out.push(`  ${id.padEnd(44)} ${other}  ↔  ${me}`);
      else seen.set(id, me);
    }
  }
  return out;
}

function applyPacks(target: string, ops: UpdateOp[], lockText: string, projection: Parameters<typeof applyProjection>[1] | null): void {
  let currentPath = "";
  try {
    renameLegacyState(target);
    const deleted: string[] = [];
    for (const o of ops) {
      currentPath = o.path;
      if ((o.action === "new" || o.action === "restore" || o.action === "update") && o.content) writeFileAtomic(full(target, o.path), o.content, o.executable === true);
      else if (o.action === "conflict" && o.newFile && o.content) writeFileAtomic(full(target, o.newFile), o.content, false);
      else if (o.action === "delete" && o.removeFile) {
        removeFile(target, o.path);
        deleted.push(o.path);
      }
    }
    removeEmptyDirs(target, deleted);
    currentPath = "배치(mirror · render · merge)";
    if (projection) applyProjection(target, projection);
    currentPath = LOCK_REL;
    writeFileAtomic(full(target, LOCK_REL), Buffer.from(lockText, "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${currentPath}`);
  }
}

export function runUpdatePacks(ctx: Ctx): CommandResult {
  const { io } = ctx;
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "update --packs");
  if (inst.lockFormat !== "v2") throw new CliError(EXIT.STATE, "팩은 lock v2 에서만 깐다", "먼저 knots-sync update 로 lock 을 v2 로 올린다");
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io.env, cliFile: io.cliFile, cwd: io.cwd, version: VERSION });
  const layout = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout, selection, inst.meta, io.env, target);
  const kit = wanted({ layout, templatesDir: loc.dir, selection, tokens }).want;
  const sources = Array.isArray(inst.meta.packs) ? inst.meta.packs.filter((s): s is string => typeof s === "string") : [];
  const fetched = sources.map((s) => fetchPack(target, s, io.env));
  const plans = fetched.map((pack) => ({ pack, ...planPack(pack, { layout, selection, tokens, hookMap: loadSpec(loc.dir).hookMap, kitPaths: new Set(kit.keys()), kitVersion: VERSION }) }));
  const names = fetched.map((p) => p.manifest.name);
  const problems = plans.flatMap((p) => p.problems);
  for (const n of new Set(names)) if (names.filter((x) => x === n).length > 1) problems.push(`팩 이름 ${n} 이 packs 에 두 번 있다`);
  if (problems.length) throw new CliError(EXIT.STATE, `팩 검사 ${problems.length}건 — 아무것도 쓰지 않았다\n${problems.map((p) => `  ${p}`).join("\n")}`, "팩을 고쳐 새 판을 내거나 packs 에서 뺀다");
  const clash = conflictsBetween(plans);
  if (clash.length) {
    const lines = [`✖ 팩 충돌 ${clash.length}건 — 아무것도 쓰지 않았다`, ...clash, "  해결: 한 팩에서 빼고 새 판을 낸다. 또는 프로젝트가 직접 관리한다: knots-sync update --forget <경로>(주인을 user 로)"];
    return { code: EXIT.HUMAN, data: { command: "update", packs: true, target, conflicts: clash.map((l) => l.trim()) }, lines };
  }

  const byPath = new Map(inst.lock.entries.map((e) => [e.path, e]));
  const live = new Set(fetched.map((p) => `pack:${p.manifest.name}`));
  const ops: UpdateOp[] = [];
  const entries = new Map<string, LockEntry | null>();
  for (const { pack, wants } of plans) {
    const owner = `pack:${pack.manifest.name}`;
    for (const dest of [...wants.keys()].sort(byteCompare)) {
      const j = judgeWant(target, dest, wants.get(dest) as PackWant, owner, byPath.get(dest), live);
      ops.push(j.op);
      entries.set(dest, j.entry);
    }
  }
  const wantedNow = new Set(plans.flatMap((p) => [...p.wants.keys()]));
  for (const e of inst.lock.entries) {
    if (!isPack(e.owner) || wantedNow.has(e.path) || PROJECTION_OPS.has(e.op)) continue;
    const j = judgeGone(target, e, kit);
    ops.push(j.op);
    entries.set(e.path, j.entry);
  }
  const copyEntries = inst.lock.entries.filter((e) => !entries.has(e.path)).concat([...entries.values()].filter((e): e is LockEntry => e !== null));
  const plan: UpdatePlan = { ops, entries: copyEntries, counts: {} as UpdatePlan["counts"], overlaps: [], excludedByHarness: 0, wantPaths: new Set(copyEntries.filter((e) => e.op === "copy").map((e) => e.path)) };
  const projection = projectionForUpdate({ target, templatesDir: loc.dir, tokens, agents: selection.agents, inst, plan, acceptAll: false });
  const records: PackRecord[] = fetched.map((p) => ({ name: p.manifest.name, version: p.manifest.version, source: p.source, resolved: p.resolved, requiresKit: p.manifest.requires.kit }));
  const finalEntries = projection ? mergeEntries(copyEntries, projection.plan) : copyEntries;
  const lockText = serializeLock({ ...inst.lock, packs: records, entries: finalEntries.sort((a, b) => byteCompare(a.path, b.path)) });
  const dryRun = bool(ctx.values, "dry-run");
  if (!dryRun) applyPacks(target, ops, lockText, projection?.plan.ops ?? null);

  const conflict = ops.filter((o) => o.action === "conflict");
  const human = conflict.length > 0 || ops.some((o) => o.action === "orphan") || (projection ? needsHuman(projection.plan, projection.findings) : false);
  const shown = ops.filter((o) => o.action !== "same" || o.reason);
  const lines = [
    `knots-sync update --packs — ${target}`,
    ...records.map((r) => `  팩: ${r.name}@${r.version}  ${r.source}  (${r.resolved.slice(0, 19)})`),
    ...(records.length ? [] : ["  packs 가 비었다 — 팩 파일을 뺀다"]),
    ...shown.map((o) => `  ${o.action.padEnd(10)} ${o.path}${o.reason ? `  ${o.reason}` : ""}`),
    `  팩 파일: ${(["new", "update", "restore", "same", "conflict", "delete", "orphan", "skip-user"] as const).map((a) => `${a} ${ops.filter((o) => o.action === a).length}`).join(" · ")}`,
    ...(projection ? projectionLines(projection.plan, projection.findings, ctx.quiet) : []),
    ...(conflict.length ? ["  충돌 — 사람이 고친 파일이라 덮지 않았다. 새 판은 .new 에 있다"] : []),
    dryRun ? "  (dry-run — 쓰지 않았다)" : "  다음: knots-sync doctor --only overrides",
  ];
  const data: Record<string, unknown> = {
    command: "update",
    packs: true,
    target,
    dryRun,
    records,
    ops: shown.map((o) => ({ path: o.path, owner: o.owner, layer: o.layer, action: o.action, ...(o.reason ? { reason: o.reason } : {}), ...(o.newFile ? { new: o.newFile } : {}) })),
    conflicts: [...conflict.map((o) => ({ path: o.path, new: o.newFile ?? null })), ...projectionConflicts(projection?.plan ?? null)],
  };
  if (projection) data.projection = projectionData(projection.plan, projection.findings);
  return { code: human ? EXIT.HUMAN : EXIT.OK, data, lines };
}
