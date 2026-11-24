/** Cursor 어댑터(03 §3.2 표의 Cursor 열): 스킬 → `.cursor/commands` render(본문 전체), 규칙 → `.cursor/rules/*.mdc` render(globs). */
import { renderCursorCommand, renderCursorRule } from "../projection/render";
import type { HarnessAdapter, ProjectionContext, Want } from "./types";
import { renderWant, skillData, stem, withSkillFiles } from "./wants";

export const cursor: HarnessAdapter = {
  id: "cursor",
  label: "Cursor",
  checkedVersion: "미확인 — 릴리스 점검표(03 §5 #4, HK-22)에서 적는다",
  plan(ctx: ProjectionContext): Want[] {
    const d = ctx.sources.deferred;
    const ds = withSkillFiles(d);
    return [
      ...ctx.skills.map((s) => renderWant(`.cursor/commands/${stem(s.source)}.md`, "cursor", `${s.source}/SKILL.md`, renderCursorCommand(s), skillData(s), ds)),
      ...ctx.rules.map((r) => renderWant(`.cursor/rules/${stem(r.source)}.mdc`, "cursor", r.source, renderCursorRule(r), r.data, d)),
    ];
  },
};
