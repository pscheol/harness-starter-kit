// add — 하네스 · v1 모듈을 켜고 그 몫만 깐다(HK-12 design §3, 설계 02 §3.3).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASIC_FILES,
  exists,
  filesOf,
  FIXTURE_ENV,
  freshInit,
  fixtureTemplates,
  installedFixture,
  json,
  LOCK_FILE,
  lockEntry,
  META_FILE,
  readJsonFile,
  readText,
  readTree,
  run,
  sha256Hex,
  writeJsonFile,
  writeTree,
} from "./helpers";

function opOf(j: Record<string, any>, p: string): Record<string, any> | undefined {
  return (j.ops as Record<string, any>[]).find((o) => o.path === p);
}

describe("add — 하네스 · 모듈", () => {
  it("하네스를 더하면 그 몫만 깔고 메타 · 매니페스트 · lock 에 더한다. 결과는 처음부터 둘을 깐 것과 같다(R12.1)", async () => {
    const { target, templates, cli } = await installedFixture();
    const r = await cli("add", ["codex", "--json", "--templates", templates], { env: FIXTURE_ENV, today: "2026-12-01" });
    expect(r.code, r.stdout).toBe(0);
    expect(r.stderr).toBe("");
    const j = json(r);
    expect(j).toMatchObject({ command: "add", dryRun: false, names: { harnesses: ["codex"], modules: [], already: [] } });
    expect(j.selection.after).toMatchObject({ agents: ["claude", "codex"], modules: [] });
    expect(j.counts.create).toBe(1);
    expect(opOf(j, ".codex/config.toml")).toMatchObject({ action: "create", owner: "kit", layer: "common" });
    expect(readText(target, ".codex/config.toml")).toBe("x = 1\n");
    const meta = readJsonFile(path.join(target, META_FILE));
    expect(meta).toMatchObject({ agents: ["claude", "codex"], modules: [], updatedAt: "2026-12-01", installedAt: "2026-11-23" });
    expect(readJsonFile(path.join(target, ".agents/harness.json")).agents).toEqual(["claude", "codex"]);
    expect(lockEntry(target, ".codex/config.toml")).toEqual({ path: ".codex/config.toml", op: "copy", owner: "kit", sha256: sha256Hex("x = 1\n"), layer: "common" });
    const fresh = await freshInit(templates, "claude,codex");
    expect(filesOf(target)).toEqual(filesOf(fresh));
    const again = await cli("add", ["codex", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(again.code).toBe(0);
    expect(json(again).names.already).toEqual(["codex"]);
    expect(json(again).counts.create).toBe(0);
  });

  it("모듈을 더하면 optional/<모듈> 레이어 몫을 깔고 meta.modules 에 더한다", async () => {
    const { target, templates, cli } = await installedFixture();
    const r = await cli("add", ["jira-workflow", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(j.names).toMatchObject({ harnesses: [], modules: ["jira-workflow"] });
    expect(readText(target, ".agents/rules/jira.md")).toBe("jira\n");
    expect(lockEntry(target, ".agents/rules/jira.md")).toMatchObject({ owner: "kit", layer: "optional/jira-workflow" });
    expect(readJsonFile(path.join(target, META_FILE)).modules).toEqual(["jira-workflow"]);
    expect(filesOf(target)).toEqual(filesOf(await freshInit(templates, "claude", "jira-workflow")));
  });

  it("이름은 쉼표 · 공백으로 여럿 받고 적은 순서를 지킨다", async () => {
    const { target, templates, cli } = await installedFixture();
    const r = await cli("add", ["kiro,cursor", "platform-guards", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(0);
    expect(json(r).names).toMatchObject({ harnesses: ["kiro", "cursor"], modules: ["platform-guards"] });
    expect(readJsonFile(path.join(target, META_FILE))).toMatchObject({ agents: ["claude", "kiro", "cursor"], modules: ["platform-guards"] });
    expect(exists(target, ".kiro/agents/acme.json")).toBe(true);
    expect(exists(target, ".cursor/commands/hx.md")).toBe(true);
  });

  it("겹치는 경로는 파일을 두고 lock 레이어만 새 이기는 판으로 바꾼다 — 내용은 다음 update 가 맞춘다", async () => {
    const { target, templates, cli } = await installedFixture();
    const guard = "scripts/guards/_template.sh";
    const r = await cli("add", ["platform-guards", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(0);
    expect(opOf(json(r), guard)).toMatchObject({ action: "relayer", layer: "optional/platform-guards" });
    expect(readText(target, guard)).toBe("common\n");
    expect(lockEntry(target, guard)).toMatchObject({ owner: "kit", sha256: sha256Hex("common\n"), layer: "optional/platform-guards" });
    const u = await run(["update", "--json", "--cwd", target, "--templates", templates], { env: FIXTURE_ENV });
    expect(u.code, u.stdout).toBe(0);
    expect(readText(target, guard)).toBe("module\n");
  });

  it("몫의 경로에 사람이 둔 파일은 건드리지 않고 owner user 로 적는다", async () => {
    const { target, templates, cli } = await installedFixture();
    writeTree(target, { ".codex/config.toml": "mine = true\n" });
    const r = await cli("add", ["codex", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(0);
    expect(opOf(json(r), ".codex/config.toml")).toMatchObject({ action: "skip-user" });
    expect(readText(target, ".codex/config.toml")).toBe("mine = true\n");
    expect(lockEntry(target, ".codex/config.toml")).toEqual({ path: ".codex/config.toml", op: "copy", owner: "user", sha256: null, layer: "common" });
  });

  it("이미 켠 이름은 그 몫에서 빠진 파일만 채운다. 다른 빠진 킷 파일은 repair 몫이다", async () => {
    const { target, templates, cli } = await installedFixture();
    fs.rmSync(path.join(target, ".claude/settings.json"));
    fs.rmSync(path.join(target, ".agents/rules/a.md"));
    const r = await cli("add", ["claude", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(j.names.already).toEqual(["claude"]);
    expect(opOf(j, ".claude/settings.json")).toMatchObject({ action: "restore" });
    expect(readText(target, ".claude/settings.json")).toBe("{}\n");
    expect(exists(target, ".agents/rules/a.md")).toBe(false);
    expect(r.stdout).not.toContain("a.md");
    expect(readJsonFile(path.join(target, META_FILE)).agents).toEqual(["claude"]);
  });

  it.each(["aidlc", "entire", "notion"])("%s 모듈은 exit 2 와 제공 단계 P22", async (name) => {
    const { cli, templates } = await installedFixture();
    const r = await cli("add", [name, "--templates", templates]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("P22");
    const j = await cli("add", [name, "--json", "--templates", templates]);
    expect(json(j).error.message).toContain("P22");
  });

  it("모르는 이름 · all · 빈 목록은 exit 2, 아무것도 쓰지 않는다", async () => {
    const { target, templates, cli } = await installedFixture();
    const before = readTree(target);
    for (const args of [["bogus"], ["all"], ["claude,bogus"], [","]]) {
      const r = await cli("add", [...args, "--templates", templates]);
      expect(r.code, args.join(" ")).toBe(2);
    }
    expect(readTree(target)).toEqual(before);
  });

  it("--dry-run 은 쓰지 않고 판정 · 종료 코드는 같다", async () => {
    const { target, templates, cli } = await installedFixture();
    const before = readTree(target);
    const r = await cli("add", ["codex", "kiro", "--dry-run", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(r.code).toBe(0);
    expect(json(r).dryRun).toBe(true);
    expect(json(r).counts.create).toBeGreaterThan(1);
    expect(readTree(target)).toEqual(before);
    const human = await cli("add", ["codex", "--dry-run", "--templates", templates], { env: FIXTURE_ENV });
    expect(human.stdout).toContain("dry-run");
    expect(readTree(target)).toEqual(before);
  });

  it("사람이 고친 매니페스트는 덮지 않고 .agents/harness.json.new 와 exit 4", async () => {
    const { target, templates, cli } = await installedFixture();
    const manifest = path.join(target, ".agents/harness.json");
    const mine = fs.readFileSync(manifest, "utf8").replace('"shared": []', '"shared": ["x"]');
    fs.writeFileSync(manifest, mine);
    const r = await cli("add", ["codex", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(4);
    expect(fs.readFileSync(manifest, "utf8")).toBe(mine);
    expect(readJsonFile(`${manifest}.new`).agents).toEqual(["claude", "codex"]);
    expect(json(r).conflicts).toEqual([{ path: ".agents/harness.json", new: ".agents/harness.json.new", diff: "diff -u .agents/harness.json .agents/harness.json.new" }]);
    expect(readJsonFile(path.join(target, META_FILE)).agents).toEqual(["claude", "codex"]);
  });

  it("v1 lock(TSV)은 v2 로 쓰고 원래 lock 을 .agents/state 에 둔다. 메타 kit.version 은 설치 값 그대로", async () => {
    const { target, templates, cli } = await installedFixture();
    const lock = readJsonFile(path.join(target, LOCK_FILE));
    const lines = ["# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path", "# pre-existing: -"];
    for (const e of lock.entries) lines.push(`${e.sha256 ?? "-"}\t${e.layer === "common" ? "common" : e.layer.replace(/^stacks\/([^/]+)\/arch\//, "$1/").replace(/^stacks\//, "")}\tcore\t${e.path}`);
    const v1 = `${lines.join("\n")}\n`;
    fs.writeFileSync(path.join(target, LOCK_FILE), v1);
    const meta = readJsonFile(path.join(target, META_FILE));
    writeJsonFile(path.join(target, META_FILE), { kitVersion: "1.0.8", domain: "backend", stack: "jvm", arch: "hexagonal", agents: ["claude"], modules: [], installedAt: "2026-10-01", updatedAt: "2026-10-01", tokens: meta.tokens, teamNote: "keep" });
    const r = await cli("add", ["codex", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(0);
    const after = readJsonFile(path.join(target, LOCK_FILE));
    expect(after).toMatchObject({ schema: "harness-kit.lock/v2", kit: { version: "1.0.8" } });
    expect(after.entries).toHaveLength(lock.entries.length + 1);
    expect(fs.readFileSync(path.join(target, ".agents/state/harness-kit.lock.v1.bak"), "utf8")).toBe(v1);
    expect(readJsonFile(path.join(target, META_FILE))).toMatchObject({ schema: "harness-kit/v2", kit: { version: "1.0.8" }, agents: ["claude", "codex"], teamNote: "keep" });
  });

  it("설치된 킷이 CLI 보다 새것이면 exit 3", async () => {
    const { target, templates, cli } = await installedFixture();
    const meta = readJsonFile(path.join(target, META_FILE));
    writeJsonFile(path.join(target, META_FILE), { ...meta, kit: { version: "99.0.0" } });
    const r = await cli("add", ["codex", "--templates", templates]);
    expect(r.code).toBe(3);
    expect(exists(target, ".codex/config.toml")).toBe(false);
  });

  it("모듈 템플릿 폴더가 없으면 exit 5", async () => {
    const files = { ...BASIC_FILES };
    delete files["optional/multi-harness/tools/harness/units.json"];
    const { cli } = await installedFixture({ files });
    const r = await cli("add", ["multi-harness", "--templates", fixtureTemplates(files)]);
    expect(r.code).toBe(5);
  });
});
