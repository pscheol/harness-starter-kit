#!/usr/bin/env node
// harness-kit 2.0.0-alpha.0 · src-sha256 1be7cc4050d94a5887421c8c55c56a677b61168d92f5cb3104035b1b7b95387c · 생성물(packages/cli/build.mjs) — 손으로 고치지 않는다
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
  constructor(code, message, hint) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.hint = hint;
  }
};
function usageError(message, hint) {
  return new CliError(EXIT.USAGE, message, hint);
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
  uninstall: { "keep-state": { type: "boolean" }, "keep-packs": { type: "boolean" } }
};
function parseCommandArgs(command, argv) {
  const options = { ...COMMON, ...COMMAND_OPTIONS[command] ?? {} };
  try {
    const { values } = (0, import_node_util.parseArgs)({ args: argv, options, strict: true, allowPositionals: false });
    return values;
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

// src/commands/doctor.ts
var import_node_fs8 = __toESM(require("node:fs"));
var import_node_path6 = __toESM(require("node:path"));

// src/cli/context.ts
var import_node_path = __toESM(require("node:path"));
function targetOf(ctx) {
  const cwd = ctx.values.cwd;
  return import_node_path.default.resolve(ctx.io.cwd, typeof cwd === "string" ? cwd : ".");
}
function today(io2) {
  if (io2.today) return io2.today;
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// src/core/fsx.ts
var import_node_crypto = __toESM(require("node:crypto"));
var import_node_fs = __toESM(require("node:fs"));
var import_node_path2 = __toESM(require("node:path"));
function byteCompare(a, b) {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
function walkFiles(dir) {
  const out = [];
  const walk = (d, prefix) => {
    for (const name of import_node_fs.default.readdirSync(d)) {
      const full7 = import_node_path2.default.join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = import_node_fs.default.lstatSync(full7);
      if (st.isDirectory()) walk(full7, rel);
      else if (st.isFile()) out.push(rel);
    }
  };
  walk(dir, "");
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
  const rel = import_node_path2.default.relative(parent, child);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${import_node_path2.default.sep}`) && !import_node_path2.default.isAbsolute(rel);
}
function writeFileAtomic(dest, data, executable) {
  const dir = import_node_path2.default.dirname(dest);
  import_node_fs.default.mkdirSync(dir, { recursive: true });
  const tmp = import_node_path2.default.join(dir, `.${import_node_path2.default.basename(dest)}.hk-${import_node_crypto.default.randomBytes(4).toString("hex")}`);
  try {
    import_node_fs.default.writeFileSync(tmp, data, { mode: executable ? 511 : 438, flag: "wx" });
    import_node_fs.default.renameSync(tmp, dest);
  } catch (err) {
    import_node_fs.default.rmSync(tmp, { force: true });
    throw err;
  }
}

// src/core/hash.ts
var import_node_crypto2 = __toESM(require("node:crypto"));
var import_node_fs2 = __toESM(require("node:fs"));
function sha256(data) {
  return import_node_crypto2.default.createHash("sha256").update(data).digest("hex");
}
function sha256File(file) {
  return sha256(import_node_fs2.default.readFileSync(file));
}

// src/core/lock.ts
var import_node_fs3 = __toESM(require("node:fs"));

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
var OPS = /* @__PURE__ */ new Set(["copy", "mirror", "render", "merge", "none"]);
var ENTRY_ORDER = ["path", "op", "owner", "sha256", "layer", "from", "fromSha256", "keys"];
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
function parseV1(text) {
  const seen = /* @__PURE__ */ new Map();
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].replace(/\r$/, "");
    if (line === "" || line.startsWith("#")) continue;
    const cols = line.split("	");
    if (cols.length !== 4 || cols.some((c) => c === "")) throw new Error(`v1 lock ${i + 1}번째 줄: 칸이 4개가 아니다`);
    const [sha, label, , rel] = cols;
    const layer = v1LabelToLayer(label);
    const prev = seen.get(rel);
    seen.set(rel, { path: rel, op: "copy", owner: "kit", sha256: prev ? prev.sha256 ?? null : sha === "-" ? null : sha, layer });
  }
  const entries = [...seen.keys()].sort(byteCompare).map((p) => seen.get(p));
  return { schema: LOCK_SCHEMA, kit: { version: null, source: null }, packs: [], entries };
}
function parseV2(text) {
  const raw = JSON.parse(text);
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
function parseLockText(text) {
  if (text.startsWith(V1_HEADER)) return { format: "v1", lock: parseV1(text) };
  if (text.trim() === "") throw new Error("비어 있다");
  return { format: "v2", lock: parseV2(text) };
}
function readLock(file) {
  let text;
  try {
    text = import_node_fs3.default.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { status: "missing" };
    return { status: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
  try {
    return { status: "ok", ...parseLockText(text) };
  } catch (err) {
    return { status: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
}

// src/core/meta.ts
var import_node_fs4 = __toESM(require("node:fs"));
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
    issueKey: { source: args.issue.source ?? "kit", prefix: args.issue.prefix ?? slug.toUpperCase() },
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
    issueKey: isObj(m.issueKey) ? m.issueKey : { source: "kit", prefix: slug.toUpperCase() },
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
    issueKey: isObj(m.issueKey) ? m.issueKey : { source: "kit", prefix: slug.toUpperCase() },
    git: { base: DEFAULT_BASE, ...isObj(m.git) ? m.git : {} },
    packs: Array.isArray(m.packs) ? m.packs : [],
    verify: { fullOnlyInCI: true, ...isObj(m.verify) ? m.verify : {} },
    tokens,
    installedAt: isStr(m.installedAt) ? m.installedAt : "",
    updatedAt: isStr(m.updatedAt) ? m.updatedAt : ""
  };
}
function readMeta(file) {
  let text;
  try {
    text = import_node_fs4.default.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { status: "missing" };
    return { status: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
  let raw;
  try {
    raw = JSON.parse(text);
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
var import_node_fs7 = __toESM(require("node:fs"));
var import_node_path5 = __toESM(require("node:path"));

// src/core/layout.ts
var import_node_fs5 = __toESM(require("node:fs"));
var import_node_path3 = __toESM(require("node:path"));
var LAYOUT_SCHEMA = "harness-kit.layout/v1";
function bad(message) {
  return new CliError(EXIT.ENV, `layout.json 형식 오류: ${message}`);
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
  const file = import_node_path3.default.join(templatesDir, "layout.json");
  let text;
  try {
    text = import_node_fs5.default.readFileSync(file, "utf8");
  } catch {
    throw new CliError(EXIT.ENV, `layout.json 이 없다: ${file}`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw bad(err instanceof Error ? err.message : String(err));
  }
  return parseLayout(raw);
}
function matchSegment(layout, rel) {
  for (const seg of layout.segments) {
    const prefix = seg.from === "" || seg.from.endsWith("/");
    if (prefix ? rel.startsWith(seg.from) : rel === seg.from) return seg;
  }
  throw bad(`어느 세그먼트에도 맞지 않는다: ${rel} (마지막 세그먼트는 from "" 이어야 한다)`);
}
function applyPathTokens(layout, rel, tokens) {
  let out = rel;
  for (const [needle, key] of Object.entries(layout.pathTokens)) {
    const value = tokens[key] ?? "";
    if (value !== "") out = out.split(needle).join(value);
  }
  return out;
}
function mapPath(layout, rel, tokens) {
  const seg = matchSegment(layout, rel);
  const dest = seg.from.endsWith("/") || seg.from === "" ? seg.to + rel.slice(seg.from.length) : seg.to;
  return { dest: applyPathTokens(layout, dest, tokens), harness: seg.harness };
}
function isExecutable(layout, dest) {
  return layout.executableRe.some((re) => re.test(dest));
}
function stackSpecOf(layout, stack) {
  return layout.stacks[stack] ?? layout.stackFallback;
}

// src/core/resolve.ts
var import_node_fs6 = __toESM(require("node:fs"));
var import_node_path4 = __toESM(require("node:path"));
function fill(dir, vars) {
  return dir.replace(/\{([a-z]+)\}/g, (_m, k) => vars[k] ?? "");
}
function layerDirs(layout, templatesDir, sel) {
  const out = [];
  for (const spec of layout.layers) {
    const instances = spec.each === "modules" ? sel.modules : [null];
    for (const m of instances) {
      if (spec.dir.includes("{domain}") && sel.domain === "") continue;
      const dir = fill(spec.dir, { stack: sel.stack, arch: sel.arch, domain: sel.domain, module: m ?? "" });
      if (!isDir(import_node_path4.default.join(templatesDir, dir))) {
        if (spec.whenExists) continue;
        throw new CliError(EXIT.ENV, `템플릿 레이어 폴더가 없다: ${import_node_path4.default.join(templatesDir, dir)}`);
      }
      out.push({ dir, exclude: spec.exclude.map(globToRegExp) });
    }
  }
  return out;
}
function resolveCandidates(layout, templatesDir, sel, tokens) {
  const byDest = /* @__PURE__ */ new Map();
  let excludedByHarness = 0;
  const ignore = new Set(layout.ignore);
  for (const { dir, exclude } of layerDirs(layout, templatesDir, sel)) {
    for (const rel of walkFiles(import_node_path4.default.join(templatesDir, dir))) {
      if (ignore.has(import_node_path4.default.posix.basename(rel))) continue;
      if (exclude.some((re) => re.test(rel))) continue;
      const { dest, harness } = mapPath(layout, rel, tokens);
      if (harness !== null && !sel.agents.includes(harness)) {
        excludedByHarness += 1;
        continue;
      }
      const list2 = byDest.get(dest) ?? [];
      list2.push({ dest, src: `${dir}/${rel}`, layer: dir, harness });
      byDest.set(dest, list2);
    }
  }
  const winners = [];
  const overlaps = [];
  for (const dest of [...byDest.keys()].sort(byteCompare)) {
    const list2 = byDest.get(dest);
    const winner = layout.overlap === "first" ? list2[0] : list2[list2.length - 1];
    winners.push(winner);
    if (list2.length > 1) overlaps.push({ path: dest, layers: list2.map((c) => c.layer), winner: winner.layer });
  }
  return { winners, overlaps, excludedByHarness };
}
function readTemplate(templatesDir, src) {
  return import_node_fs6.default.readFileSync(import_node_path4.default.join(templatesDir, ...src.split("/")));
}

// src/core/tokens.ts
function resolveTokens(layout, sel, src) {
  const spec = stackSpecOf(layout, sel.stack);
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
    if (v === void 0 && layout.tokenDefaults[key] !== void 0) {
      v = layout.tokenDefaults[key].replace(
        /\{([A-Za-z_]+)\}/g,
        (_m, name) => name === "targetBasename" ? src.targetBasename : valueFor(name)
      );
    }
    resolving.delete(key);
    const out = v ?? "";
    done.set(key, out);
    return out;
  };
  return Object.fromEntries(layout.tokens.map((k) => [k, valueFor(k)]));
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
function substitute(content, tokens, order) {
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
function existing(full7) {
  const st = lstatOrNull(full7);
  if (!st) return { kind: "none" };
  if (st.isSymbolicLink()) return { kind: "other", what: "링크다" };
  if (st.isDirectory()) return { kind: "other", what: "같은 이름의 폴더가 있다" };
  if (!st.isFile()) return { kind: "other", what: "일반 파일이 아니다" };
  return { kind: "file", bytes: import_node_fs7.default.readFileSync(full7), executable: (st.mode & 64) !== 0 };
}
function decide(cur, content, executable, mode) {
  if (cur.kind === "none") return { action: "create" };
  if (cur.kind === "other") return { action: "skip-user", reason: cur.what };
  const same = cur.bytes.equals(content);
  if (mode.adopt) return { action: "skip-user", reason: "--adopt" };
  if (mode.force) return same && cur.executable === executable ? { action: "same" } : { action: "replace" };
  return same ? { action: "same" } : { action: "skip-user", reason: "사람이 둔 파일이다" };
}
var AncestorCheck = class {
  constructor(target, targetReal) {
    this.target = target;
    this.targetReal = targetReal;
  }
  target;
  targetReal;
  cache = /* @__PURE__ */ new Map();
  state(rel) {
    let cur = this.target;
    for (const part of rel.split("/").slice(0, -1)) {
      cur = import_node_path5.default.join(cur, part);
      const known = this.cache.get(cur) ?? this.inspect(cur, rel);
      this.cache.set(cur, known);
      if (known === "missing") return "ok";
      if (known === "blocked") return "blocked";
    }
    return "ok";
  }
  inspect(dir, rel) {
    const st = lstatOrNull(dir);
    if (!st) return "missing";
    if (st.isDirectory()) return "ok";
    if (!st.isSymbolicLink()) return "blocked";
    let real;
    try {
      real = import_node_fs7.default.realpathSync(dir);
    } catch {
      throw new CliError(EXIT.STATE, `설치 경로의 상위 폴더가 끊어진 링크다: ${rel}`, `${dir} 를 확인한다`);
    }
    if (!isInside(real, this.targetReal)) {
      throw new CliError(EXIT.STATE, `설치 경로가 링크를 따라 리포 밖으로 나간다: ${rel}`, `${dir} → ${real}`);
    }
    return import_node_fs7.default.statSync(dir).isDirectory() ? "ok" : "blocked";
  }
};
var BLOCKED = "상위 경로가 폴더가 아니다";
function manifestPlan(target, ancestors, content, adopt) {
  if (ancestors?.state(MANIFEST_PATH) === "blocked") return { path: MANIFEST_PATH, action: "skip-user", content };
  const cur = ancestors ? existing(import_node_path5.default.join(target, ...MANIFEST_PATH.split("/"))) : { kind: "none" };
  if (cur.kind === "none") return { path: MANIFEST_PATH, action: "create", content };
  if (adopt || cur.kind === "other") return { path: MANIFEST_PATH, action: "skip-user", content };
  return { path: MANIFEST_PATH, action: cur.bytes.equals(content) ? "same" : "replace", content };
}
function buildPlan(args) {
  const { layout, templatesDir, target, selection, tokens, mode } = args;
  const res = resolveCandidates(layout, templatesDir, selection, tokens);
  const ancestors = import_node_fs7.default.existsSync(target) ? new AncestorCheck(target, import_node_fs7.default.realpathSync(target)) : null;
  const ops = res.winners.map((c) => {
    assertSafeRelPath(c.dest);
    const content = substitute(readTemplate(templatesDir, c.src), tokens, layout.tokens);
    const executable = isExecutable(layout, c.dest);
    const blocked = ancestors?.state(c.dest) === "blocked";
    const cur = !ancestors || blocked ? { kind: "none" } : existing(import_node_path5.default.join(target, ...c.dest.split("/")));
    const { action, reason } = blocked ? { action: "skip-user", reason: BLOCKED } : decide(cur, content, executable, mode);
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
  return { target, ops, overlaps: res.overlaps, excludedByHarness: res.excludedByHarness, generated, counts: counts2 };
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

// src/commands/doctor.ts
var DOCTOR_KINDS = ["meta-invalid", "lock-invalid", "lock-v1", "version-mismatch", "missing", "drifted", "gitignore", "entry-size"];
var GITIGNORE_NEEDS = [".agents/state/", ".agents/local/", ".agents/reports/"];
var ENTRY_FILES = ["AGENTS.md", "CLAUDE.md"];
var ENTRY_LIMIT = 24 * 1024;
function versionFindings(meta, lock) {
  const out = [];
  const installed = meta && meta.kit.version !== "unknown" ? meta.kit.version : null;
  if (installed) {
    const cmp = compareSemver(installed, VERSION);
    if (cmp === null || cmp !== 0) {
      const newer = cmp !== null && cmp > 0;
      out.push({
        kind: "version-mismatch",
        severity: newer ? "error" : "warn",
        path: META_REL,
        hint: newer ? `설치된 킷(${installed})이 이 CLI(${VERSION})보다 새것이다. 새 CLI 로 다시 실행한다` : `설치 ${installed} · CLI ${VERSION}. 킷을 올리려면 harness-kit update`,
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
function fileState(full7, sha) {
  const st = lstatOrNull(full7);
  if (!st || !st.isFile()) return "missing";
  try {
    return sha && sha256File(full7) === sha ? "ok" : "drifted";
  } catch (err) {
    return { unreadable: err.code ?? String(err) };
  }
}
function copyFindings(target, lock) {
  let ok = 0;
  const findings = [];
  const unsafe = [];
  for (const e of lock.entries) {
    if (!isSafeRelPath(e.path)) {
      unsafe.push(e.path);
      continue;
    }
    if (e.op !== "copy" || e.owner !== "kit") continue;
    const state = fileState(import_node_path6.default.join(target, ...e.path.split("/")), e.sha256);
    if (state === "ok") ok += 1;
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
  return { ok, findings };
}
function gitignoreFinding(target) {
  let lines = [];
  try {
    lines = import_node_fs8.default.readFileSync(import_node_path6.default.join(target, ".gitignore"), "utf8").split(/\r?\n/).map((l) => l.trim());
  } catch {
    lines = [];
  }
  const has = (want) => {
    const bare = want.replace(/\/$/, "");
    return [want, bare, `/${want}`, `/${bare}`].some((v) => lines.includes(v));
  };
  const missing = GITIGNORE_NEEDS.filter((w) => !has(w));
  if (missing.length === 0) return null;
  return { kind: "gitignore", severity: "warn", path: ".gitignore", hint: `커밋하지 않는 폴더 ${missing.join(" · ")} 를 넣는다`, detail: { missing } };
}
function entrySizeFinding(target) {
  let bytes = 0;
  for (const f of ENTRY_FILES) {
    const st = lstatOrNull(import_node_path6.default.join(target, f));
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
function collect(target) {
  const metaRead = readMeta(import_node_path6.default.join(target, META_REL));
  if (metaRead.status === "missing") {
    throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, "설치는 harness-kit init");
  }
  const findings = [];
  const meta = metaRead.status === "ok" ? metaRead.meta : null;
  if (metaRead.status === "invalid") findings.push({ kind: "meta-invalid", severity: "error", path: META_REL, hint: metaRead.error });
  const lockRead = readLock(import_node_path6.default.join(target, LOCK_REL));
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
  for (const f of [gitignoreFinding(target), entrySizeFinding(target)]) if (f) findings.push(f);
  return { meta, lock, ok: copy.ok, findings };
}
function summarize(findings, ok) {
  const count = (pred) => findings.filter(pred).length;
  return {
    ok,
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
  const only = parseOnly(str(ctx.values, "only"));
  const c = collect(target);
  const findings = only ? c.findings.filter((f) => only.includes(f.kind)) : c.findings;
  const summary = summarize(findings, c.ok);
  const code = bool(ctx.values, "check") && (summary.errors ?? 0) > 0 ? EXIT.CHECK : EXIT.OK;
  const kit = { installed: c.meta?.kit.version ?? null, lock: c.lock?.kit.version ?? null, cli: VERSION };
  const lines = [
    `harness-kit doctor — ${target}`,
    `  킷: 설치 ${kit.installed ?? "?"} · lock ${kit.lock ?? "?"} · CLI ${kit.cli}`,
    `  copy 항목: ok ${summary.ok} · drifted ${summary.drifted} · missing ${summary.missing}`,
    `  오류 ${summary.errors} · 경고 ${summary.warnings} · 정보 ${summary.infos}`,
    ...ctx.quiet ? [] : findings.map(findingLine)
  ];
  return { code, data: { command: "doctor", target, kit, summary, findings }, lines };
}

// src/commands/init.ts
var import_node_fs12 = __toESM(require("node:fs"));
var import_node_path10 = __toESM(require("node:path"));

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

// src/core/apply.ts
var import_node_child_process = require("node:child_process");
var import_node_fs9 = __toESM(require("node:fs"));
var import_node_path7 = __toESM(require("node:path"));
var FEATURE_DOCS = "tools/docs/feature_docs.py";
function full(target, rel) {
  return import_node_path7.default.join(target, ...rel.split("/"));
}
function featureDocsAllowed(plan) {
  const docs = plan.ops.filter((o) => o.path.startsWith(`${import_node_path7.default.posix.dirname(FEATURE_DOCS)}/`));
  return docs.some((o) => o.path === FEATURE_DOCS) && docs.every((o) => o.owner === "kit");
}
function buildFeatureDocs(target, env) {
  if (!import_node_fs9.default.existsSync(full(target, FEATURE_DOCS))) return { status: "skipped", reason: `${FEATURE_DOCS} 없음` };
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
  let current3 = "";
  try {
    current3 = target;
    import_node_fs9.default.mkdirSync(target, { recursive: true });
    for (const op of plan.ops) {
      if (op.action !== "create" && op.action !== "replace") continue;
      current3 = op.path;
      writeFileAtomic(full(target, op.path), op.content, op.executable);
      written += 1;
    }
    for (const g of plan.generated) {
      if (g.action !== "create" && g.action !== "replace") continue;
      current3 = g.path;
      writeFileAtomic(full(target, g.path), g.content, false);
    }
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current3}`);
  }
  const featureDocs = featureDocsAllowed(plan) ? buildFeatureDocs(target, env) : { status: "skipped", reason: "tools/docs/ 에 킷 판이 아닌 파일이 있다" };
  try {
    current3 = LOCK_REL;
    writeFileAtomic(full(target, LOCK_REL), Buffer.from(lockText2, "utf8"), false);
    current3 = META_REL;
    writeFileAtomic(full(target, META_REL), Buffer.from(metaText, "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current3}`);
  }
  return { written, featureDocs };
}

// src/core/selection.ts
var import_node_fs10 = __toESM(require("node:fs"));
var import_node_path8 = __toESM(require("node:path"));
function subdirs(dir) {
  if (!isDir(dir)) return [];
  return import_node_fs10.default.readdirSync(dir).filter((n) => isDir(import_node_path8.default.join(dir, n))).sort();
}
function listStacks(templatesDir) {
  return subdirs(import_node_path8.default.join(templatesDir, "stacks"));
}
function listArchs(templatesDir, stack) {
  return subdirs(import_node_path8.default.join(templatesDir, "stacks", stack, "arch"));
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
function detectHarnesses(layout, target, env) {
  const byDir = layout.harnesses.filter((h) => (layout.harnessDetect[h]?.dirs ?? []).some((d) => isDir(import_node_path8.default.join(target, d))));
  if (byDir.length) return byDir;
  return layout.harnesses.filter((h) => (layout.harnessDetect[h]?.env ?? []).some((v) => (env[v] ?? "") !== ""));
}
function resolveSelection(layout, templatesDir, input, ctx) {
  const stacks = listStacks(templatesDir);
  const stack = input.stack ?? layout.defaultStack;
  if (!stacks.includes(stack)) throw usageError(`알 수 없는 스택: '${stack}'`, `사용 가능: ${stacks.join(" ")}`);
  const spec = stackSpecOf(layout, stack);
  const archs = listArchs(templatesDir, stack);
  const arch = input.arch ?? spec.defaultArch;
  if (!archs.includes(arch)) throw usageError(`스택 '${stack}' 에 없는 아키텍처 변형: '${arch}'`, `사용 가능: ${archs.join(" ")}`);
  const domain = input.domain ?? spec.domain ?? "";
  if (domain !== "" && !layout.domains.includes(domain)) {
    throw usageError(`알 수 없는 도메인: '${domain}'`, `사용 가능: ${layout.domains.join(" ")}`);
  }
  let lang = null;
  if (input.lang !== void 0) {
    const withLang = Object.keys(layout.stacks).filter((s) => layout.stacks[s]?.lang);
    if (!spec.lang) throw usageError(`--lang 은 이 스택에서 쓰지 않는다: '${stack}'`, `--lang 을 받는 스택: ${withLang.join(" ")}`);
    if (!(input.lang in spec.lang)) throw usageError(`알 수 없는 --lang: '${input.lang}'`, `사용 가능: ${Object.keys(spec.lang).join(" ")}`);
    lang = input.lang;
  }
  let agents;
  let agentsOrigin;
  if (input.agents !== void 0) {
    agents = parseList(input.agents, layout.harnesses, "하네스", false);
    agentsOrigin = "flag";
  } else {
    agents = detectHarnesses(layout, ctx.target, ctx.env);
    agentsOrigin = "detected";
    if (agents.length === 0) {
      agents = [...layout.defaultHarnesses];
      agentsOrigin = "default";
    }
  }
  const modules = input.modules === void 0 ? [] : parseList(input.modules, layout.modules, "모듈", true);
  for (const m of modules) {
    if (!isDir(import_node_path8.default.join(templatesDir, "optional", m))) {
      throw new CliError(EXIT.ENV, `모듈 템플릿이 없다: ${import_node_path8.default.join(templatesDir, "optional", m)}`);
    }
  }
  return { stack, arch, domain, lang, agents, agentsOrigin, modules };
}

// src/core/templates.ts
var import_node_fs11 = __toESM(require("node:fs"));
var import_node_path9 = __toESM(require("node:path"));
function hasLayout(dir) {
  return import_node_fs11.default.existsSync(import_node_path9.default.join(dir, "layout.json"));
}
function locateTemplates(opts) {
  const explicit = opts.flag ?? (opts.env.HARNESS_KIT_TEMPLATES || void 0);
  if (explicit !== void 0) {
    const dir = import_node_path9.default.resolve(opts.cwd, explicit);
    if (!hasLayout(dir)) throw new CliError(EXIT.ENV, `템플릿 폴더가 아니다(layout.json 없음): ${dir}`);
    return { dir, source: `file:${dir}` };
  }
  let cliDir;
  try {
    cliDir = import_node_path9.default.dirname(import_node_fs11.default.realpathSync(opts.cliFile));
  } catch {
    cliDir = import_node_path9.default.dirname(import_node_path9.default.resolve(opts.cliFile));
  }
  const beside = import_node_path9.default.resolve(cliDir, "..", "templates");
  if (hasLayout(beside)) {
    const where = import_node_path9.default.basename(cliDir) === "bin" ? "plugin" : "npm";
    return { dir: beside, source: `${where}:harness-kit@${opts.version}` };
  }
  const mono = import_node_path9.default.resolve(cliDir, "..", "..", "templates");
  if (hasLayout(mono)) return { dir: mono, source: `file:${mono}` };
  throw new CliError(EXIT.ENV, "템플릿 폴더를 찾지 못했다", `--templates <폴더> 또는 HARNESS_KIT_TEMPLATES 로 준다 (찾은 곳: ${beside} · ${mono})`);
}

// src/commands/init.ts
var TOKEN_FLAGS = {
  name: "PROJECT_NAME",
  slug: "PROJECT_SLUG",
  "package-ns": "PACKAGE_NS",
  "protected-path": "PROTECTED_PATH"
};
var ISSUE_SOURCES = ["kit", "jira"];
function tokenFlags(ctx, layout) {
  const out = {};
  for (const raw of list(ctx.values, "token")) {
    const eq = raw.indexOf("=");
    if (eq <= 0) throw usageError(`--token 은 KEY=VALUE 형식이다: '${raw}'`);
    const key = raw.slice(0, eq);
    if (!layout.tokens.includes(key)) throw usageError(`모르는 토큰: ${key}`, `사용 가능: ${layout.tokens.join(" ")}`);
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
async function askMissing(p, input, layout, templatesDir) {
  const out = { ...input };
  if (out.stack === void 0) out.stack = await p.ask(`스택 [${listStacks(templatesDir).join("/")}]`, layout.defaultStack);
  if (out.arch === void 0) {
    out.arch = await p.ask(`변형 [${listArchs(templatesDir, out.stack).join("/")}]`, stackSpecOf(layout, out.stack).defaultArch);
  }
  if (out.agents === void 0) out.agents = await p.ask(`하네스 [${layout.harnesses.join(",")}|all]`, "");
  if (out.agents === "") delete out.agents;
  if (out.modules === void 0) out.modules = await p.ask(`모듈 [${layout.modules.join(",")}|all|none]`, "none");
  return out;
}
function opJson(o) {
  const j = { path: o.path, op: o.op, owner: o.owner, layer: o.layer, action: o.action, executable: o.executable };
  if (o.reason !== void 0) j.reason = o.reason;
  return j;
}
var needsAttention = (o) => o.action === "skip-user" || o.action === "replace";
function selectionLine(sel) {
  const parts = [sel.stack, sel.arch, sel.domain || "도메인 없음", ...sel.lang ? [`lang ${sel.lang}`] : []];
  return `  선택: ${parts.join(" · ")} · 하네스 ${sel.agents.join(",")} · 모듈 ${sel.modules.join(",") || "none"}`;
}
function countsLine(plan) {
  const c = plan.counts;
  return `  파일: 생성 ${c.create} · 교체 ${c.replace} · 같음 ${c.same} · 건너뜀(사람 파일) ${c["skip-user"]} · 하네스 제외 ${c.excludedByHarness} · 겹침 ${c.overlapped}`;
}
function opLine(o) {
  return `  ${o.action.padEnd(9)} ${o.path}  [${o.layer}]${o.reason ? `  ${o.reason}` : ""}`;
}
function docsLine(r) {
  if (r.status === "built") return "  기능 문서: docs/features/ 생성";
  if (r.status === "skipped") return `  기능 문서: 건너뜀(${r.reason})`;
  return `  ⚠ 기능 문서 생성 실패 — 'python3 tools/docs/feature_docs.py build' 를 직접 실행한다 (${r.error})`;
}
function readOptions(ctx, layout) {
  const force = bool(ctx.values, "force");
  const adopt = bool(ctx.values, "adopt");
  if (force && adopt) throw usageError("--force 와 --adopt 는 같이 쓰지 않는다", "--force 는 있는 파일을 덮고, --adopt 는 있는 파일을 모두 사람 파일로 둔다");
  const issueSource = str(ctx.values, "issue-source");
  if (issueSource !== void 0 && !ISSUE_SOURCES.includes(issueSource)) {
    throw usageError(`알 수 없는 --issue-source: '${issueSource}'`, `사용 가능: ${ISSUE_SOURCES.join(" ")}`);
  }
  return { force, adopt, issueSource, flags: tokenFlags(ctx, layout) };
}
function assertInstallable(target) {
  const st = lstatOrNull(target);
  if (st && !(st.isDirectory() || st.isSymbolicLink() && import_node_fs12.default.statSync(target).isDirectory())) {
    throw new CliError(EXIT.STATE, `대상이 폴더가 아니다: ${target}`);
  }
  if (import_node_fs12.default.existsSync(import_node_path10.default.join(target, META_REL))) {
    throw new CliError(EXIT.STATE, `이미 설치된 리포다: ${import_node_path10.default.join(target, META_REL)}`, "킷 갱신은 harness-kit update, 하네스 · 모듈 추가는 harness-kit add(다음 조각)다. 지금 상태는 harness-kit doctor");
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
    ops: shown.map(opJson),
    overlaps: plan.overlaps,
    generated: plan.generated.map((g) => ({ path: g.path, action: g.action })),
    state: [META_REL, LOCK_REL]
  };
}
function lockText(plan, source) {
  const entries = plan.ops.map(
    (o) => o.owner === "kit" ? { path: o.path, op: "copy", owner: "kit", sha256: o.sha256, layer: o.layer } : { path: o.path, op: "copy", owner: "user", sha256: null, layer: o.layer }
  );
  return serializeLock({ schema: "harness-kit.lock/v2", kit: { version: VERSION, source }, packs: [], entries });
}
var STATE_LINE = `  상태 파일: ${META_REL} · ${LOCK_REL} · ${MANIFEST_PATH}`;
async function runInit(ctx) {
  const command = ctx.command === "plan" || bool(ctx.values, "dry-run") ? "plan" : "init";
  const { io: io2 } = ctx;
  const target = targetOf(ctx);
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
  const layout = loadLayout(loc.dir);
  const opts = readOptions(ctx, layout);
  assertInstallable(target);
  const interactive = io2.isTTY && !bool(ctx.values, "yes") && !ctx.json && io2.stdin !== void 0;
  const prompter = interactive ? createPrompter(io2.stdin, io2.stderr) : null;
  try {
    const input = prompter ? await askMissing(prompter, selectionInput(ctx), layout, loc.dir) : selectionInput(ctx);
    const selection = resolveSelection(layout, loc.dir, input, { target, env: io2.env });
    const tokens = resolveTokens(layout, selection, { flags: opts.flags, env: io2.env, targetBasename: import_node_path10.default.basename(target) });
    checkSlug(tokens.PROJECT_SLUG ?? "");
    const plan = buildPlan({ layout, templatesDir: loc.dir, target, selection, tokens, mode: { force: opts.force, adopt: opts.adopt } });
    const shown = command === "plan" && !ctx.quiet ? plan.ops : plan.ops.filter(needsAttention);
    const data = planData(command, target, loc.dir, selection, tokens, plan, shown);
    const lines = [`harness-kit ${command} — ${target}`, selectionLine(selection)];
    if (command === "plan") {
      lines.push(...shown.map(opLine), countsLine(plan), STATE_LINE, "  (plan — 쓰지 않았다)");
      return { code: EXIT.OK, data, lines };
    }
    if (prompter) {
      io2.stderr(`${countsLine(plan)}
`);
      if (!await prompter.confirm("진행할까?")) throw new CliError(EXIT.ABORT, "중단했다(아무것도 쓰지 않았다)");
    }
    const meta = buildMeta({ version: VERSION, selection, tokens, issue: { source: opts.issueSource, prefix: str(ctx.values, "issue-prefix") }, base: str(ctx.values, "base"), today: today(io2) });
    const result = applyPlan({ plan, metaText: serializeMeta(meta), lockText: lockText(plan, loc.source), env: io2.env });
    data.featureDocs = result.featureDocs;
    lines.push(countsLine(plan), ...shown.map(opLine), STATE_LINE, docsLine(result.featureDocs), "  다음: harness-kit doctor");
    return { code: EXIT.OK, data, lines };
  } finally {
    prompter?.close();
  }
}

// src/commands/list.ts
var import_node_path11 = __toESM(require("node:path"));
function tally(values) {
  const out = /* @__PURE__ */ new Map();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return Object.fromEntries(out);
}
function runList(ctx) {
  const target = targetOf(ctx);
  const read = readMeta(import_node_path11.default.join(target, META_REL));
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
    const lr = readLock(import_node_path11.default.join(target, LOCK_REL));
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

// src/commands/repair.ts
var import_node_fs14 = __toESM(require("node:fs"));
var import_node_path14 = __toESM(require("node:path"));

// src/core/installed.ts
var import_node_path12 = __toESM(require("node:path"));
var NOT_INSTALLED_HINT = "설치는 harness-kit init";
function loadInstalled(target, command) {
  const m = readMeta(import_node_path12.default.join(target, META_REL));
  if (m.status === "missing") throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, NOT_INSTALLED_HINT);
  if (m.status === "invalid") throw new CliError(EXIT.STATE, `메타를 해석하지 못했다: ${m.error}`, "harness-kit doctor 로 상태를 본다");
  const l = readLock(import_node_path12.default.join(target, LOCK_REL));
  if (l.status === "missing") {
    throw new CliError(EXIT.STATE, `lock 이 없다(${LOCK_REL})`, `lock 없이 ${command} 하면 사람 파일과 킷 파일을 가리지 못한다. harness-kit doctor 로 상태를 본다`);
  }
  if (l.status === "invalid") throw new CliError(EXIT.STATE, `lock 을 해석하지 못했다: ${l.error}`, "harness-kit doctor 로 상태를 본다");
  assertLockUsable(l.lock.entries);
  return { meta: m.meta, metaFormat: m.schema, lock: l.lock, lockFormat: l.format };
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
      return e.op;
    default:
      throw new CliError(EXIT.STATE, `lock 항목 ${e.path} 의 op '${e.op}' 는 이 판(${VERSION})에서 지원하지 않는다`, "mirror · render · merge 는 P18 판 CLI 로 실행한다");
  }
}
function ownerKind(owner) {
  if (owner === "kit" || owner === "user") return owner;
  if (owner.startsWith("external:")) return "external";
  if (owner.startsWith("pack:")) return "pack";
  return "unknown";
}
function selectionFromMeta(layout, templatesDir, meta) {
  if (!listStacks(templatesDir).includes(meta.stack)) {
    throw new CliError(EXIT.STATE, `이 킷에 없는 스택이다: '${meta.stack}'`, "메타의 stack 을 고치거나 그 스택이 있는 킷 판을 쓴다");
  }
  if (!listArchs(templatesDir, meta.stack).includes(meta.arch)) {
    throw new CliError(EXIT.STATE, `이 킷에 없는 변형이다: '${meta.arch}' (스택 ${meta.stack})`, "메타의 arch 를 고치거나 그 변형이 있는 킷 판을 쓴다");
  }
  const modules = meta.modules.filter((m) => isDir(import_node_path12.default.join(templatesDir, "optional", m)));
  const selection = {
    stack: meta.stack,
    arch: meta.arch,
    domain: meta.domain || (stackSpecOf(layout, meta.stack).domain ?? ""),
    lang: null,
    agents: [...meta.agents],
    agentsOrigin: "meta",
    modules
  };
  return { selection, droppedModules: meta.modules.filter((m) => !modules.includes(m)) };
}
function tokensFromMeta(layout, sel, meta, env, target) {
  const fixed = /* @__PURE__ */ new Map();
  for (const k of layout.tokens) {
    const fromEnv = env[k];
    if (fromEnv) fixed.set(k, fromEnv);
    else if (Object.hasOwn(meta.tokens, k)) fixed.set(k, meta.tokens[k]);
  }
  const flags = Object.fromEntries([...fixed].filter(([, v]) => v !== ""));
  const defaults = resolveTokens(layout, sel, { flags, env: {}, targetBasename: import_node_path12.default.basename(target) });
  return Object.fromEntries(layout.tokens.map((k) => [k, fixed.get(k) ?? defaults[k] ?? ""]));
}

// src/core/update-plan.ts
var import_node_fs13 = __toESM(require("node:fs"));
var import_node_path13 = __toESM(require("node:path"));
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
  "forget"
];
function full2(target, rel) {
  return import_node_path13.default.join(target, ...rel.split("/"));
}
function current(ctx, rel) {
  if (ctx.ancestors.state(rel) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(full2(ctx.target, rel));
  if (cur.kind === "file") return { kind: "file", sha: sha256(cur.bytes) };
  return cur;
}
var kitEntry = (p, w) => ({ path: p, op: "copy", owner: "kit", sha256: w.sha256, layer: w.layer });
var userEntry = (p, layer) => ({ path: p, op: "copy", owner: "user", sha256: null, layer });
function withD(p, w, action, extra = {}) {
  return { path: p, op: "copy", owner: "kit", layer: w.layer, action, executable: w.executable, content: w.content, sha256: w.sha256, ...extra };
}
function skipByOwner(e) {
  switch (ownerKind(e.owner)) {
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
  if (cur.kind === "none") return { op: withD(p, w, "new"), entry: kitEntry(p, w) };
  if (cur.kind === "file" && cur.sha === w.sha256) return { op: withD(p, w, "same"), entry: kitEntry(p, w) };
  return { op: { path: p, op: "copy", owner: "user", layer: w.layer, action: "skip-user", reason: "사람이 둔 파일이다" }, entry: userEntry(p, w.layer) };
}
function sideState(ctx, rel) {
  return existing(full2(ctx.target, rel)).kind;
}
function modifiedFile(ctx, p, e, w) {
  const keepB = { path: p, op: "copy", owner: "kit", sha256: e.sha256 ?? null, layer: w.layer };
  if (ctx.acceptAll) {
    const bak = `${p}.bak`;
    if (sideState(ctx, bak) !== "other") return { op: withD(p, w, "replace", { backup: bak }), entry: kitEntry(p, w) };
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
    return { op: { path: p, op: "copy", owner: e?.owner ?? "user", layer: w.layer, action: "skip-user", reason: cur.what }, entry: e ?? userEntry(p, w.layer) };
  }
  if (!e) return untracked(p, w, cur);
  if (cur.kind === "none") return { op: withD(p, w, "restore"), entry: kitEntry(p, w) };
  if (cur.sha === w.sha256) return { op: withD(p, w, "same"), entry: kitEntry(p, w) };
  if (e.sha256 && cur.sha === e.sha256) return { op: withD(p, w, "update"), entry: kitEntry(p, w) };
  return modifiedFile(ctx, p, e, w);
}
function wanted(input) {
  const { layout, templatesDir, selection, tokens } = input;
  const res = resolveCandidates(layout, templatesDir, selection, tokens);
  const want = /* @__PURE__ */ new Map();
  for (const c of res.winners) {
    assertSafeRelPath(c.dest);
    const content = substitute(readTemplate(templatesDir, c.src), tokens, layout.tokens);
    want.set(c.dest, { layer: c.layer, content, sha256: sha256(content), executable: isExecutable(layout, c.dest) });
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
  const locked = new Map(input.lock.entries.map((e) => [e.path, e]));
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
  return { ops, entries, counts: counts2, overlaps, excludedByHarness };
}

// src/commands/repair.ts
var REPAIR_KINDS = ["missing", "drifted", "stale", "merge"];
function full3(target, rel) {
  return import_node_path14.default.join(target, ...rel.split("/"));
}
function parseOnly2(raw) {
  if (raw === void 0) return [...REPAIR_KINDS];
  const only = raw.split(/[\s,]+/).filter(Boolean);
  const unknown = only.filter((k) => !REPAIR_KINDS.includes(k));
  if (unknown.length || only.length === 0) throw usageError(`모르는 repair 종류: ${unknown.join(" ") || "(빈 값)"}`, `사용 가능: ${REPAIR_KINDS.join(" ")}`);
  return only;
}
function survey(target, inst) {
  const ancestors = new AncestorCheck(target, import_node_fs14.default.realpathSync(target));
  const out = { ok: 0, drifted: 0, skipped: 0, missing: [] };
  for (const e of inst.lock.entries) {
    if (ownerKind(e.owner) !== "kit" || entryKind(e) !== "copy") {
      out.skipped += 1;
      continue;
    }
    if (ancestors.state(e.path) === "blocked") {
      out.drifted += 1;
      continue;
    }
    const cur = existing(full3(target, e.path));
    if (cur.kind === "none") out.missing.push(e);
    else if (cur.kind === "file" && e.sha256 && sha256(cur.bytes) === e.sha256) out.ok += 1;
    else out.drifted += 1;
  }
  return out;
}
function wantFor(ctx, target, inst) {
  const { io: io2 } = ctx;
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
  const layout = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout, selection, inst.meta, io2.env, target);
  return { want: wanted({ layout, templatesDir: loc.dir, selection, tokens }).want, templates: loc.dir };
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
function applyRepair(target, inst, ops) {
  const restored = new Map(ops.filter((o) => o.action === "restore").map((o) => [o.path, o.want]));
  let current3 = "";
  try {
    for (const [rel, w] of restored) {
      current3 = rel;
      writeFileAtomic(full3(target, rel), w.content, w.executable);
    }
    const entries = inst.lock.entries.map((e) => {
      const w = restored.get(e.path);
      return w ? { ...e, sha256: w.sha256, layer: w.layer } : e;
    });
    current3 = LOCK_REL;
    writeFileAtomic(full3(target, LOCK_REL), Buffer.from(serializeLock({ ...inst.lock, entries }), "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current3}`);
  }
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
  if (!dryRun && count("restore") > 0) applyRepair(target, inst, ops);
  const counts2 = { ok: s.ok, drifted: s.drifted, missing: s.missing.length, restore: count("restore"), "needs-update": count("needs-update"), unrestorable: count("unrestorable"), skipped: s.skipped };
  const hints = ["needs-update", "unrestorable"].filter((a) => counts2[a] > 0).map((a) => HINTS[a]);
  const code = hints.length ? EXIT.HUMAN : EXIT.OK;
  const opsJson = ops.map((o) => ({ path: o.path, layer: o.layer, action: o.action, ...o.reason ? { reason: o.reason } : {} }));
  const data = { command: "repair", target, dryRun, kit: { lock: lockVersion, cli: VERSION }, only, counts: counts2, ops: opsJson, hints };
  if (source) data.templates = source.templates;
  const lines = [
    `harness-kit repair — ${target}`,
    `  킷: lock ${lockVersion ?? "?(v1)"} · CLI ${VERSION}`,
    ...ops.map((o) => `  ${o.action.padEnd(13)} ${o.path}${o.reason ? `  ${o.reason}` : ""}`),
    `  copy 항목: ok ${counts2.ok} · drifted ${counts2.drifted}(사람이 고친 파일 — 그대로 둔다) · missing ${counts2.missing}`,
    `  되살림 ${counts2.restore} · update 필요 ${counts2["needs-update"]} · 킷에 없음 ${counts2.unrestorable}`,
    ...hints.map((h) => `  다음: ${h}`),
    ...dryRun ? ["  (dry-run — 쓰지 않았다)"] : []
  ];
  return { code, data, lines };
}

// src/commands/reserved.ts
var RESERVED = {
  add: "P17(다음 조각)",
  remove: "P17(다음 조각)",
  outdated: "P17(다음 조각)",
  pack: "P18(확장 층, 설계 04)",
  dashboard: "P20(관리 페이지, 설계 06)",
  skills: "P20(스킬 목록, 설계 07)",
  status: "P20(관리 페이지, 설계 06)",
  projects: "P20(관리 페이지, 설계 06)",
  sessions: "P20(관리 페이지, 설계 06)",
  dispatch: "P20(관리 페이지, 설계 06)",
  usage: "P20(관리 페이지, 설계 06 · 12)",
  answer: "P20(관리 페이지, 설계 06)",
  flow: "P20(관리 페이지, 설계 06)",
  intake: "P21(설계 단계, 설계 08)",
  approve: "P21(설계 단계, 설계 08)",
  mob: "P21(설계 단계, 설계 08)",
  units: "P21(설계 단계, 설계 08)",
  review: "P23(검증 · 품질, 설계 09)",
  quality: "P23(검증 · 품질, 설계 09)",
  deploy: "P24(배포 · 운영, 설계 14)",
  ops: "P24(배포 · 운영, 설계 14)",
  metrics: "P24(배포 · 운영, 설계 14)",
  rules: "P24(배포 · 운영, 설계 14)",
  sync: "P24(설계 10)"
};

// src/commands/uninstall.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs16 = __toESM(require("node:fs"));
var import_node_path16 = __toESM(require("node:path"));

// src/core/remove.ts
var import_node_fs15 = __toESM(require("node:fs"));
var import_node_path15 = __toESM(require("node:path"));
function full4(target, rel) {
  return import_node_path15.default.join(target, ...rel.split("/"));
}
function removeFile(target, rel) {
  import_node_fs15.default.rmSync(full4(target, rel), { force: true });
}
function ancestorDirs(rels) {
  const dirs = /* @__PURE__ */ new Set();
  for (const rel of rels) {
    const parts = rel.split("/");
    for (let i = parts.length - 1; i > 0; i -= 1) dirs.add(parts.slice(0, i).join("/"));
  }
  return [...dirs].sort((a, b) => b.split("/").length - a.split("/").length || byteCompare(a, b));
}
function removeEmptyDirs(target, rels) {
  let removed = 0;
  for (const dir of ancestorDirs(rels)) {
    const p = full4(target, dir);
    try {
      if (!import_node_fs15.default.lstatSync(p).isDirectory()) continue;
      import_node_fs15.default.rmdirSync(p);
      removed += 1;
    } catch (err) {
      const code = err.code;
      if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST" && code !== "ENOTDIR") throw err;
    }
  }
  return removed;
}

// src/commands/uninstall.ts
var ACTIONS = ["delete", "keep-modified", "absent", "keep-user", "keep-external", "keep-pack"];
var COUNT_ONLY = /* @__PURE__ */ new Set(["absent", "keep-user", "keep-external", "keep-pack"]);
var HOOKS_PATH = "scripts/git-hooks";
function full5(target, rel) {
  return import_node_path16.default.join(target, ...rel.split("/"));
}
function current2(p, rel) {
  if (p.ancestors.state(rel) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(full5(p.target, rel));
  return cur.kind === "file" ? { kind: "file", sha: sha256(cur.bytes), bytes: cur.bytes } : cur;
}
function keepAction(e, keepPacks) {
  const owner = ownerKind(e.owner);
  if (owner === "external") return "keep-external";
  if (owner === "user" || owner === "unknown" || entryKind(e) === "none") return "keep-user";
  if (owner === "pack" && keepPacks) return "keep-pack";
  return null;
}
function planEntry(p, e) {
  const keep = keepAction(e, p.keepPacks);
  if (keep) {
    p.ops.push({ path: e.path, owner: e.owner, action: keep });
    return;
  }
  const cur = current2(p, e.path);
  if (cur.kind === "none") p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
  else if (cur.kind === "file" && e.sha256 && cur.sha === e.sha256) p.ops.push({ path: e.path, owner: e.owner, action: "delete" });
  else {
    const reason = cur.kind === "other" ? cur.what : e.sha256 ? "사람이 고친 파일이다" : "lock 에 기준 해시가 없다(고친 파일로 본다)";
    p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason });
  }
  if (cur.kind !== "other" && current2(p, `${e.path}.new`).kind === "file") {
    p.ops.push({ path: `${e.path}.new`, owner: e.owner, action: "delete", reason: "update 가 둔 .new" });
  }
}
function planManifest(p, inst) {
  const cur = current2(p, MANIFEST_PATH);
  if (cur.kind === "none") return;
  const want = manifestContent({ stack: inst.meta.stack, agents: inst.meta.agents }, inst.meta.tokens);
  if (cur.kind === "file" && cur.bytes.equals(want)) p.ops.push({ path: MANIFEST_PATH, owner: "kit", action: "delete", reason: "생성물" });
  else p.ops.push({ path: MANIFEST_PATH, owner: "kit", action: "keep-modified", reason: "킷 판과 다르다" });
}
function buildUninstall(target, inst, keepPacks, keepState) {
  const p = { target, ancestors: new AncestorCheck(target, import_node_fs16.default.realpathSync(target)), keepPacks, ops: [] };
  for (const e of inst.lock.entries) planEntry(p, e);
  planManifest(p, inst);
  if (!keepState) for (const rel of [LOCK_REL, META_REL]) p.ops.push({ path: rel, owner: "kit", action: "delete", reason: "상태 파일" });
  return p.ops;
}
function gitEnv(env) {
  const out = { ...env, PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG"]) delete out[k];
  return out;
}
function unhookGit(target, env, dryRun) {
  const git = (...args) => (0, import_node_child_process2.spawnSync)("git", ["-C", target, ...args], { env: gitEnv(env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 3e4 });
  const top = git("rev-parse", "--show-toplevel");
  if (top.error) return { status: top.error.code === "ENOENT" ? "no-git" : "failed" };
  if (top.status !== 0) return { status: "none" };
  let topReal;
  try {
    topReal = import_node_fs16.default.realpathSync(top.stdout.trim());
  } catch {
    return { status: "none" };
  }
  if (topReal !== import_node_fs16.default.realpathSync(target)) return { status: "none" };
  const get = git("config", "--local", "--get", "core.hooksPath");
  if (get.status !== 0) return { status: "none" };
  const value = get.stdout.trim();
  if (value !== HOOKS_PATH) return { status: "kept", value };
  if (!dryRun && git("config", "--local", "--unset", "core.hooksPath").status !== 0) return { status: "failed", value };
  return { status: "unset", value };
}
function applyUninstall(target, inst, ops, unhook) {
  const state = /* @__PURE__ */ new Set([LOCK_REL, META_REL]);
  let current3 = "";
  try {
    for (const o of ops) {
      if (o.action !== "delete" || state.has(o.path)) continue;
      current3 = o.path;
      removeFile(target, o.path);
    }
    current3 = "git hook 연결";
    unhook();
    for (const rel of [LOCK_REL, META_REL]) {
      if (!ops.some((o) => o.path === rel && o.action === "delete")) continue;
      current3 = rel;
      removeFile(target, rel);
    }
    current3 = "빈 폴더";
    removeEmptyDirs(target, [...inst.lock.entries.map((e) => e.path), MANIFEST_PATH, LOCK_REL, META_REL]);
  } catch (err) {
    throw fsError(err, `지우기 실패 ${current3}`);
  }
}
function counts(ops) {
  const c = Object.fromEntries(ACTIONS.map((a) => [a, 0]));
  for (const o of ops) c[o.action] += 1;
  return c;
}
var opLine2 = (o) => `  ${o.action.padEnd(13)} ${o.path}${o.reason ? `  ${o.reason}` : ""}`;
async function confirm(ctx, ops) {
  const { io: io2 } = ctx;
  const p = createPrompter(io2.stdin, io2.stderr);
  try {
    const del = ops.filter((o) => o.action === "delete");
    const keep = ops.filter((o) => o.action === "keep-modified");
    io2.stderr(`지울 파일 ${del.length}개${ctx.quiet ? "" : ":"}
`);
    if (!ctx.quiet) for (const o of del) io2.stderr(`${opLine2(o)}
`);
    if (keep.length) io2.stderr(`남길 파일(사람이 고침) ${keep.length}개:
${keep.map((o) => `${opLine2(o)}
`).join("")}`);
    if (!await p.confirm("지울까?")) throw new CliError(EXIT.ABORT, "중단했다(아무것도 지우지 않았다)");
  } finally {
    p.close();
  }
}
async function runUninstall(ctx) {
  const { io: io2 } = ctx;
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "uninstall");
  const dryRun = bool(ctx.values, "dry-run");
  const keepState = bool(ctx.values, "keep-state");
  const ops = buildUninstall(target, inst, bool(ctx.values, "keep-packs"), keepState);
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
    ...listed.map(opLine2),
    `  지움 ${c.delete} · 남김(사람이 고침) ${c["keep-modified"]} · 이미 없음 ${c.absent} · 사람 · 외부 · 팩 파일 ${c["keep-user"] + c["keep-external"] + c["keep-pack"]}`,
    `  git hook 연결(core.hooksPath): ${gitHooks.status}${gitHooks.value ? ` (${gitHooks.value})` : ""}`,
    ...keepState ? [`  상태 파일은 둔다: ${META_REL} · ${LOCK_REL}`] : [],
    ...keep.length ? ["  고친 파일은 남겼다. 필요 없으면 직접 지운다"] : [],
    ...dryRun ? ["  (dry-run — 지우지 않았다)"] : []
  ];
  return { code: keep.length ? EXIT.HUMAN : EXIT.OK, data, lines };
}

// src/commands/update.ts
var import_node_fs17 = __toESM(require("node:fs"));
var import_node_path17 = __toESM(require("node:path"));
var V1_LOCK_BACKUP = ".agents/state/harness-kit.lock.v1.bak";
var LATER_FLAGS = {
  packs: "--packs(팩 갱신)는 P18(확장 층, 설계 04)에서 제공한다",
  tools: "--tools(외부 도구 갱신)는 P22(외부 도구 모듈, 설계 10)에서 제공한다"
};
function full6(target, rel) {
  return import_node_path17.default.join(target, ...rel.split("/"));
}
function shellQuote(s) {
  return /^[A-Za-z0-9_./@%+=:,-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}
function checkFlags(ctx) {
  for (const [flag, message] of Object.entries(LATER_FLAGS)) if (bool(ctx.values, flag)) throw usageError(message);
  const to = str(ctx.values, "to");
  if (to === void 0 || to === VERSION) return to;
  if (/[:#/]/.test(to)) throw usageError(`--to 에 소스는 아직 받지 않는다: '${to}'`, "다른 템플릿 폴더는 --templates <폴더> 로 준다");
  throw usageError(`이 CLI 는 ${VERSION} 판만 깐다: --to ${to}`, `그 판은 npx harness-kit@${to} update 로 올린다`);
}
function checkVersion(installed, to) {
  const cmp = compareSemver(installed, VERSION);
  if (cmp !== null && cmp > 0 && to !== VERSION) {
    throw new CliError(EXIT.STATE, `설치된 킷(${installed})이 이 CLI(${VERSION})보다 새것이다`, `새 CLI 로 다시 실행한다. 내리려면 harness-kit update --to ${VERSION}`);
  }
}
var NEEDS_DATA = /* @__PURE__ */ new Set(["new", "restore", "update", "replace", "conflict"]);
function opJson2(o) {
  const j = { path: o.path, op: o.op, owner: o.owner, layer: o.layer, action: o.action };
  if (NEEDS_DATA.has(o.action)) j.executable = o.executable;
  if (o.reason !== void 0) j.reason = o.reason;
  if (o.newFile !== void 0) j.new = o.newFile;
  if (o.newRefreshed) j.newRefreshed = true;
  if (o.backup !== void 0) j.backup = o.backup;
  if (o.modified !== void 0) j.modified = o.modified;
  return j;
}
function opLine3(o) {
  let extra = "";
  if (o.action === "conflict") extra = o.newFile ? `  → ${o.newFile}${o.newRefreshed ? " (갱신)" : ""}` : "";
  else if (o.action === "replace") extra = `  (수정본 → ${o.backup})`;
  else if (o.action === "orphan" && o.modified) extra = "  (고친 파일)";
  return `  ${o.action.padEnd(13)} ${o.path}${extra}${o.reason ? `  ${o.reason}` : ""}`;
}
function countsLine2(c) {
  const skipped = c["skip-user"] + c["skip-external"] + c["skip-pack"];
  return `  파일: 새로 ${c.new} · 되살림 ${c.restore} · 교체 ${c.update} · 같음 ${c.same} · 충돌 ${c.conflict} · 덮음(.bak) ${c.replace} · 킷에서 빠짐 ${c.orphan} · 지움 ${c.delete} · 건너뜀 ${skipped} · 받지 않기로 함 ${c.forget}`;
}
function selectionLine2(sel) {
  return `  선택: ${sel.stack} · ${sel.arch} · ${sel.domain || "도메인 없음"} · 하네스 ${sel.agents.join(",")} · 모듈 ${sel.modules.join(",") || "none"}`;
}
function applyUpdate(target, plan, w) {
  let current3 = "";
  try {
    const deleted = [];
    for (const o of plan.ops) {
      current3 = o.path;
      if (o.action === "new" || o.action === "restore" || o.action === "update") writeFileAtomic(full6(target, o.path), o.content, o.executable === true);
      else if (o.action === "replace") {
        import_node_fs17.default.renameSync(full6(target, o.path), full6(target, o.backup));
        writeFileAtomic(full6(target, o.path), o.content, o.executable === true);
      } else if (o.action === "conflict" && o.newFile) writeFileAtomic(full6(target, o.newFile), o.content, false);
      else if (o.action === "delete" && o.removeFile) {
        removeFile(target, o.path);
        deleted.push(o.path);
      }
    }
    removeEmptyDirs(target, deleted);
    const state = [
      [MANIFEST_PATH, w.manifest],
      [V1_LOCK_BACKUP, w.v1Backup],
      [LOCK_REL, Buffer.from(w.lockText, "utf8")],
      [META_REL, Buffer.from(w.metaText, "utf8")]
    ];
    for (const [rel, data] of state) {
      current3 = rel;
      if (data) writeFileAtomic(full6(target, rel), data, false);
    }
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current3}`);
  }
}
function conflictList(plan) {
  return plan.ops.filter((o) => o.action === "conflict").map((o) => ({ path: o.path, new: o.newFile ?? null, diff: o.newFile ? `diff -u ${shellQuote(o.path)} ${shellQuote(o.newFile)}` : null }));
}
function humanLines(ctx, head, plan, shown, conflicts, dryRun) {
  const lines = [...head, ...shown.map(opLine3), countsLine2(plan.counts)];
  if (conflicts.length) {
    lines.push("  충돌 — 고친 파일이라 덮지 않았다. 새 판은 .new 에 있다(리포 폴더에서):");
    for (const c of conflicts) if (c.diff) lines.push(`    ${String(c.diff)}`);
    lines.push("  병합했으면 .new 를 지운다. 새 판을 그대로 쓰려면 mv 로 덮는다. 전부 새 판으로: harness-kit update --accept-all");
  }
  if (plan.ops.some((o) => o.action === "orphan") && !bool(ctx.values, "prune")) lines.push("  킷에서 빠진 미수정 파일을 지우려면: harness-kit update --prune");
  lines.push(dryRun ? "  (dry-run — 쓰지 않았다)" : "  다음: harness-kit doctor");
  return lines;
}
function writtenState(ctx, target, inst, plan, sel, tokens, source) {
  const lockText2 = serializeLock({ schema: "harness-kit.lock/v2", kit: { version: VERSION, source }, packs: inst.lock.packs, entries: plan.entries });
  const meta = mergeMetaForUpdate(inst.meta, { version: VERSION, selection: sel, tokens, today: today(ctx.io) });
  const manifest = lstatOrNull(full6(target, MANIFEST_PATH)) ? null : manifestContent(sel, tokens);
  const v1Backup = inst.lockFormat === "v1" ? import_node_fs17.default.readFileSync(full6(target, LOCK_REL)) : null;
  return { lockText: lockText2, metaText: serializeMeta(meta), manifest, v1Backup };
}
function runUpdate(ctx) {
  const { io: io2 } = ctx;
  const to = checkFlags(ctx);
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "update");
  checkVersion(inst.meta.kit.version, to);
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION });
  const layout = loadLayout(loc.dir);
  const { selection, droppedModules } = selectionFromMeta(layout, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout, selection, inst.meta, io2.env, target);
  const prune = bool(ctx.values, "prune");
  const plan = buildUpdatePlan({ layout, templatesDir: loc.dir, target, selection, tokens, lock: inst.lock, acceptAll: bool(ctx.values, "accept-all"), prune, forget: list(ctx.values, "forget") });
  const dryRun = bool(ctx.values, "dry-run");
  const w = writtenState(ctx, target, inst, plan, selection, tokens, loc.source);
  if (!dryRun) applyUpdate(target, plan, w);
  const keptModified = prune && plan.ops.some((o) => o.action === "orphan" && o.modified);
  const code = plan.counts.conflict > 0 || keptModified ? EXIT.HUMAN : EXIT.OK;
  const shown = plan.ops.filter((o) => o.action !== "same" && (!ctx.quiet || o.action === "conflict"));
  const conflicts = conflictList(plan);
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
    counts: counts2,
    ops: shown.map(opJson2),
    conflicts,
    generated: w.manifest ? [{ path: MANIFEST_PATH, action: "create" }] : [],
    state: [META_REL, LOCK_REL, ...w.v1Backup ? [V1_LOCK_BACKUP] : []]
  };
  const head = [
    `harness-kit update — ${target}`,
    `  킷: ${inst.meta.kit.version} → ${VERSION} · 메타 ${inst.metaFormat} · lock ${inst.lockFormat}`,
    selectionLine2(selection),
    ...droppedModules.length ? [`  ⚠ 킷에 없는 모듈을 뺀다: ${droppedModules.join(", ")}`] : []
  ];
  return { code, data, lines: humanLines(ctx, head, plan, shown, conflicts, dryRun) };
}

// src/main.ts
var COMMANDS = {
  init: runInit,
  plan: runInit,
  update: runUpdate,
  repair: runRepair,
  uninstall: runUninstall,
  doctor: runDoctor,
  list: runList
};
var USAGE = `harness-kit ${VERSION} — 하네스 엔지니어링 스타터 킷

사용법: harness-kit <명령> [플래그]

명령:
  init       킷을 리포에 설치한다(질문 또는 플래그)
  plan       설치할 작업 목록만 출력한다(쓰지 않는다)
  update     킷을 새 판으로 올린다. 사람이 고친 파일은 <경로>.new 로 받는다
  repair     지워진 킷 파일을 같은 판으로 되살린다. 고친 파일은 그대로 둔다
  uninstall  킷 소유이면서 고치지 않은 파일을 지운다
  doctor     설치 상태를 점검한다(읽기만). --check 면 오류가 있을 때 exit 1
  list       설치 요약. --files 면 lock 항목

공통 플래그: --cwd <폴더> --dry-run --yes --json --templates <폴더> --quiet --no-color --help
init · plan: --stack --arch --domain --lang --agents <목록|all> --modules <목록|all|none>
             --name --slug --package-ns --protected-path --token KEY=VALUE --issue-source kit|jira
             --issue-prefix --base --adopt --force
update: --accept-all --prune --forget <경로>(반복) --to <CLI 버전>
repair: --only missing,drifted,stale,merge · uninstall: --keep-state --keep-packs
종료 코드: 0 성공 · 1 검사 문제 · 2 사용법 · 3 리포 상태 · 4 사람 판단 필요 · 5 실행 환경 · 130 중단
`;
var COMMAND_HELP = {
  init: "harness-kit init [--stack S] [--arch A] [--agents claude,codex|all] [--modules m1,m2|all|none] [--yes] [--dry-run] [--json]\n",
  plan: "harness-kit plan [init 과 같은 플래그] — 작업 목록만 출력한다\n",
  doctor: "harness-kit doctor [--check] [--only 종류,…] [--json] — 종류: meta-invalid lock-invalid lock-v1 version-mismatch missing drifted gitignore entry-size\n",
  list: "harness-kit list [--files] [--json]\n",
  update: "harness-kit update [--dry-run] [--accept-all] [--prune] [--forget 경로]… [--to 버전] [--templates 폴더] [--json] — conflict 가 있으면 exit 4\n",
  repair: "harness-kit repair [--dry-run] [--only missing,drifted,stale,merge] [--json] — 되살리지 못한 missing 이 있으면 exit 4\n",
  uninstall: "harness-kit uninstall [--dry-run] [--yes] [--keep-state] [--keep-packs] [--json] — 고친 파일을 남기면 exit 4. TTY 가 아니면 --yes\n"
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
function commandOf(argv, first, command) {
  if (argv.length === 0) throw usageError("명령이 없다", USAGE.trimEnd());
  if (command === "") throw usageError(`명령이 먼저 온다: ${first}`, "harness-kit --help");
  if (Object.hasOwn(RESERVED, command)) {
    throw usageError(`'${command}' 는 아직 없다 — ${RESERVED[command]}에서 제공한다`, "지금 있는 명령: init · plan · update · repair · uninstall · doctor · list");
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
    const run = commandOf(argv, first, command);
    const values = parseCommandArgs(command, argv.slice(1));
    if (bool(values, "help")) {
      io2.stdout(Object.hasOwn(COMMAND_HELP, command) ? COMMAND_HELP[command] : USAGE);
      return EXIT.OK;
    }
    const ctx = { io: io2, command, values, json, quiet: bool(values, "quiet") };
    const result = await run(ctx);
    if (json) io2.stdout(formatJson(result.data));
    else io2.stdout(`${result.lines.join("\n")}
`);
    return result.code;
  } catch (err) {
    if (err instanceof CliError) return emitError(io2, command, err, json);
    const message = err instanceof Error ? err.message : String(err);
    emitError(io2, command, new CliError(1, `내부 오류: ${message}`), json);
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
