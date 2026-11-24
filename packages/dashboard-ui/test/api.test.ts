/** 화면의 API 클라이언트(src/lib/api.ts): 토큰 · 접두 · PIN · ETag · 오류 문구. 브라우저 전역(location · storage · fetch)을 가짜로 세운다. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeResponse = { status: number; ok: boolean; json: () => Promise<unknown>; headers: { get: (k: string) => string | null } };

function stubBrowser(pathname = "/", hash = ""): { store: Map<string, string>; session: Map<string, string>; calls: Array<{ url: string; init: RequestInit }> } {
  const store = new Map<string, string>();
  const session = new Map<string, string>();
  const mk = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  vi.stubGlobal("location", { port: "4321", pathname, search: "", hash });
  vi.stubGlobal("localStorage", mk(store));
  vi.stubGlobal("sessionStorage", mk(session));
  vi.stubGlobal("window", {});
  vi.stubGlobal("history", { replaceState: vi.fn() });
  return { store, session, calls: [] };
}

const res = (status: number, body: unknown, etag?: string): FakeResponse => ({ status, ok: status >= 200 && status < 300, json: async () => body, headers: { get: (k: string) => (k === "ETag" ? (etag ?? null) : null) } });

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("주소 · 접두 · 쿼리", () => {
  it("projectBase · projectId: /p/<12자리> 접두만 프로젝트 안으로 본다", async () => {
    stubBrowser();
    const api = await import("../src/lib/api");
    expect(api.projectBase("/p/0123456789ab/progress")).toBe("/p/0123456789ab");
    expect(api.projectId("/p/0123456789ab")).toBe("0123456789ab");
    expect(api.projectBase("/p/short/progress")).toBe("");
    expect(api.projectId("/progress")).toBeNull();
    expect(api.apiRoot(undefined, "/p/0123456789ab/x")).toBe("/api/v1/p/0123456789ab");
    expect(api.apiRoot("top", "/p/0123456789ab/x")).toBe("/api/v1");
    expect(api.apiRoot(undefined, "/progress")).toBe("/api/v1");
  });

  it("buildQuery: 빈 값 · null 은 뺀다", async () => {
    stubBrowser();
    const { buildQuery } = await import("../src/lib/api");
    expect(buildQuery({ a: "1", b: "", c: null, d: undefined, e: 0, f: false })).toBe("?a=1&e=0&f=false");
    expect(buildQuery(undefined)).toBe("");
    expect(buildQuery({})).toBe("");
  });
});

describe("토큰 · PIN 저장", () => {
  it("takeTokenFromHash: #t= 를 저장소로 옮기고 주소에서 지운다", async () => {
    const b = stubBrowser("/", "#t=abc_DEF-123");
    const api = await import("../src/lib/api");
    api.takeTokenFromHash();
    expect(b.store.get("hk-token-4321")).toBe("abc_DEF-123");
    expect(api.token()).toBe("abc_DEF-123");
    expect((history.replaceState as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(1);
  });

  it("PIN 은 sessionStorage 에만 둔다", async () => {
    const b = stubBrowser();
    const api = await import("../src/lib/api");
    api.setPin("ABC123");
    expect(b.session.get("hk-pin-4321")).toBe("ABC123");
    expect(b.store.size).toBe(0);
    expect(api.pin()).toBe("ABC123");
    api.setPin(null);
    expect(api.pin()).toBeNull();
  });
});

describe("request", () => {
  it("성공은 data · meta, 서버 오류는 error 코드, 네트워크 실패는 network, 중단은 aborted", async () => {
    stubBrowser();
    const api = await import("../src/lib/api");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(200, { ok: true, data: { x: 1 }, meta: { n: 2 } })).mockResolvedValueOnce(res(403, { ok: false, error: { code: "pin_required", message: "PIN" } })).mockRejectedValueOnce(new TypeError("fail")).mockRejectedValueOnce(Object.assign(new Error("x"), { name: "AbortError" })));
    expect(await api.get("/overview")).toEqual({ ok: true, status: 200, data: { x: 1 }, meta: { n: 2 } });
    const bad = await api.post("/approvals", {});
    expect(bad.ok === false && bad.error.code).toBe("pin_required");
    const net = await api.get("/x");
    expect(net.ok === false && net.error.code).toBe("network");
    const ab = await api.get("/x");
    expect(ab.ok === false && ab.error.code).toBe("aborted");
  });

  it("Authorization · Content-Type 머리, ETag 는 두 번째 요청에 If-None-Match 로 가고 304 는 처음 값을 돌려준다", async () => {
    const b = stubBrowser();
    b.store.set("hk-token-4321", "tok");
    const api = await import("../src/lib/api");
    const fetchMock = vi.fn().mockResolvedValueOnce(res(200, { ok: true, data: { v: 1 } }, 'W/"a"')).mockResolvedValueOnce(res(304, null)).mockResolvedValueOnce(res(200, { ok: true, data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await api.get("/overview", { etag: true });
    expect(first.ok && first.data).toEqual({ v: 1 });
    const second = await api.get("/overview", { etag: true });
    expect(second.ok && second.notModified).toBe(true);
    expect(second.ok && second.data).toEqual({ v: 1 });
    const h2 = (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(h2["If-None-Match"]).toBe('W/"a"');
    expect(h2.Authorization).toBe("Bearer tok");
    await api.put("/docs", { a: 1 });
    const putInit = (fetchMock.mock.calls[2] as [string, RequestInit])[1];
    expect((putInit.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(putInit.method).toBe("PUT");
  });

  it("프로젝트 안 주소는 /api/v1/p/<id> 로 간다", async () => {
    stubBrowser("/p/0123456789ab/progress");
    const api = await import("../src/lib/api");
    const fetchMock = vi.fn().mockResolvedValue(res(200, { ok: true, data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await api.get("/issues");
    await api.get("/projects", { scope: "top" });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("/api/v1/p/0123456789ab/issues");
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe("/api/v1/projects");
  });
});

describe("errorText", () => {
  it("코드별 안내를 덧붙이고, conflict 는 서버 문구만 쓴다", async () => {
    stubBrowser();
    const { errorText } = await import("../src/lib/api");
    expect(errorText({ code: "read_only", message: "읽기 전용" })).toContain("--read-only");
    expect(errorText({ code: "conflict", message: "먼저 저장" })).toBe("먼저 저장");
    expect(errorText({ code: "other", message: "그냥" })).toBe("그냥");
    expect(errorText(null)).toBe("");
  });
});
