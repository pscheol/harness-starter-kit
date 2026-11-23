/** git 부르기(uninstall · outdated). 모델 · 네트워크 서비스를 부르지 않는다 — ls-remote 는 사람이 준 소스에만 간다. */
import { spawnSync } from "node:child_process";
import { compareSemver } from "./version";

/** 상위 리포 설정(GIT_DIR 등)이 대상 리포 판정에 끼지 않게 뺀다. 원격 인증 질문은 하지 않는다. */
export function gitEnv(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const out: Record<string, string | undefined> = { ...env, PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME, GIT_TERMINAL_PROMPT: "0" };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG"]) delete out[k];
  return out as NodeJS.ProcessEnv;
}

export interface GitRun {
  status: number | null;
  stdout: string;
  stderr: string;
  /** git 이 없다 */
  missing: boolean;
  error?: string;
}

export function git(args: string[], env: Record<string, string | undefined>, timeout = 30_000): GitRun {
  const r = spawnSync("git", args, { env: gitEnv(env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout });
  const missing = (r.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
  const run: GitRun = { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", missing };
  if (r.error) run.error = r.error.message;
  return run;
}

/** 폴더가 git 저장소(작업 폴더 · bare)면 ls-remote 에 넘길 경로. 아니면 null. */
export function gitRepoPath(dir: string, env: Record<string, string | undefined>): string | null {
  const inside = git(["-C", dir, "rev-parse", "--git-dir"], env);
  if (inside.status !== 0) return null;
  const top = git(["-C", dir, "rev-parse", "--show-toplevel"], env);
  return top.status === 0 && top.stdout.trim() ? top.stdout.trim() : dir;
}

export type TagsResult = { ok: true; versions: string[] } | { ok: false; reason: string };

/** `git ls-remote --tags --refs <소스>` → semver 태그(앞 v 뗌). 시간 제한 15초. */
export function remoteVersions(source: string, env: Record<string, string | undefined>): TagsResult {
  const r = git(["ls-remote", "--tags", "--refs", source], env, 15_000);
  if (r.missing) return { ok: false, reason: "git 이 없다" };
  if (r.status !== 0) {
    const tail = (r.stderr || r.error || `exit ${String(r.status)}`).trim().split("\n").slice(-1)[0] ?? "";
    return { ok: false, reason: `git ls-remote 실패: ${tail}` };
  }
  const versions: string[] = [];
  for (const line of r.stdout.split("\n")) {
    const ref = line.split("\t")[1] ?? "";
    const m = /^refs\/tags\/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(ref.trim());
    if (m && compareSemver(m[1] as string, m[1] as string) === 0) versions.push(m[1] as string);
  }
  return { ok: true, versions };
}

/** 가장 큰 semver. 비면 null. */
export function maxVersion(versions: string[]): string | null {
  let best: string | null = null;
  for (const v of versions) if (best === null || (compareSemver(v, best) ?? 0) > 0) best = v;
  return best;
}
