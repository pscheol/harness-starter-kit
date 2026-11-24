// S03 이슈 상세 · 문서. 문서 보기 · 고치기 · 저장(충돌 · 점유 처리) · 승인 · 리뷰 판단. 저장만으로 세션에 아무것도 보내지 않는다(DB-R25).
import { errorText, get, put } from "../api.js";
import { clear, h, icon, setServerHtml } from "../dom.js";
import { GATE_KO, railSpec, ROLE_KO, stageText } from "../format.js";
import { fullPath, link } from "../router.js";
import { store } from "../store.js";
import { banner, button, errorState, gateRail, harnessBadge, readOnlyNote, skeleton, tabList, tag, toast } from "../ui.js";
import { loadAll } from "./common.js";
import { approvePanel, reviewTable } from "./approve-panel.js";
import { openDispatch } from "./dispatch.js";

const DOC_TABS = ["requirements", "design", "tasks"];

const approvalTag = (a) => ({ valid: ["ops", "승인됨"], stale: ["build", "승인 뒤 바뀜"], invalid: ["gate", "승인자 아님"], none: ["line", "승인 전"] })[a] ?? ["line", a ?? "-"];

export async function render(ctx) {
  const { host, route } = ctx;
  const key = route.params.key;
  const res = await loadAll(ctx, [get(`/issues/${encodeURIComponent(key)}`)]);
  if (!res) return undefined;
  const issue = res[0].data;
  const gates = store.session?.flow.gates ?? [];
  const tab = route.params.tab === "approve" ? (issue.waitingOn?.gate && DOC_TABS.includes(issue.waitingOn.gate) ? issue.waitingOn.gate : "requirements") : (route.params.tab ?? (issue.waitingOn && DOC_TABS.includes(issue.waitingOn.gate) ? issue.waitingOn.gate : "requirements"));
  const intent = issue.intent;

  ctx.setHeader({
    crumbs: [{ label: "진행", path: "/progress" }, ...(intent ? [{ label: `${intent} ${issue.title ?? ""}`.trim(), path: `/progress?view=flow&intent=${intent}` }] : []), ...(issue.unit ? [{ label: issue.unit }] : [])],
    title: `${issue.key} ${issue.title ?? issue.name}`,
    tools: [ctx.searchBox().form],
  });

  const sessions = (await get("/sessions")).data?.sessions?.filter((x) => issue.sessions.includes(x.id)) ?? [];
  const spec = railSpec(gates, issue);
  const statusLine = h(
    "div",
    { class: "issue-status" },
    h("div", { class: "flex wrap" }, issue.waitingOn ? tag(`${GATE_KO[issue.waitingOn.gate] ?? issue.waitingOn.gate} 승인 대기`, "gate", h("span", { class: "dia", "aria-hidden": "true" })) : tag(stageText(issue), issue.stage === "completed" ? "ops" : "design"), issue.area ? tag(`area: ${issue.area}`, "line") : null, intent ? link(`/progress?view=flow&intent=${intent}`, { class: "tag design" }, `${intent}${issue.unit ? ` · ${issue.unit}` : ""}`) : null, sessions.length ? h("span", { class: "muted small" }, "맡은 세션 ", ...sessions.map((x) => h("span", { class: "sess-chip" }, harnessBadge(x.harness), ` ${x.name ?? x.id.slice(0, 8)} · ${ROLE_KO[x.role] ?? x.role ?? ""}`))) : h("span", { class: "muted small" }, "맡은 세션 없음")),
    gateRail(spec, { labels: true, step: 58 }),
  );
  const meta = h(
    "div",
    { class: "issue-meta muted small" },
    icon("branch", "s"), h("code", null, issue.branch ?? "브랜치 없음"), " ", issue.checkout ? `· ${issue.checkout.kind === "main" ? "메인 폴더" : "worktree"}${issue.checkout.dirty ? " · 커밋 안 된 변경" : ""}` : "· 체크아웃 안 됨(git 객체로 읽는다)",
    ` · 출처 ${issue.source}`,
    issue.verify ? ` · 검증 ${issue.verify.level ?? ""} ${issue.verify.status ?? ""}` : "",
    issue.review ? ` · 열린 리뷰 CRITICAL ${issue.review.open.CRITICAL} · HIGH ${issue.review.open.HIGH}` : "",
  );

  const items = [
    ...DOC_TABS.map((d) => ({ id: d, label: d, panel: "doc-panel", badge: issue.docs[d] ? (issue.docs[d].status ?? issue.docs[d].state ?? "") : "없음" })),
    { id: "review", label: "review", panel: "doc-panel" },
    { id: "approvals", label: "approvals", panel: "doc-panel" },
  ];
  const panelHost = h("div", { id: "doc-panel", role: "tabpanel", "aria-labelledby": `tab-${tab}`, tabindex: "0", class: "doc-panel" });
  const side = h("aside", { class: "issue-side stack-y", "aria-label": "승인과 기록" });
  const tabs = tabList("이슈 문서", items, tab, (id) => {
    history.replaceState(null, "", fullPath(`/issues/${encodeURIComponent(key)}${id === "review" ? "/review" : `/docs/${id}`}`));
    void show(id);
  });
  host.append(h("div", { class: "stack-y" }, statusLine, meta, h("div", { class: "issue-grid" }, h("div", { class: "stack-y doc-col" }, tabs, panelHost), side)));

  let current = tab;
  async function show(id) {
    current = id;
    panelHost.setAttribute("aria-labelledby", `tab-${id}`);
    clear(panelHost).append(skeleton(5));
    clear(side).append(skeleton(3));
    if (id === "review") await showReview();
    else if (id === "approvals") await showApprovals();
    else await showDoc(id);
  }

  const docPath = (name) => `${issue.dir}/${name}.md`;

  async function showApprovals() {
    const r = await get("/docs", { query: { path: docPath("approvals") } });
    clear(panelHost);
    if (!r.ok) {
      panelHost.append(r.error.code === "not_found" ? h("p", { class: "muted" }, "아직 승인 기록이 없다. 게이트를 승인하면 approvals.md 가 생긴다.") : errorState(r.error, () => void show("approvals")));
    } else {
      const d = h("div", { class: "md" });
      setServerHtml(d, r.data.html);
      panelHost.append(h("p", { class: "path" }, r.data.path), d);
    }
    clear(side).append(sidePanel(null));
  }

  async function showReview() {
    const r = await get(`/reviews/${encodeURIComponent(issue.key)}`);
    clear(panelHost);
    if (!r.ok) {
      panelHost.append(errorState(r.error, () => void show("review")));
      clear(side).append(sidePanel(null));
      return;
    }
    const open = r.data.open ?? {};
    panelHost.append(
      h("p", { class: "small" }, `리뷰 보고서 ${r.data.report ?? "없음"}${r.data.head ? ` · head ${String(r.data.head).slice(0, 7)}` : ""}${r.data.stale ? " · 보고서가 오래됐다(head 가 바뀜)" : ""}`),
      h("p", { class: "flex wrap" }, ...["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => tag(`${s} ${open[s] ?? 0}`, s === "CRITICAL" || s === "HIGH" ? ((open[s] ?? 0) > 0 ? "gate" : "line") : s === "MEDIUM" ? "build" : "line"))),
      reviewTable(issue, r.data, () => ctx.rerender()),
    );
    clear(side).append(sidePanel(null));
  }

  function sidePanel(doc) {
    const gate = DOC_TABS.includes(current) ? current : (issue.waitingOn?.gate ?? "mr");
    const parts = [approvePanel({ issue, gate, doc, onDone: () => ctx.rerender() })];
    return h("div", { class: "stack-y" }, ...parts);
  }

  async function showDoc(name) {
    const r = await get("/docs", { query: { path: docPath(name) } });
    clear(panelHost);
    if (!r.ok) {
      panelHost.append(r.error.code === "not_found" ? emptyDoc(name) : errorState(r.error, () => void show(name)));
      clear(side).append(sidePanel(null));
      return;
    }
    drawDoc(name, r.data);
    clear(side).append(sidePanel(r.data));
  }

  function emptyDoc(name) {
    return h("div", { class: "empty" }, h("h3", null, `${name}.md 가 아직 없다`), h("p", null, "이 문서는 설계 · 구현 세션이 만든다. 화면은 새 문서를 만들지 않는다(plans · decisions · ops 기록만 새 파일이 된다)."));
  }

  function drawDoc(name, d) {
    const fm = h("div", { class: "fm" }, ...Object.entries(d.frontmatter ?? {}).filter(([k]) => ["status", "state", "area", "intent", "unit", "jira"].includes(k)).map(([k, v]) => h("span", { class: "chip" }, `${k}: ${v}`)));
    const [at, atText] = approvalTag(issue.docs[name]?.approval);
    const view = h("div", { class: "md" });
    setServerHtml(view, d.html);
    const writable = d.writable && !store.session?.readOnly;
    const editBtn = button("편집", { icon: "pencil", sm: true, disabled: !writable, title: writable ? "" : "읽기 전용이거나 이 문서를 고칠 수 없다", onClick: () => edit(name, d) });
    const bar = h("div", { class: "doc-bar" }, icon("doc", "s"), h("code", { class: "path grow" }, d.path), h("span", { class: "muted xs" }, `sha ${d.sha256.slice(0, 7)}`), tag(atText, at), writable ? editBtn : readOnlyNote(store.session?.readOnly ? "읽기 전용" : "고칠 수 없음"));
    const where = d.checkout?.branch ? h("p", { class: "muted xs" }, icon("branch", "s"), ` 저장하면 ${d.checkout.kind === "branch" ? "(체크아웃 없음 — 저장할 수 없다)" : `${d.checkout.path ?? ""} 의`} `, h("code", null, d.checkout.branch), " 에 쓴다. 커밋은 그 이슈의 세션이 한다.") : null;
    panelHost.append(bar, fm, where, view);
  }

  function edit(name, d) {
    const area = h("textarea", { id: "doc-edit", class: "doc-edit", rows: "22", spellcheck: "false", "aria-label": `${name}.md 원문` });
    area.value = d.markdown;
    const out = h("div", { "aria-live": "polite" });
    let base = d.sha256;
    let force = false;
    async function save(thenDispatch) {
      clear(out).append(banner("info", "clock", "저장하는 중…"));
      const r = await put("/docs", { path: d.path, baseSha256: base, markdown: area.value, force });
      force = false;
      if (!r.ok) {
        conflicts(r);
        return;
      }
      const s = r.data;
      toast("저장했다");
      base = s.sha256;
      const cs = s.changeSummary;
      clear(out).append(
        banner("ok", "ok", h("b", null, "저장했다. "), `${s.savedTo ?? "메인 폴더"}의 `, h("code", null, s.branch ?? ""), `에 썼다${s.statusChanged ? ` · status ${s.statusChanged}(승인된 문서를 고쳐 검토 중으로 돌아갔다)` : ""}. 커밋은 그 이슈의 세션이 한다. 세션에는 아무것도 보내지 않았다.`, cs ? h("div", { class: "muted xs" }, `바뀐 곳: ${[...(cs.headings ?? []), ...(cs.ids ?? [])].slice(0, 8).join(" · ") || "-"} · +${cs.added} −${cs.removed}줄`) : null),
        s.leaseHeldBy ? banner("warn", "alert", "다른 세션이 이 파일을 점유 중이었다. 강제 저장했다 — 그 세션은 요청을 받지 않았다.") : null,
        h("div", { class: "flex" }, button("세션에 요청", { kind: "go", icon: "send", disabled: Boolean(store.session?.readOnly), onClick: () => openDispatch({ issue: issue.key, paths: [d.path], kind: "doc-changed", changeSummary: s.changeSummary ? { ...s.changeSummary, sha256: s.sha256 } : null }) }), button("보기로 돌아가기", { onClick: () => ctx.rerender() })),
      );
      if (thenDispatch) openDispatch({ issue: issue.key, paths: [d.path], kind: "doc-changed", changeSummary: s.changeSummary ? { ...s.changeSummary, sha256: s.sha256 } : null });
    }
    function conflicts(r) {
      const e = r.error;
      if (e.code === "conflict") {
        const cur = e.details?.currentMarkdown ?? "";
        const diff = h("textarea", { readOnly: true, rows: "10", class: "doc-edit", "aria-label": "지금 저장된 내용" });
        diff.value = cur;
        clear(out).append(
          banner("err", "alert", h("b", null, "충돌: 다른 곳에서 먼저 저장했다. "), "아래가 지금 저장된 내용이다. 내 내용과 비교해 고른다."),
          diff,
          h("div", { class: "flex wrap" }, button("지금 내용으로 바꾸기", { onClick: () => {
            area.value = cur;
            base = e.details.currentSha256;
            clear(out);
          } }), button("내 내용으로 덮어쓰기", { kind: "danger", onClick: () => {
            base = e.details.currentSha256;
            void save(false);
          } })),
        );
        return;
      }
      if (e.code === "lease_held") {
        clear(out).append(banner("warn", "alert", h("b", null, "다른 세션이 이 파일을 점유 중이다. "), errorText(e)), button("그래도 저장(요청은 보내지 않는다)", { kind: "danger", onClick: () => {
          force = true;
          void save(false);
        } }));
        return;
      }
      clear(out).append(banner("err", "alert", h("b", null, `${e.code}: `), errorText(e), e.code === "branch_not_checked_out" ? h("div", null, "worktree 가 없다. 터미널에서 ", h("code", null, `python3 scripts/harness/worktree.py new ${issue.key}`), " 뒤 다시 저장한다.") : null));
    }
    clear(panelHost).append(
      h("div", { class: "doc-bar" }, icon("pencil", "s"), h("code", { class: "path grow" }, d.path), h("span", { class: "muted xs" }, "status 를 approved 로 바꾸는 저장은 서버가 거부한다")),
      area,
      h("div", { class: "flex wrap" }, button("저장", { kind: "primary", icon: "save", onClick: () => void save(false) }), button("저장하고 세션에 요청", { kind: "go", icon: "send", onClick: () => void save(true) }), button("취소", { onClick: () => ctx.rerender() })),
      out,
    );
    area.focus();
  }

  await show(tab);
  return undefined;
}
