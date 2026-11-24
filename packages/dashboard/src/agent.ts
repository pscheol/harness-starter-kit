/**
 * 에이전트 세션 판정(설계 06 §3.11, DB-R22). 템플릿 scripts/harness/agent_session.py 와 같은 표지 · 부모 프로세스 규칙이다.
 * - 환경 표지: CLAUDECODE=1, CLAUDE_CODE_MESSAGING_SOCKET, CODEX_*(CODEX_HOME 제외), KIRO_*(KIRO_HOME 제외), CURSOR_AGENT.
 * - 부모 프로세스: 위로 20단계까지 실행 파일 이름(또는 node 로 띄운 스크립트 이름)이 하네스다.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { Env } from "./util";

const HARNESS = new Set(["claude", "codex", "kiro", "kiro-cli", "cursor-agent"]);
const INTERPRETERS = new Set(["node", "nodejs", "bun", "deno"]);
const PERSONAL = new Set(["CODEX_HOME", "KIRO_HOME"]);
const DEPTH = 20;

export function envMarker(env: Env): string | null {
  if (env.CLAUDECODE === "1") return "CLAUDECODE=1";
  if (env.CLAUDE_CODE_MESSAGING_SOCKET) return "CLAUDE_CODE_MESSAGING_SOCKET";
  for (const key of Object.keys(env).sort()) {
    if (PERSONAL.has(key) || !env[key]) continue;
    if (key.startsWith("CODEX_") || key.startsWith("KIRO_")) return key;
  }
  if (env.CURSOR_AGENT) return "CURSOR_AGENT";
  return null;
}

function row(pid: number): [number, string, string] | null {
  const a = spawnSync("ps", ["-o", "ppid=", "-o", "comm=", "-p", String(pid)], { encoding: "utf8", timeout: 5000 });
  const b = spawnSync("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8", timeout: 5000 });
  const text = (a.stdout ?? "").trim();
  if (a.status !== 0 || !text) return null;
  const m = /^(\d+)\s+(.*)$/.exec(text);
  if (!m) return null;
  return [Number(m[1]), (m[2] as string).trim(), (b.stdout ?? "").trim()];
}

export function harnessName(command: string, args: string): string | null {
  const names = new Set([path.basename(command).replace(/^-+/, "")]);
  const tokens = args.split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const first = path.basename(tokens[0] as string).replace(/^-+/, "");
    names.add(first);
    if (INTERPRETERS.has(first) && tokens.length > 1) names.add(path.basename(tokens[1] as string));
  }
  const found = [...names].filter((n) => HARNESS.has(n)).sort();
  return found[0] ?? null;
}

export function parentMarker(start: number = process.ppid): string | null {
  let current = start;
  for (let i = 0; i < DEPTH; i += 1) {
    if (current <= 1) return null;
    const r = row(current);
    if (!r) return null;
    const name = harnessName(r[1], r[2]);
    if (name) return `부모 프로세스 ${name}`;
    current = r[0];
  }
  return null;
}

/** 에이전트 세션이면 근거 문자열, 아니면 null. */
export function agentSession(env: Env): string | null {
  return envMarker(env) ?? parentMarker();
}
