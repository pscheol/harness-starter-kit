/** Codex 어댑터(03 §3.2 표의 Codex 열): 역할 render + `.codex/config.toml` merge. 스킬은 `.agents/skills/`를 그대로 읽는다. */
import { codexConfigWant } from "../projection/merge";
import { renderCodexRole } from "../projection/render";
import type { HarnessAdapter, ProjectionContext, Want } from "./types";
import { renderWant, stem } from "./wants";

export const codex: HarnessAdapter = {
  id: "codex",
  label: "Codex",
  checkedVersion: "0.1",
  plan(ctx: ProjectionContext): Want[] {
    const d = ctx.sources.deferred;
    const live = ctx.roles.filter(({ role }) => !d.has(role.source)).map(({ role }) => ({ name: stem(role.source), description: role.description }));
    const keep = ctx.roles.filter(({ role }) => d.has(role.source)).map(({ role }) => stem(role.source));
    return [
      ...ctx.roles.map(({ role, fields }) => renderWant(`.codex/agents/${stem(role.source)}.toml`, "codex", role.source, renderCodexRole(role, fields.codex ?? {}, ctx.spec), role.data, d)),
      { op: "merge", path: ".codex/config.toml", harness: "codex", kind: "codex-config", want: codexConfigWant(ctx.spec, live, keep) },
    ];
  },
};
