import fs from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: { __HK_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
