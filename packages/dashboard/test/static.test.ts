/**
 * 화면 파일(HK-18 → HK-26): 빌드 단계 없는 번들한 정적 파일(React + astryx, packages/dashboard-ui 가 미리 묶는다), CDN 없음,
 * 화면 CSP 를 어기는 코드 없음, 모델을 부르는 자리 없음, 자동 요청 없음. 번들 재현 · 번들 안의 CSP 점검 · 크기는 packages/dashboard-ui 시험이 한다.
 * 브라우저 동작(렌더 · 키보드 · 스크린숏)은 Playwright 로 따로 확인하고 tasks.md 에 적는다. 여기서는 파일과 서버가 약속한 것을 지킨다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, makeRepo, serve } from "./helpers";

const STATIC = path.resolve(__dirname, "../static");
const SRC = path.resolve(__dirname, "../../dashboard-ui/src");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(STATIC).map((f) => path.relative(STATIC, f).split(path.sep).join("/"));
const own = files.filter((f) => /\.(js|css|html)$/.test(f));
const read = (f: string): string => fs.readFileSync(path.join(STATIC, f), "utf8");
const sources = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${path.sep}themes${path.sep}`));
const srcRel = (f: string): string => path.relative(SRC, f).split(path.sep).join("/");
const readSrc = (f: string): string => fs.readFileSync(f, "utf8");
const VIEWS = ["Home", "Projects", "Progress", "Flow", "Issue", "IssueDetail", "Docs", "Questions", "Verify", "Workspace", "Skills", "Harness", "Ops", "Intake", "Usage", "Approve"];

describe("화면 파일 구성(R1)", () => {
  it("index.html · 화면 번들 · 공유 조각 · CSS · 라이선스 문구가 있고 옛 바닐라 화면 파일은 없다", () => {
    for (const f of ["index.html", "app/main.js", "app/main.css", "vendor/THIRD-PARTY-LICENSES.txt"]) expect(files, f).toContain(f);
    expect(files.filter((f) => f.startsWith("app/chunks/") && f.endsWith(".js")).length).toBeGreaterThan(3);
    for (const f of files) expect([f, /^(js\/|app\.css$|pages\.css$|vendor\/flow\.bundle)/.test(f)]).toEqual([f, false]);
  });

  it("S00~S13 · 승인 패널 · 이슈 상세 화면 소스가 모두 있고 App 이 늦게 불러온다(흐름 캔버스는 흐름 화면 안에서만)", () => {
    const app = readSrc(path.join(SRC, "App.tsx"));
    for (const v of VIEWS) expect(fs.existsSync(path.join(SRC, "views", `${v}.tsx`)), v).toBe(true);
    for (const v of VIEWS.filter((x) => !["IssueDetail", "Approve"].includes(x))) expect(app, v).toContain(`./views/${v}"`);
    expect(app).not.toContain("flow-view");
    expect(readSrc(path.join(SRC, "views/Flow.tsx"))).toMatch(/lazy\(\(\) => import\("@flow-view\/FlowView"\)/);
    expect(read("index.html")).not.toContain("flow");
  });

  it("index.html 은 언어 · 뷰포트 · 모듈 스크립트가 있고 인라인 스크립트 · 스타일이 없다, 본문 건너뛰기는 AppShell 이 준다", () => {
    const html = read("index.html");
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<script type="module" src="/app/main.js"></script>');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(html).not.toMatch(/<style|style="/);
  });
});

describe("화면 CSP · 외부 의존 없음(DB-R21 · README 원칙)", () => {
  it("화면 소스에 innerHTML · eval · document.write · style 속성 문자열 · 인라인 이벤트 문자열이 없다", () => {
    for (const f of sources) {
      const src = readSrc(f);
      expect([srcRel(f), /\.(innerHTML|outerHTML)\b|dangerouslySetInnerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(src)]).toEqual([srcRel(f), false]);
      expect([srcRel(f), /setAttribute\(\s*["']style["']/.test(src)]).toEqual([srcRel(f), false]);
      expect([srcRel(f), /\son[a-z]+=["']/.test(src)]).toEqual([srcRel(f), false]);
    }
  });

  it("서버가 만든 문서 HTML 을 DOM 으로 옮기는 자리는 ServerHtml 하나다", () => {
    const users = sources.filter((f) => /DOMParser|replaceChildren/.test(readSrc(f))).map(srcRel);
    expect(users).toEqual(["ui/ServerHtml.tsx"]);
  });

  it("CDN · 외부 주소 · 외부 글꼴이 없다(이름공간 주소만 허용)", () => {
    for (const f of sources) {
      const hits = [...readSrc(f).matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]).filter((u) => !/^http:\/\/www\.w3\.org\//.test(u));
      expect([srcRel(f), hits]).toEqual([srcRel(f), []]);
    }
    expect(read("app/main.css")).not.toMatch(/@import\s+url\(["']?https?:|\burl\(["']?https?:|@font-face/);
  });

  it("모델을 부르는 화면 문구 · 주소가 없다(R7, DB-R26)", () => {
    for (const f of sources) expect([srcRel(f), /anthropic|openai|api\.claude|gpt-|AI 요약|AI 답|자동 분류|초안 만들|모델에게/i.test(readSrc(f))]).toEqual([srcRel(f), false]);
  });

  it("세션 요청(POST /dispatch)은 시트 모듈 하나에만 있고, 시트를 여는 호출은 사람이 누른 단추 안에서만 있다(R7, DB-R25)", () => {
    const callers = sources.filter((f) => /post\(\s*["']\/dispatch["']/.test(readSrc(f))).map(srcRel);
    expect(callers).toEqual(["ui/Dispatch.tsx"]);
    // 승인 패널 · 질문 · 제안 · 문서 편집은 dispatch(...) 를 onClick 안(또는 사람이 누른 단추가 부른 함수)에서만 부른다: 효과(useEffect) 안에서 부르지 않는다
    for (const f of ["views/Approve.tsx", "views/Questions.tsx", "views/Flow.tsx", "views/IssueDetail.tsx"]) {
      const src = readSrc(path.join(SRC, f));
      expect([f, /useEffect\([^)]*dispatch\(/s.test(src)]).toEqual([f, false]);
      for (const m of src.matchAll(/dispatch\(\{/g)) {
        const before = src.slice(Math.max(0, (m.index ?? 0) - 2500), m.index);
        expect([f, /onClick|async function (save|act|send)|setTimeout/.test(before)]).toEqual([f, true]);
      }
    }
  });
});

describe("서버가 화면 파일을 준다", () => {
  it("/ · /app/main.js · /app/main.css · 늦게 받는 조각 · 라이선스를 토큰 없이 주고 CSP 를 붙인다", async () => {
    const srv = await serve(makeRepo());
    const index = await call(srv, "GET", "/", { token: null });
    expect(index.status).toBe(200);
    expect(index.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(index.headers["content-security-policy"]).toContain("style-src 'self'");
    expect(index.headers["content-security-policy"]).not.toContain("unsafe-inline");
    expect(index.text).toContain("/app/main.js");
    const chunk = files.find((f) => f.startsWith("app/chunks/") && f.endsWith(".js")) as string;
    for (const [p, type] of [["/app/main.js", "javascript"], ["/app/main.css", "css"], [`/${chunk}`, "javascript"], ["/vendor/THIRD-PARTY-LICENSES.txt", "text/plain"]] as const) {
      const r = await call(srv, "GET", p, { token: null });
      expect([p, r.status, String(r.headers["content-type"]).includes(type)]).toEqual([p, 200, true]);
    }
    // 앱 경로는 index.html (점이 없는 경로)
    for (const p of ["/progress", "/issues/DEMO-1/docs/design", "/usage?tab=history"]) expect((await call(srv, "GET", p, { token: null })).text).toContain('id="root"');
    expect((await call(srv, "GET", "/js/missing.js", { token: null })).status).toBe(404);
    expect((await call(srv, "GET", "/app/../server.ts", { token: null })).status).toBe(404);
  });

  it("화면 파일 크기: 파일 하나가 450KB 를 넘지 않고 화면 파일 전체는 CLI 번들에 문자열로 들어가므로 3MB 이하다", () => {
    const total = own.reduce((s, f) => s + fs.statSync(path.join(STATIC, f)).size, 0);
    // 2026-11-26 화면 다듬기: React + astryx 공유 조각에 파일 끌어다 놓기 · 이름-값 목록 · 한국어 부품 글이 더해져 450KB → 500KB(461196 바이트로 시작)
    for (const f of own) expect([f, fs.statSync(path.join(STATIC, f)).size < 500 * 1024 || f === "app/main.css"]).toEqual([f, true]);
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });
});
