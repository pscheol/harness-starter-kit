// pack new(설계 04 §3.9 · §5 #5, HK-14 design §3.3): 프로젝트 파일 → 팩 골격 → 다른 리포에 file: 로 깔면 같은 바이트.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initWith, projectionTemplates } from "./projection-helpers";
import { json, lockEntries, META_FILE, readJsonFile, tmpDir, writeJsonFile, writeTree } from "./helpers";

const RULE = "# ACME 보안\n\n- 비밀은 금고에서만 읽는다\n";

describe("pack new", () => {
  it("--from 파일 · 폴더 · 훅 id 로 골격을 만들고, 그 팩을 다른 리포에 깔면 같은 바이트다(04 §5 #5)", async () => {
    const templates = projectionTemplates();
    const src = await initWith(templates);
    writeTree(src.target, {
      ".agents/rules/acme-security.md": RULE,
      "scripts/guards/acme-license.sh": "#!/usr/bin/env bash\nexit 0\n",
      ".agents/hooks.d/project.json": `${JSON.stringify({ schema: "harness-kit.hooks/v1", hooks: [{ id: "harness-my-scan", event: "pre-tool", tools: ["write"], script: "scripts/guards/acme-license.sh", timeoutSec: 5, owner: "user" }] })}\n`,
    });
    fs.chmodSync(path.join(src.target, "scripts/guards/acme-license.sh"), 0o755);
    const dir = path.join(tmpDir("hk-packnew-"), "acme-pack");
    const r = await src.cli("pack", [
      "new", "acme", "--dir", dir, "--json", "--templates", templates,
      "--from", ".agents/rules/acme-security.md", "--from", "scripts/guards/acme-license.sh", "--from", ".agents/skills/hx-plan",
      "--from", ".agents/hooks.d/project.json#harness-my-scan", "--from", ".agents/rules/always.md",
    ]);
    expect(r.code, r.stdout).toBe(0);
    const out = json(r);
    expect(out.files).toEqual(expect.arrayContaining(["pack.json", "common/agents-rules/acme-security.md", "common/scripts/guards/acme-license.sh", "common/agents-skills/hx-plan/SKILL.md", "fragments/hooks.json", "tests/test_pack.py"]));
    expect(out.manifest.provides).toEqual({ rules: ["acme-security"], guards: ["acme-license"], hooks: ["harness-acme-my-scan"] });
    expect([...out.manifest.overrides].sort()).toEqual([".agents/rules/always.md", ".agents/skills/hx-plan/SKILL.md", ".agents/skills/hx-plan/agents/openai.yaml", ".agents/skills/hx-plan/tool.sh"]);
    expect(out.warnings.join("\n")).toContain("harness-my-scan → harness-acme-my-scan");
    expect(fs.statSync(path.join(dir, "common/scripts/guards/acme-license.sh")).mode & 0o111).not.toBe(0);
    // 팩 자체 시험
    const py = spawnSync("python3", ["-B", "-m", "unittest", "tests.test_pack"], { cwd: dir, encoding: "utf8" });
    expect(py.status, py.stdout + py.stderr).toBe(0);
    // 다른 리포에 깐다
    const dst = await initWith(templates);
    const meta = path.join(dst.target, META_FILE);
    writeJsonFile(meta, { ...readJsonFile(meta), packs: [`file:${dir}`] });
    const up = await dst.cli("update", ["--packs", "--json", "--templates", templates]);
    expect(up.code, up.stdout).toBe(0);
    expect(fs.readFileSync(path.join(dst.target, ".agents/rules/acme-security.md"))).toEqual(fs.readFileSync(path.join(src.target, ".agents/rules/acme-security.md")));
    expect(lockEntries(dst.target).find((e) => e.path === ".agents/rules/acme-security.md")?.owner).toBe("pack:acme");
    expect(JSON.parse(fs.readFileSync(path.join(dst.target, ".agents/hooks.d/acme.json"), "utf8")).hooks[0].id).toBe("harness-acme-my-scan");
  });

  it.each([
    [["new", "acme"], /--dir/],
    [["new", "Acme", "--dir", "x"], /이름/],
    [["make", "acme", "--dir", "x"], /하위 명령/],
    [["new", "acme", "--dir", "IN_AGENTS"], /\.agents\//],
    [["new", "acme", "--dir", "PLACEHOLDER", "--from", ".claude/settings.json"], /하네스 파일/],
    [["new", "acme", "--dir", "PLACEHOLDER", "--from", ".agents/hooks.json#harness-nope"], /id 가 없다/],
  ])("%j → exit 2, 쓰지 않는다", async (args, pattern) => {
    const templates = projectionTemplates();
    const t = await initWith(templates);
    const dir = path.join(tmpDir("hk-packnew-"), "out");
    const real = args.map((a) => (a === "PLACEHOLDER" ? dir : a === "IN_AGENTS" ? path.join(t.target, ".agents/packs/acme") : a));
    const r = await t.cli("pack", [...real, "--json", "--templates", templates]);
    expect(r.code).toBe(2);
    expect(json(r).error.message).toMatch(pattern);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("빈 폴더가 아니면 거부한다", async () => {
    const templates = projectionTemplates();
    const t = await initWith(templates);
    const dir = tmpDir("hk-packnew-");
    fs.writeFileSync(path.join(dir, "x"), "x");
    expect((await t.cli("pack", ["new", "acme", "--dir", dir, "--templates", templates])).code).toBe(2);
  });
});
