// S13 기록 · 사용량. 이 컴퓨터의 대화 기록을 읽기만 한다. 대화 기록은 기본 꺼짐이고 모델을 부르지 않는다(DB-R26 · R28).
import { get } from "../api.js";
import { clear, h } from "../dom.js";
import { ago, clock, fmtBytes, fmtTokens, HARNESS_KO, pct } from "../format.js";
import { banner, button, commandBox, emptyState, errorState, harnessBadge, seg, skeleton, tabList, tag } from "../ui.js";
import { cacheLine, dailyStack, issueBars } from "./usage-charts.js";

function sourcesBanner(u) {
  const items = u.sources.map((s) => h("li", null, h("code", { class: "path" }, s.label), " ", s.state === "off" ? tag("꺼짐", "line") : s.state === "none" ? tag("자료 없음", "line") : h("span", { class: "muted small" }, `파일 ${s.files} · 세션 ${s.sessions}${s.unreadable ? ` · 읽지 못함 ${s.unreadable}` : ""}`), s.note ? h("span", { class: "muted xs" }, ` ${s.note}`) : null));
  return banner(u.enabled ? "info" : "warn", u.enabled ? "eye" : "lock", h("b", null, u.enabled ? "읽기만 한다. 이 컴퓨터에서만 보인다. " : "대화 기록 읽기는 꺼져 있다(기본). "),
    h("ul", { class: "src-list" }, ...items),
    h("p", { class: "small" }, "복사본을 남기지 않고 내보내기(--export) · 커밋 · 세션 요청에 넣지 않는다. 켜는 곳: ", h("code", null, "~/.config/harness-kit/config.json"), "의 ", h("code", null, '"history": "on"'), u.enabled ? " — 지금 켜짐" : " — 지금 꺼짐"));
}

function nowPanel(n) {
  const s = n.session;
  if (!n.enabled) return h("section", { class: "panel", "aria-labelledby": "now-h" }, h("div", { class: "panel-head" }, h("h2", { id: "now-h" }, "지금 세션")), h("div", { class: "panel-body" }, emptyState("대화 기록 읽기가 꺼져 있다", "켜면 이 리포의 가장 최근 세션 컨텍스트 사용률을 본다.")));
  if (!s) return h("section", { class: "panel", "aria-labelledby": "now-h" }, h("div", { class: "panel-head" }, h("h2", { id: "now-h" }, "지금 세션")), h("div", { class: "panel-body" }, emptyState("최근 세션 기록이 없다", "이 리포에서 연 세션의 대화 기록이 아직 없다.")));
  const bar = h("i", null);
  bar.style.width = `${Math.min(100, Math.round((s.ratio ?? 0) * 100))}%`;
  const mark = h("i", { class: "warn-mark", "aria-hidden": "true" });
  mark.style.left = `${Math.round(s.warnAt * 100)}%`;
  return h("section", { class: "panel lift", "aria-labelledby": "now-h" }, h("div", { class: "panel-head" }, h("h2", { id: "now-h" }, "지금 세션"), h("div", { class: "aside" }, harnessBadge(s.harness), s.role ? ` ${s.role}` : "")),
    h("div", { class: "panel-body stack-y" },
      h("div", { class: "big" }, s.ratio === null ? "—" : pct(s.ratio), h("span", { class: "muted small" }, s.window ? ` 컨텍스트 ${fmtTokens(s.used)} / ${fmtTokens(s.window)}` : ` 컨텍스트 ${fmtTokens(s.used)} · 창 크기: 기록에 없다`)),
      s.ratio !== null ? h("div", { class: `meter${s.warn ? " warn" : ""}`, role: "img", "aria-label": `컨텍스트 ${pct(s.ratio)}, 알림 기준 ${pct(s.warnAt)}${s.warn ? " — 넘었다" : ""}` }, bar, mark) : null,
      s.warn ? banner("warn", "alert", "자동 압축이 가깝다. 알림 기준은 설정(usage.warnAt)이다.") : null,
      h("dl", { class: "kv-grid" }, h("dt", null, "마지막 요청"), h("dd", null, `${clock(s.at)} · 입력 ${fmtTokens(s.last.input)} + 캐시 읽기 ${fmtTokens(s.last.cacheRead)} + 캐시 쓰기 ${fmtTokens(s.last.cacheWrite)}`), h("dt", null, "모델"), h("dd", null, h("code", null, s.model ?? "모름")), h("dt", null, "이슈"), h("dd", null, s.issue ?? "이슈 없음"), h("dt", null, "요청"), h("dd", null, `${s.requests}회 · ${ago(s.since)} 시작`))));
}

function kitPanel(k) {
  const s = k.sessionStart;
  const fill = h("i", null);
  fill.style.width = `${Math.min(100, Math.round(s.ratio * 100))}%`;
  return h("section", { class: "panel", "aria-labelledby": "kit-h" }, h("div", { class: "panel-head" }, h("h2", { id: "kit-h" }, "킷이 덧붙인 토큰"), h("div", { class: "aside" }, "세션 시작 · 훅 출력")),
    h("div", { class: "panel-body stack-y" },
      h("div", null, h("div", { class: "flex" }, h("b", null, "세션 시작 평균"), h("span", { class: "grow" }), h("b", null, `${s.avgBytes.toLocaleString()} / ${s.limit.toLocaleString()}바이트`), tag(s.within ? "상한 안" : "상한 넘음", s.within ? "ops" : "gate")), h("div", { class: `meter small${s.within ? "" : " warn"}`, role: "img", "aria-label": `세션 시작 ${s.avgBytes}바이트, 상한 ${s.limit}` }, fill), h("p", { class: "muted xs" }, `약 ${s.estTokens} 토큰(바이트 ÷ 3, 한글 위주 추정). 가장 컸던 실행 합 ${s.maxBytes}바이트`)),
      k.hooks.length ? h("div", { class: "table-wrap" }, h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "훅별 출력 바이트"), h("thead", null, h("tr", null, h("th", { scope: "col" }, "훅"), h("th", { scope: "col", class: "r" }, "횟수"), h("th", { scope: "col", class: "r" }, "평균"), h("th", { scope: "col", class: "r" }, "최대"))), h("tbody", null, ...k.hooks.map((x) => h("tr", null, h("td", null, h("code", { class: "path" }, x.hook), h("div", { class: "muted xs" }, x.event)), h("td", { class: "r" }, String(x.count)), h("td", { class: "r" }, String(x.avgBytes)), h("td", { class: "r" }, String(x.maxBytes))))))) : h("p", { class: "muted small" }, "아직 훅 실행 기록이 없다(.agents/state/hook-output.jsonl)."),
      k.modules.length ? h("p", { class: "muted small" }, "소유자별 세션마다 실리는 파일: ", k.modules.map((m) => `${m.owner} ${m.files}개 ${fmtBytes(m.bytes)}${Object.keys(m.hooks).length ? ` · 훅 ${Object.values(m.hooks).reduce((a, b) => a + b, 0)}` : ""}`).join(" · ")) : null,
      h("p", { class: "muted xs" }, "관리 페이지 · 저장 · 승인 · 답은 세션에 아무것도 덧붙이지 않는다(모델 호출 0).")));
}

async function historyTab(host, ctx) {
  clear(host).append(skeleton(4));
  let q = "";
  let role = "";
  const out = h("div", { "aria-live": "polite" });
  const input = h("input", { type: "text", id: "hist-q", placeholder: "프롬프트 글 찾기", "aria-label": "프롬프트 글 찾기", onkeydown: (e) => {
    if (e.key === "Enter") {
      q = input.value.trim();
      void load();
    }
  } });
  const roleSel = h("select", { id: "hist-role", "aria-label": "역할 거르기", onchange: (e) => {
    role = e.target.value;
    void load();
  } }, h("option", { value: "" }, "역할 모두"), ...["design", "implement", "review", "docs"].map((r) => h("option", { value: r }, r)));
  async function load() {
    clear(out).append(skeleton(3));
    const r = await get("/history", { query: { q, role } });
    if (!ctx.isCurrent()) return;
    clear(out);
    if (!r.ok) {
      out.append(r.error.code === "history_off" ? banner("warn", "lock", h("b", null, "대화 기록 읽기가 꺼져 있다. "), "프롬프트 기록은 이 컴퓨터 설정(", h("code", null, '"history": "on"'), ")을 켠 사람만 본다.") : errorState(r.error, () => void load()));
      return;
    }
    const d = r.data;
    out.append(h("p", { class: "muted small" }, `${d.total}건 중 ${d.shown}건 · ${d.note}${d.unreadable ? ` · 읽지 못한 줄 ${d.unreadable}` : ""}`), d.prompts.length ? h("ul", { class: "prompt-list" }, ...d.prompts.map((p) => h("li", null, h("div", { class: "muted xs" }, clock(p.at), " · ", harnessBadge(p.harness), p.issue ? ` · ${p.issue}` : "", p.role ? ` · ${p.role}` : ""), h("div", { class: "prompt-text" }, p.text)))) : emptyState("프롬프트 기록이 없다", q ? "찾는 말을 바꾼다." : "이 리포에서 보낸 프롬프트가 없다."));
  }
  clear(host).append(h("div", { class: "stack-y" }, h("div", { class: "flex wrap" }, h("label", { for: "hist-q", class: "sr-only" }, "찾기"), input, roleSel, button("찾기", { icon: "search", onClick: () => {
    q = input.value.trim();
    void load();
  } })), out));
  await load();
}

export async function render(ctx) {
  const { host, route } = ctx;
  ctx.setHeader({ title: "기록 · 사용량", sub: "이 컴퓨터의 대화 기록을 읽어 보여 준다 · 관리 페이지는 모델을 부르지 않는다", tools: [ctx.searchBox().form] });
  let tab = route.query.tab === "history" ? "history" : "usage";
  let days = "7";
  let harness = "";
  const panel = h("div", { id: "usage-panel", role: "tabpanel", tabindex: "0", class: "stack-y" });
  const kitR = await get("/usage/kit");
  const nowR = await get("/usage/now");
  if (!ctx.isCurrent()) return undefined;

  async function drawUsage() {
    clear(panel).append(skeleton(5));
    const r = await get("/usage", { query: { days, harness } });
    if (!ctx.isCurrent()) return;
    clear(panel);
    if (!r.ok) {
      panel.append(errorState(r.error, () => void drawUsage()));
      return;
    }
    const u = r.data;
    const filters = h("div", { class: "flex wrap" }, h("span", { class: "muted small" }, "기간"), seg("기간", [{ id: "1", label: "오늘" }, { id: "7", label: "7일" }, { id: "30", label: "30일" }], days, (v) => {
      days = v;
      void drawUsage();
    }), h("label", { for: "u-h", class: "muted small" }, "하네스"), h("select", { id: "u-h", onchange: (e) => {
      harness = e.target.value;
      void drawUsage();
    } }, h("option", { value: "" }, "모두"), ...["claude", "codex", "kiro"].map((x) => h("option", { value: x, selected: x === harness }, HARNESS_KO[x]))), h("span", { class: "grow" }), u.enabled ? h("span", { class: "muted xs" }, `${u.range.from.slice(0, 10)} ~ ${u.range.to.slice(0, 10)} · 이 리포(와 worktree)만`) : null);
    panel.append(filters, sourcesBanner(u));
    const kit = kitR.ok ? kitPanel(kitR.data) : null;
    if (!u.enabled) {
      panel.append(h("div", { class: "usage-grid" }, h("div", { class: "stack-y" }, emptyState("토큰 사용량은 대화 기록 읽기를 켜면 보인다", "꺼진 동안 이 컴퓨터의 ~/.claude · ~/.codex 를 열지 않는다. 킷이 덧붙인 양은 늘 보인다."), commandBox('echo \'{ "history": "on" }\' > ~/.config/harness-kit/config.json', "켜는 명령 복사(사람이 직접)")), h("div", { class: "stack-y" }, nowPanel(nowR.ok ? nowR.data : { enabled: false }), kit)));
      return;
    }
    const t = u.totals;
    panel.append(h("div", { class: "usage-grid" },
      h("div", { class: "stack-y" },
        h("section", { class: "panel", "aria-labelledby": "day-h" }, h("div", { class: "panel-head" }, h("h2", { id: "day-h" }, "하루 토큰 · 역할별"), h("div", { class: "aside" }, `${days === "1" ? "오늘" : `${days}일`} ${fmtTokens(t.sum)}`, u.cost ? ` · 추정 비용 ${u.cost.estimate}` : "")), h("div", { class: "panel-body" }, t.requests ? dailyStack(u.daily, u.roles) : emptyState("이 기간 기록이 없다", "이 리포의 세션이 이 기간에 없었다."))),
        u.cost ? h("p", { class: "muted xs" }, u.cost.note) : null,
        h("div", { class: "two-col" },
          h("section", { class: "panel", "aria-labelledby": "iss-h" }, h("div", { class: "panel-head" }, h("h2", { id: "iss-h" }, "이슈별 토큰"), h("div", { class: "aside" }, days === "1" ? "오늘" : `${days}일`)), h("div", { class: "panel-body stack-y" }, u.byIssue.length ? issueBars(u.byIssue) : h("p", { class: "muted" }, "기록이 없다"), h("p", { class: "muted xs" }, "이슈는 세션 등록과 기록의 gitBranch 에서 찾는다."))),
          h("section", { class: "panel", "aria-labelledby": "cache-h" }, h("div", { class: "panel-head" }, h("h2", { id: "cache-h" }, "캐시 읽기 비율"), h("div", { class: "aside" }, `평균 ${pct(u.cache.average)}`)), h("div", { class: "panel-body" }, cacheLine(u.cache), h("p", { class: "muted xs" }, "캐시 읽기 ÷ (입력 + 캐시 읽기 + 캐시 쓰기). 높을수록 같은 앞부분을 다시 쓴다."))))),
      h("div", { class: "stack-y" }, nowPanel(nowR.ok ? nowR.data : { enabled: false }), kit)));
  }

  const tabs = tabList("기록 · 사용량", [{ id: "usage", label: "사용량", panel: "usage-panel" }, { id: "history", label: "프롬프트 기록", panel: "usage-panel" }], tab, (id) => {
    tab = id;
    history.replaceState(null, "", `${location.pathname}${id === "history" ? "?tab=history" : ""}`);
    panel.setAttribute("aria-labelledby", `tab-${id}`);
    void (id === "history" ? historyTab(panel, ctx) : drawUsage());
  });
  panel.setAttribute("aria-labelledby", `tab-${tab}`);
  host.append(h("div", { class: "stack-y" }, tabs, panel));
  if (tab === "history") await historyTab(panel, ctx);
  else await drawUsage();
  return undefined;
}
