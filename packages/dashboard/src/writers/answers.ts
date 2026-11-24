/** 질문 목록 · 답 저장(설계 06 §3.8, 08 §3.3). 답은 세션에 아무것도 보내지 않는다(DB-R25). */
import fs from "node:fs";
import path from "node:path";
import { ApiError, bad, notFound, readOnly } from "../errors";
import { findIntent, INTENT_FOLDER } from "../flow";
import type { Project } from "../project";
import { parseQuestions, writeAnswer } from "../questions";
import { type Checkout, gitUser, KEY, resolveIntentCheckout, resolveIssueCheckout } from "../repo";
import { atomicWrite, isObj, nowText, sha256 } from "../util";
import { issueFolder } from "./approvals";

async function locate(p: Project, target: string): Promise<{ co: Checkout; rel: string; abs: string }> {
  if (!KEY.test(target)) throw bad(`대상 키 형식이 아니다: ${target}`);
  const isIntent = fs.existsSync(path.join(p.root, ".agents/docs/intents")) && fs.readdirSync(path.join(p.root, ".agents/docs/intents")).some((n) => INTENT_FOLDER.exec(n)?.[1] === target);
  if (isIntent) {
    const co = await resolveIntentCheckout(p, target);
    const info = findIntent(co.root, target);
    return { co, rel: `${info.dir}/questions.md`, abs: path.join(info.abs, "questions.md") };
  }
  const co = await resolveIssueCheckout(p, target, null);
  const folder = issueFolder(co.root, target);
  return { co, rel: `${folder}/questions.md`, abs: path.join(co.root, folder, "questions.md") };
}

export async function getQuestions(p: Project, target: string | null): Promise<Record<string, unknown>> {
  if (!target) throw bad("target 이 필요하다");
  const { rel, abs } = await locate(p, target);
  if (!fs.existsSync(abs)) return { target, path: rel, sha256: null, status: null, questions: [] };
  const bytes = fs.readFileSync(abs);
  const doc = parseQuestions(bytes.toString("utf8"));
  return { target, path: rel, sha256: sha256(bytes), status: doc.frontmatter.status ?? null, round: doc.frontmatter.round ?? null, questions: doc.questions };
}

export async function postAnswer(p: Project, target: string, qid: string, body: unknown): Promise<Record<string, unknown>> {
  if (p.readOnly) throw readOnly();
  if (!isObj(body)) throw bad("본문이 객체가 아니다");
  const { co, rel, abs } = await locate(p, target);
  if (!fs.existsSync(abs)) throw notFound(`질문 파일이 없다: ${rel}`);
  return p.withLock(abs, async () => {
    const bytes = fs.readFileSync(abs);
    if (body.baseSha256 !== sha256(bytes)) throw new ApiError(409, "conflict", "다른 곳에서 먼저 저장했다", { currentSha256: sha256(bytes), currentMarkdown: bytes.toString("utf8") });
    const doc = parseQuestions(bytes.toString("utf8"));
    const q = doc.questions.find((x) => x.id === qid);
    if (!q) throw notFound(`질문이 없다: ${qid}`);
    const choice = typeof body.choice === "string" ? body.choice : "";
    if (choice !== "other" && !q.choices.some((c) => c.id === choice)) throw bad(`선택지가 아니다: ${choice} (${q.choices.map((c) => c.id).join(" · ")} · other)`);
    const text = typeof body.text === "string" && body.text.trim() ? body.text : null;
    if (choice === "other" && !text) throw bad("other 는 text 가 필요하다");
    const u = await gitUser(co.root, p.env);
    if (!u.email) throw new ApiError(403, "not_an_approver", "git config user.email 이 비었다");
    const groups = p.policy().groups ?? {};
    const members = Object.hasOwn(groups, q.role) ? groups[q.role] : undefined;
    const opinion = members !== undefined && !members.some((m) => m.toLowerCase() === (u.email as string).toLowerCase());
    const out = writeAnswer(bytes.toString("utf8"), { qid, choice, text, email: u.email, at: nowText(), opinion });
    atomicWrite(abs, out.text);
    const after = parseQuestions(out.text).questions;
    return { sha256: sha256(Buffer.from(out.text, "utf8")), path: rel, kind: opinion ? "opinion" : "answer", answered: after.filter((x) => !x.open).length, open: after.filter((x) => x.open).length, statusChanged: out.statusChanged };
  });
}
