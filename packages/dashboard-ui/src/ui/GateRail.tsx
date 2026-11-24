// 게이트 레일(SVG): 지난 구간은 단계 색, 사람 승인을 기다리는 자리는 빨강(고리), 진행 중은 속 빈 테두리. 글자 설명은 title · aria-label.
// 색은 테마 토큰(--hk-*)이라 테마를 바꾸면 같이 바뀐다. 폭은 칸 수로 정하고 viewBox 로 줄어든다(가로 스크롤 없음).
import { GATE_FAMILY, GATE_KO, RAIL_STATE_KO, type RailStep } from "../lib/format";

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

export function GateRail({ spec, labels = false }: GateRailProps) {
  const step = labels ? 62 : 17;
  const size = labels ? 11 : 8;
  const pad = labels ? 30 : 7;
  const n = spec.length;
  const w = pad * 2 + step * Math.max(0, n - 1);
  const h = labels ? 40 : 14;
  const cy = labels ? 12 : 7;
  const fam = (gate: string): string => FAMILY_VAR[GATE_FAMILY[gate] ?? "design"] as string;
  const desc = spec.map((s) => `${GATE_KO[s.gate] ?? s.gate} ${RAIL_STATE_KO[s.state]}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`게이트 ${desc.join(", ")}`} className="hk-gate-rail" focusable="false">
      <title>{`게이트: ${desc.join(", ")}`}</title>
      {spec.slice(0, -1).map((s, i) => {
        const next = spec[i + 1] as RailStep;
        const stroke = s.state === "ok" || s.state === "skip" ? fam(next.gate) : LINE;
        return <line key={`l${i}`} x1={pad + i * step} y1={cy} x2={pad + (i + 1) * step} y2={cy} stroke={stroke} strokeWidth={labels ? 2 : 1.5} />;
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
