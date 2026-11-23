#!/usr/bin/env node
// harness-kit 2.0.0-alpha.0 · src-sha256 3fcfd4279642204a2bbd08df19e5fed0925e32b4290b9ac9c9f2329262883201 · 생성물(packages/cli/build.mjs) — 손으로 고치지 않는다
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
  uninstall: { "keep-state": { type: "boolean" }, "keep-packs": { type: "boolean" } },
  add: {},
  remove: {},
  outdated: { check: { type: "boolean" }, source: { type: "string" } }
};
var POSITIONAL = /* @__PURE__ */ new Set(["add", "remove"]);
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
  const walk2 = (d, prefix) => {
    for (const name of import_node_fs.default.readdirSync(d)) {
      const full9 = import_node_path.default.join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = import_node_fs.default.lstatSync(full9);
      if (st.isDirectory()) walk2(full9, rel);
      else if (st.isFile()) out.push(rel);
    }
  };
  walk2(dir, "");
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
  const rel = import_node_path.default.relative(parent, child);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${import_node_path.default.sep}`) && !import_node_path.default.isAbsolute(rel);
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
  const file = import_node_path2.default.join(templatesDir, "layout.json");
  let text;
  try {
    text = import_node_fs3.default.readFileSync(file, "utf8");
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
function v1ProjectionEntry(sha, label, rel) {
  if (label === "merge+") return { path: rel, op: "merge", owner: "kit", createdByKit: true };
  if (label === "merge") return { path: rel, op: "merge", owner: "kit" };
  return { path: rel, op: label, owner: "kit", sha256: sha === "-" ? null : sha };
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
    if (V1_PROJECTION.has(label)) {
      seen.set(rel, v1ProjectionEntry(sha, label, rel));
      continue;
    }
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
  if (text.startsWith(V1_HEADER)) {
    const marked = text.split("\n").some((l) => l.replace(/\r$/, "") === V1_MARK);
    return { format: "v1", lock: parseV1(text), ambiguous: !marked };
  }
  if (text.trim() === "") throw new Error("비어 있다");
  return { format: "v2", lock: parseV2(text), ambiguous: false };
}
function readLock(file) {
  let text;
  try {
    text = import_node_fs4.default.readFileSync(file, "utf8");
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
    text = import_node_fs5.default.readFileSync(file, "utf8");
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
var import_node_fs11 = __toESM(require("node:fs"));
var import_node_path8 = __toESM(require("node:path"));

// src/core/resolve.ts
var import_node_fs6 = __toESM(require("node:fs"));
var import_node_path3 = __toESM(require("node:path"));
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
      if (!isDir(import_node_path3.default.join(templatesDir, dir))) {
        if (spec.whenExists) continue;
        throw new CliError(EXIT.ENV, `템플릿 레이어 폴더가 없다: ${import_node_path3.default.join(templatesDir, dir)}`);
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
    for (const rel of walkFiles(import_node_path3.default.join(templatesDir, dir))) {
      if (ignore.has(import_node_path3.default.posix.basename(rel))) continue;
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
  return import_node_fs6.default.readFileSync(import_node_path3.default.join(templatesDir, ...src.split("/")));
}

// src/projection/engine.ts
var import_node_fs9 = __toESM(require("node:fs"));
var import_node_path6 = __toESM(require("node:path"));

// src/projection/frontmatter.ts
var FM_KEY = /^([A-Za-z0-9_-]+):(.*)$/;
var LIST_ITEM = /^\s+-\s?(.*)$/;
function splitFrontmatter(text) {
  if (!text.startsWith("---\n")) return { block: null, body: text };
  const end = text.indexOf("\n---\n", 3);
  if (end < 0) return { block: null, body: text };
  return { block: end >= 4 ? text.slice(4, end) : "", body: text.slice(end + 5) };
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
function parsed(text) {
  const { block: block2, body } = splitFrontmatter(text);
  return { fm: block2 === null ? {} : parseFrontmatter(block2), body, hasBlock: block2 !== null };
}
function parseRule(source, data) {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const { fm, body } = parsed(decode(bytes));
  const paths = fmList(fm, "paths");
  return { name: basename(source).slice(0, -".md".length), source, data: bytes, paths: paths.length ? paths : null, body };
}
function parseSkill(source, files) {
  const list2 = Array.isArray(files) ? files : [...files].map(([rel, f]) => ({ rel, bytes: f.bytes, executable: f.executable }));
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
function parsePolicy(text) {
  let raw = null;
  try {
    raw = text === null ? null : JSON.parse(text);
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
function withNewline(text) {
  return text === "" || text.endsWith("\n") ? text : `${text}
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
function renderKiroRole(r, fields, spec) {
  const obj2 = {
    name: r.name,
    description: r.description,
    prompt: r.body,
    tools: kiroTools(r.tools),
    allowedTools: r.mode === "write" ? ["read", "write"] : ["read"],
    resources: [...KIRO_RESOURCES]
  };
  if (r.mode === "write") obj2.hooks = spec.kiroWriteHooks;
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
var TOKEN = /(?:^|\s)harness-[a-z0-9-]+(?:\s|$)/;
var TABLE_HEADER = /^\s*\[\[?\s*([^[\]]+?)\s*\]\]?\s*(?:#.*)?$/;
var MERGE_KIND = { "CLAUDE.md": "claude-md", ".claude/settings.json": "settings", ".codex/config.toml": "codex-config", ".gitattributes": "gitattributes" };
var fail = (reason) => ({ ok: false, reason });
var isBlank = (l) => l.trim() === "";
function splitLines(text) {
  const lines = text.split("\n");
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
function settingsWant(spec, tokens) {
  const sub = (value) => Object.entries(tokens).reduce((v, [k, x]) => x ? v.split(`{{${k}}}`).join(x) : v, value);
  return { deny: spec.claudeSettings.deny.map(sub), hooks: spec.claudeSettings.hooks.map((h) => ({ ...h })) };
}
var isObj2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function commandOf(h) {
  return isObj2(h) && typeof h.command === "string" ? h.command : null;
}
function rstrip(s) {
  return s.replace(/\s+$/, "");
}
function isKitHook(h, scripts) {
  const cmd = commandOf(h);
  if (cmd === null) return false;
  return TOKEN.test(cmd) || scripts.some((s) => rstrip(cmd).endsWith(s));
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function hookMatches(h, id, script) {
  const cmd = commandOf(h);
  if (cmd === null) return false;
  if (new RegExp(`(?:^|\\s)${escapeRe(id)}(?:\\s|$)`).test(cmd)) return true;
  return Boolean(script) && rstrip(cmd).endsWith(script);
}
function stripHooks(arr, isKit) {
  const out = [];
  let first = null;
  for (const g of arr) {
    const items = isObj2(g) ? g.hooks : void 0;
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
  return isObj2(data) ? data : "최상위가 객체가 아니다";
}
var settings = {
  merge(cur, want, prev = []) {
    const parsed2 = cur === null ? {} : parseObject(cur);
    if (typeof parsed2 === "string") return fail(parsed2);
    const data = { ...parsed2 };
    const perms = data.permissions;
    if (perms !== void 0 && !isObj2(perms)) return fail("permissions 가 객체가 아니다");
    const deny = isObj2(perms) ? perms.deny : void 0;
    if (deny !== void 0 && !Array.isArray(deny)) return fail("permissions.deny 가 배열이 아니다");
    const hooks = data.hooks;
    if (hooks !== void 0 && !isObj2(hooks)) return fail("hooks 가 객체가 아니다");
    const prevDeny = prev.filter((k) => k.startsWith("permissions.deny:")).map((k) => k.slice("permissions.deny:".length));
    const newDeny = (deny ?? []).filter((v) => !(typeof v === "string" && prevDeny.includes(v) && !want.deny.includes(v)));
    for (const v of want.deny) if (!newDeny.includes(v)) newDeny.push(v);
    if (deny !== void 0 || newDeny.length) data.permissions = { ...perms ?? {}, deny: newDeny };
    const scripts = want.hooks.map((h) => h.script).filter((s) => Boolean(s));
    const desired = desiredGroups(want.hooks);
    const src = hooks ?? {};
    const outHooks = {};
    const events = [...Object.keys(src), ...[...desired.keys()].filter((e) => !Object.hasOwn(src, e))];
    for (const event of events) {
      const arr = Object.hasOwn(src, event) ? src[event] : [];
      if (!Array.isArray(arr)) {
        if (desired.has(event)) return fail(`hooks.${event} 가 배열이 아니다`);
        outHooks[event] = arr;
        continue;
      }
      const { out, first } = stripHooks(arr, (h) => isKitHook(h, scripts));
      const groups = desired.get(event) ?? [];
      const at = first ?? out.length;
      const next = [...out.slice(0, at), ...groups, ...out.slice(at)];
      if (!next.length && arr.length) continue;
      outHooks[event] = next;
    }
    if (hooks !== void 0 || Object.keys(outHooks).length) data.hooks = outHooks;
    const keys = [...want.deny.map((v) => `permissions.deny:${v}`), ...want.hooks.map((h) => `hooks.${h.event}:${h.id}`)];
    return { ok: true, text: dump(data), keys, created: cur === null };
  },
  unmerge(cur, keys, want) {
    const parsed2 = parseObject(cur);
    if (typeof parsed2 === "string") return fail(parsed2);
    const data = { ...parsed2 };
    const byId = new Map(want.hooks.map((h) => [h.id, h.script]));
    const ids = keys.filter((k) => k.startsWith("hooks.") && k.includes(":")).map((k) => k.slice(k.indexOf(":") + 1));
    const hooks = data.hooks;
    if (isObj2(hooks)) {
      const out = {};
      for (const [event, arr] of Object.entries(hooks)) {
        if (!Array.isArray(arr)) {
          out[event] = arr;
          continue;
        }
        const next = stripHooks(arr, (h) => ids.some((i) => hookMatches(h, i, byId.get(i)))).out;
        if (!next.length && arr.length) continue;
        out[event] = next;
      }
      if (Object.keys(out).length || !Object.keys(hooks).length) data.hooks = out;
      else delete data.hooks;
    }
    const denyVals = keys.filter((k) => k.startsWith("permissions.deny:")).map((k) => k.slice("permissions.deny:".length));
    const perms = data.permissions;
    if (isObj2(perms) && Array.isArray(perms.deny)) {
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
    const byId = new Map(want.hooks.map((h) => [h.id, h.script]));
    const deny = isObj2(data.permissions) ? data.permissions.deny : void 0;
    const hooks = isObj2(data.hooks) ? data.hooks : {};
    return keys.filter((k) => {
      if (k.startsWith("permissions.deny:")) return !Array.isArray(deny) || !deny.includes(k.slice("permissions.deny:".length));
      if (k.startsWith("hooks.") && k.includes(":")) {
        const rest = k.slice("hooks.".length);
        const event = rest.slice(0, rest.indexOf(":"));
        const id = rest.slice(rest.indexOf(":") + 1);
        const arr = hooks[event];
        const items = Array.isArray(arr) ? arr.flatMap((g) => isObj2(g) && Array.isArray(g.hooks) ? g.hooks : []) : [];
        return !items.some((h) => hookMatches(h, id, byId.get(id)));
      }
      return false;
    });
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
function walkView(view, rel, prefix = "") {
  const out = [];
  for (const e of view.list(rel) ?? []) {
    if (ignoredName(e.name)) continue;
    const sub = prefix ? `${prefix}/${e.name}` : e.name;
    const full9 = rel ? `${rel}/${e.name}` : e.name;
    if (e.kind === "dir") out.push(...walkView(view, full9, sub));
    else if (e.kind === "file") out.push({ rel: sub, bytes: view.read(full9), executable: view.executable(full9) });
  }
  return out.sort((a, b) => byteCompare(a.rel, b.rel));
}
function hasPendingNew(view, rel) {
  const k = view.kind(rel);
  if (k === "file") return view.kind(`${rel}.new`) !== "none";
  if (k !== "dir") return false;
  for (const e of view.list(rel) ?? []) {
    const sub = `${rel}/${e.name}`;
    if (e.kind === "file" && e.name.endsWith(".new")) return true;
    if (e.kind === "dir" && hasPendingNew(view, sub)) return true;
  }
  return false;
}
function loadSources(view) {
  const src = { rules: [], skills: [], roles: [], policy: parsePolicy(null), deferred: /* @__PURE__ */ new Set() };
  for (const e of view.list(".agents/rules") ?? []) {
    if (!e.name.endsWith(".md") || ignoredName(e.name) || e.kind !== "file") continue;
    const rel = `.agents/rules/${e.name}`;
    src.rules.push(parseRule(rel, view.read(rel)));
    if (hasPendingNew(view, rel)) src.deferred.add(rel);
  }
  for (const e of view.list(".agents/skills") ?? []) {
    const rel = `.agents/skills/${e.name}`;
    if (ignoredName(e.name) || e.name.startsWith(".") || e.kind !== "dir" || view.kind(`${rel}/SKILL.md`) !== "file") continue;
    src.skills.push(parseSkill(rel, walkView(view, rel)));
    if (hasPendingNew(view, rel)) src.deferred.add(rel);
  }
  for (const e of view.list(".agents/roles") ?? []) {
    if (!e.name.endsWith(".md") || ignoredName(e.name) || e.kind !== "file") continue;
    const rel = `.agents/roles/${e.name}`;
    src.roles.push(parseRole(rel, view.read(rel)));
    if (hasPendingNew(view, rel)) src.deferred.add(rel);
  }
  const policy = view.read(".agents/model-policy.json");
  src.policy = parsePolicy(policy === null ? null : policy.toString("utf8"));
  return src;
}

// src/adapters/wants.ts
function stem(source) {
  const base = source.slice(source.lastIndexOf("/") + 1);
  return base.endsWith(".md") ? base.slice(0, -".md".length) : base;
}
function mirrorDir(path28, harness, skill, deferred) {
  const t = treeSha(skill.files);
  return { op: "mirror", path: path28, harness, from: skill.source, kind: "dir", files: skill.files, data: Buffer.alloc(0), executable: false, sha256: t, fromSha256: t, deferred: deferred.has(skill.source) };
}
function mirrorFile(path28, harness, rule, view, deferred) {
  const s = sha256(rule.data);
  return { op: "mirror", path: path28, harness, from: rule.source, kind: "file", files: [], data: rule.data, executable: view.executable(rule.source), sha256: s, fromSha256: s, deferred: deferred.has(rule.source) };
}
function renderWant(path28, harness, from, text, sourceData, deferred) {
  const data = Buffer.from(text, "utf8");
  return { op: "render", path: path28, harness, from, kind: "file", files: [], data, executable: false, sha256: sha256(data), fromSha256: sha256(sourceData), deferred: deferred.has(from) };
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
  checkedVersion: "2.1",
  plan(ctx) {
    const d = ctx.sources.deferred;
    return [
      ...ctx.skills.map((s) => mirrorDir(`.claude/skills/${stem(s.source)}`, "claude", s, d)),
      ...ctx.rules.map((r) => mirrorFile(`.claude/rules/${stem(r.source)}.md`, "claude", r, ctx.view, d)),
      ...ctx.roles.map(({ role, fields }) => renderWant(`.claude/agents/${stem(role.source)}.md`, "claude", role.source, renderClaudeRole(role, fields.claude ?? {}), role.data, d)),
      { op: "merge", path: "CLAUDE.md", harness: "claude", kind: "claude-md", want: claudeMdWant(ctx.spec) },
      { op: "merge", path: ".claude/settings.json", harness: "claude", kind: "settings", want: settingsWant(ctx.spec, ctx.tokens) }
    ];
  }
};

// src/adapters/codex.ts
var codex = {
  id: "codex",
  label: "Codex",
  checkedVersion: "0.1",
  plan(ctx) {
    const d = ctx.sources.deferred;
    const live = ctx.roles.filter(({ role }) => !d.has(role.source)).map(({ role }) => ({ name: stem(role.source), description: role.description }));
    const keep = ctx.roles.filter(({ role }) => d.has(role.source)).map(({ role }) => stem(role.source));
    return [
      ...ctx.roles.map(({ role, fields }) => renderWant(`.codex/agents/${stem(role.source)}.toml`, "codex", role.source, renderCodexRole(role, fields.codex ?? {}, ctx.spec), role.data, d)),
      { op: "merge", path: ".codex/config.toml", harness: "codex", kind: "codex-config", want: codexConfigWant(ctx.spec, live, keep) }
    ];
  }
};

// src/adapters/cursor.ts
var cursor = {
  id: "cursor",
  label: "Cursor",
  checkedVersion: "1.7",
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
  checkedVersion: "0.9",
  plan(ctx) {
    const d = ctx.sources.deferred;
    const ds = withSkillFiles(d);
    return [
      ...ctx.skills.map((s) => mirrorDir(`.kiro/skills/${stem(s.source)}`, "kiro", s, d)),
      ...ctx.rules.map((r) => renderWant(`.kiro/steering/${stem(r.source)}.md`, "kiro", r.source, renderKiroRule(r), r.data, d)),
      ...ctx.skills.map((s) => renderWant(`.kiro/steering/${stem(s.source)}.md`, "kiro", `${s.source}/SKILL.md`, renderKiroSkillSteering(s), skillData(s), ds)),
      ...ctx.roles.map(({ role, fields }) => renderWant(`.kiro/agents/${stem(role.source)}.json`, "kiro", role.source, renderKiroRole(role, fields.kiro ?? {}, ctx.spec), role.data, d))
    ];
  }
};

// src/adapters/index.ts
var ADAPTERS = [claude, codex, cursor, kiro];

// src/core/remove.ts
var import_node_fs7 = __toESM(require("node:fs"));
var import_node_path4 = __toESM(require("node:path"));
function full(target, rel) {
  return import_node_path4.default.join(target, ...rel.split("/"));
}
function removeFile(target, rel) {
  import_node_fs7.default.rmSync(full(target, rel), { force: true });
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

// src/projection/view.ts
var import_node_fs8 = __toESM(require("node:fs"));
var import_node_path5 = __toESM(require("node:path"));
function full2(root, rel) {
  return rel === "" ? root : import_node_path5.default.join(root, ...rel.split("/"));
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
  kind(rel) {
    try {
      return kindOf(import_node_fs8.default.lstatSync(full2(this.root, rel)));
    } catch {
      return "none";
    }
  }
  list(rel) {
    if (this.kind(rel) !== "dir") return null;
    return import_node_fs8.default.readdirSync(full2(this.root, rel)).sort(byteCompare).map((name) => ({ name, kind: this.kind(rel ? `${rel}/${name}` : name) }));
  }
  read(rel) {
    return this.kind(rel) === "file" ? import_node_fs8.default.readFileSync(full2(this.root, rel)) : null;
  }
  executable(rel) {
    try {
      return (import_node_fs8.default.lstatSync(full2(this.root, rel)).mode & 64) !== 0;
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
    for (const rel of writes.keys()) {
      const parts = rel.split("/");
      for (let i = 1; i < parts.length; i += 1) this.dirs.add(parts.slice(0, i).join("/"));
    }
  }
  base;
  writes;
  deletes;
  dirs = /* @__PURE__ */ new Set();
  kind(rel) {
    if (this.writes.has(rel)) return "file";
    if (this.dirs.has(rel)) return "dir";
    if (this.deletes.has(rel)) return "none";
    return this.base.kind(rel);
  }
  list(rel) {
    if (this.kind(rel) !== "dir") return null;
    const names = /* @__PURE__ */ new Set();
    for (const e of this.base.list(rel) ?? []) names.add(e.name);
    const prefix = rel ? `${rel}/` : "";
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
  read(rel) {
    const w = this.writes.get(rel);
    if (w) return w.content;
    if (this.deletes.has(rel)) return null;
    return this.base.read(rel);
  }
  executable(rel) {
    const w = this.writes.get(rel);
    if (w) return w.executable;
    return this.base.executable(rel);
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
  return { ...args, sources, skills, roles, rules: sources.rules, findings };
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
function full3(target, rel) {
  return import_node_path6.default.join(target, ...rel.split("/"));
}
function lstat(p) {
  try {
    return import_node_fs9.default.lstatSync(p);
  } catch {
    return null;
  }
}
function blocked(target, rel) {
  let cur = target;
  for (const part of rel.split("/").slice(0, -1)) {
    cur = import_node_path6.default.join(cur, part);
    const st = lstat(cur);
    if (st && (st.isSymbolicLink() || !st.isDirectory())) return true;
  }
  return false;
}
function stateOf(target, rel, isDir2) {
  if (blocked(target, rel)) return { kind: "other", what: "상위 경로가 폴더가 아니다" };
  const st = lstat(full3(target, rel));
  if (!st) return { kind: "none" };
  if (st.isSymbolicLink()) return { kind: "link" };
  if (isDir2) {
    if (!st.isDirectory()) return { kind: "other", what: "폴더 자리에 파일이 있다" };
    const files = walkView(new FsView(full3(target, rel)), "");
    return { kind: "file", sha: treeSha(files), files: new Map(files.map((f) => [f.rel, f.bytes])) };
  }
  if (!st.isFile()) return { kind: "other", what: "같은 이름의 폴더가 있다" };
  const data = import_node_fs9.default.readFileSync(full3(target, rel));
  return { kind: "file", sha: sha256(data), data };
}
function readTextAt(target, rel) {
  const st = lstat(full3(target, rel));
  return st?.isFile() ? import_node_fs9.default.readFileSync(full3(target, rel), "utf8") : null;
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
  if (kind === "settings") return settingsWant(spec, tokens);
  if (kind === "codex-config") return codexConfigWant(spec, (sources?.roles ?? []).map((r) => ({ name: r.source.slice(r.source.lastIndexOf("/") + 1, -".md".length), description: r.description })));
  return gitattributesWant(spec, ALL_HARNESSES);
}
function differing(w, cur) {
  const have = cur.kind === "file" ? cur.files ?? /* @__PURE__ */ new Map() : /* @__PURE__ */ new Map();
  return w.files.filter((f) => !have.get(f.rel)?.equals(f.bytes)).map((f) => f.rel);
}
function extraFiles(w, cur) {
  const wanted2 = new Set(w.files.map((f) => f.rel));
  return cur.kind === "file" && cur.files ? [...cur.files.keys()].filter((rel) => !wanted2.has(rel)) : [];
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
    return shas.size > 0 && [...files].every(([rel, data]) => shas.has(rel) && shas.get(rel) !== null && sha256(data) === shas.get(rel));
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
      const backups = w.kind !== "dir" ? [`${w.path}.bak`] : [...differing(w, cur), ...extraFiles(w, cur)].filter((rel) => have.has(rel)).map((rel) => `${w.path}/${rel}.bak`);
      this.write(w, "replace", void 0, backups);
      return;
    }
    const newFiles = w.kind !== "dir" ? [`${w.path}.new`] : differing(w, cur).map((rel) => `${w.path}/${rel}.new`);
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
    const q = import_node_path6.default.join(p, ...f.rel.split("/"));
    if (!sameFile(q, f.bytes, f.executable)) writeFileAtomic(q, f.bytes, f.executable);
  }
  removeEmptySubdirs(p);
}
function removeTarget(target, rel, dir) {
  const p = full3(target, rel);
  const st = lstat(p);
  if (dir && st?.isDirectory() && !st.isSymbolicLink()) {
    const files = walkView(new FsView(p), "").map((f) => `${rel}/${f.rel}`);
    for (const f of files) import_node_fs9.default.unlinkSync(full3(target, f));
    removeEmptySubdirs(p);
    removeEmptyDirs(target, [...files, `${rel}/x`]);
    return;
  }
  if (st && (st.isFile() || st.isSymbolicLink())) import_node_fs9.default.unlinkSync(p);
  removeEmptyDirs(target, [rel]);
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
var FORBIDDEN_ENV = /* @__PURE__ */ new Set(["ANTHROPIC_MODEL", "CLAUDE_CODE_EFFORT_LEVEL", "MAX_THINKING_TOKENS", "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "CLAUDE_CODE_SUBAGENT_EFFORT"]);
var FORBIDDEN_CODEX = /* @__PURE__ */ new Set(["model", "model_reasoning_effort", "model_reasoning_summary", "model_verbosity", "model_provider", "profile", "profiles", "default_subagent_model", "default_subagent_reasoning_effort"]);
function bad2(message) {
  return new CliError(EXIT.ENV, `projection.json: ${message}`, "킷 템플릿을 다시 받는다");
}
function walk(v, at) {
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${at}[${i}]`));
    return;
  }
  if (v === null || typeof v !== "object") return;
  for (const [k, x] of Object.entries(v)) {
    if (FORBIDDEN_CLAUDE.has(k) && !at.endsWith(".hook")) throw bad2(`${at}.${k}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)`);
    if (at.endsWith(".env") && (FORBIDDEN_ENV.has(k) || k.startsWith("ANTHROPIC_DEFAULT_") && k.endsWith("_MODEL"))) throw bad2(`${at}.${k}: 사람 세션의 모델 환경변수를 쓰지 않는다(12 §3.1)`);
    walk(x, `${at}.${k}`);
  }
}
function parseSpec(text) {
  let raw;
  try {
    raw = JSON.parse(text);
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
function existing(full9) {
  const st = lstatOrNull(full9);
  if (!st) return { kind: "none" };
  if (st.isSymbolicLink()) return { kind: "other", what: "링크다" };
  if (st.isDirectory()) return { kind: "other", what: "같은 이름의 폴더가 있다" };
  if (!st.isFile()) return { kind: "other", what: "일반 파일이 아니다" };
  return { kind: "file", bytes: import_node_fs11.default.readFileSync(full9), executable: (st.mode & 64) !== 0 };
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
      cur = import_node_path8.default.join(cur, part);
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
      real = import_node_fs11.default.realpathSync(dir);
    } catch {
      throw new CliError(EXIT.STATE, `설치 경로의 상위 폴더가 끊어진 링크다: ${rel}`, `${dir} 를 확인한다`);
    }
    if (!isInside(real, this.targetReal)) {
      throw new CliError(EXIT.STATE, `설치 경로가 링크를 따라 리포 밖으로 나간다: ${rel}`, `${dir} → ${real}`);
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
  const { layout, templatesDir, target, selection, tokens, mode } = args;
  const res = resolveCandidates(layout, templatesDir, selection, tokens);
  const ancestors = import_node_fs11.default.existsSync(target) ? new AncestorCheck(target, import_node_fs11.default.realpathSync(target)) : null;
  const ops = res.winners.map((c) => {
    assertSafeRelPath(c.dest);
    const content = substitute(readTemplate(templatesDir, c.src), tokens, layout.tokens);
    const executable = isExecutable(layout, c.dest);
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
function detectHarnesses(layout, target, env) {
  const byDir = layout.harnesses.filter((h) => (layout.harnessDetect[h]?.dirs ?? []).some((d) => isDir(import_node_path9.default.join(target, d))));
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
    if (!isDir(import_node_path9.default.join(templatesDir, "optional", m))) {
      throw new CliError(EXIT.ENV, `모듈 템플릿이 없다: ${import_node_path9.default.join(templatesDir, "optional", m)}`);
    }
  }
  return { stack, arch, domain, lang, agents, agentsOrigin, modules };
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
function selectionFromMeta(layout, templatesDir, meta) {
  if (!listStacks(templatesDir).includes(meta.stack)) {
    throw new CliError(EXIT.STATE, `이 킷에 없는 스택이다: '${meta.stack}'`, "메타의 stack 을 고치거나 그 스택이 있는 킷 판을 쓴다");
  }
  if (!listArchs(templatesDir, meta.stack).includes(meta.arch)) {
    throw new CliError(EXIT.STATE, `이 킷에 없는 변형이다: '${meta.arch}' (스택 ${meta.stack})`, "메타의 arch 를 고치거나 그 변형이 있는 킷 판을 쓴다");
  }
  const modules = meta.modules.filter((m) => isDir(import_node_path10.default.join(templatesDir, "optional", m)));
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
  const defaults = resolveTokens(layout, sel, { flags, env: {}, targetBasename: import_node_path10.default.basename(target) });
  return Object.fromEntries(layout.tokens.map((k) => [k, fixed.get(k) ?? defaults[k] ?? ""]));
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
function parseNames(layout, raw, command) {
  const words = raw.flatMap((r) => r.split(/[\s,]+/)).filter(Boolean);
  const choices = `하네스: ${layout.harnesses.join(" ")} · 모듈: ${layout.modules.join(" ")}`;
  if (words.length === 0) throw usageError(`${command}: 이름이 없다`, `harness-kit ${command} <이름>… (${choices})`);
  const later = words.find((w) => Object.hasOwn(LATER_MODULES, w));
  if (later) throw usageError(`'${later}' 모듈은 아직 없다 — ${LATER_MODULES[later]}에서 제공한다`, choices);
  if (words.some((w) => w === "all" || w === "none")) throw usageError(`${command}: all · none 은 받지 않는다(하네스인지 모듈인지 갈리지 않는다)`, choices);
  const unknown = words.filter((w) => !layout.harnesses.includes(w) && !layout.modules.includes(w));
  if (unknown.length) throw usageError(`${command}: 모르는 이름 ${unknown.join(" ")}`, choices);
  const uniq = words.filter((w, i) => words.indexOf(w) === i);
  return { harnesses: uniq.filter((w) => layout.harnesses.includes(w)), modules: uniq.filter((w) => layout.modules.includes(w)) };
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
function winnerLayers(layout, templatesDir, sel, tokens) {
  return new Map(resolveCandidates(layout, templatesDir, sel, tokens).winners.map((c) => [c.dest, c.layer]));
}
function shareOf(layout, templatesDir, after, names, tokens, afterLayers) {
  const share = /* @__PURE__ */ new Set();
  const each = [...names.harnesses.map((h) => ({ harnesses: [h], modules: [] })), ...names.modules.map((m) => ({ harnesses: [], modules: [m] }))];
  for (const one of each) {
    const without = winnerLayers(layout, templatesDir, withoutNames(after, one), tokens);
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
  "forget"
];
function full4(target, rel) {
  return import_node_path13.default.join(target, ...rel.split("/"));
}
function current(ctx, rel) {
  if (ctx.ancestors.state(rel) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(full4(ctx.target, rel));
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
function sideState(ctx, rel) {
  return existing(full4(ctx.target, rel)).kind;
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
var import_node_fs18 = __toESM(require("node:fs"));
var import_node_path19 = __toESM(require("node:path"));

// src/cli/context.ts
var import_node_path14 = __toESM(require("node:path"));
function targetOf(ctx) {
  const cwd = ctx.values.cwd;
  return import_node_path14.default.resolve(ctx.io.cwd, typeof cwd === "string" ? cwd : ".");
}
function today(io2) {
  if (io2.today) return io2.today;
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// src/core/apply.ts
var import_node_child_process = require("node:child_process");
var import_node_fs14 = __toESM(require("node:fs"));
var import_node_path15 = __toESM(require("node:path"));
var FEATURE_DOCS = "tools/docs/feature_docs.py";
function full5(target, rel) {
  return import_node_path15.default.join(target, ...rel.split("/"));
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
  let current3 = "";
  try {
    current3 = target;
    import_node_fs14.default.mkdirSync(target, { recursive: true });
    for (const op of plan.ops) {
      if (op.action !== "create" && op.action !== "replace") continue;
      current3 = op.path;
      writeFileAtomic(full5(target, op.path), op.content, op.executable);
      written += 1;
    }
    for (const g of plan.generated) {
      if (g.action !== "create" && g.action !== "replace") continue;
      current3 = g.path;
      writeFileAtomic(full5(target, g.path), g.content, false);
    }
    current3 = "배치(mirror · render · merge)";
    if (plan.projection) applyProjection(target, plan.projection.ops);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current3}`);
  }
  const featureDocs = featureDocsAllowed(plan) ? buildFeatureDocs(target, env) : { status: "skipped", reason: "tools/docs/ 에 킷 판이 아닌 파일이 있다" };
  try {
    current3 = LOCK_REL;
    writeFileAtomic(full5(target, LOCK_REL), Buffer.from(lockText2, "utf8"), false);
    current3 = META_REL;
    writeFileAtomic(full5(target, META_REL), Buffer.from(metaText, "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current3}`);
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
var import_node_fs17 = __toESM(require("node:fs"));
var import_node_path18 = __toESM(require("node:path"));

// src/core/board.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs16 = __toESM(require("node:fs"));
var import_node_path17 = __toESM(require("node:path"));
var BOARD_SCRIPT = "scripts/board.sh";
function isBoardCode(rel) {
  return rel === BOARD_SCRIPT || rel === "scripts/sdd-layout.py" || rel.startsWith("scripts/harness/");
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
  const check = (0, import_node_child_process2.spawnSync)("bash", [BOARD_SCRIPT, "--check"], opts);
  if (!check.error && check.status === 0) return { status: "ok" };
  const build = (0, import_node_child_process2.spawnSync)("bash", [BOARD_SCRIPT], opts);
  if (!build.error && build.status === 0) return { status: "rebuilt" };
  const tail = (build.stderr ?? "").trim().split("\n").slice(-2).join(" / ");
  return { status: "failed", reason: tail || (build.error ? build.error.message : `exit ${String(build.status)}`) };
}
function boardLine(r) {
  if (r.status === "rebuilt") return "  ✎ SDD 보드를 새 형식으로 다시 만들었다: .agents/docs/specs-index.md";
  if (r.status === "failed") return `  ⚠ SDD 보드를 다시 만들지 못했다 — 'bash ${BOARD_SCRIPT}' 의 오류를 고친 뒤 다시 실행한다 (${r.reason})`;
  return null;
}

// src/commands/update.ts
var V1_LOCK_BACKUP = ".agents/state/harness-kit.lock.v1.bak";
var LATER_FLAGS = {
  packs: "--packs(팩 갱신)는 P18(확장 층, 설계 04)에서 제공한다",
  tools: "--tools(외부 도구 갱신)는 P22(외부 도구 모듈, 설계 10)에서 제공한다"
};
function full6(target, rel) {
  return import_node_path18.default.join(target, ...rel.split("/"));
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
function opJson(o) {
  const j = { path: o.path, op: o.op, owner: o.owner, layer: o.layer, action: o.action };
  if (NEEDS_DATA.has(o.action)) j.executable = o.executable;
  if (o.reason !== void 0) j.reason = o.reason;
  if (o.newFile !== void 0) j.new = o.newFile;
  if (o.newRefreshed) j.newRefreshed = true;
  if (o.backup !== void 0) j.backup = o.backup;
  if (o.modified !== void 0) j.modified = o.modified;
  return j;
}
function opLine(o) {
  let extra = "";
  if (o.action === "conflict") extra = o.newFile ? `  → ${o.newFile}${o.newRefreshed ? " (갱신)" : ""}` : "";
  else if (o.action === "replace") extra = `  (수정본 → ${o.backup})`;
  else if (o.action === "orphan" && o.modified) extra = "  (고친 파일)";
  return `  ${o.action.padEnd(13)} ${o.path}${extra}${o.reason ? `  ${o.reason}` : ""}`;
}
function countsLine(c) {
  const skipped = c["skip-user"] + c["skip-external"] + c["skip-pack"];
  return `  파일: 새로 ${c.new} · 되살림 ${c.restore} · 교체 ${c.update} · 같음 ${c.same} · 충돌 ${c.conflict} · 덮음(.bak) ${c.replace} · 킷에서 빠짐 ${c.orphan} · 지움 ${c.delete} · 건너뜀 ${skipped} · 받지 않기로 함 ${c.forget}`;
}
function selectionLine(sel) {
  return `  선택: ${sel.stack} · ${sel.arch} · ${sel.domain || "도메인 없음"} · 하네스 ${sel.agents.join(",")} · 모듈 ${sel.modules.join(",") || "none"}`;
}
function applyUpdate(target, plan, w, projection) {
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
    current3 = "배치(mirror · render · merge)";
    if (projection) applyProjection(target, projection.ops);
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
function humanLines(ctx, head, plan, shown, conflicts, dryRun, board) {
  const lines = [...head, ...shown.map(opLine), countsLine(plan.counts)];
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
function writtenState(ctx, target, inst, entries, sel, tokens, source) {
  const lockText2 = serializeLock({ schema: "harness-kit.lock/v2", kit: { version: VERSION, source }, packs: inst.lock.packs, entries });
  const meta = mergeMetaForUpdate(inst.meta, { version: VERSION, selection: sel, tokens, today: today(ctx.io) });
  const manifest = lstatOrNull(full6(target, MANIFEST_PATH)) ? null : manifestContent(sel, tokens);
  const v1Backup = inst.lockFormat === "v1" ? import_node_fs17.default.readFileSync(full6(target, LOCK_REL)) : null;
  return { lockText: lockText2, metaText: serializeMeta(meta), manifest, v1Backup };
}
var ANY_SKIP = /* @__PURE__ */ new Set(["conflict", "skip-user", "skip-external", "skip-pack"]);
function boardBlocker(plan) {
  return plan.ops.find((o) => isBoardCode(o.path) && ANY_SKIP.has(o.action))?.path ?? null;
}
var AMBIGUOUS_ACTIONS = /* @__PURE__ */ new Set(["conflict", "replace", "orphan"]);
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
  const shaOf2 = () => new Map([...wanted({ layout, templatesDir: loc.dir, selection, tokens }).want].map(([p, d]) => [p, d.sha256]));
  const { lock, ambiguous } = resolvedLock(inst, target, shaOf2);
  const acceptAll = bool(ctx.values, "accept-all");
  const raw = buildUpdatePlan({ layout, templatesDir: loc.dir, target, selection, tokens, lock, acceptAll, prune, forget: list(ctx.values, "forget") });
  const marked = { ...raw, ops: raw.ops.map((o) => ambiguous.has(o.path) && AMBIGUOUS_ACTIONS.has(o.action) && !o.reason ? { ...o, reason: AMBIGUOUS_REASON } : o) };
  const projection = projectionForUpdate({ target, templatesDir: loc.dir, tokens, agents: selection.agents, inst, plan: marked, acceptAll });
  const plan = withoutClaimed(marked, projection?.plan ?? null);
  const entries = projection ? mergeEntries(plan.entries, projection.plan) : [...plan.entries, ...inst.lock.entries.filter((e) => PROJECTION_OPS.has(e.op))];
  const dryRun = bool(ctx.values, "dry-run");
  const w = writtenState(ctx, target, inst, entries, selection, tokens, loc.source);
  if (!dryRun) applyUpdate(target, plan, w, projection?.plan ?? null);
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
    counts: counts2,
    ops: shown.map(opJson),
    conflicts,
    generated: w.manifest ? [{ path: MANIFEST_PATH, action: "create" }] : [],
    board,
    state: [META_REL, LOCK_REL, ...w.v1Backup ? [V1_LOCK_BACKUP] : []]
  };
  if (projection) data.projection = projectionData(projection.plan, projection.findings);
  const head = [
    `harness-kit update — ${target}`,
    `  킷: ${inst.meta.kit.version} → ${VERSION} · 메타 ${inst.metaFormat} · lock ${inst.lockFormat}`,
    selectionLine(selection),
    ...droppedModules.length ? [`  ⚠ 킷에 없는 모듈을 뺀다: ${droppedModules.join(", ")}`] : []
  ];
  const lines = humanLines(ctx, head, plan, shown, conflicts, dryRun, board);
  if (projection) lines.splice(head.length + shown.length + 1, 0, ...projectionLines(projection.plan, projection.findings, ctx.quiet));
  else if (inst.lock.entries.some((e) => PROJECTION_OPS.has(e.op))) lines.splice(head.length + shown.length + 1, 0, "  배치: 이 템플릿에 projection.json 이 없다 — 배치 항목은 그대로 둔다");
  return { code, data, lines };
}
function projectionForUpdate(args) {
  const spec = loadSpecOrNull(args.templatesDir);
  if (!spec) return null;
  const writes = /* @__PURE__ */ new Map();
  const deletes = /* @__PURE__ */ new Set();
  for (const o of args.plan.ops) {
    if ((o.action === "new" || o.action === "restore" || o.action === "update" || o.action === "replace") && o.content) writes.set(o.path, { content: o.content, executable: o.executable === true });
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
  const cmp = compareSemver(inst.meta.kit.version, VERSION);
  if (cmp !== null && cmp > 0) {
    throw new CliError(EXIT.STATE, `설치된 킷(${inst.meta.kit.version})이 이 CLI(${VERSION})보다 새것이다`, "새 CLI 로 다시 실행한다");
  }
  const { loc, layout } = kit;
  const { selection, droppedModules } = selectionFromMeta(layout, loc.dir, inst.meta);
  return { target, inst, layout, loc, before: selection, tokens: tokensFromMeta(layout, selection, inst.meta, io2.env, target), droppedModules };
}
function currentOf(target, ancestors, rel) {
  if (ancestors.state(rel) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(import_node_path19.default.join(target, ...rel.split("/")));
  return cur.kind === "file" ? { kind: "file", sha: sha256(cur.bytes) } : cur;
}
function ancestorsOf(target) {
  return new AncestorCheck(target, import_node_fs18.default.realpathSync(target));
}
var isKitCopy = (e) => ownerKind2(e.owner) === "kit" && e.op === "copy";
function manifestChange(l, ancestors, after) {
  if (l.before.agents.join(",") === after.agents.join(",")) return null;
  const want = manifestContent(after, l.tokens);
  if (ancestors.state(MANIFEST_PATH) === "blocked") return { action: "conflict", content: want };
  const cur = existing(import_node_path19.default.join(l.target, ...MANIFEST_PATH.split("/")));
  if (cur.kind === "none") return { action: "create", content: want };
  if (cur.kind === "file" && cur.bytes.equals(want)) return { action: "same", content: want };
  if (cur.kind === "file" && cur.bytes.equals(manifestContent(l.before, l.tokens))) return { action: "replace", content: want };
  const neu = `${MANIFEST_PATH}.new`;
  return existing(import_node_path19.default.join(l.target, ...neu.split("/"))).kind === "other" ? { action: "conflict", content: want } : { action: "conflict", content: want, newFile: neu };
}
function featureDocsAllowed2(target, entries) {
  const docs = entries.filter((e) => e.path.startsWith(`${import_node_path19.default.posix.dirname(FEATURE_DOCS)}/`));
  if (!docs.some((e) => e.path === FEATURE_DOCS)) return false;
  return docs.every((e) => {
    if (!isKitCopy(e) || !e.sha256) return false;
    const cur = existing(import_node_path19.default.join(target, ...e.path.split("/")));
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
  const full9 = (rel) => import_node_path19.default.join(target, ...rel.split("/"));
  let current3 = "";
  try {
    const deleted = [];
    for (const o of r.ops) {
      current3 = o.path;
      if ((o.action === "create" || o.action === "restore" || o.action === "update") && o.content) writeFileAtomic(full9(o.path), o.content, o.executable === true);
      else if (o.action === "conflict" && o.newFile && o.content) writeFileAtomic(full9(o.newFile), o.content, false);
      else if (o.action === "delete") {
        removeFile(target, o.path);
        deleted.push(o.path);
        if (o.alsoNew) removeFile(target, o.alsoNew);
      }
    }
    removeEmptyDirs(target, deleted);
    current3 = "배치(mirror · render · merge)";
    if (r.projection) applyProjection(target, r.projection.ops);
    const m = r.manifest;
    current3 = MANIFEST_PATH;
    if (m && (m.action === "create" || m.action === "replace")) writeFileAtomic(full9(MANIFEST_PATH), m.content, false);
    if (m?.action === "conflict" && m.newFile) writeFileAtomic(full9(m.newFile), m.content, false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current3}`);
  }
  const docs = featureDocsAllowed2(target, r.entries) ? buildFeatureDocs(target, ctx.io.env) : { status: "skipped", reason: "tools/docs/ 에 킷 판이 아닌 파일이 있다" };
  const entries = r.projection ? mergeEntries(r.entries, r.projection) : r.entries;
  const lockText2 = serializeLock({ schema: "harness-kit.lock/v2", kit: { version: inst.lock.kit.version ?? inst.meta.kit.version, source: inst.lock.kit.source }, packs: inst.lock.packs, entries });
  const meta = mergeMetaForUpdate(inst.meta, { version: inst.meta.kit.version, selection: after, tokens: l.tokens, today: today(ctx.io) });
  const state = [
    ...inst.lockFormat === "v1" ? [[V1_LOCK_BACKUP, import_node_fs18.default.readFileSync(full9(LOCK_REL))]] : [],
    [LOCK_REL, Buffer.from(lockText2, "utf8")],
    [META_REL, Buffer.from(serializeMeta(meta), "utf8")]
  ];
  try {
    for (const [rel, data] of state) {
      current3 = rel;
      writeFileAtomic(full9(rel), data, false);
    }
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current3}`);
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
  assertModuleDirs(kit.loc.dir, names.modules);
  const l = loadForChange(ctx, "add", kit);
  const already = [...names.harnesses.filter((h) => l.before.agents.includes(h)), ...names.modules.filter((m) => l.before.modules.includes(m))];
  const { after, result } = planAdd(l, names);
  const dryRun = dryRunOf(ctx);
  const featureDocs = dryRun ? null : applyChange(ctx, l, after, result);
  const notes = already.length ? [`  · 이미 켜져 있다 — 그 몫에서 빠진 파일만 채운다: ${already.join(", ")}`] : [];
  const { data, lines } = report(ctx, l, { command: "add", names: { ...names, already }, after, result, dryRun, featureDocs, notes });
  const conflict = result.ops.some((o) => o.action === "conflict") || result.manifest?.action === "conflict" || needsHuman(result.projection ?? null, result.projectionFindings ?? []);
  return { code: conflict ? EXIT.HUMAN : EXIT.OK, data, lines };
}

// src/commands/doctor.ts
var import_node_fs20 = __toESM(require("node:fs"));
var import_node_path21 = __toESM(require("node:path"));

// src/projection/check.ts
var import_node_fs19 = __toESM(require("node:fs"));
var import_node_path20 = __toESM(require("node:path"));
var PROJECTION_KINDS = ["stale", "symlink-found", "merge-missing", "relative-ref", "skill-model-field", "role-model-locked", "pending-new", "steering-size", "layout-conflict"];
var LIMIT = 24 * 1024;
var SOURCE_DIRS = [".agents/rules/", ".agents/skills/", ".agents/roles/"];
function lstat2(p) {
  try {
    return import_node_fs19.default.lstatSync(p);
  } catch {
    return null;
  }
}
function currentSha(p, isDir2) {
  const st = lstat2(p);
  if (!st || st.isSymbolicLink()) return null;
  if (isDir2) return st.isDirectory() ? treeSha(walkView(new FsView(p), "")) : null;
  return st.isFile() ? sha256(import_node_fs19.default.readFileSync(p)) : null;
}
function linksInside(p, prefix = "") {
  const st = lstat2(p);
  if (!st?.isDirectory() || st.isSymbolicLink()) return [];
  const out = [];
  for (const name of import_node_fs19.default.readdirSync(p).sort()) {
    const q = import_node_path20.default.join(p, name);
    const s = lstat2(q);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (s?.isSymbolicLink()) out.push(rel);
    else if (s?.isDirectory()) out.push(...linksInside(q, rel));
  }
  return out.sort();
}
function hasRelativeRef(text) {
  const stripped = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return /\[[^\]]*\]\((\.\.\/[^)\s]*)\)/.test(stripped);
}
function fmOf(file) {
  const { block: block2 } = splitFrontmatter(import_node_fs19.default.readFileSync(file, "utf8"));
  return block2 === null ? {} : parseFrontmatter(block2);
}
function kiroAlwaysBytes(target) {
  const dir = import_node_path20.default.join(target, ".kiro/steering");
  if (!import_node_fs19.default.existsSync(dir)) return 0;
  let total = 0;
  for (const name of import_node_fs19.default.readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const p = import_node_path20.default.join(dir, name);
    if (!lstat2(p)?.isFile()) continue;
    const inc = fmOf(p).inclusion;
    if ((typeof inc === "string" && inc || "always") === "always") total += import_node_fs19.default.statSync(p).size;
  }
  return total;
}
function specAt(target) {
  const file = import_node_path20.default.join(target, "scripts/harness/projection.json");
  return import_node_fs19.default.existsSync(file) ? parseSpec(import_node_fs19.default.readFileSync(file, "utf8")) : null;
}
function layoutFindings(target, entries) {
  const out = [];
  const meta = readMeta(import_node_path20.default.join(target, META_REL));
  const tokens = meta.status === "ok" ? meta.meta.tokens : {};
  const agents = meta.status === "ok" ? meta.meta.agents : [];
  let spec;
  for (const e of entries) {
    if (e.owner !== "kit") continue;
    const p = import_node_path20.default.join(target, ...e.path.split("/"));
    const from = typeof e.from === "string" ? e.from : null;
    if (e.op === "mirror" || e.op === "render") {
      const st = lstat2(p);
      const isDir2 = e.op === "mirror" && (Boolean(st?.isDirectory()) && !st?.isSymbolicLink() || Boolean(from && lstat2(import_node_path20.default.join(target, ...from.split("/")))?.isDirectory()));
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
        const sp = import_node_path20.default.join(target, ...from.split("/"));
        const now = currentSha(sp, Boolean(lstat2(sp)?.isDirectory()));
        if (now === null) out.push({ kind: "stale", severity: "error", path: e.path, hint: `원본 ${from} 이 없다 → npx harness-kit update` });
        else if (now !== e.fromSha256) out.push({ kind: "stale", severity: "error", path: e.path, hint: `원본 ${from} 가 바뀌었다 → npx harness-kit repair` });
      }
    } else if (e.op === "merge" && Array.isArray(e.keys) && e.keys.length) {
      const kind = MERGE_KIND[e.path];
      if (!kind) continue;
      if (spec === void 0) spec = specAt(target);
      if (!spec) continue;
      const st = lstat2(p);
      const cur = st?.isFile() ? import_node_fs19.default.readFileSync(p, "utf8") : null;
      const keys = e.keys;
      const lost = cur === null ? keys : missingWith(kind, cur, keys, fullMergeWant(kind, spec, tokens, loadSources(new FsView(target))));
      if (lost.length) out.push({ kind: "merge-missing", severity: "error", path: e.path, hint: `킷 키 ${lost.slice(0, 3).join(", ")}${lost.length > 3 ? " …" : ""} 가 없다 → npx harness-kit repair` });
    } else if (e.op === "copy") {
      const st = lstat2(p);
      if (!st?.isFile()) continue;
      if (SOURCE_DIRS.some((d) => e.path.startsWith(d)) && e.path.endsWith(".md") && hasRelativeRef(import_node_fs19.default.readFileSync(p, "utf8"))) {
        out.push({ kind: "relative-ref", severity: "error", path: e.path, hint: "킷 원본은 `../` 대신 리포 기준 경로(.agents/…)를 쓴다(복사본에서 깨진다)" });
      }
    }
  }
  for (const e of entries) {
    for (const side of [`${e.path}.new`, `${e.path}.bak`]) {
      if (lstat2(import_node_path20.default.join(target, ...side.split("/")))) out.push({ kind: "pending-new", severity: "warn", path: side, hint: `병합하거나 지운다(diff -u ${e.path} ${side})` });
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
  if (always > LIMIT) out.push({ kind: "steering-size", severity: "warn", path: ".kiro/steering", hint: `inclusion: always steering = ${always.toLocaleString("en-US")} bytes (기준 ${LIMIT.toLocaleString("en-US")})` });
  return out;
}

// src/commands/doctor.ts
var DOCTOR_KINDS = ["meta-invalid", "lock-invalid", "lock-v1", "version-mismatch", "missing", "drifted", "gitignore", "entry-size", ...PROJECTION_KINDS];
var GITIGNORE_NEEDS = [".agents/state/", ".agents/local/", ".agents/reports/"];
var ENTRY_FILES = ["AGENTS.md", "CLAUDE.md"];
var ENTRY_LIMIT = 24 * 1024;
function versionFindings(meta, lock) {
  const out = [];
  const installed = meta && meta.kit.version !== "unknown" ? meta.kit.version : null;
  if (installed) {
    const cmp = compareSemver(installed, VERSION);
    if (cmp === null || cmp !== 0) {
      const newer2 = cmp !== null && cmp > 0;
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
function fileState(full9, sha) {
  const st = lstatOrNull(full9);
  if (!st || !st.isFile()) return "missing";
  try {
    return sha && sha256File(full9) === sha ? "ok" : "drifted";
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
    const state = fileState(import_node_path21.default.join(target, ...e.path.split("/")), e.sha256);
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
    lines = import_node_fs20.default.readFileSync(import_node_path21.default.join(target, ".gitignore"), "utf8").split(/\r?\n/).map((l) => l.trim());
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
    const st = lstatOrNull(import_node_path21.default.join(target, f));
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
  const metaRead = readMeta(import_node_path21.default.join(target, META_REL));
  if (metaRead.status === "missing") {
    throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, "설치는 harness-kit init");
  }
  const findings = [];
  const meta = metaRead.status === "ok" ? metaRead.meta : null;
  if (metaRead.status === "invalid") findings.push({ kind: "meta-invalid", severity: "error", path: META_REL, hint: metaRead.error });
  const lockRead = readLock(import_node_path21.default.join(target, LOCK_REL));
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
  const layout = lock ? layoutFindings(target, lock.entries.filter((e) => isSafeRelPath(e.path))) : [];
  findings.push(...layout.map((f) => ({ kind: f.kind, severity: f.severity, path: f.path, hint: f.hint })));
  for (const f of [gitignoreFinding(target), entrySizeFinding(target)]) if (f) findings.push(f);
  const projectionTotal = lock ? lock.entries.filter((e) => PROJECTION_OPS.has(e.op) && e.owner === "kit").length : 0;
  const projectionBad = new Set(layout.filter((f) => f.severity === "error" && !f.path.startsWith(".agents/")).map((f) => f.path)).size;
  return { meta, lock, ok: copy.ok, findings, projection: { ok: Math.max(0, projectionTotal - projectionBad), errors: layout.filter((f) => f.severity === "error").length } };
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

// src/commands/init.ts
var import_node_fs21 = __toESM(require("node:fs"));
var import_node_path22 = __toESM(require("node:path"));

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
  if (st && !(st.isDirectory() || st.isSymbolicLink() && import_node_fs21.default.statSync(target).isDirectory())) {
    throw new CliError(EXIT.STATE, `대상이 폴더가 아니다: ${target}`);
  }
  if (import_node_fs21.default.existsSync(import_node_path22.default.join(target, META_REL))) {
    throw new CliError(EXIT.STATE, `이미 설치된 리포다: ${import_node_path22.default.join(target, META_REL)}`, "킷 갱신은 harness-kit update, 하네스 · 모듈 추가는 harness-kit add 다. 지금 상태는 harness-kit doctor");
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
  const layout = loadLayout(loc.dir);
  const opts = readOptions(ctx, layout);
  assertInstallable(target);
  const interactive = io2.isTTY && !bool(ctx.values, "yes") && !ctx.json && io2.stdin !== void 0;
  const prompter = interactive ? createPrompter(io2.stdin, io2.stderr) : null;
  try {
    const input = prompter ? await askMissing(prompter, selectionInput(ctx), layout, loc.dir) : selectionInput(ctx);
    const selection = resolveSelection(layout, loc.dir, input, { target, env: io2.env });
    const tokens = resolveTokens(layout, selection, { flags: opts.flags, env: io2.env, targetBasename: import_node_path22.default.basename(target) });
    checkSlug(tokens.PROJECT_SLUG ?? "");
    const plan = buildPlan({ layout, templatesDir: loc.dir, target, selection, tokens, mode: { force: opts.force, adopt: opts.adopt } });
    const shown = command === "plan" && !ctx.quiet ? plan.ops : plan.ops.filter(needsAttention);
    const data = planData(command, target, loc.dir, selection, tokens, plan, shown);
    const projection = projectionData(plan.projection, plan.projectionFindings, command === "plan");
    if (projection) data.projection = projection;
    const human = needsHuman(plan.projection, plan.projectionFindings);
    const conflicts = projectionConflicts(plan.projection);
    if (conflicts.length) data.conflicts = conflicts;
    const lines = [`harness-kit ${command} — ${target}`, selectionLine2(selection)];
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
var import_node_path23 = __toESM(require("node:path"));
function tally(values) {
  const out = /* @__PURE__ */ new Map();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return Object.fromEntries(out);
}
function runList(ctx) {
  const target = targetOf(ctx);
  const read = readMeta(import_node_path23.default.join(target, META_REL));
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
    const lr = readLock(import_node_path23.default.join(target, LOCK_REL));
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

// src/commands/outdated.ts
var import_node_path24 = __toESM(require("node:path"));

// src/core/git.ts
var import_node_child_process3 = require("node:child_process");
function gitEnv(env) {
  const out = { ...env, PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME, GIT_TERMINAL_PROMPT: "0" };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG"]) delete out[k];
  return out;
}
function git(args, env, timeout = 3e4) {
  const r = (0, import_node_child_process3.spawnSync)("git", args, { env: gitEnv(env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout });
  const missing = r.error?.code === "ENOENT";
  const run = { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", missing };
  if (r.error) run.error = r.error.message;
  return run;
}
function gitRepoPath(dir, env) {
  const inside = git(["-C", dir, "rev-parse", "--git-dir"], env);
  if (inside.status !== 0) return null;
  const top = git(["-C", dir, "rev-parse", "--show-toplevel"], env);
  return top.status === 0 && top.stdout.trim() ? top.stdout.trim() : dir;
}
function remoteVersions(source, env) {
  const r = git(["ls-remote", "--tags", "--refs", source], env, 15e3);
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
  const lock = readLock(import_node_path24.default.join(target, LOCK_REL));
  const url = fromKitSource(lock.status === "ok" ? lock.lock.kit.source : null, ctx.io.env);
  if (url && !url.startsWith("-")) return { url, from: "lock" };
  return { url: null, reason: "소스를 모른다 — --source <git 원격> 또는 HARNESS_KIT_SOURCE 로 준다" };
}
var isPre = (v) => /^\d+\.\d+\.\d+-/.test(v);
var newer = (a, b) => (compareSemver(a, b) ?? 0) > 0;
function runOutdated(ctx) {
  const target = targetOf(ctx);
  const m = readMeta(import_node_path24.default.join(target, META_REL));
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

// src/commands/remove.ts
var import_node_path25 = __toESM(require("node:path"));
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
    const alsoNew = existing(import_node_path25.default.join(l.target, ...neu.split("/"))).kind === "file" ? { alsoNew: neu } : {};
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
  const newFile = existing(import_node_path25.default.join(l.target, ...neu.split("/"))).kind === "other" ? {} : { newFile: neu };
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
  const l = loadForChange(ctx, "remove", kit);
  const notOn = [...asked.harnesses.filter((h) => !l.before.agents.includes(h)), ...asked.modules.filter((m) => !l.before.modules.includes(m))];
  const names = { harnesses: asked.harnesses.filter((h) => !notOn.includes(h)), modules: asked.modules.filter((m) => !notOn.includes(m)) };
  const after = withoutNames(l.before, names);
  if (after.agents.length === 0) throw usageError("하네스를 모두 뺄 수 없다 — 하나는 남는다", "킷을 통째로 지우려면 harness-kit uninstall");
  const dryRun = dryRunOf(ctx);
  const nothing = names.harnesses.length + names.modules.length === 0;
  const result = nothing ? { ops: [], entries: l.inst.lock.entries, manifest: null } : planRemove(l, after);
  const featureDocs = dryRun || nothing ? null : applyChange(ctx, l, after, result);
  const notes = notOn.length ? [`  · 켜져 있지 않다 — 건너뛴다: ${notOn.join(", ")}`] : [];
  const keep = [...result.ops.filter((o) => o.action === "keep-modified").map((o) => o.path), ...(result.projection?.ops ?? []).filter((o) => o.action === "keep-modified").map((o) => o.path)];
  const { data, lines } = report(ctx, l, { command: "remove", names: { ...names, notOn }, after, result, dryRun, featureDocs, notes, extra: { keep } });
  if (keep.length) lines.splice(lines.length - 1, 0, "  고친 파일은 남겼다(lock 은 owner user). 필요 없으면 직접 지운다");
  const human = keep.length > 0 || result.ops.some((o) => o.action === "conflict") || result.manifest?.action === "conflict" || needsHuman(result.projection ?? null, result.projectionFindings ?? []);
  return { code: human ? EXIT.HUMAN : EXIT.OK, data, lines };
}

// src/commands/repair.ts
var import_node_fs22 = __toESM(require("node:fs"));
var import_node_path26 = __toESM(require("node:path"));
var REPAIR_KINDS = ["missing", "drifted", "stale", "merge"];
function full7(target, rel) {
  return import_node_path26.default.join(target, ...rel.split("/"));
}
function parseOnly2(raw) {
  if (raw === void 0) return [...REPAIR_KINDS];
  const only = raw.split(/[\s,]+/).filter(Boolean);
  const unknown = only.filter((k) => !REPAIR_KINDS.includes(k));
  if (unknown.length || only.length === 0) throw usageError(`모르는 repair 종류: ${unknown.join(" ") || "(빈 값)"}`, `사용 가능: ${REPAIR_KINDS.join(" ")}`);
  return only;
}
function survey(target, inst) {
  const ancestors = new AncestorCheck(target, import_node_fs22.default.realpathSync(target));
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
    const cur = existing(full7(target, e.path));
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
function applyRepair(target, inst, ops, projection) {
  const restored = new Map(ops.filter((o) => o.action === "restore").map((o) => [o.path, o.want]));
  let current3 = "";
  try {
    for (const [rel, w] of restored) {
      current3 = rel;
      writeFileAtomic(full7(target, rel), w.content, w.executable);
    }
    current3 = "배치(mirror · render · merge)";
    if (projection) applyProjection(target, projection.ops);
    const copies = inst.lock.entries.map((e) => {
      const w = restored.get(e.path);
      return w ? { ...e, sha256: w.sha256, layer: w.layer } : e;
    });
    const entries = projection ? [...copies.filter((e) => !projection.touched.has(e.path)), ...projection.entries] : copies;
    current3 = LOCK_REL;
    writeFileAtomic(full7(target, LOCK_REL), Buffer.from(serializeLock({ ...inst.lock, entries }), "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current3}`);
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
  const layout = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout, selection, inst.meta, io2.env, target);
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
  const p = full7(target, w.path);
  const cur = import_node_fs22.default.existsSync(p) && import_node_fs22.default.lstatSync(p).isFile() ? import_node_fs22.default.readFileSync(p, "utf8") : null;
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
  const same = (rel) => w.files.some((f) => f.rel === rel && f.bytes.equals(have.get(rel)));
  const backups = w.kind === "dir" ? [...have.keys()].filter((rel) => !same(rel)).map((rel) => `${w.path}/${rel}.bak`) : [`${w.path}.bak`];
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
  return { code, data, lines };
}

// src/commands/reserved.ts
var RESERVED = {
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
var import_node_child_process4 = require("node:child_process");
var import_node_fs23 = __toESM(require("node:fs"));
var import_node_path27 = __toESM(require("node:path"));
var ACTIONS = ["delete", "keep-modified", "absent", "keep-user", "keep-external", "keep-pack", "unmerge"];
var COUNT_ONLY = /* @__PURE__ */ new Set(["absent", "keep-user", "keep-external", "keep-pack"]);
var HOOKS_PATH = "scripts/git-hooks";
function planMergeEntry(p, e) {
  const kind = MERGE_KIND[e.path];
  const cur = existing(full8(p.target, e.path));
  if (cur.kind === "none") {
    p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
    return;
  }
  if (!kind || !p.spec || cur.kind !== "file") {
    p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason: "병합 파일을 해석하지 못했다" });
    return;
  }
  const text = cur.bytes.toString("utf8");
  const want = fullMergeWant(kind, p.spec, p.tokens, loadSources(new FsView(p.target)));
  const r = unmergeWith(kind, text, mergeKeysOf(e, kind, want), want);
  if (!r.ok) p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason: r.reason });
  else if (r.empty && e.createdByKit === true) p.ops.push({ path: e.path, owner: e.owner, action: "delete", reason: "킷 키만 있던 병합 파일" });
  else p.ops.push({ path: e.path, owner: e.owner, action: "unmerge", reason: "킷 키만 뺐다", ...r.text === text ? {} : { text: r.text } });
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
  const st = lstatOrNull(full8(p.target, e.path));
  const dir = Boolean(st?.isDirectory() && !st.isSymbolicLink());
  const cur = stateOf(p.target, e.path, dir);
  if (cur.kind === "none") p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
  else if (cur.kind === "file" && typeof e.sha256 === "string" && cur.sha === e.sha256) p.ops.push({ path: e.path, owner: e.owner, action: "delete", dir });
  else p.ops.push({ path: e.path, owner: e.owner, action: "keep-modified", reason: cur.kind === "link" ? "링크다" : "생성 파일을 사람이 고쳤다" });
  if (!dir && cur.kind !== "other" && current2(p, `${e.path}.new`).kind === "file") p.ops.push({ path: `${e.path}.new`, owner: e.owner, action: "delete", reason: "update 가 둔 .new" });
}
function full8(target, rel) {
  return import_node_path27.default.join(target, ...rel.split("/"));
}
function current2(p, rel) {
  if (p.ancestors.state(rel) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(full8(p.target, rel));
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
  const cur = current2(p, e.path);
  if (cur.kind === "none") p.ops.push({ path: e.path, owner: e.owner, action: "absent" });
  else if (cur.kind === "file" && e.sha256 && cur.sha === e.sha256) p.ops.push({ path: e.path, owner: e.owner, action: "delete" });
  else {
    const reason = cur.kind === "other" ? cur.what : e.sha256 ? "사람이 고친 파일이다" : p.ambiguous.has(e.path) ? AMBIGUOUS_REASON : "lock 에 기준 해시가 없다(고친 파일로 본다)";
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
function uninstallSpec(ctx, target) {
  const installed = import_node_path27.default.join(target, "scripts/harness/projection.json");
  try {
    if (import_node_fs23.default.existsSync(installed)) return parseSpec(import_node_fs23.default.readFileSync(installed, "utf8"));
    const { io: io2 } = ctx;
    return loadSpecOrNull(locateTemplates({ flag: str(ctx.values, "templates"), env: io2.env, cliFile: io2.cliFile, cwd: io2.cwd, version: VERSION }).dir);
  } catch (err) {
    if (err instanceof CliError) return null;
    throw err;
  }
}
function buildUninstall(ctx, target, inst, keepPacks, keepState, ambiguous) {
  const spec = inst.lock.entries.some((e) => e.op === "merge") ? uninstallSpec(ctx, target) : null;
  const p = { target, ancestors: new AncestorCheck(target, import_node_fs23.default.realpathSync(target)), keepPacks, ops: [], ambiguous, spec, tokens: inst.meta.tokens };
  for (const e of inst.lock.entries) planEntry(p, e);
  planManifest(p, inst);
  if (!keepState) for (const rel of [LOCK_REL, META_REL]) p.ops.push({ path: rel, owner: "kit", action: "delete", reason: "상태 파일" });
  return p.ops;
}
function unhookGit(target, env, dryRun) {
  const git2 = (...args) => (0, import_node_child_process4.spawnSync)("git", ["-C", target, ...args], { env: gitEnv(env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 3e4 });
  const top = git2("rev-parse", "--show-toplevel");
  if (top.error) return { status: top.error.code === "ENOENT" ? "no-git" : "failed" };
  if (top.status !== 0) return { status: "none" };
  let topReal;
  try {
    topReal = import_node_fs23.default.realpathSync(top.stdout.trim());
  } catch {
    return { status: "none" };
  }
  if (topReal !== import_node_fs23.default.realpathSync(target)) return { status: "none" };
  const get = git2("config", "--local", "--get", "core.hooksPath");
  if (get.status !== 0) return { status: "none" };
  const value = get.stdout.trim();
  if (value !== HOOKS_PATH) return { status: "kept", value };
  if (!dryRun && git2("config", "--local", "--unset", "core.hooksPath").status !== 0) return { status: "failed", value };
  return { status: "unset", value };
}
function applyUninstall(target, inst, ops, unhook) {
  const state = /* @__PURE__ */ new Set([LOCK_REL, META_REL]);
  let current3 = "";
  try {
    for (const o of ops) {
      current3 = o.path;
      if (o.action === "unmerge" && o.text !== void 0) writeFileAtomic(import_node_path27.default.join(target, ...o.path.split("/")), Buffer.from(o.text, "utf8"), false);
      if (o.action !== "delete" || state.has(o.path)) continue;
      if (o.dir) removeTarget(target, o.path, true);
      else removeFile(target, o.path);
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
    const layout = loadLayout(loc.dir);
    const { selection } = selectionFromMeta(layout, loc.dir, inst.meta);
    const tokens = tokensFromMeta(layout, selection, inst.meta, io2.env, target);
    return new Map([...wanted({ layout, templatesDir: loc.dir, selection, tokens }).want].map(([p, d]) => [p, d.sha256]));
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
  list: runList
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

공통 플래그: --cwd <폴더> --dry-run --yes --json --templates <폴더> --quiet --no-color --help
init · plan: --stack --arch --domain --lang --agents <목록|all> --modules <목록|all|none>
             --name --slug --package-ns --protected-path --token KEY=VALUE --issue-source kit|jira
             --issue-prefix --base --adopt --force
add · remove: <이름>…(하네스 claude codex cursor kiro · 모듈 jira-workflow platform-guards multi-harness)
update: --accept-all --prune --forget <경로>(반복) --to <CLI 버전> · outdated: --check --source <git 원격>
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
function commandOf2(argv, first, command) {
  if (argv.length === 0) throw usageError("명령이 없다", USAGE.trimEnd());
  if (command === "") throw usageError(`명령이 먼저 온다: ${first}`, "harness-kit --help");
  if (Object.hasOwn(RESERVED, command)) {
    throw usageError(`'${command}' 는 아직 없다 — ${RESERVED[command]}에서 제공한다`, "지금 있는 명령: init · plan · add · remove · update · outdated · repair · uninstall · doctor · list");
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
    const run = commandOf2(argv, first, command);
    const { values, positionals } = parseCommandArgs(command, argv.slice(1));
    if (bool(values, "help")) {
      io2.stdout(Object.hasOwn(COMMAND_HELP, command) ? COMMAND_HELP[command] : USAGE);
      return EXIT.OK;
    }
    const ctx = { io: io2, command, values, positionals, json, quiet: bool(values, "quiet") };
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
