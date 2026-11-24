/** remove — 하네스 · v1 모듈을 끄고 킷 소유 · 미수정 몫만 지운다(HK-12 design §4, 설계 02 §3.3 · 10 §3.1). */
import path from "node:path";
import type { CommandResult, Ctx } from "../cli/context";
import { EXIT, usageError } from "../core/errors";
import { byteCompare } from "../core/fsx";
import { entryKind, ownerKind } from "../core/installed";
import { AMBIGUOUS_REASON, resolvedLock } from "../core/legacy-lock";
import type { LockEntry } from "../core/lock";
import { existing } from "../core/plan";
import { parseNames, relayered, winnerLayers, withoutNames, type Names } from "../core/selection-change";
import type { Selection } from "../core/selection";
import { skipByOwner, wanted, type Want } from "../core/update-plan";
import { judgeUpdate } from "../projection/engine";
import { needsHuman, prepare } from "../projection/flow";
import { loadSpecOrNull } from "../projection/spec";
import { isExternalModule, runModuleRemove } from "../modules/engine";
import { ancestorsOf, withAfterMeta, applyChange, changeOverlay, currentOf, dryRunOf, kitOf, loadForChange, manifestChange, report, retiredNotes, retiredOnly, type ChangeOp, type ChangeResult, type Cur, type Loaded } from "./change";

function keepAction(e: LockEntry): ChangeOp["action"] | null {
  const owner = ownerKind(e.owner);
  if (owner === "external") return "skip-external";
  if (owner === "pack") return "skip-pack";
  if (owner !== "kit" || entryKind(e) === "none") return "keep-user";
  return null;
}

/** 빠지는 경로 하나(design §4 표). entry undefined = lock 에서 뺀다. */
function judgeDrop(l: Loaded, p: string, e: LockEntry, cur: Cur, ambiguous: Set<string>): { op: ChangeOp; entry: LockEntry | undefined } {
  const keep = keepAction(e);
  const layer = e.layer ?? null;
  if (keep) return { op: { path: p, owner: e.owner, layer, action: keep }, entry: e };
  if (cur.kind === "none") return { op: { path: p, owner: e.owner, layer, action: "absent" }, entry: undefined };
  if (cur.kind === "file" && e.sha256 && cur.sha === e.sha256) {
    const neu = `${p}.new`;
    const alsoNew = existing(path.join(l.target, ...neu.split("/"))).kind === "file" ? { alsoNew: neu } : {};
    return { op: { path: p, owner: e.owner, layer, action: "delete", ...alsoNew }, entry: undefined };
  }
  const reason = cur.kind === "other" ? cur.what : ambiguous.has(p) ? AMBIGUOUS_REASON : e.sha256 ? "사람이 고친 파일이다" : "lock 에 기준 해시가 없다(고친 파일로 본다)";
  return { op: { path: p, owner: e.owner, layer, action: "keep-modified", reason }, entry: { path: p, op: "copy", owner: "user", sha256: null, ...(e.layer ? { layer: e.layer } : {}) } };
}

/** 남는 경로 중 이기는 판이 바뀐 것: update 판정(same · update · conflict)으로 새 판에 맞춘다. */
function judgeRelayer(l: Loaded, p: string, w: Want, e: LockEntry, cur: Cur): { op: ChangeOp; entry: LockEntry } {
  const skip = skipByOwner(e);
  if (skip) return { op: { path: p, owner: e.owner, layer: e.layer ?? null, action: skip.action as ChangeOp["action"] }, entry: e };
  const kit: LockEntry = { path: p, op: "copy", owner: "kit", sha256: w.sha256, layer: w.layer };
  const withD = { owner: "kit", layer: w.layer, executable: w.executable, content: w.content };
  if (cur.kind === "other") return { op: { path: p, owner: e.owner, layer: w.layer, action: "skip-user", reason: cur.what }, entry: e };
  if (cur.kind === "none") return { op: { path: p, owner: e.owner, layer: w.layer, action: "relayer", reason: "파일이 없다 — repair · update 가 되살린다" }, entry: { ...e, layer: w.layer } };
  if (cur.sha === w.sha256) return { op: { path: p, owner: "kit", layer: w.layer, action: "same" }, entry: kit };
  if (e.sha256 && cur.sha === e.sha256) return { op: { path: p, ...withD, action: "update" }, entry: kit };
  const neu = `${p}.new`;
  const newFile = existing(path.join(l.target, ...neu.split("/"))).kind === "other" ? {} : { newFile: neu };
  return { op: { path: p, ...withD, action: "conflict", ...newFile }, entry: { ...e, layer: w.layer } };
}

export function planRemove(l: Loaded, after: Selection): ChangeResult {
  const beforeLayers = winnerLayers(l.layout, l.loc.dir, l.before, l.tokens);
  const afterLayers = winnerLayers(l.layout, l.loc.dir, after, l.tokens);
  const oldWant = wanted({ layout: l.layout, templatesDir: l.loc.dir, selection: l.before, tokens: l.tokens }).want;
  const newWant = wanted({ layout: l.layout, templatesDir: l.loc.dir, selection: after, tokens: l.tokens }).want;
  const shaOf = (): Map<string, string> => new Map([...oldWant, ...newWant].map(([p, d]) => [p, d.sha256]));
  const { lock, ambiguous } = resolvedLock(l.inst, l.target, shaOf);
  const locked = new Map<string, LockEntry>(lock.entries.map((e) => [e.path, e]));
  const ancestors = ancestorsOf(l.target);
  const ops: ChangeOp[] = [];
  for (const p of [...beforeLayers.keys()].filter((x) => !afterLayers.has(x)).sort(byteCompare)) {
    const e = locked.get(p);
    if (!e) continue;
    const j = judgeDrop(l, p, e, currentOf(l.target, ancestors, p), ambiguous);
    ops.push(j.op);
    if (j.entry) locked.set(p, j.entry);
    else locked.delete(p);
  }
  for (const p of relayered(beforeLayers, afterLayers)) {
    const e = locked.get(p);
    if (!e) continue;
    const j = judgeRelayer(l, p, newWant.get(p) as Want, e, currentOf(l.target, ancestors, p));
    ops.push(j.op);
    locked.set(p, j.entry);
  }
  const manifest = manifestChange(l, ancestors, after);
  const spec = loadSpecOrNull(l.loc.dir);
  if (!spec) return { ops, entries: [...locked.values()], manifest, projection: null };
  // 빠지는 하네스의 배치는 지우고(고쳤으면 남긴다), 남는 배치 · 병합은 새 선택값에 맞춘다(design §6.5).
  const { writes: copyWrites, deletes } = changeOverlay(ops);
  const writes = withAfterMeta(l, after, copyWrites);
  const p = prepare({ target: l.target, spec, tokens: l.tokens, agents: after.agents, writes, deletes, copyPaths: newWant.keys() });
  const projection = judgeUpdate({ target: l.target, spec, tokens: l.tokens, sources: p.sources, wants: p.wants, prev: l.inst.lock.entries, copyNow: new Set(newWant.keys()), acceptAll: false, retire: false });
  return { ops, entries: [...locked.values()], manifest, projection, projectionFindings: p.findings };
}

export async function runRemove(ctx: Ctx): Promise<CommandResult> {
  const kit = kitOf(ctx);
  const asked = parseNames(kit.layout, ctx.positionals, "remove");
  const only = retiredOnly(ctx, "remove", asked);
  if (only) return { ...only, data: { ...only.data, names: { ...asked, notOn: [] } } };
  const external = asked.modules.filter((m) => isExternalModule(kit.loc.dir, m));
  if (external.length) return runModuleRemove(ctx, kit, { ...asked, modules: asked.modules.filter((m) => !external.includes(m)) }, external);
  return runKitRemove(ctx, kit, asked);
}

export function runKitRemove(ctx: Ctx, kit: ReturnType<typeof kitOf>, asked: Names): CommandResult {
  const l = loadForChange(ctx, "remove", kit);
  const notOn = [...asked.harnesses.filter((h) => !l.before.agents.includes(h)), ...asked.modules.filter((m) => !l.before.modules.includes(m))];
  const names: Names = { harnesses: asked.harnesses.filter((h) => !notOn.includes(h)), modules: asked.modules.filter((m) => !notOn.includes(m)), retired: asked.retired };
  const after = withoutNames(l.before, names);
  if (after.agents.length === 0) throw usageError("하네스를 모두 뺄 수 없다 — 하나는 남는다", "킷을 통째로 지우려면 knots-sync uninstall");
  const dryRun = dryRunOf(ctx);
  const nothing = names.harnesses.length + names.modules.length === 0;
  const result: ChangeResult = nothing ? { ops: [], entries: l.inst.lock.entries, manifest: null } : planRemove(l, after);
  const featureDocs = dryRun || nothing ? null : applyChange(ctx, l, after, result);
  const notes = [...retiredNotes(asked), ...(notOn.length ? [`  · 켜져 있지 않다 — 건너뛴다: ${notOn.join(", ")}`] : [])];
  const keep = [...result.ops.filter((o) => o.action === "keep-modified").map((o) => o.path), ...(result.projection?.ops ?? []).filter((o) => o.action === "keep-modified").map((o) => o.path)];
  const { data, lines } = report(ctx, l, { command: "remove", names: { ...names, notOn }, after, result, dryRun, featureDocs, notes, extra: { keep } });
  if (keep.length) lines.splice(lines.length - 1, 0, "  고친 파일은 남겼다(lock 은 owner user). 필요 없으면 직접 지운다");
  const human = keep.length > 0 || result.ops.some((o) => o.action === "conflict") || result.manifest?.action === "conflict" || needsHuman(result.projection ?? null, result.projectionFindings ?? []);
  return { code: human ? EXIT.HUMAN : EXIT.OK, data, lines };
}
