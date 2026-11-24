// `.vscode/settings.json` 병합(HK-15 design §6, 설계 05 R6.1): 공용 fixture 로 Python 판(tests/test_vscode_merge.py)과 같은 바이트를 묶는다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MERGE_KIND, MERGERS } from "../src/projection/merge";
import { VSCODE_LOCK_KEY, vscodeSettingsWant } from "../src/projection/vscode";

interface Case {
  name: string;
  cur: string | null;
  prev: string[];
  merge: { ok: boolean; text?: string; keys?: string[]; created?: boolean; reason?: string };
  unmerge?: { ok: boolean; text: string; empty: boolean };
  missingAfterMerge?: string[];
  missingAfterUnmerge?: string[];
}

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/vscode/cases.json"), "utf8")) as Case[];
const merger = MERGERS["vscode-settings"];
const want = vscodeSettingsWant();

describe("vscode-settings 병합 — 공용 fixture", () => {
  for (const c of cases) {
    it(c.name, () => {
      const merged = merger.merge(c.cur, want, c.prev);
      expect(merged).toEqual(c.merge);
      if (c.unmerge && merged.ok) {
        expect(merger.unmerge(merged.text, merged.keys, want)).toEqual(c.unmerge);
        expect(merger.missing(merged.text, merged.keys, want)).toEqual(c.missingAfterMerge);
        expect(merger.missing(c.unmerge.text, merged.keys, want)).toEqual(c.missingAfterUnmerge);
      }
    });
  }
});

describe("vscode-settings 병합 — 규칙", () => {
  it("다른 키 · 주석 · 들여쓰기는 그대로 두고 한 줄만 더한다", () => {
    const cur = '{\n    // 팀 규칙\n    "editor.tabSize": 2,\n    /* 블록 */\n    "files.eol": "\\n"\n}\n';
    const r = merger.merge(cur, want);
    if (!r.ok) throw new Error(r.reason);
    expect(r.text).toBe('{\n    // 팀 규칙\n    "editor.tabSize": 2,\n    /* 블록 */\n    "files.eol": "\\n",\n    "git.detectWorktrees": true\n}\n');
    expect(r.keys).toEqual([VSCODE_LOCK_KEY]);
  });

  it("더하기 → 빼기가 원래 바이트로 돌아온다(후행 쉼표가 없던 파일)", () => {
    for (const c of cases.filter((x) => x.cur !== null && x.merge.ok && x.merge.keys?.length && x.unmerge)) {
      if (["empty-braces", "single-line", "trailing-comma", "already-true-claimed"].includes(c.name)) continue;
      expect(c.unmerge?.text, c.name).toBe(c.cur);
    }
  });

  it("사람이 값을 바꿔 둔 키는 건드리지 않고 lock 키도 적지 않는다", () => {
    const cur = '{\n  "git.detectWorktrees": false\n}\n';
    const r = merger.merge(cur, want, [VSCODE_LOCK_KEY]);
    expect(r).toEqual({ ok: true, text: cur, keys: [], created: false });
  });

  it("파일이 없으면 만들고 빼면 비었다고 알린다", () => {
    const r = merger.merge(null, want);
    if (!r.ok) throw new Error(r.reason);
    expect(r.created).toBe(true);
    const u = merger.unmerge(r.text, r.keys, want);
    expect(u).toMatchObject({ ok: true, empty: true });
  });

  it("읽을 수 없는 JSONC 는 충돌이고 빼기도 실패한다", () => {
    expect(merger.merge("{ nope", want).ok).toBe(false);
    expect(merger.unmerge("{ nope", [VSCODE_LOCK_KEY], want).ok).toBe(false);
  });

  it("MERGE_KIND 에 등록돼 있다", () => {
    expect(MERGE_KIND[".vscode/settings.json"]).toBe("vscode-settings");
  });
});
