// 관리 페이지 진입. 모드를 정하고(단일 리포 · 전체 프로젝트 · 프로젝트 안) 틀을 그린 뒤 화면 모듈을 늦게 불러온다.
import { get } from "./api.js";
import { clear } from "./dom.js";
import { currentRoute, onRoute } from "./router.js";
import { buildShell, renderRail, searchBox, setHeader } from "./shell.js";
import { detectMode, loadSession, refreshOverview, refreshUsageNow, startPolling, store, subscribe } from "./store.js";
import { errorState, skeleton } from "./ui.js";

const VIEWS = {
  home: () => import("./views/home.js"),
  projects: () => import("./views/projects.js"),
  progress: () => import("./views/progress.js"),
  flow: () => import("./views/flow.js"),
  intent: () => import("./views/progress.js"),
  issue: () => import("./views/issue.js"),
  docs: () => import("./views/docs.js"),
  questions: () => import("./views/questions.js"),
  verify: () => import("./views/verify.js"),
  workspace: () => import("./views/workspace.js"),
  skills: () => import("./views/skills.js"),
  harness: () => import("./views/harness.js"),
  ops: () => import("./views/ops.js"),
  intake: () => import("./views/intake.js"),
  usage: () => import("./views/usage.js"),
};

let shell = null;
let projects = null;
let cleanup = null;
let seq = 0;

function railNow() {
  if (shell) renderRail(shell.rail, currentRoute(), projects);
}

async function loadProjects() {
  const r = await get("/projects", { scope: "top" });
  projects = r.ok ? r.data.projects : [];
}

async function renderRoute() {
  if (cleanup) {
    try {
      cleanup();
    } catch {
      // 이전 화면 정리 실패는 새 화면을 막지 않는다
    }
    cleanup = null;
  }
  const my = ++seq;
  const route = currentRoute();
  const { main, topbar } = shell;
  clear(main).append(skeleton(6));
  renderRail(shell.rail, route, projects);
  const key = store.mode === "multi-root" ? "projects" : route.name;
  const loader = VIEWS[key] ?? (() => import("./views/notfound.js"));
  let mod;
  try {
    mod = await loader();
  } catch (err) {
    clear(main).append(errorState({ code: "internal", message: `화면 모듈을 불러오지 못했다: ${err instanceof Error ? err.message : String(err)}` }, () => void renderRoute()));
    return;
  }
  if (my !== seq) return;
  clear(main);
  const ctx = {
    host: main,
    route,
    store,
    setHeader: (o) => setHeader(topbar, { ...o, tools: o.tools ?? [] }),
    searchBox,
    rerender: () => void renderRoute(),
    rail: railNow,
    isCurrent: () => my === seq,
  };
  try {
    const out = await mod.render(ctx);
    if (my !== seq) {
      if (typeof out === "function") out();
      return;
    }
    cleanup = typeof out === "function" ? out : null;
  } catch (err) {
    clear(main).append(errorState({ code: "internal", message: err instanceof Error ? err.message : String(err) }, () => void renderRoute()));
  }
  if (my === seq && !route.query.keepfocus) document.getElementById("page-title")?.focus({ preventScroll: true });
}

async function boot() {
  shell = buildShell();
  clear(shell.main).append(skeleton(6));
  await detectMode();
  if (store.mode === "multi-root") await loadProjects();
  else if (!(await loadSession())) {
    setHeader(shell.topbar, { title: "관리 페이지", sub: "연결하지 못했다" });
    renderRail(shell.rail, currentRoute(), projects);
    clear(shell.main).append(errorState(store.loadError ?? { code: "network", message: "연결하지 못했다" }, () => location.reload()));
    return;
  }
  if (store.mode !== "multi-root") {
    if (store.mode === "project") await loadProjects();
    void refreshOverview();
    void refreshUsageNow();
    startPolling();
  }
  subscribe(railNow);
  onRoute(() => void renderRoute());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const input = document.querySelector(".search input");
    if (input) {
      e.preventDefault();
      input.focus();
    }
  });
  await renderRoute();
}

void boot();
