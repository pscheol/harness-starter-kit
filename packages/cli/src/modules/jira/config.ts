/**
 * jira-workflow 설정 읽기(설계 10 §3.4). `.agents/issue-tracker.yml` v2.
 * 값이 `TBD` 이거나 비면 null 이다. 토큰은 환경 변수 이름만 적히고 값은 여기서 읽지 않는다(rest.ts 가 env 에서 읽는다).
 */
import fs from "node:fs";
import path from "node:path";
import { parseYaml } from "../../../../dashboard/src/yaml-lite";
import { BOARD_STATES } from "../../../../dashboard/src/board-status";
import { CliError, EXIT } from "../../core/errors";

export const TRACKER_FILE = ".agents/issue-tracker.yml";

export interface TrackerConfig {
  baseUrl: string | null;
  projectKey: string | null;
  issueKeyPattern: string | null;
  /** 킷 단계 id → Jira 상태 ID */
  statusMap: Record<string, string>;
  /** "from>to" → 게이트 이름. 사람만 하는 전이 */
  approvalTransitions: Record<string, string>;
  issueTypes: Record<string, string>;
  groupMap: Record<string, string>;
  sync: { method: "rest" | "mcp" | "none"; mcpServer: string | null; restTokenEnv: string | null; restUserEnv: string | null };
  maxStatus: string;
  /** TBD 가 남은 키(진단용) */
  missing: string[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 문자열이고 TBD 가 아니면 값, 아니면 null. 숫자 ID 는 문자열로 바꾼다. */
function text(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t === "TBD" ? null : t;
}

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    const t = text(x);
    if (t !== null) out[k] = t;
  }
  return out;
}

export function readTracker(root: string): TrackerConfig | null {
  const file = path.join(root, TRACKER_FILE);
  if (!fs.existsSync(file)) return null;
  let doc: Record<string, unknown>;
  try {
    // 주석만 있는 줄은 yaml-lite 가 들여쓰기 판정에 쓰지 않도록 미리 뺀다
    doc = parseYaml(fs.readFileSync(file, "utf8").split("\n").filter((l) => !/^\s*#/.test(l) && l.trim() !== "").join("\n"));
  } catch (err) {
    throw new CliError(EXIT.STATE, `${TRACKER_FILE} 를 읽지 못했다: ${err instanceof Error ? err.message : String(err)}`, "hx-jira-setup 스킬로 다시 채운다");
  }
  const sync = isObj(doc.sync) ? doc.sync : {};
  const access = isObj(doc.access) ? doc.access : {};
  const rawMethod = text(sync.method) ?? text(access.method);
  const method = rawMethod === "rest" || rawMethod === "mcp" ? rawMethod : "none";
  const boundary = isObj(doc.agentBoundary) ? doc.agentBoundary : {};
  const statusMap = stringMap(doc.statusMap);
  const missing = BOARD_STATES.map((s) => s.id).filter((id) => !(id in statusMap));
  const cfg: TrackerConfig = {
    baseUrl: text(doc.baseUrl),
    projectKey: text(doc.projectKey),
    issueKeyPattern: text(doc.issueKeyPattern),
    statusMap,
    approvalTransitions: stringMap(doc.approvalTransitions),
    issueTypes: stringMap(doc.issueTypes),
    groupMap: stringMap(doc.groupMap),
    sync: { method, mcpServer: text(sync.mcpServer) ?? text(access.mcpServer), restTokenEnv: text(sync.restTokenEnv) ?? text(access.restTokenEnv), restUserEnv: text(sync.restUserEnv) ?? text(access.restUserEnv) },
    maxStatus: text(boundary.maxStatus) ?? "verifying",
    missing,
  };
  if (!cfg.baseUrl) cfg.missing.unshift("baseUrl");
  return cfg;
}

/** 이슈 키가 이 프로젝트의 Jira 키 꼴인가. 패턴이 TBD 면 프로젝트 키, 그것도 없으면 일반 꼴. */
export function keyMatcher(cfg: TrackerConfig): RegExp {
  if (cfg.issueKeyPattern) {
    try {
      return new RegExp(`^(?:${cfg.issueKeyPattern})$`);
    } catch {
      // 틀린 패턴은 아래 기본으로
    }
  }
  if (cfg.projectKey && /^[A-Z][A-Z0-9_]*$/.test(cfg.projectKey)) return new RegExp(`^${cfg.projectKey}-\\d+$`);
  return /^[A-Z][A-Z0-9_]+-\d+$/;
}

/** 켠 모듈인가: harness-kit.json 의 modules 에 있다. */
export function moduleEnabled(root: string, id: string): boolean {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(root, ".agents/harness-kit.json"), "utf8")) as { modules?: unknown };
    return Array.isArray(meta.modules) && meta.modules.includes(id);
  } catch {
    return false;
  }
}
