// S07 작업 공간: worktree 목록 · 끝의 정의 판정 · 세션과 점유 파일 · 대기함. 화면은 정리 명령을 보여 주기만 하고 실행하지 않는다(DB-R10).
import { del, errorText, get } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { ago, ROLE_KO } from "../format.js";
import { link } from "../router.js";
import { store } from "../store.js";
import { banner, button, commandBox, emptyState, harnessBadge, tag, toast } from "../ui.js";
import { loadAll } from "./common.js";

const cond = (ok, yes, no) => h("span", { class: ok ? "cond ok" : "cond bad" }, icon(ok ? "ok" : "fail", "s"), ok ? yes : no);

export async function render(ctx) {
  const { host } = ctx;
  ctx.setHeader({ title: "작업 공간", sub: "worktree · 끝의 정의 · 세션 · 대기함. 정리는 터미널에서", tools: [ctx.searchBox().form] });
  const res = await loadAll(ctx, [get("/worktrees"), get("/sessions"), get("/dispatch/queue")]);
  if (!res) return undefined;
  const wt = res[0].data;
  const sessions = res[1].data.sessions;
  let queue = res[2].data.items;
  const readOnly = Boolean(store.session?.readOnly);

  const rows = wt.worktrees.map((w) => h("tr", null,
    h("td", null, h("b", null, w.name), h("div", { class: "path" }, w.path)),
    h("td", null, w.kind === "main" ? tag("메인", "line") : tag("worktree", "design"), h("div", { class: "muted xs" }, w.branch ?? "분리된 HEAD")),
    h("td", null, w.issue ? link(`/issues/${w.issue}`, { class: "key" }, w.issue) : "—"),
    h("td", null, cond(!w.dirty, "변경 없음", "커밋 안 된 변경")),
    h("td", null, cond(w.unpushed === 0, "push 안 된 커밋 0", `push 안 된 커밋 ${w.unpushed}`)),
    h("td", null, w.kind === "main" ? h("span", { class: "muted xs" }, "-") : cond(w.merged === true, "병합됨", "병합 전")),
    h("td", null, w.done ? tag("정리 가능", "ops") : h("span", { class: "muted xs" }, w.kind === "main" ? "-" : "아직"), h("div", { class: "muted xs" }, ago(w.lastUsed))),
    h("td", null, w.done ? commandBox(`python3 scripts/harness/worktree.py done ${w.name}`, "복사") : null),
  ));

  const queueHost = h("div", { "aria-live": "polite" });
  function drawQueue() {
    clear(queueHost);
    if (!queue.length) {
      queueHost.append(emptyState("대기함이 비었다", "Codex · Kiro 세션이나 사람이 대기함을 고른 요청이 여기 쌓인다. 훅이 다음 세션 시작 때 건수와 첫 요청 한 줄만 보여 준다."));
      return;
    }
    queueHost.append(h("ul", { class: "queue-list" }, ...queue.map((q) => h("li", null, h("div", { class: "grow" }, h("div", { class: "small" }, q.message.slice(0, 160)), h("div", { class: "muted xs" }, `${q.kind ?? ""} · ${q.createdBy ?? ""} · ${ago(q.createdAt)}${q.stale ? " · 24시간 넘게 가져가지 않았다" : ""} · ${q.id}`), q.paths.length ? h("code", { class: "path" }, q.paths.join(", ")) : null), q.stale ? tag("오래됨", "build") : null, button("버리기", { sm: true, kind: "danger", icon: "trash", disabled: readOnly, title: readOnly ? "읽기 전용" : "", onClick: async () => {
      const r = await del(`/dispatch/queue/${encodeURIComponent(q.id)}`);
      if (!r.ok) {
        toast(errorText(r.error));
        return;
      }
      queue = queue.filter((x) => x.id !== q.id);
      toast("대기함 항목을 버렸다");
      drawQueue();
    } })))));
  }
  drawQueue();

  host.append(h("div", { class: "stack-y" },
    wt.over ? banner("warn", "alert", h("b", null, `worktree ${wt.count}개 — 리포당 상한 ${wt.maxPerRepo}개를 넘었다. `), "끝난 것부터 정리한다.") : null,
    h("section", { class: "panel", "aria-labelledby": "wt-h" }, h("div", { class: "panel-head" }, h("h2", { id: "wt-h" }, "worktree"), h("div", { class: "aside" }, `${wt.count}개 / 상한 ${wt.maxPerRepo}`)),
      h("div", { class: "table-wrap" }, h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "worktree 와 끝의 정의 판정"), h("thead", null, h("tr", null, ...["폴더", "종류 · 브랜치", "이슈", "변경", "push", "병합", "끝", "정리 명령"].map((t) => h("th", { scope: "col" }, t)))), h("tbody", null, ...rows))),
      h("div", { class: "panel-foot" }, "끝의 정의 = 변경 없음 + push 안 된 커밋 0 + 브랜치 병합됨. 화면은 아무것도 지우지 않는다. 사람이 터미널에서: ", h("code", null, wt.gc))),
    h("div", { class: "two-col" },
      h("section", { class: "panel", "aria-labelledby": "ss-h" }, h("div", { class: "panel-head" }, h("h2", { id: "ss-h" }, "세션 · 점유 파일"), h("div", { class: "aside" }, `${sessions.filter((s) => s.state !== "gone").length}개 살아 있음`)),
        h("div", { class: "panel-body" }, sessions.length ? h("ul", { class: "sess-list" }, ...sessions.map((s) => h("li", null, h("span", { class: `dot ${s.state === "gone" ? "off" : s.turn === "working" ? "busy" : "idle"}`, "aria-hidden": "true" }), h("div", { class: "grow" }, h("b", null, s.name ?? s.id.slice(0, 12)), h("div", { class: "muted xs" }, harnessBadge(s.harness), ` · ${ROLE_KO[s.role] ?? s.role ?? "역할 모름"}${s.issue ? ` · ${s.issue}` : ""} · ${s.state === "gone" ? "끊김" : s.state === "alive" ? "수신함 있음" : "수신함 없음"}`), s.files.length ? h("div", { class: "path" }, `점유: ${s.files.join(", ")}`) : null)))) : emptyState("등록된 세션이 없다", "세션 시작 훅이 등록한다."))),
      h("section", { class: "panel", "aria-labelledby": "q-h" }, h("div", { class: "panel-head" }, h("h2", { id: "q-h" }, "대기함"), h("div", { class: "aside" }, `${queue.length}건`)), h("div", { class: "panel-body" }, queueHost))),
  ));
  return undefined;
}
