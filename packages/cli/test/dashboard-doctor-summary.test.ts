/** 관리 페이지의 doctor 요약: 사람이 고친 킷 파일(drifted · 정보)은 "문제"가 아니라 "참고"다(사용자 지적 2026-11-25 — 정상 파일 18개가 홈에 빨간 "사람이 할 것"으로 떴다). */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { doctorSummary } from "../src/commands/dashboard-deps";
import { BASIC_FILES, fixtureTemplates, run, tmpDir } from "./helpers";

const ENV = { PROJECT_NAME: "Acme", PROJECT_SLUG: "acme" };

async function installed(): Promise<string> {
  const templates = fixtureTemplates(BASIC_FILES);
  const target = path.join(tmpDir(), "acme");
  const r = await run(["init", "--yes", "--templates", templates, "--cwd", target, "--agents", "claude"], { env: ENV });
  expect(r.code, r.stderr).toBe(0);
  return target;
}

describe("doctorSummary(관리 페이지)", () => {
  it("고친 킷 파일만 있으면 status ok · 문제 0 · 참고(notes)에 drifted", async () => {
    const target = await installed();
    fs.appendFileSync(path.join(target, "AGENTS.md"), "사람이 쓴 줄\n");
    const s = doctorSummary(target, { ...process.env, ...ENV });
    expect(s.status).toBe("ok");
    expect(s.problems).toEqual([]);
    expect(s.notes).toEqual([expect.objectContaining({ kind: "drifted", severity: "info", path: "AGENTS.md", label: "내가 고친 킷 파일" })]);
    expect(s.notes?.[0]?.help).toMatch(/정상입니다/);
    expect(s.noteCounts).toEqual({ drifted: 1 });
  });

  it("빠진 킷 파일(missing · 오류)은 문제로 센다 — 심각도를 같이 싣는다", async () => {
    const target = await installed();
    fs.rmSync(path.join(target, ".agents/rules/a.md"));
    const s = doctorSummary(target, { ...process.env, ...ENV });
    expect(s.status).toBe("problems");
    expect(s.problems).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "missing", severity: "error", path: ".agents/rules/a.md" })]));
    expect(s.counts.missing).toBe(1);
  });
});
