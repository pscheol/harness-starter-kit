// 훅 원본 hooks.json → 하네스별 훅(HK-24 design §2 · §3, 03 §3.4). 공용 fixture 의 기대값은 Python 시험(test_projection_hooks.py)도 같이 본다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HooksError, kiroCliHooks, kiroIdeFiles, kitScriptSuffixes, parseHooks, renderKiroCoordinator, settingsHooks, type HookDef } from "../src/projection/hooks";
import { loadSpec } from "../src/projection/spec";
import { REAL_TEMPLATES } from "./helpers";

const spec = loadSpec(REAL_TEMPLATES);
const map = spec.hookMap;
const FIXTURE = path.join(__dirname, "fixtures/hooks");
const fixtureHooks = parseHooks(fs.readFileSync(path.join(FIXTURE, "hooks.json"), "utf8"), map) as HookDef[];
const expected = JSON.parse(fs.readFileSync(path.join(FIXTURE, "expected.json"), "utf8")) as Record<string, any>;

const doc = (hooks: unknown[]): string => JSON.stringify({ schema: "harness-kit.hooks/v1", hooks });
const base = { id: "harness-x", event: "stop", script: "scripts/hooks/x.sh", timeoutSec: 5, owner: "kit" };

describe("공용 fixture(TS = Python 기대값)", () => {
  it.each([[[] as string[]], [["jira-workflow"]]])("modules %j: Claude · Codex · Kiro IDE · Kiro CLI · 역할 · 조율 에이전트", (modules) => {
    const want = expected[`modules:${modules.join(",")}`];
    expect(settingsHooks(fixtureHooks, "claude", map, modules)).toEqual(want.claude);
    expect(settingsHooks(fixtureHooks, "codex", map, modules)).toEqual(want.codex);
    expect(kiroIdeFiles(fixtureHooks, map, modules)).toEqual(want.kiroIde);
    expect(kiroCliHooks(fixtureHooks, map, modules)).toEqual(want.kiroCli);
    expect(kiroCliHooks(fixtureHooks, map, modules, true)).toEqual(want.kiroRole);
    expect(renderKiroCoordinator(spec, { PROJECT_SLUG: "acme", PROJECT_NAME: "Acme" }, kiroCliHooks(fixtureHooks, map, modules))).toBe(want.coordinator);
  });

  it("옛 킷 명령 꼬리 목록", () => {
    expect(kitScriptSuffixes(fixtureHooks, map)).toEqual(expected.suffixes);
  });

  it("거르기: 모듈 훅은 모듈을 켤 때만, harnesses · 이벤트가 없는 하네스는 뺀다(R2.3)", () => {
    const ids = (target: "claude" | "codex", modules: string[]): string[] => settingsHooks(fixtureHooks, target, map, modules).map((h) => h.id);
    expect(ids("claude", [])).not.toContain("harness-f-mod");
    expect(ids("claude", ["jira-workflow"])).toContain("harness-f-mod");
    expect(ids("codex", [])).not.toContain("harness-g-stop");
    expect(ids("codex", [])).not.toContain("harness-e-prompt");
    expect(ids("codex", [])).not.toContain("harness-h-end");
    // 쓰기 + 셸: 하네스 도구 이름을 이어 붙이고 겹치는 이름은 한 번만(Codex write 에 Bash 가 이미 있다)
    expect(settingsHooks(fixtureHooks, "codex", map, []).find((h) => h.id === "harness-b-guard")?.matcher).toBe("apply_patch|Bash");
    // Kiro CLI matcher 는 도구 하나 — 도구마다 항목
    expect(kiroCliHooks(fixtureHooks, map, []).preToolUse.filter((e) => String(e.command).includes("harness-b-guard")).map((e) => e.matcher)).toEqual(["write", "shell"]);
  });
});

describe("토큰(설치 때 치환하지 않는 {{kit:KEY}})", () => {
  it("특수 문자가 든 이름도 조율 에이전트 JSON 을 깨지 않는다", () => {
    const name = 'A&B | C\\D "q"';
    const text = renderKiroCoordinator(spec, { PROJECT_SLUG: "acme", PROJECT_NAME: name }, {});
    expect(JSON.parse(text).description).toBe(`${name} 작업 조율`);
    expect(JSON.parse(text).name).toBe("acme");
    expect(JSON.stringify(spec.kiroCoordinator)).toContain("{{kit:PROJECT_NAME}}");
    expect(JSON.stringify(spec)).not.toMatch(/\{\{(PROJECT_NAME|PROJECT_SLUG|PROTECTED_PATH)\}\}/);
  });
});

describe("hooks.json 검사", () => {
  it.each([
    ["schema", JSON.stringify({ schema: "x", hooks: [] }), /schema/],
    ["id 형식", doc([{ ...base, id: "kit-x" }]), /id 는 harness-/],
    ["id 중복", doc([base, base]), /두 번/],
    ["모르는 event", doc([{ ...base, event: "boot" }]), /모르는 event/],
    ["tools 는 도구 이벤트만", doc([{ ...base, tools: ["write"] }]), /pre-tool · post-tool/],
    ["모르는 도구", doc([{ ...base, event: "pre-tool", tools: ["net"] }]), /write · shell/],
    ["script 밖", doc([{ ...base, script: "scripts/../x.sh" }]), /scripts\//],
    ["script 절대", doc([{ ...base, script: "/bin/x.sh" }]), /scripts\//],
    ["timeout", doc([{ ...base, timeoutSec: 0 }]), /timeoutSec/],
    ["owner", doc([{ ...base, owner: "me" }]), /owner/],
    ["모르는 필드", doc([{ ...base, model: "opus" }]), /모르는 필드 model/],
    ["모델 환경변수", doc([{ ...base, env: { ANTHROPIC_MODEL: { claude: "x" } } }]), /모델 환경변수/],
    ["env 값", doc([{ ...base, env: { X: { claude: "a b" } } }]), /하네스 → 값/],
    ["모르는 하네스", doc([{ ...base, harnesses: ["vim"] }]), /harnesses/],
    ["JSON", "{ 깨짐", /해석할 수 없다/],
  ])("%s", (_name, text, pattern) => {
    expect(() => parseHooks(text, map)).toThrow(HooksError);
    expect(() => parseHooks(text, map)).toThrow(pattern);
  });

  it("없으면 null", () => {
    expect(parseHooks(null, map)).toBeNull();
  });
});

describe("킷 hooks.json(이 판)", () => {
  const kit = parseHooks(fs.readFileSync(path.join(REAL_TEMPLATES, "common/agents-root/hooks.json"), "utf8"), map) as HookDef[];

  it("스크립트가 템플릿에 있고, 세션 시작 출력 상한이 2,560이다(R5)", () => {
    for (const h of kit) expect(fs.existsSync(path.join(REAL_TEMPLATES, "common", h.script)), h.script).toBe(true);
    expect(kit.find((h) => h.event === "session-start")?.maxOutputBytes).toBe(2560);
    expect(kit.filter((h) => h.event === "session-start")).toHaveLength(1);
  });

  it("보호 훅은 floor, HK-17 의 SessionStart 등록 훅은 세션 시작 훅 안으로 합쳤다", () => {
    const floor = kit.filter((h) => h.floor).map((h) => h.id);
    expect(floor).toEqual(["harness-protect-sources", "harness-block-full-verify", "harness-protect-approvals", "harness-verify-gate"]);
    expect(kit.map((h) => h.id)).not.toContain("harness-session-register");
  });

  it("모든 하네스 명령이 디스패처를 거친다(R2)", () => {
    for (const target of ["claude", "codex"] as const) for (const h of settingsHooks(kit, target, map, [])) expect(String(h.hook.command)).toContain(`scripts/hooks/dispatch.sh`);
    for (const f of kiroIdeFiles(kit, map, [])) expect(f.text).toContain("dispatch.sh");
  });
});
