#!/usr/bin/env node
// build.mjs — src/cli.ts(진입) · src/main.ts 를 dist/cli.js 한 파일로 묶는다(HK-8 design §2.1).
// 관리 페이지 서버(packages/dashboard/src)도 같은 파일에 묶고, 화면 파일(packages/dashboard/static)은 define __HK_STATIC__ 로 넣는다(HK-17 design §1).
//
//   node build.mjs        (= pnpm -C packages/cli build)
//
// cjs · node18 · 런타임 의존 0. 머리 두 줄은 shebang 과 소스 해시다.
// 같은 소스와 같은 esbuild 판이면 바이트가 같다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { staticMap } from "../dashboard/scripts/static-map.mjs";
import { srcHash } from "./scripts/src-hash.mjs";

const CLI_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(CLI_DIR, "dist", "cli.js");
const pkg = JSON.parse(fs.readFileSync(path.join(CLI_DIR, "package.json"), "utf8"));
const hash = srcHash(CLI_DIR);

await build({
  absWorkingDir: CLI_DIR,
  entryPoints: ["src/cli.ts"],
  outfile: OUT,
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  charset: "utf8",
  legalComments: "none",
  logLevel: "warning",
  define: { __HK_VERSION__: JSON.stringify(pkg.version), __HK_STATIC__: JSON.stringify(staticMap()) },
  banner: {
    js: `#!/usr/bin/env node\n// knots-sync ${pkg.version} · src-sha256 ${hash} · 생성물(packages/cli/build.mjs) — 손으로 고치지 않는다`,
  },
});
fs.chmodSync(OUT, 0o755);
const bytes = fs.statSync(OUT).size;
console.log(`dist/cli.js ${bytes} bytes · src-sha256 ${hash.slice(0, 12)}`);
