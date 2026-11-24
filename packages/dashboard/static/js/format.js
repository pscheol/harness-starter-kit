// 화면 공용 순수 함수(DOM 없음). vitest 가 직접 불러 시험한다.

export const GATE_KO = { codebase: "기존 코드", intent: "Intent", plans: "기획물", requirements: "요구사항", design: "설계", tasks: "tasks", mr: "MR", done: "완료", deploy: "배포" };
/** 게이트 → 단계 색 계열(설계 · 구현 · 반영/운영) */
export const GATE_FAMILY = { codebase: "design", intent: "design", plans: "design", requirements: "design", design: "design", tasks: "build", mr: "build", done: "ops", deploy: "ops" };
export const STAGE_KO = { design: "설계", implement: "구현", verify: "검증", docs: "반영", ops: "운영" };
export const STAGE_CLASS = { design: "design", implement: "build", verify: "build", docs: "ops", ops: "ops" };
export const STEP_KO = { requirements: "요구사항", design: "설계", tasks: "tasks", impl: "구현", verify: "검증", mr: "MR", done: "완료", deploy: "배포" };
export const ROLE_KO = { design: "설계", implement: "구현", review: "리뷰", docs: "문서", unknown: "역할 모름" };
export const HARNESS_KO = { claude: "Claude Code", codex: "Codex", kiro: "Kiro", cursor: "Cursor", gemini: "Gemini" };
export const HARNESS_LETTER = { claude: "C", codex: "X", kiro: "K", cursor: "U", gemini: "G" };

/** 1234 → "1.2K", 21_900_000 → "21.9M" */
export function fmtTokens(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function fmtBytes(n) {
  if (n === null || n === undefined) return "-";
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 ** 3).toFixed(1)}GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${n}B`;
}

export function fmtMs(ms) {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}초`;
  const m = Math.floor(s / 60);
  return `${m}분 ${Math.round(s - m * 60)}초`;
}

export function pct(r, digits = 0) {
  return r === null || r === undefined ? "-" : `${(r * 100).toFixed(digits)}%`;
}

const pad2 = (n) => String(n).padStart(2, "0");

/** "10:52" (오늘) · "11-23 10:52" (오늘이 아니면). now 를 넘기면 시험이 고정한다. */
export function clock(iso, now = new Date()) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const same = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return same ? hm : `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hm}`;
}

/** 방금 · 3분 전 · 2시간 전 · 5일 전 */
export function ago(iso, now = new Date()) {
  if (!iso) return "-";
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "-";
  if (ms < 60_000) return "방금";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`;
  return `${Math.floor(ms / 86_400_000)}일 전`;
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function dayLabel(dateText) {
  const [y, m, d] = dateText.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { short: `${m}/${d}`, week: WEEK[dt.getDay()], text: `${m}월 ${d}일 ${WEEK[dt.getDay()]}` };
}

/** 이슈 게이트 판정 → 게이트 레일 모양(ok · wait · now · skip · todo). gates 는 flow.gates 순서다. */
export function railSpec(flowGates, issue) {
  const out = [];
  const results = new Map((issue?.gates ?? []).map((g) => [g.gate, g]));
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

export const RAIL_STATE_KO = { ok: "통과", wait: "사람 승인 대기", now: "진행 중", skip: "해당 없음", todo: "아직" };

/** 한 줄 상태 글: 이슈 stage → 사람이 읽는 말 */
export function stageText(issue) {
  if (!issue) return "";
  if (issue.stage === "completed") return "완료";
  if (issue.waitingOn) return `${GATE_KO[issue.waitingOn.gate] ?? issue.waitingOn.gate} 승인 대기`;
  return `${STEP_KO[issue.stage] ?? GATE_KO[issue.stage] ?? issue.stage} 진행`;
}

export const KIND_KO = {
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
export const TODO_GROUPS = [
  { id: "blocked", title: "막힌 것", hint: "열린 CRITICAL · HIGH · 실패한 품질 게이트", match: (t) => t.rank === 1 },
  { id: "mine", title: "승인 대기", hint: "내 git 사용자가 승인자인 것", match: (t) => t.rank === 2 },
  { id: "questions", title: "답할 질문", hint: "[NEEDS CLARIFICATION] 이 남은 문서 · 열린 질문", match: (t) => t.rank === 3 },
  { id: "verify", title: "검증 · 다시 승인", hint: "마지막 검증이 통과가 아닌 것 · 승인 뒤 바뀐 문서", match: (t) => t.rank === 4 || t.rank === 5 },
  { id: "others", title: "다른 사람 승인 대기", hint: "approvers 에 내 git 사용자가 없다", match: (t) => t.rank === 6 },
  { id: "cleanup", title: "정리 · 점검", hint: "끝난 worktree · 하네스 점검 · 오래된 대기함", match: (t) => t.rank >= 7 },
];

export function groupTodos(todo, onlyMine = false) {
  const list = onlyMine ? todo.filter((t) => t.mine || t.rank <= 2) : todo;
  return TODO_GROUPS.map((g) => ({ ...g, items: list.filter(g.match) })).filter((g) => g.items.length);
}

/** 라우트 → 화면 이름. 주소의 `/p/<id>` 접두는 base 로 따로 뗀다. */
export function parseRoute(pathname, search = "") {
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
export function menuOf(route) {
  const n = route.name;
  if (n === "flow" || n === "progress" || n === "intent") return "progress";
  if (n === "issue" || n === "questions" || n === "docs") return "docs";
  return n;
}

export const PROMPT_KINDS = [
  ["doc-changed", "문서를 고쳤다"],
  ["answers-ready", "답이 모였다"],
  ["approved", "승인했다"],
  ["changes-requested", "수정을 요청한다"],
  ["review-findings", "리뷰 지적을 처리한다"],
  ["custom", "직접 쓴다"],
];

/** 사용량 차트용: byRole 를 역할 순서대로 쌓는 조각 */
export function stackParts(daily, roles) {
  return daily.map((d) => ({ date: d.date, parts: roles.map((r) => ({ role: r, v: d.byRole[r] ?? 0 })), sum: d.sum }));
}
