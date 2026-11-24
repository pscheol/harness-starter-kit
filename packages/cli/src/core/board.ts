/**
 * update 뒤 SDD 보드 확인 · 재생성(HK-12 R12.9, design §10.1). update.sh 의 rebuild_board 와 같은 조건이다:
 * scripts/board.sh 가 있고 python3 가 있고 보드 코드가 사람 판이 아닐 때 `board.sh --check` 가 실패하면 한 번 다시 만든다.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const BOARD_SCRIPT = "scripts/board.sh";
/** 보드를 만드는 코드. 이 경로가 사람 판(conflict · skip-user)이면 실행하지 않는다. */
export function isBoardCode(rel: string): boolean {
  return rel === BOARD_SCRIPT || rel === "scripts/sdd-layout.py" || rel.startsWith("scripts/harness/");
}

export type BoardResult = { status: "ok" | "rebuilt" } | { status: "skipped" | "failed"; reason: string };

function runEnv(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return (env.PATH === undefined ? { ...env, PATH: process.env.PATH } : env) as NodeJS.ProcessEnv;
}

export function refreshBoard(target: string, env: Record<string, string | undefined>, blockedBy: string | null): BoardResult {
  const script = path.join(target, ...BOARD_SCRIPT.split("/"));
  let st: fs.Stats | null = null;
  try {
    st = fs.lstatSync(script);
  } catch {
    st = null;
  }
  if (!st?.isFile()) return { status: "skipped", reason: `${BOARD_SCRIPT} 없음` };
  if (blockedBy) return { status: "skipped", reason: `보드 코드가 사람 판이다: ${blockedBy}` };
  const e = runEnv(env);
  const py = spawnSync("python3", ["--version"], { env: e, stdio: "ignore", timeout: 30_000 });
  if (py.error) return { status: "skipped", reason: "python3 없음" };
  const opts = { cwd: target, env: e, encoding: "utf8" as const, stdio: ["ignore", "ignore", "pipe"] as ("ignore" | "pipe")[], timeout: 180_000 };
  const check = spawnSync("bash", [BOARD_SCRIPT, "--check"], opts);
  if (!check.error && check.status === 0) return { status: "ok" };
  const build = spawnSync("bash", [BOARD_SCRIPT], opts);
  if (!build.error && build.status === 0) return { status: "rebuilt" };
  const tail = (build.stderr ?? "").trim().split("\n").slice(-2).join(" / ");
  return { status: "failed", reason: tail || (build.error ? build.error.message : `exit ${String(build.status)}`) };
}

export function boardLine(r: BoardResult): string | null {
  if (r.status === "rebuilt") return "  ✎ SDD 보드를 새 형식으로 다시 만들었다: .agents/docs/specs-index.md";
  if (r.status === "failed") return `  ⚠ SDD 보드를 다시 만들지 못했다 — 'bash ${BOARD_SCRIPT}' 의 오류를 고친 뒤 다시 실행한다 (${r.reason})`;
  return null;
}
