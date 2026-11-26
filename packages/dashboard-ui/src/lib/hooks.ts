// 화면 공용 훅: 데이터 읽기(로딩 · 오류 · 다시 읽기 · 자동 갱신), 일정 간격 갱신(탭이 숨겨지면 멈춤).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError, ApiResult } from "./api";
import type { Loose } from "./types";

export type LoadState<T> = { status: "loading"; data: null; error: null } | { status: "ready"; data: T; error: null } | { status: "error"; data: null; error: ApiError };

/** 자동 갱신 기본 간격. 화면 머리의 "N초 전에 읽음" 풀이 글도 이 값을 쓴다. */
export const LIVE_MS = 5000;

export interface Loader<T> {
  state: LoadState<T>;
  reload: () => void;
  /** 마지막으로 다 읽은 시각(ms). 아직 못 읽었으면 null */
  at: number | null;
  /** 자동 갱신 간격(ms). 끄면 null */
  every: number | null;
  /** 자동 갱신이 실패해 화면이 마지막으로 읽은 내용을 보이는 중 */
  stale: ApiError | null;
}

export interface LoadOptions {
  /** 이 오류 코드는 실패로 보지 않는다(그 결과는 data[i] 가 null) */
  tolerate?: string[];
  /**
   * 자동 갱신(ms). true 면 LIVE_MS. 갱신은 "불러오는 중"으로 바꾸지 않고 조용히 다시 읽어 바뀐 값만 그린다.
   * 사람이 고르거나 적는 칸(승인 · 답 · 접수 폼)이 있는 화면은 켜지 않는다 — 적는 중에 바탕 값이 바뀌지 않게.
   */
  live?: boolean | number;
}

/** live 옵션 → 간격(ms). 끄면 null */
export function liveMs(live: boolean | number | undefined): number | null {
  if (live === true) return LIVE_MS;
  if (typeof live === "number" && live > 0) return live;
  return null;
}

/**
 * 요청 묶음을 한꺼번에 받는다. 하나라도 실패하면 오류 상태(tolerate 에 든 코드는 넘긴다).
 * deps 가 바뀌면 다시 읽고, 늦게 온 이전 응답은 버린다.
 */
export function useLoad<T extends unknown[]>(fetchAll: () => { [K in keyof T]: Promise<ApiResult<T[K]>> }, deps: unknown[], opts: LoadOptions = {}): Loader<T> {
  const [state, setState] = useState<LoadState<T>>({ status: "loading", data: null, error: null });
  const [at, setAt] = useState<number | null>(null);
  const [stale, setStale] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const silent = useRef(false);
  const fetchRef = useRef(fetchAll);
  fetchRef.current = fetchAll;
  const tolerate = opts.tolerate;
  const every = liveMs(opts.live);

  useEffect(() => {
    const my = ++seq.current;
    const quiet = silent.current;
    silent.current = false;
    if (!quiet) setState({ status: "loading", data: null, error: null });
    void (async () => {
      const results = (await Promise.all(fetchRef.current() as Promise<ApiResult<Loose>>[])) as ApiResult<Loose>[];
      if (my !== seq.current) return;
      const bad = results.find((r) => !r.ok && !(tolerate ?? []).includes(r.error.code));
      if (bad && !bad.ok) {
        // 조용한 갱신이 실패하면 마지막 내용을 그대로 두고 "오래됨"만 알린다
        if (quiet) setStale(bad.error);
        else setState({ status: "error", data: null, error: bad.error });
        return;
      }
      setStale(null);
      setAt(Date.now());
      setState({ status: "ready", data: results.map((r) => (r.ok ? r.data : null)) as unknown as T, error: null });
    })();
    // fetchAll 은 deps 로 갈음한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEvery(every ?? 0, () => {
    silent.current = true;
    setTick((n) => n + 1);
  });
  return { state, reload, at, every, stale };
}

/** 화면이 보일 때만 ms 마다 fn 을 부른다. ms 가 0 이하면 아무것도 하지 않는다. */
export function useEvery(ms: number, fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms <= 0) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") ref.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}
