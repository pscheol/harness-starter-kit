/** 이슈 표시 도우미(src/ui/GateRail.tsx): 자연 정렬 · 제목 중복 숨김 · 문서 상태 한 줄 · 옛 배치 이슈 레일. */
import { describe, expect, it } from "vitest";
import { byIssueKey, docState, issueRail, issueStatus, issueTitle } from "../src/ui/GateRail";

describe("이슈 표시 도우미", () => {
  it("이슈 키는 사람 순서로 정렬한다(1, 2, 10 · PROJ-2 < PROJ-10)", () => {
    const keys = ["10-a", "2-b", "1-c", "PROJ-10", "PROJ-2"].map((key) => ({ key }));
    expect([...keys].sort(byIssueKey).map((k) => k.key)).toEqual(["1-c", "2-b", "10-a", "PROJ-2", "PROJ-10"]);
  });

  it("제목이 폴더 이름 · 키와 같으면 숨긴다", () => {
    expect(issueTitle({ key: "15-fix-real-behaviors", name: "real-behaviors", title: "real-behaviors" })).toBeNull();
    expect(issueTitle({ key: "KNOTS-12", name: "upload-cleanup", title: "업로드 임시 파일 정리" })).toBe("업로드 임시 파일 정리");
  });

  it("문서 상태는 한국어 한 줄 — approved 와 '승인 전'을 나란히 붙이지 않는다", () => {
    expect(docState("requirements", { approval: "valid", state: "approved" })).toEqual({ tone: "ops", label: "승인됨" });
    expect(docState("design", { state: "draft | in-review | approved" })).toEqual({ tone: "line", label: "초안" });
    expect(docState("design", { approval: "stale", state: "approved" })?.label).toBe("승인 뒤 바뀜");
    expect(docState("tasks", { approval: "stale", state: "approved" })?.label).toBe("승인됨");
    expect(docState("design", null)).toBeNull();
  });

  it("게이트 판정이 없는 옛 배치 이슈도 보드 단계로 레일을 채운다 · 해당 없음 · 닿지 않은 배포는 그리지 않는다", () => {
    const gates = ["requirements", "design", "tasks", "mr", "done", "deploy"];
    const done = issueRail(gates, { stage: "completed", gates: [] });
    expect(done.map((s) => s.state)).not.toContain("skip");
    expect(done.every((s) => s.state === "ok")).toBe(true);
    const mid = issueRail(gates, { stage: "design", gates: [] });
    expect(mid.find((s) => s.gate === "requirements")?.state).toBe("ok");
    expect(mid.find((s) => s.gate === "deploy")).toBeUndefined();
  });

  it("빨강은 사람 승인 대기에만", () => {
    expect(issueStatus({ waitingOn: { gate: "requirements" } }).tone).toBe("gate");
    expect(issueStatus({ stage: "completed" })).toEqual({ tone: "ops", label: "완료" });
  });
});
