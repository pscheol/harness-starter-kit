// 관리 페이지 API 호출(설계 06 §3.1 · §3.5). 토큰은 주소 #t= → localStorage → Authorization 머리. PIN 은 탭마다 한 번(sessionStorage).
const PORT = location.port;
const TOKEN_KEY = `hk-token-${PORT}`;
const PIN_KEY = `hk-pin-${PORT}`;

function takeTokenFromHash() {
  const m = /(?:^|[#&])t=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return;
  try {
    localStorage.setItem(TOKEN_KEY, m[1]);
  } catch {
    // 저장소를 못 쓰면 이 탭에서만 쓴다
    window.__hkToken = m[1];
  }
  history.replaceState(null, "", location.pathname + location.search);
}
takeTokenFromHash();

export function token() {
  try {
    return localStorage.getItem(TOKEN_KEY) || window.__hkToken || "";
  } catch {
    return window.__hkToken || "";
  }
}

/** `/p/<id>` 접두(여러 프로젝트 모드에서 프로젝트 안). 없으면 ""(단일 리포 또는 전체 프로젝트) */
export function projectBase() {
  const m = /^\/p\/([0-9a-f]{12})(?:\/|$)/.exec(location.pathname);
  return m ? `/p/${m[1]}` : "";
}

export function projectId() {
  return projectBase().slice(3) || null;
}

function apiRoot(scope) {
  const id = projectId();
  return scope === "top" || !id ? "/api/v1" : `/api/v1/p/${id}`;
}

export function pin() {
  try {
    return sessionStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}
export function setPin(value) {
  try {
    if (value) sessionStorage.setItem(PIN_KEY, value);
    else sessionStorage.removeItem(PIN_KEY);
  } catch {
    // 저장소를 못 쓰면 매번 묻는다
  }
}

const etags = new Map();

/**
 * 요청. 결과는 항상 {ok, status, data, meta, error}. 네트워크 실패는 error.code "network".
 * opts: {query, body, scope: "top", etag: true(목록 갱신용 If-None-Match), signal}
 */
export async function request(method, path, opts = {}) {
  const q = opts.query ? `?${new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== null && v !== undefined && v !== ""))}` : "";
  const url = `${apiRoot(opts.scope)}${path}${q}`;
  const headers = { Authorization: `Bearer ${token()}` };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.etag && etags.has(url)) headers["If-None-Match"] = etags.get(url).tag;
  let res;
  try {
    res = await fetch(url, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: "no-store", ...(opts.signal ? { signal: opts.signal } : {}) });
  } catch (err) {
    if (err && err.name === "AbortError") return { ok: false, status: 0, error: { code: "aborted", message: "취소됨" } };
    return { ok: false, status: 0, error: { code: "network", message: "서버에 닿지 못했다. 서버를 연 터미널이 켜져 있는지 본다" } };
  }
  if (res.status === 304 && etags.has(url)) return { ...etags.get(url).result, notModified: true };
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok && json && json.ok) {
    const result = { ok: true, status: res.status, data: json.data, meta: json.meta ?? {} };
    const tag = res.headers.get("ETag");
    if (opts.etag && tag) etags.set(url, { tag, result });
    return result;
  }
  const error = json && json.error ? json.error : { code: res.status === 401 ? "unauthorized" : "internal", message: `응답 ${res.status}` };
  return { ok: false, status: res.status, error };
}

export const get = (path, opts) => request("GET", path, opts);
export const post = (path, body, opts) => request("POST", path, { ...opts, body });
export const put = (path, body, opts) => request("PUT", path, { ...opts, body });
export const del = (path, opts) => request("DELETE", path, opts);

/** 사람이 읽는 오류 한 줄: 코드별 안내 */
export function errorText(err) {
  if (!err) return "";
  const hint = {
    unauthorized: "접속 토큰이 없거나 틀렸다. 서버를 연 터미널에 나온 주소로 다시 연다",
    read_only: "읽기 전용 모드다(에이전트 세션에서 연 서버이거나 --read-only). 사람이 자기 터미널에서 서버를 연다",
    pin_required: "승인 PIN 이 틀렸거나 비었다. 서버를 연 터미널에 나온 PIN 을 넣는다",
    pin_locked: "PIN 을 5번 틀려 잠겼다. 서버를 다시 연다",
    conflict: "다른 곳에서 먼저 저장했다",
    history_off: "대화 기록 읽기가 꺼져 있다",
    not_implemented: "이 기능은 다른 이슈에서 제공한다",
    network: "서버에 닿지 못했다",
  }[err.code];
  return hint && !err.message.includes(hint) ? `${err.message}${err.code === "conflict" ? "" : ` — ${hint}`}` : err.message;
}
