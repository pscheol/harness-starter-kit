// init 배치(HK-13 R1 · R2 · R4 · R7, 03 §5 #1 · #9 · #10).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_ENV, lockEntries, lockEntry, modeOf, readText, readTree, REAL_TEMPLATES, run, tmpDir, writeTree } from "./helpers";
import { coveredByProjection, harnessFiles, initWith, POINTER_PHRASES, projectionTemplates } from "./projection-helpers";

/** 훅 설정 copy 와 사람용 안내 문서(HK-24 전까지 copy 로 남는다, design §2). */
const COPY_ALLOWED = /^(\.codex\/hooks\.json|\.codex\/README\.md|\.kiro\/README\.md|\.kiro\/hooks\/[^/]+\.json|\.kiro\/agents\/acme(-notes)?\.json)$/;

describe("init 배치", () => {
  it("하네스 폴더 파일 = lock mirror · render · merge 항목, 링크 0, 포인터 0(03 §5 #1)", async () => {
    const { target, r } = await initWith(projectionTemplates());
    expect(r.code, r.stdout).toBe(0);
    const entries = lockEntries(target);
    const { files, links } = harnessFiles(target);
    expect(links).toEqual([]);
    const covered = coveredByProjection(target, entries);
    expect(files.filter((f) => !covered.has(f) && !COPY_ALLOWED.test(f))).toEqual([]);
    for (const f of files) {
      const text = readText(target, f);
      for (const phrase of POINTER_PHRASES) expect(text, f).not.toContain(phrase);
    }
    const j = JSON.parse(r.stdout);
    expect(j.projection.counts.create).toBeGreaterThan(20);
    expect(lockEntry(target, ".claude/skills/kns-plan")).toMatchObject({ op: "mirror", owner: "kit", from: ".agents/skills/kns-plan" });
    expect(lockEntry(target, ".kiro/steering/kt.md")).toMatchObject({ op: "render", owner: "kit", from: ".agents/rules/kt.md" });
    expect(lockEntry(target, "CLAUDE.md")).toMatchObject({ op: "merge", owner: "kit", keys: ["line:@AGENTS.md", "block:claude"], createdByKit: true });
    expect(lockEntry(target, ".gitattributes")).toMatchObject({ op: "merge", keys: ["block:generated"] });
  });

  it("mirror 는 원본과 같은 바이트 · 실행 비트, render 에는 생성 표지(R1)", async () => {
    const { target } = await initWith(projectionTemplates());
    for (const f of ["SKILL.md", "agents/openai.yaml", "tool.sh"]) {
      expect(readText(target, `.claude/skills/kns-plan/${f}`)).toBe(readText(target, `.agents/skills/kns-plan/${f}`));
      expect(readText(target, `.kiro/skills/kns-plan/${f}`)).toBe(readText(target, `.agents/skills/kns-plan/${f}`));
    }
    expect(modeOf(target, ".claude/skills/kns-plan/tool.sh")).toBe(modeOf(target, ".agents/skills/kns-plan/tool.sh"));
    expect(readText(target, ".claude/rules/kt.md")).toBe(readText(target, ".agents/rules/kt.md"));
    expect(readText(target, ".kiro/steering/kt.md")).toContain("원본 .agents/rules/kt.md");
  });

  it("규칙 paths → .claude/rules 그대로 · .mdc globs · Kiro fileMatch, paths 없으면 늘 싣는다(R2, 03 §5 #10)", async () => {
    const { target } = await initWith(projectionTemplates());
    expect(readText(target, ".claude/rules/kt.md")).toContain('paths:\n  - "src/**/*.kt"');
    expect(readText(target, ".cursor/rules/kt.mdc")).toContain("globs: src/**/*.kt\nalwaysApply: false\n");
    expect(readText(target, ".kiro/steering/kt.md")).toMatch(/^---\ninclusion: fileMatch\nfileMatchPattern: "src\/\*\*\/\*\.kt"\n---\n/);
    expect(readText(target, ".kiro/steering/always.md")).toMatch(/^---\ninclusion: always\n---\n/);
    expect(readText(target, ".cursor/rules/always.mdc")).toContain("alwaysApply: true\n");
  });

  it("역할 원본 하나 → Claude md · Codex toml · Kiro json, 위임 역할만 모델(R3)", async () => {
    const { target } = await initWith(projectionTemplates());
    expect(readText(target, ".claude/agents/explorer.md")).toContain("model: haiku\neffort: low\n");
    expect(readText(target, ".claude/agents/worker.md")).toContain("model: inherit\n");
    expect(readText(target, ".claude/agents/worker.md")).not.toContain("effort:");
    expect(readText(target, ".codex/agents/explorer.toml")).toContain('model_reasoning_effort = "low"');
    expect(readText(target, ".codex/agents/worker.toml")).not.toMatch(/^model/m);
    expect(JSON.parse(readText(target, ".kiro/agents/explorer.json")).model).toBeUndefined();
    expect(readText(target, ".codex/config.toml")).toContain('[agents.explorer]\ndescription = "코드에서 근거를 찾는다. 읽기 전용이다."\nconfig_file = "agents/explorer.toml"\n');
    expect(readText(target, ".claude/settings.json")).not.toMatch(/"model"|effortLevel/);
  });

  it("CLAUDE.md 는 @AGENTS.md + 킷 블록(R4), .gitattributes 생성 경로(R7)", async () => {
    const { target } = await initWith(projectionTemplates(), "claude,kiro");
    const md = readText(target, "CLAUDE.md");
    expect(md.startsWith("@AGENTS.md\n\n<!-- knots-sync:begin claude")).toBe(true);
    expect(Buffer.byteLength(md.slice(md.indexOf("<!--")), "utf8")).toBeLessThanOrEqual(1536);
    const attrs = readText(target, ".gitattributes");
    expect(attrs).toContain(".claude/rules/** linguist-generated=true");
    expect(attrs).toContain(".kiro/steering/** linguist-generated=true");
    expect(attrs).not.toContain(".cursor/");
  });

  it("미리 있는 사람 파일: 배치 대상은 skip-user, CLAUDE.md 는 블록만 더한다", async () => {
    const { target, r } = await initWith(projectionTemplates(), "claude", {
      pre: (t) => writeTree(t, { ".claude/rules/kt.md": "# 내 규칙\n", "CLAUDE.md": "# 내 CLAUDE\n" }),
    });
    expect(r.code, r.stdout).toBe(0);
    expect(readText(target, ".claude/rules/kt.md")).toBe("# 내 규칙\n");
    expect(lockEntry(target, ".claude/rules/kt.md")).toMatchObject({ op: "mirror", owner: "user", sha256: null });
    expect(readText(target, "CLAUDE.md").startsWith("# 내 CLAUDE\n\n@AGENTS.md\n\n<!-- knots-sync:begin claude")).toBe(true);
    expect(lockEntry(target, "CLAUDE.md")).toMatchObject({ op: "merge", owner: "kit" });
    expect(lockEntry(target, "CLAUDE.md")?.createdByKit).toBeUndefined();
  });

  it("킷 스킬 머리에 model 이 있고 context: fork 가 아니면 그 스킬을 배치하지 않는다(03 §5 #9)", async () => {
    const templates = projectionTemplates({ "common/agents-skills/kns-bad/SKILL.md": "---\nname: kns-bad\ndescription: 나쁜 스킬\nmodel: opus\n---\n본문\n" });
    const { target, r } = await initWith(templates, "claude,kiro");
    expect(r.code).toBe(4);
    const j = JSON.parse(r.stdout);
    expect(j.projection.findings.map((f: { kind: string }) => f.kind)).toContain("skill-model-field");
    expect(fs.existsSync(path.join(target, ".claude/skills/kns-bad"))).toBe(false);
    expect(fs.existsSync(path.join(target, ".kiro/skills/kns-bad"))).toBe(false);
    expect(fs.existsSync(path.join(target, ".claude/skills/kns-plan/SKILL.md"))).toBe(true);
  });

  it("같은 배치 경로를 두 작업이 내면 exit 3", async () => {
    const templates = projectionTemplates({ "common/agents-rules/kns-plan.md": "# 스킬 이름과 같은 규칙\n" });
    const { r } = await initWith(templates, "kiro");
    expect(r.code).toBe(3);
    expect(r.stdout).toContain(".kiro/steering/kns-plan.md");
  });

  it("--dry-run(plan)은 배치 작업을 보이되 쓰지 않는다", async () => {
    const templates = projectionTemplates();
    const target = path.join(tmpDir(), "acme");
    const r = await run(["plan", "--json", "--templates", templates, "--cwd", target, "--agents", "all"], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(0);
    expect(JSON.parse(r.stdout).projection.ops.some((o: { path: string }) => o.path === ".claude/skills/kns-plan")).toBe(true);
    expect(readTree(target).size).toBe(0);
  });

  it("실제 템플릿 · 하네스 전부: 포인터 0 · 링크 0 · 늘 싣는 킷 규칙 0(R1 · R2 · R9)", async () => {
    const target = path.join(tmpDir(), "acme-notes");
    const r = await run(["init", "--yes", "--json", "--templates", REAL_TEMPLATES, "--cwd", target, "--agents", "all", "--modules", "all"], { env: FIXTURE_ENV });
    expect(r.code, r.stdout.slice(-2000)).toBe(0);
    const entries = lockEntries(target);
    const { files, links } = harnessFiles(target);
    expect(links).toEqual([]);
    const covered = coveredByProjection(target, entries);
    expect(files.filter((f) => !covered.has(f) && !COPY_ALLOWED.test(f))).toEqual([]);
    for (const f of files) for (const phrase of POINTER_PHRASES) expect(readText(target, f), f).not.toContain(phrase);
    const always = fs.readdirSync(path.join(target, ".claude/rules")).filter((f) => !/^---\n[\s\S]*?^paths:/m.test(readText(target, `.claude/rules/${f}`)));
    expect(always).toEqual([]);
    expect(fs.existsSync(path.join(target, ".claude/commands"))).toBe(false);
  });
});
