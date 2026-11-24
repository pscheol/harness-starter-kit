import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED } from "../src/commands/reserved";
import { BASIC_FILES, CLI_DIR, fixtureTemplates, json, readTree, run, tmpDir, writeTree } from "./helpers";

const VERSION = (JSON.parse(fs.readFileSync(path.join(CLI_DIR, "package.json"), "utf8")) as { version: string }).version;
const ENV = { PROJECT_NAME: "Acme", PROJECT_SLUG: "acme" };

function setup() {
  const templates = fixtureTemplates(BASIC_FILES);
  const target = path.join(tmpDir(), "acme");
  const init = (...extra: string[]) =>
    run(["init", "--yes", "--templates", templates, "--cwd", target, "--agents", "claude", ...extra], { env: ENV });
  return { templates, target, init };
}

describe("진입점", () => {
  it("--version · -v", async () => {
    expect(await run(["--version"])).toMatchObject({ code: 0, stdout: `${VERSION}\n` });
    expect((await run(["-v"])).stdout).toBe(`${VERSION}\n`);
  });

  it("--help 는 0, 명령 없음은 사용법과 2", async () => {
    const help = await run(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("init");
    const none = await run([]);
    expect(none.code).toBe(2);
    expect(none.stderr).toContain("init");
  });

  it("모르는 명령 · 모르는 플래그는 2", async () => {
    expect((await run(["frobnicate"])).code).toBe(2);
    const bad = await run(["init", "--bogus"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("--bogus");
    expect((await run(["doctor", "--stack", "jvm"])).code).toBe(2);
  });

  it.each(["update", "repair", "uninstall", "outdated"])("%s 는 예약 명령이 아니다(설치 안 된 폴더면 exit 3, HK-11 · HK-12)", async (cmd) => {
    const r = await run([cmd, "--yes", "--cwd", tmpDir()]);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("init");
  });

  it.each(["add", "remove"])("%s 는 예약 명령이 아니다 — 이름을 위치 인자로 받고, 설치 안 된 폴더면 exit 3(HK-12)", async (cmd) => {
    const r = await run([cmd, "codex", "--cwd", tmpDir()]);
    expect(r.code, r.stderr).toBe(3);
    expect(r.stderr).toContain("init");
    expect((await run([cmd, "--cwd", tmpDir()])).code).toBe(2);
  });

  it("add · remove 밖의 명령은 위치 인자를 받지 않는다", async () => {
    for (const cmd of ["update", "doctor", "outdated"]) expect((await run([cmd, "extra", "--cwd", tmpDir()])).code).toBe(2);
  });

  it("pack 은 HK-14 부터 명령이다 — 하위 명령 없으면 exit 2", async () => {
    const r = await run(["pack"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("pack new");
  });

  it("예약 명령이 더는 없다 — 설계의 명령을 모두 제공하고, 모르는 명령은 exit 2(HK-20 · HK-21 까지)", async () => {
    expect(Object.keys(RESERVED)).toEqual([]);
    const r = await run(["nosuch"]);
    expect([r.code, r.stderr.includes("모르는 명령")]).toEqual([2, true]);
    const j = await run(["nosuch", "--json"]);
    expect([j.code, json(j).error.code]).toEqual([2, 2]);
  });

  it("Node 18.3 미만이면 exit 5 와 필요한 버전(util.parseArgs 는 18.3 부터)", async () => {
    for (const argv of [["init"], ["--version"], ["doctor", "--json"]]) {
      for (const v of ["16.20.2", "18.2.1"]) {
        const r = await run(argv, { nodeVersion: v });
        expect(r.code).toBe(5);
        expect(r.stdout + r.stderr).toContain("Node 18.3");
      }
    }
    expect((await run(["--version"], { nodeVersion: "18.3.0" })).code).toBe(0);
    expect((await run(["--version"], { nodeVersion: "v22.1.0" })).code).toBe(0);
  });

  it("Object 프로토타입 이름은 모르는 명령이다", async () => {
    for (const cmd of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const r = await run([cmd]);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("모르는 명령");
    }
  });

  it("템플릿 폴더가 없으면 exit 5", async () => {
    const r = await run(["plan", "--templates", path.join(tmpDir(), "none"), "--cwd", tmpDir()]);
    expect(r.code).toBe(5);
  });
});

describe("init · plan", () => {
  it("init 이 파일 · 메타 v2 · lock v2 · 매니페스트를 쓴다(R2.4)", async () => {
    const { target, init } = setup();
    const r = await init("--modules", "zz-overlap");
    expect(r.code, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8")).toBe("# Acme\n");
    expect(fs.statSync(path.join(target, "scripts/run.sh")).mode & 0o111).not.toBe(0);
    expect(fs.statSync(path.join(target, "AGENTS.md")).mode & 0o111).toBe(0);
    const meta = JSON.parse(fs.readFileSync(path.join(target, ".agents/knots-sync.json"), "utf8"));
    expect(meta).toMatchObject({
      schema: "knots-sync/v2",
      kit: { version: VERSION },
      stack: "jvm",
      agents: ["claude"],
      modules: ["zz-overlap"],
      issueKey: { source: "kit", prefix: "ACME" },
      git: { base: "develop" },
      verify: { fullOnlyInCI: true },
      tokens: { PROJECT_NAME: "Acme", PROJECT_SLUG: "acme" },
      installedAt: "2026-11-23",
    });
    const lock = JSON.parse(fs.readFileSync(path.join(target, ".agents/knots-sync.lock"), "utf8"));
    expect(lock.schema).toBe("knots-sync.lock/v2");
    expect(lock.kit.version).toBe(VERSION);
    expect(lock.kit.source).toMatch(/^file:/);
    const paths = lock.entries.map((e: { path: string }) => e.path);
    expect(paths).toEqual([...paths].sort());
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).not.toContain(".agents/harness.json");
    // 겹치는 경로는 뒤 레이어(모듈)가 이긴다(HK-10 R10.1).
    expect(lock.entries.find((e: { path: string }) => e.path === "scripts/guards/_template.sh")).toMatchObject({ layer: "optional/zz-overlap", owner: "kit" });
    expect(fs.existsSync(path.join(target, ".agents/harness.json"))).toBe(true);
    expect(r.stdout).toContain("생성");
  });

  it("이미 설치된 리포에서 init · plan 은 exit 3 과 update · add 안내(R2.3)", async () => {
    const { target, templates, init } = setup();
    expect((await init()).code).toBe(0);
    const before = readTree(target);
    const again = await init();
    expect(again.code).toBe(3);
    expect(again.stderr).toContain("update");
    expect(again.stderr).toContain("add");
    expect((await run(["plan", "--templates", templates, "--cwd", target, "--agents", "claude"])).code).toBe(3);
    expect(readTree(target)).toEqual(before);
  });

  it("--dry-run · plan 은 아무것도 쓰지 않는다(대상 폴더도 만들지 않는다, R2.2)", async () => {
    const { target, templates, init } = setup();
    const dry = await init("--dry-run");
    expect(dry.code).toBe(0);
    expect(fs.existsSync(target)).toBe(false);
    const plan = await run(["plan", "--templates", templates, "--cwd", target, "--agents", "claude"], { env: ENV });
    expect(plan.code).toBe(0);
    expect(plan.stdout).toContain("AGENTS.md");
    expect(fs.existsSync(target)).toBe(false);
  });

  it("plan --json 은 전체 작업 목록, init --json 은 요약 + create 아닌 항목(R8.1)", async () => {
    const { target, templates, init } = setup();
    const plan = await run(["plan", "--json", "--templates", templates, "--cwd", target, "--agents", "claude"], { env: ENV });
    expect(plan.code).toBe(0);
    expect(plan.stderr).toBe("");
    const p = json(plan);
    expect(p.command).toBe("plan");
    expect(p.selection).toMatchObject({ stack: "jvm", arch: "hexagonal", domain: "backend", agents: ["claude"], modules: [] });
    expect(p.counts.create).toBe(p.ops.length);
    expect(p.ops[0]).toMatchObject({ op: "copy", owner: "kit", action: "create" });
    expect(p.ops[0]).not.toHaveProperty("content");
    const quiet = json(await run(["plan", "--json", "--quiet", "--templates", templates, "--cwd", target, "--agents", "claude"], { env: ENV }));
    expect(quiet.ops).toEqual([]);
    writeTree(target, { "AGENTS.md": "# 내 것\n" });
    const r = await init("--json");
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    const j = json(r);
    expect(j.command).toBe("init");
    expect(j.counts["skip-user"]).toBe(1);
    expect(j.ops).toEqual([expect.objectContaining({ path: "AGENTS.md", action: "skip-user", owner: "user" })]);
    expect(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8")).toBe("# 내 것\n");
  });

  it("--json 오류도 stdout 의 JSON 하나다", async () => {
    const { init } = setup();
    const r = await init("--json", "--stack", "rust");
    expect(r.code).toBe(2);
    expect(r.stderr).toBe("");
    expect(json(r)).toMatchObject({ command: "init", error: { code: 2 } });
  });

  it("플래그 토큰 · 이슈 키 · base", async () => {
    const { target, init } = setup();
    const r = await init("--name", "R&D Lab", "--package-ns", "com.acme", "--token", "DOMAIN_EXAMPLE=Order", "--issue-source", "jira", "--issue-prefix", "KNOTS", "--base", "main");
    expect(r.code, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8")).toBe("# R&D Lab\n");
    const meta = JSON.parse(fs.readFileSync(path.join(target, ".agents/knots-sync.json"), "utf8"));
    expect(meta.tokens).toMatchObject({ PROJECT_NAME: "R&D Lab", PACKAGE_NS: "com.acme", DOMAIN_EXAMPLE: "Order" });
    expect(meta.issueKey).toEqual({ source: "jira", prefix: "KNOTS" });
    expect(meta.git.base).toBe("main");
  });

  it.each([
    [["--token", "NOPE=1"]],
    [["--token", "PACKAGE_NS"]],
    [["--slug", "a/b"]],
    [["--slug", ".."]],
    [["--issue-source", "linear"]],
    [["--adopt", "--force"]],
  ])("잘못된 값 %j 는 exit 2", async (extra) => {
    const { init, target } = setup();
    const r = await init(...extra);
    expect(r.code).toBe(2);
    expect(fs.existsSync(path.join(target, ".agents"))).toBe(false);
  });

  it("기능 문서 빌드는 킷이 깐 tools/docs 일 때만 돈다(사람 파일은 실행하지 않는다)", async () => {
    const script = 'open("ran.txt", "w").write("x")\n';
    const templates = fixtureTemplates({ ...BASIC_FILES, "common/tools/docs/feature_docs.py": script, "common/tools/docs/docskit/__init__.py": "" });
    const kit = path.join(tmpDir(), "kit");
    const a = await run(["init", "--yes", "--json", "--templates", templates, "--cwd", kit, "--agents", "claude"], { env: ENV });
    expect(a.code, a.stdout).toBe(0);
    expect(json(a).featureDocs).toEqual({ status: "built" });
    expect(fs.existsSync(path.join(kit, "ran.txt"))).toBe(true);
    const mine = path.join(tmpDir(), "mine");
    writeTree(mine, { "tools/docs/docskit/__init__.py": "raise SystemExit('사람 코드')\n" });
    const b = await run(["init", "--yes", "--json", "--templates", templates, "--cwd", mine, "--agents", "claude"], { env: ENV });
    expect(b.code, b.stdout).toBe(0);
    expect(json(b).featureDocs.status).toBe("skipped");
    expect(fs.existsSync(path.join(mine, "ran.txt"))).toBe(false);
  });

  it("대상이 파일이면 exit 3", async () => {
    const { templates } = setup();
    const file = path.join(tmpDir(), "f");
    fs.writeFileSync(file, "x");
    expect((await run(["init", "--yes", "--templates", templates, "--cwd", file])).code).toBe(3);
  });

  it("TTY 질문으로 빠진 값을 받는다 · 아니오면 130", async () => {
    const { templates } = setup();
    const target = path.join(tmpDir(), "tty");
    const ok = await run(["init", "--templates", templates, "--cwd", target], { env: ENV, isTTY: true, answers: ["web", "", "claude", "none", "y"] });
    expect(ok.code, ok.stderr + ok.stdout).toBe(0);
    const meta = JSON.parse(fs.readFileSync(path.join(target, ".agents/knots-sync.json"), "utf8"));
    expect(meta).toMatchObject({ stack: "web", arch: "nextjs-app", domain: "frontend", agents: ["claude"] });
    const other = path.join(tmpDir(), "tty2");
    const no = await run(["init", "--templates", templates, "--cwd", other, "--stack", "jvm", "--agents", "claude", "--modules", "none"], {
      env: ENV,
      isTTY: true,
      answers: ["", "n"],
    });
    expect(no.code).toBe(130);
    expect(fs.existsSync(path.join(other, ".agents"))).toBe(false);
  });
});

describe("list", () => {
  it("메타 요약 · --files · 설치 안 됨 exit 3", async () => {
    const { target, init } = setup();
    expect((await run(["list", "--cwd", target])).code).toBe(3);
    expect((await init()).code).toBe(0);
    const human = await run(["list", "--cwd", target]);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("jvm");
    const j = json(await run(["list", "--json", "--cwd", target]));
    expect(j).toMatchObject({ command: "list", stack: "jvm", arch: "hexagonal", agents: ["claude"], modules: [], kit: { version: VERSION } });
    expect(j.files).toBeUndefined();
    const f = json(await run(["list", "--json", "--files", "--cwd", target]));
    expect(f.files.total).toBe(f.files.entries.length);
    expect(f.files.byOwner.kit).toBe(f.files.total);
    expect(f.files.byOp.copy).toBe(f.files.total);
  });
});

describe("init · plan — 없앤 모듈 platform-guards(HK-25 R2)", () => {
  it("--modules platform-guards 는 '공통 층에 포함됨' 한 줄과 exit 0, 메타 modules 에 적지 않는다", async () => {
    const { target, init } = setup();
    const r = await init("--modules", "platform-guards,jira-workflow");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("platform-guards 모듈은 공통 층에 포함됨");
    const meta = JSON.parse(fs.readFileSync(path.join(target, ".agents/knots-sync.json"), "utf8"));
    expect(meta.modules).toEqual(["jira-workflow"]);
    const plan = json(await run(["plan", "--json", "--templates", fixtureTemplates(BASIC_FILES), "--cwd", tmpDir(), "--agents", "claude", "--modules", "platform-guards"], { env: ENV }));
    expect(plan.selection.modules).toEqual([]);
    expect(plan.retiredModules).toEqual(["platform-guards"]);
  });

  it("도움말의 모듈 목록에 platform-guards 가 없다", async () => {
    expect((await run(["--help"])).stdout).not.toContain("platform-guards");
  });
});
