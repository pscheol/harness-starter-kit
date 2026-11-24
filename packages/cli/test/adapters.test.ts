// 하네스 어댑터(HK-13 design §2 · §8.1, 03 §3.1 · §3.3): 작업 목록 스냅숏 · remove <id> 뒤 그 하네스 폴더 0개.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADAPTERS } from "../src/adapters";
import { buildContext } from "../src/projection/engine";
import { loadSpec } from "../src/projection/spec";
import { FsView } from "../src/projection/view";
import { harnessFiles, initWith, projectionTemplates } from "./projection-helpers";

function plan(target: string, templates: string, id: string): string[] {
  const tokens = { PROTECTED_PATH: "docs/references", PROJECT_SLUG: "acme" };
  const ctx = buildContext({ view: new FsView(target), spec: loadSpec(templates), tokens, agents: ["claude", "codex", "cursor", "kiro"] });
  const adapter = ADAPTERS.find((a) => a.id === id);
  if (!adapter) throw new Error(id);
  return adapter.plan(ctx).map((w) => `${w.op} ${w.path}${"from" in w && w.from ? ` ← ${w.from}` : ""}`);
}

describe("어댑터 작업 목록", () => {
  it("네 어댑터가 등록되어 있다(새 하네스 = 파일 하나 + 한 줄)", () => {
    expect(ADAPTERS.map((a) => a.id)).toEqual(["claude", "codex", "cursor", "kiro"]);
    for (const a of ADAPTERS) expect(a.checkedVersion).toMatch(/\S/);
  });

  it("claude · codex · cursor · kiro 스냅숏", async () => {
    const templates = projectionTemplates();
    const { target, r } = await initWith(templates);
    expect(r.code, r.stdout).toBe(0);
    expect(plan(target, templates, "claude")).toEqual([
      "mirror .claude/skills/kns-plan ← .agents/skills/kns-plan",
      "mirror .claude/rules/always.md ← .agents/rules/always.md",
      "mirror .claude/rules/kt.md ← .agents/rules/kt.md",
      "mirror .claude/rules/multi.md ← .agents/rules/multi.md",
      "mirror .claude/rules/structure.md ← .agents/rules/structure.md",
      "mirror .claude/rules/tech.md ← .agents/rules/tech.md",
      "render .claude/agents/explorer.md ← .agents/roles/explorer.md",
      "render .claude/agents/worker.md ← .agents/roles/worker.md",
      "merge CLAUDE.md",
      "merge .claude/settings.json",
    ]);
    expect(plan(target, templates, "codex")).toEqual([
      "render .codex/agents/explorer.toml ← .agents/roles/explorer.md",
      "render .codex/agents/worker.toml ← .agents/roles/worker.md",
      "merge .codex/hooks.json",
      "merge .codex/config.toml",
    ]);
    expect(plan(target, templates, "cursor")).toEqual([
      "render .cursor/commands/kns-plan.md ← .agents/skills/kns-plan/SKILL.md",
      "render .cursor/rules/always.mdc ← .agents/rules/always.md",
      "render .cursor/rules/kt.mdc ← .agents/rules/kt.md",
      "render .cursor/rules/multi.mdc ← .agents/rules/multi.md",
      "render .cursor/rules/structure.mdc ← .agents/rules/structure.md",
      "render .cursor/rules/tech.mdc ← .agents/rules/tech.md",
    ]);
    expect(plan(target, templates, "kiro")).toEqual([
      "mirror .kiro/skills/kns-plan ← .agents/skills/kns-plan",
      "render .kiro/steering/always.md ← .agents/rules/always.md",
      "render .kiro/steering/kt.md ← .agents/rules/kt.md",
      "render .kiro/steering/multi.md ← .agents/rules/multi.md",
      "render .kiro/steering/structure.md ← .agents/rules/structure.md",
      "render .kiro/steering/tech.md ← .agents/rules/tech.md",
      "render .kiro/steering/kns-plan.md ← .agents/skills/kns-plan/SKILL.md",
      "render .kiro/agents/explorer.json ← .agents/roles/explorer.md",
      "render .kiro/agents/worker.json ← .agents/roles/worker.md",
      // HK-24: IDE 훅(훅 하나에 파일 하나) · 조율 에이전트는 hooks.json 에서 만든다
      ...["session-start", "protect-sources", "protect-generated", "block-full-verify", "protect-approvals", "sync-projection", "verify-gate", "session-idle"].map(
        (n) => `render .kiro/hooks/harness-${n}.json ← .agents/hooks.json`,
      ),
      "render .kiro/agents/acme.json ← .agents/hooks.json",
    ]);
  });

  it.each(["claude", "codex", "cursor", "kiro"])("remove %s 뒤 그 하네스 폴더의 킷 배치 파일이 0개", async (id) => {
    const templates = projectionTemplates();
    const { target, cli } = await initWith(templates);
    const r = await cli("remove", [id, "--json", "--templates", templates]);
    expect(r.code, r.stdout).toBe(0);
    const left = harnessFiles(target).files.filter((f) => f.startsWith(`.${id}/`));
    // 조율 에이전트 · 훅 copy(HK-24 전)는 remove 가 copy 규칙으로 지운다.
    expect(left).toEqual([]);
    if (id === "claude") expect(fs.existsSync(path.join(target, "CLAUDE.md"))).toBe(false);
    const attrs = fs.readFileSync(path.join(target, ".gitattributes"), "utf8");
    expect(attrs).not.toContain(`.${id}/`);
  });
});
