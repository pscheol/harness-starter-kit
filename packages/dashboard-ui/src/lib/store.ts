// 화면 공용 상태: 세션 정보 · overview(5초) · 지금 세션(15초, 켜져 있을 때만). 탭이 숨겨지면 멈춘다(HK-18 store.js 와 같은 동작).
// 상태는 바꾸지 않고 통째로 새 객체로 갈아 끼운다(불변). React 는 useSyncExternalStore 로 읽는다.
import { useSyncExternalStore } from "react";
import { get, projectId, type ApiError } from "./api";
import type { Loose } from "./types";

export type Mode = "single" | "multi-root" | "project";

export interface AppState {
  mode: Mode;
  session: Loose | null;
  overview: Loose | null;
  usageNow: Loose | null;
  projects: Loose[];
  loadError: ApiError | null;
  readAt: Date | null;
  /** 첫 연결(모드 판정 + 세션 읽기)이 끝났는가 */
  ready: boolean;
}

let state: AppState = { mode: "single", session: null, overview: null, usageNow: null, projects: [], loadError: null, readAt: null, ready: false };
const subs = new Set<() => void>();

export const getState = (): AppState => state;
export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** 테스트용: 상태를 처음으로 되돌린다 */
export function resetState(): void {
  state = { mode: "single", session: null, overview: null, usageNow: null, projects: [], loadError: null, readAt: null, ready: false };
  subs.forEach((f) => f());
}

export async function detectMode(): Promise<void> {
  if (projectId()) {
    setState({ mode: "project" });
    return;
  }
  // 단일 리포 서버가 흔하므로 /session 을 먼저 묻는다(여러 프로젝트 서버의 최상위에는 /session 이 없다)
  const s = await get("/session");
  if (s.ok) {
    setState({ mode: "single" });
    return;
  }
  const r = await get("/projects", { scope: "top" });
  const err = !r.ok && r.error.code === "unauthorized" ? r.error : !s.ok && s.error.code === "unauthorized" ? s.error : null;
  setState({ mode: r.ok ? "multi-root" : "single", ...(err ? { loadError: err } : {}) });
}

export async function loadSession(): Promise<boolean> {
  const r = await get("/session");
  if (!r.ok) {
    setState({ loadError: r.error });
    return false;
  }
  setState({ session: r.data, loadError: null });
  return true;
}

export async function loadProjects(): Promise<void> {
  const r = await get("/projects", { scope: "top" });
  setState({ projects: r.ok ? r.data.projects : [] });
}

export async function refreshOverview(): Promise<void> {
  const r = await get("/overview", { etag: true });
  if (r.ok) {
    const cur = getState();
    setState({ overview: !r.notModified || !cur.overview ? r.data : cur.overview, readAt: new Date(), loadError: null });
  } else if (r.error.code === "network" || r.error.code === "unauthorized") setState({ loadError: r.error });
}

export async function refreshUsageNow(): Promise<void> {
  const r = await get("/usage/now");
  if (r.ok) setState({ usageNow: r.data });
}

let timers: ReturnType<typeof setInterval>[] = [];
const visible = (): boolean => document.visibilityState === "visible";

function onVisible(): void {
  if (visible() && getState().mode !== "multi-root") void refreshOverview();
}

export function startPolling(): void {
  stopPolling();
  timers.push(setInterval(() => visible() && getState().mode !== "multi-root" && void refreshOverview(), 5000));
  timers.push(
    setInterval(() => {
      const s = getState();
      if (visible() && s.mode !== "multi-root" && (!s.usageNow || s.usageNow.enabled)) void refreshUsageNow();
    }, 15_000),
  );
  document.addEventListener("visibilitychange", onVisible);
}

export function stopPolling(): void {
  timers.forEach(clearInterval);
  timers = [];
  document.removeEventListener("visibilitychange", onVisible);
}

export interface RailBadge {
  n: number;
  kind: "decide" | "warn" | "info";
}

/** 레일 개수 배지: overview.todo 의 rank 로 센다(빨강 = 처리할 일, 앰버 = 경고, 회색 = 정보) */
export function badges(overview: Loose | null | undefined): Record<string, RailBadge> {
  const todo: Loose[] = overview?.todo ?? [];
  const count = (f: (t: Loose) => boolean): number => todo.filter(f).length;
  const more: Record<string, number> = overview?.more ?? {};
  const moreOf = (ranks: number[]): number => ranks.reduce((s, r) => s + (more[String(r)] ?? 0), 0);
  return {
    // 사람이 결정할 일(막는 리뷰 · 승인 · 질문 · 실패한 검증)만. 정리 · 설치 점검은 제 메뉴 배지에만 보인다
    home: { n: count((t) => t.rank >= 1 && t.rank <= 6) + moreOf([1, 2, 3, 4, 5, 6]), kind: "decide" },
    docs: { n: count((t) => [2, 3, 5].includes(t.rank)) + moreOf([2, 3, 5]), kind: "decide" },
    verify: { n: count((t) => t.rank === 1 || t.rank === 4) + moreOf([1, 4]), kind: "decide" },
    workspace: { n: count((t) => t.rank === 7 || t.rank === 9) + moreOf([7, 9]), kind: "info" },
    harness: { n: count((t) => t.rank === 8) + moreOf([8]), kind: "warn" },
  };
}
