/** Claude Code 어댑터(03 §3.2 표의 Claude 열): 스킬 · 규칙 mirror, 역할 render, CLAUDE.md · settings.json(권한 · hooks.json 훅) merge. */
import { kitScriptSuffixes, settingsHooks } from "../projection/hooks";
import { claudeMdWant, settingsWant } from "../projection/merge";
import { renderClaudeRole } from "../projection/render";
import type { HarnessAdapter, ProjectionContext, Want } from "./types";
import { mirrorDir, mirrorFile, renderWant, stem } from "./wants";

export const claude: HarnessAdapter = {
  id: "claude",
  label: "Claude Code",
  checkedVersion: "미확인 — 릴리스 점검표(03 §5 #4, HK-22)에서 적는다",
  plan(ctx: ProjectionContext): Want[] {
    const d = ctx.sources.deferred;
    return [
      ...ctx.skills.map((s) => mirrorDir(`.claude/skills/${stem(s.source)}`, "claude", s, d)),
      ...ctx.rules.map((r) => mirrorFile(`.claude/rules/${stem(r.source)}.md`, "claude", r, ctx.view, d)),
      ...ctx.roles.map(({ role, fields }) => renderWant(`.claude/agents/${stem(role.source)}.md`, "claude", role.source, renderClaudeRole(role, fields.claude ?? {}), role.data, d)),
      { op: "merge", path: "CLAUDE.md", harness: "claude", kind: "claude-md", want: claudeMdWant(ctx.spec) },
      { op: "merge", path: ".claude/settings.json", harness: "claude", kind: "settings", want: settingsWant(ctx.spec, ctx.tokens, settingsHooks(ctx.hooks, "claude", ctx.spec.hookMap, ctx.sources.modules), kitScriptSuffixes(ctx.hooks, ctx.spec.hookMap)) },
    ];
  },
};
