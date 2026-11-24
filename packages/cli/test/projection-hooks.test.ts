// 훅 원본 hooks.json → 하네스별 훅(HK-24 design §2 · §3, 03 §3.4). 공용 fixture 의 기대값은 Python 시험(test_projection_hooks.py)도 같이 본다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOOR_HOOKS } from "../src/core/floor";
import { hookDocPaths, HooksError, kiroCliHooks, kiroIdeFiles, kitScriptSuffixes, mergeHookDocs, parseHooks, renderKiroCoordinator, settingsHooks, type HookDef } from "../src/projection/hooks";
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
    // HK-15: worktree 이벤트는 Claude 에만 있다(WorktreeCreate · WorktreeRemove)
    const claudeWt = settingsHooks(fixtureHooks, "claude", map, []).filter((h) => h.id.includes("-wt-"));
    expect(claudeWt.map((h) => [h.id, h.event])).toEqual([["harness-i-wt-create", "WorktreeCreate"], ["harness-j-wt-remove", "WorktreeRemove"]]);
    expect(ids("codex", []).filter((id) => id.includes("-wt-"))).toEqual([]);
    expect(kiroIdeFiles(fixtureHooks, map, []).some((f) => f.path.includes("-wt-"))).toBe(false);
    expect(JSON.stringify(kiroCliHooks(fixtureHooks, map, []))).not.toContain("harness-i-wt-create");
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

describe("주인별 훅 파일 합치기(HK-14 design §4)", () => {
  const kitText = fs.readFileSync(path.join(REAL_TEMPLATES, "common/agents-root/hooks.json"), "utf8");
  const one = (hooks: Record<string, unknown>[]): string => JSON.stringify({ schema: "harness-kit.hooks/v1", hooks });
  const packHook = { id: "harness-acme-scan", event: "pre-tool", tools: ["write"], script: "scripts/hooks/acme-scan.sh", timeoutSec: 10, owner: "pack:acme" };

  it("읽는 순서: 이름 순, project.json 마지막, 숨김 · json 아닌 파일은 뺀다", () => {
    expect(hookDocPaths(["project.json", "zeta.json", "acme.json", ".x.json", "notes.md"])).toEqual([".agents/hooks.d/acme.json", ".agents/hooks.d/zeta.json", ".agents/hooks.d/project.json"]);
  });

  it("팩 훅은 뒤에 붙고, 킷 · 다른 팩과 같은 id 는 오류", () => {
    const r = mergeHookDocs([{ rel: ".agents/hooks.json", text: kitText }, { rel: ".agents/hooks.d/acme.json", text: one([packHook]) }], map, FLOOR_HOOKS);
    expect(r.hooks.at(-1)?.id).toBe("harness-acme-scan");
    expect(() => mergeHookDocs([{ rel: ".agents/hooks.json", text: kitText }, { rel: ".agents/hooks.d/acme.json", text: one([{ ...packHook, id: "harness-session-idle" }]) }], map, FLOOR_HOOKS)).toThrow(/다른 층에도/);
    expect(() =>
      mergeHookDocs([{ rel: ".agents/hooks.json", text: kitText }, { rel: ".agents/hooks.d/a.json", text: one([packHook]) }, { rel: ".agents/hooks.d/b.json", text: one([packHook]) }], map, FLOOR_HOOKS),
    ).toThrow(/harness-acme-scan/);
  });

  it("project.json 은 같은 id 를 덮지만 하한 훅은 덮지 못한다(floor-override)", () => {
    const docs = [
      { rel: ".agents/hooks.json", text: kitText },
      { rel: ".agents/hooks.d/project.json", text: one([{ ...base, id: "harness-session-idle", event: "stop", timeoutSec: 30, owner: "user" }, { ...base, id: "harness-verify-gate", owner: "user" }, { ...base, id: "harness-my-lint", owner: "user" }]) },
    ];
    const r = mergeHookDocs(docs, map, FLOOR_HOOKS);
    expect(r.hooks.find((h) => h.id === "harness-session-idle")?.timeoutSec).toBe(30);
    expect(r.hooks.find((h) => h.id === "harness-verify-gate")?.script).toBe("scripts/hooks/verify-gate.sh");
    expect(r.hooks.at(-1)?.id).toBe("harness-my-lint");
    expect(r.findings).toEqual([{ kind: "floor-override", severity: "error", path: ".agents/hooks.d/project.json", hint: "하한 훅 harness-verify-gate 는 프로젝트가 덮지 못한다 — 이 항목은 쓰지 않았다" }]);
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
