// S12 진행 · 흐름. Unit 의존을 캔버스(React Flow 번들, 열 때만 받는다)로 보고 변경 제안을 남긴다. 제안은 승인이 아니고 units.json 을 바꾸지 않는다(DB-R29).
import { del, errorText, get, post } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { clock, GATE_KO, STEP_KO } from "../format.js";
import { link, navigate } from "../router.js";
import { store } from "../store.js";
import { banner, button, commandBox, emptyState, errorState, modal, skeleton, tag, toast } from "../ui.js";
import { openDispatch } from "./dispatch.js";
import { loadAll } from "./common.js";
import { viewSwitch } from "./progress.js";
import { burnChart } from "./flow-burn.js";

const LABELS = {
  canvas: "Unit 의존 흐름",
  controls: "확대 · 축소 · 맞춤",
  minimap: "전체 미니맵",
  contract: "계약",
  contractTag: "계약",
  noSession: "세션 없음",
  bolt: "Bolt",
  estimated: "추정",
  steps: STEP_KO,
  state: { done: "지남", active: "진행 중", todo: "아직" },
  flags: { critical: "CRITICAL", high: "HIGH", verify: "검증" },
  area: "영역",
};

let bundle = null;
async function loadBundle() {
  if (!bundle) {
    if (!document.getElementById("flow-bundle-css")) document.head.append(h("link", { rel: "stylesheet", href: "/vendor/flow.bundle.css", id: "flow-bundle-css" }));
    bundle = import("/vendor/flow.bundle.js");
  }
  return bundle;
}

export async function render(ctx) {
  const { host, route } = ctx;
  const intentsR = await get("/intents");
  if (!intentsR.ok) {
    host.append(errorState(intentsR.error, ctx.rerender));
    return undefined;
  }
  const intents = intentsR.data.intents;
  const key = route.query.intent && intents.some((i) => i.key === route.query.intent) ? route.query.intent : intents[0]?.key;
  ctx.setHeader({ title: "진행", sub: "Intent → Unit 의존 흐름 · 자리는 units.json 의 dependsOn 에서 계산", tools: [viewSwitch("flow", key), ctx.searchBox().form] });
  if (!key) {
    host.append(emptyState("Intent 가 없다", "새 요구사항을 접수하면 Intent 와 Unit 이 생기고 흐름이 그려진다.", link("/intake", { class: "btn sm" }, "새 요구사항")));
    return undefined;
  }
  const res = await loadAll(ctx, [get("/flow", { query: { intent: key } }), get(`/intents/${encodeURIComponent(key)}/burn`, { query: { days: "14" } }), get(`/intents/${encodeURIComponent(key)}`), get("/overview")]);
  if (!res) return undefined;
  const [flowR, burnR, intentR, overR] = res;
  const flow = flowR.data;
  const intent = intentR.data;
  const readOnly = Boolean(store.session?.readOnly);
  let selected = route.query.sel && flow.nodes.some((n) => n.id === route.query.sel) ? route.query.sel : null;
  let mounted = null;

  const sideHost = h("aside", { class: "flow-side stack-y", "aria-label": "고른 Unit 과 변경 제안" });
  const canvas = h("div", { class: "flow-canvas", id: "flow-canvas" }, skeleton(4));
  const picker = h("select", { id: "int-pick", "aria-label": "Intent 고르기", onchange: (e) => navigate(`/progress?view=flow&intent=${e.target.value}`) }, ...intents.map((i) => h("option", { value: i.key, selected: i.key === key }, `${i.key} ${i.title ?? i.name}`)));
  const legend = h("div", { class: "flow-legend", "aria-label": "범례" }, h("span", null, h("b", null, "단계 "), ...Object.entries(STEP_KO).map(([k, v]) => h("span", { class: "lg" }, h("i", { class: `lg-dia ${["requirements", "design", "tasks"].includes(k) ? "design" : ["impl", "verify"].includes(k) ? "build" : "ops"}` }), v))), h("span", null, h("b", null, "모양 "), "속 찬 마름모 = 지난 단계 · 속 빈 굵은 테두리 = 진행 중 · 옅은 테두리 = 아직"), h("span", null, h("b", null, "선 "), "실선 = 의존(앞 → 뒤) · 점선 = 계약"));
  const tableHost = h("details", { class: "flow-table" }, h("summary", null, "표로 보기(같은 데이터)"), unitTable());

  function unitTable() {
    return h("div", { class: "table-wrap" }, h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "Unit 목록과 의존"), h("thead", null, h("tr", null, ...["Unit", "제목", "종류", "이슈", "단계", "의존"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, ...intent.units.filter((u) => u.planned).map((u) => {
        const n = flow.nodes.find((x) => x.id === u.id);
        const active = (n?.data.steps ?? []).find((s) => s.endsWith(":active"));
        const doneSteps = (n?.data.steps ?? []).filter((s) => s.endsWith(":done"));
        const sid = (active ?? doneSteps[doneSteps.length - 1] ?? "").split(":")[0];
        return h("tr", { class: selected === u.id ? "sel" : null }, h("td", null, h("button", { type: "button", class: "linklike", onclick: () => select(u.id) }, u.id)), h("td", null, u.title), h("td", null, u.kind === "contract" ? "계약" : "기능"), h("td", null, u.issue ? link(`/issues/${u.issue}`, { class: "key" }, u.issue) : "—"), h("td", null, sid ? `${STEP_KO[sid] ?? sid}${active ? " 진행 중" : " 지남"}` : "-"), h("td", null, u.dependsOn.join(", ") || "-"));
      }))));
  }

  function select(id) {
    selected = id;
    mounted?.update(props());
    drawSide();
    const url = new URL(location.href);
    if (id) url.searchParams.set("sel", id);
    else url.searchParams.delete("sel");
    history.replaceState(null, "", url.pathname + url.search);
    clear(tableHost).append(h("summary", null, "표로 보기(같은 데이터)"), unitTable());
  }

  const props = () => ({ data: flow, selectedId: selected, labels: LABELS, onSelect: (id) => select(id) });

  async function drawCanvas() {
    try {
      const mod = await loadBundle();
      if (!ctx.isCurrent()) return;
      clear(canvas);
      mounted = mod.mount(canvas, props());
    } catch (err) {
      clear(canvas).append(banner("warn", "alert", h("b", null, "캔버스를 불러오지 못해 표로 보여 준다. "), err instanceof Error ? err.message : String(err)));
      tableHost.open = true;
    }
  }

  function drawSide() {
    clear(sideHost);
    const todo = (overR.data.todo ?? []).filter((t) => (selected ? flow.nodes.find((n) => n.id === selected)?.data.issue === t.target : flow.nodes.some((n) => n.data.issue === t.target)));
    const node = selected ? flow.nodes.find((n) => n.id === selected) : null;
    const head = h("section", { class: "panel", "aria-labelledby": "fs-h" },
      h("div", { class: "panel-body stack-y" },
        h("div", { class: "flex wrap" }, h("span", { class: "key" }, intent.key), tag(`intent ${intent.approvals.intent === "valid" ? "승인됨" : "승인 전"}`, intent.approvals.intent === "valid" ? "ops" : "gate"), tag(`기획물 ${intent.approvals.plans === "valid" ? "승인됨" : "승인 전"}`, intent.approvals.plans === "valid" ? "ops" : "line")),
        h("h2", { id: "fs-h" }, intent.title ?? intent.name),
        h("p", { class: "muted small" }, `Unit ${intent.units.length}${flow.intent.approved ? ` · ${flow.intent.approved.at.slice(0, 10)} ${flow.intent.approved.by} 승인` : ""}`),
        intent.questions.open ? link(`/intents/${intent.key}/questions`, { class: "btn sm" }, icon("question"), `열린 질문 ${intent.questions.open}`) : null,
        node ? h("div", { class: "sel-box" }, h("b", null, `${node.id} ${node.data.title ?? ""}`), node.data.issue ? link(`/issues/${node.data.issue}`, { class: "btn sm" }, "이슈 열기") : h("span", { class: "muted small" }, " 이슈 아직 없음"), h("button", { type: "button", class: "btn ghost sm", onclick: () => select(null) }, "고름 풀기(Esc)")) : h("p", { class: "muted small" }, "Unit 을 고르면(Tab · Enter) 그 Unit 의 할 일과 변경 제안을 쓴다.")));
    sideHost.append(head);
    sideHost.append(h("section", { class: "panel", "aria-labelledby": "fs-todo" }, h("div", { class: "panel-head" }, h("h3", { id: "fs-todo" }, "처리할 일"), h("div", { class: "aside" }, String(todo.length))), h("div", { class: "panel-body" }, todo.length ? h("ul", { class: "mini-todo" }, ...todo.map((t) => h("li", null, link(t.link, {}, t.title), h("div", { class: "muted xs" }, t.reason)))) : h("p", { class: "muted small" }, "이 Intent 에 처리할 일이 없다."))));
    const bs = burnChart(burnR.data);
    sideHost.append(h("section", { class: "panel", "aria-labelledby": "fs-burn" }, h("div", { class: "panel-head" }, h("h3", { id: "fs-burn" }, "남은 일"), h("div", { class: "aside" }, `Bolt ${burnR.data.now.remaining} 남음 · 끝난 Unit ${burnR.data.now.units.done}/${burnR.data.now.units.total}`)), h("div", { class: "panel-body" }, bs, burnR.data.estimated ? h("p", { class: "muted xs" }, "tasks 가 없는 Unit 은 units.json 의 스토리 수로 센 추정 Bolt 다.") : null)));
    sideHost.append(depList(), proposalPanel());
  }

  function depList() {
    const units = intent.units.filter((u) => u.planned);
    return h("section", { class: "panel", "aria-labelledby": "fs-dep" }, h("div", { class: "panel-head" }, h("h3", { id: "fs-dep" }, "의존 순서")), h("div", { class: "panel-body" }, h("ol", { class: "dep-list" }, ...units.map((u) => h("li", null, h("span", { class: "key" }, u.id), ` ${u.title}`, h("div", { class: "muted xs" }, u.dependsOn.length ? `${u.dependsOn.join(", ")} 뒤` : "먼저 시작할 수 있다"))))));
  }

  // ── 변경 제안 ──
  let draft = (flow.proposal?.changes ?? []).map((c) => ({ ...c }));
  const out = h("div", { "aria-live": "polite" });

  function proposalPanel() {
    const live = intent.units.filter((u) => u.planned);
    const unitSel = h("select", { id: "pr-unit", "aria-label": "Unit" }, ...live.map((u) => h("option", { value: u.id, selected: u.id === selected }, `${u.id} ${u.title}`)));
    const opSel = h("select", { id: "pr-op", "aria-label": "종류" }, ...[["add-dep", "의존 더하기"], ["remove-dep", "의존 빼기"], ["split", "나누기"], ["merge", "합치기"], ["order", "순서"]].map(([v, l]) => h("option", { value: v }, l)));
    const otherSel = h("select", { id: "pr-other", "aria-label": "상대 Unit" }, ...live.map((u) => h("option", { value: u.id }, `${u.id} ${u.title}`)));
    const text = h("textarea", { id: "pr-text", rows: "2", placeholder: "나누기: 새 Unit 제목을 한 줄에 하나(2개 이상) · 순서: Unit id 를 쉼표로", disabled: readOnly });
    const reason = h("input", { type: "text", id: "pr-reason", placeholder: "이유 한 줄", disabled: readOnly });
    const list = h("ol", { class: "draft-list", "aria-label": "제안 목록" });
    const drawDraft = () => {
      clear(list).append(...draft.map((c, i) => h("li", null, h("code", null, describe(c)), c.reason ? h("span", { class: "muted xs" }, ` — ${c.reason}`) : null, button("빼기", { sm: true, kind: "ghost", disabled: readOnly, onClick: () => {
        draft.splice(i, 1);
        drawDraft();
      } }))));
      if (!draft.length) list.append(h("li", { class: "muted small" }, "아직 없다"));
    };
    drawDraft();
    const add = () => {
      const op = opSel.value;
      const c = { op, reason: reason.value.trim() || undefined };
      if (op === "add-dep" || op === "remove-dep") Object.assign(c, { unit: unitSel.value, dependsOn: otherSel.value });
      else if (op === "split") Object.assign(c, { unit: unitSel.value, into: text.value.split("\n").map((x) => x.trim()).filter(Boolean) });
      else if (op === "merge") Object.assign(c, { units: [unitSel.value, otherSel.value] });
      else Object.assign(c, { units: text.value.split(",").map((x) => x.trim()).filter(Boolean) });
      draft.push(c);
      drawDraft();
      reason.value = "";
    };
    async function save() {
      clear(out).append(banner("info", "clock", "저장하는 중…"));
      const r = await post("/units/proposals", { intent: key, baseSha256: flow.unitsSha256, changes: draft });
      if (!r.ok) {
        const e = r.error;
        const hint = e.code === "cycle" ? "의존이 고리를 만든다" : e.code === "conflict" ? "units.json 이 바뀌었다. 다시 읽고 제안한다" : e.code === "contract_merge" ? "계약 Unit 은 합치지 않는다" : e.code === "unknown_unit" ? "없는 Unit 이다" : "";
        clear(out).append(banner("err", "alert", h("b", null, `${e.code}: `), errorText(e), hint ? ` (${hint})` : "", e.code === "conflict" ? button("다시 읽기", { sm: true, onClick: () => ctx.rerender() }) : null));
        return;
      }
      toast("변경 제안을 저장했다(승인이 아니다)");
      clear(out).append(banner("ok", "ok", h("b", null, "제안을 저장했다. "), "units.json 은 그대로이고 세션에는 아무것도 보내지 않았다. 반영은 intent 게이트 승인 때 한다. 설계 세션에 알리려면 '세션에 요청'을 누른다."), button("세션에 요청", { icon: "send", kind: "go", disabled: readOnly, onClick: () => openDispatch({ paths: [r.data.path], kind: "custom", text: `${key} Unit 변경 제안을 저장했다`, title: "설계 세션에 요청" }) }));
    }
    async function discard() {
      const r = await del(`/units/proposals/${encodeURIComponent(key)}`);
      if (!r.ok) {
        clear(out).append(banner("err", "alert", errorText(r.error)));
        return;
      }
      toast("제안을 버렸다");
      ctx.rerender();
    }
    return h("section", { class: "panel", "aria-labelledby": "fs-prop" },
      h("div", { class: "panel-head" }, h("h3", { id: "fs-prop" }, "변경 제안"), h("div", { class: "aside" }, flow.proposal ? tag("저장된 제안 있음", "build") : tag("없음", "line"))),
      h("div", { class: "panel-body stack-y" },
        h("p", { class: "muted small" }, "제안은 승인이 아니다. units.json 은 바뀌지 않고, intent 게이트 승인 때만 반영된다. 팀 흐름 틀(flow.gates)은 여기서 바꾸지 않는다."),
        flow.proposal ? banner("warn", "alert", `저장된 제안 ${flow.proposal.changes?.length ?? 0}건 · ${flow.proposal.createdBy ?? ""} · ${clock(flow.proposal.createdAt)}`, " — 다시 저장하면 바뀐다.") : null,
        readOnly
          ? banner("warn", "lock", h("b", null, "읽기 전용. "), "제안을 저장하지 않는다. 사람이 자기 터미널에서 연 서버나 ", h("code", null, `npx harness-kit units propose ${key} …`), " 로 한다.")
          : h("div", { class: "stack-y" },
            h("div", { class: "field" }, h("label", { for: "pr-op" }, "종류"), opSel), h("div", { class: "field" }, h("label", { for: "pr-unit" }, "Unit"), unitSel), h("div", { class: "field" }, h("label", { for: "pr-other" }, "상대 Unit(의존 · 합치기)"), otherSel),
            h("div", { class: "field" }, h("label", { for: "pr-text" }, "나누기 · 순서 입력"), text), h("div", { class: "field" }, h("label", { for: "pr-reason" }, "이유"), reason),
            h("div", { class: "flex wrap" }, button("목록에 더하기", { icon: "plus", onClick: add }), button("제안 저장", { kind: "primary", icon: "save", onClick: () => void save() }), flow.proposal ? button("제안 버리기", { kind: "danger", icon: "trash", onClick: () => void discard() }) : null)),
        list, out,
        h("p", { class: "small" }, h("button", { type: "button", class: "linklike", onclick: () => void gatesDialog() }, "흐름 틀 보기"), h("span", { class: "muted xs" }, " — 지금 게이트와 바꾸는 명령"))),
    );
  }

  function describe(c) {
    if (c.op === "add-dep") return `${c.unit} 가 ${c.dependsOn} 에 의존`;
    if (c.op === "remove-dep") return `${c.unit} 의 ${c.dependsOn} 의존 빼기`;
    if (c.op === "split") return `${c.unit} 나누기: ${(c.into ?? []).join(" | ")}`;
    if (c.op === "merge") return `합치기: ${(c.units ?? []).join(" + ")}`;
    return `순서: ${(c.units ?? []).join(" → ")}`;
  }

  async function gatesDialog() {
    const g = await get("/flow/gates");
    const body = h("div", { class: "stack-y" }, h("p", null, "지금 게이트: ", ...(g.ok ? g.data.gates.map((x) => tag(GATE_KO[x] ?? x, g.data.floor.includes(x) ? "design" : "line")) : [errorText(g.error)])), h("p", { class: "muted small" }, "바닥(requirements · design · mr · done)은 줄일 수 없다. 팀 설정이라 터미널에서 바꾸고 MR 로 올린다."), g.ok ? commandBox(g.data.command) : null);
    modal("흐름 틀", body);
  }

  host.append(h("div", { class: "flow-page" }, h("div", { class: "flow-tools" }, h("label", { for: "int-pick", class: "muted small" }, "Intent"), picker, h("span", { class: "muted xs" }, `${clock(flow.readAt)}에 읽음`)), h("div", { class: "flow-main" }, h("div", { class: "stack-y flow-left" }, canvas, legend, tableHost), sideHost)));
  drawSide();
  await drawCanvas();
  return () => {
    mounted?.unmount();
    mounted = null;
  };
}
