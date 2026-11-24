// 히스토리 API 라우터. 서버가 점(.) 없는 경로에 index.html 을 주므로 서버를 바꾸지 않는다.
import { projectBase } from "./api.js";
import { h } from "./dom.js";
import { parseRoute } from "./format.js";

let listener = null;

/** 접두(/p/<id>)를 뗀 앱 경로 + 쿼리 */
export function appPath() {
  const base = projectBase();
  const p = base && location.pathname.startsWith(base) ? location.pathname.slice(base.length) || "/" : location.pathname;
  return { path: p, search: location.search };
}

export function currentRoute() {
  const { path, search } = appPath();
  return parseRoute(path, search);
}

export function fullPath(path) {
  return `${projectBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function navigate(path, opts = {}) {
  const target = fullPath(path);
  if (target === location.pathname + location.search && !opts.force) {
    if (listener) listener();
    return;
  }
  if (opts.replace) history.replaceState(null, "", target);
  else history.pushState(null, "", target);
  if (listener) listener();
}

/** 앱 안 링크: 수정 키 · 가운데 단추는 브라우저에 맡기고 나머지는 같은 문서 안에서 이동한다. */
export function link(path, props, ...kids) {
  const a = h("a", { ...props, href: fullPath(path) }, ...kids);
  a.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
  });
  return a;
}

/** 전체 프로젝트(최상위, 접두 없음)로 가는 링크 */
export function topLink(path, props, ...kids) {
  const a = h("a", { ...props, href: path }, ...kids);
  a.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.pushState(null, "", path);
    if (listener) listener();
  });
  return a;
}

export function onRoute(cb) {
  listener = cb;
  window.addEventListener("popstate", cb);
}
