import { describe, expect, it } from "vitest";
import { CliError } from "../src/core/errors";
import { globToRegExp, isExecutable, loadLayout, mapPath, parseLayout } from "../src/core/layout";
import { REAL_TEMPLATES, realLayout } from "./helpers";

const layout = loadLayout(REAL_TEMPLATES);
const slug = { PROJECT_SLUG: "acme" };

describe("layout.json 해석", () => {
  it("실제 layout.json 을 읽는다", () => {
    expect(layout.schema).toBe("knots-sync.layout/v1");
    expect(layout.overlap).toBe("last"); // 뒤 레이어가 이긴다(HK-10 R10.1)
    expect(layout.tokens).toHaveLength(9);
  });

  it.each([
    ["root/CLAUDE.md", "CLAUDE.md", "claude"],
    ["root/AGENTS.md", "AGENTS.md", null],
    ["root/CLAUDE.md.bak", "CLAUDE.md.bak", null],
    ["root/.gitignore", ".gitignore", null],
    ["kiro-steering/a.md", ".kiro/steering/a.md", "kiro"],
    ["kiro-root/settings/mcp.json", ".kiro/settings/mcp.json", "kiro"],
    ["agents-root/roles/reviewer.md", ".agents/roles/reviewer.md", null],
    ["agents-docs/_spec-templates/x.md", ".agents/docs/_spec-templates/x.md", null],
    ["scripts/verify.sh", "scripts/verify.sh", null],
    ["claude/settings.json", ".claude/settings.json", "claude"],
    ["codex/hooks.json", ".codex/hooks.json", "codex"],
    ["cursor/commands/hx.md", ".cursor/commands/hx.md", "cursor"],
    ["docs/features/_src/a.json", "docs/features/_src/a.json", null],
    ["tools/docs/feature_docs.py", "tools/docs/feature_docs.py", null],
  ])("%s → %s (%s)", (rel, dest, harness) => {
    expect(mapPath(layout, rel, slug)).toEqual({ dest, harness });
  });

  it("경로 토큰은 값이 있을 때만 바꾼다", () => {
    expect(mapPath(layout, "kiro-agents/__PROJECT_SLUG__.json", slug).dest).toBe(".kiro/agents/acme.json");
    expect(mapPath(layout, "kiro-agents/__PROJECT_SLUG__.json", { PROJECT_SLUG: "" }).dest).toBe(
      ".kiro/agents/__PROJECT_SLUG__.json",
    );
  });

  it.each([
    ["scripts/verify.sh", true],
    ["x.sh", true],
    ["a/b/c.sh", true],
    [".kiro/hooks/run.sh", true],
    ["scripts/harness/check.py", true],
    ["scripts/a.py", true],
    ["tools/docs/feature_docs.py", false],
    ["scripts/git-hooks/pre-push", true],
    ["scripts/git-hooks/sub/x", true],
    [".agents/rules/a.md", false],
    ["scripts/a.pyc", false],
    ["scripts.sh.md", false],
  ])("실행 비트 %s = %s", (dest, want) => {
    expect(isExecutable(layout, dest)).toBe(want);
  });

  it("glob 의 ** 는 / 를 넘고 * 는 넘지 않는다", () => {
    const arch = globToRegExp("**/arch/**");
    expect(arch.test("arch/x.md")).toBe(true);
    expect(arch.test("a/arch/b/c.md")).toBe(true);
    expect(arch.test("archive/x.md")).toBe(false);
    expect(arch.test("x/arch")).toBe(false);
    const one = globToRegExp("scripts/*.py");
    expect(one.test("scripts/a.py")).toBe(true);
    expect(one.test("scripts/b/a.py")).toBe(false);
  });

  it("형식이 틀린 layout.json 은 exit 5 로 거부한다", () => {
    const bad = [
      { ...realLayout(), schema: "other/v9" },
      { ...realLayout(), segments: "x" },
      { ...realLayout(), overlap: "middle" },
      { ...realLayout(), tokens: [1, 2] },
      null,
    ];
    for (const raw of bad) {
      try {
        parseLayout(raw);
        expect.unreachable("거부해야 한다");
      } catch (err) {
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe(5);
      }
    }
  });
});
