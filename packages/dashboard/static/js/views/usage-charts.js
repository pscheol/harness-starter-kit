// S13 차트: 하루 토큰(역할별 쌓기) · 이슈별 막대 · 캐시 읽기 비율. 글은 textContent 로만 넣고, 모든 차트에 요약 글 + 표로 보기를 같이 둔다.
import { h } from "../dom.js";
import { dayLabel, fmtTokens, pct } from "../format.js";
import { HXViz } from "../viz.js";

export const ROLE_CLASS = { design: "design", implement: "build", review: "ink", docs: "ops", "역할 없음": "faint" };
const ROLE_NAME = { design: "설계", implement: "구현", review: "리뷰", docs: "문서", "역할 없음": "역할 없음" };
export const roleName = (r) => ROLE_NAME[r] ?? r;

function legend(roles) {
  return h("div", { class: "vz-legend", "aria-label": "역할 범례" }, ...roles.map((r) => h("span", null, h("i", { class: `vz-sw ${ROLE_CLASS[r] ?? "ink"}` }), roleName(r))));
}

/** 하루 토큰: 날마다 역할별로 쌓은 세로 막대. daily: [{date, sum, byRole}] */
export function dailyStack(daily, roles) {
  const host = h("div", { class: "vz" });
  const max = Math.max(1, ...daily.map((d) => d.sum));
  const peak = daily.reduce((a, d) => (d.sum > a.sum ? d : a), daily[0] ?? { sum: 0, date: "" });
  const total = daily.reduce((s, d) => s + d.sum, 0);
  const summary = `하루 토큰 ${daily.length}일 합 ${fmtTokens(total)}. ${peak.sum ? `가장 많은 날 ${dayLabel(peak.date).text} ${fmtTokens(peak.sum)}.` : "기록이 없다."}`;
  const draw = () => {
    if (!host.isConnected || !host.clientWidth) return;
    host.textContent = "";
    const W = host.clientWidth;
    const H = 220;
    const m = { l: 38, r: 8, t: 20, b: 24 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const band = pw / Math.max(1, daily.length);
    const bw = Math.min(28, band - 6);
    const Y = (v) => m.t + ph - (v / max) * ph;
    const svg = HXViz.svgRoot(host, W, H, summary, true);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const v = max * t;
      HXViz.el("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: t === 0 ? "vz-base" : "vz-grid" }, svg);
      HXViz.text(svg, m.l - 6, Y(v) + 4, fmtTokens(Math.round(v)), "vz-ax", "end");
    }
    daily.forEach((d, i) => {
      const cx = m.l + band * i + band / 2;
      let y0 = Y(0);
      for (const r of roles) {
        const v = d.byRole[r] ?? 0;
        if (v <= 0) continue;
        const hh = Math.max(1, (v / max) * ph);
        y0 -= hh;
        const rect = HXViz.el("rect", { x: cx - bw / 2, y: y0, width: bw, height: Math.max(0.5, hh - 1), class: `vz-bar ${ROLE_CLASS[r] ?? "ink"}` }, svg);
        const t = HXViz.el("title", null, rect);
        t.textContent = `${dayLabel(d.date).text} · ${roleName(r)} ${fmtTokens(v)}`;
      }
      if (d.sum) HXViz.text(svg, cx, Y(d.sum) - 5, fmtTokens(d.sum), i === daily.length - 1 || d === peak ? "vz-val" : "vz-ax");
      if (daily.length <= 14 || i % Math.ceil(daily.length / 14) === 0 || i === daily.length - 1) HXViz.text(svg, cx, H - 6, i === daily.length - 1 ? "오늘" : dayLabel(d.date).short, `vz-ax${i === daily.length - 1 ? " now" : ""}`);
    });
  };
  const table = h("details", { class: "vz-tv" }, h("summary", null, "표로 보기"), h("div", { class: "table-wrap" }, h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "날짜 · 역할별 토큰"), h("thead", null, h("tr", null, h("th", { scope: "col" }, "날짜"), ...roles.map((r) => h("th", { scope: "col", class: "r" }, roleName(r))), h("th", { scope: "col", class: "r" }, "합"))), h("tbody", null, ...daily.map((d) => h("tr", null, h("td", null, dayLabel(d.date).text), ...roles.map((r) => h("td", { class: "r" }, fmtTokens(d.byRole[r] ?? 0))), h("td", { class: "r" }, fmtTokens(d.sum))))))));
  observe(host, draw);
  return h("div", { class: "stack-y" }, legend(roles), host, h("p", { class: "muted small" }, summary), table);
}

/** 이슈별 토큰: 가로 막대(값이 큰 순) */
export function issueBars(byIssue) {
  const max = Math.max(1, ...byIssue.map((x) => x.sum));
  return h("ul", { class: "issue-bars", "aria-label": "이슈별 토큰" }, ...byIssue.slice(0, 10).map((x) => {
    const bar = h("span", { class: "bar-fill" });
    bar.style.width = `${Math.max(2, Math.round((x.sum / max) * 100))}%`;
    return h("li", null, h("code", { class: "key" }, x.issue), h("span", { class: "bar-track", "aria-hidden": "true" }, bar), h("b", null, fmtTokens(x.sum)));
  }));
}

/** 캐시 읽기 비율: 날마다 */
export function cacheLine(cache) {
  const host = h("div", { class: "vz" });
  const vals = cache.daily.map((d) => (d.ratio === null ? null : Math.round(d.ratio * 1000) / 10));
  const real = vals.filter((v) => v !== null);
  const lo = real.length ? Math.max(0, Math.floor((Math.min(...real) - 5) / 10) * 10) : 0;
  const labels = cache.daily.map((d) => dayLabel(d.date).text);
  const last = [...vals].reverse().find((v) => v !== null);
  const summary = real.length ? `캐시 읽기 비율 평균 ${pct(cache.average)}, 최근 ${last}%. ${cache.daily.map((d) => `${dayLabel(d.date).short} ${d.ratio === null ? "-" : pct(d.ratio)}`).join(", ")}` : "캐시 읽기 기록이 없다";
  const draw = () => {
    if (!host.isConnected || !host.clientWidth || !real.length) return;
    HXViz.line(host, {
      values: vals, labels, h: 150, w: host.clientWidth, line: "design", label: summary, m: { l: 38, r: 28, t: 10, b: 22 },
      y: { min: lo, max: 100, ticks: [lo, Math.round((lo + 100) / 2), 100], fmt: (t) => `${t}%` },
      xTicks: [[0, dayLabel(cache.daily[0].date).short, "start"], [vals.length - 1, "오늘", "end", true]],
      endLabel: (v) => `${v}%`, fmt: (v) => `${v}%`,
      tip: (i) => [{ v: vals[i] === null ? "-" : `${vals[i]}%`, n: "캐시 읽기", key: "design" }],
    });
  };
  observe(host, draw);
  return h("div", { class: "stack-y" }, real.length ? host : h("p", { class: "muted" }, "기록이 없다"), h("p", { class: "muted small" }, summary));
}

function observe(host, draw) {
  requestAnimationFrame(draw);
  if (typeof ResizeObserver === "undefined") return;
  let t = 0;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(draw, 120);
  }).observe(host);
}
