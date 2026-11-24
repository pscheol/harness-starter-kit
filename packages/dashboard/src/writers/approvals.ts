/**
 * 승인 · 수정 요청 · 리뷰 판단 기록(설계 06 §3.7, DB-R11~R14 · R29, HK-23 design §2 · §3).
 * approvals.md 에 덧붙이기만 한다. 저장 · 승인은 세션에 아무것도 보내지 않는다(DB-R25) — 이 모듈은 dispatch 를 import 하지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { allowed, appendedText, approvalSha, approvalState, approversOf, groupOf, needOf, type NewEntry, parse as parseApprovals } from "../approvals";
import { ApiError, bad, notFound, readOnly } from "../errors";
import { appliedUnitsBytes, findIntent, proposalOf, readUnitsFile, type Change } from "../flow";
import { parseLoose, setField } from "../frontmatter";
import { ISSUE_GATES, type Project } from "../project";
import { parseQuestions } from "../questions";
import { riskOf } from "../readers/issues";
import { readSessions } from "../readers/sessions";
import { type Checkout, FOLDER, gitUser, resolveIntentCheckout, resolveIssueCheckout } from "../repo";
import { atomicWrite, ensureDir, gitOut, isObj, nowText, python, rel, sha256, ulid } from "../util";
import { approveBundle, BUNDLE_GATES, type BundleGate } from "./intent-gates";

export type Via = "dashboard" | "terminal";
const CLARIFY = "[NEEDS CLARIFICATION";
const LOG = ".agents/state/approvals-log.jsonl";
const LATER: Record<string, string> = { deploy: "HK-21" };
const DOC_FILES: Record<string, string> = { requirements: "requirements.md", design: "design.md", tasks: "tasks.md" };

/** 이슈 폴더 문서 머리 risk 중 가장 높은 값. */
function riskOfFolder(abs: string): string {
  const files: Record<string, Buffer | null> = {};
  for (const name of Object.values(DOC_FILES)) {
    try {
      files[name] = fs.readFileSync(path.join(abs, name));
    } catch {
      files[name] = null;
    }
  }
  return riskOf(files);
}

export function issueFolder(root: string, key: string): string {
  const dir = path.join(root, ".agents/docs/issues");
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    names = [];
  }
  const found = names.filter((n) => FOLDER.exec(n)?.[1] === key);
  if (found.length === 0) throw notFound(`이슈 폴더가 없습니다: ${key}`);
  if (found.length > 1) throw new ApiError(409, "ambiguous_branch", `같은 키의 이슈 폴더가 둘 이상입니다: ${found.join(", ")}`);
  return `.agents/docs/issues/${found[0]}`;
}

export interface Write {
  file: string;
  data: Buffer | null;
}

/** 파일들을 차례로 쓰고 하나라도 실패하면 앞 파일을 원래 바이트로 되돌린다(06 §3.7 9단계). */
export function writeAll(writes: Write[]): void {
  const done: { file: string; before: Buffer | null }[] = [];
  try {
    for (const w of writes) {
      let before: Buffer | null = null;
      try {
        before = fs.readFileSync(w.file);
      } catch {
        before = null;
      }
      if (w.data === null) fs.rmSync(w.file, { force: true });
      else atomicWrite(w.file, w.data);
      done.push({ file: w.file, before });
    }
  } catch (err) {
    for (const d of done.reverse()) {
      try {
        if (d.before === null) fs.rmSync(d.file, { force: true });
        else atomicWrite(d.file, d.before);
      } catch {
        // 되돌리기 실패는 아래 500 으로 알린다
      }
    }
    process.stderr.write(`승인 기록 쓰기 실패: ${err instanceof Error ? err.message : String(err)}\n`);
    throw new ApiError(500, "internal", "기록을 쓰지 못해 되돌렸습니다");
  }
}

export function appendLog(root: string, record: Record<string, unknown>): void {
  const file = path.join(root, LOG);
  ensureDir(path.dirname(file), 0o700);
  const ignore = path.join(path.dirname(file), ".gitignore");
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n", { mode: 0o600 });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

export async function approver(p: Project, co: Checkout, gate: string): Promise<{ email: string; name: string | null; group: string | null }> {
  const u = await gitUser(co.root, p.env);
  if (!u.email) throw new ApiError(403, "not_an_approver", "git config user.email 이 비었습니다 — 승인자는 이 체크아웃의 git 사용자입니다");
  const policy = p.policy();
  if (!allowed(u.email, gate, policy)) throw new ApiError(403, "not_an_approver", `${u.email} 은 ${gate} 게이트 승인자 목록(approvers.${gate})에 없습니다`, { approvers: (policy.approvers ?? {})[gate] ?? [] });
  return { email: u.email, name: u.name, group: groupOf(u.email, gate, policy) };
}

function phraseOf(body: Record<string, unknown>, field = "phrase"): string {
  const v = body[field];
  if (typeof v !== "string" || !v.trim()) throw bad(`${field} 가 비었습니다(승인할 때 남길 문구)`);
  return v.replace(/\s+/g, " ").trim().slice(0, 500);
}

/** 이슈 게이트 앞 조건(sdd_gates.py check --json 의 preconditions, HK-23 판정 원본). */
async function preconditions(p: Project, co: Checkout, key: string, gate: string): Promise<string[]> {
  const own = path.join(co.root, "scripts/harness/sdd_gates.py");
  const script = fs.existsSync(own) ? own : path.join(p.root, "scripts/harness/sdd_gates.py");
  const r = await python(co.root, p.env, [script, "check", key, "--json", "--root", co.root], 60_000);
  if (r.code !== 0) throw new ApiError(422, "gate_precondition", "게이트 조건을 판정하지 못했습니다", { reasons: [(r.stderr.trim().split("\n").pop() ?? "").slice(0, 300)] });
  const data = JSON.parse(r.stdout) as { gates: { gate: string; preconditions?: string[]; reasons: string[] }[] };
  const g = data.gates.find((x) => x.gate === gate);
  return g?.preconditions ?? g?.reasons ?? [];
}

async function aliveSessions(p: Project, key: string): Promise<string[]> {
  return (await readSessions(p)).filter((s) => s.issue === key && s.state !== "gone").map((s) => s.id);
}

export interface ApprovalResult {
  status: number;
  data: Record<string, unknown>;
}

export async function postApproval(p: Project, body: unknown, via: Via): Promise<ApprovalResult> {
  if (p.readOnly) throw readOnly();
  if (!isObj(body)) throw bad("본문이 객체가 아닙니다");
  const gate = typeof body.gate === "string" ? body.gate : "";
  const decision = body.decision === "changes-requested" ? "changes-requested" : body.decision === "approved" ? "approved" : null;
  if (!decision) throw bad("decision 은 approved 또는 changes-requested 다");
  if (!p.gates().includes(gate)) throw new ApiError(422, "gate_not_in_flow", `${gate} 는 flow.gates 에 없습니다`, { gates: p.gates() });
  if (Object.hasOwn(LATER, gate)) throw new ApiError(422, "gate_precondition", `${gate} 게이트 승인은 이 판에 없습니다(${LATER[gate]})`, { later: LATER[gate], reasons: [`${LATER[gate]} 에서 제공합니다`] });
  const phrase = phraseOf(body);
  const target = isObj(body.target) ? body.target : {};
  if (gate === "intent" || BUNDLE_GATES.includes(gate)) {
    if (typeof target.intent !== "string") throw bad(`${gate} 게이트는 target.intent 가 필요합니다`);
    if (gate !== "intent") return approveBundle(p, gate as BundleGate, target.intent, decision, phrase, body, via);
    return approveIntent(p, target.intent, decision, phrase, body, via);
  }
  if (!ISSUE_GATES.includes(gate)) throw new ApiError(422, "gate_not_in_flow", `모르는 게이트: ${gate}`);
  if (typeof target.issue !== "string") throw bad("target.issue 가 필요합니다");
  const key = target.issue;
  const co = await resolveIssueCheckout(p, key, null);
  const folder = issueFolder(co.root, key);
  const approvalsFile = path.join(co.root, folder, "approvals.md");
  const current = fs.existsSync(approvalsFile) ? fs.readFileSync(approvalsFile, "utf8") : null;
  const entries = current ? parseApprovals(current).entries : [];
  const writes: Write[] = [];
  let targetRef: NewEntry["target"];
  let statusChanged: string | null = null;
  if (Object.hasOwn(DOC_FILES, gate)) {
    const docFile = path.join(co.root, folder, DOC_FILES[gate] as string);
    if (!fs.existsSync(docFile)) throw notFound(`${DOC_FILES[gate]} 가 없습니다`);
    const bytes = fs.readFileSync(docFile);
    const text = bytes.toString("utf8");
    const fm = parseLoose(text) ?? {};
    const status = fm.status ?? null;
    const aSha = approvalSha(bytes);
    if (gate !== "tasks" && !["draft", "in-review", "approved"].includes(status ?? "")) throw new ApiError(422, "gate_precondition", `${DOC_FILES[gate]} 머리 status 가 ${status ?? "없음"} 입니다(draft · in-review 만 승인합니다)`, { reasons: [`status ${status ?? "없음"}`] });
    const need = needOf(p.meta(), riskOfFolder(path.join(co.root, folder)), gate);
    const state = approvalState(entries, gate, aSha, p.policy(), need);
    if (decision === "approved" && state === "valid") throw new ApiError(409, "already_approved", `${gate}: 같은 내용(sha ${aSha.slice(0, 12)})으로 승인한 기록이 있습니다`);
    const me = ((await gitUser(co.root, p.env)).email ?? "").toLowerCase();
    if (decision === "approved" && state === "partial" && me && approversOf(entries, gate, aSha).has(me)) throw new ApiError(409, "already_approved", `${gate}: 이미 승인했습니다 — risk: high 는 다른 승인자 한 명이 더 승인합니다(DS-R26)`, { need });
    if (decision === "approved" && text.includes(CLARIFY)) throw new ApiError(422, "needs_clarification", `${DOC_FILES[gate]} 에 [NEEDS CLARIFICATION 가 남았습니다`);
    if (body.docSha256 !== sha256(bytes)) throw new ApiError(409, "doc_changed", "승인 화면을 연 뒤 문서가 바뀌었습니다. 다시 읽고 승인합니다", { currentSha256: sha256(bytes) });
    targetRef = { name: DOC_FILES[gate] as string, sha256: aSha };
    if (decision === "approved" && status !== "approved" && gate !== "tasks") {
      writes.push({ file: docFile, data: Buffer.from(setField(text, "status", "approved"), "utf8") });
      statusChanged = `${status ?? "없음"}→approved`;
    }
  } else {
    const head = await gitOut(co.root, p.env, "rev-parse", "HEAD");
    targetRef = { name: co.branch ?? "HEAD", head: head || null };
  }
  if (decision === "approved") {
    const reasons = await preconditions(p, co, key, gate);
    if (reasons.length) throw new ApiError(422, "gate_precondition", `${gate} 게이트 조건이 맞지 않습니다`, { reasons });
  }
  const who = await approver(p, co, gate);
  const entry: NewEntry = { at: nowText(), gate, decision, approver: who, target: targetRef, phrase, path: via, entryId: ulid(), ruleCandidate: decision === "changes-requested" && body.ruleCandidate === true };
  writes.unshift({ file: approvalsFile, data: Buffer.from(appendedText(current, key, [entry]), "utf8") });
  writeAll(writes);
  appendLog(co.root, { entryId: entry.entryId, target: folder, gate, sha256: targetRef.sha256 ?? targetRef.head ?? null, at: entry.at, path: via });
  return {
    status: 201,
    data: { entryId: entry.entryId, approvals: `${folder}/approvals.md`, approver: who.email, group: who.group, statusChanged, sessions: await aliveSessions(p, key) },
  };
}

async function approveIntent(p: Project, key: string, decision: string, phrase: string, body: Record<string, unknown>, via: Via): Promise<ApprovalResult> {
  const co = await resolveIntentCheckout(p, key);
  const info = findIntent(co.root, key);
  const intentFile = path.join(info.abs, "intent.md");
  if (!fs.existsSync(intentFile)) throw notFound("intent.md 가 없습니다");
  const bytes = fs.readFileSync(intentFile);
  const text = bytes.toString("utf8");
  const status = parseLoose(text)?.status ?? null;
  const approvalsFile = path.join(info.abs, "approvals.md");
  const current = fs.existsSync(approvalsFile) ? fs.readFileSync(approvalsFile, "utf8") : null;
  const entries = current ? parseApprovals(current).entries : [];
  const aSha = approvalSha(bytes);
  if (!["draft", "in-review", "approved"].includes(status ?? "")) throw new ApiError(422, "gate_precondition", `intent.md 머리 status 가 ${status ?? "없음"} 입니다`, { reasons: [`status ${status ?? "없음"}`] });
  if (decision === "approved" && approvalState(entries, "intent", aSha, p.policy()) === "valid" && !proposalOf(info.abs)) throw new ApiError(409, "already_approved", "같은 내용으로 승인한 기록이 있습니다");
  if (decision === "approved" && text.includes(CLARIFY)) throw new ApiError(422, "needs_clarification", "intent.md 에 [NEEDS CLARIFICATION 가 남았습니다");
  if (body.docSha256 !== sha256(bytes)) throw new ApiError(409, "doc_changed", "승인 화면을 연 뒤 intent.md 가 바뀌었습니다", { currentSha256: sha256(bytes) });
  if (decision === "approved") {
    const reasons: string[] = [];
    try {
      const q = parseQuestions(fs.readFileSync(path.join(info.abs, "questions.md"), "utf8"));
      const open = q.questions.filter((x) => x.open && x.blocks === "intent");
      if (open.length) reasons.push(`막는 게이트가 intent 인 열린 질문 ${open.length}건(${open.map((x) => x.id).join(", ")})`);
    } catch {
      // 질문 파일 없음
    }
    const check = path.join(co.root, "scripts/harness/intent.py");
    if (fs.existsSync(check)) {
      const r = await python(co.root, p.env, [check, "check", info.abs, "--json"], 60_000);
      if (r.code !== 0) {
        let problems: string[] = [];
        try {
          problems = ((JSON.parse(r.stdout) as { problems?: string[] }).problems ?? []).slice(0, 10);
        } catch {
          problems = [(r.stderr.trim().split("\n").pop() ?? "intent.py check 실패").slice(0, 200)];
        }
        reasons.push(...problems.map((x) => `intent.py check: ${x}`));
      }
    }
    if (reasons.length) throw new ApiError(422, "gate_precondition", "intent 게이트 조건이 맞지 않습니다", { reasons });
  }
  const who = await approver(p, co, "intent");
  const writes: Write[] = [];
  const units = readUnitsFile(info.abs);
  let unitsBytes = units.raw;
  const proposal = proposalOf(info.abs);
  if (decision === "approved" && proposal) {
    if (!units.raw || !units.data || proposal.baseSha256 !== sha256(units.raw)) throw new ApiError(409, "proposal_stale", "제안을 만든 뒤 units.json 이 바뀌었습니다. 제안을 다시 저장하거나 버립니다");
    unitsBytes = appliedUnitsBytes(units.raw, units.data, units.units, (proposal.changes ?? []) as Change[]);
    writes.push({ file: path.join(info.abs, "units.json"), data: unitsBytes });
    writes.push({ file: path.join(info.abs, "units.proposed.json"), data: null });
  }
  let statusChanged: string | null = null;
  if (decision === "approved" && status !== "approved") {
    writes.push({ file: intentFile, data: Buffer.from(setField(text, "status", "approved"), "utf8") });
    statusChanged = `${status ?? "없음"}→approved`;
  }
  const at = nowText();
  const made: NewEntry[] = [{ at, gate: "intent", decision, approver: who, target: { name: "intent.md", sha256: aSha }, phrase, path: via, entryId: ulid(), ruleCandidate: decision === "changes-requested" && body.ruleCandidate === true }];
  if (unitsBytes) made.push({ at, gate: "intent", decision, approver: who, target: { name: "units.json", sha256: sha256(unitsBytes) }, phrase, path: via, entryId: ulid() });
  writes.unshift({ file: approvalsFile, data: Buffer.from(appendedText(current, key, made), "utf8") });
  writeAll(writes);
  for (const e of made) appendLog(co.root, { entryId: e.entryId, target: info.dir, gate: "intent", sha256: e.target.sha256 ?? null, at, path: via });
  return { status: 201, data: { entryId: (made[0] as NewEntry).entryId, approvals: `${info.dir}/approvals.md`, approver: who.email, group: who.group, statusChanged, sessions: [] } };
}

export async function reviewFinding(p: Project, key: string, findingId: string): Promise<{ co: Checkout; folder: string; fp: string; severity: string }> {
  const co = await resolveIssueCheckout(p, key, null);
  const folder = issueFolder(co.root, key);
  const own = path.join(co.root, "scripts/harness/review_state.py");
  const script = fs.existsSync(own) ? own : path.join(p.root, "scripts/harness/review_state.py");
  const r = await python(co.root, p.env, [script, path.join(co.root, folder), "--json"], 30_000);
  if (r.code === 2) throw notFound(`리뷰 보고서가 없습니다(.agents/reports/review/${key}.md)`);
  const data = JSON.parse(r.stdout) as { findings: { id: string; fp: string; severity: string }[] };
  const item = data.findings.find((f) => f.id === findingId);
  if (!item) throw notFound(`보고서에 ${findingId} 가 없습니다`);
  return { co, folder, fp: item.fp, severity: item.severity };
}

export async function postReviewDecision(p: Project, key: string, findingId: string, body: unknown, via: Via): Promise<ApprovalResult> {
  if (p.readOnly) throw readOnly();
  if (!isObj(body)) throw bad("본문이 객체가 아닙니다");
  if (!/^F-\d+$/.test(findingId)) throw bad("발견 ID 는 F-<n> 입니다");
  const decision = body.decision === "risk-accepted" || body.decision === "fix-required" ? body.decision : null;
  if (!decision) throw bad("decision 은 risk-accepted 또는 fix-required 다");
  const phrase = phraseOf(body);
  const found = await reviewFinding(p, key, findingId);
  const who = await approver(p, found.co, "mr");
  const approvalsFile = path.join(found.co.root, found.folder, "approvals.md");
  const current = fs.existsSync(approvalsFile) ? fs.readFileSync(approvalsFile, "utf8") : null;
  const entry: NewEntry = { at: nowText(), gate: `review/${findingId}`, decision, approver: who, target: { name: `.agents/reports/review/${key}.md`, fingerprint: found.fp }, phrase, path: via, entryId: ulid() };
  writeAll([{ file: approvalsFile, data: Buffer.from(appendedText(current, key, [entry]), "utf8") }]);
  appendLog(found.co.root, { entryId: entry.entryId, target: found.folder, gate: entry.gate, sha256: found.fp, at: entry.at, path: via });
  return { status: 201, data: { entryId: entry.entryId, approvals: `${found.folder}/approvals.md`, approver: who.email, group: who.group, statusChanged: null, sessions: await aliveSessions(p, key) } };
}

export { rel };
