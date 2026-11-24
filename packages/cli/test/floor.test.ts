// 게이트 하한(설계 04 §3.8 · §5 #7, HK-14 design §6): 상수 · Python 같은 값 · 킷 hooks.json floor · doctor 검사.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOOR_HOOKS, GATE_FLOOR, missingFloorGates } from "../src/core/floor";
import { GATE_FLOOR as DASHBOARD_FLOOR } from "../../dashboard/src/project";
import { initWith, projectionTemplates, PY_DIR } from "./projection-helpers";
import { json, META_FILE, readJsonFile, REAL_TEMPLATES, writeJsonFile } from "./helpers";

function pyFloor(): { gates: string[]; hooks: string[] } {
  const code = `import json, sys; sys.path.insert(0, ${JSON.stringify(PY_DIR)}); import floor; print(json.dumps({"gates": list(floor.GATE_FLOOR), "hooks": list(floor.FLOOR_HOOKS)}))`;
  const r = spawnSync("python3", ["-B", "-c", code], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

describe("하한 상수", () => {
  it("TS = Python = 관리 페이지, 킷 hooks.json 의 floor 훅과 같다", () => {
    expect(pyFloor()).toEqual({ gates: [...GATE_FLOOR], hooks: [...FLOOR_HOOKS] });
    expect(DASHBOARD_FLOOR).toBe(GATE_FLOOR);
    const kit = JSON.parse(fs.readFileSync(path.join(REAL_TEMPLATES, "common/agents-root/hooks.json"), "utf8")).hooks as { id: string; floor?: boolean }[];
    expect(kit.filter((h) => h.floor).map((h) => h.id).sort()).toEqual([...FLOOR_HOOKS].sort());
  });

  it("flow.gates 가 없으면 기본 흐름이라 빠진 것이 없다", () => {
    expect(missingFloorGates(undefined)).toEqual([]);
    expect(missingFloorGates(["requirements", "tasks", "mr", "done"])).toEqual(["design"]);
  });
});

describe("doctor 하한 검사", () => {
  async function installed() {
    const { target, cli } = await initWith(projectionTemplates());
    const meta = path.join(target, META_FILE);
    return { target, cli, meta, edit: (patch: Record<string, unknown>) => writeJsonFile(meta, { ...readJsonFile(meta), ...patch }) };
  }
  const kinds = (r: { stdout: string }): string[] => json(r).findings.map((f: { kind: string }) => f.kind);

  it("design 을 뺀 flow.gates 는 gate-floor 오류 · doctor --check exit 1(04 §5 #7)", async () => {
    const t = await installed();
    expect(kinds(await t.cli("doctor", ["--json"]))).not.toContain("gate-floor");
    t.edit({ flow: { gates: ["requirements", "tasks", "mr", "done"] } });
    const r = await t.cli("doctor", ["--json", "--check"]);
    expect(r.code).toBe(1);
    expect(json(r).findings.find((f: { kind: string }) => f.kind === "gate-floor").detail.missing).toEqual(["design"]);
  });

  it("하한 훅을 hooks.json 에서 지우면 floor-hook-missing 오류", async () => {
    const t = await installed();
    const file = path.join(t.target, ".agents/hooks.json");
    const doc = readJsonFile(file);
    writeJsonFile(file, { ...doc, hooks: doc.hooks.filter((h: { id: string }) => h.id !== "harness-verify-gate") });
    const f = json(await t.cli("doctor", ["--json", "--only", "floor-hook-missing"])).findings;
    expect(f).toHaveLength(1);
    expect(f[0].detail.missing).toEqual(["harness-verify-gate"]);
  });

  it("fullOnlyInCI false 는 full-allowed 경고, approvers 는 비면 조용하고 없는 그룹은 경고", async () => {
    const t = await installed();
    t.edit({ verify: { fullOnlyInCI: false } });
    expect(kinds(await t.cli("doctor", ["--json"]))).toContain("full-allowed");
    t.edit({ verify: { fullOnlyInCI: true }, approvers: {} });
    expect(kinds(await t.cli("doctor", ["--json"]))).not.toContain("approvers");
    t.edit({ approvers: { design: ["leads", "kim@example.com"] }, groups: { devs: ["a@example.com"] } });
    const f = json(await t.cli("doctor", ["--json", "--only", "approvers"])).findings;
    expect(f).toHaveLength(1);
    expect(f[0].hint).toContain("그룹 'leads'");
  });
});
