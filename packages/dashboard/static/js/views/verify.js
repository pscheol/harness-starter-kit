// S06 검증: 마지막 검증과 단계별 시간, 품질 게이트, 정적 분석, 리뷰 지적. 읽기만 한다(리뷰 판단은 이슈 화면의 review 탭).
import { get } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { clock, fmtMs, pct } from "../format.js";
import { link } from "../router.js";
import { banner, commandBox, emptyState, tag } from "../ui.js";
import { loadAll } from "./common.js";

const STATUS = {
  passed: ["ops", "ok", "통과"],
  failed: ["gate", "fail", "실패"],
  warned: ["build", "alert", "경고"],
  reported: ["line", "help", "보고만"],
  skipped: ["line", "help", "건너뜀"],
  incomplete: ["gate", "alert", "끝내지 못함"],
};

const statusTag = (s) => {
  const [tone, ic, text] = STATUS[s] ?? ["line", "help", s ?? "-"];
  return tag(text, tone, icon(ic, "s"));
};

const SEV_TONE = { CRITICAL: "gate", HIGH: "gate", MEDIUM: "build", LOW: "line" };

export async function render(ctx) {
  const { host } = ctx;
  ctx.setHeader({ title: "검증", sub: "마지막 검증 · 품질 게이트 · 정적 분석. 결과는 .agents/reports · .agents/state 에서 읽는다", tools: [ctx.searchBox().form] });
  const res = await loadAll(ctx, [get("/verify"), get("/reports/summary"), get("/reports/findings"), get("/issues")]);
  if (!res) return undefined;
  const [verifyR, sumR, findR, issuesR] = res;
  const checkouts = verifyR.data.checkouts;
  const summary = sumR.data;
  const findings = findR.data.findings;
  const issues = issuesR.data.issues;
  let sel = 0;
  let onlyNew = false;
  const body = h("div", { class: "verify-grid" });
  const picker = h("select", { id: "branch-pick", "aria-label": "브랜치 고르기", onchange: (e) => {
    sel = Number(e.target.value);
    draw();
  } }, ...checkouts.map((c, i) => h("option", { value: String(i) }, `${c.checkout.branch ?? c.checkout.path}${c.checkout.kind === "main" ? " (메인 폴더)" : ""}`)));

  function gatePanel() {
    const g = summary.gate;
    if (!g) return h("section", { class: "panel" }, h("div", { class: "panel-body" }, banner("info", "shield", h("b", null, "품질 게이트 결과가 아직 없다. "), "게이트가 돌면 .agents/reports/quality-gate-last.json 이 생긴다."), commandBox("npx harness-kit quality", "명령 복사")));
    const [tone, , text] = STATUS[g.status] ?? ["line", "help", g.status ?? "-"];
    return h("section", { class: "panel lift", "aria-labelledby": "qg-h" },
      h("div", { class: "panel-head" }, icon(g.status === "passed" ? "ok" : g.status === "failed" ? "fail" : "alert"), h("h2", { id: "qg-h" }, g.status === "passed" ? "품질 게이트 통과" : g.status === "failed" ? "품질 게이트 통과 못 함" : `품질 게이트 ${text}`), tag(text, tone), h("div", { class: "aside" }, `${g.mode ?? ""} · level ${g.level ?? "-"}${g.head ? ` · head ${String(g.head).slice(0, 7)}` : ""}`)),
      h("div", { class: "panel-body" }, h("div", { class: "tiles" }, ...(g.checks ?? []).map((c) => h("div", { class: `tile ${c.status}` }, h("div", { class: "tile-h" }, statusTag(c.status)), h("div", { class: "tile-id" }, c.id), h("div", { class: "tile-v" }, c.value === undefined ? (c.reason ?? "-") : String(c.value), c.limit !== undefined && c.limit !== null ? h("span", { class: "muted xs" }, ` 기준 ${c.limit}`) : null)))),
        (g.incomplete ?? []).length ? banner("warn", "alert", h("b", null, "끝내지 못한 분석기: "), (g.incomplete ?? []).map((x) => `${x.analyzer}(${x.reason})`).join(" · ")) : null));
  }

  function verifyPanel() {
    const c = checkouts[sel];
    if (!c) return h("section", { class: "panel" }, emptyState("체크아웃이 없다", ""));
    const r = c.record;
    if (!r) return h("section", { class: "panel", "aria-labelledby": "lv-h" }, h("div", { class: "panel-head" }, h("h2", { id: "lv-h" }, "마지막 검증")), h("div", { class: "panel-body" }, emptyState("검증 기록이 없다", "bash scripts/verify.sh 를 돌리면 이 브랜치의 .agents/state/verify-last.json 이 생긴다."), commandBox("bash scripts/verify.sh --summary")));
    const max = Math.max(1, ...r.steps.map((s) => s.durationMs ?? 0));
    return h("section", { class: "panel", "aria-labelledby": "lv-h" },
      h("div", { class: "panel-head" }, h("h2", { id: "lv-h" }, "마지막 검증 · 단계별 시간"), h("div", { class: "aside" }, h("span", { class: "seg", role: "group", "aria-label": "검증 수준" }, ...["fast", "changed", "affected", "full"].map((l) => h("button", { type: "button", "aria-pressed": r.level === l ? "true" : "false", tabindex: "-1", "aria-disabled": "true" }, l))))),
      h("div", { class: "panel-body stack-y" },
        h("p", { class: "small" }, clock(r.finishedAt), " · ", c.issue ?? "이슈 없음", " · 전체 ", fmtMs(r.durationMs), " ", statusTag(r.status), c.slowest ? h("span", { class: "muted xs" }, ` · 가장 느린 단계 ${c.slowest.label} ${fmtMs(c.slowest.durationMs)}`) : null),
        r.steps.length ? h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "검증 단계별 시간"), h("thead", null, h("tr", null, ...["단계", "걸린 시간", "", "결과"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, ...r.steps.map((s) => {
            const fill = h("span", { class: "bar-fill" });
            fill.style.width = `${Math.max(2, Math.round(((s.durationMs ?? 0) / max) * 100))}%`;
            return h("tr", null, h("td", null, s.label), h("td", { class: "r" }, fmtMs(s.durationMs)), h("td", { class: "bar-cell" }, h("span", { class: "bar-track", "aria-hidden": "true" }, fill)), h("td", null, statusTag(s.status)));
          }))) : h("p", { class: "muted" }, "단계 기록이 없다"),
        h("p", { class: "muted small" }, icon("lock", "s"), " full 은 CI 에서만 돈다. 에이전트의 --full 은 훅이 막는다.")));
  }

  function findingsPanel() {
    const f = summary.findings;
    const list = (onlyNew ? findings.filter((x) => x.new) : findings).slice(0, 12);
    return h("section", { class: "panel", "aria-labelledby": "sa-h" },
      h("div", { class: "panel-head" }, h("h2", { id: "sa-h" }, "정적 분석"), h("div", { class: "aside" }, f ? `SARIF ${Object.keys(f.analyzers ?? {}).length}종 · ${clock(f.at)}` : "결과 없음")),
      f ? h("div", { class: "panel-body stack-y" },
        h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "심각도별 건수"), h("thead", null, h("tr", null, ...["심각도", "새로 생김", "전체"].map((t, i) => h("th", { scope: "col", class: i ? "r" : "" }, t)))), h("tbody", null, ...["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => h("tr", null, h("td", null, tag(s, SEV_TONE[s])), h("td", { class: "r" }, String(f.new[s] ?? 0)), h("td", { class: "r" }, String(f.bySeverity[s] ?? 0)))))),
        h("label", { class: "pick plain xs", for: "only-new" }, h("input", { type: "checkbox", id: "only-new", onchange: (e) => {
          onlyNew = e.target.checked;
          draw();
        } }), "새로 생긴 것만"),
        list.length ? h("ul", { class: "find-list" }, ...list.map((x) => h("li", null, tag(x.severity, SEV_TONE[x.severity] ?? "line"), h("div", null, h("div", null, x.title ?? x.check), h("code", { class: "path" }, `${x.path ?? ""}${x.line ? `:${x.line}` : ""}`))))) : h("p", { class: "muted small" }, "보여 줄 발견이 없다"),
        f.truncated ? h("p", { class: "muted xs" }, "발견이 많아 앞부분만 저장됐다.") : null) : h("div", { class: "panel-body" }, emptyState("정적 분석 결과가 없다", "분석기가 돌면 .agents/reports/findings-latest.json 이 생긴다."), commandBox("npx harness-kit quality --findings")));
  }

  function reviewPanel() {
    const rows = issues.filter((i) => i.review && (i.review.open.CRITICAL || i.review.open.HIGH || i.review.open.MEDIUM || i.review.open.LOW));
    return h("section", { class: "panel", "aria-labelledby": "rv-h" }, h("div", { class: "panel-head" }, h("h2", { id: "rv-h" }, "리뷰 지적"), h("div", { class: "aside" }, `${rows.length}개 이슈`)),
      h("div", { class: "panel-body" }, rows.length ? h("ul", { class: "find-list" }, ...rows.map((i) => h("li", null, link(`/issues/${i.key}/review`, { class: "key" }, i.key), h("div", { class: "flex wrap" }, ...["CRITICAL", "HIGH", "MEDIUM", "LOW"].filter((s) => i.review.open[s]).map((s) => tag(`${s} ${i.review.open[s]}`, SEV_TONE[s]))), link(`/issues/${i.key}/review`, { class: "btn sm" }, "리뷰 판단")))) : emptyState("열린 리뷰 지적이 없다", "리뷰 보고서가 생기면 지적과 판단이 여기 모인다.")));
  }

  function metricsPanel() {
    const m = summary.metrics;
    if (!m) return null;
    const entries = Object.entries(m).filter(([, v]) => typeof v === "number").slice(0, 6);
    if (!entries.length) return null;
    return h("section", { class: "panel", "aria-labelledby": "mt-h" }, h("div", { class: "panel-head" }, h("h2", { id: "mt-h" }, "지표")), h("div", { class: "panel-body" }, h("dl", { class: "kv-grid" }, ...entries.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, k.toLowerCase().includes("percent") ? `${v}%` : k.toLowerCase().includes("ratio") ? pct(v, 1) : String(v))]))));
  }

  function draw() {
    clear(body).append(h("div", { class: "stack-y" }, verifyPanel(), reviewPanel()), h("div", { class: "stack-y" }, findingsPanel(), metricsPanel()));
  }
  host.append(h("div", { class: "stack-y" }, gatePanel(), h("div", { class: "flex" }, h("label", { for: "branch-pick", class: "muted small" }, "브랜치"), picker), body, h("p", { class: "muted xs" }, "체크포인트(entire 모듈)는 HK-20 에서 제공한다. 검증 시간 추이는 날마다의 기록을 따로 저장하지 않아 보이지 않는다.")));
  draw();
  return undefined;
}
