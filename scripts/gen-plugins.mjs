#!/usr/bin/env node
// gen-plugins.mjs — packages/ 원본에서 plugins/harness-kit/ 을 만든다(HK-1, 설계 02 §3.1).
//
//   node scripts/gen-plugins.mjs              plugins/harness-kit/ 을 다시 만든다
//   node scripts/gen-plugins.mjs --check      임시 폴더에 만들어 커밋된 생성물과 비교한다(쓰기 없음)
//   node scripts/gen-plugins.mjs --out <폴더>  다른 폴더에 만든다(비어 있거나 생성물인 폴더만)
//
// 층(같은 경로가 두 층에 있으면 거부한다):
//   packages/plugin/**                → <out>/**
//   packages/legacy-setup/<스킬>/**    → <out>/skills/<스킬>/**
//   packages/templates/**             → <out>/skills/hx-bootstrap/templates/**
//   packages/cli/dist/cli.js          → <out>/skills/hx-bootstrap/bin/harness-kit.js (755, HK-8)
//
// CLI 번들은 여기서 빌드하지 않는다(이 스크립트는 node_modules 없이 돈다). 소스를 고쳤으면 먼저 `pnpm build`.
// 번들 머리줄의 src-sha256 이 지금 packages/cli 소스 해시와 같은 것만 원본으로 쓴다.
//   dist 가 있으면 dist(해시가 다르면 exit 2 — 오래된 빌드).
//   dist 가 없으면 커밋된 사본(해시가 같을 때). 다르면 쓰기는 exit 2, --check 는 차이(exit 1).
//
// 종료 코드: 0 성공 · 1 --check 차이 있음 · 2 사용 오류(겹침 · 위험한 출력 폴더 · 링크 · CLI 번들 없음/오래됨)
// Node 표준 모듈만 쓴다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bannerHash, srcHash } from "../packages/cli/scripts/src-hash.mjs";

/** 심볼릭 링크를 푼 절대 경로. 아직 없는 경로는 있는 조상까지 풀고 나머지를 붙인다(macOS /var → /private/var). */
function realResolve(p) {
  let cur = path.resolve(p);
  const rest = [];
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    rest.unshift(path.basename(cur));
    cur = parent;
  }
  return path.join(fs.realpathSync(cur), ...rest);
}

const ROOT = realResolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const DEFAULT_OUT = path.join(ROOT, "plugins", "harness-kit");
const SKIP_NAMES = new Set([".DS_Store", "__pycache__", "node_modules"]);
const MARKER = path.join(".claude-plugin", "plugin.json");
export const CLI_BIN_REL = "skills/hx-bootstrap/bin/harness-kit.js";

class UsageError extends Error {}

function byText(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function parseArgs(argv) {
  const opts = { check: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--check") opts.check = true;
    else if (a === "--out") {
      if (i + 1 >= argv.length || argv[i + 1] === "") throw new UsageError("--out 에 폴더를 준다");
      opts.out = realResolve(argv[i + 1]);
      i += 1;
    } else throw new UsageError(`모르는 인자: ${a}`);
  }
  return opts;
}

function walk(dir, base = dir, acc = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (SKIP_NAMES.has(name) || name.endsWith(".pyc")) continue;
    const full = path.join(dir, name);
    const st = fs.lstatSync(full);
    if (st.isSymbolicLink()) throw new UsageError(`원본에 심볼릭 링크가 있다(쓰지 않는다): ${path.relative(ROOT, full)}`);
    if (st.isDirectory()) walk(full, base, acc);
    else if (st.isFile()) acc.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return acc;
}

/**
 * CLI 번들의 원본 파일(HK-8 design §2.3).
 * 1. dist 가 있으면 머리줄 해시가 지금 소스 해시와 같아야 한다. 다르면 UsageError(오래된 빌드).
 * 2. dist 가 없으면 committedDir 의 사본을 쓴다 — 그 사본의 머리줄 해시가 지금 소스 해시와 같을 때만.
 * 3. 그것도 아니면 쓰기는 UsageError, --check 는 null(차이로 보고된다).
 */
export function cliBundleSource(root, { check = false, committedDir = path.join(root, "plugins", "harness-kit") } = {}) {
  const cliDir = path.join(root, "packages", "cli");
  const dist = path.join(cliDir, "dist", "cli.js");
  const want = srcHash(cliDir);
  if (fs.existsSync(dist)) {
    if (bannerHash(dist) === want) return dist;
    throw new UsageError("packages/cli/dist/cli.js 가 지금 소스에서 만든 번들이 아니다(오래된 빌드). pnpm build 뒤 다시 실행한다");
  }
  const committed = path.join(committedDir, ...CLI_BIN_REL.split("/"));
  if (bannerHash(committed) === want) return committed;
  const msg = `CLI 번들이 없다: packages/cli/dist/cli.js 가 없고 ${CLI_BIN_REL} 의 src-sha256 이 지금 소스와 다르다. pnpm install && pnpm build 뒤 다시 실행한다`;
  if (!check) throw new UsageError(msg);
  console.log(msg);
  return null;
}

/** 생성물 경로 → 원본 파일 경로. 겹치면 UsageError. */
export function buildPlan(root = ROOT, cliOptions = {}) {
  const plan = new Map();
  const add = (rel, src) => {
    if (plan.has(rel)) {
      throw new UsageError(`두 층이 같은 경로를 만든다: ${rel}\n  ${path.relative(root, plan.get(rel))}\n  ${path.relative(root, src)}`);
    }
    plan.set(rel, src);
  };
  const pluginDir = path.join(root, "packages", "plugin");
  for (const rel of walk(pluginDir)) add(rel, path.join(pluginDir, rel));
  const legacyDir = path.join(root, "packages", "legacy-setup");
  for (const skill of fs.readdirSync(legacyDir).sort()) {
    const skillDir = path.join(legacyDir, skill);
    if (SKIP_NAMES.has(skill) || !fs.lstatSync(skillDir).isDirectory()) continue;
    for (const rel of walk(skillDir)) add(`skills/${skill}/${rel}`, path.join(skillDir, rel));
  }
  const tplDir = path.join(root, "packages", "templates");
  for (const rel of walk(tplDir)) add(`skills/hx-bootstrap/templates/${rel}`, path.join(tplDir, rel));
  const bundle = cliBundleSource(root, cliOptions);
  if (bundle) add(CLI_BIN_REL, bundle);
  return new Map([...plan.entries()].sort(([a], [b]) => byText(a, b)));
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** 지워도 되는 출력 폴더인지 본다(R2.4). */
function assertSafeOut(out, explicit) {
  if (out === DEFAULT_OUT) return;
  if (!explicit) throw new UsageError(`출력 폴더가 기본값이 아니다: ${out}`);
  const home = realResolve(os.homedir());
  if (out === path.parse(out).root || out === home || isInside(ROOT, out)) {
    throw new UsageError(`지울 수 없는 폴더다: ${out}`);
  }
  if (isInside(out, ROOT)) throw new UsageError(`저장소 안에서는 plugins/harness-kit 만 출력 폴더로 쓴다: ${out}`);
  if (fs.existsSync(out)) {
    const entries = fs.readdirSync(out);
    if (entries.length > 0 && !fs.existsSync(path.join(out, MARKER))) {
      throw new UsageError(`비어 있지 않고 생성물도 아닌 폴더다: ${out}`);
    }
  }
}

function modeOf(file) {
  return fs.statSync(file).mode & 0o111 ? 0o755 : 0o644;
}

/** 옆 폴더에 다 만든 뒤 이름을 바꿔 끼운다. 만드는 동안 다른 프로세스가 반쯤 빈 out 을 보지 않는다. */
function generate(out, plan) {
  const parent = path.dirname(out);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, `.${path.basename(out)}.new-`));
  try {
    for (const [rel, src] of plan) {
      const dest = path.join(staging, ...rel.split("/"));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, rel === CLI_BIN_REL ? 0o755 : modeOf(src));
    }
    fs.chmodSync(staging, 0o755);
    const old = `${staging}.old`;
    if (fs.existsSync(out)) fs.renameSync(out, old);
    fs.renameSync(staging, out);
    fs.rmSync(old, { recursive: true, force: true });
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
}

function snapshot(dir) {
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const rel of walk(dir)) {
    const full = path.join(dir, ...rel.split("/"));
    out.set(rel, { bytes: fs.readFileSync(full), exec: (fs.statSync(full).mode & 0o111) !== 0 });
  }
  return out;
}

export function diff(expectedDir, actualDir) {
  const exp = snapshot(expectedDir);
  const act = snapshot(actualDir);
  const lines = [];
  for (const [rel, e] of exp) {
    const a = act.get(rel);
    if (!a) lines.push(`+ ${rel}`);
    else if (!e.bytes.equals(a.bytes)) lines.push(`~ ${rel}`);
    else if (e.exec !== a.exec) lines.push(`x ${rel}`);
  }
  for (const rel of act.keys()) if (!exp.has(rel)) lines.push(`- ${rel}`);
  return lines.sort((x, y) => byText(x.slice(2), y.slice(2)));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const plan = buildPlan(ROOT, { check: opts.check, committedDir: opts.check ? (opts.out ?? DEFAULT_OUT) : DEFAULT_OUT });
  if (opts.check) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-gen-check-"));
    try {
      const out = path.join(tmp, "harness-kit");
      generate(out, plan);
      const lines = diff(out, opts.out ?? DEFAULT_OUT);
      if (lines.length) {
        console.log(`생성물이 packages/ 와 다르다(${lines.length}건). node scripts/gen-plugins.mjs 로 다시 만든다.`);
        console.log("  + 생성물에만 · - 커밋에만 · ~ 내용 · x 실행 비트");
        for (const l of lines) console.log(`  ${l}`);
        return 1;
      }
      console.log(`생성물 일치: 파일 ${plan.size}개`);
      return 0;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  const out = opts.out ?? DEFAULT_OUT;
  assertSafeOut(out, opts.out !== null);
  generate(out, plan);
  console.log(`생성: ${path.relative(process.cwd(), out) || out} · 파일 ${plan.size}개`);
  return 0;
}

if (process.argv[1] && realResolve(process.argv[1]) === realResolve(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main();
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`✖ ${err.message}`);
      process.exitCode = 2;
    } else {
      throw err;
    }
  }
}
