// S10 운영 기록(선택 화면). 서버의 /ops 는 HK-21(배포 · 운영, 설계 14)이 채운다. 지금은 501 이면 "제공 예정" 상태를 보인다.
import { get } from "../api.js";
import { h, icon } from "../dom.js";
import { banner, commandBox, emptyState, errorState } from "../ui.js";

export async function render(ctx) {
  const { host } = ctx;
  ctx.setHeader({ title: "운영", sub: "배포 · 운영 기록 · 전달 지표 · 규칙 후보(선택 화면)", tools: [ctx.searchBox().form] });
  const r = await get("/ops");
  if (!r.ok && r.error.code === "not_implemented") {
    host.append(h("div", { class: "stack-y" },
      banner("info", "ops", h("b", null, "운영 기록은 아직 제공하지 않는다. "), `이 화면의 데이터(배포 기록 · 운영 기록 · 장애 · 다음 요구사항 후보 · 전달 지표 · 자동 검증 배포 · 규칙 후보)는 ${r.error.details?.stage ?? "HK-21"}(설계 14)이 만든다.`),
      emptyState("제공 예정", "운영 기록이 생기면 이 화면에서 읽는다. 읽기만 하고, 접수는 새 요구사항(S11)에서 한다.", h("span", { class: "muted small" }, icon("terminal", "s"), " 콘솔: ", h("code", null, "npx harness-kit status --ops"), " (같은 이슈에서 제공)")),
      commandBox("npx harness-kit status --ops", "명령 복사")));
    return undefined;
  }
  if (!r.ok) {
    host.append(errorState(r.error, ctx.rerender));
    return undefined;
  }
  // 서버가 채워지면 최상위 목록을 그대로 표로 보인다(형식은 설계 14 §3.12).
  host.append(h("div", { class: "stack-y" }, ...Object.entries(r.data).map(([k, v]) => h("section", { class: "panel", "aria-labelledby": `ops-${k}` }, h("div", { class: "panel-head" }, h("h2", { id: `ops-${k}` }, k)), h("div", { class: "panel-body" }, Array.isArray(v) && v.length ? h("ul", null, ...v.map((x) => h("li", null, typeof x === "string" ? x : JSON.stringify(x)))) : h("p", { class: "muted" }, Array.isArray(v) ? "없음" : String(JSON.stringify(v))))))));
  return undefined;
}
