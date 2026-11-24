/**
 * 흐름 보기 데이터 · Unit 변경 제안(06 §3.16, DB-R29, 완료 기준 18).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/approvals";
import { call, commitAll, docSha, makeRepo, readFile, serve, sha256, writeFile, writeIssue, type Repo } from "./helpers";

const INT = ".agents/docs/intents/INT-7-pay-reform";

const INTENT_MD = [
  "---", "id: INT-7", "key: INT-7", "title: 결제 개편", "status: in-review", "kind: product", "risk: medium", "---", "",
  "# Intent — INT-7 결제 개편", "", "## 6. 스토리와 수용 기준", "",
  "### S-1 결제수단 등록", "- 도메인: payment", "", "### S-2 환불", "- 도메인: payment", "", "### S-3 알림", "- 도메인: billing", "",
].join("\n");

function intentRepo(): Repo {
  const repo = makeRepo();
  writeFile(repo.root, `${INT}/intent.md`, INTENT_MD);
  const units = {
    schema: "knots-sync.units/v1",
    intent: { key: "INT-7", title: "결제 개편", doc: "intent.md" },
    source: { kind: "kit" },
    units: [
      { id: "U-1", name: "payment-method", title: "결제수단 등록", kind: "feature", area: "payment", dependsOn: ["U-4"], provides: [], consumes: ["api:payments.v2"], order: 2, issue: "DEMO-21", planned: true, stories: ["S-1"] },
      { id: "U-2", name: "refund", title: "환불", kind: "feature", area: "payment", dependsOn: ["U-1"], provides: [], consumes: [], order: 3, issue: null, planned: true, stories: ["S-2"] },
      { id: "U-3", name: "notice", title: "알림", kind: "feature", area: "billing", dependsOn: ["U-2"], provides: [], consumes: [], order: 4, issue: null, planned: true, stories: ["S-3"] },
      { id: "U-4", name: "payment-contract", title: "결제 계약", kind: "contract", area: "payment", dependsOn: [], provides: ["api:payments.v2"], consumes: [], order: 1, issue: null, planned: true, stories: [] },
      { id: "U-5", name: "old", title: "옛 Unit", kind: "feature", area: "payment", dependsOn: [], provides: [], consumes: [], order: 5, issue: null, planned: false, stories: [] },
    ],
    unassigned: [],
  };
  writeFile(repo.root, `${INT}/units.json`, `${JSON.stringify(units, null, 2)}\n`);
  writeIssue(repo.root, "DEMO-21", "payment-method", { area: "payment", requirements: "in-review" });
  commitAll(repo.root);
  return repo;
}

describe("GET /flow", () => {
  it("의존 깊이가 열, 계약 Unit 은 위 띠, planned: false 는 빠진다. 같은 입력이면 같은 자리", async () => {
    const repo = intentRepo();
    const srv = await serve(repo);
    const r = await call(srv, "GET", "/api/v1/flow?intent=INT-7");
    expect(r.status, r.text).toBe(200);
    const d = r.json.data;
    expect(d.intent).toMatchObject({ key: "INT-7", title: "결제 개편" });
    const pos = Object.fromEntries(d.nodes.map((n: any) => [n.id, [n.type, n.position.x, n.position.y]]));
    expect(pos).toEqual({ "U-4": ["contract-unit", 0, 0], "U-1": ["unit", 0, 1], "U-2": ["unit", 1, 1], "U-3": ["unit", 2, 1] });
    expect(d.edges).toEqual([
      { source: "U-4", target: "U-1", kind: "contract" },
      { source: "U-1", target: "U-2", kind: "depends" },
      { source: "U-2", target: "U-3", kind: "depends" },
    ]);
    const u1 = d.nodes.find((n: any) => n.id === "U-1");
    expect(u1.data).toMatchObject({ issue: "DEMO-21", area: "payment", title: "결제수단 등록" });
    expect(u1.data.steps[0]).toBe("requirements:active");
    expect(d.proposal).toBeNull();
    const again = await call(srv, "GET", "/api/v1/flow?intent=INT-7");
    expect(again.json.data.nodes).toEqual(d.nodes);
    expect((await call(srv, "GET", "/api/v1/flow?intent=INT-99")).status).toBe(404);
  });
});

describe("Unit 변경 제안", () => {
  it("저장해도 units.json 은 그대로, 거부: 고리 422 · 없는 Unit 422 · 계약 합치기 422 · sha 다름 409", async () => {
    const repo = intentRepo();
    const srv = await serve(repo);
    const unitsBefore = readFile(repo.root, `${INT}/units.json`);
    const base = sha256(unitsBefore);
    const ok = await call(srv, "POST", "/api/v1/units/proposals", { body: { intent: "INT-7", baseSha256: base, changes: [{ op: "add-dep", unit: "U-3", dependsOn: "U-1", reason: "실패 코드를 받는다" }] } });
    expect(ok.status, ok.text).toBe(200);
    expect(readFile(repo.root, `${INT}/units.json`)).toBe(unitsBefore);
    const proposal = JSON.parse(readFile(repo.root, `${INT}/units.proposed.json`));
    expect(proposal).toMatchObject({ schema: "knots-sync.units-proposal/v1", intent: "INT-7", baseSha256: base, createdBy: "kim@example.com" });
    const flow = await call(srv, "GET", "/api/v1/flow?intent=INT-7");
    expect(flow.json.data.proposal.changes).toHaveLength(1);
    const cycle = await call(srv, "POST", "/api/v1/units/proposals", { body: { intent: "INT-7", baseSha256: base, changes: [{ op: "add-dep", unit: "U-1", dependsOn: "U-3" }] } });
    expect([cycle.status, cycle.json.error.code]).toEqual([422, "cycle"]);
    const unknown = await call(srv, "POST", "/api/v1/units/proposals", { body: { intent: "INT-7", baseSha256: base, changes: [{ op: "remove-dep", unit: "U-9", dependsOn: "U-1" }] } });
    expect([unknown.status, unknown.json.error.code]).toEqual([422, "unknown_unit"]);
    const merge = await call(srv, "POST", "/api/v1/units/proposals", { body: { intent: "INT-7", baseSha256: base, changes: [{ op: "merge", units: ["U-4", "U-1"] }] } });
    expect([merge.status, merge.json.error.code]).toEqual([422, "contract_merge"]);
    const stale = await call(srv, "POST", "/api/v1/units/proposals", { body: { intent: "INT-7", baseSha256: "0".repeat(64), changes: [{ op: "add-dep", unit: "U-3", dependsOn: "U-1" }] } });
    expect([stale.status, stale.json.error.code]).toEqual([409, "conflict"]);
    expect(readFile(repo.root, `${INT}/units.json`)).toBe(unitsBefore);
    const del = await call(srv, "DELETE", "/api/v1/units/proposals/INT-7");
    expect(del.status).toBe(200);
    expect(fs.existsSync(path.join(repo.root, INT, "units.proposed.json"))).toBe(false);
  });

  it("intent 게이트 승인만 제안을 units.json 에 옮긴다 — 결과가 제안 반영과 같고 기록 sha 가 그 파일과 같다(DB-R29)", async () => {
    const repo = intentRepo();
    const srv = await serve(repo);
    const base = sha256(readFile(repo.root, `${INT}/units.json`));
    const p = await call(srv, "POST", "/api/v1/units/proposals", {
      body: { intent: "INT-7", baseSha256: base, changes: [{ op: "add-dep", unit: "U-3", dependsOn: "U-1" }, { op: "remove-dep", unit: "U-3", dependsOn: "U-2" }] },
    });
    expect(p.status, p.text).toBe(200);
    const r = await call(srv, "POST", "/api/v1/approvals", {
      body: { target: { intent: "INT-7" }, gate: "intent", decision: "approved", phrase: "Unit 분해 확정", docSha256: await docSha(srv, `${INT}/intent.md`), pin: srv.pin },
    });
    expect(r.status, r.text).toBe(201);
    const units = JSON.parse(readFile(repo.root, `${INT}/units.json`));
    expect(units.units.find((u: any) => u.id === "U-3").dependsOn).toEqual(["U-1"]);
    expect(fs.existsSync(path.join(repo.root, INT, "units.proposed.json"))).toBe(false);
    const entries = parse(readFile(repo.root, `${INT}/approvals.md`)).entries;
    expect(entries.map((e) => [e.gate, e.target?.name, e.valid])).toEqual([["intent", "intent.md", true], ["intent", "units.json", true]]);
    expect(entries[1]?.target?.sha256).toBe(sha256(fs.readFileSync(path.join(repo.root, INT, "units.json"))));
    expect(readFile(repo.root, `${INT}/intent.md`)).toContain("status: approved");
  });

  it("읽기 전용이면 제안 저장도 403 read_only", async () => {
    const repo = intentRepo();
    const srv = await serve(repo, { readOnly: true });
    const r = await call(srv, "POST", "/api/v1/units/proposals", { body: { intent: "INT-7", baseSha256: "0", changes: [] } });
    expect([r.status, r.json.error.code]).toEqual([403, "read_only"]);
  });
});
