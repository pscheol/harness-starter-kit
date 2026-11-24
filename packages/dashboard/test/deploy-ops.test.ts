/**
 * deploy 게이트 승인 API · design §13 승인 앞 조건 · GET /ops(설계 14, DO-R1 · R4 · R5 · R16, 완료 기준 1 · 3 · 4 · 11).
 * 판정 원본은 scripts/harness/deploy_gate.py 하나다 — 여기서는 API 가 그 판정을 422 로 옮기고 포함 이슈마다 같은 기록을 덧붙이는지 본다.
 */
import { describe, expect, it } from "vitest";
import { call, commitAll, docSha, git, makeRepo, python, readFile, serve, writeFile, writeIssue, type Repo } from "./helpers";

import { doneIssue, GOOD, plan, ready } from "./ops-helpers";

async function approveBody(srv: Awaited<ReturnType<typeof serve>>, repo: Repo, record: string, extra: Record<string, unknown> = {}) {
  const id = record.split("/").pop()?.replace(/\.md$/, "") as string;
  const check = python(["scripts/harness/deploy.py", "check", id, "--json"], repo.root);
  const planSha = (JSON.parse(check.stdout) as { planSha256: string }).planSha256;
  return { target: { deploy: id }, gate: "deploy", decision: "approved", phrase: "10%부터 연다", docSha256: planSha, pin: srv.pin, ...extra };
}

describe("design §13 승인 앞 조건(DO-R1)", () => {
  it("판단 기준이 빈 design 은 422, '배포 없음' 한 줄이면 승인된다", async () => {
    const repo = makeRepo({ gates: ["requirements", "design", "tasks", "mr", "done"] });
    const empty = GOOD.replace("5xx 비율 1% 초과가 5분 이어짐", "(숫자로)");
    const dir = writeIssue(repo.root, "DEMO-1", "pay-api", { area: "payment", requirements: "draft", design: "in-review", body: { design: empty } });
    const lib = writeIssue(repo.root, "DEMO-2", "inner-lib", { area: "payment", requirements: "draft", design: "in-review", body: { design: "## 13. 배포 · 롤백 (Migration / Rollout)\n\n배포 없음: 내부 라이브러리\n" } });
    commitAll(repo.root);
    const srv = await serve(repo);
    for (const [key, d] of [["DEMO-1", dir], ["DEMO-2", lib]] as const) {
      const r = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: key }, gate: "requirements", decision: "approved", phrase: "확정", docSha256: await docSha(srv, `${d}/requirements.md`), pin: srv.pin } });
      expect(r.status, r.text).toBe(201);
    }
    const bad = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: "DEMO-1" }, gate: "design", decision: "approved", phrase: "설계 확정", docSha256: await docSha(srv, `${dir}/design.md`), pin: srv.pin } });
    expect([bad.status, bad.json.error.code]).toEqual([422, "gate_precondition"]);
    expect(bad.json.error.details.reasons.join("\n")).toContain("판단 기준");
    const ok = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: "DEMO-2" }, gate: "design", decision: "approved", phrase: "설계 확정", docSha256: await docSha(srv, `${lib}/design.md`), pin: srv.pin } });
    expect(ok.status, ok.text).toBe(201);
  });
});

describe("deploy 게이트 승인 API", () => {
  async function setup(risk = "low") {
    const repo = makeRepo({ gates: ["requirements", "design", "tasks", "mr", "done", "deploy"] });
    doneIssue(repo, "DEMO-1", "pay-api", risk);
    doneIssue(repo, "DEMO-2", "pay-method");
    commitAll(repo.root);
    const record = plan(repo);
    return { repo, record };
  }

  it("롤백 시험이 없으면 422 와 조건 ID, 면제 사유가 있으면 201 이고 두 이슈 approvals.md 에 같은 기록이 붙는다", async () => {
    const { repo, record } = await setup();
    ready(repo, record, false);
    const srv = await serve(repo);
    const no = await call(srv, "POST", "/api/v1/approvals", { body: await approveBody(srv, repo, record) });
    expect([no.status, no.json.error.code, no.json.error.details.conditions]).toEqual([422, "gate_precondition", ["D3"]]);
    const yes = await call(srv, "POST", "/api/v1/approvals", { body: await approveBody(srv, repo, record, { waiveRollback: "검증 환경에 PG 샌드박스가 없다. 플래그 끄기로 되돌린다" }) });
    expect(yes.status, yes.text).toBe(201);
    expect(yes.json.data.issues).toEqual(["DEMO-1", "DEMO-2"]);
    const a = readFile(repo.root, ".agents/docs/issues/DEMO-1-pay-api/approvals.md");
    const b = readFile(repo.root, ".agents/docs/issues/DEMO-2-pay-method/approvals.md");
    const tail = (t: string): string => t.slice(t.lastIndexOf("## ", t.length));
    expect(tail(a)).toBe(tail(b));
    expect(tail(a)).toContain("· deploy · approved");
    expect(tail(a)).toContain("- 롤백 면제: 검증 환경에 PG 샌드박스가 없다");
    expect(tail(a)).toContain("- 경로: dashboard");
    const id = record.split("/").pop()?.replace(/\.md$/, "") as string;
    const gate = python(["scripts/harness/deploy.py", "check", id, "--require-approved"], repo.root);
    expect(gate.code, gate.stdout + gate.stderr).toBe(0);
    const again = await call(srv, "POST", "/api/v1/approvals", { body: await approveBody(srv, repo, record, { waiveRollback: "검증 환경에 PG 샌드박스가 없다" }) });
    expect([again.status, again.json.error.code]).toEqual([409, "already_approved"]);
  });

  it("risk: high 는 사유가 있어도 면제 못 하고, 시험이 있으면 서로 다른 승인자 2명이 있어야 통과한다", async () => {
    const { repo, record } = await setup("high");
    ready(repo, record, false);
    const srv = await serve(repo);
    const waived = await call(srv, "POST", "/api/v1/approvals", { body: await approveBody(srv, repo, record, { waiveRollback: "검증 환경에 PG 샌드박스가 없다" }) });
    expect([waived.status, waived.json.error.details.conditions]).toEqual([422, ["D3"]]);
    ready(repo, record, true);
    const first = await call(srv, "POST", "/api/v1/approvals", { body: await approveBody(srv, repo, record) });
    expect(first.status, first.text).toBe(201);
    const id = record.split("/").pop()?.replace(/\.md$/, "") as string;
    expect(python(["scripts/harness/deploy.py", "check", id, "--require-approved"], repo.root).code).toBe(1);
    const same = await call(srv, "POST", "/api/v1/approvals", { body: await approveBody(srv, repo, record) });
    expect([same.status, same.json.error.code, same.json.error.details.need]).toEqual([409, "already_approved", 2]);
    git(repo.root, "config", "user.email", "park@example.com");
    const second = await call(srv, "POST", "/api/v1/approvals", { body: await approveBody(srv, repo, record) });
    expect(second.status, second.text).toBe(201);
    expect(python(["scripts/harness/deploy.py", "check", id, "--require-approved"], repo.root).code).toBe(0);
  });

  it("계획 구간이 화면을 연 뒤 바뀌면 409 doc_changed", async () => {
    const { repo, record } = await setup();
    ready(repo, record, true);
    const srv = await serve(repo);
    const body = await approveBody(srv, repo, record);
    writeFile(repo.root, record, readFile(repo.root, record).replace("| 스모크 |", "| 스모크 · 바뀜 |"));
    const r = await call(srv, "POST", "/api/v1/approvals", { body });
    expect([r.status, r.json.error.code]).toEqual([409, "doc_changed"]);
  });
});

describe("GET /ops", () => {
  it("배포 기록 · 승인 상태 · 자동 검증 배포 · 규칙 후보를 한 응답으로 낸다", async () => {
    const repo = makeRepo({ gates: ["requirements", "design", "tasks", "mr", "done", "deploy"] });
    doneIssue(repo, "DEMO-1", "pay-api");
    commitAll(repo.root);
    const record = plan(repo);
    ready(repo, record, true);
    const srv = await serve(repo);
    const r = await call(srv, "GET", "/api/v1/ops");
    expect(r.status, r.text).toBe(200);
    const data = r.json.data;
    expect(Object.keys(data).sort()).toEqual(["autoVerify", "candidates", "delivery", "deploys", "incidents", "records", "ruleCandidates", "todo"]);
    expect([data.deploys[0].state, data.deploys[0].approval, data.deploys[0].rollbackTest, data.deploys[0].risk]).toEqual(["planned", "none", "passed", "low"]);
    expect(data.autoVerify.enabled).toBe(false);
    const overview = await call(srv, "GET", "/api/v1/overview");
    expect(overview.json.data.todo.some((t: { kind: string }) => t.kind === "deploy-approval")).toBe(true);
  });
});
