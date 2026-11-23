// v1 lock 첫 update 의 병합(HK-25 R1, design §2.2~§2.4) — TS(core/v1-merge) 와 Python(hx-update/v1_merge.py) 이 같은 바이트를 낸다.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MERGE_BEGIN, MERGE_END, planV1Merge } from "../src/core/v1-merge";
import { CLI_DIR, tmpDir } from "./helpers";

const FIXTURES = path.join(CLI_DIR, "test", "fixtures", "v1-merge");
const PY = path.join(CLI_DIR, "..", "legacy-setup", "hx-update", "v1_merge.py");

interface Fixture {
  name: string;
  rel: string;
  kind: string;
  current: Buffer;
  kit: Buffer;
  expected: Buffer | null;
}

function fixtures(): Fixture[] {
  return fs
    .readdirSync(FIXTURES)
    .sort()
    .map((name) => {
      const at = (f: string): Buffer => fs.readFileSync(path.join(FIXTURES, name, f));
      const expected = fs.existsSync(path.join(FIXTURES, name, "expected")) ? at("expected") : null;
      return { name, rel: at("rel").toString("utf8"), kind: at("kind").toString("utf8"), current: at("current"), kit: at("kit"), expected };
    });
}

/** python3 v1_merge.py <설치 경로> <C> <D> <결과> → (종류, 결과 바이트 | null) */
function python(rel: string, current: Buffer, kit: Buffer): { kind: string; content: Buffer | null } {
  const dir = tmpDir("hk-v1merge-");
  const c = path.join(dir, "current");
  const d = path.join(dir, "kit");
  const out = path.join(dir, "out");
  fs.writeFileSync(c, current);
  fs.writeFileSync(d, kit);
  const r = spawnSync("python3", ["-B", PY, rel, c, d, out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`v1_merge.py exit ${r.status}: ${r.stderr}`);
  return { kind: r.stdout.trim(), content: fs.existsSync(out) ? fs.readFileSync(out) : null };
}

/** 결과가 있어야 하는 종류의 기대 바이트(kit 은 킷 판 그대로) */
function want(f: Fixture): Buffer | null {
  if (f.kind === "kit") return f.kit;
  if (f.kind === "new") return null;
  return f.expected;
}

describe("v1 병합 — fixture 마다 TS = 기대 = Python", () => {
  for (const f of fixtures()) {
    it(f.name, () => {
      const ts = planV1Merge(f.rel, f.current, f.kit);
      expect(ts.kind).toBe(f.kind);
      const expected = want(f);
      if (expected === null) expect(ts.content).toBeNull();
      else expect(ts.content?.toString("utf8")).toBe(expected.toString("utf8"));
      const py = python(f.rel, f.current, f.kit);
      expect(py.kind).toBe(f.kind);
      if (expected === null) expect(py.content).toBeNull();
      else expect(py.content?.equals(expected), `${f.name}: python 결과\n${py.content?.toString("utf8")}`).toBe(true);
    });
  }
});

describe("v1 줄 병합 — 성질", () => {
  it("묶음의 뜻 있는 줄은 킷 판에 없고, 묶음을 지우면 킷 판과 같다", () => {
    for (const f of fixtures().filter((x) => x.kind === "lines")) {
      const out = (planV1Merge(f.rel, f.current, f.kit).content as Buffer).toString("utf8");
      const kitLines = new Set(f.kit.toString("utf8").split("\n"));
      const lines = out.split("\n");
      const kept: string[] = [];
      let inBlock = false;
      for (const l of lines) {
        if (l === MERGE_BEGIN) inBlock = true;
        else if (l === MERGE_END) inBlock = false;
        else if (inBlock) {
          if (/[A-Za-z0-9\u0080-\uffff]/.test(l)) expect(kitLines.has(l), `${f.name}: ${l}`).toBe(false);
        } else kept.push(l);
      }
      expect(kept.join("\n"), f.name).toBe(f.kit.toString("utf8"));
    }
  });

  it("UTF-8 이 아닌 문서는 병합하지 않는다(.new) — 두 구현 같다(바이트는 시험이 만든다: 저장소에 잘못된 UTF-8 을 두지 않는다)", () => {
    const current = Buffer.from([0xff, 0xfe, 0x20, 0x61, 0x62, 0x63, 0x0a]);
    const kit = Buffer.from("# 킷\n");
    expect(planV1Merge("docs/bin.md", current, kit)).toEqual({ kind: "new", content: null });
    expect(python("docs/bin.md", current, kit)).toEqual({ kind: "new", content: null });
  });

  it("기준점 칸 수가 1,000,000 을 넘으면 병합하지 않는다(.new) — 두 구현 같다", () => {
    const lines = Array.from({ length: 1001 }, (_, i) => `line ${i}`);
    const current = Buffer.from(`${lines.join("\n")}\n`);
    const kit = Buffer.from(`${[...lines].reverse().join("\n")}\n`);
    expect(planV1Merge("docs/big.md", current, kit)).toEqual({ kind: "new", content: null });
    expect(python("docs/big.md", current, kit)).toEqual({ kind: "new", content: null });
    const small = Buffer.from(`${lines.slice(0, 999).join("\n")}\n`);
    const smallKit = Buffer.from(`${lines.slice(0, 999).reverse().join("\n")}\n`);
    const ts = planV1Merge("docs/big.md", small, smallKit);
    expect(ts.kind).toBe("lines");
    expect(python("docs/big.md", small, smallKit).content?.equals(ts.content as Buffer)).toBe(true);
  });
});
