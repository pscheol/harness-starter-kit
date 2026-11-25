// ci 모듈: CI 진입 파일(.gitlab-ci.yml · GitHub Actions 워크플로 · 스택별 실행 환경 액션)은 사람이 켤 때만 깐다.
// 진입 파일이 생기면 다음 push 부터 파이프라인이 돈다. 킷을 갱신했다고 회사 GitLab 파이프라인이 켜지면 안 된다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadModule } from "../src/modules/declaration";
import { exists, lockEntries, lockEntry, readJsonFile, REAL_TEMPLATES, tmpDir } from "./helpers";
import { cli } from "./modules-helpers";

const ENTRY = [".gitlab-ci.yml", ".github/workflows/harness-verify.yml"];
const ACTION = ".github/actions/harness-setup/action.yml";
const CI_FILES = [...ENTRY, ACTION];
const meta = (t: string): Record<string, any> => readJsonFile(path.join(t, ".agents/knots-sync.json"));
const actionsOf = (j: Record<string, any>, p: string): string[] => (j.ops as { path: string; action: string }[]).filter((o) => o.path === p).map((o) => o.action);

function repo(): string {
  const target = path.join(tmpDir("hk-ci-"), "acme");
  fs.mkdirSync(target, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "develop"], { cwd: target, stdio: "ignore" });
  return target;
}

async function init(target: string, templates: string, ...extra: string[]): Promise<void> {
  const r = await cli(target, ["init", "--yes", "--templates", templates, "--stack", "python", "--agents", "claude", "--no-register", ...extra], null);
  expect(r.code, r.stdout + r.stderr).toBe(0);
}

/** 2.0.0-alpha.1 판 템플릿: CI 진입 파일이 common · stacks 층에 있고 ci 모듈이 없다. */
function oldTemplates(): string {
  const dir = path.join(tmpDir("hk-ci-old-"), "templates");
  fs.cpSync(REAL_TEMPLATES, dir, { recursive: true });
  const mod = path.join(dir, "optional/ci");
  fs.cpSync(path.join(mod, "root"), path.join(dir, "common/root"), { recursive: true });
  for (const stack of fs.readdirSync(path.join(mod, "stacks"))) {
    fs.cpSync(path.join(mod, "stacks", stack, "root"), path.join(dir, "stacks", stack, "root"), { recursive: true });
  }
  fs.rmSync(mod, { recursive: true });
  const layoutFile = path.join(dir, "layout.json");
  const layout = readJsonFile(layoutFile);
  layout.modules = (layout.modules as string[]).filter((m) => m !== "ci");
  fs.writeFileSync(layoutFile, `${JSON.stringify(layout, null, 2)}\n`);
  return dir;
}

describe("ci 모듈 선언", () => {
  it("킷 모듈이다. 진입 파일은 모듈에, include 되는 단계 템플릿(ci/)은 공통 층에 남는다", () => {
    const m = loadModule(REAL_TEMPLATES, "ci");
    expect(m.kind).toBe("kit");
    expect(m.requires.tools).toEqual([]);
    const layout = readJsonFile(path.join(REAL_TEMPLATES, "layout.json"));
    expect(layout.modules).toContain("ci");
    expect(layout.externalModules).not.toContain("ci");
    for (const rel of ENTRY) {
      expect(fs.existsSync(path.join(REAL_TEMPLATES, "common/root", rel)), rel).toBe(false);
      expect(fs.existsSync(path.join(REAL_TEMPLATES, "optional/ci/root", rel)), rel).toBe(true);
    }
    for (const stack of fs.readdirSync(path.join(REAL_TEMPLATES, "stacks"))) {
      expect(fs.existsSync(path.join(REAL_TEMPLATES, "stacks", stack, "root", ACTION)), stack).toBe(false);
      expect(fs.existsSync(path.join(REAL_TEMPLATES, "optional/ci/stacks", stack, "root", ACTION)), stack).toBe(true);
    }
    for (const rel of ["common/ci/knots-sync.gitlab-ci.yml", "common/ci/harness.gocd.yaml"]) expect(fs.existsSync(path.join(REAL_TEMPLATES, rel)), rel).toBe(true);
  });
});

describe("ci 모듈: init · add · remove", () => {
  it("기본 init 은 CI 진입 파일을 깔지 않는다(include 되는 ci/ 단계 템플릿은 깐다)", async () => {
    const t = repo();
    await init(t, REAL_TEMPLATES);
    for (const rel of CI_FILES) expect(exists(t, rel), rel).toBe(false);
    expect(exists(t, "ci/knots-sync.gitlab-ci.yml")).toBe(true);
    expect(meta(t).modules).toEqual([]);
  });

  it("init --modules ci 는 진입 파일 둘과 그 스택의 실행 환경 액션을 깐다", async () => {
    const t = repo();
    await init(t, REAL_TEMPLATES, "--modules", "ci");
    for (const rel of ENTRY) expect(lockEntry(t, rel), rel).toMatchObject({ owner: "kit", layer: "optional/ci" });
    expect(lockEntry(t, ACTION)).toMatchObject({ owner: "kit", layer: "optional/ci/stacks/python" });
    expect(fs.readFileSync(path.join(t, ACTION), "utf8")).toContain("하네스 검증 실행 환경(Python)");
    expect(meta(t).modules).toEqual(["ci"]);
    // 모듈 안 stacks/ 는 그 스택 층으로만 깔린다(리포에 stacks/ 폴더가 생기지 않는다)
    expect(exists(t, "stacks")).toBe(false);
  });

  it("add ci 가 세 파일을 깔고, remove ci 가 고치지 않은 것을 지운다. 고친 파일은 남긴다", async () => {
    const t = repo();
    await init(t, REAL_TEMPLATES);
    const add = await cli(t, ["add", "ci", "--yes", "--json", "--templates", REAL_TEMPLATES], null);
    expect(add.code, add.stdout + add.stderr).toBe(0);
    for (const rel of CI_FILES) expect(actionsOf(add.json, rel), rel).toEqual(["create"]);
    expect(meta(t).modules).toEqual(["ci"]);
    expect(lockEntries(t).filter((e) => e.layer?.startsWith("optional/ci")).map((e) => e.path).sort()).toEqual([...CI_FILES].sort());

    fs.appendFileSync(path.join(t, ".gitlab-ci.yml"), "# 사람이 더한 줄\n");
    const rm = await cli(t, ["remove", "ci", "--json", "--templates", REAL_TEMPLATES], null);
    expect(rm.code, rm.stdout + rm.stderr).toBe(4);
    expect(actionsOf(rm.json, ".gitlab-ci.yml")).toEqual(["keep-modified"]);
    for (const rel of [ENTRY[1], ACTION]) {
      expect(actionsOf(rm.json, rel), rel).toEqual(["delete"]);
      expect(exists(t, rel), rel).toBe(false);
    }
    expect(exists(t, ".gitlab-ci.yml")).toBe(true);
    expect(exists(t, ".github")).toBe(false);
    expect(meta(t).modules).toEqual([]);
  });
});

describe("ci 모듈: 진입 파일을 기본으로 깔던 옛 설치의 update", () => {
  it("update 는 세 파일을 '킷에서 빠짐'으로 알리고 지우지 않는다. 모듈을 켜지 않는다", async () => {
    const t = repo();
    await init(t, oldTemplates());
    for (const rel of CI_FILES) expect(lockEntry(t, rel), rel).toMatchObject({ owner: "kit" });
    const up = await cli(t, ["update", "--json", "--templates", REAL_TEMPLATES], null);
    expect(up.code, up.stdout + up.stderr).toBe(0);
    for (const rel of CI_FILES) {
      expect(actionsOf(up.json, rel), rel).toEqual(["orphan"]);
      expect(exists(t, rel), rel).toBe(true);
    }
    expect(meta(t).modules).toEqual([]);
    // 어느 모듈이 그 파일을 까는지 알린다(계속 쓰려면 그 모듈을 켠다)
    expect(up.json.movedToModules).toEqual([{ module: "ci", paths: [...CI_FILES].sort() }]);
    const human = await cli(t, ["update", "--dry-run", "--templates", REAL_TEMPLATES], null);
    expect(human.code, human.stdout + human.stderr).toBe(0);
    expect(human.stdout).toContain("이제 ci 모듈이 깐다");
    expect(human.stdout).toContain("knots-sync add ci");
  });

  it("update --prune 은 고치지 않은 것만 지운다", async () => {
    const t = repo();
    await init(t, oldTemplates());
    fs.appendFileSync(path.join(t, ".gitlab-ci.yml"), "# 사람이 더한 줄\n");
    const up = await cli(t, ["update", "--prune", "--json", "--templates", REAL_TEMPLATES], null);
    expect([0, 4]).toContain(up.code);
    expect(actionsOf(up.json, ".gitlab-ci.yml")).toEqual(["orphan"]);
    expect(exists(t, ".gitlab-ci.yml")).toBe(true);
    for (const rel of [ENTRY[1], ACTION]) {
      expect(actionsOf(up.json, rel), rel).toEqual(["delete"]);
      expect(exists(t, rel), rel).toBe(false);
    }
  });

  it("계속 쓰려면 add ci: 있는 파일을 그대로 두고 lock 레이어만 모듈로 옮긴다", async () => {
    const t = repo();
    await init(t, oldTemplates());
    const before = new Map(CI_FILES.map((rel) => [rel, fs.readFileSync(path.join(t, rel))]));
    const up = await cli(t, ["update", "--json", "--templates", REAL_TEMPLATES], null);
    expect(up.code, up.stdout + up.stderr).toBe(0);
    const add = await cli(t, ["add", "ci", "--yes", "--json", "--templates", REAL_TEMPLATES], null);
    expect(add.code, add.stdout + add.stderr).toBe(0);
    // keep(있는 킷 파일을 그대로 둔다)은 목록에 내지 않고 개수로만 센다
    expect(add.json.counts.keep).toBe(CI_FILES.length);
    for (const rel of CI_FILES) {
      expect(actionsOf(add.json, rel), rel).toEqual([]);
      expect(fs.readFileSync(path.join(t, rel)).equals(before.get(rel) as Buffer), rel).toBe(true);
    }
    expect(lockEntry(t, ".gitlab-ci.yml")).toMatchObject({ owner: "kit", layer: "optional/ci" });
    expect(lockEntry(t, ACTION)).toMatchObject({ owner: "kit", layer: "optional/ci/stacks/python" });
    expect(meta(t).modules).toEqual(["ci"]);
    const again = await cli(t, ["update", "--json", "--templates", REAL_TEMPLATES], null);
    expect(again.code, again.stdout + again.stderr).toBe(0);
    // 켠 뒤의 update 는 같은 판이라 목록에 내지 않는다(same 은 개수로만). 킷에서 빠진 파일도 없다
    for (const rel of CI_FILES) expect(actionsOf(again.json, rel), rel).toEqual([]);
    expect(again.json.counts.orphan).toBe(0);
    expect(again.json.movedToModules).toEqual([]);
  });
});
