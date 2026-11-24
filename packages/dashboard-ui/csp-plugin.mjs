// csp-plugin.mjs — astryx 가 실행 중에 만드는 인라인 <style> 두 곳을 CSSOM(constructable stylesheet)으로 바꾼다(HK-26 design §3).
//
// 화면 CSP 는 style-src 'self' 라 <style> 요소를 막는다. CSSStyleSheet.replaceSync + adoptedStyleSheets 는 CSSOM 이라 막히지 않는다
// (astryx 의 gestures/touchActionRule 도 이미 이 방식이다). 바꿀 문자열을 못 찾으면 빌드를 멈춘다 — astryx 판이 오르면 여기서 알아챈다.
import fs from "node:fs";

const PATCHES = [
  {
    filter: /@astryxdesign\/core\/dist\/Layer\/layerSlideRules\.js$/,
    from: `  const style = doc.createElement('style');
  style.id = SLIDE_RULES_ID;
  style.textContent = slideRulesCss();
  doc.head.appendChild(style);`,
    to: `  const view = doc.defaultView;
  const sheet = new view.CSSStyleSheet();
  sheet.replaceSync(slideRulesCss());
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  const mark = doc.createElement('meta');
  mark.id = SLIDE_RULES_ID;
  doc.head.appendChild(mark);`,
  },
  {
    filter: /@astryxdesign\/core\/dist\/privateAttributes\/scrollAnchoring\.stylex\.js$/,
    from: `  const style = doc.createElement('style');
  style.setAttribute(SCROLL_ANCHORING, RULE);
  style.textContent = \`[\${SCROLL_ANCHORING}="\${OFF}"]{overflow-anchor:none !important}\`;
  doc.head.appendChild(style);`,
    to: `  const sheet = new doc.defaultView.CSSStyleSheet();
  sheet.replaceSync(\`[\${SCROLL_ANCHORING}="\${OFF}"]{overflow-anchor:none !important}\`);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  const mark = doc.createElement('meta');
  mark.setAttribute(SCROLL_ANCHORING, RULE);
  doc.head.appendChild(mark);`,
  },
];

export const cspPlugin = {
  name: "hk-csp-adopted-stylesheets",
  setup(build) {
    for (const patch of PATCHES) {
      build.onLoad({ filter: patch.filter }, (args) => {
        const src = fs.readFileSync(args.path, "utf8");
        if (!src.includes(patch.from)) throw new Error(`csp-plugin: ${args.path} 에서 바꿀 문장을 못 찾았다 — astryx 판이 바뀌었다. csp-plugin.mjs 를 고쳐야 한다`);
        return { contents: src.replace(patch.from, patch.to), loader: "js" };
      });
    }
  },
};
