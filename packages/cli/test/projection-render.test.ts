// 생성 형식(HK-13 design §4 · §3.3): 머리 해석 · 규칙 · 스킬 · 역할 · 모델 해석 · TOML 이스케이프.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontmatter, splitFrontmatter } from "../src/projection/frontmatter";
import {
  parsePolicy,
  parseRole,
  parseRule,
  parseSkill,
  renderClaudeRole,
  renderCodexRole,
  renderCursorCommand,
  renderCursorRule,
  renderKiroRole,
  renderKiroRule,
  renderKiroSkillSteering,
  resolveModel,
  tomlMultiline,
  tomlString,
} from "../src/projection/render";
import { loadSpec, parseSpec } from "../src/projection/spec";
import { REAL_TEMPLATES } from "./helpers";

const spec = loadSpec(REAL_TEMPLATES);
const policy = parsePolicy(fs.readFileSync(path.join(REAL_TEMPLATES, "common/agents-root/model-policy.json"), "utf8"));
const GEN = (from: string): string => `<!-- harness-kit 생성 · 원본 ${from} · 고칠 때는 원본을 고친다 -->`;

describe("머리(frontmatter)", () => {
  it("블록 목록 · 흐름 목록 · 흐름 표 · 따옴표 · 머리 없음", () => {
    const { block, body } = splitFrontmatter('---\npaths:\n  - "a/**"\n  - b/*.kt\ntools: [read, "search"]\nmodel: { claude: sonnet, codex: "gpt" }\nname: \'x\'\n---\n본문\n');
    expect(body).toBe("본문\n");
    expect(parseFrontmatter(block as string)).toEqual({ paths: ["a/**", "b/*.kt"], tools: ["read", "search"], model: { claude: "sonnet", codex: "gpt" }, name: "x" });
    expect(splitFrontmatter("# 머리 없음\n")).toEqual({ block: null, body: "# 머리 없음\n" });
    expect(splitFrontmatter("---\n닫히지 않음\n")).toEqual({ block: null, body: "---\n닫히지 않음\n" });
  });
});

describe("규칙 → Cursor · Kiro(R2, 03 §3.7 · §5 #10)", () => {
  const one = parseRule(".agents/rules/x.md", '---\npaths:\n  - "src/**/*.kt"\n---\n# X\n');
  const many = parseRule(".agents/rules/m.md", '---\npaths: ["**/*.ts", "**/*.tsx"]\n---\n# M\n');
  const none = parseRule(".agents/rules/n.md", "# N\n");

  it("paths 하나 · 여럿 · 없음", () => {
    expect(one).toMatchObject({ name: "x", paths: ["src/**/*.kt"], body: "# X\n" });
    expect(none.paths).toBeNull();
    expect(renderCursorRule(one)).toBe(`---\ndescription:\nglobs: src/**/*.kt\nalwaysApply: false\n---\n${GEN(".agents/rules/x.md")}\n# X\n`);
    expect(renderCursorRule(many)).toContain("globs: **/*.ts,**/*.tsx\nalwaysApply: false\n");
    expect(renderCursorRule(none)).toBe(`---\ndescription:\nglobs:\nalwaysApply: true\n---\n${GEN(".agents/rules/n.md")}\n# N\n`);
    expect(renderKiroRule(one)).toBe(`---\ninclusion: fileMatch\nfileMatchPattern: "src/**/*.kt"\n---\n${GEN(".agents/rules/x.md")}\n# X\n`);
    expect(renderKiroRule(many)).toContain('fileMatchPattern: ["**/*.ts", "**/*.tsx"]\n');
    expect(renderKiroRule(none)).toBe(`---\ninclusion: always\n---\n${GEN(".agents/rules/n.md")}\n# N\n`);
  });
});

describe("스킬 → Cursor 명령 · Kiro 명령 steering(03 §3.2)", () => {
  const files = new Map([["SKILL.md", { bytes: Buffer.from("---\nname: hx-plan\ndescription: 설계 — 만든다\n---\n\n본문\n"), executable: false }]]);
  const skill = parseSkill(".agents/skills/hx-plan", files);
  it("본문 전체를 싣고 원본 포인터만 두지 않는다", () => {
    expect(skill).toMatchObject({ name: "hx-plan", description: "설계 — 만든다" });
    expect(renderCursorCommand(skill)).toBe(`---\ndescription: 설계 — 만든다\n---\n${GEN(".agents/skills/hx-plan/SKILL.md")}\n\n본문\n`);
    expect(renderKiroSkillSteering(skill)).toBe(`---\ninclusion: manual\ndescription: 설계 — 만든다\n---\n${GEN(".agents/skills/hx-plan/SKILL.md")}\n\n본문\n`);
  });
});

describe("역할(R3, 03 §3.6 · 12 §3.5)", () => {
  const explorer = parseRole(".agents/roles/explorer.md", "---\nname: explorer\ndescription: 근거를 찾는다\nmode: read-only\ntools: [read, search]\nclass: explore\n---\n# explorer\n\n본문 \"\"\" \\ 끝\n");
  const worker = parseRole(".agents/roles/worker.md", "---\nname: worker\ndescription: 구현한다\nmode: write\ntools: [read, search, shell, write]\nclass: implement\n---\n# worker\n");
  const docs = parseRole(".agents/roles/docs-researcher.md", "---\nname: docs-researcher\ndescription: 문서\nmode: read-only\ntools: [read, search, web]\nclass: docs-research\n---\n# d\n");

  it("위임 역할에만 모델 · effort, 잠긴 역할은 inherit, Kiro 에는 effort 없음 · null 모델 없음", () => {
    const light = resolveModel(explorer, policy);
    expect(light).toEqual({ ok: true, locked: false, fields: { claude: { model: "haiku", effort: "low" }, codex: { model_reasoning_effort: "low" }, kiro: {} } });
    expect(resolveModel(worker, policy)).toEqual({ ok: true, locked: true, fields: { claude: { model: "inherit" }, codex: {}, kiro: {} } });
    const direct = parseRole(".agents/roles/e.md", "---\nname: e\ndescription: d\nmode: read-only\ntools: [read]\nclass: explore\nmodel: { claude: opus, kiro: k1 }\neffort: { claude: high, kiro: x }\n---\nb\n");
    expect(resolveModel(direct, policy)).toMatchObject({ ok: true, fields: { claude: { model: "opus", effort: "high" }, kiro: { model: "k1" } } });
  });

  it("잠긴 역할에 tier · model · effort 가 있으면 오류(MR-R3)", () => {
    const bad = parseRole(".agents/roles/reviewer.md", "---\nname: reviewer\ndescription: d\nmode: read-only\ntools: [read]\nclass: review\ntier: deep\n---\nb\n");
    const r = resolveModel(bad, policy);
    expect(r.ok).toBe(false);
  });

  it("정책이 없으면 모두 inherit", () => {
    expect(resolveModel(explorer, parsePolicy(null))).toEqual({ ok: true, locked: false, fields: { claude: { model: "inherit" }, codex: {}, kiro: {} } });
  });

  it("Claude md: 머리 + 생성 표지 + 본문 전체", () => {
    const fields = { model: "haiku", effort: "low" };
    expect(renderClaudeRole(explorer, fields)).toBe(
      `---\nname: explorer\ndescription: 근거를 찾는다\ntools: Read, Glob, Grep\nmodel: haiku\neffort: low\n---\n${GEN(".agents/roles/explorer.md")}\n# explorer\n\n본문 """ \\ 끝\n`,
    );
    expect(renderClaudeRole(worker, { model: "inherit" })).toContain("tools: Read, Glob, Grep, Bash, Edit, Write\nmodel: inherit\n---\n");
    expect(renderClaudeRole(docs, {})).toContain("tools: Read, Glob, Grep, WebFetch, WebSearch\n---\n");
  });

  it("Codex toml: read-only 첫 줄, 본문 전체, 이스케이프", () => {
    const text = renderCodexRole(explorer, { model_reasoning_effort: "low" }, spec);
    expect(text.startsWith("# harness-kit 생성 · 원본 .agents/roles/explorer.md · 고칠 때는 원본을 고친다\nname = \"explorer\"\ndescription = \"근거를 찾는다\"\nsandbox_mode = \"read-only\"\nmodel_reasoning_effort = \"low\"\n\ndeveloper_instructions = \"\"\"\n")).toBe(true);
    expect(text).toContain(`${spec.readOnlyLine}\n# explorer\n`);
    expect(text).toContain('본문 ""\\" \\\\ 끝\n"""\n');
    expect(renderCodexRole(worker, {}, spec)).toContain('sandbox_mode = "workspace-write"\n\ndeveloper_instructions = """\n# worker\n"""\n');
  });

  it("Kiro json: prompt 에 본문, 자원에서 역할 원본을 뺀다, write 역할에 보호 훅(hooks.json 의 subagents 항목)", () => {
    const roleHooks = { preToolUse: [{ matcher: "write", command: "x harness-protect-sources y", timeout_ms: 15000 }] };
    const e = JSON.parse(renderKiroRole(explorer, {}, roleHooks));
    expect(e).toEqual({
      name: "explorer",
      description: "근거를 찾는다",
      prompt: '# explorer\n\n본문 """ \\ 끝\n',
      tools: ["read"],
      allowedTools: ["read"],
      resources: ["file://AGENTS.md", "file://.agents/rules/guardrails.md", "skill://.agents/skills/**/SKILL.md"],
    });
    const w = JSON.parse(renderKiroRole(worker, {}, roleHooks));
    expect(w.tools).toEqual(["read", "shell", "write"]);
    expect(w.allowedTools).toEqual(["read", "write"]);
    expect(w.hooks).toEqual(roleHooks);
    expect(JSON.parse(renderKiroRole(worker, {}, {})).hooks).toBeUndefined();
    expect(JSON.parse(renderKiroRole(docs, {}, roleHooks)).tools).toEqual(["read", "web"]);
    expect(renderKiroRole(explorer, {}, roleHooks).endsWith("}\n")).toBe(true);
  });

  it("TOML 문자열", () => {
    expect(tomlString('a "b" \\ \t\u0001')).toBe('"a \\"b\\" \\\\ \\t\\u0001"');
    expect(tomlMultiline('x """ y \\ z\u0007\n')).toBe('x ""\\" y \\\\ z\\u0007\n');
  });
});

describe("projection.json", () => {
  it("사람 세션 모델 키(12 §3.1)가 설정 조각에 있으면 거부한다", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(REAL_TEMPLATES, "common/scripts/harness/projection.json"), "utf8"));
    expect(() => parseSpec(JSON.stringify({ ...raw, claudeSettings: { ...raw.claudeSettings, extra: { model: "opus" } } }))).toThrow(/model/);
    expect(() => parseSpec(JSON.stringify({ ...raw, codexConfig: { ...raw.codexConfig, defaults: [...raw.codexConfig.defaults, { key: "model", line: 'model = "x"' }] } }))).toThrow(/model/);
  });

  it("Claude 킷 블록은 1.5KB 이하(R4)", () => {
    expect(Buffer.byteLength(`${spec.claudeBlock.join("\n")}\n`, "utf8")).toBeLessThanOrEqual(1536);
  });
});
