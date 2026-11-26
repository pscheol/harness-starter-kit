// 게이트 레일(SVG): 지난 구간은 단계 색, 사람 승인을 기다리는 자리는 빨강(고리), 진행 중은 속 빈 테두리. 글자 설명은 title · aria-label.
// 색은 테마 토큰(--hk-*)이라 테마를 바꾸면 같이 바뀐다. 폭은 칸 수로 정하고 viewBox 로 줄어든다(가로 스크롤 없음).
// 아래쪽은 이슈 단계를 보이는 화면(홈 · 진행 · 문서 · 이슈 상세)이 같이 쓰는 작은 도우미다: 레일 모양 · 상태 글 · 문서 상태 · 자연 정렬.
import { VStack } from "@astryxdesign/core/Stack";
import { GATE_FAMILY, GATE_KO, RAIL_STATE_KO, railSpec, stageText, type RailStep } from "../lib/format";
import type { Loose } from "../lib/types";
import { Tag, type Tone } from "./common";

const FAMILY_VAR: Record<string, string> = { design: "var(--hk-design)", build: "var(--hk-build)", ops: "var(--hk-ops)" };
const GATE = "var(--hk-gate)";
const TODO = "var(--hk-todo)";
const LINE = "var(--color-border)";

export interface GateRailProps {
  spec: RailStep[];
  /** true 면 게이트 이름을 아래에 쓴다 */
  labels?: boolean;
}

const diamond = (x: number, cy: number, r: number): string => `M${x} ${cy - r} L${x + r} ${cy} L${x} ${cy + r} L${x - r} ${cy} Z`;

/** 화면 읽기 프로그램용 요약: "지금 설계 진행 중 · 통과 요구사항 · 아직 작업 목록, 병합 요청" */
export function railSummary(spec: RailStep[]): string {
  const of = (state: RailStep["state"]): string[] => spec.filter((s) => s.state === state).map((s) => GATE_KO[s.gate] ?? s.gate);
  const parts: string[] = [];
  const wait = of("wait");
  const now = of("now");
  if (wait.length) parts.push(`지금 ${wait.join(", ")} ${RAIL_STATE_KO.wait}`);
  else if (now.length) parts.push(`지금 ${now.join(", ")} ${RAIL_STATE_KO.now}`);
  else if (spec.length && spec.every((s) => s.state === "ok")) parts.push("모든 단계 통과");
  const ok = of("ok");
  const todo = of("todo");
  if (ok.length && !spec.every((s) => s.state === "ok")) parts.push(`${RAIL_STATE_KO.ok} ${ok.join(", ")}`);
  if (todo.length) parts.push(`${RAIL_STATE_KO.todo} ${todo.join(", ")}`);
  return parts.join(" · ") || "단계 정보 없음";
}

export function GateRail({ spec, labels = false }: GateRailProps) {
  const step = labels ? 62 : 17;
  const size = labels ? 11 : 8;
  const pad = labels ? 30 : 7;
  const n = spec.length;
  const w = pad * 2 + step * Math.max(0, n - 1);
  const h = labels ? 40 : 14;
  const cy = labels ? 12 : 7;
  const fam = (gate: string): string => FAMILY_VAR[GATE_FAMILY[gate] ?? "design"] as string;
  const summary = railSummary(spec);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`단계: ${summary}`} className="hk-gate-rail" focusable="false">
      <title>{`단계: ${summary}`}</title>
      {spec.slice(0, -1).map((s, i) => {
        const next = spec[i + 1] as RailStep;
        const stroke = s.state === "ok" || s.state === "skip" ? fam(next.gate) : LINE;
        return <line key={`${s.gate}-${next.gate}`} x1={pad + i * step} y1={cy} x2={pad + (i + 1) * step} y2={cy} stroke={stroke} strokeWidth={labels ? 2 : 1.5} />;
      })}
      {spec.map((s, i) => {
        const x = pad + i * step;
        let r = size / 2;
        let fill = "var(--color-background-card)";
        let stroke = TODO;
        if (s.state === "ok") fill = stroke = fam(s.gate);
        else if (s.state === "wait") {
          fill = stroke = GATE;
          r += labels ? 2 : 1.5;
        } else if (s.state === "now") stroke = fam(s.gate);
        else if (s.state === "skip") {
          stroke = LINE;
          r -= 1.5;
        }
        return (
          <g key={s.gate}>
            {s.state === "wait" ? <path d={diamond(x, cy, r + 3)} fill="none" stroke={GATE} strokeOpacity={0.3} strokeWidth={1.5} /> : null}
            <path d={diamond(x, cy, r)} fill={fill} stroke={stroke} strokeWidth={s.state === "now" ? 2 : 1.5} strokeLinejoin="round" />
            {s.state === "now" ? <path d={diamond(x, cy, Math.max(1, r - 2.6))} fill={fam(s.gate)} /> : null}
            {labels ? (
              <text x={x} y={h - 2} textAnchor="middle" className={s.state === "wait" ? "hk-gate-label hk-gate-label-wait" : "hk-gate-label"}>
                {GATE_KO[s.gate] ?? s.gate}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** 이슈가 거치는 문서 · 병합 게이트(보드 기준) */
const ISSUE_FLOW = ["requirements", "design", "tasks", "mr", "done"];
/** 이슈 stage → 지금 서 있는 게이트 */
const CURRENT_GATE: Record<string, string> = { requirements: "requirements", design: "design", tasks: "tasks", impl: "mr", verify: "mr", mr: "mr", done: "done" };

/**
 * 이슈 하나의 레일 모양. 게이트 판정이 없는 이슈(예전 배치에서 읽은 이슈)는 보드 단계로 칸을 채운다 —
 * 판정이 없다고 모든 칸을 '해당 없음'으로 그리면 끝난 이슈가 아무 단계도 안 지난 것처럼 보인다.
 * '해당 없음' 칸과, 아직 닿지 않은 배포 칸은 그리지 않는다(Intent 를 쓰지 않는 팀 · 배포 기록이 없는 팀).
 */
export function issueRail(flowGates: string[], issue: Loose | null | undefined): RailStep[] {
  if (!issue) return [];
  const judged = Array.isArray(issue.gates) && issue.gates.length > 0;
  let spec: RailStep[];
  if (judged) spec = railSpec(flowGates, issue);
  else {
    const gates = flowGates.filter((g) => ISSUE_FLOW.includes(g));
    const order = gates.length ? gates : ISSUE_FLOW;
    const done = issue.stage === "completed";
    const at = order.indexOf(CURRENT_GATE[issue.stage as string] ?? "");
    const stateAt = (i: number): RailStep["state"] => {
      if (done) return "ok";
      if (at < 0 || i > at) return "todo";
      return i < at ? "ok" : "now";
    };
    spec = order.map((g, i) => ({ gate: g, state: stateAt(i) }));
  }
  return spec.filter((s) => s.state !== "skip" && !(s.gate === "deploy" && s.state === "todo"));
}

/** 이슈 상태 한 줄(색 + 글). 빨강은 사람 승인 대기에만 쓴다. */
export function issueStatus(issue: Loose): { tone: Tone; label: string } {
  if (issue.waitingOn) return { tone: "gate", label: `${GATE_KO[issue.waitingOn.gate] ?? issue.waitingOn.gate} 승인 대기` };
  if (issue.stage === "completed") return { tone: "ops", label: "완료" };
  const label = (issue.boardStatus?.label as string | undefined) ?? stageText(issue);
  return { tone: issue.stage === "requirements" || issue.stage === "design" ? "design" : "build", label };
}

const VERIFY_KO: Record<string, string> = { passed: "통과", failed: "실패", incomplete: "덜 끝남", running: "도는 중" };
export const verifyText = (status: string | null | undefined): string => (status ? (VERIFY_KO[status] ?? status) : "-");

/** 사람이 할 일로 이어지는 표시(막는 리뷰 지적 · 실패한 검증) */
export function issueFlags(issue: Loose): string[] {
  const f: string[] = [];
  if (issue.review?.open?.CRITICAL) f.push(`CRITICAL ${issue.review.open.CRITICAL}`);
  if (issue.review?.open?.HIGH) f.push(`HIGH ${issue.review.open.HIGH}`);
  if (issue.verify && ["failed", "incomplete"].includes(issue.verify.status ?? "")) f.push(`검증 ${verifyText(issue.verify.status)}`);
  return f;
}

/** 상태 글 + 작은 레일. 표 · 목록에서 레일에 보이는 이름이 없다는 지적 때문에 글을 늘 위에 둔다. */
export function IssueStage({ issue, gates }: { issue: Loose; gates: string[] }) {
  const st = issueStatus(issue);
  const spec = issueRail(gates, issue);
  return (
    <VStack gap={1}>
      <Tag tone={st.tone} {...(st.tone === "gate" ? { icon: "clock" as const } : {})} label={st.label} />
      {spec.length ? <GateRail spec={spec} /> : null}
    </VStack>
  );
}

/** 사람이 쓴 제목. 없거나 폴더 이름과 같으면 null(키에 이미 들어 있는 글을 두 번 쓰지 않는다) */
export function issueTitle(issue: Loose): string | null {
  const t = typeof issue.title === "string" ? issue.title.trim() : "";
  return t && t !== issue.name && t !== issue.key ? t : null;
}

const COLLATOR = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
/** 이슈 키 자연 정렬: 1, 2, … 10, 11 (PROJ-2 < PROJ-10) */
export const byIssueKey = (a: { key: string }, b: { key: string }): number => COLLATOR.compare(a.key, b.key);

/** 문서 하나의 상태(한국어 한 줄). 승인 기록이 있으면 그것을, 없으면 문서 머리의 상태를 쓴다. */
export function docState(name: string, doc: Loose | null | undefined): { tone: Tone; label: string } | null {
  if (!doc) return null;
  const isTasks = name === "tasks";
  if (doc.approval === "valid") return { tone: "ops", label: "승인됨" };
  // 작업 목록은 체크 표시가 바뀌는 문서라 승인 뒤 바뀜이 정상이다
  if (doc.approval === "stale" && !isTasks) return { tone: "build", label: "승인 뒤 바뀜" };
  if (doc.approval === "invalid") return { tone: "gate", label: "승인자 확인 필요" };
  const word = String(doc.state ?? doc.status ?? "")
    .trim()
    .toLowerCase()
    .split(/[\s(|]/)[0];
  const map: Record<string, [Tone, string]> = {
    approved: ["ops", "승인됨"],
    "in-review": ["design", "검토 중"],
    review: ["design", "검토 중"],
    draft: ["line", "초안"],
    completed: ["ops", "완료"],
    done: ["ops", "완료"],
    active: ["build", "진행 중"],
    check: ["build", "검증 중"],
    superseded: ["line", "대체됨"],
  };
  const hit = map[word ?? ""];
  if (hit) return { tone: hit[0], label: hit[1] };
  if (isTasks && doc.approval === "stale") return { tone: "ops", label: "승인됨" };
  return { tone: "line", label: "상태 없음" };
}
