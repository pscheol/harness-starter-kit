/**
 * 외부 도구가 만든 파일을 알아본다: externalPaths 맞춤 · 스냅숏 · lock 등록(설계 10 §3.1 5 · 7단계, MD-R5 · R7).
 * 외부 소유 파일은 lock 에 `op: none`, `owner: external:<도구>` 로 적고 내용(sha256)은 적지 않는다. 킷은 그 파일을 쓰지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { CliError, EXIT } from "../core/errors";
import { byteCompare, writeFileAtomic } from "../core/fsx";
import { sha256 } from "../core/hash";
import { globToRegExp } from "../core/layout";
import type { LockEntry } from "../core/lock";
import type { ModuleDecl } from "./declaration";

export const SNAPSHOT_DIR = ".agents/state/module-snapshots";
const SKIP_DIRS = new Set([".git", "node_modules"]);
const WALK_LIMIT = 50_000;
/** 하네스가 쓰는 설정 파일. 스냅숏에 sha256 을 적는다(킷 몫 병합 키 · 외부 훅이 함께 든다) */
export const HARNESS_SETTINGS = [".claude/settings.json", ".claude/settings.local.json", ".codex/config.toml", ".codex/hooks.json", ".cursor/hooks.json", ".cursor/cli.json", ".kiro/settings", "AGENTS.md", ".gitignore"];

export function toolOwner(m: ModuleDecl): string {
  return `external:${m.requires.tools[0]?.name ?? m.id}`;
}

/** 글롭의 첫 와일드카드 앞까지의 폴더(걷기 시작점) */
function walkRoot(glob: string): string {
  const parts = glob.split("/");
  const out: string[] = [];
  for (const p of parts.slice(0, -1)) {
    if (/[*?]/.test(p)) break;
    out.push(p);
  }
  return out.join("/");
}

/** 리포 안 일반 파일 전부(.git · node_modules 제외, 링크 제외). 상대 경로 바이트 순 */
export function walkFiles(root: string, start = ""): string[] {
  const out: string[] = [];
  const stack = [start];
  while (stack.length && out.length < WALK_LIMIT) {
    const rel = stack.pop() as string;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(child);
      } else if (e.isFile()) out.push(child);
    }
  }
  return out.sort(byteCompare);
}

/** externalPaths 글롭에 맞는 파일. 걷기 시작점이 겹치면 한 번만 걷는다. */
export function matchExternal(root: string, globs: string[]): string[] {
  const res = globs.map((g) => ({ re: globToRegExp(g), start: walkRoot(g) }));
  const starts = [...new Set(res.map((r) => r.start))];
  const files = new Set<string>();
  for (const s of starts) {
    const base = s && !fs.existsSync(path.join(root, s)) ? null : s;
    if (base === null) continue;
    for (const f of walkFiles(root, base)) files.add(f);
  }
  return [...files].filter((f) => res.some((r) => r.re.test(f))).sort(byteCompare);
}

function shaOfFile(file: string): string | null {
  try {
    return sha256(fs.readFileSync(file));
  } catch {
    return null;
  }
}

export interface Snapshot {
  schema: "knots-sync.module-snapshot/v1";
  module: string;
  at: string;
  /** externalPaths 에 맞는 기존 파일 → sha256 */
  external: Record<string, string>;
  /** 하네스 설정 파일 → sha256 */
  settings: Record<string, string>;
  /** 전체 파일 목록(경로만) — 외부 명령 뒤 새로 생긴 파일을 가리는 데 쓴다 */
  files: string[];
  lock: string | null;
  meta: string | null;
}

export function takeSnapshot(root: string, m: ModuleDecl, at: string): Snapshot {
  const external: Record<string, string> = {};
  for (const f of matchExternal(root, m.externalPaths)) external[f] = shaOfFile(path.join(root, f)) ?? "";
  const settings: Record<string, string> = {};
  for (const f of HARNESS_SETTINGS) {
    const s = shaOfFile(path.join(root, f));
    if (s) settings[f] = s;
  }
  return { schema: "knots-sync.module-snapshot/v1", module: m.id, at, external, settings, files: walkFiles(root), lock: shaOfFile(path.join(root, ".agents/knots-sync.lock")), meta: shaOfFile(path.join(root, ".agents/knots-sync.json")) };
}

export function writeSnapshot(root: string, snap: Snapshot): string {
  const stamp = snap.at.replace(/[^0-9A-Za-z]/g, "");
  const rel = `${SNAPSHOT_DIR}/${snap.module}-${stamp}.json`;
  writeFileAtomic(path.join(root, ...rel.split("/")), Buffer.from(`${JSON.stringify(snap, null, 2)}\n`, "utf8"), false);
  return rel;
}

export interface Registration {
  /** lock 에 새로 더할 외부 항목 */
  entries: LockEntry[];
  /** 외부 명령 뒤 새로 생긴 externalPaths 파일 수 */
  created: number;
  /** externalPaths 에 맞지만 이미 있던(스냅숏에 같은 sha256) 파일 수 */
  existing: number;
  /** externalPaths 밖에 새로 생긴 파일(등록하지 않는다) */
  unknown: string[];
}

/**
 * 지금 externalPaths 에 맞는 파일 중 lock 에 없는 것을 외부 항목으로 더한다.
 * 설계 10 은 "새로 생긴 것"만 말하지만, remove 뒤 다시 add 하면 이미 있는 파일이 새로 생기지 않아 등록이 빠진다 — 그래서 이미 있던 맞춤 파일도 등록한다.
 * 같은 경로가 킷(copy · merge …)이나 사람(user) 항목이면 건드리지 않는다.
 */
export function registerExternal(root: string, m: ModuleDecl, lock: LockEntry[], before: Snapshot): Registration {
  const have = new Map(lock.map((e) => [e.path, e]));
  const owner = toolOwner(m);
  const entries: LockEntry[] = [];
  let created = 0;
  let existing = 0;
  const matched = matchExternal(root, m.externalPaths);
  for (const f of matched) {
    if (have.has(f)) continue;
    entries.push({ path: f, op: "none", owner });
    if (Object.hasOwn(before.external, f)) existing += 1;
    else created += 1;
  }
  const covered = new Set(matched);
  const beforeFiles = new Set(before.files);
  const unknown = walkFiles(root).filter((f) => !beforeFiles.has(f) && !covered.has(f) && !have.has(f) && !f.startsWith(`${SNAPSHOT_DIR}/`));
  return { entries, created, existing, unknown };
}

/** 점 경로로 값을 넣는다(메타 flow.design). 중간이 객체가 아니면 exit 3. */
export function setDotted(obj: Record<string, unknown>, dotted: string, value: unknown): Record<string, unknown> {
  const keys = dotted.split(".");
  const out: Record<string, unknown> = { ...obj };
  let cur = out;
  keys.slice(0, -1).forEach((k, i) => {
    const next = cur[k];
    if (next === undefined) cur[k] = {};
    else if (next === null || typeof next !== "object" || Array.isArray(next)) throw new CliError(EXIT.STATE, `설정 ${keys.slice(0, i + 1).join(".")} 가 객체가 아니라 ${dotted} 를 쓸 수 없다`);
    else cur[k] = { ...(next as Record<string, unknown>) };
    cur = cur[k] as Record<string, unknown>;
  });
  cur[keys[keys.length - 1] as string] = value;
  return out;
}
