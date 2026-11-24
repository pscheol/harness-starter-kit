// S00 전체 프로젝트. 이 컴퓨터에 등록한 킷 리포의 처리할 일 · 진행 · 킷 버전을 한 화면에 모은다. 이 화면은 아무것도 쓰지 않는다(DB-R27).
import { get } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { ago, KIND_KO, STEP_KO } from "../format.js";
import { topLink } from "../router.js";
import { store } from "../store.js";
import { banner, commandBox, emptyState, errorState, harnessBadge, seg, skeleton, tag } from "../ui.js";

const TONE = { design: "design", requirements: "design", tasks: "build", impl: "build", verify: "build", mr: "build", done: "ops", completed: "ops", deploy: "ops" };

function stageSeg(stages) {
  const entries = Object.entries(stages ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const desc = entries.map(([k, n]) => `${k === "completed" ? "완료" : (STEP_KO[k] ?? k)} ${n}`).join(", ");
  const bar = h("span", { class: "vz-seg", role: "img", "aria-label": `단계별 이슈: ${desc || "없음"}` });
  for (const [k, n] of entries) {
    const s = h("span", { class: TONE[k] ?? "todo", title: `${k === "completed" ? "완료" : (STEP_KO[k] ?? k)} ${n}` });
    s.style.flexGrow = String(n);
    bar.append(s);
  }
  if (!total) bar.append(h("span", { class: "todo" }));
  return h("div", null, bar, h("div", { class: "muted xs" }, desc || "이슈 없음"));
}

export async function render(ctx) {
  const { host } = ctx;
  ctx.setHeader({ title: "전체 프로젝트", sub: "이 컴퓨터에 등록한 킷 리포 · 쓰기는 들어간 리포 안에서만 된다", tools: [h("span", { class: "tag line" }, icon("eye", "s"), "쓰기 없음 · 쓰기는 프로젝트 안에서")] });
  if (store.mode === "single") {
    host.append(h("div", { class: "stack-y" }, banner("info", "grid", h("b", null, "지금은 한 리포만 연 서버다. "), "여러 리포를 한 화면에서 보려면 등록부(", h("code", null, "~/.config/harness-kit/projects.json"), ")나 폴더를 가리켜 서버를 다시 연다."), commandBox("npx harness-kit dashboard --all", "--all 복사"), commandBox("npx harness-kit dashboard --root ~/work", "--root 복사"), commandBox("npx harness-kit projects add <폴더>", "등록 명령 복사")));
    return undefined;
  }
  host.append(skeleton(5));
  const [listR, overR, sessR] = await Promise.all([get("/projects", { scope: "top" }), get("/projects/overview", { scope: "top" }), get("/sessions", { scope: "top", query: { scope: "machine" } })]);
  if (!ctx.isCurrent()) return undefined;
  clear(host);
  if (!listR.ok) {
    host.append(errorState(listR.error, ctx.rerender));
    return undefined;
  }
  const projects = listR.data.projects;
  const over = overR.ok ? overR.data.projects : [];
  const byId = new Map(over.map((o) => [o.id, o]));
  const sessions = sessR.ok ? sessR.data.sessions : [];
  let group = "project";
  let only = "all";

  if (!projects.length) {
    host.append(emptyState("등록된 프로젝트가 없다", "킷을 설치한 리포를 등록하면 여기서 한꺼번에 본다.", commandBox("npx harness-kit projects add <폴더>", "명령 복사")));
    return undefined;
  }

  const total = over.reduce((s, o) => s + (o.total ?? 0), 0);
  const todoHost = h("div", { "aria-live": "polite" });
  const readOverviewFailed = !overR.ok;

  function drawTodo() {
    clear(todoHost);
    if (readOverviewFailed) todoHost.append(banner("err", "alert", "처리할 일을 모으지 못했다: ", overR.error.message));
    const rows = over.filter((o) => o.state === "ok" && (only === "all" || o.id === only));
    if (group === "project") {
      for (const o of rows) {
        if (!o.todo.length) continue;
        todoHost.append(h("div", { class: "todo-group" }, h("h3", null, o.name, h("span", { class: "muted" }, ` ${o.total}`)), topLink(`/p/${o.id}/`, {}, "홈 열기")), h("ol", { class: "todo-list" }, ...o.todo.map((t) => row(o, t))));
      }
    } else {
      const flat = rows.flatMap((o) => o.todo.map((t) => ({ o, t })));
      const kinds = [...new Set(flat.map(({ t }) => t.kind))];
      for (const k of kinds) {
        const items = flat.filter(({ t }) => t.kind === k);
        todoHost.append(h("div", { class: "todo-group" }, h("h3", null, KIND_KO[k] ?? k, h("span", { class: "muted" }, ` ${items.length}`))), h("ol", { class: "todo-list" }, ...items.map(({ o, t }) => row(o, t))));
      }
    }
    if (!todoHost.querySelector(".todo-list") && !readOverviewFailed) todoHost.append(emptyState("처리할 일이 없다", "등록한 프로젝트 모두 조용하다."));
  }

  function row(o, t) {
    return h("li", { class: "todo-row" }, h("span", { class: "dia", "aria-hidden": "true" }), h("span", { class: "key" }, /^[A-Z][A-Z0-9]+-\d+$/.test(t.target) ? t.target : "—"), h("div", { class: "todo-main" }, h("div", { class: "todo-title" }, topLink(`/p/${o.id}${t.link}`, {}, t.title), " ", tag(o.name, "line")), h("div", { class: "muted small" }, t.reason, " · ", ago(t.since))), topLink(`/p/${o.id}${t.link}`, { class: "btn sm" }, "열기"));
  }

  const left = h("section", { class: "panel lift", "aria-labelledby": "ptodo-h" }, h("div", { class: "panel-head" }, h("h2", { id: "ptodo-h" }, "처리할 일"), h("span", { class: "tag solid-gate" }, String(total)), h("div", { class: "aside" }, `프로젝트 ${over.filter((o) => o.state === "ok").length}곳 · 각 체크아웃의 git 사용자 기준`)),
    h("div", { class: "panel-body stack-y" }, h("div", { class: "flex wrap" }, seg("묶기", [{ id: "project", label: "프로젝트별" }, { id: "kind", label: "종류별" }], group, (v) => {
      group = v;
      drawTodo();
    }), h("label", { class: "muted small", for: "p-only" }, "프로젝트"), h("select", { id: "p-only", onchange: (e) => {
      only = e.target.value;
      drawTodo();
    } }, h("option", { value: "all" }, `모두 ${total}`), ...over.filter((o) => o.state === "ok").map((o) => h("option", { value: o.id }, `${o.name} ${o.total}`)))), todoHost));
  drawTodo();

  const cards = projects.map((p) => {
    const o = byId.get(p.id);
    const mySess = sessions.filter((s) => s.projectId === p.id);
    if (p.state !== "ok") {
      return h("article", { class: "panel proj off", "aria-label": p.name }, h("div", { class: "panel-body stack-y" }, h("div", { class: "flex" }, icon("folder"), h("b", null, p.name), tag(p.state === "missing" ? "없음" : "킷 리포 아님", "line")), h("p", { class: "path" }, p.path), h("p", { class: "small muted" }, "폴더가 없다. 옮겼거나 지웠다. 등록부에서 저절로 지우지 않는다."), commandBox(p.remove ?? `npx harness-kit projects remove ${p.name}`, "복사")));
    }
    return h("article", { class: "panel proj", "aria-label": p.name }, h("div", { class: "panel-body stack-y" },
      h("div", { class: "flex" }, icon("folder"), h("b", { class: "grow" }, p.name), o && o.state === "ok" ? tag(`처리할 일 ${o.total}`, o.total ? "gate" : "ops") : tag("읽기 실패", "gate"), topLink(`/p/${p.id}/`, { class: "btn sm" }, "열기", icon("chev", "s"))),
      h("p", { class: "path" }, p.path, p.addedAt ? ` · ${p.addedAt} 더함` : ""),
      o && o.state === "ok" ? h("div", { class: "proj-facts" }, h("div", null, h("span", { class: "muted xs" }, "진행"), stageSeg(o.stages), h("span", { class: "muted xs" }, `이슈 ${o.issues}`)), h("div", null, h("span", { class: "muted xs" }, "킷"), h("div", null, p.version ?? "?")), h("div", null, h("span", { class: "muted xs" }, "세션"), h("div", null, `${o.sessions?.alive ?? 0}개`))) : h("p", { class: "small err-text" }, o?.error ?? "읽지 못했다"),
      (o?.children ?? []).length ? h("details", null, h("summary", null, `하위 리포 ${o.children.length}개`), h("ul", null, ...o.children.map((c) => h("li", null, c.name, " ", tag(c.state, "line"))))) : null,
      mySess.length ? h("p", { class: "muted xs" }, `켜 둔 세션 ${mySess.length}개`) : null));
  });
  const right = h("div", { class: "stack-y" }, h("section", { "aria-labelledby": "plist-h" }, h("h2", { id: "plist-h", class: "sr-only" }, "프로젝트"), h("div", { class: "stack-y" }, ...cards)),
    h("section", { class: "panel", "aria-labelledby": "msess-h" }, h("div", { class: "panel-head" }, h("h2", { id: "msess-h" }, "켜 둔 세션"), h("div", { class: "aside" }, `${sessions.filter((s) => s.state !== "gone").length}개 · 이 컴퓨터 전체`)),
      h("div", { class: "panel-body" }, sessions.length ? h("ul", { class: "sess-list" }, ...sessions.map((s) => h("li", null, h("span", { class: `dot ${s.state === "gone" ? "off" : s.turn === "working" ? "busy" : "idle"}`, "aria-hidden": "true" }), h("div", { class: "grow" }, h("b", null, s.name ?? s.id.slice(0, 10)), h("div", { class: "muted xs" }, s.project, " · ", harnessBadge(s.harness), s.issue ? ` · ${s.issue}` : "")), h("span", { class: "muted xs" }, s.state === "gone" ? "끊김" : s.turn === "working" ? "일하는 중" : "쉬는 중")))) : h("p", { class: "muted small" }, "켜 둔 세션이 없다"))));
  host.append(h("p", { class: "muted small" }, icon("folder", "s"), ` 등록된 프로젝트 ${projects.length} · `, h("code", null, "~/.config/harness-kit/projects.json"), " · 경로 · 이름 · 더한 날만 둔다. 리포 안 파일은 그 리포에서 읽는다."), h("div", { class: "projects-grid" }, left, right));
  return undefined;
}
