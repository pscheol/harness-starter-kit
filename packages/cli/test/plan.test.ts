import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CliError } from "../src/core/errors";
import { loadLayout } from "../src/core/layout";
import { buildPlan, type Plan, type PlanMode } from "../src/core/plan";
import { resolveSelection, type SelectionInput } from "../src/core/selection";
import { resolveTokens } from "../src/core/tokens";
import { BASIC_FILES, fixtureTemplates, tmpDir, writeTree } from "./helpers";

function makePlan(
  templatesDir: string,
  input: SelectionInput,
  target: string,
  mode: Partial<PlanMode> = {},
): Plan {
  const layout = loadLayout(templatesDir);
  const selection = resolveSelection(layout, templatesDir, input, { target, env: {} });
  const tokens = resolveTokens(layout, selection, {
    flags: {},
    env: { PROJECT_SLUG: "acme", PROJECT_NAME: "Acme", PACKAGE_NS: "com.acme" },
    targetBasename: path.basename(target),
  });
  return buildPlan({ layout, templatesDir, target, selection, tokens, mode: { force: false, adopt: false, ...mode } });
}

function op(plan: Plan, p: string) {
  const found = plan.ops.find((o) => o.path === p);
  if (!found) throw new Error(`없는 작업: ${p}`);
  return found;
}

function code(fn: () => unknown): number {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(CliError);
    return (err as CliError).code;
  }
  return 0;
}

describe("작업 목록", () => {
  it("빈 대상: 고른 하네스만, 무시 파일 제외, 경로 사전순", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const plan = makePlan(tpl, { agents: "claude", modules: "zz-overlap" }, tmpDir());
    const paths = plan.ops.map((o) => o.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".claude/settings.json");
    expect(paths).not.toContain(".codex/config.toml");
    expect(paths).not.toContain(".cursor/commands/hx.md");
    expect(paths.some((p) => p.startsWith(".kiro/"))).toBe(false);
    expect(paths.some((p) => p.endsWith(".DS_Store") || p.endsWith("ABOUT"))).toBe(false);
    expect(plan.excludedByHarness).toBe(3);
    expect(plan.ops.every((o) => o.action === "create" && o.owner === "kit" && o.op === "copy")).toBe(true);
    expect(plan.counts).toMatchObject({ create: plan.ops.length, same: 0, replace: 0, "skip-user": 0, excludedByHarness: 3, overlapped: 1 });
  });

  it("같은 설치 경로가 두 레이어에 있으면 뒤 레이어가 이긴다(실제 layout.json, overlap last)", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const plan = makePlan(tpl, { agents: "claude", modules: "zz-overlap" }, tmpDir());
    const guard = op(plan, "scripts/guards/_template.sh");
    expect(guard.content.toString()).toBe("module\n");
    expect(guard.layer).toBe("optional/zz-overlap");
    expect(plan.overlaps).toEqual([
      { path: "scripts/guards/_template.sh", layers: ["common", "optional/zz-overlap"], winner: "optional/zz-overlap" },
    ]);
    expect(plan.ops.filter((o) => o.path === "scripts/guards/_template.sh")).toHaveLength(1);
  });

  it("overlap first 로 바꾸면 앞 레이어가 이긴다", () => {
    const tpl = fixtureTemplates(BASIC_FILES, { overlap: "first" });
    const guard = op(makePlan(tpl, { agents: "claude", modules: "zz-overlap" }, tmpDir()), "scripts/guards/_template.sh");
    expect(guard.content.toString()).toBe("common\n");
    expect(guard.layer).toBe("common");
  });

  it("레이어 · 치환 · 실행 비트 · 경로 토큰 · 해시", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const plan = makePlan(tpl, { stack: "jvm", arch: "layered", agents: "all", lang: "kotlin" }, tmpDir());
    expect(op(plan, ".agents/rules/structure.md")).toMatchObject({ layer: "stacks/jvm/arch/layered" });
    expect(op(plan, ".agents/rules/tech.md")).toMatchObject({ layer: "stacks/jvm" });
    expect(op(plan, ".agents/rules/a.md").content.toString()).toBe("ns=com.acme lang=Kotlin\n");
    expect(op(plan, "scripts/run.sh")).toMatchObject({ executable: true });
    expect(op(plan, ".agents/rules/a.md")).toMatchObject({ executable: false });
    expect(op(plan, ".kiro/agents/acme.json").content.toString()).toBe('{"name": "acme"}\n');
    expect(op(plan, "AGENTS.md").sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.ops.some((o) => o.layer.startsWith("domains/"))).toBe(false);
  });

  it("도메인 폴더가 있으면 도메인 레이어를 넣는다", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const plan = makePlan(tpl, { stack: "web", agents: "claude" }, tmpDir());
    expect(op(plan, ".agents/rules/frontend.md")).toMatchObject({ layer: "domains/frontend" });
  });

  it("있는 파일: 같으면 same, 다르면 skip-user, --force 면 replace, --adopt 면 skip-user", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const target = tmpDir();
    writeTree(target, { "AGENTS.md": "# Acme\n", ".claude/settings.json": "{\"mine\": true}\n" });
    const base = makePlan(tpl, { agents: "claude" }, target);
    expect(op(base, "AGENTS.md")).toMatchObject({ action: "same", owner: "kit" });
    expect(op(base, ".claude/settings.json")).toMatchObject({ action: "skip-user", owner: "user" });
    const force = makePlan(tpl, { agents: "claude" }, target, { force: true });
    expect(op(force, "AGENTS.md").action).toBe("same");
    expect(op(force, ".claude/settings.json")).toMatchObject({ action: "replace", owner: "kit" });
    const adopt = makePlan(tpl, { agents: "claude" }, target, { adopt: true });
    expect(op(adopt, "AGENTS.md")).toMatchObject({ action: "skip-user", owner: "user" });
    expect(adopt.counts["skip-user"]).toBe(2);
  });

  it("--force 는 실행 비트만 다른 파일도 바꾼다", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const target = tmpDir();
    writeTree(target, { "scripts/run.sh": "#!/bin/sh\necho acme\n" });
    fs.chmodSync(path.join(target, "scripts/run.sh"), 0o644);
    expect(op(makePlan(tpl, { agents: "claude" }, target), "scripts/run.sh").action).toBe("same");
    expect(op(makePlan(tpl, { agents: "claude" }, target, { force: true }), "scripts/run.sh").action).toBe("replace");
  });

  it("파일 자리에 폴더 · 링크가 있으면 건드리지 않는다", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const target = tmpDir();
    fs.mkdirSync(path.join(target, "AGENTS.md"));
    fs.symlinkSync("/etc/hosts", path.join(target, "CLAUDE.md"));
    const plan = makePlan(tpl, { agents: "claude" }, target, { force: true });
    expect(op(plan, "AGENTS.md")).toMatchObject({ action: "skip-user", owner: "user" });
    expect(op(plan, "CLAUDE.md")).toMatchObject({ action: "skip-user", owner: "user" });
  });

  it("리포 밖 · .git 으로 가는 경로는 exit 3", () => {
    const up = fixtureTemplates({ ...BASIC_FILES, "common/evil/x": "x\n" }, {
      segments: [{ from: "evil/", to: "../", harness: null }, { from: "", to: "", harness: null }],
    });
    expect(code(() => makePlan(up, { agents: "claude" }, tmpDir()))).toBe(3);
    const git = fixtureTemplates({ ...BASIC_FILES, "common/evil/hooks/x": "x\n" }, {
      segments: [{ from: "evil/", to: ".git/", harness: null }, { from: "", to: "", harness: null }],
    });
    expect(code(() => makePlan(git, { agents: "claude" }, tmpDir()))).toBe(3);
  });

  it("하네스 폴더가 링크로 리포 밖을 가리키면 exit 3", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const target = tmpDir();
    const outside = tmpDir("hk-outside-");
    fs.symlinkSync(outside, path.join(target, ".claude"));
    expect(code(() => makePlan(tpl, { agents: "claude" }, target))).toBe(3);
  });

  it("상위 폴더가 끊어진 링크면 exit 3", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const target = tmpDir();
    fs.symlinkSync(path.join(tmpDir("hk-gone-"), "nothere"), path.join(target, ".claude"));
    expect(code(() => makePlan(tpl, { agents: "claude" }, target))).toBe(3);
  });

  it("상위 경로가 파일이면 그 아래 파일은 skip-user", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const target = tmpDir();
    writeTree(target, { ".agents": "파일이다\n" });
    const plan = makePlan(tpl, { agents: "claude" }, target);
    expect(op(plan, ".agents/rules/a.md")).toMatchObject({ action: "skip-user", owner: "user" });
    expect(op(plan, "AGENTS.md").action).toBe("create");
  });

  it(".git 조각은 대소문자를 가리지 않고 거부한다", () => {
    const tpl = fixtureTemplates({ ...BASIC_FILES, "common/evil/x": "x\n" }, {
      segments: [{ from: "evil/", to: ".GIT/", harness: null }, { from: "", to: "", harness: null }],
    });
    expect(code(() => makePlan(tpl, { agents: "claude" }, tmpDir()))).toBe(3);
  });

  it("--adopt 는 있는 매니페스트를 그대로 둔다", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const target = tmpDir();
    writeTree(target, { ".agents/harness.json": "{\"unit\": \"mine\"}\n" });
    expect(makePlan(tpl, { agents: "claude" }, target).generated[0]?.action).toBe("replace");
    expect(makePlan(tpl, { agents: "claude" }, target, { adopt: true }).generated[0]?.action).toBe("skip-user");
  });

  it("하네스 매니페스트를 setup.sh 와 같은 바이트로 만든다", () => {
    const tpl = fixtureTemplates(BASIC_FILES);
    const plan = makePlan(tpl, { agents: "kiro,claude" }, tmpDir());
    expect(plan.generated).toHaveLength(1);
    expect(plan.generated[0]?.path).toBe(".agents/harness.json");
    expect(plan.generated[0]?.action).toBe("create");
    expect(plan.generated[0]?.content.toString()).toBe(
      '{\n  "unit": "acme",\n  "title": "Acme",\n  "stack": "jvm",\n  "agents": ["kiro", "claude"],\n  "shared": []\n}\n',
    );
  });

  it("모듈 폴더가 없으면 exit 5", () => {
    const files = { ...BASIC_FILES };
    delete files["optional/jira-workflow/agents-rules/jira.md"];
    const tpl = fixtureTemplates(files);
    expect(code(() => makePlan(tpl, { agents: "claude", modules: "jira-workflow" }, tmpDir()))).toBe(5);
  });
});
