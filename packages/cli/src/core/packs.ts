/**
 * 회사 팩(설계 04 §3.2 · §3.3, HK-14 design §3): 소스 해석 · 받기(file · git · npm) · 읽기 · 검사 · 설치 경로.
 * 쓰기 · lock 은 commands/update-packs.ts 가 한다. 모델을 부르지 않는다. 자격증명은 git · npm 설정을 그대로 쓰고 읽지 않는다.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FLOOR_HOOKS } from "./floor";
import { CliError, EXIT } from "./errors";
import { byteCompare, writeFileAtomic } from "./fsx";
import { sha256 } from "./hash";
import { isExecutable, mapPath, type Layout } from "./layout";
import type { Selection } from "./selection";
import { untgz } from "./tar";
import { substitute } from "./tokens";
import { HooksError, parseHooks, type HookMap } from "../projection/hooks";
import { treeSha } from "../projection/sources";

export const PACK_SCHEMA = "harness-kit.pack/v1";
export const PACK_NAME = /^[a-z][a-z0-9-]{1,30}$/;
export const PACKS_CACHE = ".agents/state/packs";
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ALLOWED = ["agents-rules/", "agents-skills/", "agents-root/", "agents-docs/_spec-templates/", "scripts/"];
/** 팩이 overrides 로도 덮지 못하는 킷 경로(항목 단위 파일은 fragments 로만 더한다) */
const DENY = new Set([".agents/hooks.json", ".agents/verify-checks.json", ".agents/harness-kit.json", ".agents/harness-kit.lock", ".agents/harness.json", ".agents/model-policy.json"]);
const IGNORED_TOP = new Set(["pack.json", "README.md", "LICENSE", "LICENSE.md", "CHANGELOG.md", ".gitignore", ".gitattributes", ".npmignore", "package.json"]);

export type PackSource = { kind: "file"; path: string } | { kind: "git"; url: string; ref: string } | { kind: "npm"; spec: string };

export interface PackManifest {
  schema: string;
  name: string;
  version: string;
  description?: string;
  requires: { kit: string };
  provides: Partial<Record<"rules" | "skills" | "roles" | "guards" | "scripts" | "templates" | "hooks" | "verifyChecks", string[]>>;
  overrides: string[];
  tokens: string[];
}

export interface PackFile {
  rel: string;
  data: Buffer;
  mode: number;
  link: boolean;
}

export interface FetchedPack {
  source: string;
  parsed: PackSource;
  resolved: string;
  manifest: PackManifest;
  files: PackFile[];
}

export interface PackWant {
  layer: string;
  content: Buffer;
  sha256: string;
  executable: boolean;
}

export interface PackPlanInput {
  layout: Layout;
  selection: Selection;
  tokens: Record<string, string>;
  hookMap: HookMap;
  /** 킷이 원하는 copy 설치 경로 */
  kitPaths: Set<string>;
  kitVersion: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** `file:<경로>` · `git:<주소>#<ref>` · `npm:<spec>`. 틀리면 exit 3(설정 오류). */
export function parsePackSource(raw: string): PackSource {
  if (raw.startsWith("file:") && raw.length > 5) return { kind: "file", path: raw.slice(5) };
  if (raw.startsWith("npm:") && raw.length > 4) return { kind: "npm", spec: raw.slice(4) };
  if (raw.startsWith("git:")) {
    const body = raw.slice(4);
    const hash = body.lastIndexOf("#");
    if (hash > 0 && hash < body.length - 1) {
      const addr = body.slice(0, hash);
      const ref = body.slice(hash + 1);
      const url = /^(ssh|https?|file):\/\//.test(addr) || /^[^@\s]+@[^:\s]+:/.test(addr) ? addr : `https://${addr.replace(/\.git$/, "")}.git`;
      return { kind: "git", url, ref };
    }
  }
  throw new CliError(EXIT.STATE, `팩 소스 형식이 아니다: ${raw}`, "file:<경로> · git:<host>/<path>#<태그> · npm:<패키지>@<판> 중 하나로 적는다");
}

/** 범위(`>=2.0.0 <3.0.0` · `2.1.0` · `^2.0.0` · `~2.1.0`)가 판을 포함하는가. 사전 출시 꼬리는 떼고 본다(2.0.0-alpha 도 2.0.0 으로 본다). */
export function satisfiesKit(version: string, range: string): boolean {
  const core = (v: string): number[] | null => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const cmp = (a: number[], b: number[]): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const v = core(version);
  if (!v) return false;
  const parts = range.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((p) => {
    const m = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(p);
    const b = m ? core(m[2]) : null;
    if (!m || !b) return false;
    const c = cmp(v, b);
    switch (m[1]) {
      case ">=":
        return c >= 0;
      case "<=":
        return c <= 0;
      case ">":
        return c > 0;
      case "<":
        return c < 0;
      case "^":
        return c >= 0 && v[0] === b[0] && (b[0] !== 0 || v[1] === b[1]);
      case "~":
        return c >= 0 && v[0] === b[0] && v[1] === b[1];
      default:
        return c === 0;
    }
  });
}

function walkPack(root: string, rel = ""): PackFile[] {
  const out: PackFile[] = [];
  for (const name of fs.readdirSync(path.join(root, rel)).sort(byteCompare)) {
    if (name === ".git" && rel === "") continue;
    const sub = rel ? `${rel}/${name}` : name;
    const full = path.join(root, sub);
    const st = fs.lstatSync(full);
    if (st.isSymbolicLink()) out.push({ rel: sub, data: Buffer.alloc(0), mode: st.mode, link: true });
    else if (st.isDirectory()) out.push(...walkPack(root, sub));
    else if (st.isFile()) out.push({ rel: sub, data: fs.readFileSync(full), mode: st.mode, link: false });
  }
  return out;
}

function run(cmd: string, args: string[], cwd: string, env: Record<string, string | undefined>): string {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env } as NodeJS.ProcessEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300_000 });
  if (r.error) throw new CliError(EXIT.ENV, `${cmd} 를 실행하지 못했다: ${r.error.message}`, `${cmd} 를 설치하거나 PATH 를 확인한다`);
  if (r.status !== 0) throw new CliError(EXIT.STATE, `${cmd} ${args[0]} 실패: ${(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ")}`, "소스 주소 · 태그 · 접근 권한을 확인한다");
  return r.stdout;
}

function freshDir(target: string): string {
  const dir = path.join(target, PACKS_CACHE, `.hk-tmp-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readManifest(files: PackFile[], source: string): PackManifest {
  const f = files.find((x) => x.rel === "pack.json");
  if (!f) throw new CliError(EXIT.STATE, `팩에 pack.json 이 없다: ${source}`);
  let raw: unknown;
  try {
    raw = JSON.parse(f.data.toString("utf8"));
  } catch (err) {
    throw new CliError(EXIT.STATE, `pack.json 을 해석할 수 없다(${source}): ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isObj(raw)) throw new CliError(EXIT.STATE, `pack.json 최상위가 객체가 아니다: ${source}`);
  const requires = isObj(raw.requires) ? raw.requires : {};
  const provides = isObj(raw.provides) ? raw.provides : {};
  return {
    schema: String(raw.schema ?? ""),
    name: String(raw.name ?? ""),
    version: String(raw.version ?? ""),
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    requires: { kit: typeof requires.kit === "string" ? requires.kit : "" },
    provides: Object.fromEntries(Object.entries(provides).filter(([, v]) => strList(v))) as PackManifest["provides"],
    overrides: strList(raw.overrides) ? raw.overrides : [],
    tokens: strList(raw.tokens) ? raw.tokens : [],
  };
}

/** 팩을 받아 읽는다. git · npm 은 `.agents/state/packs/<이름>@<판>-<resolved 앞 12자>/` 에 풀어 둔다. */
export function fetchPack(target: string, source: string, env: Record<string, string | undefined>): FetchedPack {
  const parsed = parsePackSource(source);
  if (parsed.kind === "file") {
    const dir = path.resolve(target, parsed.path);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new CliError(EXIT.STATE, `팩 폴더가 없다: ${source}`, "file: 경로는 리포 기준 상대 경로나 절대 경로다");
    const files = walkPack(dir);
    const manifest = readManifest(files, source);
    return { source, parsed, resolved: `tree:${treeSha(files.filter((f) => !f.link).map((f) => ({ rel: f.rel, bytes: f.data })))}`, manifest, files };
  }
  const tmp = freshDir(target);
  try {
    let files: PackFile[];
    let resolved: string;
    if (parsed.kind === "git") {
      const into = path.join(tmp, "src");
      run("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", parsed.ref, parsed.url, into], tmp, { ...env, GIT_TERMINAL_PROMPT: "0" });
      resolved = `git:${run("git", ["rev-parse", "HEAD"], into, env).trim()}`;
      files = walkPack(into);
    } else {
      const out = run("npm", ["pack", parsed.spec, "--pack-destination", tmp, "--json", "--silent"], tmp, env);
      let info: { filename?: string; integrity?: string }[];
      try {
        info = JSON.parse(out) as { filename?: string; integrity?: string }[];
      } catch {
        throw new CliError(EXIT.STATE, `npm pack 출력을 해석할 수 없다: ${parsed.spec}`);
      }
      const first = info[0];
      if (!first?.filename) throw new CliError(EXIT.STATE, `npm pack 이 파일을 내지 않았다: ${parsed.spec}`);
      const made = fs.readdirSync(tmp).filter((n) => n.endsWith(".tgz"));
      if (made.length !== 1) throw new CliError(EXIT.STATE, `npm pack 결과 tgz 를 찾지 못했다: ${parsed.spec}`);
      const tgz = fs.readFileSync(path.join(tmp, made[0] as string));
      let entries;
      try {
        entries = untgz(tgz);
      } catch (err) {
        throw new CliError(EXIT.STATE, `npm 팩을 풀 수 없다(${parsed.spec}): ${err instanceof Error ? err.message : String(err)}`);
      }
      files = entries
        .filter((e) => e.path.startsWith("package/"))
        .map((e) => ({ rel: e.path.slice("package/".length), data: e.data, mode: e.mode, link: false }))
        .sort((a, b) => byteCompare(a.rel, b.rel));
      resolved = `npm:${first.integrity ?? sha256(tgz)}`;
    }
    const manifest = readManifest(files, source);
    if (PACK_NAME.test(manifest.name) && SEMVER.test(manifest.version)) {
      const cache = path.join(target, PACKS_CACHE, `${manifest.name}@${manifest.version}-${resolved.replace(/^[a-z]+:(sha\d+-)?/, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`);
      fs.rmSync(cache, { recursive: true, force: true });
      for (const f of files) if (!f.link) writeFileAtomic(path.join(cache, ...f.rel.split("/")), f.data, (f.mode & 0o111) !== 0);
    }
    return { source, parsed, resolved, manifest, files };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 팩 파일이 갈 층 폴더 → 그 안의 상대 경로(이번 선택에 맞지 않는 스택 · 도메인 · 변형은 null). */
function layerOf(rel: string, sel: Selection): { inner: string } | null | "unknown" {
  const parts = rel.split("/");
  if (parts[0] === "common") return { inner: parts.slice(1).join("/") };
  if (parts[0] === "domains") return parts[1] === sel.domain && sel.domain ? { inner: parts.slice(2).join("/") } : null;
  if (parts[0] === "stacks") {
    if (parts[1] !== sel.stack) return null;
    if (parts[2] === "arch") return parts[3] === sel.arch ? { inner: parts.slice(4).join("/") } : null;
    return { inner: parts.slice(2).join("/") };
  }
  return "unknown";
}

function provided(m: PackManifest, dest: string): boolean {
  const p = m.provides;
  return (
    (p.rules ?? []).some((n) => dest === `.agents/rules/${n}.md`) ||
    (p.skills ?? []).some((n) => dest.startsWith(`.agents/skills/${n}/`)) ||
    (p.roles ?? []).some((n) => dest === `.agents/roles/${n}.md`) ||
    (p.guards ?? []).some((n) => dest === `scripts/guards/${n}.sh`) ||
    (p.scripts ?? []).includes(dest) ||
    (p.templates ?? []).includes(dest) ||
    dest.startsWith(`tools/${m.name}/`)
  );
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
}

/** 팩 하나의 설치 경로 → 내용, 그리고 검사에 걸린 것(04 §3.2 검증 1~5, 하나라도 있으면 설치하지 않는다). */
export function planPack(pack: FetchedPack, input: PackPlanInput): { wants: Map<string, PackWant>; problems: string[] } {
  const m = pack.manifest;
  const problems: string[] = [];
  const where = `${m.name || "?"}(${pack.source})`;
  if (m.schema !== PACK_SCHEMA) problems.push(`${where}: schema 는 ${PACK_SCHEMA}`);
  if (!PACK_NAME.test(m.name)) problems.push(`${where}: name 은 ^[a-z][a-z0-9-]{1,30}$`);
  if (!SEMVER.test(m.version)) problems.push(`${where}: version 은 semver(예 1.2.0)`);
  if (pack.parsed.kind === "git" && /^v\d/.test(pack.parsed.ref) && pack.parsed.ref.slice(1) !== m.version) problems.push(`${where}: 태그 ${pack.parsed.ref} 와 version ${m.version} 이 다르다`);
  if (!m.requires.kit) problems.push(`${where}: requires.kit 이 없다`);
  else if (!satisfiesKit(input.kitVersion, m.requires.kit)) problems.push(`팩 ${m.name} ${m.version} 은 kit ${m.requires.kit} 을 요구한다(지금 ${input.kitVersion}). 팩을 올리거나 kit 판을 맞춘다`);
  const owner = `pack:${m.name}`;
  const layer = `${owner}@${m.version}`;
  const order = [...input.layout.tokens, ...m.tokens.filter((t) => !input.layout.tokens.includes(t))];
  const wants = new Map<string, PackWant>();
  const add = (dest: string, data: Buffer, mode: number): void => {
    const content = substitute(data, input.tokens, order);
    wants.set(dest, { layer, content, sha256: sha256(content), executable: (mode & 0o111) !== 0 || isExecutable(input.layout, dest) });
  };
  for (const f of pack.files) {
    const top = f.rel.split("/")[0];
    if (!f.rel.includes("/") && IGNORED_TOP.has(f.rel)) continue;
    if (top === "tests") continue;
    if (f.link) {
      problems.push(`${where}: 링크는 받지 않는다: ${f.rel}`);
      continue;
    }
    if (f.rel.endsWith(".sh") && (f.mode & 0o111) === 0) problems.push(`${where}: 실행 권한이 없는 .sh: ${f.rel}`);
    if (top === "fragments") {
      const frag = fragment(pack, f, input, problems);
      if (frag) add(frag, f.data, 0o644);
      continue;
    }
    const lay = layerOf(f.rel, input.selection);
    if (lay === null) continue;
    if (lay === "unknown") {
      if (f.rel.includes("/")) problems.push(`${where}: 모르는 폴더 ${top}/ — common · domains · stacks · fragments · tests 만 쓴다`);
      continue;
    }
    const inner = lay.inner;
    const okSeg = ALLOWED.some((a) => inner.startsWith(a)) || inner.startsWith(`tools/${m.name}/`);
    if (!okSeg) {
      problems.push(`${where}: 팩이 쓸 수 없는 자리 ${f.rel}(하네스 파일 · root/ 는 킷 몫이다)`);
      continue;
    }
    const { dest, harness } = mapPath(input.layout, inner, input.tokens);
    if (harness !== null) {
      problems.push(`${where}: 하네스 파일은 팩이 두지 않는다: ${f.rel}`);
      continue;
    }
    if (DENY.has(dest)) {
      problems.push(`${where}: ${dest} 는 팩이 덮지 못한다(훅 · 검사는 fragments/ 로 더한다)`);
      continue;
    }
    if (input.kitPaths.has(dest) && !m.overrides.includes(dest)) problems.push(`${where}: 킷 경로 ${dest} 를 덮으려면 pack.json overrides 에 적는다`);
    else if (!provided(m, dest) && !m.overrides.includes(dest)) problems.push(`${where}: ${dest} 가 provides · overrides 어디에도 없다`);
    add(dest, f.data, f.mode);
  }
  return { wants, problems };
}

function fragment(pack: FetchedPack, f: PackFile, input: PackPlanInput, problems: string[]): string | null {
  const m = pack.manifest;
  const where = `${m.name}(${pack.source})`;
  const text = f.data.toString("utf8");
  if (f.rel === "fragments/hooks.json") {
    try {
      const hooks = parseHooks(text, input.hookMap) ?? [];
      for (const h of hooks) {
        if (!h.id.startsWith(`harness-${m.name}-`)) problems.push(`${where}: 훅 id ${h.id} 는 harness-${m.name}- 로 시작한다`);
        if (FLOOR_HOOKS.includes(h.id)) problems.push(`${where}: 하한 훅 ${h.id} 는 팩이 정의하지 못한다`);
        if (h.owner !== `pack:${m.name}`) problems.push(`${where}: 훅 ${h.id} 의 owner 는 pack:${m.name}`);
      }
      if (!sameSet(hooks.map((h) => h.id), m.provides.hooks ?? [])) problems.push(`${where}: fragments/hooks.json 의 id 와 provides.hooks 가 다르다`);
    } catch (err) {
      problems.push(`${where}: ${err instanceof HooksError ? err.message : String(err)}`);
    }
    return `.agents/hooks.d/${m.name}.json`;
  }
  if (f.rel === "fragments/verify-checks.json") {
    let checks: unknown[] = [];
    try {
      const raw = JSON.parse(text) as Record<string, unknown>;
      checks = Array.isArray(raw.checks) ? raw.checks : [];
    } catch (err) {
      problems.push(`${where}: fragments/verify-checks.json 을 해석할 수 없다: ${err instanceof Error ? err.message : String(err)}`);
    }
    const ids = checks.map((c) => (isObj(c) && typeof c.id === "string" ? c.id : ""));
    for (const id of ids) if (!id.startsWith(`${m.name}-`)) problems.push(`${where}: 검사 id '${id}' 는 ${m.name}- 로 시작한다`);
    if (!sameSet(ids, m.provides.verifyChecks ?? [])) problems.push(`${where}: fragments/verify-checks.json 의 id 와 provides.verifyChecks 가 다르다`);
    return `.agents/verify-checks.d/${m.name}.json`;
  }
  problems.push(`${where}: fragments/ 에는 hooks.json · verify-checks.json 만 둔다: ${f.rel}`);
  return null;
}

/** 팩 소스가 고정되지 않았거나(git ref 가 v 태그가 아님) 리포 밖 로컬 경로인가(doctor). */
export function sourceWarnings(target: string, raw: string): { kind: "pack-unpinned" | "pack-local-path"; hint: string }[] {
  let p: PackSource;
  try {
    p = parsePackSource(raw);
  } catch {
    return [];
  }
  if (p.kind === "git" && !/^v\d+\.\d+\.\d+/.test(p.ref)) return [{ kind: "pack-unpinned", hint: `${raw}: ref ${p.ref} 는 태그가 아니다 — 장비마다 다른 내용을 받을 수 있다` }];
  if (p.kind === "file") {
    const abs = path.resolve(target, p.path);
    const rel = path.relative(target, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return [{ kind: "pack-local-path", hint: `${raw}: 리포 밖 경로다 — 다른 사람 장비에는 없다` }];
  }
  return [];
}
