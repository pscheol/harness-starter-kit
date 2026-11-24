// 화면 공용 훅: 데이터 읽기(로딩 · 오류 · 다시 읽기), 일정 간격 갱신(탭이 숨겨지면 멈춤).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError, ApiResult } from "./api";
import type { Loose } from "./types";

export type LoadState<T> = { status: "loading"; data: null; error: null } | { status: "ready"; data: T; error: null } | { status: "error"; data: null; error: ApiError };

export interface Loader<T> {
  state: LoadState<T>;
  reload: () => void;
}

/**
 * 요청 묶음을 한꺼번에 받는다. 하나라도 실패하면 오류 상태(tolerate 에 든 코드는 넘긴다: 그 결과는 data[i] 가 null).
 * deps 가 바뀌면 다시 읽고, 늦게 온 이전 응답은 버린다.
 */
export function useLoad<T extends unknown[]>(fetchAll: () => { [K in keyof T]: Promise<ApiResult<T[K]>> }, deps: unknown[], opts: { tolerate?: string[] } = {}): Loader<T> {
  const [state, setState] = useState<LoadState<T>>({ status: "loading", data: null, error: null });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const tolerate = opts.tolerate;
  useEffect(() => {
    const my = ++seq.current;
    setState({ status: "loading", data: null, error: null });
    void (async () => {
      const results = (await Promise.all(fetchAll() as Promise<ApiResult<Loose>>[])) as ApiResult<Loose>[];
      if (my !== seq.current) return;
      const bad = results.find((r) => !r.ok && !(tolerate ?? []).includes(r.error.code));
      if (bad && !bad.ok) setState({ status: "error", data: null, error: bad.error });
      else setState({ status: "ready", data: results.map((r) => (r.ok ? r.data : null)) as unknown as T, error: null });
    })();
    // fetchAll 은 deps 로 갈음한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { state, reload };
}

/** 화면이 보일 때만 ms 마다 fn 을 부른다. */
export function useEvery(ms: number, fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") ref.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}
