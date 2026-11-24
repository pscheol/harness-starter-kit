/**
 * 리포 해석(설계 06 §3.1 1단계 · §3.6): 메인 폴더 · worktree · 브랜치 · 이슈 체크아웃 찾기(DB-R9).
 * git 은 읽기 명령만 부른다. 커밋 · push · 브랜치 전환 · worktree 생성을 하지 않는다(DB-R10).
 */
import fs from "node:fs";
import path from "node:path";
import { fileStamp, treeStamp } from "./cache";
import { ApiError, forbiddenPath } from "./errors";
import type { Project } from "./project";
import { type Env, git, gitOut } from "./util";

export const ISSUE_BRANCH = /^(feat|fix|chore|docs|refactor|exp)\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-(.+)$/;
export const KEY = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5}$/;
export const FOLDER = /^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-(.+)$/;

export interface Location {
  /** 메인 폴더의 하네스 루트(실제 경로) */
  root: string;
  /** 메인 폴더 git 최상위 */
  top: string;
  /** git 최상위에서 하네스 루트까지(없으면 "") */
  prefix: string;
  /** git 공통 폴더(.git) */
  common: string;
}

export class LocateError extends Error {}

/** cwd 에서 위로 `.agents/knots-sync.json` 을 찾고 메인 폴더 기준으로 옮긴다(README §10, 06 §3.1). */
export async function locate(cwd: string, env: Env): Promise<Location> {
  let start: string;
  try {
    start = fs.realpathSync(cwd);
  } catch {
    throw new LocateError(`폴더가 없습니다: ${cwd}`);
  }
  let harness: string | null = null;
  for (let cur = start; ; cur = path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, ".agents/knots-sync.json"))) {
      harness = cur;
      break;
    }
    if (path.dirname(cur) === cur) break;
  }
  if (!harness) throw new LocateError(`하네스 루트(.agents/knots-sync.json)를 찾지 못했습니다: ${start}`);
  const top = await gitOut(harness, env, "rev-parse", "--show-toplevel");
  const common = await gitOut(harness, env, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (!top || !common) throw new LocateError(`git 저장소가 아닙니다: ${harness}`);
  const realTop = fs.realpathSync(top);
  const prefix = path.relative(realTop, harness).split(path.sep).join("/");
  const realCommon = fs.realpathSync(common);
  const mainTop = path.basename(realCommon) === ".git" ? path.dirname(realCommon) : realTop;
  const root = prefix ? path.join(mainTop, prefix) : mainTop;
  return { root: fs.existsSync(root) ? fs.realpathSync(root) : root, top: mainTop, prefix, common: realCommon };
}

export interface Checkout {
  /** git 최상위(실제 경로) */
  path: string;
  /** 하네스 루트(path + prefix) */
  root: string;
  branch: string | null;
  head: string | null;
  main: boolean;
  /** 이슈 브랜치면 키 */
  key: string | null;
}

export function gitStamp(common: string): string {
  return [
    fileStamp(path.join(common, "HEAD")),
    fileStamp(path.join(common, "packed-refs")),
    treeStamp(path.join(common, "worktrees"), 1, (n) => n === "HEAD" || !n.includes(".")),
    treeStamp(path.join(common, "refs/heads"), 6),
  ].join("\n");
}

function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

export async function checkouts(p: Project): Promise<Checkout[]> {
  return p.cache.get("checkouts", gitStamp(p.loc.common), async () => {
    const out = await gitOut(p.loc.top, p.env, "worktree", "list", "--porcelain");
    const list: Checkout[] = [];
    let cur: Partial<Checkout> & { bare?: boolean } = {};
    const flush = (): void => {
      if (cur.path && !cur.bare) {
        const top = real(cur.path);
        const branch = cur.branch ?? null;
        const m = branch ? ISSUE_BRANCH.exec(branch) : null;
        list.push({ path: top, root: p.loc.prefix ? path.join(top, p.loc.prefix) : top, branch, head: cur.head ?? null, main: list.length === 0, key: m ? (m[2] as string) : null });
      }
      cur = {};
    };
    for (const line of (out ?? "").split("\n")) {
      if (line.startsWith("worktree ")) {
        flush();
        cur.path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) cur.head = line.slice(5);
      else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
      else if (line === "bare") cur.bare = true;
    }
    flush();
    if (list.length === 0) list.push({ path: p.loc.top, root: p.loc.root, branch: null, head: null, main: true, key: null });
    return list;
  });
}

export async function branches(p: Project): Promise<string[]> {
  return p.cache.get("branches", gitStamp(p.loc.common), async () => {
    const out = await gitOut(p.loc.top, p.env, "for-each-ref", "refs/heads", "--format=%(refname:short)");
    return (out ?? "").split("\n").filter(Boolean).sort();
  });
}

/** 상대 경로의 마디마다 lstat. 심볼릭 링크가 있으면 forbidden_path, 없는 마디가 있으면 "missing". */
export function lstatChain(root: string, rel: string): "file" | "dir" | "missing" | "other" {
  let cur = root;
  const parts = rel.split("/");
  for (let i = 0; i < parts.length; i += 1) {
    cur = path.join(cur, parts[i] as string);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(cur);
    } catch {
      return "missing";
    }
    if (st.isSymbolicLink()) throw forbiddenPath(rel);
    if (i === parts.length - 1) return st.isFile() ? "file" : st.isDirectory() ? "dir" : "other";
    if (!st.isDirectory()) return "other";
  }
  return "missing";
}

/**
 * 이슈 문서를 쓸 체크아웃(06 §3.6 의사 코드, DB-R9). key 의 이슈 브랜치가 둘 이상이면 409 ambiguous_branch,
 * 하나인데 체크아웃이 없으면 409 branch_not_checked_out(병합 뒤 done 승인 opts.merged 이고 메인 폴더가 base 면 메인 폴더), 브랜치가 없으면 메인 폴더가 base 이고 문서가 있을 때 메인 폴더.
 */
export async function resolveIssueCheckout(p: Project, key: string, docRel: string | null, prefixes = /^[a-z]+$/, opts: { merged?: boolean } = {}): Promise<Checkout> {
  const all = await branches(p);
  const mine = all.filter((b) => {
    const i = b.indexOf("/");
    return i > 0 && prefixes.test(b.slice(0, i)) && b.slice(i + 1).startsWith(`${key}-`);
  });
  const cos = await checkouts(p);
  if (mine.length > 1) throw new ApiError(409, "ambiguous_branch", `${key} 의 브랜치가 둘 이상입니다: ${mine.join(", ")}`, { branches: mine });
  if (mine.length === 1) {
    const co = cos.find((c) => c.branch === mine[0]);
    if (co) return co;
    // 병합 뒤 done 승인(opts.merged — 게이트 앞 조건이 base 의 mr 승인을 이미 봤다)은 base 인 메인 폴더에 쓴다. 지우지 않은 로컬 이슈 브랜치 때문에 막지 않는다(HK-22b)
    const main = cos[0] as Checkout;
    if (opts.merged && main.branch === p.base()) return main;
    throw new ApiError(409, "branch_not_checked_out", `${mine[0]} 가 어느 폴더에도 체크아웃돼 있지 않습니다. wt new ${key} 뒤 다시 저장합니다`, { branch: mine[0] });
  }
  const main = cos[0] as Checkout;
  const base = p.base();
  if (main.branch === base && (docRel === null || lstatChain(main.root, docRel) === "file")) return main;
  throw new ApiError(409, "branch_not_checked_out", `${key} 의 이슈 브랜치가 없고 메인 폴더가 ${base} 가 아니거나 문서가 없습니다. wt new ${key} 뒤 다시 저장합니다`, { base, mainBranch: main.branch });
}

/** Intent 문서: `docs/<INT>-…` 브랜치가 있으면 이슈와 같은 규칙, 없으면 메인 폴더. */
export async function resolveIntentCheckout(p: Project, key: string): Promise<Checkout> {
  const all = await branches(p);
  if (all.some((b) => b.startsWith(`docs/${key}-`))) return resolveIssueCheckout(p, key, null, /^docs$/);
  return (await checkouts(p))[0] as Checkout;
}

export async function gitUser(root: string, env: Env): Promise<{ email: string | null; name: string | null }> {
  const email = await gitOut(root, env, "config", "--get", "user.email");
  const name = await gitOut(root, env, "config", "--get", "user.name");
  return { email: email || null, name: name || null };
}

export async function gitStatus(root: string, env: Env): Promise<{ dirty: boolean; unpushed: number | null }> {
  const s = await git(root, env, "status", "--porcelain", "--untracked-files=normal");
  const u = await gitOut(root, env, "rev-list", "--count", "HEAD", "--not", "--remotes");
  return { dirty: s.code === 0 ? s.stdout.trim().length > 0 : false, unpushed: u === null ? null : Number(u) };
}
