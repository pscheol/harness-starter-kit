// src-hash.mjs — CLI 번들의 입력 소스 해시(HK-8 design §2.2).
//
// build.mjs 가 번들 머리줄에 넣고, scripts/gen-plugins.mjs 가 같은 값을 다시 계산해
// dist · 플러그인 사본이 지금 소스에서 만든 것인지 본다. tests/cli_dist.py 가 같은 식을 쓴다.
//
// 대상: packages/cli 의 build.mjs · package.json · tsconfig.json · scripts/ · src/ 와 packages/dashboard 의 package.json · scripts/ · src/ · static/.
// 값: 대상 파일을 상대 경로(POSIX) 사전순으로 "<경로>\0<sha256>\n" 이어 붙인 문자열의 sha256.
// Node 표준 모듈만 쓴다.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT_FILES = ["build.mjs", "package.json", "tsconfig.json"];
const DIRS = ["scripts", "src"];
const SKIP = new Set([".DS_Store"]);

function walk(dir, base, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.lstatSync(full);
    if (st.isDirectory()) walk(full, base, acc);
    else if (st.isFile()) acc.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return acc;
}

/** 같은 번들에 묶이는 관리 페이지 패키지(HK-17): packages/cli 기준 상대 경로 "../dashboard/…". */
const DASHBOARD_FILES = ["package.json"];
const DASHBOARD_DIRS = ["scripts", "src", "static"];

/** packages/cli 폴더(와 ../dashboard)의 소스 파일 목록(상대 경로, 사전순). */
export function sourceFiles(cliDir) {
  const files = ROOT_FILES.filter((f) => fs.existsSync(path.join(cliDir, f)));
  for (const d of DIRS) walk(path.join(cliDir, d), cliDir, files);
  const dash = path.join(cliDir, "..", "dashboard");
  for (const f of DASHBOARD_FILES) if (fs.existsSync(path.join(dash, f))) files.push(`../dashboard/${f}`);
  for (const d of DASHBOARD_DIRS) walk(path.join(dash, d), cliDir, files);
  return files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function srcHash(cliDir) {
  const lines = sourceFiles(cliDir).map((rel) => {
    const sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(cliDir, rel))).digest("hex");
    return `${rel}\0${sha}\n`;
  });
  return crypto.createHash("sha256").update(lines.join("")).digest("hex");
}

const BANNER_RE = /^\/\/ harness-kit \S+ · src-sha256 ([0-9a-f]{64})/m;

/** 번들 파일 머리에서 소스 해시를 읽는다. 없으면 null. */
export function bannerHash(bundleFile) {
  if (!fs.existsSync(bundleFile)) return null;
  const head = fs.readFileSync(bundleFile, "utf8").slice(0, 400);
  const m = BANNER_RE.exec(head);
  return m ? m[1] : null;
}
