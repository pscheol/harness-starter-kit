/**
 * 작업 요청(설계 06 §3.10, DB-R17 · R18 · R25). 사람이 POST /dispatch · `knots-sync dispatch` 를 부를 때만 간다.
 * 글은 한 줄(제어 문자 · 줄바꿈 제거, 1,000자)이고 경로 · 변경 요약 · 요청 문장만 담는다. 문서 내용은 넣지 않는다.
 * 소켓에 닿지 못하면 deep link · 대기함 선택지만 돌려주고 자동으로 바꾸지 않는다.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { ApiError, bad, notFound, readOnly } from "../errors";
import type { Project } from "../project";
import { queueDir, readSessions, type SessionFull } from "../readers/sessions";
import { checkouts } from "../repo";
import { atomicWrite, ensureDir, isObj, nowText, oneLine, ulid } from "../util";

const KINDS = ["doc-changed", "answers-ready", "approved", "changes-requested", "review-findings", "custom"] as const;
type Kind = (typeof KINDS)[number];
const MAX = 1000;

export interface DispatchBody {
  target: { sessionId?: string; issue?: string; role?: string; name?: string };
  kind: Kind;
  paths: string[];
  text: string | null;
  changeSummary: { headings?: string[]; ids?: string[]; added?: number; removed?: number; sha256?: string } | null;
  via: "socket" | "deeplink" | "queue" | null;
}

export function dispatchBody(body: unknown): DispatchBody {
  if (!isObj(body)) throw bad("본문이 객체가 아니다");
  const kind = body.kind as Kind;
  if (!KINDS.includes(kind)) throw bad(`kind 는 ${KINDS.join(" · ")} 중 하나다`);
  const target = isObj(body.target) ? body.target : {};
  const t: DispatchBody["target"] = {};
  for (const k of ["sessionId", "issue", "role", "name"] as const) if (typeof target[k] === "string" && target[k]) t[k] = String(target[k]);
  if (!t.sessionId && !t.issue && !t.name && !t.role) throw bad("target 은 {sessionId} · {issue, role} · {name} 중 하나다");
  const paths = Array.isArray(body.paths) ? body.paths.filter((x): x is string => typeof x === "string").map((x) => oneLine(x).slice(0, 300)).slice(0, 10) : [];
  const text = typeof body.text === "string" ? oneLine(body.text) : null;
  if (text && [...text].length > 300) throw bad("요청 글(text)은 300자 이하다");
  if (kind === "custom" && !text) throw bad("custom 은 text 가 필요하다");
  const via = body.via === "socket" || body.via === "deeplink" || body.via === "queue" ? body.via : null;
  const cs = isObj(body.changeSummary) ? (body.changeSummary as DispatchBody["changeSummary"]) : null;
  return { target: t, kind, paths, text, changeSummary: cs, via };
}

/** 종류별 한 줄 글(06 §3.10 예). */
export function message(b: DispatchBody, subject: string): string {
  const where = b.paths.length ? ` 경로: ${b.paths.join(", ")}.` : "";
  const cs = b.changeSummary;
  const detail = cs ? `(${[...(cs.ids ?? []), ...(cs.headings ?? [])].slice(0, 6).join(" · ")}${cs.added !== undefined ? `, +${cs.added} -${cs.removed ?? 0}줄` : ""}${cs.sha256 ? `, sha ${String(cs.sha256).slice(0, 7)}` : ""})` : "";
  const extra = b.text ? ` 메모: ${b.text}` : "";
  const body: Record<Kind, string> = {
    "doc-changed": `${subject} 문서를 사람이 고쳤다${detail}.${where} 요청: 이 파일을 다시 읽고 다음 문서를 맞춘다.${extra}`,
    "answers-ready": `${subject} 질문에 답이 들어왔다.${where} 요청: 답을 읽고 반영한다.${extra}`,
    approved: `${subject} 승인 기록이 approvals.md 에 남았다.${where} 요청: 기록을 확인하고 다음 단계를 진행한다.${extra}`,
    "changes-requested": `${subject} 수정 요청 기록이 approvals.md 에 남았다.${where} 요청: 기록의 문구를 읽고 문서를 고친다.${extra}`,
    "review-findings": `${subject} 리뷰 지적 판단이 기록됐다.${where} 요청: review 상태를 읽고 처리한다.${extra}`,
    custom: `${subject} ${b.text ?? ""}${where}`,
  };
  const line = oneLine(`[knots-sync 관리 페이지] ${body[b.kind]} 이 글은 승인이 아니다.`);
  return [...line].length > MAX ? [...line].slice(0, MAX).join("") : line;
}

function chooseSession(sessions: SessionFull[], t: DispatchBody["target"]): SessionFull | null {
  if (t.sessionId) return sessions.find((s) => s.id === t.sessionId) ?? null;
  if (t.name) return sessions.find((s) => s.name === t.name && s.state !== "gone") ?? null;
  const live = sessions.filter((s) => s.state !== "gone" && (!t.issue || s.issue === t.issue) && (!t.role || s.role === t.role));
  return live.length === 1 ? (live[0] as SessionFull) : null;
}

function deeplink(cwd: string, text: string): string {
  const q = `${text} 먼저 경로의 파일을 읽는다.`;
  return `claude-cli://open?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent([...q].slice(0, 5000).join(""))}`;
}

function socketFormat(p: Project): "text" | "json" {
  const d = p.meta().dashboard;
  const dispatch = isObj(d) && isObj(d.dispatch) ? d.dispatch : {};
  return dispatch.socketFormat === "json" ? "json" : "text";
}

/** 연결 2초 · 쓰기 · end · 닫힘 2초. 수신 확인 신호는 없다. */
export function sendLine(socketPath: string, line: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      s.destroy();
      resolve(ok);
    };
    const s = net.connect({ path: socketPath });
    let timer = setTimeout(() => done(false), 2000);
    s.once("connect", () => {
      clearTimeout(timer);
      timer = setTimeout(() => done(true), 2000);
      s.end(`${line}\n`, "utf8");
    });
    s.once("close", () => done(true));
    s.once("error", () => done(false));
  });
}

export async function postDispatch(p: Project, raw: unknown, createdBy: string | null): Promise<{ status: number; data: Record<string, unknown> }> {
  if (p.readOnly) throw readOnly();
  const b = dispatchBody(raw);
  const sessions = await readSessions(p);
  const session = chooseSession(sessions, b.target);
  if ((b.target.sessionId || b.target.name) && !session) throw notFound("고른 세션이 없다");
  const subject = b.target.issue ?? session?.issue ?? "";
  const text = message(b, subject);
  const main = (await checkouts(p))[0];
  const cwd = session?.cwdAbs ?? main?.path ?? p.root;
  const options = (): Record<string, unknown> => ({ deeplink: session && session.harness === "claude" ? deeplink(cwd, text) : session ? null : deeplink(cwd, text), queueAvailable: true });
  const via = b.via ?? (session && session.state === "alive" ? "socket" : null);
  if (via === null) throw new ApiError(409, "socket_unavailable", "고른 세션의 수신함 소켓이 없다. deep link 또는 대기함을 고른다", options());
  if (via === "socket") {
    if (!session?.socket) throw new ApiError(409, "socket_unavailable", "고른 세션에 수신함 소켓이 없다", options());
    const line = socketFormat(p) === "json" ? JSON.stringify({ type: "message", text }) : text;
    if (!(await sendLine(session.socket, line))) throw new ApiError(409, "socket_unavailable", "수신함 소켓에 연결하지 못했다", options());
    return { status: 202, data: { method: "socket", status: "sent" } };
  }
  if (via === "deeplink") {
    if (session && session.harness !== "claude") throw new ApiError(409, "deeplink_unavailable", `${session.harness ?? "이"} 하네스에는 deep link 가 없다. 대기함을 쓴다`, { queueAvailable: true });
    return { status: 202, data: { method: "deeplink", url: deeplink(cwd, text) } };
  }
  const dir = queueDir(p);
  ensureDir(path.dirname(dir), 0o700);
  ensureDir(dir, 0o700);
  const id = ulid();
  const created = new Date();
  const item = {
    schema: "knots-sync.dispatch/v1", id, createdAt: nowText(created), createdBy,
    target: { issue: b.target.issue ?? session?.issue ?? null, role: b.target.role ?? null, harness: "any", sessionId: b.target.sessionId ?? (b.target.name ? (session?.id ?? null) : null) },
    kind: b.kind, message: text, paths: b.paths, expiresAt: nowText(new Date(created.getTime() + 7 * 24 * 3600 * 1000)),
  };
  atomicWrite(path.join(dir, `${id}.json`), `${JSON.stringify(item, null, 2)}\n`, 0o600);
  return { status: 202, data: { method: "queue", id } };
}

export function dropQueued(p: Project, id: string): Record<string, unknown> {
  if (p.readOnly) throw readOnly();
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw bad("대기함 id 형식이 아니다");
  const file = path.join(queueDir(p), `${id}.json`);
  if (!fs.existsSync(file)) throw notFound(`대기함 항목이 없다: ${id}`);
  fs.unlinkSync(file);
  return { id, dropped: true };
}
