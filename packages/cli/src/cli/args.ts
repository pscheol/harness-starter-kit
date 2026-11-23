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
};

export type Values = Record<string, string | boolean | string[] | undefined>;

export function parseCommandArgs(command: string, argv: string[]): Values {
  const options = { ...COMMON, ...(COMMAND_OPTIONS[command] ?? {}) };
  try {
    const { values } = parseArgs({ args: argv, options, strict: true, allowPositionals: false });
    return values as Values;
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
