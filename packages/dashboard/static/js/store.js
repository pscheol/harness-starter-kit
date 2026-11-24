// 화면 공용 상태: 세션 정보 · overview(5초) · 지금 세션(15초, 켜져 있을 때만). 탭이 숨겨지면 멈춘다.
import { get, projectId } from "./api.js";

export const store = {
  mode: "single", // single | multi-root | project
  session: null,
  overview: null,
  usageNow: null,
  loadError: null,
  readAt: null,
};

const subs = new Set();
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
const emit = () => subs.forEach((f) => f());

export async function detectMode() {
  if (projectId()) {
    store.mode = "project";
    return;
  }
  // 단일 리포 서버가 흔하므로 /session 을 먼저 묻는다(여러 프로젝트 서버의 최상위에는 /session 이 없다)
  const s = await get("/session");
  if (s.ok) {
    store.mode = "single";
    return;
  }
  const r = await get("/projects", { scope: "top" });
  store.mode = r.ok ? "multi-root" : "single";
  if (!r.ok && (r.error.code === "unauthorized" || s.error.code === "unauthorized")) store.loadError = r.error.code === "unauthorized" ? r.error : s.error;
}

export async function loadSession() {
  const r = await get("/session");
  if (!r.ok) {
    store.loadError = r.error;
    emit();
    return false;
  }
  store.session = r.data;
  store.loadError = null;
  emit();
  return true;
}

export async function refreshOverview() {
  const r = await get("/overview", { etag: true });
  if (r.ok) {
    if (!r.notModified || !store.overview) store.overview = r.data;
    store.readAt = new Date();
    store.loadError = null;
  } else if (r.error.code === "network" || r.error.code === "unauthorized") store.loadError = r.error;
  emit();
}

export async function refreshUsageNow() {
  const r = await get("/usage/now");
  if (r.ok) store.usageNow = r.data;
  emit();
}

let timers = [];
export function startPolling() {
  stopPolling();
  const tick = () => {
    if (document.visibilityState === "visible" && store.mode !== "multi-root") void refreshOverview();
  };
  timers.push(setInterval(tick, 5000));
  timers.push(
    setInterval(() => {
      if (document.visibilityState === "visible" && store.mode !== "multi-root" && (!store.usageNow || store.usageNow.enabled)) void refreshUsageNow();
    }, 15_000),
  );
  document.addEventListener("visibilitychange", onVisible);
}
function onVisible() {
  if (document.visibilityState === "visible" && store.mode !== "multi-root") void refreshOverview();
}
export function stopPolling() {
  timers.forEach(clearInterval);
  timers = [];
  document.removeEventListener("visibilitychange", onVisible);
}

/** 레일 개수 배지: overview.todo 의 rank 로 센다(빨강 = 처리할 일, 앰버 = 경고, 회색 = 정보) */
export function badges(overview) {
  const todo = overview?.todo ?? [];
  const count = (f) => todo.filter(f).length;
  const more = overview?.more ?? {};
  const moreOf = (ranks) => ranks.reduce((s, r) => s + (more[String(r)] ?? 0), 0);
  return {
    home: { n: overview?.total ?? 0, kind: "decide" },
    docs: { n: count((t) => [2, 3, 5].includes(t.rank)) + moreOf([2, 3, 5]), kind: "decide" },
    verify: { n: count((t) => t.rank === 1 || t.rank === 4) + moreOf([1, 4]), kind: "decide" },
    workspace: { n: count((t) => t.rank === 7 || t.rank === 9) + moreOf([7, 9]), kind: "info" },
    harness: { n: count((t) => t.rank === 8) + moreOf([8]), kind: "warn" },
  };
}
