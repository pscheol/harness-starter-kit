import fs from "node:fs";
import { defineConfig } from "vitest/config";
import { staticMap } from "../dashboard/scripts/static-map.mjs";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: { __HK_VERSION__: JSON.stringify(pkg.version), __HK_STATIC__: JSON.stringify(staticMap()) },
  test: {
    include: ["test/**/*.test.ts"],
    // 멈춘 시험을 잡는 상한이다. 혼자 돌면 다 60초 안이지만, 다른 시험 묶음과 겹쳐 부하가 높으면 넘는다(대시보드와 같다, 2026-11-25).
    testTimeout: 180_000,
  },
});
