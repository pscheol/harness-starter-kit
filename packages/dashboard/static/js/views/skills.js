// S08 스킬: 이 컴퓨터와 리포의 스킬을 읽기만 한다(설계 07). 장비 정보라 커밋하지 않고 내보내기에서 뺀다.
import { get } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { clock, HARNESS_KO, HARNESS_LETTER, STAGE_CLASS, STAGE_KO } from "../format.js";
import { banner, button, commandBox, emptyState, errorState, seg, skeleton, tag } from "../ui.js";

const PAGE = 120;
const MARK = { loaded: ["ops", "쓸 수 있음"], both: ["ops", "둘 다 뜸"], shadowed: ["build", "가려짐"], no: ["line", "안 보임"] };

function harnessMarks(s, harnesses) {
  return h("span", { class: "hmarks" }, ...harnesses.map((hn) => {
    const st = s.harnesses[hn] ?? "no";
    const [tone, text] = MARK[st] ?? ["line", st];
    return h("span", { class: `hm ${tone}`, title: `${HARNESS_KO[hn]}: ${text}` }, h("b", { "aria-hidden": "true" }, HARNESS_LETTER[hn]), h("span", { class: "sr-only" }, `${HARNESS_KO[hn]} ${text}`), st === "shadowed" ? h("i", { "aria-hidden": "true" }, "×") : null);
  }));
}

export async function render(ctx) {
  const { host } = ctx;
  const refresh = ctx.route.query.refresh === "1";
  ctx.setHeader({ title: "스킬", sub: "이 컴퓨터의 스킬 · 읽기만 한다 · 장비 정보라 커밋하지 않고 내보내기에서 뺀다", tools: [ctx.searchBox().form] });
  host.append(skeleton(6));
  const r = await get("/skills", { query: { all: "1", ...(refresh ? { refresh: "1" } : {}) } });
  if (!ctx.isCurrent()) return undefined;
  clear(host);
  if (!r.ok) {
    host.append(errorState(r.error, ctx.rerender));
    return undefined;
  }
  const inv = r.data;
  const harnesses = inv.harnesses.length === 5 ? ["claude", "codex", "kiro", "cursor", "gemini"] : inv.harnesses;
  const active = ["claude", "codex", "kiro", "cursor", "gemini"].filter((x) => inv.skills.some((s) => (s.harnesses[x] ?? "no") !== "no"));
  const shown = (active.length ? active : harnesses).slice(0, 5);
  let stage = "all";
  let harness = "all";
  let onlyGuess = false;
  let page = PAGE;
  const names = new Set(inv.conflicts.map((c) => c.name));

  const listHost = h("div", { "aria-live": "polite" });
  const count = h("span", { class: "aside" });
  const stageCount = (st) => inv.skills.filter((s) => s.stages.some((x) => x.stage === st)).length;
  const stageSeg = seg("단계", [{ id: "all", label: "전체", n: inv.skills.length }, ...Object.entries(STAGE_KO).map(([k, v]) => ({ id: k, label: v, n: stageCount(k) })), { id: "none", label: "미분류", n: inv.skills.filter((s) => !s.stages.length).length }], stage, (v) => {
    stage = v;
    page = PAGE;
    draw();
  });
  const hSel = h("select", { id: "sk-h", "aria-label": "하네스 거르기", onchange: (e) => {
    harness = e.target.value;
    page = PAGE;
    draw();
  } }, h("option", { value: "all" }, "하네스 모두"), ...shown.map((x) => h("option", { value: x }, HARNESS_KO[x])));

  function filtered() {
    return inv.skills.filter((s) => (stage === "all" || (stage === "none" ? !s.stages.length : s.stages.some((x) => x.stage === stage))) && (harness === "all" || ["loaded", "both"].includes(s.harnesses[harness])) && (!onlyGuess || s.stages.some((x) => x.source === "추정")));
  }

  function draw() {
    const list = filtered();
    clear(listHost);
    count.textContent = `${Math.min(list.length, page)}개 표시 · 전체 ${inv.skills.length}`;
    if (!list.length) {
      listHost.append(emptyState("조건에 맞는 스킬이 없다", "단계 · 하네스 거름을 바꾼다."));
      return;
    }
    const rows = list.slice(0, page).map((s) => h("tr", null,
      h("td", null, h("code", { class: "key" }, s.id), names.has(s.name) ? h("div", null, tag("이름 겹침", "build")) : null, s.error ? h("div", null, tag(`오류 ${s.error}`, "gate")) : null),
      h("td", { class: "desc" }, s.description ?? h("span", { class: "muted" }, "설명 없음")),
      h("td", null, harnessMarks(s, shown)),
      h("td", null, s.locations[0] ? h("span", { class: "path" }, s.locations[0].path, s.locations.length > 1 ? ` 외 ${s.locations.length - 1}` : "") : "-"),
      h("td", null, s.stages.length ? s.stages.map((x) => h("div", null, tag(STAGE_KO[x.stage] ?? x.stage, STAGE_CLASS[x.stage] ?? "line"), " ", h("span", { class: x.source === "추정" ? "guess" : "muted xs" }, x.source === "map" ? "지도" : x.source === "metadata" ? "머리" : "추정"))) : h("span", { class: "muted xs" }, "미분류")),
    ));
    listHost.append(h("div", { class: "table-wrap" }, h("table", { class: "tbl skills-tbl" }, h("caption", { class: "sr-only" }, "스킬 목록"), h("thead", null, h("tr", null, ...["이름", "설명", "하네스", "위치", "단계 · 출처"].map((t) => h("th", { scope: "col" }, t)))), h("tbody", null, ...rows))));
    if (list.length > page) listHost.append(h("div", { class: "pager" }, button(`더 보기(${list.length - page}개 남음)`, { onClick: () => {
      page += PAGE;
      draw();
    } })));
  }

  const rootsTable = h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "위치별 스킬 개수"), h("thead", null, h("tr", null, ...["위치", "범위", "개수"].map((t, i) => h("th", { scope: "col", class: i === 2 ? "r" : "" }, t)))),
    h("tbody", null, ...inv.roots.map((x) => h("tr", null, h("td", null, h("code", { class: "path" }, x.path), x.version ? h("span", { class: "muted xs" }, ` ${x.version}`) : null), h("td", null, x.scope.startsWith("plugin") ? "플러그인" : x.scope === "user" ? "사용자" : x.scope.startsWith("nested") ? "하위 폴더" : "프로젝트"), h("td", { class: "r" }, x.error ? h("span", { class: "err-text" }, x.error) : String(x.count)))), inv.roots.length ? null : h("tr", null, h("td", { colspan: "3", class: "muted" }, "스킬 위치가 비어 있다"))));

  // 이 단계에서 쓸 내 스킬(지도 칸 해석)
  const resolved = inv.map.resolved.filter((x) => x.harness === (store_harness(inv) ?? x.harness));
  const byCommand = new Map();
  for (const x of resolved) byCommand.set(x.command, [...(byCommand.get(x.command) ?? []), x]);
  const mapPanel = h("section", { class: "panel", "aria-labelledby": "map-h" }, h("div", { class: "panel-head" }, h("h2", { id: "map-h" }, "이 단계에서 쓸 내 스킬")),
    h("div", { class: "panel-body stack-y" }, inv.map.present ? [...byCommand].map(([cmd, xs]) => h("div", { class: "map-cmd" }, h("code", { class: "key" }, cmd), ...xs.map((x) => h("div", { class: "small" }, x.skill ? h("span", null, icon("ok", "s"), ` ${x.skill}`) : h("span", { class: "muted" }, icon("help", "s"), ` 없음 · ${x.fallback}`), h("span", { class: "muted xs" }, ` (${x.slot}, ${HARNESS_KO[x.harness]})`))))) : emptyState("스킬 지도가 없다", "킷 명령은 .agents/skill-map.json 에서 깔린 스킬을 찾아 쓰고, 없으면 킷 기본 템플릿을 쓴다. 지도가 없으면 단계는 설명 낱말로 추정한다."),
      h("p", { class: "muted small" }, "지도는 팀이 MR 로 고친다. 터미널: ", h("code", null, "npx harness-kit skills --stage 설계"))));

  // 단계 × 하네스
  const matrix = h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "단계와 하네스별 스킬 수"), h("thead", null, h("tr", null, h("th", { scope: "col" }, "단계"), ...shown.map((x) => h("th", { scope: "col", class: "r" }, HARNESS_KO[x])))),
    h("tbody", null, ...Object.entries(STAGE_KO).map(([k, v]) => h("tr", null, h("td", null, tag(v, STAGE_CLASS[k])), ...shown.map((x) => h("td", { class: "r" }, String(inv.skills.filter((s) => s.stages.some((y) => y.stage === k) && ["loaded", "both"].includes(s.harnesses[x])).length)))))));

  const guessCount = inv.skills.filter((s) => s.stages.some((x) => x.source === "추정")).length;
  host.append(h("div", { class: "skills-grid" },
    h("div", { class: "stack-y" },
      inv.warnings.length ? banner("warn", "alert", inv.warnings.join(" · ")) : null,
      h("section", { class: "panel", "aria-labelledby": "roots-h" }, h("div", { class: "panel-head" }, h("h2", { id: "roots-h" }, "어디에 몇 개"), h("div", { class: "aside" }, `이름 겹침 ${inv.conflicts.length}`)), h("div", { class: "table-wrap" }, rootsTable)),
      h("section", { class: "panel", "aria-labelledby": "sk-h2" }, h("div", { class: "panel-head" }, h("h2", { id: "sk-h2" }, "스킬 목록"), count),
        h("div", { class: "panel-body stack-y" }, h("div", { class: "flex wrap" }, stageSeg, hSel, h("label", { class: "pick plain small", for: "sk-guess" }, h("input", { type: "checkbox", id: "sk-guess", onchange: (e) => {
          onlyGuess = e.target.checked;
          draw();
        } }), `추정만(${guessCount})`)), listHost))),
    h("div", { class: "stack-y" }, mapPanel,
      h("section", { class: "panel", "aria-labelledby": "mx-h" }, h("div", { class: "panel-head" }, h("h2", { id: "mx-h" }, "단계 × 하네스"), h("div", { class: "aside" }, `단계가 붙은 스킬 ${inv.skills.filter((s) => s.stages.length).length}`)), h("div", { class: "panel-body" }, matrix)),
      h("div", { class: "flex" }, h("a", { class: "btn", href: `${location.pathname}?refresh=1` }, icon("refresh"), "다시 수집"), h("span", { class: "muted xs" }, `${clock(inv.scannedAt)} 수집`)),
      commandBox("npx harness-kit skills --stage 설계", "명령 복사"))));
  draw();
  return undefined;
}

function store_harness(inv) {
  return inv.harnesses[0] ?? null;
}
