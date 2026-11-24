// 바꾸지 않음 시험(설계 12 §3.10 · MR-R12): 하네스 동작 전후로 사람이 정한 세션 모델 · effort 키 값이 같다(파일 sha 가 아니라 키 값).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initWith, projectionTemplates } from "./projection-helpers";

function read(target: string, rel: string): string {
  try {
    return fs.readFileSync(path.join(target, ...rel.split("/")), "utf8");
  } catch {
    return "";
  }
}

/** 금지 키 값 전부: Claude settings(.json · .local.json)의 model · effortLevel, Codex config.toml 최상위 model · model_reasoning_effort. */
function modelKeys(target: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const rel of [".claude/settings.json", ".claude/settings.local.json"]) {
    const text = read(target, rel);
    const j = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    out[`${rel}#model`] = j.model ?? null;
    out[`${rel}#effortLevel`] = j.effortLevel ?? null;
  }
  const toml = read(target, ".codex/config.toml");
  const top = toml.split(/^\[/m)[0] ?? "";
  for (const key of ["model", "model_reasoning_effort"]) out[`.codex/config.toml#${key}`] = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(top)?.[1] ?? null;
  return out;
}

describe("세션 모델 · effort 는 어떤 동작 전후에도 같다(MR-R12)", () => {
  it("init --adopt · update · remove/add · repair · local sync · uninstall", async () => {
    const templates = projectionTemplates();
    const pre = (target: string): void => {
      fs.mkdirSync(path.join(target, ".claude"), { recursive: true });
      fs.mkdirSync(path.join(target, ".codex"), { recursive: true });
      fs.writeFileSync(path.join(target, ".claude/settings.local.json"), JSON.stringify({ model: "opus", effortLevel: "high" }));
      fs.writeFileSync(path.join(target, ".claude/settings.json"), JSON.stringify({ model: "sonnet" }));
      fs.writeFileSync(path.join(target, ".codex/config.toml"), 'model = "team-model"\nmodel_reasoning_effort = "high"\n');
    };
    const t = await initWith(templates, "all", { pre, extra: ["--adopt"] });
    expect(t.r.code, t.r.stdout + t.r.stderr).toBe(0);
    const want = {
      ".claude/settings.json#model": "sonnet", ".claude/settings.json#effortLevel": null,
      ".claude/settings.local.json#model": "opus", ".claude/settings.local.json#effortLevel": "high",
      ".codex/config.toml#model": "team-model", ".codex/config.toml#model_reasoning_effort": "high",
    };
    expect(modelKeys(t.target)).toEqual(want);
    const steps: [string, string[]][] = [
      ["update", ["--yes", "--templates", templates]],
      ["remove", ["codex", "--yes", "--templates", templates]],
      ["add", ["codex", "--yes", "--templates", templates]],
      ["repair", ["--templates", templates]],
      ["local", ["sync", "--templates", templates]],
    ];
    for (const [cmd, args] of steps) {
      const r = await t.cli(cmd, [...args, "--json"]);
      expect([cmd, r.code === 0 || r.code === 4], r.stdout + r.stderr).toEqual([cmd, true]);
      const after = modelKeys(t.target);
      // remove codex 는 사람이 쓴 codex 값을 지우지 않는다(킷 몫만 뺀다)
      expect([cmd, after]).toEqual([cmd, want]);
    }
    const u = await t.cli("uninstall", ["--yes", "--json"]);
    expect([0, 4]).toContain(u.code);
    expect(modelKeys(t.target)).toEqual(want);
  });
});
