/**
 * Intent 폴더 게이트 codebase · plans 의 승인(설계 08 §3.6 · §3.13, 06 §3.7, HK-19 design §5 · §7).
 * 대상 파일과 앞 조건은 scripts/harness/intent_gate.py 가 정한다(판정 원본은 Python 하나). 파일마다 기록 한 줄을 남긴다.
 * 승인은 세션에 아무것도 보내지 않는다(DB-R25).
 */
import fs from "node:fs";
import path from "node:path";
import { appendedText, approvalSha, approvalState, type NewEntry, parse as parseApprovals } from "../approvals";
import { ApiError, readOnly } from "../errors";
import { setField } from "../frontmatter";
import type { Project } from "../project";
import { type Checkout, resolveIntentCheckout } from "../repo";
import { nowText, python, sha256, ulid } from "../util";
import { appendLog, approver, type ApprovalResult, type Via, type Write, writeAll } from "./approvals";
import { hasClarify } from "../clarify";

export type BundleGate = "codebase" | "plans";
export const BUNDLE_GATES: readonly string[] = ["codebase", "plans"];
const STATUSES = ["draft", "in-review", "approved"];

interface GateInfo {
  gate: BundleGate;
  folder: string;
  files: { name: string; path: string }[];
  reasons: string[];
  stale: Record<string, unknown>[];
}

export interface BundleFile {
  name: string;
  path: string;
  sha256: string;
  approvalSha256: string;
}

async function gateInfo(p: Project, root: string, key: string, gate: BundleGate): Promise<GateInfo> {
  const own = path.join(root, "scripts/harness/intent_gate.py");
  const script = fs.existsSync(own) ? own : path.join(p.root, "scripts/harness/intent_gate.py");
  const r = await python(root, p.env, [script, key, gate, "--json"], 120_000);
  try {
    return JSON.parse(r.stdout) as GateInfo;
  } catch {
    throw new ApiError(422, "gate_precondition", `${gate} 게이트 조건을 판정하지 못했습니다`, { reasons: [(r.stderr.trim().split("\n").pop() ?? "").slice(0, 300)] });
  }
}

/** 머리 한 키의 값(current-state.md 의 `models:` 여러 줄 목록은 TS 파서가 읽지 않으므로 줄 단위로 본다). */
function headValue(text: string, key: string): string | null {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  if (lines[0] !== "---") return null;
  for (let i = 1; i < lines.length && lines[i] !== "---"; i += 1) {
    const m = new RegExp(`^${key}:\\s*(.*?)\\s*(?:#.*)?$`).exec(lines[i] as string);
    if (m) return (m[1] as string).replace(/^["']|["']$/g, "") || null;
  }
  return null;
}

/** 묶음 sha: 파일마다 `<경로>\t<sha256>` 줄(경로 순)의 sha256. 화면을 연 뒤 대상 파일이 하나라도 바뀌면 달라진다. */
export function bundleSha(files: { path: string; sha256: string }[]): string {
  const lines = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((f) => `${f.path}\t${f.sha256}\n`);
  return sha256(lines.join(""));
}

async function bundleOf(p: Project, key: string, gate: BundleGate): Promise<{ co: Checkout; info: GateInfo; files: BundleFile[]; sha256: string }> {
  const co = await resolveIntentCheckout(p, key);
  const info = await gateInfo(p, co.root, key, gate);
  const files = info.files.map((f) => {
    const bytes = fs.readFileSync(path.join(co.root, f.path));
    return { name: f.name, path: f.path, sha256: sha256(bytes), approvalSha256: approvalSha(bytes) };
  });
  return { co, info, files, sha256: bundleSha(files) };
}

/** GET /intents/{key}/gates/{gate}: 승인 화면 · knots-sync approve 가 먼저 읽는다(대상 파일 · 묶음 sha · 앞 조건). */
export async function getGateBundle(p: Project, key: string, gate: string): Promise<Record<string, unknown>> {
  if (!BUNDLE_GATES.includes(gate)) throw new ApiError(404, "not_found", `묶음 승인 게이트가 아닙니다: ${gate}(codebase · plans)`);
  const b = await bundleOf(p, key, gate as BundleGate);
  return { intent: key, gate, folder: b.info.folder, files: b.files, sha256: b.sha256, reasons: b.info.reasons, stale: b.info.stale };
}

export async function approveBundle(p: Project, gate: BundleGate, key: string, decision: string, phrase: string, body: Record<string, unknown>, via: Via): Promise<ApprovalResult> {
  if (p.readOnly) throw readOnly();
  const { co, info, files, sha256: bundle } = await bundleOf(p, key, gate);
  if (!files.length) throw new ApiError(422, "gate_precondition", `${gate} 게이트 대상 파일이 없습니다`, { reasons: info.reasons });
  if (body.docSha256 !== bundle) throw new ApiError(409, "doc_changed", "승인 화면을 연 뒤 대상 파일이 바뀌었습니다. 다시 읽고 승인합니다", { currentSha256: bundle });
  const approvalsFile = path.join(co.root, info.folder, "approvals.md");
  const current = fs.existsSync(approvalsFile) ? fs.readFileSync(approvalsFile, "utf8") : null;
  const entries = current ? parseApprovals(current).entries : [];
  const first = files[0] as BundleFile;
  const firstText = fs.readFileSync(path.join(co.root, first.path), "utf8");
  const status = gate === "codebase" ? headValue(firstText, "status") : null;
  if (gate === "codebase" && !STATUSES.includes(status ?? "")) throw new ApiError(422, "gate_precondition", `current-state.md 머리 status 가 ${status ?? "없음"} 입니다`, { reasons: [`status ${status ?? "없음"}`] });
  if (decision === "approved") {
    if (files.every((f) => approvalState(entries, gate, f.approvalSha256, p.policy()) === "valid")) throw new ApiError(409, "already_approved", "같은 내용으로 승인한 기록이 있습니다");
    const unclear = files.filter((f) => f.path.endsWith(".md") && hasClarify(fs.readFileSync(path.join(co.root, f.path), "utf8")));
    if (unclear.length) throw new ApiError(422, "needs_clarification", `${unclear.map((f) => f.name).join(", ")} 에 [NEEDS CLARIFICATION 가 남았습니다`);
    if (info.stale.length) throw new ApiError(422, "model_stale", "역공학 문서가 오래됐습니다 — /kns-intent 가 codebase_scan.py 로 갱신한 뒤 승인합니다", { stale: info.stale });
    if (info.reasons.length) throw new ApiError(422, "gate_precondition", `${gate} 게이트 조건이 맞지 않습니다`, { reasons: info.reasons });
  }
  const who = await approver(p, co, gate);
  const at = nowText();
  const made: NewEntry[] = files.map((f, i) => ({
    at, gate, decision, approver: who, target: { name: f.name, sha256: f.approvalSha256 }, phrase, path: via, entryId: ulid(),
    ruleCandidate: i === 0 && decision === "changes-requested" && body.ruleCandidate === true,
  }));
  const writes: Write[] = [{ file: approvalsFile, data: Buffer.from(appendedText(current, key, made), "utf8") }];
  let statusChanged: string | null = null;
  if (gate === "codebase" && decision === "approved" && status !== "approved") {
    writes.push({ file: path.join(co.root, first.path), data: Buffer.from(setField(firstText, "status", "approved"), "utf8") });
    statusChanged = `${status ?? "없음"}→approved`;
  }
  writeAll(writes);
  for (const e of made) appendLog(co.root, { entryId: e.entryId, target: info.folder, gate, sha256: e.target.sha256 ?? null, at, path: via });
  return { status: 201, data: { entryId: (made[0] as NewEntry).entryId, approvals: `${info.folder}/approvals.md`, approver: who.email, group: who.group, statusChanged, files: files.map((f) => f.name), sessions: [] } };
}
