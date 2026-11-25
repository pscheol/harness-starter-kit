import fs from "node:fs";
import { defineConfig } from "vitest/config";
import { staticMap } from "./scripts/static-map.mjs";

const pkg = JSON.parse(fs.readFileSync(new URL("../cli/package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: { __HK_VERSION__: JSON.stringify(pkg.version), __HK_STATIC__: JSON.stringify(staticMap()) },
  test: {
    include: ["test/**/*.test.ts"],
    // 멈춘 시험을 잡는 상한이다. 리포마다 python board.sh 를 실제로 부르는 통합 시험(projects · overview)은 혼자 27~36초인데,
    // release.sh 가 묶음 22개를 함께 돌리고 기계 부하가 높으면(평균 35~40) 60초를 넘겨 릴리스를 멈췄다(2026-11-25).
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
