/**
 * 훅 설정이 없는 스크립트를 부르는지 본다(doctor `hook-script-missing`, HK-22).
 * v1.0.7 이하에서 2.0.0-alpha.1 로 올린 리포가 지운 session-start.sh 를 계속 불러 세션마다 훅 오류가 났다(2026-11-25 실측).
 * 리포 기준으로 확실히 풀리는 경로만 본다: `$CLAUDE_PROJECT_DIR/…` · `"$CLAUDE_PROJECT_DIR"/…` · 낱말 첫머리의 `.claude/` · `.codex/` · `scripts/`.
 * `aidlc engine hook …` 같은 명령, 절대경로, `$r/…` 처럼 셸 변수로 만든 경로는 보지 않는다.
 */
import fs from "node:fs";
import path from "node:path";

export const HOOK_SETTINGS = [".claude/settings.json", ".codex/hooks.json"] as const;

const SCRIPT_REF = /(?:\$CLAUDE_PROJECT_DIR"?\/|(?<![\w/.$-]))((?:\.claude|\.codex|scripts)\/[\w./-]+\.(?:sh|py))/g;

export interface MissingHookScript {
  file: string;
  event: string;
  script: string;
  command: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function commands(raw: unknown): { event: string; command: string }[] {
  const hooks = isObj(raw) ? raw.hooks : undefined;
  if (!isObj(hooks)) return [];
  const out: { event: string; command: string }[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const g of groups) {
      const items = isObj(g) ? g.hooks : undefined;
      if (!Array.isArray(items)) continue;
      for (const h of items) if (isObj(h) && typeof h.command === "string") out.push({ event, command: h.command });
    }
  }
  return out;
}

export function scriptRefs(command: string): string[] {
  return [...new Set([...command.matchAll(SCRIPT_REF)].map((m) => m[1] as string))];
}

export function missingHookScripts(target: string): MissingHookScript[] {
  const out: MissingHookScript[] = [];
  for (const file of HOOK_SETTINGS) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(target, file), "utf8"));
    } catch {
      continue; // 없거나 깨진 파일은 다른 점검(배치 · 병합)이 본다
    }
    for (const { event, command } of commands(raw)) {
      for (const script of scriptRefs(command)) if (!fs.existsSync(path.join(target, script))) out.push({ file, event, script, command });
    }
  }
  return out;
}
