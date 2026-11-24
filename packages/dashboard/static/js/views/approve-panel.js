// S03 승인 패널 · 리뷰 판단. 승인 · 수정 요청 · 리뷰 판단은 PIN 이 필요하고(탭마다 한 번) 세션에는 아무것도 보내지 않는다(DB-R12 · R25).
import { errorText, post } from "../api.js";
import { h, icon } from "../dom.js";
import { GATE_KO } from "../format.js";
import { store } from "../store.js";
import { banner, button, tag, toast, withPin } from "../ui.js";
import { openDispatch } from "./dispatch.js";

function checklist(items) {
  return h("ul", { class: "checks" }, ...items.map((i) => h("li", { class: i.ok ? "ok" : "bad" }, icon(i.ok ? "ok" : "fail"), h("span", null, i.text), h("span", { class: "sr-only" }, i.ok ? " 충족" : " 미충족"))));
}

/**
 * 게이트 하나의 승인 패널. issue: 이슈 모델, gate: 게이트 이름, doc: {sha256, path}|null, onDone: 갱신 콜백
 */
export function approvePanel({ issue, gate, doc, onDone }) {
  const s = store.session;
  const result = issue.gates.find((g) => g.gate === gate);
  const readOnly = Boolean(s?.readOnly);
  const approvers = s?.approvers?.[gate] ?? [];
  const waiting = issue.waitingOn?.gate === gate ? issue.waitingOn : null;
  const docInfo = issue.docs[gate] ?? null;
  const passed = Boolean(result?.passed);
  const unmet = result?.preconditions ?? [];
  const clarify = docInfo?.clarify ?? 0;

  const phrase = h("textarea", { id: "ap-phrase", rows: "3", placeholder: "예: R2.3 보관 기간 3일로 반영해. 승인한다.", "aria-describedby": "ap-note", disabled: readOnly });
  const rule = h("input", { type: "checkbox", id: "ap-rule", disabled: readOnly });
  const out = h("div", { "aria-live": "polite" });
  const mine = waiting ? waiting.mine : true;

  async function act(decision) {
    const text = phrase.value.trim();
    if (!text) {
      out.replaceChildren(banner("warn", "alert", "승인 문구가 필요하다. 무엇을 보고 승인(또는 수정 요청)하는지 한 줄 적는다."));
      phrase.focus();
      return;
    }
    out.replaceChildren(banner("info", "clock", "기록하는 중…"));
    const target = gate === "intent" ? { intent: issue.intent } : { issue: issue.key };
    const r = await withPin((pin) => post("/approvals", { target, gate, decision, phrase: text, ...(doc && !["mr", "done"].includes(gate) ? { docSha256: doc.sha256 } : {}), ...(decision === "changes-requested" && rule.checked ? { ruleCandidate: true } : {}), pin }));
    if (!r.ok) {
      const reasons = r.error.details?.reasons ?? [];
      out.replaceChildren(banner("err", "alert", h("b", null, `${r.error.code}: `), errorText(r.error), reasons.length ? h("ul", null, ...reasons.map((x) => h("li", null, x))) : null));
      return;
    }
    const d = r.data;
    toast(decision === "approved" ? "승인을 기록했다" : "수정 요청을 기록했다");
    const live = (d.sessions ?? []).length;
    out.replaceChildren(
      banner("ok", "ok", h("b", null, decision === "approved" ? "승인을 기록했다. " : "수정 요청을 기록했다. "), `approvals.md 에 ${d.approver}${d.group ? `(${d.group})` : ""} 로 덧붙였다${d.statusChanged ? ` · status ${d.statusChanged}` : ""}. 세션에는 아무것도 보내지 않았다.`),
      live && !readOnly ? button(`세션에 요청(살아 있는 세션 ${live}개)`, { icon: "send", kind: "go", onClick: () => openDispatch({ issue: issue.key, kind: decision === "approved" ? "approved" : "changes-requested", paths: [`${issue.dir}/approvals.md`] }) }) : null,
    );
    setTimeout(() => onDone?.(), 600);
  }

  return h(
    "section",
    { class: "panel lift approve", "aria-labelledby": "ap-h" },
    h("div", { class: "panel-head" }, waiting ? h("span", { class: "dia", "aria-hidden": "true" }) : icon(passed ? "ok" : "clock"), h("h2", { id: "ap-h" }, `${GATE_KO[gate] ?? gate} 승인`), h("div", { class: "aside" }, passed ? tag("승인됨", "ops") : docInfo?.approval === "stale" ? tag("다시 승인 필요", "build") : tag("대기", "line"))),
    h(
      "div",
      { class: "panel-body stack-y" },
      h("p", { class: "small" }, passed ? "이 게이트는 지금 문서 그대로 승인돼 있다." : docInfo?.approval === "stale" ? "승인 뒤 문서가 바뀌었다. 바뀐 곳을 보고 다시 승인하면 status 가 approved 가 되고 다음 단계가 열린다." : "승인하면 approvals.md 에 기록되고 문서 status 가 approved 가 되어 다음 단계가 열린다."),
      h("p", { class: "small muted" }, icon("users", "s"), ` approvers · `, h("code", null, approvers.length ? approvers.join(", ") : "비어 있음 → git 사용자 누구나"), ` · ${s?.user?.email ?? "git user.email 없음"}${s?.user?.groups?.length ? ` (${s.user.groups.join(", ")})` : ""}`),
      !mine ? banner("warn", "alert", "내 git 사용자는 이 게이트의 approvers 에 없다. 승인 요청은 서버가 403 으로 거부한다.") : null,
      checklist([
        { ok: clarify === 0, text: `[NEEDS CLARIFICATION] ${clarify}건` },
        { ok: unmet.length === 0, text: unmet.length ? `앞 조건 미충족 ${unmet.length}건` : "앞 게이트 · 조건 충족" },
        ...(["mr", "done"].includes(gate) ? [{ ok: !((issue.review?.open.CRITICAL ?? 0) + (issue.review?.open.HIGH ?? 0)), text: `열린 CRITICAL·HIGH ${(issue.review?.open.CRITICAL ?? 0) + (issue.review?.open.HIGH ?? 0)}` }] : []),
      ]),
      unmet.length ? h("ul", { class: "small muted" }, ...unmet.slice(0, 5).map((x) => h("li", null, x))) : null,
      readOnly
        ? banner("warn", "lock", h("b", null, "읽기 전용. "), "에이전트 세션에서 연 서버는 승인을 받지 않는다. 사람이 자기 터미널에서 연 관리 페이지(또는 ", h("code", null, `npx harness-kit approve ${issue.key} --gate ${gate}`), ")에서 한다.")
        : null,
      h("div", { class: "field" }, h("label", { for: "ap-phrase" }, "승인 문구"), phrase, h("p", { class: "hint", id: "ap-note" }, "승인 PIN 은 처음 승인할 때 한 번 묻는다(서버를 연 터미널에만 나온 값). 승인 기록은 이 화면에서 남긴 approvals.md 로만 인정한다.")),
      h("div", { class: "ident" }, icon("commit"), `git user.email `, h("b", null, s?.user?.email ?? "-"), "로 approvals.md 에 기록"),
      h("div", { class: "flex wrap" }, button("승인하고 기록", { kind: "approve", icon: "check", disabled: readOnly || passed, onClick: () => void act("approved") }), button("수정 요청", { icon: "pencil", disabled: readOnly, onClick: () => void act("changes-requested") })),
      h("label", { class: "pick plain xs", for: "ap-rule" }, rule, "수정 요청을 규칙 후보로 남긴다"),
      out,
    ),
  );
}

/** 리뷰 판단: 지적마다 위험 수용 · 수정 필요(이유 필수). mr 게이트 approvers 가 한다. */
export function reviewTable(issue, review, onDone) {
  const readOnly = Boolean(store.session?.readOnly);
  const out = h("div", { "aria-live": "polite" });
  const rows = review.findings ?? [];
  if (!rows.length) return h("p", { class: "muted" }, "이 이슈의 리뷰 지적이 없다. 리뷰 보고서가 없거나 모두 처리됐다.");
  const decide = async (f, decision, reasonEl) => {
    const phrase = reasonEl.value.trim();
    if (!phrase) {
      out.replaceChildren(banner("warn", "alert", `${f.id}: 이유 문구가 필요하다.`));
      reasonEl.focus();
      return;
    }
    const r = await withPin((pin) => post(`/reviews/${encodeURIComponent(issue.key)}/${encodeURIComponent(f.id)}/decision`, { decision, phrase, pin }));
    if (!r.ok) {
      out.replaceChildren(banner("err", "alert", h("b", null, `${r.error.code}: `), errorText(r.error)));
      return;
    }
    toast(`${f.id} 판단을 기록했다`);
    onDone?.();
  };
  return h(
    "div",
    { class: "stack-y" },
    h("table", { class: "tbl" }, h("caption", { class: "sr-only" }, "리뷰 지적과 판단"), h("thead", null, h("tr", null, ...["ID", "심각도", "상태", "판단"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, ...rows.map((f) => {
        const reason = h("input", { type: "text", "aria-label": `${f.id} 판단 이유`, placeholder: "이유 한 줄", disabled: readOnly });
        return h("tr", null, h("td", null, h("code", null, f.id)), h("td", null, tag(f.severity, f.severity === "CRITICAL" || f.severity === "HIGH" ? "gate" : f.severity === "MEDIUM" ? "build" : "line")), h("td", null, f.state === "open" ? "열림" : String(f.state)),
          h("td", null, f.state === "open" ? h("div", { class: "decide" }, reason, button("수정 필요", { sm: true, disabled: readOnly, onClick: () => void decide(f, "fix-required", reason) }), button("위험 수용", { sm: true, kind: "danger", disabled: readOnly, onClick: () => void decide(f, "risk-accepted", reason) })) : h("span", { class: "muted small" }, "판단 기록됨")));
      }))),
    readOnly ? banner("warn", "lock", "읽기 전용 — 리뷰 판단은 사람 터미널에서 한 서버에서만 된다.") : null,
    out,
  );
}
