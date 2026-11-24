// static-map.mjs — packages/dashboard/static/ 의 화면 파일을 {경로: 내용} 으로 읽는다(HK-17 design §1).
//
// packages/cli/build.mjs 가 번들의 define `__HK_STATIC__` 로 넣고, 두 패키지의 vitest 설정이 같은 값을 넣는다.
// Node 표준 모듈만 쓴다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "static");

export function staticMap(dir = STATIC_DIR) {
  const out = {};
  const walk = (cur) => {
    for (const name of fs.readdirSync(cur).sort()) {
      if (name === ".DS_Store") continue;
      const full = path.join(cur, name);
      const st = fs.lstatSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out[path.relative(dir, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}
