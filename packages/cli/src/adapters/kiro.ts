/** Kiro 어댑터(03 §3.2 표의 Kiro 열 · §3.7): 스킬 mirror, 규칙 · 명령 steering render, 역할 · 조율 에이전트 · IDE 훅 render(훅은 hooks.json, HK-24). */
import { HOOKS_REL, kiroCliHooks, kiroIdeFiles, renderKiroCoordinator } from "../projection/hooks";
import { renderKiroRole, renderKiroRule, renderKiroSkillSteering } from "../projection/render";
import type { HarnessAdapter, ProjectionContext, Want } from "./types";
import { mirrorDir, renderWant, skillData, stem, withSkillFiles } from "./wants";

export const kiro: HarnessAdapter = {
  id: "kiro",
  label: "Kiro",
  checkedVersion: "미확인 — 릴리스 점검표(03 §5 #4, HK-22)에서 적는다",
  plan(ctx: ProjectionContext): Want[] {
    const d = ctx.sources.deferred;
    const ds = withSkillFiles(d);
    const map = ctx.spec.hookMap;
    const mods = ctx.sources.modules;
    const roleHooks = kiroCliHooks(ctx.hooks, map, mods, true);
    const hooksData = ctx.sources.hooksData;
    const slug = ctx.tokens.PROJECT_SLUG ?? "";
    return [
      ...ctx.skills.map((s) => mirrorDir(`.kiro/skills/${stem(s.source)}`, "kiro", s, d)),
      ...ctx.rules.map((r) => renderWant(`.kiro/steering/${stem(r.source)}.md`, "kiro", r.source, renderKiroRule(r), r.data, d)),
      ...ctx.skills.map((s) => renderWant(`.kiro/steering/${stem(s.source)}.md`, "kiro", `${s.source}/SKILL.md`, renderKiroSkillSteering(s), skillData(s), ds)),
      ...ctx.roles.map(({ role, fields }) => renderWant(`.kiro/agents/${stem(role.source)}.json`, "kiro", role.source, renderKiroRole(role, fields.kiro ?? {}, roleHooks), role.data, d)),
      ...kiroIdeFiles(ctx.hooks, map, mods).map((f) => renderWant(f.path, "kiro", HOOKS_REL, f.text, hooksData, d)),
      ...(slug && ctx.hooksPresent ? [renderWant(`.kiro/agents/${slug}.json`, "kiro", HOOKS_REL, renderKiroCoordinator(ctx.spec, ctx.tokens, kiroCliHooks(ctx.hooks, map, mods)), hooksData, d)] : []),
    ];
  },
};
