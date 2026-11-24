/**
 * 스킬 스캐너(설계 07, SK-R1~R15). 읽기만 한다: 리포 밖 · `~/` 아래에 쓰지 않고, 네트워크 · 모델을 쓰지 않는다.
 * 서버(`GET /skills`)와 CLI(`skills`)가 같은 함수를 부른다.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileStamp } from "./cache";
import type { Project } from "./project";
import { isObj, readJson } from "./util";
import { parseYaml, YamlError } from "./yaml-lite";

export type Harness = "claude" | "codex" | "cursor" | "kiro" | "gemini";
export const HARNESSES: Harness[] = ["claude", "codex", "cursor", "kiro", "gemini"];
export const STAGES = ["design", "implement", "verify", "docs", "ops"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_ALIAS: Record<string, Stage> = { 설계: "design", 구현: "implement", 검증: "verify", 반영: "docs", 운영: "ops" };

const READ_HEAD = 64 * 1024;
const MAX_FILE = 256 * 1024;
const CONCURRENCY = 32;
const TTL_MS = 10 * 60 * 1000;
const NESTED_DEPTH = 4;
const SKIP_DIRS = new Set([".git", "node_modules", "build", "dist", "target", ".venv", ".gradle"]);
const KEEP_FIELDS = ["model", "effort", "context", "agent", "disable-model-invocation", "user-invocable", "allowed-tools", "argument-hint"];

interface RootSpec {
  abs: string;
  display: string;
  scope: string;
  harnesses: Harness[];
  /** 같은 이름 겹침 판정용: 사용자 · 프로젝트 · 하위 폴더 */
  kind: "project" | "user" | "nested" | "plugin";
  /** 같은 층에서 Gemini 가 `.agents/skills` 를 먼저 본다 */
  dirRank: number;
  version?: string;
  versionSource?: string;
  plugin?: string;
}

interface RawSkill {
  root: RootSpec;
  dir: string;
  file: string;
  real: string | null;
  viaLink: boolean;
  id: string;
  name: string;
  description: string | null;
  sha256: string | null;
  fields: Record<string, unknown>;
  stages: string[];
  warnings: string[];
  error: string | null;
}

export interface SkillsOptions {
  user: boolean;
  refresh: boolean;
}

export interface SkillMap {
  stages: Record<string, Record<string, string[]>>;
  commands: Record<string, { slots: string[]; fallback: string; mode?: string }>;
  exclude: string[];
}

function display(p: string, home: string, repo: string): string {
  if (p === home || p.startsWith(`${home}${path.sep}`)) return `~${p.slice(home.length)}`.split(path.sep).join("/");
  if (p === repo) return ".";
  if (p.startsWith(`${repo}${path.sep}`)) return p.slice(repo.length + 1).split(path.sep).join("/");
  return p.split(path.sep).join("/");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return out;
}

function exists(f: string): boolean {
  try {
    fs.statSync(f);
    return true;
  } catch {
    return false;
  }
}

/** 리포 하위 폴더의 `.claude/skills` · `.agents/skills`(깊이 4까지). worktree 자리 · 빌드 폴더는 건너뛴다. */
function nestedRoots(repo: string): { abs: string; sub: string; kind: "claude" | "agents" }[] {
  const out: { abs: string; sub: string; kind: "claude" | "agents" }[] = [];
  const walk = (dir: string, depth: number): void => {
    let names: string[];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const n of names) {
      if (SKIP_DIRS.has(n) || n.endsWith(".worktrees") || (n === "worktrees" && path.basename(dir) === ".claude")) continue;
      const full = path.join(dir, n);
      let st: fs.Stats;
      try {
        st = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      if (n === ".claude" || n === ".agents") {
        const skills = path.join(full, "skills");
        if (dir !== repo && exists(skills)) out.push({ abs: skills, sub: path.relative(repo, dir).split(path.sep).join("/"), kind: n === ".claude" ? "claude" : "agents" });
        continue;
      }
      if (n.startsWith(".")) continue;
      if (depth < NESTED_DEPTH) walk(full, depth + 1);
    }
  };
  walk(repo, 1);
  return out;
}

function projectRoots(repo: string, home: string): RootSpec[] {
  const mk = (rel: string, harnesses: Harness[], dirRank: number): RootSpec => ({ abs: path.join(repo, rel), display: rel, scope: "project", harnesses, kind: "project", dirRank });
  return [
    mk(".agents/skills", ["codex", "cursor", "gemini"], 0),
    mk(".claude/skills", ["claude", "cursor"], 1),
    mk(".kiro/skills", ["kiro"], 1),
    mk(".cursor/skills", ["cursor"], 1),
    mk(".gemini/skills", ["gemini"], 1),
    mk(".codex/skills", ["cursor"], 1),
    ...nestedRoots(repo).map((n): RootSpec => ({ abs: n.abs, display: display(n.abs, home, repo), scope: `nested:${n.sub}`, harnesses: n.kind === "claude" ? ["claude", "cursor"] : ["cursor"], kind: "nested", dirRank: 1 })),
  ];
}

function userRoots(home: string): RootSpec[] {
  const mk = (rel: string, harnesses: Harness[], dirRank: number): RootSpec => ({ abs: path.join(home, rel), display: `~/${rel}`, scope: "user", harnesses, kind: "user", dirRank });
  return [
    mk(".agents/skills", ["codex", "cursor", "gemini"], 0),
    mk(".claude/skills", ["claude", "cursor"], 1),
    mk(".codex/skills", ["cursor"], 1),
    mk(".cursor/skills", ["cursor"], 1),
    mk(".kiro/skills", ["kiro"], 1),
    mk(".gemini/skills", ["gemini"], 1),
  ];
}

function semverKey(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function cmpSemver(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i += 1) if ((a[i] as number) !== (b[i] as number)) return (a[i] as number) - (b[i] as number);
  return 0;
}

interface PluginRead {
  roots: RootSpec[];
  errors: { path: string; error: string }[];
  warning: string | null;
}

/** 07 §3.3: 켜 둔 플러그인만, 설치 기록이 가리키는 버전 하나만. */
function pluginRoots(repo: string, home: string): PluginRead {
  const out: PluginRead = { roots: [], errors: [], warning: null };
  const base = path.join(home, ".claude/plugins");
  const installed = readJson(path.join(base, "installed_plugins.json"));
  if (!installed) return out;
  if (installed.version !== 2) {
    out.warning = "installed_plugins.json 의 version 이 2 가 아니라 플러그인 해석을 건너뛴다";
    return out;
  }
  const enabled = new Map<string, boolean>();
  for (const f of [path.join(home, ".claude/settings.json"), path.join(repo, ".claude/settings.json"), path.join(repo, ".claude/settings.local.json")]) {
    const s = readJson(f);
    const e = s && isObj(s.enabledPlugins) ? s.enabledPlugins : {};
    for (const [id, on] of Object.entries(e)) if (typeof on === "boolean") enabled.set(id, on);
  }
  const plugins = isObj(installed.plugins) ? installed.plugins : {};
  const cacheRoot = path.join(base, "cache");
  for (const [id, on] of [...enabled].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!on) continue;
    const entries = (Array.isArray(plugins[id]) ? (plugins[id] as unknown[]) : []).filter(isObj);
    const repoReal = safeReal(repo);
    const usable = entries.filter((e) => e.scope === "user" || ((e.scope === "project" || e.scope === "local") && typeof e.projectPath === "string" && safeReal(e.projectPath) === repoReal));
    usable.sort((a, b) => {
      const ra = a.scope === "user" ? 0 : 1;
      const rb = b.scope === "user" ? 0 : 1;
      if (ra !== rb) return rb - ra;
      return String(b.lastUpdated ?? "") < String(a.lastUpdated ?? "") ? -1 : 1;
    });
    let installPath: string | null = null;
    let version = "";
    let versionSource = "installed";
    const pick = usable[0];
    const [pluginName, market] = id.split("@") as [string, string | undefined];
    if (pick && typeof pick.installPath === "string") {
      installPath = pick.installPath;
      version = typeof pick.version === "string" ? pick.version : "";
    } else if (market) {
      const dir = path.join(cacheRoot, market, pluginName);
      try {
        const versions = fs.readdirSync(dir).filter((v) => fs.statSync(path.join(dir, v)).isDirectory());
        const scored = versions.map((v) => ({ v, key: semverKey(v), mtime: fs.statSync(path.join(dir, v)).mtimeMs }));
        const semver = scored.filter((s) => s.key !== null).sort((a, b) => cmpSemver(b.key as number[], a.key as number[]));
        const best = semver[0] ?? scored.sort((a, b) => b.mtime - a.mtime)[0];
        if (best) {
          installPath = path.join(dir, best.v);
          version = best.v;
          versionSource = "cache-guess";
        }
      } catch {
        // 캐시 없음
      }
    }
    if (!installPath) continue;
    const real = safeReal(installPath);
    if (!real.startsWith(`${safeReal(cacheRoot)}${path.sep}`)) {
      out.errors.push({ path: `plugin:${id}`, error: "install-path" });
      continue;
    }
    const manifest = readJson(path.join(real, ".claude-plugin/plugin.json")) ?? readJson(path.join(real, "plugin.json")) ?? {};
    const sp = manifest.skills;
    const skillPaths = typeof sp === "string" ? [sp] : Array.isArray(sp) ? sp.filter((x): x is string => typeof x === "string") : ["./skills/"];
    for (const p of skillPaths.length ? skillPaths : ["./skills/"]) {
      const abs = path.resolve(real, p);
      if (abs !== real && !abs.startsWith(`${real}${path.sep}`)) continue;
      out.roots.push({ abs, display: `plugin:${id}`, scope: `plugin:${pluginName}`, harnesses: ["claude"], kind: "plugin", dirRank: 1, version, versionSource, plugin: pluginName });
    }
  }
  return out;
}

function safeReal(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

interface RootRead {
  root: RootSpec;
  skills: RawSkill[];
  count: number;
  symlinks: number;
  nested: number;
  errors: number;
  error?: string;
}

async function readSkillFile(file: string): Promise<{ sha256: string | null; fm: Record<string, unknown> | null; error: string | null }> {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch (e) {
    return { sha256: null, fm: null, error: (e as NodeJS.ErrnoException).code === "ELOOP" ? "symlink-loop" : "unreadable" };
  }
  if (!st.isFile()) return { sha256: null, fm: null, error: "not-file" };
  if (st.size > MAX_FILE) return { sha256: null, fm: null, error: "too-large" };
  let bytes: Buffer;
  try {
    bytes = await fs.promises.readFile(file);
  } catch {
    return { sha256: null, fm: null, error: "unreadable" };
  }
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, READ_HEAD));
  } catch {
    // 64 KiB 경계가 글자 한가운데일 수 있다: 끝 3바이트까지 줄여 본다
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, Math.max(0, Math.min(bytes.length, READ_HEAD) - 3)));
    } catch {
      return { sha256, fm: null, error: "encoding" };
    }
  }
  const lines = text.split("\n");
  if ((lines[0] ?? "").replace(/\r$/, "") !== "---") return { sha256, fm: null, error: "no-frontmatter" };
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] as string).replace(/\r$/, "") === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return { sha256, fm: null, error: "no-frontmatter" };
  try {
    return { sha256, fm: parseYaml(lines.slice(1, end).join("\n")), error: null };
  } catch (e) {
    return { sha256, fm: null, error: e instanceof YamlError ? "yaml" : "yaml" };
  }
}

async function readRoot(root: RootSpec, home: string, repo: string): Promise<RootRead> {
  const res: RootRead = { root, skills: [], count: 0, symlinks: 0, nested: 0, errors: 0 };
  let names: string[];
  try {
    names = fs.readdirSync(root.abs).sort();
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") res.error = code ?? "unreadable";
    return res;
  }
  const found = await mapLimit(names, CONCURRENCY, async (name): Promise<RawSkill | null> => {
    const dir = path.join(root.abs, name);
    let dirLink = false;
    try {
      dirLink = fs.lstatSync(dir).isSymbolicLink();
      if (!fs.statSync(dir).isDirectory()) return null;
    } catch (e) {
      if (dirLink || (e as NodeJS.ErrnoException).code === "ELOOP") {
        res.symlinks += dirLink ? 1 : 0;
        const bad = path.join(dir, "SKILL.md");
        const loop = (e as NodeJS.ErrnoException).code === "ELOOP";
        return loop ? rawError(root, dir, bad, name, "symlink-loop", true, home, repo) : null;
      }
      return null;
    }
    const file = path.join(dir, "SKILL.md");
    let lst: fs.Stats;
    try {
      lst = fs.lstatSync(file);
    } catch {
      // 한 단계 더 깊은 SKILL.md 는 nested 로만 센다(SK-R3)
      try {
        for (const sub of fs.readdirSync(dir)) if (exists(path.join(dir, sub, "SKILL.md"))) res.nested += 1;
      } catch {
        // 읽을 수 없는 폴더
      }
      return null;
    }
    const link = dirLink || lst.isSymbolicLink();
    if (link) res.symlinks += 1;
    const { sha256, fm, error } = await readSkillFile(file);
    const real = error === "symlink-loop" ? null : safeReal(file);
    if (error && !fm) return { ...rawError(root, dir, file, name, error, link, home, repo), sha256, real };
    const f = fm as Record<string, unknown>;
    const warnings: string[] = [];
    const fname = typeof f.name === "string" && f.name ? f.name : null;
    if (!fname) warnings.push("name-missing");
    const nm = fname ?? name;
    const desc = typeof f.description === "string" && f.description ? f.description : null;
    if (!desc) warnings.push("description-missing");
    if (nm.includes(":")) warnings.push("name-colon");
    if (fname && fname !== name) warnings.push("name-dir-mismatch");
    const fields: Record<string, unknown> = {};
    for (const k of KEEP_FIELDS) if (k in f) fields[k] = f[k];
    const meta = isObj(f.metadata) ? f.metadata : {};
    const hx = meta["hx-stages"];
    const stages = Array.isArray(hx) ? hx.filter((x): x is string => typeof x === "string") : typeof hx === "string" ? [hx] : [];
    return {
      root, dir, file, real, viaLink: link, id: root.plugin ? `${root.plugin}:${nm}` : nm, name: nm,
      description: desc, sha256, fields, stages, warnings, error: null,
    };
  });
  for (const s of found) {
    if (!s) continue;
    res.count += 1;
    if (s.error) res.errors += 1;
    res.skills.push(s);
  }
  return res;
}

function rawError(root: RootSpec, dir: string, file: string, name: string, error: string, link: boolean, _home: string, _repo: string): RawSkill {
  return { root, dir, file, real: null, viaLink: link, id: root.plugin ? `${root.plugin}:${name}` : name, name, description: null, sha256: null, fields: {}, stages: [], warnings: [], error };
}

// ── 단계 추정(07 §3.8) ──────────────────────────────────────────

const WORDS: Record<Stage, string[]> = {
  design: ["prd", "requirement", "user stor", "persona", "wireframe", "storyboard", "ux", "ui design", "design system", "ia", "journey", "기획", "요구사항", "화면", "와이어프레임", "스토리", "디자인"],
  implement: ["tdd", "test-driven", "implement", "refactor", "scaffold", "patterns", "coding standard", "build error", "구현", "리팩터"],
  verify: ["review", "security", "audit", "scan", "vulnerab", "qa", "coverage", "lint", "regression", "리뷰", "보안", "검증", "점검", "취약"],
  docs: ["documentation", "docs", "changelog", "release note", "readme", "codemap", "문서", "릴리스 노트"],
  ops: ["deploy", "canary", "monitor", "incident", "retro", "rollback", "observability", "on-call", "배포", "장애", "운영", "회고"],
};

function hit(text: string, word: string): boolean {
  if (/^[a-z]{1,3}$/.test(word)) return new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(text);
  return text.includes(word);
}

export interface Guess {
  stages: Stage[];
  matched: string[];
}

export function guessStages(name: string, description: string | null): Guess {
  const n = name.toLowerCase();
  const d = (description ?? "").toLowerCase();
  const score: Record<string, number> = {};
  const matched: Record<string, string[]> = {};
  for (const st of STAGES) {
    let s = 0;
    const m: string[] = [];
    for (const w of WORDS[st]) {
      const inName = hit(n, w);
      const inDesc = hit(d, w);
      if (inName) s += 3;
      if (inDesc) s += 1;
      if (inName || inDesc) m.push(w);
    }
    score[st] = s;
    matched[st] = m;
  }
  const top = Math.max(...STAGES.map((s) => score[s] as number));
  if (top < 2) return { stages: [], matched: [] };
  const stages = STAGES.filter((s) => score[s] === top);
  return { stages, matched: stages.flatMap((s) => matched[s] as string[]) };
}

// ── 스킬 지도(07 §3.7) ──────────────────────────────────────────

export function readSkillMap(repo: string): { map: SkillMap | null; prepend: Record<string, string[]> } {
  const raw = readJson(path.join(repo, ".agents/skill-map.json"));
  const local = readJson(path.join(repo, ".agents/local/skill-map.local.json"));
  const prepend: Record<string, string[]> = {};
  if (local && isObj(local.prepend)) for (const [k, v] of Object.entries(local.prepend)) if (Array.isArray(v)) prepend[k] = v.filter((x): x is string => typeof x === "string");
  if (!raw) return { map: null, prepend };
  const stages: SkillMap["stages"] = {};
  if (isObj(raw.stages)) {
    for (const [st, slots] of Object.entries(raw.stages)) {
      if (!isObj(slots)) continue;
      stages[st] = {};
      for (const [slot, ids] of Object.entries(slots)) if (Array.isArray(ids)) (stages[st] as Record<string, string[]>)[slot] = ids.filter((x): x is string => typeof x === "string");
    }
  }
  const commands: SkillMap["commands"] = {};
  if (isObj(raw.commands)) {
    for (const [c, v] of Object.entries(raw.commands)) {
      if (!isObj(v)) continue;
      commands[c] = { slots: Array.isArray(v.slots) ? v.slots.filter((x): x is string => typeof x === "string") : [], fallback: typeof v.fallback === "string" ? v.fallback : "builtin", ...(typeof v.mode === "string" ? { mode: v.mode } : {}) };
    }
  }
  const exclude = Array.isArray(raw.exclude) ? raw.exclude.filter((x): x is string => typeof x === "string") : [];
  return { map: { stages, commands, exclude }, prepend };
}

// ── 결과 ─────────────────────────────────────────────────────────

export interface SkillOut {
  id: string;
  name: string;
  description: string | null;
  sha256: string | null;
  locations: { path: string; scope: string; via?: string }[];
  copies: string[];
  harnesses: Record<string, string>;
  shadowedBy: Record<string, string>;
  stages: { stage: string; slot: string | null; source: string; matched?: string[] }[];
  fields: Record<string, unknown>;
  warnings: string[];
  error: string | null;
}

export interface Inventory {
  schema: "harness-kit.skills-inventory/v1";
  scannedAt: string;
  harnesses: string[];
  roots: Record<string, unknown>[];
  skills: SkillOut[];
  conflicts: { name: string; candidates: string[]; winner: Record<string, string> }[];
  map: { present: boolean; resolved: Resolved[] };
  warnings: string[];
}

export interface Resolved {
  command: string;
  slot: string;
  harness: string;
  skill: string | null;
  fallback: string;
}

function rankOf(h: Harness, r: RootSpec): number {
  if (h === "claude") return r.kind === "user" ? 0 : 1;
  if (h === "gemini") return (r.kind === "user" ? 1 : 0) * 10 + r.dirRank;
  return 0;
}

function statusOf(skill: Group, all: Group[], h: Harness): { status: string; by?: string } {
  const vis = skill.roots.filter((r) => r.harnesses.includes(h));
  if (!vis.length || skill.error) return { status: "no" };
  const others = all.filter((o) => o !== skill && !o.error && o.name === skill.name && !o.plugin && !skill.plugin && o.sha256 !== skill.sha256 && o.roots.some((r) => r.harnesses.includes(h)));
  if (!others.length) return { status: "loaded" };
  if (h === "codex" || h === "cursor" || h === "kiro") return { status: "both" };
  const mine = Math.min(...vis.map((r) => rankOf(h, r)));
  let best = mine;
  let by: Group | null = null;
  for (const o of others) {
    const r = Math.min(...o.roots.filter((x) => x.harnesses.includes(h)).map((x) => rankOf(h, x)));
    if (r < best) {
      best = r;
      by = o;
    }
  }
  return best < mine && by ? { status: "shadowed", by: by.display } : { status: "loaded" };
}

interface Group {
  name: string;
  id: string;
  real: string | null;
  sha256: string | null;
  description: string | null;
  plugin: string | null;
  roots: RootSpec[];
  locations: { path: string; scope: string; via?: string }[];
  fields: Record<string, unknown>;
  warnings: string[];
  error: string | null;
  stages: string[];
  display: string;
}

export function activeHarnesses(p: Project): Harness[] {
  const a = p.meta().agents;
  const list = Array.isArray(a) ? a.filter((x): x is Harness => typeof x === "string" && (HARNESSES as string[]).includes(x)) : [];
  return list.length ? list : ["claude"];
}

async function scan(p: Project, opts: SkillsOptions): Promise<Inventory> {
  const repo = p.root;
  const home = p.home;
  const specs: RootSpec[] = [...projectRoots(repo, home)];
  const warnings: string[] = [];
  const pluginErrors: { path: string; error: string }[] = [];
  if (opts.user) {
    specs.push(...userRoots(home));
    const pl = pluginRoots(repo, home);
    specs.push(...pl.roots);
    pluginErrors.push(...pl.errors);
    if (pl.warning) warnings.push(pl.warning);
  }
  const reads = await mapLimit(specs, 4, (s) => readRoot(s, home, repo));
  const groups = new Map<string, Group>();
  const rootsOut: Record<string, unknown>[] = [];
  for (const r of reads) {
    if (r.error && !r.count) {
      rootsOut.push({ path: r.root.display, scope: r.root.scope, count: 0, symlinks: 0, nested: 0, errors: 0, error: r.error });
      continue;
    }
    if (!r.count && !fs.existsSync(r.root.abs)) continue;
    rootsOut.push({
      path: r.root.display, scope: r.root.scope, count: r.count, symlinks: r.symlinks, nested: r.nested, errors: r.errors,
      ...(r.root.version ? { version: r.root.version, versionSource: r.root.versionSource } : {}),
      ...(r.error ? { error: r.error } : {}),
    });
    for (const s of r.skills) {
      const key = s.real ? `r:${s.real}` : `e:${s.file}`;
      const g = groups.get(key);
      const locPath = display(s.dir, home, repo);
      const loc = { path: locPath, scope: r.root.scope, ...(s.viaLink ? { via: "symlink" } : {}) };
      if (g) {
        g.roots.push(r.root);
        g.locations.push(loc);
        continue;
      }
      groups.set(key, {
        name: s.name, id: s.id, real: s.real, sha256: s.sha256, description: s.description, plugin: r.root.plugin ?? null,
        roots: [r.root], locations: [loc], fields: s.fields, warnings: s.warnings, error: s.error, stages: s.stages, display: locPath,
      });
    }
  }
  for (const e of pluginErrors) rootsOut.push({ path: e.path, scope: "plugin", count: 0, symlinks: 0, nested: 0, errors: 1, error: e.error });
  const list = [...groups.values()];
  const { map, prepend } = readSkillMap(repo);
  const excluded = new Set(map?.exclude ?? []);
  const mapStages = new Map<string, { stage: string; slot: string }[]>();
  if (map) for (const [st, slots] of Object.entries(map.stages)) for (const [slot, ids] of Object.entries(slots)) for (const id of ids) mapStages.set(id, [...(mapStages.get(id) ?? []), { stage: st, slot }]);
  const bySha = new Map<string, Group[]>();
  for (const g of list) if (g.sha256) bySha.set(g.sha256, [...(bySha.get(g.sha256) ?? []), g]);
  const skills: SkillOut[] = list.map((g) => {
    const harnesses: Record<string, string> = {};
    const shadowedBy: Record<string, string> = {};
    for (const h of HARNESSES) {
      const s = statusOf(g, list, h);
      harnesses[h] = s.status;
      if (s.by) shadowedBy[h] = s.by;
    }
    let stages: SkillOut["stages"] = [];
    const fromMap = mapStages.get(g.id);
    if (fromMap) stages = fromMap.map((m) => ({ stage: m.stage, slot: m.slot, source: "map" }));
    else if (g.stages.length) stages = g.stages.map((st) => ({ stage: STAGE_ALIAS[st] ?? st, slot: null, source: "metadata" }));
    else if (!excluded.has(g.id)) {
      const gs = guessStages(g.name, g.description);
      stages = gs.stages.map((st) => ({ stage: st, slot: null, source: "추정", matched: gs.matched }));
    }
    const copies = (g.sha256 ? (bySha.get(g.sha256) ?? []) : []).filter((o) => o !== g).map((o) => o.display);
    return {
      id: g.id, name: g.name, description: g.description ? g.description.slice(0, 1024) : null, sha256: g.sha256,
      locations: g.locations, copies, harnesses, shadowedBy, stages, fields: g.fields, warnings: g.warnings, error: g.error,
    };
  });
  skills.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // 이름 겹침(SK-R6)
  const conflicts: Inventory["conflicts"] = [];
  const byName = new Map<string, Group[]>();
  for (const g of list) if (!g.plugin && !g.error && g.sha256) byName.set(g.name, [...(byName.get(g.name) ?? []), g]);
  for (const [name, gs] of [...byName].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const distinct = new Set(gs.map((g) => g.sha256));
    if (distinct.size < 2) continue;
    const winner: Record<string, string> = {};
    let any = false;
    for (const h of HARNESSES) {
      const vis = gs.filter((g) => g.roots.some((r) => r.harnesses.includes(h)));
      if (new Set(vis.map((g) => g.sha256)).size < 2) continue;
      any = true;
      const sts = vis.map((g) => ({ g, s: statusOf(g, list, h) }));
      const w = sts.find((x) => x.s.status === "loaded");
      winner[h] = w ? w.g.display : "both";
    }
    if (any) conflicts.push({ name, candidates: gs.map((g) => g.display), winner });
  }
  return {
    schema: "harness-kit.skills-inventory/v1",
    scannedAt: new Date().toISOString(),
    harnesses: activeHarnesses(p),
    roots: rootsOut,
    skills,
    conflicts,
    map: { present: map !== null, resolved: map ? resolveAll(map, prepend, skills, activeHarnesses(p)) : [] },
    warnings,
  };
}

export function resolveAll(map: SkillMap, prepend: Record<string, string[]>, skills: SkillOut[], harnesses: string[]): Resolved[] {
  const out: Resolved[] = [];
  for (const [command, def] of Object.entries(map.commands)) {
    for (const h of harnesses) {
      for (const slot of def.slots) {
        const [stage, slotName] = slot.split(".") as [string, string];
        const ids = [...(prepend[slot] ?? []), ...((map.stages[stage] ?? {})[slotName ?? ""] ?? [])];
        const found = ids.find((id) => {
          const s = skills.find((x) => x.id === id);
          return s && !s.error && ["loaded", "both"].includes(s.harnesses[h] ?? "no");
        });
        out.push({ command, slot, harness: h, skill: found ?? null, fallback: found ? "" : def.fallback });
      }
    }
  }
  return out;
}

async function stampOf(p: Project, opts: SkillsOptions): Promise<string> {
  const parts: string[] = [`user:${opts.user}`];
  const roots = [...projectRoots(p.root, p.home), ...(opts.user ? userRoots(p.home) : [])];
  for (const r of roots) parts.push(fileStamp(r.abs));
  if (opts.user) {
    parts.push(fileStamp(path.join(p.home, ".claude/plugins/installed_plugins.json")), fileStamp(path.join(p.home, ".claude/settings.json")));
  }
  parts.push(fileStamp(path.join(p.root, ".claude/settings.json")), fileStamp(path.join(p.root, ".claude/settings.local.json")), fileStamp(path.join(p.root, ".agents/skill-map.json")), fileStamp(path.join(p.root, ".agents/local/skill-map.local.json")));
  return parts.join("\n");
}

export async function skillsInventory(p: Project, opts: Partial<SkillsOptions> = {}): Promise<Inventory> {
  const o: SkillsOptions = { user: opts.user ?? true, refresh: opts.refresh ?? false };
  if (o.refresh) return scan(p, o);
  return p.cache.get(`skills:${o.user}`, await stampOf(p, o), () => scan(p, o), TTL_MS);
}

export interface SkillsQuery {
  stage?: string | null;
  harness?: string | null;
  conflicts?: boolean;
  errors?: boolean;
  all?: boolean;
}

/** 07 §3.9 거르기. 단계 값은 한글 · 영어 둘 다 받는다. 지도 출처 → metadata → 추정 순으로 정렬한다. */
export function filterInventory(inv: Inventory, q: SkillsQuery): Inventory & { total: number; shown: number } {
  const stage = q.stage ? (STAGE_ALIAS[q.stage] ?? q.stage) : null;
  const harness = q.harness ?? null;
  const shown = q.all ? [...HARNESSES] : inv.harnesses;
  const order = { map: 0, metadata: 1, 추정: 2 } as Record<string, number>;
  let skills = inv.skills;
  if (stage) skills = skills.filter((s) => s.stages.some((x) => x.stage === stage));
  if (harness) skills = skills.filter((s) => ["loaded", "both"].includes(s.harnesses[harness] ?? "no"));
  if (q.errors) skills = skills.filter((s) => s.error || s.warnings.length);
  if (q.conflicts) {
    const names = new Set(inv.conflicts.map((c) => c.name));
    skills = skills.filter((s) => names.has(s.name));
  }
  if (stage) skills = [...skills].sort((a, b) => (order[a.stages.find((x) => x.stage === stage)?.source ?? "추정"] ?? 2) - (order[b.stages.find((x) => x.stage === stage)?.source ?? "추정"] ?? 2));
  return { ...inv, harnesses: shown, skills, conflicts: q.conflicts || q.stage || q.harness ? inv.conflicts.filter((c) => skills.some((s) => s.name === c.name)) : inv.conflicts, total: inv.skills.length, shown: skills.length };
}
