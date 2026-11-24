/**
 * 훅 원본 `.agents/hooks.json` → 하네스별 훅(HK-24 design §2 · §3, 03 §3.4).
 * Python `scripts/harness/projection_hooks.py` 와 같은 결과를 낸다(시험이 같은 fixture 로 묶는다). 쓰지 않는다.
 */
import type { HookSpec, ProjectionSpec } from "./spec";

export const HOOKS_REL = ".agents/hooks.json";
export const HOOKS_SCHEMA = "knots-sync.hooks/v1";

export type HookTarget = "claude" | "codex" | "kiroIde" | "kiroCli";

export interface HookMap {
  targets: HookTarget[];
  harnessOf: Record<HookTarget, string>;
  events: Record<string, Partial<Record<HookTarget, string>>>;
  tools: Record<string, Record<HookTarget, string>>;
  commands: Record<HookTarget, string>;
  legacyScripts: string[];
}

export interface HookDef {
  id: string;
  event: string;
  tools?: string[];
  script: string;
  timeoutSec: number;
  owner: string;
  floor?: boolean;
  env?: Record<string, Record<string, string>>;
  harnesses?: string[];
  module?: string;
  description?: string;
  title?: string;
  maxOutputBytes?: number;
  subagents?: boolean;
}

export class HooksError extends Error {}

const HOOK_ID = /^harness-[a-z0-9-]+$/;
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/;
const ENV_VALUE = /^[A-Za-z0-9._/:-]*$/;
const SCRIPT = /^scripts\/[A-Za-z0-9._/-]+$/;
const OWNER = /^(kit|user|pack:[a-z0-9-]+)$/;
const TOOLS = ["write", "shell"];
const FIELDS = new Set(["id", "event", "tools", "script", "timeoutSec", "owner", "floor", "env", "harnesses", "module", "description", "title", "maxOutputBytes", "subagents"]);
const FORBIDDEN_ENV = new Set(["ANTHROPIC_MODEL", "CLAUDE_CODE_EFFORT_LEVEL", "MAX_THINKING_TOKENS", "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "CLAUDE_CODE_SUBAGENT_EFFORT"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const positiveInt = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v) && v > 0;
const pyRepr = (v: unknown): string => (typeof v === "string" ? `'${v}'` : v === undefined || v === null ? "None" : JSON.stringify(v));

function check(h: unknown, i: number, map: HookMap, seen: Set<string>): HookDef {
  const where = `hooks.json hooks[${i}]`;
  if (!isObj(h)) throw new HooksError(`${where}: 객체가 아니다`);
  const extra = Object.keys(h).filter((k) => !FIELDS.has(k)).sort();
  if (extra.length) throw new HooksError(`${where}: 모르는 필드 ${extra.join(", ")}`);
  const id = h.id;
  if (typeof id !== "string" || !HOOK_ID.test(id)) throw new HooksError(`${where}: id 는 harness-<소문자 · 숫자 · ->`);
  if (seen.has(id)) throw new HooksError(`${where}: id ${id} 가 두 번 나온다`);
  seen.add(id);
  if (typeof h.event !== "string" || !Object.hasOwn(map.events, h.event)) throw new HooksError(`${where} ${id}: 모르는 event ${pyRepr(h.event)}`);
  const tools = h.tools;
  if (tools !== undefined) {
    if (h.event !== "pre-tool" && h.event !== "post-tool") throw new HooksError(`${where} ${id}: tools 는 pre-tool · post-tool 에만 둔다`);
    if (!Array.isArray(tools) || !tools.length || tools.some((t) => !TOOLS.includes(t as string))) throw new HooksError(`${where} ${id}: tools 는 write · shell 목록`);
  }
  const script = h.script;
  if (typeof script !== "string" || !SCRIPT.test(script) || script.split("/").includes("..")) throw new HooksError(`${where} ${id}: script 는 scripts/ 아래 상대 경로`);
  if (!positiveInt(h.timeoutSec)) throw new HooksError(`${where} ${id}: timeoutSec 는 양의 정수`);
  if (typeof h.owner !== "string" || !OWNER.test(h.owner)) throw new HooksError(`${where} ${id}: owner 는 kit · user · pack:<이름>`);
  for (const key of ["floor", "subagents"]) {
    if (Object.hasOwn(h, key) && typeof h[key] !== "boolean") throw new HooksError(`${where} ${id}: ${key} 는 true · false`);
  }
  if (Object.hasOwn(h, "maxOutputBytes") && !positiveInt(h.maxOutputBytes)) throw new HooksError(`${where} ${id}: maxOutputBytes 는 양의 정수`);
  const known = new Set(Object.values(map.harnessOf));
  const harnesses = h.harnesses;
  if (harnesses !== undefined && (!Array.isArray(harnesses) || !harnesses.length || harnesses.some((x) => !known.has(x as string)))) {
    throw new HooksError(`${where} ${id}: harnesses 는 ${[...known].sort().join(" · ")} 목록`);
  }
  for (const key of ["module", "description", "title"]) {
    if (Object.hasOwn(h, key) && (typeof h[key] !== "string" || !h[key])) throw new HooksError(`${where} ${id}: ${key} 는 빈 글이 아니다`);
  }
  const env = h.env;
  if (env !== undefined) {
    if (!isObj(env)) throw new HooksError(`${where} ${id}: env 는 객체`);
    for (const [k, per] of Object.entries(env)) {
      if (!ENV_KEY.test(k) || FORBIDDEN_ENV.has(k) || (k.startsWith("ANTHROPIC_DEFAULT_") && k.endsWith("_MODEL"))) throw new HooksError(`${where} ${id}: env ${k} 를 쓸 수 없다(대문자 · 숫자 · _, 모델 환경변수 금지)`);
      if (!isObj(per) || Object.entries(per).some(([x, v]) => !known.has(x) || typeof v !== "string" || !ENV_VALUE.test(v))) throw new HooksError(`${where} ${id}: env ${k} 는 하네스 → 값(영문 · 숫자 · ._/:-)`);
    }
  }
  return h as unknown as HookDef;
}

/** 없으면 null. 형식을 어기면 HooksError. */
export function parseHooks(text: string | null, map: HookMap): HookDef[] | null {
  if (text === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new HooksError(`hooks.json 을 해석할 수 없다: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isObj(data) || data.schema !== HOOKS_SCHEMA) throw new HooksError(`hooks.json schema 는 ${HOOKS_SCHEMA}`);
  if (!Array.isArray(data.hooks)) throw new HooksError("hooks.json hooks 가 배열이 아니다");
  const seen = new Set<string>();
  return data.hooks.map((h, i) => check(h, i, map, seen));
}

export function wantedHooks(hooks: HookDef[], target: HookTarget, map: HookMap, modules: string[]): HookDef[] {
  const harness = map.harnessOf[target];
  return hooks.filter((h) => Object.hasOwn(map.events[h.event], target) && (h.harnesses === undefined || h.harnesses.includes(harness)) && (h.module === undefined || modules.includes(h.module)));
}

export function hookCommand(h: HookDef, target: HookTarget, map: HookMap): string {
  const harness = map.harnessOf[target];
  const prefix = Object.entries(h.env ?? {})
    .filter(([, per]) => Object.hasOwn(per, harness))
    .map(([k, per]) => `${k}=${per[harness]} `)
    .join("");
  return prefix + map.commands[target].split("{id}").join(h.id).split("{script}").join(h.script);
}

export function toolNames(h: HookDef, target: HookTarget, map: HookMap): string[] {
  const out: string[] = [];
  for (const tool of h.tools ?? []) for (const name of map.tools[tool][target].split("|")) if (!out.includes(name)) out.push(name);
  return out;
}

const eventOf = (h: HookDef, target: HookTarget, map: HookMap): string => map.events[h.event][target] as string;

/** Claude settings · Codex hooks.json 병합에 쓰는 원하는 훅. */
export function settingsHooks(hooks: HookDef[], target: HookTarget, map: HookMap, modules: string[]): HookSpec[] {
  return wantedHooks(hooks, target, map, modules).map((h) => {
    const names = toolNames(h, target, map);
    return {
      id: h.id,
      event: eventOf(h, target, map),
      ...(names.length ? { matcher: names.join("|") } : {}),
      script: h.script,
      hook: { type: "command", command: hookCommand(h, target, map), timeout: h.timeoutSec },
    };
  });
}

/** Kiro IDE `.kiro/hooks/<id>.json` — 훅 하나에 파일 하나. */
export function kiroIdeFiles(hooks: HookDef[], map: HookMap, modules: string[]): { path: string; text: string }[] {
  return wantedHooks(hooks, "kiroIde", map, modules).map((h) => {
    const entry: Obj = { name: h.title ?? h.id, trigger: eventOf(h, "kiroIde", map) };
    if (h.description !== undefined) entry.description = h.description;
    const names = toolNames(h, "kiroIde", map);
    if (names.length) entry.matcher = names.join("|");
    entry.action = { type: "command", command: hookCommand(h, "kiroIde", map), timeout: h.timeoutSec };
    return { path: `.kiro/hooks/${h.id}.json`, text: `${JSON.stringify({ version: "v1", hooks: [entry] }, null, 2)}\n` };
  });
}

/** Kiro CLI 에이전트 `hooks`. matcher 는 도구 하나만 받으므로 도구마다 항목을 하나씩 만든다. */
export function kiroCliHooks(hooks: HookDef[], map: HookMap, modules: string[], subagentsOnly = false): Record<string, Obj[]> {
  const out: Record<string, Obj[]> = {};
  for (const h of wantedHooks(hooks, "kiroCli", map, modules)) {
    if (subagentsOnly && !h.subagents) continue;
    const command = hookCommand(h, "kiroCli", map);
    const names = toolNames(h, "kiroCli", map);
    const ms = h.timeoutSec * 1000;
    const entries: Obj[] = names.length ? names.map((n) => ({ matcher: n, command, timeout_ms: ms })) : [{ command, timeout_ms: ms }];
    const ev = eventOf(h, "kiroCli", map);
    out[ev] = [...(out[ev] ?? []), ...entries];
  }
  return out;
}

/** `{{kit:KEY}}` · `{{KEY}}` 를 파싱한 JSON 문자열 안에서 바꾼다(projection.json 은 설치 때 치환하지 않는 `{{kit:KEY}}` 를 쓴다). */
export function substitute(value: unknown, tokens: Record<string, string>): unknown {
  if (typeof value === "string") return Object.entries(tokens).reduce((v, [k, x]) => (x ? v.split(`{{kit:${k}}}`).join(x).split(`{{${k}}}`).join(x) : v), value);
  if (Array.isArray(value)) return value.map((x) => substitute(x, tokens));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, substitute(x, tokens)]));
  return value;
}

export function renderKiroCoordinator(spec: Pick<ProjectionSpec, "kiroCoordinator">, tokens: Record<string, string>, cliHooks: Record<string, Obj[]>): string {
  const base = substitute(spec.kiroCoordinator, tokens) as Obj;
  const obj = Object.keys(cliHooks).length ? { ...base, hooks: cliHooks } : base;
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** v1 · HK-13 판 명령의 꼬리(`scripts/hooks/<이름>` · `_ <이름>`)로 옛 킷 항목을 알아본다. */
export function kitScriptSuffixes(hooks: HookDef[] | null, map: HookMap): string[] {
  const names: string[] = [];
  for (const script of [...(hooks ?? []).map((h) => h.script), ...(map.legacyScripts ?? []).map((n) => `scripts/hooks/${n}`)]) if (!names.includes(script)) names.push(script);
  const out: string[] = [];
  for (const script of names) for (const s of [script, `_ ${script.slice(script.lastIndexOf("/") + 1)}`]) if (!out.includes(s)) out.push(s);
  return out;
}

// ── 주인별 훅 파일 합치기(HK-14 design §1 · §4) ───────────────────────────────

export const HOOKS_DIR = ".agents/hooks.d";
export const PROJECT_HOOKS = "project.json";

/** `.agents/hooks.d/` 의 파일 이름 → 읽는 순서(이름 바이트 순, project.json 은 마지막). Python hook_doc_paths 와 같다. */
export function hookDocPaths(names: string[]): string[] {
  const enc = (n: string): Buffer => Buffer.from(n, "utf8");
  return names
    .filter((n) => n.endsWith(".json") && !n.startsWith("."))
    .sort((a, b) => Number(a === PROJECT_HOOKS) - Number(b === PROJECT_HOOKS) || Buffer.compare(enc(a), enc(b)))
    .map((n) => `${HOOKS_DIR}/${n}`);
}

/**
 * [(경로, 내용)] — 첫째가 킷 hooks.json. 팩 파일끼리 · 킷과 같은 id 는 HooksError.
 * project.json 은 같은 id 를 덮고(하한 id 는 버리고 floor-override), 새 id 는 뒤에 붙인다.
 */
export function mergeHookDocs(docs: { rel: string; text: string }[], map: HookMap, floor: readonly string[]): { hooks: HookDef[]; findings: { kind: string; severity: "error"; path: string; hint: string }[] } {
  const hooks: HookDef[] = [];
  const findings: { kind: string; severity: "error"; path: string; hint: string }[] = [];
  for (const { rel, text } of docs) {
    const items = parseHooks(text, map) ?? [];
    const project = rel === `${HOOKS_DIR}/${PROJECT_HOOKS}`;
    const index = new Map(hooks.map((h, i) => [h.id, i]));
    for (const item of items) {
      if (!project) {
        if (index.has(item.id)) throw new HooksError(`${rel}: 훅 id ${item.id} 가 다른 층에도 있다(팩 훅 id 는 harness-<팩>- 로 시작한다)`);
        hooks.push(item);
      } else if (floor.includes(item.id)) {
        findings.push({ kind: "floor-override", severity: "error", path: rel, hint: `하한 훅 ${item.id} 는 프로젝트가 덮지 못한다 — 이 항목은 쓰지 않았다` });
      } else if (index.has(item.id)) hooks[index.get(item.id) as number] = item;
      else hooks.push(item);
    }
  }
  return { hooks, findings };
}
