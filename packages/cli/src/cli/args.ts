/** 인자 해석: 명령을 먼저 정하고 그 명령의 플래그만 받는다(모르는 플래그는 exit 2). */
import { parseArgs } from "node:util";
import { usageError } from "../core/errors";

type OptType = { type: "string" | "boolean"; multiple?: boolean; short?: string };
type OptSpec = Record<string, OptType>;

const COMMON: OptSpec = {
  cwd: { type: "string" },
  "dry-run": { type: "boolean" },
  yes: { type: "boolean" },
  json: { type: "boolean" },
  templates: { type: "string" },
  "no-color": { type: "boolean" },
  quiet: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

const INIT: OptSpec = {
  stack: { type: "string" },
  arch: { type: "string" },
  domain: { type: "string" },
  lang: { type: "string" },
  agents: { type: "string" },
  modules: { type: "string" },
  name: { type: "string" },
  slug: { type: "string" },
  "package-ns": { type: "string" },
  "protected-path": { type: "string" },
  token: { type: "string", multiple: true },
  "issue-source": { type: "string" },
  "issue-prefix": { type: "string" },
  base: { type: "string" },
  adopt: { type: "boolean" },
  force: { type: "boolean" },
  "no-register": { type: "boolean" },
  // 외부 도구 모듈(HK-20, 설계 10 §3.1)
  "install-tools": { type: "boolean" },
  "allow-unverified": { type: "boolean" },
};

export const COMMAND_OPTIONS: Record<string, OptSpec> = {
  init: INIT,
  plan: INIT,
  doctor: { check: { type: "boolean" }, only: { type: "string" } },
  list: { files: { type: "boolean" } },
  update: {
    "accept-all": { type: "boolean" },
    prune: { type: "boolean" },
    forget: { type: "string", multiple: true },
    to: { type: "string" },
    packs: { type: "boolean" },
    tools: { type: "boolean" },
    "allow-unverified": { type: "boolean" },
  },
  repair: { only: { type: "string" } },
  uninstall: { "keep-state": { type: "boolean" }, "keep-packs": { type: "boolean" } },
  add: { "install-tools": { type: "boolean" }, "allow-unverified": { type: "boolean" } },
  remove: {},
  outdated: { check: { type: "boolean" }, source: { type: "string" } },
  // 관리 페이지 서버 · 화면 없이 쓰기(HK-17, 설계 06 §3.15)
  dashboard: {
    port: { type: "string" },
    open: { type: "boolean" },
    "read-only": { type: "boolean" },
    export: { type: "string" },
    all: { type: "boolean" },
    root: { type: "string" },
    workspace: { type: "string" },
  },
  status: {
    session: { type: "boolean" },
    intents: { type: "boolean" },
    intent: { type: "string" },
    issues: { type: "boolean" },
    issue: { type: "string" },
    area: { type: "string" },
    stage: { type: "string" },
    doc: { type: "string" },
    verify: { type: "boolean" },
    worktrees: { type: "boolean" },
    harness: { type: "boolean" },
    flow: { type: "string" },
    gate: { type: "string" },
    all: { type: "boolean" },
    ops: { type: "boolean" },
    burn: { type: "boolean" },
    days: { type: "string" },
  },
  projects: {},
  approve: { gate: { type: "string" }, phrase: { type: "string" }, "changes-requested": { type: "boolean" }, "rule-candidate": { type: "boolean" } },
  answer: { list: { type: "boolean" }, choice: { type: "string" }, text: { type: "string" }, by: { type: "string" } },
  mob: { attendees: { type: "string" }, timebox: { type: "string" } },
  review: { fix: { type: "boolean" }, "accept-risk": { type: "boolean" }, reason: { type: "string" } },
  sessions: { machine: { type: "boolean" } },
  dispatch: { to: { type: "string" }, kind: { type: "string" }, path: { type: "string", multiple: true }, text: { type: "string" }, via: { type: "string" } },
  units: {
    "add-dep": { type: "string", multiple: true },
    "remove-dep": { type: "string", multiple: true },
    split: { type: "string", multiple: true },
    merge: { type: "string", multiple: true },
    order: { type: "string" },
    reason: { type: "string" },
  },
  flow: { add: { type: "string" }, after: { type: "string" }, remove: { type: "string" } },
  quality: { findings: { type: "boolean" }, issue: { type: "string" }, severity: { type: "string" }, new: { type: "boolean" } },
  history: { q: { type: "string" }, session: { type: "string" }, role: { type: "string" } },
  // 스킬 목록 · 사용량(HK-18, 설계 07 §3.9 · 06 §3.18)
  skills: {
    stage: { type: "string" },
    harness: { type: "string" },
    conflicts: { type: "boolean" },
    errors: { type: "boolean" },
    all: { type: "boolean" },
    "no-user": { type: "boolean" },
    refresh: { type: "boolean" },
  },
  usage: { days: { type: "string" }, kit: { type: "boolean" }, now: { type: "boolean" }, sources: { type: "boolean" }, harness: { type: "string" } },
  // 확장 층(HK-14, 설계 04)
  pack: { dir: { type: "string" }, from: { type: "string", multiple: true }, "kit-range": { type: "string" } },
  local: {},
  // 외부 도구 모듈의 어댑터 · 체크포인트(HK-20, 설계 10 §3.2 · §3.3)
  sync: {
    intent: { type: "string" }, check: { type: "boolean" }, key: { type: "string" },
    // sync jira(설계 10 §3.4) · sync units(설계 10 §3.5)
    approvals: { type: "boolean" }, verify: { type: "boolean" }, issue: { type: "string" }, to: { type: "string" }, "mr-url": { type: "string" },
    unit: { type: "string", multiple: true }, adopt: { type: "boolean" },
  },
  checkpoints: { issue: { type: "string" } },
  // 설계 단계(HK-19, 설계 08)
  intake: { from: { type: "string" }, depth: { type: "string" }, title: { type: "string" }, kind: { type: "string" }, name: { type: "string" }, area: { type: "string" }, text: { type: "string" }, "text-file": { type: "string" }, attach: { type: "string", multiple: true }, link: { type: "string", multiple: true } },
};

/** 위치 인자(이름 · 하위 명령 · 키)를 받는 명령. 나머지는 위치 인자를 거부한다(대상 폴더는 --cwd). */
const POSITIONAL = new Set(["add", "remove", "projects", "approve", "answer", "review", "dispatch", "units", "flow", "pack", "local", "mob", "sync", "checkpoints"]);

export type Values = Record<string, string | boolean | string[] | undefined>;

export interface ParsedArgs {
  values: Values;
  positionals: string[];
}

export function parseCommandArgs(command: string, argv: string[]): ParsedArgs {
  const options = { ...COMMON, ...(COMMAND_OPTIONS[command] ?? {}) };
  try {
    const { values, positionals } = parseArgs({ args: argv, options, strict: true, allowPositionals: POSITIONAL.has(command) });
    return { values: values as Values, positionals };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    const name = /'(-[^']*)'/.exec(msg)?.[1] ?? "";
    if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") throw usageError(`${command}: 모르는 플래그 ${name}`, `harness-kit ${command} --help`);
    if (code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") throw usageError(`${command}: 위치 인자를 받지 않는다 ${name}`, "대상 폴더는 --cwd <폴더> 로 준다");
    if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") throw usageError(`${command}: 플래그 값이 틀렸다 ${name}`, msg);
    throw usageError(`${command}: ${msg}`);
  }
}

export function str(values: Values, key: string): string | undefined {
  const v = values[key];
  return typeof v === "string" ? v : undefined;
}

export function bool(values: Values, key: string): boolean {
  return values[key] === true;
}

export function list(values: Values, key: string): string[] {
  const v = values[key];
  return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
}
