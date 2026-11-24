/**
 * 승인 기록 파서 fixture 시험(06 §3.7 · §5 완료 기준 8, HK-23 design §2).
 * Node 파서가 tests/fixtures/approvals/cases.json 기대값과 같고, 같은 입력에서 Python 파서(approvals.py)와 결과가 같다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { approvalSha, approvalState, newFileText, parse, renderEntry, reviewDecision } from "../src/approvals";
import { FIXTURES, KIT, python, TEMPLATE_SCRIPTS } from "./helpers";

interface Doc {
  cases: { name: string; input: string; expect: unknown; queries: any[]; reviews: any[] }[];
  docSha: { name: string; input: string; expect: string }[];
  errorCodes: string[];
}

const doc = JSON.parse(fs.readFileSync(path.join(FIXTURES, "cases.json"), "utf8")) as Doc;
const text = (rel: string): string => fs.readFileSync(path.join(FIXTURES, rel)).toString("utf8");

describe("Node 승인 파서 = fixture 기대값", () => {
  it("사례 30건 이상", () => {
    expect(doc.cases.length).toBeGreaterThanOrEqual(30);
  });

  for (const c of doc.cases) {
    it(`parse: ${c.name}`, () => {
      expect(parse(text(c.input))).toEqual(c.expect);
    });
  }

  it("유효성 질의(none · valid · stale · invalid)", () => {
    for (const c of doc.cases) {
      const entries = (c.expect as { entries: any[] }).entries;
      for (const q of c.queries) {
        expect([c.name, approvalState(entries, q.gate, q.sha256, { approvers: q.approvers, groups: q.groups })]).toEqual([c.name, q.expect]);
      }
    }
  });

  it("리뷰 판단 질의", () => {
    for (const c of doc.cases) {
      const entries = (c.expect as { entries: any[] }).entries;
      for (const q of c.reviews) {
        expect([c.name, reviewDecision(entries, q.id, q.fingerprint, { approvers: q.approvers, groups: q.groups })]).toEqual([c.name, q.expect]);
      }
    }
  });

  it("승인 sha(머리 status · state 줄 제외)", () => {
    for (const c of doc.docSha) expect([c.name, approvalSha(fs.readFileSync(path.join(FIXTURES, c.input)))]).toEqual([c.name, c.expect]);
  });

  it("쓴 기록을 다시 읽으면 유효하다", () => {
    const entry = {
      at: "2026-11-23T14:05:12+09:00", gate: "design", decision: "approved",
      approver: { email: "kim@example.com", name: "Kim", group: "dev" },
      target: { name: "design.md", sha256: "a".repeat(64), fingerprint: null, head: null },
      phrase: "B안으로 반영해", path: "dashboard", entryId: "01JDQ4ZK6B7Y0M9W2S3T4V5X6Y",
    };
    const parsed = parse(`${newFileText("DEMO-1")}\n${renderEntry(entry)}`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.key).toBe("DEMO-1");
    expect(parsed.entries[0]?.valid).toBe(true);
    expect(parsed.entries[0]?.approver).toEqual(entry.approver);
  });
});

describe("Node ↔ Python 같은 입력 같은 결과", () => {
  it("fixture 입력 전부와 승인 sha 입력 전부", () => {
    const script = [
      "import json, sys",
      "sys.dont_write_bytecode = True",
      `sys.path.insert(0, ${JSON.stringify(TEMPLATE_SCRIPTS)})`,
      "from harness import approvals",
      "doc = json.load(open(sys.argv[1], encoding='utf-8'))",
      "base = sys.argv[2]",
      "out = {'parse': {}, 'sha': {}}",
      "for c in doc['cases']:",
      "    out['parse'][c['name']] = approvals.parse(open(base + '/' + c['input'], 'rb').read())",
      "for c in doc['docSha']:",
      "    out['sha'][c['name']] = approvals.approval_sha(open(base + '/' + c['input'], 'rb').read())",
      "print(json.dumps(out, ensure_ascii=False))",
    ].join("\n");
    const r = python(["-c", script, path.join(FIXTURES, "cases.json"), FIXTURES], KIT);
    expect(r.code, r.stderr).toBe(0);
    const py = JSON.parse(r.stdout) as { parse: Record<string, unknown>; sha: Record<string, string> };
    for (const c of doc.cases) expect([c.name, parse(text(c.input))]).toEqual([c.name, py.parse[c.name]]);
    for (const c of doc.docSha) expect([c.name, approvalSha(fs.readFileSync(path.join(FIXTURES, c.input)))]).toEqual([c.name, py.sha[c.name]]);
  });
});
