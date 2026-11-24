#!/usr/bin/env node
// demo-serve.mjs — 화면 확인용 서버. 에이전트 세션 판정을 끄고(사람 터미널처럼) 쓰기 · PIN 흐름을 눈으로 본다. 개발 도구이고 시험이 아니다(HK-18).
//
//   node packages/dashboard/scripts/demo-serve.mjs <리포> <HOME> [--read-only] [--all]
//
// 주소(토큰 포함)는 표준 출력 첫 줄, PIN 은 둘째 줄이다. 끝내려면 SIGINT.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { staticMap } from "./static-map.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { build } = createRequire(path.join(here, "../../cli/package.json"))("esbuild");
const [repo, home] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!repo || !home) {
  console.error("사용법: node demo-serve.mjs <리포> <HOME> [--read-only] [--all]");
  process.exit(2);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-demo-serve-"));
const entry = path.join(tmp, "entry.ts");
fs.writeFileSync(entry, `import { startServer } from ${JSON.stringify(path.join(here, "../src/server.ts"))};
const [repo, home] = ${JSON.stringify([repo, home])};
const mode = ${JSON.stringify(process.argv.includes("--all") ? { kind: "all" } : { kind: "single" })};
const srv = await startServer({ cwd: repo, env: { ...process.env, HOME: home }, readOnly: ${JSON.stringify(process.argv.includes("--read-only"))}, mode, agentSession: () => null, home });
console.log(srv.url);
console.log(srv.pin ?? "(읽기 전용: PIN 없음)");
process.on("SIGINT", () => srv.close().then(() => process.exit(0)));
process.on("SIGTERM", () => srv.close().then(() => process.exit(0)));
`);
const out = path.join(tmp, "serve.mjs");
await build({ entryPoints: [entry], outfile: out, bundle: true, platform: "node", target: "node18", format: "esm", banner: { js: "import { createRequire as __cr } from \"node:module\"; const require = __cr(import.meta.url);" }, logLevel: "error", define: { __HK_STATIC__: JSON.stringify(staticMap()), __HK_VERSION__: '"2.0.0-demo"' }, loader: { ".ts": "ts" } });
await import(pathToFileURL(out).href);
