// repair — missing 되살리기, 고친 copy 는 두기(HK-11 design §4, 설계 02 §3.12).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASIC_FILES, fixtureTemplates, installedFixture, json, LOCK_FILE, lockEntries, patchLock, readJsonFile, readText, readTree, run, tmpDir, writeJsonFile } from "./helpers";

const A = ".agents/rules/a.md";

function opOf(j: Record<string, any>, p: string): Record<string, any> | undefined {
  return (j.ops as { path: string }[]).find((o) => o.path === p);
}

describe("repair", () => {
  it("지운 킷 파일을 되살리고, 뒤의 doctor --check 는 0(R5.1)", async () => {
    const { target, templates, cli } = await installedFixture();
    const original = readText(target, A);
    fs.rmSync(path.join(target, A));
    expect((await cli("doctor", ["--check"])).code).toBe(1);
    const r = await cli("repair", ["--json", "--templates", templates]);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stderr).toBe("");
    const j = json(r);
    expect(j).toMatchObject({ command: "repair", dryRun: false });
    expect(j.counts).toMatchObject({ restore: 1, "needs-update": 0, unrestorable: 0 });
    expect(opOf(j, A)).toMatchObject({ action: "restore" });
    expect(readText(target, A)).toBe(original);
    expect((await cli("doctor", ["--check"])).code).toBe(0);
  });

  it("사람이 고친 copy 파일은 건드리지 않는다", async () => {
    const { target, templates, cli } = await installedFixture();
    fs.appendFileSync(path.join(target, "AGENTS.md"), "사람 줄\n");
    fs.rmSync(path.join(target, A));
    const j = json(await cli("repair", ["--json", "--templates", templates]));
    expect(j.counts).toMatchObject({ restore: 1, drifted: 1 });
    expect(readText(target, "AGENTS.md")).toContain("사람 줄");
    expect(fs.existsSync(path.join(target, "AGENTS.md.new"))).toBe(false);
  });

  it("lock kit.version 이 CLI 와 다르면 되살리지 않고 update 를 안내, exit 4", async () => {
    const { target, templates, cli } = await installedFixture();
    const file = path.join(target, LOCK_FILE);
    writeJsonFile(file, { ...readJsonFile(file), kit: { version: "1.0.8", source: "plugin:harness-kit@1.0.8" } });
    fs.rmSync(path.join(target, A));
    const before = readTree(target);
    const r = await cli("repair", ["--json", "--templates", templates]);
    expect(r.code).toBe(4);
    const j = json(r);
    expect(opOf(j, A)).toMatchObject({ action: "needs-update" });
    expect(JSON.stringify(j)).toContain("harness-kit update");
    expect(readTree(target)).toEqual(before);
    const human = await cli("repair", ["--templates", templates]);
    expect(human.code).toBe(4);
    expect(human.stdout).toContain("update");
  });

  it("v1 lock 은 버전이 없으므로 missing 을 되살리지 않는다", async () => {
    const { target, templates, cli } = await installedFixture();
    const lines = ["# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path", ...lockEntries(target).map((e) => `${e.sha256}\tcommon\tcore\t${e.path}`)];
    fs.writeFileSync(path.join(target, LOCK_FILE), `${lines.join("\n")}\n`);
    fs.rmSync(path.join(target, A));
    const r = await cli("repair", ["--json", "--templates", templates]);
    expect(r.code).toBe(4);
    expect(opOf(json(r), A)).toMatchObject({ action: "needs-update" });
    expect(fs.readFileSync(path.join(target, LOCK_FILE), "utf8").startsWith("# harness-kit lock v1")).toBe(true);
  });

  it("판 번호가 같아도 킷 내용이 기록과 다르면 되살리지 않는다", async () => {
    const { target, cli } = await installedFixture();
    fs.rmSync(path.join(target, A));
    const other = fixtureTemplates({ ...BASIC_FILES, "common/agents-rules/a.md": "다른 내용\n" });
    const r = await cli("repair", ["--json", "--templates", other]);
    expect(r.code).toBe(4);
    expect(opOf(json(r), A)).toMatchObject({ action: "needs-update" });
    expect(fs.existsSync(path.join(target, A))).toBe(false);
  });

  it("킷에 없는 항목의 missing 은 unrestorable, exit 4", async () => {
    const { target, templates, cli } = await installedFixture();
    patchLock(target, { "extra/gone.md": { op: "copy", owner: "kit", sha256: "0".repeat(64), layer: "common" } });
    const r = await cli("repair", ["--json", "--templates", templates]);
    expect(r.code).toBe(4);
    expect(opOf(json(r), "extra/gone.md")).toMatchObject({ action: "unrestorable" });
  });

  it("--dry-run · 할 일 없음은 아무것도 쓰지 않는다", async () => {
    const { target, templates, cli } = await installedFixture();
    const clean = readTree(target);
    const none = await cli("repair", ["--json", "--templates", templates]);
    expect(none.code).toBe(0);
    expect(json(none).counts.restore).toBe(0);
    expect(readTree(target)).toEqual(clean);
    fs.rmSync(path.join(target, A));
    const before = readTree(target);
    const dry = await cli("repair", ["--json", "--dry-run", "--templates", templates]);
    expect(dry.code).toBe(0);
    expect(json(dry)).toMatchObject({ dryRun: true, counts: { restore: 1 } });
    expect(readTree(target)).toEqual(before);
  });

  it("--only 로 고를 종류를 정하고, 모르는 종류는 exit 2", async () => {
    const { target, templates, cli } = await installedFixture();
    fs.rmSync(path.join(target, A));
    const drifted = await cli("repair", ["--json", "--only", "drifted", "--templates", templates]);
    expect(drifted.code).toBe(0);
    expect(json(drifted).counts.restore).toBe(0);
    expect(fs.existsSync(path.join(target, A))).toBe(false);
    expect((await cli("repair", ["--only", "stale,merge", "--templates", templates])).code).toBe(0);
    expect((await cli("repair", ["--only", "nope", "--templates", templates])).code).toBe(2);
    expect((await cli("repair", ["--json", "--only", "missing", "--templates", templates])).code).toBe(0);
    expect(fs.existsSync(path.join(target, A))).toBe(true);
  });

  it("설치 안 됨은 exit 3, 모르는 op 항목은 exit 3(mirror · render · merge 는 HK-13 뒤 받는다)", async () => {
    expect((await run(["repair", "--cwd", tmpDir()])).code).toBe(3);
    const { target, templates, cli } = await installedFixture();
    patchLock(target, { ".claude/settings.json": { op: "symlink", owner: "kit", from: ".agents/x.md" } });
    fs.rmSync(path.join(target, A));
    const r = await cli("repair", ["--json", "--templates", templates]);
    expect(r.code).toBe(3);
    expect(json(r).error.message).toMatch(/모른다|지원하지 않는다/);
    expect(fs.existsSync(path.join(target, A))).toBe(false);
  });
});
