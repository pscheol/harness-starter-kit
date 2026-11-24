// HK-20b 모듈: notion add · remove, jira-workflow 템플릿(v2 키), multi-harness 파일 목록, 토큰 원칙. 가짜 도구 없이 실제 템플릿으로 돈다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { measureSession } from "../src/core/measure";
import { loadModule } from "../src/modules/declaration";
import { undeclaredTemplateFiles } from "../src/modules/doctor";
import { readTracker } from "../src/modules/jira/config";
import { lockEntries, readJsonFile, REAL_TEMPLATES } from "./helpers";
import { cli, installedRepo, makeBin } from "./modules-helpers";

const T = ["--templates", REAL_TEMPLATES];
const meta = (t: string): Record<string, any> => readJsonFile(path.join(t, ".agents/knots-sync.json"));

describe("notion 모듈(설계 10 §3.6)", () => {
  it("선언: 외부 도구가 없고 모든 파일이 선언돼 있다. init --modules all 에는 들어가지 않는다", () => {
    const m = loadModule(REAL_TEMPLATES, "notion");
    expect(m.requires.tools).toEqual([]);
    expect(undeclaredTemplateFiles(REAL_TEMPLATES, m)).toEqual([]);
    const layout = JSON.parse(fs.readFileSync(path.join(REAL_TEMPLATES, "layout.json"), "utf8")) as { modules: string[]; externalModules: string[] };
    expect(layout.modules).not.toContain("notion");
    expect(layout.externalModules).toContain("notion");
  });

  it("add notion 은 규칙 한 개와 설정 notion.writeBack=false 만 더하고, 세션에 붙는 훅은 없다. remove 로 킷 몫이 빠진다", async () => {
    const t = await installedRepo();
    const bin = makeBin({});
    const before = lockEntries(t).length;
    const load = (): number => measureSession(t, { harness: "claude", entries: lockEntries(t) as never, hookOwners: [] }).total;
    const loadBefore = load();
    const add = await cli(t, ["add", "notion", "--yes", ...T], bin);
    expect(add.code, add.stdout + add.stderr).toBe(0);
    expect(meta(t).modules).toContain("notion");
    expect(meta(t).notion).toEqual({ writeBack: false });
    const mine = lockEntries(t).filter((e) => e.layer === "optional/notion");
    expect(mine.map((e) => e.path)).toEqual([".agents/rules/notion-intake.md"]);
    expect(lockEntries(t).length - before).toBeLessThanOrEqual(2); // 원본 + claude 복사본
    // 토큰 원칙: paths 가 있는 규칙이라 세션마다 실리는 양이 늘지 않는다
    expect(load()).toBe(loadBefore);
    expect(fs.readFileSync(path.join(t, ".agents/rules/notion-intake.md"), "utf8")).not.toMatch(/NOTION_TOKEN\s*=/);
    const rm = await cli(t, ["remove", "notion", "--json", ...T], bin);
    expect(rm.code, rm.stdout + rm.stderr).toBe(0);
    expect(fs.existsSync(path.join(t, ".agents/rules/notion-intake.md"))).toBe(false);
    expect(meta(t).modules).not.toContain("notion");
  });
});

describe("jira-workflow 템플릿 v2", () => {
  it("설치한 issue-tracker.yml 이 읽히고 기본은 sync none · maxStatus verifying · 여덟 상태 TBD 다", async () => {
    const t = await installedRepo();
    const add = await cli(t, ["add", "jira-workflow", "--yes", ...T], makeBin({}));
    expect(add.code, add.stdout + add.stderr).toBe(0);
    const cfg = readTracker(t)!;
    expect(cfg.sync).toMatchObject({ method: "none", restTokenEnv: "JIRA_API_TOKEN", restUserEnv: "JIRA_USER_EMAIL" });
    expect(cfg.maxStatus).toBe("verifying");
    expect(cfg.statusMap).toEqual({});
    expect(cfg.missing).toContain("baseUrl");
    expect(cfg.issueTypes).toMatchObject({ feature: "Story", bug: "Bug" });
    expect(cfg.groupMap).toMatchObject({ po: "jira-po", ops: "jira-ops" });
    const text = fs.readFileSync(path.join(t, ".agents/issue-tracker.yml"), "utf8");
    expect(text).toContain("statusIds:");
    expect(text).toContain("transitionIds:");
    expect(text).toContain("agentBoundary:");
    // sync jira: 연결 설정이 비어 있어도 exit 0(none), 켜지 않았으면 꺼져 있다고 알린다
    const sync = await cli(t, ["sync", "jira"], makeBin({}));
    expect([sync.code, sync.stdout]).toEqual([0, expect.stringContaining("none")]);
    await cli(t, ["remove", "jira-workflow", ...T], makeBin({}));
    const off = await cli(t, ["sync", "jira"], makeBin({}));
    expect([off.code, off.stdout]).toEqual([0, expect.stringContaining("모듈이 꺼져 있다")]);
  });
});

describe("multi-harness 모듈 파일", () => {
  it("리포 간 조율 파일 · 검사 스크립트 · 가드 · 예외 목록을 깐다(선언 누락 없음)", async () => {
    const m = loadModule(REAL_TEMPLATES, "multi-harness");
    expect(undeclaredTemplateFiles(REAL_TEMPLATES, m)).toEqual([]);
    const t = await installedRepo();
    const add = await cli(t, ["add", "multi-harness", "--yes", ...T], makeBin({}));
    expect(add.code, add.stdout + add.stderr).toBe(0);
    const paths = lockEntries(t).filter((e) => e.layer === "optional/multi-harness").map((e) => e.path);
    for (const p of [".agents/rules/cross-repo.md", "scripts/harness/check_submodules.py", "scripts/guards/no-cross-domain-paths.sh", ".agents/guards/cross-domain-allow.txt", "tools/harness/sync.py", "tools/harness/gates.py"]) expect(paths).toContain(p);
    expect(fs.statSync(path.join(t, "scripts/guards/no-cross-domain-paths.sh")).mode & 0o100).not.toBe(0);
    expect(fs.statSync(path.join(t, "scripts/harness/check_submodules.py")).mode & 0o100).not.toBe(0);
  });
});
