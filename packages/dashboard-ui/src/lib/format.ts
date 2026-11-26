// 화면 공용 순수 함수(DOM 없음). vitest 가 직접 불러 시험한다.
import type { Loose } from "./types";

export const GATE_KO: Record<string, string> = { codebase: "기존 코드", intent: "Intent", plans: "기획물", requirements: "요구사항", design: "설계", tasks: "작업 목록", mr: "병합 요청", done: "완료", deploy: "배포" };
/** 게이트 → 단계 색 계열(설계 · 구현 · 반영/운영) */
export const GATE_FAMILY: Record<string, string> = { codebase: "design", intent: "design", plans: "design", requirements: "design", design: "design", tasks: "build", mr: "build", done: "ops", deploy: "ops" };
export const STAGE_KO: Record<string, string> = { design: "설계", implement: "구현", verify: "검증", docs: "반영", ops: "운영" };
export const STAGE_CLASS: Record<string, string> = { design: "design", implement: "build", verify: "build", docs: "ops", ops: "ops" };
export const STEP_KO: Record<string, string> = { requirements: "요구사항", design: "설계", tasks: "작업 목록", impl: "구현", verify: "검증", mr: "병합 요청", done: "완료", deploy: "배포" };
export const ROLE_KO: Record<string, string> = { design: "설계", implement: "구현", review: "리뷰", docs: "문서", unknown: "역할 모름" };
export const HARNESS_KO: Record<string, string> = { claude: "Claude Code", codex: "Codex", kiro: "Kiro", cursor: "Cursor", gemini: "Gemini" };
export const HARNESS_LETTER: Record<string, string> = { claude: "C", codex: "X", kiro: "K", cursor: "U", gemini: "G" };

/** 1234 → "1.2K", 21_900_000 → "21.9M" */
export function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 ** 3).toFixed(1)}GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${n}B`;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}초`;
  const m = Math.floor(s / 60);
  return `${m}분 ${Math.round(s - m * 60)}초`;
}

export function pct(r: number | null | undefined, digits = 0): string {
  return r === null || r === undefined ? "-" : `${(r * 100).toFixed(digits)}%`;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "10:52" (오늘) · "11-23 10:52" (오늘이 아니면). now 를 넘기면 시험이 고정한다. */
export function clock(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const same = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return same ? hm : `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hm}`;
}

/** 방금 · 3분 전 · 2시간 전 · 5일 전 */
export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "-";
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "-";
  if (ms < 60_000) return "방금";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`;
  return `${Math.floor(ms / 86_400_000)}일 전`;
}

/** 화면 머리의 자동 갱신 표시: "방금 읽음" · "12초 전에 읽음" · "3분 전에 읽음" */
export function freshText(at: number | null, now = Date.now()): string {
  if (at === null) return "아직 읽지 못했습니다";
  const ms = Math.max(0, now - at);
  if (ms < 5000) return "방금 읽음";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}초 전에 읽음`;
  return `${ago(new Date(at).toISOString(), new Date(now)).replace(/ 전$/, "")} 전에 읽음`;
}

/**
 * 화면에 남겨 두는 용어와 한 줄 풀이(합니다체). 처음 보는 사람이 마우스를 올리거나 초점을 주면 본다.
 * 내부 문서 번호(HK-*, S11, §5)와 스크립트 이름은 화면에 쓰지 않는다 — 꼭 필요하면 '자세히' 안에 둔다.
 */
export const TERMS: Record<string, { label: string; help: string }> = {
  intent: { label: "Intent", help: "여러 이슈를 하나로 묶는 큰 요구사항입니다. 쓰지 않는 팀은 이 칸이 보이지 않습니다." },
  unit: { label: "Unit", help: "Intent 를 나눈 작업 단위입니다. Unit 하나가 이슈 하나가 됩니다." },
  bolt: { label: "Bolt", help: "한 번에 끝내는 짧은 작업 묶음입니다. Intent 를 쓸 때만 셉니다." },
  gate: { label: "단계 확인", help: "이슈가 다음 단계로 가기 전에 사람이 승인하거나 검사를 통과해야 하는 자리입니다." },
  mr: { label: "병합 요청", help: "GitLab 의 Merge Request(GitHub 의 Pull Request)입니다." },
  worktree: { label: "작업 공간", help: "한 리포를 여러 폴더로 나눠 이슈마다 따로 작업하는 git worktree 입니다." },
  doctor: { label: "설치 점검", help: "킷이 깔아 둔 파일이 제자리에 있는지 보는 점검입니다. 터미널의 knots-sync doctor 와 같습니다." },
  harness: { label: "하네스", help: "Claude Code · Codex · Kiro 처럼 AI 에이전트를 돌리는 도구입니다." },
  readOnly: { label: "읽기 전용", help: "보기만 하는 화면입니다. 승인 · 답 · 저장은 사람이 자기 터미널에서 연 화면에서 합니다." },
};

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function dayLabel(dateText: string): { short: string; week: string; text: string } {
  const [y, m, d] = dateText.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { short: `${m}/${d}`, week: WEEK[dt.getDay()], text: `${m}월 ${d}일 ${WEEK[dt.getDay()]}` };
}

/** 이슈 게이트 판정 → 게이트 레일 모양(ok · wait · now · skip · todo). gates 는 flow.gates 순서다. */
export function railSpec(flowGates: string[], issue: Loose | null | undefined): RailStep[] {
  const out: RailStep[] = [];
  const results = new Map<string, Loose>((issue?.gates ?? []).map((g: Loose) => [g.gate, g]));
  let active = false;
  for (const g of flowGates) {
    const r = results.get(g);
    if (!r) {
      // 이슈 게이트가 아닌 것(intent · plans · deploy …)은 이슈에서 해당 없음, 이미 지난 위쪽은 ok
      out.push({ gate: g, state: issue ? (["codebase", "intent", "plans"].includes(g) ? (issue.intent ? "ok" : "skip") : g === "deploy" ? (issue.stage === "completed" ? "todo" : "todo") : "skip") : "skip" });
      continue;
    }
    if (r.passed) {
      out.push({ gate: g, state: "ok" });
    } else if (!active) {
      active = true;
      out.push({ gate: g, state: issue?.waitingOn && issue.waitingOn.gate === g ? "wait" : "now" });
    } else out.push({ gate: g, state: "todo" });
  }
  return out;
}

export const RAIL_STATE_KO: Record<string, string> = { ok: "통과", wait: "사람 승인 대기", now: "진행 중", skip: "해당 없음", todo: "아직" };

/** 한 줄 상태 글: 이슈 stage → 사람이 읽는 말 */
export function stageText(issue: Loose | null | undefined): string {
  if (!issue) return "";
  if (issue.stage === "completed") return "완료";
  if (issue.waitingOn) return `${GATE_KO[issue.waitingOn.gate] ?? issue.waitingOn.gate} 승인 대기`;
  return `${STEP_KO[issue.stage] ?? GATE_KO[issue.stage] ?? issue.stage} 진행`;
}

export const KIND_KO: Record<string, string> = {
  "review-blocker": "막힘",
  "quality-blocker": "막힘",
  "gate-mine": "승인 · 내 차례",
  "gate-others": "다른 사람 승인",
  questions: "질문",
  "verify-failed": "검증 실패",
  "approval-stale": "다시 승인",
  "worktree-cleanup": "정리",
  harness: "하네스",
  "dispatch-stale": "대기함",
};

/** 처리할 일 묶음(S01 영역 3~7): rank 와 kind 를 묶음 이름으로 */
export const TODO_GROUPS: TodoGroup[] = [
  { id: "blocked", title: "막힌 것", hint: "열린 CRITICAL · HIGH · 실패한 품질 게이트", match: (t: Loose) => t.rank === 1 },
  { id: "mine", title: "승인 대기", hint: "내 git 사용자가 승인자인 것", match: (t: Loose) => t.rank === 2 },
  { id: "questions", title: "답할 질문", hint: "[NEEDS CLARIFICATION] 이 남은 문서 · 열린 질문", match: (t: Loose) => t.rank === 3 },
  { id: "verify", title: "검증 · 다시 승인", hint: "마지막 검증이 통과가 아닌 것 · 승인 뒤 바뀐 문서", match: (t: Loose) => t.rank === 4 || t.rank === 5 },
  { id: "others", title: "다른 사람 승인 대기", hint: "approvers 에 내 git 사용자가 없습니다", match: (t: Loose) => t.rank === 6 },
  { id: "cleanup", title: "정리 · 점검", hint: "끝난 worktree · 하네스 점검 · 오래된 대기함", match: (t: Loose) => t.rank >= 7 },
];

export function groupTodos(todo: Loose[], onlyMine = false): Array<TodoGroup & { items: Loose[] }> {
  const list = onlyMine ? todo.filter((t) => t.mine || t.rank <= 2) : todo;
  return TODO_GROUPS.map((g) => ({ ...g, items: list.filter(g.match) })).filter((g) => g.items.length);
}

/** 라우트 → 화면 이름. 주소의 `/p/<id>` 접두는 base 로 따로 뗀다. */
export function parseRoute(pathname: string, search = ""): Route {
  const q = Object.fromEntries(new URLSearchParams(search));
  const parts = pathname.split("/").filter(Boolean).map((x) => decodeURIComponent(x));
  const [a, b, c, d] = parts;
  if (!a) return { name: "home", params: {}, query: q };
  if (a === "projects") return { name: "projects", params: {}, query: q };
  if (a === "progress") return { name: q.view === "flow" ? "flow" : "progress", params: {}, query: q };
  if (a === "issues" && b) return { name: "issue", params: { key: b, tab: c === "docs" ? (d ?? "requirements") : c === "review" ? "review" : c === "approve" ? "approve" : null }, query: q };
  if (a === "intents" && b) return { name: c === "questions" ? "questions" : "intent", params: { key: b, target: b }, query: q };
  if (a === "questions") return { name: "questions", params: { target: q.target ?? null }, query: q };
  if (["docs", "verify", "workspace", "skills", "harness", "ops", "intake", "usage"].includes(a)) return { name: a, params: {}, query: q };
  return { name: "notfound", params: { path: pathname }, query: q };
}

/** 메뉴 항목 → 이 라우트가 속한 메뉴 */
export function menuOf(route: Route): string {
  const n = route.name;
  // 이슈 · Intent 는 진행 화면에서 들어간다(메뉴와 이동 경로가 같은 곳을 가리키게)
  if (n === "flow" || n === "progress" || n === "intent" || n === "issue") return "progress";
  if (n === "questions" || n === "docs") return "docs";
  return n;
}

export const PROMPT_KINDS: Array<[string, string]> = [
  ["doc-changed", "문서를 고쳤습니다"],
  ["answers-ready", "답이 모였습니다"],
  ["approved", "승인했습니다"],
  ["changes-requested", "수정을 요청합니다"],
  ["review-findings", "리뷰 지적을 처리합니다"],
  ["custom", "직접 씁니다"],
];

/** 사용량 차트용: byRole 를 역할 순서대로 쌓는 조각 */
export function stackParts(daily: Loose[], roles: string[]) {
  return daily.map((d) => ({ date: d.date, parts: roles.map((r) => ({ role: r, v: (d.byRole[r] ?? 0) as number })), sum: d.sum as number }));
}

export interface RailStep {
  gate: string;
  state: "ok" | "wait" | "now" | "skip" | "todo";
}

export interface TodoGroup {
  id: string;
  title: string;
  hint: string;
  match: (t: Loose) => boolean;
}

export interface Route {
  name: string;
  params: Record<string, string | null | undefined>;
  query: Record<string, string>;
}

/** 게이트 순서대로 단계별 이슈 수 줄: 요구사항 → 설계 → tasks → MR → 완료 */
export function stageRows(stages: Record<string, number>, gates: string[]): Array<{ id: string; label: string; v: number }> {
  const order = [...gates.filter((g) => ["requirements", "design", "tasks", "mr"].includes(g)), "completed"];
  const label = (st: string): string => (st === "completed" ? "완료" : (STEP_KO[st] ?? st));
  const keys = [...order, ...Object.keys(stages).filter((st) => !order.includes(st))];
  return keys.map((st) => ({ id: st, label: label(st), v: stages[st] ?? 0 }));
}

/**
 * 기록 · 사용량 요약 글(화면 읽기 프로그램용 요약 · 캐시 꺾은선 값).
 * 대화 기록 읽기가 꺼진 기본 상태에서는 서버가 totals 를 null 로 준다. 그때도 던지지 않는다.
 */
export function usageSummary(u: Loose): { summary: string; cacheVals: Array<number | null>; cacheSummary: string } {
  const daily = (u.daily ?? []) as Array<{ date: string; sum: number }>;
  const sum = (u.totals as Loose | null)?.sum ?? 0;
  const peak = daily.reduce<{ date: string; sum: number } | null>((a, d) => (a === null || d.sum > a.sum ? d : a), null);
  const peakText = peak?.sum ? `가장 많은 날 ${dayLabel(peak.date).text} ${fmtTokens(peak.sum)}.` : "기록이 없습니다.";
  const summary = `하루 토큰 ${daily.length}일 합 ${fmtTokens(sum)}. ${peakText}`;
  const cacheDaily = ((u.cache as Loose | null)?.daily ?? []) as Array<{ date: string; ratio: number | null }>;
  const cacheVals = cacheDaily.map((d) => (d.ratio === null ? null : Math.round(d.ratio * 1000) / 10));
  const cacheSummary = cacheVals.some((v) => v !== null)
    ? `캐시 읽기 비율 평균 ${pct((u.cache as Loose).average)}. ${cacheDaily.map((d) => `${dayLabel(d.date).short} ${d.ratio === null ? "-" : pct(d.ratio)}`).join(", ")}`
    : "캐시 읽기 기록이 없습니다";
  return { summary, cacheVals, cacheSummary };
}

/** 날마다 하루 합계 → 점 격자 입력(최근 순서대로, 요일 정렬) */
export function activityDays(daily: Array<{ date: string; sum: number }>): Array<{ date: string; v: number }> {
  return daily.map((d) => ({ date: d.date, v: d.sum }));
}
