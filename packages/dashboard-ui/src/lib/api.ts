// 관리 페이지 API 호출(설계 06 §3.1 · §3.5). 토큰은 주소 #t= → localStorage → Authorization 머리. PIN 은 탭마다 한 번(sessionStorage).
// HK-18 의 static/js/api.js 와 같은 동작이다: 같은 주소 · 같은 오류 코드 · 같은 ETag 처리.
import type { Loose } from "./types";

export interface ApiError {
  code: string;
  message: string;
  [key: string]: unknown;
}

export type ApiResult<T = Loose> =
  | { ok: true; status: number; data: T; meta: Loose; notModified?: boolean }
  | { ok: false; status: number; error: ApiError };

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  /** "top": 여러 프로젝트 서버의 최상위(`/api/v1`), 그 밖에는 프로젝트 안이면 `/api/v1/p/<id>` */
  scope?: "top";
  /** 목록 갱신용 If-None-Match */
  etag?: boolean;
  signal?: AbortSignal;
}

const PORT = typeof location === "undefined" ? "0" : location.port;
const TOKEN_KEY = `hk-token-${PORT}`;
const PIN_KEY = `hk-pin-${PORT}`;

declare global {
  interface Window {
    __hkToken?: string;
  }
}

/** 주소의 `#t=` 를 저장소로 옮기고 주소에서 지운다. 저장소를 못 쓰면 이 탭의 변수에만 둔다. */
export function takeTokenFromHash(): void {
  const m = /(?:^|[#&])t=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return;
  try {
    localStorage.setItem(TOKEN_KEY, m[1] as string);
  } catch {
    window.__hkToken = m[1];
  }
  history.replaceState(null, "", location.pathname + location.search);
}

export function token(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || window.__hkToken || "";
  } catch {
    return window.__hkToken || "";
  }
}

/** `/p/<id>` 접두(여러 프로젝트 모드에서 프로젝트 안). 없으면 ""(단일 리포 또는 전체 프로젝트) */
export function projectBase(pathname: string = location.pathname): string {
  const m = /^\/p\/([0-9a-f]{12})(?:\/|$)/.exec(pathname);
  return m ? `/p/${m[1]}` : "";
}

export function projectId(pathname?: string): string | null {
  return projectBase(pathname).slice(3) || null;
}

export function apiRoot(scope: "top" | undefined, pathname?: string): string {
  const id = projectId(pathname);
  return scope === "top" || !id ? "/api/v1" : `/api/v1/p/${id}`;
}

export function pin(): string | null {
  try {
    return sessionStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

export function setPin(value: string | null): void {
  try {
    if (value) sessionStorage.setItem(PIN_KEY, value);
    else sessionStorage.removeItem(PIN_KEY);
  } catch {
    // 저장소를 못 쓰면 매번 묻는다
  }
}

const etags = new Map<string, { tag: string; result: ApiResult }>();

export function buildQuery(query: RequestOptions["query"]): string {
  if (!query) return "";
  const entries = Object.entries(query).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : "";
}

/** 요청. 결과는 항상 {ok, status, data, meta} 또는 {ok:false, error}. 네트워크 실패는 error.code "network". */
export async function request<T = Loose>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
  const url = `${apiRoot(opts.scope)}${path}${buildQuery(opts.query)}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token()}` };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const cached = etags.get(url);
  if (opts.etag && cached) headers["If-None-Match"] = cached.tag;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: "no-store", ...(opts.signal ? { signal: opts.signal } : {}) });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { ok: false, status: 0, error: { code: "aborted", message: "취소됨" } };
    return { ok: false, status: 0, error: { code: "network", message: "서버에 닿지 못했다. 서버를 연 터미널이 켜져 있는지 본다" } };
  }
  if (res.status === 304 && cached) return { ...(cached.result as ApiResult<T>), notModified: true } as ApiResult<T>;
  let json: Loose = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok && json && json.ok) {
    const result: ApiResult<T> = { ok: true, status: res.status, data: json.data as T, meta: json.meta ?? {} };
    const tag = res.headers.get("ETag");
    if (opts.etag && tag) etags.set(url, { tag, result });
    return result;
  }
  const error: ApiError = json?.error ? json.error : { code: res.status === 401 ? "unauthorized" : "internal", message: `응답 ${res.status}` };
  return { ok: false, status: res.status, error };
}

export const get = <T = Loose>(path: string, opts?: RequestOptions): Promise<ApiResult<T>> => request<T>("GET", path, opts);
export const post = <T = Loose>(path: string, body?: unknown, opts?: RequestOptions): Promise<ApiResult<T>> => request<T>("POST", path, { ...opts, body });
export const put = <T = Loose>(path: string, body?: unknown, opts?: RequestOptions): Promise<ApiResult<T>> => request<T>("PUT", path, { ...opts, body });
export const del = <T = Loose>(path: string, opts?: RequestOptions): Promise<ApiResult<T>> => request<T>("DELETE", path, opts);

const ERROR_HINT: Record<string, string> = {
  unauthorized: "접속 토큰이 없거나 틀렸다. 서버를 연 터미널에 나온 주소로 다시 연다",
  read_only: "읽기 전용 모드다(에이전트 세션에서 연 서버이거나 --read-only). 사람이 자기 터미널에서 서버를 연다",
  pin_required: "승인 PIN 이 틀렸거나 비었다. 서버를 연 터미널에 나온 PIN 을 넣는다",
  pin_locked: "PIN 을 5번 틀려 잠겼다. 서버를 다시 연다",
  conflict: "다른 곳에서 먼저 저장했다",
  history_off: "대화 기록 읽기가 꺼져 있다",
  not_implemented: "이 기능은 다른 이슈에서 제공한다",
  network: "서버에 닿지 못했다",
};

/** 사람이 읽는 오류 한 줄: 코드별 안내 */
export function errorText(err: ApiError | null | undefined): string {
  if (!err) return "";
  const hint = ERROR_HINT[err.code];
  return hint && !err.message.includes(hint) ? `${err.message}${err.code === "conflict" ? "" : ` — ${hint}`}` : err.message;
}
