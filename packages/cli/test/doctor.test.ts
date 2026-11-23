import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASIC_FILES, fixtureTemplates, json, readTree, REAL_TEMPLATES, run, tmpDir } from "./helpers";

const ENV = { PROJECT_NAME: "Acme", PROJECT_SLUG: "acme" };

async function installed(files: Record<string, string> = BASIC_FILES) {
  const templates = fixtureTemplates(files);
  const target = path.join(tmpDir(), "acme");
  const r = await run(["init", "--yes", "--templates", templates, "--cwd", target, "--agents", "claude"], { env: ENV });
  expect(r.code, r.stderr).toBe(0);
  const doctor = async (...extra: string[]) => run(["doctor", "--cwd", target, ...extra]);
  return { target, doctor };
}

function kinds(j: Record<string, any>): string[] {
  return (j.findings as { kind: string }[]).map((f) => f.kind);
}

describe("doctor", () => {
  it("새 설치 직후 --check 는 0, 발견 없음(R4.2)", async () => {
    const { doctor } = await installed();
    const r = await doctor("--check");
    expect(r.code, r.stdout).toBe(0);
    const j = json(await doctor("--check", "--json"));
    expect(j.summary).toMatchObject({ missing: 0, drifted: 0, errors: 0, warnings: 0 });
    expect(j.summary.ok).toBeGreaterThan(5);
    expect(j.findings).toEqual([]);
    expect(j.kit.installed).toBe(j.kit.cli);
  });

  it("킷 파일을 지우면 missing(오류) · --check 1, 고치면 drifted(정보)", async () => {
    const { target, doctor } = await installed();
    fs.rmSync(path.join(target, ".agents/rules/a.md"));
    fs.appendFileSync(path.join(target, "AGENTS.md"), "사람이 쓴 줄\n");
    const r = await doctor("--check", "--json");
    expect(r.code).toBe(1);
    const j = json(r);
    expect(j.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "missing", severity: "error", path: ".agents/rules/a.md" }),
        expect.objectContaining({ kind: "drifted", severity: "info", path: "AGENTS.md" }),
      ]),
    );
    expect(j.summary).toMatchObject({ missing: 1, drifted: 1, errors: 1 });
    expect((await doctor()).code).toBe(0);
    const human = await doctor("--check");
    expect(human.code).toBe(1);
    expect(human.stdout).toContain(".agents/rules/a.md");
  });

  it("고친 파일만 있으면 --check 는 0", async () => {
    const { target, doctor } = await installed();
    fs.appendFileSync(path.join(target, "AGENTS.md"), "x\n");
    expect((await doctor("--check")).code).toBe(0);
  });

  it("아무것도 쓰지 않는다(R4.1)", async () => {
    const { target, doctor } = await installed();
    fs.rmSync(path.join(target, ".agents/rules/a.md"));
    const before = readTree(target);
    await doctor("--check");
    await doctor("--json");
    expect(readTree(target)).toEqual(before);
  });

  it("--only 로 거르고, 모르는 종류는 2", async () => {
    const { target, doctor } = await installed();
    fs.rmSync(path.join(target, ".agents/rules/a.md"));
    fs.appendFileSync(path.join(target, "AGENTS.md"), "x\n");
    expect(kinds(json(await doctor("--json", "--only", "drifted")))).toEqual(["drifted"]);
    expect((await doctor("--only", "nope")).code).toBe(2);
  });

  it("설치 안 됨은 exit 3, 메타 · lock 이 깨지면 오류", async () => {
    expect((await run(["doctor", "--cwd", tmpDir()])).code).toBe(3);
    const a = await installed();
    fs.writeFileSync(path.join(a.target, ".agents/harness-kit.json"), "{ 깨짐");
    const ma = await a.doctor("--check", "--json");
    expect(ma.code).toBe(1);
    expect(kinds(json(ma))).toContain("meta-invalid");
    const b = await installed();
    fs.rmSync(path.join(b.target, ".agents/harness-kit.lock"));
    const lb = await b.doctor("--check", "--json");
    expect(lb.code).toBe(1);
    expect(kinds(json(lb))).toContain("lock-invalid");
  });

  it("lock 의 리포 밖 경로는 따라가지 않고 lock-invalid 로 낸다", async () => {
    const { target, doctor } = await installed();
    const file = path.join(target, ".agents/harness-kit.lock");
    const lock = JSON.parse(fs.readFileSync(file, "utf8"));
    lock.entries.push({ path: "../outside.md", op: "copy", owner: "kit", sha256: null, layer: "common" });
    lock.entries.push({ path: "/etc/hosts", op: "copy", owner: "kit", sha256: null, layer: "common" });
    fs.writeFileSync(file, JSON.stringify(lock));
    const r = await doctor("--check", "--json");
    expect(r.code).toBe(1);
    const j = json(r);
    const bad = j.findings.find((f: { kind: string }) => f.kind === "lock-invalid");
    expect(bad.detail.paths).toEqual(["../outside.md", "/etc/hosts"]);
    expect(j.findings.some((f: { path?: string; kind: string }) => f.path === "/etc/hosts" && f.kind !== "lock-invalid")).toBe(false);
  });

  it("v1 lock(setup.sh) 은 lock-v1 정보로 내고 항목을 본다", async () => {
    const { target, doctor } = await installed();
    const lock = JSON.parse(fs.readFileSync(path.join(target, ".agents/harness-kit.lock"), "utf8"));
    const lines = ["# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path"];
    for (const e of lock.entries) lines.push(`${e.sha256}\tcommon\tcore\t${e.path}`);
    fs.writeFileSync(path.join(target, ".agents/harness-kit.lock"), `${lines.join("\n")}\n`);
    const j = json(await doctor("--json"));
    expect(kinds(j)).toEqual(["lock-v1"]);
    expect(j.summary.ok).toBe(lock.entries.length);
  });

  it("버전: 설치가 CLI 보다 새것이면 오류, 옛것이면 경고", async () => {
    const { target, doctor } = await installed();
    const file = path.join(target, ".agents/harness-kit.json");
    const meta = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify({ ...meta, kit: { version: "9.0.0" } }));
    const newer = await doctor("--check", "--json");
    expect(newer.code).toBe(1);
    expect(json(newer).findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "version-mismatch", severity: "error" })]));
    fs.writeFileSync(file, JSON.stringify({ ...meta, kit: { version: "1.0.8" } }));
    const older = await doctor("--check", "--json");
    expect(older.code).toBe(0);
    expect(json(older).findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "version-mismatch", severity: "warn" })]));
  });

  it(".gitignore 에 상태 폴더가 없으면 경고, 진입 파일이 24KB 를 넘으면 경고", async () => {
    const files: Record<string, string> = { ...BASIC_FILES, "common/root/.gitignore": ".agents/state/\n", "common/root/AGENTS.md": `${"가".repeat(9000)}\n` };
    const { doctor } = await installed(files);
    const r = await doctor("--check", "--json");
    expect(r.code).toBe(0);
    const j = json(r);
    const gi = j.findings.find((f: { kind: string }) => f.kind === "gitignore");
    expect(gi).toMatchObject({ severity: "warn", path: ".gitignore" });
    expect(gi.detail.missing).toEqual([".agents/local/", ".agents/reports/"]);
    const es = j.findings.find((f: { kind: string }) => f.kind === "entry-size");
    expect(es).toMatchObject({ severity: "warn", detail: { limit: 24576 } });
    expect(es.detail.bytes).toBeGreaterThan(24576);
  });

  it("실제 템플릿 새 설치: doctor --check 0, 오류 0", async () => {
    const target = path.join(tmpDir(), "acme");
    const hasPython = spawnSync("python3", ["--version"]).status === 0;
    const r = await run(["init", "--yes", "--templates", REAL_TEMPLATES, "--cwd", target, "--agents", "all", "--modules", "all"], { env: ENV });
    expect(r.code, r.stderr).toBe(0);
    if (hasPython) expect(fs.existsSync(path.join(target, "docs/features/index.html"))).toBe(true);
    const d = await run(["doctor", "--check", "--json", "--cwd", target]);
    expect(d.code, d.stdout).toBe(0);
    const j = json(d);
    expect(j.summary).toMatchObject({ errors: 0, missing: 0, drifted: 0 });
  });
});
