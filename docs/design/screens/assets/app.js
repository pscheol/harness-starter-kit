/* knots-sync 관리 페이지 시안 — 공용 스크립트(바닐라 JS, 외부 파일 없음)
 * 1) 아이콘 스프라이트(lucide 선 아이콘)  2) 게이트 레일 그리기
 * 3) 탭·구분 선택  4) ?state= 상태 보기(readonly = 에이전트 세션에서 연 서버)  5) ?co=1 영역 번호  6) 시트·토스트
 * 7) 레일: 프로젝트 고르기(전체 프로젝트 S00) · 바닥의 연결 상태와 지금 세션 사용량 한 줄(S13)
 */
(function () {
  "use strict";

  var ICONS = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    board: '<path d="M5 3v14m7-14v8m7-8v18"/>',
    doc: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12l2 2l4-4"/>',
    worktree: '<path d="M18 19a5 5 0 0 1-5-5v8"/><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"/><circle cx="13" cy="12" r="2"/><circle cx="20" cy="19" r="2"/>',
    ops: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    skills: '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474a2.5 2.5 0 1 1 3.014 3.015a1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474a2.5 2.5 0 1 0-3.014 3.015a1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474a2.5 2.5 0 1 1-3.014-3.015a1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474a2.5 2.5 0 1 0 3.014-3.015a1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>',
    harness: '<path d="M14 17H5M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    branch: '<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>',
    mr: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12"/>',
    merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
    commit: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6m6 0h6"/>',
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11zm7.318-19.539l-10.94 10.939"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    alert: '<path d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9 9.5a3 2.5 0 0 1 6 0c0 2-2 2-3 3.5m0 4h.01"/>',
    search: '<path d="m21 21l-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    terminal: '<path d="M12 19h8M4 17l6-6l-6-6"/>',
    ext: '<path d="M15 3h6v6m-11 5L21 3m-3 10v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
    question: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM7 11h10M7 15h6M7 7h8"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5m5 4a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    trash: '<path d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    ok: '<circle cx="12" cy="12" r="10"/><path d="m16 9l-5.5 5.5L8 12"/>',
    fail: '<circle cx="12" cy="12" r="10"/><path d="m15 9l-6 6m0-6l6 6"/>',
    disk: '<path d="M10 16h.01m-7.798-4.423a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zm19.734.436H2.054M6 16h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11"/>',
    chev: '<path d="m9 18l6-6l-6-6"/>',
    folder: '<path d="m6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    filter: '<path d="M2 5h20M6 12h12m-9 7h6"/>',
    plug: '<path d="M12 22v-5m3-9V2m2 6a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1zM9 8V2"/>',
    plus: '<path d="M5 12h14m-7-7v14"/>',
    paperclip: '<path d="m16 6l-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
    upload: '<path d="M12 3v12m5-7l-5-5l-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9m-5 8V5m-5 12v-3"/>',
    gauge: '<path d="m12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5m4-1v5l4 2"/>',
    chevdown: '<path d="m6 9l6 6l6-6"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    split: '<path d="M16 3h5v5M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3m12 6l6-6"/>',
    unlink: '<path d="m18.84 12.25l1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07a5.006 5.006 0 0 0-6.95 0l-1.72 1.71m-6.58 6.57l-1.71 1.71a5.004 5.004 0 0 0 .12 7.07a5.006 5.006 0 0 0 6.95 0l1.71-1.71M8 2v3M2 8h3m11 14v-3m6-3h-3"/>',
    reorder: '<path d="m21 16l-4 4l-4-4m4 4V4M3 8l4-4l4 4M7 4v16"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4m8.71 3.88l.7.71l-2.82 2.82"/>'
  };

  function injectSprite() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">';
    Object.keys(ICONS).forEach(function (k) {
      s += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + '</symbol>';
    });
    s += '</svg>';
    var holder = document.createElement("div");
    holder.innerHTML = s;
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }

  /* ── 게이트 레일 ──
   * data-rail="intent:ok plans:ok requirements:wait design tasks mr done deploy"
   * 상태: ok(승인됨) · wait(사람 승인 대기) · now(진행 중) · skip(이 이슈엔 없음) · 없음(아직)
   */
  var GATES = ["intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"];
  var GATE_KO = { intent: "Intent", plans: "기획물", requirements: "요구사항", design: "설계", tasks: "tasks", mr: "MR", done: "완료", deploy: "배포" };
  var STAGE_OF = { intent: "design", plans: "design", requirements: "design", design: "design", tasks: "build", mr: "build", done: "ops", deploy: "ops" };
  var COLOR = { design: "#3046c5", build: "#c98a12", ops: "#0b7a5e", gate: "#c8102e", todo: "#aeb9c7", line: "#d5dce5" };
  var STATE_KO = { ok: "승인됨", wait: "승인 대기", now: "진행 중", skip: "해당 없음", todo: "아직" };

  function drawRail(el) {
    var spec = {};
    (el.getAttribute("data-rail") || "").split(/\s+/).forEach(function (p) {
      if (!p) return;
      var kv = p.split(":");
      spec[kv[0]] = kv[1] || "todo";
    });
    var labels = el.hasAttribute("data-labels");
    var step = parseInt(el.getAttribute("data-step") || (labels ? "62" : "17"), 10);
    var size = labels ? 11 : 8;
    var pad = labels ? 26 : 6;
    var w = pad * 2 + step * (GATES.length - 1);
    var h = labels ? 40 : 14;
    var cy = labels ? 12 : 7;
    var out = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" role="img">';
    var desc = [];
    // 선
    for (var i = 0; i < GATES.length - 1; i++) {
      var a = spec[GATES[i]] || "todo";
      var passed = a === "ok" || a === "skip";
      var col = passed ? COLOR[STAGE_OF[GATES[i + 1]]] : COLOR.line;
      out += '<line x1="' + (pad + i * step) + '" y1="' + cy + '" x2="' + (pad + (i + 1) * step) + '" y2="' + cy + '" stroke="' + col + '" stroke-width="' + (labels ? 2 : 1.5) + '"/>';
    }
    GATES.forEach(function (g, idx) {
      var st = spec[g] || "todo";
      var x = pad + idx * step;
      var stage = STAGE_OF[g];
      var fill, stroke, r = size / 2;
      if (st === "ok") { fill = COLOR[stage]; stroke = COLOR[stage]; }
      else if (st === "wait") { fill = COLOR.gate; stroke = COLOR.gate; r = size / 2 + (labels ? 2 : 1.5); }
      else if (st === "now") { fill = "#fff"; stroke = COLOR[stage]; }
      else if (st === "skip") { fill = "#fff"; stroke = COLOR.line; r = size / 2 - 1.5; }
      else { fill = "#fff"; stroke = COLOR.todo; }
      var d = "M" + x + " " + (cy - r) + " L" + (x + r) + " " + cy + " L" + x + " " + (cy + r) + " L" + (x - r) + " " + cy + " Z";
      if (st === "wait") {
        out += '<path d="M' + x + " " + (cy - r - 3) + " L" + (x + r + 3) + " " + cy + " L" + x + " " + (cy + r + 3) + " L" + (x - r - 3) + " " + cy + ' Z" fill="none" stroke="' + COLOR.gate + '" stroke-opacity=".28" stroke-width="2"/>';
      }
      out += '<path d="' + d + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (st === "now" ? 2 : 1.5) + '" stroke-linejoin="round"/>';
      if (st === "now") {
        out += '<path d="M' + x + " " + (cy - r + 2.6) + " L" + (x + r - 2.6) + " " + cy + " L" + x + " " + (cy + r - 2.6) + " L" + (x - r + 2.6) + " " + cy + ' Z" fill="' + COLOR[stage] + '"/>';
      }
      if (labels) {
        out += '<text class="lbl' + (st === "wait" ? " now" : "") + '" x="' + x + '" y="' + (h - 2) + '" text-anchor="middle">' + GATE_KO[g] + "</text>";
      }
      desc.push(GATE_KO[g] + " " + STATE_KO[st]);
    });
    out += "<title>게이트: " + desc.join(", ") + "</title></svg>";
    el.innerHTML = out;
    el.setAttribute("aria-label", "게이트 " + desc.join(", "));
  }

  /* ── 탭: [role=tablist] 안의 [role=tab] aria-controls ── */
  function wireTabs(root) {
    root.querySelectorAll('[role="tablist"]').forEach(function (list) {
      var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
      function select(t, focus) {
        tabs.forEach(function (x) {
          var on = x === t;
          x.setAttribute("aria-selected", on ? "true" : "false");
          x.tabIndex = on ? 0 : -1;
          var p = document.getElementById(x.getAttribute("aria-controls"));
          if (p) p.hidden = !on;
        });
        if (focus) t.focus();
        list.dispatchEvent(new CustomEvent("tabchange", { detail: t }));
      }
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { select(t); });
        t.addEventListener("keydown", function (e) {
          var n = null;
          if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
          if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
          if (e.key === "Home") n = tabs[0];
          if (e.key === "End") n = tabs[tabs.length - 1];
          if (n) { e.preventDefault(); select(n, true); }
        });
      });
      list._select = select;
    });
  }

  /* ── 구분 선택(.seg): aria-pressed 토글, 같은 묶음에서 하나만 ── */
  function wireSeg(root) {
    root.querySelectorAll(".seg[data-single]").forEach(function (seg) {
      var bs = seg.querySelectorAll("button");
      bs.forEach(function (b) {
        b.addEventListener("click", function () {
          bs.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
          seg.dispatchEvent(new CustomEvent("segchange", { detail: b }));
        });
      });
    });
  }

  /* ── 영역 번호(?co=1) ── */
  function callouts() {
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-co]"));
    if (!els.length) return;
    document.body.classList.add("co-on");
    var layer = document.createElement("div");
    layer.className = "co-layer";
    layer.setAttribute("aria-hidden", "true");
    var host = document.querySelector("dialog[open]") || document.body;
    host.appendChild(layer);
    var badges = els.map(function (el) {
      var b = document.createElement("span");
      b.className = "co-badge";
      b.textContent = el.getAttribute("data-co");
      layer.appendChild(b);
      return b;
    });
    function place() {
      els.forEach(function (el, i) {
        var r = el.getBoundingClientRect();
        var hidden = r.width === 0 && r.height === 0;
        badges[i].style.display = hidden ? "none" : "grid";
        var pos = el.getAttribute("data-co-pos") || "tl";
        var x = r.left - 9, y = r.top - 9;
        if (pos === "tr") x = r.right - 13;
        if (pos === "in") { x = r.left + 4; y = r.top + 4; }
        badges[i].style.left = Math.max(2, x) + "px";
        badges[i].style.top = Math.max(2, y) + "px";
      });
    }
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    setTimeout(place, 60);
    setTimeout(place, 400);
    window.__placeCallouts = place;
  }

  /* ── 토스트 ── */
  var toastTimer;
  function toast(msg) {
    var t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.innerHTML = '<svg class="i"><use href="#i-check"/></svg><span></span>';
    t.querySelector("span").textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }

  /* ── 셸 레일: <aside class="rail" data-nav="home"> ──
   * data-nav="all" = 전체 프로젝트(S00). 레일이 리포 메뉴 대신 프로젝트 목록이 된다. */
  var NAV = [
    ["home", "S01-home.html", "home", "홈", "9", "decide", "처리할 일 9건"],
    ["progress", "S02-progress.html", "board", "진행", "", "", ""],
    ["docs", "S03-issue.html", "doc", "문서", "2", "decide", "답할 질문 2건"],
    ["verify", "S06-verify.html", "shield", "검증", "2", "decide", "열린 CRITICAL·HIGH 2건"],
    ["workspace", "S07-workspace.html", "worktree", "작업 공간", "2", "", "정리 대기 2개"],
    ["ops", "S10-ops.html", "ops", "운영", "", "", ""],
    ["-"],
    ["skills", "S08-skills.html", "skills", "스킬", "", "", ""],
    ["harness", "S09-harness.html", "harness", "하네스", "2", "warn", "doctor 경고 2건"],
    ["usage", "S13-usage.html", "chart", "기록 · 사용량", "", "", ""]
  ];
  /* 프로젝트: 전역 등록부 ~/.config/knots-sync/projects.json(경로 · 이름 · 더한 날만). 시안에는 knots-platform 화면만 있다. */
  var PROJECTS = [
    ["knots-platform", "S01-home.html", "9", "처리할 일 9건"],
    ["hr-vision-3d", "S00-projects.html#p-hr-vision-3d", "3", "처리할 일 3건"],
    ["my-api", "S00-projects.html#p-my-api", "2", "처리할 일 2건"]
  ];
  var PROJECT_TOTAL = 12, WS_TODO = "14";
  /* 지금 세션: 이 리포에서 가장 최근에 요청을 보낸 세션의 마지막 요청(입력 + 캐시) ÷ 모델 컨텍스트 창 */
  var NOW = { name: "api-worker", pct: 62, used: "124K", win: "200K", warnAt: 80 };
  /* 레일 바닥은 연결 상태와 지금 세션 한 줄뿐이다. 로그인 · 회원 정보는 없다.
   * 신원은 그 체크아웃의 git user이고, 승인 · 답 · 접수 자리에서만 보인다. */
  var SRV = "127.0.0.1:4874", FOLDER = "knots-platform", BRANCH = "feat/HDRV3D-12-upload-cleanup";

  function icon(name, cls) { return '<svg class="i' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function count(n, kind, label) { return n ? '<span class="count ' + (kind || "") + '" aria-label="' + label + '">' + n + "</span>" : ""; }

  function projectMenu(ws) {
    var h = '<div class="proj-menu" id="proj-menu" hidden>' +
      '<a class="pm-all" href="S00-projects.html"' + (ws ? ' aria-current="page"' : "") + '>' + icon("grid") +
      '<span>전체 프로젝트</span><span class="pm-n">등록 ' + PROJECT_TOTAL + "</span></a>" +
      '<p class="pm-h">최근 연 프로젝트</p>';
    PROJECTS.forEach(function (p, i) {
      var cur = !ws && i === 0;
      h += '<a href="' + p[1] + '"' + (cur ? ' aria-current="true"' : "") + ">" + icon(cur ? "check" : "folder") +
        '<span class="pm-nm">' + p[0] + "</span>" + count(p[2], "decide", p[3]) + "</a>";
    });
    return h + '<p class="pm-foot">더하기 · <code>npx knots-sync projects add &lt;dir&gt;</code></p></div>';
  }

  function switcher(ws) {
    var name = ws ? "전체 프로젝트" : FOLDER;
    var sub = ws ? icon("grid", "s") + "<span>등록 " + PROJECT_TOTAL + "</span>" : icon("branch", "s") + '<span class="mono">' + BRANCH + "</span>";
    return '<div class="rail-proj">' +
      '<button type="button" class="rail-repo" aria-expanded="false" aria-controls="proj-menu" title="프로젝트 바꾸기 · 지금 ' + name + '">' +
      '<span class="rp-name"><b>' + name + "</b>" + icon("chevdown", "s") + "</span>" +
      '<span class="rp-sub">' + sub + "</span>" +
      '<span class="rp-icon">' + icon(ws ? "grid" : "folder") + '<span class="sr-only">프로젝트 바꾸기 · 지금 ' + name + "</span></span></button>" +
      projectMenu(ws) + "</div>";
  }

  /* <aside data-usage-off="empty">: 그 상태에서는 기록 읽기가 꺼져 있어 사용량 대신 "꺼짐"을 보인다(S13) */
  function usageLine(off) {
    if (off) {
      return '<a class="rail-usage off" href="S13-usage.html" title="지금 세션 사용량 · 기록 읽기 꺼짐 · 기록 · 사용량 보기">' +
        '<span class="ru-t"><span class="ru-l">지금 세션 · 기록 읽기 꺼짐</span></span><span class="ru-bar" aria-hidden="true"></span></a>';
    }
    var warn = NOW.pct >= NOW.warnAt;
    var label = "지금 세션 " + NOW.name + " · 컨텍스트 " + NOW.pct + "% (" + NOW.used + " / " + NOW.win + ")" + (warn ? " · 자동 압축이 가깝다" : "") + " · 기록 · 사용량 보기";
    return '<a class="rail-usage' + (warn ? " warn" : "") + '" href="S13-usage.html" title="' + label + '" aria-label="' + label + '">' +
      '<span class="ru-t"><span class="ru-l">지금 세션 · 컨텍스트</span><b>' + NOW.pct + "%</b></span>" +
      '<span class="ru-bar" aria-hidden="true"><i style="width:' + NOW.pct + '%"></i></span></a>';
  }

  function buildShell(ro, state) {
    var rail = document.querySelector("aside.rail[data-nav]");
    if (!rail) return;
    var cur = rail.getAttribute("data-nav");
    var usageOff = (rail.getAttribute("data-usage-off") || "").split(/\s+/).indexOf(state) !== -1;
    var ws = cur === "all";
    var h = '<div class="rail-brand"><svg class="mark" viewBox="0 0 18 18" aria-hidden="true">' +
      '<path d="M9 1.5 L16.5 9 L9 16.5 L1.5 9 Z" fill="none" stroke="#fff" stroke-width="1.6"/>' +
      '<path d="M9 5.5 L12.5 9 L9 12.5 L5.5 9 Z" fill="#e0475f"/></svg><span>knots-sync</span><small>v2.0.0</small></div>' + switcher(ws);
    if (!ws) {
      var newTitle = ro ? "새 요구사항 · 읽기 전용이라 접수할 수 없다" : "새 요구사항";
      h += ro
        ? '<span class="rail-new" aria-disabled="true" title="' + newTitle + '">' + icon("plus") + "<span>새 요구사항</span></span>"
        : '<a class="rail-new" href="S11-intake.html"' + (cur === "intake" ? ' aria-current="page"' : "") + ' title="' + newTitle + '">' + icon("plus") + "<span>새 요구사항</span></a>";
    }
    h += '<nav class="nav" aria-label="' + (ws ? "전체 프로젝트 메뉴" : "관리 페이지 메뉴") + '">';
    if (ws) {
      h += '<a href="S00-projects.html" aria-current="page" title="전체 프로젝트">' + icon("grid") + "<span>전체 프로젝트</span>" + count(WS_TODO, "decide", "처리할 일 " + WS_TODO + "건") + "</a>";
      h += '<div class="nav-sep" role="separator"></div><p class="nav-h">프로젝트</p>';
      PROJECTS.forEach(function (p) {
        h += '<a href="' + p[1] + '" title="' + p[0] + '">' + icon("folder") + "<span>" + p[0] + "</span>" + count(p[2], "decide", p[3]) + "</a>";
      });
      h += '<a href="S13-usage.html" title="기록 · 사용량">' + icon("chart") + "<span>기록 · 사용량</span></a>";
    } else {
      NAV.forEach(function (n) {
        if (n[0] === "-") { h += '<div class="nav-sep" role="separator"></div>'; return; }
        h += '<a href="' + n[1] + '"' + (n[0] === cur ? ' aria-current="page"' : "") + ' title="' + n[3] + '">' +
          icon(n[2]) + "<span>" + n[3] + "</span>" + count(n[4], n[5], n[6]) + "</a>";
      });
    }
    h += "</nav>";
    var where = ws ? "전체 프로젝트 · 등록 " + PROJECT_TOTAL : "이 폴더: " + FOLDER;
    h += '<div class="rail-foot' + (ro ? " ro" : "") + '">' + usageLine(usageOff);
    if (ro) {
      h += '<div class="rail-conn" title="읽기 전용(에이전트 세션에서 실행) · ' + SRV + " · " + where + '">' +
        '<div class="srv">' + icon("eye", "s") + '<span class="mode">읽기 전용</span></div>' +
        '<div class="ln">에이전트 세션에서 실행</div>' +
        '<div class="ln mono">' + SRV + "</div>" +
        '<div class="ln">' + where + "</div></div>";
    } else {
      h += '<div class="rail-conn" title="' + SRV + " · " + where + ' · 접속 토큰 확인됨">' +
        '<div class="srv">' + icon("lock", "s") + '<span class="mono">' + SRV + "</span></div>" +
        '<div class="ln">' + where + "</div>" +
        '<div class="ln">접속 토큰 확인됨</div></div>';
    }
    h += "</div>";
    rail.innerHTML = h;
    wireSwitcher(rail);
  }

  /* 프로젝트 고르기: 단추 + 펼침 목록(메뉴 역할이 아니라 링크 목록). Esc · 바깥 누르기로 닫는다. */
  function wireSwitcher(rail) {
    var btn = rail.querySelector(".rail-repo");
    var menu = rail.querySelector("#proj-menu");
    if (!btn || !menu) return;
    function set(open, focusBack) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      menu.hidden = !open;
      rail.classList.toggle("menu-open", open);
      if (!open && focusBack) btn.focus();
    }
    btn.addEventListener("click", function () {
      /* 접힌 레일(좁은 화면)에서는 펼칠 자리가 없어 전체 프로젝트(S00)로 간다 */
      if (window.matchMedia("(max-width: 1180px)").matches) { location.href = "S00-projects.html"; return; }
      var open = btn.getAttribute("aria-expanded") !== "true";
      set(open);
      if (open) { var first = menu.querySelector("a"); if (first) first.focus({ preventScroll: true }); }
    });
    menu.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); set(false, true); }
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") { e.preventDefault(); set(false); }
    });
    document.addEventListener("click", function (e) {
      if (btn.getAttribute("aria-expanded") === "true" && !rail.querySelector(".rail-proj").contains(e.target)) set(false);
    });
    rail.querySelector(".rail-proj").addEventListener("focusout", function (e) {
      if (e.relatedTarget && !rail.querySelector(".rail-proj").contains(e.relatedTarget)) set(false);
    });
    if (params().menu) set(true);
  }

  /* 읽기 전용: 쓰기 조작([data-write])을 끄고 이유를 붙인다 */
  function lockWrites() {
    document.querySelectorAll("[data-write]").forEach(function (el) {
      el.disabled = true;
      el.setAttribute("aria-disabled", "true");
      el.title = "읽기 전용 · 에이전트 세션에서 연 관리 페이지는 쓰지 않는다";
    });
  }

  function params() {
    var q = {};
    location.search.replace(/^\?/, "").split("&").forEach(function (p) {
      if (!p) return;
      var kv = p.split("=");
      q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "1");
    });
    return q;
  }

  window.HX = {
    toast: toast,
    params: params,
    drawRail: drawRail,
    setState: function (s) {
      applyState(s);
      if (window.__placeCallouts) window.__placeCallouts();
    }
  };

  /* [data-state-show="a b"]는 지금 상태가 목록에 있을 때만 보인다(.st-on). 새 상태 이름도 CSS를 고치지 않고 쓴다. */
  function applyState(s) {
    document.body.setAttribute("data-state", s);
    document.querySelectorAll("[data-state-show]").forEach(function (el) {
      el.classList.toggle("st-on", el.getAttribute("data-state-show").split(/\s+/).indexOf(s) !== -1);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    injectSprite();
    var q = params();
    var state = q.state || document.body.getAttribute("data-state") || "default";
    var ro = state === "readonly";
    buildShell(ro, state);
    applyState(state);
    if (ro) lockWrites();
    document.querySelectorAll("[data-rail]").forEach(drawRail);
    wireTabs(document);
    wireSeg(document);
    document.querySelectorAll("[data-toast]").forEach(function (b) {
      b.addEventListener("click", function () { toast(b.getAttribute("data-toast")); });
    });
    document.querySelectorAll("[data-open]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = document.getElementById(b.getAttribute("data-open"));
        if (d && d.showModal) d.showModal();
      });
    });
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = b.closest("dialog");
        if (d) d.close();
      });
    });
    document.dispatchEvent(new CustomEvent("hx:ready", { detail: q }));
    if (q.co) callouts();
  });
})();
