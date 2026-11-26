/** 화면 상태(src/lib/store.ts) · 라우터 · 제안 · 찾기 · PIN 다듬기: 서버 계약이 아닌 화면 쪽 순수 동작. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityDays, stageRows } from "../src/lib/format";
import { normalizePin } from "../src/lib/pin";
import { buildChange, describeChange } from "../src/lib/proposal";
import { searchTarget } from "../src/lib/search";

function stubBrowser(pathname = "/"): void {
  vi.stubGlobal("location", { port: "4321", pathname, search: "", hash: "" });
  vi.stubGlobal("localStorage", { getItem: () => "tok", setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("window", {});
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("store", () => {
  const overview = {
    total: 7,
    more: { "2": 3 },
    todo: [
      { rank: 1 },
      { rank: 2 },
      { rank: 3 },
      { rank: 4 },
      { rank: 5 },
      { rank: 7 },
      { rank: 8 },
      { rank: 9 },
    ],
  };

  it("badges: 레일 개수는 overview.todo 의 rank 로 세고 50건 넘은 건수(more)를 더한다", async () => {
    stubBrowser();
    const { badges } = await import("../src/lib/store");
    const b = badges(overview);
    // 홈의 빨간 배지는 사람이 결정할 일(rank 1~6)만 센다 — 정리 · 설치 점검(7~9)은 제 메뉴에만(2026-11-26)
    expect(b.home).toEqual({ n: 5 + 3, kind: "decide" }); // rank 1 · 2 · 3 · 4 · 5 + more[2]
    expect(badges({ todo: [{ rank: 8 }, { rank: 7 }], total: 2 }).home.n).toBe(0);
    expect(b.docs.n).toBe(3 + 3); // rank 2 · 3 · 5 + more[2]
    expect(b.verify.n).toBe(2); // rank 1 · 4
    expect(b.workspace).toEqual({ n: 2, kind: "info" });
    expect(b.harness).toEqual({ n: 1, kind: "warn" });
    expect(badges(null).home.n).toBe(0);
  });

  it("setState 는 구독자에게 알리고 이전 객체를 바꾸지 않는다(불변)", async () => {
    stubBrowser();
    const s = await import("../src/lib/store");
    s.resetState();
    const before = s.getState();
    const seen: string[] = [];
    const off = s.subscribe(() => seen.push(s.getState().mode));
    s.setState({ mode: "multi-root" });
    off();
    s.setState({ mode: "project" });
    expect(seen).toEqual(["multi-root"]);
    expect(before.mode).toBe("single");
    expect(s.getState().mode).toBe("project");
  });

  it("detectMode: /session 이 되면 단일 리포, 안 되고 최상위 /projects 가 되면 전체 프로젝트, 접두가 있으면 프로젝트 안", async () => {
    stubBrowser();
    const ok = (data: unknown) => ({ status: 200, ok: true, json: async () => ({ ok: true, data }), headers: { get: () => null } });
    const no = (status: number, code: string) => ({ status, ok: false, json: async () => ({ ok: false, error: { code, message: code } }), headers: { get: () => null } });
    let s = await import("../src/lib/store");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok({})));
    await s.detectMode();
    expect(s.getState().mode).toBe("single");

    vi.resetModules();
    stubBrowser();
    s = await import("../src/lib/store");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(no(404, "not_found")).mockResolvedValueOnce(ok({ projects: [] })));
    await s.detectMode();
    expect(s.getState().mode).toBe("multi-root");

    vi.resetModules();
    stubBrowser("/p/0123456789ab/");
    s = await import("../src/lib/store");
    await s.detectMode();
    expect(s.getState().mode).toBe("project");

    vi.resetModules();
    stubBrowser();
    s = await import("../src/lib/store");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(no(401, "unauthorized")).mockResolvedValueOnce(no(401, "unauthorized")));
    await s.detectMode();
    expect(s.getState().loadError?.code).toBe("unauthorized");
  });
});

describe("router", () => {
  it("stripBase · fullPath · isHardTarget: 프로젝트 접두를 떼고 붙이고, 모드가 바뀌는 링크만 새 문서로 읽는다", async () => {
    stubBrowser();
    const r = await import("../src/lib/router");
    expect(r.stripBase("/p/0123456789ab/issues/K-1")).toBe("/issues/K-1");
    expect(r.stripBase("/p/0123456789ab")).toBe("/");
    expect(r.stripBase("/progress")).toBe("/progress");
    expect(r.fullPath("/progress", "/p/0123456789ab")).toBe("/p/0123456789ab/progress");
    expect(r.fullPath("verify", "")).toBe("/verify");
    expect(r.isHardTarget("/p/0123456789ab/")).toBe(true);
    expect(r.isHardTarget("/p/0123456789ab/progress?x=1")).toBe(true);
    expect(r.isHardTarget("/?hard=1")).toBe(true);
    expect(r.isHardTarget("/progress")).toBe(false);
    expect(r.isHardTarget("/p/short/x")).toBe(false);
    expect(r.hardHref("/")).toBe("/?hard=1");
    expect(r.hardHref("/a?b=1")).toBe("/a?b=1&hard=1");
  });
});

describe("찾기 · PIN · 제안 · 차트 입력", () => {
  it("searchTarget: 이슈 키 · Intent 키 · 문서 경로 · 그 밖은 문서 찾기", () => {
    expect(searchTarget("knots-21")).toBe("/issues/KNOTS-21");
    expect(searchTarget("INT-7")).toBe("/intents/INT-7/questions");
    expect(searchTarget(".agents/docs/issues/KNOTS-12-upload/design.md")).toBe("/issues/KNOTS-12/docs/design");
    expect(searchTarget("결제 수단")).toBe(`/docs?q=${encodeURIComponent("결제 수단")}`);
    expect(searchTarget("   ")).toBeNull();
  });

  it("normalizePin: 공백 · 기호를 빼고 대문자로", () => {
    expect(normalizePin(" ab-12 cd ")).toBe("AB12CD");
    expect(normalizePin("   ")).toBe("");
  });

  it("buildChange · describeChange: 종류마다 서버가 받는 모양이고 사람이 읽는 줄이 된다", () => {
    expect(buildChange("add-dep", "U-2", "U-1", "", " 이유 ")).toEqual({ op: "add-dep", reason: "이유", unit: "U-2", dependsOn: "U-1" });
    expect(buildChange("split", "U-2", "U-1", "가\n\n 나 \n다", "")).toEqual({ op: "split", unit: "U-2", into: ["가", "나", "다"] });
    expect(buildChange("merge", "U-2", "U-1", "", "")).toEqual({ op: "merge", units: ["U-2", "U-1"] });
    expect(buildChange("order", "U-2", "U-1", "U-3, U-1 ,U-2", "")).toEqual({ op: "order", units: ["U-3", "U-1", "U-2"] });
    expect(describeChange({ op: "add-dep", unit: "U-2", dependsOn: "U-1" })).toBe("U-2 가 U-1 에 의존");
    expect(describeChange({ op: "remove-dep", unit: "U-2", dependsOn: "U-1" })).toBe("U-2 의 U-1 의존 빼기");
    expect(describeChange({ op: "split", unit: "U-2", into: ["a", "b"] })).toBe("U-2 나누기: a | b");
    expect(describeChange({ op: "merge", units: ["U-1", "U-2"] })).toBe("합치기: U-1 + U-2");
    expect(describeChange({ op: "order", units: ["U-3", "U-1"] })).toBe("순서: U-3 → U-1");
  });

  it("stageRows: 게이트 순서 → 완료 → 그 밖의 단계, 없는 단계는 0", () => {
    const rows = stageRows({ requirements: 2, completed: 1, weird: 4 }, ["intent", "requirements", "design", "tasks", "mr", "done"]);
    expect(rows.map((r) => [r.id, r.label, r.v])).toEqual([["requirements", "요구사항", 2], ["design", "설계", 0], ["tasks", "작업 목록", 0], ["mr", "병합 요청", 0], ["completed", "완료", 1], ["weird", "weird", 4]]);
  });

  it("activityDays: 하루 합계를 점 격자 입력(date · v)으로", () => {
    expect(activityDays([{ date: "2026-11-23", sum: 5 }, { date: "2026-11-24", sum: 0 }])).toEqual([{ date: "2026-11-23", v: 5 }, { date: "2026-11-24", v: 0 }]);
  });
});
