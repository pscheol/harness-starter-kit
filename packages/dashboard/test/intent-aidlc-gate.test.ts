/**
 * AI-DLC 를 켠 Intent(intent.md 없이 intent.json · units.json 만 있다, 설계 08 §3.10 · 10 §3.2)의 intent 게이트 승인(HK-22).
 * 두 구성 e2e(MG-R7)에서 B 구성(킷 + AI-DLC)의 intent 승인이 404 였던 것을 막는다 — 승인 대상 문서는 intent.json 이다(from_unit.py 와 같은 규칙).
 */
import { describe, expect, it } from "vitest";
import { parse } from "../src/approvals";
import { call, commitAll, makeRepo, python, readFile, serve, sha256, writeFile } from "./helpers";

const INT = ".agents/docs/intents/INT-1-order-billing";

const LINK = {
  schema: "knots-sync.intent-link/v1", key: "INT-1", title: "주문 결제 연동", source: "aidlc",
  aidlc: { space: "default", intent: "261124-order-billing", path: "aidlc/spaces/default/intents/261124-order-billing/", version: "2.11.4" },
  adapter: { name: "knots-sync/aidlc", version: "2.0.0-alpha.0", reader: "aidlc-v2", inputSha256: "0".repeat(64), adaptedAt: "2026-11-24T00:00:00.000Z" },
  stories: [{ id: "US1.1", title: "주문" }, { id: "US2.1", title: "결제" }],
};

const unit = (id: string, stories: string[], deps: string[]): Record<string, unknown> => ({
  id, name: `u${id.slice(2)}-x`, title: id, kind: "feature", area: id === "U-1" ? "orders" : "billing", repo: null, stories, nfr: [], risks: [], dependsOn: deps,
  provides: [], consumes: [], order: Number(id.slice(2)), issue: null, planned: true,
});

const UNITS = {
  schema: "knots-sync.units/v1", intent: { key: "INT-1", title: "주문 결제 연동", doc: "intent.json" }, source: { kind: "aidlc" },
  decomposition: { stories: 2, domains: 0, userTypes: 0, integrations: 0, split: true, reasons: ["aidlc"] },
  units: [unit("U-1", ["US1.1"], []), unit("U-2", ["US2.1"], ["U-1"])], unassigned: [],
};

function aidlcRepo() {
  const repo = makeRepo({ gates: ["intent", "requirements", "design", "mr", "done"] });
  writeFile(repo.root, `${INT}/intent.json`, `${JSON.stringify(LINK, null, 2)}\n`);
  writeFile(repo.root, `${INT}/units.json`, `${JSON.stringify(UNITS, null, 2)}\n`);
  commitAll(repo.root);
  return repo;
}

describe("AI-DLC Intent 의 intent 게이트", () => {
  it("intent.json 을 대상으로 승인하고 기록한다 — 머리 status 는 쓰지 않는다", async () => {
    const repo = aidlcRepo();
    const srv = await serve(repo);
    const stale = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "intent", decision: "approved", phrase: "범위 확인", docSha256: "0".repeat(64), pin: srv.pin } });
    expect([stale.status, stale.json.error.code]).toEqual([409, "doc_changed"]);
    const before = (await call(srv, "GET", "/api/v1/intents/INT-1")).json.data;
    expect(before.approvals.intent).toBe("none");
    const sha = sha256(readFile(repo.root, `${INT}/intent.json`));
    const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "intent", decision: "approved", phrase: "범위 확인", docSha256: sha, pin: srv.pin } });
    expect(r.status, r.text).toBe(201);
    expect(r.json.data.statusChanged).toBeNull();
    const entries = parse(readFile(repo.root, `${INT}/approvals.md`)).entries;
    expect(entries.map((e) => [e.gate, e.target?.name, e.valid])).toEqual([["intent", "intent.json", true], ["intent", "units.json", true]]);
    expect(readFile(repo.root, `${INT}/intent.json`)).not.toContain("status");
    const after = (await call(srv, "GET", "/api/v1/intents/INT-1")).json.data;
    expect(after.approvals.intent).toBe("valid");
    const again = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "intent", decision: "approved", phrase: "또", docSha256: sha, pin: srv.pin } });
    expect([again.status, again.json.error.code]).toEqual([409, "already_approved"]);
  });

  it("킷 스크립트(intent.py next)도 같은 승인을 유효로 읽는다", async () => {
    const repo = aidlcRepo();
    const srv = await serve(repo);
    const sha = sha256(readFile(repo.root, `${INT}/intent.json`));
    const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "intent", decision: "approved", phrase: "범위 확인", docSha256: sha, pin: srv.pin } });
    expect(r.status, r.text).toBe(201);
    const next = python(["scripts/harness/intent.py", "next", "INT-1", "--json"], repo.root);
    expect(next.code, next.stderr).toBe(0);
    expect(JSON.parse(next.stdout).step).not.toBe("intent-approval-wait");
    const check = python(["scripts/harness/intent.py", "check", `${INT}`, "--json"], repo.root);
    expect(JSON.parse(check.stdout).problems).toEqual([]);
  });

  it("intent.md 도 intent.json 도 없으면 404 다", async () => {
    const repo = makeRepo({ gates: ["intent"] });
    writeFile(repo.root, `${INT}/units.json`, `${JSON.stringify(UNITS)}\n`);
    commitAll(repo.root);
    const srv = await serve(repo);
    const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "intent", decision: "approved", phrase: "x", docSha256: "0".repeat(64), pin: srv.pin } });
    expect(r.status).toBe(404);
  });
});
