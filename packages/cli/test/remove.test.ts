// remove — 하네스 · v1 모듈을 끄고 킷 소유 · 미수정 몫만 지운다(HK-12 design §4, 설계 02 §3.3).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exists, filesOf, FIXTURE_ENV, freshInit, fixtureTemplates, BASIC_FILES, json, lockEntry, META_FILE, readJsonFile, readText, readTree, run, sha256Hex } from "./helpers";

async function installed(agents: string, modules = "none") {
  const templates = fixtureTemplates(BASIC_FILES);
  const target = await freshInit(templates, agents, modules);
  const cli = (args: string[]) => run(["remove", "--cwd", target, "--templates", templates, ...args], { env: FIXTURE_ENV, today: "2026-12-02" });
  return { templates, target, cli };
}

function opOf(j: Record<string, any>, p: string): Record<string, any> | undefined {
  return (j.ops as Record<string, any>[]).find((o) => o.path === p);
}

describe("remove — 하네스 · 모듈", () => {
  it("하네스를 빼면 그 몫의 미수정 파일 · 빈 폴더를 지우고 메타 · 매니페스트 · lock 에서 뺀다. 결과는 처음부터 뺀 설치와 같다(R12.2)", async () => {
    const { target, templates, cli } = await installed("claude,codex");
    const r = await cli(["codex", "--json"]);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stderr).toBe("");
    const j = json(r);
    expect(j).toMatchObject({ command: "remove", dryRun: false, names: { harnesses: ["codex"], modules: [], notOn: [] } });
    expect(opOf(j, ".codex/config.toml")).toMatchObject({ action: "delete" });
    expect(exists(target, ".codex")).toBe(false);
    expect(lockEntry(target, ".codex/config.toml")).toBeUndefined();
    expect(readJsonFile(path.join(target, META_FILE))).toMatchObject({ agents: ["claude"], updatedAt: "2026-12-02" });
    expect(readJsonFile(path.join(target, ".agents/harness.json")).agents).toEqual(["claude"]);
    expect(filesOf(target)).toEqual(filesOf(await freshInit(templates, "claude")));
  });

  it("고친 파일은 남기고 목록과 exit 4, lock 은 owner user 로 바꾼다", async () => {
    const { target, cli } = await installed("claude,cursor");
    fs.appendFileSync(path.join(target, ".cursor/commands/hx.md"), "사람 줄\n");
    const r = await cli(["cursor", "--json"]);
    expect(r.code, r.stdout).toBe(4);
    const j = json(r);
    expect(opOf(j, ".cursor/commands/hx.md")).toMatchObject({ action: "keep-modified" });
    expect(j.keep).toEqual([".cursor/commands/hx.md"]);
    expect(readText(target, ".cursor/commands/hx.md")).toBe("cursor\n사람 줄\n");
    expect(lockEntry(target, ".cursor/commands/hx.md")).toEqual({ path: ".cursor/commands/hx.md", op: "copy", owner: "user", sha256: null, layer: "common" });
    expect(readJsonFile(path.join(target, META_FILE)).agents).toEqual(["claude"]);
    const human = await cli(["kiro"]);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("켜져 있지 않다");
  });

  it("지우는 파일 옆 .new 도 지운다", async () => {
    const { target, cli } = await installed("claude,codex");
    fs.writeFileSync(path.join(target, ".codex/config.toml.new"), "새 판\n");
    const r = await cli(["codex", "--json"]);
    expect(r.code, r.stdout).toBe(0);
    expect(exists(target, ".codex")).toBe(false);
  });

  it("모듈을 빼면 겹치던 경로는 앞 레이어(common) 판으로 돌아간다. 고친 파일이면 .new 와 exit 4", async () => {
    const guard = "scripts/guards/_template.sh";
    const a = await installed("claude", "platform-guards,jira-workflow");
    expect(readText(a.target, guard)).toBe("module\n");
    const r = await a.cli(["platform-guards", "--json"]);
    expect(r.code, r.stdout).toBe(0);
    expect(opOf(json(r), guard)).toMatchObject({ action: "update", layer: "common" });
    expect(readText(a.target, guard)).toBe("common\n");
    expect(lockEntry(a.target, guard)).toMatchObject({ owner: "kit", layer: "common", sha256: sha256Hex("common\n") });
    expect(readJsonFile(path.join(a.target, META_FILE)).modules).toEqual(["jira-workflow"]);
    expect(filesOf(a.target)).toEqual(filesOf(await freshInit(a.templates, "claude", "jira-workflow")));

    const b = await installed("claude", "platform-guards");
    fs.appendFileSync(path.join(b.target, guard), "사람 줄\n");
    const rb = await b.cli(["platform-guards", "--json"]);
    expect(rb.code, rb.stdout).toBe(4);
    expect(readText(b.target, guard)).toBe("module\n사람 줄\n");
    expect(readText(b.target, `${guard}.new`)).toBe("common\n");
    expect(json(rb).conflicts.map((c: { path: string }) => c.path)).toEqual([guard]);
  });

  it("add 뒤 remove 는 처음 설치와 같은 트리로 돌아간다", async () => {
    const { target, templates } = await installed("claude");
    const before = filesOf(target);
    expect((await run(["add", "kiro", "cursor", "jira-workflow", "--cwd", target, "--templates", templates], { env: FIXTURE_ENV })).code).toBe(0);
    expect(filesOf(target)).not.toEqual(before);
    const r = await run(["remove", "kiro", "cursor", "jira-workflow", "--cwd", target, "--templates", templates, "--json"], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(0);
    expect(filesOf(target)).toEqual(before);
    expect(exists(target, ".kiro")).toBe(false);
  });

  it("하네스를 모두 빼면 exit 2(uninstall 안내), 켜지 않은 이름은 경고만 한다", async () => {
    const { target, cli } = await installed("claude");
    const before = readTree(target);
    const all = await cli(["claude"]);
    expect(all.code).toBe(2);
    expect(all.stderr).toContain("uninstall");
    const off = await cli(["codex", "--json"]);
    expect(off.code).toBe(0);
    expect(json(off).names.notOn).toEqual(["codex"]);
    expect(readTree(target)).toEqual(before);
  });

  it("--dry-run 은 쓰지 않고 판정 · 종료 코드는 같다", async () => {
    const { target, cli } = await installed("claude,cursor");
    fs.appendFileSync(path.join(target, ".cursor/commands/hx.md"), "사람 줄\n");
    const before = readTree(target);
    const r = await cli(["cursor", "--dry-run", "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).dryRun).toBe(true);
    expect(readTree(target)).toEqual(before);
  });

  it.each(["aidlc", "entire", "notion", "bogus"])("%s 는 exit 2", async (name) => {
    const { cli } = await installed("claude,codex");
    const r = await cli([name]);
    expect(r.code).toBe(2);
    if (name !== "bogus") expect(r.stderr).toContain("P22");
  });
});
