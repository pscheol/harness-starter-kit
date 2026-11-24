/**
 * 화면 파일(HK-18): 빌드 단계 없는 번들한 정적 파일, CDN 없음, 화면 CSP 를 어기는 코드 없음, 모델을 부르는 자리 없음, 자동 요청 없음.
 * 브라우저 동작(렌더 · 키보드 · 스크린숏)은 Playwright 로 따로 확인하고 tasks.md 에 적는다. 여기서는 파일과 서버가 약속한 것을 지킨다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, makeRepo, serve } from "./helpers";

const STATIC = path.resolve(__dirname, "../static");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(STATIC).map((f) => path.relative(STATIC, f).split(path.sep).join("/"));
const own = files.filter((f) => !f.startsWith("vendor/") && /\.(js|css|html)$/.test(f));
const read = (f: string): string => fs.readFileSync(path.join(STATIC, f), "utf8");

const VIEWS = ["home", "projects", "progress", "flow", "issue", "docs", "questions", "verify", "workspace", "skills", "harness", "ops", "intake", "usage", "notfound", "dispatch"];

describe("화면 파일 구성(R1)", () => {
  it("S00~S13 화면 모듈 · 틀 · 번들 · 라이선스 문구가 모두 있다", () => {
    for (const v of VIEWS) expect(files, v).toContain(`js/views/${v}.js`);
    for (const f of ["index.html", "app.css", "pages.css", "js/main.js", "js/shell.js", "js/api.js", "js/ui.js", "js/format.js", "vendor/flow.bundle.js", "vendor/flow.bundle.css", "vendor/THIRD-PARTY-LICENSES.txt"]) expect(files, f).toContain(f);
  });

  it("모든 화면 모듈은 render 를 내보내고 main.js 가 늦게 불러온다(흐름 번들은 흐름 보기를 열 때만)", () => {
    const main = read("js/main.js");
    for (const v of VIEWS.filter((x) => !["dispatch", "notfound"].includes(x))) {
      expect(read(`js/views/${v}.js`), v).toMatch(/export (async )?function render\(/);
      expect(main, v).toContain(`./views/${v}.js`);
    }
    expect(main).not.toContain("flow.bundle");
    expect(read("js/views/flow.js")).toContain('import("/vendor/flow.bundle.js")');
    for (const f of own.filter((x) => x.endsWith(".js") && x !== "js/views/flow.js")) expect(read(f), f).not.toContain("flow.bundle.js");
  });

  it("index.html 은 언어 · 뷰포트 · 모듈 스크립트 · 본문 건너뛰기가 있고 인라인 스크립트 · 스타일이 없다", () => {
    const html = read("index.html");
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<script type="module" src="/js/main.js"></script>');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(html).not.toMatch(/<style|style="/);
    expect(read("js/shell.js")).toContain("본문으로 건너뛰기");
  });
});

describe("화면 CSP · 외부 의존 없음(DB-R21 · README 원칙)", () => {
  it("innerHTML · eval · document.write · style 속성 문자열 · 인라인 이벤트가 없다", () => {
    for (const f of own.filter((x) => x.endsWith(".js"))) {
      const src = read(f);
      expect([f, /\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(src)]).toEqual([f, false]);
      expect([f, /setAttribute\(\s*["']style["']/.test(src)]).toEqual([f, false]);
      expect([f, /\son[a-z]+=["']/.test(src)]).toEqual([f, false]);
    }
  });

  it("CDN · 외부 주소 · 외부 글꼴이 없다(이름공간 주소만 허용)", () => {
    for (const f of own) {
      const hits = [...read(f).matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]).filter((u) => !/^http:\/\/www\.w3\.org\//.test(u));
      expect([f, hits]).toEqual([f, []]);
      expect([f, /@import\s+url\(["']?https?:|\burl\(["']?https?:/.test(read(f))]).toEqual([f, false]);
    }
    const bundle = read("vendor/flow.bundle.js");
    expect(bundle).not.toMatch(/fetch\(\s*["'`]https?:|XMLHttpRequest|WebSocket\(/);
    expect(read("vendor/flow.bundle.css")).not.toMatch(/url\(["']?https?:|@import/);
  });

  it("모델을 부르는 화면 문구 · 주소가 없다(R7, DB-R26)", () => {
    for (const f of own) expect([f, /anthropic|openai|api\.claude|gpt-|AI 요약|AI 답|자동 분류|초안 만들|모델에게/i.test(read(f))]).toEqual([f, false]);
  });

  it("세션 요청(POST /dispatch)은 시트 모듈 하나에만 있고 저장 · 승인 · 답 모듈은 dispatch 를 직접 부르지 않는다(R7, DB-R25)", () => {
    const callers = own.filter((f) => f.endsWith(".js") && /post\(\s*["']\/dispatch["']/.test(read(f)));
    expect(callers).toEqual(["js/views/dispatch.js"]);
    // 승인 패널 · 질문 · 제안은 시트를 사람이 누른 단추로만 연다(자동 호출 없음): openDispatch 는 onClick 안에서만 부른다
    for (const f of ["js/views/approve-panel.js", "js/views/questions.js", "js/views/flow.js", "js/views/issue.js"]) {
      for (const m of read(f).matchAll(/openDispatch\(/g)) {
        const before = read(f).slice(Math.max(0, (m.index ?? 0) - 400), m.index);
        expect([f, /onClick|onclick|void save\(true\)|thenDispatch/.test(before)]).toEqual([f, true]);
      }
    }
  });
});

describe("서버가 화면 파일을 준다", () => {
  it("/ · /js/*.js · /app.css · /vendor/* 를 토큰 없이 주고 CSP 를 붙인다", async () => {
    const srv = await serve(makeRepo());
    const index = await call(srv, "GET", "/", { token: null });
    expect(index.status).toBe(200);
    expect(index.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(index.headers["content-security-policy"]).toContain("style-src 'self'");
    expect(index.text).toContain("/js/main.js");
    for (const [p, type] of [["/js/main.js", "javascript"], ["/js/views/home.js", "javascript"], ["/app.css", "css"], ["/pages.css", "css"], ["/vendor/flow.bundle.js", "javascript"], ["/vendor/flow.bundle.css", "css"], ["/vendor/THIRD-PARTY-LICENSES.txt", "text/plain"]] as const) {
      const r = await call(srv, "GET", p, { token: null });
      expect([p, r.status, String(r.headers["content-type"]).includes(type)]).toEqual([p, 200, true]);
    }
    // 앱 경로는 index.html (점이 없는 경로)
    for (const p of ["/progress", "/issues/DEMO-1/docs/design", "/usage?tab=history"]) expect((await call(srv, "GET", p, { token: null })).text).toContain('id="app"');
    expect((await call(srv, "GET", "/js/missing.js", { token: null })).status).toBe(404);
    expect((await call(srv, "GET", "/js/../server.ts", { token: null })).status).toBe(404);
  });

  it("번들 크기 예산: 흐름 번들 JS 450KB · CSS 30KB 이하, 화면 코드(번들 제외) 450KB 이하", () => {
    expect(fs.statSync(path.join(STATIC, "vendor/flow.bundle.js")).size).toBeLessThan(450 * 1024);
    expect(fs.statSync(path.join(STATIC, "vendor/flow.bundle.css")).size).toBeLessThan(30 * 1024);
    expect(own.reduce((s, f) => s + fs.statSync(path.join(STATIC, f)).size, 0)).toBeLessThan(450 * 1024);
  });
});
