// S02 진행 보드: Intent → Unit → 이슈, 단계 · 맡은 하네스 · 세션. area · 단계로 거른다. 같은 데이터를 흐름(S12)으로도 본다.
import { get } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { GATE_KO, railSpec, stageText } from "../format.js";
import { link } from "../router.js";
import { store } from "../store.js";
import { emptyState, gateRail, harnessBadge, seg, tag } from "../ui.js";
import { loadAll } from "./common.js";

export function viewSwitch(active, intent) {
  const q = intent ? `&intent=${encodeURIComponent(intent)}` : "";
  return h("nav", { class: "seg view-seg", "aria-label": "보기 전환" }, link("/progress", { "aria-current": active === "board" ? "page" : null }, "보드"), link(`/progress?view=flow${q}`, { "aria-current": active === "flow" ? "page" : null }, "흐름"));
}

const STAGE_FILTERS = [
  { id: "all", label: "모두", test: () => true },
  { id: "wait", label: "승인 대기", test: (i) => Boolean(i.waitingOn) },
  { id: "blocked", label: "막힘", test: (i) => (i.review?.open.CRITICAL ?? 0) + (i.review?.open.HIGH ?? 0) > 0 || ["failed", "incomplete"].includes(i.verify?.status ?? "") },
  { id: "doing", label: "진행 중", test: (i) => i.stage !== "completed" && !i.waitingOn },
  { id: "done", label: "완료", test: (i) => i.stage === "completed" },
];

function issueRow(i, gates, sessions) {
  const sess = sessions.filter((s) => i.sessions.includes(s.id));
  const b = i.docs.tasks?.bolts;
  const flags = [];
  if (i.review?.open.CRITICAL) flags.push(`CRITICAL ${i.review.open.CRITICAL}`);
  if (i.review?.open.HIGH) flags.push(`HIGH ${i.review.open.HIGH}`);
  if (i.verify && ["failed", "incomplete"].includes(i.verify.status ?? "")) flags.push(`검증 ${i.verify.status}`);
  return h(
    "tr",
    null,
    h("td", null, link(`/issues/${i.key}`, { class: "key" }, i.key)),
    h("td", null, h("div", null, i.title ?? i.name), h("div", { class: "muted xs" }, i.area ?? "area 없음")),
    h("td", null, i.waitingOn ? tag(`${GATE_KO[i.waitingOn.gate] ?? i.waitingOn.gate} 승인 대기`, "gate") : tag(stageText(i), i.stage === "completed" ? "ops" : i.stage === "design" || i.stage === "requirements" ? "design" : "build"), ...flags.map((f) => h("span", null, " ", tag(f, "gate")))),
    h("td", { class: "rail-cell" }, gateRail(railSpec(gates, i))),
    h("td", null, b && b.total ? h("span", { class: "bolts", role: "img", "aria-label": `Bolt ${b.done}/${b.total}` }, ...Array.from({ length: b.total }, (_, k) => h("i", { class: k < b.done ? "done" : k === b.done ? "now" : "" }))) : h("span", { class: "muted xs" }, "-"), b ? h("span", { class: "muted xs" }, ` ${b.done}/${b.total}`) : null),
    h("td", null, sess.length ? sess.map((s) => h("div", { class: "xs" }, harnessBadge(s.harness), ` ${s.name ?? s.id.slice(0, 8)}`)) : h("span", { class: "muted xs" }, "세션 없음")),
  );
}

function table(rows) {
  return h("div", { class: "table-wrap" }, h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "이슈 목록"), h("thead", null, h("tr", null, ...["이슈", "제목 · area", "상태", "게이트", "Bolt", "세션"].map((t) => h("th", { scope: "col" }, t)))), h("tbody", null, ...rows)));
}

export async function render(ctx) {
  const { host, route } = ctx;
  const only = route.name === "intent" ? route.params.key : null;
  ctx.setHeader({ title: only ? `${only} 진행` : "진행", sub: "Intent → Unit → 이슈 · 단계는 board.sh 와 같은 원본이다", tools: [viewSwitch("board", only), ctx.searchBox().form] });
  const res = await loadAll(ctx, [get("/intents"), get("/issues"), get("/sessions")]);
  if (!res) return undefined;
  const [intentsR, issuesR, sessR] = res;
  const gates = store.session?.flow.gates ?? [];
  const issues = issuesR.data.issues;
  const sessions = sessR.data.sessions;
  const intents = intentsR.data.intents.filter((i) => !only || i.key === only);
  const areas = [...new Set(issues.map((i) => i.area).filter(Boolean))].sort();
  let area = "all";
  let stage = "all";
  const body = h("div", { class: "stack-y", "aria-live": "polite" });
  const filters = h("div", { class: "filters" }, h("span", { class: "muted small" }, "영역"), seg("영역", [{ id: "all", label: "모두", n: issues.length }, ...areas.map((a) => ({ id: a, label: a, n: issues.filter((i) => i.area === a).length }))], area, (v) => {
    area = v;
    draw();
  }), h("span", { class: "muted small" }, "상태"), seg("상태", STAGE_FILTERS.map((f) => ({ id: f.id, label: f.label, n: issues.filter(f.test).length })), stage, (v) => {
    stage = v;
    draw();
  }));
  const pass = (i) => (area === "all" || i.area === area) && STAGE_FILTERS.find((f) => f.id === stage).test(i);

  function draw() {
    clear(body);
    let shown = 0;
    for (const it of intents) {
      const rows = it.units.filter((u) => u.planned).map((u) => ({ u, i: issues.find((x) => x.key === u.issue) })).filter(({ i }) => (i ? pass(i) : area === "all" && stage === "all"));
      shown += rows.length;
      if (!rows.length) continue;
      const planned = rows.filter(({ i }) => !i);
      body.append(
        h("section", { class: "panel", "aria-labelledby": `int-${it.key}` },
          h("div", { class: "panel-head" }, h("span", { class: "key" }, it.key), h("h2", { id: `int-${it.key}` }, it.title ?? it.name), tag(`Intent ${it.approvals.intent === "valid" ? "승인됨" : "승인 전"}`, it.approvals.intent === "valid" ? "ops" : "gate"), it.questions.open ? link(`/intents/${it.key}/questions`, { class: "tag gate" }, `질문 ${it.questions.open}`) : null, h("div", { class: "aside" }, `Unit ${it.units.length}`, link(`/progress?view=flow&intent=${it.key}`, { class: "btn sm" }, icon("board"), "흐름"))),
          rows.some(({ i }) => i) ? table(rows.filter(({ i }) => i).map(({ i }) => issueRow(i, gates, sessions))) : null,
          planned.length ? h("ul", { class: "unit-planned" }, ...planned.map(({ u }) => h("li", null, h("span", { class: "key" }, u.id), ` ${u.title}`, " ", tag(u.kind === "contract" ? "계약" : "이슈 아직 없음", "line"), u.dependsOn.length ? h("span", { class: "muted xs" }, ` · 의존 ${u.dependsOn.join(", ")}`) : null))) : null),
      );
    }
    const inIntent = new Set(intents.flatMap((it) => it.units.map((u) => u.issue).filter(Boolean)));
    const loose = issues.filter((i) => !inIntent.has(i.key) && pass(i) && !only);
    if (loose.length) {
      shown += loose.length;
      body.append(h("section", { class: "panel", "aria-labelledby": "loose-h" }, h("div", { class: "panel-head" }, h("h2", { id: "loose-h" }, "Intent 폴더에 연결되지 않은 이슈"), h("div", { class: "aside" }, `${loose.length}개`)), table(loose.map((i) => issueRow(i, gates, sessions)))));
    }
    if (!shown) body.append(emptyState(issues.length || intents.length ? "조건에 맞는 이슈가 없다" : "이슈가 아직 없다", issues.length || intents.length ? "영역 · 상태 거름을 '모두'로 돌린다." : "새 요구사항을 접수하거나 이슈 폴더(.agents/docs/issues/)를 만들면 여기 나온다.", link("/intake", { class: "btn sm" }, "새 요구사항")));
  }
  draw();
  host.append(h("div", { class: "stack-y" }, filters, body));
  return undefined;
}
