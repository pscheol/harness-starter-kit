import fs from "node:fs";
import { defineConfig } from "vitest/config";
import { staticMap } from "../dashboard/scripts/static-map.mjs";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: { __HK_VERSION__: JSON.stringify(pkg.version), __HK_STATIC__: JSON.stringify(staticMap()) },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
