/**
 * Intent 폴더 게이트 codebase · plans 승인(설계 08 §3.6 · §3.13 · DS-R21 · DS-R23, 06 §3.7, HK-19 design §5).
 * 대상 파일 · 앞 조건은 intent_gate.py, 기록은 파일마다 한 줄. 오래된 모델은 422 model_stale.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/approvals";
import { call, commitAll, git, KIT, makeRepo, readFile, serve, writeFile, type Repo } from "./helpers";

const INT = ".agents/docs/intents/INT-1-payment-method";
const MODEL = ".agents/docs/codebase/payment.md";
const TEMPLATES = path.join(KIT, "packages/templates/common/agents-docs/_spec-templates");

function head(repo: Repo): string {
  return git(repo.root, "rev-parse", "HEAD").trim();
}

function codebaseRepo(): Repo {
  const repo = makeRepo();
  fs.cpSync(TEMPLATES, path.join(repo.root, ".agents/docs/_spec-templates"), { recursive: true });
  writeFile(repo.root, "pay/__init__.py", "");
  writeFile(repo.root, "pay/core.py", "x = 1\n");
  commitAll(repo.root);
  writeFile(repo.root, MODEL, [
    "---", "kind: codebase-model", "area: payment", 'paths: ["pay/**"]', `baseSha: ${head(repo)}`, "updated: 2026-11-24", "---", "",
    "# 코드 모델 — payment", "", "## 1. 모듈", "", "| ID | 모듈 | 경로 | 책임 | 출처 |", "|---|---|---|---|---|", "| M-1 | pay | pay/ | 결제 | static:python-packages |", "",
  ].join("\n"));
  writeFile(repo.root, `${INT}/intent.md`, "---\nid: INT-1\ntitle: 결제수단 추가\nstatus: draft\nkind: change\nrisk: medium\n---\n\n# Intent\n");
  writeFile(repo.root, `${INT}/current-state.md`, `---\nintent: INT-1\nkind: current-state\nstatus: in-review\nheadSha: ${head(repo).slice(0, 7)}\nmodels:\n  - { path: ${MODEL}, baseSha: x }\n---\n\n# 현재 상태\n`);
  commitAll(repo.root);
  return repo;
}

async function bundle(srv: Awaited<ReturnType<typeof serve>>, gate: string): Promise<any> {
  const r = await call(srv, "GET", `/api/v1/intents/INT-1/gates?gate=${gate}`);
  expect(r.status, r.text).toBe(200);
  return r.json.data;
}

describe("codebase 게이트", () => {
  it("current-state.md 와 참조 모델을 함께 승인하고 파일마다 sha 를 남긴다 · status approved", async () => {
    const repo = codebaseRepo();
    const srv = await serve(repo);
    const before = (await call(srv, "GET", "/api/v1/intents/INT-1")).json.data;
    expect([before.approvals.codebase, before.next.step]).toEqual(["none", "codebase-approval-wait"]);
    const b = await bundle(srv, "codebase");
    expect(b.files.map((f: any) => f.name)).toEqual(["current-state.md", MODEL]);
    expect([b.reasons, b.stale]).toEqual([[], []]);
    const stale = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "codebase", decision: "approved", phrase: "현재 상태 확인", docSha256: "0".repeat(64), pin: srv.pin } });
    expect([stale.status, stale.json.error.code]).toEqual([409, "doc_changed"]);
    const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "codebase", decision: "approved", phrase: "현재 상태 확인", docSha256: b.sha256, pin: srv.pin } });
    expect(r.status, r.text).toBe(201);
    const entries = parse(readFile(repo.root, `${INT}/approvals.md`)).entries;
    expect(entries.map((e) => [e.gate, e.target?.name, e.valid])).toEqual([["codebase", "current-state.md", true], ["codebase", MODEL, true]]);
    expect(readFile(repo.root, `${INT}/current-state.md`)).toContain("status: approved");
    const model = (await call(srv, "GET", "/api/v1/intents/INT-1")).json.data;
    expect([model.approvals.codebase, model.next.step]).toEqual(["valid", "draft"]);
    const again = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "codebase", decision: "approved", phrase: "또", docSha256: (await bundle(srv, "codebase")).sha256, pin: srv.pin } });
    expect([again.status, again.json.error.code]).toEqual([409, "already_approved"]);
  });

  it("모델 paths 에서 baseSha 뒤 바뀐 줄이 기준을 넘으면 422 model_stale(DS-R23)", async () => {
    const repo = codebaseRepo();
    writeFile(repo.root, "pay/big.py", "y = 2\n".repeat(250));
    commitAll(repo.root);
    const srv = await serve(repo);
    const b = await bundle(srv, "codebase");
    expect(b.stale[0].path).toBe(MODEL);
    const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "codebase", decision: "approved", phrase: "확인", docSha256: b.sha256, pin: srv.pin } });
    expect([r.status, r.json.error.code, r.json.error.details.stale[0].lines]).toEqual([422, "model_stale", 250]);
    const changes = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "codebase", decision: "changes-requested", phrase: "모델부터 갱신", docSha256: b.sha256, pin: srv.pin } });
    expect(changes.status, changes.text).toBe(201);
  });

  it("출처 칸이 틀린 모델 · 없는 headSha 는 422 gate_precondition", async () => {
    const repo = codebaseRepo();
    writeFile(repo.root, MODEL, readFile(repo.root, MODEL).replace("static:python-packages", "inferred"));
    writeFile(repo.root, `${INT}/current-state.md`, readFile(repo.root, `${INT}/current-state.md`).replace(/headSha: \w+/, "headSha: null"));
    commitAll(repo.root);
    const srv = await serve(repo);
    const b = await bundle(srv, "codebase");
    const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "codebase", decision: "approved", phrase: "확인", docSha256: b.sha256, pin: srv.pin } });
    expect([r.status, r.json.error.code]).toEqual([422, "gate_precondition"]);
    const reasons: string[] = r.json.error.details.reasons;
    expect(reasons.some((x) => x.includes("근거 위치"))).toBe(true);
    expect(reasons.some((x) => x.includes("headSha"))).toBe(true);
  });
});

describe("plans 게이트", () => {
  it("기획물이 없으면 422, 필수 제목이 빠져도 422", async () => {
    const repo = codebaseRepo();
    const srv = await serve(repo);
    const none = await bundle(srv, "plans");
    expect(none.files).toEqual([]);
    const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "plans", decision: "approved", phrase: "기획 확인", docSha256: none.sha256, pin: srv.pin } });
    expect([r.status, r.json.error.code]).toEqual([422, "gate_precondition"]);
    writeFile(repo.root, `${INT}/plans/design-plan.md`, "---\nintent: INT-1\nkind: design-plan\nstatus: draft\ngeneratedWith: skill:kns-plans\ngeneratedBy: claude\nupdated: 2026-11-24\n---\n\n# 설계 계획\n");
    const b = await bundle(srv, "plans");
    expect(b.files.map((f: any) => f.name)).toEqual(["plans/design-plan.md"]);
    expect(b.reasons.some((x: string) => x.includes("필수 제목"))).toBe(true);
    const bad = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "plans", decision: "approved", phrase: "기획 확인", docSha256: b.sha256, pin: srv.pin } });
    expect([bad.status, bad.json.error.code]).toEqual([422, "gate_precondition"]);
  });

  it("템플릿 제목을 갖춘 기획물은 승인되고 파일마다 기록한다", async () => {
    const repo = codebaseRepo();
    const tpl = readFile(repo.root, ".agents/docs/_spec-templates/plans/design-plan.md")
      .replace(/\{\{INTENT_KEY\}\}/g, "INT-1").replace(/\{\{TITLE\}\}/g, "결제수단").replace(/\{\{CREATED\}\}/g, "2026-11-24").replace(/\{\{HARNESS\}\}/g, "claude");
    writeFile(repo.root, `${INT}/plans/design-plan.md`, tpl);
    const srv = await serve(repo);
    const b = await bundle(srv, "plans");
    expect(b.reasons, JSON.stringify(b.reasons)).toEqual([]);
    const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { intent: "INT-1" }, gate: "plans", decision: "approved", phrase: "기획 확인", docSha256: b.sha256, pin: srv.pin } });
    expect(r.status, r.text).toBe(201);
    expect(parse(readFile(repo.root, `${INT}/approvals.md`)).entries.map((e) => [e.gate, e.target?.name])).toEqual([["plans", "plans/design-plan.md"]]);
  });
});
