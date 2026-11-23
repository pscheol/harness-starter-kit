/** Kiro 어댑터(03 §3.2 표의 Kiro 열 · §3.7): 스킬 mirror, 규칙 · 명령 steering render, 역할 render. 조율 에이전트 · 훅은 copy(HK-24 전). */
import { renderKiroRole, renderKiroRule, renderKiroSkillSteering } from "../projection/render";
import type { HarnessAdapter, ProjectionContext, Want } from "./types";
import { mirrorDir, renderWant, skillData, stem, withSkillFiles } from "./wants";

export const kiro: HarnessAdapter = {
  id: "kiro",
  label: "Kiro",
  checkedVersion: "0.9",
  plan(ctx: ProjectionContext): Want[] {
    const d = ctx.sources.deferred;
    const ds = withSkillFiles(d);
    return [
      ...ctx.skills.map((s) => mirrorDir(`.kiro/skills/${stem(s.source)}`, "kiro", s, d)),
      ...ctx.rules.map((r) => renderWant(`.kiro/steering/${stem(r.source)}.md`, "kiro", r.source, renderKiroRule(r), r.data, d)),
      ...ctx.skills.map((s) => renderWant(`.kiro/steering/${stem(s.source)}.md`, "kiro", `${s.source}/SKILL.md`, renderKiroSkillSteering(s), skillData(s), ds)),
      ...ctx.roles.map(({ role, fields }) => renderWant(`.kiro/agents/${stem(role.source)}.json`, "kiro", role.source, renderKiroRole(role, fields.kiro ?? {}, ctx.spec), role.data, d)),
    ];
  },
};
