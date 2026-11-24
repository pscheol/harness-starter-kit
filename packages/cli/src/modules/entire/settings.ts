/**
 * Entire 설정 읽기(0.13.4 에서 확인, docs/analysis 참고). 읽기만 한다 — 쓰기는 `entire configure` 가 한다.
 *  - `.entire/settings.json`(공유) · `.entire/settings.local.json`(개인): `enabled`, `strategy_options.push_sessions`(false 면 올리지 않는다)
 *  - `.git/entire/checkpoint-push-policy`: `manual` 이면 git push 가 올리지 않는다
 *  - 에이전트 훅은 하네스 설정 파일 안 `entire hooks <에이전트> …` 명령이다
 */
import fs from "node:fs";
import path from "node:path";

function readJson(file: string): Record<string, unknown> | null {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return j !== null && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface EntirePush {
  /** 이 복제본에서 git push 가 체크포인트를 올리는가 */
  uploads: boolean;
  pushSessions: boolean | null;
  policy: string | null;
}

export function readPushState(root: string): EntirePush {
  const shared = readJson(path.join(root, ".entire/settings.json"));
  const local = readJson(path.join(root, ".entire/settings.local.json"));
  const pick = (j: Record<string, unknown> | null): boolean | null => {
    const o = j && typeof j.strategy_options === "object" && j.strategy_options !== null ? (j.strategy_options as Record<string, unknown>) : null;
    return o && typeof o.push_sessions === "boolean" ? o.push_sessions : null;
  };
  const pushSessions = pick(local) ?? pick(shared);
  let policy: string | null = null;
  try {
    policy = fs.readFileSync(path.join(root, ".git/entire/checkpoint-push-policy"), "utf8").trim() || null;
  } catch {
    policy = null;
  }
  return { uploads: pushSessions !== false && policy !== "manual", pushSessions, policy };
}

const HOOK_FILES: [string, string][] = [
  [".claude/settings.json", "claude"],
  [".claude/settings.local.json", "claude"],
  [".codex/hooks.json", "codex"],
  [".codex/config.toml", "codex"],
  [".cursor/hooks.json", "cursor"],
];

/** `entire hooks ` 명령이 들어 있는 하네스 설정 파일의 하네스 */
export function entireHarnesses(root: string): string[] {
  const out = new Set<string>();
  for (const [rel, h] of HOOK_FILES) {
    try {
      if (fs.readFileSync(path.join(root, rel), "utf8").includes("entire hooks ")) out.add(h);
    } catch {
      // 없는 설정 파일
    }
  }
  return [...out].sort();
}
