#!/usr/bin/env node
// build.mjs — packages/dashboard-ui/src/main.tsx 를 packages/dashboard/static/ 의 화면 파일로 묶는다(HK-26 design §2).
//
//   node build.mjs   (= pnpm -C packages/dashboard-ui build)
//
// 만드는 것: static/index.html · static/app/main.js · static/app/main.css · static/app/chunks/*.js(흐름 보기 등 늦게 받는 조각)
//          · static/vendor/THIRD-PARTY-LICENSES.txt. 같은 소스 · 같은 esbuild 판이면 바이트가 같다(시험).
// 화면 CSP(script-src 'self'; style-src 'self')를 지키려고 CSS 는 늘 파일이고, astryx 가 실행 중에 만드는 <style> 두 곳은 csp-plugin 이 CSSOM 으로 바꾼다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { cspPlugin } from "./csp-plugin.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STATIC = path.resolve(DIR, "..", "dashboard", "static");
const APP_OUT = path.join(STATIC, "app");
const VENDOR_OUT = path.join(STATIC, "vendor");

// 지난 판의 산출물을 지운다(이 스크립트가 만드는 자리만).
for (const p of [APP_OUT, path.join(STATIC, "index.html")]) fs.rmSync(p, { recursive: true, force: true });
fs.mkdirSync(APP_OUT, { recursive: true });
fs.mkdirSync(VENDOR_OUT, { recursive: true });

const result = await build({
  absWorkingDir: DIR,
  entryPoints: { main: "src/main.tsx" },
  outdir: APP_OUT,
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["es2022", "chrome110", "firefox110", "safari16"],
  minify: true,
  jsx: "automatic",
  charset: "utf8",
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "css" },
  alias: { "@flow-view": path.resolve(DIR, "..", "flow-view", "src") },
  plugins: [cspPlugin],
});

fs.writeFileSync(
  path.join(STATIC, "index.html"),
  `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light">
<link rel="icon" href="data:,">
<title>harnessync 관리 페이지</title>
<link rel="stylesheet" href="/app/main.css">
</head>
<body>
<div id="root"><p>관리 페이지를 불러오는 중입니다…</p></div>
<noscript><p>이 화면은 JavaScript 가 필요합니다. 같은 기능은 콘솔 명령으로도 됩니다: <code>npx harness-kit status</code></p></noscript>
<script type="module" src="/app/main.js"></script>
</body>
</html>
`,
);

// 라이선스 문구: 번들에 들어간 패키지의 LICENSE 를 모은다.
const pkgs = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (m) pkgs.add(m[1]);
}
const seen = new Set();
let text = "이 파일은 packages/dashboard-ui/build.mjs 가 만든다. 관리 페이지 화면 번들(app/main.js · app/chunks · app/main.css)에 들어간 패키지의 라이선스다.\n";
for (const name of [...pkgs].sort()) {
  const root = findPkg(name);
  if (!root) continue;
  const meta = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lic = ["LICENSE", "LICENSE.md", "LICENSE.txt", "license"].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  const key = `${name}@${meta.version}`;
  if (seen.has(key)) continue;
  seen.add(key);
  text += `\n================================================================\n${key} — ${meta.license ?? "라이선스 표시 없음"}\n================================================================\n`;
  text += lic ? `${fs.readFileSync(lic, "utf8").trim()}\n` : `(라이선스 파일 없음 — package.json 의 license: ${meta.license ?? "?"})\n`;
}
fs.writeFileSync(path.join(VENDOR_OUT, "THIRD-PARTY-LICENSES.txt"), text);

function findPkg(name) {
  const direct = path.join(DIR, "node_modules", name);
  if (fs.existsSync(direct)) return fs.realpathSync(direct);
  const flowDirect = path.join(DIR, "..", "flow-view", "node_modules", name);
  if (fs.existsSync(flowDirect)) return fs.realpathSync(flowDirect);
  const store = path.resolve(DIR, "..", "..", "node_modules", ".pnpm");
  if (!fs.existsSync(store)) return null;
  const flat = name.replace("/", "+");
  for (const d of fs.readdirSync(store).sort()) {
    if (d.startsWith(`${flat}@`)) {
      const p = path.join(store, d, "node_modules", name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const sizes = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else sizes.push([path.relative(STATIC, f), fs.statSync(f).size]);
  }
};
walk(APP_OUT);
for (const [f, n] of sizes.sort()) console.log(`${f} ${n} bytes`);
console.log(`패키지 ${seen.size}개`);
