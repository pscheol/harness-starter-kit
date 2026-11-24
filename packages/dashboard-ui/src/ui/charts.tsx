// 작은 SVG 차트: astryx 에는 차트 컴포넌트가 없어(템플릿은 recharts) 토큰 색으로 직접 그린다. 무거운 차트 · 3D 라이브러리를 쓰지 않는다.
// 모든 차트는 요약 글(aria-label)을 달고, 호출하는 쪽이 "표로 보기"를 같이 둔다. 폭은 ResizeObserver 로 재서 글자 크기가 줄지 않게 한다.
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/Stack";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { dayLabel, fmtTokens } from "../lib/format";

/** 요소의 가로 폭(px). 처음에는 fallback 이다. */
export function useWidth(fallback = 320): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = (): void => setW(Math.max(120, Math.floor(el.clientWidth)));
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    let t = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(read, 80);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, []);
  return [ref, w];
}

const GRID = "var(--color-border)";
const AXIS = "var(--color-text-secondary)";

export interface LineSeries {
  values: Array<number | null>;
  /** "main": 실선 + 옅은 면, "ref": 점선(지난 기간 · 이상선) */
  kind: "main" | "ref";
  name: string;
}

export interface LineChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  /** 값을 계단으로 잇는다(남은 Bolt) */
  step?: boolean;
  yMin?: number;
  yMax?: number;
  fmt?: (v: number) => string;
  /** 차트 요약 글(aria-label) */
  summary: string;
  /** 마우스를 올리기 전 아래 한 줄(없으면 summary) */
  readout?: string;
}

/** 선 차트: 주 계열은 강조색 실선 + 옅은 면, 비교 계열은 회색 점선. 마우스를 올린 줄의 값은 아래 한 줄로 읽어 준다. */
export function LineChart({ labels, series, height = 160, step = false, yMin = 0, yMax, fmt = String, summary, readout }: LineChartProps) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 34, r: 12, t: 10, b: 22 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = yMax ?? Math.max(4, ...all);
  const n = labels.length;
  const pw = w - m.l - m.r;
  const ph = height - m.t - m.b;
  const X = (i: number): number => m.l + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const Y = (v: number): number => m.t + ph - ((v - yMin) / Math.max(1, max - yMin)) * ph;
  const path = (vals: Array<number | null>): string => {
    let d = "";
    let prev: number | null = null;
    vals.forEach((v, i) => {
      if (v === null) return;
      if (prev === null) d += `M${X(i)} ${Y(v)}`;
      else d += step ? ` H${X(i)} V${Y(v)}` : ` L${X(i)} ${Y(v)}`;
      prev = v;
    });
    return d;
  };
  const main = series.find((s) => s.kind === "main");
  const area = main && main.values.length ? `${path(main.values)} V${Y(yMin)} H${X(0)} Z` : "";
  const ticks = [yMin, Math.round((yMin + max) / 2), max];
  const idxs = n <= 6 ? labels.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <VStack gap={1}>
      <div ref={ref} className="hk-chart">
        <svg width={w} height={height} role="img" aria-label={summary} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={m.l + pw} y1={Y(t)} y2={Y(t)} stroke={GRID} strokeDasharray={t === yMin ? undefined : "2 3"} />
              <text x={m.l - 6} y={Y(t) + 4} textAnchor="end" className="hk-chart-axis" fill={AXIS}>
                {fmt(t)}
              </text>
            </g>
          ))}
          {area ? <path d={area} fill="var(--color-accent)" fillOpacity={0.1} /> : null}
          {series
            .filter((s) => s.kind === "ref")
            .map((s) => (
              <path key={s.name} d={path(s.values)} fill="none" stroke="var(--color-data-neutral)" strokeWidth={1.5} strokeDasharray="4 4" />
            ))}
          {main ? <path d={path(main.values)} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" /> : null}
          {main && hover !== null && main.values[hover] !== null && main.values[hover] !== undefined ? <circle cx={X(hover)} cy={Y(main.values[hover] as number)} r={4} fill="var(--color-accent)" /> : null}
          {idxs.map((i) => (
            <text key={i} x={X(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="hk-chart-axis" fill={AXIS}>
              {labels[i]}
            </text>
          ))}
          {labels.map((l, i) => (
            <rect key={l + i} x={X(i) - pw / Math.max(1, n - 1) / 2} y={m.t} width={Math.max(8, pw / Math.max(1, n - 1))} height={ph} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
          ))}
        </svg>
      </div>
      <Text color="secondary" size="xsm" hasTabularNumbers>
        {hover === null ? (readout ?? summary) : `${labels[hover]} · ${series.map((s) => `${s.name} ${s.values[hover] === null || s.values[hover] === undefined ? "-" : fmt(s.values[hover] as number)}`).join(" · ")}`}
      </Text>
    </VStack>
  );
}

/** 작은 꺾은선(KPI 카드 오른쪽). 값이 없으면 아무것도 그리지 않는다. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 88;
  const h = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 4 - ((v - min) / span) * (h - 8)}`);
  return (
    <svg width={w} height={h} role="img" aria-label={label} className="hk-spark">
      <polyline points={pts.join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface StackDay {
  date: string;
  sum: number;
  byRole: Record<string, number>;
}

/** 역할 이름 → 데이터 시각화 토큰(강조색은 오늘 · 가장 큰 값에만 쓰지 않고, 역할은 무채색 계열 + 약한 색으로 구분) */
export const ROLE_COLOR: Record<string, string> = {
  design: "var(--color-data-blue-3)",
  implement: "var(--color-data-orange-3)",
  review: "var(--color-data-neutral)",
  docs: "var(--color-data-teal-3)",
  "역할 없음": "var(--hk-todo)",
};
export const ROLE_NAME: Record<string, string> = { design: "설계", implement: "구현", review: "리뷰", docs: "문서", "역할 없음": "역할 없음" };

export function StackedBars({ daily, roles, height = 200, summary }: { daily: StackDay[]; roles: string[]; height?: number; summary: string }) {
  const [ref, w] = useWidth();
  const m = { l: 40, r: 8, t: 18, b: 22 };
  const max = Math.max(1, ...daily.map((d) => d.sum));
  const pw = w - m.l - m.r;
  const ph = height - m.t - m.b;
  const band = pw / Math.max(1, daily.length);
  const bw = Math.min(26, Math.max(4, band - 6));
  const Y = (v: number): number => m.t + ph - (v / max) * ph;
  const every = Math.ceil(daily.length / Math.max(1, Math.floor(pw / 44)));
  return (
    <div ref={ref} className="hk-chart">
      <svg width={w} height={height} role="img" aria-label={summary}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + pw} y1={Y(max * t)} y2={Y(max * t)} stroke={GRID} strokeDasharray={t === 0 ? undefined : "2 3"} />
            <text x={m.l - 6} y={Y(max * t) + 4} textAnchor="end" className="hk-chart-axis" fill={AXIS}>
              {fmtTokens(Math.round(max * t))}
            </text>
          </g>
        ))}
        {daily.map((d, i) => {
          const cx = m.l + band * i + band / 2;
          let y0 = Y(0);
          return (
            <g key={d.date}>
              {roles.map((r) => {
                const v = d.byRole[r] ?? 0;
                if (v <= 0) return null;
                const hh = Math.max(1, (v / max) * ph);
                y0 -= hh;
                return (
                  <rect key={r} x={cx - bw / 2} y={y0} width={bw} height={Math.max(0.5, hh - 1)} rx={2} fill={ROLE_COLOR[r] ?? "var(--color-data-neutral)"}>
                    <title>{`${dayLabel(d.date).text} · ${ROLE_NAME[r] ?? r} ${fmtTokens(v)}`}</title>
                  </rect>
                );
              })}
              {d.sum && i === daily.length - 1 ? (
                <text x={cx} y={Y(d.sum) - 5} textAnchor="middle" className="hk-chart-axis" fill="var(--color-text-primary)">
                  {fmtTokens(d.sum)}
                </text>
              ) : null}
              {i % every === 0 || i === daily.length - 1 ? (
                <text x={cx} y={height - 6} textAnchor="middle" className="hk-chart-axis" fill={AXIS}>
                  {i === daily.length - 1 ? "오늘" : dayLabel(d.date).short}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 점 격자(요일 × 주): 값이 클수록 강조색이 진하다. 값이 하나도 없으면 호출하는 쪽이 그리지 않는다. */
export function DotMatrix({ days, summary }: { days: Array<{ date: string; v: number }>; summary: string }) {
  const max = Math.max(1, ...days.map((d) => d.v));
  const weeks: Array<Array<{ date: string; v: number } | null>> = [];
  days.forEach((d) => {
    const dow = new Date(`${d.date}T00:00:00`).getDay();
    if (!weeks.length || dow === 0) weeks.push(Array.from({ length: 7 }, () => null));
    (weeks[weeks.length - 1] as Array<{ date: string; v: number } | null>)[dow] = d;
  });
  const cell = 12;
  const gap = 4;
  const w = weeks.length * (cell + gap);
  const h = 7 * (cell + gap);
  const level = (v: number): number => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  return (
    <svg width={w} height={h} role="img" aria-label={summary} className="hk-dots">
      {weeks.flatMap((wk, wi) =>
        wk.map((d, di) =>
          d ? (
            <circle key={d.date} cx={wi * (cell + gap) + cell / 2} cy={di * (cell + gap) + cell / 2} r={cell / 2 - (level(d.v) === 0 ? 2 : 0)} fill={level(d.v) === 0 ? "var(--color-border)" : "var(--color-accent)"} fillOpacity={level(d.v) === 0 ? 1 : 0.25 + level(d.v) * 0.19}>
              <title>{`${dayLabel(d.date).text} · ${d.v}`}</title>
            </circle>
          ) : null,
        ),
      )}
    </svg>
  );
}

/** 가로 막대 목록(이슈별 토큰 · 단계별 이슈 수): 가장 큰 값만 강조색, 나머지는 옅은 회색 */
export function HBars({ rows, fmt = String, label }: { rows: Array<{ id: string; label: ReactNode; v: number }>; fmt?: (v: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  const top = Math.max(...rows.map((r) => r.v));
  return (
    <VStack gap={2} role="list" aria-label={label}>
      {rows.map((r) => (
        <div key={r.id} role="listitem" className="hk-hbar">
          <span className="hk-hbar-label">{r.label}</span>
          <svg className="hk-hbar-track" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect x={0} y={0} width={100} height={8} rx={4} fill="var(--color-neutral)" />
            <rect x={0} y={0} width={Math.max(2, (r.v / max) * 100)} height={8} rx={4} fill={r.v === top && r.v > 0 ? "var(--color-accent)" : "var(--color-data-neutral)"} />
          </svg>
          <Text weight="semibold" hasTabularNumbers>
            {fmt(r.v)}
          </Text>
        </div>
      ))}
    </VStack>
  );
}

/** 칸 수로 이어 붙인 한 줄 막대(전체 프로젝트 · 단계별): 칸마다 색을 받는다 */
export function SegBar({ parts, label }: { parts: Array<{ key: string; n: number; color: string; title: string }>; label: string }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  let x = 0;
  return (
    <svg className="hk-segbar" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label={label} focusable="false">
      <rect x={0} y={0} width={100} height={8} rx={4} fill="var(--color-neutral)" />
      {total
        ? parts.map((p) => {
            const w = (p.n / total) * 100;
            const r = <rect key={p.key} x={x} y={0} width={w} height={8} fill={p.color}><title>{p.title}</title></rect>;
            x += w;
            return r;
          })
        : null}
    </svg>
  );
}
