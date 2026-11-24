// 히스토리 API 라우터. 서버가 점(.) 없는 경로에 index.html 을 주므로 서버를 바꾸지 않는다(HK-18 router.js 와 같은 동작).
import { forwardRef, useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { projectBase } from "./api";
import { parseRoute, type Route } from "./format";

const CHANGE = "hk-route-change";

function subscribe(cb: () => void): () => void {
  window.addEventListener("popstate", cb);
  window.addEventListener(CHANGE, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(CHANGE, cb);
  };
}

/** 접두(/p/<id>)를 뗀 앱 경로 */
export function stripBase(pathname: string): string {
  const base = projectBase(pathname);
  return base && pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
}

export function fullPath(path: string, base: string = projectBase()): string {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const target = fullPath(path);
  if (target !== location.pathname + location.search) {
    if (opts.replace) history.replaceState(null, "", target);
    else history.pushState(null, "", target);
  }
  window.dispatchEvent(new Event(CHANGE));
}

/** 지금 주소(경로 + 쿼리) 한 줄. 같은 주소면 같은 문자열이라 useSyncExternalStore 의 스냅샷으로 쓴다. */
const snapshot = (): string => location.pathname + location.search;

export function useRoute(): Route {
  const key = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => {
    const [path, search = ""] = key.split("?");
    return parseRoute(stripBase(path as string), search ? `?${search}` : "");
  }, [key]);
}

/** 수정 키 · 가운데 단추는 브라우저에 맡기고 나머지는 같은 문서 안에서 이동한다. */
function isPlainClick(e: MouseEvent): boolean {
  return !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
}

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href?: string; to?: string; children?: ReactNode };

/**
 * astryx 의 LinkProvider 에 넣는 링크 부품. 앱 안 경로("/progress")는 접두를 붙여 같은 문서 안에서 이동하고,
 * 모드가 바뀌는 링크(`data-hard`)와 바깥 주소는 브라우저에 맡긴다.
 */
export const AppAnchor = forwardRef<HTMLAnchorElement, AnchorProps>(function AppAnchor({ href, to, onClick, children, ...rest }, ref) {
  const target = href ?? to ?? "#";
  const hard = isHardTarget(target);
  const internal = target.startsWith("/") && !hard;
  const real = hard ? target.replace(/([?&])hard=1&?/, "$1").replace(/[?&]$/, "") : internal ? fullPath(target) : target;
  return (
    <a
      {...rest}
      ref={ref}
      href={real}
      onClick={(e) => {
        onClick?.(e);
        if (!internal || !isPlainClick(e) || rest.target === "_blank") return;
        e.preventDefault();
        navigate(target);
      }}
    >
      {children}
    </a>
  );
});

/** 모드가 바뀌는 링크: `/p/<id>` 로 들어가거나 `?hard=1` 표식이 붙은 것은 새 문서로 읽는다 */
export function isHardTarget(target: string): boolean {
  return /^\/p\/[0-9a-f]{12}(?:\/|$|\?)/.test(target) || /[?&]hard=1(?:&|$)/.test(target);
}

/** 새 문서로 읽는 링크 경로: 전체 프로젝트 ↔ 프로젝트 안은 세션 · 프로젝트 목록이 달라 화면 상태를 새로 읽는다. 토큰은 localStorage 에 있다. */
export const hardHref = (path: string): string => `${path}${path.includes("?") ? "&" : "?"}hard=1`;
