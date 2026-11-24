/* knots-sync 관리 페이지 시안 — 차트 도우미(바닐라 JS · 외부 파일 · 라이브러리 없음)
 * 인라인 SVG로 선 · 세로 막대 · 덤벨을 그린다. 화면마다 자기 예시 데이터를 넘긴다.
 *
 * dataviz 규칙을 여기서 지킨다.
 *  - 색은 app.css 토큰을 클래스로만 쓴다: ink(한 계열 기본 · 회색 잉크) · design · build · ops · gate(사람 승인 대기 · 실패).
 *  - 선 2px · 끝점 지름 8px + 바탕색 고리 2px · 막대 두께 24px 이하, 바닥은 각지고 끝은 4px 둥글게 · 격자 1px 실선.
 *  - 기준선(문턱 · 목표 · 도입 전 값)은 1px 점선과 이름을 같이 쓴다. 기준 밖 자리는 옅은 빨강으로 칠한다.
 *  - 글자는 12px 이상이고 계열 색을 입지 않는다. 값은 끝점 · 극값처럼 고른 자리에만 쓴다.
 *  - 차트 하나 = 탭 한 번. SVG에 role="img" + aria-label(요약)을 달고, 포커스하면 ← → · Home · End로 점을 옮기며
 *    툴팁을 본다. 마우스는 칸 전체가 잡는 자리다. 툴팁은 보탬이다. 표로 보기(table)를 같이 두거나,
 *    작은 그림은 aria-label에 값을 모두 쓴다(화면에서 안 보이는 표는 겹쳐 그려져 두지 않는다).
 *  - 글은 textContent로만 넣는다.
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var WEEK = ["일", "월", "화", "수", "목", "금", "토"];

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
      });
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function text(parent, x, y, s, cls, anchor) {
    var t = el("text", { x: x, y: y, "class": cls || "vz-ax", "text-anchor": anchor || "middle" }, parent);
    t.textContent = s;
    return t;
  }

  function merge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    if (over) Object.keys(over).forEach(function (k) { out[k] = over[k]; });
    return out;
  }

  /* ── 툴팁: 값이 앞(진하게), 이름이 뒤. 계열은 짧은 선으로 표시 ── */
  var tipEl = null;
  function tipBox() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "vz-tip";
    tipEl.hidden = true;
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function showTip(head, rows, x, y) {
    var t = tipBox();
    t.textContent = "";
    var h = document.createElement("div");
    h.className = "vz-tip-h";
    h.textContent = head;
    t.appendChild(h);
    rows.forEach(function (r) {
      var d = document.createElement("div");
      d.className = "vz-tip-r" + (r.sub ? " sub" : "");
      var b = document.createElement("b");
      b.textContent = r.v;
      d.appendChild(b);
      if (r.key) {
        var i = document.createElement("i");
        i.className = "vz-key " + r.key;
        d.appendChild(i);
      }
      if (r.n) {
        var s = document.createElement("span");
        s.textContent = r.n;
        d.appendChild(s);
      }
      t.appendChild(d);
    });
    t.hidden = false;
    var w = t.offsetWidth, hh = t.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 12));
    var top = y - hh - 12;
    if (top < 8) top = y + 16;
    t.style.left = left + "px";
    t.style.top = top + "px";
  }

  function hideTip() {
    if (tipEl) tipEl.hidden = true;
  }

  /* HTML 요소(막대 조각 · 표 칸)에 툴팁을 단다. make() → [머리, 줄들] */
  function bind(target, make, group) {
    var g = group || target;
    function at(x, y) {
      var r = make();
      showTip(r[0], r[1], x, y);
    }
    target.addEventListener("pointerenter", function (e) { g.classList.add("vz-on"); at(e.clientX, e.clientY); });
    target.addEventListener("pointermove", function (e) { at(e.clientX, e.clientY); });
    target.addEventListener("pointerleave", function () { g.classList.remove("vz-on"); hideTip(); });
    target.addEventListener("focus", function () {
      var b = target.getBoundingClientRect();
      g.classList.add("vz-on");
      at(b.left + b.width / 2, b.top + 4);
    });
    target.addEventListener("blur", function () { g.classList.remove("vz-on"); hideTip(); });
  }

  /* SVG 차트 공통: 칸마다 마우스 자리, 차트 자체는 탭 한 번 + 화살표 */
  function interact(svg, o) {
    var cur = -1;
    function go(i) {
      cur = i;
      var r = o.show(i);
      showTip(r.head, r.rows, r.x, r.y);
    }
    function clear() {
      cur = -1;
      if (o.clear) o.clear();
      hideTip();
    }
    var layer = el("g", { "class": "vz-hits" }, svg);
    for (var i = 0; i < o.n; i++) {
      (function (k) {
        var b = o.hit(k);
        if (!b) return;
        var h = el("rect", { x: b.x, y: b.y, width: Math.max(1, b.w), height: Math.max(1, b.h), "class": "vz-hit" }, layer);
        h.addEventListener("pointerenter", function () { go(k); });
        h.addEventListener("pointermove", function () { if (cur !== k) go(k); });
      })(i);
    }
    svg.addEventListener("pointerleave", clear);
    svg.addEventListener("focus", function () { go(o.start !== undefined ? o.start : o.n - 1); });
    svg.addEventListener("blur", clear);
    svg.addEventListener("keydown", function (e) {
      var k = cur < 0 ? (o.start !== undefined ? o.start : o.n - 1) : cur;
      if (e.key === "ArrowRight") k = Math.min(o.n - 1, k + 1);
      else if (e.key === "ArrowLeft") k = Math.max(0, k - 1);
      else if (e.key === "Home") k = 0;
      else if (e.key === "End") k = o.n - 1;
      else if (e.key === "Escape") { clear(); return; }
      else return;
      e.preventDefault();
      go(k);
    });
  }

  function svgRoot(host, W, H, label, focusable) {
    var svg = el("svg", {
      width: W, height: H, viewBox: "0 0 " + W + " " + H,
      "class": "vz-svg", role: "img", "aria-label": label,
      tabindex: focusable === false ? null : "0"
    }, host);
    var t = el("title", null, svg);
    t.textContent = label;
    return svg;
  }

  function lastIndex(vals) {
    for (var i = vals.length - 1; i >= 0; i--) if (vals[i] !== null && vals[i] !== undefined) return i;
    return -1;
  }

  /* ── 선 차트 · 스파크라인 ──
   * values: 숫자(null = 그 칸 값 없음), labels: 칸 이름(툴팁 머리), y: {min, max, ticks?, fmt?}
   * ticks가 없으면 축 없이 그린다(스파크라인). xTicks: [[칸, 글, 정렬?]], refs: [{v, label, at:"start"|"end", below}]
   * zone: {from, to} 기준 밖 자리, events: [{i, label}], step: 계단선, area: 옅은 바탕
   * endLabel(v) 끝값 글, extra: [{i, label, pos:"below", anchor}], ptClass(v, i) 점 색, fmt(v) 툴팁 값, tip(i) 툴팁 줄
   */
  function line(host, o) {
    var W = o.w || host.clientWidth;
    if (!W) return null;
    host.textContent = "";
    var vals = o.values, n = vals.length;
    var H = o.h || 120;
    var m = merge({ l: 8, r: 8, t: 8, b: 8 }, o.m);
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var lo = o.y.min, hi = o.y.max;
    var tone = o.line || "ink";
    function X(i) { return m.l + (n === 1 ? pw / 2 : (pw * i) / (n - 1)); }
    function Y(v) { return m.t + ph - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * ph; }
    var svg = svgRoot(host, W, H, o.label, o.focusable);

    if (o.zone) {
      var za = Y(o.zone.from), zb = Y(o.zone.to);
      el("rect", { x: m.l, y: Math.min(za, zb), width: pw, height: Math.abs(zb - za), "class": "vz-zone" }, svg);
    }
    if (o.y.ticks) {
      o.y.ticks.forEach(function (t) {
        el("line", { x1: m.l, x2: m.l + pw, y1: Y(t), y2: Y(t), "class": t === lo ? "vz-base" : "vz-grid" }, svg);
        if (o.y.fmt !== false) text(svg, m.l - 6, Y(t) + 4, o.y.fmt ? o.y.fmt(t) : String(t), "vz-ax", "end");
      });
    } else if (o.floor) {
      el("line", { x1: m.l, x2: m.l + pw, y1: Y(lo), y2: Y(lo), "class": "vz-base" }, svg);
    }
    (o.xTicks || []).forEach(function (t) {
      text(svg, X(t[0]), H - 4, t[1], "vz-ax" + (t[3] ? " now" : ""), t[2] || "middle");
    });
    (o.events || []).forEach(function (e) {
      /* 사건 이름은 그림 위 여백에 둔다(선과 겹치지 않게). m.t를 14 이상 둔다 */
      el("line", { x1: X(e.i), x2: X(e.i), y1: m.t - 12, y2: m.t + ph, "class": "vz-ev" }, svg);
      text(svg, X(e.i) + 5, m.t - 3, e.label, "vz-lbl", "start");
    });
    (o.refs || []).forEach(function (r) {
      var yy = Y(r.v);
      el("line", { x1: m.l, x2: m.l + pw, y1: yy, y2: yy, "class": "vz-ref" }, svg);
      if (r.label) {
        var end = r.at === "end";
        text(svg, end ? m.l + pw : m.l + 2, r.below ? yy + 15 : yy - 5, r.label, "vz-ref-l", end ? "end" : "start");
      }
    });

    var segs = [], cur = [];
    vals.forEach(function (v, i) {
      if (v === null || v === undefined) { if (cur.length) segs.push(cur); cur = []; }
      else cur.push(i);
    });
    if (cur.length) segs.push(cur);
    segs.forEach(function (s) {
      var d = "";
      s.forEach(function (i, k) {
        if (k === 0) d += "M" + X(i) + " " + Y(vals[i]);
        else if (o.step) d += " H" + X(i) + " V" + Y(vals[i]);
        else d += " L" + X(i) + " " + Y(vals[i]);
      });
      if (o.area && s.length > 1) {
        el("path", { d: d + " V" + Y(lo) + " H" + X(s[0]) + " Z", "class": "vz-area " + tone }, svg);
      }
      if (s.length > 1) el("path", { d: d, "class": "vz-line " + tone }, svg);
    });
    /* 이어지지 않은 점(앞뒤가 비었다)은 점으로만 */
    vals.forEach(function (v, i) {
      if (v === null || v === undefined) return;
      var prev = i > 0 ? vals[i - 1] : null, next = i < n - 1 ? vals[i + 1] : null;
      var alone = (prev === null || prev === undefined) && (next === null || next === undefined);
      if (alone || (o.dots && o.dots(v, i))) {
        el("circle", { cx: X(i), cy: Y(v), r: 4, "class": "vz-pt " + (o.ptClass ? o.ptClass(v, i) : tone) }, svg);
      }
    });
    (o.extra || []).forEach(function (x) {
      var v = vals[x.i];
      if (v === null || v === undefined) return;
      text(svg, X(x.i) + (x.dx || 0), x.pos === "below" ? Y(v) + 17 : Y(v) - 9, x.label, "vz-val", x.anchor || "middle");
    });
    var last = lastIndex(vals);
    if (last >= 0 && o.end !== false) {
      el("circle", { cx: X(last), cy: Y(vals[last]), r: 4, "class": "vz-pt " + (o.ptClass ? o.ptClass(vals[last], last) : tone) }, svg);
      if (o.endLabel) text(svg, X(last) + 9, Y(vals[last]) + 4, o.endLabel(vals[last]), "vz-val", "start");
    }

    var hov = el("g", { "class": "vz-hov" }, svg);
    var xh = el("line", { y1: m.t, y2: m.t + ph, "class": "vz-xh" }, hov);
    var hp = el("circle", { r: 4, "class": "vz-pt " + tone }, hov);
    var step = n > 1 ? pw / (n - 1) : pw;
    interact(svg, {
      n: n,
      start: last >= 0 ? last : n - 1,
      hit: function (i) {
        var x0 = Math.max(m.l - 4, X(i) - step / 2), x1 = Math.min(m.l + pw + 4, X(i) + step / 2);
        return { x: x0, y: m.t - 4, w: x1 - x0, h: ph + 8 };
      },
      show: function (i) {
        var v = vals[i];
        xh.setAttribute("x1", X(i));
        xh.setAttribute("x2", X(i));
        if (v === null || v === undefined) hp.style.display = "none";
        else {
          hp.style.display = "";
          hp.setAttribute("cx", X(i));
          hp.setAttribute("cy", Y(v));
          hp.setAttribute("class", "vz-pt " + (o.ptClass ? o.ptClass(v, i) : tone));
        }
        hov.classList.add("on");
        var rows = o.tip ? o.tip(i) : [{ v: v === null || v === undefined ? "—" : (o.fmt ? o.fmt(v) : String(v)), n: o.name || "", key: tone }];
        var b = svg.getBoundingClientRect();
        return { head: o.labels[i], rows: rows, x: b.left + X(i), y: b.top + (v === null || v === undefined ? m.t : Y(v)) };
      },
      clear: function () { hov.classList.remove("on"); }
    });
    return svg;
  }

  /* 막대 하나의 길: 바닥은 각지고 위 끝만 r만큼 둥글다 */
  function barPath(x, y, w, h, r) {
    var rr = Math.min(r, h, w / 2);
    if (h <= 0) return "";
    return "M" + x + " " + (y + h) + " V" + (y + rr) + " Q" + x + " " + y + " " + (x + rr) + " " + y +
      " H" + (x + w - rr) + " Q" + (x + w) + " " + y + " " + (x + w) + " " + (y + rr) + " V" + (y + h) + " Z";
  }

  /* ── 세로 막대(한 계열) ──
   * values, labels(툴팁 머리), max, cls(색), bw(두께, 24 이하), xLabels: [글](칸마다, 없으면 생략)
   * valueLabel(v, i): 막대 위 글(없으면 안 씀), zeroMark: 0인 칸에 바닥 표시, clsOf(v, i): 칸마다 색
   * marks: 칸 아래 그릴 도형 함수(svg, cx, y, i) — 게이트 레일 마름모 등
   */
  function cols(host, o) {
    var W = o.w || host.clientWidth;
    if (!W) return null;
    host.textContent = "";
    var vals = o.values, n = vals.length;
    var H = o.h || 100;
    var m = merge({ l: 4, r: 4, t: 18, b: 22 }, o.m);
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var max = o.max || Math.max.apply(null, vals) || 1;
    var band = pw / n, bw = Math.min(o.bw || 16, 24, band - 4);
    function cx(i) { return m.l + band * i + band / 2; }
    function Y(v) { return m.t + ph - (v / max) * ph; }
    var svg = svgRoot(host, W, H, o.label, o.focusable);
    el("line", { x1: m.l, x2: m.l + pw, y1: Y(0), y2: Y(0), "class": "vz-base" }, svg);
    var groups = [];
    vals.forEach(function (v, i) {
      var g = el("g", { "class": "vz-col" }, svg);
      groups.push(g);
      el("rect", { x: m.l + band * i + 1, y: m.t - 14, width: band - 2, height: ph + 14, rx: 3, "class": "vz-band" }, g);
      var cls = o.clsOf ? o.clsOf(v, i) : (o.cls || "ink");
      if (v > 0) el("path", { d: barPath(cx(i) - bw / 2, Y(v), bw, Y(0) - Y(v), 4), "class": "vz-bar " + cls }, g);
      else if (o.zeroMark) el("line", { x1: cx(i) - bw / 2, x2: cx(i) + bw / 2, y1: Y(0) - 1, y2: Y(0) - 1, "class": "vz-zero" }, g);
      if (o.valueLabel) {
        var s = o.valueLabel(v, i);
        if (s) text(g, cx(i), Y(v) - 5, s, v > 0 ? "vz-val" : "vz-ax");
      }
      if (o.marks) o.marks(g, cx(i), Y(0), i);
      if (o.xLabels && o.xLabels[i]) text(g, cx(i), H - 4, o.xLabels[i], "vz-ax" + (o.xNow === i ? " now" : ""));
    });
    interact(svg, {
      n: n,
      start: o.start,
      hit: function (i) { return { x: m.l + band * i, y: m.t - 14, w: band, h: H - m.t + 14 }; },
      show: function (i) {
        groups.forEach(function (g, k) { g.classList.toggle("on", k === i); });
        var b = svg.getBoundingClientRect();
        var rows = o.tip ? o.tip(i) : [{ v: o.fmt ? o.fmt(vals[i]) : String(vals[i]), n: o.name || "", key: o.cls || "ink" }];
        return { head: o.labels[i], rows: rows, x: b.left + cx(i), y: b.top + Y(vals[i]) };
      },
      clear: function () { groups.forEach(function (g) { g.classList.remove("on"); }); }
    });
    return svg;
  }

  /* ── 덤벨: 줄마다 전(빈 고리) → 지금(찬 점) ──
   * rows: [{name, sub, from, to, fromL, toL, tip:[...]}], max, ticks, fmt(축 글), lw(이름 폭), cls(지금 색)
   */
  function dumbbell(host, o) {
    var W = o.w || host.clientWidth;
    if (!W) return null;
    host.textContent = "";
    var rows = o.rows, n = rows.length;
    var lw = o.lw || 150, rowH = o.rowH || 40;
    var m = merge({ l: lw, r: 64, t: 6, b: 22 }, o.m);
    var H = m.t + rowH * n + m.b;
    var pw = W - m.l - m.r;
    function X(v) { return m.l + (Math.min(v, o.max) / o.max) * pw; }
    function RY(i) { return m.t + rowH * i + rowH / 2 + 6; }
    var svg = svgRoot(host, W, H, o.label, o.focusable);
    o.ticks.forEach(function (t) {
      el("line", { x1: X(t), x2: X(t), y1: m.t, y2: H - m.b, "class": t === 0 ? "vz-base" : "vz-grid" }, svg);
      text(svg, X(t), H - 5, o.fmt ? o.fmt(t) : String(t), "vz-ax");
    });
    var groups = [];
    rows.forEach(function (r, i) {
      var g = el("g", { "class": "vz-row" }, svg);
      groups.push(g);
      el("rect", { x: 0, y: m.t + rowH * i + 1, width: W, height: rowH - 2, rx: 4, "class": "vz-band" }, g);
      var y = RY(i);
      text(g, 0, y - 3, r.name, "vz-lbl", "start");
      if (r.sub) text(g, 0, y + 12, r.sub, "vz-ax", "start");
      el("line", { x1: X(r.to), x2: X(r.from), y1: y, y2: y, "class": "vz-link" }, g);
      el("circle", { cx: X(r.from), cy: y, r: 5, "class": "vz-ring" }, g);
      el("circle", { cx: X(r.to), cy: y, r: 5, "class": "vz-pt " + (o.cls || "ink") }, g);
      text(g, X(r.from) + 10, y + 4, r.fromL, "vz-ax", "start");
      text(g, X(r.to), y - 10, r.toL, "vz-val", "start");
    });
    interact(svg, {
      n: n,
      start: 0,
      hit: function (i) { return { x: 0, y: m.t + rowH * i, w: W, h: rowH }; },
      show: function (i) {
        groups.forEach(function (g, k) { g.classList.toggle("on", k === i); });
        var b = svg.getBoundingClientRect();
        return { head: rows[i].name, rows: rows[i].tip, x: b.left + X(rows[i].to), y: b.top + RY(i) };
      },
      clear: function () { groups.forEach(function (g) { g.classList.remove("on"); }); }
    });
    return svg;
  }

  /* ── 표 ── */
  function tableEl(caption, head, rows, right) {
    var t = document.createElement("table");
    t.className = "tbl";
    var c = document.createElement("caption");
    c.className = "sr-only";
    c.textContent = caption;
    t.appendChild(c);
    var th = document.createElement("thead"), tr = document.createElement("tr");
    head.forEach(function (h, i) {
      var x = document.createElement("th");
      x.scope = "col";
      if (right && right.indexOf(i) !== -1) x.className = "r";
      x.textContent = h;
      tr.appendChild(x);
    });
    th.appendChild(tr);
    t.appendChild(th);
    var tb = document.createElement("tbody");
    rows.forEach(function (r) {
      var row = document.createElement("tr");
      r.forEach(function (v, i) {
        var d = document.createElement("td");
        if (right && right.indexOf(i) !== -1) d.className = "r";
        d.textContent = v;
        row.appendChild(d);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    return t;
  }

  /* 눈에 보이는 "표로 보기"(details) */
  function table(host, caption, head, rows, right) {
    host.textContent = "";
    var d = document.createElement("details");
    d.className = "vz-tv";
    var s = document.createElement("summary");
    s.textContent = "표로 보기";
    d.appendChild(s);
    d.appendChild(tableEl(caption, head, rows, right));
    host.appendChild(d);
    return d;
  }

  /* 날짜 칸: 끝 날(월, 일)에서 거꾸로 n일. 2026년 기준 */
  function days(endM, endD, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(2026, endM - 1, endD - i);
      out.push({ m: d.getMonth() + 1, d: d.getDate(), w: WEEK[d.getDay()] });
    }
    return out;
  }

  /* 창 크기가 바뀌면 다시 그린다(150ms 모아서) */
  function onResize(fn) {
    var t;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(fn, 150);
    });
  }

  window.HXViz = {
    el: el,
    text: text,
    svgRoot: svgRoot,
    interact: interact,
    line: line,
    cols: cols,
    dumbbell: dumbbell,
    table: table,
    bind: bind,
    showTip: showTip,
    hideTip: hideTip,
    days: days,
    onResize: onResize
  };
})();
