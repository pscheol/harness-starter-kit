#!/usr/bin/env node
// harness-kit 2.0.0-alpha.0 · src-sha256 da904ee459a5d87f4ad8e27219065d6b0e03087b4a21945d46d29aeb24a44540 · 생성물(packages/cli/build.mjs) — 손으로 고치지 않는다
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// <define:__HK_STATIC__>
var define_HK_STATIC_default = { "app.css": "body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; color: #1d1d1f; }\nh1 { font-size: 1.4rem; margin: 0; }\nh2 { font-size: 1.1rem; margin-top: 2rem; }\n#who, .note { color: #555; }\ncode { background: #f2f2f2; padding: 0 .25rem; }\n", "app.js": '// 관리 페이지 자리표시 화면(HK-17). 주소의 #t= 토큰을 localStorage 로 옮기고 주소에서 지운 뒤 Authorization 머리로 붙인다(설계 06 §3.1).\n// 화면 데이터는 textContent 로만 넣는다(원문 HTML 을 실행하지 않는다). 화면 전체는 HK-18 이 만든다.\n(function () {\n  "use strict";\n  var key = "hk-token-" + location.port;\n  var m = /(?:^|[#&])t=([A-Za-z0-9_-]+)/.exec(location.hash);\n  if (m) {\n    localStorage.setItem(key, m[1]);\n    history.replaceState(null, "", location.pathname + location.search);\n  }\n  var token = localStorage.getItem(key) || "";\n  var base = location.pathname.replace(/\\/$/, "").replace(/^\\/p\\/([0-9a-f]{12}).*$/, "/api/v1/p/$1") || "";\n  var api = base.indexOf("/api/v1/p/") === 0 ? base : "/api/v1";\n  function get(path) {\n    return fetch(api + path, { headers: { Authorization: "Bearer " + token } }).then(function (r) { return r.json(); });\n  }\n  function text(id, value) { document.getElementById(id).textContent = value; }\n  function item(list, value) {\n    var li = document.createElement("li");\n    li.textContent = value;\n    document.getElementById(list).appendChild(li);\n  }\n  function refresh() {\n    get("/session").then(function (s) {\n      if (!s.ok) { text("who", "토큰이 없거나 틀렸다 — 서버를 연 터미널의 주소로 다시 연다"); return; }\n      text("who", s.data.repo + " · " + (s.data.user.email || "git 사용자 없음") + (s.data.readOnly ? " · 읽기 전용" : ""));\n    });\n    get("/overview").then(function (o) {\n      if (!o.ok) return;\n      document.getElementById("todo").textContent = "";\n      document.getElementById("stages").textContent = "";\n      o.data.todo.forEach(function (t) { item("todo", "[" + t.rank + "] " + t.title + " — " + t.reason); });\n      var more = Object.keys(o.data.more).map(function (k) { return "rank " + k + ": " + o.data.more[k]; });\n      text("more", more.length ? "더: " + more.join(" · ") : "");\n      Object.keys(o.data.stages).forEach(function (k) { item("stages", k + " " + o.data.stages[k]); });\n    });\n  }\n  refresh();\n  setInterval(refresh, 5000);\n})();\n', "index.html": '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="referrer" content="no-referrer">\n<title>harness-kit 관리 페이지</title>\n<link rel="stylesheet" href="/app.css">\n</head>\n<body>\n<header><h1>harness-kit 관리 페이지</h1><p id="who">연결 중</p></header>\n<main>\n<section aria-labelledby="todo-h"><h2 id="todo-h">처리할 일</h2><ol id="todo"></ol><p id="more"></p></section>\n<section aria-labelledby="stage-h"><h2 id="stage-h">단계별 이슈</h2><ul id="stages"></ul></section>\n<p class="note">화면(S00~S13)은 HK-18 에서 채운다. 모든 기능은 콘솔 명령으로도 된다: <code>npx harness-kit status</code></p>\n</main>\n<script src="/app.js"></script>\n</body>\n</html>\n' };

// src/cli.ts
var import_node_tty = __toESM(require("node:tty"));

// src/cli/args.ts
var import_node_util = require("node:util");

// src/core/errors.ts
var EXIT = {
  OK: 0,
  CHECK: 1,
  USAGE: 2,
  STATE: 3,
  HUMAN: 4,
  ENV: 5,
  ABORT: 130
};
var CliError = class extends Error {
  code;
  hint;
  constructor(code, message2, hint) {
    super(message2);
    this.name = "CliError";
    this.code = code;
    this.hint = hint;
  }
};
function usageError(message2, hint) {
  return new CliError(EXIT.USAGE, message2, hint);
}
function fsError(err, action) {
  const code = err?.code;
  const detail = err instanceof Error ? err.message : String(err);
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return new CliError(EXIT.ENV, `${action}: 쓰기 권한이 없다 (${code})`, detail);
  }
  return new CliError(EXIT.STATE, `${action}: ${detail}`);
}

// src/cli/args.ts
var COMMON = {
  cwd: { type: "string" },
  "dry-run": { type: "boolean" },
  yes: { type: "boolean" },
  json: { type: "boolean" },
  templates: { type: "string" },
  "no-color": { type: "boolean" },
  quiet: { type: "boolean" },
  help: { type: "boolean", short: "h" }
};
var INIT = {
  stack: { type: "string" },
  arch: { type: "string" },
  domain: { type: "string" },
  lang: { type: "string" },
  agents: { type: "string" },
  modules: { type: "string" },
  name: { type: "string" },
  slug: { type: "string" },
  "package-ns": { type: "string" },
  "protected-path": { type: "string" },
  token: { type: "string", multiple: true },
  "issue-source": { type: "string" },
  "issue-prefix": { type: "string" },
  base: { type: "string" },
  adopt: { type: "boolean" },
  force: { type: "boolean" }
};
var COMMAND_OPTIONS = {
  init: INIT,
  plan: INIT,
  doctor: { check: { type: "boolean" }, only: { type: "string" } },
  list: { files: { type: "boolean" } },
  update: {
    "accept-all": { type: "boolean" },
    prune: { type: "boolean" },
    forget: { type: "string", multiple: true },
    to: { type: "string" },
    packs: { type: "boolean" },
    tools: { type: "boolean" }
  },
  repair: { only: { type: "string" } },
  uninstall: { "keep-state": { type: "boolean" }, "keep-packs": { type: "boolean" } },
  add: {},
  remove: {},
  outdated: { check: { type: "boolean" }, source: { type: "string" } },
  // 관리 페이지 서버 · 화면 없이 쓰기(HK-17, 설계 06 §3.15)
  dashboard: {
    port: { type: "string" },
    open: { type: "boolean" },
    "read-only": { type: "boolean" },
    export: { type: "string" },
    all: { type: "boolean" },
    root: { type: "string" },
    workspace: { type: "string" }
  },
  status: {
    session: { type: "boolean" },
    intents: { type: "boolean" },
    intent: { type: "string" },
    issues: { type: "boolean" },
    issue: { type: "string" },
    area: { type: "string" },
    stage: { type: "string" },
    doc: { type: "string" },
    verify: { type: "boolean" },
    worktrees: { type: "boolean" },
    harness: { type: "boolean" },
    flow: { type: "string" },
    all: { type: "boolean" },
    ops: { type: "boolean" }
  },
  projects: {},
  approve: { gate: { type: "string" }, phrase: { type: "string" }, "changes-requested": { type: "boolean" }, "rule-candidate": { type: "boolean" } },
  answer: { list: { type: "boolean" }, choice: { type: "string" }, text: { type: "string" } },
  review: { fix: { type: "boolean" }, "accept-risk": { type: "boolean" }, reason: { type: "string" } },
  sessions: { machine: { type: "boolean" } },
  dispatch: { to: { type: "string" }, kind: { type: "string" }, path: { type: "string", multiple: true }, text: { type: "string" }, via: { type: "string" } },
  units: {
    "add-dep": { type: "string", multiple: true },
    "remove-dep": { type: "string", multiple: true },
    split: { type: "string", multiple: true },
    merge: { type: "string", multiple: true },
    order: { type: "string" },
    reason: { type: "string" }
  },
  flow: { add: { type: "string" }, after: { type: "string" }, remove: { type: "string" } },
  quality: { findings: { type: "boolean" }, issue: { type: "string" }, severity: { type: "string" }, new: { type: "boolean" } },
  history: { q: { type: "string" } },
  // 확장 층(HK-14, 설계 04)
  pack: { dir: { type: "string" }, from: { type: "string", multiple: true }, "kit-range": { type: "string" } },
  local: {}
};
var POSITIONAL = /* @__PURE__ */ new Set(["add", "remove", "projects", "approve", "answer", "review", "dispatch", "units", "flow", "pack", "local"]);
function parseCommandArgs(command, argv) {
  const options = { ...COMMON, ...COMMAND_OPTIONS[command] ?? {} };
  try {
    const { values, positionals } = (0, import_node_util.parseArgs)({ args: argv, options, strict: true, allowPositionals: POSITIONAL.has(command) });
    return { values, positionals };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err.code;
    const name = /'(-[^']*)'/.exec(msg)?.[1] ?? "";
    if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") throw usageError(`${command}: 모르는 플래그 ${name}`, `harness-kit ${command} --help`);
    if (code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") throw usageError(`${command}: 위치 인자를 받지 않는다 ${name}`, "대상 폴더는 --cwd <폴더> 로 준다");
    if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") throw usageError(`${command}: 플래그 값이 틀렸다 ${name}`, msg);
    throw usageError(`${command}: ${msg}`);
  }
}
function str(values, key) {
  const v = values[key];
  return typeof v === "string" ? v : void 0;
}
function bool(values, key) {
  return values[key] === true;
}
function list(values, key) {
  const v = values[key];
  return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
}

// src/core/fsx.ts
var import_node_crypto = __toESM(require("node:crypto"));
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
function byteCompare(a, b) {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
function walkFiles(dir) {
  const out = [];
  const walk3 = (d, prefix) => {
    for (const name of import_node_fs.default.readdirSync(d)) {
      const full11 = import_node_path.default.join(d, name);
      const rel2 = prefix ? `${prefix}/${name}` : name;
      const st = import_node_fs.default.lstatSync(full11);
      if (st.isDirectory()) walk3(full11, rel2);
      else if (st.isFile()) out.push(rel2);
    }
  };
  walk3(dir, "");
  return out.sort(byteCompare);
}
function lstatOrNull(p) {
  try {
    return import_node_fs.default.lstatSync(p);
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return null;
    throw err;
  }
}
function isDir(p) {
  try {
    return import_node_fs.default.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function isInside(child, parent) {
  const rel2 = import_node_path.default.relative(parent, child);
  return rel2 === "" || rel2 !== ".." && !rel2.startsWith(`..${import_node_path.default.sep}`) && !import_node_path.default.isAbsolute(rel2);
}
function writeFileAtomic(dest, data, executable) {
  const dir = import_node_path.default.dirname(dest);
  import_node_fs.default.mkdirSync(dir, { recursive: true });
  const tmp = import_node_path.default.join(dir, `.${import_node_path.default.basename(dest)}.hk-${import_node_crypto.default.randomBytes(4).toString("hex")}`);
  try {
    import_node_fs.default.writeFileSync(tmp, data, { mode: executable ? 511 : 438, flag: "wx" });
    import_node_fs.default.renameSync(tmp, dest);
  } catch (err) {
    import_node_fs.default.rmSync(tmp, { force: true });
    throw err;
  }
}

// src/core/legacy-lock.ts
var import_node_path11 = __toESM(require("node:path"));

// src/core/hash.ts
var import_node_crypto2 = __toESM(require("node:crypto"));
var import_node_fs2 = __toESM(require("node:fs"));
function sha256(data) {
  return import_node_crypto2.default.createHash("sha256").update(data).digest("hex");
}
function sha256File(file) {
  return sha256(import_node_fs2.default.readFileSync(file));
}

// src/core/installed.ts
var import_node_path10 = __toESM(require("node:path"));

// src/core/layout.ts
var import_node_fs3 = __toESM(require("node:fs"));
var import_node_path2 = __toESM(require("node:path"));
var LAYOUT_SCHEMA = "harness-kit.layout/v1";
function bad(message2) {
  return new CliError(EXIT.ENV, `layout.json 형식 오류: ${message2}`);
}
function obj(v, what) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw bad(`${what} 는 객체여야 한다`);
  return v;
}
function str2(v, what) {
  if (typeof v !== "string") throw bad(`${what} 는 문자열이어야 한다`);
  return v;
}
function strList(v, what) {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw bad(`${what} 는 문자열 배열이어야 한다`);
  return [...v];
}
function strMap(v, what) {
  const o = obj(v, what);
  for (const [k, x] of Object.entries(o)) str2(x, `${what}.${k}`);
  return { ...o };
}
function stackSpec(v, what) {
  const o = obj(v, what);
  const domain = o.domain === null || o.domain === void 0 ? null : str2(o.domain, `${what}.domain`);
  let lang = null;
  if (o.lang !== void 0) {
    const l = obj(o.lang, `${what}.lang`);
    lang = Object.fromEntries(Object.entries(l).map(([k, x]) => [k, strMap(x, `${what}.lang.${k}`)]));
  }
  return { domain, defaultArch: str2(o.defaultArch, `${what}.defaultArch`), tokens: strMap(o.tokens ?? {}, `${what}.tokens`), lang };
}
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
function parseLayout(raw) {
  const o = obj(raw, "layout");
  if (o.schema !== LAYOUT_SCHEMA) throw bad(`schema 가 ${LAYOUT_SCHEMA} 가 아니다 (${String(o.schema)})`);
  if (o.overlap !== "first" && o.overlap !== "last") throw bad("overlap 은 first 또는 last");
  if (!Array.isArray(o.layers) || o.layers.length === 0) throw bad("layers 가 비었다");
  if (!Array.isArray(o.segments) || o.segments.length === 0) throw bad("segments 가 비었다");
  const layers = o.layers.map((l, i) => {
    const x = obj(l, `layers[${i}]`);
    if (x.each !== void 0 && x.each !== "modules") throw bad(`layers[${i}].each 는 modules 만 된다`);
    return {
      id: str2(x.id, `layers[${i}].id`),
      dir: str2(x.dir, `layers[${i}].dir`),
      whenExists: x.whenExists === true,
      exclude: x.exclude === void 0 ? [] : strList(x.exclude, `layers[${i}].exclude`),
      each: x.each === "modules" ? "modules" : null
    };
  });
  const segments = o.segments.map((s, i) => {
    const x = obj(s, `segments[${i}]`);
    const harness = x.harness === null ? null : str2(x.harness, `segments[${i}].harness`);
    return { from: str2(x.from, `segments[${i}].from`), to: str2(x.to, `segments[${i}].to`), harness };
  });
  const stacksRaw = obj(o.stacks, "stacks");
  const executable = strList(o.executable, "executable");
  const detectRaw = obj(o.harnessDetect ?? {}, "harnessDetect");
  return {
    schema: LAYOUT_SCHEMA,
    ignore: strList(o.ignore, "ignore"),
    overlap: o.overlap,
    layers,
    segments,
    pathTokens: strMap(o.pathTokens ?? {}, "pathTokens"),
    executable,
    executableRe: executable.map(globToRegExp),
    tokens: strList(o.tokens, "tokens"),
    harnesses: strList(o.harnesses, "harnesses"),
    harnessDetect: Object.fromEntries(
      Object.entries(detectRaw).map(([k, v]) => {
        const d = obj(v, `harnessDetect.${k}`);
        return [k, { dirs: strList(d.dirs ?? [], `harnessDetect.${k}.dirs`), env: strList(d.env ?? [], `harnessDetect.${k}.env`) }];
      })
    ),
    defaultHarnesses: strList(o.defaultHarnesses ?? [], "defaultHarnesses"),
    modules: strList(o.modules, "modules"),
    domains: strList(o.domains, "domains"),
    defaultStack: str2(o.defaultStack, "defaultStack"),
    stacks: Object.fromEntries(Object.entries(stacksRaw).map(([k, v]) => [k, stackSpec(v, `stacks.${k}`)])),
    stackFallback: stackSpec(o.stackFallback ?? { defaultArch: "hexagonal" }, "stackFallback"),
    tokenDefaults: strMap(o.tokenDefaults ?? {}, "tokenDefaults")
  };
}
function loadLayout(templatesDir) {
  const file = import_node_path2.default.join(templatesDir, "layout.json");
  let text2;
  try {
    text2 = import_node_fs3.default.readFileSync(file, "utf8");
  } catch {
    throw new CliError(EXIT.ENV, `layout.json 이 없다: ${file}`);
  }
  let raw;
  try {
    raw = JSON.parse(text2);
  } catch (err) {
    throw bad(err instanceof Error ? err.message : String(err));
  }
  return parseLayout(raw);
}
function matchSegment(layout2, rel2) {
  for (const seg of layout2.segments) {
    const prefix = seg.from === "" || seg.from.endsWith("/");
    if (prefix ? rel2.startsWith(seg.from) : rel2 === seg.from) return seg;
  }
  throw bad(`어느 세그먼트에도 맞지 않는다: ${rel2} (마지막 세그먼트는 from "" 이어야 한다)`);
}
function applyPathTokens(layout2, rel2, tokens) {
  let out = rel2;
  for (const [needle, key] of Object.entries(layout2.pathTokens)) {
    const value = tokens[key] ?? "";
    if (value !== "") out = out.split(needle).join(value);
  }
  return out;
}
function mapPath(layout2, rel2, tokens) {
  const seg = matchSegment(layout2, rel2);
  const dest = seg.from.endsWith("/") || seg.from === "" ? seg.to + rel2.slice(seg.from.length) : seg.to;
  return { dest: applyPathTokens(layout2, dest, tokens), harness: seg.harness };
}
function isExecutable(layout2, dest) {
  return layout2.executableRe.some((re) => re.test(dest));
}
function stackSpecOf(layout2, stack) {
  return layout2.stacks[stack] ?? layout2.stackFallback;
}

// src/core/lock.ts
var import_node_fs4 = __toESM(require("node:fs"));

// src/core/json.ts
function isScalar(v) {
  return v === null || typeof v !== "object";
}
function inline(v) {
  if (isScalar(v)) return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  const entries = Object.entries(v).filter(([, x]) => x !== void 0);
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")}}`;
}
function block(v, indent) {
  if (isScalar(v)) return JSON.stringify(v) ?? "null";
  const inner = `${indent}  `;
  if (Array.isArray(v)) {
    if (v.length === 0 || v.every(isScalar)) return inline(v);
    return `[
${v.map((x) => `${inner}${inline(x)}`).join(",\n")}
${indent}]`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== void 0);
  if (entries.length === 0) return "{}";
  return `{
${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${block(x, inner)}`).join(",\n")}
${indent}}`;
}
function formatJson(value) {
  return `${block(value, "")}
`;
}

// src/core/lock.ts
var LOCK_REL = ".agents/harness-kit.lock";
var LOCK_SCHEMA = "harness-kit.lock/v2";
var V1_HEADER = "# harness-kit lock v1";
var V1_MARK = "# pre-existing: -";
var OPS = /* @__PURE__ */ new Set(["copy", "mirror", "render", "merge", "none"]);
var ENTRY_ORDER = ["path", "op", "owner", "sha256", "layer", "from", "fromSha256", "keys", "createdByKit"];
var V1_PROJECTION = /* @__PURE__ */ new Set(["mirror", "render", "merge", "merge+"]);
function orderEntry(e) {
  const known = ENTRY_ORDER.filter((k) => k in e).map((k) => [k, e[k]]);
  const rest = Object.keys(e).filter((k) => !ENTRY_ORDER.includes(k)).map((k) => [k, e[k]]);
  return Object.fromEntries([...known, ...rest]);
}
function serializeLock(lock) {
  const byPath = /* @__PURE__ */ new Map();
  for (const e of lock.entries) byPath.set(e.path, e);
  const entries = [...byPath.keys()].sort(byteCompare).map((p) => orderEntry(byPath.get(p)));
  return formatJson({ schema: LOCK_SCHEMA, kit: lock.kit, packs: lock.packs, entries });
}
function v1LabelToLayer(label) {
  if (label === "common") return "common";
  if (label === "frontend" || label === "backend") return `domains/${label}`;
  if (label.startsWith("mod/")) return `optional/${label.slice(4)}`;
  const slash = label.indexOf("/");
  if (slash > 0) return `stacks/${label.slice(0, slash)}/arch/${label.slice(slash + 1)}`;
  return `stacks/${label}`;
}
function v1ProjectionEntry(sha, label, rel2) {
  if (label === "merge+") return { path: rel2, op: "merge", owner: "kit", createdByKit: true };
  if (label === "merge") return { path: rel2, op: "merge", owner: "kit" };
  return { path: rel2, op: label, owner: "kit", sha256: sha === "-" ? null : sha };
}
function parseV1(text2) {
  const seen = /* @__PURE__ */ new Map();
  const lines = text2.split("\n");
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].replace(/\r$/, "");
    if (line === "" || line.startsWith("#")) continue;
    const cols = line.split("	");
    if (cols.length !== 4 || cols.some((c) => c === "")) throw new Error(`v1 lock ${i + 1}번째 줄: 칸이 4개가 아니다`);
    const [sha, label, , rel2] = cols;
    if (V1_PROJECTION.has(label)) {
      seen.set(rel2, v1ProjectionEntry(sha, label, rel2));
      continue;
    }
    const layer = v1LabelToLayer(label);
    const prev = seen.get(rel2);
    seen.set(rel2, { path: rel2, op: "copy", owner: "kit", sha256: prev ? prev.sha256 ?? null : sha === "-" ? null : sha, layer });
  }
  const entries = [...seen.keys()].sort(byteCompare).map((p) => seen.get(p));
  return { schema: LOCK_SCHEMA, kit: { version: null, source: null }, packs: [], entries };
}
function parseV2(text2) {
  const raw = JSON.parse(text2);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("최상위가 객체가 아니다");
  const o = raw;
  if (o.schema !== LOCK_SCHEMA) throw new Error(`모르는 schema: ${String(o.schema)}`);
  if (!Array.isArray(o.entries)) throw new Error("entries 가 배열이 아니다");
  const entries = o.entries.map((e, i) => {
    if (e === null || typeof e !== "object") throw new Error(`entries[${i}] 가 객체가 아니다`);
    const x = e;
    if (typeof x.path !== "string" || typeof x.op !== "string" || typeof x.owner !== "string") {
      throw new Error(`entries[${i}] 에 path · op · owner 가 없다`);
    }
    if (!OPS.has(x.op)) throw new Error(`entries[${i}].op 를 모른다: ${x.op}`);
    if (x.sha256 !== void 0 && x.sha256 !== null && typeof x.sha256 !== "string") throw new Error(`entries[${i}].sha256 형식`);
    return x;
  });
  const kit = o.kit && typeof o.kit === "object" ? o.kit : {};
  return {
    schema: LOCK_SCHEMA,
    kit: { version: typeof kit.version === "string" ? kit.version : null, source: typeof kit.source === "string" ? kit.source : null },
    packs: Array.isArray(o.packs) ? o.packs : [],
    entries
  };
}
function parseLockText(text2) {
  if (text2.startsWith(V1_HEADER)) {
    const marked = text2.split("\n").some((l) => l.replace(/\r$/, "") === V1_MARK);
    return { format: "v1", lock: parseV1(text2), ambiguous: !marked };
  }
  if (text2.trim() === "") throw new Error("비어 있다");
  return { format: "v2", lock: parseV2(text2), ambiguous: false };
}
function readLock(file) {
  let text2;
  try {
    text2 = import_node_fs4.default.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { status: "missing" };
    return { status: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
  try {
    return { status: "ok", ...parseLockText(text2) };
  } catch (err) {
    return { status: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
}

// src/core/meta.ts
var import_node_fs5 = __toESM(require("node:fs"));
var META_REL = ".agents/harness-kit.json";
var META_SCHEMA = "harness-kit/v2";
var KEY_ORDER = [
  "schema",
  "kit",
  "project",
  "stack",
  "arch",
  "domain",
  "agents",
  "modules",
  "flow",
  "risk",
  "codebase",
  "roles",
  "approvers",
  "groups",
  "issueKey",
  "git",
  "intake",
  "notion",
  "packs",
  "verify",
  "versions",
  "tokens",
  "installedAt",
  "updatedAt"
];
var DEFAULT_GATES = ["codebase", "intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"];
var DEFAULT_BASE = "develop";
var GIT_DEFAULTS = { base: DEFAULT_BASE, worktreeRoot: "../{repo}.worktrees", maxPerRepo: 3, ide: "code" };
var DEFAULT_FLOW = { design: "kit", record: "none", gates: DEFAULT_GATES };
function buildMeta(args) {
  const { selection: sel, tokens } = args;
  const slug = tokens.PROJECT_SLUG ?? "";
  return {
    schema: META_SCHEMA,
    kit: { version: args.version },
    project: { name: tokens.PROJECT_NAME ?? "", slug },
    stack: sel.stack,
    arch: sel.arch,
    domain: sel.domain,
    agents: [...sel.agents],
    modules: [...sel.modules],
    flow: { ...DEFAULT_FLOW, gates: [...DEFAULT_GATES] },
    issueKey: { source: args.issue.source ?? "kit", prefix: args.issue.prefix ?? derivePrefix(slug) },
    git: { ...GIT_DEFAULTS, base: args.base ?? DEFAULT_BASE },
    packs: [],
    verify: { fullOnlyInCI: true },
    tokens: { ...tokens },
    installedAt: args.today,
    updatedAt: args.today
  };
}
function mergeMetaForUpdate(meta, args) {
  const { selection: sel } = args;
  return {
    ...meta,
    schema: META_SCHEMA,
    kit: { version: args.version },
    stack: sel.stack,
    arch: sel.arch,
    domain: sel.domain,
    agents: [...sel.agents],
    modules: [...sel.modules],
    flow: isObj(meta.flow) ? meta.flow : { ...DEFAULT_FLOW, gates: [...DEFAULT_GATES] },
    git: { ...GIT_DEFAULTS, ...meta.git },
    tokens: { ...meta.tokens, ...args.tokens },
    installedAt: meta.installedAt || args.today,
    updatedAt: args.today
  };
}
function serializeMeta(meta) {
  const known = KEY_ORDER.filter((k) => k in meta).map((k) => [k, meta[k]]);
  const rest = Object.keys(meta).filter((k) => !KEY_ORDER.includes(k)).map((k) => [k, meta[k]]);
  return formatJson(Object.fromEntries([...known, ...rest]));
}
var isStr = (v) => typeof v === "string";
var isStrList = (v) => Array.isArray(v) && v.every(isStr);
var isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function checkCommon(m) {
  for (const k of ["stack", "arch"]) if (!isStr(m[k])) return `${k} 가 문자열이 아니다`;
  if (m.domain !== void 0 && !isStr(m.domain)) return "domain 이 문자열이 아니다";
  if (!isStrList(m.agents)) return "agents 가 문자열 배열이 아니다";
  if (m.modules !== void 0 && !isStrList(m.modules)) return "modules 가 문자열 배열이 아니다";
  if (m.tokens !== void 0 && !isObj(m.tokens)) return "tokens 가 객체가 아니다";
  return null;
}
function tokensOf(m) {
  const t = isObj(m.tokens) ? m.tokens : {};
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, isStr(v) ? v : String(v ?? "")]));
}
var ISSUE_PREFIX = /^[A-Z][A-Z0-9]{1,9}$/;
function derivePrefix(slug) {
  const letters = slug.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^[0-9]+/, "").slice(0, 10);
  return ISSUE_PREFIX.test(letters) ? letters : "ISSUE";
}
function repairedIssueKey(key, slug) {
  const broken = key.source === "kit" && key.prefix === slug.toUpperCase() && !ISSUE_PREFIX.test(key.prefix);
  return broken ? { ...key, prefix: derivePrefix(slug) } : key;
}
function fromV1(m) {
  const tokens = tokensOf(m);
  const slug = tokens.PROJECT_SLUG ?? "";
  const { kitVersion, installedAt, updatedAt, tokens: _t, ...rest } = m;
  return {
    ...rest,
    schema: META_SCHEMA,
    kit: { version: isStr(kitVersion) ? kitVersion : "unknown" },
    project: { name: tokens.PROJECT_NAME ?? "", slug },
    stack: m.stack,
    arch: m.arch,
    domain: isStr(m.domain) ? m.domain : "",
    agents: m.agents,
    modules: isStrList(m.modules) ? m.modules : [],
    issueKey: isObj(m.issueKey) ? m.issueKey : { source: "kit", prefix: derivePrefix(slug) },
    git: { base: DEFAULT_BASE, ...isObj(m.git) ? m.git : {} },
    packs: [],
    verify: { fullOnlyInCI: true, ...isObj(m.verify) ? m.verify : {} },
    tokens,
    installedAt: isStr(installedAt) ? installedAt : "",
    updatedAt: isStr(updatedAt) ? updatedAt : ""
  };
}
function fromV2(m) {
  const tokens = tokensOf(m);
  const slug = isObj(m.project) && isStr(m.project.slug) ? m.project.slug : tokens.PROJECT_SLUG ?? "";
  return {
    ...m,
    schema: META_SCHEMA,
    kit: { version: isObj(m.kit) && isStr(m.kit.version) ? m.kit.version : "unknown" },
    project: { name: isObj(m.project) && isStr(m.project.name) ? m.project.name : tokens.PROJECT_NAME ?? "", slug },
    stack: m.stack,
    arch: m.arch,
    domain: isStr(m.domain) ? m.domain : "",
    agents: m.agents,
    modules: isStrList(m.modules) ? m.modules : [],
    issueKey: isObj(m.issueKey) ? repairedIssueKey(m.issueKey, slug) : { source: "kit", prefix: derivePrefix(slug) },
    git: { base: DEFAULT_BASE, ...isObj(m.git) ? m.git : {} },
    packs: Array.isArray(m.packs) ? m.packs : [],
    verify: { fullOnlyInCI: true, ...isObj(m.verify) ? m.verify : {} },
    tokens,
    installedAt: isStr(m.installedAt) ? m.installedAt : "",
    updatedAt: isStr(m.updatedAt) ? m.updatedAt : ""
  };
}
function readMeta(file) {
  let text2;
  try {
    text2 = import_node_fs5.default.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { status: "missing" };
    return { status: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
  let raw;
  try {
    raw = JSON.parse(text2);
  } catch (err) {
    return { status: "invalid", error: `JSON 해석 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isObj(raw)) return { status: "invalid", error: "최상위가 객체가 아니다" };
  const isV2 = raw.schema === META_SCHEMA;
  const isV1 = raw.schema === void 0 && "kitVersion" in raw;
  if (!isV2 && !isV1) return { status: "invalid", error: `모르는 형식(schema: ${String(raw.schema)})` };
  const problem = checkCommon(raw);
  if (problem) return { status: "invalid", error: problem };
  return isV2 ? { status: "ok", schema: "v2", meta: fromV2(raw) } : { status: "ok", schema: "v1", meta: fromV1(raw) };
}

// src/core/plan.ts
var import_node_fs11 = __toESM(require("node:fs"));
var import_node_path8 = __toESM(require("node:path"));

// src/core/resolve.ts
var import_node_fs6 = __toESM(require("node:fs"));
var import_node_path3 = __toESM(require("node:path"));
function fill(dir, vars) {
  return dir.replace(/\{([a-z]+)\}/g, (_m, k) => vars[k] ?? "");
}
function layerDirs(layout2, templatesDir, sel) {
  const out = [];
  for (const spec of layout2.layers) {
    const instances = spec.each === "modules" ? sel.modules : [null];
    for (const m of instances) {
      if (spec.dir.includes("{domain}") && sel.domain === "") continue;
      const dir = fill(spec.dir, { stack: sel.stack, arch: sel.arch, domain: sel.domain, module: m ?? "" });
      if (!isDir(import_node_path3.default.join(templatesDir, dir))) {
        if (spec.whenExists) continue;
        throw new CliError(EXIT.ENV, `템플릿 레이어 폴더가 없다: ${import_node_path3.default.join(templatesDir, dir)}`);
      }
      out.push({ dir, exclude: spec.exclude.map(globToRegExp) });
    }
  }
  return out;
}
function resolveCandidates(layout2, templatesDir, sel, tokens) {
  const byDest = /* @__PURE__ */ new Map();
  let excludedByHarness = 0;
  const ignore = new Set(layout2.ignore);
  for (const { dir, exclude } of layerDirs(layout2, templatesDir, sel)) {
    for (const rel2 of walkFiles(import_node_path3.default.join(templatesDir, dir))) {
      if (ignore.has(import_node_path3.default.posix.basename(rel2))) continue;
      if (exclude.some((re) => re.test(rel2))) continue;
      const { dest, harness } = mapPath(layout2, rel2, tokens);
      if (harness !== null && !sel.agents.includes(harness)) {
        excludedByHarness += 1;
        continue;
      }
      const list2 = byDest.get(dest) ?? [];
      list2.push({ dest, src: `${dir}/${rel2}`, layer: dir, harness });
      byDest.set(dest, list2);
    }
  }
  const winners = [];
  const overlaps = [];
  for (const dest of [...byDest.keys()].sort(byteCompare)) {
    const list2 = byDest.get(dest);
    const winner = layout2.overlap === "first" ? list2[0] : list2[list2.length - 1];
    winners.push(winner);
    if (list2.length > 1) overlaps.push({ path: dest, layers: list2.map((c) => c.layer), winner: winner.layer });
  }
  return { winners, overlaps, excludedByHarness };
}
function readTemplate(templatesDir, src) {
  return import_node_fs6.default.readFileSync(import_node_path3.default.join(templatesDir, ...src.split("/")));
}

// src/projection/engine.ts
var import_node_fs9 = __toESM(require("node:fs"));
var import_node_path6 = __toESM(require("node:path"));

// src/projection/hooks.ts
var HOOKS_REL = ".agents/hooks.json";
var HOOKS_SCHEMA = "harness-kit.hooks/v1";
var HooksError = class extends Error {
};
var HOOK_ID = /^harness-[a-z0-9-]+$/;
var ENV_KEY = /^[A-Z][A-Z0-9_]*$/;
var ENV_VALUE = /^[A-Za-z0-9._/:-]*$/;
var SCRIPT = /^scripts\/[A-Za-z0-9._/-]+$/;
var OWNER = /^(kit|user|pack:[a-z0-9-]+)$/;
var TOOLS = ["write", "shell"];
var FIELDS = /* @__PURE__ */ new Set(["id", "event", "tools", "script", "timeoutSec", "owner", "floor", "env", "harnesses", "module", "description", "title", "maxOutputBytes", "subagents"]);
var FORBIDDEN_ENV = /* @__PURE__ */ new Set(["ANTHROPIC_MODEL", "CLAUDE_CODE_EFFORT_LEVEL", "MAX_THINKING_TOKENS", "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "CLAUDE_CODE_SUBAGENT_EFFORT"]);
var isObj2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var positiveInt = (v) => typeof v === "number" && Number.isInteger(v) && v > 0;
var pyRepr = (v) => typeof v === "string" ? `'${v}'` : v === void 0 || v === null ? "None" : JSON.stringify(v);
function check(h, i, map, seen) {
  const where = `hooks.json hooks[${i}]`;
  if (!isObj2(h)) throw new HooksError(`${where}: 객체가 아니다`);
  const extra = Object.keys(h).filter((k) => !FIELDS.has(k)).sort();
  if (extra.length) throw new HooksError(`${where}: 모르는 필드 ${extra.join(", ")}`);
  const id = h.id;
  if (typeof id !== "string" || !HOOK_ID.test(id)) throw new HooksError(`${where}: id 는 harness-<소문자 · 숫자 · ->`);
  if (seen.has(id)) throw new HooksError(`${where}: id ${id} 가 두 번 나온다`);
  seen.add(id);
  if (typeof h.event !== "string" || !Object.hasOwn(map.events, h.event)) throw new HooksError(`${where} ${id}: 모르는 event ${pyRepr(h.event)}`);
  const tools = h.tools;
  if (tools !== void 0) {
    if (h.event !== "pre-tool" && h.event !== "post-tool") throw new HooksError(`${where} ${id}: tools 는 pre-tool · post-tool 에만 둔다`);
    if (!Array.isArray(tools) || !tools.length || tools.some((t) => !TOOLS.includes(t))) throw new HooksError(`${where} ${id}: tools 는 write · shell 목록`);
  }
  const script = h.script;
  if (typeof script !== "string" || !SCRIPT.test(script) || script.split("/").includes("..")) throw new HooksError(`${where} ${id}: script 는 scripts/ 아래 상대 경로`);
  if (!positiveInt(h.timeoutSec)) throw new HooksError(`${where} ${id}: timeoutSec 는 양의 정수`);
  if (typeof h.owner !== "string" || !OWNER.test(h.owner)) throw new HooksError(`${where} ${id}: owner 는 kit · user · pack:<이름>`);
  for (const key of ["floor", "subagents"]) {
    if (Object.hasOwn(h, key) && typeof h[key] !== "boolean") throw new HooksError(`${where} ${id}: ${key} 는 true · false`);
  }
  if (Object.hasOwn(h, "maxOutputBytes") && !positiveInt(h.maxOutputBytes)) throw new HooksError(`${where} ${id}: maxOutputBytes 는 양의 정수`);
  const known = new Set(Object.values(map.harnessOf));
  const harnesses = h.harnesses;
  if (harnesses !== void 0 && (!Array.isArray(harnesses) || !harnesses.length || harnesses.some((x) => !known.has(x)))) {
    throw new HooksError(`${where} ${id}: harnesses 는 ${[...known].sort().join(" · ")} 목록`);
  }
  for (const key of ["module", "description", "title"]) {
    if (Object.hasOwn(h, key) && (typeof h[key] !== "string" || !h[key])) throw new HooksError(`${where} ${id}: ${key} 는 빈 글이 아니다`);
  }
  const env = h.env;
  if (env !== void 0) {
    if (!isObj2(env)) throw new HooksError(`${where} ${id}: env 는 객체`);
    for (const [k, per] of Object.entries(env)) {
      if (!ENV_KEY.test(k) || FORBIDDEN_ENV.has(k) || k.startsWith("ANTHROPIC_DEFAULT_") && k.endsWith("_MODEL")) throw new HooksError(`${where} ${id}: env ${k} 를 쓸 수 없다(대문자 · 숫자 · _, 모델 환경변수 금지)`);
      if (!isObj2(per) || Object.entries(per).some(([x, v]) => !known.has(x) || typeof v !== "string" || !ENV_VALUE.test(v))) throw new HooksError(`${where} ${id}: env ${k} 는 하네스 → 값(영문 · 숫자 · ._/:-)`);
    }
  }
  return h;
}
function parseHooks(text2, map) {
  if (text2 === null) return null;
  let data;
  try {
    data = JSON.parse(text2);
  } catch (err) {
    throw new HooksError(`hooks.json 을 해석할 수 없다: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isObj2(data) || data.schema !== HOOKS_SCHEMA) throw new HooksError(`hooks.json schema 는 ${HOOKS_SCHEMA}`);
  if (!Array.isArray(data.hooks)) throw new HooksError("hooks.json hooks 가 배열이 아니다");
  const seen = /* @__PURE__ */ new Set();
  return data.hooks.map((h, i) => check(h, i, map, seen));
}
function wantedHooks(hooks, target, map, modules) {
  const harness = map.harnessOf[target];
  return hooks.filter((h) => Object.hasOwn(map.events[h.event], target) && (h.harnesses === void 0 || h.harnesses.includes(harness)) && (h.module === void 0 || modules.includes(h.module)));
}
function hookCommand(h, target, map) {
  const harness = map.harnessOf[target];
  const prefix = Object.entries(h.env ?? {}).filter(([, per]) => Object.hasOwn(per, harness)).map(([k, per]) => `${k}=${per[harness]} `).join("");
  return prefix + map.commands[target].split("{id}").join(h.id).split("{script}").join(h.script);
}
function toolNames(h, target, map) {
  const out = [];
  for (const tool of h.tools ?? []) for (const name of map.tools[tool][target].split("|")) if (!out.includes(name)) out.push(name);
  return out;
}
var eventOf = (h, target, map) => map.events[h.event][target];
function settingsHooks(hooks, target, map, modules) {
  return wantedHooks(hooks, target, map, modules).map((h) => {
    const names = toolNames(h, target, map);
    return {
      id: h.id,
      event: eventOf(h, target, map),
      ...names.length ? { matcher: names.join("|") } : {},
      script: h.script,
      hook: { type: "command", command: hookCommand(h, target, map), timeout: h.timeoutSec }
    };
  });
}
function kiroIdeFiles(hooks, map, modules) {
  return wantedHooks(hooks, "kiroIde", map, modules).map((h) => {
    const entry = { name: h.title ?? h.id, trigger: eventOf(h, "kiroIde", map) };
    if (h.description !== void 0) entry.description = h.description;
    const names = toolNames(h, "kiroIde", map);
    if (names.length) entry.matcher = names.join("|");
    entry.action = { type: "command", command: hookCommand(h, "kiroIde", map), timeout: h.timeoutSec };
    return { path: `.kiro/hooks/${h.id}.json`, text: `${JSON.stringify({ version: "v1", hooks: [entry] }, null, 2)}
` };
  });
}
function kiroCliHooks(hooks, map, modules, subagentsOnly = false) {
  const out = {};
  for (const h of wantedHooks(hooks, "kiroCli", map, modules)) {
    if (subagentsOnly && !h.subagents) continue;
    const command = hookCommand(h, "kiroCli", map);
    const names = toolNames(h, "kiroCli", map);
    const ms = h.timeoutSec * 1e3;
    const entries = names.length ? names.map((n) => ({ matcher: n, command, timeout_ms: ms })) : [{ command, timeout_ms: ms }];
    const ev = eventOf(h, "kiroCli", map);
    out[ev] = [...out[ev] ?? [], ...entries];
  }
  return out;
}
function substitute(value, tokens) {
  if (typeof value === "string") return Object.entries(tokens).reduce((v, [k, x]) => x ? v.split(`{{kit:${k}}}`).join(x).split(`{{${k}}}`).join(x) : v, value);
  if (Array.isArray(value)) return value.map((x) => substitute(x, tokens));
  if (isObj2(value)) return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, substitute(x, tokens)]));
  return value;
}
function renderKiroCoordinator(spec, tokens, cliHooks) {
  const base = substitute(spec.kiroCoordinator, tokens);
  const obj2 = Object.keys(cliHooks).length ? { ...base, hooks: cliHooks } : base;
  return `${JSON.stringify(obj2, null, 2)}
`;
}
function kitScriptSuffixes(hooks, map) {
  const names = [];
  for (const script of [...(hooks ?? []).map((h) => h.script), ...(map.legacyScripts ?? []).map((n) => `scripts/hooks/${n}`)]) if (!names.includes(script)) names.push(script);
  const out = [];
  for (const script of names) for (const s of [script, `_ ${script.slice(script.lastIndexOf("/") + 1)}`]) if (!out.includes(s)) out.push(s);
  return out;
}
var HOOKS_DIR = ".agents/hooks.d";
var PROJECT_HOOKS = "project.json";
function hookDocPaths(names) {
  const enc = (n) => Buffer.from(n, "utf8");
  return names.filter((n) => n.endsWith(".json") && !n.startsWith(".")).sort((a, b) => Number(a === PROJECT_HOOKS) - Number(b === PROJECT_HOOKS) || Buffer.compare(enc(a), enc(b))).map((n) => `${HOOKS_DIR}/${n}`);
}
function mergeHookDocs(docs, map, floor) {
  const hooks = [];
  const findings = [];
  for (const { rel: rel2, text: text2 } of docs) {
    const items = parseHooks(text2, map) ?? [];
    const project = rel2 === `${HOOKS_DIR}/${PROJECT_HOOKS}`;
    const index = new Map(hooks.map((h, i) => [h.id, i]));
    for (const item of items) {
      if (!project) {
        if (index.has(item.id)) throw new HooksError(`${rel2}: 훅 id ${item.id} 가 다른 층에도 있다(팩 훅 id 는 harness-<팩>- 로 시작한다)`);
        hooks.push(item);
      } else if (floor.includes(item.id)) {
        findings.push({ kind: "floor-override", severity: "error", path: rel2, hint: `하한 훅 ${item.id} 는 프로젝트가 덮지 못한다 — 이 항목은 쓰지 않았다` });
      } else if (index.has(item.id)) hooks[index.get(item.id)] = item;
      else hooks.push(item);
    }
  }
  return { hooks, findings };
}

// src/projection/frontmatter.ts
var FM_KEY = /^([A-Za-z0-9_-]+):(.*)$/;
var LIST_ITEM = /^\s+-\s?(.*)$/;
function splitFrontmatter(text2) {
  if (!text2.startsWith("---\n")) return { block: null, body: text2 };
  const end = text2.indexOf("\n---\n", 3);
  if (end < 0) return { block: null, body: text2 };
  return { block: end >= 4 ? text2.slice(4, end) : "", body: text2.slice(end + 5) };
}
function splitFlow(inner) {
  const parts = [];
  let cur = "";
  let quote = "";
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() || parts.length) parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}
function strip(s) {
  return s.replace(/^[\s]+|[\s]+$/g, "");
}
function scalar(raw) {
  const v = strip(raw);
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
    try {
      const out = JSON.parse(v);
      return typeof out === "string" ? out : v.slice(1, -1);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") return v.slice(1, -1).split("''").join("'");
  return v;
}
function parseFrontmatter(block2) {
  const out = {};
  const lines = block2.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    const m = FM_KEY.exec(line);
    if (!m) continue;
    const key = m[1];
    const raw = strip(m[2]);
    if (raw === "") {
      const items = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        items.push(scalar(LIST_ITEM.exec(lines[i])[1]));
        i += 1;
      }
      out[key] = items.length ? items : "";
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      out[key] = splitFlow(raw.slice(1, -1)).map(scalar);
    } else if (raw.startsWith("{") && raw.endsWith("}")) {
      const table = {};
      for (const p of splitFlow(raw.slice(1, -1))) {
        const at = p.indexOf(":");
        if (at >= 0) table[scalar(p.slice(0, at))] = scalar(p.slice(at + 1));
      }
      out[key] = table;
    } else out[key] = scalar(raw);
  }
  return out;
}
function fmStr(fm, key) {
  const v = fm[key];
  return typeof v === "string" ? v : "";
}
function fmList(fm, key) {
  const v = fm[key];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x !== "");
  if (typeof v === "string" && v !== "") return [v];
  return [];
}

// src/projection/render.ts
var LOCKED_MIN = ["implement", "design", "review"];
var LOCKED_NAMES = ["worker", "reviewer", "designer"];
var MODEL_HARNESSES = ["claude", "codex", "kiro"];
var CLAUDE_TOOLS = [["read", ["Read"]], ["search", ["Glob", "Grep"]], ["shell", ["Bash"]], ["write", ["Edit", "Write"]], ["web", ["WebFetch", "WebSearch"]]];
var KIRO_TOOLS = [["read", "read"], ["search", "read"], ["shell", "shell"], ["write", "write"], ["web", "web"]];
var KIRO_RESOURCES = ["file://AGENTS.md", "file://.agents/rules/guardrails.md", "skill://.agents/skills/**/SKILL.md"];
var EFFORT_KEY = { claude: "effort", codex: "model_reasoning_effort" };
var genMd = (source) => `<!-- harness-kit 생성 · 원본 ${source} · 고칠 때는 원본을 고친다 -->`;
var genToml = (source) => `# harness-kit 생성 · 원본 ${source} · 고칠 때는 원본을 고친다`;
function basename(p) {
  return p.slice(p.lastIndexOf("/") + 1);
}
function decode(data) {
  return data.toString("utf8");
}
function parsed(text2) {
  const { block: block2, body } = splitFrontmatter(text2);
  return { fm: block2 === null ? {} : parseFrontmatter(block2), body, hasBlock: block2 !== null };
}
function parseRule(source, data) {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const { fm, body } = parsed(decode(bytes));
  const paths = fmList(fm, "paths");
  return { name: basename(source).slice(0, -".md".length), source, data: bytes, paths: paths.length ? paths : null, body };
}
function parseSkill(source, files) {
  const list2 = Array.isArray(files) ? files : [...files].map(([rel2, f]) => ({ rel: rel2, bytes: f.bytes, executable: f.executable }));
  const data = list2.find((f) => f.rel === "SKILL.md")?.bytes ?? Buffer.alloc(0);
  const { fm, body } = parsed(decode(data));
  return { name: fmStr(fm, "name") || basename(source), source, files: list2, description: fmStr(fm, "description"), body, fm };
}
function parseRole(source, data) {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const { fm, body } = parsed(decode(bytes));
  const tools = fmList(fm, "tools");
  return {
    name: fmStr(fm, "name") || basename(source).slice(0, -".md".length),
    source,
    data: bytes,
    description: fmStr(fm, "description"),
    mode: fmStr(fm, "mode") === "write" ? "write" : "read-only",
    tools: tools.length ? tools : ["read"],
    fm,
    body
  };
}
function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function parsePolicy(text2) {
  let raw = null;
  try {
    raw = text2 === null ? null : JSON.parse(text2);
  } catch {
    raw = null;
  }
  if (!isObject(raw)) return { locked: [], classes: {}, tiers: {} };
  const locked = Array.isArray(raw.locked) ? raw.locked.filter((x) => typeof x === "string") : [];
  return { locked, classes: isObject(raw.classes) ? raw.classes : {}, tiers: isObject(raw.tiers) ? raw.tiers : {} };
}
function direct(fm, key) {
  const v = fm[key];
  if (!isObject(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string" && x !== ""));
}
function resolveModel(role, policy) {
  const cls = fmStr(role.fm, "class");
  const locked = /* @__PURE__ */ new Set([...policy.locked, ...LOCKED_MIN]);
  const hasModel = ["tier", "model", "effort"].some((k) => Object.hasOwn(role.fm, k));
  if (cls && locked.has(cls) || LOCKED_NAMES.includes(role.name)) {
    if (hasModel) return { ok: false, error: `잠긴 역할 '${role.name}' 에는 tier · model · effort 를 둘 수 없다(12 MR-R3)` };
    return { ok: true, locked: true, fields: { claude: { model: "inherit" }, codex: {}, kiro: {} } };
  }
  const fromClass = cls && typeof policy.classes[cls] === "string" ? policy.classes[cls] : "";
  const tier = fmStr(role.fm, "tier") || fromClass || "inherit";
  const model = direct(role.fm, "model");
  const effort = direct(role.fm, "effort");
  const fields = {};
  for (const h of MODEL_HARNESSES) {
    const tierSpec = tier !== "inherit" && isObject(policy.tiers[tier]) ? policy.tiers[tier][h] : void 0;
    let out = {};
    if (isObject(tierSpec)) out = Object.fromEntries(Object.entries(tierSpec).filter(([, v]) => typeof v === "string"));
    if (Object.hasOwn(model, h)) out.model = model[h];
    const ek = EFFORT_KEY[h];
    if (Object.hasOwn(effort, h) && ek) out[ek] = effort[h];
    if (h === "kiro") out = Object.fromEntries(Object.entries(out).filter(([k]) => k === "model"));
    if (h === "claude" && !Object.hasOwn(out, "model")) out = { model: "inherit", ...out };
    fields[h] = out;
  }
  return { ok: true, locked: false, fields };
}
function renderCursorRule(r) {
  const globs = r.paths ? r.paths.join(",") : "";
  return `---
description:
globs:${globs ? ` ${globs}` : ""}
alwaysApply: ${r.paths ? "false" : "true"}
---
${genMd(r.source)}
${r.body}`;
}
function renderKiroRule(r) {
  let head;
  if (r.paths) {
    const pattern = r.paths.length === 1 ? JSON.stringify(r.paths[0]) : `[${r.paths.map((p) => JSON.stringify(p)).join(", ")}]`;
    head = `---
inclusion: fileMatch
fileMatchPattern: ${pattern}
---
`;
  } else head = "---\ninclusion: always\n---\n";
  return `${head}${genMd(r.source)}
${r.body}`;
}
function renderCursorCommand(s) {
  return `---
description: ${s.description}
---
${genMd(`${s.source}/SKILL.md`)}
${s.body}`;
}
function renderKiroSkillSteering(s) {
  return `---
inclusion: manual
description: ${s.description}
---
${genMd(`${s.source}/SKILL.md`)}
${s.body}`;
}
function claudeTools(tools) {
  return CLAUDE_TOOLS.filter(([k]) => tools.includes(k)).flatMap(([, names]) => names);
}
function kiroTools(tools) {
  const out = [];
  for (const [k, name] of KIRO_TOOLS) if (tools.includes(k) && !out.includes(name)) out.push(name);
  return out;
}
function withNewline(text2) {
  return text2 === "" || text2.endsWith("\n") ? text2 : `${text2}
`;
}
function renderClaudeRole(r, fields) {
  const lines = ["---", `name: ${r.name}`, `description: ${r.description}`, `tools: ${claudeTools(r.tools).join(", ")}`];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
  lines.push("---", genMd(r.source));
  return `${lines.join("\n")}
${r.body}`;
}
function control(ch, keep) {
  const code = ch.codePointAt(0);
  if (keep.includes(ch)) return ch;
  if (code < 32 || code === 127) return `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
  return ch;
}
var TOML_SHORT = { "\b": "\\b", "	": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r", '"': '\\"', "\\": "\\\\" };
function tomlString(value) {
  let out = "";
  for (const ch of value) out += TOML_SHORT[ch] ?? control(ch, "");
  return `"${out}"`;
}
function tomlMultiline(value) {
  const escaped = value.split("\\").join("\\\\").split('"""').join('""\\"');
  let out = "";
  for (const ch of escaped) out += control(ch, "\n	");
  return out;
}
function renderCodexRole(r, fields, spec) {
  const lines = [genToml(r.source), `name = ${tomlString(r.name)}`, `description = ${tomlString(r.description)}`, `sandbox_mode = "${r.mode === "write" ? "workspace-write" : "read-only"}"`];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k} = ${tomlString(v)}`);
  lines.push("", 'developer_instructions = """');
  const instructions = (r.mode !== "write" ? `${spec.readOnlyLine}
` : "") + withNewline(r.body);
  return `${lines.join("\n")}
${tomlMultiline(instructions)}"""
`;
}
function renderKiroRole(r, fields, hooks) {
  const obj2 = {
    name: r.name,
    description: r.description,
    prompt: r.body,
    tools: kiroTools(r.tools),
    allowedTools: r.mode === "write" ? ["read", "write"] : ["read"],
    resources: [...KIRO_RESOURCES]
  };
  if (r.mode === "write" && Object.keys(hooks).length) obj2.hooks = hooks;
  Object.assign(obj2, fields);
  return `${JSON.stringify(obj2, null, 2)}
`;
}
function skillModelProblem(s) {
  return (Object.hasOwn(s.fm, "model") || Object.hasOwn(s.fm, "effort")) && fmStr(s.fm, "context") !== "fork";
}

// src/projection/merge.ts
var CLAUDE_BEGIN = "<!-- harness-kit:begin claude";
var CLAUDE_END = "<!-- harness-kit:end claude -->";
var GEN_BEGIN = "# harness-kit:begin generated";
var GEN_BEGIN_LINE = "# harness-kit:begin generated — .agents/ 원본에서 만든 파일이다. 고칠 때는 원본을 고친다";
var GEN_END = "# harness-kit:end generated";
var AGENTS_LINE = "@AGENTS.md";
var HARNESS_ORDER = ["claude", "codex", "cursor", "kiro"];
var TABLE_HEADER = /^\s*\[\[?\s*([^[\]]+?)\s*\]\]?\s*(?:#.*)?$/;
var MERGE_KIND = {
  "CLAUDE.md": "claude-md",
  ".claude/settings.json": "settings",
  ".codex/hooks.json": "codex-hooks",
  ".codex/config.toml": "codex-config",
  ".gitattributes": "gitattributes"
};
var fail = (reason) => ({ ok: false, reason });
var isBlank = (l) => l.trim() === "";
function splitLines(text2) {
  const lines = text2.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function joinLines(lines) {
  return lines.length ? `${lines.join("\n")}
` : "";
}
function stripTrailingBlank(lines) {
  const out = [...lines];
  while (out.length && isBlank(out[out.length - 1])) out.pop();
  return out;
}
function allBlank(lines, comments = false) {
  return lines.every((l) => isBlank(l) || comments && l.trimStart().startsWith("#"));
}
function findBlock(lines, begin, end) {
  const b = lines.findIndex((l) => l.startsWith(begin));
  if (b < 0) return null;
  let e = -1;
  for (let i = b + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === end) {
      e = i;
      break;
    }
  }
  return e < 0 ? "unclosed" : [b, e];
}
function appendBlock(lines, block2) {
  const out = [...lines];
  if (out.length && !isBlank(out[out.length - 1])) out.push("");
  return [...out, ...block2];
}
function claudeMdWant(spec) {
  return { block: [...spec.claudeBlock] };
}
var claudeMd = {
  merge(cur, want, prev = []) {
    const block2 = want.block;
    if (cur === null) return { ok: true, text: joinLines([AGENTS_LINE, "", ...block2]), keys: ["line:@AGENTS.md", "block:claude"], created: true };
    let lines = splitLines(cur);
    const found = findBlock(lines, CLAUDE_BEGIN, CLAUDE_END);
    if (found === "unclosed") return fail("CLAUDE.md 킷 블록의 끝 표지가 없다");
    const hasLine = lines.some((l) => l === AGENTS_LINE);
    const keys = [];
    if (found !== null) {
      const [b, e] = found;
      const insert = hasLine ? [] : [AGENTS_LINE, ""];
      lines = [...lines.slice(0, b), ...insert, ...block2, ...lines.slice(e + 1)];
      if (!hasLine || prev.includes("line:@AGENTS.md")) keys.push("line:@AGENTS.md");
    } else {
      if (!hasLine) {
        lines = appendBlock(lines, [AGENTS_LINE, ""]);
        keys.push("line:@AGENTS.md");
      } else if (prev.includes("line:@AGENTS.md")) keys.push("line:@AGENTS.md");
      lines = appendBlock(lines, block2);
    }
    keys.push("block:claude");
    return { ok: true, text: joinLines(lines), keys, created: false };
  },
  unmerge(cur, keys) {
    let lines = splitLines(cur);
    const found = findBlock(lines, CLAUDE_BEGIN, CLAUDE_END);
    if (found === "unclosed") return fail("CLAUDE.md 킷 블록의 끝 표지가 없다");
    if (found !== null && keys.includes("block:claude")) lines = [...lines.slice(0, found[0]), ...lines.slice(found[1] + 1)];
    if (keys.includes("line:@AGENTS.md") && lines.includes(AGENTS_LINE)) lines.splice(lines.indexOf(AGENTS_LINE), 1);
    lines = stripTrailingBlank(lines);
    return { ok: true, text: joinLines(lines), empty: allBlank(lines) };
  },
  missing(cur, keys) {
    const lines = splitLines(cur);
    const found = findBlock(lines, CLAUDE_BEGIN, CLAUDE_END);
    return keys.filter((k) => k === "line:@AGENTS.md" && !lines.includes(AGENTS_LINE) || k === "block:claude" && !Array.isArray(found));
  }
};
function gitattributesWant(spec, agents) {
  const patterns = HARNESS_ORDER.filter((h) => agents.includes(h)).flatMap((h) => spec.gitattributes[h] ?? []);
  return { lines: [GEN_BEGIN_LINE, ...patterns.map((p) => `${p} linguist-generated=true`), GEN_END] };
}
var gitattributes = {
  merge(cur, want) {
    const block2 = want.lines;
    if (cur === null) return { ok: true, text: joinLines(block2), keys: ["block:generated"], created: true };
    let lines = splitLines(cur);
    const found = findBlock(lines, GEN_BEGIN, GEN_END);
    if (found === "unclosed") return fail(".gitattributes 킷 블록의 끝 표지가 없다");
    lines = found === null ? appendBlock(lines, block2) : [...lines.slice(0, found[0]), ...block2, ...lines.slice(found[1] + 1)];
    return { ok: true, text: joinLines(lines), keys: ["block:generated"], created: false };
  },
  unmerge(cur) {
    let lines = splitLines(cur);
    const found = findBlock(lines, GEN_BEGIN, GEN_END);
    if (found === "unclosed") return fail(".gitattributes 킷 블록의 끝 표지가 없다");
    if (Array.isArray(found)) lines = [...lines.slice(0, found[0]), ...lines.slice(found[1] + 1)];
    lines = stripTrailingBlank(lines);
    return { ok: true, text: joinLines(lines), empty: allBlank(lines) };
  },
  missing(cur, keys) {
    const found = findBlock(splitLines(cur), GEN_BEGIN, GEN_END);
    return keys.filter((k) => k === "block:generated" && !Array.isArray(found));
  }
};
var sub = (value, tokens) => Object.entries(tokens).reduce((v, [k, x]) => x ? v.split(`{{kit:${k}}}`).join(x).split(`{{${k}}}`).join(x) : v, value);
function settingsWant(spec, tokens, hooks = [], suffixes = []) {
  return { deny: spec.claudeSettings.deny.map((d) => sub(d, tokens)), hooks: hooks.map((h) => ({ ...h })), suffixes: [...suffixes] };
}
function codexHooksWant(hooks = [], suffixes = []) {
  return { hooks: hooks.map((h) => ({ ...h })), suffixes: [...suffixes] };
}
var isObj3 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function commandOf(h) {
  return isObj3(h) && typeof h.command === "string" ? h.command : null;
}
function rstrip(s) {
  return s.replace(/\s+$/, "");
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function hasId(cmd, id) {
  return new RegExp(`(?:^|\\s)${escapeRe(id)}(?:\\s|$)`).test(cmd);
}
function scriptSuffixes(script) {
  return script ? [script, `_ ${script.slice(script.lastIndexOf("/") + 1)}`] : [];
}
function isKitHook(h, ids2, suffixes) {
  const cmd = commandOf(h);
  if (cmd === null) return false;
  const tail = rstrip(cmd);
  return ids2.some((i) => hasId(cmd, i)) || suffixes.some((s) => tail.endsWith(s));
}
function hookMatches(h, id, script) {
  const cmd = commandOf(h);
  if (cmd === null) return false;
  const tail = rstrip(cmd);
  return hasId(cmd, id) || scriptSuffixes(script).some((s) => tail.endsWith(s));
}
function stripHooks(arr, isKit) {
  const out = [];
  let first = null;
  for (const g of arr) {
    const items = isObj3(g) ? g.hooks : void 0;
    if (!Array.isArray(items)) {
      out.push(g);
      continue;
    }
    const kept = items.filter((h) => !isKit(h));
    if (kept.length === items.length) {
      out.push(g);
      continue;
    }
    if (kept.length) out.push({ ...g, hooks: kept });
    else if (first === null) first = out.length;
  }
  return { out, first };
}
function desiredGroups(hooks) {
  const out = /* @__PURE__ */ new Map();
  for (const h of hooks) {
    const groups = out.get(h.event) ?? [];
    out.set(h.event, groups);
    let group = groups.find((g) => g.matcher === h.matcher || g.matcher === void 0 && !h.matcher);
    if (!group) {
      group = h.matcher ? { matcher: h.matcher, hooks: [] } : { hooks: [] };
      groups.push(group);
    }
    group.hooks.push({ ...h.hook });
  }
  return out;
}
function dump(data) {
  return `${JSON.stringify(data, null, 2)}
`;
}
function parseObject(cur) {
  let data;
  try {
    data = JSON.parse(cur);
  } catch (err) {
    return `JSON 을 해석할 수 없다: ${err instanceof Error ? err.message : String(err)}`;
  }
  return isObj3(data) ? data : "최상위가 객체가 아니다";
}
var prevIds = (prev) => prev.filter((k) => k.startsWith("hooks.") && k.includes(":")).map((k) => k.slice(k.indexOf(":") + 1));
function mergeHooks(data, want, prev) {
  const hooks = data.hooks;
  if (hooks !== void 0 && !isObj3(hooks)) return "hooks 가 객체가 아니다";
  const ids2 = [...want.hooks.map((h) => h.id), ...prevIds(prev)];
  const suffixes = [...want.suffixes, ...want.hooks.flatMap((h) => scriptSuffixes(h.script))];
  const desired = desiredGroups(want.hooks);
  const src = hooks ?? {};
  const outHooks = {};
  const events = [...Object.keys(src), ...[...desired.keys()].filter((e) => !Object.hasOwn(src, e))];
  for (const event of events) {
    const arr = Object.hasOwn(src, event) ? src[event] : [];
    if (!Array.isArray(arr)) {
      if (desired.has(event)) return `hooks.${event} 가 배열이 아니다`;
      outHooks[event] = arr;
      continue;
    }
    const { out, first } = stripHooks(arr, (h) => isKitHook(h, ids2, suffixes));
    const groups = desired.get(event) ?? [];
    const at = first ?? out.length;
    const next = [...out.slice(0, at), ...groups, ...out.slice(at)];
    if (!next.length && arr.length) continue;
    outHooks[event] = next;
  }
  if (hooks !== void 0 || Object.keys(outHooks).length) data.hooks = outHooks;
  return null;
}
var hookKeys = (want) => want.hooks.map((h) => `hooks.${h.event}:${h.id}`);
function unmergeHooks(data, keys, want) {
  const byId2 = new Map(want.hooks.map((h) => [h.id, h.script]));
  const ids2 = prevIds(keys);
  const hooks = data.hooks;
  if (!isObj3(hooks)) return;
  const out = {};
  for (const [event, arr] of Object.entries(hooks)) {
    if (!Array.isArray(arr)) {
      out[event] = arr;
      continue;
    }
    const next = stripHooks(arr, (h) => ids2.some((i) => hookMatches(h, i, byId2.get(i)))).out;
    if (!next.length && arr.length) continue;
    out[event] = next;
  }
  if (Object.keys(out).length || !Object.keys(hooks).length) data.hooks = out;
  else delete data.hooks;
}
function missingHooks(data, keys, want) {
  const byId2 = new Map(want.hooks.map((h) => [h.id, h.script]));
  const hooks = isObj3(data.hooks) ? data.hooks : {};
  return keys.filter((k) => {
    if (!(k.startsWith("hooks.") && k.includes(":"))) return false;
    const rest = k.slice("hooks.".length);
    const event = rest.slice(0, rest.indexOf(":"));
    const id = rest.slice(rest.indexOf(":") + 1);
    const arr = hooks[event];
    const items = Array.isArray(arr) ? arr.flatMap((g) => isObj3(g) && Array.isArray(g.hooks) ? g.hooks : []) : [];
    return !items.some((h) => hookMatches(h, id, byId2.get(id)));
  });
}
var settings = {
  merge(cur, want, prev = []) {
    const parsed2 = cur === null ? {} : parseObject(cur);
    if (typeof parsed2 === "string") return fail(parsed2);
    const data = { ...parsed2 };
    const perms = data.permissions;
    if (perms !== void 0 && !isObj3(perms)) return fail("permissions 가 객체가 아니다");
    const deny = isObj3(perms) ? perms.deny : void 0;
    if (deny !== void 0 && !Array.isArray(deny)) return fail("permissions.deny 가 배열이 아니다");
    if (data.hooks !== void 0 && !isObj3(data.hooks)) return fail("hooks 가 객체가 아니다");
    const prevDeny = prev.filter((k) => k.startsWith("permissions.deny:")).map((k) => k.slice("permissions.deny:".length));
    const newDeny = (deny ?? []).filter((v) => !(typeof v === "string" && prevDeny.includes(v) && !want.deny.includes(v)));
    for (const v of want.deny) if (!newDeny.includes(v)) newDeny.push(v);
    if (deny !== void 0 || newDeny.length) data.permissions = { ...perms ?? {}, deny: newDeny };
    const error = mergeHooks(data, want, prev);
    if (error) return fail(error);
    const keys = [...want.deny.map((v) => `permissions.deny:${v}`), ...hookKeys(want)];
    return { ok: true, text: dump(data), keys, created: cur === null };
  },
  unmerge(cur, keys, want) {
    const parsed2 = parseObject(cur);
    if (typeof parsed2 === "string") return fail(parsed2);
    const data = { ...parsed2 };
    unmergeHooks(data, keys, want);
    const denyVals = keys.filter((k) => k.startsWith("permissions.deny:")).map((k) => k.slice("permissions.deny:".length));
    const perms = data.permissions;
    if (isObj3(perms) && Array.isArray(perms.deny)) {
      const deny = perms.deny;
      const kept = deny.filter((v) => !(typeof v === "string" && denyVals.includes(v)));
      const next = { ...perms };
      if (kept.length || !deny.length) next.deny = kept;
      else delete next.deny;
      if (Object.keys(next).length || !Object.keys(perms).length) data.permissions = next;
      else delete data.permissions;
    }
    return { ok: true, text: dump(data), empty: Object.keys(data).length === 0 };
  },
  missing(cur, keys, want) {
    const data = parseObject(cur);
    if (typeof data === "string") return [...keys];
    const deny = isObj3(data.permissions) ? data.permissions.deny : void 0;
    const hookMissing = new Set(missingHooks(data, keys, want));
    return keys.filter((k) => {
      if (k.startsWith("permissions.deny:")) return !Array.isArray(deny) || !deny.includes(k.slice("permissions.deny:".length));
      return hookMissing.has(k);
    });
  }
};
var codexHooks = {
  merge(cur, want, prev = []) {
    const parsed2 = cur === null ? {} : parseObject(cur);
    if (typeof parsed2 === "string") return fail(parsed2);
    const data = { ...parsed2 };
    const error = mergeHooks(data, want, prev);
    if (error) return fail(error);
    return { ok: true, text: dump(data), keys: hookKeys(want), created: cur === null };
  },
  unmerge(cur, keys, want) {
    const parsed2 = parseObject(cur);
    if (typeof parsed2 === "string") return fail(parsed2);
    const data = { ...parsed2 };
    unmergeHooks(data, keys, want);
    return { ok: true, text: dump(data), empty: Object.keys(data).length === 0 };
  },
  missing(cur, keys, want) {
    const data = parseObject(cur);
    if (typeof data === "string") return [...keys];
    return missingHooks(data, keys, want);
  }
};
function codexConfigWant(spec, roles, keep = []) {
  const cc = spec.codexConfig;
  const ordered = [...roles].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  return {
    header: [...cc.header],
    defaults: cc.defaults.map((d) => ({ ...d })),
    tables: cc.tables.map((t) => ({ ...t, lines: [...t.lines] })),
    roles: ordered.map((r) => ({ name: r.name, description: r.description })),
    keep: [...keep]
  };
}
function tables(lines) {
  const heads = [];
  lines.forEach((l, i) => {
    const m = TABLE_HEADER.exec(l);
    if (m) heads.push([i, m[1]]);
  });
  return heads.map(([i, name], n) => {
    const j = n + 1 < heads.length ? heads[n + 1][0] : lines.length;
    let last = i;
    for (let k = i + 1; k < j; k += 1) {
      const s = lines[k].trim();
      if (s && !s.startsWith("#")) last = k;
    }
    return [name, i, last + 1];
  });
}
function findTable(lines, name) {
  return tables(lines).find((t) => t[0] === name) ?? null;
}
function keyLine(lines, t, key) {
  const pat = new RegExp(`^\\s*(?:${escapeRe(key)}|"${escapeRe(key)}")\\s*=`);
  for (let k = t[1] + 1; k < t[2]; k += 1) if (pat.test(lines[k])) return k;
  return -1;
}
function removeTable(lines, t) {
  let start = t[1];
  while (start > 0 && isBlank(lines[start - 1])) start -= 1;
  return [...lines.slice(0, start), ...lines.slice(t[2])];
}
function roleTable(r) {
  return [`[agents.${r.name}]`, `description = ${tomlString(r.description)}`, `config_file = ${tomlString(`agents/${r.name}.toml`)}`];
}
function keyKinds(want) {
  return { defaults: new Set(want.defaults.map((d) => `toml:${d.table}.${d.key}`)), tableKeys: new Set(want.tables.map((t) => `toml:${t.table}`)) };
}
var codexConfig = {
  merge(cur, want, prev = []) {
    let lines = splitLines(cur === null ? joinLines(want.header) : cur);
    const keys = [];
    for (const d of want.defaults) {
      const key = `toml:${d.table}.${d.key}`;
      const t = findTable(lines, d.table);
      if (t === null) {
        lines = appendBlock(lines, [`[${d.table}]`, d.line]);
        keys.push(key);
      } else if (keyLine(lines, t, d.key) < 0) {
        lines = [...lines.slice(0, t[2]), d.line, ...lines.slice(t[2])];
        keys.push(key);
      } else if (prev.includes(key)) keys.push(key);
    }
    for (const tb of want.tables) {
      const key = `toml:${tb.table}`;
      if (findTable(lines, tb.table) === null) {
        lines = appendBlock(lines, [`[${tb.table}]`, ...tb.lines]);
        keys.push(key);
      } else if (prev.includes(key)) keys.push(key);
    }
    const { defaults, tableKeys } = keyKinds(want);
    const wanted2 = new Set(want.roles.map((r) => `toml:agents.${r.name}`));
    const keep = new Set(want.keep.map((n) => `toml:agents.${n}`));
    for (const k of prev) {
      if (k.startsWith("toml:agents.") && !defaults.has(k) && !tableKeys.has(k) && !wanted2.has(k) && !keep.has(k)) {
        const t = findTable(lines, k.slice("toml:".length));
        if (t !== null) lines = removeTable(lines, t);
      }
    }
    for (const k of [...keep].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
      if (prev.includes(k) && findTable(lines, k.slice("toml:".length)) !== null) keys.push(k);
    }
    for (const r of want.roles) {
      const block2 = roleTable(r);
      const t = findTable(lines, `agents.${r.name}`);
      lines = t === null ? appendBlock(lines, block2) : [...lines.slice(0, t[1]), ...block2, ...lines.slice(t[2])];
      keys.push(`toml:agents.${r.name}`);
    }
    return { ok: true, text: joinLines(lines), keys, created: cur === null };
  },
  unmerge(cur, keys, want) {
    let lines = splitLines(cur);
    const { defaults } = keyKinds(want);
    for (const k of keys) {
      const name = k.slice("toml:".length);
      if (defaults.has(k)) {
        const dot = name.lastIndexOf(".");
        const table = name.slice(0, dot);
        const key = name.slice(dot + 1);
        let t = findTable(lines, table);
        if (t === null) continue;
        const at = keyLine(lines, t, key);
        if (at >= 0) {
          lines = [...lines.slice(0, at), ...lines.slice(at + 1)];
          t = findTable(lines, table);
          if (t !== null && allBlank(lines.slice(t[1] + 1, t[2]), true)) lines = removeTable(lines, t);
        }
      } else {
        const t = findTable(lines, name);
        if (t !== null) lines = removeTable(lines, t);
      }
    }
    lines = stripTrailingBlank(lines);
    return { ok: true, text: joinLines(lines), empty: allBlank(lines, true) };
  },
  missing(cur, keys, want) {
    const lines = splitLines(cur);
    const { defaults } = keyKinds(want);
    return keys.filter((k) => {
      const name = k.slice("toml:".length);
      if (defaults.has(k)) {
        const dot = name.lastIndexOf(".");
        const t = findTable(lines, name.slice(0, dot));
        return t === null || keyLine(lines, t, name.slice(dot + 1)) < 0;
      }
      return findTable(lines, name) === null;
    });
  }
};
var MERGERS = {
  "claude-md": claudeMd,
  settings,
  "codex-hooks": codexHooks,
  "codex-config": codexConfig,
  gitattributes
};
function mergeWith(kind, cur, want, prev) {
  return MERGERS[kind].merge(cur, want, prev);
}
function unmergeWith(kind, cur, keys, want) {
  return MERGERS[kind].unmerge(cur, keys, want);
}
function missingWith(kind, cur, keys, want) {
  return MERGERS[kind].missing(cur, keys, want);
}

// src/projection/sources.ts
function ignoredName(name) {
  return name === ".DS_Store" || name.endsWith(".new") || name.endsWith(".bak") || name.startsWith(".") && name.includes(".hk-") || name === "__pycache__" || name.endsWith(".pyc");
}
function treeSha(files) {
  const sorted = [...files].sort((a, b) => byteCompare(a.rel, b.rel));
  return sha256(sorted.map((f) => `${f.rel}\0${sha256(f.bytes)}
`).join(""));
}
function walkView(view, rel2, prefix = "") {
  const out = [];
  for (const e of view.list(rel2) ?? []) {
    if (ignoredName(e.name)) continue;
    const sub2 = prefix ? `${prefix}/${e.name}` : e.name;
    const full11 = rel2 ? `${rel2}/${e.name}` : e.name;
    if (e.kind === "dir") out.push(...walkView(view, full11, sub2));
    else if (e.kind === "file") out.push({ rel: sub2, bytes: view.read(full11), executable: view.executable(full11) });
  }
  return out.sort((a, b) => byteCompare(a.rel, b.rel));
}
function hasPendingNew(view, rel2) {
  const k = view.kind(rel2);
  if (k === "file") return view.kind(`${rel2}.new`) !== "none";
  if (k !== "dir") return false;
  for (const e of view.list(rel2) ?? []) {
    const sub2 = `${rel2}/${e.name}`;
    if (e.kind === "file" && e.name.endsWith(".new")) return true;
    if (e.kind === "dir" && hasPendingNew(view, sub2)) return true;
  }
  return false;
}
function loadSources(view) {
  const src = { rules: [], skills: [], roles: [], policy: parsePolicy(null), deferred: /* @__PURE__ */ new Set(), hooksText: null, hooksData: Buffer.alloc(0), hookDocs: [], modules: [] };
  for (const e of view.list(".agents/rules") ?? []) {
    if (!e.name.endsWith(".md") || ignoredName(e.name) || e.kind !== "file") continue;
    const rel2 = `.agents/rules/${e.name}`;
    src.rules.push(parseRule(rel2, view.read(rel2)));
    if (hasPendingNew(view, rel2)) src.deferred.add(rel2);
  }
  for (const e of view.list(".agents/skills") ?? []) {
    const rel2 = `.agents/skills/${e.name}`;
    if (ignoredName(e.name) || e.name.startsWith(".") || e.kind !== "dir" || view.kind(`${rel2}/SKILL.md`) !== "file") continue;
    src.skills.push(parseSkill(rel2, walkView(view, rel2)));
    if (hasPendingNew(view, rel2)) src.deferred.add(rel2);
  }
  for (const e of view.list(".agents/roles") ?? []) {
    if (!e.name.endsWith(".md") || ignoredName(e.name) || e.kind !== "file") continue;
    const rel2 = `.agents/roles/${e.name}`;
    src.roles.push(parseRole(rel2, view.read(rel2)));
    if (hasPendingNew(view, rel2)) src.deferred.add(rel2);
  }
  const policy = view.read(".agents/model-policy.json");
  src.policy = parsePolicy(policy === null ? null : policy.toString("utf8"));
  if (view.kind(HOOKS_REL) === "file") {
    const data = view.read(HOOKS_REL);
    src.hooksText = data.toString("utf8");
    src.hooksData = Buffer.concat([Buffer.from(`${HOOKS_REL}\0`, "utf8"), data]);
    if (hasPendingNew(view, HOOKS_REL)) src.deferred.add(HOOKS_REL);
  }
  if (view.kind(HOOKS_DIR) === "dir") {
    for (const rel2 of hookDocPaths((view.list(HOOKS_DIR) ?? []).map((e) => e.name))) {
      if (view.kind(rel2) !== "file") continue;
      const data = view.read(rel2);
      src.hookDocs.push({ rel: rel2, text: data.toString("utf8") });
      src.hooksData = Buffer.concat([src.hooksData, Buffer.from(`
${rel2}\0`, "utf8"), data]);
      if (hasPendingNew(view, rel2)) src.deferred.add(HOOKS_REL);
    }
  }
  src.modules = metaModules(view.read(".agents/harness-kit.json"));
  return src;
}
function hooksBundleSha(view) {
  const src = loadSources(view);
  return src.hooksText === null ? null : sha256(src.hooksData);
}
function metaModules(raw) {
  if (raw === null) return [];
  try {
    const meta = JSON.parse(raw.toString("utf8"));
    const modules = meta !== null && typeof meta === "object" && !Array.isArray(meta) ? meta.modules : void 0;
    return Array.isArray(modules) ? modules.filter((m) => typeof m === "string") : [];
  } catch {
    return [];
  }
}

// src/adapters/wants.ts
function stem(source) {
  const base = source.slice(source.lastIndexOf("/") + 1);
  return base.endsWith(".md") ? base.slice(0, -".md".length) : base;
}
function mirrorDir(path57, harness, skill, deferred) {
  const t = treeSha(skill.files);
  return { op: "mirror", path: path57, harness, from: skill.source, kind: "dir", files: skill.files, data: Buffer.alloc(0), executable: false, sha256: t, fromSha256: t, deferred: deferred.has(skill.source) };
}
function mirrorFile(path57, harness, rule, view, deferred) {
  const s = sha256(rule.data);
  return { op: "mirror", path: path57, harness, from: rule.source, kind: "file", files: [], data: rule.data, executable: view.executable(rule.source), sha256: s, fromSha256: s, deferred: deferred.has(rule.source) };
}
function renderWant(path57, harness, from, text2, sourceData, deferred) {
  const data = Buffer.from(text2, "utf8");
  return { op: "render", path: path57, harness, from, kind: "file", files: [], data, executable: false, sha256: sha256(data), fromSha256: sha256(sourceData), deferred: deferred.has(from) };
}
function skillData(skill) {
  return skill.files.find((f) => f.rel === "SKILL.md")?.bytes ?? Buffer.alloc(0);
}
function withSkillFiles(deferred) {
  return /* @__PURE__ */ new Set([...deferred, ...[...deferred].map((d) => `${d}/SKILL.md`)]);
}

// src/adapters/claude.ts
var claude = {
  id: "claude",
  label: "Claude Code",
  checkedVersion: "미확인 — 릴리스 점검표(03 §5 #4, HK-22)에서 적는다",
  plan(ctx) {
    const d = ctx.sources.deferred;
    return [
      ...ctx.skills.map((s) => mirrorDir(`.claude/skills/${stem(s.source)}`, "claude", s, d)),
      ...ctx.rules.map((r) => mirrorFile(`.claude/rules/${stem(r.source)}.md`, "claude", r, ctx.view, d)),
      ...ctx.roles.map(({ role, fields }) => renderWant(`.claude/agents/${stem(role.source)}.md`, "claude", role.source, renderClaudeRole(role, fields.claude ?? {}), role.data, d)),
      { op: "merge", path: "CLAUDE.md", harness: "claude", kind: "claude-md", want: claudeMdWant(ctx.spec) },
      { op: "merge", path: ".claude/settings.json", harness: "claude", kind: "settings", want: settingsWant(ctx.spec, ctx.tokens, settingsHooks(ctx.hooks, "claude", ctx.spec.hookMap, ctx.sources.modules), kitScriptSuffixes(ctx.hooks, ctx.spec.hookMap)) }
    ];
  }
};

// src/adapters/codex.ts
var codex = {
  id: "codex",
  label: "Codex",
  checkedVersion: "미확인 — 릴리스 점검표(03 §5 #4, HK-22)에서 적는다",
  plan(ctx) {
    const d = ctx.sources.deferred;
    const live = ctx.roles.filter(({ role }) => !d.has(role.source)).map(({ role }) => ({ name: stem(role.source), description: role.description }));
    const keep = ctx.roles.filter(({ role }) => d.has(role.source)).map(({ role }) => stem(role.source));
    return [
      ...ctx.roles.map(({ role, fields }) => renderWant(`.codex/agents/${stem(role.source)}.toml`, "codex", role.source, renderCodexRole(role, fields.codex ?? {}, ctx.spec), role.data, d)),
      { op: "merge", path: ".codex/hooks.json", harness: "codex", kind: "codex-hooks", want: codexHooksWant(settingsHooks(ctx.hooks, "codex", ctx.spec.hookMap, ctx.sources.modules), kitScriptSuffixes(ctx.hooks, ctx.spec.hookMap)) },
      { op: "merge", path: ".codex/config.toml", harness: "codex", kind: "codex-config", want: codexConfigWant(ctx.spec, live, keep) }
    ];
  }
};

// src/adapters/cursor.ts
var cursor = {
  id: "cursor",
  label: "Cursor",
  checkedVersion: "미확인 — 릴리스 점검표(03 §5 #4, HK-22)에서 적는다",
  plan(ctx) {
    const d = ctx.sources.deferred;
    const ds = withSkillFiles(d);
    return [
      ...ctx.skills.map((s) => renderWant(`.cursor/commands/${stem(s.source)}.md`, "cursor", `${s.source}/SKILL.md`, renderCursorCommand(s), skillData(s), ds)),
      ...ctx.rules.map((r) => renderWant(`.cursor/rules/${stem(r.source)}.mdc`, "cursor", r.source, renderCursorRule(r), r.data, d))
    ];
  }
};

// src/adapters/kiro.ts
var kiro = {
  id: "kiro",
  label: "Kiro",
  checkedVersion: "미확인 — 릴리스 점검표(03 §5 #4, HK-22)에서 적는다",
  plan(ctx) {
    const d = ctx.sources.deferred;
    const ds = withSkillFiles(d);
    const map = ctx.spec.hookMap;
    const mods = ctx.sources.modules;
    const roleHooks = kiroCliHooks(ctx.hooks, map, mods, true);
    const hooksData = ctx.sources.hooksData;
    const slug = ctx.tokens.PROJECT_SLUG ?? "";
    return [
      ...ctx.skills.map((s) => mirrorDir(`.kiro/skills/${stem(s.source)}`, "kiro", s, d)),
      ...ctx.rules.map((r) => renderWant(`.kiro/steering/${stem(r.source)}.md`, "kiro", r.source, renderKiroRule(r), r.data, d)),
      ...ctx.skills.map((s) => renderWant(`.kiro/steering/${stem(s.source)}.md`, "kiro", `${s.source}/SKILL.md`, renderKiroSkillSteering(s), skillData(s), ds)),
      ...ctx.roles.map(({ role, fields }) => renderWant(`.kiro/agents/${stem(role.source)}.json`, "kiro", role.source, renderKiroRole(role, fields.kiro ?? {}, roleHooks), role.data, d)),
      ...kiroIdeFiles(ctx.hooks, map, mods).map((f) => renderWant(f.path, "kiro", HOOKS_REL, f.text, hooksData, d)),
      ...slug && ctx.hooksPresent ? [renderWant(`.kiro/agents/${slug}.json`, "kiro", HOOKS_REL, renderKiroCoordinator(ctx.spec, ctx.tokens, kiroCliHooks(ctx.hooks, map, mods)), hooksData, d)] : []
    ];
  }
};

// src/adapters/index.ts
var ADAPTERS = [claude, codex, cursor, kiro];

// src/core/remove.ts
var import_node_fs7 = __toESM(require("node:fs"));
var import_node_path4 = __toESM(require("node:path"));
function full(target, rel2) {
  return import_node_path4.default.join(target, ...rel2.split("/"));
}
function removeFile(target, rel2) {
  import_node_fs7.default.rmSync(full(target, rel2), { force: true });
}
function ancestorDirs(rels) {
  const dirs = /* @__PURE__ */ new Set();
  for (const rel2 of rels) {
    const parts = rel2.split("/");
    for (let i = parts.length - 1; i > 0; i -= 1) dirs.add(parts.slice(0, i).join("/"));
  }
  return [...dirs].sort((a, b) => b.split("/").length - a.split("/").length || byteCompare(a, b));
}
function removeEmptyDirs(target, rels) {
  let removed = 0;
  for (const dir of ancestorDirs(rels)) {
    const p = full(target, dir);
    try {
      if (!import_node_fs7.default.lstatSync(p).isDirectory()) continue;
      import_node_fs7.default.rmdirSync(p);
      removed += 1;
    } catch (err) {
      const code = err.code;
      if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST" && code !== "ENOTDIR") throw err;
    }
  }
  return removed;
}

// src/core/floor.ts
var GATE_FLOOR = ["requirements", "design", "mr", "done"];
var FLOOR_HOOKS = ["harness-protect-sources", "harness-block-full-verify", "harness-verify-gate", "harness-protect-approvals"];
function missingFloorGates(gates) {
  if (!Array.isArray(gates)) return [];
  return GATE_FLOOR.filter((g) => !gates.includes(g));
}

// src/projection/view.ts
var import_node_fs8 = __toESM(require("node:fs"));
var import_node_path5 = __toESM(require("node:path"));
function full2(root, rel2) {
  return rel2 === "" ? root : import_node_path5.default.join(root, ...rel2.split("/"));
}
function kindOf(st) {
  if (st.isSymbolicLink()) return "link";
  if (st.isDirectory()) return "dir";
  if (st.isFile()) return "file";
  return "other";
}
var FsView = class {
  constructor(root) {
    this.root = root;
  }
  root;
  kind(rel2) {
    try {
      return kindOf(import_node_fs8.default.lstatSync(full2(this.root, rel2)));
    } catch {
      return "none";
    }
  }
  list(rel2) {
    if (this.kind(rel2) !== "dir") return null;
    return import_node_fs8.default.readdirSync(full2(this.root, rel2)).sort(byteCompare).map((name) => ({ name, kind: this.kind(rel2 ? `${rel2}/${name}` : name) }));
  }
  read(rel2) {
    return this.kind(rel2) === "file" ? import_node_fs8.default.readFileSync(full2(this.root, rel2)) : null;
  }
  executable(rel2) {
    try {
      return (import_node_fs8.default.lstatSync(full2(this.root, rel2)).mode & 64) !== 0;
    } catch {
      return false;
    }
  }
};
var OverlayView = class {
  constructor(base, writes, deletes = /* @__PURE__ */ new Set()) {
    this.base = base;
    this.writes = writes;
    this.deletes = deletes;
    for (const rel2 of writes.keys()) {
      const parts = rel2.split("/");
      for (let i = 1; i < parts.length; i += 1) this.dirs.add(parts.slice(0, i).join("/"));
    }
  }
  base;
  writes;
  deletes;
  dirs = /* @__PURE__ */ new Set();
  kind(rel2) {
    if (this.writes.has(rel2)) return "file";
    if (this.dirs.has(rel2)) return "dir";
    if (this.deletes.has(rel2)) return "none";
    return this.base.kind(rel2);
  }
  list(rel2) {
    if (this.kind(rel2) !== "dir") return null;
    const names = /* @__PURE__ */ new Set();
    for (const e of this.base.list(rel2) ?? []) names.add(e.name);
    const prefix = rel2 ? `${rel2}/` : "";
    for (const w of [...this.writes.keys(), ...this.dirs]) {
      if (w.startsWith(prefix) && w.length > prefix.length) names.add(w.slice(prefix.length).split("/")[0]);
    }
    const out = [];
    for (const name of [...names].sort(byteCompare)) {
      const k = this.kind(`${prefix}${name}`);
      if (k !== "none") out.push({ name, kind: k });
    }
    return out;
  }
  read(rel2) {
    const w = this.writes.get(rel2);
    if (w) return w.content;
    if (this.deletes.has(rel2)) return null;
    return this.base.read(rel2);
  }
  executable(rel2) {
    const w = this.writes.get(rel2);
    if (w) return w.executable;
    return this.base.executable(rel2);
  }
};

// src/projection/engine.ts
var PROJECTION_OPS = /* @__PURE__ */ new Set(["mirror", "render", "merge"]);
var HARNESS_DIRS = [".claude/", ".codex/", ".cursor/", ".kiro/"];
var ALL_HARNESSES = ["claude", "codex", "cursor", "kiro"];
function buildContext(args) {
  const sources = loadSources(args.view);
  const findings = [];
  const skills = sources.skills.filter((s) => {
    if (!skillModelProblem(s)) return true;
    const kit = s.source.slice(s.source.lastIndexOf("/") + 1).startsWith("hx-");
    findings.push({ kind: "skill-model-field", severity: kit ? "error" : "warn", path: `${s.source}/SKILL.md`, hint: "context: fork 가 아닌 스킬에 model · effort 를 두지 않는다(그 턴의 사람 세션 모델이 바뀐다)" });
    return !kit;
  });
  const roles = [];
  for (const role of sources.roles) {
    const m = resolveModel(role, sources.policy);
    if (!m.ok) findings.push({ kind: "role-model-locked", severity: "error", path: role.source, hint: m.error });
    else roles.push({ role, fields: m.fields });
  }
  let parsed2 = null;
  try {
    if (sources.hooksText !== null) {
      const merged = mergeHookDocs([{ rel: HOOKS_REL, text: sources.hooksText }, ...sources.hookDocs], args.spec.hookMap, FLOOR_HOOKS);
      parsed2 = merged.hooks;
      findings.push(...merged.findings);
    }
  } catch (err) {
    if (err instanceof HooksError) throw new CliError(EXIT.STATE, err.message, "`.agents/hooks.json` 을 고치거나 harness-kit repair 로 킷 판을 되살린다");
    throw err;
  }
  if (parsed2 === null) findings.unshift({ kind: "hooks-missing", severity: "error", path: HOOKS_REL, hint: "훅 원본이 없어 하네스 훅을 만들지 않는다 — harness-kit repair 로 되살린다" });
  return { ...args, sources, skills, roles, rules: sources.rules, hooks: parsed2 ?? [], hooksPresent: parsed2 !== null, findings };
}
function wantedOps(ctx) {
  const wants = [];
  for (const a of ADAPTERS) if (ctx.agents.includes(a.id)) wants.push(...a.plan(ctx));
  wants.push({ op: "merge", path: ".gitattributes", harness: "core", kind: "gitattributes", want: gitattributesWant(ctx.spec, ctx.agents) });
  const seen = /* @__PURE__ */ new Set();
  for (const w of wants) {
    if (seen.has(w.path)) throw new CliError(EXIT.STATE, `배치 경로가 겹친다: ${w.path}`, "같은 이름의 규칙 · 스킬 원본 중 하나의 이름을 바꾼다");
    seen.add(w.path);
  }
  for (const w of wants) {
    if (w.op === "mirror" && w.kind === "dir" && wants.some((o) => o.path.startsWith(`${w.path}/`))) throw new CliError(EXIT.STATE, `배치 경로가 겹친다: ${w.path}`);
  }
  return wants;
}
function full3(target, rel2) {
  return import_node_path6.default.join(target, ...rel2.split("/"));
}
function lstat(p) {
  try {
    return import_node_fs9.default.lstatSync(p);
  } catch {
    return null;
  }
}
function blocked(target, rel2) {
  let cur = target;
  for (const part of rel2.split("/").slice(0, -1)) {
    cur = import_node_path6.default.join(cur, part);
    const st = lstat(cur);
    if (st && (st.isSymbolicLink() || !st.isDirectory())) return true;
  }
  return false;
}
function stateOf(target, rel2, isDir2) {
  if (blocked(target, rel2)) return { kind: "other", what: "상위 경로가 폴더가 아니다" };
  const st = lstat(full3(target, rel2));
  if (!st) return { kind: "none" };
  if (st.isSymbolicLink()) return { kind: "link" };
  if (isDir2) {
    if (!st.isDirectory()) return { kind: "other", what: "폴더 자리에 파일이 있다" };
    const files = walkView(new FsView(full3(target, rel2)), "");
    return { kind: "file", sha: treeSha(files), files: new Map(files.map((f) => [f.rel, f.bytes])) };
  }
  if (!st.isFile()) return { kind: "other", what: "같은 이름의 폴더가 있다" };
  const data = import_node_fs9.default.readFileSync(full3(target, rel2));
  return { kind: "file", sha: sha256(data), data };
}
function readTextAt(target, rel2) {
  const st = lstat(full3(target, rel2));
  return st?.isFile() ? import_node_fs9.default.readFileSync(full3(target, rel2), "utf8") : null;
}
var ownerKind = (owner) => owner === "kit" || owner === "user" ? owner : owner.startsWith("external:") ? "external" : owner.startsWith("pack:") ? "pack" : "unknown";
var shaOf = (e) => e && typeof e.sha256 === "string" ? e.sha256 : null;
var keysOf = (e) => e && Array.isArray(e.keys) ? e.keys : void 0;
function kitEntry(w, sha = w.sha256) {
  return { path: w.path, op: w.op, owner: "kit", sha256: sha, from: w.from, fromSha256: w.fromSha256 };
}
function mergeEntry(path_, keys, created) {
  return created ? { path: path_, op: "merge", owner: "kit", keys, createdByKit: true } : { path: path_, op: "merge", owner: "kit", keys };
}
var userEntry = (p, op) => ({ path: p, op, owner: "user", sha256: null });
function fullMergeWant(kind, spec, tokens, sources) {
  if (kind === "claude-md") return claudeMdWant(spec);
  if (kind === "settings" || kind === "codex-hooks") {
    let hooks = [];
    try {
      hooks = sources?.hooksText != null ? mergeHookDocs([{ rel: HOOKS_REL, text: sources.hooksText }, ...sources.hookDocs], spec.hookMap, FLOOR_HOOKS).hooks : [];
    } catch {
      hooks = [];
    }
    const modules = hooks.flatMap((h) => h.module ? [h.module] : []);
    const suffixes = kitScriptSuffixes(hooks, spec.hookMap);
    if (kind === "settings") return settingsWant(spec, tokens, settingsHooks(hooks, "claude", spec.hookMap, modules), suffixes);
    return codexHooksWant(settingsHooks(hooks, "codex", spec.hookMap, modules), suffixes);
  }
  if (kind === "codex-config") return codexConfigWant(spec, (sources?.roles ?? []).map((r) => ({ name: r.source.slice(r.source.lastIndexOf("/") + 1, -".md".length), description: r.description })));
  return gitattributesWant(spec, ALL_HARNESSES);
}
function differing(w, cur) {
  const have = cur.kind === "file" ? cur.files ?? /* @__PURE__ */ new Map() : /* @__PURE__ */ new Map();
  return w.files.filter((f) => !have.get(f.rel)?.equals(f.bytes)).map((f) => f.rel);
}
function extraFiles(w, cur) {
  const wanted2 = new Set(w.files.map((f) => f.rel));
  return cur.kind === "file" && cur.files ? [...cur.files.keys()].filter((rel2) => !wanted2.has(rel2)) : [];
}
var Engine = class {
  constructor(target, spec, tokens, sources) {
    this.target = target;
    this.spec = spec;
    this.tokens = tokens;
    this.sources = sources;
  }
  target;
  spec;
  tokens;
  sources;
  ops = [];
  entries = [];
  emit(op, entry) {
    this.ops.push(op);
    if (entry) this.entries.push(entry);
  }
  merge(w, prev, claimed) {
    let cur = readTextAt(this.target, w.path);
    const exists = lstat(full3(this.target, w.path)) !== null;
    if (cur === null && exists) {
      this.emit({ path: w.path, op: "merge", harness: w.harness, action: "conflict", reason: "일반 파일이 아니다" }, prev);
      return;
    }
    const v1 = claimed.find((c) => c.path === w.path);
    let created = prev?.createdByKit === true;
    if (v1 && cur !== null) {
      const unmodified = shaOf(v1) !== null && sha256(cur) === shaOf(v1);
      if (w.kind === "claude-md") {
        const hasBlock = cur.split("\n").some((l) => l.startsWith("<!-- harness-kit:begin claude"));
        if (unmodified) {
          cur = null;
          created = true;
        } else if (!hasBlock) {
          const fresh = mergeWith(w.kind, null, w.want);
          const neu = `${w.path}.new`;
          this.emit({ path: w.path, op: "merge", harness: w.harness, action: "conflict", reason: "v1 CLAUDE.md 를 사람이 고쳤다", newFiles: [neu], effect: { extra: fresh.ok ? [{ path: neu, data: Buffer.from(fresh.text, "utf8") }] : [] } }, v1);
          return;
        }
      } else created = unmodified;
    }
    const r = mergeWith(w.kind, cur, w.want, keysOf(prev));
    if (!r.ok) {
      this.emit({ path: w.path, op: "merge", harness: w.harness, action: "conflict", reason: r.reason }, prev ?? { path: w.path, op: "merge", owner: "kit", keys: [] });
      return;
    }
    created = created || r.created;
    const action = cur === null && !exists ? "create" : cur === r.text ? "same" : "merge";
    this.emit({ path: w.path, op: "merge", harness: w.harness, action, ...action !== "same" ? { effect: { text: r.text } } : {} }, mergeEntry(w.path, r.keys, created));
  }
  install(w, prev, force) {
    if (w.op === "merge") {
      this.merge(w, prev, []);
      return;
    }
    if (w.deferred) {
      this.emit({ path: w.path, op: w.op, harness: w.harness, action: "defer", reason: "원본이 .new 대기 중이다" }, prev);
      return;
    }
    const cur = stateOf(this.target, w.path, w.kind === "dir");
    const base = { path: w.path, op: w.op, harness: w.harness };
    if (cur.kind === "none") this.emit({ ...base, action: "create", effect: { write: w } }, kitEntry(w));
    else if (cur.kind !== "file") this.emit({ ...base, action: "skip-user", reason: cur.kind === "other" ? cur.what : "링크다" }, prev ?? userEntry(w.path, w.op));
    else if (cur.sha === w.sha256) this.emit({ ...base, action: "same" }, kitEntry(w));
    else if (prev && ownerKind(prev.owner) === "kit") this.emit({ ...base, action: "keep" }, prev);
    else if (force) this.emit({ ...base, action: "replace", effect: { write: w } }, kitEntry(w));
    else this.emit({ ...base, action: "skip-user", reason: "사람이 둔 파일이다" }, userEntry(w.path, w.op));
  }
  unmodifiedClaimed(w, cur, claimed) {
    if (cur.kind !== "file") return false;
    if (w.kind !== "dir") {
      const c = claimed.find((x) => x.path === w.path);
      return c !== void 0 && shaOf(c) !== null && cur.sha === shaOf(c);
    }
    const shas = new Map(claimed.filter((c) => c.path.startsWith(`${w.path}/`)).map((c) => [c.path.slice(w.path.length + 1), shaOf(c)]));
    const files = cur.files ?? /* @__PURE__ */ new Map();
    return shas.size > 0 && [...files].every(([rel2, data]) => shas.has(rel2) && shas.get(rel2) !== null && sha256(data) === shas.get(rel2));
  }
  update(w, prev, claimed, acceptAll) {
    if (w.op === "merge") {
      this.merge(w, prev, claimed);
      return;
    }
    const base = { path: w.path, op: w.op, harness: w.harness };
    if (w.deferred) {
      this.emit({ ...base, action: "defer", reason: "원본이 .new 대기 중이다" }, prev);
      this.entries.push(...claimed);
      return;
    }
    if (prev && ownerKind(prev.owner) !== "kit") {
      const k = ownerKind(prev.owner);
      this.emit({ ...base, action: k === "external" ? "skip-external" : k === "pack" ? "skip-pack" : "skip-user" }, prev);
      return;
    }
    const cur = stateOf(this.target, w.path, w.kind === "dir");
    const tracked = prev !== void 0 || claimed.length > 0;
    if (cur.kind === "link") return this.write(w, "replace", "symlink-found");
    if (cur.kind === "other") {
      this.emit({ ...base, action: "skip-user", reason: cur.what }, prev ?? userEntry(w.path, w.op));
      return;
    }
    if (!tracked) {
      if (cur.kind === "none") return this.write(w, "new");
      if (cur.sha === w.sha256) this.emit({ ...base, action: "same" }, kitEntry(w));
      else this.emit({ ...base, action: "skip-user", reason: "사람이 둔 파일이다" }, userEntry(w.path, w.op));
      return;
    }
    if (cur.kind === "none") return this.write(w, "restore");
    if (cur.sha === w.sha256) {
      this.emit({ ...base, action: "same" }, kitEntry(w));
      return;
    }
    const unmodified = prev ? shaOf(prev) !== null && cur.sha === shaOf(prev) : this.unmodifiedClaimed(w, cur, claimed);
    if (unmodified) return this.write(w, "update");
    const baseSha = prev ? shaOf(prev) : w.kind !== "dir" ? shaOf(claimed.find((c) => c.path === w.path)) : null;
    if (acceptAll) {
      const have = cur.files ?? /* @__PURE__ */ new Map();
      const backups = w.kind !== "dir" ? [`${w.path}.bak`] : [...differing(w, cur), ...extraFiles(w, cur)].filter((rel2) => have.has(rel2)).map((rel2) => `${w.path}/${rel2}.bak`);
      this.write(w, "replace", void 0, backups);
      return;
    }
    const newFiles = w.kind !== "dir" ? [`${w.path}.new`] : differing(w, cur).map((rel2) => `${w.path}/${rel2}.new`);
    const data = new Map(w.files.map((f) => [f.rel, f.bytes]));
    const extra = w.kind !== "dir" ? [{ path: `${w.path}.new`, data: w.data }] : newFiles.map((n) => ({ path: n, data: data.get(n.slice(w.path.length + 1, -".new".length)) }));
    this.emit({ ...base, action: "conflict", reason: "복사본 · 생성물을 직접 고쳤다 — 원본을 고친다", newFiles, effect: { extra } }, kitEntry(w, baseSha));
  }
  write(w, action, reason, backups = []) {
    const renames = backups.map((b) => [b.slice(0, -".bak".length), b]);
    this.emit({ path: w.path, op: w.op, harness: w.harness, action, ...reason ? { reason } : {}, ...backups.length ? { backups } : {}, effect: { renames, write: w } }, kitEntry(w));
  }
  /** 원하지 않게 된 배치 항목 · retire. merge 는 킷 키를 뺀다(design §6.3 · §6.5). */
  drop(e, why = "") {
    if (ownerKind(e.owner) !== "kit") {
      this.entries.push(e);
      return;
    }
    if (e.op === "merge") {
      const kind = MERGE_KIND[e.path];
      const cur2 = readTextAt(this.target, e.path);
      if (!kind || cur2 === null) {
        this.ops.push({ path: e.path, op: "merge", harness: "", action: cur2 === null ? "delete" : "keep-modified", ...why ? { reason: why } : {} });
        return;
      }
      const want = fullMergeWant(kind, this.spec, this.tokens, this.sources);
      const keys = keysOf(e) ?? (() => {
        const fresh = mergeWith(kind, null, want);
        return fresh.ok ? fresh.keys : [];
      })();
      const r = unmergeWith(kind, cur2, keys, want);
      if (!r.ok) {
        this.emit({ path: e.path, op: "merge", harness: "", action: "conflict", reason: r.reason }, e);
        return;
      }
      if (r.empty && e.createdByKit === true) this.ops.push({ path: e.path, op: "merge", harness: "", action: "delete", effect: { remove: { dir: false } } });
      else this.ops.push({ path: e.path, op: "merge", harness: "", action: "unmerge", ...r.text !== cur2 ? { effect: { text: r.text } } : {} });
      return;
    }
    const st = lstat(full3(this.target, e.path));
    const isDir2 = Boolean(st?.isDirectory() && !st.isSymbolicLink());
    const cur = stateOf(this.target, e.path, isDir2);
    const action = e.op === "copy" ? "retire" : "delete";
    if (cur.kind === "none") {
      this.ops.push({ path: e.path, op: e.op, harness: "", action, reason: "파일이 이미 없다" });
      return;
    }
    if (cur.kind === "file" && shaOf(e) !== null && cur.sha === shaOf(e)) {
      this.ops.push({ path: e.path, op: e.op, harness: "", action, ...why ? { reason: why } : {}, effect: { remove: { dir: isDir2 } } });
      return;
    }
    const kept = { path: e.path, op: e.op, owner: "user", sha256: null, ...e.layer ? { layer: e.layer } : {} };
    this.emit({ path: e.path, op: e.op, harness: "", action: "keep-modified", reason: "사람이 고친 파일이다 — 지우지 않았다" }, kept);
  }
};
function claims(w, p) {
  return p === w.path || w.op === "mirror" && w.kind === "dir" && p.startsWith(`${w.path}/`);
}
function replacementDeferred(p, wants) {
  if (p.startsWith(".claude/commands/") && p.endsWith(".md")) {
    const w = wants.get(`.claude/skills/${p.slice(".claude/commands/".length, -".md".length)}`);
    return Boolean(w && w.op !== "merge" && w.deferred);
  }
  return false;
}
var sortWants = (wants) => [...wants].sort((a, b) => byteCompare(a.path, b.path));
function judgeInstall(args) {
  const engine = new Engine(args.target, args.spec, args.tokens, args.sources);
  const byPath = new Map(args.prev.filter((e) => PROJECTION_OPS.has(e.op)).map((e) => [e.path, e]));
  for (const w of sortWants(args.wants)) engine.install(w, byPath.get(w.path), args.force);
  return { ops: engine.ops, entries: engine.entries, claimed: /* @__PURE__ */ new Set() };
}
function judgeUpdate(args) {
  const engine = new Engine(args.target, args.spec, args.tokens, args.sources);
  const wants = new Map(args.wants.map((w) => [w.path, w]));
  const projection = new Map(args.prev.filter((e) => PROJECTION_OPS.has(e.op)).map((e) => [e.path, e]));
  const orphans = args.prev.filter((e) => e.op === "copy" && ownerKind(e.owner) === "kit" && !args.copyNow.has(e.path));
  const claimedBy = /* @__PURE__ */ new Map();
  const rest = [];
  for (const e of orphans) {
    const w = args.wants.find((x) => claims(x, e.path));
    if (w) claimedBy.set(w.path, [...claimedBy.get(w.path) ?? [], e]);
    else rest.push(e);
  }
  const claimed = new Set([...claimedBy.values()].flat().map((e) => e.path));
  for (const w of sortWants(args.wants)) engine.update(w, projection.get(w.path), claimedBy.get(w.path) ?? [], args.acceptAll);
  for (const p of [...projection.keys()].filter((x) => !wants.has(x)).sort(byteCompare)) engine.drop(projection.get(p), "원본이 없다");
  if (args.retire) {
    for (const e of rest.sort((a, b) => byteCompare(a.path, b.path))) {
      if (!HARNESS_DIRS.some((d) => e.path.startsWith(d))) continue;
      claimed.add(e.path);
      if (replacementDeferred(e.path, wants)) {
        engine.ops.push({ path: e.path, op: "copy", harness: "", action: "defer", reason: "바꿀 스킬 원본이 .new 대기 중이다" });
        engine.entries.push(e);
        continue;
      }
      engine.drop(e, "v1 포인터 — 복사본 · 생성물로 바뀌었다");
    }
  }
  return { ops: engine.ops, entries: engine.entries, claimed };
}
function removeEmptySubdirs(dir) {
  const st = lstat(dir);
  if (!st?.isDirectory()) return;
  for (const name of import_node_fs9.default.readdirSync(dir)) {
    const p = import_node_path6.default.join(dir, name);
    const s = lstat(p);
    if (s?.isDirectory() && !s.isSymbolicLink()) {
      removeEmptySubdirs(p);
      if (import_node_fs9.default.readdirSync(p).length === 0) import_node_fs9.default.rmdirSync(p);
    }
  }
}
function sameFile(p, data, executable) {
  const st = lstat(p);
  return Boolean(st?.isFile() && (st.mode & 64) !== 0 === executable && import_node_fs9.default.readFileSync(p).equals(data));
}
function writeWant(target, w) {
  const p = full3(target, w.path);
  const st = lstat(p);
  if (st?.isSymbolicLink()) import_node_fs9.default.unlinkSync(p);
  if (w.kind !== "dir") {
    writeFileAtomic(p, w.data, w.executable);
    return;
  }
  if (st && !st.isSymbolicLink() && !st.isDirectory()) import_node_fs9.default.unlinkSync(p);
  const wanted2 = new Set(w.files.map((f) => f.rel));
  for (const f of walkView(new FsView(p), "")) if (!wanted2.has(f.rel)) import_node_fs9.default.unlinkSync(import_node_path6.default.join(p, ...f.rel.split("/")));
  for (const f of w.files) {
    const q2 = import_node_path6.default.join(p, ...f.rel.split("/"));
    if (!sameFile(q2, f.bytes, f.executable)) writeFileAtomic(q2, f.bytes, f.executable);
  }
  removeEmptySubdirs(p);
}
function removeTarget(target, rel2, dir) {
  const p = full3(target, rel2);
  const st = lstat(p);
  if (dir && st?.isDirectory() && !st.isSymbolicLink()) {
    const files = walkView(new FsView(p), "").map((f) => `${rel2}/${f.rel}`);
    for (const f of files) import_node_fs9.default.unlinkSync(full3(target, f));
    removeEmptySubdirs(p);
    removeEmptyDirs(target, [...files, `${rel2}/x`]);
    return;
  }
  if (st && (st.isFile() || st.isSymbolicLink())) import_node_fs9.default.unlinkSync(p);
  removeEmptyDirs(target, [rel2]);
}
function applyProjection(target, ops) {
  for (const o of ops) {
    const e = o.effect;
    if (!e) continue;
    for (const [from, to] of e.renames ?? []) import_node_fs9.default.renameSync(full3(target, from), full3(target, to));
    if (e.write) writeWant(target, e.write);
    if (e.text !== void 0) writeFileAtomic(full3(target, o.path), Buffer.from(e.text, "utf8"), false);
    for (const x of e.extra ?? []) writeFileAtomic(full3(target, x.path), x.data, false);
    if (e.remove) removeTarget(target, o.path, e.remove.dir);
  }
}
function projOpJson(o) {
  const j = { path: o.path, op: o.op, action: o.action };
  if (o.harness) j.harness = o.harness;
  if (o.reason) j.reason = o.reason;
  if (o.newFiles?.length) j.new = o.newFiles.length === 1 ? o.newFiles[0] : o.newFiles;
  if (o.backups?.length) j.backups = o.backups;
  return j;
}
var QUIET_ACTIONS = /* @__PURE__ */ new Set(["same", "keep"]);
var ATTENTION_ACTIONS = /* @__PURE__ */ new Set(["conflict", "keep-modified"]);
function projCounts(ops) {
  const out = {};
  for (const o of ops) out[o.action] = (out[o.action] ?? 0) + 1;
  return out;
}
function projLine(o) {
  const extra = [...(o.newFiles ?? []).map((n) => `  → ${n}`), ...(o.backups ?? []).map((b) => `  (수정본 → ${b})`)].join("");
  return `  ${o.action.padEnd(13)} ${o.path}${extra}${o.reason ? `  ${o.reason}` : ""}`;
}
function projSummary(ops) {
  const c = projCounts(ops);
  const shown = Object.entries(c).filter(([a]) => !QUIET_ACTIONS.has(a)).map(([a, n]) => `${a} ${n}`).join(" · ");
  return `  배치: ${shown || "바꿀 것 없음"}${c.same ? ` (같음 ${c.same})` : ""}`;
}

// src/core/shell.ts
function shellQuote(s) {
  return /^[A-Za-z0-9_./@%+=:,-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

// src/projection/flow.ts
function prepare(args) {
  const base = new FsView(args.target);
  const view = args.writes || args.deletes ? new OverlayView(base, args.writes ?? /* @__PURE__ */ new Map(), args.deletes ?? /* @__PURE__ */ new Set()) : base;
  const ctx = buildContext({ view, spec: args.spec, tokens: args.tokens, agents: args.agents });
  const wants = wantedOps(ctx);
  if (args.copyPaths) assertNoCopyOverlap(wants, args.copyPaths);
  return { spec: args.spec, wants, sources: ctx.sources, findings: ctx.findings };
}
function assertNoCopyOverlap(wants, copyPaths) {
  const copies = [...copyPaths];
  for (const w of wants) {
    const hit = copies.find((p) => p === w.path || w.op === "mirror" && w.kind === "dir" && p.startsWith(`${w.path}/`));
    if (hit) throw new CliError(EXIT.STATE, `템플릿 copy 경로와 배치 경로가 겹친다: ${hit}`, "템플릿에서 그 하네스 파일을 지운다(하네스 파일은 .agents/ 원본에서 만든다)");
  }
}
function needsHuman(plan, findings) {
  return Boolean(plan?.ops.some((o) => ATTENTION_ACTIONS.has(o.action))) || findings.some((f) => f.severity === "error");
}
function projectionConflicts(plan) {
  if (!plan) return [];
  return plan.ops.filter((o) => o.action === "conflict").map((o) => {
    const neu = o.newFiles?.[0] ?? null;
    return { path: o.path, new: neu, diff: neu ? `diff -u ${shellQuote(o.path)} ${shellQuote(neu)}` : null };
  });
}
function projectionData(plan, findings, all = false) {
  if (!plan) return null;
  return {
    counts: projCounts(plan.ops),
    ops: plan.ops.filter((o) => all || !QUIET_ACTIONS.has(o.action)).map(projOpJson),
    findings
  };
}
function projectionLines(plan, findings, quiet, all = false, hide = /* @__PURE__ */ new Set()) {
  if (!plan) return [];
  const shown = plan.ops.filter((o) => (all || !QUIET_ACTIONS.has(o.action) && !hide.has(o.action)) && (!quiet || ATTENTION_ACTIONS.has(o.action)));
  return [
    ...findings.map((f) => `  ${f.severity === "error" ? "✖" : "⚠"} ${f.kind.padEnd(16)} ${f.path} — ${f.hint}`),
    ...shown.map(projLine),
    projSummary(plan.ops)
  ];
}
function mergeEntries(copyEntries, plan) {
  if (!plan) return copyEntries;
  const owned = /* @__PURE__ */ new Set([...plan.claimed, ...plan.entries.map((e) => e.path), ...plan.ops.map((o) => o.path)]);
  return [...copyEntries.filter((e) => !owned.has(e.path) && !PROJECTION_OPS.has(e.op)), ...plan.entries];
}

// src/projection/spec.ts
var import_node_fs10 = __toESM(require("node:fs"));
var import_node_path7 = __toESM(require("node:path"));
var SPEC_REL = "common/scripts/harness/projection.json";
var SPEC_SCHEMA = "harness-kit.projection/v1";
var FORBIDDEN_CLAUDE = /* @__PURE__ */ new Set(["model", "effortLevel", "modelSettings", "maxEffortLevel", "fallbackModel", "availableModels", "advisorModel"]);
var FORBIDDEN_ENV2 = /* @__PURE__ */ new Set(["ANTHROPIC_MODEL", "CLAUDE_CODE_EFFORT_LEVEL", "MAX_THINKING_TOKENS", "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "CLAUDE_CODE_SUBAGENT_EFFORT"]);
var FORBIDDEN_CODEX = /* @__PURE__ */ new Set(["model", "model_reasoning_effort", "model_reasoning_summary", "model_verbosity", "model_provider", "profile", "profiles", "default_subagent_model", "default_subagent_reasoning_effort"]);
function bad2(message2) {
  return new CliError(EXIT.ENV, `projection.json: ${message2}`, "킷 템플릿을 다시 받는다");
}
function walk(v, at) {
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${at}[${i}]`));
    return;
  }
  if (v === null || typeof v !== "object") return;
  for (const [k, x] of Object.entries(v)) {
    if (FORBIDDEN_CLAUDE.has(k) && !at.endsWith(".hook")) throw bad2(`${at}.${k}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)`);
    if (at.endsWith(".env") && (FORBIDDEN_ENV2.has(k) || k.startsWith("ANTHROPIC_DEFAULT_") && k.endsWith("_MODEL"))) throw bad2(`${at}.${k}: 사람 세션의 모델 환경변수를 쓰지 않는다(12 §3.1)`);
    walk(x, `${at}.${k}`);
  }
}
function parseSpec(text2) {
  let raw;
  try {
    raw = JSON.parse(text2);
  } catch (err) {
    throw bad2(err instanceof Error ? err.message : String(err));
  }
  if (raw.schema !== SPEC_SCHEMA) throw bad2(`모르는 schema ${String(raw.schema)}`);
  const cs = raw.claudeSettings ?? {};
  walk(Object.fromEntries(Object.entries(cs).filter(([k]) => k !== "hooks")), "claudeSettings");
  const cc = raw.codexConfig ?? {};
  for (const d of cc.defaults ?? []) {
    if (FORBIDDEN_CODEX.has(d.key) || FORBIDDEN_CODEX.has(d.table)) throw bad2(`codexConfig ${d.table}.${d.key}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)`);
  }
  for (const t of cc.tables ?? []) {
    const names = [t.table, ...(t.lines ?? []).filter((l) => l.includes("=")).map((l) => l.slice(0, l.indexOf("=")).trim())];
    if (names.some((n) => FORBIDDEN_CODEX.has(n) || n.startsWith("profiles"))) throw bad2(`codexConfig ${t.table}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)`);
  }
  return raw;
}
function loadSpecOrNull(templatesDir) {
  const file = import_node_path7.default.join(templatesDir, ...SPEC_REL.split("/"));
  if (!import_node_fs10.default.existsSync(file)) return null;
  return parseSpec(import_node_fs10.default.readFileSync(file, "utf8"));
}
function loadSpec(templatesDir) {
  const spec = loadSpecOrNull(templatesDir);
  if (!spec) throw bad2(`없다: ${import_node_path7.default.join(templatesDir, SPEC_REL)}`);
  return spec;
}

// src/core/tokens.ts
function resolveTokens(layout2, sel, src) {
  const spec = stackSpecOf(layout2, sel.stack);
  const stackDefaults = { ...spec.tokens, ...sel.lang && spec.lang ? spec.lang[sel.lang] : {} };
  const done = /* @__PURE__ */ new Map();
  const resolving = /* @__PURE__ */ new Set();
  const valueFor = (key) => {
    const known = done.get(key);
    if (known !== void 0) return known;
    if (resolving.has(key)) return "";
    resolving.add(key);
    let v = src.flags[key] || void 0;
    if (v === void 0) v = src.env[key] || void 0;
    if (v === void 0) v = stackDefaults[key] || void 0;
    if (v === void 0 && layout2.tokenDefaults[key] !== void 0) {
      v = layout2.tokenDefaults[key].replace(
        /\{([A-Za-z_]+)\}/g,
        (_m, name) => name === "targetBasename" ? src.targetBasename : valueFor(name)
      );
    }
    resolving.delete(key);
    const out = v ?? "";
    done.set(key, out);
    return out;
  };
  return Object.fromEntries(layout2.tokens.map((k) => [k, valueFor(k)]));
}
function replaceAllBytes(buf, needle, value) {
  let at = buf.indexOf(needle);
  if (at < 0) return buf;
  const parts = [];
  let from = 0;
  while (at >= 0) {
    parts.push(buf.subarray(from, at), value);
    from = at + needle.length;
    at = buf.indexOf(needle, from);
  }
  parts.push(buf.subarray(from));
  return Buffer.concat(parts);
}
function substitute2(content, tokens, order) {
  if (content.includes(0)) return content;
  let out = content;
  for (const key of order) {
    const value = tokens[key] ?? "";
    if (value === "") continue;
    out = replaceAllBytes(out, Buffer.from(`{{${key}}}`, "utf8"), Buffer.from(value, "utf8"));
  }
  return out;
}

// src/core/plan.ts
var MANIFEST_PATH = ".agents/harness.json";
function isSafeRelPath(p) {
  if (p === "" || p.startsWith("/") || p.includes("\\") || p.includes("\0")) return false;
  return !p.split("/").some((s) => s === "" || s === "." || s === ".." || s.toLowerCase() === ".git");
}
function assertSafeRelPath(p) {
  if (!isSafeRelPath(p)) throw new CliError(EXIT.STATE, `리포 밖이나 .git 으로 가는 설치 경로를 거부한다: ${p}`);
}
function manifestContent(sel, tokens) {
  const s = (v) => JSON.stringify(v);
  const agents = sel.agents.map(s).join(", ");
  return Buffer.from(
    `{
  "unit": ${s(tokens.PROJECT_SLUG || "project")},
  "title": ${s(tokens.PROJECT_NAME || "Project")},
  "stack": ${s(sel.stack)},
  "agents": [${agents}],
  "shared": []
}
`,
    "utf8"
  );
}
function existing(full11) {
  const st = lstatOrNull(full11);
  if (!st) return { kind: "none" };
  if (st.isSymbolicLink()) return { kind: "other", what: "링크다" };
  if (st.isDirectory()) return { kind: "other", what: "같은 이름의 폴더가 있다" };
  if (!st.isFile()) return { kind: "other", what: "일반 파일이 아니다" };
  return { kind: "file", bytes: import_node_fs11.default.readFileSync(full11), executable: (st.mode & 64) !== 0 };
}
function decide(cur, content, executable, mode) {
  if (cur.kind === "none") return { action: "create" };
  if (cur.kind === "other") return { action: "skip-user", reason: cur.what };
  const same2 = cur.bytes.equals(content);
  if (mode.adopt) return { action: "skip-user", reason: "--adopt" };
  if (mode.force) return same2 && cur.executable === executable ? { action: "same" } : { action: "replace" };
  return same2 ? { action: "same" } : { action: "skip-user", reason: "사람이 둔 파일이다" };
}
var AncestorCheck = class {
  constructor(target, targetReal) {
    this.target = target;
    this.targetReal = targetReal;
  }
  target;
  targetReal;
  cache = /* @__PURE__ */ new Map();
  state(rel2) {
    let cur = this.target;
    for (const part of rel2.split("/").slice(0, -1)) {
      cur = import_node_path8.default.join(cur, part);
      const known = this.cache.get(cur) ?? this.inspect(cur, rel2);
      this.cache.set(cur, known);
      if (known === "missing") return "ok";
      if (known === "blocked") return "blocked";
    }
    return "ok";
  }
  inspect(dir, rel2) {
    const st = lstatOrNull(dir);
    if (!st) return "missing";
    if (st.isDirectory()) return "ok";
    if (!st.isSymbolicLink()) return "blocked";
    let real2;
    try {
      real2 = import_node_fs11.default.realpathSync(dir);
    } catch {
      throw new CliError(EXIT.STATE, `설치 경로의 상위 폴더가 끊어진 링크다: ${rel2}`, `${dir} 를 확인한다`);
    }
    if (!isInside(real2, this.targetReal)) {
      throw new CliError(EXIT.STATE, `설치 경로가 링크를 따라 리포 밖으로 나간다: ${rel2}`, `${dir} → ${real2}`);
    }
    return import_node_fs11.default.statSync(dir).isDirectory() ? "ok" : "blocked";
  }
};
var BLOCKED = "상위 경로가 폴더가 아니다";
function manifestPlan(target, ancestors, content, adopt) {
  if (ancestors?.state(MANIFEST_PATH) === "blocked") return { path: MANIFEST_PATH, action: "skip-user", content };
  const cur = ancestors ? existing(import_node_path8.default.join(target, ...MANIFEST_PATH.split("/"))) : { kind: "none" };
  if (cur.kind === "none") return { path: MANIFEST_PATH, action: "create", content };
  if (adopt || cur.kind === "other") return { path: MANIFEST_PATH, action: "skip-user", content };
  return { path: MANIFEST_PATH, action: cur.bytes.equals(content) ? "same" : "replace", content };
}
function buildPlan(args) {
  const { layout: layout2, templatesDir, target, selection, tokens, mode } = args;
  const res = resolveCandidates(layout2, templatesDir, selection, tokens);
  const ancestors = import_node_fs11.default.existsSync(target) ? new AncestorCheck(target, import_node_fs11.default.realpathSync(target)) : null;
  const ops = res.winners.map((c) => {
    assertSafeRelPath(c.dest);
    const content = substitute2(readTemplate(templatesDir, c.src), tokens, layout2.tokens);
    const executable = isExecutable(layout2, c.dest);
    const blocked2 = ancestors?.state(c.dest) === "blocked";
    const cur = !ancestors || blocked2 ? { kind: "none" } : existing(import_node_path8.default.join(target, ...c.dest.split("/")));
    const { action, reason } = blocked2 ? { action: "skip-user", reason: BLOCKED } : decide(cur, content, executable, mode);
    const op = {
      path: c.dest,
      op: "copy",
      owner: action === "skip-user" ? "user" : "kit",
      layer: c.layer,
      action,
      src: c.src,
      content,
      sha256: sha256(content),
      executable
    };
    if (reason !== void 0) op.reason = reason;
    return op;
  });
  const generated = [manifestPlan(target, ancestors, manifestContent(selection, tokens), mode.adopt)];
  const counts2 = { create: 0, replace: 0, same: 0, "skip-user": 0, excludedByHarness: res.excludedByHarness, overlapped: res.overlaps.length };
  for (const o of ops) counts2[o.action] += 1;
  const { projection, projectionFindings } = planProjection(args, ops);
  return { target, ops, overlaps: res.overlaps, excludedByHarness: res.excludedByHarness, generated, counts: counts2, projection, projectionFindings };
}
function planProjection(args, ops) {
  const spec = loadSpecOrNull(args.templatesDir);
  if (!spec) return { projection: null, projectionFindings: [] };
  const writes = new Map(ops.filter((o) => o.action === "create" || o.action === "replace").map((o) => [o.path, { content: o.content, executable: o.executable }]));
  const p = prepare({ target: args.target, spec, tokens: args.tokens, agents: args.selection.agents, writes, copyPaths: ops.map((o) => o.path) });
  const projection = judgeInstall({ target: args.target, spec, tokens: args.tokens, sources: p.sources, wants: p.wants, prev: [], force: args.mode.force });
  return { projection, projectionFindings: p.findings };
}

// src/core/selection.ts
var import_node_fs12 = __toESM(require("node:fs"));
var import_node_path9 = __toESM(require("node:path"));
var RETIRED_MODULES = ["platform-guards"];
function isRetiredModule(name) {
  return RETIRED_MODULES.includes(name);
}
function retiredNote(name, from) {
  return from === "meta" ? `  · ${name} 모듈은 공통 층에 포함됨 — 메타에서 뺀다(파일은 그대로)` : `  · ${name} 모듈은 공통 층에 포함됨 — 따로 켜고 끌 것이 없다`;
}
function subdirs(dir) {
  if (!isDir(dir)) return [];
  return import_node_fs12.default.readdirSync(dir).filter((n) => isDir(import_node_path9.default.join(dir, n))).sort();
}
function listStacks(templatesDir) {
  return subdirs(import_node_path9.default.join(templatesDir, "stacks"));
}
function listArchs(templatesDir, stack) {
  return subdirs(import_node_path9.default.join(templatesDir, "stacks", stack, "arch"));
}
function parseList(raw, valid, what, allowNone) {
  const words = raw.split(/[\s,]+/).filter(Boolean);
  const keywords = allowNone ? ["all", "none"] : ["all"];
  const choices = `사용 가능: ${valid.join(" ")} (전체는 all${allowNone ? ", 없음은 none" : ""})`;
  const unknown = words.filter((w) => !valid.includes(w) && !keywords.includes(w));
  if (unknown.length) throw usageError(`알 수 없는 ${what}: ${unknown.join(" ")}`, choices);
  for (const w of words) {
    if (w === "all") return [...valid];
    if (allowNone && w === "none") return [];
  }
  const out = words.filter((w, i) => words.indexOf(w) === i);
  if (out.length === 0 && !allowNone) throw usageError(`${what} 값이 비어 있다`, choices);
  return out;
}
function detectHarnesses(layout2, target, env) {
  const byDir = layout2.harnesses.filter((h) => (layout2.harnessDetect[h]?.dirs ?? []).some((d) => isDir(import_node_path9.default.join(target, d))));
  if (byDir.length) return byDir;
  return layout2.harnesses.filter((h) => (layout2.harnessDetect[h]?.env ?? []).some((v) => (env[v] ?? "") !== ""));
}
function resolveSelection(layout2, templatesDir, input, ctx) {
  const stacks = listStacks(templatesDir);
  const stack = input.stack ?? layout2.defaultStack;
  if (!stacks.includes(stack)) throw usageError(`알 수 없는 스택: '${stack}'`, `사용 가능: ${stacks.join(" ")}`);
  const spec = stackSpecOf(layout2, stack);
  const archs = listArchs(templatesDir, stack);
  const arch = input.arch ?? spec.defaultArch;
  if (!archs.includes(arch)) throw usageError(`스택 '${stack}' 에 없는 아키텍처 변형: '${arch}'`, `사용 가능: ${archs.join(" ")}`);
  const domain = input.domain ?? spec.domain ?? "";
  if (domain !== "" && !layout2.domains.includes(domain)) {
    throw usageError(`알 수 없는 도메인: '${domain}'`, `사용 가능: ${layout2.domains.join(" ")}`);
  }
  let lang = null;
  if (input.lang !== void 0) {
    const withLang = Object.keys(layout2.stacks).filter((s) => layout2.stacks[s]?.lang);
    if (!spec.lang) throw usageError(`--lang 은 이 스택에서 쓰지 않는다: '${stack}'`, `--lang 을 받는 스택: ${withLang.join(" ")}`);
    if (!(input.lang in spec.lang)) throw usageError(`알 수 없는 --lang: '${input.lang}'`, `사용 가능: ${Object.keys(spec.lang).join(" ")}`);
    lang = input.lang;
  }
  let agents;
  let agentsOrigin;
  if (input.agents !== void 0) {
    agents = parseList(input.agents, layout2.harnesses, "하네스", false);
    agentsOrigin = "flag";
  } else {
    agents = detectHarnesses(layout2, ctx.target, ctx.env);
    agentsOrigin = "detected";
    if (agents.length === 0) {
      agents = [...layout2.defaultHarnesses];
      agentsOrigin = "default";
    }
  }
  const words = (input.modules ?? "").split(/[\s,]+/).filter(Boolean);
  const retired = words.filter((w, i) => isRetiredModule(w) && words.indexOf(w) === i);
  const rest = words.filter((w) => !isRetiredModule(w)).join(",");
  const modules = input.modules === void 0 || rest === "" && retired.length ? [] : parseList(rest, layout2.modules, "모듈", true);
  for (const m of modules) {
    if (!isDir(import_node_path9.default.join(templatesDir, "optional", m))) {
      throw new CliError(EXIT.ENV, `모듈 템플릿이 없다: ${import_node_path9.default.join(templatesDir, "optional", m)}`);
    }
  }
  return { stack, arch, domain, lang, agents, agentsOrigin, modules, ...retired.length ? { retiredModules: retired } : {} };
}

// src/core/version.ts
var VERSION = "2.0.0-alpha.0";
var MIN_NODE = { major: 18, minor: 3 };
var MIN_NODE_TEXT = `${MIN_NODE.major}.${MIN_NODE.minor}`;
function nodeTooOld(version) {
  const [maj, min] = version.replace(/^v/, "").split(".").map((x) => Number.parseInt(x, 10));
  if (maj === void 0 || !Number.isFinite(maj)) return false;
  if (maj !== MIN_NODE.major) return maj < MIN_NODE.major;
  return Number.isFinite(min) && min < MIN_NODE.minor;
}
function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim());
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}
function comparePre(a, b) {
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === void 0) return -1;
    if (y === void 0) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null && nx !== ny) return nx - ny;
    if (nx !== null && ny === null) return -1;
    if (nx === null && ny !== null) return 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
function compareSemver(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return a === b ? 0 : null;
  for (let i = 0; i < 3; i += 1) {
    const d = x.core[i] - y.core[i];
    if (d !== 0) return Math.sign(d);
  }
  return Math.sign(comparePre(x.pre, y.pre));
}

// src/core/installed.ts
var NOT_INSTALLED_HINT = "설치는 harness-kit init";
function loadInstalled(target, command) {
  const m = readMeta(import_node_path10.default.join(target, META_REL));
  if (m.status === "missing") throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, NOT_INSTALLED_HINT);
  if (m.status === "invalid") throw new CliError(EXIT.STATE, `메타를 해석하지 못했다: ${m.error}`, "harness-kit doctor 로 상태를 본다");
  const l = readLock(import_node_path10.default.join(target, LOCK_REL));
  if (l.status === "missing") {
    throw new CliError(EXIT.STATE, `lock 이 없다(${LOCK_REL})`, `lock 없이 ${command} 하면 사람 파일과 킷 파일을 가리지 못한다. harness-kit doctor 로 상태를 본다`);
  }
  if (l.status === "invalid") throw new CliError(EXIT.STATE, `lock 을 해석하지 못했다: ${l.error}`, "harness-kit doctor 로 상태를 본다");
  assertLockUsable(l.lock.entries);
  return { meta: m.meta, metaFormat: m.schema, lock: l.lock, lockFormat: l.format, lockAmbiguous: l.ambiguous };
}
function assertLockUsable(entries) {
  const unsafe = entries.filter((e) => !isSafeRelPath(e.path)).map((e) => e.path);
  if (unsafe.length) throw new CliError(EXIT.STATE, `lock 에 리포 밖이나 .git 을 가리키는 항목이 있다: ${unsafe.join(" ")}`, "lock 을 고치거나 harness-kit doctor 로 본다");
  for (const e of entries) entryKind(e);
}
function entryKind(e) {
  switch (e.op) {
    case "copy":
    case "none":
    case "mirror":
    case "render":
    case "merge":
      return e.op;
    default:
      throw new CliError(EXIT.STATE, `lock 항목 ${e.path} 의 op '${e.op}' 는 이 판(${VERSION})에서 지원하지 않는다`, "새 판 CLI 로 실행한다");
  }
}
function ownerKind2(owner) {
  if (owner === "kit" || owner === "user") return owner;
  if (owner.startsWith("external:")) return "external";
  if (owner.startsWith("pack:")) return "pack";
  return "unknown";
}
function selectionFromMeta(layout2, templatesDir, meta) {
  if (!listStacks(templatesDir).includes(meta.stack)) {
    throw new CliError(EXIT.STATE, `이 킷에 없는 스택이다: '${meta.stack}'`, "메타의 stack 을 고치거나 그 스택이 있는 킷 판을 쓴다");
  }
  if (!listArchs(templatesDir, meta.stack).includes(meta.arch)) {
    throw new CliError(EXIT.STATE, `이 킷에 없는 변형이다: '${meta.arch}' (스택 ${meta.stack})`, "메타의 arch 를 고치거나 그 변형이 있는 킷 판을 쓴다");
  }
  const retiredModules = meta.modules.filter((m) => isRetiredModule(m) && !layout2.modules.includes(m));
  const modules = meta.modules.filter((m) => !retiredModules.includes(m) && isDir(import_node_path10.default.join(templatesDir, "optional", m)));
  const selection = {
    stack: meta.stack,
    arch: meta.arch,
    domain: meta.domain || (stackSpecOf(layout2, meta.stack).domain ?? ""),
    lang: null,
    agents: [...meta.agents],
    agentsOrigin: "meta",
    modules
  };
  return { selection, droppedModules: meta.modules.filter((m) => !modules.includes(m) && !retiredModules.includes(m)), retiredModules };
}
function tokensFromMeta(layout2, sel, meta, env, target) {
  const fixed = /* @__PURE__ */ new Map();
  for (const k of layout2.tokens) {
    const fromEnv = env[k];
    if (fromEnv) fixed.set(k, fromEnv);
    else if (Object.hasOwn(meta.tokens, k)) fixed.set(k, meta.tokens[k]);
  }
  const flags = Object.fromEntries([...fixed].filter(([, v]) => v !== ""));
  const defaults = resolveTokens(layout2, sel, { flags, env: {}, targetBasename: import_node_path10.default.basename(target) });
  return Object.fromEntries(layout2.tokens.map((k) => [k, fixed.get(k) ?? defaults[k] ?? ""]));
}

// src/core/legacy-lock.ts
var AMBIGUOUS_REASON = "v1 lock — 미리 있던 파일인지 가릴 수 없다";
function resolveLegacyHashes(target, entries, want) {
  const ambiguous = /* @__PURE__ */ new Set();
  const out = entries.map((e) => {
    if (ownerKind2(e.owner) !== "kit" || e.op !== "copy" || !e.sha256) return e;
    if (want && want.get(e.path) === e.sha256) return e;
    const cur = existing(import_node_path11.default.join(target, ...e.path.split("/")));
    if (cur.kind !== "file" || sha256(cur.bytes) !== e.sha256) return e;
    ambiguous.add(e.path);
    return { ...e, sha256: null };
  });
  return { entries: out, ambiguous };
}
function resolvedLock(inst, target, shaOf2) {
  if (!inst.lockAmbiguous) return { lock: inst.lock, ambiguous: /* @__PURE__ */ new Set() };
  const r = resolveLegacyHashes(target, inst.lock.entries, shaOf2());
  return { lock: { ...inst.lock, entries: r.entries }, ambiguous: r.ambiguous };
}

// src/core/selection-change.ts
var import_node_path12 = __toESM(require("node:path"));
var LATER_MODULES = {
  aidlc: "P22(외부 도구 모듈, 설계 10 §3.2)",
  entire: "P22(외부 도구 모듈, 설계 10 §3.3)",
  notion: "P22(접수 출처 모듈, 설계 10 §3.6)"
};
function parseNames(layout2, raw, command) {
  const words = raw.flatMap((r) => r.split(/[\s,]+/)).filter(Boolean);
  const choices = `하네스: ${layout2.harnesses.join(" ")} · 모듈: ${layout2.modules.join(" ")}`;
  if (words.length === 0) throw usageError(`${command}: 이름이 없다`, `harness-kit ${command} <이름>… (${choices})`);
  const later = words.find((w) => Object.hasOwn(LATER_MODULES, w));
  if (later) throw usageError(`'${later}' 모듈은 아직 없다 — ${LATER_MODULES[later]}에서 제공한다`, choices);
  if (words.some((w) => w === "all" || w === "none")) throw usageError(`${command}: all · none 은 받지 않는다(하네스인지 모듈인지 갈리지 않는다)`, choices);
  const unknown = words.filter((w) => !layout2.harnesses.includes(w) && !layout2.modules.includes(w) && !isRetiredModule(w));
  if (unknown.length) throw usageError(`${command}: 모르는 이름 ${unknown.join(" ")}`, choices);
  const uniq = words.filter((w, i) => words.indexOf(w) === i);
  return {
    harnesses: uniq.filter((w) => layout2.harnesses.includes(w)),
    modules: uniq.filter((w) => layout2.modules.includes(w)),
    retired: uniq.filter((w) => isRetiredModule(w) && !layout2.modules.includes(w))
  };
}
function assertModuleDirs(templatesDir, modules) {
  for (const m of modules) {
    if (!isDir(import_node_path12.default.join(templatesDir, "optional", m))) throw new CliError(EXIT.ENV, `모듈 템플릿이 없다: ${import_node_path12.default.join(templatesDir, "optional", m)}`);
  }
}
function withNames(sel, names) {
  return {
    ...sel,
    agents: [...sel.agents, ...names.harnesses.filter((h) => !sel.agents.includes(h))],
    modules: [...sel.modules, ...names.modules.filter((m) => !sel.modules.includes(m))]
  };
}
function withoutNames(sel, names) {
  return { ...sel, agents: sel.agents.filter((a) => !names.harnesses.includes(a)), modules: sel.modules.filter((m) => !names.modules.includes(m)) };
}
function winnerLayers(layout2, templatesDir, sel, tokens) {
  return new Map(resolveCandidates(layout2, templatesDir, sel, tokens).winners.map((c) => [c.dest, c.layer]));
}
function shareOf(layout2, templatesDir, after, names, tokens, afterLayers) {
  const share = /* @__PURE__ */ new Set();
  const each = [...names.harnesses.map((h) => ({ harnesses: [h], modules: [], retired: [] })), ...names.modules.map((m) => ({ harnesses: [], modules: [m], retired: [] }))];
  for (const one of each) {
    const without = winnerLayers(layout2, templatesDir, withoutNames(after, one), tokens);
    for (const p of afterLayers.keys()) if (!without.has(p)) share.add(p);
  }
  return share;
}
function relayered(before, after, skip = /* @__PURE__ */ new Set()) {
  return [...after].filter(([p, layer]) => !skip.has(p) && before.has(p) && before.get(p) !== layer).map(([p]) => p);
}

// src/core/update-plan.ts
var import_node_fs13 = __toESM(require("node:fs"));
var import_node_path13 = __toESM(require("node:path"));
var PROJECTION_OPS2 = /* @__PURE__ */ new Set(["mirror", "render", "merge"]);
var UPDATE_ACTIONS = [
  "new",
  "restore",
  "update",
  "same",
  "conflict",
  "replace",
  "orphan",
  "delete",
  "skip-user",
  "skip-external",
  "skip-pack",
  "forget",
  "merge"
];
function full4(target, rel2) {
  return import_node_path13.default.join(target, ...rel2.split("/"));
}
function current(ctx, rel2) {
  if (ctx.ancestors.state(rel2) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(full4(ctx.target, rel2));
  if (cur.kind === "file") return { kind: "file", sha: sha256(cur.bytes) };
  return cur;
}
var kitEntry2 = (p, w) => ({ path: p, op: "copy", owner: "kit", sha256: w.sha256, layer: w.layer });
var userEntry2 = (p, layer) => ({ path: p, op: "copy", owner: "user", sha256: null, layer });
function withD(p, w, action, extra = {}) {
  return { path: p, op: "copy", owner: "kit", layer: w.layer, action, executable: w.executable, content: w.content, sha256: w.sha256, ...extra };
}
function skipByOwner(e) {
  switch (ownerKind2(e.owner)) {
    case "user":
      return { action: "skip-user" };
    case "external":
      return { action: "skip-external" };
    case "pack":
      return { action: "skip-pack", reason: "팩 갱신은 P18" };
    case "unknown":
      return { action: "skip-user", reason: `모르는 주인 '${e.owner}'` };
    case "kit":
      return entryKind(e) === "none" ? { action: "skip-user", reason: "op none(기록만)" } : null;
  }
}
function orphan(ctx, p, e, cur) {
  const base = { path: p, op: e.op, owner: e.owner, layer: e.layer ?? null };
  if (cur.kind === "none") {
    if (ctx.prune) return { op: { ...base, action: "delete", reason: "파일이 이미 없다(lock 항목만 뺀다)" }, entry: null };
    return { op: { ...base, action: "orphan", reason: "파일이 이미 없다", modified: false }, entry: e };
  }
  if (cur.kind === "other") return { op: { ...base, action: "orphan", reason: cur.what, modified: true }, entry: e };
  const modified = !(e.sha256 && cur.sha === e.sha256);
  if (ctx.prune && !modified) return { op: { ...base, action: "delete", removeFile: true }, entry: null };
  return { op: { ...base, action: "orphan", modified }, entry: e };
}
function untracked(p, w, cur) {
  if (cur.kind === "none") return { op: withD(p, w, "new"), entry: kitEntry2(p, w) };
  if (cur.kind === "file" && cur.sha === w.sha256) return { op: withD(p, w, "same"), entry: kitEntry2(p, w) };
  return { op: { path: p, op: "copy", owner: "user", layer: w.layer, action: "skip-user", reason: "사람이 둔 파일이다" }, entry: userEntry2(p, w.layer) };
}
function sideState(ctx, rel2) {
  return existing(full4(ctx.target, rel2)).kind;
}
function modifiedFile(ctx, p, e, w) {
  const keepB = { path: p, op: "copy", owner: "kit", sha256: e.sha256 ?? null, layer: w.layer };
  if (ctx.acceptAll) {
    const bak = `${p}.bak`;
    if (sideState(ctx, bak) !== "other") return { op: withD(p, w, "replace", { backup: bak }), entry: kitEntry2(p, w) };
    return { op: withD(p, w, "conflict", { reason: `${bak} 자리에 파일이 아닌 것이 있다` }), entry: keepB };
  }
  const neu = `${p}.new`;
  const side = sideState(ctx, neu);
  if (side === "other") return { op: withD(p, w, "conflict", { reason: `${neu} 자리에 파일이 아닌 것이 있다` }), entry: keepB };
  return { op: withD(p, w, "conflict", { newFile: neu, ...side === "file" ? { newRefreshed: true } : {} }), entry: keepB };
}
function judge(ctx, forget, p, e, w) {
  if (forget.has(p)) {
    return { op: { path: p, op: "none", owner: "user", layer: w?.layer ?? e?.layer ?? null, action: "forget" }, entry: { path: p, op: "none", owner: "user" } };
  }
  const skip = e ? skipByOwner(e) : null;
  if (e && skip) return { op: { path: p, op: e.op, owner: e.owner, layer: e.layer ?? w?.layer ?? null, ...skip }, entry: e };
  const cur = current(ctx, p);
  if (!w) return orphan(ctx, p, e, cur);
  if (cur.kind === "other") {
    return { op: { path: p, op: "copy", owner: e?.owner ?? "user", layer: w.layer, action: "skip-user", reason: cur.what }, entry: e ?? userEntry2(p, w.layer) };
  }
  if (!e) return untracked(p, w, cur);
  if (cur.kind === "none") return { op: withD(p, w, "restore"), entry: kitEntry2(p, w) };
  if (cur.sha === w.sha256) return { op: withD(p, w, "same"), entry: kitEntry2(p, w) };
  if (e.sha256 && cur.sha === e.sha256) return { op: withD(p, w, "update"), entry: kitEntry2(p, w) };
  return modifiedFile(ctx, p, e, w);
}
function wanted(input) {
  const { layout: layout2, templatesDir, selection, tokens } = input;
  const res = resolveCandidates(layout2, templatesDir, selection, tokens);
  const want = /* @__PURE__ */ new Map();
  for (const c of res.winners) {
    assertSafeRelPath(c.dest);
    const content = substitute2(readTemplate(templatesDir, c.src), tokens, layout2.tokens);
    want.set(c.dest, { layer: c.layer, content, sha256: sha256(content), executable: isExecutable(layout2, c.dest) });
  }
  return { want, overlaps: res.overlaps, excludedByHarness: res.excludedByHarness };
}
function forgetSet(raw, locked, want) {
  const out = /* @__PURE__ */ new Set();
  for (const r of raw) {
    const p = r.replace(/^\.\/+/, "");
    if (!isSafeRelPath(p)) throw usageError(`--forget 경로가 리포 안 상대 경로가 아니다: '${r}'`);
    if (!locked.has(p) && !want.has(p)) throw usageError(`--forget: lock 에도 킷에도 없는 경로다: '${r}'`, "harness-kit list --files 로 경로를 본다");
    out.add(p);
  }
  return out;
}
function buildUpdatePlan(input) {
  const { want, overlaps, excludedByHarness } = wanted(input);
  const locked = new Map(input.lock.entries.filter((e) => !PROJECTION_OPS2.has(e.op)).map((e) => [e.path, e]));
  const forget = forgetSet(input.forget, locked, want);
  const ctx = { target: input.target, ancestors: new AncestorCheck(input.target, import_node_fs13.default.realpathSync(input.target)), acceptAll: input.acceptAll, prune: input.prune };
  const counts2 = Object.fromEntries(UPDATE_ACTIONS.map((a) => [a, 0]));
  const ops = [];
  const entries = [];
  for (const p of [.../* @__PURE__ */ new Set([...want.keys(), ...locked.keys()])].sort(byteCompare)) {
    const j = judge(ctx, forget, p, locked.get(p), want.get(p));
    ops.push(j.op);
    counts2[j.op.action] += 1;
    if (j.entry) entries.push(j.entry);
  }
  return { ops, entries, counts: counts2, overlaps, excludedByHarness, wantPaths: new Set(want.keys()) };
}

// src/commands/change.ts
var import_node_fs22 = __toESM(require("node:fs"));
var import_node_path24 = __toESM(require("node:path"));

// src/cli/context.ts
var import_node_path14 = __toESM(require("node:path"));
function targetOf(ctx) {
  const cwd = ctx.values.cwd;
  return import_node_path14.default.resolve(ctx.io.cwd, typeof cwd === "string" ? cwd : ".");
}
function today(io2) {
  if (io2.today) return io2.today;
  const fixed = io2.env.HARNESS_KIT_TODAY;
  if (fixed && /^\d{4}-\d{2}-\d{2}$/.test(fixed)) return fixed;
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// src/core/apply.ts
var import_node_child_process = require("node:child_process");
var import_node_fs14 = __toESM(require("node:fs"));
var import_node_path15 = __toESM(require("node:path"));
var FEATURE_DOCS = "tools/docs/feature_docs.py";
function full5(target, rel2) {
  return import_node_path15.default.join(target, ...rel2.split("/"));
}
function featureDocsAllowed(plan) {
  const docs = plan.ops.filter((o) => o.path.startsWith(`${import_node_path15.default.posix.dirname(FEATURE_DOCS)}/`));
  return docs.some((o) => o.path === FEATURE_DOCS) && docs.every((o) => o.owner === "kit");
}
function buildFeatureDocs(target, env) {
  if (!import_node_fs14.default.existsSync(full5(target, FEATURE_DOCS))) return { status: "skipped", reason: `${FEATURE_DOCS} 없음` };
  const r = (0, import_node_child_process.spawnSync)("python3", [FEATURE_DOCS, "build"], {
    cwd: target,
    env: env.PATH === void 0 ? { ...env, PATH: process.env.PATH } : env,
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
    timeout: 18e4
  });
  if (r.error && r.error.code === "ENOENT") return { status: "skipped", reason: "python3 없음" };
  if (r.error || r.status !== 0) {
    const tail = (r.stderr ?? "").trim().split("\n").slice(-3).join(" / ");
    return { status: "failed", error: tail || (r.error ? r.error.message : `exit ${String(r.status)}`) };
  }
  return { status: "built" };
}
function applyPlan(args) {
  const { plan, metaText, lockText: lockText2, env } = args;
  const target = plan.target;
  let written = 0;
  let current4 = "";
  try {
    current4 = target;
    import_node_fs14.default.mkdirSync(target, { recursive: true });
    for (const op of plan.ops) {
      if (op.action !== "create" && op.action !== "replace") continue;
      current4 = op.path;
      writeFileAtomic(full5(target, op.path), op.content, op.executable);
      written += 1;
    }
    for (const g of plan.generated) {
      if (g.action !== "create" && g.action !== "replace") continue;
      current4 = g.path;
      writeFileAtomic(full5(target, g.path), g.content, false);
    }
    current4 = "배치(mirror · render · merge)";
    if (plan.projection) applyProjection(target, plan.projection.ops);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current4}`);
  }
  const featureDocs = featureDocsAllowed(plan) ? buildFeatureDocs(target, env) : { status: "skipped", reason: "tools/docs/ 에 킷 판이 아닌 파일이 있다" };
  try {
    current4 = LOCK_REL;
    writeFileAtomic(full5(target, LOCK_REL), Buffer.from(lockText2, "utf8"), false);
    current4 = META_REL;
    writeFileAtomic(full5(target, META_REL), Buffer.from(metaText, "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current4}`);
  }
  return { written, featureDocs };
}

// src/core/templates.ts
var import_node_fs15 = __toESM(require("node:fs"));
var import_node_path16 = __toESM(require("node:path"));
function hasLayout(dir) {
  return import_node_fs15.default.existsSync(import_node_path16.default.join(dir, "layout.json"));
}
function locateTemplates(opts) {
  const explicit = opts.flag ?? (opts.env.HARNESS_KIT_TEMPLATES || void 0);
  if (explicit !== void 0) {
    const dir = import_node_path16.default.resolve(opts.cwd, explicit);
    if (!hasLayout(dir)) throw new CliError(EXIT.ENV, `템플릿 폴더가 아니다(layout.json 없음): ${dir}`);
    return { dir, source: `file:${dir}` };
  }
  let cliDir;
  try {
    cliDir = import_node_path16.default.dirname(import_node_fs15.default.realpathSync(opts.cliFile));
  } catch {
    cliDir = import_node_path16.default.dirname(import_node_path16.default.resolve(opts.cliFile));
  }
  const beside = import_node_path16.default.resolve(cliDir, "..", "templates");
  if (hasLayout(beside)) {
    const where = import_node_path16.default.basename(cliDir) === "bin" ? "plugin" : "npm";
    return { dir: beside, source: `${where}:harness-kit@${opts.version}` };
  }
  const mono = import_node_path16.default.resolve(cliDir, "..", "..", "templates");
  if (hasLayout(mono)) return { dir: mono, source: `file:${mono}` };
  throw new CliError(EXIT.ENV, "템플릿 폴더를 찾지 못했다", `--templates <폴더> 또는 HARNESS_KIT_TEMPLATES 로 준다 (찾은 곳: ${beside} · ${mono})`);
}

// src/commands/update.ts
var import_node_fs21 = __toESM(require("node:fs"));
var import_node_path23 = __toESM(require("node:path"));

// src/core/board.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs16 = __toESM(require("node:fs"));
var import_node_path17 = __toESM(require("node:path"));
var BOARD_SCRIPT = "scripts/board.sh";
function isBoardCode(rel2) {
  return rel2 === BOARD_SCRIPT || rel2 === "scripts/sdd-layout.py" || rel2.startsWith("scripts/harness/");
}
function runEnv(env) {
  return env.PATH === void 0 ? { ...env, PATH: process.env.PATH } : env;
}
function refreshBoard(target, env, blockedBy) {
  const script = import_node_path17.default.join(target, ...BOARD_SCRIPT.split("/"));
  let st = null;
  try {
    st = import_node_fs16.default.lstatSync(script);
  } catch {
    st = null;
  }
  if (!st?.isFile()) return { status: "skipped", reason: `${BOARD_SCRIPT} 없음` };
  if (blockedBy) return { status: "skipped", reason: `보드 코드가 사람 판이다: ${blockedBy}` };
  const e = runEnv(env);
  const py = (0, import_node_child_process2.spawnSync)("python3", ["--version"], { env: e, stdio: "ignore", timeout: 3e4 });
  if (py.error) return { status: "skipped", reason: "python3 없음" };
  const opts = { cwd: target, env: e, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"], timeout: 18e4 };
  const check3 = (0, import_node_child_process2.spawnSync)("bash", [BOARD_SCRIPT, "--check"], opts);
  if (!check3.error && check3.status === 0) return { status: "ok" };
  const build2 = (0, import_node_child_process2.spawnSync)("bash", [BOARD_SCRIPT], opts);
  if (!build2.error && build2.status === 0) return { status: "rebuilt" };
  const tail = (build2.stderr ?? "").trim().split("\n").slice(-2).join(" / ");
  return { status: "failed", reason: tail || (build2.error ? build2.error.message : `exit ${String(build2.status)}`) };
}
function boardLine(r) {
  if (r.status === "rebuilt") return "  ✎ SDD 보드를 새 형식으로 다시 만들었다: .agents/docs/specs-index.md";
  if (r.status === "failed") return `  ⚠ SDD 보드를 다시 만들지 못했다 — 'bash ${BOARD_SCRIPT}' 의 오류를 고친 뒤 다시 실행한다 (${r.reason})`;
  return null;
}

// src/core/notice.ts
var NOTICE_REL = ".agents/harness-upgrade-notice.md";
var UPGRADE_FILE = "UPGRADE.md";
var NOTICE_DAYS = 30;
function coreVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmp(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function upgradeSections(text2) {
  const out = [];
  for (const line of text2.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^## +(\S+)\s*$/.exec(line);
    if (h) out.push({ version: h[1], body: [] });
    else if (out.length) out[out.length - 1].body.push(line);
  }
  return out.map((s) => ({ version: s.version, body: trimBlank(s.body) }));
}
function trimBlank(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === "") a += 1;
  while (b > a && lines[b - 1].trim() === "") b -= 1;
  return lines.slice(a, b);
}
function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function isKitNotice(text2) {
  const lines = text2.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return false;
  const end = lines.indexOf("---", 1);
  const head = lines.slice(1, end < 0 ? 1 : end);
  return head.some((l) => l.startsWith("kitFrom:")) && head.some((l) => l.startsWith("kitTo:"));
}
function planNotice(args) {
  const from = coreVersion(args.from);
  const to = coreVersion(args.to);
  const sections = args.upgradeText !== null && from && to ? upgradeSections(args.upgradeText).map((s) => ({ ...s, core: coreVersion(s.version) })).filter((s) => s.core !== null && cmp(s.core, from) > 0 && cmp(s.core, to) <= 0).sort((a, b) => cmp(a.core, b.core)) : [];
  const kit = args.existing !== null && isKitNotice(args.existing);
  if (!sections.length) return { action: kit && noticeExpired(args.existing, args.today) ? "delete" : "none" };
  if (args.existing !== null && !kit) return { action: "keep-human" };
  const body = sections.flatMap((s) => s.body);
  const text2 = ["---", `kitFrom: ${args.from}`, `kitTo: ${args.to}`, `date: ${args.today}`, `expires: ${addDays(args.today, NOTICE_DAYS)}`, "---", `# 하네스 업데이트 ${args.from} → ${args.to}`, "", ...body, ""].join("\n");
  return { action: "write", text: text2 };
}
function noticeExpired(text2, today2) {
  const m = /^expires:\s*(\S+)/m.exec(text2);
  return Boolean(m && m[1] < today2);
}

// src/core/packs.ts
var import_node_child_process3 = require("node:child_process");
var import_node_crypto3 = __toESM(require("node:crypto"));
var import_node_fs17 = __toESM(require("node:fs"));
var import_node_path18 = __toESM(require("node:path"));

// src/core/tar.ts
var import_node_zlib = __toESM(require("node:zlib"));
var BLOCK = 512;
function text(buf, start, len) {
  const slice = buf.subarray(start, start + len);
  const end = slice.indexOf(0);
  return slice.subarray(0, end < 0 ? slice.length : end).toString("utf8");
}
function octal(buf, start, len) {
  const s = text(buf, start, len).trim();
  return s ? Number.parseInt(s, 8) : 0;
}
function paxPath(data) {
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(32, i);
    if (sp < 0) break;
    const len = Number.parseInt(data.subarray(i, sp).toString("utf8"), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const rec = data.subarray(sp + 1, i + len - 1).toString("utf8");
    const eq = rec.indexOf("=");
    if (eq > 0 && rec.slice(0, eq) === "path") return rec.slice(eq + 1);
    i += len;
  }
  return null;
}
function safe(p) {
  return p !== "" && !p.startsWith("/") && !p.split("/").includes("..") && !p.includes("\\") && !p.includes("\0");
}
function untgz(gz) {
  const buf = import_node_zlib.default.gunzipSync(gz);
  const out = [];
  let off = 0;
  let longName = null;
  while (off + BLOCK <= buf.length) {
    const header = buf.subarray(off, off + BLOCK);
    if (header.every((b) => b === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = text(header, 345, 155);
    let name = longName ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100));
    longName = null;
    const dataStart = off + BLOCK;
    const data = buf.subarray(dataStart, dataStart + size);
    off = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "x") {
      longName = paxPath(data);
      continue;
    }
    if (type === "L") {
      longName = data.toString("utf8").replace(/\0+$/, "");
      continue;
    }
    if (type === "g") continue;
    name = name.replace(/^\.\//, "");
    if (type === "5") continue;
    if (type !== "0" && type !== "\0" && type !== "7") throw new Error(`tar 항목 종류 '${type}' 는 받지 않는다(링크 · 장치): ${name}`);
    if (!safe(name)) throw new Error(`tar 항목 경로가 안전하지 않다: ${name}`);
    out.push({ path: name, data: Buffer.from(data), mode: octal(header, 100, 8) });
  }
  return out;
}

// src/core/packs.ts
var PACK_SCHEMA = "harness-kit.pack/v1";
var PACK_NAME = /^[a-z][a-z0-9-]{1,30}$/;
var PACKS_CACHE = ".agents/state/packs";
var SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
var ALLOWED = ["agents-rules/", "agents-skills/", "agents-root/", "agents-docs/_spec-templates/", "scripts/"];
var DENY = /* @__PURE__ */ new Set([".agents/hooks.json", ".agents/verify-checks.json", ".agents/harness-kit.json", ".agents/harness-kit.lock", ".agents/harness.json", ".agents/model-policy.json"]);
var IGNORED_TOP = /* @__PURE__ */ new Set(["pack.json", "README.md", "LICENSE", "LICENSE.md", "CHANGELOG.md", ".gitignore", ".gitattributes", ".npmignore", "package.json"]);
var isObj4 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var strList2 = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
function parsePackSource(raw) {
  if (raw.startsWith("file:") && raw.length > 5) return { kind: "file", path: raw.slice(5) };
  if (raw.startsWith("npm:") && raw.length > 4) return { kind: "npm", spec: raw.slice(4) };
  if (raw.startsWith("git:")) {
    const body = raw.slice(4);
    const hash = body.lastIndexOf("#");
    if (hash > 0 && hash < body.length - 1) {
      const addr = body.slice(0, hash);
      const ref = body.slice(hash + 1);
      const url = /^(ssh|https?|file):\/\//.test(addr) || /^[^@\s]+@[^:\s]+:/.test(addr) ? addr : `https://${addr.replace(/\.git$/, "")}.git`;
      return { kind: "git", url, ref };
    }
  }
  throw new CliError(EXIT.STATE, `팩 소스 형식이 아니다: ${raw}`, "file:<경로> · git:<host>/<path>#<태그> · npm:<패키지>@<판> 중 하나로 적는다");
}
function satisfiesKit(version, range) {
  const core = (v2) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v2.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const cmp2 = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const v = core(version);
  if (!v) return false;
  const parts = range.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((p) => {
    const m = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(p);
    const b = m ? core(m[2]) : null;
    if (!m || !b) return false;
    const c = cmp2(v, b);
    switch (m[1]) {
      case ">=":
        return c >= 0;
      case "<=":
        return c <= 0;
      case ">":
        return c > 0;
      case "<":
        return c < 0;
      case "^":
        return c >= 0 && v[0] === b[0] && (b[0] !== 0 || v[1] === b[1]);
      case "~":
        return c >= 0 && v[0] === b[0] && v[1] === b[1];
      default:
        return c === 0;
    }
  });
}
function walkPack(root, rel2 = "") {
  const out = [];
  for (const name of import_node_fs17.default.readdirSync(import_node_path18.default.join(root, rel2)).sort(byteCompare)) {
    if (name === ".git" && rel2 === "") continue;
    const sub2 = rel2 ? `${rel2}/${name}` : name;
    const full11 = import_node_path18.default.join(root, sub2);
    const st = import_node_fs17.default.lstatSync(full11);
    if (st.isSymbolicLink()) out.push({ rel: sub2, data: Buffer.alloc(0), mode: st.mode, link: true });
    else if (st.isDirectory()) out.push(...walkPack(root, sub2));
    else if (st.isFile()) out.push({ rel: sub2, data: import_node_fs17.default.readFileSync(full11), mode: st.mode, link: false });
  }
  return out;
}
function run(cmd, args, cwd, env) {
  const r = (0, import_node_child_process3.spawnSync)(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 3e5 });
  if (r.error) throw new CliError(EXIT.ENV, `${cmd} 를 실행하지 못했다: ${r.error.message}`, `${cmd} 를 설치하거나 PATH 를 확인한다`);
  if (r.status !== 0) throw new CliError(EXIT.STATE, `${cmd} ${args[0]} 실패: ${(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ")}`, "소스 주소 · 태그 · 접근 권한을 확인한다");
  return r.stdout;
}
function freshDir(target) {
  const dir = import_node_path18.default.join(target, PACKS_CACHE, `.hk-tmp-${import_node_crypto3.default.randomBytes(6).toString("hex")}`);
  import_node_fs17.default.mkdirSync(dir, { recursive: true });
  return dir;
}
function readManifest(files, source) {
  const f = files.find((x) => x.rel === "pack.json");
  if (!f) throw new CliError(EXIT.STATE, `팩에 pack.json 이 없다: ${source}`);
  let raw;
  try {
    raw = JSON.parse(f.data.toString("utf8"));
  } catch (err) {
    throw new CliError(EXIT.STATE, `pack.json 을 해석할 수 없다(${source}): ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isObj4(raw)) throw new CliError(EXIT.STATE, `pack.json 최상위가 객체가 아니다: ${source}`);
  const requires = isObj4(raw.requires) ? raw.requires : {};
  const provides = isObj4(raw.provides) ? raw.provides : {};
  return {
    schema: String(raw.schema ?? ""),
    name: String(raw.name ?? ""),
    version: String(raw.version ?? ""),
    ...typeof raw.description === "string" ? { description: raw.description } : {},
    requires: { kit: typeof requires.kit === "string" ? requires.kit : "" },
    provides: Object.fromEntries(Object.entries(provides).filter(([, v]) => strList2(v))),
    overrides: strList2(raw.overrides) ? raw.overrides : [],
    tokens: strList2(raw.tokens) ? raw.tokens : []
  };
}
function fetchPack(target, source, env) {
  const parsed2 = parsePackSource(source);
  if (parsed2.kind === "file") {
    const dir = import_node_path18.default.resolve(target, parsed2.path);
    if (!import_node_fs17.default.existsSync(dir) || !import_node_fs17.default.statSync(dir).isDirectory()) throw new CliError(EXIT.STATE, `팩 폴더가 없다: ${source}`, "file: 경로는 리포 기준 상대 경로나 절대 경로다");
    const files = walkPack(dir);
    const manifest = readManifest(files, source);
    return { source, parsed: parsed2, resolved: `tree:${treeSha(files.filter((f) => !f.link).map((f) => ({ rel: f.rel, bytes: f.data })))}`, manifest, files };
  }
  const tmp = freshDir(target);
  try {
    let files;
    let resolved;
    if (parsed2.kind === "git") {
      const into = import_node_path18.default.join(tmp, "src");
      run("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", parsed2.ref, parsed2.url, into], tmp, { ...env, GIT_TERMINAL_PROMPT: "0" });
      resolved = `git:${run("git", ["rev-parse", "HEAD"], into, env).trim()}`;
      files = walkPack(into);
    } else {
      const out = run("npm", ["pack", parsed2.spec, "--pack-destination", tmp, "--json", "--silent"], tmp, env);
      let info;
      try {
        info = JSON.parse(out);
      } catch {
        throw new CliError(EXIT.STATE, `npm pack 출력을 해석할 수 없다: ${parsed2.spec}`);
      }
      const first = info[0];
      if (!first?.filename) throw new CliError(EXIT.STATE, `npm pack 이 파일을 내지 않았다: ${parsed2.spec}`);
      const made = import_node_fs17.default.readdirSync(tmp).filter((n) => n.endsWith(".tgz"));
      if (made.length !== 1) throw new CliError(EXIT.STATE, `npm pack 결과 tgz 를 찾지 못했다: ${parsed2.spec}`);
      const tgz = import_node_fs17.default.readFileSync(import_node_path18.default.join(tmp, made[0]));
      let entries;
      try {
        entries = untgz(tgz);
      } catch (err) {
        throw new CliError(EXIT.STATE, `npm 팩을 풀 수 없다(${parsed2.spec}): ${err instanceof Error ? err.message : String(err)}`);
      }
      files = entries.filter((e) => e.path.startsWith("package/")).map((e) => ({ rel: e.path.slice("package/".length), data: e.data, mode: e.mode, link: false })).sort((a, b) => byteCompare(a.rel, b.rel));
      resolved = `npm:${first.integrity ?? sha256(tgz)}`;
    }
    const manifest = readManifest(files, source);
    if (PACK_NAME.test(manifest.name) && SEMVER.test(manifest.version)) {
      const cache = import_node_path18.default.join(target, PACKS_CACHE, `${manifest.name}@${manifest.version}-${resolved.replace(/^[a-z]+:(sha\d+-)?/, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`);
      import_node_fs17.default.rmSync(cache, { recursive: true, force: true });
      for (const f of files) if (!f.link) writeFileAtomic(import_node_path18.default.join(cache, ...f.rel.split("/")), f.data, (f.mode & 73) !== 0);
    }
    return { source, parsed: parsed2, resolved, manifest, files };
  } finally {
    import_node_fs17.default.rmSync(tmp, { recursive: true, force: true });
  }
}
function layerOf(rel2, sel) {
  const parts = rel2.split("/");
  if (parts[0] === "common") return { inner: parts.slice(1).join("/") };
  if (parts[0] === "domains") return parts[1] === sel.domain && sel.domain ? { inner: parts.slice(2).join("/") } : null;
  if (parts[0] === "stacks") {
    if (parts[1] !== sel.stack) return null;
    if (parts[2] === "arch") return parts[3] === sel.arch ? { inner: parts.slice(4).join("/") } : null;
    return { inner: parts.slice(2).join("/") };
  }
  return "unknown";
}
function provided(m, dest) {
  const p = m.provides;
  return (p.rules ?? []).some((n) => dest === `.agents/rules/${n}.md`) || (p.skills ?? []).some((n) => dest.startsWith(`.agents/skills/${n}/`)) || (p.roles ?? []).some((n) => dest === `.agents/roles/${n}.md`) || (p.guards ?? []).some((n) => dest === `scripts/guards/${n}.sh`) || (p.scripts ?? []).includes(dest) || (p.templates ?? []).includes(dest) || dest.startsWith(`tools/${m.name}/`);
}
function sameSet(a, b) {
  return a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
}
function planPack(pack, input) {
  const m = pack.manifest;
  const problems = [];
  const where = `${m.name || "?"}(${pack.source})`;
  if (m.schema !== PACK_SCHEMA) problems.push(`${where}: schema 는 ${PACK_SCHEMA}`);
  if (!PACK_NAME.test(m.name)) problems.push(`${where}: name 은 ^[a-z][a-z0-9-]{1,30}$`);
  if (!SEMVER.test(m.version)) problems.push(`${where}: version 은 semver(예 1.2.0)`);
  if (pack.parsed.kind === "git" && /^v\d/.test(pack.parsed.ref) && pack.parsed.ref.slice(1) !== m.version) problems.push(`${where}: 태그 ${pack.parsed.ref} 와 version ${m.version} 이 다르다`);
  if (!m.requires.kit) problems.push(`${where}: requires.kit 이 없다`);
  else if (!satisfiesKit(input.kitVersion, m.requires.kit)) problems.push(`팩 ${m.name} ${m.version} 은 kit ${m.requires.kit} 을 요구한다(지금 ${input.kitVersion}). 팩을 올리거나 kit 판을 맞춘다`);
  const owner = `pack:${m.name}`;
  const layer = `${owner}@${m.version}`;
  const order = [...input.layout.tokens, ...m.tokens.filter((t) => !input.layout.tokens.includes(t))];
  const wants = /* @__PURE__ */ new Map();
  const add = (dest, data, mode) => {
    const content = substitute2(data, input.tokens, order);
    wants.set(dest, { layer, content, sha256: sha256(content), executable: (mode & 73) !== 0 || isExecutable(input.layout, dest) });
  };
  for (const f of pack.files) {
    const top = f.rel.split("/")[0];
    if (!f.rel.includes("/") && IGNORED_TOP.has(f.rel)) continue;
    if (top === "tests") continue;
    if (f.link) {
      problems.push(`${where}: 링크는 받지 않는다: ${f.rel}`);
      continue;
    }
    if (f.rel.endsWith(".sh") && (f.mode & 73) === 0) problems.push(`${where}: 실행 권한이 없는 .sh: ${f.rel}`);
    if (top === "fragments") {
      const frag = fragment(pack, f, input, problems);
      if (frag) add(frag, f.data, 420);
      continue;
    }
    const lay = layerOf(f.rel, input.selection);
    if (lay === null) continue;
    if (lay === "unknown") {
      if (f.rel.includes("/")) problems.push(`${where}: 모르는 폴더 ${top}/ — common · domains · stacks · fragments · tests 만 쓴다`);
      continue;
    }
    const inner = lay.inner;
    const okSeg = ALLOWED.some((a) => inner.startsWith(a)) || inner.startsWith(`tools/${m.name}/`);
    if (!okSeg) {
      problems.push(`${where}: 팩이 쓸 수 없는 자리 ${f.rel}(하네스 파일 · root/ 는 킷 몫이다)`);
      continue;
    }
    const { dest, harness } = mapPath(input.layout, inner, input.tokens);
    if (harness !== null) {
      problems.push(`${where}: 하네스 파일은 팩이 두지 않는다: ${f.rel}`);
      continue;
    }
    if (DENY.has(dest)) {
      problems.push(`${where}: ${dest} 는 팩이 덮지 못한다(훅 · 검사는 fragments/ 로 더한다)`);
      continue;
    }
    if (input.kitPaths.has(dest) && !m.overrides.includes(dest)) problems.push(`${where}: 킷 경로 ${dest} 를 덮으려면 pack.json overrides 에 적는다`);
    else if (!provided(m, dest) && !m.overrides.includes(dest)) problems.push(`${where}: ${dest} 가 provides · overrides 어디에도 없다`);
    add(dest, f.data, f.mode);
  }
  return { wants, problems };
}
function fragment(pack, f, input, problems) {
  const m = pack.manifest;
  const where = `${m.name}(${pack.source})`;
  const text2 = f.data.toString("utf8");
  if (f.rel === "fragments/hooks.json") {
    try {
      const hooks = parseHooks(text2, input.hookMap) ?? [];
      for (const h of hooks) {
        if (!h.id.startsWith(`harness-${m.name}-`)) problems.push(`${where}: 훅 id ${h.id} 는 harness-${m.name}- 로 시작한다`);
        if (FLOOR_HOOKS.includes(h.id)) problems.push(`${where}: 하한 훅 ${h.id} 는 팩이 정의하지 못한다`);
        if (h.owner !== `pack:${m.name}`) problems.push(`${where}: 훅 ${h.id} 의 owner 는 pack:${m.name}`);
      }
      if (!sameSet(hooks.map((h) => h.id), m.provides.hooks ?? [])) problems.push(`${where}: fragments/hooks.json 의 id 와 provides.hooks 가 다르다`);
    } catch (err) {
      problems.push(`${where}: ${err instanceof HooksError ? err.message : String(err)}`);
    }
    return `.agents/hooks.d/${m.name}.json`;
  }
  if (f.rel === "fragments/verify-checks.json") {
    let checks = [];
    try {
      const raw = JSON.parse(text2);
      checks = Array.isArray(raw.checks) ? raw.checks : [];
    } catch (err) {
      problems.push(`${where}: fragments/verify-checks.json 을 해석할 수 없다: ${err instanceof Error ? err.message : String(err)}`);
    }
    const ids2 = checks.map((c) => isObj4(c) && typeof c.id === "string" ? c.id : "");
    for (const id of ids2) if (!id.startsWith(`${m.name}-`)) problems.push(`${where}: 검사 id '${id}' 는 ${m.name}- 로 시작한다`);
    if (!sameSet(ids2, m.provides.verifyChecks ?? [])) problems.push(`${where}: fragments/verify-checks.json 의 id 와 provides.verifyChecks 가 다르다`);
    return `.agents/verify-checks.d/${m.name}.json`;
  }
  problems.push(`${where}: fragments/ 에는 hooks.json · verify-checks.json 만 둔다: ${f.rel}`);
  return null;
}
function sourceWarnings(target, raw) {
  let p;
  try {
    p = parsePackSource(raw);
  } catch {
    return [];
  }
  if (p.kind === "git" && !/^v\d+\.\d+\.\d+/.test(p.ref)) return [{ kind: "pack-unpinned", hint: `${raw}: ref ${p.ref} 는 태그가 아니다 — 장비마다 다른 내용을 받을 수 있다` }];
  if (p.kind === "file") {
    const abs = import_node_path18.default.resolve(target, p.path);
    const rel2 = import_node_path18.default.relative(target, abs);
    if (rel2.startsWith("..") || import_node_path18.default.isAbsolute(rel2)) return [{ kind: "pack-local-path", hint: `${raw}: 리포 밖 경로다 — 다른 사람 장비에는 없다` }];
  }
  return [];
}

// src/core/v1-first-update.ts
var import_node_path19 = __toESM(require("node:path"));

// src/core/v1-merge.ts
var MERGE_BEGIN = "<!-- harness-kit: 설치 전 내용(병합) -->";
var MERGE_END = "<!-- /harness-kit -->";
var MERGE_BACKUP_DIR = ".agents/state/merge-backup";
var KIT_HEADER = "HARNESS STARTER KIT";
var KIT_FOLDERS = [".agents/rules/", ".agents/skills/", ".agents/roles/"];
var HEADER_LINES = 20;
var MAX_CELLS = 1e6;
var UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function decode2(data) {
  try {
    return UTF8.decode(data);
  } catch {
    return null;
  }
}
function extension(rel2) {
  const name = rel2.slice(rel2.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}
function hasKitHeader(text2) {
  return text2.split("\n").slice(0, HEADER_LINES).some((l) => l.includes(KIT_HEADER));
}
function planV1Merge(rel2, current4, kit) {
  if (KIT_FOLDERS.some((f) => rel2.startsWith(f))) return { kind: "kit", content: kit };
  const ext = extension(rel2);
  if (ext === ".md" || ext === ".txt") {
    const text2 = decode2(current4);
    if (text2 !== null && hasKitHeader(text2)) return { kind: "kit", content: kit };
    const merged = mergeLines(current4, kit);
    return merged ? { kind: "lines", content: merged } : { kind: "new", content: null };
  }
  if (ext === ".json") {
    const merged = mergeJson(current4, kit);
    return merged ? { kind: "keys", content: merged } : { kind: "new", content: null };
  }
  return { kind: "new", content: null };
}
function significant(line) {
  return /[A-Za-z0-9\u0080-\uffff]/.test(line);
}
var isBlank2 = (line) => /^[ \t\r]*$/.test(line);
function splitLines2(text2) {
  const lines = text2.split("\n");
  if (lines[lines.length - 1] === "") return { lines: lines.slice(0, -1), eol: true };
  return { lines, eol: false };
}
function lcsPairs(a, b) {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const n = midA.length;
  const m = midB.length;
  if (n * m > MAX_CELLS) return null;
  const pairs = [];
  for (let k = 0; k < head; k += 1) pairs.push([k, k]);
  if (n && m) {
    const w = m + 1;
    const table = new Uint32Array((n + 1) * w);
    for (let i2 = n - 1; i2 >= 0; i2 -= 1) {
      for (let j2 = m - 1; j2 >= 0; j2 -= 1) {
        const below = table[(i2 + 1) * w + j2];
        const right = table[i2 * w + j2 + 1];
        table[i2 * w + j2] = midA[i2] === midB[j2] ? table[(i2 + 1) * w + j2 + 1] + 1 : below >= right ? below : right;
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        pairs.push([head + i, head + j]);
        i += 1;
        j += 1;
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) i += 1;
      else j += 1;
    }
  }
  for (let k = 0; k < tail; k += 1) pairs.push([a.length - tail + k, b.length - tail + k]);
  return pairs;
}
function frontmatterEnd(lines) {
  if (lines[0] !== "---") return 0;
  for (let k = 1; k < lines.length; k += 1) if (lines[k] === "---") return k + 1;
  return 0;
}
function mergeLines(current4, kit) {
  const cText = decode2(current4);
  const dText = decode2(kit);
  if (cText === null || dText === null) return null;
  const c = splitLines2(cText).lines;
  const { lines: d, eol } = splitLines2(dText);
  const inC = new Set(c.filter(significant));
  const inD = new Set(d.filter(significant));
  const ca = c.flatMap((l, i) => inD.has(l) ? [i] : []);
  const da = d.flatMap((l, j) => inC.has(l) ? [j] : []);
  const pairs = lcsPairs(
    ca.map((i) => c[i]),
    da.map((j) => d[j])
  );
  if (pairs === null) return null;
  const anchors = pairs.map(([x, y]) => [ca[x], da[y]]);
  const fmEnd = frontmatterEnd(d);
  const blocks = [];
  let prevC = -1;
  for (let k = 0; k <= anchors.length; k += 1) {
    const [nextC, nextD] = k < anchors.length ? anchors[k] : [c.length, d.length];
    const run4 = c.slice(prevC + 1, nextC).filter((l) => !(significant(l) && inD.has(l)));
    if (run4.some(significant)) {
      let s = 0;
      let e = run4.length;
      while (s < e && isBlank2(run4[s])) s += 1;
      while (e > s && isBlank2(run4[e - 1])) e -= 1;
      blocks.push({ at: Math.max(nextD, fmEnd), lines: run4.slice(s, e) });
    }
    prevC = nextC;
  }
  const out = [];
  let bi = 0;
  for (let p = 0; p <= d.length; p += 1) {
    while (bi < blocks.length && blocks[bi].at === p) {
      out.push(MERGE_BEGIN, ...blocks[bi].lines, MERGE_END);
      bi += 1;
    }
    if (p < d.length) out.push(d[p]);
  }
  return Buffer.from(out.join("\n") + (eol ? "\n" : ""), "utf8");
}
var BadJson = class extends Error {
};
var LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
var NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
var ESCAPES = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "	" };
function parseStrict(text2) {
  let i = 0;
  const ws = () => {
    while (i < text2.length && (text2[i] === " " || text2[i] === "	" || text2[i] === "\n" || text2[i] === "\r")) i += 1;
  };
  const str4 = () => {
    if (text2[i] !== '"') throw new BadJson("문자열");
    i += 1;
    let out = "";
    for (; ; ) {
      if (i >= text2.length) throw new BadJson("문자열 끝");
      const ch = text2[i];
      if (ch === '"') {
        i += 1;
        break;
      }
      if (ch < " ") throw new BadJson("제어 문자");
      if (ch === "\\") {
        const e = text2[i + 1];
        if (e === "u") {
          const hex = text2.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new BadJson("\\u");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (e !== void 0 && Object.hasOwn(ESCAPES, e)) {
          out += ESCAPES[e];
          i += 2;
        } else throw new BadJson("이스케이프");
      } else {
        out += ch;
        i += 1;
      }
    }
    if (LONE_SURROGATE.test(out)) throw new BadJson("짝 없는 서로게이트");
    return out;
  };
  const value = () => {
    ws();
    const ch = text2[i];
    if (ch === "{") {
      i += 1;
      const pairs = [];
      const keys = /* @__PURE__ */ new Set();
      ws();
      if (text2[i] === "}") {
        i += 1;
        return { t: "obj", pairs };
      }
      for (; ; ) {
        ws();
        const k = str4();
        if (keys.has(k)) throw new BadJson("같은 키");
        keys.add(k);
        ws();
        if (text2[i] !== ":") throw new BadJson(":");
        i += 1;
        pairs.push([k, value()]);
        ws();
        if (text2[i] === ",") {
          i += 1;
          continue;
        }
        if (text2[i] === "}") {
          i += 1;
          return { t: "obj", pairs };
        }
        throw new BadJson("객체");
      }
    }
    if (ch === "[") {
      i += 1;
      const items = [];
      ws();
      if (text2[i] === "]") {
        i += 1;
        return { t: "arr", items };
      }
      for (; ; ) {
        items.push(value());
        ws();
        if (text2[i] === ",") {
          i += 1;
          continue;
        }
        if (text2[i] === "]") {
          i += 1;
          return { t: "arr", items };
        }
        throw new BadJson("배열");
      }
    }
    if (ch === '"') return { t: "str", v: str4() };
    for (const lit of ["true", "false", "null"]) {
      if (text2.startsWith(lit, i)) {
        i += lit.length;
        return { t: "raw", v: lit };
      }
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text2);
    if (!m) throw new BadJson("값");
    i += m[0].length;
    return { t: "raw", v: m[0] };
  };
  const v = value();
  ws();
  if (i !== text2.length) throw new BadJson("끝 뒤 글자");
  return v;
}
function parseObject2(data) {
  const text2 = decode2(data);
  if (text2 === null) return null;
  try {
    const v = parseStrict(text2);
    return v.t === "obj" ? v : null;
  } catch {
    return null;
  }
}
function mergeObj(c, d) {
  const cMap = new Map(c.pairs);
  const dKeys = new Set(d.pairs.map(([k]) => k));
  const pairs = [];
  let extra = false;
  for (const [k, dv] of d.pairs) {
    const cv = cMap.get(k);
    if (cv?.t === "obj" && dv.t === "obj") {
      const r = mergeObj(cv, dv);
      pairs.push([k, r.v]);
      extra = extra || r.extra;
    } else pairs.push([k, dv]);
  }
  for (const [k, cv] of c.pairs) {
    if (!dKeys.has(k)) {
      pairs.push([k, cv]);
      extra = true;
    }
  }
  return { v: { t: "obj", pairs }, extra };
}
function dump2(v, level = 0) {
  const pad = "  ".repeat(level + 1);
  const end = "  ".repeat(level);
  switch (v.t) {
    case "obj":
      return v.pairs.length ? `{
${v.pairs.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${dump2(x, level + 1)}`).join(",\n")}
${end}}` : "{}";
    case "arr":
      return v.items.length ? `[
${v.items.map((x) => pad + dump2(x, level + 1)).join(",\n")}
${end}]` : "[]";
    case "str":
      return JSON.stringify(v.v);
    case "raw":
      return v.v;
  }
}
function mergeJson(current4, kit) {
  const c = parseObject2(current4);
  const d = parseObject2(kit);
  if (!c || !d) return null;
  const r = mergeObj(c, d);
  if (!r.extra) return kit;
  return Buffer.from(`${dump2(r.v)}
`, "utf8");
}
function backupStamp(d) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// src/core/v1-first-update.ts
var V1_MERGE_REASON = "v1 lock — 원본은 merge-backup 에 둔다";
var CLAUDE_MD = "CLAUDE.md";
var CLAUDE_BLOCK = "<!-- harness-kit:begin claude";
function full6(target, rel2) {
  return import_node_path19.default.join(target, ...rel2.split("/"));
}
function backupPath(stamp, rel2) {
  return `${MERGE_BACKUP_DIR}/${stamp}/${rel2}.orig`;
}
function recount(ops, like) {
  const counts2 = Object.fromEntries(Object.keys(like).map((k) => [k, 0]));
  for (const o of ops) counts2[o.action] += 1;
  return counts2;
}
function applyV1Merge(plan, opts) {
  if (opts.acceptAll || opts.ambiguous.size === 0) return { plan, merged: [], backups: [] };
  const merged = [];
  const backups = [];
  const kitSha = /* @__PURE__ */ new Map();
  const ops = plan.ops.map((o) => {
    if (o.action !== "conflict" || !opts.ambiguous.has(o.path) || !o.content || !o.sha256) return o;
    const cur = existing(full6(opts.target, o.path));
    if (cur.kind !== "file") return o;
    const r = planV1Merge(o.path, cur.bytes, o.content);
    if (r.kind === "new" || !r.content) return o;
    const backup = backupPath(opts.stamp, o.path);
    merged.push({ path: o.path, kind: r.kind, backup });
    backups.push({ path: backup, data: cur.bytes });
    kitSha.set(o.path, o.sha256);
    const rest = Object.fromEntries(Object.entries(o).filter(([k]) => k !== "newFile" && k !== "newRefreshed"));
    return { ...rest, action: r.kind === "kit" ? "update" : "merge", merge: r.kind, mergeBackup: backup, content: r.content, reason: V1_MERGE_REASON };
  });
  if (merged.length === 0) return { plan, merged, backups };
  const entries = plan.entries.map((e) => {
    const sha = kitSha.get(e.path);
    return sha ? { ...e, owner: "kit", sha256: sha } : e;
  });
  return { plan: { ...plan, ops, entries, counts: recount(ops, plan.counts) }, merged, backups };
}
function claudeBackup(args) {
  if (!args.inst.lockAmbiguous || !args.projection || !args.agents.includes("claude")) return null;
  const e = args.inst.lock.entries.find((x) => x.path === CLAUDE_MD);
  if (!e || e.op !== "copy" || ownerKind2(e.owner) !== "kit" || !e.sha256) return null;
  const cur = existing(full6(args.target, CLAUDE_MD));
  if (cur.kind !== "file" || sha256(cur.bytes) !== e.sha256) return null;
  if (cur.bytes.toString("utf8").split("\n").some((l) => l.startsWith(CLAUDE_BLOCK))) return null;
  const backup = backupPath(args.stamp, CLAUDE_MD);
  return { merged: { path: CLAUDE_MD, kind: "kit", backup }, backup: { path: backup, data: cur.bytes } };
}

// src/commands/local.ts
var import_node_fs19 = __toESM(require("node:fs"));
var import_node_path21 = __toESM(require("node:path"));

// src/core/local.ts
var import_node_child_process4 = require("node:child_process");
var import_node_fs18 = __toESM(require("node:fs"));
var import_node_path20 = __toESM(require("node:path"));
var LOCAL_DIR = ".agents/local";
var LOCAL_CONFIG = `${LOCAL_DIR}/harness-kit.local.json`;
var LOCAL_LOCK = `${LOCAL_DIR}/harness-kit.local.lock`;
var LOCAL_HOOKS = `${LOCAL_DIR}/hooks.json`;
var SETTINGS_LOCAL = ".claude/settings.local.json";
var LOCAL_LOCK_SCHEMA = "harness-kit.local-lock/v1";
var EXCLUDE_BEGIN = "# harness-kit local begin";
var EXCLUDE_END = "# harness-kit local end";
var isObj5 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function readLocalConfig(target) {
  const out = { roles: {}, ide: null, ignored: [], error: null, present: false };
  let raw;
  try {
    raw = JSON.parse(import_node_fs18.default.readFileSync(import_node_path20.default.join(target, ...LOCAL_CONFIG.split("/")), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") {
      out.present = true;
      out.error = err instanceof Error ? err.message : String(err);
    }
    return out;
  }
  out.present = true;
  if (!isObj5(raw)) {
    out.error = "최상위가 객체가 아니다";
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key === "roles" && isObj5(value)) {
      for (const [role, conf] of Object.entries(value)) {
        if (!isObj5(conf)) {
          out.ignored.push(`roles.${role}`);
          continue;
        }
        for (const [k, v] of Object.entries(conf)) {
          if (k === "harness" && typeof v === "string") out.roles[role] = v;
          else out.ignored.push(`roles.${role}.${k}`);
        }
      }
    } else if (key === "git" && isObj5(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (k === "ide" && typeof v === "string") out.ide = v;
        else out.ignored.push(`git.${k}`);
      }
    } else if (isObj5(value)) for (const k of Object.keys(value)) out.ignored.push(`${key}.${k}`);
    else out.ignored.push(key);
  }
  return out;
}
function listDir(target, rel2) {
  try {
    return import_node_fs18.default.readdirSync(import_node_path20.default.join(target, ...rel2.split("/")), { withFileTypes: true }).sort((a, b) => byteCompare(a.name, b.name));
  } catch {
    return [];
  }
}
function walk2(target, rel2) {
  const out = [];
  for (const e of listDir(target, rel2)) {
    const sub2 = `${rel2}/${e.name}`;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...walk2(target, sub2));
    else if (e.isFile() && !e.name.endsWith(".new") && e.name !== ".DS_Store") out.push(sub2);
  }
  return out;
}
function planLocal(target, agents, spec, sharedHookIds2) {
  const plan = { wants: [], settingsHooks: [], findings: [] };
  const exists = (rel2) => import_node_fs18.default.existsSync(import_node_path20.default.join(target, ...rel2.split("/")));
  for (const e of listDir(target, `${LOCAL_DIR}/skills`)) {
    if (!e.isDirectory() || !exists(`${LOCAL_DIR}/skills/${e.name}/SKILL.md`)) continue;
    if (exists(`.agents/skills/${e.name}`)) {
      plan.findings.push({ kind: "personal-shadowed", severity: "warn", path: `${LOCAL_DIR}/skills/${e.name}`, hint: `개인 스킬 ${e.name} 은 공유 스킬과 이름이 같아 배치하지 않았다` });
      continue;
    }
    const files = walk2(target, `${LOCAL_DIR}/skills/${e.name}`);
    for (const harness of ["claude", "kiro"].filter((h) => agents.includes(h)))
      for (const f of files) {
        const abs = import_node_path20.default.join(target, ...f.split("/"));
        plan.wants.push({ path: `.${harness}/skills/${e.name}/${f.slice(`${LOCAL_DIR}/skills/${e.name}/`.length)}`, content: import_node_fs18.default.readFileSync(abs), executable: (import_node_fs18.default.statSync(abs).mode & 73) !== 0 });
      }
    if (agents.includes("codex")) plan.findings.push({ kind: "personal-unsupported", severity: "info", path: `${LOCAL_DIR}/skills/${e.name}`, hint: "Codex 개인 스킬은 사용자 폴더(~/.codex/skills)에 둔다 — .agents/skills/ 는 공유 원본이다" });
  }
  for (const e of listDir(target, `${LOCAL_DIR}/rules`)) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const name = e.name.slice(0, -3);
    const rel2 = `${LOCAL_DIR}/rules/${e.name}`;
    if (exists(`.agents/rules/${e.name}`)) {
      plan.findings.push({ kind: "personal-shadowed", severity: "warn", path: rel2, hint: `개인 규칙 ${name} 은 공유 규칙과 이름이 같아 배치하지 않았다` });
      continue;
    }
    if (agents.includes("kiro")) plan.wants.push({ path: `.kiro/steering/local-${name}.md`, content: Buffer.from(renderKiroRule(parseRule(rel2, import_node_fs18.default.readFileSync(import_node_path20.default.join(target, ...rel2.split("/"))))), "utf8"), executable: false });
    if (agents.some((a) => a === "claude" || a === "codex")) plan.findings.push({ kind: "personal-unsupported", severity: "info", path: rel2, hint: "Claude · Codex 개인 규칙은 배치하지 않는다(개인 메모리 파일 지원 확인 전, 설계 04 §6)" });
  }
  let hooks = [];
  try {
    const text2 = exists(LOCAL_HOOKS) ? import_node_fs18.default.readFileSync(import_node_path20.default.join(target, ...LOCAL_HOOKS.split("/")), "utf8") : null;
    hooks = parseHooks(text2, spec.hookMap) ?? [];
  } catch (err) {
    plan.findings.push({ kind: "local-invalid", severity: "error", path: LOCAL_HOOKS, hint: err instanceof HooksError ? err.message : String(err) });
  }
  const kept = hooks.filter((h) => {
    if (FLOOR_HOOKS.includes(h.id) || sharedHookIds2.includes(h.id)) {
      plan.findings.push({ kind: "personal-floor", severity: FLOOR_HOOKS.includes(h.id) ? "error" : "warn", path: LOCAL_HOOKS, hint: `개인 훅 ${h.id} 는 공유 훅 id 와 같아 배치하지 않았다(개인 층은 더하기만 한다)` });
      return false;
    }
    return true;
  });
  if (agents.includes("claude")) plan.settingsHooks = settingsHooks(kept, "claude", spec.hookMap, []);
  if (agents.includes("kiro")) for (const f of kiroIdeFiles(kept, spec.hookMap, [])) plan.wants.push({ path: f.path.replace(".kiro/hooks/", ".kiro/hooks/local-"), content: Buffer.from(f.text, "utf8"), executable: false });
  if (kept.length && agents.includes("codex")) plan.findings.push({ kind: "personal-unsupported", severity: "info", path: LOCAL_HOOKS, hint: "Codex 는 개인 훅 파일이 없다 — 개인 훅은 Claude · Kiro 에만 붙는다" });
  return plan;
}
function readLocalLock(target) {
  try {
    const raw = JSON.parse(import_node_fs18.default.readFileSync(import_node_path20.default.join(target, ...LOCAL_LOCK.split("/")), "utf8"));
    return { schema: LOCAL_LOCK_SCHEMA, entries: Array.isArray(raw.entries) ? raw.entries : [], settingsKeys: Array.isArray(raw.settingsKeys) ? raw.settingsKeys : [] };
  } catch {
    return { schema: LOCAL_LOCK_SCHEMA, entries: [], settingsKeys: [] };
  }
}
function writeExclude(target, paths) {
  const r = (0, import_node_child_process4.spawnSync)("git", ["-C", target, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" });
  if (r.status !== 0) return;
  const file = import_node_path20.default.join(r.stdout.trim(), "info", "exclude");
  let text2 = "";
  try {
    text2 = import_node_fs18.default.readFileSync(file, "utf8");
  } catch {
    text2 = "";
  }
  const lines = text2.split("\n");
  const b = lines.indexOf(EXCLUDE_BEGIN);
  const e = lines.indexOf(EXCLUDE_END);
  const outside = b >= 0 && e > b ? [...lines.slice(0, b), ...lines.slice(e + 1)] : lines;
  const body = outside.join("\n").replace(/\n+$/, "");
  const block2 = paths.length ? [EXCLUDE_BEGIN, ...paths.map((p) => `/${p}`), EXCLUDE_END] : [];
  const next = `${[body, ...block2.length ? [block2.join("\n")] : []].filter(Boolean).join("\n")}
`;
  if (next !== text2) writeFileAtomic(file, Buffer.from(next, "utf8"), false);
}
function syncLocal(target, plan, dryRun) {
  const prev = readLocalLock(target);
  const res = { written: [], removed: [], kept: [], settings: "none", findings: plan.findings };
  const wantPaths = new Set(plan.wants.map((w) => w.path));
  const entries = [];
  for (const w of plan.wants) {
    const abs = import_node_path20.default.join(target, ...w.path.split("/"));
    const cur2 = import_node_fs18.default.existsSync(abs) ? sha256(import_node_fs18.default.readFileSync(abs)) : null;
    const want2 = sha256(w.content);
    const had = prev.entries.find((x) => x.path === w.path);
    if (cur2 !== null && cur2 !== want2 && !(had && had.sha256 === cur2)) {
      res.kept.push(w.path);
      continue;
    }
    if (cur2 !== want2) {
      res.written.push(w.path);
      if (!dryRun) writeFileAtomic(abs, w.content, w.executable);
    }
    entries.push({ path: w.path, sha256: want2 });
  }
  const gone = [];
  for (const e of prev.entries) {
    if (wantPaths.has(e.path)) continue;
    const abs = import_node_path20.default.join(target, ...e.path.split("/"));
    if (import_node_fs18.default.existsSync(abs) && sha256(import_node_fs18.default.readFileSync(abs)) !== e.sha256) {
      res.kept.push(e.path);
      continue;
    }
    res.removed.push(e.path);
    gone.push(e.path);
  }
  const settingsFile = import_node_path20.default.join(target, ...SETTINGS_LOCAL.split("/"));
  const cur = import_node_fs18.default.existsSync(settingsFile) ? import_node_fs18.default.readFileSync(settingsFile, "utf8") : null;
  const want = { ...settingsWant({ claudeSettings: { deny: [] } }, {}), hooks: plan.settingsHooks };
  let settingsKeys = [];
  if (plan.settingsHooks.length) {
    const r = MERGERS.settings.merge(cur, want, prev.settingsKeys);
    if (r.ok) {
      settingsKeys = r.keys;
      if (r.text !== cur) {
        res.settings = "merged";
        if (!dryRun) writeFileAtomic(settingsFile, Buffer.from(r.text, "utf8"), false);
      }
    } else res.settings = "conflict";
  } else if (cur !== null && prev.settingsKeys.length) {
    const r = MERGERS.settings.unmerge(cur, prev.settingsKeys, { ...want, hooks: [] });
    if (r.ok) {
      res.settings = "unmerged";
      if (!dryRun) {
        if (r.empty) removeFile(target, SETTINGS_LOCAL);
        else writeFileAtomic(settingsFile, Buffer.from(r.text, "utf8"), false);
      }
    }
  }
  if (!dryRun) {
    for (const p of gone) removeFile(target, p);
    removeEmptyDirs(target, gone);
    const lockFile = import_node_path20.default.join(target, ...LOCAL_LOCK.split("/"));
    const hasLocal = import_node_fs18.default.existsSync(import_node_path20.default.join(target, ...LOCAL_DIR.split("/")));
    if (entries.length || settingsKeys.length) writeFileAtomic(lockFile, Buffer.from(`${JSON.stringify({ schema: LOCAL_LOCK_SCHEMA, entries, settingsKeys }, null, 2)}
`, "utf8"), false);
    else if (hasLocal && import_node_fs18.default.existsSync(lockFile)) removeFile(target, LOCAL_LOCK);
    writeExclude(target, [...entries.map((e) => e.path), ...settingsKeys.length ? [SETTINGS_LOCAL] : []].sort(byteCompare));
  }
  return res;
}

// src/commands/local.ts
function sharedHookIds(target, spec) {
  const read = (rel2) => {
    try {
      return import_node_fs19.default.readFileSync(import_node_path21.default.join(target, ...rel2.split("/")), "utf8");
    } catch {
      return null;
    }
  };
  const kit = read(HOOKS_REL);
  if (kit === null) return [];
  let names = [];
  try {
    names = import_node_fs19.default.readdirSync(import_node_path21.default.join(target, ...HOOKS_DIR.split("/")));
  } catch {
    names = [];
  }
  const docs = [{ rel: HOOKS_REL, text: kit }, ...hookDocPaths(names).map((rel2) => ({ rel: rel2, text: read(rel2) ?? "" }))];
  try {
    return mergeHookDocs(docs, spec.hookMap, FLOOR_HOOKS).hooks.map((h) => h.id);
  } catch {
    return [];
  }
}
function localAfter(ctx, target, inst, templatesDir, dryRun) {
  if (!import_node_fs19.default.existsSync(import_node_path21.default.join(target, ...LOCAL_DIR.split("/")))) return null;
  const spec = loadSpec(templatesDir);
  const plan = planLocal(target, inst.meta.agents, spec, sharedHookIds(target, spec));
  const result = syncLocal(target, plan, dryRun);
  return { result, lines: localLines(result, readLocalConfig(target).ignored, ctx.quiet) };
}
function localLines(r, ignored, quiet) {
  const lines = [`  개인 층: 씀 ${r.written.length} · 지움 ${r.removed.length} · 남김(고침) ${r.kept.length} · settings.local.json ${r.settings}`];
  if (!quiet) {
    lines.push(...r.written.map((p) => `    + ${p}`), ...r.removed.map((p) => `    - ${p}`), ...r.kept.map((p) => `    ↷ ${p}  (사람이 고쳤다 — 두었다)`));
    lines.push(...r.findings.map((f) => `    ${f.severity === "error" ? "✖" : f.severity === "warn" ? "⚠" : "·"} ${f.kind} ${f.path} — ${f.hint}`));
    if (ignored.length) lines.push(`    ⚠ 개인 설정에서 무시한 키: ${ignored.join(" · ")}(개인 층은 roles.<역할>.harness · git.ide 만 바꾼다)`);
  }
  return lines;
}
function runLocal(ctx) {
  const [sub2, ...rest] = ctx.positionals;
  if (sub2 !== "sync" && sub2 !== "list" || rest.length) throw usageError("harness-kit local sync [--dry-run] | local list [--json]");
  const target = targetOf(ctx);
  const inst = loadInstalled(target, `local ${sub2}`);
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: ctx.io.env, cliFile: ctx.io.cliFile, cwd: ctx.io.cwd, version: VERSION });
  const config = readLocalConfig(target);
  const spec = loadSpec(loc.dir);
  const plan = planLocal(target, inst.meta.agents, spec, sharedHookIds(target, spec));
  const dryRun = sub2 === "list" || bool(ctx.values, "dry-run");
  const result = syncLocal(target, plan, dryRun);
  const data = { command: "local", sub: sub2, target, dryRun, config: { roles: config.roles, ide: config.ide, ignored: config.ignored, error: config.error }, plan: plan.wants.map((w) => w.path), ...result };
  const lines = [
    `harness-kit local ${sub2} — ${target}`,
    `  설정: ${config.present ? config.error ? `✖ ${config.error}` : `roles ${JSON.stringify(config.roles)} · git.ide ${config.ide ?? "-"}` : "없음(.agents/local/harness-kit.local.json)"}`,
    ...localLines(result, config.ignored, ctx.quiet),
    ...dryRun ? ["  (쓰지 않았다)"] : []
  ];
  const bad4 = plan.findings.some((f) => f.severity === "error") || result.settings === "conflict" || Boolean(config.error);
  return { code: bad4 ? EXIT.HUMAN : EXIT.OK, data, lines };
}

// src/commands/update-packs.ts
var import_node_fs20 = __toESM(require("node:fs"));
var import_node_path22 = __toESM(require("node:path"));
function full7(target, rel2) {
  return import_node_path22.default.join(target, ...rel2.split("/"));
}
function current2(target, rel2) {
  try {
    const st = import_node_fs20.default.lstatSync(full7(target, rel2));
    if (!st.isFile()) return { kind: "other" };
    return { kind: "file", sha: sha256(import_node_fs20.default.readFileSync(full7(target, rel2))) };
  } catch {
    return { kind: "none" };
  }
}
var isPack = (owner) => owner.startsWith("pack:");
function judgeWant(target, dest, w, owner, e, live) {
  const cur = current2(target, dest);
  const entry = { path: dest, op: "copy", owner, sha256: w.sha256, layer: w.layer };
  const op = (action, extra = {}) => ({ path: dest, op: "copy", owner, layer: w.layer, action, content: w.content, sha256: w.sha256, executable: w.executable, ...extra });
  if (cur.kind === "other") return { op: { path: dest, op: "copy", owner: e?.owner ?? "user", layer: w.layer, action: "skip-user", reason: "파일이 아닌 것이 있다" }, entry: e ?? null };
  if (e?.owner.startsWith("external:")) return { op: { path: dest, op: e.op, owner: e.owner, layer: e.layer ?? null, action: "skip-external" }, entry: e };
  if (!e) {
    if (cur.kind === "none") return { op: op("new"), entry };
    if (cur.sha === w.sha256) return { op: op("same"), entry };
    return { op: { path: dest, op: "copy", owner: "user", layer: w.layer, action: "skip-user", reason: "사람이 둔 파일이다(팩 판과 다르다)" }, entry: { path: dest, op: "copy", owner: "user", sha256: null, layer: w.layer } };
  }
  if (e.owner === "user") {
    if (cur.kind === "file" && cur.sha === w.sha256) return { op: op("same", { reason: "프로젝트 판이 팩 판과 같아 주인을 팩으로 바꾼다" }), entry };
    return { op: { path: dest, op: e.op, owner: "user", layer: e.layer ?? null, action: "skip-user", reason: "프로젝트 판이 팩 판과 다르다" }, entry: e };
  }
  const mine = e.owner === owner;
  if (isPack(e.owner) && !mine && live.has(e.owner)) return { op: op("conflict", { reason: `${e.owner} 와 겹친다` }), entry: e };
  if (cur.kind === "none") return { op: op(mine ? "restore" : "new"), entry };
  if (cur.sha === w.sha256) return { op: op("same"), entry };
  if (e.sha256 && cur.sha === e.sha256) return { op: op("update", mine ? {} : { reason: `${e.owner}${e.layer ? `(${e.layer})` : ""} → ${owner}` }), entry };
  return { op: op("conflict", { newFile: `${dest}.new` }), entry: e };
}
function judgeGone(target, e, kit) {
  const cur = current2(target, e.path);
  const unmodified = cur.kind === "none" || cur.kind === "file" && e.sha256 !== void 0 && e.sha256 !== null && cur.sha === e.sha256;
  const k = kit.get(e.path);
  if (k) {
    if (unmodified) return { op: { path: e.path, op: "copy", owner: "kit", layer: k.layer, action: cur.kind === "none" ? "restore" : "update", content: k.content, sha256: k.sha256, executable: k.executable, reason: `${e.owner} 가 뺐다 — 킷 판으로` }, entry: { path: e.path, op: "copy", owner: "kit", sha256: k.sha256, layer: k.layer } };
    return { op: { path: e.path, op: "copy", owner: "user", layer: e.layer ?? null, action: "orphan", modified: true, reason: `${e.owner} 가 뺐고 사람이 고쳤다 — 주인을 user 로` }, entry: { ...e, owner: "user", sha256: null } };
  }
  if (cur.kind === "none") return { op: { path: e.path, op: "copy", owner: e.owner, layer: e.layer ?? null, action: "delete", reason: "파일이 이미 없다" }, entry: null };
  if (unmodified) return { op: { path: e.path, op: "copy", owner: e.owner, layer: e.layer ?? null, action: "delete", removeFile: true }, entry: null };
  return { op: { path: e.path, op: "copy", owner: "user", layer: e.layer ?? null, action: "orphan", modified: true, reason: `${e.owner} 가 뺐고 사람이 고쳤다 — 주인을 user 로` }, entry: { ...e, owner: "user", sha256: null } };
}
function conflictsBetween(plans) {
  const seen = /* @__PURE__ */ new Map();
  const out = [];
  for (const { pack, wants } of plans) {
    const me = `pack:${pack.manifest.name}@${pack.manifest.version}`;
    for (const dest of wants.keys()) {
      const other = seen.get(dest);
      if (other) out.push(`  ${dest.padEnd(44)} ${other}  ↔  ${me}`);
      else seen.set(dest, me);
    }
    for (const id of [...(pack.manifest.provides.hooks ?? []).map((h) => `hooks.json id ${h}`), ...(pack.manifest.provides.verifyChecks ?? []).map((c) => `verify-checks id ${c}`)]) {
      const other = seen.get(id);
      if (other) out.push(`  ${id.padEnd(44)} ${other}  ↔  ${me}`);
      else seen.set(id, me);
    }
  }
  return out;
}
function applyPacks(target, ops, lockText2, projection) {
  let currentPath = "";
  try {
    const deleted = [];
    for (const o of ops) {
      currentPath = o.path;
      if ((o.action === "new" || o.action === "restore" || o.action === "update") && o.content) writeFileAtomic(full7(target, o.path), o.content, o.executable === true);
      else if (o.action === "conflict" && o.newFile && o.content) writeFileAtomic(full7(target, o.newFile), o.content, false);
      else if (o.action === "delete" && o.removeFile) {
        removeFile(target, o.path);
        deleted.push(o.path);
      }
    }
    removeEmptyDirs(target, deleted);
    currentPath = "배치(mirror · render · merge)";
    if (projection) applyProjection(target, projection);
    currentPath = LOCK_REL;
    writeFileAtomic(full7(target, LOCK_REL), Buffer.from(lockText2, "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${currentPath}`);
  }
}
function runUpdatePacks(ctx) {
  const { io: io2 } = ctx;
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "update --packs");
  if (inst.lockFormat !== "v2") throw new CliError(EXIT.STATE, "팩은 lock v2 에서만 깐다", "먼저 harness-kit update 로 lock 을 v2 로 올린다");
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
  const layout2 = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout2, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout2, selection, inst.meta, io2.env, target);
  const kit = wanted({ layout: layout2, templatesDir: loc.dir, selection, tokens }).want;
  const sources = Array.isArray(inst.meta.packs) ? inst.meta.packs.filter((s) => typeof s === "string") : [];
  const fetched = sources.map((s) => fetchPack(target, s, io2.env));
  const plans = fetched.map((pack) => ({ pack, ...planPack(pack, { layout: layout2, selection, tokens, hookMap: loadSpec(loc.dir).hookMap, kitPaths: new Set(kit.keys()), kitVersion: VERSION }) }));
  const names = fetched.map((p) => p.manifest.name);
  const problems = plans.flatMap((p) => p.problems);
  for (const n of new Set(names)) if (names.filter((x) => x === n).length > 1) problems.push(`팩 이름 ${n} 이 packs 에 두 번 있다`);
  if (problems.length) throw new CliError(EXIT.STATE, `팩 검사 ${problems.length}건 — 아무것도 쓰지 않았다
${problems.map((p) => `  ${p}`).join("\n")}`, "팩을 고쳐 새 판을 내거나 packs 에서 뺀다");
  const clash = conflictsBetween(plans);
  if (clash.length) {
    const lines2 = [`✖ 팩 충돌 ${clash.length}건 — 아무것도 쓰지 않았다`, ...clash, "  해결: 한 팩에서 빼고 새 판을 낸다. 또는 프로젝트가 직접 관리한다: harness-kit update --forget <경로>(주인을 user 로)"];
    return { code: EXIT.HUMAN, data: { command: "update", packs: true, target, conflicts: clash.map((l) => l.trim()) }, lines: lines2 };
  }
  const byPath = new Map(inst.lock.entries.map((e) => [e.path, e]));
  const live = new Set(fetched.map((p) => `pack:${p.manifest.name}`));
  const ops = [];
  const entries = /* @__PURE__ */ new Map();
  for (const { pack, wants } of plans) {
    const owner = `pack:${pack.manifest.name}`;
    for (const dest of [...wants.keys()].sort(byteCompare)) {
      const j = judgeWant(target, dest, wants.get(dest), owner, byPath.get(dest), live);
      ops.push(j.op);
      entries.set(dest, j.entry);
    }
  }
  const wantedNow = new Set(plans.flatMap((p) => [...p.wants.keys()]));
  for (const e of inst.lock.entries) {
    if (!isPack(e.owner) || wantedNow.has(e.path) || PROJECTION_OPS.has(e.op)) continue;
    const j = judgeGone(target, e, kit);
    ops.push(j.op);
    entries.set(e.path, j.entry);
  }
  const copyEntries = inst.lock.entries.filter((e) => !entries.has(e.path)).concat([...entries.values()].filter((e) => e !== null));
  const plan = { ops, entries: copyEntries, counts: {}, overlaps: [], excludedByHarness: 0, wantPaths: new Set(copyEntries.filter((e) => e.op === "copy").map((e) => e.path)) };
  const projection = projectionForUpdate({ target, templatesDir: loc.dir, tokens, agents: selection.agents, inst, plan, acceptAll: false });
  const records = fetched.map((p) => ({ name: p.manifest.name, version: p.manifest.version, source: p.source, resolved: p.resolved, requiresKit: p.manifest.requires.kit }));
  const finalEntries = projection ? mergeEntries(copyEntries, projection.plan) : copyEntries;
  const lockText2 = serializeLock({ ...inst.lock, packs: records, entries: finalEntries.sort((a, b) => byteCompare(a.path, b.path)) });
  const dryRun = bool(ctx.values, "dry-run");
  if (!dryRun) applyPacks(target, ops, lockText2, projection?.plan.ops ?? null);
  const conflict = ops.filter((o) => o.action === "conflict");
  const human = conflict.length > 0 || ops.some((o) => o.action === "orphan") || (projection ? needsHuman(projection.plan, projection.findings) : false);
  const shown = ops.filter((o) => o.action !== "same" || o.reason);
  const lines = [
    `harness-kit update --packs — ${target}`,
    ...records.map((r) => `  팩: ${r.name}@${r.version}  ${r.source}  (${r.resolved.slice(0, 19)})`),
    ...records.length ? [] : ["  packs 가 비었다 — 팩 파일을 뺀다"],
    ...shown.map((o) => `  ${o.action.padEnd(10)} ${o.path}${o.reason ? `  ${o.reason}` : ""}`),
    `  팩 파일: ${["new", "update", "restore", "same", "conflict", "delete", "orphan", "skip-user"].map((a) => `${a} ${ops.filter((o) => o.action === a).length}`).join(" · ")}`,
    ...projection ? projectionLines(projection.plan, projection.findings, ctx.quiet) : [],
    ...conflict.length ? ["  충돌 — 사람이 고친 파일이라 덮지 않았다. 새 판은 .new 에 있다"] : [],
    dryRun ? "  (dry-run — 쓰지 않았다)" : "  다음: harness-kit doctor --only overrides"
  ];
  const data = {
    command: "update",
    packs: true,
    target,
    dryRun,
    records,
    ops: shown.map((o) => ({ path: o.path, owner: o.owner, layer: o.layer, action: o.action, ...o.reason ? { reason: o.reason } : {}, ...o.newFile ? { new: o.newFile } : {} })),
    conflicts: [...conflict.map((o) => ({ path: o.path, new: o.newFile ?? null })), ...projectionConflicts(projection?.plan ?? null)]
  };
  if (projection) data.projection = projectionData(projection.plan, projection.findings);
  return { code: human ? EXIT.HUMAN : EXIT.OK, data, lines };
}

// src/commands/update.ts
var V1_LOCK_BACKUP = ".agents/state/harness-kit.lock.v1.bak";
var LATER_FLAGS = {
  tools: "--tools(외부 도구 갱신)는 P22(외부 도구 모듈, 설계 10)에서 제공한다"
};
function full8(target, rel2) {
  return import_node_path23.default.join(target, ...rel2.split("/"));
}
function checkFlags(ctx) {
  for (const [flag, message2] of Object.entries(LATER_FLAGS)) if (bool(ctx.values, flag)) throw usageError(message2);
  const to = str(ctx.values, "to");
  if (to === void 0 || to === VERSION) return to;
  if (/[:#/]/.test(to)) throw usageError(`--to 에 소스는 아직 받지 않는다: '${to}'`, "다른 템플릿 폴더는 --templates <폴더> 로 준다");
  throw usageError(`이 CLI 는 ${VERSION} 판만 깐다: --to ${to}`, `그 판은 npx harness-kit@${to} update 로 올린다`);
}
function checkPackRanges(packs) {
  for (const p of packs) {
    const r = p;
    if (typeof r.requiresKit !== "string" || satisfiesKit(VERSION, r.requiresKit)) continue;
    throw new CliError(EXIT.STATE, `팩 ${String(r.name)} ${String(r.version)} 은 kit ${r.requiresKit} 을 요구한다(이 CLI ${VERSION})`, "팩을 올리거나(update --packs) kit 판을 맞춘다");
  }
}
function checkVersion(installed, to) {
  const cmp2 = compareSemver(installed, VERSION);
  if (cmp2 !== null && cmp2 > 0 && to !== VERSION) {
    throw new CliError(EXIT.STATE, `설치된 킷(${installed})이 이 CLI(${VERSION})보다 새것이다`, `새 CLI 로 다시 실행한다. 내리려면 harness-kit update --to ${VERSION}`);
  }
}
var NEEDS_DATA = /* @__PURE__ */ new Set(["new", "restore", "update", "replace", "conflict", "merge"]);
var WRITES = /* @__PURE__ */ new Set(["new", "restore", "update", "merge"]);
function opJson(o) {
  const j = { path: o.path, op: o.op, owner: o.owner, layer: o.layer, action: o.action };
  if (NEEDS_DATA.has(o.action)) j.executable = o.executable;
  if (o.reason !== void 0) j.reason = o.reason;
  if (o.newFile !== void 0) j.new = o.newFile;
  if (o.newRefreshed) j.newRefreshed = true;
  if (o.backup !== void 0) j.backup = o.backup;
  if (o.merge !== void 0) j.merge = o.merge;
  if (o.mergeBackup !== void 0) j.backup = o.mergeBackup;
  if (o.modified !== void 0) j.modified = o.modified;
  return j;
}
function opLine(o) {
  let extra = "";
  if (o.action === "conflict") extra = o.newFile ? `  → ${o.newFile}${o.newRefreshed ? " (갱신)" : ""}` : "";
  else if (o.action === "replace") extra = `  (수정본 → ${o.backup})`;
  else if (o.action === "orphan" && o.modified) extra = "  (고친 파일)";
  else if (o.merge) extra = `  (${o.merge})`;
  return `  ${o.action.padEnd(13)} ${o.path}${extra}${o.reason ? `  ${o.reason}` : ""}`;
}
function countsLine(c) {
  const skipped = c["skip-user"] + c["skip-external"] + c["skip-pack"];
  return `  파일: 새로 ${c.new} · 되살림 ${c.restore} · 교체 ${c.update} · 병합 ${c.merge} · 같음 ${c.same} · 충돌 ${c.conflict} · 덮음(.bak) ${c.replace} · 킷에서 빠짐 ${c.orphan} · 지움 ${c.delete} · 건너뜀 ${skipped} · 받지 않기로 함 ${c.forget}`;
}
function selectionLine(sel) {
  return `  선택: ${sel.stack} · ${sel.arch} · ${sel.domain || "도메인 없음"} · 하네스 ${sel.agents.join(",")} · 모듈 ${sel.modules.join(",") || "none"}`;
}
function applyUpdate(target, plan, w, projection) {
  let current4 = "";
  try {
    for (const b of w.mergeBackups) {
      current4 = b.path;
      writeFileAtomic(full8(target, b.path), b.data, false);
    }
    const deleted = [];
    for (const o of plan.ops) {
      current4 = o.path;
      if (WRITES.has(o.action)) writeFileAtomic(full8(target, o.path), o.content, o.executable === true);
      else if (o.action === "replace") {
        import_node_fs21.default.renameSync(full8(target, o.path), full8(target, o.backup));
        writeFileAtomic(full8(target, o.path), o.content, o.executable === true);
      } else if (o.action === "conflict" && o.newFile) writeFileAtomic(full8(target, o.newFile), o.content, false);
      else if (o.action === "delete" && o.removeFile) {
        removeFile(target, o.path);
        deleted.push(o.path);
      }
    }
    removeEmptyDirs(target, deleted);
    current4 = "배치(mirror · render · merge)";
    if (projection) applyProjection(target, projection.ops);
    const state = [
      [MANIFEST_PATH, w.manifest],
      [V1_LOCK_BACKUP, w.v1Backup],
      [LOCK_REL, Buffer.from(w.lockText, "utf8")],
      [META_REL, Buffer.from(w.metaText, "utf8")]
    ];
    for (const [rel2, data] of state) {
      current4 = rel2;
      if (data) writeFileAtomic(full8(target, rel2), data, false);
    }
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current4}`);
  }
}
function conflictList(plan) {
  return plan.ops.filter((o) => o.action === "conflict").map((o) => ({ path: o.path, new: o.newFile ?? null, diff: o.newFile ? `diff -u ${shellQuote(o.path)} ${shellQuote(o.newFile)}` : null }));
}
function mergedLines(merged, backupDir) {
  if (merged.length === 0) return [];
  const n = merged.filter((m) => m.kind !== "kit").length;
  const lines = [`  v1 lock 첫 업데이트 — 병합 ${n} · 킷 판 ${merged.length - n}(원본: ${backupDir}/)`];
  for (const m of merged) {
    if (m.kind !== "kit") lines.push(`    ${m.kind}  ${m.path}`);
    else if (m.path === "CLAUDE.md") lines.push("    kit    CLAUDE.md   (배치가 새 파일로 바꿨다 — 사람이 쓴 내용이면 원본에서 블록 밖으로 옮긴다)");
  }
  if (n) lines.push("    병합본의 '<!-- harness-kit: 설치 전 내용(병합) -->' 묶음을 보고 필요 없으면 지운다");
  return lines;
}
function humanLines(ctx, head, plan, shown, conflicts, dryRun, board, merged, backupDir) {
  const lines = [...head, ...shown.map(opLine), countsLine(plan.counts), ...mergedLines(merged, backupDir)];
  const b = boardLine(board);
  if (b) lines.push(b);
  if (conflicts.length) {
    lines.push("  충돌 — 고친 파일이라 덮지 않았다. 새 판은 .new 에 있다(리포 폴더에서):");
    for (const c of conflicts) if (c.diff) lines.push(`    ${String(c.diff)}`);
    lines.push("  병합했으면 .new 를 지운다. 새 판을 그대로 쓰려면 mv 로 덮는다. 전부 새 판으로: harness-kit update --accept-all");
  }
  if (plan.ops.some((o) => o.action === "orphan") && !bool(ctx.values, "prune")) lines.push("  킷에서 빠진 미수정 파일을 지우려면: harness-kit update --prune");
  lines.push(dryRun ? "  (dry-run — 쓰지 않았다)" : "  다음: harness-kit doctor");
  return lines;
}
function writtenState(ctx, target, inst, entries, sel, tokens, source, mergeBackups) {
  const lockText2 = serializeLock({ schema: "harness-kit.lock/v2", kit: { version: VERSION, source }, packs: inst.lock.packs, entries });
  const meta = mergeMetaForUpdate(inst.meta, { version: VERSION, selection: sel, tokens, today: today(ctx.io) });
  const manifest = lstatOrNull(full8(target, MANIFEST_PATH)) ? null : manifestContent(sel, tokens);
  const v1Backup = inst.lockFormat === "v1" ? import_node_fs21.default.readFileSync(full8(target, LOCK_REL)) : null;
  return { lockText: lockText2, metaText: serializeMeta(meta), manifest, v1Backup, mergeBackups };
}
var ANY_SKIP = /* @__PURE__ */ new Set(["conflict", "skip-user", "skip-external", "skip-pack"]);
function boardBlocker(plan) {
  return plan.ops.find((o) => isBoardCode(o.path) && ANY_SKIP.has(o.action))?.path ?? null;
}
var AMBIGUOUS_ACTIONS = /* @__PURE__ */ new Set(["conflict", "replace", "orphan"]);
function runUpdate(ctx) {
  const { io: io2 } = ctx;
  if (bool(ctx.values, "packs")) return runUpdatePacks(ctx);
  const to = checkFlags(ctx);
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "update");
  checkVersion(inst.meta.kit.version, to);
  checkPackRanges(inst.lock.packs);
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
  const layout2 = loadLayout(loc.dir);
  const { selection, droppedModules, retiredModules } = selectionFromMeta(layout2, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout2, selection, inst.meta, io2.env, target);
  const prune = bool(ctx.values, "prune");
  const shaOf2 = () => new Map([...wanted({ layout: layout2, templatesDir: loc.dir, selection, tokens }).want].map(([p, d]) => [p, d.sha256]));
  const { lock, ambiguous } = resolvedLock(inst, target, shaOf2);
  const acceptAll = bool(ctx.values, "accept-all");
  const raw = buildUpdatePlan({ layout: layout2, templatesDir: loc.dir, target, selection, tokens, lock, acceptAll, prune, forget: list(ctx.values, "forget") });
  const marked = { ...raw, ops: raw.ops.map((o) => ambiguous.has(o.path) && AMBIGUOUS_ACTIONS.has(o.action) && !o.reason ? { ...o, reason: AMBIGUOUS_REASON } : o) };
  const stamp = backupStamp(/* @__PURE__ */ new Date());
  const v1 = applyV1Merge(marked, { target, ambiguous, acceptAll, stamp });
  const projection = projectionForUpdate({ target, templatesDir: loc.dir, tokens, agents: selection.agents, inst, plan: v1.plan, acceptAll });
  const claude2 = claudeBackup({ target, inst, agents: selection.agents, projection: projection !== null, stamp });
  const merged = [...v1.merged, ...claude2 ? [claude2.merged] : []].sort((a, b) => byteCompare(a.path, b.path));
  const mergeBackups = [...v1.backups, ...claude2 ? [claude2.backup] : []];
  const plan = withoutClaimed(v1.plan, projection?.plan ?? null);
  const entries = projection ? mergeEntries(plan.entries, projection.plan) : [...plan.entries, ...inst.lock.entries.filter((e) => PROJECTION_OPS.has(e.op))];
  const dryRun = bool(ctx.values, "dry-run");
  const w = writtenState(ctx, target, inst, entries, selection, tokens, loc.source, mergeBackups);
  const notice = noticeFor(target, loc.dir, inst.meta.kit.version, today(ctx.io));
  if (!dryRun) {
    applyUpdate(target, plan, w, projection?.plan ?? null);
    applyNotice(target, notice);
  }
  const board = dryRun ? { status: "skipped", reason: "dry-run" } : refreshBoard(target, io2.env, boardBlocker(plan));
  const keptModified = prune && plan.ops.some((o) => o.action === "orphan" && o.modified);
  const human = projection ? needsHuman(projection.plan, projection.findings) : false;
  const code = plan.counts.conflict > 0 || keptModified || human ? EXIT.HUMAN : EXIT.OK;
  const shown = plan.ops.filter((o) => o.action !== "same" && (!ctx.quiet || o.action === "conflict"));
  const conflicts = [...conflictList(plan), ...projectionConflicts(projection?.plan ?? null)];
  const counts2 = { ...plan.counts, excludedByHarness: plan.excludedByHarness, overlapped: plan.overlaps.length };
  const data = {
    command: "update",
    target,
    templates: loc.dir,
    dryRun,
    kit: { from: inst.meta.kit.version, to: VERSION },
    formats: { meta: inst.metaFormat, lock: inst.lockFormat },
    selection: { stack: selection.stack, arch: selection.arch, domain: selection.domain, agents: selection.agents, modules: selection.modules },
    droppedModules,
    retiredModules,
    counts: counts2,
    ops: shown.map(opJson),
    conflicts,
    merged,
    generated: w.manifest ? [{ path: MANIFEST_PATH, action: "create" }] : [],
    board,
    notice: { path: NOTICE_REL, action: notice.action },
    state: [META_REL, LOCK_REL, ...w.v1Backup ? [V1_LOCK_BACKUP] : []]
  };
  if (projection) data.projection = projectionData(projection.plan, projection.findings);
  const head = [
    `harness-kit update — ${target}`,
    `  킷: ${inst.meta.kit.version} → ${VERSION} · 메타 ${inst.metaFormat} · lock ${inst.lockFormat}`,
    selectionLine(selection),
    ...retiredModules.map((m) => retiredNote(m, "meta")),
    ...droppedModules.length ? [`  ⚠ 킷에 없는 모듈을 뺀다: ${droppedModules.join(", ")}`] : []
  ];
  const lines = humanLines(ctx, head, plan, shown, conflicts, dryRun, board, merged, `${MERGE_BACKUP_DIR}/${stamp}`);
  const noticeLine = NOTICE_LINES[notice.action];
  if (noticeLine) lines.splice(lines.length - 1, 0, `  ${noticeLine}`);
  const local = localAfter(ctx, target, inst, loc.dir, dryRun);
  if (local) {
    data.local = local.result;
    lines.splice(lines.length - 1, 0, ...local.lines);
  }
  if (projection) lines.splice(head.length + shown.length + 1, 0, ...projectionLines(projection.plan, projection.findings, ctx.quiet));
  else if (inst.lock.entries.some((e) => PROJECTION_OPS.has(e.op))) lines.splice(head.length + shown.length + 1, 0, "  배치: 이 템플릿에 projection.json 이 없다 — 배치 항목은 그대로 둔다");
  return { code, data, lines };
}
var NOTICE_LINES = {
  write: `업그레이드 공지: ${NOTICE_REL} (세션 시작 때 제목 한 줄이 붙는다, 30일 뒤 만료 — 커밋하면 동료도 받는다)`,
  delete: `만료된 업그레이드 공지를 지웠다: ${NOTICE_REL}`,
  "keep-human": `업그레이드 공지: ${NOTICE_REL} 가 사람이 만든 파일이라 쓰지 않았다`,
  none: null
};
function noticeFor(target, templatesDir, from, day) {
  const read = (file) => {
    try {
      return import_node_fs21.default.readFileSync(file, "utf8");
    } catch {
      return null;
    }
  };
  return planNotice({ upgradeText: read(import_node_path23.default.join(templatesDir, UPGRADE_FILE)), from, to: VERSION, today: day, existing: read(full8(target, NOTICE_REL)) });
}
function applyNotice(target, notice) {
  try {
    if (notice.action === "write" && notice.text !== void 0) writeFileAtomic(full8(target, NOTICE_REL), Buffer.from(notice.text, "utf8"), false);
    else if (notice.action === "delete") removeFile(target, NOTICE_REL);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${NOTICE_REL}`);
  }
}
function projectionForUpdate(args) {
  const spec = loadSpecOrNull(args.templatesDir);
  if (!spec) return null;
  const writes = /* @__PURE__ */ new Map();
  const deletes = /* @__PURE__ */ new Set();
  for (const o of args.plan.ops) {
    if ((WRITES.has(o.action) || o.action === "replace") && o.content) writes.set(o.path, { content: o.content, executable: o.executable === true });
    else if (o.action === "conflict" && o.newFile && o.content) writes.set(o.newFile, { content: o.content, executable: false });
    else if (o.action === "delete" && o.removeFile) deletes.add(o.path);
  }
  const p = prepare({ target: args.target, spec, tokens: args.tokens, agents: args.agents, writes, deletes, copyPaths: args.plan.wantPaths });
  const plan = judgeUpdate({ target: args.target, spec, tokens: args.tokens, sources: p.sources, wants: p.wants, prev: args.inst.lock.entries, copyNow: args.plan.wantPaths, acceptAll: args.acceptAll, retire: true });
  return { plan, findings: p.findings };
}
function withoutClaimed(plan, projection) {
  if (!projection || projection.claimed.size === 0) return plan;
  const ops = plan.ops.filter((o) => !projection.claimed.has(o.path));
  const counts2 = Object.fromEntries(Object.keys(plan.counts).map((k) => [k, 0]));
  for (const o of ops) counts2[o.action] += 1;
  return { ...plan, ops, counts: counts2, entries: plan.entries.filter((e) => !projection.claimed.has(e.path)) };
}

// src/commands/change.ts
var CHANGE_ACTIONS = [
  "create",
  "restore",
  "same",
  "keep",
  "relayer",
  "update",
  "conflict",
  "delete",
  "absent",
  "keep-modified",
  "skip-user",
  "skip-external",
  "skip-pack",
  "keep-user"
];
var QUIET = /* @__PURE__ */ new Set(["keep", "same", "absent", "keep-user"]);
function kitOf(ctx) {
  const { io: io2 } = ctx;
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
  return { loc, layout: loadLayout(loc.dir) };
}
function loadForChange(ctx, command, kit) {
  const { io: io2 } = ctx;
  const target = targetOf(ctx);
  const inst = loadInstalled(target, command);
  const cmp2 = compareSemver(inst.meta.kit.version, VERSION);
  if (cmp2 !== null && cmp2 > 0) {
    throw new CliError(EXIT.STATE, `설치된 킷(${inst.meta.kit.version})이 이 CLI(${VERSION})보다 새것이다`, "새 CLI 로 다시 실행한다");
  }
  const { loc, layout: layout2 } = kit;
  const { selection, droppedModules, retiredModules } = selectionFromMeta(layout2, loc.dir, inst.meta);
  return { target, inst, layout: layout2, loc, before: selection, tokens: tokensFromMeta(layout2, selection, inst.meta, io2.env, target), droppedModules, retiredModules };
}
function currentOf(target, ancestors, rel2) {
  if (ancestors.state(rel2) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(import_node_path24.default.join(target, ...rel2.split("/")));
  return cur.kind === "file" ? { kind: "file", sha: sha256(cur.bytes) } : cur;
}
function ancestorsOf(target) {
  return new AncestorCheck(target, import_node_fs22.default.realpathSync(target));
}
var isKitCopy = (e) => ownerKind2(e.owner) === "kit" && e.op === "copy";
function manifestChange(l, ancestors, after) {
  if (l.before.agents.join(",") === after.agents.join(",")) return null;
  const want = manifestContent(after, l.tokens);
  if (ancestors.state(MANIFEST_PATH) === "blocked") return { action: "conflict", content: want };
  const cur = existing(import_node_path24.default.join(l.target, ...MANIFEST_PATH.split("/")));
  if (cur.kind === "none") return { action: "create", content: want };
  if (cur.kind === "file" && cur.bytes.equals(want)) return { action: "same", content: want };
  if (cur.kind === "file" && cur.bytes.equals(manifestContent(l.before, l.tokens))) return { action: "replace", content: want };
  const neu = `${MANIFEST_PATH}.new`;
  return existing(import_node_path24.default.join(l.target, ...neu.split("/"))).kind === "other" ? { action: "conflict", content: want } : { action: "conflict", content: want, newFile: neu };
}
function featureDocsAllowed2(target, entries) {
  const docs = entries.filter((e) => e.path.startsWith(`${import_node_path24.default.posix.dirname(FEATURE_DOCS)}/`));
  if (!docs.some((e) => e.path === FEATURE_DOCS)) return false;
  return docs.every((e) => {
    if (!isKitCopy(e) || !e.sha256) return false;
    const cur = existing(import_node_path24.default.join(target, ...e.path.split("/")));
    return cur.kind === "file" && sha256(cur.bytes) === e.sha256;
  });
}
function changeOverlay(ops) {
  const writes = /* @__PURE__ */ new Map();
  const deletes = /* @__PURE__ */ new Set();
  for (const o of ops) {
    if ((o.action === "create" || o.action === "restore" || o.action === "update") && o.content) writes.set(o.path, { content: o.content, executable: o.executable === true });
    else if (o.action === "delete") deletes.add(o.path);
  }
  return { writes, deletes };
}
function applyChange(ctx, l, after, r) {
  const { target, inst } = l;
  const full11 = (rel2) => import_node_path24.default.join(target, ...rel2.split("/"));
  let current4 = "";
  try {
    const deleted = [];
    for (const o of r.ops) {
      current4 = o.path;
      if ((o.action === "create" || o.action === "restore" || o.action === "update") && o.content) writeFileAtomic(full11(o.path), o.content, o.executable === true);
      else if (o.action === "conflict" && o.newFile && o.content) writeFileAtomic(full11(o.newFile), o.content, false);
      else if (o.action === "delete") {
        removeFile(target, o.path);
        deleted.push(o.path);
        if (o.alsoNew) removeFile(target, o.alsoNew);
      }
    }
    removeEmptyDirs(target, deleted);
    current4 = "배치(mirror · render · merge)";
    if (r.projection) applyProjection(target, r.projection.ops);
    const m = r.manifest;
    current4 = MANIFEST_PATH;
    if (m && (m.action === "create" || m.action === "replace")) writeFileAtomic(full11(MANIFEST_PATH), m.content, false);
    if (m?.action === "conflict" && m.newFile) writeFileAtomic(full11(m.newFile), m.content, false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current4}`);
  }
  const docs = featureDocsAllowed2(target, r.entries) ? buildFeatureDocs(target, ctx.io.env) : { status: "skipped", reason: "tools/docs/ 에 킷 판이 아닌 파일이 있다" };
  const entries = r.projection ? mergeEntries(r.entries, r.projection) : r.entries;
  const lockText2 = serializeLock({ schema: "harness-kit.lock/v2", kit: { version: inst.lock.kit.version ?? inst.meta.kit.version, source: inst.lock.kit.source }, packs: inst.lock.packs, entries });
  const meta = mergeMetaForUpdate(inst.meta, { version: inst.meta.kit.version, selection: after, tokens: l.tokens, today: today(ctx.io) });
  const state = [
    ...inst.lockFormat === "v1" ? [[V1_LOCK_BACKUP, import_node_fs22.default.readFileSync(full11(LOCK_REL))]] : [],
    [LOCK_REL, Buffer.from(lockText2, "utf8")],
    [META_REL, Buffer.from(serializeMeta(meta), "utf8")]
  ];
  try {
    for (const [rel2, data] of state) {
      current4 = rel2;
      writeFileAtomic(full11(rel2), data, false);
    }
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current4}`);
  }
  return docs;
}
function conflictsOf(r) {
  const out = r.ops.filter((o) => o.action === "conflict").map((o) => ({ path: o.path, new: o.newFile ?? null, diff: o.newFile ? `diff -u ${shellQuote(o.path)} ${shellQuote(o.newFile)}` : null }));
  out.push(...projectionConflicts(r.projection ?? null));
  if (r.manifest?.action === "conflict") {
    const n = r.manifest.newFile;
    out.push({ path: MANIFEST_PATH, new: n ?? null, diff: n ? `diff -u ${shellQuote(MANIFEST_PATH)} ${shellQuote(n)}` : null });
  }
  return out;
}
function countsOf(ops) {
  const c = Object.fromEntries(CHANGE_ACTIONS.map((a) => [a, 0]));
  for (const o of ops) c[o.action] += 1;
  return c;
}
function opJson2(o) {
  const j = { path: o.path, owner: o.owner, layer: o.layer, action: o.action };
  if (o.executable !== void 0 && o.content) j.executable = o.executable;
  if (o.reason !== void 0) j.reason = o.reason;
  if (o.newFile !== void 0) j.new = o.newFile;
  return j;
}
var opLine2 = (o) => `  ${o.action.padEnd(13)} ${o.path}${o.newFile ? `  → ${o.newFile}` : ""}${o.reason ? `  ${o.reason}` : ""}`;
var selJson = (s) => ({ stack: s.stack, arch: s.arch, domain: s.domain, agents: s.agents, modules: s.modules });
function report(ctx, l, rep) {
  const shown = rep.result.ops.filter((o) => !QUIET.has(o.action) && (!ctx.quiet || o.action === "conflict" || o.action === "keep-modified"));
  const conflicts = conflictsOf(rep.result);
  const m = rep.result.manifest;
  const data = {
    command: rep.command,
    target: l.target,
    templates: l.loc.dir,
    dryRun: rep.dryRun,
    names: rep.names,
    selection: { before: selJson(l.before), after: selJson(rep.after) },
    droppedModules: l.droppedModules,
    retiredModules: l.retiredModules,
    formats: { meta: l.inst.metaFormat, lock: l.inst.lockFormat },
    counts: countsOf(rep.result.ops),
    ops: shown.map(opJson2),
    conflicts,
    ...rep.extra ?? {},
    generated: m && m.action !== "same" ? [{ path: MANIFEST_PATH, action: m.action, ...m.newFile ? { new: m.newFile } : {} }] : [],
    featureDocs: rep.featureDocs,
    state: [META_REL, LOCK_REL, ...l.inst.lockFormat === "v1" ? [V1_LOCK_BACKUP] : []]
  };
  const projection = projectionData(rep.result.projection ?? null, rep.result.projectionFindings ?? []);
  if (projection) data.projection = projection;
  const counts2 = Object.entries(countsOf(rep.result.ops)).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(" · ");
  const lines = [
    `harness-kit ${rep.command} — ${l.target}`,
    `  하네스 ${l.before.agents.join(",")} → ${rep.after.agents.join(",")} · 모듈 ${l.before.modules.join(",") || "none"} → ${rep.after.modules.join(",") || "none"}`,
    ...rep.notes,
    ...l.retiredModules.map((m2) => retiredNote(m2, "meta")),
    ...l.droppedModules.length ? [`  ⚠ 킷에 없는 모듈을 메타에서 뺀다: ${l.droppedModules.join(", ")}`] : [],
    ...shown.map(opLine2),
    `  파일: ${counts2 || "바꿀 것 없음"}`,
    ...projectionLines(rep.result.projection ?? null, rep.result.projectionFindings ?? [], ctx.quiet)
  ];
  if (m && m.action !== "same") lines.push(`  매니페스트 ${MANIFEST_PATH}: ${m.action}${m.newFile ? ` → ${m.newFile}` : ""}`);
  if (conflicts.length) {
    lines.push("  충돌 — 고친 파일이라 덮지 않았다. 새 판은 .new 에 있다(리포 폴더에서):");
    for (const c of conflicts) if (c.diff) lines.push(`    ${String(c.diff)}`);
  }
  lines.push(rep.dryRun ? "  (dry-run — 쓰지 않았다)" : "  다음: harness-kit doctor");
  return { data, lines };
}
var dryRunOf = (ctx) => bool(ctx.values, "dry-run");
function retiredOnly(ctx, command, names) {
  if (names.harnesses.length + names.modules.length > 0) return null;
  const target = targetOf(ctx);
  return {
    code: EXIT.OK,
    data: { command, target, dryRun: dryRunOf(ctx), names },
    lines: [`harness-kit ${command} — ${target}`, ...names.retired.map((m) => retiredNote(m, "flag"))]
  };
}
var retiredNotes = (names) => names.retired.map((m) => retiredNote(m, "flag"));

// src/commands/add.ts
var kitEntry3 = (p, w) => ({ path: p, op: "copy", owner: "kit", sha256: w.sha256, layer: w.layer });
var userEntry3 = (p, layer) => ({ path: p, op: "copy", owner: "user", sha256: null, layer });
function withD2(p, w, action) {
  return { path: p, owner: "kit", layer: w.layer, action, executable: w.executable, content: w.content };
}
function judgeShare(p, w, e, cur) {
  const skip = e ? skipByOwner(e) : null;
  if (e && skip) return { op: { path: p, owner: e.owner, layer: e.layer ?? w.layer, action: skip.action, ...skip.reason ? { reason: skip.reason } : {} }, entry: e };
  if (cur.kind === "other") return { op: { path: p, owner: e?.owner ?? "user", layer: w.layer, action: "skip-user", reason: cur.what }, entry: e ?? userEntry3(p, w.layer) };
  if (cur.kind === "none") return { op: withD2(p, w, e ? "restore" : "create"), entry: kitEntry3(p, w) };
  if (!e) {
    if (cur.sha === w.sha256) return { op: { path: p, owner: "kit", layer: w.layer, action: "same" }, entry: kitEntry3(p, w) };
    return { op: { path: p, owner: "user", layer: w.layer, action: "skip-user", reason: "사람이 둔 파일이다" }, entry: userEntry3(p, w.layer) };
  }
  return { op: { path: p, owner: e.owner, layer: w.layer, action: "keep" }, entry: { ...e, layer: w.layer } };
}
function planAdd(l, names) {
  const after = withNames(l.before, names);
  const afterLayers = winnerLayers(l.layout, l.loc.dir, after, l.tokens);
  const beforeLayers = winnerLayers(l.layout, l.loc.dir, l.before, l.tokens);
  const { want } = wanted({ layout: l.layout, templatesDir: l.loc.dir, selection: after, tokens: l.tokens });
  const { lock } = resolvedLock(l.inst, l.target, () => new Map([...want].map(([p2, d]) => [p2, d.sha256])));
  const locked = new Map(lock.entries.map((e) => [e.path, e]));
  const share = shareOf(l.layout, l.loc.dir, after, names, l.tokens, afterLayers);
  const ancestors = ancestorsOf(l.target);
  const ops = [];
  for (const p2 of [...share].sort(byteCompare)) {
    const j = judgeShare(p2, want.get(p2), locked.get(p2), currentOf(l.target, ancestors, p2));
    ops.push(j.op);
    if (j.entry) locked.set(p2, j.entry);
  }
  for (const p2 of relayered(beforeLayers, afterLayers, share)) {
    const e = locked.get(p2);
    if (!e || !isKitCopy(e)) continue;
    const layer = afterLayers.get(p2);
    ops.push({ path: p2, owner: e.owner, layer, action: "relayer", reason: "이기는 판이 바뀌었다 — 내용은 update 가 맞춘다" });
    locked.set(p2, { ...e, layer });
  }
  const manifest = manifestChange(l, ancestors, after);
  const spec = loadSpecOrNull(l.loc.dir);
  if (!spec) return { after, result: { ops, entries: [...locked.values()], manifest, projection: null } };
  const { writes, deletes } = changeOverlay(ops);
  const p = prepare({ target: l.target, spec, tokens: l.tokens, agents: after.agents, writes, deletes, copyPaths: want.keys() });
  const projection = judgeInstall({ target: l.target, spec, tokens: l.tokens, sources: p.sources, wants: p.wants, prev: l.inst.lock.entries, force: false });
  return { after, result: { ops, entries: [...locked.values()], manifest, projection, projectionFindings: p.findings } };
}
function runAdd(ctx) {
  const kit = kitOf(ctx);
  const names = parseNames(kit.layout, ctx.positionals, "add");
  const only = retiredOnly(ctx, "add", names);
  if (only) return { ...only, data: { ...only.data, names: { ...names, already: [] } } };
  assertModuleDirs(kit.loc.dir, names.modules);
  const l = loadForChange(ctx, "add", kit);
  const already = [...names.harnesses.filter((h) => l.before.agents.includes(h)), ...names.modules.filter((m) => l.before.modules.includes(m))];
  const { after, result } = planAdd(l, names);
  const dryRun = dryRunOf(ctx);
  const featureDocs = dryRun ? null : applyChange(ctx, l, after, result);
  const notes = [...retiredNotes(names), ...already.length ? [`  · 이미 켜져 있다 — 그 몫에서 빠진 파일만 채운다: ${already.join(", ")}`] : []];
  const { data, lines } = report(ctx, l, { command: "add", names: { ...names, already }, after, result, dryRun, featureDocs, notes });
  const conflict = result.ops.some((o) => o.action === "conflict") || result.manifest?.action === "conflict" || needsHuman(result.projection ?? null, result.projectionFindings ?? []);
  return { code: conflict ? EXIT.HUMAN : EXIT.OK, data, lines };
}

// src/commands/dashboard.ts
var import_node_child_process9 = require("node:child_process");
var import_node_path48 = __toESM(require("node:path"));

// ../dashboard/src/export.ts
var import_node_fs32 = __toESM(require("node:fs"));
var import_node_os = __toESM(require("node:os"));
var import_node_path35 = __toESM(require("node:path"));

// ../dashboard/src/flow.ts
var import_node_fs25 = __toESM(require("node:fs"));
var import_node_path27 = __toESM(require("node:path"));

// ../dashboard/src/util.ts
var import_node_child_process5 = require("node:child_process");
var import_node_crypto4 = __toESM(require("node:crypto"));
var import_node_fs23 = __toESM(require("node:fs"));
var import_node_path25 = __toESM(require("node:path"));
function sha2562(data) {
  return import_node_crypto4.default.createHash("sha256").update(data).digest("hex");
}
function atomicWrite(file, data, mode) {
  const dir = import_node_path25.default.dirname(file);
  import_node_fs23.default.mkdirSync(dir, { recursive: true });
  const tmp = import_node_path25.default.join(dir, `.${import_node_path25.default.basename(file)}.${import_node_crypto4.default.randomBytes(4).toString("hex")}.tmp`);
  let keep = mode;
  try {
    const st = import_node_fs23.default.lstatSync(file);
    if (st.isFile()) keep = st.mode & 511;
  } catch {
  }
  const fd = import_node_fs23.default.openSync(tmp, import_node_fs23.default.constants.O_WRONLY | import_node_fs23.default.constants.O_CREAT | import_node_fs23.default.constants.O_EXCL, keep ?? 420);
  try {
    import_node_fs23.default.writeSync(fd, typeof data === "string" ? Buffer.from(data, "utf8") : data);
    import_node_fs23.default.fsyncSync(fd);
  } finally {
    import_node_fs23.default.closeSync(fd);
  }
  if (keep !== void 0) import_node_fs23.default.chmodSync(tmp, keep);
  import_node_fs23.default.renameSync(tmp, file);
}
function ensureDir(dir, mode) {
  import_node_fs23.default.mkdirSync(dir, { recursive: true, mode });
  import_node_fs23.default.chmodSync(dir, mode);
}
var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulid(now = Date.now()) {
  let value = BigInt(Math.floor(now)) << 80n | BigInt(`0x${import_node_crypto4.default.randomBytes(10).toString("hex")}`);
  let out = "";
  for (let i = 0; i < 26; i += 1) {
    out = CROCKFORD[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return out;
}
function nowText(d = /* @__PURE__ */ new Date()) {
  const p = (n) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
}
function childEnv(env) {
  const out = { ...env, PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME, GIT_TERMINAL_PROMPT: "0", PYTHONDONTWRITEBYTECODE: "1" };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG", "GIT_PREFIX"]) delete out[k];
  return out;
}
function run2(cmd, args, opts) {
  return new Promise((resolve) => {
    (0, import_node_child_process5.execFile)(cmd, args, { cwd: opts.cwd, env: childEnv(opts.env), timeout: opts.timeout ?? 3e4, maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024, encoding: "utf8" }, (err, stdout, stderr) => {
      const code = err ? typeof err.code === "number" ? err.code : 1 : 0;
      resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}
function git(cwd, env, ...args) {
  return run2("git", ["--no-optional-locks", "-c", "core.quotePath=false", ...args], { cwd, env });
}
async function gitOut(cwd, env, ...args) {
  const r = await git(cwd, env, ...args);
  return r.code === 0 ? r.stdout.replace(/\n$/, "") : null;
}
function python(cwd, env, args, timeout = 6e4) {
  return run2("python3", ["-B", ...args], { cwd, env, timeout });
}
function readJson(file) {
  try {
    const v = JSON.parse(import_node_fs23.default.readFileSync(file, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
function isObj6(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function rel(from, to) {
  return import_node_path25.default.relative(from, to).split(import_node_path25.default.sep).join("/") || ".";
}
function oneLine(s) {
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

// ../dashboard/src/approvals.ts
var HEADING = /^## (\S+) · ([a-z]+(?:\/F-\d+)?) · (approved|changes-requested|risk-accepted|fix-required)$/;
var TITLE = /^# 승인 기록 — (\S+)\s*$/;
var FIELD = /^- ([^:]+):\s*([^\n]*?)\s*$/;
var TIME = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]{1,6})?(?:Z|([+-])([0-9]{2}):([0-9]{2}))$/;
var APPROVER = /^([^\s@()]+@[^\s@()]+)(?: \(([^()]*)\))?(?: · 그룹: (\S+))?$/;
var ENTRY_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
var TARGET_PARTS = [
  ["sha256", /^sha256: ([0-9a-f]{64})$/],
  ["fingerprint", /^지문: ([0-9a-f]{12,64})$/],
  ["head", /^head: ([0-9a-f]{7,40})$/]
];
var PATHS = ["terminal", "dashboard", "jira", "aidlc"];
var DOC_GATES = ["codebase", "intent", "plans", "requirements", "design", "tasks", "deploy"];
var GATES = ["codebase", "intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"];
var REVIEW_GATE = /^review\/(F-\d+)$/;
var GATE_DECISIONS = ["approved", "changes-requested"];
var REVIEW_DECISIONS = ["risk-accepted", "fix-required"];
var FIELDS2 = {
  승인자: "approver",
  대상: "target",
  문구: "phrase",
  경로: "path",
  "기록 ID": "entryId",
  근거: "evidence",
  source: "source",
  "규칙 후보": "ruleCandidate",
  "롤백 면제": "rollbackWaiver"
};
var FORMAT_NOTE = "<!-- 덧붙이기만 한다. 에이전트는 이 파일을 쓰지 않는다. 형식과 승인 경로: .agents/rules/approval-vocabulary.md -->";
function newEntry(line, at, gate, decision) {
  return { line, at, gate, decision, approver: null, target: null, phrase: null, path: null, entryId: null, source: null, evidence: null, ruleCandidate: false, rollbackWaiver: null, errors: [], valid: true };
}
var DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function validTime(value) {
  const m = TIME.exec(value);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (y < 1 || mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return false;
  const leap = y % 4 === 0 && y % 100 !== 0 || y % 400 === 0;
  const max = mo === 2 && leap ? 29 : DAYS[mo - 1];
  if (d < 1 || d > max) return false;
  if (m[7]) {
    const oh = Number(m[8]);
    const om = Number(m[9]);
    if (om > 59 || oh * 60 + om >= 24 * 60) return false;
  }
  return true;
}
function parseTarget(value) {
  const parts = value.split(" · ");
  if (!parts[0]) return null;
  const target = { name: parts[0], sha256: null, fingerprint: null, head: null };
  for (const part of parts.slice(1)) {
    let matched = false;
    for (const [key, re] of TARGET_PARTS) {
      const m = re.exec(part);
      if (m && target[key] === null) {
        target[key] = m[1];
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }
  return target;
}
function unquote(value) {
  return value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"' ? value.slice(1, -1) : value;
}
function setField(entry, seen, name, value) {
  const key = Object.hasOwn(FIELDS2, name) ? FIELDS2[name] : void 0;
  if (key === void 0) return ["unknown-field"];
  if (seen.has(key)) return ["duplicate-field"];
  seen.add(key);
  if (key === "approver") {
    const m = APPROVER.exec(value);
    if (!m) return ["bad-approver"];
    entry.approver = { email: m[1], name: m[2] ?? null, group: m[3] ?? null };
  } else if (key === "target") {
    entry.target = parseTarget(value);
    return entry.target ? [] : ["bad-target"];
  } else if (key === "phrase") {
    entry.phrase = unquote(value);
  } else if (key === "ruleCandidate") {
    if (value !== "예") return ["bad-rule-candidate"];
    entry.ruleCandidate = true;
  } else {
    entry[key] = value;
  }
  return [];
}
function gateErrors(entry) {
  const errors = [];
  if (!validTime(entry.at)) errors.push("bad-time");
  const review = REVIEW_GATE.test(entry.gate);
  if (!review && !GATES.includes(entry.gate)) errors.push("unknown-gate");
  const allowed2 = review ? REVIEW_DECISIONS : GATE_DECISIONS;
  if ((GATES.includes(entry.gate) || review) && !allowed2.includes(entry.decision)) errors.push("decision-mismatch");
  return errors;
}
function requiredErrors(entry, seen) {
  const errors = [];
  const p = entry.path;
  if (!seen.has("approver")) errors.push("missing-approver");
  if (!seen.has("target")) errors.push("missing-target");
  else if (entry.target) {
    if (DOC_GATES.includes(entry.gate) && !entry.target.sha256) errors.push("bad-target");
    if (REVIEW_GATE.test(entry.gate) && !entry.target.fingerprint) errors.push("bad-target");
  }
  if (!seen.has("path") || !p) errors.push("missing-path");
  else if (!PATHS.includes(p)) errors.push("unknown-path");
  if ((p === "terminal" || p === "dashboard") && !entry.phrase) errors.push("missing-phrase");
  if ((p === "jira" || p === "aidlc") && !entry.evidence) errors.push("missing-evidence");
  if (p === "aidlc" && entry.source !== "aidlc") errors.push("missing-source");
  if (!seen.has("entryId") || !entry.entryId) errors.push("missing-entry-id");
  else if (!ENTRY_ID.test(entry.entryId)) errors.push("bad-entry-id");
  if (seen.has("ruleCandidate") && entry.decision !== "changes-requested") errors.push("field-not-allowed");
  if (seen.has("rollbackWaiver") && entry.gate !== "deploy") errors.push("field-not-allowed");
  return errors;
}
function finish(entry, seen, errors, ids2) {
  const all = [...errors, ...gateErrors(entry), ...requiredErrors(entry, seen)];
  if (entry.entryId && ENTRY_ID.test(entry.entryId)) {
    if (ids2.has(entry.entryId)) all.push("duplicate-entry-id");
    ids2.add(entry.entryId);
  }
  entry.errors = [...new Set(all)].sort();
  entry.valid = entry.errors.length === 0;
  return entry;
}
function parse(text2) {
  const src = typeof text2 === "string" ? text2 : Buffer.from(text2).toString("utf8");
  let key = null;
  const entries = [];
  const fileErrors = [];
  const ids2 = /* @__PURE__ */ new Set();
  let current4 = null;
  let seen = /* @__PURE__ */ new Set();
  let errors = [];
  let skipping = false;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const number = i + 1;
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("## ")) {
      if (current4) entries.push(finish(current4, seen, errors, ids2));
      current4 = null;
      seen = /* @__PURE__ */ new Set();
      errors = [];
      const m = HEADING.exec(line);
      if (!m) {
        fileErrors.push({ line: number, code: "bad-heading" });
        skipping = true;
        continue;
      }
      skipping = false;
      current4 = newEntry(number, m[1], m[2], m[3]);
      continue;
    }
    if (current4 === null) {
      const t = TITLE.exec(line);
      if (t && key === null && entries.length === 0 && !skipping) key = t[1];
      continue;
    }
    if (!line.trim() || line.trimStart().startsWith("<!--")) continue;
    const f = FIELD.exec(line);
    if (!f) {
      errors.push("stray-line");
      continue;
    }
    errors.push(...setField(current4, seen, f[1].trim(), f[2]));
  }
  if (current4) entries.push(finish(current4, seen, errors, ids2));
  return { key, entries, errors: fileErrors };
}
function allowed(email, gate, policy) {
  const approvers = policy?.approvers ?? {};
  const names = Object.hasOwn(approvers, gate) ? approvers[gate] : void 0;
  if (!names || names.length === 0) return true;
  const groups = policy?.groups ?? {};
  const wanted2 = (email ?? "").toLowerCase();
  for (const name of names) {
    if (name.includes("@")) {
      if (name.toLowerCase() === wanted2) return true;
    } else {
      const members = (Object.hasOwn(groups, name) ? groups[name] : void 0) ?? [];
      if (members.some((m) => m.toLowerCase() === wanted2)) return true;
    }
  }
  return false;
}
function groupOf(email, gate, policy) {
  const approvers = policy?.approvers ?? {};
  const groups = policy?.groups ?? {};
  for (const item of (Object.hasOwn(approvers, gate) ? approvers[gate] : void 0) ?? []) {
    if (item.includes("@")) continue;
    const members = (Object.hasOwn(groups, item) ? groups[item] : void 0) ?? [];
    if (members.some((m) => m.toLowerCase() === email.toLowerCase())) return item;
  }
  return null;
}
function approvalState(entries, gate, sha = null, policy = null) {
  let found = entries.filter((e) => e.valid && e.gate === gate && e.decision === "approved");
  if (found.length === 0) return "none";
  if (sha !== null && sha !== void 0) {
    found = found.filter((e) => e.target && e.target.sha256 === sha);
    if (found.length === 0) return "stale";
  }
  return found.some((e) => allowed(e.approver?.email, gate, policy)) ? "valid" : "invalid";
}
function splitKeep(data) {
  const out = [];
  let start = 0;
  for (let i = 0; i < data.length; i += 1) {
    const c = data[i];
    if (c === 10 || c === 13) {
      const end = c === 13 && data[i + 1] === 10 ? i + 2 : i + 1;
      out.push(data.subarray(start, end));
      start = end;
      i = end - 1;
    }
  }
  if (start < data.length) out.push(data.subarray(start));
  return out;
}
function bare(line) {
  let end = line.length;
  while (end > 0 && (line[end - 1] === 10 || line[end - 1] === 13)) end -= 1;
  return line.subarray(0, end).toString("latin1");
}
function approvalSha(input) {
  const data = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const lines = splitKeep(data);
  if (lines.length === 0 || bare(lines[0]) !== "---") return sha2562(data);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (bare(lines[i]) === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return sha2562(data);
  const kept = lines.filter((l, i) => !(i > 0 && i < end && /^(status|state):/.test(l.toString("latin1"))));
  return sha2562(Buffer.concat(kept));
}
function newFileText(key) {
  return `# 승인 기록 — ${key}

${FORMAT_NOTE}
`;
}
function renderEntry(entry) {
  const a = entry.approver;
  const who = a.email + (a.name ? ` (${a.name})` : "") + (a.group ? ` · 그룹: ${a.group}` : "");
  const t = entry.target;
  const parts = [t.name];
  if (t.sha256) parts.push(`sha256: ${t.sha256}`);
  if (t.fingerprint) parts.push(`지문: ${t.fingerprint}`);
  if (t.head) parts.push(`head: ${t.head}`);
  const phrase = String(entry.phrase ?? "").split(/\s+/).filter(Boolean).join(" ");
  const lines = [`## ${entry.at} · ${entry.gate} · ${entry.decision}`, `- 승인자: ${who}`, `- 대상: ${parts.join(" · ")}`];
  if (phrase) lines.push(`- 문구: "${phrase}"`);
  lines.push(`- 경로: ${entry.path}`);
  if (entry.ruleCandidate) lines.push("- 규칙 후보: 예");
  if (entry.rollbackWaiver) lines.push(`- 롤백 면제: ${entry.rollbackWaiver}`);
  lines.push(`- 기록 ID: ${entry.entryId}`);
  return `${lines.join("\n")}
`;
}
function appendedText(current4, key, entries) {
  let text2 = current4 ?? newFileText(key);
  if (text2 && !text2.endsWith("\n")) text2 += "\n";
  for (const e of entries) text2 += `
${renderEntry(e)}`;
  return text2;
}
function policyOf(meta) {
  const m = meta ?? {};
  const pick = (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out = {};
    for (const [k, x] of Object.entries(v)) if (Array.isArray(x)) out[k] = x.filter((s) => typeof s === "string");
    return out;
  };
  return { approvers: pick(m.approvers), groups: pick(m.groups) };
}

// ../dashboard/src/cache.ts
var import_node_fs24 = __toESM(require("node:fs"));
var import_node_path26 = __toESM(require("node:path"));
function fileStamp(file) {
  try {
    const st = import_node_fs24.default.statSync(file);
    return `${file}:${st.mtimeMs}:${st.size}:${st.ino}`;
  } catch {
    return `${file}:-`;
  }
}
function treeStamp(dir, depth = 4, filter = () => true) {
  const out = [];
  const walk3 = (d, left) => {
    let names;
    try {
      names = import_node_fs24.default.readdirSync(d).sort();
    } catch {
      out.push(`${d}:-`);
      return;
    }
    for (const n of names) {
      if (!filter(n)) continue;
      const f = import_node_path26.default.join(d, n);
      let st;
      try {
        st = import_node_fs24.default.lstatSync(f);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        out.push(`${f}/`);
        if (left > 0) walk3(f, left - 1);
      } else out.push(`${f}:${st.mtimeMs}:${st.size}:${st.ino}${st.isSymbolicLink() ? ":l" : ""}`);
    }
  };
  walk3(dir, depth);
  return out.join("\n");
}
var Cache = class {
  items = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  async get(key, stamp, compute, ttlMs) {
    const hit = this.items.get(key);
    if (hit && hit.stamp === stamp && (ttlMs === void 0 || Date.now() - hit.computedAt < ttlMs)) return hit.value;
    const running = this.pending.get(key);
    if (running && running.stamp === stamp) return running.promise;
    const promise = (async () => {
      const value = await compute();
      this.items.set(key, { stamp, value, computedAt: Date.now() });
      return value;
    })();
    this.pending.set(key, { stamp, promise });
    try {
      return await promise;
    } finally {
      if (this.pending.get(key)?.promise === promise) this.pending.delete(key);
    }
  }
};

// ../dashboard/src/errors.ts
var ApiError = class extends Error {
  status;
  code;
  details;
  constructor(status, code, message2, details) {
    super(message2);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
  body() {
    return { ok: false, error: { code: this.code, message: this.message, ...this.details ? { details: this.details } : {} } };
  }
};
var bad3 = (message2, details) => new ApiError(400, "bad_request", message2, details);
var notFound = (message2) => new ApiError(404, "not_found", message2);
var forbiddenPath = (p) => new ApiError(403, "forbidden_path", `쓰기 허용 경로가 아니다: ${p.slice(0, 200)}`);
var readOnly = () => new ApiError(403, "read_only", "읽기 전용 모드다(에이전트 세션 또는 --read-only). 사람이 자기 터미널에서 연 관리 페이지에서 한다");
var notImplemented = (stage, what) => new ApiError(501, "not_implemented", `${what}은(는) ${stage}에서 제공한다`, { stage });

// ../dashboard/src/frontmatter.ts
var LINE = /^([a-z][a-zA-Z0-9]*):\s*([^\n]*?)(\s+#[^\n]*)?$/;
var FENCE = "---";
var FrontmatterError = class extends Error {
};
function split(text2) {
  const lines = text2.split("\n");
  if (lines.length === 0 || lines[0].replace(/\r$/, "") !== FENCE) return [null, text2];
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].replace(/\r$/, "") === FENCE) return [lines.slice(1, i), lines.slice(i + 1).join("\n")];
  }
  throw new FrontmatterError("frontmatter is not closed with ---");
}
function unquote2(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) return value.slice(1, -1);
  return value;
}
function parse2(text2) {
  const [head] = split(text2);
  if (head === null) return null;
  const fields = {};
  head.forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) return;
    const m = LINE.exec(line);
    if (!m) throw new FrontmatterError(`invalid frontmatter line ${i + 2}: ${JSON.stringify(line)}`);
    const key = m[1];
    if (Object.hasOwn(fields, key)) throw new FrontmatterError(`duplicate frontmatter key '${key}'`);
    fields[key] = unquote2(m[2].trim());
  });
  return fields;
}
function parseLoose(text2) {
  try {
    return parse2(text2);
  } catch {
    return {};
  }
}
function setField2(text2, key, value) {
  const eol = text2.includes("\r\n") ? "\r\n" : "\n";
  const lines = text2.split("\n");
  if ((lines[0] ?? "").replace(/\r$/, "") !== FENCE) return `${FENCE}${eol}${key}: ${value}${eol}${FENCE}${eol}${text2}`;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].replace(/\r$/, "") === FENCE) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new FrontmatterError("frontmatter is not closed with ---");
  const re = new RegExp(`^${key}:`);
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (re.test(line)) {
      const cr2 = line.endsWith("\r") ? "\r" : "";
      const comment = /(\s+#[^\n]*?)\r?$/.exec(line.replace(/^[^:]*:\s*/, ""))?.[1] ?? "";
      lines[i] = `${key}: ${value}${comment}${cr2}`;
      return lines.join("\n");
    }
  }
  const cr = eol === "\r\n" ? "\r" : "";
  lines.splice(end, 0, `${key}: ${value}${cr}`);
  return lines.join("\n");
}

// ../dashboard/src/questions.ts
var HEAD = /^## (Q-\d+) · (범위|보안|개인정보|UX|기술|운영) · 답할 직무: ([a-z][a-z0-9-]*)(?: · 막는 게이트: ([a-z]+))?\s*$/;
var CHOICE = /^- ([A-D])\. (.+?) — 영향: (.+)$/;
var RECOMMEND = /^- 권장: ([A-D])\b/;
var ANSWER = /^- 답:\s*(.*)$/;
function parseQuestions(text2) {
  const lines = text2.split("\n").map((l) => l.replace(/\r$/, ""));
  const questions = [];
  let cur = null;
  lines.forEach((line, i) => {
    const h = HEAD.exec(line);
    if (h) {
      cur = { id: h[1], category: h[2], role: h[3], blocks: h[4] ?? null, text: "", choices: [], recommended: null, answer: null, open: true, notes: [], opinions: [], line: i + 1 };
      questions.push(cur);
      return;
    }
    if (line.startsWith("## ") || line.startsWith("# ")) {
      cur = null;
      return;
    }
    const q2 = cur;
    if (!q2) return;
    const c = CHOICE.exec(line);
    const r = RECOMMEND.exec(line);
    const a = ANSWER.exec(line);
    if (c) q2.choices.push({ id: c[1], text: c[2], impact: c[3] });
    else if (r) q2.recommended = r[1];
    else if (a) {
      q2.answer = a[1].trim() || null;
      q2.open = q2.answer === null;
    } else if (line.startsWith("- 메모:")) q2.notes.push(line.slice("- 메모:".length).trim());
    else if (line.startsWith("- 의견:")) q2.opinions.push(line.slice("- 의견:".length).trim());
    else if (!line.startsWith("- ") && line.trim() && q2.choices.length === 0) q2.text = q2.text ? `${q2.text} ${line.trim()}` : line.trim();
  });
  return { frontmatter: parseLoose(text2) ?? {}, questions };
}
function writeAnswer(text2, input) {
  const eol = text2.includes("\r\n") ? "\r\n" : "\n";
  const cr = eol === "\r\n" ? "\r" : "";
  const lines = text2.split("\n");
  const bareOf = (i) => lines[i].replace(/\r$/, "");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const h = HEAD.exec(bareOf(i));
    if (h && h[1] === input.qid) start = i;
  }
  if (start < 0) throw new Error(`질문 없음: ${input.qid}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (bareOf(i).startsWith("## ") || bareOf(i).startsWith("# ")) {
      end = i;
      break;
    }
  }
  const memo = input.text ? input.text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) : "";
  const block2 = lines.slice(start, end);
  if (input.opinion) {
    let at = block2.length;
    while (at > 1 && !block2[at - 1].replace(/\r$/, "").trim()) at -= 1;
    block2.splice(at, 0, `- 의견: ${input.choice} · ${input.email}${memo ? ` — ${memo}` : ""}${cr}`);
  } else {
    const ai = block2.findIndex((l) => ANSWER.test(l.replace(/\r$/, "")));
    const value = `${input.choice} · ${input.email} · ${input.at}`;
    const added = [`- 답: ${value}${cr}`];
    if (memo) added.push(`- 메모: ${memo}${cr}`);
    if (ai < 0) {
      let at = block2.length;
      while (at > 1 && !block2[at - 1].replace(/\r$/, "").trim()) at -= 1;
      block2.splice(at, 0, ...added);
    } else {
      const old = (ANSWER.exec(block2[ai].replace(/\r$/, ""))?.[1] ?? "").trim();
      let drop = 1;
      while (ai + drop < block2.length && block2[ai + drop].replace(/\r$/, "").startsWith("- 메모:")) drop += 1;
      if (old) added.push(`- 이전 답: ${old}${cr}`);
      block2.splice(ai, drop, ...added);
    }
  }
  let out = [...lines.slice(0, start), ...block2, ...lines.slice(end)].join("\n");
  const allAnswered = parseQuestions(out).questions.every((q2) => !q2.open);
  let statusChanged = null;
  const before = parseLoose(out)?.status ?? null;
  if (allAnswered && before !== null && before !== "answered") {
    out = setField2(out, "status", "answered");
    statusChanged = `${before}→answered`;
  }
  return { text: out, allAnswered, statusChanged };
}

// ../dashboard/src/flow.ts
var INTENT_FOLDER = /^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-(.+)$/;
function intentFolders(root) {
  const dir = import_node_path27.default.join(root, ".agents/docs/intents");
  let names = [];
  try {
    names = import_node_fs25.default.readdirSync(dir).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    const m = INTENT_FOLDER.exec(n);
    if (!m) continue;
    try {
      if (!import_node_fs25.default.lstatSync(import_node_path27.default.join(dir, n)).isDirectory()) continue;
    } catch {
      continue;
    }
    out.push({ key: m[1], name: m[2], dir: `.agents/docs/intents/${n}`, abs: import_node_path27.default.join(dir, n) });
  }
  return out;
}
function findIntent(root, key) {
  const found = intentFolders(root).filter((i) => i.key === key);
  if (found.length === 0) throw notFound(`Intent 가 없다: ${key}`);
  if (found.length > 1) throw new ApiError(409, "ambiguous_branch", `같은 키의 Intent 폴더가 둘 이상이다: ${key}`);
  return found[0];
}
function readUnitsFile(abs) {
  const file = import_node_path27.default.join(abs, "units.json");
  let raw = null;
  try {
    raw = import_node_fs25.default.readFileSync(file);
  } catch {
    return { raw: null, data: null, units: [] };
  }
  let data = null;
  try {
    const v = JSON.parse(raw.toString("utf8"));
    data = isObj6(v) ? v : null;
  } catch {
    data = null;
  }
  const list2 = data && Array.isArray(data.units) ? data.units : [];
  const units = list2.filter((u) => typeof u.id === "string").map((u) => ({
    ...u,
    id: u.id,
    title: typeof u.title === "string" ? u.title : u.id,
    kind: typeof u.kind === "string" ? u.kind : "feature",
    area: typeof u.area === "string" ? u.area : null,
    dependsOn: Array.isArray(u.dependsOn) ? u.dependsOn.filter((x) => typeof x === "string") : [],
    issue: typeof u.issue === "string" ? u.issue : null,
    planned: u.planned !== false,
    order: typeof u.order === "number" ? u.order : null,
    stories: Array.isArray(u.stories) ? u.stories.filter((x) => typeof x === "string") : [],
    provides: Array.isArray(u.provides) ? u.provides.filter((x) => typeof x === "string") : []
  }));
  return { raw, data, units };
}
var num = (id) => Number(/(\d+)$/.exec(id)?.[1] ?? 0);
var byId = (a, b) => num(a.id) - num(b.id);
var STEPS = ["requirements", "design", "tasks", "impl", "verify", "mr", "done"];
function stepsOf(issue, withDeploy) {
  const steps = withDeploy ? [...STEPS, "deploy"] : [...STEPS];
  if (!issue) return steps;
  let current4;
  const state = issue.docs.tasks?.state ?? null;
  if (issue.stage === "mr") current4 = state === "check" || state === "completed" ? "mr" : state === "active" ? "impl" : "mr";
  else if (issue.stage === "completed") current4 = withDeploy ? "deploy" : "";
  else current4 = issue.stage;
  const at = current4 ? steps.indexOf(current4) : steps.length;
  return steps.map((s, i) => i < at ? `${s}:done` : i === at ? `${s}:active` : s);
}
function layout(units) {
  const live = units.filter((u) => u.planned).sort(byId);
  const ids2 = new Map(live.map((u) => [u.id, u]));
  const contracts = live.filter((u) => u.kind === "contract");
  const depth = /* @__PURE__ */ new Map();
  const visiting = /* @__PURE__ */ new Set();
  const depthOf = (u) => {
    if (depth.has(u.id)) return depth.get(u.id);
    if (visiting.has(u.id)) return 0;
    visiting.add(u.id);
    const deps = u.dependsOn.map((d) => ids2.get(d)).filter((d) => Boolean(d) && d.kind !== "contract");
    const v = deps.length ? Math.max(...deps.map((d) => depthOf(d) + 1)) : 0;
    visiting.delete(u.id);
    depth.set(u.id, v);
    return v;
  };
  const nodes = [];
  contracts.forEach((u, i) => nodes.push({ id: u.id, type: "contract-unit", position: { x: i, y: 0 }, unit: u }));
  const columns = /* @__PURE__ */ new Map();
  for (const u of live.filter((x) => x.kind !== "contract")) {
    const x = depthOf(u);
    const y = (columns.get(x) ?? 0) + 1;
    columns.set(x, y);
    nodes.push({ id: u.id, type: "unit", position: { x, y }, unit: u });
  }
  const edges = [];
  for (const u of live) for (const d of u.dependsOn) if (ids2.has(d)) edges.push({ source: d, target: u.id, kind: ids2.get(d).kind === "contract" ? "contract" : "depends" });
  return { nodes, edges };
}
function proposalOf(abs) {
  return readJson(import_node_path27.default.join(abs, "units.proposed.json"));
}
function intentModel(p, info, issues) {
  const intentMd = import_node_path27.default.join(info.abs, "intent.md");
  let fm = {};
  let iSha = null;
  try {
    const b = import_node_fs25.default.readFileSync(intentMd);
    fm = parseLoose(b.toString("utf8")) ?? {};
    iSha = approvalSha(b);
  } catch {
    fm = {};
  }
  const { units } = readUnitsFile(info.abs);
  let questions = { open: 0, total: 0 };
  try {
    const q2 = parseQuestions(import_node_fs25.default.readFileSync(import_node_path27.default.join(info.abs, "questions.md"), "utf8"));
    questions = { open: q2.questions.filter((x) => x.open).length, total: q2.questions.length };
  } catch {
  }
  let plans = [];
  try {
    plans = import_node_fs25.default.readdirSync(import_node_path27.default.join(info.abs, "plans"), { recursive: true }).map((n) => String(n).split(import_node_path27.default.sep).join("/")).filter((n) => n.endsWith(".md")).sort().map((n) => `${info.dir}/plans/${n}`);
  } catch {
    plans = [];
  }
  let entries = [];
  try {
    entries = parse(import_node_fs25.default.readFileSync(import_node_path27.default.join(info.abs, "approvals.md"))).entries;
  } catch {
    entries = [];
  }
  const intentState = approvalState(entries, "intent", iSha, p.policy());
  const plansState = approvalState(entries, "plans", null, p.policy());
  const gates = p.gates();
  const stage = gates.includes("intent") && intentState !== "valid" ? "intent" : gates.includes("plans") && plansState !== "valid" ? "plans" : "issues";
  return {
    key: info.key,
    name: info.name,
    dir: info.dir,
    title: fm.title ?? null,
    source: import_node_fs25.default.existsSync(import_node_path27.default.join(info.abs, "intent.json")) ? "aidlc" : "kit",
    status: fm.status ?? null,
    units: units.map((u) => {
      const issue = u.issue ? issues.find((i) => i.key === u.issue) : void 0;
      return { id: u.id, title: u.title, kind: u.kind, dependsOn: u.dependsOn, issue: u.issue, planned: u.planned, progress: issue ? issue.stage : u.issue ? "unknown" : "not-started" };
    }),
    questions,
    plans,
    approvals: { intent: intentState, plans: plansState },
    stage,
    proposal: proposalOf(info.abs) !== null
  };
}
function flowData(p, info, issues, sessions) {
  const { units, data } = readUnitsFile(info.abs);
  let fm = {};
  try {
    fm = parseLoose(import_node_fs25.default.readFileSync(import_node_path27.default.join(info.abs, "intent.md"), "utf8")) ?? {};
  } catch {
    fm = {};
  }
  let approved = null;
  try {
    const entries = parse(import_node_fs25.default.readFileSync(import_node_path27.default.join(info.abs, "approvals.md"))).entries.filter((e) => e.valid && e.gate === "intent" && e.decision === "approved");
    const last = entries[entries.length - 1];
    if (last) approved = { at: last.at, by: last.approver?.name ?? last.approver?.email ?? "" };
  } catch {
    approved = null;
  }
  const withDeploy = p.gates().includes("deploy");
  const { nodes, edges } = layout(units);
  const intentMeta = data && isObj6(data.intent) ? data.intent : {};
  return {
    intent: { key: info.key, title: fm.title ?? (typeof intentMeta.title === "string" ? intentMeta.title : null), approved },
    nodes: nodes.map((n) => {
      const issue = n.unit.issue ? issues.find((i) => i.key === n.unit.issue) : void 0;
      if (n.type === "contract-unit") return { id: n.id, type: n.type, position: n.position, data: { title: n.unit.title, contracts: n.unit.provides, issue: n.unit.issue, steps: stepsOf(issue, withDeploy) } };
      const s = issue ? sessions.find((x) => x.issue === issue.key && x.state !== "gone") : void 0;
      const flags = [];
      if (issue?.review?.open.CRITICAL) flags.push(`critical:${issue.review.open.CRITICAL}`);
      if (issue?.review?.open.HIGH) flags.push(`high:${issue.review.open.HIGH}`);
      if (issue?.verify && (issue.verify.status === "failed" || issue.verify.status === "incomplete")) flags.push(`verify:${issue.verify.status}`);
      const b = issue?.docs.tasks?.bolts;
      return {
        id: n.id,
        type: n.type,
        position: n.position,
        data: { issue: n.unit.issue, area: n.unit.area, title: n.unit.title, session: s ? { name: s.name, harness: s.harness } : null, steps: stepsOf(issue, withDeploy), flags, bolts: b ? { done: b.done, total: b.total, estimated: false } : { done: 0, total: Math.max(1, Math.ceil(n.unit.stories.length / 3)), estimated: true } }
      };
    }),
    edges,
    proposal: proposalOf(info.abs),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function validChanges(input) {
  if (!Array.isArray(input) || input.length > 100) throw bad3("changes 는 100개 이하의 배열이다");
  return input.map((c) => {
    if (!isObj6(c) || typeof c.op !== "string" || !["add-dep", "remove-dep", "split", "merge", "order"].includes(c.op)) throw bad3("op 는 add-dep · remove-dep · split · merge · order 다");
    const out = { op: c.op };
    if (c.unit !== void 0) out.unit = String(c.unit);
    if (c.dependsOn !== void 0) out.dependsOn = String(c.dependsOn);
    if (c.into !== void 0) out.into = Array.isArray(c.into) ? c.into.map((x) => String(x).slice(0, 200)) : [];
    if (c.units !== void 0) out.units = Array.isArray(c.units) ? c.units.map(String) : [];
    if (c.reason !== void 0) out.reason = String(c.reason).replace(/[\r\n]+/g, " ").slice(0, 500);
    return out;
  });
}
function applyChanges(units, changes) {
  let list2 = units.map((u) => ({ ...u, dependsOn: [...u.dependsOn], stories: [...u.stories] }));
  const get = (id) => {
    const u = list2.find((x) => x.id === id);
    if (!u) throw new ApiError(422, "unknown_unit", `없는 Unit: ${id ?? ""}`, { unit: id ?? null });
    return u;
  };
  let next = Math.max(0, ...list2.map((u) => num(u.id)));
  for (const c of changes) {
    if (c.op === "add-dep" || c.op === "remove-dep") {
      const u = get(c.unit);
      const d = get(c.dependsOn);
      if (u.kind === "contract" && d.kind !== "contract" && c.op === "add-dep") throw new ApiError(422, "contract_dependency", "계약 Unit 은 기능 Unit 에 의존하지 않는다(08 §3.5)");
      list2 = list2.map((x) => x.id !== u.id ? x : { ...x, dependsOn: c.op === "add-dep" ? [.../* @__PURE__ */ new Set([...x.dependsOn, d.id])] : x.dependsOn.filter((y) => y !== d.id) });
    } else if (c.op === "merge") {
      const [a, b] = (c.units ?? []).map((id) => get(id));
      if (!a || !b || a.id === b.id) throw bad3("merge 는 서로 다른 Unit 둘이다");
      if (a.kind === "contract" || b.kind === "contract") throw new ApiError(422, "contract_merge", "계약 Unit 은 합치지 않는다");
      list2 = list2.map((x) => {
        if (x.id === a.id) return { ...x, stories: [.../* @__PURE__ */ new Set([...x.stories, ...b.stories])], dependsOn: [.../* @__PURE__ */ new Set([...x.dependsOn, ...b.dependsOn])].filter((y) => y !== a.id && y !== b.id) };
        if (x.id === b.id) return { ...x, planned: false };
        return { ...x, dependsOn: [...new Set(x.dependsOn.map((y) => y === b.id ? a.id : y))].filter((y) => y !== x.id) };
      });
    } else if (c.op === "split") {
      const u = get(c.unit);
      const titles = c.into ?? [];
      if (titles.length < 2) throw bad3("split 의 into 는 제목 2개 이상이다");
      const made = titles.map((t, i) => ({ ...u, id: `U-${++next}`, title: t, stories: i === 0 ? [...u.stories] : [], issue: null, planned: true }));
      const madeIds = made.map((m) => m.id);
      list2 = [...list2.map((x) => x.id === u.id ? { ...x, planned: false } : { ...x, dependsOn: x.dependsOn.flatMap((y) => y === u.id ? madeIds : [y]) }), ...made];
    } else if (c.op === "order") {
      const ids2 = (c.units ?? []).map((id) => get(id).id);
      list2 = list2.map((x) => ids2.includes(x.id) ? { ...x, order: ids2.indexOf(x.id) + 1 } : x);
    }
  }
  const live = new Map(list2.filter((u) => u.planned).map((u) => [u.id, u]));
  const state = /* @__PURE__ */ new Map();
  const cycle = [];
  const visit = (id, trail) => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) {
      cycle.push(...trail.slice(trail.indexOf(id)), id);
      return true;
    }
    state.set(id, 1);
    for (const d of live.get(id)?.dependsOn ?? []) if (live.has(d) && visit(d, [...trail, id])) return true;
    state.set(id, 2);
    return false;
  };
  for (const id of live.keys()) if (visit(id, [])) throw new ApiError(422, "cycle", `dependsOn 고리: ${cycle.join(" → ")}`, { cycle });
  for (const c of changes.filter((x) => x.op === "order")) {
    const ids2 = c.units ?? [];
    for (const id of ids2) for (const d of live.get(id)?.dependsOn ?? []) if (ids2.includes(d) && ids2.indexOf(d) > ids2.indexOf(id)) throw new ApiError(422, "cycle", `순서가 의존과 어긋난다: ${d} 가 ${id} 보다 먼저다`, { cycle: [d, id] });
  }
  return list2;
}
function proposalBody(body) {
  if (!isObj6(body) || typeof body.intent !== "string" || typeof body.baseSha256 !== "string") throw bad3("intent · baseSha256 · changes 가 필요하다");
  return { intent: body.intent, baseSha256: body.baseSha256, proposalSha256: typeof body.proposalSha256 === "string" ? body.proposalSha256 : null, changes: validChanges(body.changes) };
}
function appliedUnitsBytes(raw, data, units, changes) {
  const applied = applyChanges(units, changes);
  const original = Array.isArray(data.units) ? data.units : [];
  const merged = applied.map((u) => {
    const before = original.find((o) => o.id === u.id);
    if (!before) return Object.fromEntries(Object.entries(u).filter(([, v]) => v !== null && v !== void 0));
    const out = { ...before, dependsOn: u.dependsOn };
    if (Object.hasOwn(before, "planned") || !u.planned) out.planned = u.planned;
    if (Object.hasOwn(before, "stories") || u.stories.length) out.stories = u.stories;
    if (Object.hasOwn(before, "order") || u.order !== null) out.order = u.order;
    return out;
  });
  const text2 = `${JSON.stringify({ ...data, units: merged }, null, 2)}${raw.toString("utf8").endsWith("\n") ? "\n" : ""}`;
  return Buffer.from(text2, "utf8");
}

// ../dashboard/src/md.ts
var import_node_path28 = __toESM(require("node:path"));
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
function safeHref(url) {
  const u = url.trim();
  if (!u || /[\u0000-\u001f\s]/.test(u)) return null;
  if (u.startsWith("//") || u.startsWith("\\")) return null;
  if (SCHEME.test(u)) return /^https?:\/\//i.test(u) ? u : null;
  return u;
}
function imageSrc(url, opts) {
  const u = url.trim();
  if (!u || SCHEME.test(u) || u.startsWith("/") || u.startsWith("\\") || u.includes("\\")) return null;
  const clean = u.split(/[?#]/)[0];
  const joined = import_node_path28.default.posix.normalize(import_node_path28.default.posix.join(import_node_path28.default.posix.dirname(opts.docPath), clean));
  if (joined.startsWith("../") || joined === ".." || !joined.startsWith(".agents/docs/")) return null;
  return opts.sign ? opts.sign(joined) : null;
}
function inline2(text2, opts) {
  const codes = [];
  let s = text2.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\0C${codes.length - 1}\0`;
  });
  const parts = [];
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g, (_m, alt, src) => {
    const signed = imageSrc(src, opts);
    parts.push(signed ? `<img src="${escapeHtml(signed)}" alt="${escapeHtml(alt)}">` : escapeHtml(alt));
    return `\0P${parts.length - 1}\0`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g, (_m, label, href) => {
    const ok2 = safeHref(href);
    parts.push(ok2 ? `<a href="${escapeHtml(ok2)}" rel="noopener noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label));
    return `\0P${parts.length - 1}\0`;
  });
  s = s.replace(/<(https?:\/\/[^\s>]+)>/g, (_m, href) => {
    parts.push(`<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(href)}</a>`);
    return `\0P${parts.length - 1}\0`;
  });
  s = escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>").replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000([CP])(\d+)\u0000/g, (_m, k, i) => k === "C" ? codes[Number(i)] : parts[Number(i)]);
}
function stripFrontmatter(lines) {
  if (lines[0] !== "---") return lines;
  for (let i = 1; i < lines.length; i += 1) if (lines[i] === "---") return lines.slice(i + 1);
  return lines;
}
var LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
function renderList(lines, opts) {
  const items = lines.map((l) => {
    const m = LIST.exec(l);
    if (!m) return { indent: 99, ordered: false, text: l.trim() };
    return { indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] };
  });
  let i = 0;
  const walk3 = (base2) => {
    const ordered = items[i]?.ordered ?? false;
    let out = ordered ? "<ol>" : "<ul>";
    while (i < items.length) {
      const it = items[i];
      if (it.indent < base2) break;
      if (it.indent > base2 && it.indent !== 99) {
        out = out.replace(/<\/li>$/, "");
        out += `${walk3(it.indent)}</li>`;
        continue;
      }
      if (it.indent === 99) {
        out = out.replace(/<\/li>$/, ` ${inline2(it.text, opts)}</li>`);
        i += 1;
        continue;
      }
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(it.text);
      const body = task ? `${task[1] === " " ? "☐" : "☑"} ${inline2(task[2], opts)}` : inline2(it.text, opts);
      out += `<li>${body}</li>`;
      i += 1;
    }
    return `${out}${ordered ? "</ol>" : "</ul>"}`;
  };
  const base = items[0]?.indent ?? 0;
  let html = "";
  while (i < items.length) html += walk3(Math.min(base, items[i]?.indent ?? 0));
  return html;
}
function cells(row2) {
  let r = row2.trim();
  if (r.startsWith("|")) r = r.slice(1);
  if (r.endsWith("|")) r = r.slice(0, -1);
  return r.split("|").map((c) => c.trim());
}
function renderMarkdown(source, opts) {
  const lines = stripFrontmatter(source.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").split("\n"));
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map((l) => inline2(l, opts)).join("<br>")}</p>`);
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^(\s*)(```+|~~~+)(.*)$/.exec(line);
    if (fence) {
      flush();
      const mark = fence[2];
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(mark)) body.push(lines[i++]);
      i += 1;
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      flush();
      while (i < lines.length && !lines[i].includes("-->")) i += 1;
      i += 1;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      const n = h[1].length;
      out.push(`<h${n}>${inline2(h[2], opts)}</h${n}>`);
      i += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push("<hr>");
      i += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(body.join("\n"), opts)}</blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline2(c, opts)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline2(c, opts)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      );
      continue;
    }
    if (LIST.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && (LIST.test(lines[i]) || /^\s{2,}\S/.test(lines[i]) && body.length)) body.push(lines[i++]);
      out.push(renderList(body, opts));
      continue;
    }
    if (!line.trim()) {
      flush();
      i += 1;
      continue;
    }
    para.push(line.trim());
    i += 1;
  }
  flush();
  return out.join("\n");
}

// ../dashboard/src/model.ts
var import_node_fs31 = __toESM(require("node:fs"));
var import_node_path34 = __toESM(require("node:path"));

// ../dashboard/src/project.ts
var import_node_crypto5 = __toESM(require("node:crypto"));
var import_node_fs27 = __toESM(require("node:fs"));
var import_node_path30 = __toESM(require("node:path"));

// ../dashboard/src/repo.ts
var import_node_fs26 = __toESM(require("node:fs"));
var import_node_path29 = __toESM(require("node:path"));
var ISSUE_BRANCH = /^(feat|fix|chore|docs|refactor|exp)\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-(.+)$/;
var KEY = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5}$/;
var FOLDER = /^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-(.+)$/;
var LocateError = class extends Error {
};
async function locate(cwd, env) {
  let start;
  try {
    start = import_node_fs26.default.realpathSync(cwd);
  } catch {
    throw new LocateError(`폴더가 없다: ${cwd}`);
  }
  let harness = null;
  for (let cur = start; ; cur = import_node_path29.default.dirname(cur)) {
    if (import_node_fs26.default.existsSync(import_node_path29.default.join(cur, ".agents/harness-kit.json"))) {
      harness = cur;
      break;
    }
    if (import_node_path29.default.dirname(cur) === cur) break;
  }
  if (!harness) throw new LocateError(`하네스 루트(.agents/harness-kit.json)를 찾지 못했다: ${start}`);
  const top = await gitOut(harness, env, "rev-parse", "--show-toplevel");
  const common = await gitOut(harness, env, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (!top || !common) throw new LocateError(`git 저장소가 아니다: ${harness}`);
  const realTop = import_node_fs26.default.realpathSync(top);
  const prefix = import_node_path29.default.relative(realTop, harness).split(import_node_path29.default.sep).join("/");
  const realCommon = import_node_fs26.default.realpathSync(common);
  const mainTop = import_node_path29.default.basename(realCommon) === ".git" ? import_node_path29.default.dirname(realCommon) : realTop;
  const root = prefix ? import_node_path29.default.join(mainTop, prefix) : mainTop;
  return { root: import_node_fs26.default.existsSync(root) ? import_node_fs26.default.realpathSync(root) : root, top: mainTop, prefix, common: realCommon };
}
function gitStamp(common) {
  return [
    fileStamp(import_node_path29.default.join(common, "HEAD")),
    fileStamp(import_node_path29.default.join(common, "packed-refs")),
    treeStamp(import_node_path29.default.join(common, "worktrees"), 1, (n) => n === "HEAD" || !n.includes(".")),
    treeStamp(import_node_path29.default.join(common, "refs/heads"), 6)
  ].join("\n");
}
function real(p) {
  try {
    return import_node_fs26.default.realpathSync(p);
  } catch {
    return p;
  }
}
async function checkouts(p) {
  return p.cache.get("checkouts", gitStamp(p.loc.common), async () => {
    const out = await gitOut(p.loc.top, p.env, "worktree", "list", "--porcelain");
    const list2 = [];
    let cur = {};
    const flush = () => {
      if (cur.path && !cur.bare) {
        const top = real(cur.path);
        const branch = cur.branch ?? null;
        const m = branch ? ISSUE_BRANCH.exec(branch) : null;
        list2.push({ path: top, root: p.loc.prefix ? import_node_path29.default.join(top, p.loc.prefix) : top, branch, head: cur.head ?? null, main: list2.length === 0, key: m ? m[2] : null });
      }
      cur = {};
    };
    for (const line of (out ?? "").split("\n")) {
      if (line.startsWith("worktree ")) {
        flush();
        cur.path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) cur.head = line.slice(5);
      else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
      else if (line === "bare") cur.bare = true;
    }
    flush();
    if (list2.length === 0) list2.push({ path: p.loc.top, root: p.loc.root, branch: null, head: null, main: true, key: null });
    return list2;
  });
}
async function branches(p) {
  return p.cache.get("branches", gitStamp(p.loc.common), async () => {
    const out = await gitOut(p.loc.top, p.env, "for-each-ref", "refs/heads", "--format=%(refname:short)");
    return (out ?? "").split("\n").filter(Boolean).sort();
  });
}
function lstatChain(root, rel2) {
  let cur = root;
  const parts = rel2.split("/");
  for (let i = 0; i < parts.length; i += 1) {
    cur = import_node_path29.default.join(cur, parts[i]);
    let st;
    try {
      st = import_node_fs26.default.lstatSync(cur);
    } catch {
      return "missing";
    }
    if (st.isSymbolicLink()) throw forbiddenPath(rel2);
    if (i === parts.length - 1) return st.isFile() ? "file" : st.isDirectory() ? "dir" : "other";
    if (!st.isDirectory()) return "other";
  }
  return "missing";
}
async function resolveIssueCheckout(p, key, docRel, prefixes = /^[a-z]+$/) {
  const all = await branches(p);
  const mine = all.filter((b) => {
    const i = b.indexOf("/");
    return i > 0 && prefixes.test(b.slice(0, i)) && b.slice(i + 1).startsWith(`${key}-`);
  });
  const cos = await checkouts(p);
  if (mine.length > 1) throw new ApiError(409, "ambiguous_branch", `${key} 의 브랜치가 둘 이상이다: ${mine.join(", ")}`, { branches: mine });
  if (mine.length === 1) {
    const co = cos.find((c) => c.branch === mine[0]);
    if (co) return co;
    throw new ApiError(409, "branch_not_checked_out", `${mine[0]} 가 어느 폴더에도 체크아웃돼 있지 않다. wt new ${key} 뒤 다시 저장한다`, { branch: mine[0] });
  }
  const main2 = cos[0];
  const base = p.base();
  if (main2.branch === base && (docRel === null || lstatChain(main2.root, docRel) === "file")) return main2;
  throw new ApiError(409, "branch_not_checked_out", `${key} 의 이슈 브랜치가 없고 메인 폴더가 ${base} 가 아니거나 문서가 없다. wt new ${key} 뒤 다시 저장한다`, { base, mainBranch: main2.branch });
}
async function resolveIntentCheckout(p, key) {
  const all = await branches(p);
  if (all.some((b) => b.startsWith(`docs/${key}-`))) return resolveIssueCheckout(p, key, null, /^docs$/);
  return (await checkouts(p))[0];
}
async function gitUser(root, env) {
  const email = await gitOut(root, env, "config", "--get", "user.email");
  const name = await gitOut(root, env, "config", "--get", "user.name");
  return { email: email || null, name: name || null };
}
async function gitStatus(root, env) {
  const s = await git(root, env, "status", "--porcelain", "--untracked-files=normal");
  const u = await gitOut(root, env, "rev-list", "--count", "HEAD", "--not", "--remotes");
  return { dirty: s.code === 0 ? s.stdout.trim().length > 0 : false, unpushed: u === null ? null : Number(u) };
}

// ../dashboard/src/project.ts
var DEFAULT_GATES2 = ["codebase", "intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"];
var ISSUE_GATES = ["requirements", "design", "tasks", "mr", "done"];
function projectIdOf(dir) {
  let p = import_node_path30.default.resolve(dir);
  try {
    p = import_node_fs27.default.realpathSync(p);
  } catch {
  }
  return import_node_crypto5.default.createHash("sha256").update(p).digest("hex").slice(0, 12);
}
var Project = class _Project {
  loc;
  env;
  home;
  readOnly;
  multi;
  deps;
  cache = new Cache();
  id;
  locks = /* @__PURE__ */ new Map();
  constructor(loc, opts) {
    this.loc = loc;
    this.env = opts.env;
    this.home = opts.home;
    this.readOnly = opts.readOnly;
    this.multi = opts.multi;
    this.deps = opts.deps;
    this.id = projectIdOf(loc.root);
  }
  static async open(cwd, opts) {
    return new _Project(await locate(cwd, opts.env), opts);
  }
  get root() {
    return this.loc.root;
  }
  /** 공유 메타(.agents/harness-kit.json). 개인 층은 roles · git.ide 만 덮을 수 있어 여기서는 읽지 않는다(README §5). */
  meta() {
    const file = import_node_path30.default.join(this.root, ".agents/harness-kit.json");
    const stamp = fileStamp(file);
    const hit = this.metaCache;
    if (hit && hit.stamp === stamp) return hit.value;
    const value = readJson(file) ?? {};
    this.metaCache = { stamp, value };
    return value;
  }
  metaCache = null;
  name() {
    const project = this.meta().project;
    return isObj6(project) && typeof project.name === "string" && project.name ? project.name : import_node_path30.default.basename(this.root);
  }
  gates() {
    const flow = this.meta().flow;
    const g = isObj6(flow) && Array.isArray(flow.gates) ? flow.gates.filter((x) => typeof x === "string") : null;
    return g && g.length ? g : DEFAULT_GATES2;
  }
  base() {
    const g = this.meta().git;
    return isObj6(g) && typeof g.base === "string" && g.base ? g.base : "develop";
  }
  policy() {
    return policyOf(this.meta());
  }
  modules() {
    const m = this.meta().modules;
    return Array.isArray(m) ? m.filter((x) => typeof x === "string") : [];
  }
  /** 이 컴퓨터 설정 ~/.config/harness-kit/config.json(사람이 쓴다, 킷은 읽기만, 06 §3.17). */
  machineConfig() {
    return readJson(import_node_path30.default.join(this.home, ".config/harness-kit/config.json")) ?? {};
  }
  async user(root = this.root) {
    return this.cache.get(`user:${root}`, `${fileStamp(import_node_path30.default.join(this.loc.common, "config"))}
${fileStamp(import_node_path30.default.join(this.home, ".gitconfig"))}`, () => gitUser(root, this.env));
  }
  /** 경로별 프로세스 안 잠금(06 §3.6 저장 순서 1). */
  async withLock(key, fn) {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release = () => void 0;
    const next = new Promise((r) => {
      release = r;
    });
    const chained = prev.then(() => next);
    this.locks.set(key, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === chained) this.locks.delete(key);
    }
  }
};

// ../dashboard/src/readers/issues.ts
var import_node_fs28 = __toESM(require("node:fs"));
var import_node_path31 = __toESM(require("node:path"));
var CLARIFY = "[NEEDS CLARIFICATION";
function clarifyCount(text2) {
  return text2.split(CLARIFY).length - 1;
}
function bolts(text2) {
  const lines = text2.split(/\r?\n/);
  let total = 0;
  let done = 0;
  let open = 0;
  let tasks = 0;
  const close = () => {
    if (total > 0 && tasks > 0 && open === 0) done += 1;
  };
  for (const line of lines) {
    if (/^#{2,4}\s+Phase\b/i.test(line)) {
      close();
      total += 1;
      open = 0;
      tasks = 0;
    } else if (total > 0 && /^\s*- \[( |x|X)\]/.test(line)) {
      tasks += 1;
      if (/^\s*- \[ \]/.test(line)) open += 1;
    }
  }
  close();
  return { total, done };
}
function docInfo(bytes, gate, entries, p, mtimeMs) {
  const text2 = bytes.toString("utf8");
  const fm = parseLoose(text2) ?? {};
  const aSha = approvalSha(bytes);
  const info = {
    status: fm.status ?? null,
    sha256: sha2562(bytes),
    approvalSha256: aSha,
    clarify: clarifyCount(text2),
    approval: approvalState(entries, gate, gate === "tasks" ? null : aSha, p.policy())
  };
  if (mtimeMs !== void 0) info.mtimeMs = mtimeMs;
  if (gate === "tasks") {
    info.state = fm.state ?? null;
    info.bolts = bolts(text2);
  }
  return info;
}
function snapStamp(p, co) {
  const r = co.root;
  const docs = import_node_path31.default.join(r, ".agents/docs");
  let specs = [];
  try {
    specs = import_node_fs28.default.readdirSync(docs).filter((n) => n.endsWith("-specs"));
  } catch {
    specs = [];
  }
  return [
    treeStamp(import_node_path31.default.join(docs, "issues"), 2),
    ...specs.map((s) => treeStamp(import_node_path31.default.join(docs, s), 4)),
    fileStamp(import_node_path31.default.join(r, ".agents/harness-kit.json")),
    fileStamp(import_node_path31.default.join(r, ".agents/state/verify-last.json")),
    fileStamp(import_node_path31.default.join(r, ".agents/reports/quality-gate-last.json")),
    treeStamp(import_node_path31.default.join(r, ".agents/reports/review"), 0),
    treeStamp(import_node_path31.default.join(p.root, ".agents/reports/review"), 0),
    gitStamp(p.loc.common),
    treeStamp(import_node_path31.default.join(p.loc.common, "refs/remotes"), 4)
  ].join("\n");
}
var EMPTY = { board: { issues: [] }, gates: [], reviews: [], errors: [] };
async function snapshot(p, co) {
  return p.cache.get(`snap:${co.root}`, snapStamp(p, co), async () => {
    const own = import_node_path31.default.join(co.root, "scripts/harness/dashboard_snapshot.py");
    const script = import_node_fs28.default.existsSync(own) ? own : import_node_path31.default.join(p.root, "scripts/harness/dashboard_snapshot.py");
    if (!import_node_fs28.default.existsSync(script)) return { ...EMPTY, errors: [{ part: "snapshot", message: "scripts/harness/dashboard_snapshot.py 없음" }] };
    const r = await python(co.root, p.env, [script, "--root", co.root], 12e4);
    if (r.code !== 0) return { ...EMPTY, errors: [{ part: "snapshot", message: (r.stderr.trim().split("\n").pop() ?? "").slice(0, 300) }] };
    try {
      return JSON.parse(r.stdout);
    } catch {
      return { ...EMPTY, errors: [{ part: "snapshot", message: "JSON 아님" }] };
    }
  });
}
function readEntries(file) {
  try {
    return parse(import_node_fs28.default.readFileSync(file)).entries;
  } catch {
    return [];
  }
}
function verifyOf(root) {
  const v = readJson(import_node_path31.default.join(root, ".agents/state/verify-last.json"));
  if (!v) return null;
  const steps = Array.isArray(v.steps) ? v.steps : [];
  let slow = null;
  for (const s of steps) if (typeof s.durationMs === "number" && (!slow || s.durationMs > slow.durationMs)) slow = s;
  const label = slow ? String(slow.label ?? slow.command ?? slow.id ?? "") : "";
  return {
    level: typeof v.level === "string" ? v.level : null,
    status: typeof v.status === "string" ? v.status : null,
    finishedAt: typeof v.finishedAt === "string" ? v.finishedAt : null,
    durationMs: typeof v.durationMs === "number" ? v.durationMs : null,
    slowestStep: slow ? `${label} ${Math.round(slow.durationMs / 1e3)}s`.trim() : null
  };
}
function nodeGates(docs, legacyFlags) {
  const out = [];
  let ok2 = true;
  for (const gate of ISSUE_GATES) {
    const d = docs[gate];
    let passed = false;
    const reasons = [];
    if (gate === "mr" || gate === "done") reasons.push("git 객체로 읽은 이슈는 이 게이트를 판정하지 않는다(체크아웃 필요)");
    else if (!d) reasons.push(`${gate}.md 가 없다`);
    else {
      if (d.clarify) reasons.push(`${gate}.md 에 [NEEDS CLARIFICATION 가 남았다`);
      if (gate !== "tasks" && d.status !== "approved") reasons.push(`${gate}.md 머리 status 가 approved 가 아니다`);
      const valid = d.approval === "valid" || gate === "tasks" && d.approval === "stale" || legacyFlags[gate] === true;
      if (!valid) reasons.push(`${gate} 승인 기록이 ${d.approval}`);
      passed = reasons.length === 0 && ok2;
    }
    const pre = ok2 ? [] : ["앞 게이트를 통과하지 않았다"];
    out.push({ gate, passed: passed && ok2, reasons: [...pre, ...reasons], preconditions: pre, approval: d?.approval ?? "none" });
    ok2 = ok2 && passed;
  }
  return out;
}
var LEGACY_STAGE = { requirements: "requirements", design: "design", active: "mr", check: "mr", completed: "completed", superseded: "superseded" };
function stageOf(p, gates) {
  for (const g of p.gates()) {
    if (!ISSUE_GATES.includes(g)) continue;
    const r = gates.find((x) => x.gate === g);
    if (r && !r.passed) return g;
  }
  return "completed";
}
function waitingOf(p, stage, gates, docs, email) {
  const r = gates.find((g) => g.gate === stage);
  if (!r || r.passed || r.preconditions.length) return null;
  const d = docs[stage];
  if (stage === "requirements" || stage === "design") {
    if (!d || d.status !== "in-review") return null;
  } else if (stage === "tasks" && !d) return null;
  const policy = p.policy();
  const approvers = (policy.approvers ?? {})[stage] ?? [];
  const groups = policy.groups ?? {};
  const mine = approvers.length === 0 || approvers.some((a) => a.includes("@") ? a.toLowerCase() === (email ?? "").toLowerCase() : (groups[a] ?? []).some((m) => m.toLowerCase() === (email ?? "").toLowerCase()));
  return { gate: stage, approvers, mine };
}
function rolesOf(p) {
  const roles = p.meta().roles;
  const out = {};
  if (isObj6(roles)) {
    for (const [k, v] of Object.entries(roles)) if (isObj6(v) && typeof v.harness === "string") out[k] = v.harness;
  }
  return out;
}
function readFolder(root, folderRel, name) {
  const files = {};
  const mtimes = {};
  for (const d of ["requirements", "design", "tasks"]) {
    const f = import_node_path31.default.join(root, folderRel, `${d}.md`);
    try {
      const st = import_node_fs28.default.lstatSync(f);
      files[d] = st.isFile() ? import_node_fs28.default.readFileSync(f) : null;
      mtimes[d] = st.mtimeMs;
    } catch {
      files[d] = null;
    }
  }
  return { folder: folderRel, name, files, mtimes, entries: readEntries(import_node_path31.default.join(root, folderRel, "approvals.md")) };
}
function docsOf(p, f) {
  const info = (gate) => {
    const b = f.files[gate];
    return b ? docInfo(b, gate, f.entries, p, f.mtimes[gate]) : null;
  };
  return { requirements: info("requirements"), design: info("design"), tasks: info("tasks") };
}
function headFields(f) {
  for (const d of ["requirements", "design", "tasks"]) {
    const b = f.files[d];
    if (b) return parseLoose(b.toString("utf8")) ?? {};
  }
  return {};
}
function build(ctx, key, f, extra, snap, verify, root) {
  const { p } = ctx;
  const docs = docsOf(p, f);
  const head = headFields(f);
  const board = snap?.board.issues.find((i) => i.key === key && !i.legacy) ?? null;
  const pyGates = snap?.gates.find((g) => g.key === key)?.gates;
  const legacyFlags = {};
  const gates = pyGates && pyGates.length ? pyGates : nodeGates(docs, legacyFlags);
  if (docs.tasks && pyGates) {
    const t = pyGates.find((g) => g.gate === "tasks");
    if (t) docs.tasks.approval = t.approval;
  }
  const stage = stageOf(p, gates);
  const review = snap?.reviews.find((r) => r.key === key) ?? null;
  return {
    key,
    name: f.name,
    dir: f.folder,
    area: board?.area ?? head.area ?? null,
    type: board?.type ?? head.type ?? null,
    title: head.title ?? null,
    intent: head.intent ?? null,
    unit: head.unit ?? null,
    legacy: false,
    boardState: board?.state ?? null,
    docs,
    stage,
    gates,
    waitingOn: waitingOf(p, stage, gates, docs, ctx.email),
    review: review ? { open: review.open, report: review.report ? rel(p.root, import_node_path31.default.resolve(root ?? p.root, review.report)) : null, stale: review.stale } : null,
    verify,
    roles: rolesOf(p),
    sessions: ctx.sessions.filter((s) => s.issue === key && s.state !== "gone").map((s) => s.id),
    root,
    ...extra
  };
}
async function fromGitObjects(p, ref) {
  const prefix = p.loc.prefix ? `${p.loc.prefix}/` : "";
  const ls = await gitOut(p.loc.top, p.env, "ls-tree", "-r", "--name-only", ref, "--", `${prefix}.agents/docs/issues/`);
  const byFolder = /* @__PURE__ */ new Map();
  for (const line of (ls ?? "").split("\n").filter(Boolean)) {
    const relPath = line.slice(prefix.length);
    const m = /^\.agents\/docs\/issues\/([^/]+)\/([^/]+)$/.exec(relPath);
    if (!m) continue;
    byFolder.set(m[1], [...byFolder.get(m[1]) ?? [], m[2]]);
  }
  const out = [];
  for (const [folder, names] of [...byFolder.entries()].sort()) {
    const fm = FOLDER.exec(folder);
    if (!fm) continue;
    const files = {};
    for (const d of ["requirements", "design", "tasks"]) {
      if (!names.includes(`${d}.md`)) {
        files[d] = null;
        continue;
      }
      const shown = await git(p.loc.top, p.env, "show", `${ref}:${prefix}.agents/docs/issues/${folder}/${d}.md`);
      files[d] = shown.code === 0 ? Buffer.from(shown.stdout, "utf8") : null;
    }
    const ap = names.includes("approvals.md") ? await gitOut(p.loc.top, p.env, "show", `${ref}:${prefix}.agents/docs/issues/${folder}/approvals.md`) : null;
    out.push({ key: fm[1], f: { folder: `.agents/docs/issues/${folder}`, name: fm[2], files, mtimes: {}, entries: ap ? parse(ap).entries : [] } });
  }
  return out;
}
async function branchIssues(p, ref) {
  const sha = await gitOut(p.loc.top, p.env, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  if (!sha) return [];
  return p.cache.get(`objects:${ref}`, sha, () => fromGitObjects(p, ref));
}
function issueFolders(root) {
  const dir = import_node_path31.default.join(root, ".agents/docs/issues");
  let names = [];
  try {
    names = import_node_fs28.default.readdirSync(dir).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    if (n.startsWith("_") || n.startsWith(".")) continue;
    const m = FOLDER.exec(n);
    if (!m) continue;
    try {
      if (!import_node_fs28.default.lstatSync(import_node_path31.default.join(dir, n)).isDirectory()) continue;
    } catch {
      continue;
    }
    out.push({ key: m[1], folder: `.agents/docs/issues/${n}`, name: m[2] });
  }
  return out;
}
async function readIssues(p, sessions, dirty) {
  const cos = await checkouts(p);
  const main2 = cos[0];
  const email = (await p.user()).email;
  const ctx = { p, email, sessions };
  const seen = /* @__PURE__ */ new Map();
  const errors = [];
  const coView = (co) => ({ kind: co.main ? "main" : "worktree", path: rel(p.loc.top, co.path), dirty: dirty.get(co.path) ?? false });
  const snaps = /* @__PURE__ */ new Map();
  const snapOf = async (co) => {
    if (!snaps.has(co.root)) {
      const s = await snapshot(p, co);
      for (const e of s.errors) errors.push(`${rel(p.loc.top, co.path)}: ${e.part}: ${e.message}`);
      snaps.set(co.root, s);
    }
    return snaps.get(co.root);
  };
  await Promise.all(cos.filter((c) => c.key).map((c) => snapOf(c)));
  for (const co of cos) {
    if (!co.key) continue;
    const snap = await snapOf(co);
    const verify = verifyOf(co.root);
    for (const item of issueFolders(co.root).filter((i) => i.key === co.key)) {
      if (seen.has(item.key)) continue;
      const f = readFolder(co.root, item.folder, item.name);
      seen.set(item.key, build(ctx, item.key, f, { source: "worktree", checkout: coView(co), branch: co.branch }, snap, verify, co.root));
    }
  }
  const checkedOut = new Set(cos.map((c) => c.branch).filter(Boolean));
  for (const b of await branches(p)) {
    const m = ISSUE_BRANCH.exec(b);
    if (!m || checkedOut.has(b) || seen.has(m[2])) continue;
    for (const { key, f } of await branchIssues(p, b)) {
      if (key !== m[2] || seen.has(key)) continue;
      seen.set(key, build(ctx, key, f, { source: "branch", checkout: null, branch: b }, null, null, null));
    }
  }
  const base = p.base();
  if (main2.branch === base) {
    const snap = await snapOf(main2);
    const verify = verifyOf(main2.root);
    for (const item of issueFolders(main2.root)) {
      if (seen.has(item.key)) continue;
      const f = readFolder(main2.root, item.folder, item.name);
      seen.set(item.key, build(ctx, item.key, f, { source: "base", checkout: coView(main2), branch: base }, snap, verify, main2.root));
    }
    for (const legacy of snap.board.issues.filter((i) => i.legacy)) {
      if (seen.has(legacy.key)) continue;
      seen.set(legacy.key, legacyModel(ctx, legacy, coView(main2), base, main2.root));
    }
  } else {
    for (const { key, f } of await branchIssues(p, base)) {
      if (seen.has(key)) continue;
      seen.set(key, build(ctx, key, f, { source: "base", checkout: null, branch: base }, null, null, null));
    }
  }
  const issues = [...seen.values()].sort(byKey);
  return { issues, errors };
}
function legacyModel(ctx, b, checkout, base, root) {
  const stage = LEGACY_STAGE[b.state] ?? "requirements";
  const d = (s) => s ? { status: s, sha256: "", approvalSha256: "", clarify: 0, approval: "none" } : null;
  return {
    key: b.key,
    name: b.name,
    dir: b.folder,
    area: b.area,
    type: b.type,
    title: null,
    intent: null,
    unit: null,
    branch: base,
    checkout,
    source: "base",
    legacy: true,
    boardState: b.state,
    docs: { requirements: d(b.requirements), design: d(b.design), tasks: b.tasks ? { status: null, state: b.tasks, sha256: "", approvalSha256: "", clarify: 0, approval: "none", bolts: { total: 0, done: 0 } } : null },
    stage,
    gates: [],
    waitingOn: null,
    review: null,
    verify: null,
    roles: rolesOf(ctx.p),
    sessions: [],
    root
  };
}
function byKey(a, b) {
  const pa = /^(.*)-(\d+)$/.exec(a.key);
  const pb = /^(.*)-(\d+)$/.exec(b.key);
  if (pa && pb && pa[1] === pb[1]) return Number(pa[2]) - Number(pb[2]);
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
function publicIssue(i) {
  const { root: _root, ...rest } = i;
  const strip2 = (d) => {
    if (!d) return null;
    const { mtimeMs: _m, ...x } = d;
    return x;
  };
  return { ...rest, docs: { requirements: strip2(i.docs.requirements), design: strip2(i.docs.design), tasks: strip2(i.docs.tasks) } };
}

// ../dashboard/src/readers/sessions.ts
var import_node_child_process6 = require("node:child_process");
var import_node_fs29 = __toESM(require("node:fs"));
var import_node_net = __toESM(require("node:net"));
var import_node_path32 = __toESM(require("node:path"));
var SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
var DAY = 24 * 3600 * 1e3;
function pidStart(pid) {
  return new Promise((resolve) => {
    const c = (0, import_node_child_process6.spawn)("ps", ["-o", "lstart=", "-p", String(pid)], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d) => {
      out += d.toString();
    });
    c.on("error", () => resolve(null));
    c.on("close", (code) => resolve(code === 0 ? out.trim() || null : null));
  });
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function probeSocket(socketPath, timeoutMs = 200) {
  return new Promise((resolve) => {
    let done = false;
    const s = import_node_net.default.connect({ path: socketPath });
    const finish2 = (ok2) => {
      if (done) return;
      done = true;
      s.destroy();
      resolve(ok2);
    };
    s.setTimeout(timeoutMs, () => finish2(false));
    s.once("connect", () => finish2(true));
    s.once("error", () => finish2(false));
  });
}
async function liveness(data) {
  const pid = typeof data.pid === "number" ? data.pid : null;
  if (!pid || !alive(pid)) return "gone";
  const started = await pidStart(pid);
  if (typeof data.pidStartedAt === "string" && data.pidStartedAt && started !== data.pidStartedAt) return "gone";
  const inbox = isObj6(data.inbox) && typeof data.inbox.path === "string" ? data.inbox.path : null;
  if (!inbox) return "alive-no-inbox";
  return await probeSocket(inbox) ? "alive" : "alive-no-inbox";
}
var str3 = (v) => typeof v === "string" ? v : null;
async function leases(p, root) {
  const state = import_node_path32.default.join(root, ".agents/coordination/state.json");
  if (!import_node_fs29.default.existsSync(state)) return /* @__PURE__ */ new Map();
  return p.cache.get(`leases:${root}`, fileStamp(state), async () => {
    const out = /* @__PURE__ */ new Map();
    const script = import_node_path32.default.join(root, "scripts/session-coordination.py");
    if (!import_node_fs29.default.existsSync(script)) return out;
    const r = await python(root, p.env, [script, "--root", root, "context", "--json"], 2e4);
    if (r.code !== 0) return out;
    try {
      const data = JSON.parse(r.stdout);
      for (const s of data.sessions ?? []) {
        if (typeof s.id !== "string") continue;
        const files = Array.isArray(s.files) ? s.files.filter((f) => typeof f === "string") : [];
        out.set(s.id, { files, active: s.status === "active" && s.expired !== true });
      }
    } catch {
    }
    return out;
  });
}
async function readSessions(p) {
  const dir = import_node_path32.default.join(p.root, ".agents/state/sessions");
  let names = [];
  try {
    names = import_node_fs29.default.readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const owned = await leases(p, p.root);
  const out = [];
  await Promise.all(
    names.map(async (n) => {
      const file = import_node_path32.default.join(dir, n);
      const data = readJson(file);
      const id = data && typeof data.id === "string" ? data.id : n.slice(0, -5);
      if (!data || !SESSION_ID.test(id)) return;
      const state = await liveness(data);
      if (state === "gone" && !p.multi && !p.readOnly) {
        try {
          if (Date.now() - import_node_fs29.default.statSync(file).mtimeMs > DAY) {
            import_node_fs29.default.unlinkSync(file);
            return;
          }
        } catch {
          return;
        }
      }
      const socket = isObj6(data.inbox) && typeof data.inbox.path === "string" ? data.inbox.path : null;
      const cwdAbs = str3(data.cwd);
      out.push({
        id,
        harness: str3(data.harness),
        name: str3(data.name),
        role: str3(data.role),
        roleSource: str3(data.roleSource),
        issue: str3(data.issue),
        checkout: str3(data.checkout),
        branch: str3(data.branch),
        cwd: cwdAbs && import_node_path32.default.isAbsolute(cwdAbs) ? rel(p.loc.top, cwdAbs) : null,
        turn: str3(data.turn),
        startedAt: str3(data.startedAt),
        lastSeenAt: str3(data.lastSeenAt),
        permissionMode: str3(data.permissionMode),
        state,
        inbox: socket !== null,
        files: owned.get(id)?.files ?? [],
        socket,
        cwdAbs
      });
    })
  );
  return out.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function publicSession(s) {
  const { socket: _s, cwdAbs: _c, ...rest } = s;
  return rest;
}
function queueDir(p) {
  return import_node_path32.default.join(p.root, ".agents/state/dispatch-queue");
}
async function readQueue(p) {
  const dir = queueDir(p);
  const stamp = treeStamp(dir, 1);
  const items = await p.cache.get(`queue`, stamp, () => {
    const out = [];
    let names = [];
    try {
      names = import_node_fs29.default.readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
    } catch {
      return out;
    }
    for (const n of names) {
      const d = readJson(import_node_path32.default.join(dir, n));
      if (!d) continue;
      out.push({
        id: str3(d.id) ?? n.slice(0, -5),
        createdAt: str3(d.createdAt),
        createdBy: str3(d.createdBy),
        target: isObj6(d.target) ? d.target : {},
        kind: str3(d.kind),
        message: str3(d.message) ?? "",
        paths: Array.isArray(d.paths) ? d.paths.filter((x) => typeof x === "string") : [],
        expiresAt: str3(d.expiresAt),
        stale: false
      });
    }
    return out;
  });
  const now = Date.now();
  if (!p.multi && !p.readOnly) cleanConsumed(dir, now);
  return items.map((i) => ({ ...i, stale: i.createdAt ? now - Date.parse(i.createdAt) > DAY : false }));
}
function cleanConsumed(dir, now) {
  const consumed = import_node_path32.default.join(dir, "consumed");
  let names = [];
  try {
    names = import_node_fs29.default.readdirSync(consumed);
  } catch {
    return;
  }
  for (const n of names) {
    const f = import_node_path32.default.join(consumed, n);
    try {
      if (now - import_node_fs29.default.statSync(f).mtimeMs > 7 * DAY) import_node_fs29.default.unlinkSync(f);
    } catch {
    }
  }
}

// ../dashboard/src/readers/state.ts
var import_node_fs30 = __toESM(require("node:fs"));
var import_node_path33 = __toESM(require("node:path"));
var SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
async function readVerify(p, issue) {
  const out = [];
  for (const co of await checkouts(p)) {
    if (issue && co.key !== issue) continue;
    const file = import_node_path33.default.join(co.root, ".agents/state/verify-last.json");
    const v = await p.cache.get(`verify:${co.root}`, fileStamp(file), () => readJson(file));
    const steps = v && Array.isArray(v.steps) ? v.steps : [];
    const shaped = steps.map((s) => ({ label: s.label ?? s.command ?? s.id ?? null, status: s.status ?? null, durationMs: typeof s.durationMs === "number" ? s.durationMs : null }));
    const slowest = shaped.filter((s) => s.durationMs !== null).sort((a, b) => b.durationMs - a.durationMs)[0] ?? null;
    out.push({
      checkout: { kind: co.main ? "main" : "worktree", path: rel(p.loc.top, co.path), branch: co.branch },
      issue: co.key,
      record: v ? { level: v.level ?? null, status: v.status ?? null, startedAt: v.startedAt ?? null, finishedAt: v.finishedAt ?? null, durationMs: v.durationMs ?? null, head: isObj6(v.head) ? v.head : null, exitCode: v.exitCode ?? null, steps: shaped } : null,
      slowest
    });
  }
  return out;
}
function reportsDir(p) {
  return import_node_path33.default.join(p.root, ".agents/reports");
}
async function readSummary(p) {
  const dir = reportsDir(p);
  const gateFile = import_node_path33.default.join(dir, "quality-gate-last.json");
  const findingsFile = import_node_path33.default.join(dir, "findings-latest.json");
  const metricsFile = import_node_path33.default.join(dir, "metrics/latest.json");
  return p.cache.get("summary", [gateFile, findingsFile, metricsFile].map(fileStamp).join("\n"), () => {
    const gate = readJson(gateFile);
    const f = readJson(findingsFile);
    const list2 = f && Array.isArray(f.findings) ? f.findings : [];
    const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, list2.filter((x) => x.severity === s).length]));
    const newBySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, list2.filter((x) => x.severity === s && x.new === true).length]));
    return {
      gate: gate ? { status: gate.status ?? null, level: gate.level ?? null, head: gate.head ?? null, base: gate.base ?? null, mode: gate.mode ?? null, checks: gate.checks ?? [], incomplete: gate.incomplete ?? [] } : null,
      findings: f ? { at: f.at ?? null, head: f.head ?? null, level: f.level ?? null, total: list2.length, bySeverity, new: newBySeverity, truncated: f.truncated === true, analyzers: f.analyzers ?? {} } : null,
      metrics: readJson(metricsFile)
    };
  });
}
async function readFindings(p, q2) {
  const file = import_node_path33.default.join(reportsDir(p), "findings-latest.json");
  const f = await p.cache.get("findings", fileStamp(file), () => readJson(file));
  let list2 = f && Array.isArray(f.findings) ? f.findings : [];
  if (q2.severity) list2 = list2.filter((x) => x.severity === q2.severity);
  if (q2.onlyNew) list2 = list2.filter((x) => x.new === true);
  if (q2.issue) {
    const branch = f && typeof f.branch === "string" ? f.branch : "";
    if (!branch.includes(`/${q2.issue}-`)) list2 = [];
  }
  return { head: f?.head ?? null, branch: f?.branch ?? null, at: f?.at ?? null, findings: list2 };
}
async function readReview(p, root, folderRel) {
  const script = import_node_fs30.default.existsSync(import_node_path33.default.join(root, "scripts/harness/review_state.py")) ? import_node_path33.default.join(root, "scripts/harness/review_state.py") : import_node_path33.default.join(p.root, "scripts/harness/review_state.py");
  const key = /issues\/([A-Z][A-Z0-9]*-\d+)-/.exec(folderRel)?.[1] ?? "";
  const stamp = [
    fileStamp(import_node_path33.default.join(root, folderRel, "approvals.md")),
    fileStamp(import_node_path33.default.join(root, folderRel, "review.md")),
    fileStamp(import_node_path33.default.join(root, ".agents/reports/review", `${key}.md`)),
    fileStamp(import_node_path33.default.join(p.root, ".agents/reports/review", `${key}.md`))
  ].join("\n");
  return p.cache.get(`review:${root}:${folderRel}`, stamp, async () => {
    const r = await python(root, p.env, [script, import_node_path33.default.join(root, folderRel), "--json"], 3e4);
    if (r.code === 2) return { key, report: null, head: null, stale: false, open: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }, findings: [] };
    if (r.code !== 0 && r.code !== 1) throw new ApiError(500, "internal", "리뷰 상태를 읽지 못했다");
    const data = JSON.parse(r.stdout);
    if (typeof data.report === "string" && import_node_path33.default.isAbsolute(data.report)) data.report = rel(p.root, data.report);
    return data;
  });
}
async function readWorktrees(p) {
  const cos = await checkouts(p);
  const base = p.base();
  const g = p.meta().git;
  const max = isObj6(g) && typeof g.maxPerRepo === "number" ? g.maxPerRepo : 3;
  const items = await Promise.all(
    cos.map(async (co) => {
      const st = await gitStatus(co.path, p.env);
      let merged = null;
      if (!co.main && co.head) {
        const anc = await gitOut(co.path, p.env, "merge-base", "--is-ancestor", "HEAD", base);
        merged = anc !== null;
      }
      let lastUsed = null;
      try {
        lastUsed = new Date(import_node_fs30.default.statSync(co.path).mtimeMs).toISOString();
      } catch {
        lastUsed = null;
      }
      const done = !co.main && !st.dirty && st.unpushed === 0 && merged === true;
      const name = import_node_path33.default.basename(co.path);
      return { path: co.main ? "." : rel(p.loc.top, co.path), name, kind: co.main ? "main" : "worktree", branch: co.branch, head: co.head, issue: co.key, dirty: st.dirty, unpushed: st.unpushed, merged, done, lastUsed, abs: co.path };
    })
  );
  const extra = items.filter((i) => i.kind === "worktree").length;
  return { worktrees: items.map(({ abs: _a, ...rest }) => rest), count: extra, maxPerRepo: max, over: extra > max, gc: "python3 scripts/harness/worktree.py gc --apply" };
}

// ../dashboard/src/model.ts
var VERSION2 = true ? "2.0.0-alpha.0" : "0.0.0-dev";
async function load(p) {
  const sessions = await readSessions(p);
  const cos = await checkouts(p);
  const dirty = new Map(await Promise.all(cos.map(async (c) => [c.path, (await gitStatus(c.path, p.env)).dirty])));
  const set = await readIssues(p, sessions, dirty);
  return { ...set, sessions };
}
async function sessionInfo(p, mode) {
  const meta = p.meta();
  const user = await p.user();
  const groups = p.policy().groups ?? {};
  const flow = isObj6(meta.flow) ? meta.flow : {};
  return {
    repo: p.name(),
    projectId: p.id,
    main: p.root,
    user: { email: user.email, name: user.name, groups: Object.entries(groups).filter(([, m]) => m.some((x) => x.toLowerCase() === (user.email ?? "").toLowerCase())).map(([g]) => g).sort() },
    modules: p.modules(),
    agents: Array.isArray(meta.agents) ? meta.agents : [],
    flow: { design: flow.design ?? "kit", record: flow.record ?? "none", gates: p.gates(), floor: GATE_FLOOR },
    approvers: p.policy().approvers ?? {},
    readOnly: p.readOnly,
    mode,
    version: VERSION2
  };
}
async function doctorOf(p) {
  const doctor = p.deps.doctor;
  if (!doctor) return null;
  const stamp = [fileStamp(import_node_path34.default.join(p.root, ".agents/harness-kit.lock")), fileStamp(import_node_path34.default.join(p.root, ".agents/harness-kit.json"))].join("\n");
  try {
    return await p.cache.get("doctor", stamp, () => doctor(p.root, p.env), 6e4);
  } catch {
    return { status: "unavailable", counts: {}, problems: [] };
  }
}
var isoOf = (ms) => new Date(ms && Number.isFinite(ms) ? ms : 0).toISOString();
var mtime = (f) => {
  try {
    return import_node_fs31.default.statSync(f).mtimeMs;
  } catch {
    return null;
  }
};
async function todos(p, loaded) {
  const out = [];
  const fallback = mtime(import_node_path34.default.join(p.root, ".agents/harness-kit.json"));
  const iso = (ms) => isoOf(ms ?? fallback);
  const user = await p.user();
  for (const i of loaded.issues) {
    const link = `/issues/${i.key}`;
    const open = i.review?.open ?? {};
    const blocking = (open.CRITICAL ?? 0) + (open.HIGH ?? 0);
    if (blocking > 0) {
      out.push({ rank: 1, kind: "review-blocker", target: i.key, title: `${i.key} 리뷰 지적 CRITICAL ${open.CRITICAL ?? 0} · HIGH ${open.HIGH ?? 0}`, reason: "열린 CRITICAL · HIGH 지적이 있으면 mr 승인 · full 이 막힌다", since: iso(i.review?.report ? mtime(import_node_path34.default.join(p.root, i.review.report)) : null), link: `${link}/review`, mine: false });
    }
    if (i.waitingOn) {
      const d = i.docs[i.waitingOn.gate];
      out.push({
        rank: i.waitingOn.mine ? 2 : 6,
        kind: i.waitingOn.mine ? "gate-mine" : "gate-others",
        target: i.key,
        title: `${i.key} ${i.waitingOn.gate} 승인 대기`,
        reason: i.waitingOn.approvers.length ? `승인자: ${i.waitingOn.approvers.join(", ")}` : "approvers 가 비어 git 사용자 누구나 승인한다",
        since: iso(d?.mtimeMs ?? null),
        link: `${link}/approve?gate=${i.waitingOn.gate}`,
        mine: i.waitingOn.mine
      });
    }
    for (const [gate2, d] of Object.entries(i.docs)) {
      if (!d) continue;
      if (d.clarify > 0) out.push({ rank: 3, kind: "questions", target: i.key, title: `${i.key} ${gate2}.md 에 [NEEDS CLARIFICATION ${d.clarify}건`, reason: "표시가 남은 문서는 승인할 수 없다(DB-R13)", since: iso(d.mtimeMs ?? null), link: `${link}/docs/${gate2}`, mine: false });
      if (d.approval === "stale" && gate2 !== "tasks") out.push({ rank: 5, kind: "approval-stale", target: i.key, title: `${i.key} ${gate2} 승인 뒤 내용이 바뀌었다`, reason: "승인 기록의 sha 와 지금 문서가 다르다. 다시 승인한다", since: iso(d.mtimeMs ?? null), link: `${link}/docs/${gate2}`, mine: allowed(user.email, gate2, p.policy()) });
    }
  }
  for (const info of intentFolders(p.root)) {
    const qf = import_node_path34.default.join(info.abs, "questions.md");
    if (!import_node_fs31.default.existsSync(qf)) continue;
    const model = intentModel(p, info, loaded.issues);
    const stage = String(model.stage);
    const open = parseQuestions(import_node_fs31.default.readFileSync(qf, "utf8")).questions.filter((q2) => q2.open && (q2.blocks === stage || q2.blocks === null));
    if (open.length) out.push({ rank: 3, kind: "questions", target: info.key, title: `${info.key} 답할 질문 ${open.length}건`, reason: `막는 게이트: ${stage}`, since: iso(mtime(qf)), link: `/intents/${info.key}/questions`, mine: false });
  }
  for (const v of await readVerify(p, null)) {
    const rec = v.record;
    if (rec && (rec.status === "failed" || rec.status === "incomplete")) {
      const co = v.checkout;
      out.push({ rank: 4, kind: "verify-failed", target: v.issue ?? co.path, title: `검증 ${rec.status}: ${v.issue ?? co.path}`, reason: "마지막 검증 기록이 통과가 아니다", since: rec.finishedAt ?? iso(null), link: "/verify", mine: false });
    }
  }
  const wt = await readWorktrees(p);
  for (const w of wt.worktrees) {
    if (w.kind === "worktree" && w.done) out.push({ rank: 7, kind: "worktree-cleanup", target: w.path, title: `worktree 정리: ${w.name}`, reason: "변경 없음 · push 안 된 커밋 0 · 병합됨", since: w.lastUsed ?? iso(null), link: "/workspace", mine: false });
  }
  if (wt.over) out.push({ rank: 7, kind: "worktree-cleanup", target: ".", title: `worktree ${String(wt.count)}개 — 상한 ${String(wt.maxPerRepo)}개 초과`, reason: "git.maxPerRepo", since: iso(null), link: "/workspace", mine: false });
  const doctor = await doctorOf(p);
  if (doctor && doctor.status === "problems") out.push({ rank: 8, kind: "harness", target: ".", title: `하네스 점검 문제 ${doctor.problems.length}건`, reason: Object.entries(doctor.counts).map(([k, n]) => `${k} ${n}`).join(" · "), since: iso(null), link: "/harness", mine: false });
  for (const q2 of await readQueue(p)) {
    if (q2.stale) out.push({ rank: 9, kind: "dispatch-stale", target: q2.id, title: `24시간 넘게 가져가지 않은 요청: ${q2.message.slice(0, 60)}`, reason: "대기함 항목", since: q2.createdAt ?? iso(null), link: "/workspace", mine: false });
  }
  const summary = await readSummary(p);
  const gate = summary.gate;
  const findings = summary.findings;
  if (gate?.status === "failed" && (findings?.new?.CRITICAL ?? 0) > 0) out.push({ rank: 1, kind: "quality-blocker", target: ".", title: `품질 게이트 failed · 새 CRITICAL ${findings?.new?.CRITICAL ?? 0}`, reason: "quality-gate-last.json", since: findings?.at ?? iso(null), link: "/verify", mine: false });
  return out.sort((a, b) => a.rank - b.rank || Date.parse(a.since) - Date.parse(b.since) || (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));
}
var TODO_LIMIT = 50;
async function overview(p) {
  const loaded = await load(p);
  const all = await todos(p, loaded);
  const more = {};
  for (const t of all.slice(TODO_LIMIT)) more[String(t.rank)] = (more[String(t.rank)] ?? 0) + 1;
  const stages = {};
  for (const i of loaded.issues) stages[i.stage] = (stages[i.stage] ?? 0) + 1;
  const doctor = await doctorOf(p);
  return {
    todo: all.slice(0, TODO_LIMIT),
    more,
    total: all.length,
    stages,
    issues: loaded.issues.length,
    sessions: { alive: loaded.sessions.filter((s) => s.state !== "gone").length, total: loaded.sessions.length },
    doctor,
    errors: loaded.errors
  };
}

// ../dashboard/src/export.ts
var ExportLeakError = class extends Error {
  hits;
  constructor(hits) {
    super(`내보낸 파일에 남으면 안 되는 문자열이 있다: ${hits.slice(0, 5).join(", ")}`);
    this.name = "ExportLeakError";
    this.hits = hits;
  }
};
var ExportError = class extends Error {
  code;
  constructor(code, message2) {
    super(message2);
    this.name = "ExportError";
    this.code = code;
  }
};
function scrub(value, map) {
  if (typeof value === "string") {
    let s = value;
    for (const [from, to] of map) s = s.split(from).join(to);
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, map));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (["email", "createdBy", "approver", "user", "sessions", "main", "approvers", "by"].includes(k)) continue;
      out[k] = scrub(v, map);
    }
    return out;
  }
  return value;
}
function page(title, body) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escapeHtml(title)}</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.2rem .5rem}</style></head><body>${body}</body></html>
`;
}
function issueRow(i) {
  return `<tr><td><a href="issues/${encodeURIComponent(i.key)}.html">${escapeHtml(i.key)}</a></td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.area ?? "")}</td><td>${escapeHtml(i.stage)}</td><td>${escapeHtml(i.source)}</td><td>${escapeHtml(i.checkout?.path ?? "")}</td></tr>`;
}
async function exportStatic(opts) {
  const out = import_node_path35.default.resolve(opts.out);
  if (import_node_fs32.default.existsSync(out) && import_node_fs32.default.readdirSync(out).length > 0) throw new ExportError("out_not_empty", `출력 폴더가 비어 있지 않다: ${out}`);
  const home = opts.env.HOME ?? import_node_os.default.homedir();
  const p = await Project.open(opts.cwd, { env: opts.env, home, readOnly: true, multi: true, deps: {} });
  const cos = await checkouts(p);
  const map = [];
  for (const co of cos.slice(1)) map.push([co.path, `<worktrees>/${import_node_path35.default.basename(co.path)}`]);
  map.push([p.loc.top, "."]);
  const loaded = await load(p);
  const issues = loaded.issues.map(publicIssue).map((i) => ({ ...i, sessions: [], checkout: i.checkout ? { ...i.checkout, path: i.checkout.path.replace(/^\.\.\/[^/]+\.worktrees\//, "<worktrees>/") } : null }));
  const data = {
    session: { ...await sessionInfo(p, "single"), readOnly: true, mode: "export" },
    overview: await overview(p).then((o) => ({ ...o, sessions: void 0, todo: o.todo.filter((t) => t.kind !== "dispatch-stale") })),
    issues: { issues },
    intents: { intents: intentFolders(p.root).map((i) => intentModel(p, i, loaded.issues)) },
    verify: { checkouts: await readVerify(p, null) },
    "reports-summary": await readSummary(p),
    worktrees: await readWorktrees(p)
  };
  for (const info of intentFolders(p.root)) {
    const f = flowData(p, info, loaded.issues, []);
    const proposal = f.proposal;
    data[`flow-${info.key}`] = { ...f, nodes: f.nodes.map((n) => ({ ...n, data: { ...n.data, session: null } })), proposal: proposal ? { ...proposal, createdBy: void 0 } : null };
  }
  const written = [];
  const write = (rel2, text2) => {
    const f = import_node_path35.default.join(out, rel2);
    import_node_fs32.default.mkdirSync(import_node_path35.default.dirname(f), { recursive: true });
    import_node_fs32.default.writeFileSync(f, text2);
    written.push(rel2);
  };
  try {
    for (const [name, value] of Object.entries(data)) write(`data/${name}.json`, `${JSON.stringify(scrub(value, map), null, 2)}
`);
    const o = scrub(data.overview, map);
    const rows = issues.map((i) => scrub(i, map));
    write(
      "index.html",
      page(
        `${p.name()} — 관리 페이지(내보내기)`,
        `<h1>${escapeHtml(p.name())}</h1><p>정적 내보내기다. 저장 · 승인 · 답 · 요청은 리포의 관리 페이지 · 콘솔에서 한다.</p><h2>처리할 일</h2><ol>${o.todo.map((t) => `<li>[${t.rank}] ${escapeHtml(t.title)} — ${escapeHtml(t.reason)}</li>`).join("")}</ol><h2>단계별</h2><ul>${Object.entries(o.stages).map(([k, v]) => `<li>${escapeHtml(k)} ${v}</li>`).join("")}</ul><h2>이슈</h2><table><thead><tr><th>키</th><th>이름</th><th>영역</th><th>단계</th><th>출처</th><th>체크아웃</th></tr></thead><tbody>${rows.map(issueRow).join("")}</tbody></table>`
      )
    );
    for (const issue of loaded.issues) {
      const parts = [`<p><a href="../index.html">← 목록</a></p><h1>${escapeHtml(issue.key)} ${escapeHtml(issue.name)}</h1><p>단계: ${escapeHtml(issue.stage)}</p>`];
      for (const doc of ["requirements", "design", "tasks"]) {
        const root = issue.root;
        if (!root) continue;
        const f = import_node_path35.default.join(root, issue.dir, `${doc}.md`);
        if (!import_node_fs32.default.existsSync(f)) continue;
        parts.push(`<section><h2>${doc}.md</h2>${renderMarkdown(import_node_fs32.default.readFileSync(f, "utf8"), { docPath: `${issue.dir}/${doc}.md` })}</section>`);
      }
      write(`issues/${issue.key}.html`, page(`${issue.key} — ${p.name()}`, scrub(parts.join("\n"), map)));
    }
    check2(out, p, home);
  } catch (err) {
    import_node_fs32.default.rmSync(out, { recursive: true, force: true });
    throw err;
  }
  return { out, files: written.sort() };
}
function check2(out, p, home) {
  const needles = /* @__PURE__ */ new Set(["/tmp/cc-socks-", "uds:", "~/.claude", "~/.agents"]);
  for (const h of [home, import_node_os.default.homedir()]) if (h && h.length > 1) needles.add(h);
  const token = (() => {
    try {
      return import_node_fs32.default.readFileSync(import_node_path35.default.join(p.root, ".agents/state/dashboard.token"), "utf8").trim();
    } catch {
      return "";
    }
  })();
  if (token) needles.add(token);
  const hits = [];
  const walk3 = (d) => {
    for (const n of import_node_fs32.default.readdirSync(d)) {
      const f = import_node_path35.default.join(d, n);
      if (import_node_fs32.default.statSync(f).isDirectory()) walk3(f);
      else {
        const text2 = import_node_fs32.default.readFileSync(f, "utf8");
        for (const needle of needles) if (text2.includes(needle)) hits.push(`${import_node_path35.default.relative(out, f)}: ${needle === token ? "<토큰>" : needle}`);
      }
    }
  };
  walk3(out);
  if (hits.length) throw new ExportLeakError(hits);
}

// ../dashboard/src/server.ts
var import_node_crypto6 = __toESM(require("node:crypto"));
var import_node_fs39 = __toESM(require("node:fs"));
var import_node_http = __toESM(require("node:http"));
var import_node_os2 = __toESM(require("node:os"));
var import_node_path43 = __toESM(require("node:path"));

// ../dashboard/src/agent.ts
var import_node_child_process7 = require("node:child_process");
var import_node_path36 = __toESM(require("node:path"));
var HARNESS = /* @__PURE__ */ new Set(["claude", "codex", "kiro", "kiro-cli", "cursor-agent"]);
var INTERPRETERS = /* @__PURE__ */ new Set(["node", "nodejs", "bun", "deno"]);
var PERSONAL = /* @__PURE__ */ new Set(["CODEX_HOME", "KIRO_HOME"]);
var DEPTH = 20;
function envMarker(env) {
  if (env.CLAUDECODE === "1") return "CLAUDECODE=1";
  if (env.CLAUDE_CODE_MESSAGING_SOCKET) return "CLAUDE_CODE_MESSAGING_SOCKET";
  for (const key of Object.keys(env).sort()) {
    if (PERSONAL.has(key) || !env[key]) continue;
    if (key.startsWith("CODEX_") || key.startsWith("KIRO_")) return key;
  }
  if (env.CURSOR_AGENT) return "CURSOR_AGENT";
  return null;
}
function row(pid) {
  const a = (0, import_node_child_process7.spawnSync)("ps", ["-o", "ppid=", "-o", "comm=", "-p", String(pid)], { encoding: "utf8", timeout: 5e3 });
  const b = (0, import_node_child_process7.spawnSync)("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8", timeout: 5e3 });
  const text2 = (a.stdout ?? "").trim();
  if (a.status !== 0 || !text2) return null;
  const m = /^(\d+)\s+(.*)$/.exec(text2);
  if (!m) return null;
  return [Number(m[1]), m[2].trim(), (b.stdout ?? "").trim()];
}
function harnessName(command, args) {
  const names = /* @__PURE__ */ new Set([import_node_path36.default.basename(command).replace(/^-+/, "")]);
  const tokens = args.split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const first = import_node_path36.default.basename(tokens[0]).replace(/^-+/, "");
    names.add(first);
    if (INTERPRETERS.has(first) && tokens.length > 1) names.add(import_node_path36.default.basename(tokens[1]));
  }
  const found = [...names].filter((n) => HARNESS.has(n)).sort();
  return found[0] ?? null;
}
function parentMarker(start = process.ppid) {
  let current4 = start;
  for (let i = 0; i < DEPTH; i += 1) {
    if (current4 <= 1) return null;
    const r = row(current4);
    if (!r) return null;
    const name = harnessName(r[1], r[2]);
    if (name) return `부모 프로세스 ${name}`;
    current4 = r[0];
  }
  return null;
}
function agentSession(env) {
  return envMarker(env) ?? parentMarker();
}

// ../dashboard/src/projects.ts
var import_node_fs33 = __toESM(require("node:fs"));
var import_node_path37 = __toESM(require("node:path"));
function configDir(home) {
  return import_node_path37.default.join(home, ".config/harness-kit");
}
function registryFile(home) {
  return import_node_path37.default.join(configDir(home), "projects.json");
}
function readRegistry(home) {
  const data = readJson(registryFile(home));
  const list2 = data && Array.isArray(data.projects) ? data.projects : [];
  return list2.filter((x) => isObj6(x) && typeof x.path === "string").map((x) => ({ path: String(x.path), name: typeof x.name === "string" ? x.name : import_node_path37.default.basename(String(x.path)), addedAt: typeof x.addedAt === "string" ? x.addedAt : "" }));
}
function writeRegistry(home, projects) {
  ensureDir(configDir(home), 448);
  atomicWrite(registryFile(home), `${JSON.stringify({ schema: "harness-kit.projects/v1", projects }, null, 2)}
`, 384);
  import_node_fs33.default.chmodSync(registryFile(home), 384);
}
function isHarnessRepo(dir) {
  return import_node_fs33.default.existsSync(import_node_path37.default.join(dir, ".agents/harness-kit.json"));
}
function addProject(home, dir, today2) {
  let real2;
  try {
    real2 = import_node_fs33.default.realpathSync(dir);
  } catch {
    throw new ApiError(404, "not_found", `폴더가 없다: ${dir}`);
  }
  if (!isHarnessRepo(real2)) throw new ApiError(422, "not_a_harness_repo", `킷을 설치한 리포가 아니다(.agents/harness-kit.json 없음): ${real2}`);
  const list2 = readRegistry(home);
  const found = list2.find((e) => e.path === real2);
  if (found) return { added: false, entry: found };
  const meta = readJson(import_node_path37.default.join(real2, ".agents/harness-kit.json")) ?? {};
  const project = isObj6(meta.project) ? meta.project : {};
  const entry = { path: real2, name: typeof project.name === "string" && project.name ? project.name : import_node_path37.default.basename(real2), addedAt: today2 };
  writeRegistry(home, [...list2, entry]);
  return { added: true, entry };
}
function removeProject(home, nameOrPath) {
  const list2 = readRegistry(home);
  let real2 = nameOrPath;
  try {
    real2 = import_node_fs33.default.realpathSync(nameOrPath);
  } catch {
    real2 = import_node_path37.default.resolve(nameOrPath);
  }
  const removed = list2.filter((e) => e.name === nameOrPath || e.path === nameOrPath || e.path === real2);
  if (removed.length === 0) throw new ApiError(404, "not_found", `등록부에 없다: ${nameOrPath}`);
  writeRegistry(home, list2.filter((e) => !removed.includes(e)));
  return { removed };
}
function discover(dir, depth = 3) {
  const out = [];
  const walk3 = (d, left) => {
    if (isHarnessRepo(d)) out.push({ path: d, name: import_node_path37.default.basename(d), addedAt: "" });
    if (left === 0) return;
    let names = [];
    try {
      names = import_node_fs33.default.readdirSync(d).sort();
    } catch {
      return;
    }
    for (const n of names) {
      if (n.startsWith(".") || n === "node_modules") continue;
      const f = import_node_path37.default.join(d, n);
      try {
        if (import_node_fs33.default.lstatSync(f).isDirectory()) walk3(f, left - 1);
      } catch {
      }
    }
  };
  walk3(import_node_fs33.default.realpathSync(dir), depth);
  return out;
}
function workspaceEntries(file) {
  const data = readJson(file);
  if (!data) throw bad3(`workspace 파일을 읽지 못했다: ${file}`);
  const list2 = Array.isArray(data.projects) ? data.projects : [];
  return list2.map((x) => typeof x === "string" ? x : isObj6(x) && typeof x.path === "string" ? x.path : null).filter((x) => x !== null).map((p) => {
    const abs = import_node_path37.default.resolve(import_node_path37.default.dirname(file), p);
    return { path: abs, name: import_node_path37.default.basename(abs), addedAt: "" };
  });
}
function modeEntries(mode, home) {
  if (mode.kind === "all" || mode.kind === "single") return readRegistry(home);
  if (mode.kind === "root") return discover(mode.dir);
  return workspaceEntries(mode.file);
}
var Projects = class {
  constructor(entries, opts) {
    this.entries = entries;
    this.opts = opts;
  }
  entries;
  opts;
  slots = /* @__PURE__ */ new Map();
  async list() {
    const out = [];
    for (const e of this.entries()) {
      const id = projectIdOf(e.path);
      let slot = this.slots.get(id);
      if (!slot || slot.entry.path !== e.path) {
        const exists = import_node_fs33.default.existsSync(e.path);
        const state = !exists ? "missing" : isHarnessRepo(e.path) ? "ok" : "not-harness";
        let project = null;
        if (state === "ok") {
          try {
            project = await Project.open(e.path, { ...this.opts, multi: true });
          } catch {
            project = null;
          }
        }
        slot = { entry: e, id, state: state === "ok" && !project ? "not-harness" : state, project };
        this.slots.set(id, slot);
      }
      out.push(slot);
    }
    return out;
  }
  async get(id) {
    return (await this.list()).find((s) => s.id === id)?.project ?? null;
  }
};
async function projectsList(projects) {
  return {
    projects: (await projects.list()).map((s) => ({
      id: s.id,
      name: s.entry.name,
      path: s.entry.path,
      addedAt: s.entry.addedAt || null,
      state: s.state,
      version: s.project ? isObj6(s.project.meta().kit) ? s.project.meta().kit.version ?? null : null : null,
      remove: s.state === "ok" ? null : `npx harness-kit projects remove ${s.entry.name}`
    }))
  };
}
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${ms}ms 넘음`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    );
  });
}
async function projectsOverview(projects, timeoutMs = 3e3) {
  const slots = await projects.list();
  const rows = new Array(slots.length);
  let next = 0;
  const worker = async () => {
    while (next < slots.length) {
      const i = next++;
      const s = slots[i];
      const base = { id: s.id, name: s.entry.name, path: s.entry.path };
      if (!s.project) {
        rows[i] = { ...base, state: s.state, error: s.state === "missing" ? "폴더 없음" : "킷 리포가 아니다" };
        continue;
      }
      try {
        const o = await withTimeout(overview(s.project), timeoutMs);
        rows[i] = { ...base, state: "ok", todo: o.todo.slice(0, 10), total: o.total, stages: o.stages, issues: o.issues, sessions: o.sessions };
      } catch (err) {
        rows[i] = { ...base, state: "error", error: `읽기 실패: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const nested = rows.map((r) => ({ ...r, children: [] }));
  const top = [];
  for (const r of nested) {
    const parent = nested.find((o) => o !== r && String(r.path).startsWith(`${String(o.path)}${import_node_path37.default.sep}`));
    if (parent) parent.children.push({ id: r.id, name: r.name, state: r.state });
    else top.push(r);
  }
  return { projects: top };
}
async function machineSessions(projects) {
  const out = [];
  for (const p of projects) for (const s of await readSessions(p)) out.push({ project: p.name(), projectId: p.id, ...publicSession(s) });
  return { sessions: out };
}

// ../dashboard/src/writers/answers.ts
var import_node_fs35 = __toESM(require("node:fs"));
var import_node_path39 = __toESM(require("node:path"));

// ../dashboard/src/writers/approvals.ts
var import_node_fs34 = __toESM(require("node:fs"));
var import_node_path38 = __toESM(require("node:path"));
var CLARIFY2 = "[NEEDS CLARIFICATION";
var LOG = ".agents/state/approvals-log.jsonl";
var LATER = { codebase: "HK-19", plans: "HK-19", deploy: "HK-21" };
var DOC_FILES = { requirements: "requirements.md", design: "design.md", tasks: "tasks.md" };
function issueFolder(root, key) {
  const dir = import_node_path38.default.join(root, ".agents/docs/issues");
  let names = [];
  try {
    names = import_node_fs34.default.readdirSync(dir);
  } catch {
    names = [];
  }
  const found = names.filter((n) => FOLDER.exec(n)?.[1] === key);
  if (found.length === 0) throw notFound(`이슈 폴더가 없다: ${key}`);
  if (found.length > 1) throw new ApiError(409, "ambiguous_branch", `같은 키의 이슈 폴더가 둘 이상이다: ${found.join(", ")}`);
  return `.agents/docs/issues/${found[0]}`;
}
function writeAll(writes) {
  const done = [];
  try {
    for (const w of writes) {
      let before = null;
      try {
        before = import_node_fs34.default.readFileSync(w.file);
      } catch {
        before = null;
      }
      if (w.data === null) import_node_fs34.default.rmSync(w.file, { force: true });
      else atomicWrite(w.file, w.data);
      done.push({ file: w.file, before });
    }
  } catch (err) {
    for (const d of done.reverse()) {
      try {
        if (d.before === null) import_node_fs34.default.rmSync(d.file, { force: true });
        else atomicWrite(d.file, d.before);
      } catch {
      }
    }
    process.stderr.write(`승인 기록 쓰기 실패: ${err instanceof Error ? err.message : String(err)}
`);
    throw new ApiError(500, "internal", "기록을 쓰지 못해 되돌렸다");
  }
}
function appendLog(root, record) {
  const file = import_node_path38.default.join(root, LOG);
  ensureDir(import_node_path38.default.dirname(file), 448);
  const ignore = import_node_path38.default.join(import_node_path38.default.dirname(file), ".gitignore");
  if (!import_node_fs34.default.existsSync(ignore)) import_node_fs34.default.writeFileSync(ignore, "*\n", { mode: 384 });
  import_node_fs34.default.appendFileSync(file, `${JSON.stringify(record)}
`, { mode: 384 });
}
async function approver(p, co, gate) {
  const u = await gitUser(co.root, p.env);
  if (!u.email) throw new ApiError(403, "not_an_approver", "git config user.email 이 비었다 — 승인자는 이 체크아웃의 git 사용자다");
  const policy = p.policy();
  if (!allowed(u.email, gate, policy)) throw new ApiError(403, "not_an_approver", `${u.email} 은 ${gate} 게이트 승인자 목록(approvers.${gate})에 없다`, { approvers: (policy.approvers ?? {})[gate] ?? [] });
  return { email: u.email, name: u.name, group: groupOf(u.email, gate, policy) };
}
function phraseOf(body, field = "phrase") {
  const v = body[field];
  if (typeof v !== "string" || !v.trim()) throw bad3(`${field} 가 비었다(승인할 때 남길 문구)`);
  return v.replace(/\s+/g, " ").trim().slice(0, 500);
}
async function preconditions(p, co, key, gate) {
  const own = import_node_path38.default.join(co.root, "scripts/harness/sdd_gates.py");
  const script = import_node_fs34.default.existsSync(own) ? own : import_node_path38.default.join(p.root, "scripts/harness/sdd_gates.py");
  const r = await python(co.root, p.env, [script, "check", key, "--json", "--root", co.root], 6e4);
  if (r.code !== 0) throw new ApiError(422, "gate_precondition", "게이트 조건을 판정하지 못했다", { reasons: [(r.stderr.trim().split("\n").pop() ?? "").slice(0, 300)] });
  const data = JSON.parse(r.stdout);
  const g = data.gates.find((x) => x.gate === gate);
  return g?.preconditions ?? g?.reasons ?? [];
}
async function aliveSessions(p, key) {
  return (await readSessions(p)).filter((s) => s.issue === key && s.state !== "gone").map((s) => s.id);
}
async function postApproval(p, body, via) {
  if (p.readOnly) throw readOnly();
  if (!isObj6(body)) throw bad3("본문이 객체가 아니다");
  const gate = typeof body.gate === "string" ? body.gate : "";
  const decision = body.decision === "changes-requested" ? "changes-requested" : body.decision === "approved" ? "approved" : null;
  if (!decision) throw bad3("decision 은 approved 또는 changes-requested 다");
  if (!p.gates().includes(gate)) throw new ApiError(422, "gate_not_in_flow", `${gate} 는 flow.gates 에 없다`, { gates: p.gates() });
  if (Object.hasOwn(LATER, gate)) throw new ApiError(422, "gate_precondition", `${gate} 게이트 승인은 이 판에 없다(${LATER[gate]})`, { later: LATER[gate], reasons: [`${LATER[gate]} 에서 제공한다`] });
  const phrase = phraseOf(body);
  const target = isObj6(body.target) ? body.target : {};
  if (gate === "intent") {
    if (typeof target.intent !== "string") throw bad3("intent 게이트는 target.intent 가 필요하다");
    return approveIntent(p, target.intent, decision, phrase, body, via);
  }
  if (!ISSUE_GATES.includes(gate)) throw new ApiError(422, "gate_not_in_flow", `모르는 게이트: ${gate}`);
  if (typeof target.issue !== "string") throw bad3("target.issue 가 필요하다");
  const key = target.issue;
  const co = await resolveIssueCheckout(p, key, null);
  const folder = issueFolder(co.root, key);
  const approvalsFile = import_node_path38.default.join(co.root, folder, "approvals.md");
  const current4 = import_node_fs34.default.existsSync(approvalsFile) ? import_node_fs34.default.readFileSync(approvalsFile, "utf8") : null;
  const entries = current4 ? parse(current4).entries : [];
  const writes = [];
  let targetRef;
  let statusChanged = null;
  if (Object.hasOwn(DOC_FILES, gate)) {
    const docFile = import_node_path38.default.join(co.root, folder, DOC_FILES[gate]);
    if (!import_node_fs34.default.existsSync(docFile)) throw notFound(`${DOC_FILES[gate]} 가 없다`);
    const bytes = import_node_fs34.default.readFileSync(docFile);
    const text2 = bytes.toString("utf8");
    const fm = parseLoose(text2) ?? {};
    const status = fm.status ?? null;
    const aSha = approvalSha(bytes);
    if (gate !== "tasks" && !["draft", "in-review", "approved"].includes(status ?? "")) throw new ApiError(422, "gate_precondition", `${DOC_FILES[gate]} 머리 status 가 ${status ?? "없음"} 이다(draft · in-review 만 승인한다)`, { reasons: [`status ${status ?? "없음"}`] });
    if (decision === "approved" && approvalState(entries, gate, aSha, p.policy()) === "valid") throw new ApiError(409, "already_approved", `${gate}: 같은 내용(sha ${aSha.slice(0, 12)})으로 승인한 기록이 있다`);
    if (decision === "approved" && text2.includes(CLARIFY2)) throw new ApiError(422, "needs_clarification", `${DOC_FILES[gate]} 에 [NEEDS CLARIFICATION 가 남았다`);
    if (body.docSha256 !== sha2562(bytes)) throw new ApiError(409, "doc_changed", "승인 화면을 연 뒤 문서가 바뀌었다. 다시 읽고 승인한다", { currentSha256: sha2562(bytes) });
    targetRef = { name: DOC_FILES[gate], sha256: aSha };
    if (decision === "approved" && status !== "approved" && gate !== "tasks") {
      writes.push({ file: docFile, data: Buffer.from(setField2(text2, "status", "approved"), "utf8") });
      statusChanged = `${status ?? "없음"}→approved`;
    }
  } else {
    const head = await gitOut(co.root, p.env, "rev-parse", "HEAD");
    targetRef = { name: co.branch ?? "HEAD", head: head || null };
  }
  if (decision === "approved") {
    const reasons = await preconditions(p, co, key, gate);
    if (reasons.length) throw new ApiError(422, "gate_precondition", `${gate} 게이트 조건이 맞지 않는다`, { reasons });
  }
  const who = await approver(p, co, gate);
  const entry = { at: nowText(), gate, decision, approver: who, target: targetRef, phrase, path: via, entryId: ulid(), ruleCandidate: decision === "changes-requested" && body.ruleCandidate === true };
  writes.unshift({ file: approvalsFile, data: Buffer.from(appendedText(current4, key, [entry]), "utf8") });
  writeAll(writes);
  appendLog(co.root, { entryId: entry.entryId, target: folder, gate, sha256: targetRef.sha256 ?? targetRef.head ?? null, at: entry.at, path: via });
  return {
    status: 201,
    data: { entryId: entry.entryId, approvals: `${folder}/approvals.md`, approver: who.email, group: who.group, statusChanged, sessions: await aliveSessions(p, key) }
  };
}
async function approveIntent(p, key, decision, phrase, body, via) {
  const co = await resolveIntentCheckout(p, key);
  const info = findIntent(co.root, key);
  const intentFile = import_node_path38.default.join(info.abs, "intent.md");
  if (!import_node_fs34.default.existsSync(intentFile)) throw notFound("intent.md 가 없다");
  const bytes = import_node_fs34.default.readFileSync(intentFile);
  const text2 = bytes.toString("utf8");
  const status = parseLoose(text2)?.status ?? null;
  const approvalsFile = import_node_path38.default.join(info.abs, "approvals.md");
  const current4 = import_node_fs34.default.existsSync(approvalsFile) ? import_node_fs34.default.readFileSync(approvalsFile, "utf8") : null;
  const entries = current4 ? parse(current4).entries : [];
  const aSha = approvalSha(bytes);
  if (!["draft", "in-review", "approved"].includes(status ?? "")) throw new ApiError(422, "gate_precondition", `intent.md 머리 status 가 ${status ?? "없음"} 이다`, { reasons: [`status ${status ?? "없음"}`] });
  if (decision === "approved" && approvalState(entries, "intent", aSha, p.policy()) === "valid" && !proposalOf(info.abs)) throw new ApiError(409, "already_approved", "같은 내용으로 승인한 기록이 있다");
  if (decision === "approved" && text2.includes(CLARIFY2)) throw new ApiError(422, "needs_clarification", "intent.md 에 [NEEDS CLARIFICATION 가 남았다");
  if (body.docSha256 !== sha2562(bytes)) throw new ApiError(409, "doc_changed", "승인 화면을 연 뒤 intent.md 가 바뀌었다", { currentSha256: sha2562(bytes) });
  if (decision === "approved") {
    const reasons = [];
    try {
      const q2 = parseQuestions(import_node_fs34.default.readFileSync(import_node_path38.default.join(info.abs, "questions.md"), "utf8"));
      const open = q2.questions.filter((x) => x.open && x.blocks === "intent");
      if (open.length) reasons.push(`막는 게이트가 intent 인 열린 질문 ${open.length}건(${open.map((x) => x.id).join(", ")})`);
    } catch {
    }
    const check3 = import_node_path38.default.join(co.root, "scripts/harness/intent_check.py");
    if (import_node_fs34.default.existsSync(check3)) {
      const r = await python(co.root, p.env, [check3, info.abs], 6e4);
      if (r.code !== 0) reasons.push(`intent_check.py 실패: ${(r.stderr.trim().split("\n").pop() ?? "").slice(0, 200)}`);
    }
    if (reasons.length) throw new ApiError(422, "gate_precondition", "intent 게이트 조건이 맞지 않는다", { reasons });
  }
  const who = await approver(p, co, "intent");
  const writes = [];
  const units = readUnitsFile(info.abs);
  let unitsBytes = units.raw;
  const proposal = proposalOf(info.abs);
  if (decision === "approved" && proposal) {
    if (!units.raw || !units.data || proposal.baseSha256 !== sha2562(units.raw)) throw new ApiError(409, "proposal_stale", "제안을 만든 뒤 units.json 이 바뀌었다. 제안을 다시 저장하거나 버린다");
    unitsBytes = appliedUnitsBytes(units.raw, units.data, units.units, proposal.changes ?? []);
    writes.push({ file: import_node_path38.default.join(info.abs, "units.json"), data: unitsBytes });
    writes.push({ file: import_node_path38.default.join(info.abs, "units.proposed.json"), data: null });
  }
  let statusChanged = null;
  if (decision === "approved" && status !== "approved") {
    writes.push({ file: intentFile, data: Buffer.from(setField2(text2, "status", "approved"), "utf8") });
    statusChanged = `${status ?? "없음"}→approved`;
  }
  const at = nowText();
  const made = [{ at, gate: "intent", decision, approver: who, target: { name: "intent.md", sha256: aSha }, phrase, path: via, entryId: ulid(), ruleCandidate: decision === "changes-requested" && body.ruleCandidate === true }];
  if (unitsBytes) made.push({ at, gate: "intent", decision, approver: who, target: { name: "units.json", sha256: sha2562(unitsBytes) }, phrase, path: via, entryId: ulid() });
  writes.unshift({ file: approvalsFile, data: Buffer.from(appendedText(current4, key, made), "utf8") });
  writeAll(writes);
  for (const e of made) appendLog(co.root, { entryId: e.entryId, target: info.dir, gate: "intent", sha256: e.target.sha256 ?? null, at, path: via });
  return { status: 201, data: { entryId: made[0].entryId, approvals: `${info.dir}/approvals.md`, approver: who.email, group: who.group, statusChanged, sessions: [] } };
}
async function reviewFinding(p, key, findingId) {
  const co = await resolveIssueCheckout(p, key, null);
  const folder = issueFolder(co.root, key);
  const own = import_node_path38.default.join(co.root, "scripts/harness/review_state.py");
  const script = import_node_fs34.default.existsSync(own) ? own : import_node_path38.default.join(p.root, "scripts/harness/review_state.py");
  const r = await python(co.root, p.env, [script, import_node_path38.default.join(co.root, folder), "--json"], 3e4);
  if (r.code === 2) throw notFound(`리뷰 보고서가 없다(.agents/reports/review/${key}.md)`);
  const data = JSON.parse(r.stdout);
  const item = data.findings.find((f) => f.id === findingId);
  if (!item) throw notFound(`보고서에 ${findingId} 가 없다`);
  return { co, folder, fp: item.fp, severity: item.severity };
}
async function postReviewDecision(p, key, findingId, body, via) {
  if (p.readOnly) throw readOnly();
  if (!isObj6(body)) throw bad3("본문이 객체가 아니다");
  if (!/^F-\d+$/.test(findingId)) throw bad3("발견 ID 는 F-<n> 이다");
  const decision = body.decision === "risk-accepted" || body.decision === "fix-required" ? body.decision : null;
  if (!decision) throw bad3("decision 은 risk-accepted 또는 fix-required 다");
  const phrase = phraseOf(body);
  const found = await reviewFinding(p, key, findingId);
  const who = await approver(p, found.co, "mr");
  const approvalsFile = import_node_path38.default.join(found.co.root, found.folder, "approvals.md");
  const current4 = import_node_fs34.default.existsSync(approvalsFile) ? import_node_fs34.default.readFileSync(approvalsFile, "utf8") : null;
  const entry = { at: nowText(), gate: `review/${findingId}`, decision, approver: who, target: { name: `.agents/reports/review/${key}.md`, fingerprint: found.fp }, phrase, path: via, entryId: ulid() };
  writeAll([{ file: approvalsFile, data: Buffer.from(appendedText(current4, key, [entry]), "utf8") }]);
  appendLog(found.co.root, { entryId: entry.entryId, target: found.folder, gate: entry.gate, sha256: found.fp, at: entry.at, path: via });
  return { status: 201, data: { entryId: entry.entryId, approvals: `${found.folder}/approvals.md`, approver: who.email, group: who.group, statusChanged: null, sessions: await aliveSessions(p, key) } };
}

// ../dashboard/src/writers/answers.ts
async function locate2(p, target) {
  if (!KEY.test(target)) throw bad3(`대상 키 형식이 아니다: ${target}`);
  const isIntent = import_node_fs35.default.existsSync(import_node_path39.default.join(p.root, ".agents/docs/intents")) && import_node_fs35.default.readdirSync(import_node_path39.default.join(p.root, ".agents/docs/intents")).some((n) => INTENT_FOLDER.exec(n)?.[1] === target);
  if (isIntent) {
    const co2 = await resolveIntentCheckout(p, target);
    const info = findIntent(co2.root, target);
    return { co: co2, rel: `${info.dir}/questions.md`, abs: import_node_path39.default.join(info.abs, "questions.md") };
  }
  const co = await resolveIssueCheckout(p, target, null);
  const folder = issueFolder(co.root, target);
  return { co, rel: `${folder}/questions.md`, abs: import_node_path39.default.join(co.root, folder, "questions.md") };
}
async function getQuestions(p, target) {
  if (!target) throw bad3("target 이 필요하다");
  const { rel: rel2, abs } = await locate2(p, target);
  if (!import_node_fs35.default.existsSync(abs)) return { target, path: rel2, sha256: null, status: null, questions: [] };
  const bytes = import_node_fs35.default.readFileSync(abs);
  const doc = parseQuestions(bytes.toString("utf8"));
  return { target, path: rel2, sha256: sha2562(bytes), status: doc.frontmatter.status ?? null, round: doc.frontmatter.round ?? null, questions: doc.questions };
}
async function postAnswer(p, target, qid, body) {
  if (p.readOnly) throw readOnly();
  if (!isObj6(body)) throw bad3("본문이 객체가 아니다");
  const { co, rel: rel2, abs } = await locate2(p, target);
  if (!import_node_fs35.default.existsSync(abs)) throw notFound(`질문 파일이 없다: ${rel2}`);
  return p.withLock(abs, async () => {
    const bytes = import_node_fs35.default.readFileSync(abs);
    if (body.baseSha256 !== sha2562(bytes)) throw new ApiError(409, "conflict", "다른 곳에서 먼저 저장했다", { currentSha256: sha2562(bytes), currentMarkdown: bytes.toString("utf8") });
    const doc = parseQuestions(bytes.toString("utf8"));
    const q2 = doc.questions.find((x) => x.id === qid);
    if (!q2) throw notFound(`질문이 없다: ${qid}`);
    const choice = typeof body.choice === "string" ? body.choice : "";
    if (choice !== "other" && !q2.choices.some((c) => c.id === choice)) throw bad3(`선택지가 아니다: ${choice} (${q2.choices.map((c) => c.id).join(" · ")} · other)`);
    const text2 = typeof body.text === "string" && body.text.trim() ? body.text : null;
    if (choice === "other" && !text2) throw bad3("other 는 text 가 필요하다");
    const u = await gitUser(co.root, p.env);
    if (!u.email) throw new ApiError(403, "not_an_approver", "git config user.email 이 비었다");
    const groups = p.policy().groups ?? {};
    const members = Object.hasOwn(groups, q2.role) ? groups[q2.role] : void 0;
    const opinion = members !== void 0 && !members.some((m) => m.toLowerCase() === u.email.toLowerCase());
    const out = writeAnswer(bytes.toString("utf8"), { qid, choice, text: text2, email: u.email, at: nowText(), opinion });
    atomicWrite(abs, out.text);
    const after = parseQuestions(out.text).questions;
    return { sha256: sha2562(Buffer.from(out.text, "utf8")), path: rel2, kind: opinion ? "opinion" : "answer", answered: after.filter((x) => !x.open).length, open: after.filter((x) => x.open).length, statusChanged: out.statusChanged };
  });
}

// ../dashboard/src/writers/dispatch.ts
var import_node_fs36 = __toESM(require("node:fs"));
var import_node_net2 = __toESM(require("node:net"));
var import_node_path40 = __toESM(require("node:path"));
var KINDS = ["doc-changed", "answers-ready", "approved", "changes-requested", "review-findings", "custom"];
var MAX = 1e3;
function dispatchBody(body) {
  if (!isObj6(body)) throw bad3("본문이 객체가 아니다");
  const kind = body.kind;
  if (!KINDS.includes(kind)) throw bad3(`kind 는 ${KINDS.join(" · ")} 중 하나다`);
  const target = isObj6(body.target) ? body.target : {};
  const t = {};
  for (const k of ["sessionId", "issue", "role", "name"]) if (typeof target[k] === "string" && target[k]) t[k] = String(target[k]);
  if (!t.sessionId && !t.issue && !t.name && !t.role) throw bad3("target 은 {sessionId} · {issue, role} · {name} 중 하나다");
  const paths = Array.isArray(body.paths) ? body.paths.filter((x) => typeof x === "string").map((x) => oneLine(x).slice(0, 300)).slice(0, 10) : [];
  const text2 = typeof body.text === "string" ? oneLine(body.text) : null;
  if (text2 && [...text2].length > 300) throw bad3("요청 글(text)은 300자 이하다");
  if (kind === "custom" && !text2) throw bad3("custom 은 text 가 필요하다");
  const via = body.via === "socket" || body.via === "deeplink" || body.via === "queue" ? body.via : null;
  const cs = isObj6(body.changeSummary) ? body.changeSummary : null;
  return { target: t, kind, paths, text: text2, changeSummary: cs, via };
}
function message(b, subject) {
  const where = b.paths.length ? ` 경로: ${b.paths.join(", ")}.` : "";
  const cs = b.changeSummary;
  const detail = cs ? `(${[...cs.ids ?? [], ...cs.headings ?? []].slice(0, 6).join(" · ")}${cs.added !== void 0 ? `, +${cs.added} -${cs.removed ?? 0}줄` : ""}${cs.sha256 ? `, sha ${String(cs.sha256).slice(0, 7)}` : ""})` : "";
  const extra = b.text ? ` 메모: ${b.text}` : "";
  const body = {
    "doc-changed": `${subject} 문서를 사람이 고쳤다${detail}.${where} 요청: 이 파일을 다시 읽고 다음 문서를 맞춘다.${extra}`,
    "answers-ready": `${subject} 질문에 답이 들어왔다.${where} 요청: 답을 읽고 반영한다.${extra}`,
    approved: `${subject} 승인 기록이 approvals.md 에 남았다.${where} 요청: 기록을 확인하고 다음 단계를 진행한다.${extra}`,
    "changes-requested": `${subject} 수정 요청 기록이 approvals.md 에 남았다.${where} 요청: 기록의 문구를 읽고 문서를 고친다.${extra}`,
    "review-findings": `${subject} 리뷰 지적 판단이 기록됐다.${where} 요청: review 상태를 읽고 처리한다.${extra}`,
    custom: `${subject} ${b.text ?? ""}${where}`
  };
  const line = oneLine(`[harness-kit 관리 페이지] ${body[b.kind]} 이 글은 승인이 아니다.`);
  return [...line].length > MAX ? [...line].slice(0, MAX).join("") : line;
}
function chooseSession(sessions, t) {
  if (t.sessionId) return sessions.find((s) => s.id === t.sessionId) ?? null;
  if (t.name) return sessions.find((s) => s.name === t.name && s.state !== "gone") ?? null;
  const live = sessions.filter((s) => s.state !== "gone" && (!t.issue || s.issue === t.issue) && (!t.role || s.role === t.role));
  return live.length === 1 ? live[0] : null;
}
function deeplink(cwd, text2) {
  const q2 = `${text2} 먼저 경로의 파일을 읽는다.`;
  return `claude-cli://open?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent([...q2].slice(0, 5e3).join(""))}`;
}
function socketFormat(p) {
  const d = p.meta().dashboard;
  const dispatch = isObj6(d) && isObj6(d.dispatch) ? d.dispatch : {};
  return dispatch.socketFormat === "json" ? "json" : "text";
}
function sendLine(socketPath, line) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok2) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      s.destroy();
      resolve(ok2);
    };
    const s = import_node_net2.default.connect({ path: socketPath });
    let timer = setTimeout(() => done(false), 2e3);
    s.once("connect", () => {
      clearTimeout(timer);
      timer = setTimeout(() => done(true), 2e3);
      s.end(`${line}
`, "utf8");
    });
    s.once("close", () => done(true));
    s.once("error", () => done(false));
  });
}
async function postDispatch(p, raw, createdBy) {
  if (p.readOnly) throw readOnly();
  const b = dispatchBody(raw);
  const sessions = await readSessions(p);
  const session = chooseSession(sessions, b.target);
  if ((b.target.sessionId || b.target.name) && !session) throw notFound("고른 세션이 없다");
  const subject = b.target.issue ?? session?.issue ?? "";
  const text2 = message(b, subject);
  const main2 = (await checkouts(p))[0];
  const cwd = session?.cwdAbs ?? main2?.path ?? p.root;
  const options = () => ({ deeplink: session && session.harness === "claude" ? deeplink(cwd, text2) : session ? null : deeplink(cwd, text2), queueAvailable: true });
  const via = b.via ?? (session && session.state === "alive" ? "socket" : null);
  if (via === null) throw new ApiError(409, "socket_unavailable", "고른 세션의 수신함 소켓이 없다. deep link 또는 대기함을 고른다", options());
  if (via === "socket") {
    if (!session?.socket) throw new ApiError(409, "socket_unavailable", "고른 세션에 수신함 소켓이 없다", options());
    const line = socketFormat(p) === "json" ? JSON.stringify({ type: "message", text: text2 }) : text2;
    if (!await sendLine(session.socket, line)) throw new ApiError(409, "socket_unavailable", "수신함 소켓에 연결하지 못했다", options());
    return { status: 202, data: { method: "socket", status: "sent" } };
  }
  if (via === "deeplink") {
    if (session && session.harness !== "claude") throw new ApiError(409, "deeplink_unavailable", `${session.harness ?? "이"} 하네스에는 deep link 가 없다. 대기함을 쓴다`, { queueAvailable: true });
    return { status: 202, data: { method: "deeplink", url: deeplink(cwd, text2) } };
  }
  const dir = queueDir(p);
  ensureDir(import_node_path40.default.dirname(dir), 448);
  ensureDir(dir, 448);
  const id = ulid();
  const created = /* @__PURE__ */ new Date();
  const item = {
    schema: "harness-kit.dispatch/v1",
    id,
    createdAt: nowText(created),
    createdBy,
    target: { issue: b.target.issue ?? session?.issue ?? null, role: b.target.role ?? null, harness: "any", sessionId: b.target.sessionId ?? (b.target.name ? session?.id ?? null : null) },
    kind: b.kind,
    message: text2,
    paths: b.paths,
    expiresAt: nowText(new Date(created.getTime() + 7 * 24 * 3600 * 1e3))
  };
  atomicWrite(import_node_path40.default.join(dir, `${id}.json`), `${JSON.stringify(item, null, 2)}
`, 384);
  return { status: 202, data: { method: "queue", id } };
}
function dropQueued(p, id) {
  if (p.readOnly) throw readOnly();
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw bad3("대기함 id 형식이 아니다");
  const file = import_node_path40.default.join(queueDir(p), `${id}.json`);
  if (!import_node_fs36.default.existsSync(file)) throw notFound(`대기함 항목이 없다: ${id}`);
  import_node_fs36.default.unlinkSync(file);
  return { id, dropped: true };
}

// ../dashboard/src/writers/docs.ts
var import_node_fs37 = __toESM(require("node:fs"));
var import_node_path41 = __toESM(require("node:path"));

// ../dashboard/src/paths.ts
var ISSUE_DOC = /^\.agents\/docs\/issues\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\/(requirements|design|tasks)\.md$/;
var INTENT_DOC = /^\.agents\/docs\/intents\/((?:[A-Z][A-Z0-9]{1,9})-[1-9][0-9]{0,5})-[^/]+\/(intent|current-state)\.md$/;
var PLANS = /^\.agents\/docs\/intents\/((?:[A-Z][A-Z0-9]{1,9})-[1-9][0-9]{0,5})-[^/]+\/plans\/(?:[^/]+\/)*[^/]+\.md$/;
var MAIN_DOCS = [
  [/^\.agents\/docs\/decisions\/[^/]+\.md$/, true],
  [/^\.agents\/docs\/ops\/records\/[^/]+\.md$/, true],
  [/^\.agents\/docs\/ops\/(?:[^/]+\/)*[^/]+\.md$/, false],
  [/^\.agents\/docs\/codebase\/[^/]+\.md$/, false],
  [/^\.agents\/docs\/rule-candidates\/[^/]+\.md$/, false]
];
var READ_DOCS = [/^\.agents\/docs\/(?:[^/]+\/)*[^/]+\.md$/, /^docs\/(?:[^/]+\/)*[^/]+\.md$/];
var RAW = /^\.agents\/docs\/(?:[^/]+\/)*[^/]+\.(png|jpe?g|gif|webp|svg|html)$/i;
function checkRel(input) {
  if (typeof input !== "string" || input.length === 0 || input.length > 1024) throw forbiddenPath(String(input ?? ""));
  if (input.includes("\\") || input.includes("\0") || input.startsWith("/") || /^[a-zA-Z]:/.test(input)) throw forbiddenPath(input);
  const parts = input.split("/");
  for (const part of parts) if (part === "" || part === "." || part === ".." || part.toLowerCase() === ".git") throw forbiddenPath(input);
  return input;
}
function docTarget(input) {
  const rel2 = checkRel(input);
  const issue = ISSUE_DOC.exec(rel2);
  if (issue) return { rel: rel2, kind: "issue", key: issue[1], creatable: false };
  const intent = INTENT_DOC.exec(rel2);
  if (intent) return { rel: rel2, kind: "intent", key: intent[1], creatable: false };
  const plans = PLANS.exec(rel2);
  if (plans) return { rel: rel2, kind: "intent", key: plans[1], creatable: true };
  for (const [re, creatable] of MAIN_DOCS) if (re.test(rel2)) return { rel: rel2, kind: "main", key: null, creatable };
  throw forbiddenPath(rel2);
}
function readTarget(input) {
  const rel2 = checkRel(input);
  try {
    return { ...docTarget(rel2), writable: true };
  } catch {
    if (!READ_DOCS.some((re) => re.test(rel2))) throw forbiddenPath(rel2);
    const issue = /^\.agents\/docs\/issues\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\//.exec(rel2);
    if (issue) return { rel: rel2, kind: "issue", key: issue[1], creatable: false, writable: false };
    const intent = /^\.agents\/docs\/intents\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\//.exec(rel2);
    if (intent) return { rel: rel2, kind: "intent", key: intent[1], creatable: false, writable: false };
    return { rel: rel2, kind: "main", key: null, creatable: false, writable: false };
  }
}
function rawTarget(input) {
  const rel2 = checkRel(input);
  if (!RAW.test(rel2)) throw forbiddenPath(rel2);
  return rel2;
}
function contentType(rel2) {
  const ext = rel2.slice(rel2.lastIndexOf(".") + 1).toLowerCase();
  const map = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", html: "text/html; charset=utf-8" };
  return map[ext] ?? "application/octet-stream";
}

// ../dashboard/src/writers/docs.ts
var LIMIT = 1024 * 1024;
async function writeCheckout(p, t) {
  if (t.kind === "issue" && t.key) return resolveIssueCheckout(p, t.key, t.rel);
  if (t.kind === "intent" && t.key) return resolveIntentCheckout(p, t.key);
  return (await checkouts(p))[0];
}
async function locateForRead(p, t) {
  if (t.kind === "issue" && t.key) {
    const cos = await checkouts(p);
    const co2 = cos.find((c) => c.key === t.key);
    if (co2 && lstatChain(co2.root, t.rel) === "file") return { co: co2, ref: null, bytes: import_node_fs37.default.readFileSync(import_node_path41.default.join(co2.root, t.rel)) };
    const branch = (await branches(p)).find((b) => ISSUE_BRANCH.exec(b)?.[2] === t.key && !cos.some((c) => c.branch === b));
    if (branch) {
      const prefix = p.loc.prefix ? `${p.loc.prefix}/` : "";
      const shown = await git(p.loc.top, p.env, "show", `${branch}:${prefix}${t.rel}`);
      if (shown.code === 0) return { co: null, ref: branch, bytes: Buffer.from(shown.stdout, "utf8") };
    }
  }
  const main2 = (await checkouts(p))[0];
  let co = main2;
  if (t.kind === "intent" && t.key) {
    try {
      co = await resolveIntentCheckout(p, t.key);
    } catch {
      co = main2;
    }
  }
  if (lstatChain(co.root, t.rel) !== "file") throw notFound(`문서가 없다: ${t.rel}`);
  return { co, ref: null, bytes: import_node_fs37.default.readFileSync(import_node_path41.default.join(co.root, t.rel)) };
}
async function readRaw(p, relPath) {
  const issue = /^\.agents\/docs\/issues\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\//.exec(relPath);
  const intent = /^\.agents\/docs\/intents\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\//.exec(relPath);
  const t = issue ? { rel: relPath, kind: "issue", key: issue[1], creatable: false } : intent ? { rel: relPath, kind: "intent", key: intent[1], creatable: false } : { rel: relPath, kind: "main", key: null, creatable: false };
  const found = await locateForRead(p, t);
  if (found.bytes.length > 20 * LIMIT) throw bad3("파일이 너무 크다");
  return found.bytes;
}
async function getDoc(p, relInput, sign) {
  const t = readTarget(relInput);
  const found = await locateForRead(p, t);
  if (found.bytes.length > LIMIT) throw bad3("1 MiB 를 넘는 문서다");
  const text2 = found.bytes.toString("utf8");
  let writable = t.writable && found.co !== null;
  if (writable) {
    try {
      const co = await writeCheckout(p, t);
      writable = co.root === found.co?.root;
    } catch {
      writable = false;
    }
  }
  return {
    path: t.rel,
    sha256: sha2562(found.bytes),
    frontmatter: parseLoose(text2) ?? {},
    html: renderMarkdown(text2, { docPath: t.rel, ...sign ? { sign } : {} }),
    markdown: text2,
    writable: writable && !p.readOnly,
    checkout: found.co ? { kind: found.co.main ? "main" : "worktree", path: rel(p.loc.top, found.co.path), branch: found.co.branch } : { kind: "branch", path: null, branch: found.ref }
  };
}
var IDS = /\b(R\d+(?:\.\d+)*|SC-\d+|S-\d+|U-\d+)\b/g;
function changeSummary(before, after) {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s += 1;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea -= 1;
    eb -= 1;
  }
  const midA = a.slice(s, ea);
  const midB = b.slice(s, eb);
  const removedIdx = [];
  const addedIdx = [];
  if (midA.length * midB.length <= 4e6) {
    const n = midA.length;
    const m = midB.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i2 = n - 1; i2 >= 0; i2 -= 1) for (let j2 = m - 1; j2 >= 0; j2 -= 1) dp[i2][j2] = midA[i2] === midB[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) removedIdx.push(s + i++);
      else addedIdx.push(s + j++);
    }
    while (i < n) removedIdx.push(s + i++);
    while (j < m) addedIdx.push(s + j++);
  } else {
    for (let i = s; i < ea; i += 1) removedIdx.push(i);
    for (let j = s; j < eb; j += 1) addedIdx.push(j);
  }
  const headingAt = (lines, idx) => {
    for (let k = idx; k >= 0; k -= 1) if (/^#{1,6}\s/.test(lines[k])) return lines[k];
    return null;
  };
  const headings = /* @__PURE__ */ new Set();
  const ids2 = /* @__PURE__ */ new Set();
  for (const i of removedIdx) {
    const h = headingAt(a, i);
    if (h) headings.add(h);
    for (const m of a[i].matchAll(IDS)) ids2.add(m[1]);
  }
  for (const j of addedIdx) {
    const h = headingAt(b, j);
    if (h) headings.add(h);
    for (const m of b[j].matchAll(IDS)) ids2.add(m[1]);
  }
  return { headings: [...headings], ids: [...ids2], added: addedIdx.length, removed: removedIdx.length };
}
async function putDoc(p, body) {
  if (p.readOnly) throw readOnly();
  if (!body || typeof body !== "object") throw bad3("본문이 객체가 아니다");
  const b = body;
  const t = docTarget(b.path);
  if (typeof b.baseSha256 !== "string" || typeof b.markdown !== "string") throw bad3("path · baseSha256 · markdown 이 필요하다");
  if (Buffer.byteLength(b.markdown) > LIMIT) throw bad3("1 MiB 를 넘는다");
  const force = b.force === true;
  const co = await writeCheckout(p, t);
  const kind = lstatChain(co.root, t.rel);
  if (kind !== "file" && !(kind === "missing" && t.creatable)) throw kind === "missing" ? notFound(`문서가 없다: ${t.rel}`) : forbiddenPath(t.rel);
  const abs = import_node_path41.default.join(co.root, t.rel);
  return p.withLock(abs, async () => {
    const current4 = kind === "file" ? import_node_fs37.default.readFileSync(abs) : Buffer.alloc(0);
    if (current4.length > LIMIT) throw bad3("1 MiB 를 넘는 문서다");
    const currentText = current4.toString("utf8");
    if (sha2562(current4) !== b.baseSha256) throw new ApiError(409, "conflict", "다른 곳에서 먼저 저장했다", { currentSha256: sha2562(current4), currentMarkdown: currentText });
    let next = b.markdown.replace(/\r\n/g, "\n");
    let after;
    try {
      after = parse2(next);
    } catch (err) {
      throw bad3(`문서 머리를 읽지 못한다: ${err.message}`);
    }
    const before = parseLoose(currentText);
    let statusChanged = null;
    if (after?.status === "approved" && before?.status !== "approved") throw new ApiError(422, "status_change_forbidden", "머리 status 를 approved 로 바꾸는 것은 승인 처리만 한다(승인 화면 · approve)");
    if (before?.status === "approved" && after?.status === "approved" && next !== currentText.replace(/\r\n/g, "\n")) {
      next = setField2(next, "status", "in-review");
      statusChanged = "approved→in-review";
    }
    const held = await leaseHolder(p, co, t.rel);
    if (held && !force) throw new ApiError(409, "lease_held", `다른 세션(${held})이 이 파일을 점유 중이다. force 로 저장할 수 있다`, { leaseHeldBy: held });
    if (currentText.includes("\r\n")) next = next.replace(/\n/g, "\r\n");
    atomicWrite(abs, next, kind === "file" ? void 0 : 420);
    const summary = changeSummary(currentText, next);
    return {
      data: { sha256: sha2562(Buffer.from(next, "utf8")), savedTo: rel(p.loc.top, co.path), branch: co.branch, statusChanged, changeSummary: summary, leaseHeldBy: held },
      meta: { commit: "커밋은 그 이슈의 세션이 한다" }
    };
  });
}
async function leaseHolder(p, co, relPath) {
  const owned = await leases(p, co.root);
  if (owned.size === 0) return null;
  const sessions = await readSessions(p);
  for (const [id, l] of owned) {
    if (!l.active) continue;
    if (!l.files.some((f) => f === relPath || relPath.startsWith(`${f}/`) || f.startsWith(`${relPath}/`))) continue;
    const reg = sessions.find((s) => s.id === id);
    if (reg && reg.state === "gone") continue;
    return id;
  }
  return null;
}

// ../dashboard/src/writers/proposals.ts
var import_node_fs38 = __toESM(require("node:fs"));
var import_node_path42 = __toESM(require("node:path"));
async function postProposal(p, body) {
  if (p.readOnly) throw readOnly();
  const b = proposalBody(body);
  const co = await resolveIntentCheckout(p, b.intent);
  const info = findIntent(co.root, b.intent);
  return p.withLock(import_node_path42.default.join(info.abs, "units.proposed.json"), async () => {
    const units = readUnitsFile(info.abs);
    if (!units.raw) throw notFound("units.json 이 없다");
    if (sha2562(units.raw) !== b.baseSha256) throw new ApiError(409, "conflict", "units.json 이 바뀌었다. 다시 읽고 제안한다", { currentSha256: sha2562(units.raw) });
    const file = import_node_path42.default.join(info.abs, "units.proposed.json");
    if (b.proposalSha256 && import_node_fs38.default.existsSync(file) && sha2562(import_node_fs38.default.readFileSync(file)) !== b.proposalSha256) throw new ApiError(409, "conflict", "다른 곳에서 제안을 먼저 저장했다");
    applyChanges(units.units, b.changes);
    const u = await gitUser(co.root, p.env);
    const proposal = { schema: "harness-kit.units-proposal/v1", intent: b.intent, baseSha256: b.baseSha256, createdBy: u.email, createdAt: nowText(), changes: b.changes };
    const text2 = `${JSON.stringify(proposal, null, 2)}
`;
    atomicWrite(file, text2);
    return { intent: b.intent, path: `${info.dir}/units.proposed.json`, sha256: sha2562(Buffer.from(text2, "utf8")), changes: b.changes.length };
  });
}
async function deleteProposal(p, intent) {
  if (p.readOnly) throw readOnly();
  const co = await resolveIntentCheckout(p, intent);
  const info = findIntent(co.root, intent);
  if (!proposalOf(info.abs)) throw notFound("변경 제안이 없다");
  import_node_fs38.default.unlinkSync(import_node_path42.default.join(info.abs, "units.proposed.json"));
  return { intent, discarded: true };
}

// ../dashboard/src/api.ts
var ok = (data, status = 200, meta) => ({ status, data, ...meta ? { meta } : {} });
var q = (r, k) => r.query.get(k) || null;
async function issueList(p, r) {
  const { issues, errors } = await load(p);
  const area = q(r, "area");
  const stage = q(r, "stage");
  const intent = q(r, "intent");
  const list2 = issues.filter((i) => (!area || i.area === area) && (!stage || i.stage === stage) && (!intent || i.intent === intent));
  return ok({ issues: list2.map(publicIssue), errors });
}
async function oneIssue(p, key) {
  const { issues } = await load(p);
  const i = issues.find((x) => x.key === key);
  if (!i) throw notFound(`이슈가 없다: ${key}`);
  return i;
}
var stub = (method, path57, stage, cli, what) => ({
  method,
  path: path57,
  stub: stage,
  cli,
  handler: async () => {
    throw notImplemented(stage, what);
  }
});
var ROUTES = [
  { method: "GET", path: "/session", cli: "status --session", handler: async (p, r) => ok(await sessionInfo(p, r.mode)) },
  { method: "GET", path: "/overview", cli: "status", handler: async (p) => ok(await overview(p)) },
  {
    method: "GET",
    path: "/intents",
    cli: "status --intents",
    handler: async (p) => {
      const { issues } = await load(p);
      return ok({ intents: intentFolders(p.root).map((i) => intentModel(p, i, issues)) });
    }
  },
  {
    method: "GET",
    path: "/intents/{key}",
    cli: "status --intent <키>",
    handler: async (p, r) => {
      const { issues } = await load(p);
      return ok(intentModel(p, findIntent(p.root, r.params.key), issues));
    }
  },
  stub("GET", "/intents/{key}/burn", "HK-18", "status --flow <INT> --burn(HK-18)", "남은 Bolt 계단선"),
  { method: "GET", path: "/issues", cli: "status --issues [--area --stage --intent]", handler: issueList },
  { method: "GET", path: "/issues/{key}", cli: "status --issue <키>", handler: async (p, r) => ok(publicIssue(await oneIssue(p, r.params.key))) },
  { method: "GET", path: "/docs", cli: "status --doc <경로>", handler: async (p, r) => ok(await getDoc(p, q(r, "path"), r.sign)) },
  {
    method: "PUT",
    path: "/docs",
    cli: "편집기로 파일을 직접 고친다(06 §3.15 S03)",
    handler: async (p, r) => {
      const res = await putDoc(p, r.body);
      return ok(res.data, 200, res.meta);
    }
  },
  { method: "GET", path: "/questions", cli: "answer <대상> --list", handler: async (p, r) => ok(await getQuestions(p, q(r, "target"))) },
  { method: "POST", path: "/questions/{target}/{qid}/answer", pin: true, cli: "answer <대상> <Q-n> --choice <A-D|other> [--text]", handler: async (p, r) => ok(await postAnswer(p, r.params.target, r.params.qid, r.body)) },
  {
    method: "POST",
    path: "/approvals",
    pin: true,
    cli: "approve <키> --gate <게이트> --phrase … [--changes-requested]",
    handler: async (p, r) => {
      const res = await postApproval(p, r.body, r.via);
      return ok(res.data, res.status);
    }
  },
  {
    method: "POST",
    path: "/reviews/{key}/{findingId}/decision",
    pin: true,
    cli: "review decide <키> <F-n> --fix|--accept-risk --reason …",
    handler: async (p, r) => {
      const res = await postReviewDecision(p, r.params.key, r.params.findingId, r.body, r.via);
      return ok(res.data, res.status);
    }
  },
  { method: "GET", path: "/verify", cli: "status --verify [--issue]", handler: async (p, r) => ok({ checkouts: await readVerify(p, q(r, "issue")) }) },
  { method: "GET", path: "/reports/summary", cli: "quality", handler: async (p) => ok(await readSummary(p)) },
  { method: "GET", path: "/reports/findings", cli: "quality --findings [--issue --severity --new]", handler: async (p, r) => ok(await readFindings(p, { issue: q(r, "issue"), severity: q(r, "severity"), onlyNew: q(r, "new") === "1" || q(r, "new") === "true" })) },
  {
    method: "GET",
    path: "/reviews/{key}",
    cli: "review show <키>",
    handler: async (p, r) => {
      const key = r.params.key;
      const i = await oneIssue(p, key);
      const root = i.root ?? (await checkouts(p))[0]?.root ?? p.root;
      return ok(await readReview(p, root, issueFolder(root, key)));
    }
  },
  { method: "GET", path: "/worktrees", cli: "status --worktrees", handler: async (p) => ok(await readWorktrees(p)) },
  {
    method: "GET",
    path: "/sessions",
    cli: "sessions [--machine]",
    handler: async (p, r) => {
      if (q(r, "scope") === "machine") {
        const list2 = r.projects ? (await r.projects.list()).map((s) => s.project).filter((x) => x !== null) : [p];
        if (!list2.some((x) => x.id === p.id) && r.mode === "single") list2.unshift(p);
        return ok(await machineSessions(list2));
      }
      return ok({ sessions: (await readSessions(p)).map(publicSession) });
    }
  },
  stub("GET", "/skills", "HK-18", "skills(HK-18)", "스킬 목록"),
  {
    method: "GET",
    path: "/harness",
    cli: "status --harness",
    handler: async (p) => {
      const meta = p.meta();
      const kit = isObj6(meta.kit) ? meta.kit : {};
      const doctor = await doctorOf(p);
      return ok({ doctor, kit: { version: kit.version ?? null }, agents: Array.isArray(meta.agents) ? meta.agents : [], modules: p.modules(), roles: isObj6(meta.roles) ? meta.roles : {}, gates: p.gates(), floor: GATE_FLOOR });
    }
  },
  {
    method: "POST",
    path: "/harness/outdated",
    cli: "outdated",
    handler: async (p) => {
      if (!p.deps.outdated) throw notImplemented("CLI", "최신 버전 조회");
      return ok(await p.deps.outdated(p.root, p.env));
    }
  },
  {
    method: "POST",
    path: "/dispatch",
    cli: "dispatch --to <세션|키:역할|이름> --kind … --path … [--text] [--via]",
    handler: async (p, r) => {
      const res = await postDispatch(p, r.body, (await p.user()).email);
      return ok(res.data, res.status);
    }
  },
  { method: "GET", path: "/dispatch/queue", cli: "dispatch list", handler: async (p) => ok({ items: await readQueue(p) }) },
  { method: "DELETE", path: "/dispatch/queue/{id}", cli: "dispatch drop <id>", handler: async (p, r) => ok(dropQueued(p, r.params.id)) },
  stub("GET", "/checkpoints", "HK-20", "— (entire 모듈, HK-20)", "체크포인트 목록"),
  stub("GET", "/checkpoints/{id}", "HK-20", "— (entire 모듈, HK-20)", "체크포인트 설명"),
  stub("GET", "/ops", "HK-21", "status --ops(HK-21)", "운영 기록"),
  stub("POST", "/intake", "HK-19", "intake(HK-19)", "요구사항 접수"),
  {
    method: "GET",
    path: "/flow",
    cli: "status --flow <INT>",
    handler: async (p, r) => {
      const key = q(r, "intent");
      if (!key) throw bad3("intent 가 필요하다");
      const { issues, sessions } = await load(p);
      return ok(flowData(p, findIntent(p.root, key), issues, sessions));
    }
  },
  { method: "GET", path: "/flow/gates", cli: "flow gates", handler: async (p) => ok({ gates: p.gates(), floor: GATE_FLOOR, command: "npx harness-kit flow gates --add <게이트> --after <게이트>" }) },
  { method: "POST", path: "/units/proposals", cli: "units propose <INT> --add-dep U-a:U-b | --remove-dep … | --split … | --merge … | --order …", handler: async (p, r) => ok(await postProposal(p, r.body)) },
  { method: "DELETE", path: "/units/proposals/{intent}", cli: "units discard <INT>", handler: async (p, r) => ok(await deleteProposal(p, r.params.intent)) },
  {
    method: "GET",
    path: "/projects",
    multi: true,
    cli: "projects list",
    handler: async (_p, r) => {
      if (!r.projects) throw notFound("전체 프로젝트 모드가 아니다(dashboard --all · --root · --workspace)");
      return ok(await projectsList(r.projects));
    }
  },
  {
    method: "GET",
    path: "/projects/overview",
    multi: true,
    cli: "status --all",
    handler: async (_p, r) => {
      if (!r.projects) throw notFound("전체 프로젝트 모드가 아니다");
      return ok(await projectsOverview(r.projects));
    }
  },
  stub("GET", "/usage", "HK-18", "usage(HK-18)", "토큰 사용량"),
  stub("GET", "/usage/now", "HK-18", "usage --now(HK-18)", "지금 세션 컨텍스트"),
  stub("GET", "/usage/kit", "HK-18", "usage --kit(HK-18)", "킷이 덧붙인 양"),
  {
    method: "GET",
    path: "/history",
    stub: "HK-18",
    cli: "history [--q] (꺼짐이면 history_off)",
    handler: async (p) => {
      if (p.machineConfig().history !== "on") throw new ApiError(404, "history_off", '대화 기록 읽기가 꺼져 있다. 켜려면 사람이 ~/.config/harness-kit/config.json 에 "history": "on" 을 쓴다', { config: "~/.config/harness-kit/config.json" });
      throw notImplemented("HK-18", "프롬프트 기록");
    }
  },
  { method: "GET", path: "/raw/{path}", cli: "— (브라우저 이미지 · 와이어프레임, 서명 URL)", handler: async () => {
    throw notFound("서명 URL 로만 연다");
  } }
];
var COMPILED = ROUTES.map((route) => {
  const names = [];
  const re = new RegExp(`^${route.path.replace(/\{([a-zA-Z]+)\}/g, (_m, n) => {
    names.push(n);
    return "([^/]+)";
  })}$`);
  return { route, re, names };
});
function match(method, path57) {
  const methods = [];
  for (const c of COMPILED) {
    const m = c.re.exec(path57);
    if (!m) continue;
    if (c.route.method !== method) {
      methods.push(c.route.method);
      continue;
    }
    const params = {};
    c.names.forEach((n, i) => {
      params[n] = decodeURIComponent(m[i + 1]);
    });
    return { route: c.route, params };
  }
  return methods.length ? { methods } : null;
}
async function callApi(p, method, path57, opts = {}) {
  const m = match(method, path57);
  if (!m || !("route" in m)) throw notFound(`경로 없음: ${method} ${path57}`);
  return m.route.handler(p, { method, params: m.params, query: new URLSearchParams(opts.query ?? {}), body: opts.body, via: opts.via ?? "terminal", mode: opts.mode ?? "single", ...opts.projects ? { projects: opts.projects } : {} });
}

// ../dashboard/src/server.ts
var STATIC = typeof define_HK_STATIC_default === "object" && define_HK_STATIC_default ? define_HK_STATIC_default : {};
var StartError = class extends Error {
  exitCode;
  hint;
  constructor(exitCode, message2, hint) {
    super(message2);
    this.exitCode = exitCode;
    this.hint = hint;
  }
};
var LIMIT2 = 1024 * 1024;
var PIN_TRIES = 5;
var RAW_TTL = 600;
var CROCKFORD2 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
var RAW_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'";
function newPin() {
  const bytes = import_node_crypto6.default.randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i += 1) out += CROCKFORD2[bytes[i] & 31];
  return out;
}
function same(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && import_node_crypto6.default.timingSafeEqual(x, y);
}
function stateFiles(root) {
  const dir = import_node_path43.default.join(root, ".agents/state");
  return { dir, token: import_node_path43.default.join(dir, "dashboard.token"), info: import_node_path43.default.join(dir, "dashboard.json") };
}
function writeSecret(file, text2) {
  try {
    const st = import_node_fs39.default.lstatSync(file);
    if (st.isSymbolicLink() || st.isFile()) import_node_fs39.default.unlinkSync(file);
  } catch {
  }
  const fd = import_node_fs39.default.openSync(file, import_node_fs39.default.constants.O_WRONLY | import_node_fs39.default.constants.O_CREAT | import_node_fs39.default.constants.O_EXCL | (import_node_fs39.default.constants.O_NOFOLLOW ?? 0), 384);
  try {
    import_node_fs39.default.writeSync(fd, text2);
  } finally {
    import_node_fs39.default.closeSync(fd);
  }
  import_node_fs39.default.chmodSync(file, 384);
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function healthz(port) {
  return new Promise((resolve) => {
    const req = import_node_http.default.request({ host: "127.0.0.1", port, path: "/healthz", method: "GET", headers: { Host: `127.0.0.1:${port}` }, timeout: 1e3 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}
async function findRunning(cwd, env, agent = () => agentSession(env)) {
  let root;
  try {
    root = (await Project.open(cwd, { env, home: env.HOME ?? import_node_os2.default.homedir(), readOnly: true, multi: true, deps: {} })).root;
  } catch {
    return null;
  }
  const files = stateFiles(root);
  const info = readJson(files.info);
  if (!info || typeof info.pid !== "number" || typeof info.port !== "number") return null;
  if (!pidAlive(info.pid) || !await healthz(info.port)) return null;
  const base = `http://127.0.0.1:${info.port}/`;
  if (agent()) return { url: base, port: info.port };
  let token = "";
  try {
    token = import_node_fs39.default.readFileSync(files.token, "utf8").trim();
  } catch {
    token = "";
  }
  return { url: token ? `${base}#t=${token}` : base, port: info.port };
}
function send(res, status, body, headers) {
  res.writeHead(status, { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...headers });
  res.end(body);
}
function sendJson(res, status, value, extra = {}) {
  send(res, status, JSON.stringify(value), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
}
function sendError(res, err) {
  sendJson(res, err.status, err.body());
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > LIMIT2) over = true;
      else chunks.push(c);
    });
    req.on("end", () => over ? reject(new ApiError(400, "bad_request", "본문이 1 MiB 를 넘는다")) : resolve(Buffer.concat(chunks)));
    req.on("error", () => reject(new ApiError(400, "bad_request", "본문을 읽지 못했다")));
  });
}
async function startServer(opts) {
  const mode = opts.mode ?? { kind: "single" };
  const home = opts.home ?? opts.env.HOME ?? import_node_os2.default.homedir();
  const marker = (opts.agentSession ?? (() => agentSession(opts.env)))();
  const readOnly2 = opts.readOnly === true || marker !== null;
  const readOnlyReason = marker ?? (opts.readOnly ? "--read-only" : null);
  const deps = opts.deps ?? {};
  const log = opts.stderr ?? ((s) => process.stderr.write(s));
  const projectOpts = { env: opts.env, home, readOnly: readOnly2, deps };
  let single = null;
  let projects = null;
  if (mode.kind === "single") {
    try {
      single = await Project.open(opts.cwd, { ...projectOpts, multi: false });
    } catch (err) {
      throw new StartError(3, err instanceof Error ? err.message : String(err), "npx harness-kit doctor");
    }
    const meta = single.meta();
    if (meta.schema !== "harness-kit/v2") throw new StartError(3, `.agents/harness-kit.json 의 schema 가 harness-kit/v2 가 아니다(${String(meta.schema ?? "없음")})`, "npx harness-kit doctor");
  } else {
    projects = new Projects(() => modeEntries(mode, home), { ...projectOpts, multi: true });
  }
  const token = import_node_crypto6.default.randomBytes(32).toString("base64url");
  const pin = readOnly2 ? null : newPin();
  let failures = 0;
  const files = single ? stateFiles(single.root) : null;
  if (files) {
    import_node_fs39.default.mkdirSync(files.dir, { recursive: true, mode: 448 });
    import_node_fs39.default.chmodSync(files.dir, 448);
    writeSecret(files.token, `${token}
`);
  }
  let port = 0;
  const hosts = () => [`127.0.0.1:${port}`, `localhost:${port}`];
  const origins = () => [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const sign = (prefix) => (relPath) => {
    const exp = Math.floor(Date.now() / 1e3) + RAW_TTL;
    const sig = import_node_crypto6.default.createHmac("sha256", token).update(`${relPath}
${exp}`).digest("hex");
    return `${prefix}/raw/${relPath.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}`;
  };
  async function projectFor(rest) {
    if (single) return { p: single, path: rest, prefix: "" };
    const m = /^\/p\/([0-9a-f]{12})(\/.*)$/.exec(rest);
    if (!m || !projects) return null;
    const p = await projects.get(m[1]);
    return p ? { p, path: m[2], prefix: `/p/${m[1]}` } : null;
  }
  async function handleApi(req, res, url) {
    const auth = req.headers.authorization ?? "";
    const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!given || !same(given, token)) throw new ApiError(401, "unauthorized", "토큰이 없거나 틀렸다");
    const method = req.method ?? "GET";
    const writes = method === "POST" || method === "PUT" || method === "DELETE";
    const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== void 0;
    if (writes) {
      const origin = req.headers.origin ?? "";
      const ct = String(req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
      if (!origins().includes(origin)) throw new ApiError(403, "forbidden_origin", "Origin 이 이 서버가 아니다");
      if ((method !== "DELETE" || hasBody) && ct !== "application/json") throw new ApiError(403, "forbidden_origin", "Content-Type 이 application/json 이 아니다");
    }
    let body;
    if (writes && hasBody) {
      const raw = await readBody(req);
      try {
        body = raw.length ? JSON.parse(raw.toString("utf8")) : void 0;
      } catch {
        throw new ApiError(400, "bad_request", "JSON 형식 오류");
      }
    }
    const rest = url.pathname.slice("/api/v1".length) || "/";
    let target = await projectFor(rest);
    if (!target && projects) {
      const top = match(method, rest);
      if (top && "route" in top && (top.route.multi || rest === "/sessions" && url.searchParams.get("scope") === "machine")) {
        const first = (await projects.list()).find((s) => s.project)?.project ?? null;
        if (!first && !top.route.multi) throw new ApiError(404, "not_found", "읽을 프로젝트가 없다");
        target = { p: first, path: rest, prefix: "" };
      }
    }
    if (!target) throw new ApiError(404, "not_found", "프로젝트가 없다");
    const m = match(method, target.path);
    if (!m) throw new ApiError(404, "not_found", `경로 없음: ${target.path}`);
    if (!("route" in m)) throw new ApiError(405, "method_not_allowed", `허용 메서드: ${m.methods.join(", ")}`);
    if (m.route.pin) {
      if (readOnly2) throw new ApiError(403, "read_only", "읽기 전용 모드다 — PIN 이 없다");
      if (failures >= PIN_TRIES) throw new ApiError(403, "pin_locked", "PIN 을 5번 틀려 서버가 끝날 때까지 막았다");
      const given2 = body && typeof body === "object" ? body.pin : void 0;
      if (typeof given2 !== "string" || !same(given2, pin)) {
        failures += 1;
        throw new ApiError(403, "pin_required", "승인 PIN 이 없거나 틀렸다(서버를 연 터미널에만 보인다)");
      }
    }
    const request = {
      method,
      params: m.params,
      query: url.searchParams,
      body,
      via: "dashboard",
      mode: single ? "single" : "multi",
      sign: sign(target.prefix),
      ...projects ? { projects } : {}
    };
    const out = await m.route.handler(target.p, request);
    const envelope = { ok: true, data: out.data, ...out.meta ? { meta: out.meta } : {} };
    const text2 = JSON.stringify(envelope);
    if (method === "GET") {
      const etag = `W/"${import_node_crypto6.default.createHash("sha256").update(text2).digest("hex").slice(0, 32)}"`;
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, { ETag: etag, "Cache-Control": "no-store" });
        res.end();
        return;
      }
      send(res, out.status, text2, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ETag: etag });
      return;
    }
    send(res, out.status, text2, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  }
  async function handleRaw(res, url) {
    let rest = url.pathname;
    let p = single;
    const pm = /^\/p\/([0-9a-f]{12})(\/raw\/.*)$/.exec(rest);
    if (pm && projects) {
      p = await projects.get(pm[1]);
      rest = pm[2];
    }
    if (!p) throw new ApiError(404, "not_found", "프로젝트가 없다");
    let relPath;
    try {
      relPath = rest.slice("/raw/".length).split("/").map(decodeURIComponent).join("/");
    } catch {
      throw new ApiError(403, "forbidden_path", "경로를 읽지 못했다");
    }
    rawTarget(relPath);
    const exp = Number(url.searchParams.get("exp") ?? "");
    const sig = url.searchParams.get("sig") ?? "";
    const now = Math.floor(Date.now() / 1e3);
    if (!Number.isInteger(exp) || exp < now || exp > now + RAW_TTL + 5) throw new ApiError(403, "forbidden_path", "서명 URL 이 지났다");
    const want = import_node_crypto6.default.createHmac("sha256", token).update(`${relPath}
${exp}`).digest("hex");
    if (!same(sig, want)) throw new ApiError(403, "forbidden_path", "서명이 틀렸다");
    const bytes = await readRaw(p, relPath);
    const ct = contentType(relPath);
    send(res, 200, bytes, { "Content-Type": ct, "Content-Security-Policy": ct.startsWith("text/html") ? `${RAW_CSP}; sandbox allow-scripts` : RAW_CSP, "Cache-Control": "private, max-age=60" });
  }
  function handleStatic(res, url) {
    let name = url.pathname.replace(/^\/p\/[0-9a-f]{12}/, "");
    if (name === "" || name === "/" || !name.includes(".")) name = "/index.html";
    const body = Object.hasOwn(STATIC, name.slice(1)) ? STATIC[name.slice(1)] : void 0;
    if (body === void 0) {
      send(res, 404, "없음\n", { "Content-Type": "text/plain; charset=utf-8", "Content-Security-Policy": PAGE_CSP });
      return;
    }
    const ext = name.slice(name.lastIndexOf(".") + 1);
    const types = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8" };
    send(res, 200, body, { "Content-Type": types[ext] ?? "application/octet-stream", "Content-Security-Policy": PAGE_CSP, "X-Frame-Options": "DENY", "Cache-Control": "no-cache" });
  }
  const server = import_node_http.default.createServer((req, res) => {
    void (async () => {
      try {
        if (!hosts().includes(String(req.headers.host ?? ""))) throw new ApiError(421, "misdirected", "Host 가 127.0.0.1 · localhost 와 이 포트가 아니다");
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (url.pathname === "/healthz") {
          sendJson(res, 200, { ok: true });
          return;
        }
        if (url.pathname.startsWith("/api/v1/") || url.pathname === "/api/v1") await handleApi(req, res, url);
        else if (url.pathname.startsWith("/api/")) throw new ApiError(404, "not_found", "경로 없음");
        else if (url.pathname.startsWith("/raw/") || /^\/p\/[0-9a-f]{12}\/raw\//.test(url.pathname)) await handleRaw(res, url);
        else if (req.method === "GET" || req.method === "HEAD") handleStatic(res, url);
        else throw new ApiError(405, "method_not_allowed", "화면 파일은 GET 만 받는다");
      } catch (err) {
        if (res.headersSent) {
          res.end();
          return;
        }
        if (err instanceof ApiError) {
          if (err.status === 500) log(`관리 페이지 오류: ${err.message}
`);
          sendError(res, err);
          return;
        }
        log(`관리 페이지 내부 오류: ${err instanceof Error ? err.stack ?? err.message : String(err)}
`);
        sendError(res, new ApiError(500, "internal", "예상하지 못한 오류(서버 터미널에 적었다)"));
      }
    })();
  });
  server.headersTimeout = 1e4;
  server.requestTimeout = 3e4;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const addr = server.address();
  port = typeof addr === "object" && addr ? addr.port : 0;
  if (files) {
    writeSecret(files.info, `${JSON.stringify({ pid: process.pid, port, startedAt: (/* @__PURE__ */ new Date()).toISOString(), readOnly: readOnly2 })}
`);
  }
  let closed = false;
  return {
    port,
    url: `http://127.0.0.1:${port}/#t=${token}`,
    token,
    pin,
    readOnly: readOnly2,
    readOnlyReason,
    address: typeof addr === "object" && addr ? addr.address : "",
    mode: mode.kind,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
      if (files) {
        for (const f of [files.token, files.info]) import_node_fs39.default.rmSync(f, { force: true });
      }
    }
  };
}

// src/commands/api-call.ts
var import_node_os3 = __toESM(require("node:os"));

// src/commands/doctor.ts
var import_node_fs42 = __toESM(require("node:fs"));
var import_node_path46 = __toESM(require("node:path"));

// src/commands/doctor-overrides.ts
var import_node_fs40 = __toESM(require("node:fs"));
var import_node_path44 = __toESM(require("node:path"));
var isObj7 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function readJson2(target, rel2) {
  try {
    return JSON.parse(import_node_fs40.default.readFileSync(import_node_path44.default.join(target, ...rel2.split("/")), "utf8"));
  } catch {
    return null;
  }
}
function ids(doc, key) {
  return isObj7(doc) && Array.isArray(doc[key]) ? doc[key].map((x) => isObj7(x) && typeof x.id === "string" ? x.id : "").filter(Boolean) : [];
}
function kitPaths(ctx, target, inst) {
  try {
    const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: ctx.io.env, cliFile: ctx.io.cliFile, cwd: ctx.io.cwd, version: VERSION });
    const layout2 = loadLayout(loc.dir);
    const { selection } = selectionFromMeta(layout2, loc.dir, inst.meta);
    const tokens = tokensFromMeta(layout2, selection, inst.meta, ctx.io.env, target);
    return new Set(wanted({ layout: layout2, templatesDir: loc.dir, selection, tokens }).want.keys());
  } catch {
    return null;
  }
}
function overridesReport(ctx, target, inst) {
  const kitVer = `kit@${inst.lock.kit.version ?? inst.meta.kit.version}`;
  const kit = kitPaths(ctx, target, inst);
  const out = [];
  for (const e of inst.lock.entries) {
    if (e.op !== "copy" && e.op !== "none") continue;
    const kitHas = kit?.has(e.path) ?? false;
    if (e.owner.startsWith("pack:") && kitHas) out.push({ target: e.path, winner: e.layer && e.layer.startsWith("pack:") ? e.layer : e.owner, losers: [kitVer], declared: true });
    else if (e.owner === "user" && kitHas) out.push({ target: e.path, winner: "user", losers: [kitVer], note: import_node_fs40.default.existsSync(import_node_path44.default.join(target, ...`${e.path}.new`.split("/"))) ? ".new 있음" : ".new 없음" });
    else if (e.owner === "kit" && e.op === "copy" && typeof e.sha256 === "string") {
      let cur = null;
      try {
        cur = sha256(import_node_fs40.default.readFileSync(import_node_path44.default.join(target, ...e.path.split("/"))));
      } catch {
        cur = null;
      }
      if (cur !== null && cur !== e.sha256) out.push({ target: e.path, winner: "user", losers: [kitVer], note: "사람이 고친 킷 파일" });
    }
  }
  for (const [base, dir, key] of [
    [".agents/hooks.json", ".agents/hooks.d", "hooks"],
    [".agents/verify-checks.json", ".agents/verify-checks.d", "checks"]
  ]) {
    const kitIds = ids(readJson2(target, base), key);
    const project = ids(readJson2(target, `${dir}/project.json`), key);
    for (const id of project) if (kitIds.includes(id) && !FLOOR_HOOKS.includes(id)) out.push({ target: `${base}#${id}`, winner: "user", losers: ["kit"] });
  }
  const local = readLocalConfig(target);
  const metaRoles = isObj7(inst.meta.roles) ? inst.meta.roles : {};
  for (const [role, harness] of Object.entries(local.roles)) {
    const project = isObj7(metaRoles[role]) && typeof metaRoles[role].harness === "string" ? String(metaRoles[role].harness) : null;
    if (project !== harness) out.push({ target: `roles.${role}.harness`, winner: "local", value: harness, losers: project ? [{ layer: "project", value: project }] : [] });
  }
  const floorViolations = [];
  const raw = inst.meta;
  for (const g of missingFloorGates(isObj7(raw.flow) ? raw.flow.gates : void 0)) floorViolations.push({ kind: "gate-floor", target: `flow.gates#${g}` });
  const kitHooks = ids(readJson2(target, ".agents/hooks.json"), "hooks");
  if (kitHooks.length) {
    for (const id of FLOOR_HOOKS) if (!kitHooks.includes(id)) floorViolations.push({ kind: "floor-hook-missing", target: `.agents/hooks.json#${id}` });
  }
  for (const id of ids(readJson2(target, ".agents/hooks.d/project.json"), "hooks")) if (FLOOR_HOOKS.includes(id)) floorViolations.push({ kind: "floor-override", target: `.agents/hooks.d/project.json#${id}` });
  return { overrides: out.sort((a, b) => a.target < b.target ? -1 : a.target > b.target ? 1 : 0), ignoredPersonal: local.ignored.map((key) => ({ key, file: LOCAL_CONFIG })), floorViolations };
}
function overridesLines(r) {
  const loser = (l) => typeof l === "string" ? l : `${l.layer}(${l.value})`;
  const width = Math.max(10, ...r.overrides.map((o) => o.target.length));
  return [
    `덮어쓴 것 ${r.overrides.length}건 (이긴 층 ← 진 층)`,
    ...r.overrides.map((o) => `  ${o.target.padEnd(width)}  ${o.winner}${o.value ? `(${o.value})` : ""} ← ${o.losers.map(loser).join(", ") || "-"}${o.declared ? "  (overrides 선언)" : ""}${o.note ? `  (${o.note})` : ""}`),
    `무시한 개인 설정 ${r.ignoredPersonal.length}건`,
    ...r.ignoredPersonal.map((i) => `  ${i.file} ${i.key} — 개인 층은 roles · git.ide 만 바꾼다`),
    `하한 ${r.floorViolations.length}건 위반`,
    ...r.floorViolations.map((v) => `  ✖ ${v.kind} ${v.target}`)
  ];
}

// src/projection/check.ts
var import_node_fs41 = __toESM(require("node:fs"));
var import_node_path45 = __toESM(require("node:path"));
var PROJECTION_KINDS = ["stale", "symlink-found", "merge-missing", "relative-ref", "skill-model-field", "role-model-locked", "pending-new", "steering-size", "layout-conflict"];
var LIMIT3 = 24 * 1024;
var SOURCE_DIRS = [".agents/rules/", ".agents/skills/", ".agents/roles/"];
function lstat2(p) {
  try {
    return import_node_fs41.default.lstatSync(p);
  } catch {
    return null;
  }
}
function currentSha(p, isDir2) {
  const st = lstat2(p);
  if (!st || st.isSymbolicLink()) return null;
  if (isDir2) return st.isDirectory() ? treeSha(walkView(new FsView(p), "")) : null;
  return st.isFile() ? sha256(import_node_fs41.default.readFileSync(p)) : null;
}
function linksInside(p, prefix = "") {
  const st = lstat2(p);
  if (!st?.isDirectory() || st.isSymbolicLink()) return [];
  const out = [];
  for (const name of import_node_fs41.default.readdirSync(p).sort()) {
    const q2 = import_node_path45.default.join(p, name);
    const s = lstat2(q2);
    const rel2 = prefix ? `${prefix}/${name}` : name;
    if (s?.isSymbolicLink()) out.push(rel2);
    else if (s?.isDirectory()) out.push(...linksInside(q2, rel2));
  }
  return out.sort();
}
function hasRelativeRef(text2) {
  const stripped = text2.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return /\[[^\]]*\]\((\.\.\/[^)\s]*)\)/.test(stripped);
}
function fmOf(file) {
  const { block: block2 } = splitFrontmatter(import_node_fs41.default.readFileSync(file, "utf8"));
  return block2 === null ? {} : parseFrontmatter(block2);
}
function kiroAlwaysBytes(target) {
  const dir = import_node_path45.default.join(target, ".kiro/steering");
  if (!import_node_fs41.default.existsSync(dir)) return 0;
  let total = 0;
  for (const name of import_node_fs41.default.readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const p = import_node_path45.default.join(dir, name);
    if (!lstat2(p)?.isFile()) continue;
    const inc = fmOf(p).inclusion;
    if ((typeof inc === "string" && inc || "always") === "always") total += import_node_fs41.default.statSync(p).size;
  }
  return total;
}
function specAt(target) {
  const file = import_node_path45.default.join(target, "scripts/harness/projection.json");
  return import_node_fs41.default.existsSync(file) ? parseSpec(import_node_fs41.default.readFileSync(file, "utf8")) : null;
}
function layoutFindings(target, entries) {
  const out = [];
  const meta = readMeta(import_node_path45.default.join(target, META_REL));
  const tokens = meta.status === "ok" ? meta.meta.tokens : {};
  const agents = meta.status === "ok" ? meta.meta.agents : [];
  let spec;
  for (const e of entries) {
    if (e.owner !== "kit") continue;
    const p = import_node_path45.default.join(target, ...e.path.split("/"));
    const from = typeof e.from === "string" ? e.from : null;
    if (e.op === "mirror" || e.op === "render") {
      const st = lstat2(p);
      const isDir2 = e.op === "mirror" && (Boolean(st?.isDirectory()) && !st?.isSymbolicLink() || Boolean(from && lstat2(import_node_path45.default.join(target, ...from.split("/")))?.isDirectory()));
      if (st?.isSymbolicLink()) {
        out.push({ kind: "symlink-found", severity: "error", path: e.path, hint: "링크 대신 실제 파일을 둔다 → npx harness-kit repair" });
        continue;
      }
      for (const inner of linksInside(p)) out.push({ kind: "symlink-found", severity: "error", path: `${e.path}/${inner}`, hint: "링크 대신 실제 파일을 둔다 → npx harness-kit repair" });
      const cur = currentSha(p, isDir2);
      if (cur === null) {
        out.push({ kind: "missing", severity: "error", path: e.path, hint: `원본 ${from ?? "?"} 에서 다시 만든다 → npx harness-kit repair` });
        continue;
      }
      if (typeof e.sha256 !== "string" || cur !== e.sha256) {
        out.push({ kind: "drifted", severity: "error", path: e.path, hint: `복사본 · 생성물을 직접 고쳤다. 원본 ${from ?? "?"} 을 고친다 → npx harness-kit repair` });
        continue;
      }
      if (from && typeof e.fromSha256 === "string") {
        const sp = import_node_path45.default.join(target, ...from.split("/"));
        const now = from === HOOKS_REL ? hooksBundleSha(new FsView(target)) : currentSha(sp, Boolean(lstat2(sp)?.isDirectory()));
        if (now === null) out.push({ kind: "stale", severity: "error", path: e.path, hint: `원본 ${from} 이 없다 → npx harness-kit update` });
        else if (now !== e.fromSha256) out.push({ kind: "stale", severity: "error", path: e.path, hint: `원본 ${from} 가 바뀌었다 → npx harness-kit repair` });
      }
    } else if (e.op === "merge" && Array.isArray(e.keys) && e.keys.length) {
      const kind = MERGE_KIND[e.path];
      if (!kind) continue;
      if (spec === void 0) spec = specAt(target);
      if (!spec) continue;
      const st = lstat2(p);
      const cur = st?.isFile() ? import_node_fs41.default.readFileSync(p, "utf8") : null;
      const keys = e.keys;
      const lost = cur === null ? keys : missingWith(kind, cur, keys, fullMergeWant(kind, spec, tokens, loadSources(new FsView(target))));
      if (lost.length) out.push({ kind: "merge-missing", severity: "error", path: e.path, hint: `킷 키 ${lost.slice(0, 3).join(", ")}${lost.length > 3 ? " …" : ""} 가 없다 → npx harness-kit repair` });
    } else if (e.op === "copy") {
      const st = lstat2(p);
      if (!st?.isFile()) continue;
      if (SOURCE_DIRS.some((d) => e.path.startsWith(d)) && e.path.endsWith(".md") && hasRelativeRef(import_node_fs41.default.readFileSync(p, "utf8"))) {
        out.push({ kind: "relative-ref", severity: "error", path: e.path, hint: "킷 원본은 `../` 대신 리포 기준 경로(.agents/…)를 쓴다(복사본에서 깨진다)" });
      }
    }
  }
  for (const e of entries) {
    for (const side of [`${e.path}.new`, `${e.path}.bak`]) {
      if (lstat2(import_node_path45.default.join(target, ...side.split("/")))) out.push({ kind: "pending-new", severity: "warn", path: side, hint: `병합하거나 지운다(diff -u ${e.path} ${side})` });
    }
  }
  try {
    const s = spec === void 0 ? specAt(target) : spec;
    if (s) {
      const ctx = buildContext({ view: new FsView(target), spec: s, tokens, agents });
      wantedOps(ctx);
      out.push(...ctx.findings);
    }
  } catch (err) {
    if (!(err instanceof CliError)) throw err;
    out.push({ kind: "layout-conflict", severity: "error", path: ".agents", hint: err.message });
  }
  const always = kiroAlwaysBytes(target);
  if (always > LIMIT3) out.push({ kind: "steering-size", severity: "warn", path: ".kiro/steering", hint: `inclusion: always steering = ${always.toLocaleString("en-US")} bytes (기준 ${LIMIT3.toLocaleString("en-US")})` });
  return out;
}

// src/commands/doctor.ts
var FLOOR_KINDS = ["gate-floor", "floor-hook-missing", "floor-override", "full-allowed", "approvers"];
var PACK_KINDS = ["pack-unpinned", "pack-local-path"];
var LOCAL_KINDS = ["personal-ignored", "personal-weakens", "local-invalid"];
var DOCTOR_KINDS = ["meta-invalid", "lock-invalid", "lock-v1", "version-mismatch", "missing", "drifted", "gitignore", "entry-size", "upgrade-notice-expired", ...FLOOR_KINDS, ...PACK_KINDS, ...LOCAL_KINDS, ...PROJECTION_KINDS];
var GITIGNORE_NEEDS = [".agents/state/", ".agents/local/", ".agents/reports/"];
var ENTRY_FILES = ["AGENTS.md", "CLAUDE.md"];
var ENTRY_LIMIT = 24 * 1024;
function versionFindings(meta, lock) {
  const out = [];
  const installed = meta && meta.kit.version !== "unknown" ? meta.kit.version : null;
  if (installed) {
    const cmp2 = compareSemver(installed, VERSION);
    if (cmp2 === null || cmp2 !== 0) {
      const newer2 = cmp2 !== null && cmp2 > 0;
      out.push({
        kind: "version-mismatch",
        severity: newer2 ? "error" : "warn",
        path: META_REL,
        hint: newer2 ? `설치된 킷(${installed})이 이 CLI(${VERSION})보다 새것이다. 새 CLI 로 다시 실행한다` : `설치 ${installed} · CLI ${VERSION}. 킷을 올리려면 harness-kit update`,
        detail: { installed, cli: VERSION }
      });
    }
  }
  const lockVersion = lock?.kit.version ?? null;
  if (installed && lockVersion && lockVersion !== installed) {
    out.push({ kind: "version-mismatch", severity: "warn", path: LOCK_REL, hint: "메타와 lock 의 킷 버전이 다르다", detail: { meta: installed, lock: lockVersion } });
  }
  return out;
}
function fileState(full11, sha) {
  const st = lstatOrNull(full11);
  if (!st || !st.isFile()) return "missing";
  try {
    return sha && sha256File(full11) === sha ? "ok" : "drifted";
  } catch (err) {
    return { unreadable: err.code ?? String(err) };
  }
}
function copyFindings(target, lock) {
  let ok2 = 0;
  const findings = [];
  const unsafe = [];
  for (const e of lock.entries) {
    if (!isSafeRelPath(e.path)) {
      unsafe.push(e.path);
      continue;
    }
    if (e.op !== "copy" || e.owner !== "kit") continue;
    const state = fileState(import_node_path46.default.join(target, ...e.path.split("/")), e.sha256);
    if (state === "ok") ok2 += 1;
    else if (state === "missing") {
      findings.push({ kind: "missing", severity: "error", path: e.path, owner: e.owner, hint: "킷 파일이 없다. harness-kit repair 로 되살린다" });
    } else if (state === "drifted") {
      findings.push({ kind: "drifted", severity: "info", path: e.path, owner: e.owner, hint: "사람이 고친 파일이다. update 때 .new 로 받는다" });
    } else {
      findings.push({ kind: "missing", severity: "error", path: e.path, owner: e.owner, hint: `파일을 읽지 못했다(${state.unreadable})` });
    }
  }
  if (unsafe.length) {
    findings.unshift({ kind: "lock-invalid", severity: "error", path: LOCK_REL, hint: "리포 밖이나 .git 을 가리키는 항목이 있다(보지 않았다)", detail: { paths: unsafe } });
  }
  return { ok: ok2, findings };
}
function gitignoreFinding(target) {
  let lines = [];
  try {
    lines = import_node_fs42.default.readFileSync(import_node_path46.default.join(target, ".gitignore"), "utf8").split(/\r?\n/).map((l) => l.trim());
  } catch {
    lines = [];
  }
  const has = (want) => {
    const bare2 = want.replace(/\/$/, "");
    return [want, bare2, `/${want}`, `/${bare2}`].some((v) => lines.includes(v));
  };
  const missing = GITIGNORE_NEEDS.filter((w) => !has(w));
  if (missing.length === 0) return null;
  return { kind: "gitignore", severity: "warn", path: ".gitignore", hint: `커밋하지 않는 폴더 ${missing.join(" · ")} 를 넣는다`, detail: { missing } };
}
function entrySizeFinding(target) {
  let bytes = 0;
  for (const f of ENTRY_FILES) {
    const st = lstatOrNull(import_node_path46.default.join(target, f));
    if (st?.isFile()) bytes += st.size;
  }
  if (bytes <= ENTRY_LIMIT) return null;
  return {
    kind: "entry-size",
    severity: "warn",
    path: "AGENTS.md",
    hint: `AGENTS.md + CLAUDE.md = ${bytes}바이트(상한 ${ENTRY_LIMIT}). 세부는 .agents/rules/ 로 옮긴다`,
    detail: { bytes, limit: ENTRY_LIMIT }
  };
}
var MARK = { error: "✖", warn: "⚠", info: "·" };
function parseOnly(raw) {
  if (raw === void 0) return null;
  const only = raw.split(/[\s,]+/).filter(Boolean);
  const unknown = only.filter((k) => !DOCTOR_KINDS.includes(k));
  if (unknown.length) throw usageError(`모르는 검사 종류: ${unknown.join(" ")}`, `사용 가능: ${DOCTOR_KINDS.join(" ")}`);
  return only;
}
var isObjAny = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var EMAIL = /^[^@\s]+@[^@\s]+$/;
function floorFindings(target, raw) {
  const out = [];
  const flow = raw && isObjAny(raw.flow) ? raw.flow : null;
  const missingGates = missingFloorGates(flow?.gates);
  if (missingGates.length) out.push({ kind: "gate-floor", severity: "error", path: META_REL, hint: `flow.gates 에 하한 게이트 ${missingGates.join(" · ")} 가 없다. 하한은 빼지 못한다(check-sdd-prerequisites 는 설정과 상관없이 검사한다)`, detail: { missing: missingGates } });
  let hooks = null;
  try {
    hooks = JSON.parse(import_node_fs42.default.readFileSync(import_node_path46.default.join(target, ".agents/hooks.json"), "utf8"));
  } catch {
    hooks = null;
  }
  if (isObjAny(hooks) && Array.isArray(hooks.hooks)) {
    const ids2 = new Set(hooks.hooks.map((h) => isObjAny(h) ? h.id : null));
    const gone = FLOOR_HOOKS.filter((id) => !ids2.has(id));
    if (gone.length) out.push({ kind: "floor-hook-missing", severity: "error", path: ".agents/hooks.json", hint: `하한 훅 ${gone.join(" · ")} 가 없다. harness-kit repair 로 되살린다`, detail: { missing: gone } });
  }
  const verify = raw && isObjAny(raw.verify) ? raw.verify : null;
  if (verify?.fullOnlyInCI === false) out.push({ kind: "full-allowed", severity: "warn", path: META_REL, hint: "verify.fullOnlyInCI 가 false 다. 에이전트 세션의 full 차단은 그대로지만 사람 · git hook 의 full 이 열린다(팀 결정이면 MR 로 남긴다)" });
  out.push(...approverFindings(raw));
  const packs = raw && Array.isArray(raw.packs) ? raw.packs.filter((x) => typeof x === "string") : [];
  for (const src of packs) for (const w of sourceWarnings(target, src)) out.push({ kind: w.kind, severity: "warn", path: META_REL, hint: w.hint });
  out.push(...personalFindings(target));
  return out;
}
function personalFindings(target) {
  const out = [];
  const conf = readLocalConfig(target);
  if (conf.error) out.push({ kind: "local-invalid", severity: "error", path: LOCAL_CONFIG, hint: conf.error });
  for (const key of conf.ignored) out.push({ kind: "personal-ignored", severity: "warn", path: LOCAL_CONFIG, hint: `${key} — 개인 층은 roles.<역할>.harness · git.ide 만 바꾼다(무시했다)` });
  let local = null;
  try {
    local = JSON.parse(import_node_fs42.default.readFileSync(import_node_path46.default.join(target, ...SETTINGS_LOCAL.split("/")), "utf8"));
  } catch {
    local = null;
  }
  if (isObjAny(local) && local.disableAllHooks === true) out.push({ kind: "personal-weakens", severity: "warn", path: SETTINGS_LOCAL, hint: "disableAllHooks: true 가 킷 훅(보호 · 검증 게이트)까지 끈다" });
  return out;
}
function approverFindings(raw) {
  if (!raw || raw.approvers === void 0) return [];
  const groups = isObjAny(raw.groups) ? raw.groups : {};
  const bad4 = [];
  if (!isObjAny(raw.approvers)) bad4.push("approvers 는 게이트 → 이름 목록 객체다");
  else
    for (const [gate, names] of Object.entries(raw.approvers)) {
      if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) bad4.push(`approvers.${gate} 는 문자열 목록이다`);
      else for (const n of names) if (!EMAIL.test(n) && !Object.hasOwn(groups, n)) bad4.push(`approvers.${gate}: 그룹 '${n}' 이 groups 에 없다`);
    }
  for (const [name, members] of Object.entries(groups)) if (!Array.isArray(members) || members.some((m) => typeof m !== "string")) bad4.push(`groups.${name} 는 이메일 목록이다`);
  return bad4.length ? [{ kind: "approvers", severity: "warn", path: META_REL, hint: bad4.join(" · "), detail: { problems: bad4 } }] : [];
}
function noticeFinding(target, day) {
  let text2;
  try {
    text2 = import_node_fs42.default.readFileSync(import_node_path46.default.join(target, ...NOTICE_REL.split("/")), "utf8");
  } catch {
    return null;
  }
  if (!isKitNotice(text2) || !noticeExpired(text2, day)) return null;
  return { kind: "upgrade-notice-expired", severity: "info", path: NOTICE_REL, hint: "만료된 업그레이드 공지다. 다음 update 가 지운다(지금 지워도 된다)" };
}
function collect(target, day) {
  const metaRead = readMeta(import_node_path46.default.join(target, META_REL));
  if (metaRead.status === "missing") {
    throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, "설치는 harness-kit init");
  }
  const findings = [];
  const meta = metaRead.status === "ok" ? metaRead.meta : null;
  if (metaRead.status === "invalid") findings.push({ kind: "meta-invalid", severity: "error", path: META_REL, hint: metaRead.error });
  const lockRead = readLock(import_node_path46.default.join(target, LOCK_REL));
  const lock = lockRead.status === "ok" ? lockRead.lock : null;
  if (lockRead.status === "ok" && lockRead.format === "v1") {
    findings.push({ kind: "lock-v1", severity: "info", path: LOCK_REL, hint: "v1(TSV) lock 이다. update 가 v2 로 바꾼다" });
  }
  if (lockRead.status !== "ok") {
    findings.push({ kind: "lock-invalid", severity: "error", path: LOCK_REL, hint: lockRead.status === "missing" ? "lock 이 없다" : lockRead.error });
  }
  findings.push(...versionFindings(meta, lock));
  const copy = lock ? copyFindings(target, lock) : { ok: 0, findings: [] };
  findings.push(...copy.findings);
  const layout2 = lock ? layoutFindings(target, lock.entries.filter((e) => isSafeRelPath(e.path))) : [];
  findings.push(...layout2.map((f) => ({ kind: f.kind, severity: f.severity, path: f.path, hint: f.hint })));
  for (const f of [gitignoreFinding(target), entrySizeFinding(target), noticeFinding(target, day)]) if (f) findings.push(f);
  findings.push(...floorFindings(target, metaRead.status === "ok" ? metaRead.meta : null));
  const projectionTotal = lock ? lock.entries.filter((e) => PROJECTION_OPS.has(e.op) && e.owner === "kit").length : 0;
  const projectionBad = new Set(layout2.filter((f) => f.severity === "error" && !f.path.startsWith(".agents/")).map((f) => f.path)).size;
  return { meta, lock, ok: copy.ok, findings, projection: { ok: Math.max(0, projectionTotal - projectionBad), errors: layout2.filter((f) => f.severity === "error").length } };
}
function summarize(findings, ok2) {
  const count = (pred) => findings.filter(pred).length;
  return {
    ok: ok2,
    drifted: count((f) => f.kind === "drifted"),
    missing: count((f) => f.kind === "missing"),
    errors: count((f) => f.severity === "error"),
    warnings: count((f) => f.severity === "warn"),
    infos: count((f) => f.severity === "info")
  };
}
function findingLine(f) {
  const hint = f.hint ? ` — ${f.hint}` : "";
  return `  ${MARK[f.severity]} ${f.kind.padEnd(16)} ${f.path ?? ""}${hint}`;
}
function runDoctor(ctx) {
  const target = targetOf(ctx);
  if (str(ctx.values, "only") === "overrides") {
    const report2 = overridesReport(ctx, target, loadInstalled(target, "doctor"));
    const code2 = bool(ctx.values, "check") && report2.floorViolations.length ? EXIT.CHECK : EXIT.OK;
    return { code: code2, data: { command: "doctor", target, only: "overrides", ...report2 }, lines: [`harness-kit doctor --only overrides — ${target}`, ...overridesLines(report2)] };
  }
  const only = parseOnly(str(ctx.values, "only"));
  const c = collect(target, today(ctx.io));
  const findings = only ? c.findings.filter((f) => only.includes(f.kind)) : c.findings;
  const summary = summarize(findings, c.ok);
  if (c.projection) summary.projection = c.projection;
  const code = bool(ctx.values, "check") && (summary.errors ?? 0) > 0 ? EXIT.CHECK : EXIT.OK;
  const kit = { installed: c.meta?.kit.version ?? null, lock: c.lock?.kit.version ?? null, cli: VERSION };
  const lines = [
    `harness-kit doctor — ${target}`,
    `  킷: 설치 ${kit.installed ?? "?"} · lock ${kit.lock ?? "?"} · CLI ${kit.cli}`,
    `  copy 항목: ok ${summary.ok} · drifted ${summary.drifted} · missing ${summary.missing}`,
    ...c.projection ? [`  배치 항목: ok ${c.projection.ok} · 오류 ${c.projection.errors}`] : [],
    `  오류 ${summary.errors} · 경고 ${summary.warnings} · 정보 ${summary.infos}`,
    ...ctx.quiet ? [] : findings.map(findingLine)
  ];
  return { code, data: { command: "doctor", target, kit, summary, findings }, lines };
}

// src/commands/outdated.ts
var import_node_path47 = __toESM(require("node:path"));

// src/core/git.ts
var import_node_child_process8 = require("node:child_process");
function gitEnv(env) {
  const out = { ...env, PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME, GIT_TERMINAL_PROMPT: "0" };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG"]) delete out[k];
  return out;
}
function git2(args, env, timeout = 3e4) {
  const r = (0, import_node_child_process8.spawnSync)("git", args, { env: gitEnv(env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout });
  const missing = r.error?.code === "ENOENT";
  const run4 = { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", missing };
  if (r.error) run4.error = r.error.message;
  return run4;
}
function gitRepoPath(dir, env) {
  const inside = git2(["-C", dir, "rev-parse", "--git-dir"], env);
  if (inside.status !== 0) return null;
  const top = git2(["-C", dir, "rev-parse", "--show-toplevel"], env);
  return top.status === 0 && top.stdout.trim() ? top.stdout.trim() : dir;
}
function remoteVersions(source, env) {
  const r = git2(["ls-remote", "--tags", "--refs", source], env, 15e3);
  if (r.missing) return { ok: false, reason: "git 이 없다" };
  if (r.status !== 0) {
    const tail = (r.stderr || r.error || `exit ${String(r.status)}`).trim().split("\n").slice(-1)[0] ?? "";
    return { ok: false, reason: `git ls-remote 실패: ${tail}` };
  }
  const versions = [];
  for (const line of r.stdout.split("\n")) {
    const ref = line.split("	")[1] ?? "";
    const m = /^refs\/tags\/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(ref.trim());
    if (m && compareSemver(m[1], m[1]) === 0) versions.push(m[1]);
  }
  return { ok: true, versions };
}
function maxVersion(versions) {
  let best = null;
  for (const v of versions) if (best === null || (compareSemver(v, best) ?? 0) > 0) best = v;
  return best;
}

// src/commands/outdated.ts
function fromKitSource(raw, env) {
  if (!raw) return null;
  const gh = /^github:([\w.-]+\/[\w.-]+?)(?:\.git)?(?:#.*)?$/.exec(raw);
  if (gh) return `https://github.com/${gh[1]}.git`;
  if (raw.startsWith("git+")) return raw.slice(4).replace(/#.*$/, "");
  if (raw.startsWith("file:")) return gitRepoPath(raw.slice(5), env);
  return null;
}
function sourceOf(ctx, target) {
  const flag = str(ctx.values, "source");
  const env = ctx.io.env.HARNESS_KIT_SOURCE || void 0;
  const given = flag !== void 0 ? { url: flag, from: "flag" } : env !== void 0 ? { url: env, from: "env" } : null;
  if (given) {
    if (given.url.startsWith("-")) throw usageError(`--source 는 '-' 로 시작할 수 없다: '${given.url}'`, "git 원격 주소나 저장소 경로를 준다");
    return given;
  }
  const lock = readLock(import_node_path47.default.join(target, LOCK_REL));
  const url = fromKitSource(lock.status === "ok" ? lock.lock.kit.source : null, ctx.io.env);
  if (url && !url.startsWith("-")) return { url, from: "lock" };
  return { url: null, reason: "소스를 모른다 — --source <git 원격> 또는 HARNESS_KIT_SOURCE 로 준다" };
}
var isPre = (v) => /^\d+\.\d+\.\d+-/.test(v);
var newer = (a, b) => (compareSemver(a, b) ?? 0) > 0;
function runOutdated(ctx) {
  const target = targetOf(ctx);
  const m = readMeta(import_node_path47.default.join(target, META_REL));
  if (m.status === "missing") throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, "설치는 harness-kit init");
  if (m.status === "invalid") throw new CliError(EXIT.STATE, `메타를 해석하지 못했다: ${m.error}`, "harness-kit doctor 로 상태를 본다");
  const installed = m.meta.kit.version;
  const src = sourceOf(ctx, target);
  const preTrack = isPre(installed) || isPre(VERSION);
  let latest;
  let latestVersion = null;
  if (src.url === null) latest = { status: "unknown", source: null, reason: src.reason };
  else {
    const tags = remoteVersions(src.url, ctx.io.env);
    if (!tags.ok) latest = { status: "unknown", source: src.url, reason: tags.reason };
    else {
      const stable = maxVersion(tags.versions.filter((v) => !isPre(v)));
      latestVersion = preTrack ? maxVersion(tags.versions) : stable;
      latest = { status: "ok", version: latestVersion, stable, source: src.url, from: src.from, tags: tags.versions.length };
    }
  }
  const newest = latestVersion && newer(latestVersion, VERSION) ? latestVersion : VERSION;
  const isNewer = newer(newest, installed);
  const upgrade = !isNewer ? null : newest === VERSION ? "harness-kit update" : `npx harness-kit@${newest} update`;
  const data = { command: "outdated", target, installed, cli: VERSION, latest, newest, newer: isNewer, upgrade, packs: m.meta.packs };
  const latestText = latest.status === "ok" ? `${String(latest.version ?? "없음")} (${String(latest.source)})` : `확인 못 함 — ${String(latest.reason)}`;
  const lines = [
    `harness-kit outdated — ${target}`,
    `  설치 ${installed} · CLI ${VERSION} · 최신 태그 ${latestText}`,
    isNewer ? `  → 새 판 ${newest} 이 있다: ${String(upgrade)}` : "  최신이다",
    ...newer(installed, VERSION) ? [`  ⚠ 설치된 킷(${installed})이 이 CLI 보다 새것이다. 새 CLI 를 쓴다`] : []
  ];
  const code = bool(ctx.values, "check") && isNewer ? EXIT.CHECK : EXIT.OK;
  return { code, data, lines };
}

// src/commands/dashboard-deps.ts
function quietIo(env, cwd) {
  return { stdout: () => void 0, stderr: () => void 0, env, cwd, cliFile: __filename, isTTY: false, nodeVersion: process.versions.node };
}
function ctxFor(root, env, command) {
  return { io: quietIo(env, root), command, values: { cwd: root }, positionals: [], json: true, quiet: true };
}
var PROBLEM_KINDS = /* @__PURE__ */ new Set(["drifted", "stale", "symlink-found", "missing", "role-mismatch"]);
function doctorSummary(root, env) {
  const r = runDoctor(ctxFor(root, env, "doctor"));
  const findings = r.data.findings ?? [];
  const problems = findings.filter((f) => f.severity === "error" || PROBLEM_KINDS.has(f.kind));
  const counts2 = {};
  for (const f of problems) counts2[f.kind] = (counts2[f.kind] ?? 0) + 1;
  return { status: problems.length ? "problems" : "ok", counts: counts2, problems: problems.slice(0, 20).map((f) => ({ kind: f.kind, ...f.path ? { path: f.path } : {}, message: f.hint ?? f.kind })) };
}
function dashboardDeps() {
  return {
    doctor: (root, env) => doctorSummary(root, env),
    outdated: (root, env) => {
      const r = runOutdated(ctxFor(root, env, "outdated"));
      const { target: _t, ...rest } = r.data;
      return rest;
    }
  };
}

// src/commands/api-call.ts
function homeOf(ctx) {
  return ctx.io.env.HOME ?? import_node_os3.default.homedir();
}
async function openProject(ctx) {
  try {
    return await Project.open(targetOf(ctx), { env: ctx.io.env, home: homeOf(ctx), readOnly: false, multi: false, deps: dashboardDeps() });
  } catch (err) {
    throw new CliError(EXIT.STATE, err instanceof Error ? err.message : String(err), "npx harness-kit doctor");
  }
}
function exitOf(e) {
  if (e.code === "read_only") return EXIT.STATE;
  if (e.status === 400 || e.status === 501) return EXIT.USAGE;
  return EXIT.CHECK;
}
function failure(ctx, e) {
  if (!ctx.json) {
    ctx.io.stderr(`✖ ${e.message}
`);
    const reasons = e.details && Array.isArray(e.details.reasons) ? e.details.reasons : [];
    for (const r of reasons.slice(0, 5)) ctx.io.stderr(`  - ${r}
`);
  }
  return { code: exitOf(e), data: e.body(), lines: [] };
}
function humanTerminal(ctx) {
  const marker = (ctx.io.agentSession ?? (() => agentSession(ctx.io.env)))();
  if (marker) return new ApiError(403, "read_only", `에이전트 세션에서는 할 수 없다(판정: ${marker}). 사람이 자기 터미널에서 실행한다`);
  if (!ctx.io.isTTY) return new ApiError(403, "read_only", "TTY 가 아니다 — 사람이 터미널에서 직접 실행한다");
  return null;
}
async function run3(ctx, method, path57, opts, human) {
  try {
    const p = opts.project ?? await openProject(ctx);
    const r = await callApi(p, method, path57, { ...opts.query ? { query: opts.query } : {}, body: opts.body, via: "terminal", mode: opts.mode ?? "single", ...opts.projects ? { projects: opts.projects } : {} });
    const data = r.data;
    return { code: EXIT.OK, data, lines: human(data) };
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}
function jsonLines(data) {
  return JSON.stringify(data, null, 2).split("\n");
}
async function confirmKey(ctx, key, summary) {
  for (const line of summary) ctx.io.stderr(`${line}
`);
  ctx.io.stderr("확인하려면 이슈 키를 입력한다: ");
  const typed = await readLine(ctx.io.stdin);
  return typed.trim() === key;
}
function readLine(stream) {
  if (!stream) return Promise.resolve("");
  return new Promise((resolve) => {
    let buf = "";
    const onData = (d) => {
      buf += d.toString();
      const i = buf.indexOf("\n");
      if (i >= 0) {
        cleanup();
        resolve(buf.slice(0, i));
      }
    };
    const onEnd = () => {
      cleanup();
      resolve(buf);
    };
    const cleanup = () => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.pause?.();
    };
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.resume?.();
  });
}

// src/commands/dashboard.ts
function modeOf(ctx) {
  const v = ctx.values;
  const all = bool(v, "all");
  const root = str(v, "root");
  const ws = str(v, "workspace");
  if ([all, root !== void 0, ws !== void 0].filter(Boolean).length > 1) throw usageError("--all · --root · --workspace 는 하나만 준다");
  if (all) return { kind: "all" };
  if (root !== void 0) return { kind: "root", dir: import_node_path48.default.resolve(ctx.io.cwd, root) };
  if (ws !== void 0) return { kind: "workspace", file: import_node_path48.default.resolve(ctx.io.cwd, ws) };
  return { kind: "single" };
}
function openBrowser(url) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    (0, import_node_child_process9.spawn)(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
  }
}
async function runExport(ctx, out) {
  try {
    const r = await exportStatic({ cwd: targetOf(ctx), env: ctx.io.env, out: import_node_path48.default.resolve(ctx.io.cwd, out) });
    return { code: EXIT.OK, data: { command: "dashboard", export: r.out, files: r.files }, lines: [`정적 내보내기: ${r.out} (파일 ${r.files.length}개, 스크립트 · 버튼 없음)`] };
  } catch (err) {
    if (err instanceof ExportLeakError) throw new CliError(EXIT.CHECK, `${err.message} — 출력 폴더를 지웠다`, err.hits.slice(0, 5).join(" · "));
    if (err instanceof ExportError) throw new CliError(EXIT.USAGE, err.message);
    throw new CliError(EXIT.STATE, err instanceof Error ? err.message : String(err), "npx harness-kit doctor");
  }
}
async function runDashboard(ctx) {
  const v = ctx.values;
  const out = str(v, "export");
  if (out !== void 0) return runExport(ctx, out);
  const mode = modeOf(ctx);
  const agent = ctx.io.agentSession;
  if (mode.kind === "single") {
    const running = await findRunning(targetOf(ctx), ctx.io.env, agent);
    if (running) return { code: EXIT.OK, data: { command: "dashboard", url: running.url, running: true }, lines: [running.url] };
  }
  const portText = str(v, "port");
  const port = portText === void 0 ? 0 : Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw usageError(`--port 는 0~65535 다: ${portText ?? ""}`);
  let srv;
  try {
    srv = await startServer({ cwd: targetOf(ctx), env: ctx.io.env, port, readOnly: bool(v, "read-only"), mode, deps: dashboardDeps(), home: homeOf(ctx), ...agent ? { agentSession: agent } : {}, stderr: ctx.io.stderr });
  } catch (err) {
    if (err instanceof StartError) throw new CliError(err.exitCode, err.message, err.hint);
    const code = err.code;
    if (code === "EADDRINUSE") throw new CliError(EXIT.ENV, `포트를 쓸 수 없다: ${port}`);
    throw err;
  }
  ctx.io.stdout(`${srv.url}
`);
  if (srv.pin) ctx.io.stderr(`승인 PIN: ${srv.pin} — 승인 · 질문 답 · 리뷰 판단 때 넣는다. 이 터미널에만 보인다(파일에 쓰지 않는다)
`);
  else ctx.io.stderr(`읽기 전용(${srv.readOnlyReason ?? "--read-only"}) — 저장 · 승인 · 답 · 리뷰 판단 · 작업 요청을 끈다
`);
  if (mode.kind !== "single") ctx.io.stderr("여러 프로젝트 모드 — 토큰 파일 · dashboard.json 을 쓰지 않는다. 토큰은 위 주소에만 있다\n");
  if (bool(v, "open")) openBrowser(srv.url);
  await new Promise((resolve) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  await srv.close();
  return { code: EXIT.OK, data: { command: "dashboard", closed: true }, lines: ["관리 페이지를 닫았다(토큰 · dashboard.json 을 지웠다)"] };
}

// src/commands/decide.ts
var KEY2 = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5}$/;
var INTENT_GATES = /* @__PURE__ */ new Set(["intent", "codebase", "plans"]);
var DOC_GATES2 = { requirements: "requirements", design: "design", tasks: "tasks" };
function approvedLines(d) {
  return [`기록: ${String(d.approvals)} · 기록 ID ${String(d.entryId)}${d.statusChanged ? ` · ${String(d.statusChanged)}` : ""}`, `커밋은 사람이 한다: git add ${String(d.approvals)}`];
}
async function runApprove(ctx) {
  const [key, extra] = ctx.positionals;
  const gate = str(ctx.values, "gate");
  const phrase = str(ctx.values, "phrase");
  if (!key || extra || !KEY2.test(key) || !gate || !phrase) throw usageError('harness-kit approve <키> --gate <게이트> --phrase "<문구>" [--changes-requested [--rule-candidate]]');
  const refused = humanTerminal(ctx);
  if (refused) return failure(ctx, refused);
  const decision = bool(ctx.values, "changes-requested") ? "changes-requested" : "approved";
  const target = INTENT_GATES.has(gate) ? { intent: key } : { issue: key };
  try {
    const p = await openProject(ctx);
    let docSha256;
    let shown = "";
    if (Object.hasOwn(DOC_GATES2, gate)) {
      const issue = (await callApi(p, "GET", `/issues/${key}`)).data;
      const doc = issue.docs[gate];
      docSha256 = doc?.sha256;
      shown = doc ? `${issue.dir}/${gate}.md · sha ${doc.approvalSha256.slice(0, 12)}` : `${gate}.md 없음`;
    } else if (gate === "intent") {
      const intent = (await callApi(p, "GET", `/intents/${key}`)).data;
      const doc = (await callApi(p, "GET", "/docs", { query: { path: `${intent.dir}/intent.md` } })).data;
      docSha256 = doc.sha256;
      shown = `${intent.dir}/intent.md · sha ${doc.sha256.slice(0, 12)}`;
    } else shown = "브랜치 head";
    const user = await p.user();
    const ok2 = await confirmKey(ctx, key, [`승인: ${key} · ${gate} · ${decision}`, `- 대상: ${shown}`, `- 승인자: ${user.email ?? "git user.email 없음"}`, `- 문구: "${phrase.replace(/\s+/g, " ").trim()}"`]);
    if (!ok2) return failure(ctx, new ApiError(409, "not_confirmed", "입력한 키가 다르다 — 기록하지 않았다"));
    return run3(ctx, "POST", "/approvals", { project: p, body: { target, gate, decision, phrase, docSha256, ruleCandidate: bool(ctx.values, "rule-candidate") } }, approvedLines);
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}
async function runAnswer(ctx) {
  const [target, qid, extra] = ctx.positionals;
  if (!target || extra) throw usageError("harness-kit answer <INT 또는 키> --list | <Q-n> --choice <A-D|other> [--text …]");
  if (bool(ctx.values, "list") || !qid) {
    return run3(ctx, "GET", "/questions", { query: { target } }, (d) => {
      const qs = d.questions ?? [];
      return qs.length ? qs.map((q2) => `${q2.id} ${q2.open ? "열림" : "답함"} · 직무 ${q2.role} · 권장 ${q2.recommended ?? "—"} — ${q2.text}${q2.answer ? ` (답: ${q2.answer})` : ""}`) : ["질문 없음"];
    });
  }
  const choice = str(ctx.values, "choice");
  if (!choice) throw usageError("--choice <A-D|other> 가 필요하다");
  const refused = humanTerminal(ctx);
  if (refused) return failure(ctx, refused);
  try {
    const p = await openProject(ctx);
    const list2 = (await callApi(p, "GET", "/questions", { query: { target } })).data;
    return run3(ctx, "POST", `/questions/${target}/${qid}/answer`, { project: p, body: { choice, text: str(ctx.values, "text"), baseSha256: list2.sha256 } }, (d) => [`${String(d.kind) === "opinion" ? "의견" : "답"}을 남겼다: ${String(d.path)} · 열린 질문 ${String(d.open)}건${d.statusChanged ? ` · ${String(d.statusChanged)}` : ""}`]);
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}
async function runReview(ctx) {
  const [sub2, key, findingId, extra] = ctx.positionals;
  if (sub2 === "show" && key && !findingId) return run3(ctx, "GET", `/reviews/${key}`, {}, jsonLines);
  if (sub2 !== "decide" || !key || !findingId || extra) throw usageError("harness-kit review show <키> | review decide <키> <F-n> --fix|--accept-risk --reason …");
  const fix = bool(ctx.values, "fix");
  const accept = bool(ctx.values, "accept-risk");
  const reason = str(ctx.values, "reason");
  if (fix === accept || !reason) throw usageError("--fix 또는 --accept-risk 하나와 --reason 이 필요하다");
  const refused = humanTerminal(ctx);
  if (refused) return failure(ctx, refused);
  try {
    const p = await openProject(ctx);
    const decision = accept ? "risk-accepted" : "fix-required";
    const ok2 = await confirmKey(ctx, key, [`리뷰 판단: ${key} · ${findingId} · ${decision}`, `- 사유: "${reason.replace(/\s+/g, " ").trim()}"`]);
    if (!ok2) return failure(ctx, new ApiError(409, "not_confirmed", "입력한 키가 다르다 — 기록하지 않았다"));
    return run3(ctx, "POST", `/reviews/${key}/${findingId}/decision`, { project: p, body: { decision, phrase: reason } }, approvedLines);
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}

// src/commands/init.ts
var import_node_fs43 = __toESM(require("node:fs"));
var import_node_path49 = __toESM(require("node:path"));

// src/cli/prompt.ts
var import_node_readline = __toESM(require("node:readline"));
function createPrompter(input, write) {
  const rl = import_node_readline.default.createInterface({ input, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const next = async () => {
    const r = await lines.next();
    return r.done ? null : String(r.value);
  };
  return {
    async ask(question, fallback) {
      write(`${question}${fallback ? ` (${fallback})` : ""}: `);
      const a = await next();
      const v = (a ?? "").trim();
      return v === "" ? fallback : v;
    },
    async confirm(question) {
      write(`${question} [Y/n]: `);
      const a = await next();
      if (a === null) return false;
      return !/^(n|no|아니오|아니)$/i.test(a.trim());
    },
    close() {
      rl.close();
    }
  };
}

// src/commands/init.ts
var TOKEN_FLAGS = {
  name: "PROJECT_NAME",
  slug: "PROJECT_SLUG",
  "package-ns": "PACKAGE_NS",
  "protected-path": "PROTECTED_PATH"
};
var ISSUE_SOURCES = ["kit", "jira"];
function tokenFlags(ctx, layout2) {
  const out = {};
  for (const raw of list(ctx.values, "token")) {
    const eq = raw.indexOf("=");
    if (eq <= 0) throw usageError(`--token 은 KEY=VALUE 형식이다: '${raw}'`);
    const key = raw.slice(0, eq);
    if (!layout2.tokens.includes(key)) throw usageError(`모르는 토큰: ${key}`, `사용 가능: ${layout2.tokens.join(" ")}`);
    out[key] = raw.slice(eq + 1);
  }
  for (const [flag, key] of Object.entries(TOKEN_FLAGS)) {
    const v = str(ctx.values, flag);
    if (v !== void 0) out[key] = v;
  }
  return out;
}
function checkSlug(slug) {
  if (slug === "" || slug === "." || slug === ".." || /[/\\\0]/.test(slug)) {
    throw usageError(`PROJECT_SLUG 로 쓸 수 없는 값: '${slug}'`, "/ · \\ · . · .. 없이 폴더 이름처럼 쓴다");
  }
}
async function askMissing(p, input, layout2, templatesDir) {
  const out = { ...input };
  if (out.stack === void 0) out.stack = await p.ask(`스택 [${listStacks(templatesDir).join("/")}]`, layout2.defaultStack);
  if (out.arch === void 0) {
    out.arch = await p.ask(`변형 [${listArchs(templatesDir, out.stack).join("/")}]`, stackSpecOf(layout2, out.stack).defaultArch);
  }
  if (out.agents === void 0) out.agents = await p.ask(`하네스 [${layout2.harnesses.join(",")}|all]`, "");
  if (out.agents === "") delete out.agents;
  if (out.modules === void 0) out.modules = await p.ask(`모듈 [${layout2.modules.join(",")}|all|none]`, "none");
  return out;
}
function opJson3(o) {
  const j = { path: o.path, op: o.op, owner: o.owner, layer: o.layer, action: o.action, executable: o.executable };
  if (o.reason !== void 0) j.reason = o.reason;
  return j;
}
var needsAttention = (o) => o.action === "skip-user" || o.action === "replace";
function selectionLine2(sel) {
  const parts = [sel.stack, sel.arch, sel.domain || "도메인 없음", ...sel.lang ? [`lang ${sel.lang}`] : []];
  return `  선택: ${parts.join(" · ")} · 하네스 ${sel.agents.join(",")} · 모듈 ${sel.modules.join(",") || "none"}`;
}
function countsLine2(plan) {
  const c = plan.counts;
  return `  파일: 생성 ${c.create} · 교체 ${c.replace} · 같음 ${c.same} · 건너뜀(사람 파일) ${c["skip-user"]} · 하네스 제외 ${c.excludedByHarness} · 겹침 ${c.overlapped}`;
}
function opLine3(o) {
  return `  ${o.action.padEnd(9)} ${o.path}  [${o.layer}]${o.reason ? `  ${o.reason}` : ""}`;
}
function docsLine(r) {
  if (r.status === "built") return "  기능 문서: docs/features/ 생성";
  if (r.status === "skipped") return `  기능 문서: 건너뜀(${r.reason})`;
  return `  ⚠ 기능 문서 생성 실패 — 'python3 tools/docs/feature_docs.py build' 를 직접 실행한다 (${r.error})`;
}
function readOptions(ctx, layout2) {
  const force = bool(ctx.values, "force");
  const adopt = bool(ctx.values, "adopt");
  if (force && adopt) throw usageError("--force 와 --adopt 는 같이 쓰지 않는다", "--force 는 있는 파일을 덮고, --adopt 는 있는 파일을 모두 사람 파일로 둔다");
  const issueSource = str(ctx.values, "issue-source");
  if (issueSource !== void 0 && !ISSUE_SOURCES.includes(issueSource)) {
    throw usageError(`알 수 없는 --issue-source: '${issueSource}'`, `사용 가능: ${ISSUE_SOURCES.join(" ")}`);
  }
  return { force, adopt, issueSource, flags: tokenFlags(ctx, layout2) };
}
function assertInstallable(target) {
  const st = lstatOrNull(target);
  if (st && !(st.isDirectory() || st.isSymbolicLink() && import_node_fs43.default.statSync(target).isDirectory())) {
    throw new CliError(EXIT.STATE, `대상이 폴더가 아니다: ${target}`);
  }
  if (import_node_fs43.default.existsSync(import_node_path49.default.join(target, META_REL))) {
    throw new CliError(EXIT.STATE, `이미 설치된 리포다: ${import_node_path49.default.join(target, META_REL)}`, "킷 갱신은 harness-kit update, 하네스 · 모듈 추가는 harness-kit add 다. 지금 상태는 harness-kit doctor");
  }
}
function selectionInput(ctx) {
  const keys = ["stack", "arch", "domain", "lang", "agents", "modules"];
  return Object.fromEntries(keys.map((k) => [k, str(ctx.values, k)]));
}
function planData(command, target, templates, sel, tokens, plan, shown) {
  return {
    command,
    target,
    templates,
    dryRun: command === "plan",
    selection: { stack: sel.stack, arch: sel.arch, domain: sel.domain, lang: sel.lang, agents: sel.agents, agentsOrigin: sel.agentsOrigin, modules: sel.modules },
    tokens,
    counts: plan.counts,
    ops: shown.map(opJson3),
    overlaps: plan.overlaps,
    generated: plan.generated.map((g) => ({ path: g.path, action: g.action })),
    state: [META_REL, LOCK_REL]
  };
}
function lockText(plan, source) {
  const copies = plan.ops.map(
    (o) => o.owner === "kit" ? { path: o.path, op: "copy", owner: "kit", sha256: o.sha256, layer: o.layer } : { path: o.path, op: "copy", owner: "user", sha256: null, layer: o.layer }
  );
  return serializeLock({ schema: "harness-kit.lock/v2", kit: { version: VERSION, source }, packs: [], entries: mergeEntries(copies, plan.projection) });
}
var STATE_LINE = `  상태 파일: ${META_REL} · ${LOCK_REL} · ${MANIFEST_PATH}`;
async function runInit(ctx) {
  const command = ctx.command === "plan" || bool(ctx.values, "dry-run") ? "plan" : "init";
  const { io: io2 } = ctx;
  const target = targetOf(ctx);
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
  const layout2 = loadLayout(loc.dir);
  const opts = readOptions(ctx, layout2);
  assertInstallable(target);
  const interactive = io2.isTTY && !bool(ctx.values, "yes") && !ctx.json && io2.stdin !== void 0;
  const prompter = interactive ? createPrompter(io2.stdin, io2.stderr) : null;
  try {
    const input = prompter ? await askMissing(prompter, selectionInput(ctx), layout2, loc.dir) : selectionInput(ctx);
    const selection = resolveSelection(layout2, loc.dir, input, { target, env: io2.env });
    const tokens = resolveTokens(layout2, selection, { flags: opts.flags, env: io2.env, targetBasename: import_node_path49.default.basename(target) });
    checkSlug(tokens.PROJECT_SLUG ?? "");
    const plan = buildPlan({ layout: layout2, templatesDir: loc.dir, target, selection, tokens, mode: { force: opts.force, adopt: opts.adopt } });
    const shown = command === "plan" && !ctx.quiet ? plan.ops : plan.ops.filter(needsAttention);
    const data = planData(command, target, loc.dir, selection, tokens, plan, shown);
    const projection = projectionData(plan.projection, plan.projectionFindings, command === "plan");
    if (projection) data.projection = projection;
    const human = needsHuman(plan.projection, plan.projectionFindings);
    const conflicts = projectionConflicts(plan.projection);
    if (conflicts.length) data.conflicts = conflicts;
    const lines = [`harness-kit ${command} — ${target}`, selectionLine2(selection), ...(selection.retiredModules ?? []).map((m) => retiredNote(m, "flag"))];
    if (selection.retiredModules) data.retiredModules = selection.retiredModules;
    const projectionShown = projectionLines(plan.projection, plan.projectionFindings, ctx.quiet, command === "plan" && !ctx.quiet, /* @__PURE__ */ new Set(["create"]));
    if (command === "plan") {
      lines.push(...shown.map(opLine3), countsLine2(plan), ...projectionShown, STATE_LINE, "  (plan — 쓰지 않았다)");
      return { code: EXIT.OK, data, lines };
    }
    if (prompter) {
      io2.stderr(`${countsLine2(plan)}
`);
      if (!await prompter.confirm("진행할까?")) throw new CliError(EXIT.ABORT, "중단했다(아무것도 쓰지 않았다)");
    }
    const meta = buildMeta({ version: VERSION, selection, tokens, issue: { source: opts.issueSource, prefix: str(ctx.values, "issue-prefix") }, base: str(ctx.values, "base"), today: today(io2) });
    const result = applyPlan({ plan, metaText: serializeMeta(meta), lockText: lockText(plan, loc.source), env: io2.env });
    data.featureDocs = result.featureDocs;
    lines.push(countsLine2(plan), ...shown.map(opLine3), ...projectionShown, STATE_LINE, docsLine(result.featureDocs), "  다음: harness-kit doctor");
    return { code: human ? EXIT.HUMAN : EXIT.OK, data, lines };
  } finally {
    prompter?.close();
  }
}

// src/commands/list.ts
var import_node_path50 = __toESM(require("node:path"));
function tally(values) {
  const out = /* @__PURE__ */ new Map();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return Object.fromEntries(out);
}
function runList(ctx) {
  const target = targetOf(ctx);
  const read = readMeta(import_node_path50.default.join(target, META_REL));
  if (read.status === "missing") throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, "설치는 harness-kit init");
  if (read.status === "invalid") throw new CliError(EXIT.STATE, `메타를 해석하지 못했다: ${read.error}`, "harness-kit doctor 로 상태를 본다");
  const m = read.meta;
  const data = {
    command: "list",
    target,
    metaSchema: read.schema,
    kit: { version: m.kit.version },
    project: m.project,
    stack: m.stack,
    arch: m.arch,
    domain: m.domain,
    agents: m.agents,
    modules: m.modules,
    packs: m.packs,
    issueKey: m.issueKey,
    git: { base: m.git.base },
    installedAt: m.installedAt,
    updatedAt: m.updatedAt
  };
  const lines = [
    `harness-kit list — ${target}`,
    `  킷 ${m.kit.version} (메타 ${read.schema}) · 설치 ${m.installedAt || "?"} · 갱신 ${m.updatedAt || "?"}`,
    `  ${m.project.name} (${m.project.slug}) · 스택 ${m.stack} · 변형 ${m.arch} · 도메인 ${m.domain || "없음"}`,
    `  하네스 ${m.agents.join(", ") || "없음"} · 모듈 ${m.modules.join(", ") || "none"} · 팩 ${m.packs.length || "none"}`,
    `  이슈 키 ${m.issueKey.source}:${m.issueKey.prefix} · base ${m.git.base}`
  ];
  if (bool(ctx.values, "files")) {
    const lr = readLock(import_node_path50.default.join(target, LOCK_REL));
    if (lr.status !== "ok") {
      throw new CliError(EXIT.STATE, `lock 을 읽지 못했다: ${lr.status === "missing" ? "없음" : lr.error}`, "harness-kit doctor 로 상태를 본다");
    }
    const entries = lr.lock.entries.map((e) => ({ path: e.path, op: e.op, owner: e.owner, layer: e.layer ?? null }));
    const files = { format: lr.format, total: entries.length, byOwner: tally(entries.map((e) => e.owner)), byOp: tally(entries.map((e) => e.op)), entries };
    data.files = files;
    const own = Object.entries(files.byOwner).map(([k, n]) => `${k} ${n}`).join(" · ");
    lines.push(`  파일 ${files.total} (${own}) · lock ${lr.format}`);
    if (!ctx.quiet) for (const e of entries) lines.push(`  ${`${e.owner}/${e.op}`.padEnd(10)} ${e.path}${e.layer ? `  [${e.layer}]` : ""}`);
  }
  return { code: EXIT.OK, data, lines };
}

// src/commands/remove.ts
var import_node_path51 = __toESM(require("node:path"));
function keepAction(e) {
  const owner = ownerKind2(e.owner);
  if (owner === "external") return "skip-external";
  if (owner === "pack") return "skip-pack";
  if (owner !== "kit" || entryKind(e) === "none") return "keep-user";
  return null;
}
function judgeDrop(l, p, e, cur, ambiguous) {
  const keep = keepAction(e);
  const layer = e.layer ?? null;
  if (keep) return { op: { path: p, owner: e.owner, layer, action: keep }, entry: e };
  if (cur.kind === "none") return { op: { path: p, owner: e.owner, layer, action: "absent" }, entry: void 0 };
  if (cur.kind === "file" && e.sha256 && cur.sha === e.sha256) {
    const neu = `${p}.new`;
    const alsoNew = existing(import_node_path51.default.join(l.target, ...neu.split("/"))).kind === "file" ? { alsoNew: neu } : {};
    return { op: { path: p, owner: e.owner, layer, action: "delete", ...alsoNew }, entry: void 0 };
  }
  const reason = cur.kind === "other" ? cur.what : ambiguous.has(p) ? AMBIGUOUS_REASON : e.sha256 ? "사람이 고친 파일이다" : "lock 에 기준 해시가 없다(고친 파일로 본다)";
  return { op: { path: p, owner: e.owner, layer, action: "keep-modified", reason }, entry: { path: p, op: "copy", owner: "user", sha256: null, ...e.layer ? { layer: e.layer } : {} } };
}
function judgeRelayer(l, p, w, e, cur) {
  const skip = skipByOwner(e);
  if (skip) return { op: { path: p, owner: e.owner, layer: e.layer ?? null, action: skip.action }, entry: e };
  const kit = { path: p, op: "copy", owner: "kit", sha256: w.sha256, layer: w.layer };
  const withD3 = { owner: "kit", layer: w.layer, executable: w.executable, content: w.content };
  if (cur.kind === "other") return { op: { path: p, owner: e.owner, layer: w.layer, action: "skip-user", reason: cur.what }, entry: e };
  if (cur.kind === "none") return { op: { path: p, owner: e.owner, layer: w.layer, action: "relayer", reason: "파일이 없다 — repair · update 가 되살린다" }, entry: { ...e, layer: w.layer } };
  if (cur.sha === w.sha256) return { op: { path: p, owner: "kit", layer: w.layer, action: "same" }, entry: kit };
  if (e.sha256 && cur.sha === e.sha256) return { op: { path: p, ...withD3, action: "update" }, entry: kit };
  const neu = `${p}.new`;
  const newFile = existing(import_node_path51.default.join(l.target, ...neu.split("/"))).kind === "other" ? {} : { newFile: neu };
  return { op: { path: p, ...withD3, action: "conflict", ...newFile }, entry: { ...e, layer: w.layer } };
}
function planRemove(l, after) {
  const beforeLayers = winnerLayers(l.layout, l.loc.dir, l.before, l.tokens);
  const afterLayers = winnerLayers(l.layout, l.loc.dir, after, l.tokens);
  const oldWant = wanted({ layout: l.layout, templatesDir: l.loc.dir, selection: l.before, tokens: l.tokens }).want;
  const newWant = wanted({ layout: l.layout, templatesDir: l.loc.dir, selection: after, tokens: l.tokens }).want;
  const shaOf2 = () => new Map([...oldWant, ...newWant].map(([p2, d]) => [p2, d.sha256]));
  const { lock, ambiguous } = resolvedLock(l.inst, l.target, shaOf2);
  const locked = new Map(lock.entries.map((e) => [e.path, e]));
  const ancestors = ancestorsOf(l.target);
  const ops = [];
  for (const p2 of [...beforeLayers.keys()].filter((x) => !afterLayers.has(x)).sort(byteCompare)) {
    const e = locked.get(p2);
    if (!e) continue;
    const j = judgeDrop(l, p2, e, currentOf(l.target, ancestors, p2), ambiguous);
    ops.push(j.op);
    if (j.entry) locked.set(p2, j.entry);
    else locked.delete(p2);
  }
  for (const p2 of relayered(beforeLayers, afterLayers)) {
    const e = locked.get(p2);
    if (!e) continue;
    const j = judgeRelayer(l, p2, newWant.get(p2), e, currentOf(l.target, ancestors, p2));
    ops.push(j.op);
    locked.set(p2, j.entry);
  }
  const manifest = manifestChange(l, ancestors, after);
  const spec = loadSpecOrNull(l.loc.dir);
  if (!spec) return { ops, entries: [...locked.values()], manifest, projection: null };
  const { writes, deletes } = changeOverlay(ops);
  const p = prepare({ target: l.target, spec, tokens: l.tokens, agents: after.agents, writes, deletes, copyPaths: newWant.keys() });
  const projection = judgeUpdate({ target: l.target, spec, tokens: l.tokens, sources: p.sources, wants: p.wants, prev: l.inst.lock.entries, copyNow: new Set(newWant.keys()), acceptAll: false, retire: false });
  return { ops, entries: [...locked.values()], manifest, projection, projectionFindings: p.findings };
}
function runRemove(ctx) {
  const kit = kitOf(ctx);
  const asked = parseNames(kit.layout, ctx.positionals, "remove");
  const only = retiredOnly(ctx, "remove", asked);
  if (only) return { ...only, data: { ...only.data, names: { ...asked, notOn: [] } } };
  const l = loadForChange(ctx, "remove", kit);
  const notOn = [...asked.harnesses.filter((h) => !l.before.agents.includes(h)), ...asked.modules.filter((m) => !l.before.modules.includes(m))];
  const names = { harnesses: asked.harnesses.filter((h) => !notOn.includes(h)), modules: asked.modules.filter((m) => !notOn.includes(m)), retired: asked.retired };
  const after = withoutNames(l.before, names);
  if (after.agents.length === 0) throw usageError("하네스를 모두 뺄 수 없다 — 하나는 남는다", "킷을 통째로 지우려면 harness-kit uninstall");
  const dryRun = dryRunOf(ctx);
  const nothing = names.harnesses.length + names.modules.length === 0;
  const result = nothing ? { ops: [], entries: l.inst.lock.entries, manifest: null } : planRemove(l, after);
  const featureDocs = dryRun || nothing ? null : applyChange(ctx, l, after, result);
  const notes = [...retiredNotes(asked), ...notOn.length ? [`  · 켜져 있지 않다 — 건너뛴다: ${notOn.join(", ")}`] : []];
  const keep = [...result.ops.filter((o) => o.action === "keep-modified").map((o) => o.path), ...(result.projection?.ops ?? []).filter((o) => o.action === "keep-modified").map((o) => o.path)];
  const { data, lines } = report(ctx, l, { command: "remove", names: { ...names, notOn }, after, result, dryRun, featureDocs, notes, extra: { keep } });
  if (keep.length) lines.splice(lines.length - 1, 0, "  고친 파일은 남겼다(lock 은 owner user). 필요 없으면 직접 지운다");
  const human = keep.length > 0 || result.ops.some((o) => o.action === "conflict") || result.manifest?.action === "conflict" || needsHuman(result.projection ?? null, result.projectionFindings ?? []);
  return { code: human ? EXIT.HUMAN : EXIT.OK, data, lines };
}

// src/commands/repair.ts
var import_node_fs44 = __toESM(require("node:fs"));
var import_node_path52 = __toESM(require("node:path"));
var REPAIR_KINDS = ["missing", "drifted", "stale", "merge"];
function full9(target, rel2) {
  return import_node_path52.default.join(target, ...rel2.split("/"));
}
function parseOnly2(raw) {
  if (raw === void 0) return [...REPAIR_KINDS];
  const only = raw.split(/[\s,]+/).filter(Boolean);
  const unknown = only.filter((k) => !REPAIR_KINDS.includes(k));
  if (unknown.length || only.length === 0) throw usageError(`모르는 repair 종류: ${unknown.join(" ") || "(빈 값)"}`, `사용 가능: ${REPAIR_KINDS.join(" ")}`);
  return only;
}
function survey(target, inst) {
  const ancestors = new AncestorCheck(target, import_node_fs44.default.realpathSync(target));
  const out = { ok: 0, drifted: 0, skipped: 0, missing: [] };
  for (const e of inst.lock.entries) {
    if (ownerKind2(e.owner) !== "kit" || entryKind(e) !== "copy") {
      out.skipped += 1;
      continue;
    }
    if (ancestors.state(e.path) === "blocked") {
      out.drifted += 1;
      continue;
    }
    const cur = existing(full9(target, e.path));
    if (cur.kind === "none") out.missing.push(e);
    else if (cur.kind === "file" && e.sha256 && sha256(cur.bytes) === e.sha256) out.ok += 1;
    else out.drifted += 1;
  }
  return out;
}
function wantFor(ctx, target, inst) {
  const { io: io2 } = ctx;
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
  const layout2 = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout2, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout2, selection, inst.meta, io2.env, target);
  return { want: wanted({ layout: layout2, templatesDir: loc.dir, selection, tokens }).want, templates: loc.dir };
}
function judgeMissing(e, lockVersion, want) {
  const base = { path: e.path, layer: e.layer ?? null };
  if (lockVersion !== VERSION || !want) {
    const reason = lockVersion ? `lock 의 킷 판 ${lockVersion} ≠ CLI ${VERSION}` : "lock 에 킷 판이 없다(v1)";
    return { ...base, action: "needs-update", reason };
  }
  const w = want.get(e.path);
  if (!w) return { ...base, action: "unrestorable", reason: "이 킷에 없는 경로다" };
  if (e.sha256 && w.sha256 !== e.sha256) return { ...base, action: "needs-update", reason: "킷 내용이 lock 기록과 다르다" };
  return { ...base, action: "restore", want: w };
}
function applyRepair(target, inst, ops, projection) {
  const restored = new Map(ops.filter((o) => o.action === "restore").map((o) => [o.path, o.want]));
  let current4 = "";
  try {
    for (const [rel2, w] of restored) {
      current4 = rel2;
      writeFileAtomic(full9(target, rel2), w.content, w.executable);
    }
    current4 = "배치(mirror · render · merge)";
    if (projection) applyProjection(target, projection.ops);
    const copies = inst.lock.entries.map((e) => {
      const w = restored.get(e.path);
      return w ? { ...e, sha256: w.sha256, layer: w.layer } : e;
    });
    const entries = projection ? [...copies.filter((e) => !projection.touched.has(e.path)), ...projection.entries] : copies;
    current4 = LOCK_REL;
    writeFileAtomic(full9(target, LOCK_REL), Buffer.from(serializeLock({ ...inst.lock, entries }), "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current4}`);
  }
}
function chosen(only, kind) {
  return only.includes(kind);
}
function repairProjection(ctx, target, inst, only) {
  const { io: io2 } = ctx;
  if (!inst.lock.entries.some((e) => PROJECTION_OPS.has(e.op))) return null;
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
  const spec = loadSpecOrNull(loc.dir);
  if (!spec) return null;
  const layout2 = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout2, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout2, selection, inst.meta, io2.env, target);
  const p = prepare({ target, spec, tokens, agents: selection.agents });
  const out = { ops: [], entries: [], touched: /* @__PURE__ */ new Set(), unrestorable: 0, findings: p.findings };
  const byPath = new Map(inst.lock.entries.map((e) => [e.path, e]));
  for (const w of [...p.wants].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const r = w.op === "merge" ? repairMerge(target, w, byPath.get(w.path), only) : repairFile(target, w, byPath.get(w.path), only);
    if (!r) continue;
    out.touched.add(w.path);
    if (r.op) out.ops.push(r.op);
    if (r.entry) out.entries.push(r.entry);
  }
  const wanted2 = new Set(p.wants.map((w) => w.path));
  for (const e of inst.lock.entries) {
    if (!PROJECTION_OPS.has(e.op) || e.owner !== "kit" || wanted2.has(e.path) || e.op === "merge") continue;
    out.unrestorable += 1;
    out.ops.push({ path: e.path, op: e.op, harness: "", action: "unrestorable", reason: "원본이 없다 — update 가 지운다" });
  }
  return out;
}
function repairMerge(target, w, e, only) {
  const p = full9(target, w.path);
  const cur = import_node_fs44.default.existsSync(p) && import_node_fs44.default.lstatSync(p).isFile() ? import_node_fs44.default.readFileSync(p, "utf8") : null;
  const keys = e && Array.isArray(e.keys) ? e.keys : void 0;
  const lost = cur === null ? ["(파일 없음)"] : keys ? missingWith(w.kind, cur, keys, w.want) : [];
  if (lost.length === 0 && e || !chosen(only, cur === null ? "missing" : "merge")) return null;
  const r = mergeWith(w.kind, cur, w.want, keys);
  if (!r.ok) return { op: { path: w.path, op: "merge", harness: w.harness, action: "conflict", reason: r.reason } };
  const created = e?.createdByKit === true || r.created;
  const entry = created ? { path: w.path, op: "merge", owner: "kit", keys: r.keys, createdByKit: true } : { path: w.path, op: "merge", owner: "kit", keys: r.keys };
  if (cur === r.text) return { entry };
  return { op: { path: w.path, op: "merge", harness: w.harness, action: cur === null ? "restore" : "remerge", effect: { text: r.text } }, entry };
}
function fileOp(w, action, extra = {}) {
  return { path: w.path, op: w.op, harness: w.harness, action, ...extra, effect: { ...extra.effect, write: w } };
}
function backupOp(w, cur) {
  const have = cur.kind === "file" ? cur.files ?? /* @__PURE__ */ new Map() : /* @__PURE__ */ new Map();
  const same2 = (rel2) => w.files.some((f) => f.rel === rel2 && f.bytes.equals(have.get(rel2)));
  const backups = w.kind === "dir" ? [...have.keys()].filter((rel2) => !same2(rel2)).map((rel2) => `${w.path}/${rel2}.bak`) : [`${w.path}.bak`];
  const renames = backups.map((b) => [b.slice(0, -".bak".length), b]);
  return fileOp(w, "backup", { reason: "생성 파일을 직접 고쳤다 — 수정본을 .bak 으로 옮겼다", backups, effect: { renames } });
}
function repairFile(target, w, e, only) {
  if (w.deferred || e && e.owner !== "kit") return null;
  const cur = stateOf(target, w.path, w.kind === "dir");
  const entry = { path: w.path, op: w.op, owner: "kit", sha256: w.sha256, from: w.from, fromSha256: w.fromSha256 };
  const when = (kind, op) => chosen(only, kind) ? { op, entry } : null;
  if (!e) {
    if (cur.kind === "none") return when("missing", fileOp(w, "create"));
    return cur.kind === "file" && cur.sha === w.sha256 ? { entry } : null;
  }
  if (cur.kind === "other") return null;
  if (cur.kind === "link") return when("drifted", fileOp(w, "relink", { reason: "symlink-found" }));
  if (cur.kind === "none") return when("missing", fileOp(w, "restore"));
  if (cur.sha === w.sha256) return { entry };
  if (typeof e.sha256 === "string" && cur.sha === e.sha256) return when("stale", fileOp(w, "regenerate", { reason: "원본이 바뀌었다" }));
  return when("drifted", backupOp(w, cur));
}
var HINTS = {
  "needs-update": "harness-kit update 로 킷 판을 맞춘다(되살리는 일도 update 가 한다)",
  unrestorable: "킷에서 빠진 경로다. lock 에서 빼려면 harness-kit update --prune, 받지 않으려면 --forget <경로>"
};
function runRepair(ctx) {
  const target = targetOf(ctx);
  const only = parseOnly2(str(ctx.values, "only"));
  const inst = loadInstalled(target, "repair");
  const lockVersion = inst.lock.kit.version;
  const s = survey(target, inst);
  const doMissing = only.includes("missing") && s.missing.length > 0;
  const source = doMissing && lockVersion === VERSION ? wantFor(ctx, target, inst) : null;
  const ops = doMissing ? s.missing.map((e) => judgeMissing(e, lockVersion, source?.want ?? null)) : [];
  const dryRun = bool(ctx.values, "dry-run");
  const count = (a) => ops.filter((o) => o.action === a).length;
  const projection = repairProjection(ctx, target, inst, only);
  const projectionWrites = (projection?.ops ?? []).some((o) => o.effect) || (projection?.entries ?? []).some((e) => JSON.stringify(e) !== JSON.stringify(inst.lock.entries.find((x) => x.path === e.path)));
  if (!dryRun && (count("restore") > 0 || projectionWrites)) applyRepair(target, inst, ops, projection);
  const counts2 = { ok: s.ok, drifted: s.drifted, missing: s.missing.length, restore: count("restore"), "needs-update": count("needs-update"), unrestorable: count("unrestorable") + (projection?.unrestorable ?? 0), skipped: s.skipped };
  const hints = ["needs-update", "unrestorable"].filter((a) => counts2[a] > 0).map((a) => HINTS[a]);
  const code = hints.length || (projection?.ops ?? []).some((o) => o.action === "conflict") ? EXIT.HUMAN : EXIT.OK;
  const opsJson = ops.map((o) => ({ path: o.path, layer: o.layer, action: o.action, ...o.reason ? { reason: o.reason } : {} }));
  const data = { command: "repair", target, dryRun, kit: { lock: lockVersion, cli: VERSION }, only, counts: counts2, ops: opsJson, hints };
  if (projection) data.projection = { counts: projCounts(projection.ops), ops: projection.ops.map(projOpJson), findings: projection.findings };
  if (source) data.templates = source.templates;
  const lines = [
    `harness-kit repair — ${target}`,
    `  킷: lock ${lockVersion ?? "?(v1)"} · CLI ${VERSION}`,
    ...ops.map((o) => `  ${o.action.padEnd(13)} ${o.path}${o.reason ? `  ${o.reason}` : ""}`),
    `  copy 항목: ok ${counts2.ok} · drifted ${counts2.drifted}(사람이 고친 파일 — 그대로 둔다) · missing ${counts2.missing}`,
    `  되살림 ${counts2.restore} · update 필요 ${counts2["needs-update"]} · 킷에 없음 ${counts2.unrestorable}`,
    ...projection ? [...projection.ops.map(projLine), projSummary(projection.ops)] : [],
    ...hints.map((h) => `  다음: ${h}`),
    ...dryRun ? ["  (dry-run — 쓰지 않았다)"] : []
  ];
  const tpl = source?.templates ?? locateTemplates({ flag: str(ctx.values, "templates"), env: ctx.io.env, cliFile: ctx.io.cliFile, cwd: ctx.io.cwd, version: VERSION }).dir;
  const local = localAfter(ctx, target, inst, tpl, dryRun);
  if (local) {
    data.local = local.result;
    lines.splice(lines.length - (dryRun ? 1 : 0), 0, ...local.lines);
  }
  return { code, data, lines };
}

// src/commands/reserved.ts
var RESERVED = {
  skills: "P20 · HK-18(스킬 목록, 설계 07)",
  usage: "P20 · HK-18(관리 페이지 사용량, 설계 06 §3.18 · 12)",
  intake: "P21 · HK-19(요구사항 접수, 설계 08)",
  mob: "P21 · HK-19(설계 단계, 설계 08)",
  deploy: "P24(배포 · 운영, 설계 14)",
  ops: "P24(배포 · 운영, 설계 14)",
  metrics: "P24(배포 · 운영, 설계 14)",
  rules: "P24(배포 · 운영, 설계 14)",
  sync: "P24(설계 10)"
};

// src/commands/status.ts
var import_node_fs45 = __toESM(require("node:fs"));
var import_node_path53 = __toESM(require("node:path"));
function registryProjects(ctx) {
  const home = homeOf(ctx);
  return new Projects(() => readRegistry(home), { env: ctx.io.env, home, readOnly: true, multi: true, deps: dashboardDeps() });
}
function overviewLines(d) {
  const todo = d.todo ?? [];
  const stages = d.stages ?? {};
  const more = d.more ?? {};
  return [
    `처리할 일 ${String(d.total ?? todo.length)}건`,
    ...todo.map((t) => `  [${t.rank}] ${t.title} — ${t.reason}`),
    ...Object.keys(more).length ? [`  더: ${Object.entries(more).map(([r, n]) => `rank ${r} ${n}건`).join(" · ")}`] : [],
    `단계: ${Object.entries(stages).map(([k, n]) => `${k} ${n}`).join(" · ") || "이슈 없음"}`
  ];
}
function issueLines(d) {
  const list2 = d.issues ?? [];
  return list2.length ? list2.map((i) => `${i.key.padEnd(12)} ${i.stage.padEnd(13)} ${(i.area ?? "").padEnd(12)} ${i.source.padEnd(8)} ${i.name}`) : ["이슈 없음"];
}
async function runStatus(ctx) {
  const v = ctx.values;
  if (bool(v, "all")) {
    const data = await projectsOverview(registryProjects(ctx));
    const rows = data.projects;
    return { code: EXIT.OK, data, lines: rows.length ? rows.map((r) => `${r.name.padEnd(24)} ${r.state === "ok" ? `처리할 일 ${String(r.total ?? 0)}건` : r.error ?? r.state}`) : ["등록한 프로젝트가 없다 — npx harness-kit projects add <폴더>"] };
  }
  if (bool(v, "ops")) return run3(ctx, "GET", "/ops", {}, jsonLines);
  if (bool(v, "session")) return run3(ctx, "GET", "/session", {}, jsonLines);
  if (str(v, "flow") !== void 0) return run3(ctx, "GET", "/flow", { query: { intent: str(v, "flow") } }, jsonLines);
  if (str(v, "doc") !== void 0) return run3(ctx, "GET", "/docs", { query: { path: str(v, "doc") } }, (d) => [String(d.markdown ?? "")]);
  if (bool(v, "verify")) return run3(ctx, "GET", "/verify", { query: str(v, "issue") ? { issue: str(v, "issue") } : {} }, jsonLines);
  if (bool(v, "worktrees")) return run3(ctx, "GET", "/worktrees", {}, jsonLines);
  if (bool(v, "harness")) return run3(ctx, "GET", "/harness", {}, jsonLines);
  if (bool(v, "issues")) {
    const query = {};
    for (const k of ["area", "stage", "intent"]) if (str(v, k)) query[k] = str(v, k);
    return run3(ctx, "GET", "/issues", { query }, issueLines);
  }
  if (str(v, "issue") !== void 0) return run3(ctx, "GET", `/issues/${encodeURIComponent(str(v, "issue"))}`, {}, jsonLines);
  if (bool(v, "intents")) return run3(ctx, "GET", "/intents", {}, jsonLines);
  if (str(v, "intent") !== void 0) return run3(ctx, "GET", `/intents/${encodeURIComponent(str(v, "intent"))}`, {}, jsonLines);
  return run3(ctx, "GET", "/overview", {}, overviewLines);
}
async function runSessions(ctx) {
  if (bool(ctx.values, "machine")) {
    const p = await openProject(ctx).catch(() => null);
    const list2 = (await registryProjects(ctx).list()).map((s) => s.project).filter((x) => x !== null);
    if (p && !list2.some((x) => x.id === p.id)) list2.unshift(p);
    const data = await machineSessions(list2);
    return { code: EXIT.OK, data, lines: jsonLines(data) };
  }
  return run3(ctx, "GET", "/sessions", {}, (d) => {
    const list2 = d.sessions ?? [];
    return list2.length ? list2.map((s) => `${s.id.padEnd(20)} ${String(s.harness).padEnd(7)} ${String(s.role).padEnd(10)} ${String(s.issue ?? "—").padEnd(12)} ${s.state.padEnd(15)} ${String(s.turn)}${s.permissionMode === "bypassPermissions" ? " · bypassPermissions(요청이 사람 승인 없이 돈다)" : ""}`) : ["등록된 세션이 없다"];
  });
}
async function runQuality(ctx) {
  const v = ctx.values;
  if (bool(v, "findings")) {
    const query = {};
    if (str(v, "issue")) query.issue = str(v, "issue");
    if (str(v, "severity")) query.severity = str(v, "severity");
    if (bool(v, "new")) query.new = "1";
    return run3(ctx, "GET", "/reports/findings", { query }, jsonLines);
  }
  return run3(ctx, "GET", "/reports/summary", {}, jsonLines);
}
async function runHistory(ctx) {
  return run3(ctx, "GET", "/history", {}, jsonLines);
}
async function runFlow(ctx) {
  const [sub2] = ctx.positionals;
  if (sub2 !== "gates" || ctx.positionals.length > 1) throw usageError("harness-kit flow gates [--add <게이트> --after <게이트> | --remove <게이트>] [--json]");
  const add = str(ctx.values, "add");
  const remove = str(ctx.values, "remove");
  if (add === void 0 && remove === void 0) return run3(ctx, "GET", "/flow/gates", {}, (d) => [`게이트: ${d.gates.join(" → ")}`, `바닥(줄일 수 없음): ${d.floor.join(" · ")}`]);
  const p = await openProject(ctx);
  const file = import_node_path53.default.join(p.root, ".agents/harness-kit.json");
  const meta = JSON.parse(import_node_fs45.default.readFileSync(file, "utf8"));
  const flow = meta.flow && typeof meta.flow === "object" ? meta.flow : {};
  let gates = p.gates();
  if (remove !== void 0) {
    if (GATE_FLOOR.includes(remove)) throw new CliError(EXIT.CHECK, `${remove} 는 게이트 바닥이다(줄일 수 없다, 설계 04 §3.8)`);
    if (!gates.includes(remove)) throw new CliError(EXIT.CHECK, `${remove} 는 지금 flow.gates 에 없다`);
    gates = gates.filter((g) => g !== remove);
  } else if (add !== void 0) {
    const after = str(ctx.values, "after");
    if (gates.includes(add)) throw new CliError(EXIT.CHECK, `${add} 는 이미 flow.gates 에 있다`);
    const at = after === void 0 ? gates.length : gates.indexOf(after) + 1;
    if (after !== void 0 && at === 0) throw new CliError(EXIT.CHECK, `--after ${after} 가 flow.gates 에 없다`);
    gates = [...gates.slice(0, at), add, ...gates.slice(at)];
  }
  const next = { ...meta, flow: { ...flow, gates } };
  const tmp = `${file}.${process.pid}.tmp`;
  import_node_fs45.default.writeFileSync(tmp, formatJson(next));
  import_node_fs45.default.renameSync(tmp, file);
  return { code: EXIT.OK, data: { gates, floor: GATE_FLOOR, file: ".agents/harness-kit.json" }, lines: [`flow.gates: ${gates.join(" → ")}`, "팀 설정이다. MR 로 올린다"] };
}

// src/commands/uninstall.ts
var import_node_child_process10 = require("node:child_process");
var import_node_fs46 = __toESM(require("node:fs"));
var import_node_path54 = __toESM(require("node:path"));
var ACTIONS = ["delete", "keep-modified", "absent", "keep-user", "keep-external", "keep-pack", "unmerge"];
var COUNT_ONLY = /* @__PURE__ */ new Set(["absent", "keep-user", "keep-external", "keep-pack"]);
var HOOKS_PATH = "scripts/git-hooks";
function planMergeEntry(p, e) {
  const kind = MERGE_KIND[e.path];
  const cur = existing(full10(p.target, e.path));
  if (cur.kind === "none") {
    p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
    return;
  }
  if (!kind || !p.spec || cur.kind !== "file") {
    p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason: "병합 파일을 해석하지 못했다" });
    return;
  }
  const text2 = cur.bytes.toString("utf8");
  const want = fullMergeWant(kind, p.spec, p.tokens, loadSources(new FsView(p.target)));
  const r = unmergeWith(kind, text2, mergeKeysOf(e, kind, want), want);
  if (!r.ok) p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason: r.reason });
  else if (r.empty && e.createdByKit === true) p.ops.push({ path: e.path, owner: e.owner, action: "delete", reason: "킷 키만 있던 병합 파일" });
  else p.ops.push({ path: e.path, owner: e.owner, action: "unmerge", reason: "킷 키만 뺐다", ...r.text === text2 ? {} : { text: r.text } });
}
function mergeKeysOf(e, kind, want) {
  if (Array.isArray(e.keys)) return e.keys;
  const fresh = mergeWith(kind, null, want);
  return fresh.ok ? fresh.keys : [];
}
function planProjectionEntry(p, e) {
  if (e.op === "merge") {
    planMergeEntry(p, e);
    return;
  }
  const st = lstatOrNull(full10(p.target, e.path));
  const dir = Boolean(st?.isDirectory() && !st.isSymbolicLink());
  const cur = stateOf(p.target, e.path, dir);
  if (cur.kind === "none") p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
  else if (cur.kind === "file" && typeof e.sha256 === "string" && cur.sha === e.sha256) p.ops.push({ path: e.path, owner: e.owner, action: "delete", dir });
  else p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason: cur.kind === "link" ? "링크다" : "생성 파일을 사람이 고쳤다" });
  if (!dir && cur.kind !== "other" && current3(p, `${e.path}.new`).kind === "file") p.ops.push({ path: `${e.path}.new`, owner: e.owner, action: "delete", reason: "update 가 둔 .new" });
}
function full10(target, rel2) {
  return import_node_path54.default.join(target, ...rel2.split("/"));
}
function current3(p, rel2) {
  if (p.ancestors.state(rel2) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(full10(p.target, rel2));
  return cur.kind === "file" ? { kind: "file", sha: sha256(cur.bytes), bytes: cur.bytes } : cur;
}
function keepAction2(e, keepPacks) {
  const owner = ownerKind2(e.owner);
  if (owner === "external") return "keep-external";
  if (owner === "user" || owner === "unknown" || entryKind(e) === "none") return "keep-user";
  if (owner === "pack" && keepPacks) return "keep-pack";
  return null;
}
function planEntry(p, e) {
  const keep = keepAction2(e, p.keepPacks);
  if (keep) {
    p.ops.push({ path: e.path, owner: e.owner, action: keep });
    return;
  }
  if (PROJECTION_OPS.has(e.op)) {
    planProjectionEntry(p, e);
    return;
  }
  const cur = current3(p, e.path);
  if (cur.kind === "none") p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
  else if (cur.kind === "file" && e.sha256 && cur.sha === e.sha256) p.ops.push({ path: e.path, owner: e.owner, action: "delete" });
  else {
    const reason = cur.kind === "other" ? cur.what : e.sha256 ? "사람이 고친 파일이다" : p.ambiguous.has(e.path) ? AMBIGUOUS_REASON : "lock 에 기준 해시가 없다(고친 파일로 본다)";
    p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason });
  }
  if (cur.kind !== "other" && current3(p, `${e.path}.new`).kind === "file") {
    p.ops.push({ path: `${e.path}.new`, owner: e.owner, action: "delete", reason: "update 가 둔 .new" });
  }
}
function planManifest(p, inst) {
  const cur = current3(p, MANIFEST_PATH);
  if (cur.kind === "none") return;
  const want = manifestContent({ stack: inst.meta.stack, agents: inst.meta.agents }, inst.meta.tokens);
  if (cur.kind === "file" && cur.bytes.equals(want)) p.ops.push({ path: MANIFEST_PATH, owner: "kit", action: "delete", reason: "생성물" });
  else p.ops.push({ path: MANIFEST_PATH, owner: "kit", action: "keep-modified", reason: "킷 판과 다르다" });
}
function uninstallSpec(ctx, target) {
  const installed = import_node_path54.default.join(target, "scripts/harness/projection.json");
  try {
    if (import_node_fs46.default.existsSync(installed)) return parseSpec(import_node_fs46.default.readFileSync(installed, "utf8"));
    const { io: io2 } = ctx;
    return loadSpecOrNull(locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION }).dir);
  } catch (err) {
    if (err instanceof CliError) return null;
    throw err;
  }
}
function planNotice2(p) {
  const file = import_node_path54.default.join(p.target, ...NOTICE_REL.split("/"));
  let text2;
  try {
    text2 = import_node_fs46.default.readFileSync(file, "utf8");
  } catch {
    return;
  }
  if (isKitNotice(text2)) p.ops.push({ path: NOTICE_REL, owner: "kit", action: "delete", reason: "업그레이드 공지" });
}
function buildUninstall(ctx, target, inst, keepPacks, keepState, ambiguous) {
  const spec = inst.lock.entries.some((e) => e.op === "merge") ? uninstallSpec(ctx, target) : null;
  const p = { target, ancestors: new AncestorCheck(target, import_node_fs46.default.realpathSync(target)), keepPacks, ops: [], ambiguous, spec, tokens: inst.meta.tokens };
  for (const e of inst.lock.entries) planEntry(p, e);
  planManifest(p, inst);
  planNotice2(p);
  if (!keepState) for (const rel2 of [LOCK_REL, META_REL]) p.ops.push({ path: rel2, owner: "kit", action: "delete", reason: "상태 파일" });
  return p.ops;
}
function unhookGit(target, env, dryRun) {
  const git3 = (...args) => (0, import_node_child_process10.spawnSync)("git", ["-C", target, ...args], { env: gitEnv(env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 3e4 });
  const top = git3("rev-parse", "--show-toplevel");
  if (top.error) return { status: top.error.code === "ENOENT" ? "no-git" : "failed" };
  if (top.status !== 0) return { status: "none" };
  let topReal;
  try {
    topReal = import_node_fs46.default.realpathSync(top.stdout.trim());
  } catch {
    return { status: "none" };
  }
  if (topReal !== import_node_fs46.default.realpathSync(target)) return { status: "none" };
  const get = git3("config", "--local", "--get", "core.hooksPath");
  if (get.status !== 0) return { status: "none" };
  const value = get.stdout.trim();
  if (value !== HOOKS_PATH) return { status: "kept", value };
  if (!dryRun && git3("config", "--local", "--unset", "core.hooksPath").status !== 0) return { status: "failed", value };
  return { status: "unset", value };
}
function applyUninstall(target, inst, ops, unhook) {
  const state = /* @__PURE__ */ new Set([LOCK_REL, META_REL]);
  let current4 = "";
  try {
    for (const o of ops) {
      current4 = o.path;
      if (o.action === "unmerge" && o.text !== void 0) writeFileAtomic(import_node_path54.default.join(target, ...o.path.split("/")), Buffer.from(o.text, "utf8"), false);
      if (o.action !== "delete" || state.has(o.path)) continue;
      if (o.dir) removeTarget(target, o.path, true);
      else removeFile(target, o.path);
    }
    current4 = "git hook 연결";
    unhook();
    for (const rel2 of [LOCK_REL, META_REL]) {
      if (!ops.some((o) => o.path === rel2 && o.action === "delete")) continue;
      current4 = rel2;
      removeFile(target, rel2);
    }
    current4 = "빈 폴더";
    removeEmptyDirs(target, [...inst.lock.entries.map((e) => e.path), MANIFEST_PATH, LOCK_REL, META_REL]);
  } catch (err) {
    throw fsError(err, `지우기 실패 ${current4}`);
  }
}
function counts(ops) {
  const c = Object.fromEntries(ACTIONS.map((a) => [a, 0]));
  for (const o of ops) c[o.action] += 1;
  return c;
}
var opLine4 = (o) => `  ${o.action.padEnd(13)} ${o.path}${o.reason ? `  ${o.reason}` : ""}`;
async function confirm(ctx, ops) {
  const { io: io2 } = ctx;
  const p = createPrompter(io2.stdin, io2.stderr);
  try {
    const del = ops.filter((o) => o.action === "delete");
    const keep = ops.filter((o) => o.action === "keep-modified");
    io2.stderr(`지울 파일 ${del.length}개${ctx.quiet ? "" : ":"}
`);
    if (!ctx.quiet) for (const o of del) io2.stderr(`${opLine4(o)}
`);
    if (keep.length) io2.stderr(`남길 파일(사람이 고침) ${keep.length}개:
${keep.map((o) => `${opLine4(o)}
`).join("")}`);
    if (!await p.confirm("지울까?")) throw new CliError(EXIT.ABORT, "중단했다(아무것도 지우지 않았다)");
  } finally {
    p.close();
  }
}
function kitHashes(ctx, inst, target) {
  const { io: io2 } = ctx;
  try {
    const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
    const layout2 = loadLayout(loc.dir);
    const { selection } = selectionFromMeta(layout2, loc.dir, inst.meta);
    const tokens = tokensFromMeta(layout2, selection, inst.meta, io2.env, target);
    return new Map([...wanted({ layout: layout2, templatesDir: loc.dir, selection, tokens }).want].map(([p, d]) => [p, d.sha256]));
  } catch (err) {
    if (err instanceof CliError) return null;
    throw err;
  }
}
async function runUninstall(ctx) {
  const { io: io2 } = ctx;
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "uninstall");
  const dryRun = bool(ctx.values, "dry-run");
  const keepState = bool(ctx.values, "keep-state");
  const { lock, ambiguous } = resolvedLock(inst, target, () => kitHashes(ctx, inst, target));
  const ops = buildUninstall(ctx, target, { ...inst, lock }, bool(ctx.values, "keep-packs"), keepState, ambiguous);
  const interactive = io2.isTTY && !ctx.json && io2.stdin !== void 0;
  if (!dryRun && !bool(ctx.values, "yes")) {
    if (!interactive) throw usageError("uninstall 은 지울 목록을 확인받고 지운다. TTY 가 아니거나 --json 이면 --yes 를 준다", "목록은 harness-kit uninstall --dry-run 으로 먼저 본다");
    await confirm(ctx, ops);
  }
  let gitHooks = { status: "none" };
  if (dryRun) gitHooks = unhookGit(target, io2.env, true);
  else applyUninstall(target, inst, ops, () => {
    gitHooks = unhookGit(target, io2.env, false);
  });
  const c = counts(ops);
  const listed = ops.filter((o) => !COUNT_ONLY.has(o.action) && (o.action === "keep-modified" || dryRun && !ctx.quiet));
  const keep = ops.filter((o) => o.action === "keep-modified").map((o) => o.path);
  const data = {
    command: "uninstall",
    target,
    dryRun,
    counts: c,
    ops: listed.map((o) => ({ path: o.path, owner: o.owner, action: o.action, ...o.reason ? { reason: o.reason } : {} })),
    keep,
    gitHooks,
    keepState
  };
  const lines = [
    `harness-kit uninstall — ${target}`,
    ...listed.map(opLine4),
    `  지움 ${c.delete} · 남김(사람이 고침) ${c["keep-modified"]} · 이미 없음 ${c.absent} · 사람 · 외부 · 팩 파일 ${c["keep-user"] + c["keep-external"] + c["keep-pack"]}`,
    `  git hook 연결(core.hooksPath): ${gitHooks.status}${gitHooks.value ? ` (${gitHooks.value})` : ""}`,
    ...keepState ? [`  상태 파일은 둔다: ${META_REL} · ${LOCK_REL}`] : [],
    ...keep.length ? ["  고친 파일은 남겼다. 필요 없으면 직접 지운다"] : [],
    ...dryRun ? ["  (dry-run — 지우지 않았다)"] : []
  ];
  return { code: keep.length ? EXIT.HUMAN : EXIT.OK, data, lines };
}

// src/commands/pack.ts
var import_node_fs47 = __toESM(require("node:fs"));
var import_node_path55 = __toESM(require("node:path"));
var TEST_PY = `"""팩 자체 검사(설계 04 §3.2 검증) — 이 폴더에서 python3 -m unittest tests.test_pack 으로 돈다. 팩과 함께 설치하지 않는다."""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PackTest(unittest.TestCase):
    def setUp(self):
        self.pack = json.loads((ROOT / "pack.json").read_text(encoding="utf-8"))

    def test_manifest(self):
        self.assertEqual("harness-kit.pack/v1", self.pack["schema"])
        self.assertRegex(self.pack["name"], r"^[a-z][a-z0-9-]{1,30}$")
        self.assertRegex(self.pack["version"], r"^\\d+\\.\\d+\\.\\d+")
        self.assertTrue(self.pack["requires"]["kit"])

    def test_fragment_ids_match_provides(self):
        name = self.pack["name"]
        hooks = json.loads((ROOT / "fragments/hooks.json").read_text(encoding="utf-8"))["hooks"]
        checks = json.loads((ROOT / "fragments/verify-checks.json").read_text(encoding="utf-8"))["checks"]
        self.assertEqual(sorted(h["id"] for h in hooks), sorted(self.pack["provides"].get("hooks", [])))
        self.assertEqual(sorted(c["id"] for c in checks), sorted(self.pack["provides"].get("verifyChecks", [])))
        for hook in hooks:
            self.assertTrue(hook["id"].startswith(f"harness-{name}-"), hook["id"])
        for check in checks:
            self.assertTrue(check["id"].startswith(f"{name}-"), check["id"])

    def test_no_links_and_shell_scripts_are_executable(self):
        for path in ROOT.rglob("*"):
            self.assertFalse(path.is_symlink(), path)
            if path.suffix == ".sh":
                self.assertTrue(path.stat().st_mode & 0o111, path)


if __name__ == "__main__":
    unittest.main()
`;
function defaultRange() {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(VERSION);
  return m ? `>=${m[1]}.${m[2]}.0 <${Number(m[1]) + 1}.0.0` : ">=2.0.0 <3.0.0";
}
function reverseMap(layout2, dest) {
  const segs = layout2.segments.filter((s) => s.harness === null && s.from !== "" && s.from !== "root/" && s.from.endsWith("/"));
  const best = segs.filter((s) => dest.startsWith(s.to)).sort((a, b) => b.to.length - a.to.length)[0];
  return best ? `common/${best.from}${dest.slice(best.to.length)}` : null;
}
function classify(dest, provides, name) {
  let m;
  if (m = /^\.agents\/rules\/([^/]+)\.md$/.exec(dest)) provides.rules.push(m[1]);
  else if (m = /^\.agents\/skills\/([^/]+)\//.exec(dest)) {
    if (!provides.skills.includes(m[1])) provides.skills.push(m[1]);
  } else if (m = /^\.agents\/roles\/([^/]+)\.md$/.exec(dest)) provides.roles.push(m[1]);
  else if (m = /^scripts\/guards\/([^/]+)\.sh$/.exec(dest)) provides.guards.push(m[1]);
  else if (dest.startsWith("scripts/")) provides.scripts.push(dest);
  else if (dest.startsWith(".agents/docs/_spec-templates/")) provides.templates.push(dest);
  else if (!dest.startsWith(`tools/${name}/`)) return false;
  return true;
}
function filesUnder(target, rel2) {
  const abs = import_node_path55.default.join(target, ...rel2.split("/"));
  const st = import_node_fs47.default.lstatSync(abs);
  if (st.isSymbolicLink()) throw usageError(`--from 은 링크를 받지 않는다: ${rel2}`);
  if (st.isFile()) return [rel2];
  return import_node_fs47.default.readdirSync(abs).sort(byteCompare).flatMap((n) => filesUnder(target, `${rel2}/${n}`));
}
function pickItem(target, rel2, id, key) {
  let doc;
  try {
    doc = JSON.parse(import_node_fs47.default.readFileSync(import_node_path55.default.join(target, ...rel2.split("/")), "utf8"));
  } catch (err) {
    throw usageError(`--from ${rel2}#${id}: 읽을 수 없다(${err instanceof Error ? err.message : String(err)})`);
  }
  const items = Array.isArray(doc[key]) ? doc[key] : [];
  const found = items.find((x) => x && x.id === id);
  if (!found) throw usageError(`--from ${rel2}#${id}: 그 id 가 없다`);
  return found;
}
function runPack(ctx) {
  const [sub2, name, ...rest] = ctx.positionals;
  if (sub2 !== "new") throw usageError("pack 하위 명령은 new 하나다", "harness-kit pack new <이름> --dir <경로> [--from <파일>[#id]]…");
  if (rest.length) throw usageError(`pack new: 위치 인자가 많다: ${rest.join(" ")}`);
  if (!name || !PACK_NAME.test(name)) throw usageError(`팩 이름은 ^[a-z][a-z0-9-]{1,30}$: ${name ?? "(없음)"}`);
  const dirFlag = str(ctx.values, "dir");
  if (!dirFlag) throw usageError("pack new 는 --dir <경로> 가 필요하다(빈 폴더나 없는 경로)");
  const target = targetOf(ctx);
  const dir = import_node_path55.default.resolve(ctx.io.cwd, dirFlag);
  const relToRepo = import_node_path55.default.relative(import_node_path55.default.join(target, ".agents"), dir);
  if (!relToRepo.startsWith("..") && !import_node_path55.default.isAbsolute(relToRepo)) throw usageError(`--dir 은 리포 .agents/ 안일 수 없다: ${dir}`);
  if (import_node_fs47.default.existsSync(dir) && (!import_node_fs47.default.statSync(dir).isDirectory() || import_node_fs47.default.readdirSync(dir).length)) throw usageError(`--dir 은 빈 폴더나 없는 경로다: ${dir}`);
  const inst = loadInstalled(target, "pack new");
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: ctx.io.env, cliFile: ctx.io.cliFile, cwd: ctx.io.cwd, version: VERSION });
  const layout2 = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout2, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout2, selection, inst.meta, ctx.io.env, target);
  const kitPaths2 = new Set(wanted({ layout: layout2, templatesDir: loc.dir, selection, tokens }).want.keys());
  const provides = { rules: [], skills: [], roles: [], guards: [], scripts: [], templates: [], hooks: [], verifyChecks: [] };
  const overrides = [];
  const warnings = [];
  const files = /* @__PURE__ */ new Map();
  const hooks = [];
  const checks = [];
  for (const raw of list(ctx.values, "from")) {
    const hash = raw.indexOf("#");
    const rel2 = (hash < 0 ? raw : raw.slice(0, hash)).replace(/\/+$/, "");
    if (!rel2 || rel2.startsWith("/") || rel2.split("/").includes("..")) throw usageError(`--from 은 리포 상대 경로다: ${raw}`);
    if (hash >= 0) {
      const id = raw.slice(hash + 1);
      if (/^\.agents\/hooks(\.json|\.d\/[^/]+\.json)$/.test(rel2)) {
        const item = { ...pickItem(target, rel2, id, "hooks") };
        const newId = id.startsWith(`harness-${name}-`) ? id : `harness-${name}-${id.replace(/^harness-/, "")}`;
        hooks.push({ ...item, id: newId, owner: `pack:${name}` });
        provides.hooks.push(newId);
        if (newId !== id) warnings.push(`훅 id ${id} → ${newId}`);
      } else if (/^\.agents\/verify-checks(\.json|\.d\/[^/]+\.json)$/.test(rel2)) {
        const item = { ...pickItem(target, rel2, id, "checks") };
        const newId = id.startsWith(`${name}-`) ? id : `${name}-${id}`;
        checks.push({ ...item, id: newId, owner: `pack:${name}` });
        provides.verifyChecks.push(newId);
        if (newId !== id) warnings.push(`검사 id ${id} → ${newId}`);
      } else throw usageError(`--from <파일>#<id> 는 .agents/hooks.json · hooks.d · verify-checks.json · verify-checks.d 에만 쓴다: ${raw}`);
      continue;
    }
    if (!import_node_fs47.default.existsSync(import_node_path55.default.join(target, ...rel2.split("/")))) throw usageError(`--from 파일이 없다: ${rel2}`);
    for (const f of filesUnder(target, rel2)) {
      const packPath = reverseMap(layout2, f);
      if (!packPath) throw usageError(`팩이 가질 수 없는 경로다(하네스 파일 · 루트 문서): ${f}`, "원본(.agents/ · scripts/)을 준다");
      if (kitPaths2.has(f)) {
        overrides.push(f);
        warnings.push(`${f} 는 킷 경로다 — overrides 에 넣었다(킷 판을 덮는다)`);
      } else if (!classify(f, provides, name)) throw usageError(`provides 로 나눌 수 없는 경로다: ${f}`, "규칙 · 스킬 · 역할 · 가드 · scripts · _spec-templates · tools/<팩>/ 만 옮긴다");
      const abs = import_node_path55.default.join(target, ...f.split("/"));
      files.set(packPath, { data: import_node_fs47.default.readFileSync(abs), executable: (import_node_fs47.default.statSync(abs).mode & 73) !== 0 });
    }
  }
  const range = str(ctx.values, "kit-range") ?? defaultRange();
  const prune = (p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v.length));
  const manifest = { schema: PACK_SCHEMA, name, version: "0.1.0", description: `${name} 팩`, requires: { kit: range }, provides: prune(provides), overrides, tokens: [] };
  const out = new Map([
    ["pack.json", { data: Buffer.from(`${JSON.stringify(manifest, null, 2)}
`), executable: false }],
    ["README.md", { data: Buffer.from(`# ${name} 하네스 팩

프로젝트의 \`.agents/harness-kit.json\` \`packs\` 에 \`git:<host>/<path>#v0.1.0\` 을 더하고 \`npx harness-kit update --packs\` 로 깐다.
`), executable: false }],
    ["fragments/hooks.json", { data: Buffer.from(`${JSON.stringify({ schema: "harness-kit.hooks/v1", hooks }, null, 2)}
`), executable: false }],
    ["fragments/verify-checks.json", { data: Buffer.from(`${JSON.stringify({ checks }, null, 2)}
`), executable: false }],
    ["tests/test_pack.py", { data: Buffer.from(TEST_PY), executable: false }],
    [".gitignore", { data: Buffer.from("__pycache__/\n"), executable: false }],
    ...files
  ]);
  try {
    import_node_fs47.default.mkdirSync(import_node_path55.default.join(dir, "common"), { recursive: true });
    for (const [rel2, f] of out) writeFileAtomic(import_node_path55.default.join(dir, ...rel2.split("/")), f.data, f.executable);
  } catch (err) {
    throw new CliError(EXIT.ENV, `팩 골격을 쓰지 못했다: ${err instanceof Error ? err.message : String(err)}`);
  }
  const lines = [
    `harness-kit pack new ${name} — ${dir}`,
    ...[...out.keys()].sort(byteCompare).map((p) => `  + ${p}`),
    ...warnings.map((w) => `  ⚠ ${w}`),
    "  다음:",
    `    cd ${dirFlag} && git init && git add -A && git commit -m "${name} 0.1.0" && git tag v0.1.0`,
    `    프로젝트 .agents/harness-kit.json packs 에 "git:<host>/<path>#v0.1.0" 을 더한다(MR)`,
    "    npx harness-kit update --packs"
  ];
  return { code: EXIT.OK, data: { command: "pack", sub: "new", name, dir, files: [...out.keys()].sort(byteCompare), manifest, warnings }, lines };
}

// src/commands/work.ts
var import_node_fs48 = __toESM(require("node:fs"));
var import_node_path56 = __toESM(require("node:path"));
var ISSUE_ROLE = /^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5}):([a-z][a-z0-9-]*)$/;
async function runDispatch(ctx) {
  const [sub2, id, extra] = ctx.positionals;
  if (sub2 === "list" && !id) {
    return run3(ctx, "GET", "/dispatch/queue", {}, (d) => {
      const items = d.items ?? [];
      return items.length ? items.map((i) => `${i.id} ${i.kind}${i.stale ? " · 24시간 넘음" : ""} — ${i.message.slice(0, 120)}`) : ["대기함이 비었다"];
    });
  }
  if (sub2 === "drop" && id && !extra) return run3(ctx, "DELETE", `/dispatch/queue/${id}`, {}, () => [`지웠다: ${id}`]);
  if (sub2 !== void 0) throw usageError("harness-kit dispatch --to … --kind … --path … | dispatch list | dispatch drop <id>");
  const to = str(ctx.values, "to");
  if (!to) throw usageError("--to <세션 id | 키:역할 | 세션 이름> 이 필요하다");
  const text2 = str(ctx.values, "text");
  const kind = str(ctx.values, "kind") ?? (text2 ? "custom" : "doc-changed");
  const m = ISSUE_ROLE.exec(to);
  const p = await openProject(ctx);
  const isSession = import_node_fs48.default.existsSync(import_node_path56.default.join(p.root, ".agents/state/sessions", `${to}.json`));
  const target = m ? { issue: m[1], role: m[2] } : isSession ? { sessionId: to } : { name: to };
  const via = str(ctx.values, "via");
  return run3(
    ctx,
    "POST",
    "/dispatch",
    { project: p, body: { target, kind, paths: list(ctx.values, "path"), text: text2, ...via ? { via } : {} } },
    (d) => d.method === "deeplink" ? [`deep link(새 터미널에서 Enter 는 사람이 누른다): ${String(d.url)}`] : d.method === "queue" ? [`대기함에 넣었다: ${String(d.id)} — 받는 세션의 다음 프롬프트 제출 때 보인다`] : ["세션 수신함 소켓에 보냈다(수신 확인 신호는 없다)"]
  );
}
function pair(s, flag) {
  const m = /^(U-\d+):(U-\d+)$/.exec(s);
  if (!m) throw usageError(`${flag} 는 U-a:U-b 다: ${s}`);
  return [m[1], m[2]];
}
async function runUnits(ctx) {
  const [sub2, intent, extra] = ctx.positionals;
  if (!intent || extra || sub2 !== "propose" && sub2 !== "discard") throw usageError("harness-kit units propose <INT> --add-dep U-a:U-b … | units discard <INT>");
  if (sub2 === "discard") return run3(ctx, "DELETE", `/units/proposals/${intent}`, {}, () => [`제안을 버렸다: ${intent}`]);
  const reason = str(ctx.values, "reason");
  const changes = [];
  const withReason = (c) => reason ? { ...c, reason } : c;
  for (const s of list(ctx.values, "add-dep")) {
    const [unit, dep] = pair(s, "--add-dep");
    changes.push(withReason({ op: "add-dep", unit, dependsOn: dep }));
  }
  for (const s of list(ctx.values, "remove-dep")) {
    const [unit, dep] = pair(s, "--remove-dep");
    changes.push(withReason({ op: "remove-dep", unit, dependsOn: dep }));
  }
  for (const s of list(ctx.values, "split")) {
    const m = /^(U-\d+)=(.+)$/.exec(s);
    if (!m) throw usageError(`--split 는 U-n=제목1|제목2 다: ${s}`);
    changes.push(withReason({ op: "split", unit: m[1], into: m[2].split("|").map((x) => x.trim()).filter(Boolean) }));
  }
  for (const s of list(ctx.values, "merge")) changes.push(withReason({ op: "merge", units: s.split(",").map((x) => x.trim()) }));
  const order = str(ctx.values, "order");
  if (order) changes.push(withReason({ op: "order", units: order.split(",").map((x) => x.trim()) }));
  if (!changes.length) throw usageError("바꿀 것이 없다(--add-dep · --remove-dep · --split · --merge · --order)");
  try {
    const p = await openProject(ctx);
    const co = await resolveIntentCheckout(p, intent);
    const raw = readUnitsFile(findIntent(co.root, intent).abs).raw;
    return run3(ctx, "POST", "/units/proposals", { project: p, body: { intent, baseSha256: raw ? sha2562(raw) : "", changes } }, (d) => [`제안을 저장했다: ${String(d.path)} (변경 ${String(d.changes)}건). units.json 은 intent 게이트 승인 때 바뀐다`]);
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}
async function runProjects(ctx) {
  const [sub2, arg, extra] = ctx.positionals;
  const home = homeOf(ctx);
  try {
    if ((sub2 === void 0 || sub2 === "list") && !arg) {
      const projects = new Projects(() => readRegistry(home), { env: ctx.io.env, home, readOnly: true, multi: true, deps: dashboardDeps() });
      const data = await projectsList(projects);
      const rows = data.projects;
      return { code: EXIT.OK, data, lines: rows.length ? rows.map((r) => `${r.name.padEnd(24)} ${r.state === "ok" ? "" : `(${r.state}) `}${r.path}`) : ["등록한 프로젝트가 없다"] };
    }
    if (sub2 === "add" && arg && !extra) {
      const r = addProject(home, import_node_path56.default.resolve(ctx.io.cwd, arg), today(ctx.io));
      return { code: EXIT.OK, data: { added: r.added, project: r.entry }, lines: [r.added ? `등록했다: ${r.entry.name} ${r.entry.path}` : `이미 있다: ${r.entry.name}`] };
    }
    if (sub2 === "remove" && arg && !extra) {
      const r = removeProject(home, arg);
      return { code: EXIT.OK, data: { removed: r.removed }, lines: r.removed.map((e) => `등록부에서 뺐다: ${e.name} ${e.path}`) };
    }
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
  throw usageError("harness-kit projects list | add <폴더> | remove <이름|경로>");
}

// src/main.ts
var COMMANDS = {
  init: runInit,
  plan: runInit,
  add: runAdd,
  remove: runRemove,
  update: runUpdate,
  outdated: runOutdated,
  repair: runRepair,
  uninstall: runUninstall,
  doctor: runDoctor,
  list: runList,
  dashboard: runDashboard,
  status: runStatus,
  projects: runProjects,
  approve: runApprove,
  answer: runAnswer,
  review: runReview,
  sessions: runSessions,
  dispatch: runDispatch,
  units: runUnits,
  flow: runFlow,
  quality: runQuality,
  history: runHistory,
  pack: runPack,
  local: runLocal
};
var USAGE = `harness-kit ${VERSION} — 하네스 엔지니어링 스타터 킷

사용법: harness-kit <명령> [플래그]

명령:
  init       킷을 리포에 설치한다(질문 또는 플래그)
  plan       설치할 작업 목록만 출력한다(쓰지 않는다)
  add        하네스 · 모듈을 켜고 그 몫만 깐다(예: add codex jira-workflow)
  remove     하네스 · 모듈을 끄고 고치지 않은 그 몫만 지운다
  update     킷을 새 판으로 올린다. 사람이 고친 파일은 <경로>.new 로 받는다
  outdated   설치 · CLI · 소스 최신 태그 판을 비교한다. --check 면 새 판이 있을 때 exit 1
  repair     지워진 킷 파일을 같은 판으로 되살린다. 고친 파일은 그대로 둔다
  uninstall  킷 소유이면서 고치지 않은 파일을 지운다
  doctor     설치 상태를 점검한다(읽기만). --check 면 오류가 있을 때 exit 1
  list       설치 요약. --files 면 lock 항목
  dashboard  관리 페이지 서버(127.0.0.1). --export <폴더> 는 정적 HTML, --all · --root · --workspace 는 여러 프로젝트
  status     처리할 일 · 이슈 · 문서 · 검증 · 흐름(--json 은 관리 페이지 API 와 같다)
  approve    사람 터미널 승인(approvals.md 에 덧붙인다). answer 질문 답 · review show|decide 리뷰 판단
  sessions   켜 둔 세션. dispatch 세션에 작업 요청(사람이 고를 때만) · dispatch list|drop 대기함
  units      Unit 변경 제안(propose · discard). flow gates 흐름 틀 · quality 품질 결과 · projects 등록부
  pack       pack new <이름> --dir <경로> --from <파일>… — 프로젝트 파일로 회사 팩 골격을 만든다
  local      local sync | list — 개인 층(.agents/local/)을 하네스 폴더에 배치한다(공유 lock 밖)

공통 플래그: --cwd <폴더> --dry-run --yes --json --templates <폴더> --quiet --no-color --help
init · plan: --stack --arch --domain --lang --agents <목록|all> --modules <목록|all|none>
             --name --slug --package-ns --protected-path --token KEY=VALUE --issue-source kit|jira
             --issue-prefix --base --adopt --force
add · remove: <이름>…(하네스 claude codex cursor kiro · 모듈 jira-workflow multi-harness)
dashboard: --port --open --read-only --export <폴더> --all --root <dir> --workspace <file> · 관리 페이지 명령은 harness-kit <명령> --help
update: --accept-all --prune --forget <경로>(반복) --to <CLI 버전> --packs(메타 packs 의 팩만 받아 깐다) · outdated: --check --source <git 원격>
repair: --only missing,drifted,stale,merge · uninstall: --keep-state --keep-packs
종료 코드: 0 성공 · 1 검사 문제 · 2 사용법 · 3 리포 상태 · 4 사람 판단 필요 · 5 실행 환경 · 130 중단
`;
var COMMAND_HELP = {
  init: "harness-kit init [--stack S] [--arch A] [--agents claude,codex|all] [--modules m1,m2|all|none] [--yes] [--dry-run] [--json]\n",
  plan: "harness-kit plan [init 과 같은 플래그] — 작업 목록만 출력한다\n",
  doctor: "harness-kit doctor [--check] [--only 종류,…] [--json] — 종류: meta-invalid lock-invalid lock-v1 version-mismatch missing drifted gitignore entry-size\n",
  list: "harness-kit list [--files] [--json]\n",
  add: "harness-kit add <하네스|모듈>… [--dry-run] [--json] — 그 몫만 깐다. 사람이 고친 매니페스트는 .new 로 받고 exit 4\n",
  remove: "harness-kit remove <하네스|모듈>… [--dry-run] [--json] — 고치지 않은 그 몫만 지운다. 고친 파일을 남기면 exit 4\n",
  outdated: "harness-kit outdated [--check] [--source <git 원격|경로>] [--json] — 소스: --source > HARNESS_KIT_SOURCE > lock kit.source. 닿지 못하면 '확인 못 함' 과 exit 0\n",
  update: "harness-kit update [--dry-run] [--accept-all] [--prune] [--forget 경로]… [--to 버전] [--templates 폴더] [--json] — conflict 가 있으면 exit 4. update --packs 는 팩만(검사 실패 exit 3 · 팩 충돌 exit 4)\n",
  repair: "harness-kit repair [--dry-run] [--only missing,drifted,stale,merge] [--json] — 되살리지 못한 missing 이 있으면 exit 4\n",
  uninstall: "harness-kit uninstall [--dry-run] [--yes] [--keep-state] [--keep-packs] [--json] — 고친 파일을 남기면 exit 4. TTY 가 아니면 --yes\n",
  dashboard: "harness-kit dashboard [--port <n>] [--open] [--read-only] [--export <폴더>] [--all | --root <dir> | --workspace <file>] — 127.0.0.1 에만 연다. 주소는 stdout, 승인 PIN 은 stderr\n",
  status: "harness-kit status [--session | --intents | --intent <INT> | --issues [--area --stage --intent] | --issue <키> | --doc <경로> | --verify [--issue] | --worktrees | --harness | --flow <INT> | --all] [--json]\n",
  projects: "harness-kit projects list | add <폴더> | remove <이름|경로> [--json] — 등록부 ~/.config/harness-kit/projects.json\n",
  approve: 'harness-kit approve <키> --gate <게이트> --phrase "<문구>" [--changes-requested [--rule-candidate]] [--json] — 사람 터미널에서만(에이전트 세션 · TTY 아님은 exit 3)\n',
  answer: "harness-kit answer <INT|키> --list | <Q-n> --choice <A-D|other> [--text …] [--json] — 사람 터미널에서만\n",
  review: "harness-kit review show <키> | review decide <키> <F-n> --fix|--accept-risk --reason … [--json] — decide 는 사람 터미널에서만\n",
  sessions: "harness-kit sessions [--machine] [--json]\n",
  dispatch: "harness-kit dispatch --to <세션 id|키:역할|이름> --kind <종류> --path <파일>… [--text …] [--via socket|deeplink|queue] | dispatch list | dispatch drop <id>\n",
  units: "harness-kit units propose <INT> --add-dep U-a:U-b | --remove-dep U-a:U-b | --split U-n=제목1|제목2 | --merge U-a,U-b | --order U-a,U-b [--reason …] | units discard <INT>\n",
  flow: "harness-kit flow gates [--add <게이트> --after <게이트> | --remove <게이트>] [--json]\n",
  quality: "harness-kit quality [--findings [--issue <키>] [--severity S] [--new]] [--json]\n",
  history: "harness-kit history [--q …] [--json] — ~/.config/harness-kit/config.json 의 history 가 on 일 때만(HK-18)\n",
  pack: 'harness-kit pack new <이름> --dir <경로> [--from <파일|폴더>[#훅·검사 id]]… [--kit-range ">=2.0.0 <3.0.0"] [--json] — --dir 은 빈 폴더나 없는 경로\n',
  local: "harness-kit local sync [--dry-run] | local list [--json] — 개인 스킬 · Kiro 규칙 · 개인 훅(.claude/settings.local.json · .kiro/hooks/local-*). 공유 원본과 이름이 같으면 배치하지 않는다\n"
};
function emitError(io2, command, err, json) {
  if (json) {
    const error = { code: err.code, message: err.message };
    if (err.hint) error.hint = err.hint;
    io2.stdout(formatJson({ command, error }));
  } else {
    io2.stderr(`✖ ${err.message}
`);
    if (err.hint) io2.stderr(`  ${err.hint}
`);
  }
  return err.code;
}
function commandOf2(argv, first, command) {
  if (argv.length === 0) throw usageError("명령이 없다", USAGE.trimEnd());
  if (command === "") throw usageError(`명령이 먼저 온다: ${first}`, "harness-kit --help");
  if (Object.hasOwn(RESERVED, command)) {
    throw usageError(`'${command}' 는 아직 없다 — ${RESERVED[command]}에서 제공한다`, `지금 있는 명령: ${Object.keys(COMMANDS).join(" · ")}`);
  }
  if (!Object.hasOwn(COMMANDS, command)) throw usageError(`모르는 명령: ${command}`, "harness-kit --help");
  return COMMANDS[command];
}
async function main(argv, io2) {
  const json = argv.includes("--json");
  const first = argv[0] ?? "";
  const command = first.startsWith("-") ? "" : first;
  if (nodeTooOld(io2.nodeVersion)) {
    return emitError(io2, command, new CliError(EXIT.ENV, `Node ${MIN_NODE_TEXT} 이상이 필요하다(지금 v${io2.nodeVersion.replace(/^v/, "")})`, "Node 가 없으면 플러그인의 setup.sh 로 설치한다"), json);
  }
  if (first === "--version" || first === "-v") {
    io2.stdout(`${VERSION}
`);
    return EXIT.OK;
  }
  if (first === "--help" || first === "-h") {
    io2.stdout(USAGE);
    return EXIT.OK;
  }
  try {
    const run4 = commandOf2(argv, first, command);
    const { values, positionals } = parseCommandArgs(command, argv.slice(1));
    if (bool(values, "help")) {
      io2.stdout(Object.hasOwn(COMMAND_HELP, command) ? COMMAND_HELP[command] : USAGE);
      return EXIT.OK;
    }
    const ctx = { io: io2, command, values, positionals, json, quiet: bool(values, "quiet") };
    const result = await run4(ctx);
    if (json) io2.stdout(formatJson(result.data));
    else io2.stdout(`${result.lines.join("\n")}
`);
    return result.code;
  } catch (err) {
    if (err instanceof CliError) return emitError(io2, command, err, json);
    const message2 = err instanceof Error ? err.message : String(err);
    emitError(io2, command, new CliError(1, `내부 오류: ${message2}`), json);
    if (!json && err instanceof Error && err.stack) io2.stderr(`${err.stack}
`);
    return 1;
  }
}

// src/cli.ts
var io = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  env: process.env,
  cwd: process.cwd(),
  cliFile: __filename,
  isTTY: import_node_tty.default.isatty(0) && import_node_tty.default.isatty(1),
  nodeVersion: process.versions.node,
  // 질문할 때만 stdin 을 연다(파이프 stdin 을 만들지 않는다).
  get stdin() {
    return process.stdin;
  }
};
process.stdout.on("error", (err) => {
  if (err.code === "EPIPE") process.exit(process.exitCode ?? 0);
  throw err;
});
main(process.argv.slice(2), io).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`✖ 내부 오류: ${err instanceof Error ? err.stack ?? err.message : String(err)}
`);
    process.exitCode = 1;
  }
);
