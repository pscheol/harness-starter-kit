/** 화면 공용 순수 함수(static/js/format.js). DOM 이 없어 node 에서 그대로 시험한다. */
import { describe, expect, it } from "vitest";

const F = (await import("../src/lib/format")) as Record<string, any>;

describe("표시 형식", () => {
  it("fmtTokens · fmtBytes · fmtMs · pct", () => {
    expect([0, 999, 1234, 21_900_000, 10_400, null].map(F.fmtTokens)).toEqual(["0", "999", "1.2K", "22M", "10K", "-"]);
    expect([F.fmtBytes(512), F.fmtBytes(2048), F.fmtBytes(5 * 1024 ** 2), F.fmtBytes(null)]).toEqual(["512B", "2.0KB", "5.0MB", "-"]);
    expect([F.fmtMs(600), F.fmtMs(3200), F.fmtMs(134_000), F.fmtMs(null)]).toEqual(["600ms", "3.2초", "2분 14초", "-"]);
    expect([F.pct(0.623), F.pct(0.8764, 1), F.pct(null)]).toEqual(["62%", "87.6%", "-"]);
  });

  it("clock · ago · dayLabel 은 now 를 받아 고정된다", () => {
    const now = new Date(2026, 10, 24, 13, 0, 0);
    expect(F.clock(new Date(2026, 10, 24, 9, 5).toISOString(), now)).toBe("09:05");
    expect(F.clock(new Date(2026, 10, 20, 9, 5).toISOString(), now)).toBe("11-20 09:05");
    expect(F.clock(null)).toBe("-");
    expect([30_000, 5 * 60_000, 3 * 3_600_000, 5 * 86_400_000].map((ms) => F.ago(new Date(now.getTime() - ms).toISOString(), now))).toEqual(["방금", "5분 전", "3시간 전", "5일 전"]);
    expect(F.dayLabel("2026-11-24")).toEqual({ short: "11/24", week: "화", text: "11월 24일 화" });
  });
});

describe("게이트 레일 · 처리할 일 묶음 · 라우트", () => {
  const gates = ["intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"];
  const issue = (over: Record<string, unknown>) => ({
    intent: "INT-1",
    stage: "design",
    waitingOn: null,
    gates: [
      { gate: "requirements", passed: true },
      { gate: "design", passed: false },
      { gate: "tasks", passed: false },
      { gate: "mr", passed: false },
      { gate: "done", passed: false },
    ],
    ...over,
  });

  it("지난 게이트는 ok, 처음 못 넘은 자리는 now(승인 기다리면 wait), 그 뒤는 todo, 이슈 게이트가 아닌 것은 해당 없음", () => {
    const now = F.railSpec(gates, issue({})).map((s: { state: string }) => s.state);
    expect(now).toEqual(["ok", "skip", "ok", "now", "todo", "todo", "todo", "todo"].map((s, i) => (i === 1 ? "ok" : s)));
    const wait = F.railSpec(gates, issue({ waitingOn: { gate: "design", approvers: [], mine: true } })).map((s: { state: string }) => s.state);
    expect(wait[3]).toBe("wait");
    expect(F.railSpec(gates, issue({ intent: null })).slice(0, 2).map((s: { state: string }) => s.state)).toEqual(["skip", "skip"]);
  });

  it("groupTodos: rank 로 묶고 '내가 할 것'은 mine · rank 2 이하만", () => {
    const todo = [
      { rank: 1, mine: false, target: "A-1" },
      { rank: 2, mine: true, target: "A-2" },
      { rank: 3, mine: false, target: "A-3" },
      { rank: 6, mine: false, target: "A-6" },
      { rank: 7, mine: false, target: "A-7" },
    ];
    expect(F.groupTodos(todo).map((g: { id: string; items: unknown[] }) => [g.id, g.items.length])).toEqual([["blocked", 1], ["mine", 1], ["questions", 1], ["others", 1], ["cleanup", 1]]);
    expect(F.groupTodos(todo, true).map((g: { id: string }) => g.id)).toEqual(["blocked", "mine"]);
  });

  it("parseRoute · menuOf: 서버가 주는 link 가 모두 화면 이름으로 풀린다", () => {
    const cases: [string, string, string][] = [
      ["/", "", "home"],
      ["/progress", "", "progress"],
      ["/progress", "?view=flow&intent=INT-7", "flow"],
      ["/issues/K-1/review", "", "issue"],
      ["/issues/K-1/approve", "?gate=design", "issue"],
      ["/issues/K-1/docs/design", "", "issue"],
      ["/intents/INT-7/questions", "", "questions"],
      ["/verify", "", "verify"],
      ["/workspace", "", "workspace"],
      ["/harness", "", "harness"],
      ["/usage", "?tab=history", "usage"],
      ["/skills", "", "skills"],
      ["/ops", "", "ops"],
      ["/intake", "", "intake"],
      ["/docs", "?q=x", "docs"],
      ["/projects", "", "projects"],
      ["/없는/경로", "", "notfound"],
    ];
    for (const [p, q, name] of cases) expect([p, F.parseRoute(p, q).name]).toEqual([p, name]);
    expect(F.parseRoute("/issues/K-1/docs/design").params).toEqual({ key: "K-1", tab: "design" });
    expect(F.parseRoute("/issues/K-1/review").params.tab).toBe("review");
    expect(F.menuOf(F.parseRoute("/progress", "?view=flow"))).toBe("progress");
    expect(F.menuOf(F.parseRoute("/issues/K-1"))).toBe("docs");
  });
});
