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
  },
  repair: { only: { type: "string" } },
  uninstall: { "keep-state": { type: "boolean" }, "keep-packs": { type: "boolean" } },
  add: {},
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
  approve: { gate: { type: "string" }, phrase: { type: "string" }, "changes-requested": { type: "boolean" }, "rule-candidate": { type: "boolean" }, "waive-rollback": { type: "string" } },
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
  // 배포 · 운영(HK-21, 설계 14)
  deploy: { env: { type: "string" }, tag: { type: "string" }, "require-approved": { type: "boolean" }, waive: { type: "string" }, "from-ci": { type: "string" }, from: { type: "string" }, record: { type: "string" }, "rollback-test": { type: "boolean" }, "to-sha": { type: "string" } },
  ops: { topic: { type: "string" }, from: { type: "string" }, to: { type: "string" } },
  metrics: { baseline: { type: "boolean" }, force: { type: "boolean" }, "verify-baseline": { type: "boolean" }, from: { type: "string" }, to: { type: "string" }, fill: { type: "string" }, "adopted-at": { type: "string" } },
  rules: { since: { type: "string" }, reason: { type: "string" } },
  // 설계 단계(HK-19, 설계 08)
  intake: { from: { type: "string" }, title: { type: "string" }, kind: { type: "string" }, name: { type: "string" }, area: { type: "string" }, text: { type: "string" }, "text-file": { type: "string" }, attach: { type: "string", multiple: true }, link: { type: "string", multiple: true } },
};

/** 위치 인자(이름 · 하위 명령 · 키)를 받는 명령. 나머지는 위치 인자를 거부한다(대상 폴더는 --cwd). */
const POSITIONAL = new Set(["add", "remove", "projects", "approve", "answer", "review", "dispatch", "units", "flow", "pack", "local", "mob", "deploy", "ops", "rules"]);

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
