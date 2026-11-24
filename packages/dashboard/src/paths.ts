/** 쓰기 허용 경로 · 경로 검사(설계 06 §3.6, DB-R8). 표 밖은 403 forbidden_path 다. */
import { forbiddenPath } from "./errors";

export type DocKind = "issue" | "intent" | "main";

export interface DocTarget {
  rel: string;
  kind: DocKind;
  /** 이슈 키 또는 Intent 키 */
  key: string | null;
  /** 새로 만들 수 있는 경로 */
  creatable: boolean;
}

const ISSUE_DOC = /^\.agents\/docs\/issues\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\/(requirements|design|tasks)\.md$/;
const INTENT_DOC = /^\.agents\/docs\/intents\/((?:[A-Z][A-Z0-9]{1,9})-[1-9][0-9]{0,5})-[^/]+\/(intent|current-state)\.md$/;
const PLANS = /^\.agents\/docs\/intents\/((?:[A-Z][A-Z0-9]{1,9})-[1-9][0-9]{0,5})-[^/]+\/plans\/(?:[^/]+\/)*[^/]+\.md$/;
const MAIN_DOCS: [RegExp, boolean][] = [
  [/^\.agents\/docs\/decisions\/[^/]+\.md$/, true],
  [/^\.agents\/docs\/ops\/records\/[^/]+\.md$/, true],
  [/^\.agents\/docs\/ops\/(?:[^/]+\/)*[^/]+\.md$/, false],
  [/^\.agents\/docs\/codebase\/[^/]+\.md$/, false],
  [/^\.agents\/docs\/rule-candidates\/[^/]+\.md$/, false],
];
/** 읽기(GET /docs · /raw): 문서 폴더 아래 Markdown 과 기능 문서 */
const READ_DOCS = [/^\.agents\/docs\/(?:[^/]+\/)*[^/]+\.md$/, /^docs\/(?:[^/]+\/)*[^/]+\.md$/];
const RAW = /^\.agents\/docs\/(?:[^/]+\/)*[^/]+\.(png|jpe?g|gif|webp|svg|html)$/i;

/** 06 §3.6 경로 검사 1단계. 통과하면 정규화한 상대 경로. */
export function checkRel(input: unknown): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 1024) throw forbiddenPath(String(input ?? ""));
  if (input.includes("\\") || input.includes("\u0000") || input.startsWith("/") || /^[a-zA-Z]:/.test(input)) throw forbiddenPath(input);
  const parts = input.split("/");
  for (const part of parts) if (part === "" || part === "." || part === ".." || part.toLowerCase() === ".git") throw forbiddenPath(input);
  return input;
}

/** PUT /docs 대상. 허용 표 밖이면 403. */
export function docTarget(input: unknown): DocTarget {
  const rel = checkRel(input);
  const issue = ISSUE_DOC.exec(rel);
  if (issue) return { rel, kind: "issue", key: issue[1] as string, creatable: false };
  const intent = INTENT_DOC.exec(rel);
  if (intent) return { rel, kind: "intent", key: intent[1] as string, creatable: false };
  const plans = PLANS.exec(rel);
  if (plans) return { rel, kind: "intent", key: plans[1] as string, creatable: true };
  for (const [re, creatable] of MAIN_DOCS) if (re.test(rel)) return { rel, kind: "main", key: null, creatable };
  throw forbiddenPath(rel);
}

/** 읽을 문서(GET /docs). 쓰기 대상이면 그 분류, 아니면 main 분류로 읽기만. */
export function readTarget(input: unknown): DocTarget & { writable: boolean } {
  const rel = checkRel(input);
  try {
    return { ...docTarget(rel), writable: true };
  } catch {
    if (!READ_DOCS.some((re) => re.test(rel))) throw forbiddenPath(rel);
    const issue = /^\.agents\/docs\/issues\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\//.exec(rel);
    if (issue) return { rel, kind: "issue", key: issue[1] as string, creatable: false, writable: false };
    const intent = /^\.agents\/docs\/intents\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\//.exec(rel);
    if (intent) return { rel, kind: "intent", key: intent[1] as string, creatable: false, writable: false };
    return { rel, kind: "main", key: null, creatable: false, writable: false };
  }
}

export function rawTarget(input: unknown): string {
  const rel = checkRel(input);
  if (!RAW.test(rel)) throw forbiddenPath(rel);
  return rel;
}

export function contentType(rel: string): string {
  const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", html: "text/html; charset=utf-8" };
  return map[ext] ?? "application/octet-stream";
}
