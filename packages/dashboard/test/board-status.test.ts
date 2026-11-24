/** 보드 여덟 상태(설계 10 §3.4, MD-R15): 킷 단계에서만 계산한다. Jira 모듈이 꺼져 있어도 같은 여덟 이름이다. */
import { describe, expect, it } from "vitest";
import { BOARD_STATES, boardStatusOf, stateIndex } from "../src/board-status";
import { call, makeRepo, serve, writeIssue } from "./helpers";

const doc = (status: string | null, state?: string, approval?: string) => ({ status, ...(state ? { state } : {}), ...(approval ? { approval } : {}) });

describe("boardStatusOf", () => {
  it("여덟 상태 이름과 순서", () => {
    expect(BOARD_STATES.map((s) => s.label)).toEqual(["백로그", "요구사항 작성", "요구사항 승인 대기", "설계", "구현 중", "검증", "완료", "배포됨"]);
    expect(stateIndex("verifying")).toBe(5);
  });

  it("문서 머리 · 승인에서 단계를 계산한다", () => {
    const at = (r: ReturnType<typeof doc> | null, d: ReturnType<typeof doc> | null, t: ReturnType<typeof doc> | null, deployed = false) => boardStatusOf({ requirements: r, design: d, tasks: t, deployed }).id;
    expect(at(null, null, null)).toBe("backlog");
    expect(at(doc("draft"), null, null)).toBe("requirements-draft");
    expect(at(doc("in-review"), null, null)).toBe("requirements-review");
    expect(at(doc("approved", undefined, "valid"), null, null)).toBe("design");
    expect(at(doc("approved"), doc("draft"), null)).toBe("design");
    expect(at(doc("approved"), doc("approved"), doc("draft"))).toBe("design");
    expect(at(doc("approved"), doc("approved"), doc("approved", undefined, "valid"))).toBe("implementing");
    expect(at(doc("approved"), doc("approved"), doc(null, "active"))).toBe("implementing");
    expect(at(doc("approved"), doc("approved"), doc(null, "check"))).toBe("verifying");
    expect(at(doc("approved"), doc("approved"), doc(null, "completed"))).toBe("done");
    expect(at(doc("approved"), doc("approved"), doc(null, "completed"), true)).toBe("deployed");
  });
});

describe("GET /issues 의 boardStatus", () => {
  it("모듈 없이도 이슈마다 여덟 상태가 붙는다", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "a-b", { requirements: "in-review" });
    writeIssue(repo.root, "DEMO-2", "c-d", { requirements: "approved", design: "approved", tasks: "check" });
    const srv = await serve(repo);
    const res = await call(srv, "GET", "/api/v1/issues");
    const by = Object.fromEntries((res.json.data.issues as { key: string; boardStatus: { id: string; label: string } }[]).map((i) => [i.key, i.boardStatus]));
    expect(by["DEMO-1"]).toEqual({ id: "requirements-review", label: "요구사항 승인 대기" });
    expect(by["DEMO-2"]).toEqual({ id: "verifying", label: "검증" });
    await srv.close();
  });
});
