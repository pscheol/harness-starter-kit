// TS 어댑터 ↔ Python projection.py 동일성(HK-13 design §9, 03 §3.12), doctor ↔ check_layout.py 동일성(02 §3.11).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContext, planRecords } from "../src/projection/engine";
import { loadSpec } from "../src/projection/spec";
import { FsView } from "../src/projection/view";
import { tmpDir, writeTree } from "./helpers";
import { initWith, projectionTemplates, PY_DIR, python } from "./projection-helpers";

const AGENTS = ["claude", "codex", "cursor", "kiro"];

/** 설치본에서 원본(.agents) · 메타 · projection.json 만 옮긴 폴더(생성물 없음). */
function sourcesOnly(target: string, extra: Record<string, string> = {}): string {
  const dir = path.join(tmpDir("hk-src-"), "acme");
  fs.cpSync(path.join(target, ".agents"), path.join(dir, ".agents"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts/harness"), { recursive: true });
  fs.copyFileSync(path.join(target, "scripts/harness/projection.json"), path.join(dir, "scripts/harness/projection.json"));
  writeTree(dir, extra);
  return dir;
}

/** Python 처럼 메타 토큰(PROJECT_SLUG 등 — Kiro 조율 에이전트 경로)에 --token 을 덧씌운다. */
function tsRecords(dir: string, templates: string): unknown[] {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, ".agents/knots-sync.json"), "utf8")) as { tokens?: Record<string, string> };
  const tokens = { ...(meta.tokens ?? {}), PROTECTED_PATH: "docs/references" };
  return planRecords(buildContext({ view: new FsView(dir), spec: loadSpec(templates), tokens, agents: AGENTS }));
}

function pyRecords(dir: string): unknown[] {
  const r = python([path.join(PY_DIR, "projection.py"), "plan", "--root", dir, "--agents", AGENTS.join(","), "--token", "PROTECTED_PATH=docs/references", "--json"]);
  if (r.code !== 0) throw new Error(r.stdout + r.stderr);
  return (JSON.parse(r.stdout) as { ops: unknown[] }).ops;
}

describe("TS ↔ Python 배치 동일성", () => {
  it("빈 하네스 폴더: mirror · render 해시 · merge 결과가 같다", async () => {
    const templates = projectionTemplates();
    const { target } = await initWith(templates);
    const dir = sourcesOnly(target);
    const ts = tsRecords(dir, templates);
    expect(ts.length).toBeGreaterThan(25);
    expect(pyRecords(dir)).toEqual(ts);
  });

  it("사람 파일이 있는 merge 대상(다른 도구 훅 · 사람 CLAUDE.md · 사람 config.toml · .gitattributes)", async () => {
    const templates = projectionTemplates();
    const { target } = await initWith(templates);
    const dir = sourcesOnly(target, {
      ".claude/settings.json": `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "other" }] }] }, model: "opus" }, null, 2)}\n`,
      "CLAUDE.md": "# 사람\n",
      ".codex/config.toml": '[features]\nweb = true\n\n[agents.worker]\ndescription = "옛"\n',
      ".gitattributes": "*.png binary\n",
    });
    expect(pyRecords(dir)).toEqual(tsRecords(dir, templates));
  });

  it("팩 · 프로젝트 훅 파일(hooks.d)을 합친 결과도 같다(HK-14)", async () => {
    const templates = projectionTemplates();
    const { target } = await initWith(templates);
    const doc = (hooks: Record<string, unknown>[]): string => `${JSON.stringify({ schema: "knots-sync.hooks/v1", hooks }, null, 2)}\n`;
    const dir = sourcesOnly(target, {
      ".agents/hooks.d/acme.json": doc([{ id: "harness-acme-scan", event: "pre-tool", tools: ["write", "shell"], script: "scripts/hooks/acme-scan.sh", timeoutSec: 10, owner: "pack:acme", subagents: true }]),
      ".agents/hooks.d/project.json": doc([
        { id: "harness-session-idle", event: "stop", script: "scripts/hooks/session-register.sh", timeoutSec: 30, owner: "user" },
        { id: "harness-verify-gate", event: "stop", script: "scripts/hooks/x.sh", timeoutSec: 5, owner: "user" },
      ]),
    });
    const ts = tsRecords(dir, templates);
    expect(pyRecords(dir)).toEqual(ts);
    expect(ts.some((r: any) => r.path === ".kiro/hooks/harness-acme-scan.json")).toBe(true);
  });

  it("실제 템플릿 설치본의 원본으로도 같다", async () => {
    const { REAL_TEMPLATES, run, FIXTURE_ENV } = await import("./helpers");
    const target = path.join(tmpDir(), "acme-notes");
    const r = await run(["init", "--yes", "--templates", REAL_TEMPLATES, "--cwd", target, "--agents", "all", "--modules", "all", "--stack", "web"], { env: FIXTURE_ENV });
    expect(r.code, r.stdout.slice(-1500)).toBe(0);
    const dir = sourcesOnly(target);
    expect(pyRecords(dir)).toEqual(tsRecords(dir, REAL_TEMPLATES));
  });
});

describe("doctor ↔ check_layout.py 판정 동일성", () => {
  const PROJECTION_KINDS = new Set(["missing", "drifted", "stale", "symlink-found", "merge-missing", "relative-ref", "skill-model-field", "role-model-locked", "pending-new", "steering-size"]);

  it("망가뜨린 설치본에서 종류 · 경로 목록이 같다", async () => {
    const templates = projectionTemplates();
    const { target, cli } = await initWith(templates);
    fs.appendFileSync(path.join(target, ".agents/rules/kt.md"), "원본 한 줄\n");
    fs.appendFileSync(path.join(target, ".cursor/rules/always.mdc"), "손\n");
    fs.rmSync(path.join(target, ".kiro/steering/multi.md"));
    fs.rmSync(path.join(target, ".claude/rules/always.md"));
    fs.symlinkSync("../../.agents/rules/always.md", path.join(target, ".claude/rules/always.md"));
    fs.rmSync(path.join(target, ".agents/rules/structure.md"));
    writeTree(target, { "CLAUDE.md": "블록 없음\n", ".kiro/steering/kt.md.new": "x\n" });
    const doc = await cli("doctor", ["--json"]);
    const pick = (list: { kind: string; path: string; severity: string }[]): string[] =>
      list.filter((f) => PROJECTION_KINDS.has(f.kind) && f.severity !== "info").map((f) => `${f.kind} ${f.path}`).sort();
    const fromDoctor = pick(JSON.parse(doc.stdout).findings);
    const py = python([path.join(PY_DIR, "check_layout.py"), "--root", target, "--json"]);
    expect(py.code).toBe(1);
    expect(pick(JSON.parse(py.stdout).findings)).toEqual(fromDoctor);
    expect(fromDoctor).toContain("missing .agents/rules/structure.md");
    expect(fromDoctor.length).toBeGreaterThanOrEqual(6);
  });
});
