// repair · uninstall · doctor 의 mirror · render · merge(HK-13 design §6.4~§6.6, R5, 02 §3.11~§3.13).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exists, patchLock, readText, writeTree } from "./helpers";
import { harnessFiles, initWith, projectionTemplates } from "./projection-helpers";

async function installed(agents = "all") {
  const templates = projectionTemplates();
  const env = await initWith(templates, agents);
  expect(env.r.code, env.r.stdout).toBe(0);
  return { ...env, templates };
}

function kinds(stdout: string): string[] {
  return (JSON.parse(stdout).findings as { kind: string; path?: string }[]).map((f) => `${f.kind} ${f.path ?? ""}`.trim());
}

describe("doctor(§6.6)", () => {
  it("새 설치는 배치 오류 0", async () => {
    const { cli } = await installed();
    const r = await cli("doctor", ["--check", "--json"]);
    expect(r.code, r.stdout).toBe(0);
    expect(JSON.parse(r.stdout).summary.projection).toMatchObject({ ok: expect.any(Number), errors: 0 });
  });

  it("stale · drifted · missing · symlink-found · merge-missing · relative-ref · pending-new", async () => {
    const { target, cli } = await installed();
    fs.appendFileSync(path.join(target, ".agents/rules/kt.md"), "원본 한 줄\n");
    fs.appendFileSync(path.join(target, ".cursor/rules/always.mdc"), "손\n");
    fs.rmSync(path.join(target, ".kiro/steering/multi.md"));
    fs.rmSync(path.join(target, ".claude/rules/always.md"));
    fs.symlinkSync("../../.agents/rules/always.md", path.join(target, ".claude/rules/always.md"));
    writeTree(target, { "CLAUDE.md": "블록을 지웠다\n", ".agents/roles/explorer.md": `${readText(target, ".agents/roles/explorer.md")}[밖](../rules/kt.md)\n`, ".codex/config.toml.new": "x\n" });
    const r = await cli("doctor", ["--check", "--json"]);
    expect(r.code).toBe(1);
    const k = kinds(r.stdout);
    for (const want of [
      "stale .claude/rules/kt.md",
      "stale .kiro/steering/kt.md",
      "drifted .cursor/rules/always.mdc",
      "missing .kiro/steering/multi.md",
      "symlink-found .claude/rules/always.md",
      "merge-missing CLAUDE.md",
      "relative-ref .agents/roles/explorer.md",
      "pending-new .codex/config.toml.new",
    ]) expect(k, want).toContain(want);
  });
});

describe("repair(§6.4)", () => {
  it("stale · missing · symlink · merge-missing 을 원본에서 다시 만들고 drifted 는 .bak 으로 옮긴다", async () => {
    const { target, cli, templates } = await installed();
    fs.appendFileSync(path.join(target, ".agents/rules/kt.md"), "원본 한 줄\n");
    fs.appendFileSync(path.join(target, ".cursor/rules/always.mdc"), "손\n");
    fs.rmSync(path.join(target, ".kiro/steering/multi.md"));
    fs.rmSync(path.join(target, ".claude/rules/always.md"));
    fs.symlinkSync("../../.agents/rules/always.md", path.join(target, ".claude/rules/always.md"));
    writeTree(target, { "CLAUDE.md": "블록을 지웠다\n", ".agents/rules/new-rule.md": "# 사람이 더한 규칙\n" });
    const r = await cli("repair", ["--json", "--templates", templates]);
    expect(r.code, r.stdout).toBe(0);
    expect(readText(target, ".claude/rules/kt.md")).toContain("원본 한 줄");
    expect(readText(target, ".kiro/steering/kt.md")).toContain("원본 한 줄");
    expect(readText(target, ".cursor/rules/always.mdc.bak")).toContain("손");
    expect(readText(target, ".cursor/rules/always.mdc")).not.toContain("손");
    expect(exists(target, ".kiro/steering/multi.md")).toBe(true);
    expect(fs.lstatSync(path.join(target, ".claude/rules/always.md")).isSymbolicLink()).toBe(false);
    expect(readText(target, "CLAUDE.md")).toContain("<!-- harness-kit:begin claude");
    expect(readText(target, ".claude/rules/new-rule.md")).toBe("# 사람이 더한 규칙\n");
    const d = await cli("doctor", ["--check", "--json"]);
    expect(d.code, d.stdout).toBe(0);
  });

  it("--only stale 이면 stale 만 고친다 · --dry-run 은 쓰지 않는다", async () => {
    const { target, cli, templates } = await installed("claude");
    fs.appendFileSync(path.join(target, ".agents/rules/kt.md"), "원본 한 줄\n");
    fs.rmSync(path.join(target, ".claude/rules/multi.md"));
    const dry = await cli("repair", ["--json", "--dry-run", "--templates", templates]);
    expect(dry.code).toBe(0);
    expect(readText(target, ".claude/rules/kt.md")).not.toContain("원본 한 줄");
    const r = await cli("repair", ["--json", "--only", "stale", "--templates", templates]);
    expect(r.code, r.stdout).toBe(0);
    expect(readText(target, ".claude/rules/kt.md")).toContain("원본 한 줄");
    expect(exists(target, ".claude/rules/multi.md")).toBe(false);
  });
});

describe("uninstall(§6.5)", () => {
  it("고치지 않은 생성물 · 복사본은 지우고, 고친 것은 남기고, merge 는 킷 키만 뺀다", async () => {
    const { target, cli } = await installed("claude,kiro");
    fs.appendFileSync(path.join(target, ".kiro/steering/kt.md"), "손\n");
    const settings = JSON.parse(readText(target, ".claude/settings.json"));
    settings.hooks.Stop.push({ hooks: [{ type: "command", command: "other" }] });
    writeTree(target, { ".claude/settings.json": `${JSON.stringify(settings, null, 2)}\n` });
    const r = await cli("uninstall", ["--yes", "--json"]);
    expect(r.code).toBe(4);
    expect(JSON.parse(r.stdout).keep).toContain(".kiro/steering/kt.md");
    expect(exists(target, ".claude/skills")).toBe(false);
    expect(exists(target, "CLAUDE.md")).toBe(false);
    expect(exists(target, ".gitattributes")).toBe(false);
    expect(JSON.parse(readText(target, ".claude/settings.json"))).toEqual({ hooks: { Stop: [{ hooks: [{ type: "command", command: "other" }] }] } });
    const left = harnessFiles(target).files;
    expect(left.sort()).toEqual([".claude/settings.json", ".kiro/steering/kt.md"]);
  });

  it("v1 lock 의 merge 항목(키 없음)도 지금 원하는 키로 뺀다", async () => {
    const { target, cli } = await installed("claude");
    patchLock(target, { ".claude/settings.json": { op: "merge", owner: "kit", keys: undefined, createdByKit: true } });
    const r = await cli("uninstall", ["--yes", "--json"]);
    expect(r.code, r.stdout).toBe(0);
    expect(exists(target, ".claude/settings.json")).toBe(false);
    expect(exists(target, ".agents/harness-kit.lock")).toBe(false);
  });
});
