// VS Code 설정 병합이 배치 엔진을 타는 모양(HK-15 design §6, 설계 05 §5 #9): init · update · uninstall · TS ↔ Python 동일성.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContext, planRecords, wantsVscode } from "../src/projection/engine";
import { loadSpec } from "../src/projection/spec";
import { FsView } from "../src/projection/view";
import { readText, tmpDir, writeTree } from "./helpers";
import { initWith, projectionTemplates, PY_DIR, python } from "./projection-helpers";

const SETTINGS = '{\n  // 팀 규칙\n  "editor.tabSize": 2,\n  "files.eol": "\\n"\n}\n';

function pre(target: string): void {
  writeTree(target, { ".vscode/settings.json": SETTINGS });
}

describe(".vscode/settings.json 병합", () => {
  it("VS Code 를 안 쓰는 리포(.vscode 없음 · git.ide 없음)는 만들지 않는다", async () => {
    const { target, r } = await initWith(projectionTemplates());
    expect(r.code, r.stdout).toBe(0);
    expect(fs.existsSync(path.join(target, ".vscode"))).toBe(false);
  });

  it("init: .vscode 가 있으면 다른 키 · 주석을 그대로 두고 git.detectWorktrees 한 줄을 더한다, lock 은 jsonc 키", async () => {
    const { target, r } = await initWith(projectionTemplates(), "all", { pre });
    expect(r.code, r.stdout).toBe(0);
    expect(readText(target, ".vscode/settings.json")).toBe('{\n  // 팀 규칙\n  "editor.tabSize": 2,\n  "files.eol": "\\n",\n  "git.detectWorktrees": true\n}\n');
    const lock = JSON.parse(readText(target, ".agents/knots-sync.lock")) as { entries: { path: string; op: string; keys?: string[] }[] };
    expect(lock.entries.find((e) => e.path === ".vscode/settings.json")).toMatchObject({ op: "merge", keys: ["jsonc:git.detectWorktrees"] });
  });

  it("update 를 다시 해도 같다(두 번째 줄이 생기지 않는다)", async () => {
    const { target, cli } = await initWith(projectionTemplates(), "all", { pre });
    const before = readText(target, ".vscode/settings.json");
    const u = await cli("update", ["--yes", "--json"]);
    expect(u.code, u.stdout).toBe(0);
    expect(readText(target, ".vscode/settings.json")).toBe(before);
  });

  it("git.ide 기본값(code)만으로는 .vscode 를 만들지 않는다", async () => {
    const { target, r } = await initWith(projectionTemplates());
    expect(r.code).toBe(0);
    const meta = JSON.parse(readText(target, ".agents/knots-sync.json")) as { git?: { ide?: string } };
    expect(meta.git?.ide).toBe("code");
    expect(fs.existsSync(path.join(target, ".vscode"))).toBe(false);
  });

  it(".vscode 폴더가 뒤늦게 생기면 repair 가 파일을 만들고, uninstall 이 킷이 만든 파일을 지운다", async () => {
    const { target, cli } = await initWith(projectionTemplates());
    fs.mkdirSync(path.join(target, ".vscode"));
    const fixed = await cli("repair", ["--json"]);
    expect(fixed.code, fixed.stdout).toBe(0);
    expect(readText(target, ".vscode/settings.json")).toBe('{\n  "git.detectWorktrees": true\n}\n');
    const un = await cli("uninstall", ["--yes", "--json"]);
    expect(un.code, un.stdout).toBe(0);
    expect(fs.existsSync(path.join(target, ".vscode/settings.json"))).toBe(false);
  });

  it("uninstall: 킷이 더한 줄만 지우고 사람 키 · 주석은 둔다", async () => {
    const { target, cli } = await initWith(projectionTemplates(), "all", { pre });
    const un = await cli("uninstall", ["--yes", "--json"]);
    expect(un.code, un.stdout).toBe(0);
    expect(readText(target, ".vscode/settings.json")).toBe(SETTINGS);
  });

  it("사람이 false 로 둔 값은 덮지 않는다", async () => {
    const own = '{\n  "git.detectWorktrees": false\n}\n';
    const { target } = await initWith(projectionTemplates(), "all", { pre: (t) => writeTree(t, { ".vscode/settings.json": own }) });
    expect(readText(target, ".vscode/settings.json")).toBe(own);
  });

  it("doctor: 새 설치는 오류 0, 사람이 줄을 지우면 merge-missing, repair 가 되살린다", async () => {
    const { target, cli } = await initWith(projectionTemplates(), "all", { pre });
    const ok = await cli("doctor", ["--check", "--json"]);
    expect(ok.code, ok.stdout).toBe(0);
    fs.writeFileSync(path.join(target, ".vscode/settings.json"), SETTINGS);
    const bad = await cli("doctor", ["--check", "--json"]);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain("merge-missing");
    expect(bad.stdout).toContain(".vscode/settings.json");
    const fixed = await cli("repair", ["--json"]);
    expect(fixed.code, fixed.stdout).toBe(0);
    expect(readText(target, ".vscode/settings.json")).toContain('"git.detectWorktrees": true');
  });

  it("TS ↔ Python: plan 기록이 같다", async () => {
    const templates = projectionTemplates();
    const { target } = await initWith(templates, "all", { pre });
    const dir = path.join(tmpDir("hk-vsc-"), "acme");
    fs.cpSync(path.join(target, ".agents"), path.join(dir, ".agents"), { recursive: true });
    fs.mkdirSync(path.join(dir, "scripts/harness"), { recursive: true });
    fs.copyFileSync(path.join(target, "scripts/harness/projection.json"), path.join(dir, "scripts/harness/projection.json"));
    writeTree(dir, { ".vscode/settings.json": '{\n  "a": 1\n}\n' });
    const agents = ["claude", "codex", "cursor", "kiro"];
    const meta = JSON.parse(fs.readFileSync(path.join(dir, ".agents/knots-sync.json"), "utf8")) as { tokens?: Record<string, string> };
    const ts = planRecords(buildContext({ view: new FsView(dir), spec: loadSpec(templates), tokens: { ...(meta.tokens ?? {}), PROTECTED_PATH: "docs/references" }, agents }));
    const py = python([path.join(PY_DIR, "projection.py"), "plan", "--root", dir, "--agents", agents.join(","), "--token", "PROTECTED_PATH=docs/references", "--json"]);
    expect(py.code, py.stdout + py.stderr).toBe(0);
    const pyOps = (JSON.parse(py.stdout) as { ops: unknown[] }).ops;
    expect(pyOps).toEqual(ts);
    expect(ts.some((x) => (x as { path: string }).path === ".vscode/settings.json")).toBe(true);
  });

  it("wantsVscode: .vscode 폴더만 본다", () => {
    const dir = tmpDir("hk-vsc-w-");
    expect(wantsVscode({ view: new FsView(dir) })).toBe(false);
    writeTree(dir, { ".agents/knots-sync.json": JSON.stringify({ git: { ide: "code" } }) });
    expect(wantsVscode({ view: new FsView(dir) })).toBe(false);
    writeTree(dir, { ".vscode/x.json": "{}" });
    expect(wantsVscode({ view: new FsView(dir) })).toBe(true);
  });
});
