// S09 하네스: doctor · 켠 하네스와 모듈 · 역할 배정 · 흐름 틀 · 승인 권한 · 버전. 설정은 읽기만 한다(고치는 명령을 복사하게 한다).
import { errorText, get, post } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { fmtBytes, GATE_KO, HARNESS_KO } from "../format.js";
import { link } from "../router.js";
import { store } from "../store.js";
import { banner, button, commandBox, emptyState, harnessBadge, tag } from "../ui.js";
import { loadAll } from "./common.js";

const problemText = (p) => (typeof p === "string" ? p : [p.kind ?? p.id, p.path, p.message].filter(Boolean).join(" · "));

export async function render(ctx) {
  const { host } = ctx;
  ctx.setHeader({ title: "하네스", sub: "doctor · 층 · 역할 · 승인 권한 · 버전. 설정은 읽기만 한다", tools: [ctx.searchBox().form] });
  const res = await loadAll(ctx, [get("/harness"), get("/usage/kit")]);
  if (!res) return undefined;
  const hr = res[0].data;
  const kit = res[1].data;
  const s = store.session;
  const d = hr.doctor;
  const problems = d?.problems ?? [];
  const outHost = h("div", { "aria-live": "polite" });

  async function outdated() {
    clear(outHost).append(banner("info", "clock", "최신 판을 조회하는 중…(네트워크를 쓴다)"));
    const r = await post("/harness/outdated", {});
    if (!r.ok) {
      clear(outHost).append(banner("warn", "alert", errorText(r.error)));
      return;
    }
    const o = r.data;
    clear(outHost).append(banner(o.outdated || o.newer ? "warn" : "ok", o.outdated || o.newer ? "alert" : "ok", h("b", null, "조회했다. "), typeof o.message === "string" ? o.message : h("code", null, JSON.stringify(o).slice(0, 300))));
  }

  const approvers = s?.approvers ?? {};
  const gateRows = hr.gates.map((g) => h("tr", null, h("td", null, tag(GATE_KO[g] ?? g, hr.floor.includes(g) ? "design" : "line")), h("td", null, hr.floor.includes(g) ? "바닥(줄일 수 없다)" : "팀 설정"), h("td", null, approvers[g]?.length ? approvers[g].map((a) => h("code", { class: "key" }, `${a} `)) : h("span", { class: "muted" }, "비어 있음 → git 사용자 누구나"))));

  host.append(h("div", { class: "harness-grid" },
    h("div", { class: "stack-y" },
      h("section", { class: "panel lift", "aria-labelledby": "dr-h" }, h("div", { class: "panel-head" }, icon(problems.length ? "alert" : "ok"), h("h2", { id: "dr-h" }, "doctor"), d ? tag(problems.length ? `문제 ${problems.length}건` : d.status === "unavailable" ? "점검 도구 없음" : "통과", problems.length ? "build" : d.status === "unavailable" ? "line" : "ops") : tag("없음", "line")),
        h("div", { class: "panel-body stack-y" }, d ? (problems.length ? h("ul", { class: "problems" }, ...problems.map((p) => h("li", null, icon("alert", "s"), problemText(p)))) : h("p", { class: "small" }, d.status === "unavailable" ? "이 서버에서는 doctor 를 부를 수 없다. 터미널에서 돌린다." : "설치 상태에 문제가 없다.")) : h("p", { class: "small muted" }, "doctor 결과가 없다."),
          d?.counts && Object.keys(d.counts).length ? h("p", { class: "muted small" }, Object.entries(d.counts).map(([k, n]) => `${k} ${n}`).join(" · ")) : null, commandBox("npx harness-kit doctor", "명령 복사"))),
      h("section", { class: "panel", "aria-labelledby": "ap-h2" }, h("div", { class: "panel-head" }, h("h2", { id: "ap-h2" }, "흐름 · 승인 권한"), h("div", { class: "aside" }, "flow.gates · approvers")),
        h("div", { class: "table-wrap" }, h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "게이트와 승인자"), h("thead", null, h("tr", null, ...["게이트", "구분", "승인자"].map((t) => h("th", { scope: "col" }, t)))), h("tbody", null, ...gateRows))),
        h("div", { class: "panel-body stack-y" }, h("p", { class: "muted small" }, "approvers 는 선택이다. 게이트가 비어 있으면 이 리포의 git 사용자 누구나 승인한다. 신원은 이 체크아웃의 git user.email 이다."), h("div", { class: "ident" }, icon("commit"), "지금 ", h("b", null, s?.user?.email ?? "git user.email 없음"), s?.user?.groups?.length ? ` · 그룹 ${s.user.groups.join(", ")}` : ""), commandBox("npx harness-kit flow gates --add <게이트> --after <게이트>", "흐름 틀 명령 복사")))),
    h("div", { class: "stack-y" },
      h("section", { class: "panel", "aria-labelledby": "ver-h" }, h("div", { class: "panel-head" }, h("h2", { id: "ver-h" }, "버전 · 켠 것"), h("div", { class: "aside" }, hr.kit.version ? `킷 ${hr.kit.version}` : "")),
        h("div", { class: "panel-body stack-y" },
          h("dl", { class: "kv-grid" }, h("dt", null, "킷 판"), h("dd", null, hr.kit.version ?? "?"), h("dt", null, "화면 · CLI"), h("dd", null, s?.version ?? "?"), h("dt", null, "하네스"), h("dd", null, hr.agents.length ? hr.agents.map((a) => harnessBadge(a)) : "-"), h("dt", null, "선택 모듈"), h("dd", null, hr.modules.length ? hr.modules.join(" · ") : "없음")),
          h("div", { class: "flex wrap" }, button("최신 판 조회", { icon: "refresh", onClick: () => void outdated() }), h("span", { class: "muted xs" }, "버튼을 눌렀을 때만 네트워크를 쓴다")), outHost, commandBox("npx harness-kit outdated", "명령 복사"))),
      h("section", { class: "panel", "aria-labelledby": "role-h" }, h("div", { class: "panel-head" }, h("h2", { id: "role-h" }, "역할 배정")),
        h("div", { class: "panel-body" }, Object.keys(hr.roles).length ? h("ul", { class: "role-list" }, ...Object.entries(hr.roles).map(([role, v]) => h("li", null, h("b", null, role), " → ", harnessBadge(v?.harness ?? v), v?.model ? h("span", { class: "muted xs" }, ` ${v.model}`) : null))) : emptyState("역할 배정이 없다", "harness-kit.json 의 roles 가 비었다."))),
      h("section", { class: "panel", "aria-labelledby": "tok-h" }, h("div", { class: "panel-head" }, h("h2", { id: "tok-h" }, "킷이 덧붙인 토큰"), h("div", { class: "aside" }, link("/usage", {}, "자세히"))),
        h("div", { class: "panel-body stack-y" }, h("p", { class: "small" }, `세션 시작 평균 ${kit.sessionStart.avgBytes} / ${kit.sessionStart.limit}바이트(약 ${kit.sessionStart.estTokens} 토큰) `, tag(kit.sessionStart.within ? "상한 안" : "상한 넘음", kit.sessionStart.within ? "ops" : "gate")), h("p", { class: "muted xs" }, `소유자별 세션마다 실리는 파일: ${kit.modules.map((m) => `${m.owner} ${m.files}개 ${fmtBytes(m.bytes)}`).join(" · ") || "-"}`))),
      h("p", { class: "muted xs" }, "지원 하네스: ", Object.values(HARNESS_KO).join(" · ")))));
  return undefined;
}
