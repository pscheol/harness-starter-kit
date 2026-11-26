/** 화면 번들(HK-26 R3 · R4 · R14): 소스에서 같은 바이트로 다시 만들어지는지 · CSP 를 어기는 코드 없음 · 외부 요청 없음 · 크기 예산 · 라이선스 문구 · 의존성. */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(__dirname, "..");
const STATIC = path.resolve(DIR, "../dashboard/static");
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const outputs = (): string[] => [...walk(path.join(STATIC, "app")), path.join(STATIC, "index.html"), path.join(STATIC, "vendor/THIRD-PARTY-LICENSES.txt")].sort();
const digest = (): Record<string, string> => Object.fromEntries(outputs().map((f) => [path.relative(STATIC, f), crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")]));
const jsFiles = (): string[] => walk(path.join(STATIC, "app")).filter((f) => f.endsWith(".js"));
const gz = (f: string): number => zlib.gzipSync(fs.readFileSync(f)).length;

describe("번들(R3)", () => {
  it("소스에서 다시 빌드하면 커밋된 산출물과 같은 바이트다(같은 소스 · 같은 esbuild · 같은 astryx 판)", () => {
    const before = digest();
    const r = spawnSync("node", ["build.mjs"], { cwd: DIR, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(digest()).toEqual(before);
  });

  it("index.html: 모듈 스크립트 · CSS 파일 하나, 인라인 스크립트 · 스타일 · style 속성 없음", () => {
    const html = fs.readFileSync(path.join(STATIC, "index.html"), "utf8");
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('<script type="module" src="/app/main.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="/app/main.css">');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(html).not.toMatch(/<style|style="/);
  });

  it("package.json: 런타임 의존성 0, 화면 · 디자인 시스템은 devDependency 에만", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(DIR, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(pkg.dependencies).toEqual({});
    for (const n of ["react", "react-dom", "@astryxdesign/core", "@stylexjs/stylex", "@xyflow/react", "esbuild"]) expect(pkg.devDependencies[n], n).toBeTruthy();
    for (const p of ["../cli/package.json", "../dashboard/package.json", "../flow-view/package.json"]) {
      expect((JSON.parse(fs.readFileSync(path.join(DIR, p), "utf8")) as { dependencies: Record<string, string> }).dependencies, p).toEqual({});
    }
  });

  it("라이선스 문구: react · astryx · stylex · xyflow · lucide 가 들어 있다", () => {
    const lic = fs.readFileSync(path.join(STATIC, "vendor/THIRD-PARTY-LICENSES.txt"), "utf8");
    for (const name of ["react@", "react-dom@", "@astryxdesign/core@", "@stylexjs/stylex@", "@xyflow/react@", "lucide-react@"]) expect(lic, name).toContain(name);
  });
});

describe("화면 CSP(R4)", () => {
  it("번들에 인라인 <style> 을 만드는 코드는 실행되지 않는 대체 경로 둘뿐이다(astryx 의 두 곳은 csp-plugin 이 CSSOM 으로 바꿨다)", () => {
    const hits: string[] = [];
    for (const f of jsFiles()) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/.{120}createElement\(\s*["']style["']\s*\).{40}/g)) hits.push(m[0]);
    }
    // 1) astryx touchActionRule: constructable stylesheet 이 없는 엔진에서만 <style> 로 간다(adoptedStyleSheets 가 먼저다)
    // 2) react-dom: <style precedence> 요소를 렌더할 때만 쓰는 경로(이 화면은 그 요소를 쓰지 않는다)
    // 3) astryx Theme: 미리 빌드하지 않은(__built 아닌) 테마의 실행 중 주입 경로. 우리 테마는 빌드해서 CSS 파일로 싣는다
    expect(hits.length).toBe(3);
    expect(hits.filter((h) => /adoptedStyleSheets/.test(h) || /data-precedence|\.ownerDocument/.test(h) || /setAttribute\((?:"[a-z-]*theme|\w+\("theme)/.test(h)).length).toBe(3);
    expect(fs.readFileSync(path.join(DIR, "src/themes/harness/harness.js"), "utf8")).toContain("__built");
    const all = jsFiles().map((f) => fs.readFileSync(f, "utf8")).join("\n");
    // 슬라이드 규칙 · 스크롤 고정 규칙은 CSSOM(adoptedStyleSheets + replaceSync)으로 간다
    const slide = jsFiles().map((f) => fs.readFileSync(f, "utf8")).find((s) => s.includes("astryx-layer-slide-rules"));
    expect(slide).toBeTruthy();
    expect(slide).toMatch(/replaceSync\(/);
    expect(all).toContain("adoptedStyleSheets=[...");
  });

  it("외부 요청 · CDN · 원격 글꼴이 없다", () => {
    for (const f of jsFiles()) {
      const src = fs.readFileSync(f, "utf8");
      expect([path.basename(f), /fetch\(\s*["'`]https?:|XMLHttpRequest|sendBeacon|new WebSocket\(/.test(src)]).toEqual([path.basename(f), false]);
    }
    const css = fs.readFileSync(path.join(STATIC, "app/main.css"), "utf8");
    expect(css).not.toMatch(/url\(["']?https?:|@import\s+url|@font-face/);
  });

  it("모델을 부르는 화면 문구 · 주소가 없다(R13)", () => {
    for (const f of jsFiles()) expect([path.basename(f), /api\.anthropic|api\.openai|AI 요약|AI 답|자동 분류|초안 만들|모델에게/i.test(fs.readFileSync(f, "utf8"))]).toEqual([path.basename(f), false]);
  });
});

describe("크기 예산(R14)", () => {
  it("첫 화면에 필요한 JS(main.js + 공유 조각, 흐름 보기 조각 제외) gzip 이 예산 안이다", () => {
    const flow = jsFiles().filter((f) => fs.readFileSync(f, "utf8").includes("react-flow__"));
    const rest = jsFiles().filter((f) => !flow.includes(f));
    const total = rest.reduce((s, f) => s + gz(f), 0);
    // 목표 300KB, 이 시험은 지금 값에서 크게 늘지 않게 지키는 상한이다(design §4 에 실측값)
    // HK-21: S10 운영 화면을 채워 520KB → 524KB(532916 바이트로 시작)
    // 2026-11-26 화면 다듬기: 한국어 부품 글(ko-KR 5.8KB) · 접기 · 풀이 · 파일 끌어다 놓기 · 이름-값 목록 부품으로 524KB → 560KB(553484 바이트로 시작)
    expect(total).toBeLessThan(560 * 1024);
    expect(fs.statSync(path.join(STATIC, "app/main.css")).size).toBeLessThan(420 * 1024);
  });
});
