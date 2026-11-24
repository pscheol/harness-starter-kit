// 관리 페이지 자리표시 화면(HK-17). 주소의 #t= 토큰을 localStorage 로 옮기고 주소에서 지운 뒤 Authorization 머리로 붙인다(설계 06 §3.1).
// 화면 데이터는 textContent 로만 넣는다(원문 HTML 을 실행하지 않는다). 화면 전체는 HK-18 이 만든다.
(function () {
  "use strict";
  var key = "hk-token-" + location.port;
  var m = /(?:^|[#&])t=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) {
    localStorage.setItem(key, m[1]);
    history.replaceState(null, "", location.pathname + location.search);
  }
  var token = localStorage.getItem(key) || "";
  var base = location.pathname.replace(/\/$/, "").replace(/^\/p\/([0-9a-f]{12}).*$/, "/api/v1/p/$1") || "";
  var api = base.indexOf("/api/v1/p/") === 0 ? base : "/api/v1";
  function get(path) {
    return fetch(api + path, { headers: { Authorization: "Bearer " + token } }).then(function (r) { return r.json(); });
  }
  function text(id, value) { document.getElementById(id).textContent = value; }
  function item(list, value) {
    var li = document.createElement("li");
    li.textContent = value;
    document.getElementById(list).appendChild(li);
  }
  function refresh() {
    get("/session").then(function (s) {
      if (!s.ok) { text("who", "토큰이 없거나 틀렸다 — 서버를 연 터미널의 주소로 다시 연다"); return; }
      text("who", s.data.repo + " · " + (s.data.user.email || "git 사용자 없음") + (s.data.readOnly ? " · 읽기 전용" : ""));
    });
    get("/overview").then(function (o) {
      if (!o.ok) return;
      document.getElementById("todo").textContent = "";
      document.getElementById("stages").textContent = "";
      o.data.todo.forEach(function (t) { item("todo", "[" + t.rank + "] " + t.title + " — " + t.reason); });
      var more = Object.keys(o.data.more).map(function (k) { return "rank " + k + ": " + o.data.more[k]; });
      text("more", more.length ? "더: " + more.join(" · ") : "");
      Object.keys(o.data.stages).forEach(function (k) { item("stages", k + " " + o.data.stages[k]); });
    });
  }
  refresh();
  setInterval(refresh, 5000);
})();
