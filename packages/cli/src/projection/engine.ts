/**
 * 배치 엔진(HK-13 design §2 · §6 · §7): 원하는 작업 모으기 · 판정(설치 · update · 빼기) · 적용 · lock 항목.
 * Python `scripts/harness/projection.py` 의 Engine 과 같은 판정을 한다(동일성 시험이 묶는다).
 * 어댑터는 원하는 작업만 내고, 쓰기는 여기서 판정한 효과(effect)를 applyProjection 이 한다.
 */
import fs from "node:fs";
import path from "node:path";
import { ADAPTERS } from "../adapters";
import type { FileWant, Finding, MergeOpWant, ProjectionContext, Want } from "../adapters/types";
import { CliError, EXIT } from "../core/errors";
import { byteCompare, writeFileAtomic } from "../core/fsx";
import { sha256 } from "../core/hash";
import type { LockEntry } from "../core/lock";
import { removeEmptyDirs } from "../core/remove";
import { HOOKS_REL, HooksError, kitScriptSuffixes, parseHooks, settingsHooks, type HookDef } from "./hooks";
import { claudeMdWant, codexConfigWant, codexHooksWant, gitattributesWant, MERGE_KIND, mergeWith, settingsWant, unmergeWith, type MergeKind, type MergeWant } from "./merge";
import { resolveModel, skillModelProblem } from "./render";
import { ignoredName, loadSources, treeSha, walkView, type Sources } from "./sources";
import type { ProjectionSpec } from "./spec";
import { FsView, type RepoView } from "./view";

export const PROJECTION_OPS = new Set(["mirror", "render", "merge"]);
export const HARNESS_DIRS = [".claude/", ".codex/", ".cursor/", ".kiro/"];
const ALL_HARNESSES = ["claude", "codex", "cursor", "kiro"];

export function buildContext(args: { view: RepoView; spec: ProjectionSpec; tokens: Record<string, string>; agents: string[] }): ProjectionContext {
  const sources = loadSources(args.view);
  const findings: Finding[] = [];
  const skills = sources.skills.filter((s) => {
    if (!skillModelProblem(s)) return true;
    const kit = s.source.slice(s.source.lastIndexOf("/") + 1).startsWith("hx-");
    findings.push({ kind: "skill-model-field", severity: kit ? "error" : "warn", path: `${s.source}/SKILL.md`, hint: "context: fork 가 아닌 스킬에 model · effort 를 두지 않는다(그 턴의 사람 세션 모델이 바뀐다)" });
    return !kit;
  });
  const roles: ProjectionContext["roles"] = [];
  for (const role of sources.roles) {
    const m = resolveModel(role, sources.policy);
    if (!m.ok) findings.push({ kind: "role-model-locked", severity: "error", path: role.source, hint: m.error });
    else roles.push({ role, fields: m.fields });
  }
  let parsed: HookDef[] | null;
  try {
    parsed = parseHooks(sources.hooksText, args.spec.hookMap);
  } catch (err) {
    if (err instanceof HooksError) throw new CliError(EXIT.STATE, err.message, "`.agents/hooks.json` 을 고치거나 harness-kit repair 로 킷 판을 되살린다");
    throw err;
  }
  if (parsed === null) findings.unshift({ kind: "hooks-missing", severity: "error", path: HOOKS_REL, hint: "훅 원본이 없어 하네스 훅을 만들지 않는다 — harness-kit repair 로 되살린다" });
  return { ...args, sources, skills, roles, rules: sources.rules, hooks: parsed ?? [], hooksPresent: parsed !== null, findings };
}

/** 깐 하네스 어댑터의 작업 + .gitattributes. 같은 배치 경로가 둘이면 exit 3. */
export function wantedOps(ctx: ProjectionContext): Want[] {
  const wants: Want[] = [];
  for (const a of ADAPTERS) if (ctx.agents.includes(a.id)) wants.push(...a.plan(ctx));
  wants.push({ op: "merge", path: ".gitattributes", harness: "core", kind: "gitattributes", want: gitattributesWant(ctx.spec, ctx.agents) });
  const seen = new Set<string>();
  for (const w of wants) {
    if (seen.has(w.path)) throw new CliError(EXIT.STATE, `배치 경로가 겹친다: ${w.path}`, "같은 이름의 규칙 · 스킬 원본 중 하나의 이름을 바꾼다");
    seen.add(w.path);
  }
  for (const w of wants) {
    if (w.op === "mirror" && w.kind === "dir" && wants.some((o) => o.path.startsWith(`${w.path}/`))) throw new CliError(EXIT.STATE, `배치 경로가 겹친다: ${w.path}`);
  }
  return wants;
}

/** 동일성 시험 · plan 출력용 기록(경로 바이트 순). Python projection.py records() 와 같다. */
export function planRecords(ctx: ProjectionContext): Record<string, unknown>[] {
  return [...wantedOps(ctx)]
    .sort((a, b) => byteCompare(a.path, b.path))
    .map((w) => {
      const rec: Record<string, unknown> = { path: w.path, op: w.op, harness: w.harness };
      if (w.op === "merge") {
        const cur = ctx.view.read(w.path);
        const r = mergeWith(w.kind, cur === null ? null : cur.toString("utf8"), w.want);
        rec.kind = w.kind;
        rec.keys = r.ok ? r.keys : [];
        rec.sha256 = r.ok ? sha256(r.text) : null;
      } else {
        rec.from = w.from;
        rec.fromSha256 = w.fromSha256;
        rec.sha256 = w.sha256;
      }
      if (w.op !== "merge" && w.deferred) rec.deferred = true;
      return rec;
    });
}

// ── 지금 상태 ────────────────────────────────────────────────────────────────

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

function lstat(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function blocked(target: string, rel: string): boolean {
  let cur = target;
  for (const part of rel.split("/").slice(0, -1)) {
    cur = path.join(cur, part);
    const st = lstat(cur);
    if (st && (st.isSymbolicLink() || !st.isDirectory())) return true;
  }
  return false;
}

export type Cur =
  | { kind: "none" }
  | { kind: "link" }
  | { kind: "other"; what: string }
  | { kind: "file"; sha: string; data?: Buffer; files?: Map<string, Buffer> };

export function stateOf(target: string, rel: string, isDir: boolean): Cur {
  if (blocked(target, rel)) return { kind: "other", what: "상위 경로가 폴더가 아니다" };
  const st = lstat(full(target, rel));
  if (!st) return { kind: "none" };
  if (st.isSymbolicLink()) return { kind: "link" };
  if (isDir) {
    if (!st.isDirectory()) return { kind: "other", what: "폴더 자리에 파일이 있다" };
    const files = walkView(new FsView(full(target, rel)), "");
    return { kind: "file", sha: treeSha(files), files: new Map(files.map((f) => [f.rel, f.bytes])) };
  }
  if (!st.isFile()) return { kind: "other", what: "같은 이름의 폴더가 있다" };
  const data = fs.readFileSync(full(target, rel));
  return { kind: "file", sha: sha256(data), data };
}

function readTextAt(target: string, rel: string): string | null {
  const st = lstat(full(target, rel));
  return st?.isFile() ? fs.readFileSync(full(target, rel), "utf8") : null;
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

export interface Effect {
  renames?: [string, string][];
  write?: FileWant;
  text?: string;
  extra?: { path: string; data: Buffer }[];
  remove?: { dir: boolean };
}

export interface ProjOp {
  path: string;
  op: string;
  harness: string;
  action: string;
  reason?: string;
  newFiles?: string[];
  backups?: string[];
  effect?: Effect;
}

export const ownerKind = (owner: string): string => (owner === "kit" || owner === "user" ? owner : owner.startsWith("external:") ? "external" : owner.startsWith("pack:") ? "pack" : "unknown");
const shaOf = (e: LockEntry | undefined): string | null => (e && typeof e.sha256 === "string" ? e.sha256 : null);
const keysOf = (e: LockEntry | undefined): string[] | undefined => (e && Array.isArray(e.keys) ? (e.keys as string[]) : undefined);

function kitEntry(w: FileWant, sha: string | null = w.sha256): LockEntry {
  return { path: w.path, op: w.op, owner: "kit", sha256: sha, from: w.from, fromSha256: w.fromSha256 };
}

function mergeEntry(path_: string, keys: string[], created: boolean): LockEntry {
  return created ? { path: path_, op: "merge", owner: "kit", keys, createdByKit: true } : { path: path_, op: "merge", owner: "kit", keys };
}

const userEntry = (p: string, op: string): LockEntry => ({ path: p, op, owner: "user", sha256: null });

/** 원하지 않게 된 병합 파일을 뺄 때 쓰는 '킷 전부' 조각. */
export function fullMergeWant(kind: MergeKind, spec: ProjectionSpec, tokens: Record<string, string>, sources: Sources | null): MergeWant {
  if (kind === "claude-md") return claudeMdWant(spec);
  if (kind === "settings" || kind === "codex-hooks") {
    let hooks: HookDef[] = [];
    try {
      hooks = parseHooks(sources?.hooksText ?? null, spec.hookMap) ?? [];
    } catch {
      hooks = [];
    }
    const modules = hooks.flatMap((h) => (h.module ? [h.module] : []));
    const suffixes = kitScriptSuffixes(hooks, spec.hookMap);
    if (kind === "settings") return settingsWant(spec, tokens, settingsHooks(hooks, "claude", spec.hookMap, modules), suffixes);
    return codexHooksWant(settingsHooks(hooks, "codex", spec.hookMap, modules), suffixes);
  }
  if (kind === "codex-config") return codexConfigWant(spec, (sources?.roles ?? []).map((r) => ({ name: r.source.slice(r.source.lastIndexOf("/") + 1, -".md".length), description: r.description })));
  return gitattributesWant(spec, ALL_HARNESSES);
}

function differing(w: FileWant, cur: Cur): string[] {
  const have = cur.kind === "file" ? (cur.files ?? new Map()) : new Map<string, Buffer>();
  return w.files.filter((f) => !have.get(f.rel)?.equals(f.bytes)).map((f) => f.rel);
}

function extraFiles(w: FileWant, cur: Cur): string[] {
  const wanted = new Set(w.files.map((f) => f.rel));
  return cur.kind === "file" && cur.files ? [...cur.files.keys()].filter((rel) => !wanted.has(rel)) : [];
}

export class Engine {
  readonly ops: ProjOp[] = [];
  readonly entries: LockEntry[] = [];

  constructor(
    private readonly target: string,
    private readonly spec: ProjectionSpec,
    private readonly tokens: Record<string, string>,
    private readonly sources: Sources | null,
  ) {}

  private emit(op: ProjOp, entry: LockEntry | null | undefined): void {
    this.ops.push(op);
    if (entry) this.entries.push(entry);
  }

  merge(w: MergeOpWant, prev: LockEntry | undefined, claimed: LockEntry[]): void {
    let cur = readTextAt(this.target, w.path);
    const exists = lstat(full(this.target, w.path)) !== null;
    if (cur === null && exists) {
      this.emit({ path: w.path, op: "merge", harness: w.harness, action: "conflict", reason: "일반 파일이 아니다" }, prev);
      return;
    }
    const v1 = claimed.find((c) => c.path === w.path);
    let created = prev?.createdByKit === true;
    if (v1 && cur !== null) {
      const unmodified = shaOf(v1) !== null && sha256(cur) === shaOf(v1);
      if (w.kind === "claude-md") {
        const hasBlock = cur.split("\n").some((l) => l.startsWith("<!-- harness-kit:begin claude"));
        if (unmodified) {
          cur = null;
          created = true;
        } else if (!hasBlock) {
          const fresh = mergeWith(w.kind, null, w.want);
          const neu = `${w.path}.new`;
          this.emit({ path: w.path, op: "merge", harness: w.harness, action: "conflict", reason: "v1 CLAUDE.md 를 사람이 고쳤다", newFiles: [neu], effect: { extra: fresh.ok ? [{ path: neu, data: Buffer.from(fresh.text, "utf8") }] : [] } }, v1);
          return;
        }
      } else created = unmodified;
    }
    const r = mergeWith(w.kind, cur, w.want, keysOf(prev));
    if (!r.ok) {
      this.emit({ path: w.path, op: "merge", harness: w.harness, action: "conflict", reason: r.reason }, prev ?? { path: w.path, op: "merge", owner: "kit", keys: [] });
      return;
    }
    created = created || r.created;
    const action = cur === null && !exists ? "create" : cur === r.text ? "same" : "merge";
    this.emit({ path: w.path, op: "merge", harness: w.harness, action, ...(action !== "same" ? { effect: { text: r.text } } : {}) }, mergeEntry(w.path, r.keys, created));
  }

  install(w: Want, prev: LockEntry | undefined, force: boolean): void {
    if (w.op === "merge") {
      this.merge(w, prev, []);
      return;
    }
    if (w.deferred) {
      this.emit({ path: w.path, op: w.op, harness: w.harness, action: "defer", reason: "원본이 .new 대기 중이다" }, prev);
      return;
    }
    const cur = stateOf(this.target, w.path, w.kind === "dir");
    const base = { path: w.path, op: w.op, harness: w.harness };
    if (cur.kind === "none") this.emit({ ...base, action: "create", effect: { write: w } }, kitEntry(w));
    else if (cur.kind !== "file") this.emit({ ...base, action: "skip-user", reason: cur.kind === "other" ? cur.what : "링크다" }, prev ?? userEntry(w.path, w.op));
    else if (cur.sha === w.sha256) this.emit({ ...base, action: "same" }, kitEntry(w));
    else if (prev && ownerKind(prev.owner) === "kit") this.emit({ ...base, action: "keep" }, prev);
    else if (force) this.emit({ ...base, action: "replace", effect: { write: w } }, kitEntry(w));
    else this.emit({ ...base, action: "skip-user", reason: "사람이 둔 파일이다" }, userEntry(w.path, w.op));
  }

  private unmodifiedClaimed(w: FileWant, cur: Cur, claimed: LockEntry[]): boolean {
    if (cur.kind !== "file") return false;
    if (w.kind !== "dir") {
      const c = claimed.find((x) => x.path === w.path);
      return c !== undefined && shaOf(c) !== null && cur.sha === shaOf(c);
    }
    const shas = new Map(claimed.filter((c) => c.path.startsWith(`${w.path}/`)).map((c) => [c.path.slice(w.path.length + 1), shaOf(c)]));
    const files = cur.files ?? new Map<string, Buffer>();
    return shas.size > 0 && [...files].every(([rel, data]) => shas.has(rel) && shas.get(rel) !== null && sha256(data) === shas.get(rel));
  }

  update(w: Want, prev: LockEntry | undefined, claimed: LockEntry[], acceptAll: boolean): void {
    if (w.op === "merge") {
      this.merge(w, prev, claimed);
      return;
    }
    const base = { path: w.path, op: w.op, harness: w.harness };
    if (w.deferred) {
      this.emit({ ...base, action: "defer", reason: "원본이 .new 대기 중이다" }, prev);
      this.entries.push(...claimed);
      return;
    }
    if (prev && ownerKind(prev.owner) !== "kit") {
      const k = ownerKind(prev.owner);
      this.emit({ ...base, action: k === "external" ? "skip-external" : k === "pack" ? "skip-pack" : "skip-user" }, prev);
      return;
    }
    const cur = stateOf(this.target, w.path, w.kind === "dir");
    const tracked = prev !== undefined || claimed.length > 0;
    if (cur.kind === "link") return this.write(w, "replace", "symlink-found");
    if (cur.kind === "other") {
      this.emit({ ...base, action: "skip-user", reason: cur.what }, prev ?? userEntry(w.path, w.op));
      return;
    }
    if (!tracked) {
      if (cur.kind === "none") return this.write(w, "new");
      if (cur.sha === w.sha256) this.emit({ ...base, action: "same" }, kitEntry(w));
      else this.emit({ ...base, action: "skip-user", reason: "사람이 둔 파일이다" }, userEntry(w.path, w.op));
      return;
    }
    if (cur.kind === "none") return this.write(w, "restore");
    if (cur.sha === w.sha256) {
      this.emit({ ...base, action: "same" }, kitEntry(w));
      return;
    }
    const unmodified = prev ? shaOf(prev) !== null && cur.sha === shaOf(prev) : this.unmodifiedClaimed(w, cur, claimed);
    if (unmodified) return this.write(w, "update");
    const baseSha = prev ? shaOf(prev) : w.kind !== "dir" ? shaOf(claimed.find((c) => c.path === w.path)) : null;
    if (acceptAll) {
      const have = cur.files ?? new Map<string, Buffer>();
      const backups = w.kind !== "dir" ? [`${w.path}.bak`] : [...differing(w, cur), ...extraFiles(w, cur)].filter((rel) => have.has(rel)).map((rel) => `${w.path}/${rel}.bak`);
      this.write(w, "replace", undefined, backups);
      return;
    }
    const newFiles = w.kind !== "dir" ? [`${w.path}.new`] : differing(w, cur).map((rel) => `${w.path}/${rel}.new`);
    const data = new Map(w.files.map((f) => [f.rel, f.bytes]));
    const extra = w.kind !== "dir" ? [{ path: `${w.path}.new`, data: w.data }] : newFiles.map((n) => ({ path: n, data: data.get(n.slice(w.path.length + 1, -".new".length)) as Buffer }));
    this.emit({ ...base, action: "conflict", reason: "복사본 · 생성물을 직접 고쳤다 — 원본을 고친다", newFiles, effect: { extra } }, kitEntry(w, baseSha));
  }

  private write(w: FileWant, action: string, reason?: string, backups: string[] = []): void {
    const renames = backups.map((b) => [b.slice(0, -".bak".length), b] as [string, string]);
    this.emit({ path: w.path, op: w.op, harness: w.harness, action, ...(reason ? { reason } : {}), ...(backups.length ? { backups } : {}), effect: { renames, write: w } }, kitEntry(w));
  }

  /** 원하지 않게 된 배치 항목 · retire. merge 는 킷 키를 뺀다(design §6.3 · §6.5). */
  drop(e: LockEntry, why = ""): void {
    if (ownerKind(e.owner) !== "kit") {
      this.entries.push(e);
      return;
    }
    if (e.op === "merge") {
      const kind = MERGE_KIND[e.path];
      const cur = readTextAt(this.target, e.path);
      if (!kind || cur === null) {
        this.ops.push({ path: e.path, op: "merge", harness: "", action: cur === null ? "delete" : "keep-modified", ...(why ? { reason: why } : {}) });
        return;
      }
      const want = fullMergeWant(kind, this.spec, this.tokens, this.sources);
      const keys = keysOf(e) ?? (() => {
        const fresh = mergeWith(kind, null, want);
        return fresh.ok ? fresh.keys : [];
      })();
      const r = unmergeWith(kind, cur, keys, want);
      if (!r.ok) {
        this.emit({ path: e.path, op: "merge", harness: "", action: "conflict", reason: r.reason }, e);
        return;
      }
      if (r.empty && e.createdByKit === true) this.ops.push({ path: e.path, op: "merge", harness: "", action: "delete", effect: { remove: { dir: false } } });
      else this.ops.push({ path: e.path, op: "merge", harness: "", action: "unmerge", ...(r.text !== cur ? { effect: { text: r.text } } : {}) });
      return;
    }
    const st = lstat(full(this.target, e.path));
    const isDir = Boolean(st?.isDirectory() && !st.isSymbolicLink());
    const cur = stateOf(this.target, e.path, isDir);
    const action = e.op === "copy" ? "retire" : "delete";
    if (cur.kind === "none") {
      this.ops.push({ path: e.path, op: e.op, harness: "", action, reason: "파일이 이미 없다" });
      return;
    }
    if (cur.kind === "file" && shaOf(e) !== null && cur.sha === shaOf(e)) {
      this.ops.push({ path: e.path, op: e.op, harness: "", action, ...(why ? { reason: why } : {}), effect: { remove: { dir: isDir } } });
      return;
    }
    const kept: LockEntry = { path: e.path, op: e.op, owner: "user", sha256: null, ...(e.layer ? { layer: e.layer } : {}) };
    this.emit({ path: e.path, op: e.op, harness: "", action: "keep-modified", reason: "사람이 고친 파일이다 — 지우지 않았다" }, kept);
  }
}

export function claims(w: Want, p: string): boolean {
  return p === w.path || (w.op === "mirror" && w.kind === "dir" && p.startsWith(`${w.path}/`));
}

function replacementDeferred(p: string, wants: Map<string, Want>): boolean {
  if (p.startsWith(".claude/commands/") && p.endsWith(".md")) {
    const w = wants.get(`.claude/skills/${p.slice(".claude/commands/".length, -".md".length)}`);
    return Boolean(w && w.op !== "merge" && w.deferred);
  }
  return false;
}

export interface ProjectionPlan {
  ops: ProjOp[];
  entries: LockEntry[];
  /** copy 판정에서 빼야 하는 경로(배치가 가져간 v1 포인터 · retire) */
  claimed: Set<string>;
}

const sortWants = (wants: Want[]): Want[] => [...wants].sort((a, b) => byteCompare(a.path, b.path));

/** 설치 판정(init · add · setup.sh, design §6.2). */
export function judgeInstall(args: { target: string; spec: ProjectionSpec; tokens: Record<string, string>; sources: Sources; wants: Want[]; prev: LockEntry[]; force: boolean }): ProjectionPlan {
  const engine = new Engine(args.target, args.spec, args.tokens, args.sources);
  const byPath = new Map(args.prev.filter((e) => PROJECTION_OPS.has(e.op)).map((e) => [e.path, e]));
  for (const w of sortWants(args.wants)) engine.install(w, byPath.get(w.path), args.force);
  return { ops: engine.ops, entries: engine.entries, claimed: new Set() };
}

/**
 * update 판정(design §6.3). prev = 지금 lock(기준 해시는 v1 모호성 풀기 전 값), copyNow = 이번 킷의 copy 설치 경로.
 * retire 가 거짓이면(remove) 배치하지 않는 하네스 폴더 copy 를 보지 않는다.
 */
export function judgeUpdate(args: { target: string; spec: ProjectionSpec; tokens: Record<string, string>; sources: Sources; wants: Want[]; prev: LockEntry[]; copyNow: Set<string>; acceptAll: boolean; retire: boolean }): ProjectionPlan {
  const engine = new Engine(args.target, args.spec, args.tokens, args.sources);
  const wants = new Map(args.wants.map((w) => [w.path, w]));
  const projection = new Map(args.prev.filter((e) => PROJECTION_OPS.has(e.op)).map((e) => [e.path, e]));
  const orphans = args.prev.filter((e) => e.op === "copy" && ownerKind(e.owner) === "kit" && !args.copyNow.has(e.path));
  const claimedBy = new Map<string, LockEntry[]>();
  const rest: LockEntry[] = [];
  for (const e of orphans) {
    const w = args.wants.find((x) => claims(x, e.path));
    if (w) claimedBy.set(w.path, [...(claimedBy.get(w.path) ?? []), e]);
    else rest.push(e);
  }
  const claimed = new Set<string>([...claimedBy.values()].flat().map((e) => e.path));
  for (const w of sortWants(args.wants)) engine.update(w, projection.get(w.path), claimedBy.get(w.path) ?? [], args.acceptAll);
  for (const p of [...projection.keys()].filter((x) => !wants.has(x)).sort(byteCompare)) engine.drop(projection.get(p) as LockEntry, "원본이 없다");
  if (args.retire) {
    for (const e of rest.sort((a, b) => byteCompare(a.path, b.path))) {
      if (!HARNESS_DIRS.some((d) => e.path.startsWith(d))) continue;
      claimed.add(e.path);
      if (replacementDeferred(e.path, wants)) {
        engine.ops.push({ path: e.path, op: "copy", harness: "", action: "defer", reason: "바꿀 스킬 원본이 .new 대기 중이다" });
        engine.entries.push(e);
        continue;
      }
      engine.drop(e, "v1 포인터 — 복사본 · 생성물로 바뀌었다");
    }
  }
  return { ops: engine.ops, entries: engine.entries, claimed };
}

// ── 적용 ─────────────────────────────────────────────────────────────────────

function removeEmptySubdirs(dir: string): void {
  const st = lstat(dir);
  if (!st?.isDirectory()) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = lstat(p);
    if (s?.isDirectory() && !s.isSymbolicLink()) {
      removeEmptySubdirs(p);
      if (fs.readdirSync(p).length === 0) fs.rmdirSync(p);
    }
  }
}

function sameFile(p: string, data: Buffer, executable: boolean): boolean {
  const st = lstat(p);
  return Boolean(st?.isFile() && ((st.mode & 0o100) !== 0) === executable && fs.readFileSync(p).equals(data));
}

/** mirror · render 하나를 쓴다. 링크는 지우고 실제 파일을 둔다. 폴더 mirror 는 원하지 않는 파일을 지운다. */
export function writeWant(target: string, w: FileWant): void {
  const p = full(target, w.path);
  const st = lstat(p);
  if (st?.isSymbolicLink()) fs.unlinkSync(p);
  if (w.kind !== "dir") {
    writeFileAtomic(p, w.data, w.executable);
    return;
  }
  if (st && !st.isSymbolicLink() && !st.isDirectory()) fs.unlinkSync(p);
  const wanted = new Set(w.files.map((f) => f.rel));
  for (const f of walkView(new FsView(p), "")) if (!wanted.has(f.rel)) fs.unlinkSync(path.join(p, ...f.rel.split("/")));
  for (const f of w.files) {
    const q = path.join(p, ...f.rel.split("/"));
    if (!sameFile(q, f.bytes, f.executable)) writeFileAtomic(q, f.bytes, f.executable);
  }
  removeEmptySubdirs(p);
}

/** 배치 대상을 지운다(폴더 mirror 는 그 안의 파일, .new · .bak 은 둔다). 비게 된 상위 폴더를 지운다. */
export function removeTarget(target: string, rel: string, dir: boolean): void {
  const p = full(target, rel);
  const st = lstat(p);
  if (dir && st?.isDirectory() && !st.isSymbolicLink()) {
    const files = walkView(new FsView(p), "").map((f) => `${rel}/${f.rel}`);
    for (const f of files) fs.unlinkSync(full(target, f));
    removeEmptySubdirs(p);
    removeEmptyDirs(target, [...files, `${rel}/x`]);
    return;
  }
  if (st && (st.isFile() || st.isSymbolicLink())) fs.unlinkSync(p);
  removeEmptyDirs(target, [rel]);
}

export function applyProjection(target: string, ops: ProjOp[]): void {
  for (const o of ops) {
    const e = o.effect;
    if (!e) continue;
    for (const [from, to] of e.renames ?? []) fs.renameSync(full(target, from), full(target, to));
    if (e.write) writeWant(target, e.write);
    if (e.text !== undefined) writeFileAtomic(full(target, o.path), Buffer.from(e.text, "utf8"), false);
    for (const x of e.extra ?? []) writeFileAtomic(full(target, x.path), x.data, false);
    if (e.remove) removeTarget(target, o.path, e.remove.dir);
  }
}

export const isIgnoredName = ignoredName;

/** 출력용: 배치 작업 JSON(내용 바이트 없음). */
export function projOpJson(o: ProjOp): Record<string, unknown> {
  const j: Record<string, unknown> = { path: o.path, op: o.op, action: o.action };
  if (o.harness) j.harness = o.harness;
  if (o.reason) j.reason = o.reason;
  if (o.newFiles?.length) j.new = o.newFiles.length === 1 ? o.newFiles[0] : o.newFiles;
  if (o.backups?.length) j.backups = o.backups;
  return j;
}

export const QUIET_ACTIONS = new Set(["same", "keep"]);
export const ATTENTION_ACTIONS = new Set(["conflict", "keep-modified"]);

export function projCounts(ops: ProjOp[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of ops) out[o.action] = (out[o.action] ?? 0) + 1;
  return out;
}

export function projLine(o: ProjOp): string {
  const extra = [...(o.newFiles ?? []).map((n) => `  → ${n}`), ...(o.backups ?? []).map((b) => `  (수정본 → ${b})`)].join("");
  return `  ${o.action.padEnd(13)} ${o.path}${extra}${o.reason ? `  ${o.reason}` : ""}`;
}

export function projSummary(ops: ProjOp[]): string {
  const c = projCounts(ops);
  const shown = Object.entries(c).filter(([a]) => !QUIET_ACTIONS.has(a)).map(([a, n]) => `${a} ${n}`).join(" · ");
  return `  배치: ${shown || "바꿀 것 없음"}${c.same ? ` (같음 ${c.same})` : ""}`;
}
