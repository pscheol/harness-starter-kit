/** risk: high 이슈의 design 은 서로 다른 승인자 2명(설계 08 §3.15 · DS-R26). approvals.py need_of 와 같은 판정. */
import { describe, expect, it } from "vitest";
import { approvalState, needOf } from "../src/approvals";
import { call, commitAll, docSha, git, makeRepo, readFile, serve, writeFile, writeIssue } from "./helpers";

describe("risk: high 두 사람 승인", () => {
  it("needOf 는 high 의 design · mr · deploy 만 2명 이상, 프로젝트는 올리기만 한다", () => {
    expect([needOf({}, "low", "design"), needOf({}, "high", "requirements"), needOf({}, "high", "design"), needOf({ risk: { highApprovals: 1 } }, "high", "mr"), needOf({ risk: { highApprovals: 3 } }, "high", "deploy")]).toEqual([1, 1, 2, 2, 3]);
    expect(approvalState([], "design", null, null, 2)).toBe("none");
  });

  it("같은 사람이 두 번 승인하면 409, 다른 사람이 승인하면 valid", async () => {
    const repo = makeRepo({ gates: ["requirements", "design", "tasks", "mr", "done"] });
    const dir = writeIssue(repo.root, "DEMO-1", "card-payment", { area: "payment", requirements: "draft", design: "in-review" });
    writeFile(repo.root, `${dir}/requirements.md`, readFile(repo.root, `${dir}/requirements.md`).replace("status: draft", "status: draft\nrisk: high"));
    commitAll(repo.root);
    const srv = await serve(repo);
    const req = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: "DEMO-1" }, gate: "requirements", decision: "approved", phrase: "요구 확정", docSha256: await docSha(srv, `${dir}/requirements.md`), pin: srv.pin } });
    expect(req.status, req.text).toBe(201);
    const body = async () => ({ target: { issue: "DEMO-1" }, gate: "design", decision: "approved", phrase: "설계 확정", docSha256: await docSha(srv, `${dir}/design.md`), pin: srv.pin });
    const first = await call(srv, "POST", "/api/v1/approvals", { body: await body() });
    expect(first.status, first.text).toBe(201);
    const issue = await call(srv, "GET", "/api/v1/issues/DEMO-1");
    expect(issue.json.data.docs.design.approval).toBe("partial");
    const again = await call(srv, "POST", "/api/v1/approvals", { body: await body() });
    expect([again.status, again.json.error.code, again.json.error.details.need]).toEqual([409, "already_approved", 2]);
    git(repo.root, "config", "user.email", "lee@example.com");
    const second = await call(srv, "POST", "/api/v1/approvals", { body: await body() });
    expect(second.status, second.text).toBe(201);
    expect((await call(srv, "GET", "/api/v1/issues/DEMO-1")).json.data.docs.design.approval).toBe("valid");
  });
});
