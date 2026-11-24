// DOM 도우미. 화면 글은 늘 textContent 로만 넣는다(innerHTML · style 속성 문자열 없음, 화면 CSP).
import { ICONS } from "./icons.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const iconCache = new Map();

/** h("div", {class: "x", onclick: fn, "aria-label": "…"}, "글", 자식) — 자식은 문자열 · 노드 · 배열 · null */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  setProps(el, props);
  append(el, kids);
  return el;
}

export function svgEl(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? "" : String(v));
  append(el, kids);
  return el;
}

function setProps(el, props) {
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "hidden" || k === "disabled" || k === "checked" || k === "open" || k === "required" || k === "readOnly" || k === "selected") el[k] = Boolean(v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** 선 아이콘. 이름은 icons.js 의 키. 장식이면 aria-hidden, label 을 주면 이름을 단다. */
export function icon(name, cls = "", label = null) {
  let proto = iconCache.get(name);
  if (!proto) {
    const body = ICONS[name] ?? ICONS.help;
    const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}" viewBox="0 0 24 24">${body}</svg>`, "image/svg+xml");
    proto = document.importNode(doc.documentElement, true);
    iconCache.set(name, proto);
  }
  const el = proto.cloneNode(true);
  el.setAttribute("class", `i${cls ? ` ${cls}` : ""}`);
  if (label) {
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", label);
  } else el.setAttribute("aria-hidden", "true");
  return el;
}

/** 안전한 HTML 한 자리: 서버가 Markdown 에서 만든 문서 HTML(원문 HTML 은 서버가 글자로 바꿨다, DB-R21). */
export function setServerHtml(el, html) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");
  for (const bad of doc.querySelectorAll("script, iframe, object, embed, link, meta, style, base")) bad.remove();
  for (const node of doc.body.querySelectorAll("*")) {
    for (const a of [...node.attributes]) {
      if (a.name.startsWith("on") || a.name === "style") node.removeAttribute(a.name);
      else if ((a.name === "href" || a.name === "src") && /^\s*(javascript|data:text\/html|vbscript):/i.test(a.value)) node.removeAttribute(a.name);
    }
  }
  el.replaceChildren(...doc.body.childNodes);
}

/** 클립보드: 실패해도 사용자에게 글을 보인다. */
export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h("textarea", { "aria-hidden": "true", readOnly: true });
    ta.value = text;
    ta.className = "sr-only";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
