#!/usr/bin/env node
// build.mjs — src/cli.ts(진입) · src/main.ts 를 dist/cli.js 한 파일로 묶는다(HK-8 design §2.1).
//
//   node build.mjs        (= pnpm -C packages/cli build)
//
// cjs · node18 · 런타임 의존 0. 머리 두 줄은 shebang 과 소스 해시다.
// 같은 소스와 같은 esbuild 판이면 바이트가 같다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
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
  define: { __HK_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: `#!/usr/bin/env node\n// harness-kit ${pkg.version} · src-sha256 ${hash} · 생성물(packages/cli/build.mjs) — 손으로 고치지 않는다`,
  },
});
fs.chmodSync(OUT, 0o755);
const bytes = fs.statSync(OUT).size;
console.log(`dist/cli.js ${bytes} bytes · src-sha256 ${hash.slice(0, 12)}`);
