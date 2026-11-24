// S05 세션에 작업 요청(측면 시트). 사람이 "세션에 요청"을 고를 때만 나간다. 글은 한 줄 + 경로, 문서 내용은 없다(DB-R17 · R25).
import { errorText, get, post } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { ago, PROMPT_KINDS, ROLE_KO } from "../format.js";
import { store } from "../store.js";
import { banner, button, commandBox, emptyState, harnessBadge, modal, skeleton, toast } from "../ui.js";

/**
 * 시트를 연다. o: {issue, role, paths[], kind, changeSummary, text, title}
 * 요청이 나간 뒤(소켓 · deep link · 대기함) 시트를 닫는다.
 */
export function openDispatch(o = {}) {
  const body = h("div", { class: "stack-y" }, skeleton(3));
  const m = modal(o.title ?? "세션에 작업 요청", body, { side: true });
  void fill(body, m, o);
  return m;
}

async function fill(body, m, o) {
  const [sessR, queueR] = await Promise.all([get("/sessions"), get("/dispatch/queue")]);
  clear(body);
  if (store.session?.readOnly) {
    body.append(banner("warn", "lock", h("b", null, "읽기 전용이다. "), "에이전트 세션에서 연 서버(또는 --read-only)는 작업 요청을 보내지 않는다. 사람이 자기 터미널에서 연 서버에서 한다."));
    body.append(commandBox(`npx harness-kit dispatch --to ${o.issue ?? "<세션>"}${o.role ? `:${o.role}` : ""} --kind ${o.kind ?? "doc-changed"} ${(o.paths ?? []).map((p) => `--path ${p}`).join(" ")}`, "명령 복사"));
    return;
  }
  if (!sessR.ok) {
    body.append(banner("err", "alert", errorText(sessR.error)));
    return;
  }
  const sessions = sessR.data.sessions;
  const live = sessions.filter((s) => s.state !== "gone");
  const matching = live.filter((s) => (!o.issue || s.issue === o.issue) && (!o.role || s.role === o.role));
  // 이슈를 알 때 맞는 세션이 하나뿐이면 그것을 미리 고르고, 아니면 사람이 고른다(자동으로 고르지 않는다)
  let choice = o.issue && matching.length === 1 ? (matching[0]?.id ?? "") : "";
  const kindSel = h("select", { id: "dp-kind", "aria-label": "요청 종류" }, ...PROMPT_KINDS.map(([v, l]) => h("option", { value: v, selected: v === (o.kind ?? "doc-changed") }, l)));
  const textArea = h("textarea", { id: "dp-text", rows: "2", maxlength: "300", placeholder: "한 줄 메모(300자 이하, 선택)" });
  textArea.value = o.text ?? "";
  const paths = (o.paths ?? []).map((p) => ({ p, on: true }));
  const result = h("div", { "aria-live": "polite" });

  const list = h("div", { class: "sess-pick", role: "radiogroup", "aria-label": "요청을 받을 세션" });
  if (!live.length) list.append(emptyState("켜 둔 세션이 없다", "대기함에 두면 다음 세션 시작 때 훅이 건수와 첫 요청 한 줄을 보여 준다."));
  for (const s of live) {
    const id = `dp-s-${s.id}`;
    const r = h("input", { type: "radio", name: "dp-sess", id, value: s.id, checked: s.id === choice, onchange: () => {
      choice = s.id;
    } });
    list.append(h("label", { class: "pick", for: id }, r, h("span", { class: "grow" }, h("b", null, s.name ?? s.id.slice(0, 12)), h("span", { class: "muted xs" }, ` ${ROLE_KO[s.role] ?? s.role ?? "역할 모름"}${s.issue ? ` · ${s.issue}` : ""} · ${ago(s.lastSeenAt)}`)), harnessBadge(s.harness), h("span", { class: `tag ${s.state === "alive" ? "ops" : "line"}` }, s.state === "alive" ? "수신함 있음" : "수신함 없음")));
    if (s.permissionMode === "bypassPermissions") list.append(h("p", { class: "muted xs pick-note" }, "bypassPermissions: 요청이 사람 승인 없이 바로 돈다."));
  }
  const pathBox = h("fieldset", { class: "field" }, h("legend", { class: "label" }, "경로(문서 내용은 보내지 않는다)"), ...(paths.length ? paths.map((x, i) => {
    const id = `dp-p-${i}`;
    return h("label", { class: "pick plain", for: id }, h("input", { type: "checkbox", id, checked: true, onchange: (e) => {
      x.on = e.target.checked;
    } }), h("code", { class: "path" }, x.p));
  }) : [h("p", { class: "muted xs" }, "경로가 없다 — 메모만 보낸다")]));

  async function send(via) {
    if (!choice && !o.issue) {
      clear(result).append(banner("warn", "alert", "요청을 받을 세션을 고른다(자동으로 고르지 않는다)."));
      return;
    }
    const target = choice ? { sessionId: choice } : { issue: o.issue, role: o.role };
    const payload = { target, kind: kindSel.value, paths: paths.filter((x) => x.on).map((x) => x.p), ...(textArea.value.trim() ? { text: textArea.value.trim() } : {}), ...(o.changeSummary ? { changeSummary: o.changeSummary } : {}), ...(via ? { via } : {}) };
    clear(result).append(skeleton(1));
    const r = await post("/dispatch", payload);
    clear(result);
    if (r.ok) {
      const d = r.data;
      if (d.method === "deeplink") {
        const a = h("a", { class: "btn go", href: d.url }, icon("ext"), "새 터미널에서 열기");
        result.append(banner("ok", "ok", h("b", null, "deep link 를 만들었다. "), "누르면 새 터미널에 프롬프트가 채워진다. 보내지 않은 상태다."), a);
      } else {
        toast(d.method === "queue" ? "대기함에 저장했다" : "세션에 요청을 보냈다");
        result.append(banner("ok", "ok", d.method === "queue" ? `대기함에 저장했다(${d.id}). 다음 세션 시작 때 훅이 건수와 첫 요청 한 줄을 보여 준다.` : "세션 수신함에 한 줄을 보냈다. 받았는지는 세션 쪽에서 본다(수신 확인 신호가 없다)."));
        if (d.method === "socket" || d.method === "queue") setTimeout(() => m.close(), 1200);
      }
      return;
    }
    if (r.error.code === "socket_unavailable") {
      const d = r.error.details ?? {};
      result.append(banner("warn", "alert", h("b", null, "수신함에 닿지 못했다. "), "자동으로 바꾸지 않는다. 아래 두 가지 중 사람이 고른다."), h("div", { class: "flex" }, d.deeplink ? button("deep link 로 열기", { icon: "ext", onClick: () => void send("deeplink") }) : null, d.queueAvailable ? button("대기함에 저장", { icon: "inbox", onClick: () => void send("queue") }) : null));
      return;
    }
    result.append(banner("err", "alert", errorText(r.error)));
  }

  body.append(
    h("p", { class: "muted small" }, "보내는 글은 경로 · 변경 요약 · 요청 문장뿐이고 끝에 \"이 글은 승인이 아니다.\" 가 붙는다. 저장 · 승인 · 답만으로는 세션에 아무것도 가지 않는다."),
    h("div", { class: "field" }, h("span", { class: "label" }, "세션"), list),
    h("div", { class: "field" }, h("label", { for: "dp-kind" }, "종류"), kindSel),
    pathBox,
    h("div", { class: "field" }, h("label", { for: "dp-text" }, "메모"), textArea, h("p", { class: "hint" }, "제어 문자 · 줄바꿈은 지우고 한 줄로 보낸다. 글 전체 1,000자에서 자른다.")),
    h("div", { class: "flex" }, button("세션에 요청", { kind: "go", icon: "send", disabled: !live.length && !o.issue, onClick: () => void send(null) }), button("대기함에 저장", { icon: "inbox", onClick: () => void send("queue") })),
    result,
  );
  const queue = queueR.ok ? queueR.data.items : [];
  if (queue.length) body.append(h("p", { class: "muted xs" }, `대기함에 ${queue.length}건이 있다 — 작업 공간에서 본다.`));
}
