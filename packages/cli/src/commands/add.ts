/** add — 하네스 · v1 모듈을 켜고 그 몫만 깐다(HK-12 design §3, 설계 02 §3.3). 결과는 add-agent.sh 와 같다(lock · 메타 제외). */
import type { CommandResult, Ctx } from "../cli/context";
import { EXIT } from "../core/errors";
import { byteCompare } from "../core/fsx";
import { resolvedLock } from "../core/legacy-lock";
import type { LockEntry } from "../core/lock";
import { assertModuleDirs, parseNames, relayered, shareOf, winnerLayers, withNames, type Names } from "../core/selection-change";
import { skipByOwner, wanted, type Want } from "../core/update-plan";
import { judgeInstall } from "../projection/engine";
import { needsHuman, prepare } from "../projection/flow";
import { loadSpecOrNull } from "../projection/spec";
import { isExternalModule, runModuleAdd } from "../modules/engine";
import { ancestorsOf, withAfterMeta, applyChange, changeOverlay, currentOf, dryRunOf, kitOf, isKitCopy, loadForChange, manifestChange, report, retiredNotes, retiredOnly, type ChangeOp, type ChangeResult, type Cur, type Loaded } from "./change";

const kitEntry = (p: string, w: Want): LockEntry => ({ path: p, op: "copy", owner: "kit", sha256: w.sha256, layer: w.layer });
const userEntry = (p: string, layer: string): LockEntry => ({ path: p, op: "copy", owner: "user", sha256: null, layer });

function withD(p: string, w: Want, action: ChangeOp["action"]): ChangeOp {
  return { path: p, owner: "kit", layer: w.layer, action, executable: w.executable, content: w.content };
}

/** 몫의 경로 하나(design §3.2 표). */
function judgeShare(p: string, w: Want, e: LockEntry | undefined, cur: Cur): { op: ChangeOp; entry: LockEntry | null } {
  const skip = e ? skipByOwner(e) : null;
  if (e && skip) return { op: { path: p, owner: e.owner, layer: e.layer ?? w.layer, action: skip.action as ChangeOp["action"], ...(skip.reason ? { reason: skip.reason } : {}) }, entry: e };
  if (cur.kind === "other") return { op: { path: p, owner: e?.owner ?? "user", layer: w.layer, action: "skip-user", reason: cur.what }, entry: e ?? userEntry(p, w.layer) };
  if (cur.kind === "none") return { op: withD(p, w, e ? "restore" : "create"), entry: kitEntry(p, w) };
  if (!e) {
    if (cur.sha === w.sha256) return { op: { path: p, owner: "kit", layer: w.layer, action: "same" }, entry: kitEntry(p, w) };
    return { op: { path: p, owner: "user", layer: w.layer, action: "skip-user", reason: "사람이 둔 파일이다" }, entry: userEntry(p, w.layer) };
  }
  return { op: { path: p, owner: e.owner, layer: w.layer, action: "keep" }, entry: { ...e, layer: w.layer } };
}

export function planAdd(l: Loaded, names: Names): { after: ReturnType<typeof withNames>; result: ChangeResult } {
  const after = withNames(l.before, names);
  const afterLayers = winnerLayers(l.layout, l.loc.dir, after, l.tokens);
  const beforeLayers = winnerLayers(l.layout, l.loc.dir, l.before, l.tokens);
  const { want } = wanted({ layout: l.layout, templatesDir: l.loc.dir, selection: after, tokens: l.tokens });
  const { lock } = resolvedLock(l.inst, l.target, () => new Map([...want].map(([p, d]) => [p, d.sha256])));
  const locked = new Map(lock.entries.map((e) => [e.path, e]));
  const share = shareOf(l.layout, l.loc.dir, after, names, l.tokens, afterLayers);
  const ancestors = ancestorsOf(l.target);
  const ops: ChangeOp[] = [];
  for (const p of [...share].sort(byteCompare)) {
    const j = judgeShare(p, want.get(p) as Want, locked.get(p), currentOf(l.target, ancestors, p));
    ops.push(j.op);
    if (j.entry) locked.set(p, j.entry);
  }
  // 몫 밖에서 이기는 판이 바뀐 경로: 파일은 두고 lock 레이어만 바꾼다(setup.sh 재실행도 있는 파일을 건너뛴다).
  for (const p of relayered(beforeLayers, afterLayers, share)) {
    const e = locked.get(p);
    if (!e || !isKitCopy(e)) continue;
    const layer = afterLayers.get(p) as string;
    ops.push({ path: p, owner: e.owner, layer, action: "relayer", reason: "이기는 판이 바뀌었다 — 내용은 update 가 맞춘다" });
    locked.set(p, { ...e, layer });
  }
  const manifest = manifestChange(l, ancestors, after);
  const spec = loadSpecOrNull(l.loc.dir);
  if (!spec) return { after, result: { ops, entries: [...locked.values()], manifest, projection: null } };
  // 설치 판정(design §6.2): 새 하네스 몫은 create, 이미 있는 배치는 keep(add-agent.sh = setup.sh 재실행과 같다).
  const { writes: copyWrites, deletes } = changeOverlay(ops);
  const writes = withAfterMeta(l, after, copyWrites);
  const p = prepare({ target: l.target, spec, tokens: l.tokens, agents: after.agents, writes, deletes, copyPaths: want.keys() });
  const projection = judgeInstall({ target: l.target, spec, tokens: l.tokens, sources: p.sources, wants: p.wants, prev: l.inst.lock.entries, force: false });
  return { after, result: { ops, entries: [...locked.values()], manifest, projection, projectionFindings: p.findings } };
}

export async function runAdd(ctx: Ctx): Promise<CommandResult> {
  const kit = kitOf(ctx);
  const names = parseNames(kit.layout, ctx.positionals, "add");
  const only = retiredOnly(ctx, "add", names);
  if (only) return { ...only, data: { ...only.data, names: { ...names, already: [] } } };
  assertModuleDirs(kit.loc.dir, names.modules);
  // 외부 도구 모듈은 모듈 엔진이 맡는다(설계 10 §3.1). 나머지 이름은 아래 기존 흐름이 한 번에 한다.
  const external = names.modules.filter((m) => isExternalModule(kit.loc.dir, m));
  if (external.length) return runModuleAdd(ctx, kit, { ...names, modules: names.modules.filter((m) => !external.includes(m)) }, external);
  return runKitAdd(ctx, kit, names);
}

export function runKitAdd(ctx: Ctx, kit: ReturnType<typeof kitOf>, names: Names): CommandResult {
  const l = loadForChange(ctx, "add", kit);
  const already = [...names.harnesses.filter((h) => l.before.agents.includes(h)), ...names.modules.filter((m) => l.before.modules.includes(m))];
  const { after, result } = planAdd(l, names);
  const dryRun = dryRunOf(ctx);
  const featureDocs = dryRun ? null : applyChange(ctx, l, after, result);
  const notes = [...retiredNotes(names), ...(already.length ? [`  · 이미 켜져 있다 — 그 몫에서 빠진 파일만 채운다: ${already.join(", ")}`] : [])];
  const { data, lines } = report(ctx, l, { command: "add", names: { ...names, already }, after, result, dryRun, featureDocs, notes });
  const conflict = result.ops.some((o) => o.action === "conflict") || result.manifest?.action === "conflict" || needsHuman(result.projection ?? null, result.projectionFindings ?? []);
  return { code: conflict ? EXIT.HUMAN : EXIT.OK, data, lines };
}
