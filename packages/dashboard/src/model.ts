/** 화면 단위 묶음: session · overview · 처리할 일(설계 06 §3.3 · §3.4, DB-R24). */
import fs from "node:fs";
import path from "node:path";
import { allowed } from "./approvals";
import { intentFolders, intentModel } from "./flow";
import { parseQuestions } from "./questions";
import { fileStamp } from "./cache";
import { DEFAULT_GATES, type DoctorSummary, GATE_FLOOR, type Project } from "./project";
import { type IssueModel, readIssues } from "./readers/issues";
import { opsTodos } from "./readers/ops";
import { readQueue, readSessions, type SessionFull } from "./readers/sessions";
import { readSummary, readVerify, readWorktrees } from "./readers/state";
import { checkouts, gitStatus } from "./repo";
import { isObj } from "./util";

declare const __HK_VERSION__: string;
export const VERSION = typeof __HK_VERSION__ === "string" ? __HK_VERSION__ : "0.0.0-dev";

export interface Loaded {
  issues: IssueModel[];
  errors: string[];
  sessions: SessionFull[];
}

export async function load(p: Project): Promise<Loaded> {
  const sessions = await readSessions(p);
  const cos = await checkouts(p);
  const dirty = new Map(await Promise.all(cos.map(async (c) => [c.path, (await gitStatus(c.path, p.env)).dirty] as [string, boolean])));
  const set = await readIssues(p, sessions, dirty);
  return { ...set, sessions };
}

export async function sessionInfo(p: Project, mode: "single" | "multi"): Promise<Record<string, unknown>> {
  const meta = p.meta();
  const user = await p.user();
  const groups = p.policy().groups ?? {};
  const flow = isObj(meta.flow) ? meta.flow : {};
  return {
    repo: p.name(),
    projectId: p.id,
    main: p.root,
    user: { email: user.email, name: user.name, groups: Object.entries(groups).filter(([, m]) => m.some((x) => x.toLowerCase() === (user.email ?? "").toLowerCase())).map(([g]) => g).sort() },
    modules: p.modules(),
    agents: Array.isArray(meta.agents) ? meta.agents : [],
    flow: { design: flow.design ?? "kit", record: flow.record ?? "none", gates: p.gates(), floor: GATE_FLOOR },
    approvers: p.policy().approvers ?? {},
    readOnly: p.readOnly,
    mode,
    version: VERSION,
  };
}

/** doctor 요약(설계 06 §3.2 harness: lock stat · 60초). */
export async function doctorOf(p: Project): Promise<DoctorSummary | null> {
  const doctor = p.deps.doctor;
  if (!doctor) return null;
  const stamp = [fileStamp(path.join(p.root, ".agents/knots-sync.lock")), fileStamp(path.join(p.root, ".agents/knots-sync.json"))].join("\n");
  try {
    return await p.cache.get("doctor", stamp, () => doctor(p.root, p.env), 60_000);
  } catch {
    return { status: "unavailable", counts: {}, problems: [] };
  }
}

export interface Todo {
  rank: number;
  kind: string;
  target: string;
  title: string;
  reason: string;
  since: string;
  link: string;
  mine: boolean;
}

const isoOf = (ms: number | undefined | null): string => new Date(ms && Number.isFinite(ms) ? ms : 0).toISOString();
const mtime = (f: string): number | null => {
  try {
    return fs.statSync(f).mtimeMs;
  } catch {
    return null;
  }
};

/** 할 일 글에 쓰는 단계 이름(화면 lib/format.ts GATE_KO 와 같은 말). 할 일 글은 관리 페이지 · status 에 그대로 보인다 */
const GATE_WORD: Record<string, string> = { codebase: "기존 코드", intent: "Intent", plans: "기획물", requirements: "요구사항", design: "설계", tasks: "작업 목록", mr: "병합 요청", done: "완료", deploy: "배포" };
const gateWord = (g: string): string => GATE_WORD[g] ?? g;
const VERIFY_WORD: Record<string, string> = { failed: "실패", incomplete: "덜 끝남" };

export async function todos(p: Project, loaded: Loaded): Promise<Todo[]> {
  const out: Todo[] = [];
  /** 시각이 없는 항목의 since: 메타 파일 시각(같은 입력이면 같은 응답, 06 §3.15 CLI 대응) */
  const fallback = mtime(path.join(p.root, ".agents/knots-sync.json"));
  const iso = (ms: number | undefined | null): string => isoOf(ms ?? fallback);
  const user = await p.user();
  for (const i of loaded.issues) {
    const link = `/issues/${i.key}`;
    const open = i.review?.open ?? {};
    const blocking = (open.CRITICAL ?? 0) + (open.HIGH ?? 0);
    if (blocking > 0) {
      out.push({ rank: 1, kind: "review-blocker", target: i.key, title: `${i.key} 리뷰에서 막는 지적 ${blocking}건(CRITICAL ${open.CRITICAL ?? 0} · HIGH ${open.HIGH ?? 0})`, reason: "판단하기 전까지 병합 요청 승인과 전체 검증이 막힙니다", since: iso(i.review?.report ? mtime(path.join(p.root, i.review.report)) : null), link: `${link}/review`, mine: false });
    }
    if (i.waitingOn) {
      const d = (i.docs as Record<string, { mtimeMs?: number } | null>)[i.waitingOn.gate];
      out.push({
        rank: i.waitingOn.mine ? 2 : 6, kind: i.waitingOn.mine ? "gate-mine" : "gate-others", target: i.key,
        title: `${i.key} ${gateWord(i.waitingOn.gate)} 승인 대기`, reason: i.waitingOn.approvers.length ? `승인할 사람: ${i.waitingOn.approvers.join(", ")}` : "승인할 사람을 정하지 않아 이 리포의 git 사용자 누구나 승인합니다",
        since: iso(d?.mtimeMs ?? null), link: `${link}/approve?gate=${i.waitingOn.gate}`, mine: i.waitingOn.mine,
      });
    }
    for (const [gate, d] of Object.entries(i.docs) as [string, { clarify: number; approval: string; mtimeMs?: number } | null][]) {
      if (!d) continue;
      if (d.clarify > 0) out.push({ rank: 3, kind: "questions", target: i.key, title: `${i.key} ${gateWord(gate)} 문서에 '확인 필요' ${d.clarify}건`, reason: "'확인 필요' 표시가 남은 문서는 승인할 수 없습니다. 답을 적어 표시를 지웁니다", since: iso(d.mtimeMs ?? null), link: `${link}/docs/${gate}`, mine: false });
      if (d.approval === "stale" && gate !== "tasks") out.push({ rank: 5, kind: "approval-stale", target: i.key, title: `${i.key} ${gateWord(gate)} 문서가 승인 뒤 바뀌었습니다`, reason: "승인한 때와 지금 내용이 다릅니다. 다시 읽고 승인합니다", since: iso(d.mtimeMs ?? null), link: `${link}/docs/${gate}`, mine: allowed(user.email, gate, p.policy()) });
    }
  }
  for (const info of intentFolders(p.root)) {
    const qf = path.join(info.abs, "questions.md");
    if (!fs.existsSync(qf)) continue;
    const model = intentModel(p, info, loaded.issues);
    const stage = String(model.stage);
    const open = parseQuestions(fs.readFileSync(qf, "utf8")).questions.filter((q) => q.open && (q.blocks === stage || q.blocks === null));
    if (open.length) out.push({ rank: 3, kind: "questions", target: info.key, title: `${info.key} 답할 질문 ${open.length}건`, reason: `답해야 ${gateWord(stage)} 단계로 넘어갑니다`, since: iso(mtime(qf)), link: `/intents/${info.key}/questions`, mine: false });
  }
  for (const v of await readVerify(p, null)) {
    const rec = v.record as { status?: string; finishedAt?: string } | null;
    if (rec && (rec.status === "failed" || rec.status === "incomplete")) {
      const co = v.checkout as { path: string };
      out.push({ rank: 4, kind: "verify-failed", target: (v.issue as string | null) ?? co.path, title: `검증 ${VERIFY_WORD[rec.status] ?? rec.status}: ${(v.issue as string | null) ?? (co.path === "." ? "메인 폴더" : co.path)}`, reason: "마지막 검증이 통과하지 못했습니다. 검증 화면에서 실패한 단계를 봅니다", since: rec.finishedAt ?? iso(null), link: "/verify", mine: false });
    }
  }
  const wt = await readWorktrees(p);
  for (const w of wt.worktrees as { name: string; path: string; done: boolean; lastUsed: string | null; kind: string }[]) {
    if (w.kind === "worktree" && w.done) out.push({ rank: 7, kind: "worktree-cleanup", target: w.path, title: `다 끝난 작업 공간 정리: ${w.name}`, reason: "바뀐 것도, 올리지 않은 커밋도 없고 병합까지 끝났습니다. 지워도 됩니다", since: w.lastUsed ?? iso(null), link: "/workspace", mine: false });
  }
  if (wt.over) out.push({ rank: 7, kind: "worktree-cleanup", target: ".", title: `작업 공간 ${String(wt.count)}개 — 정한 수(${String(wt.maxPerRepo)}개)를 넘었습니다`, reason: "끝난 작업 공간부터 정리합니다", since: iso(null), link: "/workspace", mine: false });
  const doctor = await doctorOf(p);
  if (doctor && doctor.status === "problems") {
    const labels = new Map(doctor.problems.map((x) => [x.kind, x.label ?? x.kind]));
    out.push({ rank: 8, kind: "harness", target: ".", title: `설치 점검에서 손볼 것 ${doctor.problems.length}건`, reason: Object.entries(doctor.counts).map(([k, n]) => `${labels.get(k) ?? k} ${n}`).join(" · "), since: iso(null), link: "/harness", mine: false });
  }
  for (const q of await readQueue(p)) {
    if (q.stale) out.push({ rank: 9, kind: "dispatch-stale", target: q.id, title: `24시간 넘게 아무도 가져가지 않은 요청: ${q.message.slice(0, 60)}`, reason: "대기함에 남은 요청입니다. 필요 없으면 버립니다", since: q.createdAt ?? iso(null), link: "/workspace", mine: false });
  }
  const summary = await readSummary(p);
  const gate = summary.gate as { status?: string } | null;
  const findings = summary.findings as { new?: Record<string, number>; at?: string } | null;
  if (gate?.status === "failed" && (findings?.new?.CRITICAL ?? 0) > 0) out.push({ rank: 1, kind: "quality-blocker", target: ".", title: `품질 검사 실패 · 새로 생긴 CRITICAL ${findings?.new?.CRITICAL ?? 0}건`, reason: "검증 화면에서 무엇이 실패했는지 봅니다", since: findings?.at ?? iso(null), link: "/verify", mine: false });
  out.push(...(await opsTodos(p)));
  return out.sort((a, b) => a.rank - b.rank || Date.parse(a.since) - Date.parse(b.since) || (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));
}

export const TODO_LIMIT = 50;

export async function overview(p: Project): Promise<Record<string, unknown>> {
  const loaded = await load(p);
  const all = await todos(p, loaded);
  const more: Record<string, number> = {};
  for (const t of all.slice(TODO_LIMIT)) more[String(t.rank)] = (more[String(t.rank)] ?? 0) + 1;
  const stages: Record<string, number> = {};
  for (const i of loaded.issues) stages[i.stage] = (stages[i.stage] ?? 0) + 1;
  const doctor = await doctorOf(p);
  return {
    todo: all.slice(0, TODO_LIMIT),
    more,
    total: all.length,
    stages,
    issues: loaded.issues.length,
    sessions: { alive: loaded.sessions.filter((s) => s.state !== "gone").length, total: loaded.sessions.length },
    doctor,
    errors: loaded.errors,
  };
}

export { DEFAULT_GATES };
