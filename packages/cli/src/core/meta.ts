/** 메타 .agents/knots-sync.json — v2 쓰기, v1 · v2 읽기(HK-8 design §6.1, README §5, 설계 02 §3.8). */
import fs from "node:fs";
import { formatJson } from "./json";
import type { Selection } from "./selection";
import { LEGACY_META_SCHEMA } from "./legacy-names";

export const META_REL = ".agents/knots-sync.json";
export const META_SCHEMA = "knots-sync/v2";

/** README §5 의 키 순서. 모르는 키는 이 뒤에 원래 순서로 둔다. */
const KEY_ORDER = [
  "schema", "kit", "project", "stack", "arch", "domain", "agents", "modules", "flow", "risk", "codebase", "roles",
  "approvers", "groups", "issueKey", "git", "intake", "notion", "packs", "verify", "versions", "tokens",
  "installedAt", "updatedAt",
];

export const DEFAULT_GATES = ["codebase", "intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"];
export const DEFAULT_BASE = "develop";
export const GIT_DEFAULTS = { base: DEFAULT_BASE, worktreeRoot: "../{repo}.worktrees", maxPerRepo: 3, ide: "code" };
export const DEFAULT_FLOW = { design: "kit", record: "none", gates: DEFAULT_GATES };

export interface MetaV2 {
  schema: string;
  kit: { version: string };
  project: { name: string; slug: string };
  stack: string;
  arch: string;
  domain: string;
  agents: string[];
  modules: string[];
  issueKey: { source: string; prefix: string };
  git: { base: string; [k: string]: unknown };
  verify: { fullOnlyInCI: boolean; [k: string]: unknown };
  packs: unknown[];
  tokens: Record<string, string>;
  installedAt: string;
  updatedAt: string;
  [k: string]: unknown;
}

export function buildMeta(args: {
  version: string;
  selection: Selection;
  tokens: Record<string, string>;
  issue: { source?: string | undefined; prefix?: string | undefined };
  base: string | undefined;
  today: string;
}): MetaV2 {
  const { selection: sel, tokens } = args;
  const slug = tokens.PROJECT_SLUG ?? "";
  return {
    schema: META_SCHEMA,
    kit: { version: args.version },
    project: { name: tokens.PROJECT_NAME ?? "", slug },
    stack: sel.stack,
    arch: sel.arch,
    domain: sel.domain,
    agents: [...sel.agents],
    modules: [...sel.modules],
    flow: { ...DEFAULT_FLOW, gates: [...DEFAULT_GATES] },
    issueKey: { source: args.issue.source ?? "kit", prefix: args.issue.prefix ?? derivePrefix(slug) },
    git: { ...GIT_DEFAULTS, base: args.base ?? DEFAULT_BASE },
    packs: [],
    verify: { fullOnlyInCI: true },
    tokens: { ...tokens },
    installedAt: args.today,
    updatedAt: args.today,
  };
}

/**
 * update 가 쓰는 메타(HK-11 design §3.3 5단계). 읽은 메타(v1 은 이미 v2 로 바꾼 것)에서
 * 킷이 관리하는 키만 바꾸고, 빠진 v2 기본값을 채우고, 그 밖의 키는 값과 순서를 둔다.
 */
export function mergeMetaForUpdate(
  meta: MetaV2,
  args: { version: string; selection: Pick<Selection, "stack" | "arch" | "domain" | "agents" | "modules">; tokens: Record<string, string>; today: string },
): MetaV2 {
  const { selection: sel } = args;
  return {
    ...meta,
    schema: META_SCHEMA,
    kit: { version: args.version },
    stack: sel.stack,
    arch: sel.arch,
    domain: sel.domain,
    agents: [...sel.agents],
    modules: [...sel.modules],
    flow: isObj(meta.flow) ? meta.flow : { ...DEFAULT_FLOW, gates: [...DEFAULT_GATES] },
    git: { ...GIT_DEFAULTS, ...meta.git },
    tokens: { ...meta.tokens, ...args.tokens },
    installedAt: meta.installedAt || args.today,
    updatedAt: args.today,
  };
}

export function serializeMeta(meta: Record<string, unknown>): string {
  const known = KEY_ORDER.filter((k) => k in meta).map((k) => [k, meta[k]] as const);
  const rest = Object.keys(meta)
    .filter((k) => !KEY_ORDER.includes(k))
    .map((k) => [k, meta[k]] as const);
  return formatJson(Object.fromEntries([...known, ...rest]));
}

export type MetaRead =
  | { status: "missing" }
  | { status: "invalid"; error: string }
  | { status: "ok"; schema: "v1" | "v2"; meta: MetaV2 };

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function checkCommon(m: Record<string, unknown>): string | null {
  for (const k of ["stack", "arch"]) if (!isStr(m[k])) return `${k} 가 문자열이 아니다`;
  if (m.domain !== undefined && !isStr(m.domain)) return "domain 이 문자열이 아니다";
  if (!isStrList(m.agents)) return "agents 가 문자열 배열이 아니다";
  if (m.modules !== undefined && !isStrList(m.modules)) return "modules 가 문자열 배열이 아니다";
  if (m.tokens !== undefined && !isObj(m.tokens)) return "tokens 가 객체가 아니다";
  return null;
}

function tokensOf(m: Record<string, unknown>): Record<string, string> {
  const t = isObj(m.tokens) ? m.tokens : {};
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, isStr(v) ? v : String(v ?? "")]));
}

const ISSUE_PREFIX = /^[A-Z][A-Z0-9]{1,9}$/;

/** PROJECT_SLUG → 이슈 키 접두. 대문자 · 영숫자만 · 앞 숫자 제거 · 10자, 2자 미만이면 ISSUE(Python sdd_keys.derive_prefix · setup.sh 와 같다). */
export function derivePrefix(slug: string): string {
  const letters = slug.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^[0-9]+/, "").slice(0, 10);
  return ISSUE_PREFIX.test(letters) ? letters : "ISSUE";
}

/** 2.0.0-alpha CLI 가 slug 를 대문자로만 바꿔 쓴 접두(ACME-NOTES)는 형식 검사에 걸린다 — 킷이 정한 값이면 고친다. 사람이 정한 값은 둔다. */
function repairedIssueKey(key: MetaV2["issueKey"], slug: string): MetaV2["issueKey"] {
  const broken = key.source === "kit" && key.prefix === slug.toUpperCase() && !ISSUE_PREFIX.test(key.prefix);
  return broken ? { ...key, prefix: derivePrefix(slug) } : key;
}

/** v1(평면, kitVersion) → v2. v1.1 기본값 issueKey · git.base · verify.fullOnlyInCI 를 채운다. */
function fromV1(m: Record<string, unknown>): MetaV2 {
  const tokens = tokensOf(m);
  const slug = tokens.PROJECT_SLUG ?? "";
  const { kitVersion, installedAt, updatedAt, tokens: _t, ...rest } = m;
  return {
    ...rest,
    schema: META_SCHEMA,
    kit: { version: isStr(kitVersion) ? kitVersion : "unknown" },
    project: { name: tokens.PROJECT_NAME ?? "", slug },
    stack: m.stack as string,
    arch: m.arch as string,
    domain: isStr(m.domain) ? m.domain : "",
    agents: m.agents as string[],
    modules: isStrList(m.modules) ? m.modules : [],
    issueKey: isObj(m.issueKey) ? (m.issueKey as MetaV2["issueKey"]) : { source: "kit", prefix: derivePrefix(slug) },
    git: { base: DEFAULT_BASE, ...(isObj(m.git) ? m.git : {}) } as MetaV2["git"],
    packs: [],
    verify: { fullOnlyInCI: true, ...(isObj(m.verify) ? m.verify : {}) } as MetaV2["verify"],
    tokens,
    installedAt: isStr(installedAt) ? installedAt : "",
    updatedAt: isStr(updatedAt) ? updatedAt : "",
  };
}

function fromV2(m: Record<string, unknown>): MetaV2 {
  const tokens = tokensOf(m);
  const slug = isObj(m.project) && isStr(m.project.slug) ? m.project.slug : (tokens.PROJECT_SLUG ?? "");
  return {
    ...m,
    schema: META_SCHEMA,
    kit: { version: isObj(m.kit) && isStr(m.kit.version) ? m.kit.version : "unknown" },
    project: { name: isObj(m.project) && isStr(m.project.name) ? m.project.name : (tokens.PROJECT_NAME ?? ""), slug },
    stack: m.stack as string,
    arch: m.arch as string,
    domain: isStr(m.domain) ? m.domain : "",
    agents: m.agents as string[],
    modules: isStrList(m.modules) ? m.modules : [],
    issueKey: isObj(m.issueKey) ? repairedIssueKey(m.issueKey as MetaV2["issueKey"], slug) : { source: "kit", prefix: derivePrefix(slug) },
    git: { base: DEFAULT_BASE, ...(isObj(m.git) ? m.git : {}) } as MetaV2["git"],
    packs: Array.isArray(m.packs) ? m.packs : [],
    verify: { fullOnlyInCI: true, ...(isObj(m.verify) ? m.verify : {}) } as MetaV2["verify"],
    tokens,
    installedAt: isStr(m.installedAt) ? m.installedAt : "",
    updatedAt: isStr(m.updatedAt) ? m.updatedAt : "",
  };
}

/** v1 이면 메모리에서만 v2 로 바꾼다(읽기 전용 명령, 설계 02 §3.8). */
export function readMeta(file: string): MetaRead {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    return { status: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { status: "invalid", error: `JSON 해석 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isObj(raw)) return { status: "invalid", error: "최상위가 객체가 아니다" };
  // v2-alpha 메타는 옛 이름 schema(harness-kit/v2)다 — 같은 v2 로 읽는다(HK-22b)
  const isV2 = raw.schema === META_SCHEMA || raw.schema === LEGACY_META_SCHEMA;
  const isV1 = raw.schema === undefined && "kitVersion" in raw;
  if (!isV2 && !isV1) return { status: "invalid", error: `모르는 형식(schema: ${String(raw.schema)})` };
  const problem = checkCommon(raw);
  if (problem) return { status: "invalid", error: problem };
  return isV2 ? { status: "ok", schema: "v2", meta: fromV2({ ...raw, schema: META_SCHEMA }) } : { status: "ok", schema: "v1", meta: fromV1(raw) };
}
