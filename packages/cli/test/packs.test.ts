// 회사 팩(설계 04 §3.2~§3.5 · §5 #1 · #3 · #4, HK-14 design §3): file · git · npm 소스, 주인 · 충돌 · overrides · 하한 · 킷 범위.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePackSource, satisfiesKit } from "../src/core/packs";
import { untgz } from "../src/core/tar";
import { VERSION } from "../src/core/version";
import { initWith, projectionTemplates } from "./projection-helpers";
import { json, lockEntries, META_FILE, readJsonFile, readTree, tmpDir, writeJsonFile, writeTree } from "./helpers";

const ROLE = "---\nname: acme-auditor\ndescription: 보안 감사를 한다.\nmode: read-only\ntools: [read, search]\nclass: review\n---\n# acme-auditor\n";
const HOOK = { id: "harness-acme-scan", event: "pre-tool", tools: ["write"], script: "scripts/hooks/acme-scan.sh", timeoutSec: 10, owner: "pack:acme", subagents: true };

function packFiles(name = "acme", extra: Record<string, string> = {}, manifest: Record<string, unknown> = {}): Record<string, string> {
  return {
    "pack.json": `${JSON.stringify(
      {
        schema: "knots-sync.pack/v1",
        name,
        version: "1.2.0",
        description: "ACME 규칙",
        requires: { kit: ">=2.0.0 <3.0.0" },
        provides: { rules: [`${name}-security`], skills: [`${name}-release-note`], roles: [`${name}-auditor`], guards: [`${name}-license`], scripts: [`scripts/hooks/${name}-scan.sh`], hooks: [`harness-${name}-scan`], verifyChecks: [`${name}-license`] },
        overrides: [],
        tokens: [],
        ...manifest,
      },
      null,
      2,
    )}\n`,
    "README.md": "설치하지 않는다\n",
    "tests/test_pack.py": "# 설치하지 않는다\n",
    [`common/agents-rules/${name}-security.md`]: `# ${name} 보안 — {{PROJECT_NAME}}\n`,
    [`common/agents-skills/${name}-release-note/SKILL.md`]: `---\nname: ${name}-release-note\ndescription: 릴리스 노트를 쓴다\n---\n\n본문\n`,
    [`common/agents-root/roles/${name}-auditor.md`]: ROLE.split("acme").join(name),
    [`common/scripts/guards/${name}-license.sh`]: "#!/usr/bin/env bash\nexit 0\n",
    [`common/scripts/hooks/${name}-scan.sh`]: "#!/usr/bin/env bash\nexit 0\n",
    "fragments/hooks.json": `${JSON.stringify({ schema: "knots-sync.hooks/v1", hooks: [{ ...HOOK, id: `harness-${name}-scan`, script: `scripts/hooks/${name}-scan.sh`, owner: `pack:${name}` }] }, null, 2)}\n`,
    "fragments/verify-checks.json": `${JSON.stringify({ checks: [{ id: `${name}-license`, owner: `pack:${name}`, paths: ["**/package.json"], command: ["bash", `scripts/guards/${name}-license.sh`] }] }, null, 2)}\n`,
    ...extra,
  };
}

function makePack(files: Record<string, string>): string {
  const dir = path.join(tmpDir("hk-pack-"), "pack");
  writeTree(dir, files);
  for (const rel of Object.keys(files)) if (rel.endsWith(".sh")) fs.chmodSync(path.join(dir, rel), 0o755);
  return dir;
}

async function installed(packs: string[] = []) {
  const templates = projectionTemplates();
  const t = await initWith(templates);
  const meta = path.join(t.target, META_FILE);
  writeJsonFile(meta, { ...readJsonFile(meta), packs });
  const setPacks = (list: string[]): void => writeJsonFile(meta, { ...readJsonFile(meta), packs: list });
  return { ...t, templates, setPacks, packs: (extra: string[] = []) => t.cli("update", ["--packs", "--json", "--templates", templates, ...extra]) };
}

const PACK_PATHS = [
  ".agents/rules/acme-security.md",
  ".agents/skills/acme-release-note/SKILL.md",
  ".agents/roles/acme-auditor.md",
  "scripts/guards/acme-license.sh",
  "scripts/hooks/acme-scan.sh",
  ".agents/hooks.d/acme.json",
  ".agents/verify-checks.d/acme.json",
];

describe("팩 소스 · 범위", () => {
  it("소스 형식", () => {
    expect(parsePackSource("file:../acme")).toEqual({ kind: "file", path: "../acme" });
    expect(parsePackSource("git:gitlab.com/acme/harness-pack#v1.2.0")).toEqual({ kind: "git", url: "https://gitlab.com/acme/harness-pack.git", ref: "v1.2.0" });
    expect(parsePackSource("git:ssh://git@host/x.git#v1")).toEqual({ kind: "git", url: "ssh://git@host/x.git", ref: "v1" });
    expect(parsePackSource("npm:@acme/harness-pack@1.2.0")).toEqual({ kind: "npm", spec: "@acme/harness-pack@1.2.0" });
    expect(() => parsePackSource("acme")).toThrow(/형식/);
    expect(() => parsePackSource("git:host/x")).toThrow(/형식/);
  });

  it("킷 범위는 사전 출시 꼬리를 떼고 본다", () => {
    expect(satisfiesKit("2.0.0-alpha.0", ">=2.0.0 <3.0.0")).toBe(true);
    expect(satisfiesKit("3.0.0", ">=2.0.0 <3.0.0")).toBe(false);
    expect(satisfiesKit("2.4.1", "^2.1.0")).toBe(true);
    expect(satisfiesKit("2.4.1", "~2.1.0")).toBe(false);
    expect(satisfiesKit("2.0.0", "2.0.0")).toBe(true);
    expect(satisfiesKit("2.0.0", "")).toBe(false);
  });
});

describe("update --packs", () => {
  it("팩 파일을 pack:acme 로 적고 배치까지 만든다 · 킷 update 뒤 해시 그대로(04 §5 #1)", async () => {
    const pack = makePack(packFiles());
    const t = await installed([`file:${pack}`]);
    const r = await t.packs();
    expect(r.code, r.stdout).toBe(0);
    const lock = readJsonFile(path.join(t.target, ".agents/knots-sync.lock"));
    expect(lock.packs).toEqual([{ name: "acme", version: "1.2.0", source: `file:${pack}`, resolved: expect.stringMatching(/^tree:[0-9a-f]{64}$/), requiresKit: ">=2.0.0 <3.0.0" }]);
    const owned = lockEntries(t.target).filter((e) => e.owner === "pack:acme");
    expect(owned.map((e) => e.path).sort()).toEqual([...PACK_PATHS.slice(0, 1), ...PACK_PATHS.slice(1)].sort());
    expect(owned.every((e) => e.layer === "pack:acme@1.2.0")).toBe(true);
    expect(fs.readFileSync(path.join(t.target, ".agents/rules/acme-security.md"), "utf8")).toBe("# acme 보안 — Acme\n");
    expect(fs.statSync(path.join(t.target, "scripts/guards/acme-license.sh")).mode & 0o111).not.toBe(0);
    for (const rel of ["README.md", "tests/test_pack.py", "pack.json"]) expect(fs.existsSync(path.join(t.target, rel))).toBe(false);
    // 배치: 팩 규칙 · 스킬 · 역할 · 훅이 하네스 폴더에
    expect(fs.existsSync(path.join(t.target, ".claude/rules/acme-security.md"))).toBe(true);
    expect(fs.existsSync(path.join(t.target, ".claude/skills/acme-release-note/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(t.target, ".claude/agents/acme-auditor.md"))).toBe(true);
    expect(fs.readFileSync(path.join(t.target, ".claude/settings.json"), "utf8")).toContain("harness-acme-scan scripts/hooks/acme-scan.sh");
    expect(fs.existsSync(path.join(t.target, ".kiro/hooks/harness-acme-scan.json"))).toBe(true);
    const before = Object.fromEntries(PACK_PATHS.map((p) => [p, fs.readFileSync(path.join(t.target, p))]));
    // 템플릿을 바꾼 킷으로 update — 팩 파일은 skip-pack
    fs.appendFileSync(path.join(t.templates, "common/agents-rules/always.md"), "\n새 킷 줄\n");
    const up = await t.cli("update", ["--json", "--templates", t.templates]);
    expect(up.code, up.stdout).toBe(0);
    for (const p of PACK_PATHS) expect(fs.readFileSync(path.join(t.target, p))).toEqual(before[p]);
    expect(lockEntries(t.target).filter((e) => e.owner === "pack:acme")).toHaveLength(PACK_PATHS.length);
    expect(json(await t.packs()).ops.filter((o: { action: string }) => o.action !== "same")).toEqual([]);
  });

  it("같은 경로를 가진 팩 둘 → exit 4, 쓴 파일 0(04 §5 #3)", async () => {
    const a = makePack(packFiles());
    const b = makePack({ ...packFiles("acmeweb"), "common/agents-rules/acme-security.md": "# 겹침\n" }, );
    const bManifest = JSON.parse(fs.readFileSync(path.join(b, "pack.json"), "utf8"));
    bManifest.provides.rules.push("acme-security");
    fs.writeFileSync(path.join(b, "pack.json"), JSON.stringify(bManifest));
    const t = await installed([`file:${a}`, `file:${b}`]);
    const before = readTree(t.target);
    const r = await t.packs();
    expect(r.code).toBe(4);
    expect(json(r).conflicts.join("\n")).toContain(".agents/rules/acme-security.md");
    expect(readTree(t.target)).toEqual(before);
  });

  it.each([
    ["overrides 밖 킷 경로", { "common/agents-rules/always.md": "# 덮기\n" }, {}, /overrides 에 적는다/],
    ["하한 훅 id", { "fragments/hooks.json": JSON.stringify({ schema: "knots-sync.hooks/v1", hooks: [{ ...HOOK, id: "harness-verify-gate" }] }) }, { provides: { hooks: ["harness-verify-gate"], verifyChecks: ["acme-license"] } }, /하한 훅/],
    ["하네스 폴더", { "common/claude/settings.json": "{}" }, {}, /하네스 파일|쓸 수 없는/],
    ["root/", { "common/root/AGENTS.md": "x" }, {}, /쓸 수 없는/],
    ["실행 권한 없는 .sh", { "common/scripts/guards/acme-extra.sh": "x" }, {}, /실행 권한/],
    ["킷 범위 밖", {}, { requires: { kit: ">=9.0.0" } }, /kit >=9\.0\.0 을 요구한다/],
    ["provides 밖", { "common/agents-rules/secret.md": "x" }, {}, /provides · overrides 어디에도/],
  ])("%s → exit 3, 쓴 파일 0(04 §5 #4)", async (_name, extra, manifest, pattern) => {
    const pack = makePack(packFiles("acme", extra as Record<string, string>, manifest as Record<string, unknown>));
    if (_name === "실행 권한 없는 .sh") fs.chmodSync(path.join(pack, "common/scripts/guards/acme-extra.sh"), 0o644);
    const t = await installed([`file:${pack}`]);
    const before = readTree(t.target);
    const r = await t.packs();
    expect(r.code, r.stdout).toBe(3);
    expect(json(r).error.message).toMatch(pattern);
    expect(readTree(t.target)).toEqual(before);
  });

  it("overrides 로 킷 경로를 덮고, 팩을 빼면 킷 판으로 돌아간다 · 고친 팩 파일은 user 로 남는다", async () => {
    const pack = makePack(packFiles("acme", { "common/agents-rules/always.md": "# 팩 판 always\n" }, { overrides: [".agents/rules/always.md"] }));
    const t = await installed([`file:${pack}`]);
    const kitAlways = fs.readFileSync(path.join(t.target, ".agents/rules/always.md"));
    expect((await t.packs()).code).toBe(0);
    expect(fs.readFileSync(path.join(t.target, ".agents/rules/always.md"), "utf8")).toBe("# 팩 판 always\n");
    expect(lockEntries(t.target).find((e) => e.path === ".agents/rules/always.md")?.owner).toBe("pack:acme");
    fs.appendFileSync(path.join(t.target, ".agents/rules/acme-security.md"), "사람 줄\n");
    t.setPacks([]);
    const r = await t.packs();
    expect(r.code).toBe(4);
    expect(fs.readFileSync(path.join(t.target, ".agents/rules/always.md"))).toEqual(kitAlways);
    expect(lockEntries(t.target).find((e) => e.path === ".agents/rules/always.md")?.owner).toBe("kit");
    expect(fs.existsSync(path.join(t.target, "scripts/guards/acme-license.sh"))).toBe(false);
    expect(lockEntries(t.target).find((e) => e.path === ".agents/rules/acme-security.md")?.owner).toBe("user");
    expect(fs.existsSync(path.join(t.target, ".claude/settings.json")) && fs.readFileSync(path.join(t.target, ".claude/settings.json"), "utf8")).not.toContain("harness-acme-scan");
  });

  it("팩 판을 올리면 고치지 않은 파일은 update, 고친 파일은 conflict · .new", async () => {
    const pack = makePack(packFiles());
    const t = await installed([`file:${pack}`]);
    expect((await t.packs()).code).toBe(0);
    fs.appendFileSync(path.join(t.target, ".agents/roles/acme-auditor.md"), "\n사람\n");
    fs.writeFileSync(path.join(pack, "common/agents-rules/acme-security.md"), "# 새 판\n");
    fs.writeFileSync(path.join(pack, "common/agents-root/roles/acme-auditor.md"), `${ROLE}\n새 판\n`);
    const r = await t.packs();
    expect(r.code).toBe(4);
    const ops = json(r).ops as { path: string; action: string }[];
    expect(ops.find((o) => o.path === ".agents/rules/acme-security.md")?.action).toBe("update");
    expect(ops.find((o) => o.path === ".agents/roles/acme-auditor.md")?.action).toBe("conflict");
    expect(fs.existsSync(path.join(t.target, ".agents/roles/acme-auditor.md.new"))).toBe(true);
  });

  it("킷 update 는 깐 팩이 요구하는 범위 밖이면 쓰기 전에 exit 3", async () => {
    const t = await installed([]);
    const lockFile = path.join(t.target, ".agents/knots-sync.lock");
    writeJsonFile(lockFile, { ...readJsonFile(lockFile), packs: [{ name: "acme", version: "1.0.0", source: "file:x", resolved: "tree:0", requiresKit: "<2.0.0" }] });
    const before = readTree(t.target);
    const r = await t.cli("update", ["--json", "--templates", t.templates]);
    expect(r.code).toBe(3);
    expect(json(r).error.message).toContain("kit <2.0.0");
    expect(readTree(t.target)).toEqual(before);
    expect(VERSION).toMatch(/^2\./);
  });
});

describe("doctor 팩 소스 경고", () => {
  it("git ref 가 태그가 아니면 pack-unpinned, file: 이 리포 밖이면 pack-local-path", async () => {
    const t = await installed(["git:gitlab.com/acme/pack#main", "git:gitlab.com/acme/pack#v1.2.0", "file:../outside", "file:tools/packs/acme"]);
    const f = json(await t.cli("doctor", ["--json", "--only", "pack-unpinned,pack-local-path"])).findings as { kind: string; hint: string }[];
    expect(f.map((x) => x.kind)).toEqual(["pack-unpinned", "pack-local-path"]);
    expect(f[0].hint).toContain("#main");
  });
});

describe("git · npm 소스", () => {
  function git(cwd: string, ...args: string[]): void {
    const r = spawnSync("git", ["-c", "user.email=t@e", "-c", "user.name=t", "-c", "init.defaultBranch=main", ...args], { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
  }

  it("git: 태그로 받고 resolved 에 커밋 sha 를 적는다", async () => {
    const pack = makePack(packFiles());
    git(pack, "init", "-q");
    git(pack, "add", "-A");
    git(pack, "commit", "-q", "-m", "pack");
    git(pack, "tag", "v1.2.0");
    const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: pack, encoding: "utf8" }).stdout.trim();
    const t = await installed([`git:file://${pack}#v1.2.0`]);
    const r = await t.packs();
    expect(r.code, r.stdout).toBe(0);
    expect(readJsonFile(path.join(t.target, ".agents/knots-sync.lock")).packs[0].resolved).toBe(`git:${sha}`);
    expect(fs.statSync(path.join(t.target, "scripts/hooks/acme-scan.sh")).mode & 0o111).not.toBe(0);
    expect(fs.readdirSync(path.join(t.target, ".agents/state/packs")).filter((n) => !n.startsWith("."))).toEqual([`acme@1.2.0-${sha.slice(0, 12)}`]);
    t.setPacks([`git:file://${pack}#v9.9.9`]);
    expect((await t.packs()).code).toBe(3);
  });

  it.skipIf(spawnSync("npm", ["--version"]).status !== 0)("npm: npm pack 으로 받아 tgz 를 푼다", async () => {
    const pack = makePack({ ...packFiles(), "package.json": JSON.stringify({ name: "acme-harness-pack", version: "1.2.0", files: ["pack.json", "common", "fragments"] }) });
    const t = await installed([`npm:${pack}`]);
    const r = await t.packs();
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(readJsonFile(path.join(t.target, ".agents/knots-sync.lock")).packs[0].resolved).toMatch(/^npm:sha512-/);
    expect(fs.existsSync(path.join(t.target, ".agents/rules/acme-security.md"))).toBe(true);
    expect(fs.statSync(path.join(t.target, "scripts/guards/acme-license.sh")).mode & 0o111).not.toBe(0);
  });

  it("tar: 링크 · 리포 밖 경로는 거부한다", () => {
    const header = (name: string, type: string, size = 0): Buffer => {
      const h = Buffer.alloc(512);
      h.write(name, 0);
      h.write("0000644\0", 100);
      h.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
      h.write(type, 156);
      return h;
    };
    const zlib = require("node:zlib") as typeof import("node:zlib");
    const tgz = (blocks: Buffer[]): Buffer => zlib.gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
    expect(() => untgz(tgz([header("package/x", "2")]))).toThrow(/링크/);
    expect(() => untgz(tgz([header("package/../../x", "0")]))).toThrow(/안전하지/);
    const ok = untgz(tgz([header("package/a.txt", "0", 3), Buffer.concat([Buffer.from("abc"), Buffer.alloc(509)])]));
    expect(ok.map((f) => [f.path, f.data.toString()])).toEqual([["package/a.txt", "abc"]]);
  });
});
