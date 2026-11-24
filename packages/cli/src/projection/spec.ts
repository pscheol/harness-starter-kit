/**
 * 배치 상수 파일 `common/scripts/harness/projection.json`(HK-13 design §3.4).
 * Python 은 설치된 판(scripts/harness/projection.json)을, CLI 는 템플릿 판을 읽는다. 둘은 같은 파일이다.
 * 사람 세션의 모델 키(12 §3.1)가 설정 조각에 있으면 거부한다.
 */
import fs from "node:fs";
import path from "node:path";
import { CliError, EXIT } from "../core/errors";
import type { HookMap } from "./hooks";

export const SPEC_REL = "common/scripts/harness/projection.json";
export const SPEC_SCHEMA = "knots-sync.projection/v1";

/** 설정 병합에 넣는 훅 하나(hooks.json 에서 만든다, HK-24). */
export interface HookSpec {
  id: string;
  event: string;
  matcher?: string;
  script?: string;
  hook: Record<string, unknown>;
}

export interface ProjectionSpec {
  schema: string;
  claudeBlock: string[];
  claudeSettings: { deny: string[] } & Record<string, unknown>;
  hookMap: HookMap;
  codexConfig: { header: string[]; defaults: { table: string; key: string; line: string }[]; tables: { table: string; lines: string[] }[] };
  gitattributes: Record<string, string[]>;
  readOnlyLine: string;
  /** Kiro 조율 에이전트 본문(토큰 치환 전). hooks 는 hooks.json 에서 붙인다(HK-24) */
  kiroCoordinator: Record<string, unknown>;
}

const FORBIDDEN_CLAUDE = new Set(["model", "effortLevel", "modelSettings", "maxEffortLevel", "fallbackModel", "availableModels", "advisorModel"]);
const FORBIDDEN_ENV = new Set(["ANTHROPIC_MODEL", "CLAUDE_CODE_EFFORT_LEVEL", "MAX_THINKING_TOKENS", "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "CLAUDE_CODE_SUBAGENT_EFFORT"]);
const FORBIDDEN_CODEX = new Set(["model", "model_reasoning_effort", "model_reasoning_summary", "model_verbosity", "model_provider", "profile", "profiles", "default_subagent_model", "default_subagent_reasoning_effort"]);

function bad(message: string): CliError {
  return new CliError(EXIT.ENV, `projection.json: ${message}`, "킷 템플릿을 다시 받는다");
}

function walk(v: unknown, at: string): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${at}[${i}]`));
    return;
  }
  if (v === null || typeof v !== "object") return;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (FORBIDDEN_CLAUDE.has(k) && !at.endsWith(".hook")) throw bad(`${at}.${k}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)`);
    if (at.endsWith(".env") && (FORBIDDEN_ENV.has(k) || (k.startsWith("ANTHROPIC_DEFAULT_") && k.endsWith("_MODEL")))) throw bad(`${at}.${k}: 사람 세션의 모델 환경변수를 쓰지 않는다(12 §3.1)`);
    walk(x, `${at}.${k}`);
  }
}

export function parseSpec(text: string): ProjectionSpec {
  let raw: Record<string, any>;
  try {
    raw = JSON.parse(text) as Record<string, any>;
  } catch (err) {
    throw bad(err instanceof Error ? err.message : String(err));
  }
  if (raw.schema !== SPEC_SCHEMA) throw bad(`모르는 schema ${String(raw.schema)}`);
  const cs = (raw.claudeSettings ?? {}) as Record<string, unknown>;
  walk(Object.fromEntries(Object.entries(cs).filter(([k]) => k !== "hooks")), "claudeSettings");
  const cc = (raw.codexConfig ?? {}) as ProjectionSpec["codexConfig"];
  for (const d of cc.defaults ?? []) {
    if (FORBIDDEN_CODEX.has(d.key) || FORBIDDEN_CODEX.has(d.table)) throw bad(`codexConfig ${d.table}.${d.key}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)`);
  }
  for (const t of cc.tables ?? []) {
    const names = [t.table, ...(t.lines ?? []).filter((l) => l.includes("=")).map((l) => l.slice(0, l.indexOf("=")).trim())];
    if (names.some((n) => FORBIDDEN_CODEX.has(n) || n.startsWith("profiles"))) throw bad(`codexConfig ${t.table}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)`);
  }
  return raw as ProjectionSpec;
}

/** 템플릿 폴더의 projection.json. 없으면 null(배치를 모르는 옛 킷 — 배치 항목은 건드리지 않는다). */
export function loadSpecOrNull(templatesDir: string): ProjectionSpec | null {
  const file = path.join(templatesDir, ...SPEC_REL.split("/"));
  if (!fs.existsSync(file)) return null;
  return parseSpec(fs.readFileSync(file, "utf8"));
}

export function loadSpec(templatesDir: string): ProjectionSpec {
  const spec = loadSpecOrNull(templatesDir);
  if (!spec) throw bad(`없다: ${path.join(templatesDir, SPEC_REL)}`);
  return spec;
}
