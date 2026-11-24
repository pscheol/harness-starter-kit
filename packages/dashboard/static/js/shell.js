// 화면 틀: 레일(표지 · 프로젝트 고르기 · 새 요구사항 · 메뉴 · 바닥의 지금 세션 줄과 연결 상태) + 머리줄 + 작업 영역.
import { projectId } from "./api.js";
import { clear, h, icon } from "./dom.js";
import { menuOf, pct } from "./format.js";
import { fullPath, link, navigate, topLink } from "./router.js";
import { badges, store } from "./store.js";
import { liveRegion } from "./ui.js";

const NAV = [
  { id: "home", path: "/", label: "홈", icon: "home" },
  { id: "progress", path: "/progress", label: "진행", icon: "board" },
  { id: "docs", path: "/docs", label: "문서", icon: "doc" },
  { id: "verify", path: "/verify", label: "검증", icon: "shield" },
  { id: "workspace", path: "/workspace", label: "작업 공간", icon: "worktree" },
  { id: "ops", path: "/ops", label: "운영", icon: "ops" },
  { sep: true },
  { id: "skills", path: "/skills", label: "스킬", icon: "skills" },
  { id: "harness", path: "/harness", label: "하네스", icon: "harness" },
  { id: "usage", path: "/usage", label: "기록 · 사용량", icon: "chart" },
];

export function buildShell() {
  const root = document.getElementById("app");
  clear(root);
  const rail = h("nav", { class: "rail", "aria-label": "주 메뉴" });
  const topbar = h("header", { class: "topbar" });
  const main = h("main", { class: "content", id: "main", tabindex: "-1" });
  root.append(h("a", { class: "skip-link", href: "#main" }, "본문으로 건너뛰기"), h("div", { class: "app" }, rail, h("div", { class: "work" }, topbar, main)), liveRegion());
  return { rail, topbar, main };
}

let projectMenuOpen = false;

export function renderRail(rail, route, projects) {
  clear(rail);
  const s = store.session;
  const mode = store.mode;
  const multi = mode === "multi-root";
  const current = menuOf(route);
  rail.append(
    h("div", { class: "rail-brand" }, icon("harness", "mark"), h("span", null, "harness-kit"), h("small", null, s?.version ? `v${s.version}` : "")),
    projectBox(rail, projects, route),
  );
  if (!multi) {
    const ro = s?.readOnly;
    rail.append(
      ro
        ? h("span", { class: "rail-new", "aria-disabled": "true", title: "읽기 전용에서는 접수할 수 없다" }, icon("plus"), "새 요구사항")
        : link("/intake", { class: "rail-new", "aria-current": route.name === "intake" ? "page" : null }, icon("plus"), h("span", null, "새 요구사항")),
    );
    const b = badges(store.overview);
    const nav = h("div", { class: "nav" });
    for (const item of NAV) {
      if (item.sep) {
        nav.append(h("div", { class: "nav-sep" }));
        continue;
      }
      const badge = b[item.id];
      nav.append(
        link(item.path, { "aria-current": current === item.id ? "page" : null }, icon(item.icon), h("span", null, item.label), badge && badge.n > 0 ? h("span", { class: `count ${badge.kind}`, "aria-label": `${badge.n}건` }, String(badge.n)) : null),
      );
    }
    rail.append(nav);
  } else {
    const nav = h("div", { class: "nav" }, topLink("/", { "aria-current": route.name === "home" || route.name === "projects" ? "page" : null }, icon("grid"), h("span", null, "전체 프로젝트")));
    rail.append(nav);
    rail.append(h("div", { class: "nav-h", style: null }, "프로젝트"));
    const list = h("div", { class: "nav" });
    for (const p of projects ?? []) {
      list.append(
        p.state === "ok"
          ? topLink(`/p/${p.id}/`, {}, icon("folder"), h("span", null, p.name))
          : h("span", { class: "nav-off", title: p.state === "missing" ? "폴더 없음" : "킷 리포가 아니다" }, icon("folder"), h("span", null, p.name)),
      );
    }
    rail.append(list);
  }
  rail.append(railFoot());
}

function projectBox(rail, projects, route) {
  const s = store.session;
  const multi = store.mode === "multi-root";
  const canSwitch = multi || store.mode === "project" || true;
  const box = h("div", { class: "rail-proj" });
  const label = multi ? "전체 프로젝트" : (s?.repo ?? "…");
  const sub = multi ? `등록 ${projects?.length ?? 0}` : "이 폴더";
  const btn = h(
    "button",
    { class: "rail-repo", type: "button", "aria-expanded": projectMenuOpen ? "true" : "false", "aria-haspopup": "true", onclick: () => {
      projectMenuOpen = !projectMenuOpen;
      renderRail(rail, route, projects);
      if (projectMenuOpen) rail.querySelector(".proj-menu a")?.focus();
    } },
    h("span", { class: "rp-icon" }, icon(multi ? "grid" : "folder")),
    h("span", { class: "rp-name" }, icon(multi ? "grid" : "folder"), h("b", null, label), icon("chevdown")),
    h("span", { class: "rp-sub" }, icon("branch"), h("span", { class: "mono" }, `${sub}${s?.main ? "" : ""}`)),
  );
  box.append(btn);
  if (projectMenuOpen && canSwitch) {
    const menu = h("div", { class: "proj-menu", role: "menu" });
    menu.append(topLink("/", { class: "pm-all", role: "menuitem" }, icon("grid"), "전체 프로젝트", h("span", { class: "pm-n" }, store.mode === "single" ? "dashboard --all" : "")));
    if (projects?.length) {
      menu.append(h("div", { class: "pm-h" }, "프로젝트"));
      for (const p of projects) if (p.state === "ok") menu.append(topLink(`/p/${p.id}/`, { role: "menuitem", "aria-current": p.id === projectId() ? "true" : null }, icon("folder"), h("span", { class: "pm-nm" }, p.name)));
    }
    if (store.mode === "single") menu.append(h("div", { class: "pm-foot" }, "여러 리포를 한 화면에서 보려면 ", h("code", null, "npx harness-kit dashboard --all"), " 로 연다."));
    box.append(menu);
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        projectMenuOpen = false;
        renderRail(rail, route, projects);
        rail.querySelector(".rail-repo")?.focus();
      }
    });
  }
  return box;
}

function railFoot() {
  const s = store.session;
  const u = store.usageNow;
  const foot = h("div", { class: `rail-foot${s?.readOnly ? " ro" : ""}` });
  if (store.mode !== "multi-root") {
    const sess = u?.session;
    if (u && u.enabled && sess && sess.ratio !== null) {
      foot.append(
        link("/usage", { class: `rail-usage${sess.warn ? " warn" : ""}`, "aria-label": `지금 세션 컨텍스트 ${pct(sess.ratio)}${sess.warn ? " — 자동 압축이 가깝다" : ""}` }, h("span", { class: "ru-t" }, "지금 세션 · 컨텍스트", h("b", null, pct(sess.ratio))), h("span", { class: "ru-bar" }, barFill(sess.ratio))),
      );
    } else {
      foot.append(link("/usage", { class: "rail-usage off" }, h("span", { class: "ru-t" }, u && !u.enabled ? "대화 기록 읽기 꺼짐" : "지금 세션 기록 없음"), h("span", { class: "ru-bar" })));
    }
  }
  foot.append(h("div", { class: "srv" }, icon(s?.readOnly ? "eye" : "lock", "s"), h("span", { class: "mono" }, `127.0.0.1:${location.port}`)));
  if (s?.readOnly) foot.append(h("div", { class: "ln mode" }, "읽기 전용"), h("div", { class: "ln" }, "에이전트 세션이거나 --read-only"));
  else {
    if (s) foot.append(h("div", { class: "ln" }, `이 폴더: ${s.repo}`));
    foot.append(h("div", { class: "ln" }, store.loadError?.code === "unauthorized" ? "접속 토큰 확인 필요" : "접속 토큰 확인됨"));
  }
  return foot;
}

function barFill(ratio) {
  const i = h("i", null);
  i.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
  return i;
}

/** 머리줄: crumbs([{label, path}]) · title · sub · tools(노드들). 이동 뒤 h1 로 초점을 옮긴다. */
export function setHeader(topbar, o) {
  clear(topbar);
  const left = h("div", { class: "grow" });
  if (o.crumbs?.length) {
    left.append(h("div", { class: "crumb" }, ...o.crumbs.flatMap((c, i) => [i ? icon("chev", "s") : null, c.path ? link(c.path, {}, c.label) : h("span", null, c.label)])));
  }
  left.append(h("h1", { tabindex: "-1", id: "page-title" }, o.title));
  if (o.sub) left.append(h("p", { class: "sub" }, o.sub));
  const meta = h("div", { class: "top-meta" }, ...(o.tools ?? []));
  topbar.append(left, meta);
  document.title = `${o.title} · harness-kit 관리 페이지`;
}

export function searchBox() {
  const input = h("input", { type: "text", placeholder: "이슈 키 · 문서 찾기", "aria-label": "이슈 키나 문서 찾기", autocomplete: "off" });
  const form = h("form", { class: "search", role: "search", onsubmit: (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    const key = /^([A-Za-z][A-Za-z0-9]+-\d+)$/.exec(v)?.[1]?.toUpperCase();
    if (key && /^INT-/.test(key)) navigate(`/intents/${key}/questions`);
    else if (key) navigate(`/issues/${key}`);
    else {
      const m = /issues\/([A-Z][A-Z0-9]+-\d+)-[^/]+\/(requirements|design|tasks)\.md/.exec(v);
      if (m) navigate(`/issues/${m[1]}/docs/${m[2]}`);
      else navigate(`/docs?q=${encodeURIComponent(v)}`);
    }
    input.value = "";
  } }, icon("search"), input, h("kbd", { "aria-hidden": "true" }, "/"));
  return { form, input };
}

export function fullHref(path) {
  return fullPath(path);
}
