/* S12 흐름 — 예시 데이터.
 * 실제 화면은 .agents/docs/intents/<INT>/units.json(Unit · dependsOn · provides)과
 * 이슈 문서 머리(status) · 승인 기록 · 검증 결과 · 세션 목록을 읽어 이 모양을 만든다.
 * 진행 상태는 units.json에 두지 않는다(08 §3.5).
 */

export const ME = { email: "jiyoon.kim@acme.dev", groups: ["po"] };

export const READ_AT = "10:52";

/* 여덟 단계. gate = 사람이 승인하는 자리(마름모), 아니면 작업 단계(동그라미).
 * stage는 색: design 파랑 · build 앰버 · ops 청록(app.js의 STAGE_OF와 같다). */
export const STEPS = [
  { id: "requirements", label: "requirements", stage: "design", gate: true },
  { id: "design", label: "design", stage: "design", gate: true },
  { id: "tasks", label: "tasks", stage: "build", gate: true },
  { id: "build", label: "구현", stage: "build", gate: false },
  { id: "verify", label: "검증", stage: "build", gate: false },
  { id: "mr", label: "MR", stage: "build", gate: true },
  { id: "done", label: "완료", stage: "ops", gate: true },
  { id: "deploy", label: "배포", stage: "ops", gate: true }
];

export const STEP_STATE_KO = { ok: "승인됨", now: "진행 중", wait: "승인 대기", todo: "아직" };

export const INTENT = {
  key: "INT-7",
  title: "결제 개편",
  dir: ".agents/docs/intents/INT-7-payment-revamp",
  design: "킷 설계",
  approved: "11-20 김지윤",
  questionsOpen: 1
};

export const AREAS = ["payment", "settlement", "notify", "contract"];

export const STATE_FILTERS = [
  { id: "all", label: "모두" },
  { id: "wait", label: "승인 대기" },
  { id: "blocked", label: "막힘" },
  { id: "active", label: "진행 중" }
];

export const HARNESS = { cc: ["C", "Claude Code"], cx: ["X", "Codex"], kr: ["K", "Kiro"] };

/* steps: { 단계 id: [상태, 메모] } — 없는 단계는 todo */
export const UNITS = [
  {
    id: "U-4",
    issue: "HDRV3D-24",
    title: "API 결제 이벤트",
    kind: "contract",
    area: "contract",
    dependsOn: [],
    provides: ["api:payments.v2", "event:payment.completed", "event:payment.failed"],
    steps: {
      requirements: ["ok", "11-19 김지윤"],
      design: ["ok", "11-20 이준호 · §6 계약 절"],
      tasks: ["todo", "설계 세션 차례 · 세션 없음"]
    },
    status: { text: "design 승인됨 · 다음 tasks", tone: "design" },
    boltsEst: 2,
    flags: { wait: false, blocked: false, active: false },
    session: null,
    todos: [],
    approveWhy: "기다리는 승인이 없다 · tasks가 아직 없다"
  },
  {
    id: "U-1",
    issue: "HDRV3D-21",
    title: "결제수단 등록",
    kind: "feature",
    area: "payment",
    dependsOn: ["U-4"],
    consumes: ["api:payments.v2"],
    steps: {
      requirements: ["ok", "11-19 김지윤"],
      design: ["ok", "11-20 이준호"],
      tasks: ["ok", "11-23 09:51 이준호"],
      build: ["now", "Bolt 2/4 끝 · Bolt 3 changed 검증 실패 10:44"],
      mr: ["todo", "MR 아직 없음"]
    },
    status: { text: "구현 중", tone: "build" },
    bolts: [2, 4],
    blocking: "CRITICAL 1",
    flags: { wait: false, blocked: true, active: true },
    session: { name: "api-worker", h: "cc", state: "일하는 중 · 도구 호출 4분" },
    branch: "feat/HDRV3D-21-payment-methods",
    todos: [
      {
        title: "CRITICAL 1 · gitleaks · PG 시크릿 키",
        why: "changed 검증 실패 10:44 · 열려 있으면 MR을 승인할 수 없다",
        act: "검증 보기",
        href: "S06-verify.html"
      }
    ],
    approveWhy: "기다리는 승인이 없다 · 구현 중이고 CRITICAL 1이 열려 있다"
  },
  {
    id: "U-2",
    issue: "HDRV3D-22",
    title: "정산 주기와 지급",
    kind: "feature",
    area: "settlement",
    dependsOn: ["U-4", "U-1"],
    consumes: ["event:payment.completed"],
    steps: {
      requirements: ["ok", "11-21 김지윤"],
      design: ["wait", "1일째 · approvers dev"]
    },
    status: { text: "design 승인 대기", tone: "gate", sub: "approvers dev" },
    boltsEst: 3,
    flags: { wait: true, blocked: false, active: false },
    approval: { step: "design", approvers: ["dev"] },
    session: null,
    todos: [
      {
        title: "design 승인 대기",
        why: "1일째 · approvers dev · 이 체크아웃의 git 사용자는 없다",
        act: "열기",
        href: "S03-issue.html"
      }
    ],
    approveWhy: "design approvers는 dev 그룹이다. 이 체크아웃의 git 사용자(jiyoon.kim@acme.dev)는 없다"
  },
  {
    id: "U-3",
    issue: "HDRV3D-23",
    title: "결제 실패 알림",
    kind: "feature",
    area: "notify",
    dependsOn: ["U-4", "U-2"],
    consumes: ["event:payment.failed"],
    steps: {
      requirements: ["todo", "Q5 답 대기 · 답하면 설계 세션이 쓴다"]
    },
    status: { text: "백로그", tone: "none" },
    boltsEst: 2,
    question: "Q5 답 대기",
    flags: { wait: false, blocked: true, active: false },
    session: null,
    todos: [
      {
        title: "Q5 실패 알림 채널",
        why: "선택지 3개 · 답할 그룹 po · ops · 답이 없으면 requirements를 쓰지 못한다",
        act: "답하기",
        href: "S04-questions.html"
      }
    ],
    approveWhy: "기다리는 승인이 없다 · requirements가 아직 없다"
  }
];

/* 남은 Bolt 14일(11-10 ~ 11-23 하루 끝). 날마다 tasks.md Bolt 표의 completed 수와,
 * tasks가 없는 Unit은 units.json 추정 Bolt 수(boltsEst)로 다시 센다. S02 보드의 Intent 진행과 같은 값이다. */
export const BURN = {
  end: [11, 23],
  left: [10, 10, 10, 10, 10, 10, 10, 11, 11, 11, 11, 10, 9, 9],
  notes: { 7: "범위 +1 · U-1 tasks 초안 Bolt 4개", 11: "Bolt 1 끝 · HDRV3D-21", 12: "Bolt 2 끝 · HDRV3D-21" },
  event: { i: 7, label: "범위 +1" }
};

/* Unit의 Bolt: tasks가 있으면 [끝, 전체], 없으면 추정 수 */
export function boltOf(unit) {
  if (unit.bolts) return { done: unit.bolts[0], all: unit.bolts[1], est: false };
  return { done: 0, all: unit.boltsEst || 0, est: true };
}

/* ?state=proposal: 저장된 변경 제안. 관리 페이지는 units.json을 쓰지 않고 제안 파일만 쓴다.
 * 제안 저장은 승인이 아니라 PIN을 묻지 않는다. intent 게이트 승인(approvers po · PIN) 뒤 킷이 units.json에 옮긴다.
 * 저장해도 세션에는 아무것도 보내지 않는다. */
export const PROPOSAL = {
  file: "units.proposed.json",
  by: ME.email,
  at: "10:31",
  base: "units.json sha 3be91f0",
  gate: "intent",
  approvers: "po",
  changes: [
    { op: "add", from: "U-1", to: "U-3", label: "실패 코드", why: "알림 문구에 결제수단의 실패 코드를 쓴다" },
    { op: "remove", from: "U-2", to: "U-3", why: "정산 결과 없이도 실패 알림을 보낼 수 있다" }
  ]
};

/* 흐름 틀(flow.gates)은 팀 설정이라 관리 페이지는 바꾸지 않는다(제안도 받지 않는다, 06 §3.16).
 * 화면은 지금 게이트와 바닥 네 개를 보이고, 터미널 명령을 복사하게 한다.
 * 명령은 harness-kit.json을 고치고 MR로 올린다. 바닥 아래로 줄이면 명령이 거부한다(04 §3.8). */
export const GATE_FLOOR = ["requirements", "design", "MR", "완료"];
export const GATES_NOW = ["intent", "plans", "requirements", "design", "tasks", "MR", "완료", "배포"];
export const FLOW_GATES_CMD = "npx harness-kit flow gates --add <게이트> --after <게이트>";

/* 계약이 아닌 의존에만 붙는 이름 */
export const EDGE_LABELS = { "U-1>U-2": "환불 API", "U-2>U-3": "정산 결과" };

export function stepState(unit, stepId) {
  const s = unit.steps[stepId];
  return s ? s[0] : "todo";
}

export function stepNote(unit, stepId) {
  const s = unit.steps[stepId];
  return s && s[1] ? s[1] : "";
}

/* 지금 자리: 승인되지 않은 첫 단계 */
export function currentStepIndex(unit) {
  const i = STEPS.findIndex((st) => stepState(unit, st.id) !== "ok");
  return i === -1 ? STEPS.length - 1 : i;
}

export function matchesState(unit, st) {
  if (st === "all") return true;
  return Boolean(unit.flags[st]);
}

export function countBy(units, fn) {
  return units.reduce((n, u) => (fn(u) ? n + 1 : n), 0);
}
