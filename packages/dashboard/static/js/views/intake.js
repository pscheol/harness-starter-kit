// S11 새 요구사항. 접수 API(POST /intake)는 HK-19(설계 08)가 만든다. 지금 서버는 501 이라 접수하면 "제공 예정" 상태를 보인다.
// 접수는 승인이 아니다(PIN 없음). 화면은 모델을 부르지 않고 첨부 이미지를 설명하지 않는다.
import { errorText, post } from "../api.js";
import { clear, h, icon } from "../dom.js";
import { store } from "../store.js";
import { banner, button, commandBox, tabList, tag } from "../ui.js";

export async function render(ctx) {
  const { host, route } = ctx;
  const readOnly = Boolean(store.session?.readOnly);
  ctx.setHeader({ title: "새 요구사항", sub: "글로 적거나 Jira · Notion 에서 가져와 Intent 로 접수한다. 접수는 승인이 아니다", tools: [] });
  let tab = route.query.tab === "import" ? "import" : "write";
  const panel = h("div", { id: "intake-panel", role: "tabpanel", tabindex: "0" });
  const out = h("div", { "aria-live": "polite" });

  const title = h("input", { type: "text", id: "in-title", maxlength: "120", disabled: readOnly });
  const kind = h("select", { id: "in-kind", disabled: readOnly }, h("option", { value: "feature" }, "기능"), h("option", { value: "fix" }, "결함"), h("option", { value: "change" }, "변경"));
  const body = h("textarea", { id: "in-body", rows: "10", placeholder: "무엇을 왜 바꾸는가. 사용자 · 규칙 · 범위 밖을 적는다", disabled: readOnly });
  const files = h("input", { type: "file", id: "in-files", multiple: true, "aria-describedby": "in-files-h", disabled: readOnly });

  async function submit(e) {
    e.preventDefault();
    if (!title.value.trim() || !body.value.trim()) {
      clear(out).append(banner("warn", "alert", "제목과 본문이 필요하다."));
      return;
    }
    clear(out).append(banner("info", "clock", "접수하는 중…"));
    const r = await post("/intake", { kind: kind.value, title: title.value.trim(), body: body.value, attachments: [...(files.files ?? [])].map((f) => ({ name: f.name, size: f.size })) });
    if (r.ok) {
      clear(out).append(banner("ok", "ok", h("b", null, "접수했다. "), "설계 세션에 넘기려면 사람이 세션에 요청한다(접수만으로는 세션에 아무것도 가지 않는다)."));
      return;
    }
    if (r.error.code === "not_implemented") {
      clear(out).append(banner("info", "inbox", h("b", null, "접수 기능은 아직 제공하지 않는다. "), `이 서버의 POST /intake 는 ${r.error.details?.stage ?? "HK-19"}(설계 08 §3.8.1)에서 만든다. 쓴 글은 어디에도 저장되지 않았다 — 아래 상자에서 복사해 둔다.`), commandBox(`npx harness-kit intake --kind ${kind.value} --title "${title.value.trim().replace(/"/g, "'")}" --body-file req.md`, "접수 명령 복사(HK-19 뒤)"), button("본문 복사", { icon: "copy", sm: true, onClick: async () => {
        try {
          await navigator.clipboard.writeText(body.value);
        } catch {
          body.select();
        }
      } }));
      return;
    }
    clear(out).append(banner("err", "alert", h("b", null, `${r.error.code}: `), errorText(r.error)));
  }

  function draw() {
    clear(panel);
    panel.setAttribute("aria-labelledby", `tab-${tab}`);
    if (tab === "import") {
      panel.append(h("div", { class: "stack-y" }, banner("info", "link", h("b", null, "가져오기는 선택 모듈이다. "), "Jira · Notion 에서 가져오는 기능은 jira-workflow 모듈과 HK-19 · 설계 10 §3.6 이 만든다. 모듈을 켜지 않았거나 아직 제공하지 않아 이 탭은 비어 있다."), h("p", { class: "muted small" }, "지금은 글로 적어 접수하는 탭을 쓴다.")));
      return;
    }
    panel.append(h("form", { class: "stack-y intake-form", onsubmit: (e) => void submit(e) },
      readOnly ? banner("warn", "lock", h("b", null, "읽기 전용. "), "에이전트 세션에서 연 서버는 접수하지 않는다.") : null,
      h("div", { class: "field" }, h("label", { for: "in-title" }, "제목"), title),
      h("div", { class: "field" }, h("label", { for: "in-kind" }, "종류"), kind),
      h("div", { class: "field" }, h("label", { for: "in-body" }, "본문"), body),
      h("div", { class: "field" }, h("label", { for: "in-files" }, icon("paperclip", "s"), " 첨부"), files, h("p", { class: "hint", id: "in-files-h" }, "파일 20MB · 합계 100MB 까지, 비밀값이 나오면 거부한다. 이미지 설명은 만들지 않는다(모델을 부르지 않는다).")),
      h("div", { class: "ident" }, icon("commit"), "접수자 git user.email ", h("b", null, store.session?.user?.email ?? "-")),
      h("div", { class: "flex" }, button("접수", { type: "submit", kind: "primary", icon: "send", disabled: readOnly }), tag("PIN 없음 · 접수는 승인이 아니다", "line")),
      out));
  }
  host.append(h("div", { class: "stack-y intake-wrap" }, tabList("접수 방법", [{ id: "write", label: "직접 작성", panel: "intake-panel" }, { id: "import", label: "가져오기", panel: "intake-panel" }], tab, (id) => {
    tab = id;
    draw();
  }), panel));
  draw();
  return undefined;
}
