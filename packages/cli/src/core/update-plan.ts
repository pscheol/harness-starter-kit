/**
 * update 의 3방향 비교(HK-11 design §3.1, 설계 02 §3.10).
 * D = 새 킷이 원하는 내용, C = 지금 파일, B = lock sha256, O = lock owner.
 * 판정과 새 lock 항목만 만든다. 쓰기는 commands/update.ts 가 한다.
 */
import fs from "node:fs";
import path from "node:path";
import { usageError } from "./errors";
import { sameOutsideGenerated } from "./generated";
import { byteCompare } from "./fsx";
import { sha256 } from "./hash";
import { entryKind, ownerKind } from "./installed";
import { isExecutable, type Layout } from "./layout";
import type { LockEntry, LockV2 } from "./lock";
import { AncestorCheck, assertSafeRelPath, BLOCKED, existing, isSafeRelPath } from "./plan";
import { readTemplate, resolveCandidates, type Overlap } from "./resolve";
import type { Selection } from "./selection";
import { substitute } from "./tokens";
import { renamedKitPath } from "./legacy-names";

const PROJECTION_OPS = new Set(["mirror", "render", "merge"]);

export const UPDATE_ACTIONS = [
  "new", "restore", "update", "same", "conflict", "replace", "orphan", "delete", "skip-user", "skip-external", "skip-pack", "forget", "merge",
] as const;
export type UpdateAction = (typeof UPDATE_ACTIONS)[number];

export interface UpdateOp {
  path: string;
  op: string;
  owner: string;
  layer: string | null;
  action: UpdateAction;
  reason?: string;
  executable?: boolean;
  /** D(new · restore · update · replace · conflict) */
  content?: Buffer;
  sha256?: string;
  /** conflict: D 를 둘 자리(쓸 수 없으면 없음) */
  newFile?: string;
  newRefreshed?: boolean;
  /** replace: C 를 옮길 자리 */
  backup?: string;
  /** orphan: sha(C) ≠ B */
  modified?: boolean;
  /** delete: 지울 파일이 있다 */
  removeFile?: boolean;
  /** v1 lock 첫 update(HK-25): 갈래(kit · lines · keys)와 원본을 둘 자리. content 는 결과(kit 이면 D) */
  merge?: "kit" | "lines" | "keys";
  mergeBackup?: string;
}

export interface UpdatePlan {
  ops: UpdateOp[];
  entries: LockEntry[];
  counts: Record<UpdateAction, number>;
  overlaps: Overlap[];
  excludedByHarness: number;
  /** 이번 킷의 copy 설치 경로(D) */
  wantPaths: Set<string>;
}

export interface UpdateInput {
  layout: Layout;
  templatesDir: string;
  target: string;
  selection: Selection;
  tokens: Record<string, string>;
  lock: LockV2;
  acceptAll: boolean;
  prune: boolean;
  forget: string[];
}

export interface Want {
  layer: string;
  content: Buffer;
  sha256: string;
  executable: boolean;
}

type Cur = { kind: "none" } | { kind: "file"; sha: string } | { kind: "other"; what: string };

interface Judged {
  op: UpdateOp;
  entry: LockEntry | null;
}

interface Ctx {
  target: string;
  ancestors: AncestorCheck;
  acceptAll: boolean;
  prune: boolean;
}

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

function current(ctx: Ctx, rel: string): Cur {
  if (ctx.ancestors.state(rel) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(full(ctx.target, rel));
  if (cur.kind === "file") return { kind: "file", sha: sha256(cur.bytes) };
  return cur;
}

const kitEntry = (p: string, w: Want): LockEntry => ({ path: p, op: "copy", owner: "kit", sha256: w.sha256, layer: w.layer });
const userEntry = (p: string, layer: string): LockEntry => ({ path: p, op: "copy", owner: "user", sha256: null, layer });

function withD(p: string, w: Want, action: UpdateAction, extra: Partial<UpdateOp> = {}): UpdateOp {
  return { path: p, op: "copy", owner: "kit", layer: w.layer, action, executable: w.executable, content: w.content, sha256: w.sha256, ...extra };
}

/** O 가 kit · copy 가 아니면 쓰지 않는다(표의 위 다섯 줄). */
export function skipByOwner(e: LockEntry): { action: UpdateAction; reason?: string } | null {
  switch (ownerKind(e.owner)) {
    case "user":
      return { action: "skip-user" };
    case "external":
      return { action: "skip-external" };
    case "pack":
      return { action: "skip-pack", reason: "팩 갱신은 P18" };
    case "unknown":
      return { action: "skip-user", reason: `모르는 주인 '${e.owner}'` };
    case "kit":
      return entryKind(e) === "none" ? { action: "skip-user", reason: "op none(기록만)" } : null;
  }
}

function orphan(ctx: Ctx, p: string, e: LockEntry, cur: Cur): Judged {
  const base = { path: p, op: e.op, owner: e.owner, layer: e.layer ?? null };
  if (cur.kind === "none") {
    if (ctx.prune) return { op: { ...base, action: "delete", reason: "파일이 이미 없다(lock 항목만 뺀다)" }, entry: null };
    return { op: { ...base, action: "orphan", reason: "파일이 이미 없다", modified: false }, entry: e };
  }
  if (cur.kind === "other") return { op: { ...base, action: "orphan", reason: cur.what, modified: true }, entry: e };
  const modified = !(e.sha256 && cur.sha === e.sha256);
  // 옛 킷 스킬(hx-*)은 새 이름(kns-*) 파일이 대신한다 — 고치지 않았으면 --prune 없이도 지운다(세션에 같은 스킬이 두 번 실리지 않게, HK-22b)
  if ((ctx.prune || renamedKitPath(p)) && !modified) return { op: { ...base, action: "delete", removeFile: true, ...(ctx.prune ? {} : { reason: "옛 이름(hx-) 킷 스킬 — kns- 가 대신한다" }) }, entry: null };
  return { op: { ...base, action: "orphan", modified }, entry: e };
}

function untracked(p: string, w: Want, cur: Cur): Judged {
  if (cur.kind === "none") return { op: withD(p, w, "new"), entry: kitEntry(p, w) };
  if (cur.kind === "file" && cur.sha === w.sha256) return { op: withD(p, w, "same"), entry: kitEntry(p, w) };
  return { op: { path: p, op: "copy", owner: "user", layer: w.layer, action: "skip-user", reason: "사람이 둔 파일이다" }, entry: userEntry(p, w.layer) };
}

/** <경로>.new · .bak 자리. 없거나 일반 파일이면 쓸 수 있다. */
function sideState(ctx: Ctx, rel: string): "none" | "file" | "other" {
  return existing(full(ctx.target, rel)).kind;
}

/**
 * 생성 구간만 다른가(HK-22b): SDD 보드(specs-index.md)는 이슈를 만들 때마다 scripts/board.sh 가 다시 쓴다.
 * 그 구간을 뺀 글이 새 판과 같으면 사람이 고친 파일로 보지 않는다(update 마다 .new 충돌이 나지 않게). 보드는 update 끝에 다시 만든다.
 */
function generatedOnly(ctx: Ctx, p: string, w: Want): boolean {
  if (!p.endsWith(".md")) return false;
  let cur: string;
  try {
    cur = fs.readFileSync(full(ctx.target, p), "utf8");
  } catch {
    return false;
  }
  return sameOutsideGenerated(cur, w.content.toString("utf8"));
}

function modifiedFile(ctx: Ctx, p: string, e: LockEntry, w: Want): Judged {
  const keepB: LockEntry = { path: p, op: "copy", owner: "kit", sha256: e.sha256 ?? null, layer: w.layer };
  if (ctx.acceptAll) {
    const bak = `${p}.bak`;
    if (sideState(ctx, bak) !== "other") return { op: withD(p, w, "replace", { backup: bak }), entry: kitEntry(p, w) };
    return { op: withD(p, w, "conflict", { reason: `${bak} 자리에 파일이 아닌 것이 있다` }), entry: keepB };
  }
  const neu = `${p}.new`;
  const side = sideState(ctx, neu);
  if (side === "other") return { op: withD(p, w, "conflict", { reason: `${neu} 자리에 파일이 아닌 것이 있다` }), entry: keepB };
  return { op: withD(p, w, "conflict", { newFile: neu, ...(side === "file" ? { newRefreshed: true } : {}) }), entry: keepB };
}

function judge(ctx: Ctx, forget: Set<string>, p: string, e: LockEntry | undefined, w: Want | undefined): Judged {
  if (forget.has(p)) {
    return { op: { path: p, op: "none", owner: "user", layer: w?.layer ?? e?.layer ?? null, action: "forget" }, entry: { path: p, op: "none", owner: "user" } };
  }
  const skip = e ? skipByOwner(e) : null;
  if (e && skip) return { op: { path: p, op: e.op, owner: e.owner, layer: e.layer ?? w?.layer ?? null, ...skip }, entry: e };
  const cur = current(ctx, p);
  if (!w) return orphan(ctx, p, e as LockEntry, cur);
  if (cur.kind === "other") {
    return { op: { path: p, op: "copy", owner: e?.owner ?? "user", layer: w.layer, action: "skip-user", reason: cur.what }, entry: e ?? userEntry(p, w.layer) };
  }
  if (!e) return untracked(p, w, cur);
  if (cur.kind === "none") return { op: withD(p, w, "restore"), entry: kitEntry(p, w) };
  if (cur.sha === w.sha256) return { op: withD(p, w, "same"), entry: kitEntry(p, w) };
  if (e.sha256 && cur.sha === e.sha256) return { op: withD(p, w, "update"), entry: kitEntry(p, w) };
  if (generatedOnly(ctx, p, w)) return { op: withD(p, w, "same", { reason: "생성 구간(보드)만 다르다 — 그대로 둔다" }), entry: kitEntry(p, w) };
  return modifiedFile(ctx, p, e, w);
}

/** 새 킷이 원하는 설치 경로 → D(치환 후 내용 · 해시 · 레이어 · 실행 비트). repair 도 쓴다. */
export function wanted(input: Pick<UpdateInput, "layout" | "templatesDir" | "selection" | "tokens">): {
  want: Map<string, Want>;
  overlaps: Overlap[];
  excludedByHarness: number;
} {
  const { layout, templatesDir, selection, tokens } = input;
  const res = resolveCandidates(layout, templatesDir, selection, tokens);
  const want = new Map<string, Want>();
  for (const c of res.winners) {
    assertSafeRelPath(c.dest);
    const content = substitute(readTemplate(templatesDir, c.src), tokens, layout.tokens);
    want.set(c.dest, { layer: c.layer, content, sha256: sha256(content), executable: isExecutable(layout, c.dest) });
  }
  return { want, overlaps: res.overlaps, excludedByHarness: res.excludedByHarness };
}

/** --forget 값: 안전한 경로이고 lock 이나 새 킷에 있어야 한다(exit 2). */
function forgetSet(raw: string[], locked: Map<string, LockEntry>, want: Map<string, Want>): Set<string> {
  const out = new Set<string>();
  for (const r of raw) {
    const p = r.replace(/^\.\/+/, "");
    if (!isSafeRelPath(p)) throw usageError(`--forget 경로가 리포 안 상대 경로가 아니다: '${r}'`);
    if (!locked.has(p) && !want.has(p)) throw usageError(`--forget: lock 에도 킷에도 없는 경로다: '${r}'`, "knots-sync list --files 로 경로를 본다");
    out.add(p);
  }
  return out;
}

export function buildUpdatePlan(input: UpdateInput): UpdatePlan {
  const { want, overlaps, excludedByHarness } = wanted(input);
  // mirror · render · merge 는 배치 엔진(projection/engine judgeUpdate)이 판정한다.
  const locked = new Map(input.lock.entries.filter((e) => !PROJECTION_OPS.has(e.op)).map((e) => [e.path, e]));
  const forget = forgetSet(input.forget, locked, want);
  const ctx: Ctx = { target: input.target, ancestors: new AncestorCheck(input.target, fs.realpathSync(input.target)), acceptAll: input.acceptAll, prune: input.prune };
  const counts = Object.fromEntries(UPDATE_ACTIONS.map((a) => [a, 0])) as Record<UpdateAction, number>;
  const ops: UpdateOp[] = [];
  const entries: LockEntry[] = [];
  for (const p of [...new Set([...want.keys(), ...locked.keys()])].sort(byteCompare)) {
    const j = judge(ctx, forget, p, locked.get(p), want.get(p));
    ops.push(j.op);
    counts[j.op.action] += 1;
    if (j.entry) entries.push(j.entry);
  }
  return { ops, entries, counts, overlaps, excludedByHarness, wantPaths: new Set(want.keys()) };
}
