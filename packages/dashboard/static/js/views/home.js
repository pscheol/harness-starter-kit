// S01 홈 · 처리할 일. 하루의 시작 화면 맨 위에 승인 · 리뷰 판단 · 질문 답 · 정리를 모은다(첫 화면 안에 끝난다).
import { get } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { ago, clock, groupTodos, HARNESS_KO, railSpec, ROLE_KO, STEP_KO } from "../format.js";
import { link } from "../router.js";
import { refreshOverview, store, subscribe } from "../store.js";
import { banner, emptyState, gateRail, harnessBadge, readOnlyNote, seg, tag } from "../ui.js";
import { ACTION, loadAll } from "./common.js";

const KIND_TAG = {
  "review-blocker": ["gate", "리뷰 막힘"],
  "quality-blocker": ["gate", "품질 게이트"],
  "gate-mine": ["gate", "내 차례"],
  questions: ["design", "질문"],
  "verify-failed": ["gate", "검증 실패"],
  "approval-stale": ["build", "다시 승인"],
  "gate-others": ["line", "다른 사람"],
  "worktree-cleanup": ["line", "정리"],
  harness: ["build", "하네스"],
  "dispatch-stale": ["line", "대기함"],
};

function todoRow(t, issues, gates) {
  const issue = issues.get(t.target);
  const [tone, tagText] = KIND_TAG[t.kind] ?? ["line", t.kind];
  const primary = t.kind === "gate-mine" || t.kind === "approval-stale";
  return h(
    "li",
    { class: "todo-row" },
    h("span", { class: "dia", "aria-hidden": "true" }),
    h("span", { class: "key" }, /^[A-Z][A-Z0-9]+-\d+$/.test(t.target) ? t.target : "—"),
    h("div", { class: "todo-main" }, h("div", { class: "todo-title" }, link(t.link, {}, t.title), " ", tag(tagText, tone)), h("div", { class: "muted small" }, t.reason, " · ", h("time", { datetime: t.since }, ago(t.since)))),
    issue ? h("span", { class: "rail-slot" }, gateRail(railSpec(gates, issue))) : null,
    link(t.link, { class: `btn sm${primary ? " approve" : ""}`, "aria-label": `${ACTION[t.kind] ?? "열기"}: ${t.title}` }, ACTION[t.kind] ?? "열기"),
  );
}

function stageBars(stages, gates) {
  const order = [...gates.filter((g) => ["requirements", "design", "tasks", "mr"].includes(g)), "completed"];
  const label = (s) => (s === "completed" ? "완료" : (STEP_KO[s] ?? s));
  const entries = order.map((s) => [s, stages[s] ?? 0]);
  const extra = Object.keys(stages).filter((s) => !order.includes(s));
  extra.forEach((s) => entries.push([s, stages[s]]));
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return h(
    "ul",
    { class: "stage-bars", "aria-label": "단계별 이슈 수" },
    ...entries.map(([s, n]) => {
      const bar = h("span", { class: "sb-bar" });
      bar.style.width = `${Math.round((n / max) * 100)}%`;
      return h("li", null, h("span", { class: "sb-l" }, label(s)), h("span", { class: "sb-t" }, bar), h("b", null, String(n)));
    }),
  );
}

export async function render(ctx) {
  const { host } = ctx;
  const s = store.session;
  await refreshOverview();
  ctx.setHeader({
    title: "홈",
    sub: `${s?.repo ?? ""} · ${store.readAt ? `${clock(store.readAt.toISOString())}에 다시 읽었다` : ""}`,
    tools: [ctx.searchBox().form, doctorChip(), h("span", { class: "tag line" }, `kit ${s?.version ?? "?"}`)],
  });
  const res = await loadAll(ctx, [get("/issues"), get("/sessions"), get("/intents")]);
  if (!res) return undefined;
  const [issuesR, sessR, intentsR] = res;
  const issues = new Map(issuesR.data.issues.map((i) => [i.key, i]));
  const gates = s?.flow.gates ?? [];
  let onlyMine = false;

  const todoHost = h("div", { class: "todo-host", "aria-live": "polite" });
  const countTag = h("span", { class: "tag solid-gate" }, "0");
  const head = h("div", { class: "panel-head" }, h("h2", { id: "todo-h" }, "처리할 일"), countTag, h("div", { class: "aside" }, seg("보기", [{ id: "all", label: "모두" }, { id: "mine", label: "내가 할 것" }], "all", (v) => {
    onlyMine = v === "mine";
    draw();
  })));
  const panel = h("section", { class: "panel lift", "aria-labelledby": "todo-h" }, head, todoHost);

  function draw() {
    const o = store.overview;
    if (!o) return;
    countTag.textContent = String(o.total);
    clear(todoHost);
    const groups = groupTodos(o.todo, onlyMine);
    if (!groups.length) {
      todoHost.append(emptyState(onlyMine ? "내가 할 것이 없다" : "처리할 일이 없다", onlyMine ? "'모두'에서 다른 사람이 할 것을 볼 수 있다." : "승인 · 질문 · 정리할 것이 없다. 새 요구사항을 접수하거나 진행 화면에서 이슈를 본다.", link("/progress", { class: "btn sm" }, "진행 보기")));
    }
    for (const g of groups) {
      todoHost.append(h("div", { class: "todo-group" }, h("h3", null, g.title, h("span", { class: "muted" }, ` ${g.items.length}`)), h("span", { class: "muted xs" }, g.hint)), h("ol", { class: "todo-list" }, ...g.items.map((t) => todoRow(t, issues, gates))));
    }
    const more = Object.entries(o.more ?? {});
    if (more.length) todoHost.append(h("p", { class: "panel-foot" }, `50건을 넘어 건수만 보인다: ${more.map(([r, n]) => `rank ${r} ${n}건`).join(" · ")}`));
    if (o.errors?.length) todoHost.append(banner("warn", "alert", "일부를 읽지 못했다: ", o.errors.slice(0, 3).join(" · ")));
  }
  draw();

  const left = h("div", { class: "stack-y" }, panel);
  if (store.overview?.stages && Object.keys(store.overview.stages).length) {
    left.append(h("section", { class: "panel", "aria-labelledby": "stage-h" }, h("div", { class: "panel-head" }, h("h2", { id: "stage-h" }, "단계별 이슈"), h("div", { class: "aside" }, `이슈 ${store.overview.issues}개`)), h("div", { class: "panel-body" }, stageBars(store.overview.stages, gates))));
  }

  const sessions = sessR.data.sessions;
  const intents = intentsR.data.intents.filter((i) => i.status !== "completed");
  const right = h(
    "div",
    { class: "stack-y" },
    h("section", { class: "panel", "aria-labelledby": "sess-h" }, h("div", { class: "panel-head" }, h("h2", { id: "sess-h" }, "켜 둔 세션"), h("div", { class: "aside" }, `${store.overview?.sessions?.alive ?? 0}개 · 같은 컴퓨터`)),
      h("div", { class: "panel-body" }, sessions.length ? h("ul", { class: "sess-list" }, ...sessions.map((x) => h("li", null, h("span", { class: `dot ${x.state === "gone" ? "off" : x.turn === "working" ? "busy" : "idle"}`, "aria-hidden": "true" }), h("div", { class: "grow" }, h("b", null, x.name ?? x.id.slice(0, 12)), h("div", { class: "muted xs" }, harnessBadge(x.harness), x.issue ? ` · ${x.issue}` : "", x.role ? ` · ${ROLE_KO[x.role] ?? x.role}` : "")), h("span", { class: "muted xs" }, x.state === "gone" ? "끊김" : x.turn === "working" ? "일하는 중" : x.state === "alive" ? "쉬는 중" : "수신함 없음")))) : emptyState("켜 둔 세션이 없다", "세션이 시작되면 훅이 이 목록에 등록한다."), h("p", { class: "muted xs" }, `Codex · Kiro 는 수신함이 없어 요청을 대기함에 둔다. ${HARNESS_KO.codex} 는 다음 세션 시작 때 건수와 첫 요청 한 줄을 본다.`))),
    h("section", { class: "panel", "aria-labelledby": "int-h" }, h("div", { class: "panel-head" }, h("h2", { id: "int-h" }, "진행 중 Intent"), h("div", { class: "aside" }, link("/progress", {}, "보드"), " · ", link("/progress?view=flow", {}, "흐름"))),
      h("div", { class: "panel-body" }, intents.length ? h("ul", { class: "int-list" }, ...intents.map((i) => h("li", null, h("b", null, i.title ?? i.name), " ", h("span", { class: "key" }, i.key), h("div", { class: "muted xs" }, `Unit ${i.units.length} · 열린 질문 ${i.questions.open}${i.proposal ? " · 변경 제안 있음" : ""}`), h("div", { class: "flex" }, link(`/progress?view=flow&intent=${i.key}`, { class: "btn sm" }, "흐름"), i.questions.open ? link(`/intents/${i.key}/questions`, { class: "btn sm" }, "질문") : null)))) : emptyState("Intent 가 없다", "새 요구사항을 접수하면 Intent 가 생긴다."))),
  );

  host.append(h("div", { class: "home-grid" }, left, right));
  if (s?.readOnly) host.prepend(h("div", { class: "ro-strip" }, readOnlyNote("읽기 전용(에이전트 세션에서 연 서버)"), h("span", { class: "muted small" }, " 보기만 된다. 승인 · 답 · 저장은 사람이 자기 터미널에서 연 서버에서 한다.")));
  if (store.loadError) host.prepend(banner("err", "alert", "서버와 연결이 끊겼다. 서버를 연 터미널이 켜져 있는지 본다."));

  const unsub = subscribe(draw);
  return unsub;
}

function doctorChip() {
  const d = store.overview?.doctor;
  if (!d || d.status === "ok" || d.status === "unavailable") return h("span", { class: "tag ops" }, icon("ok", "s"), "doctor 통과");
  return link("/harness", { class: "tag build" }, icon("alert", "s"), `doctor 경고 ${d.problems?.length ?? ""}`);
}

