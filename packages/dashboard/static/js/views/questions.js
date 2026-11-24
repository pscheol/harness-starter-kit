// S04 질문 답하기. 선택지를 고르고 메모를 남긴다. 답은 PIN 이 필요하고(탭마다 한 번) 마지막 질문에 답해도 세션에 아무것도 보내지 않는다(DB-R25).
import { errorText, get, post } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { link } from "../router.js";
import { store } from "../store.js";
import { banner, button, emptyState, errorState, tag, toast, withPin } from "../ui.js";
import { openDispatch } from "./dispatch.js";

export async function render(ctx) {
  const { host, route } = ctx;
  const target = route.params.target ?? route.params.key;
  ctx.setHeader({ crumbs: [{ label: "문서", path: "/docs" }], title: target ? `질문 · ${target}` : "질문 답하기", sub: "권장안을 보고 선택지를 고른다. 답이 모이면 설계 세션에 사람이 요청한다", tools: [ctx.searchBox().form] });
  if (!target) {
    const r = await get("/intents");
    if (!r.ok) {
      host.append(errorState(r.error, ctx.rerender));
      return undefined;
    }
    const open = r.data.intents.filter((i) => i.questions.total > 0);
    host.append(open.length ? h("ul", { class: "int-list pad" }, ...open.map((i) => h("li", null, link(`/intents/${i.key}/questions`, { class: "key" }, i.key), ` ${i.title ?? i.name}`, h("div", { class: "muted xs" }, `열린 질문 ${i.questions.open}/${i.questions.total}`)))) : emptyState("질문이 없다", "설계 세션이 질문을 만들면 여기 나온다."));
    return undefined;
  }
  const r = await get("/questions", { query: { target } });
  if (!r.ok) {
    host.append(errorState(r.error, ctx.rerender));
    return undefined;
  }
  let doc = r.data;
  const readOnly = Boolean(store.session?.readOnly);
  const listHost = h("div", { class: "stack-y", "aria-live": "polite" });
  const email = store.session?.user?.email;

  function head() {
    const open = doc.questions.filter((q) => q.open).length;
    return h("div", { class: "flex wrap" }, tag(`열린 질문 ${open}`, open ? "gate" : "ops"), h("span", { class: "muted small" }, `${doc.path} · status ${doc.status ?? "-"}${doc.round ? ` · ${doc.round}차` : ""}`), h("span", { class: "grow" }), readOnly ? h("span", { class: "tag line" }, icon("lock", "s"), "읽기 전용") : button("세션에 요청", { icon: "send", onClick: () => openDispatch({ issue: /^[A-Z]+-\d+$/.test(target) && !target.startsWith("INT-") ? target : undefined, paths: [doc.path], kind: "answers-ready", title: "설계 세션에 요청" }) }));
  }

  async function reload() {
    const x = await get("/questions", { query: { target } });
    if (x.ok) doc = x.data;
    draw();
  }

  function card(q) {
    const choiceId = `q-${q.id}`;
    let picked = null;
    const memo = h("textarea", { rows: "2", id: `${choiceId}-memo`, placeholder: "메모(선택, 500자 이하). 'other' 는 필수", disabled: readOnly });
    const out = h("div", { "aria-live": "polite" });
    const radios = h("div", { role: "radiogroup", "aria-labelledby": `${choiceId}-t`, class: "choices" }, ...[...q.choices, { id: "other", text: "다른 답", impact: "메모에 쓴다" }].map((c) => h("label", { class: `choice${c.id === q.recommended ? " rec" : ""}`, for: `${choiceId}-${c.id}` }, h("input", { type: "radio", name: choiceId, id: `${choiceId}-${c.id}`, value: c.id, disabled: readOnly || !q.open, onchange: () => {
      picked = c.id;
    } }), h("span", { class: "cl" }, c.id), h("span", { class: "grow" }, h("b", null, c.text), c.impact ? h("span", { class: "muted xs" }, ` — 영향: ${c.impact}`) : null), c.id === q.recommended ? tag("권장", "design") : null)));
    async function answer() {
      if (!picked) {
        clear(out).append(banner("warn", "alert", "선택지를 고른다."));
        return;
      }
      if (picked === "other" && !memo.value.trim()) {
        clear(out).append(banner("warn", "alert", "'다른 답' 은 메모가 필요하다."));
        memo.focus();
        return;
      }
      const res = await withPin((pin) => post(`/questions/${encodeURIComponent(target)}/${encodeURIComponent(q.id)}/answer`, { choice: picked, ...(memo.value.trim() ? { text: memo.value.trim() } : {}), baseSha256: doc.sha256, pin }));
      if (!res.ok) {
        clear(out).append(banner("err", "alert", h("b", null, `${res.error.code}: `), errorText(res.error)));
        if (res.error.code === "conflict") await reload();
        return;
      }
      toast(res.data.kind === "opinion" ? "의견으로 남겼다(질문은 열려 있다)" : "답을 저장했다");
      await reload();
      if (res.data.open === 0) listHost.prepend(banner("ok", "ok", h("b", null, "모든 질문에 답이 찼다. "), "세션에는 아무것도 보내지 않았다. 설계 세션에 알리려면 위의 '세션에 요청'을 누른다."));
    }
    return h(
      "article",
      { class: `panel q-card${q.open ? "" : " answered"}`, "aria-labelledby": `${choiceId}-t` },
      h("div", { class: "panel-head" }, h("span", { class: "key" }, q.id), h("h2", { id: `${choiceId}-t` }, q.text || q.category), tag(q.category, "line"), q.blocks ? tag(`막는 게이트 ${q.blocks}`, "gate") : null, h("div", { class: "aside" }, `답할 직무 ${q.role}`)),
      h("div", { class: "panel-body stack-y" },
        radios,
        q.open ? h("div", { class: "field" }, h("label", { for: `${choiceId}-memo` }, "메모"), memo) : null,
        q.answer ? h("p", { class: "ans" }, icon("ok", "s"), ` 답: ${q.answer}`) : null,
        ...q.notes.map((n) => h("p", { class: "muted small" }, `메모: ${n}`)),
        ...q.opinions.map((n) => h("p", { class: "muted small" }, `의견: ${n}`)),
        q.open && !readOnly ? h("div", null, h("div", { class: "ident" }, icon("commit"), "git user.email ", h("b", null, email ?? "-"), "로 questions.md 에 기록"), h("div", { class: "flex" }, button("답 저장", { kind: "primary", icon: "check", onClick: () => void answer() }))) : null,
        out),
    );
  }

  function draw() {
    clear(listHost).append(head());
    if (readOnly) listHost.append(banner("warn", "lock", h("b", null, "읽기 전용. "), "에이전트 세션에서 연 서버는 답을 받지 않는다. 사람이 자기 터미널에서 연 서버에서 한다."));
    if (!doc.questions.length) listHost.append(emptyState("질문이 없다", doc.sha256 ? "questions.md 에 질문이 없다." : "아직 questions.md 가 없다."));
    for (const q of doc.questions) listHost.append(card(q));
  }
  draw();
  host.append(listHost);
  return undefined;
}
