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
    expect(F.menuOf(F.parseRoute("/issues/K-1"))).toBe("progress");
  });
});

describe("기록 · 사용량 요약(usageSummary)", () => {
  // 대화 기록 읽기가 꺼진 기본 상태에서 서버(/api/v1/usage)가 실제로 주는 모양
  const off = { enabled: false, totals: null, daily: [], roles: [], byIssue: [], cache: { average: null, daily: [] }, cost: null };

  it("대화 기록이 꺼져 totals 가 null 이어도 던지지 않고 기록 없음으로 요약한다", () => {
    const s = F.usageSummary(off);
    expect(s.summary).toContain("기록이 없습니다");
    expect(s.cacheSummary).toBe("캐시 읽기 기록이 없습니다");
    expect(s.cacheVals).toEqual([]);
  });

  it("켜져 있으면 합계 · 가장 많은 날 · 캐시 비율을 요약한다", () => {
    const on = {
      enabled: true,
      totals: { sum: 3000, requests: 4 },
      daily: [
        { date: "2026-11-24", sum: 1000, byRole: {} },
        { date: "2026-11-25", sum: 2000, byRole: {} },
      ],
      cache: { average: 0.5, daily: [{ date: "2026-11-24", ratio: 0.4 }, { date: "2026-11-25", ratio: null }] },
    };
    const s = F.usageSummary(on);
    expect(s.summary).toContain("2일 합 3.0K");
    expect(s.summary).toContain("2.0K");
    expect(s.cacheVals).toEqual([40, null]);
    expect(s.cacheSummary).toContain("평균 50%");
  });
});

describe("자동 갱신 표시(freshText) · 간격(liveMs)", () => {
  const now = new Date("2026-11-26T10:00:30Z").getTime();
  it("방금 · N초 전 · N분 전에 읽음, 아직 못 읽었으면 그렇게 말한다", () => {
    expect(F.freshText(null, now)).toBe("아직 읽지 못했습니다");
    expect(F.freshText(now - 2000, now)).toBe("방금 읽음");
    expect(F.freshText(now - 12_000, now)).toBe("12초 전에 읽음");
    expect(F.freshText(now - 3 * 60_000, now)).toBe("3분 전에 읽음");
  });

  it("live: true 는 5초, 숫자는 그 값, 끄면 null", async () => {
    const H = await import("../src/lib/hooks");
    expect([H.liveMs(true), H.liveMs(15_000), H.liveMs(false), H.liveMs(undefined), H.liveMs(0)]).toEqual([5000, 15_000, null, null, null]);
  });
});

describe("쉬운 말(용어 풀이)", () => {
  it("화면에 남는 용어는 한 줄 풀이가 있다", () => {
    for (const k of ["intent", "bolt", "unit", "gate", "mr", "worktree", "doctor", "harness", "readOnly"]) {
      expect(F.TERMS[k]?.label, k).toBeTruthy();
      expect(F.TERMS[k]?.help, k).toMatch(/니다\.?$/);
    }
  });
});
