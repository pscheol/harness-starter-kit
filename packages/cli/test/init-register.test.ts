// init 등록부 자동 등록(사용자 결정 2026-11-24, 06 §3.17): 기본은 더하고 --no-register 면 안 한다.
// 등록부 위치는 HARNESS_KIT_CONFIG_DIR(절대) 또는 HOME — 둘 다 없으면 실제 홈을 추측하지 않고 건너뛴다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_ENV, json, run, tmpDir } from "./helpers";
import { projectionTemplates } from "./projection-helpers";

async function init(env: Record<string, string>, extra: string[] = []) {
  const target = path.join(tmpDir(), "acme");
  fs.mkdirSync(target, { recursive: true });
  const r = await run(["init", "--yes", "--json", "--templates", projectionTemplates(), "--cwd", target, "--agents", "claude", ...extra], { env: { ...FIXTURE_ENV, ...env } });
  expect(r.code, r.stdout + r.stderr).toBe(0);
  return { target, out: json(r) };
}

describe("init 등록부 자동 등록", () => {
  it("HARNESS_KIT_CONFIG_DIR 의 projects.json 에 더하고, 다시 add 하면 이미 있다", async () => {
    const conf = tmpDir();
    const { target, out } = await init({ HARNESS_KIT_CONFIG_DIR: conf });
    expect(out.registry).toMatchObject({ status: "added", file: path.join(conf, "projects.json") });
    const reg = JSON.parse(fs.readFileSync(path.join(conf, "projects.json"), "utf8"));
    expect(reg.projects.map((p: { path: string }) => p.path)).toEqual([fs.realpathSync(target)]);
    expect((fs.statSync(path.join(conf, "projects.json")).mode & 0o777).toString(8)).toBe("600");
    const again = await run(["projects", "add", target, "--json"], { env: { HARNESS_KIT_CONFIG_DIR: conf } });
    expect(json(again)).toMatchObject({ added: false });
  });

  it("--no-register 면 쓰지 않는다", async () => {
    const conf = tmpDir();
    const { out } = await init({ HARNESS_KIT_CONFIG_DIR: conf }, ["--no-register"]);
    expect(out.registry).toEqual({ status: "skipped", reason: "--no-register" });
    expect(fs.existsSync(path.join(conf, "projects.json"))).toBe(false);
  });

  it("HOME 도 HARNESS_KIT_CONFIG_DIR 도 없으면 실제 홈에 쓰지 않고 건너뛴다", async () => {
    const { out } = await init({});
    expect(out.registry).toEqual({ status: "skipped", reason: "HOME 이 없다" });
  });

  it("HOME 이 있으면 그 아래 .config/harness-kit 에 쓴다", async () => {
    const home = tmpDir();
    const { out } = await init({ HOME: home });
    expect(out.registry.file).toBe(path.join(home, ".config/harness-kit/projects.json"));
  });
});
