// uninstall — 킷 소유 · 미수정 파일만 지운다(HK-11 design §5, 설계 02 §3.13).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exists, installedFixture, json, LOCK_FILE, lockEntries, META_FILE, patchLock, readText, readTree, run, tmpDir } from "./helpers";

const A = ".agents/rules/a.md";
const PRE = { "notes/mine.md": "사람 메모\n", "AGENTS.md": "# 손으로 쓴 AGENTS\n" };

function git(cwd: string, ...args: string[]): { status: number | null; out: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: r.status, out: (r.stdout ?? "").trim() };
}

describe("uninstall", () => {
  it("고치지 않은 킷 파일 · 매니페스트 · 메타 · lock 을 지우고 사람 파일만 남긴다, 빈 폴더도 지운다(R6.1)", async () => {
    const { target, cli } = await installedFixture({ pre: PRE });
    const kitCount = lockEntries(target).filter((e) => e.owner === "kit").length;
    const r = await cli("uninstall", ["--yes", "--json"]);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stderr).toBe("");
    const j = json(r);
    expect(j).toMatchObject({ command: "uninstall", dryRun: false });
    expect(j.counts["keep-modified"]).toBe(0);
    expect(j.counts["keep-user"]).toBe(1);
    expect(j.counts.delete).toBe(kitCount + 3);
    expect([...readTree(target).keys()].sort()).toEqual(["AGENTS.md", "notes/mine.md"]);
    expect(readText(target, "AGENTS.md")).toBe(PRE["AGENTS.md"]);
    for (const d of [".agents", ".claude", "scripts"]) expect(exists(target, d)).toBe(false);
    expect(fs.existsSync(target)).toBe(true);
  });

  it("고친 킷 파일은 남기고 목록과 exit 4, update 가 둔 .new 는 지운다", async () => {
    const { target, cli } = await installedFixture();
    fs.appendFileSync(path.join(target, A), "사람 줄\n");
    fs.writeFileSync(path.join(target, `${A}.new`), "새 판\n");
    fs.writeFileSync(path.join(target, "AGENTS.md.new"), "새 판\n");
    const r = await cli("uninstall", ["--yes", "--json"]);
    expect(r.code).toBe(4);
    const j = json(r);
    expect(j.ops.filter((o: { action: string }) => o.action === "keep-modified").map((o: { path: string }) => o.path)).toEqual([A]);
    expect(readText(target, A)).toContain("사람 줄");
    expect(exists(target, `${A}.new`)).toBe(false);
    expect(exists(target, "AGENTS.md.new")).toBe(false);
    expect([...readTree(target).keys()]).toEqual([A]);
    const human = await run(["uninstall", "--yes", "--cwd", target]);
    expect(human.code).toBe(3);
  });

  it("사람 출력도 남긴 파일 목록을 낸다", async () => {
    const { target, cli } = await installedFixture();
    fs.appendFileSync(path.join(target, A), "사람 줄\n");
    const r = await cli("uninstall", ["--yes"]);
    expect(r.code).toBe(4);
    expect(r.stdout).toContain(A);
  });

  it("--keep-state 는 메타 · lock 을 둔다", async () => {
    const { target, cli } = await installedFixture();
    const r = await cli("uninstall", ["--yes", "--keep-state"]);
    expect(r.code, r.stdout).toBe(0);
    expect([...readTree(target).keys()].sort()).toEqual([LOCK_FILE, META_FILE].sort());
  });

  it("TTY 가 아니거나 --json 이면 --yes 가 있어야 지운다(exit 2, 아무것도 지우지 않는다)", async () => {
    const { target, cli } = await installedFixture();
    const before = readTree(target);
    const plain = await cli("uninstall");
    expect(plain.code).toBe(2);
    expect(plain.stderr).toContain("--yes");
    const j = await cli("uninstall", ["--json"]);
    expect(j.code).toBe(2);
    expect(json(j).error.code).toBe(2);
    const tty = await cli("uninstall", ["--json"], { isTTY: true, answers: ["y"] });
    expect(tty.code).toBe(2);
    expect(readTree(target)).toEqual(before);
  });

  it("TTY 에서는 지울 목록을 보이고 확인을 받는다 — 아니오면 130", async () => {
    const { target, cli } = await installedFixture();
    const before = readTree(target);
    const no = await cli("uninstall", [], { isTTY: true, answers: ["n"] });
    expect(no.code).toBe(130);
    expect(no.stderr).toContain(A);
    expect(readTree(target)).toEqual(before);
    const yes = await cli("uninstall", [], { isTTY: true, answers: ["y"] });
    expect(yes.code, yes.stdout + yes.stderr).toBe(0);
    expect(readTree(target).size).toBe(0);
  });

  it("--dry-run 은 지울 목록만 내고 쓰지 않는다, 고친 파일이 있으면 exit 4", async () => {
    const { target, cli } = await installedFixture();
    fs.appendFileSync(path.join(target, A), "사람 줄\n");
    const before = readTree(target);
    const r = await cli("uninstall", ["--dry-run", "--json"]);
    expect(r.code).toBe(4);
    const j = json(r);
    expect(j.dryRun).toBe(true);
    expect(j.ops.some((o: { path: string; action: string }) => o.path === "AGENTS.md" && o.action === "delete")).toBe(true);
    expect(readTree(target)).toEqual(before);
  });

  it("core.hooksPath 가 scripts/git-hooks 면 지우고, 다른 값은 둔다", async () => {
    const a = await installedFixture();
    expect(git(a.target, "init", "-q").status).toBe(0);
    git(a.target, "config", "--local", "core.hooksPath", "scripts/git-hooks");
    const r = await a.cli("uninstall", ["--yes", "--json"]);
    expect(r.code, r.stdout).toBe(0);
    expect(json(r).gitHooks.status).toBe("unset");
    expect(git(a.target, "config", "--local", "--get", "core.hooksPath").status).toBe(1);
    const b = await installedFixture();
    git(b.target, "init", "-q");
    git(b.target, "config", "--local", "core.hooksPath", "other/hooks");
    const k = await b.cli("uninstall", ["--yes", "--json"]);
    expect(json(k).gitHooks.status).toBe("kept");
    expect(git(b.target, "config", "--local", "--get", "core.hooksPath").out).toBe("other/hooks");
    const c = await installedFixture();
    expect(json(await c.cli("uninstall", ["--yes", "--json"])).gitHooks.status).toBe("none");
  });

  it("user · external 항목은 남기고, B 를 모르는 항목(v1 '-')은 고친 파일로 남긴다", async () => {
    const { target, cli } = await installedFixture();
    patchLock(target, { [A]: { op: "none", owner: "external:aidlc", sha256: undefined }, "AGENTS.md": { sha256: null } });
    const r = await cli("uninstall", ["--yes", "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).counts).toMatchObject({ "keep-external": 1, "keep-modified": 1 });
    expect([...readTree(target).keys()].sort()).toEqual([A, "AGENTS.md"]);
  });

  it("설치 안 됨 · lock 없음 · 모르는 op 항목은 exit 3(mirror · render · merge 는 HK-13 뒤 받는다)", async () => {
    expect((await run(["uninstall", "--yes", "--cwd", tmpDir()])).code).toBe(3);
    const a = await installedFixture();
    fs.rmSync(path.join(a.target, LOCK_FILE));
    expect((await a.cli("uninstall", ["--yes"])).code).toBe(3);
    const b = await installedFixture();
    patchLock(b.target, { ".claude/settings.json": { op: "symlink", owner: "kit", keys: ["hooks.Stop:x"] } });
    const before = readTree(b.target);
    const r = await b.cli("uninstall", ["--yes", "--json"]);
    expect(r.code).toBe(3);
    expect(json(r).error.message).toMatch(/모른다|지원하지 않는다/);
    expect(readTree(b.target)).toEqual(before);
  });
});
