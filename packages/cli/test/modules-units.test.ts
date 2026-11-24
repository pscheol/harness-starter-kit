// sync units(설계 10 §3.5, MD-R16): tools/harness/sync.py 와 같은 계획 · 같은 --check 줄 형식. 단위 23곳 합성 fixture(knots 사본이 없다).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run, tmpDir, writeTree } from "./helpers";

const readFile = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

const MODULE_DIR = path.resolve(__dirname, "../../templates/optional/multi-harness/tools/harness");
const UNIT_COUNT = 23;

function py(repo: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("python3", [path.join(repo, "tools/harness/sync.py"), "--repo", repo, ...args], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

async function ts(repo: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return run(["sync", "units", "--cwd", repo, ...args], { cwd: repo });
}

/** 23곳 fixture: 상위 리포 + domains/<id>. 조각별 정렬 함정(a-b/c 와 a/b) · CRLF · 실행 파일 · 토큰 · 이름 토큰 · exclude 를 넣는다. */
function fixture(): string {
  const repo = fs.realpathSync(tmpDir("hk-units-"));
  fs.mkdirSync(path.join(repo, "tools/harness"), { recursive: true });
  for (const f of ["sync.py", "sync_safety.py"]) fs.copyFileSync(path.join(MODULE_DIR, f), path.join(repo, "tools/harness", f));
  const units = Array.from({ length: UNIT_COUNT }, (_, i) => ({
    id: `knots-domain-${String(i + 1).padStart(2, "0")}`,
    path: `domains/d${String(i + 1).padStart(2, "0")}`,
    title: `도메인 ${i + 1}`,
    stack: i % 2 ? "jvm" : "electron",
    ...(i === 4 ? { exclude: ["scripts/release/**"] } : {}),
  }));
  const files: Record<string, string> = {
    "tools/harness/units.json": `${JSON.stringify({ schema: "harness-kit.deploy-units/v1", units }, null, 2)}\n`,
    "tools/harness/shared/a/b.md": "a/b {{UNIT_ID}}\n",
    "tools/harness/shared/a-b/c.md": "a-b/c {{UNIT_TITLE}} {{UNIT_STACK}} {{UNIT_PATH}}\n",
    "tools/harness/shared/guide.md": "줄바꿈\r\n테스트 {{UNIT_ID}}\r\n",
    "tools/harness/shared/scripts/run.sh": "#!/bin/sh\necho {{UNIT_ID}}\n",
    "tools/harness/shared/scripts/release/pack.sh": "#!/bin/sh\necho pack\n",
    "tools/harness/shared/docs/__UNIT_ID__-readme.md": "readme\n",
  };
  for (const u of units) fs.mkdirSync(path.join(repo, u.path), { recursive: true });
  writeTree(repo, files);
  fs.chmodSync(path.join(repo, "tools/harness/shared/scripts/run.sh"), 0o755);
  fs.chmodSync(path.join(repo, "tools/harness/shared/scripts/release/pack.sh"), 0o755);
  return repo;
}

const unitFile = (n: number, rel: string): string => `domains/d${String(n).padStart(2, "0")}/${rel}`;

describe("sync units — sync.py 와 같은 결과(MD-R16)", () => {
  it("23곳: python 으로 배포한 뒤 --check 가 둘 다 일치(같은 줄 · exit 0)", async () => {
    const repo = fixture();
    expect(py(repo, []).code).toBe(0);
    const a = py(repo, ["--check"]);
    const b = await ts(repo, ["--check"]);
    expect(a.stdout).toBe(`공통 하네스 파일 일치 — 단위 ${UNIT_COUNT}개\n`);
    expect([b.code, b.stdout]).toEqual([a.code, a.stdout]);
  });

  it("차이가 있을 때 --check 의 stdout 줄 · exit 가 같다(missing · differs · mode · stale · excluded · collision · manifest)", async () => {
    const repo = fixture();
    expect(py(repo, []).code).toBe(0);
    fs.rmSync(path.join(repo, unitFile(3, "a/b.md")));
    fs.writeFileSync(path.join(repo, unitFile(5, "guide.md")), "고쳤다\n");
    fs.chmodSync(path.join(repo, unitFile(6, "scripts/run.sh")), 0o644);
    fs.writeFileSync(path.join(repo, unitFile(7, "extra.md")), "단위 고유\n");
    fs.rmSync(path.join(repo, unitFile(8, ".agents/harness.json")));
    // 원본에서 파일 하나가 사라지고(stale), 새 원본이 단위 고유 파일과 겹친다(collision)
    fs.rmSync(path.join(repo, "tools/harness/shared/docs"), { recursive: true });
    fs.writeFileSync(path.join(repo, "tools/harness/shared/extra.md"), "원본\n");
    // 예전에 배포했던 파일을 exclude 하면 excluded 줄이 난다
    const reg = JSON.parse(fs.readFileSync(path.join(repo, "tools/harness/units.json"), "utf8"));
    reg.units[9].exclude = ["guide.md"];
    fs.writeFileSync(path.join(repo, "tools/harness/units.json"), `${JSON.stringify(reg, null, 2)}\n`);
    const a = py(repo, ["--check"]);
    const b = await ts(repo, ["--check"]);
    expect(a.code).toBe(1);
    expect(a.stdout).toContain("missing: domains/d03/a/b.md");
    expect(a.stdout).toContain("mode differs: domains/d06/scripts/run.sh");
    expect(a.stdout).toContain("collision: domains/d07/extra.md");
    expect(a.stdout).toContain("excluded: domains/d10/guide.md");
    expect(a.stdout).toContain("stale: domains/d01/docs/knots-domain-01-readme.md");
    expect([b.code, b.stdout]).toEqual([a.code, a.stdout]);
    const unit = py(repo, ["--check", "--unit", "knots-domain-03", "--unit", "knots-domain-05"]);
    const unitTs = await ts(repo, ["--check", "--unit", "knots-domain-03", "--unit", "knots-domain-05"]);
    expect([unitTs.code, unitTs.stdout]).toEqual([unit.code, unit.stdout]);
    const adopt = py(repo, ["--check", "--adopt"]);
    const adoptTs = await ts(repo, ["--check"]);
    expect(adopt.stdout).not.toContain("collision:");
    expect(adoptTs.stdout).toContain("collision:");
  });

  it("TS 로 배포한 단위는 python --check 도 일치하고, 파일 · 매니페스트 바이트가 python 배포와 같다", async () => {
    const a = fixture();
    const b = fixture();
    expect(py(a, []).code).toBe(0);
    const out = await ts(b, []);
    expect(out.code, out.stdout + out.stderr).toBe(0);
    expect(py(b, ["--check"]).stdout).toBe(`공통 하네스 파일 일치 — 단위 ${UNIT_COUNT}개\n`);
    for (const n of [1, 5, 23]) {
      for (const rel of ["a/b.md", "a-b/c.md", "guide.md", "scripts/run.sh", ".agents/harness.json"]) {
        expect([n, rel, readFile(b, unitFile(n, rel))]).toEqual([n, rel, readFile(a, unitFile(n, rel))]);
      }
    }
    expect(fs.existsSync(path.join(b, unitFile(5, "scripts/release/pack.sh")))).toBe(false);
    expect(fs.statSync(path.join(b, unitFile(2, "scripts/run.sh"))).mode & 0o111).not.toBe(0);
    // 두 번째 실행은 쓰기 0건
    const again = await ts(b, []);
    expect(again.stdout).toContain("knots-domain-01: 6 shared files, 0 written or removed");
  });

  it("단위 lock 에 layer unit:<id> 항목을 남기고, 사람이 고친 파일은 .new 로 옆에 둔다", async () => {
    const repo = fixture();
    expect((await ts(repo, [])).code).toBe(0);
    const lock = JSON.parse(readFile(repo, unitFile(2, ".agents/harness-kit.lock")));
    const mine = lock.entries.filter((e: { layer: string }) => e.layer === "unit:knots-domain-02");
    expect(mine.map((e: { path: string }) => e.path)).toContain("a/b.md");
    expect(mine.every((e: { owner: string; op: string }) => e.owner === "kit" && e.op === "copy")).toBe(true);
    // 사람이 단위 파일을 고치고 원본도 바뀌면 덮지 않고 .new
    fs.writeFileSync(path.join(repo, unitFile(2, "a/b.md")), "사람이 고침\n");
    fs.writeFileSync(path.join(repo, "tools/harness/shared/a/b.md"), "새 원본 {{UNIT_ID}}\n");
    const out = await ts(repo, []);
    expect(out.code).toBe(4);
    expect(readFile(repo, unitFile(2, "a/b.md"))).toBe("사람이 고침\n");
    expect(readFile(repo, `${unitFile(2, "a/b.md")}.new`)).toBe("새 원본 knots-domain-02\n");
    expect(readFile(repo, unitFile(3, "a/b.md"))).toBe("새 원본 knots-domain-03\n");
    expect(out.stdout).toContain(".new: knots-domain-02/a/b.md.new");
    // 고치지 않은 단위는 정상 덮어쓰기, 고친 단위는 --check 가 계속 differs
    expect((await ts(repo, ["--check"])).stdout).toContain("differs: domains/d02/a/b.md");
  });

  it("목록이 없으면 exit 3, 모르는 단위 · 경로 이탈 · 심볼릭 링크는 거부", async () => {
    const empty = fs.realpathSync(tmpDir("hk-units-empty-"));
    expect((await ts(empty, ["--check"])).code).toBe(3);
    const repo = fixture();
    expect((await ts(repo, ["--check", "--unit", "nope"])).code).toBe(2);
    const reg = JSON.parse(fs.readFileSync(path.join(repo, "tools/harness/units.json"), "utf8"));
    reg.units[0].path = "../escape";
    fs.writeFileSync(path.join(repo, "tools/harness/units.json"), JSON.stringify(reg));
    expect((await ts(repo, ["--check"])).code).toBe(2);
    const sym = fixture();
    fs.symlinkSync("/tmp", path.join(sym, "tools/harness/shared/link"));
    const r = await ts(sym, []);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("symlink");
  });
});
