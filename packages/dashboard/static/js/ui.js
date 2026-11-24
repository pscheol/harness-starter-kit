// 공용 부품: 표지 · 알림 띠 · 상태 4종(로딩 · 빈 · 오류 · 읽기 전용) · 탭 · 구분 선택 · 시트 · PIN · 토스트 · 게이트 레일.
import { errorText, pin as storedPin, setPin } from "./api.js";
import { clear, copy, h, icon, svgEl } from "./dom.js";
import { GATE_FAMILY, GATE_KO, HARNESS_KO, HARNESS_LETTER, RAIL_STATE_KO } from "./format.js";

export const tag = (text, kind = "", ...extra) => h("span", { class: `tag${kind ? ` ${kind}` : ""}` }, ...extra, text);

export function harnessBadge(name) {
  const cls = { claude: "cc", codex: "cx", kiro: "kr", cursor: "cu" }[name] ?? "";
  return h("span", { class: "harness" }, h("b", { class: cls, "aria-hidden": "true" }, HARNESS_LETTER[name] ?? "?"), HARNESS_KO[name] ?? name ?? "-");
}

export function banner(kind, iconName, ...kids) {
  return h("div", { class: `banner ${kind}`, role: kind === "err" ? "alert" : "status" }, icon(iconName), h("div", { class: "grow" }, ...kids));
}

export function skeleton(rows = 4) {
  return h("div", { class: "skeleton", role: "status", "aria-busy": "true", "aria-label": "불러오는 중" }, ...Array.from({ length: rows }, (_, i) => h("span", { class: "sk", dataset: { w: String(i % 3) } })));
}

export function emptyState(title, text, ...actions) {
  return h("div", { class: "empty" }, h("h3", null, title), text ? h("p", null, text) : null, actions.length ? h("div", { class: "flex" }, ...actions) : null);
}

export function errorState(err, retry) {
  return h(
    "div",
    { class: "empty err", role: "alert" },
    icon("alert"),
    h("h3", null, err?.code === "unauthorized" ? "접속 토큰을 확인하지 못했다" : "불러오지 못했다"),
    h("p", null, errorText(err)),
    err?.code ? h("p", { class: "muted xs" }, h("code", null, err.code)) : null,
    retry ? button("다시 시도", { icon: "refresh", onClick: retry }) : null,
  );
}

export function readOnlyNote(text = "읽기 전용 — 저장 · 승인 · 답 · 작업 요청을 끈다") {
  return h("span", { class: "tag line" }, icon("lock", "s"), text);
}

export function button(label, o = {}) {
  return h(
    "button",
    { type: o.type ?? "button", class: `btn${o.kind ? ` ${o.kind}` : ""}${o.sm ? " sm" : ""}`, disabled: o.disabled, onclick: o.onClick, title: o.title, "aria-label": o.aria, "aria-describedby": o.describedby },
    o.icon ? icon(o.icon) : null,
    label,
  );
}

export function copyButton(text, label = "복사", o = {}) {
  const b = button(label, { icon: "copy", sm: o.sm ?? true, kind: o.kind });
  b.addEventListener("click", async () => {
    const ok = await copy(text);
    toast(ok ? "복사했다" : "복사하지 못했다 — 글을 직접 고른다");
  });
  return b;
}

/** 명령 한 줄 + 복사 단추. 화면은 셸 명령을 실행하지 않고 보여 주기만 한다. */
export function commandBox(cmd, label = "명령 복사") {
  return h("div", { class: "cmd" }, icon("terminal"), h("code", null, cmd), copyButton(cmd, label));
}

let toastEl = null;
let toastTimer = 0;
export function toast(text) {
  if (!toastEl) {
    toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(toastEl);
  }
  clear(toastEl).append(icon("ok"), text);
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

/** 키보드로 모두 조작되는 탭 목록: 화살표 · Home · End. 패널은 호출한 쪽이 바꾼다. */
export function tabList(label, items, value, onSelect) {
  const root = h("div", { class: "tabs", role: "tablist", "aria-label": label });
  const buttons = [];
  const select = (id, focus) => {
    buttons.forEach((b) => {
      const on = b.dataset.id === id;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    onSelect(id);
  };
  items.forEach((it, i) => {
    const b = h(
      "button",
      { type: "button", role: "tab", id: `tab-${it.id}`, "aria-controls": it.panel ?? "tabpanel", "aria-selected": it.id === value ? "true" : "false", tabindex: it.id === value ? "0" : "-1", dataset: { id: it.id }, onclick: () => select(it.id) },
      it.label,
      it.badge ? h("span", { class: "tag" }, it.badge) : null,
    );
    b.addEventListener("keydown", (e) => {
      let n = null;
      if (e.key === "ArrowRight") n = items[(i + 1) % items.length];
      if (e.key === "ArrowLeft") n = items[(i - 1 + items.length) % items.length];
      if (e.key === "Home") n = items[0];
      if (e.key === "End") n = items[items.length - 1];
      if (n) {
        e.preventDefault();
        select(n.id, true);
      }
    });
    buttons.push(b);
    root.append(b);
  });
  return root;
}

/** 구분 선택(한 번에 하나, aria-pressed). items: [{id, label, n}] */
export function seg(label, items, value, onChange) {
  const root = h("div", { class: "seg", role: "group", "aria-label": label });
  const bs = items.map((it) => h("button", { type: "button", "aria-pressed": it.id === value ? "true" : "false", dataset: { id: String(it.id) } }, it.label, it.n !== undefined ? h("span", { class: "n" }, String(it.n)) : null));
  bs.forEach((x, i) => {
    x.addEventListener("click", () => {
      bs.forEach((y) => y.setAttribute("aria-pressed", y === x ? "true" : "false"));
      onChange(items[i].id);
    });
    root.append(x);
  });
  return root;
}

/** 게이트 레일: 지난 구간은 단계 색, 사람 승인을 기다리는 자리는 빨강(고리), 진행 중은 속 빈 테두리. 글자 설명은 title · aria-label. */
export function gateRail(spec, o = {}) {
  const labels = Boolean(o.labels);
  const step = o.step ?? (labels ? 62 : 17);
  const size = labels ? 11 : 8;
  const pad = labels ? 26 : 6;
  const n = spec.length;
  const w = pad * 2 + step * Math.max(0, n - 1);
  const hgt = labels ? 40 : 14;
  const cy = labels ? 12 : 7;
  const COLOR = { design: "#3046c5", build: "#c98a12", ops: "#0b7a5e", gate: "#c8102e", todo: "#aeb9c7", line: "#d5dce5" };
  const svg = svgEl("svg", { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, role: "img" });
  const desc = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = spec[i].state;
    const col = a === "ok" || a === "skip" ? COLOR[GATE_FAMILY[spec[i + 1].gate] ?? "design"] : COLOR.line;
    svg.append(svgEl("line", { x1: pad + i * step, y1: cy, x2: pad + (i + 1) * step, y2: cy, stroke: col, "stroke-width": labels ? 2 : 1.5 }));
  }
  spec.forEach((s, idx) => {
    const x = pad + idx * step;
    const fam = COLOR[GATE_FAMILY[s.gate] ?? "design"];
    let r = size / 2;
    let fill = "#fff";
    let stroke = COLOR.todo;
    if (s.state === "ok") fill = stroke = fam;
    else if (s.state === "wait") {
      fill = stroke = COLOR.gate;
      r += labels ? 2 : 1.5;
    } else if (s.state === "now") stroke = fam;
    else if (s.state === "skip") {
      stroke = COLOR.line;
      r -= 1.5;
    }
    const diamond = (rr) => `M${x} ${cy - rr} L${x + rr} ${cy} L${x} ${cy + rr} L${x - rr} ${cy} Z`;
    if (s.state === "wait") svg.append(svgEl("path", { d: diamond(r + 3), fill: "none", stroke: COLOR.gate, "stroke-opacity": ".28", "stroke-width": 1.5 }));
    svg.append(svgEl("path", { d: diamond(r), fill, stroke, "stroke-width": s.state === "now" ? 2 : 1.5, "stroke-linejoin": "round" }));
    if (s.state === "now") svg.append(svgEl("path", { d: diamond(Math.max(1, r - 2.6)), fill: fam }));
    if (labels) {
      const t = svgEl("text", { class: `lbl${s.state === "wait" ? " now" : ""}`, x, y: hgt - 2, "text-anchor": "middle" });
      t.textContent = GATE_KO[s.gate] ?? s.gate;
      svg.append(t);
    }
    desc.push(`${GATE_KO[s.gate] ?? s.gate} ${RAIL_STATE_KO[s.state]}`);
  });
  const title = svgEl("title", {});
  title.textContent = `게이트: ${desc.join(", ")}`;
  svg.append(title);
  svg.setAttribute("aria-label", `게이트 ${desc.join(", ")}`);
  return h("span", { class: "gate-rail" }, svg);
}

/** 가운데 대화 상자(<dialog>). 닫으면 호출한 요소로 초점이 돌아간다. */
export function modal(title, body, o = {}) {
  const dlg = h("dialog", { class: o.side ? "sheet" : "center", "aria-labelledby": "dlg-title" });
  const close = () => dlg.close();
  dlg.append(
    h("div", { class: "dlg-head" }, h("h2", { id: "dlg-title" }, title), button("닫기", { kind: "ghost", sm: true, icon: "x", onClick: close, aria: "닫기" })),
    h("div", { class: "dlg-body" }, body),
  );
  const opener = document.activeElement;
  dlg.addEventListener("close", () => {
    dlg.remove();
    if (opener instanceof HTMLElement) opener.focus();
    if (o.onClose) o.onClose();
  });
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, close };
}

/** 승인 PIN 입력(탭마다 한 번). 이미 있으면 그대로 돌려준다. 취소하면 null. */
export function askPin(force = false) {
  const cur = storedPin();
  if (cur && !force) return Promise.resolve(cur);
  return new Promise((resolve) => {
    let done = false;
    const input = h("input", { type: "text", id: "pin-in", autocomplete: "off", spellcheck: "false", "aria-describedby": "pin-hint", maxlength: "20" });
    const finish = (v) => {
      if (done) return;
      done = true;
      if (v) setPin(v);
      resolve(v);
    };
    const body = h(
      "form",
      { class: "stack-y", onsubmit: (e) => {
        e.preventDefault();
        const v = input.value.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
        if (v) {
          finish(v);
          m.close();
        }
      } },
      h("div", { class: "field" }, h("label", { for: "pin-in" }, "승인 PIN"), input, h("p", { class: "hint", id: "pin-hint" }, "서버를 연 터미널(표준 오류)에만 나온 값이다. 이 탭에서 한 번만 묻는다. 파일 · 화면에 저장하지 않는다.")),
      h("div", { class: "flex" }, button("확인", { type: "submit", kind: "primary" }), button("취소", { onClick: () => m.close() })),
    );
    const m = modal("승인 PIN 이 필요하다", body, { onClose: () => finish(null) });
    input.focus();
  });
}

/** PIN 이 필요한 쓰기를 부른다. PIN 이 틀리면 한 번 더 묻는다. fn(pin) → request 결과. */
export async function withPin(fn) {
  let p = await askPin();
  if (!p) return { ok: false, error: { code: "cancelled", message: "PIN 입력을 취소했다" }, status: 0 };
  let res = await fn(p);
  if (!res.ok && res.error.code === "pin_required") {
    setPin(null);
    p = await askPin(true);
    if (!p) return { ok: false, error: { code: "cancelled", message: "PIN 입력을 취소했다" }, status: 0 };
    res = await fn(p);
  }
  if (!res.ok && res.error.code === "pin_locked") setPin(null);
  return res;
}

export function liveRegion() {
  return h("div", { class: "sr-only", "aria-live": "polite", id: "live" });
}
export function announce(text) {
  const el = document.getElementById("live");
  if (el) el.textContent = text;
}

/** 한 단계 요약 줄: 라벨 + 값 */
export function kv(label, value) {
  return h("div", { class: "kv" }, h("span", { class: "muted xs" }, label), h("span", null, value));
}
