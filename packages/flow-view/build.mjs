#!/usr/bin/env node
// build.mjs — packages/flow-view/src/index.tsx 를 packages/dashboard/static/vendor/flow.bundle.{js,css} 로 묶는다(HK-18 design §1 · §5).
//
//   node build.mjs   (= pnpm -C packages/flow-view build)
//
// ESM 한 파일 + CSS 한 파일. CSS 를 JS 에 넣으면 인라인 <style> 이 되어 화면 CSP(style-src 'self')를 어긴다.
// 같은 소스 · 같은 esbuild 판이면 바이트가 같다. 라이선스 문구는 vendor/THIRD-PARTY-LICENSES.txt 에 모은다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(DIR, "..", "dashboard", "static", "vendor");
fs.mkdirSync(OUT_DIR, { recursive: true });

const result = await build({
  absWorkingDir: DIR,
  entryPoints: ["src/index.tsx"],
  outfile: path.join(OUT_DIR, "flow.bundle.js"),
  bundle: true,
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
});

// 라이선스 문구: 번들에 들어간 패키지의 LICENSE 를 모은다.
const pkgs = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (m) pkgs.add(m[1]);
}
const seen = new Set();
let text = "이 파일은 packages/flow-view/build.mjs 가 만든다. 흐름 보기 번들(flow.bundle.js · flow.bundle.css)에 들어간 패키지의 라이선스다.\n";
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
fs.writeFileSync(path.join(OUT_DIR, "THIRD-PARTY-LICENSES.txt"), text);

function findPkg(name) {
  const direct = path.join(DIR, "node_modules", name);
  if (fs.existsSync(direct)) return fs.realpathSync(direct);
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

const js = fs.statSync(path.join(OUT_DIR, "flow.bundle.js")).size;
const css = fs.statSync(path.join(OUT_DIR, "flow.bundle.css")).size;
console.log(`flow.bundle.js ${js} bytes · flow.bundle.css ${css} bytes · 패키지 ${seen.size}개`);
