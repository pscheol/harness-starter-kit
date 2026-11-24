/** uninstall — 킷 소유이면서 고치지 않은 파일만 지운다(HK-11 design §5, 설계 02 §3.13). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { bool, str } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { createPrompter } from "../cli/prompt";
import { CliError, EXIT, fsError, usageError } from "../core/errors";
import { gitEnv } from "../core/git";
import { sha256 } from "../core/hash";
import { entryKind, loadInstalled, ownerKind, selectionFromMeta, tokensFromMeta, type Installed } from "../core/installed";
import { loadLayout } from "../core/layout";
import { AMBIGUOUS_REASON, resolvedLock } from "../core/legacy-lock";
import { LOCK_REL, type LockEntry } from "../core/lock";
import { META_REL } from "../core/meta";
import { AncestorCheck, BLOCKED, existing, MANIFEST_PATH, manifestContent } from "../core/plan";
import { isKitNotice, NOTICE_REL } from "../core/notice";
import { removeEmptyDirs, removeFile } from "../core/remove";
import { locateTemplates } from "../core/templates";
import { wanted } from "../core/update-plan";
import { VERSION } from "../core/version";
import { lstatOrNull, writeFileAtomic } from "../core/fsx";
import { fullMergeWant, PROJECTION_OPS, removeTarget, stateOf } from "../projection/engine";
import { MERGE_KIND, mergeWith, unmergeWith, type MergeKind, type MergeWant } from "../projection/merge";
import { loadSources } from "../projection/sources";
import { loadSpecOrNull, parseSpec, type ProjectionSpec } from "../projection/spec";
import { FsView } from "../projection/view";
import { renameLegacyState } from "../core/legacy-names";
import { sameOutsideGenerated } from "../core/generated";

type Action = "delete" | "keep-modified" | "absent" | "keep-user" | "keep-external" | "keep-pack" | "unmerge";
const ACTIONS: Action[] = ["delete", "keep-modified", "absent", "keep-user", "keep-external", "keep-pack", "unmerge"];
/** 개수로만 내는 판정(목록에 넣지 않는다) */
const COUNT_ONLY = new Set<Action>(["absent", "keep-user", "keep-external", "keep-pack"]);
const HOOKS_PATH = "scripts/git-hooks";

interface UOp {
  path: string;
  owner: string;
  action: Action;
  reason?: string;
  /** 폴더 mirror 를 통째로 지운다 */
  dir?: boolean;
  /** merge: 킷 키를 뺀 내용(지우지 않을 때) */
  text?: string;
}

interface Planner {
  target: string;
  ancestors: AncestorCheck;
  keepPacks: boolean;
  ops: UOp[];
  /** 표시 줄 없는 v1 lock 에서 기준 해시를 null 로 푼 경로(HK-12 R12.6) */
  ambiguous: Set<string>;
  /** 배치 상수(merge 빼기에 쓴다). 없으면 merge 파일을 남긴다 */
  spec: ProjectionSpec | null;
  tokens: Record<string, string>;
  /** 킷 판 글(생성 구간 비교용, 처음 부를 때 템플릿에서 만든다). 템플릿을 못 찾으면 null */
  kitText: (rel: string) => string | null;
}

/** merge 항목: 킷 키만 뺀다. 킷이 만든 파일이 비면 지운다. 키가 없는 v1 항목은 지금 원하는 킷 키 전부로 뺀다. */
function planMergeEntry(p: Planner, e: LockEntry): void {
  const kind = MERGE_KIND[e.path];
  const cur = existing(full(p.target, e.path));
  if (cur.kind === "none") {
    p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
    return;
  }
  if (!kind || !p.spec || cur.kind !== "file") {
    p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason: "병합 파일을 해석하지 못했다" });
    return;
  }
  const text = cur.bytes.toString("utf8");
  const want = fullMergeWant(kind, p.spec, p.tokens, loadSources(new FsView(p.target)));
  const r = unmergeWith(kind, text, mergeKeysOf(e, kind, want), want);
  if (!r.ok) p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason: r.reason });
  else if (r.empty && e.createdByKit === true) p.ops.push({ path: e.path, owner: e.owner, action: "delete", reason: "킷 키만 있던 병합 파일" });
  else p.ops.push({ path: e.path, owner: e.owner, action: "unmerge", reason: "킷 키만 뺐다", ...(r.text === text ? {} : { text: r.text }) });
}

function mergeKeysOf(e: LockEntry, kind: MergeKind, want: MergeWant): string[] {
  if (Array.isArray(e.keys)) return e.keys as string[];
  const fresh = mergeWith(kind, null, want);
  return fresh.ok ? fresh.keys : [];
}

/** 배치 항목(design §6.5): mirror · render 는 copy 와 같은 규칙, merge 는 킷 키만 뺀다. */
function planProjectionEntry(p: Planner, e: LockEntry): void {
  if (e.op === "merge") {
    planMergeEntry(p, e);
    return;
  }
  const st = lstatOrNull(full(p.target, e.path));
  const dir = Boolean(st?.isDirectory() && !st.isSymbolicLink());
  const cur = stateOf(p.target, e.path, dir);
  if (cur.kind === "none") p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
  else if (cur.kind === "file" && typeof e.sha256 === "string" && cur.sha === e.sha256) p.ops.push({ path: e.path, owner: e.owner, action: "delete", dir });
  else p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason: cur.kind === "link" ? "링크다" : "생성 파일을 사람이 고쳤다" });
  if (!dir && cur.kind !== "other" && current(p, `${e.path}.new`).kind === "file") p.ops.push({ path: `${e.path}.new`, owner: e.owner, action: "delete", reason: "update 가 둔 .new" });
}

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

type Cur = { kind: "none" } | { kind: "file"; sha: string; bytes: Buffer } | { kind: "other"; what: string };

function current(p: Planner, rel: string): Cur {
  if (p.ancestors.state(rel) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(full(p.target, rel));
  return cur.kind === "file" ? { kind: "file", sha: sha256(cur.bytes), bytes: cur.bytes } : cur;
}

function keepAction(e: LockEntry, keepPacks: boolean): Action | null {
  const owner = ownerKind(e.owner);
  if (owner === "external") return "keep-external";
  if (owner === "user" || owner === "unknown" || entryKind(e) === "none") return "keep-user";
  if (owner === "pack" && keepPacks) return "keep-pack";
  return null;
}

/** 생성 구간(SDD 보드)만 킷 판과 다른가(HK-22b) — 이슈를 만들면 board.sh 가 그 구간을 다시 쓴다. */
function generatedOnly(p: Planner, rel: string): boolean {
  if (!rel.endsWith(".md")) return false;
  const kit = p.kitText(rel);
  if (kit === null) return false;
  try {
    return sameOutsideGenerated(fs.readFileSync(path.join(p.target, ...rel.split("/")), "utf8"), kit);
  } catch {
    return false;
  }
}

/** lock 항목 하나(design §5.1 표의 위 세 줄 + .new). */
function planEntry(p: Planner, e: LockEntry): void {
  const keep = keepAction(e, p.keepPacks);
  if (keep) {
    p.ops.push({ path: e.path, owner: e.owner, action: keep });
    return;
  }
  if (PROJECTION_OPS.has(e.op)) {
    planProjectionEntry(p, e);
    return;
  }
  const cur = current(p, e.path);
  if (cur.kind === "none") p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
  else if (cur.kind === "file" && e.sha256 && cur.sha === e.sha256) p.ops.push({ path: e.path, owner: e.owner, action: "delete" });
  else if (cur.kind === "file" && e.sha256 && generatedOnly(p, e.path)) p.ops.push({ path: e.path, owner: e.owner, action: "delete", reason: "생성 구간(보드)만 다르다" });
  else {
    const reason = cur.kind === "other" ? cur.what : e.sha256 ? "사람이 고친 파일이다" : p.ambiguous.has(e.path) ? AMBIGUOUS_REASON : "lock 에 기준 해시가 없다(고친 파일로 본다)";
    p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason });
  }
  if (cur.kind !== "other" && current(p, `${e.path}.new`).kind === "file") {
    p.ops.push({ path: `${e.path}.new`, owner: e.owner, action: "delete", reason: "update 가 둔 .new" });
  }
}

function planManifest(p: Planner, inst: Installed): void {
  const cur = current(p, MANIFEST_PATH);
  if (cur.kind === "none") return;
  const want = manifestContent({ stack: inst.meta.stack, agents: inst.meta.agents }, inst.meta.tokens);
  if (cur.kind === "file" && cur.bytes.equals(want)) p.ops.push({ path: MANIFEST_PATH, owner: "kit", action: "delete", reason: "생성물" });
  else p.ops.push({ path: MANIFEST_PATH, owner: "kit", action: "keep-modified", reason: "킷 판과 다르다" });
}

/** merge 빼기에 쓸 배치 상수: 설치된 판(scripts/harness/projection.json), 없으면 킷 템플릿 판. */
function uninstallSpec(ctx: Ctx, target: string): ProjectionSpec | null {
  const installed = path.join(target, "scripts/harness/projection.json");
  try {
    if (fs.existsSync(installed)) return parseSpec(fs.readFileSync(installed, "utf8"));
    const { io } = ctx;
    return loadSpecOrNull(locateTemplates({ flag: str(ctx.values, "templates"), env: io.env, cliFile: io.cliFile, cwd: io.cwd, version: VERSION }).dir);
  } catch (err) {
    if (err instanceof CliError) return null;
    throw err;
  }
}

/** update 가 쓴 업그레이드 공지(lock 밖, HK-24 design §7). 사람이 만든 공지는 둔다. */
function planNotice(p: Planner): void {
  const file = path.join(p.target, ...NOTICE_REL.split("/"));
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  if (isKitNotice(text)) p.ops.push({ path: NOTICE_REL, owner: "kit", action: "delete", reason: "업그레이드 공지" });
}

function buildUninstall(ctx: Ctx, target: string, inst: Installed, keepPacks: boolean, keepState: boolean, ambiguous: Set<string>): UOp[] {
  const spec = inst.lock.entries.some((e) => e.op === "merge") ? uninstallSpec(ctx, target) : null;
  let texts: Map<string, Buffer> | null | undefined;
  const kitText = (rel: string): string | null => {
    if (texts === undefined) texts = kitContents(ctx, inst, target);
    return texts?.get(rel)?.toString("utf8") ?? null;
  };
  const p: Planner = { target, ancestors: new AncestorCheck(target, fs.realpathSync(target)), keepPacks, ops: [], ambiguous, spec, tokens: inst.meta.tokens, kitText };
  for (const e of inst.lock.entries) planEntry(p, e);
  planManifest(p, inst);
  planNotice(p);
  if (!keepState) for (const rel of [LOCK_REL, META_REL]) p.ops.push({ path: rel, owner: "kit", action: "delete", reason: "상태 파일" });
  return p.ops;
}

type GitHooks = { status: "unset" | "kept" | "none" | "no-git" | "failed"; value?: string };

/** 리포 폴더가 git 최상위이고 로컬 core.hooksPath 가 scripts/git-hooks 면 지운다(design §5.2 4단계 · D9). */
export function unhookGit(target: string, env: Record<string, string | undefined>, dryRun: boolean): GitHooks {
  const git = (...args: string[]) => spawnSync("git", ["-C", target, ...args], { env: gitEnv(env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
  const top = git("rev-parse", "--show-toplevel");
  if (top.error) return { status: (top.error as NodeJS.ErrnoException).code === "ENOENT" ? "no-git" : "failed" };
  if (top.status !== 0) return { status: "none" };
  let topReal: string;
  try {
    topReal = fs.realpathSync(top.stdout.trim());
  } catch {
    return { status: "none" };
  }
  if (topReal !== fs.realpathSync(target)) return { status: "none" };
  const get = git("config", "--local", "--get", "core.hooksPath");
  if (get.status !== 0) return { status: "none" };
  const value = get.stdout.trim();
  if (value !== HOOKS_PATH) return { status: "kept", value };
  if (!dryRun && git("config", "--local", "--unset", "core.hooksPath").status !== 0) return { status: "failed", value };
  return { status: "unset", value };
}

/** 파일 → (git hook 연결 해제) → lock → 메타 → 빈 폴더. */
function applyUninstall(target: string, inst: Installed, ops: UOp[], unhook: () => void): void {
  const state = new Set([LOCK_REL, META_REL]);
  let current = "";
  try {
    renameLegacyState(target);
    for (const o of ops) {
      current = o.path;
      if (o.action === "unmerge" && o.text !== undefined) writeFileAtomic(path.join(target, ...o.path.split("/")), Buffer.from(o.text, "utf8"), false);
      if (o.action !== "delete" || state.has(o.path)) continue;
      if (o.dir) removeTarget(target, o.path, true);
      else removeFile(target, o.path);
    }
    current = "git hook 연결";
    unhook();
    // 메타가 "설치됨" 표시라 마지막에 지운다. 중간에 멈추면 다시 돌려 같은 결과를 얻는다.
    for (const rel of [LOCK_REL, META_REL]) {
      if (!ops.some((o) => o.path === rel && o.action === "delete")) continue;
      current = rel;
      removeFile(target, rel);
    }
    current = "빈 폴더";
    removeEmptyDirs(target, [...inst.lock.entries.map((e) => e.path), MANIFEST_PATH, LOCK_REL, META_REL]);
  } catch (err) {
    throw fsError(err, `지우기 실패 ${current}`);
  }
}

function counts(ops: UOp[]): Record<Action, number> {
  const c = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<Action, number>;
  for (const o of ops) c[o.action] += 1;
  return c;
}

const opLine = (o: UOp): string => `  ${o.action.padEnd(13)} ${o.path}${o.reason ? `  ${o.reason}` : ""}`;

async function confirm(ctx: Ctx, ops: UOp[]): Promise<void> {
  const { io } = ctx;
  const p = createPrompter(io.stdin as NodeJS.ReadableStream, io.stderr);
  try {
    const del = ops.filter((o) => o.action === "delete");
    const keep = ops.filter((o) => o.action === "keep-modified");
    io.stderr(`지울 파일 ${del.length}개${ctx.quiet ? "" : ":"}\n`);
    if (!ctx.quiet) for (const o of del) io.stderr(`${opLine(o)}\n`);
    if (keep.length) io.stderr(`남길 파일(사람이 고침) ${keep.length}개:\n${keep.map((o) => `${opLine(o)}\n`).join("")}`);
    if (!(await p.confirm("지울까?"))) throw new CliError(EXIT.ABORT, "중단했다(아무것도 지우지 않았다)");
  } finally {
    p.close();
  }
}

/**
 * 메타 선택값으로 만든 킷 판 해시(표시 줄 없는 v1 lock 에서만 부른다). 템플릿 · 스택을 못 찾으면 null —
 * 그때는 sha(C) = B 인 항목을 모두 사람 파일로 보고 남긴다(지우는 쪽보다 안전하다).
 */
function kitHashes(ctx: Ctx, inst: Installed, target: string): Map<string, string> | null {
  const contents = kitContents(ctx, inst, target);
  return contents ? new Map([...contents].map(([p, d]) => [p, sha256(d)])) : null;
}

/** 메타 선택값으로 만든 킷 판 글. 템플릿 · 스택을 못 찾으면 null. */
function kitContents(ctx: Ctx, inst: Installed, target: string): Map<string, Buffer> | null {
  const { io } = ctx;
  try {
    const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io.env, cliFile: io.cliFile, cwd: io.cwd, version: VERSION });
    const layout = loadLayout(loc.dir);
    const { selection } = selectionFromMeta(layout, loc.dir, inst.meta);
    const tokens = tokensFromMeta(layout, selection, inst.meta, io.env, target);
    return new Map([...wanted({ layout, templatesDir: loc.dir, selection, tokens }).want].map(([p, d]) => [p, d.content]));
  } catch (err) {
    if (err instanceof CliError) return null;
    throw err;
  }
}

export async function runUninstall(ctx: Ctx): Promise<CommandResult> {
  const { io } = ctx;
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "uninstall");
  const dryRun = bool(ctx.values, "dry-run");
  const keepState = bool(ctx.values, "keep-state");
  const { lock, ambiguous } = resolvedLock(inst, target, () => kitHashes(ctx, inst, target));
  const ops = buildUninstall(ctx, target, { ...inst, lock }, bool(ctx.values, "keep-packs"), keepState, ambiguous);
  const interactive = io.isTTY && !ctx.json && io.stdin !== undefined;
  if (!dryRun && !bool(ctx.values, "yes")) {
    if (!interactive) throw usageError("uninstall 은 지울 목록을 확인받고 지운다. TTY 가 아니거나 --json 이면 --yes 를 준다", "목록은 knots-sync uninstall --dry-run 으로 먼저 본다");
    await confirm(ctx, ops);
  }
  let gitHooks: GitHooks = { status: "none" };
  if (dryRun) gitHooks = unhookGit(target, io.env, true);
  else applyUninstall(target, inst, ops, () => {
    gitHooks = unhookGit(target, io.env, false);
  });

  const c = counts(ops);
  const listed = ops.filter((o) => !COUNT_ONLY.has(o.action) && (o.action === "keep-modified" || (dryRun && !ctx.quiet)));
  const keep = ops.filter((o) => o.action === "keep-modified").map((o) => o.path);
  const data: Record<string, unknown> = {
    command: "uninstall",
    target,
    dryRun,
    counts: c,
    ops: listed.map((o) => ({ path: o.path, owner: o.owner, action: o.action, ...(o.reason ? { reason: o.reason } : {}) })),
    keep,
    gitHooks,
    keepState,
  };
  const lines = [
    `knots-sync uninstall — ${target}`,
    ...listed.map(opLine),
    `  지움 ${c.delete} · 남김(사람이 고침) ${c["keep-modified"]} · 이미 없음 ${c.absent} · 사람 · 외부 · 팩 파일 ${c["keep-user"] + c["keep-external"] + c["keep-pack"]}`,
    `  git hook 연결(core.hooksPath): ${gitHooks.status}${gitHooks.value ? ` (${gitHooks.value})` : ""}`,
    ...(keepState ? [`  상태 파일은 둔다: ${META_REL} · ${LOCK_REL}`] : []),
    ...(keep.length ? ["  고친 파일은 남겼다. 필요 없으면 직접 지운다"] : []),
    ...(dryRun ? ["  (dry-run — 지우지 않았다)"] : []),
  ];
  return { code: keep.length ? EXIT.HUMAN : EXIT.OK, data, lines };
}
