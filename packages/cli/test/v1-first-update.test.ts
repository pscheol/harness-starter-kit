// 표시 줄 없는 v1 lock(v1.0.8)의 첫 update — 구별 불가 파일을 병합 · 새 판 · .new 로 나눈다(HK-25 R1, design §2).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASIC_FILES, exists, fixtureTemplates, installedFixture, json, LOCK_FILE, lockEntry, readJsonFile, readText, sha256Hex, writeTree } from "./helpers";
import { initWith, projectionTemplates } from "./projection-helpers";

const HEADER = "# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path";
const B = "<!-- harness-kit: 설치 전 내용(병합) -->";
const E = "<!-- /harness-kit -->";
// 원본은 <경로>.orig — 설치본 검사(check_harness.py)가 .agents/**/*.md 링크를 보므로 .md 이름을 남기지 않는다.
const BACKUP = /^\.agents\/state\/merge-backup\/\d{8}T\d{6}Z\/(.+)\.orig$/;

const OLD_FILES: Record<string, string> = {
  ...BASIC_FILES,
  "common/root/docs/guide.md": "# 안내\n\n킷 문단\n",
  "common/agents-root/conf.json": '{\n  "a": 1\n}\n',
};
const NEW_FILES: Record<string, string> = {
  ...OLD_FILES,
  "common/root/docs/guide.md": "# 안내\n\n킷 문단 v2\n",
  "common/agents-root/conf.json": '{\n  "a": 2,\n  "b": [1]\n}\n',
  "common/agents-rules/a.md": "ns={{PACKAGE_NS}} lang={{PRIMARY_LANGUAGE}} v2\n",
  "common/scripts/run.sh": "#!/bin/sh\necho v2 {{PROJECT_SLUG}}\n",
};
const MINE_AGENTS = "# 손으로 쓴 AGENTS\n사람 줄\n";
const MINE_CONF = '{"a": 0, "mine": true}\n';

function label(layer: string): string {
  return layer.replace(/^stacks\/([^/]+)\/arch\//, "$1/").replace(/^stacks\//, "").replace(/^domains\//, "").replace(/^optional\//, "mod/");
}

/** v2 lock 항목 → v1.0.8 처럼 표시 줄 없는 TSV. hashes 는 그 경로의 기준 해시를 바꾼다(미리 있던 파일). */
function writeLegacyLock(target: string, hashes: Record<string, string> = {}, extra: string[] = []): void {
  const lock = readJsonFile(path.join(target, LOCK_FILE));
  const lines = [HEADER];
  for (const e of lock.entries as Record<string, any>[]) {
    if (e.op === "copy") lines.push(`${hashes[e.path] ?? e.sha256 ?? "-"}\t${label(e.layer)}\tcore\t${e.path}`);
    else if (e.op === "merge") lines.push(`-\t${e.createdByKit ? "merge+" : "merge"}\tcore\t${e.path}`);
    else lines.push(`${e.sha256 ?? "-"}\t${e.op}\tcore\t${e.path}`);
  }
  fs.writeFileSync(path.join(target, LOCK_FILE), `${[...lines, ...extra].join("\n")}\n`);
}

/** 옛 킷으로 깐 뒤 미리 있던 사람 파일 둘(AGENTS.md · .agents/conf.json)을 두고 lock 을 v1.0.8 형식으로 바꾼다. */
async function legacyInstall() {
  const fx = await installedFixture({ files: OLD_FILES });
  writeTree(fx.target, { "AGENTS.md": MINE_AGENTS, ".agents/conf.json": MINE_CONF });
  writeLegacyLock(fx.target, { "AGENTS.md": sha256Hex(MINE_AGENTS), ".agents/conf.json": sha256Hex(MINE_CONF) });
  return { ...fx, before: { guide: readText(fx.target, "docs/guide.md"), rule: readText(fx.target, ".agents/rules/a.md") } };
}

function opOf(j: Record<string, any>, p: string): Record<string, any> | undefined {
  return (j.ops as Record<string, any>[]).find((o) => o.path === p);
}

describe("update — v1 lock 첫 update 병합", () => {
  it("문서는 줄 병합, JSON 은 키 병합, .agents/rules 는 새 판, 코드는 .new — 원본은 merge-backup", async () => {
    const { target, cli, before } = await legacyInstall();
    const r = await cli("update", ["--json", "--templates", fixtureTemplates(NEW_FILES)]);
    expect(r.code, r.stdout).toBe(4); // run.sh 의 .new
    const j = json(r);
    expect(readText(target, "AGENTS.md")).toBe(`# Acme\n${B}\n# 손으로 쓴 AGENTS\n사람 줄\n${E}\n`);
    expect(readText(target, "docs/guide.md")).toBe(`# 안내\n\n킷 문단 v2\n${B}\n킷 문단\n${E}\n`);
    expect(readText(target, ".agents/conf.json")).toBe('{\n  "a": 2,\n  "b": [\n    1\n  ],\n  "mine": true\n}\n');
    expect(readText(target, ".agents/rules/a.md")).toBe("ns={{PACKAGE_NS}} lang=Kotlin/Java v2\n");
    expect(readText(target, "scripts/run.sh.new")).toBe("#!/bin/sh\necho v2 acme\n");
    expect(exists(target, "AGENTS.md.new") || exists(target, ".agents/rules/a.md.new") || exists(target, "docs/guide.md.new")).toBe(false);

    expect(opOf(j, "AGENTS.md")).toMatchObject({ action: "merge", merge: "lines", reason: expect.stringContaining("v1 lock") });
    expect(opOf(j, ".agents/conf.json")).toMatchObject({ action: "merge", merge: "keys" });
    expect(opOf(j, ".agents/rules/a.md")).toMatchObject({ action: "update", merge: "kit" });
    expect(opOf(j, "scripts/run.sh")).toMatchObject({ action: "conflict" });
    expect(j.counts).toMatchObject({ merge: 3, conflict: 1 });

    const merged = j.merged as { path: string; kind: string; backup: string }[];
    expect(merged.map((m) => [m.path, m.kind])).toEqual([
      [".agents/conf.json", "keys"],
      [".agents/rules/a.md", "kit"],
      ["AGENTS.md", "lines"],
      ["docs/guide.md", "lines"],
    ]);
    const originals: Record<string, string> = { "AGENTS.md": MINE_AGENTS, ".agents/conf.json": MINE_CONF, "docs/guide.md": before.guide, ".agents/rules/a.md": before.rule };
    for (const m of merged) {
      expect(m.backup).toMatch(BACKUP);
      expect(m.backup.replace(BACKUP, "$1")).toBe(m.path);
      expect(readText(target, m.backup)).toBe(originals[m.path]);
      expect(opOf(j, m.path)?.backup).toBe(m.backup);
    }
    expect(new Set(merged.map((m) => m.backup.split("/")[3])).size).toBe(1); // 한 번의 update = 시각 폴더 하나

    for (const p of ["AGENTS.md", ".agents/conf.json", ".agents/rules/a.md", "docs/guide.md"]) {
      const kit = p === "AGENTS.md" ? "# Acme\n" : p === ".agents/conf.json" ? NEW_FILES["common/agents-root/conf.json"] : p === "docs/guide.md" ? NEW_FILES["common/root/docs/guide.md"] : "ns={{PACKAGE_NS}} lang=Kotlin/Java v2\n";
      expect(lockEntry(target, p), p).toMatchObject({ owner: "kit", sha256: sha256Hex(kit as string) });
    }
    expect(lockEntry(target, "scripts/run.sh")).toMatchObject({ owner: "kit", sha256: null });

    // 사람용 출력: 끝에 한 번
    const human = await (await legacyInstall()).cli("update", ["--templates", fixtureTemplates(NEW_FILES)]);
    expect(human.stdout.split("\n").filter((l) => l.includes("v1 lock 첫 업데이트")).length).toBe(1);
    expect(human.stdout).toContain("merge-backup/");

    // 두 번째 update 는 표시 줄 있는(v2) lock 이라 병합하지 않는다
    const again = json(await cli("update", ["--json", "--templates", fixtureTemplates(NEW_FILES)]));
    expect(again.merged).toEqual([]);
    expect(again.counts.merge).toBe(0);
    expect(readText(target, "AGENTS.md")).toContain("사람 줄");
  });

  it("--dry-run 은 판정만 내고 아무것도 쓰지 않는다(백업 폴더 없음)", async () => {
    const { target, cli } = await legacyInstall();
    const r = await cli("update", ["--json", "--dry-run", "--templates", fixtureTemplates(NEW_FILES)]);
    expect(r.code).toBe(4);
    expect(opOf(json(r), "AGENTS.md")).toMatchObject({ action: "merge", merge: "lines" });
    expect(json(r).merged.map((m: { path: string }) => m.path)).toContain("AGENTS.md");
    expect(readText(target, "AGENTS.md")).toBe(MINE_AGENTS);
    expect(exists(target, ".agents/state/merge-backup")).toBe(false);
  });

  it("--accept-all 은 병합하지 않고 지금처럼 .bak 으로 덮는다", async () => {
    const { target, cli } = await legacyInstall();
    const r = await cli("update", ["--json", "--accept-all", "--templates", fixtureTemplates(NEW_FILES)]);
    expect(r.code, r.stdout).toBe(0);
    expect(opOf(json(r), "AGENTS.md")).toMatchObject({ action: "replace", backup: "AGENTS.md.bak" });
    expect(readText(target, "AGENTS.md.bak")).toBe(MINE_AGENTS);
    expect(readText(target, "AGENTS.md")).toBe("# Acme\n");
    expect(json(r).merged).toEqual([]);
  });

  it("표시 줄 있는 lock 은 병합하지 않는다(HK-12 그대로)", async () => {
    const { target, cli } = await legacyInstall();
    const lock = fs.readFileSync(path.join(target, LOCK_FILE), "utf8").split("\n");
    fs.writeFileSync(path.join(target, LOCK_FILE), [lock[0], "# pre-existing: -", ...lock.slice(1)].join("\n"));
    const j = json(await cli("update", ["--json", "--templates", fixtureTemplates(NEW_FILES)]));
    expect(j.merged).toEqual([]);
    expect(opOf(j, ".agents/rules/a.md")).toMatchObject({ action: "update" });
    expect(opOf(j, ".agents/rules/a.md")?.merge).toBeUndefined();
  });
});

describe("update — v1 CLAUDE.md(배치 merge)", () => {
  it("표시 줄 없는 lock 에서 사람 CLAUDE.md 는 배치가 바꾸기 전에 merge-backup 에 둔다", async () => {
    const templates = projectionTemplates();
    const { target, cli } = await initWith(templates, "claude");
    const human = "# 우리 팀 CLAUDE\n사람이 쓴 안내\n";
    writeTree(target, { "CLAUDE.md": human });
    const lock = readJsonFile(path.join(target, LOCK_FILE));
    lock.entries = (lock.entries as Record<string, any>[]).filter((e) => e.path !== "CLAUDE.md");
    fs.writeFileSync(path.join(target, LOCK_FILE), JSON.stringify(lock));
    writeLegacyLock(target, {}, [`${sha256Hex(human)}\tjvm\tcore\tCLAUDE.md`]);
    const r = await cli("update", ["--json", "--templates", templates]);
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(readText(target, "CLAUDE.md").startsWith("@AGENTS.md\n\n<!-- harness-kit:begin claude")).toBe(true);
    const m = (j.merged as { path: string; kind: string; backup: string }[]).find((x) => x.path === "CLAUDE.md");
    expect(m).toMatchObject({ kind: "kit" });
    expect(m?.backup).toMatch(BACKUP);
    expect(readText(target, m?.backup as string)).toBe(human);
  });
});
