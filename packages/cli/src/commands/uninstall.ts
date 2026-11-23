/** uninstall — 킷 소유이면서 고치지 않은 파일만 지운다(HK-11 design §5, 설계 02 §3.13). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { bool } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { createPrompter } from "../cli/prompt";
import { CliError, EXIT, fsError, usageError } from "../core/errors";
import { sha256 } from "../core/hash";
import { entryKind, loadInstalled, ownerKind, type Installed } from "../core/installed";
import { LOCK_REL, type LockEntry } from "../core/lock";
import { META_REL } from "../core/meta";
import { AncestorCheck, BLOCKED, existing, MANIFEST_PATH, manifestContent } from "../core/plan";
import { removeEmptyDirs, removeFile } from "../core/remove";

type Action = "delete" | "keep-modified" | "absent" | "keep-user" | "keep-external" | "keep-pack";
const ACTIONS: Action[] = ["delete", "keep-modified", "absent", "keep-user", "keep-external", "keep-pack"];
/** 개수로만 내는 판정(목록에 넣지 않는다) */
const COUNT_ONLY = new Set<Action>(["absent", "keep-user", "keep-external", "keep-pack"]);
const HOOKS_PATH = "scripts/git-hooks";

interface UOp {
  path: string;
  owner: string;
  action: Action;
  reason?: string;
}

interface Planner {
  target: string;
  ancestors: AncestorCheck;
  keepPacks: boolean;
  ops: UOp[];
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

/** lock 항목 하나(design §5.1 표의 위 세 줄 + .new). */
function planEntry(p: Planner, e: LockEntry): void {
  const keep = keepAction(e, p.keepPacks);
  if (keep) {
    p.ops.push({ path: e.path, owner: e.owner, action: keep });
    return;
  }
  const cur = current(p, e.path);
  if (cur.kind === "none") p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
  else if (cur.kind === "file" && e.sha256 && cur.sha === e.sha256) p.ops.push({ path: e.path, owner: e.owner, action: "delete" });
  else {
    const reason = cur.kind === "other" ? cur.what : e.sha256 ? "사람이 고친 파일이다" : "lock 에 기준 해시가 없다(고친 파일로 본다)";
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

function buildUninstall(target: string, inst: Installed, keepPacks: boolean, keepState: boolean): UOp[] {
  const p: Planner = { target, ancestors: new AncestorCheck(target, fs.realpathSync(target)), keepPacks, ops: [] };
  for (const e of inst.lock.entries) planEntry(p, e);
  planManifest(p, inst);
  if (!keepState) for (const rel of [LOCK_REL, META_REL]) p.ops.push({ path: rel, owner: "kit", action: "delete", reason: "상태 파일" });
  return p.ops;
}

type GitHooks = { status: "unset" | "kept" | "none" | "no-git" | "failed"; value?: string };

function gitEnv(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const out: Record<string, string | undefined> = { ...env, PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG"]) delete out[k];
  return out as NodeJS.ProcessEnv;
}

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
    for (const o of ops) {
      if (o.action !== "delete" || state.has(o.path)) continue;
      current = o.path;
      removeFile(target, o.path);
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

export async function runUninstall(ctx: Ctx): Promise<CommandResult> {
  const { io } = ctx;
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "uninstall");
  const dryRun = bool(ctx.values, "dry-run");
  const keepState = bool(ctx.values, "keep-state");
  const ops = buildUninstall(target, inst, bool(ctx.values, "keep-packs"), keepState);
  const interactive = io.isTTY && !ctx.json && io.stdin !== undefined;
  if (!dryRun && !bool(ctx.values, "yes")) {
    if (!interactive) throw usageError("uninstall 은 지울 목록을 확인받고 지운다. TTY 가 아니거나 --json 이면 --yes 를 준다", "목록은 harness-kit uninstall --dry-run 으로 먼저 본다");
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
    `harness-kit uninstall — ${target}`,
    ...listed.map(opLine),
    `  지움 ${c.delete} · 남김(사람이 고침) ${c["keep-modified"]} · 이미 없음 ${c.absent} · 사람 · 외부 · 팩 파일 ${c["keep-user"] + c["keep-external"] + c["keep-pack"]}`,
    `  git hook 연결(core.hooksPath): ${gitHooks.status}${gitHooks.value ? ` (${gitHooks.value})` : ""}`,
    ...(keepState ? [`  상태 파일은 둔다: ${META_REL} · ${LOCK_REL}`] : []),
    ...(keep.length ? ["  고친 파일은 남겼다. 필요 없으면 직접 지운다"] : []),
    ...(dryRun ? ["  (dry-run — 지우지 않았다)"] : []),
  ];
  return { code: keep.length ? EXIT.HUMAN : EXIT.OK, data, lines };
}
