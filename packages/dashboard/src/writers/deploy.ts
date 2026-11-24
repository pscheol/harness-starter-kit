/**
 * `deploy` 게이트 승인(설계 14 §3.4, DO-R4 ~ DO-R5, HK-21 design §4). 승인 대상은 배포 기록 계획 구간의 sha256 이다.
 * 조건 D1~D7 의 판정 원본은 scripts/harness/deploy_gate.py(`deploy.py check --json`) 하나다 — 이 모듈은 그 결과를 422 로 옮기고
 * 포함 이슈의 approvals.md 마다 같은 기록(같은 기록 ID)을 덧붙인다. 승인은 세션에 아무것도 보내지 않는다(DB-R25).
 */
import fs from "node:fs";
import path from "node:path";
import { appendedText, approvalState, approversOf, needOf, type NewEntry, parse as parseApprovals } from "../approvals";
import { ApiError, bad, notFound, readOnly } from "../errors";
import type { Project } from "../project";
import { checkouts } from "../repo";
import { nowText, python, ulid } from "../util";
import { appendLog, approver, type ApprovalResult, issueFolder, type Via, type Write, writeAll } from "./approvals";

const RECORD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const MIN_WAIVER = 10;

interface Condition {
  id: string;
  name: string;
  ok: boolean;
  reasons: string[];
}
export interface DeployCheck {
  ok: boolean;
  id: string;
  risk: string;
  planSha256: string | null;
  issues: string[];
  rollbackWaived: boolean;
  conditions: Condition[];
  failed: string[];
}

/** deploy.py check --json. 기록이 없으면 404, 판정 실패는 422(조건 ID 를 details.conditions 로). */
export async function deployCheck(p: Project, id: string, waive?: string): Promise<DeployCheck> {
  if (!RECORD.test(id)) throw bad("배포 기록 이름이 아닙니다");
  const script = path.join(p.root, "scripts/harness/deploy.py");
  if (!fs.existsSync(script)) throw new ApiError(422, "gate_precondition", "scripts/harness/deploy.py 가 없습니다 — npx knots-sync update 로 킷을 올립니다", { conditions: [], reasons: ["deploy.py 없음"] });
  const args = [script, "--root", p.root, "check", id, "--json", ...(waive ? ["--waive", waive] : [])];
  const r = await python(p.root, p.env, args, 120_000);
  try {
    return JSON.parse(r.stdout) as DeployCheck;
  } catch {
    if (r.code === 2) throw notFound(`배포 기록이 없습니다: ${id}`);
    throw new ApiError(500, "internal", `deploy.py check 를 읽지 못했습니다: ${(r.stderr.trim().split("\n").pop() ?? "").slice(0, 300)}`);
  }
}

export async function approveDeploy(p: Project, id: string, decision: string, phrase: string, body: Record<string, unknown>, via: Via): Promise<ApprovalResult> {
  if (p.readOnly) throw readOnly();
  if (decision !== "approved") throw new ApiError(422, "gate_precondition", "deploy 게이트는 승인만 받습니다(수정 요청은 포함 이슈의 게이트에서)", { conditions: [], reasons: [`decision ${decision}`] });
  const waive = typeof body.waiveRollback === "string" ? body.waiveRollback.replace(/\s+/g, " ").trim() : "";
  const check = await deployCheck(p, id, waive.length >= MIN_WAIVER ? waive : undefined);
  if (!check.ok || !check.planSha256) {
    const reasons = check.conditions.filter((c) => !c.ok).flatMap((c) => c.reasons.map((r) => `${c.id} ${c.name}: ${r}`));
    throw new ApiError(422, "gate_precondition", "deploy 게이트 조건이 맞지 않습니다", { conditions: check.failed, reasons });
  }
  if (body.docSha256 !== check.planSha256) throw new ApiError(409, "doc_changed", "승인 화면을 연 뒤 배포 기록의 계획 구간이 바뀌었습니다. 다시 읽고 승인합니다", { currentSha256: check.planSha256 });
  const co = (await checkouts(p))[0];
  if (!co) throw notFound("체크아웃을 찾지 못했습니다");
  const who = await approver(p, co, "deploy");
  const need = needOf(p.meta(), check.risk, "deploy");
  const targets = check.issues.map((key) => {
    const folder = issueFolder(p.root, key);
    const file = path.join(p.root, folder, "approvals.md");
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    return { key, folder, file, current, entries: current ? parseApprovals(current).entries : [] };
  });
  for (const t of targets) {
    const state = approvalState(t.entries, "deploy", check.planSha256, p.policy(), need);
    if (state === "valid") throw new ApiError(409, "already_approved", `deploy: 같은 계획(sha ${check.planSha256.slice(0, 12)})으로 승인한 기록이 있습니다`);
    if (state === "partial" && approversOf(t.entries, "deploy", check.planSha256).has(who.email.toLowerCase())) throw new ApiError(409, "already_approved", "deploy: 이미 승인했습니다 — risk: high 는 다른 승인자 한 명이 더 승인합니다(DS-R26)", { need });
  }
  const entry: NewEntry = {
    at: nowText(), gate: "deploy", decision: "approved", approver: who, target: { name: `.agents/docs/ops/deploys/${check.id}.md#PLAN`, sha256: check.planSha256 },
    phrase, path: via, entryId: ulid(), rollbackWaiver: check.rollbackWaived ? waive : null,
  };
  const writes: Write[] = targets.map((t) => ({ file: t.file, data: Buffer.from(appendedText(t.current, t.key, [entry]), "utf8") }));
  writeAll(writes);
  for (const t of targets) appendLog(p.root, { entryId: entry.entryId, target: t.folder, gate: "deploy", sha256: check.planSha256, at: entry.at, path: via });
  return {
    status: 201,
    data: { entryId: entry.entryId, approvals: `${targets[0]?.folder}/approvals.md`, issues: check.issues, approvalFiles: targets.map((t) => `${t.folder}/approvals.md`), approver: who.email, group: who.group, rollbackWaived: check.rollbackWaived, statusChanged: null, sessions: [] },
  };
}
