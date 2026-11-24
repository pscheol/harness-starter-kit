// 서버가 Markdown 에서 만든 문서 HTML 을 넣는 유일한 자리(원문 HTML 은 서버가 글자로 바꿨다, DB-R21).
// innerHTML 을 쓰지 않고 DOMParser 로 풀어 위험한 요소 · 속성을 지운 뒤 노드로 옮긴다(HK-18 dom.js 의 setServerHtml 과 같다).
import { useLayoutEffect, useRef } from "react";

const BAD_TAGS = "script, iframe, object, embed, link, meta, style, base, form";

/** 문서 HTML 문자열 → 안전하게 걸러낸 본문 노드들 */
export function sanitizeServerHtml(html: string): ChildNode[] {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");
  for (const bad of doc.querySelectorAll(BAD_TAGS)) bad.remove();
  for (const node of doc.body.querySelectorAll("*")) {
    for (const a of [...node.attributes]) {
      if (a.name.startsWith("on") || a.name === "style") node.removeAttribute(a.name);
      else if ((a.name === "href" || a.name === "src" || a.name === "xlink:href") && /^\s*(javascript|data:text\/html|vbscript):/i.test(a.value)) node.removeAttribute(a.name);
    }
  }
  return [...doc.body.childNodes];
}

export function ServerHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    ref.current?.replaceChildren(...sanitizeServerHtml(html));
  }, [html]);
  return <div ref={ref} className="hk-md" tabIndex={0} aria-label="문서 본문" role="region" />;
}
