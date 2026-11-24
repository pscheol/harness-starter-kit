/**
 * 사람 터미널의 판단 명령(설계 06 §3.15, README §3 승인 경로 terminal): approve · answer · review show|decide.
 * 에이전트 세션 판정에 걸리거나 TTY 가 아니면 read_only(exit 3). approve · review decide 는 요약을 보이고 이슈 키를 입력받는다.
 * 관리 페이지와 같은 처리 함수를 경로 `terminal` 로 부른다. 세션에 아무것도 보내지 않는다(DB-R25).
 */
import { ApiError } from "../../../dashboard/src/errors";
import { bool, str } from "../cli/args";
import type { CommandResult, Ctx } from "../cli/context";
import { EXIT, usageError } from "../core/errors";
import { confirmKey, failure, humanTerminal, jsonLines, openProject, run } from "./api-call";
import { callApi } from "../../../dashboard/src/api";
import { deployCheck } from "../../../dashboard/src/writers/deploy";

const KEY = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5}$/;
const DEPLOY_KEY = /^deploy:([A-Za-z0-9][A-Za-z0-9._-]{0,80})$/;
const INTENT_GATES = new Set(["intent", "codebase", "plans"]);
const DOC_GATES: Record<string, string> = { requirements: "requirements", design: "design", tasks: "tasks" };

function approvedLines(d: Record<string, unknown>): string[] {
  return [`기록: ${String(d.approvals)} · 기록 ID ${String(d.entryId)}${d.statusChanged ? ` · ${String(d.statusChanged)}` : ""}`, `커밋은 사람이 한다: git add ${String(d.approvals)}`];
}

/** deploy 게이트(설계 14 §3.4): 배포 기록 계획 구간의 sha 를 승인한다. 롤백 시험 면제는 --waive-rollback 으로 승인하는 사람이 넣는다. */
async function approveDeploy(ctx: Ctx, id: string, gate: string, phrase: string): Promise<CommandResult> {
  if (gate !== "deploy" || bool(ctx.values, "changes-requested")) throw usageError('knots-sync approve deploy:<배포 기록> --gate deploy --phrase "<문구>" [--waive-rollback "<사유>"]');
  const refused = humanTerminal(ctx);
  if (refused) return failure(ctx, refused);
  const waive = str(ctx.values, "waive-rollback");
  try {
    const p = await openProject(ctx);
    const check = await deployCheck(p, id, waive && waive.trim().length >= 10 ? waive : undefined);
    const user = await p.user();
    const summary = [`승인: ${id} · deploy · approved`, `- 대상: .agents/docs/ops/deploys/${id}.md#PLAN · sha ${(check.planSha256 ?? "").slice(0, 12)}`, `- 포함 이슈: ${check.issues.join(", ")} · risk ${check.risk}`, `- 승인자: ${user.email ?? "git user.email 없음"}`, `- 문구: "${phrase.replace(/\s+/g, " ").trim()}"`];
    if (check.rollbackWaived && waive) summary.push(`- 롤백 면제: ${waive.replace(/\s+/g, " ").trim()}`);
    const ok = check.ok ? await confirmKey(ctx, id, summary) : true;
    if (!ok) return failure(ctx, new ApiError(409, "not_confirmed", "입력한 키가 다르다 — 기록하지 않았다"));
    return run(ctx, "POST", "/approvals", { project: p, body: { target: { deploy: id }, gate, decision: "approved", phrase, docSha256: check.planSha256, ...(waive ? { waiveRollback: waive } : {}) } }, (d) => [
      `기록: ${(d.approvalFiles as string[] | undefined)?.length ?? 1}개 이슈 approvals.md · 기록 ID ${String(d.entryId)}${d.rollbackWaived ? " · 롤백 면제" : ""}`,
      `커밋은 사람이 한다: git add ${((d.approvalFiles as string[] | undefined) ?? [String(d.approvals)]).join(" ")}`,
    ]);
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}

export async function runApprove(ctx: Ctx): Promise<CommandResult> {
  const [key, extra] = ctx.positionals;
  const gate = str(ctx.values, "gate");
  const phrase = str(ctx.values, "phrase");
  const deploy = key ? DEPLOY_KEY.exec(key) : null;
  if (deploy && gate && phrase && !extra) return approveDeploy(ctx, deploy[1] as string, gate, phrase);
  if (!key || extra || !KEY.test(key) || !gate || !phrase) throw usageError('knots-sync approve <키> --gate <게이트> --phrase "<문구>" [--changes-requested [--rule-candidate]]');
  const refused = humanTerminal(ctx);
  if (refused) return failure(ctx, refused);
  const decision = bool(ctx.values, "changes-requested") ? "changes-requested" : "approved";
  const target = INTENT_GATES.has(gate) ? { intent: key } : { issue: key };
  try {
    const p = await openProject(ctx);
    let docSha256: string | undefined;
    let shown = "";
    if (Object.hasOwn(DOC_GATES, gate)) {
      const issue = (await callApi(p, "GET", `/issues/${key}`)).data as { docs: Record<string, { sha256: string; approvalSha256: string } | null>; dir: string };
      const doc = issue.docs[gate];
      docSha256 = doc?.sha256;
      shown = doc ? `${issue.dir}/${gate}.md · sha ${doc.approvalSha256.slice(0, 12)}` : `${gate}.md 없음`;
    } else if (gate === "intent") {
      const intent = (await callApi(p, "GET", `/intents/${key}`)).data as { dir: string };
      const doc = (await callApi(p, "GET", "/docs", { query: { path: `${intent.dir}/intent.md` } })).data as { sha256: string };
      docSha256 = doc.sha256;
      shown = `${intent.dir}/intent.md · sha ${doc.sha256.slice(0, 12)}`;
    } else if (gate === "codebase" || gate === "plans") {
      const b = (await callApi(p, "GET", `/intents/${key}/gates`, { query: { gate } })).data as { files: { path: string; approvalSha256: string }[]; sha256: string };
      docSha256 = b.sha256;
      shown = b.files.map((f) => `${f.path} · sha ${f.approvalSha256.slice(0, 12)}`).join("\n  ") || "대상 파일 없음";
    } else shown = "브랜치 head";
    const user = await p.user();
    const ok = await confirmKey(ctx, key, [`승인: ${key} · ${gate} · ${decision}`, `- 대상: ${shown}`, `- 승인자: ${user.email ?? "git user.email 없음"}`, `- 문구: "${phrase.replace(/\s+/g, " ").trim()}"`]);
    if (!ok) return failure(ctx, new ApiError(409, "not_confirmed", "입력한 키가 다르다 — 기록하지 않았다"));
    return run(ctx, "POST", "/approvals", { project: p, body: { target, gate, decision, phrase, docSha256, ruleCandidate: bool(ctx.values, "rule-candidate") } }, approvedLines);
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}

export async function runAnswer(ctx: Ctx): Promise<CommandResult> {
  const [target, qid, extra] = ctx.positionals;
  if (!target || extra) throw usageError("knots-sync answer <INT 또는 키> --list | <Q-n> --choice <A-D|other> [--text …] [--by <참석자 email>]");
  if (bool(ctx.values, "list") || !qid) {
    return run(ctx, "GET", "/questions", { query: { target } }, (d) => {
      const qs = (d.questions as { id: string; open: boolean; role: string; text: string; recommended: string | null; answer: string | null }[]) ?? [];
      return qs.length ? qs.map((q) => `${q.id} ${q.open ? "열림" : "답함"} · 직무 ${q.role} · 권장 ${q.recommended ?? "—"} — ${q.text}${q.answer ? ` (답: ${q.answer})` : ""}`) : ["질문 없음"];
    });
  }
  const choice = str(ctx.values, "choice");
  if (!choice) throw usageError("--choice <A-D|other> 가 필요하다");
  const refused = humanTerminal(ctx);
  if (refused) return failure(ctx, refused);
  try {
    const p = await openProject(ctx);
    const list = (await callApi(p, "GET", "/questions", { query: { target } })).data as { sha256: string | null };
    return run(ctx, "POST", `/questions/${target}/${qid}/answer`, { project: p, body: { choice, text: str(ctx.values, "text"), baseSha256: list.sha256, ...(str(ctx.values, "by") ? { by: str(ctx.values, "by") } : {}) } }, (d) => [`${String(d.kind) === "opinion" ? "의견" : "답"}을 남겼다: ${String(d.path)} · 열린 질문 ${String(d.open)}건${d.statusChanged ? ` · ${String(d.statusChanged)}` : ""}`]);
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}

export async function runReview(ctx: Ctx): Promise<CommandResult> {
  const [sub, key, findingId, extra] = ctx.positionals;
  if (sub === "show" && key && !findingId) return run(ctx, "GET", `/reviews/${key}`, {}, jsonLines);
  if (sub !== "decide" || !key || !findingId || extra) throw usageError("knots-sync review show <키> | review decide <키> <F-n> --fix|--accept-risk --reason …");
  const fix = bool(ctx.values, "fix");
  const accept = bool(ctx.values, "accept-risk");
  const reason = str(ctx.values, "reason");
  if (fix === accept || !reason) throw usageError("--fix 또는 --accept-risk 하나와 --reason 이 필요하다");
  const refused = humanTerminal(ctx);
  if (refused) return failure(ctx, refused);
  try {
    const p = await openProject(ctx);
    const decision = accept ? "risk-accepted" : "fix-required";
    const ok = await confirmKey(ctx, key, [`리뷰 판단: ${key} · ${findingId} · ${decision}`, `- 사유: "${reason.replace(/\s+/g, " ").trim()}"`]);
    if (!ok) return failure(ctx, new ApiError(409, "not_confirmed", "입력한 키가 다르다 — 기록하지 않았다"));
    return run(ctx, "POST", `/reviews/${key}/${findingId}/decision`, { project: p, body: { decision, phrase: reason } }, approvedLines);
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}

export { EXIT };
