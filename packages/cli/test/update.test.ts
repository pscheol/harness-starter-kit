// update — 3방향 비교(HK-11 design §3, 설계 02 §3.10).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASIC_FILES,
  CLI_DIR,
  exists,
  fixtureTemplates,
  installedFixture,
  json,
  LOCK_FILE,
  lockEntries,
  lockEntry,
  META_FILE,
  modeOf,
  patchLock,
  readJsonFile,
  readText,
  readTree,
  REAL_TEMPLATES,
  run,
  sha256Hex,
  tmpDir,
  writeJsonFile,
  writeTree,
} from "./helpers";

const VERSION = (JSON.parse(fs.readFileSync(path.join(CLI_DIR, "package.json"), "utf8")) as { version: string }).version;
const A = ".agents/rules/a.md";
const A_V2 = "ns={{PACKAGE_NS}} lang={{PRIMARY_LANGUAGE}} v2\n";

/** 새 킷: a.md · run.sh 를 바꾸고 b.md 를 더한다. */
function newKit(extra: Record<string, string> = {}, drop: string[] = []): string {
  const files: Record<string, string> = {
    ...BASIC_FILES,
    "common/agents-rules/a.md": A_V2,
    "common/agents-rules/b.md": "새 규칙 {{PROJECT_NAME}}\n",
    "common/scripts/run.sh": "#!/bin/sh\necho v2 {{PROJECT_SLUG}}\n",
    ...extra,
  };
  for (const d of drop) delete files[d];
  return fixtureTemplates(files);
}

function actionOf(j: Record<string, any>, p: string): string | undefined {
  return (j.ops as { path: string; action: string }[]).find((o) => o.path === p)?.action;
}

describe("update — 판정", () => {
  it("고치지 않은 파일은 새 판으로, 새 파일은 new, lock · 메타는 v2 새 버전(R3.1)", async () => {
    const { target, cli } = await installedFixture();
    const r = await cli("update", ["--json", "--templates", newKit()], { today: "2026-12-01" });
    expect(r.code, r.stdout).toBe(0);
    expect(r.stderr).toBe("");
    const j = json(r);
    expect(j).toMatchObject({ command: "update", dryRun: false, kit: { to: VERSION }, formats: { meta: "v2", lock: "v2" } });
    expect(j.counts).toMatchObject({ update: 2, new: 1, conflict: 0 });
    expect(j.counts.same).toBeGreaterThan(4);
    expect(j.ops.every((o: { action: string }) => o.action !== "same")).toBe(true);
    expect(actionOf(j, A)).toBe("update");
    expect(actionOf(j, ".agents/rules/b.md")).toBe("new");
    expect(readText(target, A)).toBe("ns={{PACKAGE_NS}} lang=Kotlin/Java v2\n");
    expect(readText(target, ".agents/rules/b.md")).toBe("새 규칙 Acme\n");
    expect(readText(target, "scripts/run.sh")).toBe("#!/bin/sh\necho v2 acme\n");
    expect(modeOf(target, "scripts/run.sh") & 0o111).not.toBe(0);
    expect(lockEntry(target, A)).toMatchObject({ op: "copy", owner: "kit", sha256: sha256Hex(readText(target, A)), layer: "common" });
    expect(lockEntry(target, ".agents/rules/b.md")).toMatchObject({ owner: "kit", sha256: sha256Hex("새 규칙 Acme\n") });
    const lock = readJsonFile(path.join(target, LOCK_FILE));
    expect(lock).toMatchObject({ schema: "harness-kit.lock/v2", kit: { version: VERSION } });
    const meta = readJsonFile(path.join(target, META_FILE));
    expect(meta).toMatchObject({ schema: "harness-kit/v2", kit: { version: VERSION }, installedAt: "2026-11-23", updatedAt: "2026-12-01" });
    const again = await cli("update", ["--json", "--templates", newKit()]);
    expect(json(again).counts).toMatchObject({ update: 0, new: 0, conflict: 0 });
  });

  it("사람이 고친 파일은 .new 로 받고 원본 · B 는 그대로, exit 4 와 diff -u 목록(R3.1 · R3.4)", async () => {
    const { target, cli } = await installedFixture();
    const before = lockEntry(target, A)?.sha256;
    fs.appendFileSync(path.join(target, A), "사람 줄\n");
    fs.appendFileSync(path.join(target, "AGENTS.md"), "사람 줄\n");
    const tpl = newKit();
    const r = await cli("update", ["--json", "--templates", tpl]);
    expect(r.code).toBe(4);
    const j = json(r);
    expect(j.counts.conflict).toBe(2);
    expect(j.conflicts).toEqual([
      { path: ".agents/rules/a.md", new: ".agents/rules/a.md.new", diff: "diff -u .agents/rules/a.md .agents/rules/a.md.new" },
      { path: "AGENTS.md", new: "AGENTS.md.new", diff: "diff -u AGENTS.md AGENTS.md.new" },
    ]);
    expect(readText(target, A)).toContain("사람 줄");
    expect(readText(target, `${A}.new`)).toBe("ns={{PACKAGE_NS}} lang=Kotlin/Java v2\n");
    expect(readText(target, "AGENTS.md.new")).toBe("# Acme\n");
    expect(modeOf(target, `${A}.new`) & 0o111).toBe(0);
    expect(lockEntry(target, A)?.sha256).toBe(before);
    const human = await cli("update", ["--templates", tpl]);
    expect(human.code).toBe(4);
    expect(human.stdout).toContain("diff -u .agents/rules/a.md .agents/rules/a.md.new");
    const refreshed = json(await cli("update", ["--json", "--templates", tpl]));
    expect(refreshed.ops.find((o: { path: string }) => o.path === A)).toMatchObject({ action: "conflict", newRefreshed: true });
    fs.renameSync(path.join(target, `${A}.new`), path.join(target, A));
    const accepted = json(await cli("update", ["--json", "--templates", tpl]));
    expect(actionOf(accepted, A)).toBeUndefined();
    expect(lockEntry(target, A)?.sha256).toBe(sha256Hex(readText(target, A)));
  });

  it("--accept-all 은 고친 파일을 .bak 으로 옮기고 새 판을 쓴다", async () => {
    const { target, cli } = await installedFixture();
    fs.appendFileSync(path.join(target, A), "사람 줄\n");
    const mine = readText(target, A);
    const r = await cli("update", ["--json", "--accept-all", "--templates", newKit()]);
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(j.ops.find((o: { path: string }) => o.path === A)).toMatchObject({ action: "replace", backup: `${A}.bak` });
    expect(j.counts).toMatchObject({ replace: 1, conflict: 0 });
    expect(readText(target, `${A}.bak`)).toBe(mine);
    expect(readText(target, A)).toBe("ns={{PACKAGE_NS}} lang=Kotlin/Java v2\n");
    expect(lockEntry(target, A)?.sha256).toBe(sha256Hex(readText(target, A)));
    expect(exists(target, `${A}.new`)).toBe(false);
  });

  it("--dry-run 은 쓰지 않고 판정 · 종료 코드는 같다(R3.4)", async () => {
    const { target, cli } = await installedFixture();
    fs.appendFileSync(path.join(target, A), "사람 줄\n");
    const before = readTree(target);
    const r = await cli("update", ["--json", "--dry-run", "--templates", newKit()]);
    expect(r.code).toBe(4);
    const j = json(r);
    expect(j.dryRun).toBe(true);
    expect(j.conflicts.map((c: { path: string }) => c.path)).toEqual([A]);
    expect(j.counts).toMatchObject({ new: 1, update: 1, conflict: 1 });
    expect(readTree(target)).toEqual(before);
    const human = await cli("update", ["--dry-run", "--templates", newKit()]);
    expect(human.stdout).toContain("dry-run");
    expect(readTree(target)).toEqual(before);
  });

  it("lock 에 없는 경로: 없으면 new, 같으면 same(kit), 다르면 skip-user(user) · 지운 킷 파일은 restore", async () => {
    const { target, cli } = await installedFixture();
    writeTree(target, { ".agents/rules/c.md": "사람 c\n", ".agents/rules/d.md": "킷 d\n" });
    fs.rmSync(path.join(target, "AGENTS.md"));
    const tpl = newKit({ "common/agents-rules/c.md": "킷 c\n", "common/agents-rules/d.md": "킷 d\n" });
    const r = await cli("update", ["--json", "--templates", tpl]);
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(actionOf(j, ".agents/rules/c.md")).toBe("skip-user");
    expect(actionOf(j, ".agents/rules/d.md")).toBeUndefined();
    expect(actionOf(j, "AGENTS.md")).toBe("restore");
    expect(readText(target, ".agents/rules/c.md")).toBe("사람 c\n");
    expect(exists(target, ".agents/rules/c.md.new")).toBe(false);
    expect(readText(target, "AGENTS.md")).toBe("# Acme\n");
    expect(lockEntry(target, ".agents/rules/c.md")).toEqual({ path: ".agents/rules/c.md", op: "copy", owner: "user", sha256: null, layer: "common" });
    expect(lockEntry(target, ".agents/rules/d.md")).toMatchObject({ owner: "kit", sha256: sha256Hex("킷 d\n") });
    const again = await cli("update", ["--json", "--templates", tpl]);
    expect(again.code).toBe(0);
    expect(actionOf(json(again), ".agents/rules/c.md")).toBe("skip-user");
  });

  it("주인이 user · external · pack 인 항목은 쓰지 않는다(R3.3)", async () => {
    const { target, cli } = await installedFixture();
    patchLock(target, {
      "AGENTS.md": { owner: "user", sha256: null },
      [A]: { op: "none", owner: "external:aidlc", sha256: undefined, layer: undefined },
      ".agents/rules/tech.md": { owner: "pack:acme" },
      ".agents/rules/structure.md": { owner: "user", sha256: null },
    });
    fs.rmSync(path.join(target, ".agents/rules/structure.md"));
    const lockBefore = fs.readFileSync(path.join(target, LOCK_FILE), "utf8");
    const tpl = newKit({ "common/root/AGENTS.md": "# 새 {{PROJECT_NAME}}\n", "stacks/jvm/agents-rules/tech.md": "jvm v2\n" });
    const j = json(await cli("update", ["--json", "--templates", tpl]));
    expect(actionOf(j, "AGENTS.md")).toBe("skip-user");
    expect(actionOf(j, A)).toBe("skip-external");
    expect(actionOf(j, ".agents/rules/tech.md")).toBe("skip-pack");
    expect(actionOf(j, ".agents/rules/structure.md")).toBe("skip-user");
    expect(readText(target, "AGENTS.md")).toBe("# Acme\n");
    expect(readText(target, A)).not.toContain("v2");
    expect(readText(target, ".agents/rules/tech.md")).toBe("jvm Gradle\n");
    expect(exists(target, ".agents/rules/structure.md")).toBe(false);
    const after = new Map(lockEntries(target).map((e) => [e.path, e]));
    const before = new Map((JSON.parse(lockBefore).entries as { path: string }[]).map((e) => [e.path, e]));
    for (const p of ["AGENTS.md", A, ".agents/rules/tech.md", ".agents/rules/structure.md"]) expect(after.get(p)).toEqual(before.get(p));
  });

  it("킷에서 빠진 파일은 orphan 으로 두고, --prune 은 고치지 않은 것만 지운다(빈 폴더 포함)", async () => {
    const files = { ...BASIC_FILES, "common/extra/only.md": "혼자\n", "common/agents-rules/gone.md": "빠질 규칙\n" };
    const { target, cli } = await installedFixture({ files });
    fs.appendFileSync(path.join(target, ".agents/rules/gone.md"), "사람 줄\n");
    const tpl = fixtureTemplates(BASIC_FILES);
    const r = await cli("update", ["--json", "--templates", tpl]);
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(j.counts.orphan).toBe(2);
    expect(j.ops.find((o: { path: string }) => o.path === "extra/only.md")).toMatchObject({ action: "orphan", modified: false });
    expect(j.ops.find((o: { path: string }) => o.path === ".agents/rules/gone.md")).toMatchObject({ action: "orphan", modified: true });
    expect(exists(target, "extra/only.md")).toBe(true);
    expect(lockEntry(target, "extra/only.md")).toBeDefined();
    const p = await cli("update", ["--json", "--prune", "--templates", tpl]);
    expect(p.code).toBe(4);
    const pj = json(p);
    expect(actionOf(pj, "extra/only.md")).toBe("delete");
    expect(actionOf(pj, ".agents/rules/gone.md")).toBe("orphan");
    expect(exists(target, "extra")).toBe(false);
    expect(lockEntry(target, "extra/only.md")).toBeUndefined();
    expect(readText(target, ".agents/rules/gone.md")).toContain("사람 줄");
    expect(lockEntry(target, ".agents/rules/gone.md")).toBeDefined();
  });

  it("--forget 은 그 경로를 user · none 으로 바꿔 다음부터 받지 않는다(R3.3)", async () => {
    const { target, cli } = await installedFixture();
    const r = await cli("update", ["--json", "--forget", "AGENTS.md", "--templates", newKit()]);
    expect(r.code, r.stdout).toBe(0);
    expect(actionOf(json(r), "AGENTS.md")).toBe("forget");
    expect(lockEntry(target, "AGENTS.md")).toEqual({ path: "AGENTS.md", op: "none", owner: "user" });
    fs.rmSync(path.join(target, "AGENTS.md"));
    const again = await cli("update", ["--json", "--templates", newKit({ "common/root/AGENTS.md": "# 새 판\n" })]);
    expect(again.code).toBe(0);
    expect(actionOf(json(again), "AGENTS.md")).toBe("skip-user");
    expect(exists(target, "AGENTS.md")).toBe(false);
    for (const bad of ["nope.md", "../x.md", "/etc/hosts"]) {
      expect((await cli("update", ["--forget", bad, "--templates", newKit()])).code).toBe(2);
    }
  });

  it("v1 lock(TSV) · v1 메타(setup.sh 설치)를 읽어 v2 로 쓰고 모르는 키를 둔다(R3.2)", async () => {
    const { target, templates, cli } = await installedFixture();
    const v2 = lockEntries(target);
    const label = (layer: string): string => layer.replace(/^stacks\/([^/]+)\/arch\//, "$1/").replace(/^stacks\//, "").replace(/^domains\//, "").replace(/^optional\//, "mod/");
    const lines = ["# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path"];
    for (const e of v2) lines.push(`${e.path === "AGENTS.md" ? "-" : e.sha256}\t${label(e.layer)}\tcore\t${e.path}`);
    const v1Text = `${lines.join("\n")}\n`;
    fs.writeFileSync(path.join(target, LOCK_FILE), v1Text);
    const meta = readJsonFile(path.join(target, META_FILE));
    writeJsonFile(path.join(target, META_FILE), {
      kitVersion: "1.0.8",
      domain: "backend",
      stack: "jvm",
      arch: "hexagonal",
      agents: ["claude"],
      modules: [],
      installedAt: "2026-10-01",
      updatedAt: "2026-10-01",
      tokens: meta.tokens,
      issueKey: { source: "kit", prefix: "ACME" },
      git: { base: "main" },
      verify: { fullOnlyInCI: true },
      teamNote: "keep",
      custom: { x: 1 },
    });
    const r = await cli("update", ["--json", "--templates", templates]);
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(j.formats).toEqual({ meta: "v1", lock: "v1" });
    expect(j.kit.from).toBe("1.0.8");
    expect(j.counts.conflict).toBe(0);
    const lock = readJsonFile(path.join(target, LOCK_FILE));
    expect(lock.schema).toBe("harness-kit.lock/v2");
    expect(lock.entries).toHaveLength(v2.length);
    expect(lock.entries.map((e: { layer: string }) => e.layer).sort()).toEqual(v2.map((e) => e.layer).sort());
    expect(lockEntry(target, "AGENTS.md")?.sha256).toBe(sha256Hex("# Acme\n"));
    expect(fs.readFileSync(path.join(target, ".agents/state/harness-kit.lock.v1.bak"), "utf8")).toBe(v1Text);
    const m = readJsonFile(path.join(target, META_FILE));
    expect(m).toMatchObject({
      schema: "harness-kit/v2",
      kit: { version: VERSION },
      project: { name: "Acme", slug: "acme" },
      git: { base: "main", worktreeRoot: "../{repo}.worktrees" },
      flow: { design: "kit" },
      teamNote: "keep",
      custom: { x: 1 },
      installedAt: "2026-10-01",
    });
    expect(m).not.toHaveProperty("kitVersion");
    const d = await run(["doctor", "--check", "--json", "--cwd", target]);
    expect(d.code, d.stdout).toBe(0);
    expect(json(d).findings.map((f: { kind: string }) => f.kind)).not.toContain("lock-v1");
  });

  it("메타 토큰을 쓰고, 같은 이름 환경변수가 있으면 그것이 이긴다", async () => {
    const { target, templates, cli } = await installedFixture();
    expect(json(await cli("update", ["--json", "--templates", templates])).counts.update).toBe(0);
    const r = await cli("update", ["--json", "--templates", templates], { env: { PROJECT_NAME: "Other" } });
    expect(r.code).toBe(0);
    expect(readText(target, "AGENTS.md")).toBe("# Other\n");
    expect(readJsonFile(path.join(target, META_FILE)).tokens.PROJECT_NAME).toBe("Other");
  });

  it("메타의 모듈 템플릿이 킷에서 빠지면 경고하고 빼며, 그 파일은 orphan", async () => {
    const { target, cli } = await installedFixture({ modules: "jira-workflow" });
    expect(exists(target, ".agents/rules/jira.md")).toBe(true);
    const tpl = newKit({}, ["optional/jira-workflow/agents-rules/jira.md"]);
    const j = json(await cli("update", ["--json", "--templates", tpl]));
    expect(j.droppedModules).toEqual(["jira-workflow"]);
    expect(actionOf(j, ".agents/rules/jira.md")).toBe("orphan");
    expect(readJsonFile(path.join(target, META_FILE)).modules).toEqual([]);
  });

  it("메타의 없앤 모듈 platform-guards 는 '공통 층에 포함됨' 한 줄과 함께 메타에서 뺀다 — 파일은 그대로(HK-25 R2)", async () => {
    const { target, cli } = await installedFixture({ modules: "jira-workflow" });
    const meta = readJsonFile(path.join(target, META_FILE));
    writeJsonFile(path.join(target, META_FILE), { ...meta, modules: ["platform-guards", "jira-workflow"] });
    const r = await cli("update", ["--json", "--templates", newKit()]);
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(j.retiredModules).toEqual(["platform-guards"]);
    expect(j.droppedModules).toEqual([]);
    expect(j.selection.modules).toEqual(["jira-workflow"]);
    expect(readJsonFile(path.join(target, META_FILE)).modules).toEqual(["jira-workflow"]);
    expect(readText(target, "scripts/guards/_template.sh")).toBe("common\n");
    writeJsonFile(path.join(target, META_FILE), { ...readJsonFile(path.join(target, META_FILE)), modules: ["platform-guards"] });
    const human = await cli("update", ["--templates", newKit()]);
    expect(human.stdout.split("\n").filter((l) => l.includes("platform-guards 모듈은 공통 층에 포함됨")).length).toBe(1);
  });
});

describe("update — 상태 · 버전 · 플래그", () => {
  it("설치 안 됨 · lock 없음 · lock 깨짐은 exit 3", async () => {
    expect((await run(["update", "--cwd", tmpDir()])).code).toBe(3);
    const a = await installedFixture();
    fs.rmSync(path.join(a.target, LOCK_FILE));
    expect((await a.cli("update", ["--templates", a.templates])).code).toBe(3);
    const b = await installedFixture();
    fs.writeFileSync(path.join(b.target, LOCK_FILE), "{ 깨짐");
    const j = await b.cli("update", ["--json", "--templates", b.templates]);
    expect(j.code).toBe(3);
    expect(json(j).error.code).toBe(3);
  });

  it("설치된 킷이 CLI 보다 새것이면 exit 3, --to <CLI 버전> 이면 진행, 다른 --to 는 exit 2", async () => {
    const { target, templates, cli } = await installedFixture();
    const file = path.join(target, META_FILE);
    writeJsonFile(file, { ...readJsonFile(file), kit: { version: "9.0.0" } });
    const before = readTree(target);
    const newer = await cli("update", ["--templates", templates]);
    expect(newer.code).toBe(3);
    expect(newer.stderr).toContain("--to");
    expect(readTree(target)).toEqual(before);
    expect((await cli("update", ["--to", "9.0.0", "--templates", templates])).code).toBe(2);
    expect((await cli("update", ["--to", "github:acme/harness-starter-kit#v9.0.0", "--templates", templates])).code).toBe(2);
    const down = await cli("update", ["--json", "--to", VERSION, "--templates", templates]);
    expect(down.code, down.stdout).toBe(0);
    expect(readJsonFile(file).kit.version).toBe(VERSION);
  });

  it("lock 에 모르는 op 가 있으면 쓰기 전에 exit 3(HK-13 뒤 mirror · render · merge 는 받는다)", async () => {
    const { target, templates, cli } = await installedFixture();
    patchLock(target, { ".claude/settings.json": { op: "symlink", owner: "kit" } });
    fs.rmSync(path.join(target, "AGENTS.md"));
    const before = readTree(target);
    const r = await cli("update", ["--json", "--templates", templates]);
    expect(r.code).toBe(3);
    expect(json(r).error.message).toMatch(/모른다|지원하지 않는다/);
    expect(readTree(target)).toEqual(before);
  });

  it("배치 상수(projection.json)가 없는 킷으로 update 하면 mirror · render · merge 항목을 그대로 둔다", async () => {
    for (const op of ["mirror", "render", "merge"]) {
      const { target, templates, cli } = await installedFixture();
      patchLock(target, { ".claude/x": { op, owner: "kit", sha256: null, keys: ["block:claude"] } });
      const r = await cli("update", ["--json", "--templates", templates]);
      expect(r.code, r.stdout).toBe(0);
      expect(lockEntry(target, ".claude/x")).toMatchObject({ op, owner: "kit" });
    }
  });

  it("lock 의 리포 밖 경로는 쓰기 전에 exit 3", async () => {
    const { target, templates, cli } = await installedFixture();
    patchLock(target, { "../outside.md": { op: "copy", owner: "kit", sha256: null, layer: "common" } });
    expect((await cli("update", ["--templates", templates])).code).toBe(3);
    expect(fs.existsSync(path.join(path.dirname(target), "outside.md"))).toBe(false);
  });

  it("--tools 는 켠 외부 도구 모듈이 없으면 그렇게 알린다(--packs 는 packs.test.ts, 도구가 있는 경로는 modules-engine.test.ts)", async () => {
    const { templates, cli } = await installedFixture();
    const tools = await cli("update", ["--tools", "--templates", templates]);
    expect(tools.code).toBe(0);
    expect(tools.stdout).toContain("켜 둔 외부 도구 모듈이 없다");
  });
});

describe("update · uninstall — 설계 02 §5 완료 기준 3(실제 템플릿)", () => {
  it("고친 git-workflow.md 는 .new 1개와 exit 4, uninstall 뒤 남는 킷 파일은 그 파일 하나", async () => {
    const target = path.join(tmpDir(), "acme");
    const init = await run(["init", "--yes", "--templates", REAL_TEMPLATES, "--cwd", target, "--agents", "claude"], { env: { PROJECT_NAME: "Acme", PROJECT_SLUG: "acme" } });
    expect(init.code, init.stdout + init.stderr).toBe(0);
    const kitFiles = [...lockEntries(target).map((e) => e.path as string), ".agents/harness.json"];
    const rule = ".agents/rules/git-workflow.md";
    fs.appendFileSync(path.join(target, rule), "\n사람이 더한 줄\n");
    const next = path.join(tmpDir("hk-next-"), "templates");
    fs.cpSync(REAL_TEMPLATES, next, { recursive: true });
    fs.appendFileSync(path.join(next, "common/agents-rules/git-workflow.md"), "\n새 판 줄\n");
    const u = await run(["update", "--json", "--templates", next, "--cwd", target]);
    expect(u.code, u.stdout).toBe(4);
    const news = [...readTree(target).keys()].filter((p) => p.endsWith(".new"));
    expect(news).toEqual([`${rule}.new`]);
    const un = await run(["uninstall", "--yes", "--json", "--cwd", target]);
    expect(un.code, un.stdout).toBe(4);
    const left = kitFiles.filter((p) => exists(target, p));
    expect(left).toEqual([rule]);
    expect(exists(target, `${rule}.new`)).toBe(false);
    expect(exists(target, LOCK_FILE)).toBe(false);
    expect(exists(target, META_FILE)).toBe(false);
  });
});

// 보드 — update 뒤 board.sh --check 가 실패하면 한 번 다시 만든다(HK-12 R12.9, update.sh rebuild_board 와 같은 조건).
const BOARD = [
  "#!/usr/bin/env bash",
  'if [ "${1:-}" = --check ]; then [ ! -f .agents/board-stale ]; exit $?; fi',
  "[ -f .agents/board-broken ] && exit 3",
  "rm -f .agents/board-stale; echo rebuilt >> .agents/board.txt",
  "",
].join("\n");

describe("update — SDD 보드", () => {
  const files = { ...BASIC_FILES, "common/scripts/board.sh": BOARD };

  it("보드가 낡았으면 한 번 다시 만들고, 맞으면 아무것도 하지 않는다", async () => {
    const { target, templates, cli } = await installedFixture({ files });
    writeTree(target, { ".agents/board-stale": "x\n" });
    const r = await cli("update", ["--json", "--templates", templates]);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stderr).toBe("");
    expect(json(r).board).toEqual({ status: "rebuilt" });
    expect(readText(target, ".agents/board.txt")).toBe("rebuilt\n");
    const again = await cli("update", ["--json", "--templates", templates]);
    expect(json(again).board).toEqual({ status: "ok" });
    expect(readText(target, ".agents/board.txt")).toBe("rebuilt\n");
    const human = await cli("update", ["--templates", templates]);
    expect(human.stdout).not.toContain("보드");
  });

  it("--dry-run · 보드 코드가 사람 판(conflict · user)이면 실행하지 않는다", async () => {
    const { target, templates, cli } = await installedFixture({ files });
    writeTree(target, { ".agents/board-stale": "x\n" });
    expect(json(await cli("update", ["--json", "--dry-run", "--templates", templates])).board).toMatchObject({ status: "skipped" });
    fs.appendFileSync(path.join(target, "scripts/board.sh"), "echo mine >> .agents/board.txt\n");
    const r = await cli("update", ["--json", "--templates", fixtureTemplates({ ...files, "common/scripts/board.sh": `${BOARD}# v2\n` })]);
    expect(r.code).toBe(4);
    expect(json(r).board).toMatchObject({ status: "skipped" });
    expect(exists(target, ".agents/board.txt")).toBe(false);
  });

  it("다시 만들기가 실패하면 경고만 하고 종료 코드는 그대로다", async () => {
    const { target, templates, cli } = await installedFixture({ files });
    writeTree(target, { ".agents/board-stale": "x\n", ".agents/board-broken": "x\n" });
    const r = await cli("update", ["--json", "--templates", templates]);
    expect(r.code, r.stdout).toBe(0);
    expect(json(r).board).toMatchObject({ status: "failed" });
    const human = await cli("update", ["--templates", templates]);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("보드");
  });
});
