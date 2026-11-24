/**
 * 승인 기록 `approvals.md` 파서 · 유효성 · 리뷰 판단 · 승인 sha · 기록 쓰기(설계 06 §3.3 · §3.7, HK-23 design §2).
 * 템플릿 scripts/harness/approvals.py 와 같은 결과를 낸다. 두 구현은 tests/fixtures/approvals/ 로 시험한다.
 * 이 형식을 바꾸면 Python 파서와 fixture 를 같이 고친다. 승인은 네 경로(terminal · dashboard · jira · aidlc)로만 생긴다.
 */
import { sha256 } from "./util";

const HEADING = /^## (\S+) · ([a-z]+(?:\/F-\d+)?) · (approved|changes-requested|risk-accepted|fix-required)$/;
const TITLE = /^# 승인 기록 — (\S+)\s*$/;
const FIELD = /^- ([^:]+):\s*([^\n]*?)\s*$/;
const TIME = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]{1,6})?(?:Z|([+-])([0-9]{2}):([0-9]{2}))$/;
const APPROVER = /^([^\s@()]+@[^\s@()]+)(?: \(([^()]*)\))?(?: · 그룹: (\S+))?$/;
const ENTRY_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TARGET_PARTS: [keyof Omit<Target, "name">, RegExp][] = [
  ["sha256", /^sha256: ([0-9a-f]{64})$/],
  ["fingerprint", /^지문: ([0-9a-f]{12,64})$/],
  ["head", /^head: ([0-9a-f]{7,40})$/],
];

export const PATHS = ["terminal", "dashboard", "jira", "aidlc"] as const;
export const DOC_GATES = ["codebase", "intent", "plans", "requirements", "design", "tasks", "deploy"];
export const GATES = ["codebase", "intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"];
const REVIEW_GATE = /^review\/(F-\d+)$/;
const GATE_DECISIONS = ["approved", "changes-requested"];
const REVIEW_DECISIONS = ["risk-accepted", "fix-required"];
const FIELDS: Record<string, keyof Entry> = {
  승인자: "approver", 대상: "target", 문구: "phrase", 경로: "path", "기록 ID": "entryId",
  근거: "evidence", source: "source", "규칙 후보": "ruleCandidate", "롤백 면제": "rollbackWaiver",
};
export const FORMAT_NOTE = "<!-- 덧붙이기만 한다. 에이전트는 이 파일을 쓰지 않는다. 형식과 승인 경로: .agents/rules/approval-vocabulary.md -->";

export interface Approver {
  email: string;
  name: string | null;
  group: string | null;
}
export interface Target {
  name: string;
  sha256: string | null;
  fingerprint: string | null;
  head: string | null;
}
export interface Entry {
  line: number;
  at: string;
  gate: string;
  decision: string;
  approver: Approver | null;
  target: Target | null;
  phrase: string | null;
  path: string | null;
  entryId: string | null;
  source: string | null;
  evidence: string | null;
  ruleCandidate: boolean;
  rollbackWaiver: string | null;
  errors: string[];
  valid: boolean;
}
export interface Parsed {
  key: string | null;
  entries: Entry[];
  errors: { line: number; code: string }[];
}
export interface Policy {
  approvers?: Record<string, string[]> | null;
  groups?: Record<string, string[]> | null;
}

function newEntry(line: number, at: string, gate: string, decision: string): Entry {
  return { line, at, gate, decision, approver: null, target: null, phrase: null, path: null, entryId: null, source: null, evidence: null, ruleCandidate: false, rollbackWaiver: null, errors: [], valid: true };
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** ISO 8601 + 시간대 필수, 실제 날짜 · 시각 · 시간대(±24시간 미만)인가(Python datetime.fromisoformat 과 같은 판정). */
export function validTime(value: string): boolean {
  const m = TIME.exec(value);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  if (y < 1 || mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const max = mo === 2 && leap ? 29 : (DAYS[mo - 1] as number);
  if (d < 1 || d > max) return false;
  if (m[7]) {
    const oh = Number(m[8]);
    const om = Number(m[9]);
    if (om > 59 || oh * 60 + om >= 24 * 60) return false;
  }
  return true;
}

function parseTarget(value: string): Target | null {
  const parts = value.split(" · ");
  if (!parts[0]) return null;
  const target: Target = { name: parts[0], sha256: null, fingerprint: null, head: null };
  for (const part of parts.slice(1)) {
    let matched = false;
    for (const [key, re] of TARGET_PARTS) {
      const m = re.exec(part);
      if (m && target[key] === null) {
        target[key] = m[1] as string;
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }
  return target;
}

function unquote(value: string): string {
  return value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"' ? value.slice(1, -1) : value;
}

function setField(entry: Entry, seen: Set<string>, name: string, value: string): string[] {
  const key = Object.hasOwn(FIELDS, name) ? FIELDS[name] : undefined;
  if (key === undefined) return ["unknown-field"];
  if (seen.has(key)) return ["duplicate-field"];
  seen.add(key);
  if (key === "approver") {
    const m = APPROVER.exec(value);
    if (!m) return ["bad-approver"];
    entry.approver = { email: m[1] as string, name: m[2] ?? null, group: m[3] ?? null };
  } else if (key === "target") {
    entry.target = parseTarget(value);
    return entry.target ? [] : ["bad-target"];
  } else if (key === "phrase") {
    entry.phrase = unquote(value);
  } else if (key === "ruleCandidate") {
    if (value !== "예") return ["bad-rule-candidate"];
    entry.ruleCandidate = true;
  } else {
    (entry as unknown as Record<string, unknown>)[key] = value;
  }
  return [];
}

function gateErrors(entry: Entry): string[] {
  const errors: string[] = [];
  if (!validTime(entry.at)) errors.push("bad-time");
  const review = REVIEW_GATE.test(entry.gate);
  if (!review && !GATES.includes(entry.gate)) errors.push("unknown-gate");
  const allowed = review ? REVIEW_DECISIONS : GATE_DECISIONS;
  if ((GATES.includes(entry.gate) || review) && !allowed.includes(entry.decision)) errors.push("decision-mismatch");
  return errors;
}

function requiredErrors(entry: Entry, seen: Set<string>): string[] {
  const errors: string[] = [];
  const p = entry.path;
  if (!seen.has("approver")) errors.push("missing-approver");
  if (!seen.has("target")) errors.push("missing-target");
  else if (entry.target) {
    if (DOC_GATES.includes(entry.gate) && !entry.target.sha256) errors.push("bad-target");
    if (REVIEW_GATE.test(entry.gate) && !entry.target.fingerprint) errors.push("bad-target");
  }
  if (!seen.has("path") || !p) errors.push("missing-path");
  else if (!(PATHS as readonly string[]).includes(p)) errors.push("unknown-path");
  if ((p === "terminal" || p === "dashboard") && !entry.phrase) errors.push("missing-phrase");
  if ((p === "jira" || p === "aidlc") && !entry.evidence) errors.push("missing-evidence");
  if (p === "aidlc" && entry.source !== "aidlc") errors.push("missing-source");
  if (!seen.has("entryId") || !entry.entryId) errors.push("missing-entry-id");
  else if (!ENTRY_ID.test(entry.entryId)) errors.push("bad-entry-id");
  if (seen.has("ruleCandidate") && entry.decision !== "changes-requested") errors.push("field-not-allowed");
  if (seen.has("rollbackWaiver") && entry.gate !== "deploy") errors.push("field-not-allowed");
  return errors;
}

function finish(entry: Entry, seen: Set<string>, errors: string[], ids: Set<string>): Entry {
  const all = [...errors, ...gateErrors(entry), ...requiredErrors(entry, seen)];
  if (entry.entryId && ENTRY_ID.test(entry.entryId)) {
    if (ids.has(entry.entryId)) all.push("duplicate-entry-id");
    ids.add(entry.entryId);
  }
  entry.errors = [...new Set(all)].sort();
  entry.valid = entry.errors.length === 0;
  return entry;
}

/** `{key, entries, errors}`. 기록 오류는 기록의 errors · valid: false, 맞지 않는 제목 줄은 파일 errors. */
export function parse(text: string | Buffer | Uint8Array): Parsed {
  const src = typeof text === "string" ? text : Buffer.from(text).toString("utf8");
  let key: string | null = null;
  const entries: Entry[] = [];
  const fileErrors: { line: number; code: string }[] = [];
  const ids = new Set<string>();
  let current: Entry | null = null;
  let seen = new Set<string>();
  let errors: string[] = [];
  let skipping = false;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] as string;
    const number = i + 1;
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("## ")) {
      if (current) entries.push(finish(current, seen, errors, ids));
      current = null;
      seen = new Set();
      errors = [];
      const m = HEADING.exec(line);
      if (!m) {
        fileErrors.push({ line: number, code: "bad-heading" });
        skipping = true;
        continue;
      }
      skipping = false;
      current = newEntry(number, m[1] as string, m[2] as string, m[3] as string);
      continue;
    }
    if (current === null) {
      const t = TITLE.exec(line);
      if (t && key === null && entries.length === 0 && !skipping) key = t[1] as string;
      continue;
    }
    if (!line.trim() || line.trimStart().startsWith("<!--")) continue;
    const f = FIELD.exec(line);
    if (!f) {
      errors.push("stray-line");
      continue;
    }
    errors.push(...setField(current, seen, (f[1] as string).trim(), f[2] as string));
  }
  if (current) entries.push(finish(current, seen, errors, ids));
  return { key, entries, errors: fileErrors };
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

/** approvers[gate](이메일 또는 그룹 이름)에 있는가. 설정이 없거나 그 게이트 칸이 비면 누구나 된다(설계 README §5). */
export function allowed(email: string | null | undefined, gate: string, policy: Policy | null | undefined): boolean {
  const approvers = policy?.approvers ?? {};
  const names = Object.hasOwn(approvers, gate) ? approvers[gate] : undefined;
  if (!names || names.length === 0) return true;
  const groups = policy?.groups ?? {};
  const wanted = (email ?? "").toLowerCase();
  for (const name of names) {
    if (name.includes("@")) {
      if (name.toLowerCase() === wanted) return true;
    } else {
      const members = (Object.hasOwn(groups, name) ? groups[name] : undefined) ?? [];
      if (members.some((m) => m.toLowerCase() === wanted)) return true;
    }
  }
  return false;
}

/** 처음 맞은 그룹 이름(approvers[gate] 순서). 없으면 null. */
export function groupOf(email: string, gate: string, policy: Policy | null | undefined): string | null {
  const approvers = policy?.approvers ?? {};
  const groups = policy?.groups ?? {};
  for (const item of (Object.hasOwn(approvers, gate) ? approvers[gate] : undefined) ?? []) {
    if (item.includes("@")) continue;
    const members = (Object.hasOwn(groups, item) ? groups[item] : undefined) ?? [];
    if (members.some((m) => m.toLowerCase() === email.toLowerCase())) return item;
  }
  return null;
}

export type ApprovalState = "none" | "valid" | "stale" | "invalid";

/** 설계 06 §3.3: none · valid(sha 같음) · stale(승인 뒤 바뀜) · invalid(승인자가 approvers 밖). */
export function approvalState(entries: Entry[], gate: string, sha: string | null = null, policy: Policy | null = null): ApprovalState {
  let found = entries.filter((e) => e.valid && e.gate === gate && e.decision === "approved");
  if (found.length === 0) return "none";
  if (sha !== null && sha !== undefined) {
    found = found.filter((e) => e.target && e.target.sha256 === sha);
    if (found.length === 0) return "stale";
  }
  return found.some((e) => allowed(e.approver?.email, gate, policy)) ? "valid" : "invalid";
}

/** 리뷰 지적 하나의 마지막 유효 판단(risk-accepted · fix-required). 승인자는 approvers.mr 로 본다. */
export function reviewDecision(entries: Entry[], findingId: string, fingerprint: string | null, policy: Policy | null = null): string | null {
  let decision: string | null = null;
  for (const e of entries) {
    if (!e.valid || e.gate !== `review/${findingId}`) continue;
    const recorded = e.target?.fingerprint ?? "";
    if (!recorded || !(fingerprint ?? "").startsWith(recorded)) continue;
    if (allowed(e.approver?.email, "mr", policy)) decision = e.decision;
  }
  return decision;
}

/** bytes.splitlines(keepends=True): \r\n · \n · \r 에서 자른다. */
function splitKeep(data: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < data.length; i += 1) {
    const c = data[i];
    if (c === 0x0a || c === 0x0d) {
      const end = c === 0x0d && data[i + 1] === 0x0a ? i + 2 : i + 1;
      out.push(data.subarray(start, end));
      start = end;
      i = end - 1;
    }
  }
  if (start < data.length) out.push(data.subarray(start));
  return out;
}

function bare(line: Buffer): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === 0x0a || line[end - 1] === 0x0d)) end -= 1;
  return line.subarray(0, end).toString("latin1");
}

/** 승인 sha: 문서 머리(첫 줄 `---` 부터 다음 `---` 까지)의 `status:` · `state:` 줄을 뺀 바이트의 sha256. */
export function approvalSha(input: string | Buffer | Uint8Array): string {
  const data = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const lines = splitKeep(data);
  if (lines.length === 0 || bare(lines[0] as Buffer) !== "---") return sha256(data);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (bare(lines[i] as Buffer) === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return sha256(data);
  const kept = lines.filter((l, i) => !(i > 0 && i < end && /^(status|state):/.test(l.toString("latin1"))));
  return sha256(Buffer.concat(kept));
}

// ── 쓰기 ─────────────────────────────────────────────────────────────────────

export function newFileText(key: string): string {
  return `# 승인 기록 — ${key}\n\n${FORMAT_NOTE}\n`;
}

export interface NewEntry {
  at: string;
  gate: string;
  decision: string;
  approver: { email: string; name?: string | null; group?: string | null };
  target: { name: string; sha256?: string | null; fingerprint?: string | null; head?: string | null };
  phrase?: string | null;
  path: string;
  entryId: string;
  ruleCandidate?: boolean;
  rollbackWaiver?: string | null;
}

export function renderEntry(entry: NewEntry): string {
  const a = entry.approver;
  const who = a.email + (a.name ? ` (${a.name})` : "") + (a.group ? ` · 그룹: ${a.group}` : "");
  const t = entry.target;
  const parts = [t.name];
  if (t.sha256) parts.push(`sha256: ${t.sha256}`);
  if (t.fingerprint) parts.push(`지문: ${t.fingerprint}`);
  if (t.head) parts.push(`head: ${t.head}`);
  const phrase = String(entry.phrase ?? "").split(/\s+/).filter(Boolean).join(" ");
  const lines = [`## ${entry.at} · ${entry.gate} · ${entry.decision}`, `- 승인자: ${who}`, `- 대상: ${parts.join(" · ")}`];
  if (phrase) lines.push(`- 문구: "${phrase}"`);
  lines.push(`- 경로: ${entry.path}`);
  if (entry.ruleCandidate) lines.push("- 규칙 후보: 예");
  if (entry.rollbackWaiver) lines.push(`- 롤백 면제: ${entry.rollbackWaiver}`);
  lines.push(`- 기록 ID: ${entry.entryId}`);
  return `${lines.join("\n")}\n`;
}

/** 지금 내용 뒤에 기록을 덧붙인 내용. 파일이 없으면 머리를 만든다. 기존 바이트는 그대로 둔다. */
export function appendedText(current: string | null, key: string, entries: NewEntry[]): string {
  let text = current ?? newFileText(key);
  if (text && !text.endsWith("\n")) text += "\n";
  for (const e of entries) text += `\n${renderEntry(e)}`;
  return text;
}

export function policyOf(meta: Record<string, unknown> | null | undefined): Policy {
  const m = meta ?? {};
  const pick = (v: unknown): Record<string, string[]> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string[]> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (Array.isArray(x)) out[k] = x.filter((s): s is string => typeof s === "string");
    return out;
  };
  return { approvers: pick(m.approvers), groups: pick(m.groups) };
}
