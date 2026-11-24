// 남은 Bolt 계단선(S12 영역 13). 값은 GET /intents/{key}/burn 의 series. 글은 요약 한 줄 + 표로 보기를 같이 둔다.
import { h } from "../dom.js";
import { dayLabel } from "../format.js";
import { HXViz } from "../viz.js";

export function burnChart(burn) {
  const host = h("div", { class: "vz" });
  const series = burn.series;
  const values = series.map((s) => s.remaining);
  const max = Math.max(4, ...values);
  const ticks = [0, Math.ceil(max / 2), max];
  const labels = series.map((s) => dayLabel(s.date).text);
  const last = series[series.length - 1];
  const summary = `남은 Bolt ${last.remaining}개(전체 ${last.total}, 끝 ${last.done}). ${series.length}일 추이: ${series.map((s) => `${dayLabel(s.date).short} ${s.remaining}`).join(", ")}`;
  const draw = () => {
    if (!host.isConnected || !host.clientWidth) return;
    HXViz.line(host, {
      values, labels, h: 120, w: host.clientWidth, step: true, area: true, line: "build", label: summary,
      m: { l: 28, r: 20, t: 10, b: 20 },
      y: { min: 0, max, ticks, fmt: (t) => String(t) },
      xTicks: [[0, dayLabel(series[0].date).short, "start"], [series.length - 1, "오늘", "end", true]],
      endLabel: (v) => String(v),
      fmt: (v) => `${v}개`,
      tip: (i) => [{ v: `${series[i].remaining}개`, n: "남은 Bolt", key: "build" }, { v: `${series[i].done}/${series[i].total}`, n: "끝 / 전체" }],
    });
  };
  const table = h("details", { class: "vz-tv" }, h("summary", null, "표로 보기"), h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "날짜별 남은 Bolt"), h("thead", null, h("tr", null, h("th", { scope: "col" }, "날짜"), h("th", { scope: "col", class: "r" }, "남음"), h("th", { scope: "col", class: "r" }, "끝/전체"))), h("tbody", null, ...series.map((s) => h("tr", null, h("td", null, dayLabel(s.date).text), h("td", { class: "r" }, String(s.remaining)), h("td", { class: "r" }, `${s.done}/${s.total}`))))));
  const wrap = h("div", null, host, table);
  requestAnimationFrame(draw);
  if (typeof ResizeObserver !== "undefined") {
    let t = 0;
    new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(draw, 120);
    }).observe(host);
  }
  return wrap;
}
