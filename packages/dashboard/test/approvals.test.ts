/**
 * 승인 · 리뷰 판단 · 질문 답(06 §3.7 · §3.8, DB-R11~R14 · R22, 완료 기준 7).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/approvals";
import { call, commitAll, docSha, git, makeRepo, python, readFile, serve, sha256, writeFile, writeIssue, type Repo } from "./helpers";

const DIR = ".agents/docs/issues/DEMO-1-upload-cleanup";
const REQ = `${DIR}/requirements.md`;

function repoWithIssue(opts: Parameters<typeof makeRepo>[0] = {}, req = "in-review"): Repo {
  const repo = makeRepo(opts);
  writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: req, design: "draft" });
  commitAll(repo.root);
  return repo;
}

describe("POST /approvals", () => {
  it("승인 기록(승인자 · 시각 · 문구 · sha256 · 기록 ID)을 덧붙이고 머리를 approved 로 바꾼다(DB-R14)", async () => {
    const repo = repoWithIssue({ approvers: { requirements: ["po"] }, groups: { po: ["kim@example.com"] } });
    const srv = await serve(repo);
    const sha = await docSha(srv, REQ);
    const r = await call(srv, "POST", "/api/v1/approvals", {
      body: { target: { issue: "DEMO-1" }, gate: "requirements", decision: "approved", phrase: "요구사항 확정", docSha256: sha, pin: srv.pin },
    });
    expect(r.status, r.text).toBe(201);
    expect(r.json.data).toMatchObject({ approvals: `${DIR}/approvals.md`, approver: "kim@example.com", group: "po", statusChanged: "in-review→approved" });
    expect(r.json.data.entryId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const text = readFile(repo.root, `${DIR}/approvals.md`);
    const parsed = parse(text);
    expect(parsed.key).toBe("DEMO-1");
    expect(parsed.errors).toEqual([]);
    const e = parsed.entries[0];
    expect(e).toMatchObject({ gate: "requirements", decision: "approved", path: "dashboard", phrase: "요구사항 확정", entryId: r.json.data.entryId, valid: true });
    expect(e?.approver).toEqual({ email: "kim@example.com", name: "Kim", group: "po" });
    expect(e?.target?.name).toBe("requirements.md");
    expect(e?.target?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFile(repo.root, REQ)).toContain("status: approved");
    const log = readFile(repo.root, ".agents/state/approvals-log.jsonl").trim().split("\n").map((l) => JSON.parse(l));
    expect(log).toEqual([expect.objectContaining({ entryId: e?.entryId, gate: "requirements", path: "dashboard", target: DIR })]);
    const gates = python(["scripts/harness/sdd_gates.py", "check", "DEMO-1", "--json", "--root", repo.root], repo.root);
    expect(gates.code, gates.stderr).toBe(0);
    expect(JSON.parse(gates.stdout).gates[0]).toMatchObject({ gate: "requirements", passed: true, approval: "valid" });
    const again = await call(srv, "POST", "/api/v1/approvals", {
      body: { target: { issue: "DEMO-1" }, gate: "requirements", decision: "approved", phrase: "다시", docSha256: await docSha(srv, REQ), pin: srv.pin },
    });
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("already_approved");
  });

  it("approvers 밖 사용자 403, approvers 가 비면 누구나(DB-R11)", async () => {
    const repo = repoWithIssue({ approvers: { requirements: ["po"] }, groups: { po: ["lee@example.com"] } });
    const srv = await serve(repo);
    const body = { target: { issue: "DEMO-1" }, gate: "requirements", decision: "approved", phrase: "확정", docSha256: await docSha(srv, REQ), pin: srv.pin };
    const r = await call(srv, "POST", "/api/v1/approvals", { body });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("not_an_approver");
    expect(fs.existsSync(path.join(repo.root, DIR, "approvals.md"))).toBe(false);
    const open = repoWithIssue({ approvers: { design: ["dev"] } });
    const srv2 = await serve(open);
    const ok = await call(srv2, "POST", "/api/v1/approvals", { body: { ...body, docSha256: await docSha(srv2, REQ), pin: srv2.pin } });
    expect(ok.status, ok.text).toBe(201);
  });

  it("[NEEDS CLARIFICATION 이 남은 문서는 422, PIN 없는 요청은 403, 문서가 바뀌었으면 409(DB-R12 · R13)", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "in-review", body: { requirements: "- R1 [NEEDS CLARIFICATION: 보관 기간]\n" } });
    commitAll(repo.root);
    const srv = await serve(repo);
    const sha = await docSha(srv, REQ);
    const base = { target: { issue: "DEMO-1" }, gate: "requirements", decision: "approved", phrase: "확정", docSha256: sha };
    const noPin = await call(srv, "POST", "/api/v1/approvals", { body: base });
    expect([noPin.status, noPin.json.error.code]).toEqual([403, "pin_required"]);
    const clarify = await call(srv, "POST", "/api/v1/approvals", { body: { ...base, pin: srv.pin } });
    expect([clarify.status, clarify.json.error.code]).toEqual([422, "needs_clarification"]);
    expect(fs.existsSync(path.join(repo.root, DIR, "approvals.md"))).toBe(false);
    writeIssue(repo.root, "DEMO-2", "upload-cleanup", { requirements: "in-review" });
    const changed = await call(srv, "POST", "/api/v1/approvals", { body: { ...base, target: { issue: "DEMO-2" }, docSha256: "1".repeat(64), pin: srv.pin } });
    expect([changed.status, changed.json.error.code]).toEqual([409, "doc_changed"]);
    expect(fs.existsSync(path.join(repo.root, ".agents/docs/issues/DEMO-2-upload-cleanup/approvals.md"))).toBe(false);
  });

  it("PIN 을 5번 틀리면 서버가 끝날 때까지 pin_locked", async () => {
    const repo = repoWithIssue();
    const srv = await serve(repo);
    const body = { target: { issue: "DEMO-1" }, gate: "requirements", decision: "approved", phrase: "확정", docSha256: await docSha(srv, REQ) };
    for (let i = 0; i < 5; i += 1) expect((await call(srv, "POST", "/api/v1/approvals", { body: { ...body, pin: "WRONGPIN00" } })).json.error.code).toBe("pin_required");
    const locked = await call(srv, "POST", "/api/v1/approvals", { body: { ...body, pin: srv.pin } });
    expect([locked.status, locked.json.error.code]).toEqual([403, "pin_locked"]);
  });

  it("에이전트 세션에서 연 서버는 PIN 을 만들지 않고 승인 · 답 · 리뷰 판단 · 저장이 403 read_only(DB-R22)", async () => {
    const repo = repoWithIssue();
    const srv = await serve(repo, { agentSession: () => "CLAUDECODE=1" });
    expect(srv.pin).toBeNull();
    expect(srv.readOnly).toBe(true);
    const session = await call(srv, "GET", "/api/v1/session");
    expect(session.json.data.readOnly).toBe(true);
    const body = { target: { issue: "DEMO-1" }, gate: "requirements", decision: "approved", phrase: "확정", docSha256: await docSha(srv, REQ), pin: "X" };
    const r = await call(srv, "POST", "/api/v1/approvals", { body });
    expect([r.status, r.json.error.code]).toEqual([403, "read_only"]);
    const cur = readFile(repo.root, REQ);
    const put = await call(srv, "PUT", "/api/v1/docs", { body: { path: REQ, baseSha256: sha256(cur), markdown: `${cur}x\n` } });
    expect([put.status, put.json.error.code]).toEqual([403, "read_only"]);
    expect((await call(srv, "POST", "/api/v1/reviews/DEMO-1/F-1/decision", { body: { decision: "risk-accepted", phrase: "x", pin: "X" } })).json.error.code).toBe("read_only");
  });

  it("flow.gates 에 없는 게이트는 422, 앞 게이트를 통과하지 않으면 422 gate_precondition", async () => {
    const repo = repoWithIssue({ gates: ["requirements", "design", "mr", "done"] });
    const srv = await serve(repo);
    const tasks = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: "DEMO-1" }, gate: "tasks", decision: "approved", phrase: "x", docSha256: "0", pin: srv.pin } });
    expect([tasks.status, tasks.json.error.code]).toEqual([422, "gate_not_in_flow"]);
    const design = `${DIR}/design.md`;
    const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: "DEMO-1" }, gate: "design", decision: "approved", phrase: "x", docSha256: await docSha(srv, design), pin: srv.pin } });
    expect([r.status, r.json.error.code]).toEqual([422, "gate_precondition"]);
    expect(r.json.error.details.reasons.join(" ")).toContain("requirements");
    const mr = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: "DEMO-1" }, gate: "mr", decision: "approved", phrase: "x", pin: srv.pin } });
    expect([mr.status, mr.json.error.code]).toEqual([422, "gate_precondition"]);
  });

  it("병합 뒤 done 승인은 지우지 않은 로컬 이슈 브랜치가 있어도 base 메인 폴더로 간다. 다른 게이트는 여전히 그 브랜치를 요구한다(HK-22b)", async () => {
    const repo = repoWithIssue();
    git(repo.root, "branch", "feat/DEMO-1-upload-cleanup");
    const srv = await serve(repo);
    const done = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: "DEMO-1" }, gate: "done", decision: "approved", phrase: "병합 확인", pin: srv.pin } });
    expect([done.status, done.json.error?.code]).toEqual([422, "gate_precondition"]);
    const req = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: "DEMO-1" }, gate: "requirements", decision: "approved", phrase: "x", docSha256: await docSha(srv, REQ), pin: srv.pin } });
    expect([req.status, req.json.error?.code]).toEqual([409, "branch_not_checked_out"]);
  });

  it("changes-requested 는 기록만 남기고 머리를 바꾸지 않는다", async () => {
    const repo = repoWithIssue();
    const srv = await serve(repo);
    const r = await call(srv, "POST", "/api/v1/approvals", {
      body: { target: { issue: "DEMO-1" }, gate: "requirements", decision: "changes-requested", phrase: "R1 범위를 줄인다", docSha256: await docSha(srv, REQ), ruleCandidate: true, pin: srv.pin },
    });
    expect(r.status, r.text).toBe(201);
    expect(r.json.data.statusChanged).toBeNull();
    expect(readFile(repo.root, REQ)).toContain("status: in-review");
    const e = parse(readFile(repo.root, `${DIR}/approvals.md`)).entries[0];
    expect(e).toMatchObject({ decision: "changes-requested", ruleCandidate: true, valid: true });
  });

  it("worktree 에 체크아웃된 이슈는 그 worktree 의 approvals.md 에 쓴다", async () => {
    const repo = makeRepo();
    const wt = path.join(repo.base, "demo.worktrees", "DEMO-2-upload-cleanup");
    git(repo.root, "worktree", "add", "-q", "-b", "feat/DEMO-2-upload-cleanup", wt);
    writeIssue(wt, "DEMO-2", "upload-cleanup", { requirements: "in-review" });
    commitAll(wt);
    const srv = await serve(repo);
    const req = ".agents/docs/issues/DEMO-2-upload-cleanup/requirements.md";
    const r = await call(srv, "POST", "/api/v1/approvals", {
      body: { target: { issue: "DEMO-2" }, gate: "requirements", decision: "approved", phrase: "확정", docSha256: await docSha(srv, req), pin: srv.pin },
    });
    expect(r.status, r.text).toBe(201);
    expect(fs.existsSync(path.join(wt, ".agents/docs/issues/DEMO-2-upload-cleanup/approvals.md"))).toBe(true);
    expect(fs.existsSync(path.join(repo.root, ".agents/docs/issues/DEMO-2-upload-cleanup"))).toBe(false);
  });
});

describe("POST /reviews/{key}/{F-n}/decision", () => {
  it("보고서 지문으로 review/F-n 기록을 남긴다", async () => {
    const repo = repoWithIssue();
    const fp = "ab".repeat(32);
    const data = { issue: "DEMO-1", mr: "#1", head: git(repo.root, "rev-parse", "HEAD"), findings: [{ id: "F-1", severity: "HIGH", check: "RV-EDGE", path: "README.md", line: 1, fp, title: "빈 입력" }] };
    writeFile(repo.root, ".agents/reports/review/DEMO-1.md", `---\nissue: DEMO-1\n---\n\n# 리뷰\n\n<!-- knots-sync:review-data ${JSON.stringify(data)} -->\n`);
    const srv = await serve(repo);
    const before = await call(srv, "GET", "/api/v1/reviews/DEMO-1");
    expect(before.json.data.open.HIGH).toBe(1);
    const r = await call(srv, "POST", "/api/v1/reviews/DEMO-1/F-1/decision", { body: { decision: "risk-accepted", phrase: "레거시 경로라 이번에는 고치지 않는다", pin: srv.pin } });
    expect(r.status, r.text).toBe(201);
    const e = parse(readFile(repo.root, `${DIR}/approvals.md`)).entries[0];
    expect(e).toMatchObject({ gate: "review/F-1", decision: "risk-accepted", valid: true });
    expect(e?.target).toEqual({ name: ".agents/reports/review/DEMO-1.md", sha256: null, fingerprint: fp, head: null });
    const after = await call(srv, "GET", "/api/v1/reviews/DEMO-1");
    expect(after.json.data.open.HIGH).toBe(0);
    expect((await call(srv, "POST", "/api/v1/reviews/DEMO-1/F-9/decision", { body: { decision: "risk-accepted", phrase: "x", pin: srv.pin } })).status).toBe(404);
  });
});

const QUESTIONS = `---
target: INT-1
status: open
round: 1
---

# 질문 — INT-1 결제 개편

## Q-1 · 범위 · 답할 직무: po · 막는 게이트: intent
환불을 이번 범위에 넣는가?

- A. 넣는다 — 영향: Unit 1개 추가
- B. 넣지 않는다 — 영향: 범위 밖에 적는다
- 권장: B — 근거: 원문에 없다
- 답:

## Q-2 · 보안 · 답할 직무: dev · 막는 게이트: intent
카드 번호를 받는가?

- A. 받지 않는다 — 영향: PCI 범위 밖
- B. 받는다 — 영향: PCI 대응
- 권장: A — 근거: 토큰 결제
- 답:
`;

describe("POST /questions/{target}/{qid}/answer", () => {
  function intentRepo(groups: Record<string, string[]>): Repo {
    const repo = makeRepo({ groups });
    writeFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/questions.md", QUESTIONS);
    writeFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/intent.md", "---\nkey: INT-1\nstatus: draft\n---\n\n# Intent\n");
    commitAll(repo.root);
    return repo;
  }
  const Q = ".agents/docs/intents/INT-1-pay-reform/questions.md";

  it("직무 그룹 사용자는 답, 밖이면 의견. 다시 답하면 이전 답을 남기고 모두 차면 answered", async () => {
    const repo = intentRepo({ dev: ["kim@example.com"], po: ["lee@example.com"] });
    const srv = await serve(repo);
    const list = await call(srv, "GET", "/api/v1/questions?target=INT-1");
    expect(list.json.data.questions.map((q: any) => [q.id, q.open, q.role])).toEqual([["Q-1", true, "po"], ["Q-2", true, "dev"]]);
    const a = await call(srv, "POST", "/api/v1/questions/INT-1/Q-2/answer", { body: { choice: "A", text: "토큰 만료는\ndesign 에서", baseSha256: sha256(QUESTIONS), pin: srv.pin } });
    expect(a.status, a.text).toBe(200);
    expect(a.json.data.kind).toBe("answer");
    let text = readFile(repo.root, Q);
    expect(text).toMatch(/- 답: A · kim@example\.com · \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}\n- 메모: 토큰 만료는 design 에서\n/);
    const o = await call(srv, "POST", "/api/v1/questions/INT-1/Q-1/answer", { body: { choice: "B", text: "환불은 다음", baseSha256: sha256(text), pin: srv.pin } });
    expect(o.json.data.kind).toBe("opinion");
    text = readFile(repo.root, Q);
    expect(text).toContain("- 의견: B · kim@example.com — 환불은 다음");
    expect((await call(srv, "GET", "/api/v1/questions?target=INT-1")).json.data.questions[0].open).toBe(true);
    const stale = await call(srv, "POST", "/api/v1/questions/INT-1/Q-2/answer", { body: { choice: "B", baseSha256: sha256(QUESTIONS), pin: srv.pin } });
    expect([stale.status, stale.json.error.code]).toEqual([409, "conflict"]);
    const b = await call(srv, "POST", "/api/v1/questions/INT-1/Q-2/answer", { body: { choice: "B", baseSha256: sha256(text), pin: srv.pin } });
    expect(b.status, b.text).toBe(200);
    text = readFile(repo.root, Q);
    expect(text).toMatch(/- 답: B · kim@example\.com · .+\n- 이전 답: A · kim@example\.com · /);
    expect(text).toContain("status: open");
  });

  it("모든 질문에 답이 차면 status: answered", async () => {
    const repo = intentRepo({});
    const srv = await serve(repo);
    let sha = sha256(QUESTIONS);
    for (const [q, c] of [["Q-1", "B"], ["Q-2", "A"]] as const) {
      const r = await call(srv, "POST", `/api/v1/questions/INT-1/${q}/answer`, { body: { choice: c, baseSha256: sha, pin: srv.pin } });
      expect(r.status, r.text).toBe(200);
      sha = r.json.data.sha256;
    }
    const text = readFile(repo.root, Q);
    expect(text).toContain("status: answered");
    expect((await call(srv, "POST", "/api/v1/questions/INT-1/Q-1/answer", { body: { choice: "Z", baseSha256: sha, pin: srv.pin } })).status).toBe(400);
    expect((await call(srv, "POST", "/api/v1/questions/INT-1/Q-7/answer", { body: { choice: "A", baseSha256: sha, pin: srv.pin } })).status).toBe(404);
  });
});
