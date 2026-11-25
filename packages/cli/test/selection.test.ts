import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CliError } from "../src/core/errors";
import { loadLayout } from "../src/core/layout";
import { detectHarnesses, resolveSelection, type SelectionInput } from "../src/core/selection";
import { REAL_TEMPLATES, tmpDir } from "./helpers";

const layout = loadLayout(REAL_TEMPLATES);

function sel(input: SelectionInput, env: Record<string, string> = {}, target = tmpDir()) {
  return resolveSelection(layout, REAL_TEMPLATES, input, { target, env });
}

function usage(fn: () => unknown): CliError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(CliError);
    return err as CliError;
  }
  throw new Error("CliError 가 나야 한다");
}

describe("선택값", () => {
  it("기본값: jvm · hexagonal · backend · claude · 모듈 없음", () => {
    expect(sel({})).toEqual({
      stack: "jvm",
      arch: "hexagonal",
      domain: "backend",
      lang: null,
      agents: ["claude"],
      agentsOrigin: "default",
      modules: [],
    });
  });

  it("스택이 변형 · 도메인 기본값을 정한다", () => {
    expect(sel({ stack: "web" })).toMatchObject({ arch: "nextjs-app", domain: "frontend" });
    expect(sel({ stack: "electron" })).toMatchObject({ arch: "main-renderer", domain: "frontend" });
    expect(sel({ stack: "go", domain: "frontend" })).toMatchObject({ arch: "hexagonal", domain: "frontend" });
  });

  it.each<[SelectionInput, string]>([
    [{ stack: "rust" }, "jvm"],
    [{ stack: "jvm", arch: "onion" }, "hexagonal"],
    [{ domain: "mobile" }, "frontend"],
    [{ stack: "python", lang: "kotlin" }, "jvm"],
    [{ stack: "jvm", lang: "scala" }, "kotlin"],
    [{ agents: "claude,vim" }, "vim"],
    [{ agents: "" }, "all"],
    [{ agents: " , " }, "all"],
    [{ modules: "jira-workflow,notion" }, "notion"],
    [{ agents: "bogus,all" }, "bogus"],
    [{ modules: "none,bogus" }, "bogus"],
  ])("%j 는 exit 2 와 가능한 값을 낸다", (input, mention) => {
    const err = usage(() => sel(input));
    expect(err.code).toBe(2);
    expect(`${err.message} ${err.hint ?? ""}`).toContain(mention);
  });

  it("하네스 목록: 적은 순서 · 중복 제거 · all", () => {
    expect(sel({ agents: "kiro, claude kiro" }).agents).toEqual(["kiro", "claude"]);
    expect(sel({ agents: "all" }).agents).toEqual(["claude", "codex", "cursor", "kiro"]);
    expect(sel({ agents: "codex" }).agentsOrigin).toBe("flag");
  });

  it("모듈 목록: all · none · 적은 순서", () => {
    expect(sel({ modules: "all" }).modules).toEqual(["jira-workflow", "multi-harness", "ci"]);
    expect(sel({ modules: "none" }).modules).toEqual([]);
    expect(sel({ modules: "multi-harness,jira-workflow" }).modules).toEqual(["multi-harness", "jira-workflow"]);
  });

  it("없앤 모듈 platform-guards 는 오류가 아니라 retiredModules 로 받고 뺀다(HK-25 R2)", () => {
    const s = sel({ modules: "platform-guards,jira-workflow" });
    expect(s.modules).toEqual(["jira-workflow"]);
    expect(s.retiredModules).toEqual(["platform-guards"]);
    expect(sel({ modules: "platform-guards" }).modules).toEqual([]);
    expect(sel({ modules: "jira-workflow" }).retiredModules).toBeUndefined();
  });

  it("lang 은 jvm 에서만 받는다", () => {
    expect(sel({ stack: "jvm", lang: "java" }).lang).toBe("java");
  });
});

describe("하네스 감지", () => {
  it("대상의 하네스 폴더가 이긴다", () => {
    const target = tmpDir();
    fs.mkdirSync(path.join(target, ".codex"));
    fs.mkdirSync(path.join(target, ".kiro"));
    expect(detectHarnesses(layout, target, { CLAUDECODE: "1" })).toEqual(["codex", "kiro"]);
    expect(sel({}, { CLAUDECODE: "1" }, target)).toMatchObject({ agents: ["codex", "kiro"], agentsOrigin: "detected" });
  });

  it("폴더가 없으면 실행 환경 변수를 본다", () => {
    expect(detectHarnesses(layout, tmpDir(), { CLAUDECODE: "1", KIRO_HOME: "/x" })).toEqual(["claude", "kiro"]);
    expect(detectHarnesses(layout, tmpDir(), { CLAUDECODE: "" })).toEqual([]);
  });
});
