// 표시 줄 없는 v1 lock(v1.0.8 이하) — 미리 있던 파일과 킷 파일을 가리지 못한다(HK-12 R12.6, design §7).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLockText } from "../src/core/lock";
import { BASIC_FILES, exists, FIXTURE_ENV, fixtureTemplates, installedFixture, json, LOCK_FILE, lockEntry, readJsonFile, readText, run, sha256Hex } from "./helpers";

const HEADER = "# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path";
const MARK = "# pre-existing: -";
const MINE = "# 손으로 쓴 AGENTS\n";
const A = ".agents/rules/a.md";

function label(layer: string): string {
  return layer.replace(/^stacks\/([^/]+)\/arch\//, "$1/").replace(/^stacks\//, "").replace(/^domains\//, "").replace(/^optional\//, "mod/");
}

/**
 * v1 setup.sh 가 미리 있던 AGENTS.md 를 건너뛰고 그 파일 해시를 lock 에 적은 리포를 흉내 낸다.
 * mark 면 이 판 setup.sh(표시 줄 + 미리 있던 파일은 '-')다.
 */
async function v1Install(mark: boolean) {
  const fx = await installedFixture();
  fs.writeFileSync(path.join(fx.target, "AGENTS.md"), MINE);
  const lock = readJsonFile(path.join(fx.target, LOCK_FILE));
  const lines = mark ? [HEADER, MARK] : [HEADER];
  for (const e of lock.entries) {
    const sha = e.path === "AGENTS.md" ? (mark ? "-" : sha256Hex(MINE)) : e.sha256;
    lines.push(`${sha}\t${label(e.layer)}\tcore\t${e.path}`);
  }
  fs.writeFileSync(path.join(fx.target, LOCK_FILE), `${lines.join("\n")}\n`);
  return fx;
}

/** 새 킷: a.md 를 바꾼다. */
function newKit(): string {
  return fixtureTemplates({ ...BASIC_FILES, "common/agents-rules/a.md": "ns={{PACKAGE_NS}} lang={{PRIMARY_LANGUAGE}} v2\n" });
}

describe("v1 lock 표시 줄", () => {
  it("둘째 줄 '# pre-existing: -' 가 없으면 가리지 못한 lock 이다", () => {
    const body = "-\tcommon\tcore\tAGENTS.md\n";
    expect(parseLockText(`${HEADER}\n${body}`)).toMatchObject({ format: "v1", ambiguous: true });
    expect(parseLockText(`${HEADER}\n${MARK}\n${body}`)).toMatchObject({ format: "v1", ambiguous: false });
    expect(parseLockText('{"schema": "harness-kit.lock/v2", "entries": []}')).toMatchObject({ format: "v2", ambiguous: false });
  });
});

describe("update — 표시 줄 없는 v1 lock", () => {
  it("sha(C) = B ≠ sha(D) 는 덮지 않는다 — 문서는 킷 판 + 사람 줄, .agents/rules 는 새 판, 원본은 merge-backup(HK-25 R1)", async () => {
    const { target, cli } = await v1Install(false);
    const r = await cli("update", ["--json", "--templates", newKit()]);
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(readText(target, "AGENTS.md")).toBe(`# Acme\n<!-- harness-kit: 설치 전 내용(병합) -->\n${MINE}<!-- /harness-kit -->\n`);
    expect(exists(target, "AGENTS.md.new") || exists(target, `${A}.new`)).toBe(false);
    expect(readText(target, A)).toContain("v2");
    const ops = new Map((j.ops as { path: string; action: string; reason?: string }[]).map((o) => [o.path, o]));
    expect(ops.get("AGENTS.md")).toMatchObject({ action: "merge", reason: expect.stringContaining("v1 lock") });
    expect(ops.get(A)).toMatchObject({ action: "update", merge: "kit" });
    expect(lockEntry(target, "AGENTS.md")).toMatchObject({ owner: "kit", sha256: sha256Hex("# Acme\n") });
    expect(lockEntry(target, A)).toMatchObject({ owner: "kit", sha256: sha256Hex(readText(target, A)) });
    expect(lockEntry(target, ".agents/rules/tech.md")?.sha256).toBe(sha256Hex("jvm Gradle\n"));
    const again = json(await cli("update", ["--json", "--templates", newKit()]));
    expect(again.ops.find((o: { path: string }) => o.path === A)).toBeUndefined();
    expect(again.ops.find((o: { path: string }) => o.path === "AGENTS.md")).toMatchObject({ action: "conflict" });
    expect(readText(target, "AGENTS.md")).toContain(MINE);
  });

  it("표시 줄이 있으면 킷 파일은 그대로 update 하고, '-' 인 미리 있던 파일만 .new", async () => {
    const { target, cli } = await v1Install(true);
    const r = await cli("update", ["--json", "--templates", newKit()]);
    expect(r.code, r.stdout).toBe(4);
    expect(readText(target, A)).toContain("v2");
    expect(exists(target, `${A}.new`)).toBe(false);
    expect(readText(target, "AGENTS.md")).toBe(MINE);
    expect(json(r).conflicts.map((c: { path: string }) => c.path)).toEqual(["AGENTS.md"]);
  });

  it("--prune 은 가리지 못한 orphan 을 지우지 않는다", async () => {
    const files = { ...BASIC_FILES, "common/root/NOTES.md": "킷 메모\n" };
    const fx = await installedFixture({ files });
    fs.writeFileSync(path.join(fx.target, "NOTES.md"), "사람 메모\n");
    const lock = readJsonFile(path.join(fx.target, LOCK_FILE));
    const lines = [HEADER, ...lock.entries.map((e: Record<string, string>) => `${e.path === "NOTES.md" ? sha256Hex("사람 메모\n") : e.sha256}\t${label(e.layer)}\tcore\t${e.path}`)];
    fs.writeFileSync(path.join(fx.target, LOCK_FILE), `${lines.join("\n")}\n`);
    const r = await fx.cli("update", ["--json", "--prune", "--templates", fixtureTemplates(BASIC_FILES)]);
    expect(r.code, r.stdout).toBe(4);
    expect(readText(fx.target, "NOTES.md")).toBe("사람 메모\n");
    expect(json(r).ops.find((o: { path: string }) => o.path === "NOTES.md")).toMatchObject({ action: "orphan", modified: true });
  });
});

describe("uninstall · add — 표시 줄 없는 v1 lock", () => {
  it("uninstall 은 미리 있던 파일(sha(C) = B ≠ sha(D))을 남기고, 킷 판과 같은 파일은 지운다", async () => {
    const { target, templates, cli } = await v1Install(false);
    const r = await cli("uninstall", ["--yes", "--json", "--templates", templates]);
    expect(r.code, r.stdout).toBe(4);
    expect(readText(target, "AGENTS.md")).toBe(MINE);
    expect(exists(target, ".agents/rules/tech.md")).toBe(false);
    expect(json(r).keep).toEqual(["AGENTS.md"]);
  });

  it("add 는 v2 lock 을 쓰며 가리지 못한 항목의 기준 해시를 null 로 둔다", async () => {
    const { target, templates, cli } = await v1Install(false);
    const r = await cli("add", ["codex", "--json", "--templates", templates], { env: FIXTURE_ENV });
    expect(r.code, r.stdout).toBe(0);
    expect(lockEntry(target, "AGENTS.md")).toMatchObject({ owner: "kit", sha256: null });
    expect(lockEntry(target, A)?.sha256).toBe(sha256Hex(readText(target, A)));
    const u = await run(["update", "--json", "--cwd", target, "--templates", templates], { env: FIXTURE_ENV });
    expect(u.code).toBe(4);
    expect(readText(target, "AGENTS.md")).toBe(MINE);
  });
});

describe("init — 미리 있던 파일(R12.6)", () => {
  it("다른 내용은 owner user, 같은 내용은 kit 으로 적고 update 가 사람 파일을 덮지 않는다", async () => {
    const pre = { "AGENTS.md": MINE, "CLAUDE.md": "@AGENTS.md\n" };
    const { target, cli } = await installedFixture({ pre });
    expect(lockEntry(target, "AGENTS.md")).toMatchObject({ owner: "user", sha256: null });
    expect(lockEntry(target, "CLAUDE.md")).toMatchObject({ owner: "kit", sha256: sha256Hex("@AGENTS.md\n") });
    const r = await cli("update", ["--json", "--templates", newKit()]);
    expect(r.code, r.stdout).toBe(0);
    expect(readText(target, "AGENTS.md")).toBe(MINE);
    expect(exists(target, "AGENTS.md.new")).toBe(false);
  });
});
