// 문서 메뉴: 이슈 문서(requirements · design · tasks)와 승인 상태, Intent 와 질문. 기획물 · 기능 문서 · ADR 목록은 다음 판에서 정의한다(화면기획서 3장).
import { get } from "../api.js";
import { h } from "../dom.js";
import { GATE_KO } from "../format.js";
import { link } from "../router.js";
import { emptyState, tag } from "../ui.js";
import { loadAll } from "./common.js";

const APPROVAL = { valid: ["ops", "승인됨"], stale: ["build", "승인 뒤 바뀜"], invalid: ["gate", "승인자 아님"], none: ["line", "승인 전"] };

export async function render(ctx) {
  const { host, route } = ctx;
  ctx.setHeader({ title: "문서", sub: "이슈 문서 · 승인 상태 · 질문. 찾기는 이슈 키나 문서 경로를 받는다", tools: [ctx.searchBox().form] });
  const res = await loadAll(ctx, [get("/issues"), get("/intents")]);
  if (!res) return undefined;
  const [issuesR, intentsR] = res;
  const q = (route.query.q ?? "").toLowerCase();
  const issues = issuesR.data.issues.filter((i) => !q || `${i.key} ${i.name} ${i.title ?? ""} ${i.dir}`.toLowerCase().includes(q));
  const intents = intentsR.data.intents.filter((i) => !q || `${i.key} ${i.name} ${i.title ?? ""}`.toLowerCase().includes(q));
  if (q) host.append(h("p", { class: "muted small" }, `"${route.query.q}" 로 거른 결과 — 이슈 ${issues.length} · Intent ${intents.length}`));
  const rows = issues.map((i) => h("tr", null, h("td", null, link(`/issues/${i.key}`, { class: "key" }, i.key)), h("td", null, i.title ?? i.name), ...["requirements", "design", "tasks"].map((d) => {
    const doc = i.docs[d];
    if (!doc) return h("td", null, h("span", { class: "muted xs" }, "없음"));
    const [tone, text] = APPROVAL[doc.approval] ?? ["line", doc.approval];
    return h("td", null, link(`/issues/${i.key}/docs/${d}`, {}, doc.status ?? doc.state ?? "-"), " ", d === "tasks" ? null : tag(text, tone), doc.clarify ? h("span", null, " ", tag(`CLARIFY ${doc.clarify}`, "gate")) : null);
  }), h("td", null, i.waitingOn ? tag(`${GATE_KO[i.waitingOn.gate] ?? i.waitingOn.gate} 승인 대기`, "gate") : h("span", { class: "muted xs" }, "-"))));
  host.append(
    h("div", { class: "stack-y" },
      h("section", { class: "panel", "aria-labelledby": "docs-h" }, h("div", { class: "panel-head" }, h("h2", { id: "docs-h" }, "이슈 문서"), h("div", { class: "aside" }, `${issues.length}개`)),
        issues.length ? h("div", { class: "table-wrap" }, h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "이슈별 문서와 승인 상태"), h("thead", null, h("tr", null, ...["이슈", "제목", "requirements", "design", "tasks", "승인 대기"].map((t) => h("th", { scope: "col" }, t)))), h("tbody", null, ...rows))) : emptyState("이슈 문서가 없다", q ? "찾는 말을 바꿔 본다." : "이슈를 만들면 requirements · design · tasks 가 여기 나온다.")),
      h("section", { class: "panel", "aria-labelledby": "int-docs-h" }, h("div", { class: "panel-head" }, h("h2", { id: "int-docs-h" }, "Intent · 질문"), h("div", { class: "aside" }, `${intents.length}개`)),
        intents.length ? h("ul", { class: "int-list pad" }, ...intents.map((i) => h("li", null, h("span", { class: "key" }, i.key), " ", h("b", null, i.title ?? i.name), h("div", { class: "muted xs" }, `status ${i.status ?? "-"} · 기획물 ${i.plans.length}개 · 열린 질문 ${i.questions.open}/${i.questions.total}`), h("div", { class: "flex" }, link(`/intents/${i.key}/questions`, { class: "btn sm" }, "질문"), link(`/progress?view=flow&intent=${i.key}`, { class: "btn sm" }, "흐름"))))) : emptyState("Intent 가 없다", "새 요구사항을 접수하면 만들어진다.")),
    ),
  );
  return undefined;
}
