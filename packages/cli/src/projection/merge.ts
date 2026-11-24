/**
 * 배치 병합 규칙 — CLAUDE.md 블록 · settings.json · .codex/hooks.json · config.toml · .gitattributes(HK-13 design §5, HK-24, 03 §3.5).
 * Python `scripts/harness/projection_merge.py` 와 같은 바이트를 낸다(시험이 묶는다).
 */
import { tomlString } from "./render";
import type { HookSpec, ProjectionSpec } from "./spec";
import { vscodeSettings, type VscodeSettingsWant } from "./vscode";

export type MergeResult = { ok: true; text: string; keys: string[]; created: boolean } | { ok: false; reason: string };
export type UnmergeResult = { ok: true; text: string; empty: boolean } | { ok: false; reason: string };

export interface ClaudeMdWant {
  block: string[];
}
interface HooksPart {
  hooks: HookSpec[];
  /** 옛 킷 명령 꼬리(`scripts/hooks/<이름>` · `_ <이름>`) */
  suffixes: string[];
}
export interface SettingsWant extends HooksPart {
  deny: string[];
}
export type CodexHooksWant = HooksPart;
export interface CodexRoleRef {
  name: string;
  description: string;
}
export interface CodexConfigWant {
  header: string[];
  defaults: { table: string; key: string; line: string }[];
  tables: { table: string; lines: string[] }[];
  roles: CodexRoleRef[];
  keep: string[];
}
export interface GitattributesWant {
  lines: string[];
}
export type MergeKind = "claude-md" | "settings" | "codex-hooks" | "codex-config" | "gitattributes" | "vscode-settings";

export interface Merger<W> {
  merge(cur: string | null, want: W, prev?: string[]): MergeResult;
  unmerge(cur: string, keys: string[], want: W): UnmergeResult;
  missing(cur: string, keys: string[], want: W): string[];
}

const CLAUDE_BEGIN = "<!-- harness-kit:begin claude";
const CLAUDE_END = "<!-- harness-kit:end claude -->";
const GEN_BEGIN = "# harness-kit:begin generated";
const GEN_BEGIN_LINE = "# harness-kit:begin generated — .agents/ 원본에서 만든 파일이다. 고칠 때는 원본을 고친다";
const GEN_END = "# harness-kit:end generated";
const AGENTS_LINE = "@AGENTS.md";
export const HARNESS_ORDER = ["claude", "codex", "cursor", "kiro"];
const TABLE_HEADER = /^\s*\[\[?\s*([^[\]]+?)\s*\]\]?\s*(?:#.*)?$/;

export const MERGE_KIND: Record<string, MergeKind> = {
  "CLAUDE.md": "claude-md",
  ".claude/settings.json": "settings",
  ".codex/hooks.json": "codex-hooks",
  ".codex/config.toml": "codex-config",
  ".gitattributes": "gitattributes",
  ".vscode/settings.json": "vscode-settings",
};

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const isBlank = (l: string): boolean => l.trim() === "";

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function joinLines(lines: string[]): string {
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function stripTrailingBlank(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && isBlank(out[out.length - 1] as string)) out.pop();
  return out;
}

function allBlank(lines: string[], comments = false): boolean {
  return lines.every((l) => isBlank(l) || (comments && l.trimStart().startsWith("#")));
}

type Found = [number, number] | null | "unclosed";

function findBlock(lines: string[], begin: string, end: string): Found {
  const b = lines.findIndex((l) => l.startsWith(begin));
  if (b < 0) return null;
  let e = -1;
  for (let i = b + 1; i < lines.length; i += 1) {
    if ((lines[i] as string).trim() === end) {
      e = i;
      break;
    }
  }
  return e < 0 ? "unclosed" : [b, e];
}

function appendBlock(lines: string[], block: string[]): string[] {
  const out = [...lines];
  if (out.length && !isBlank(out[out.length - 1] as string)) out.push("");
  return [...out, ...block];
}

// ── 표지 블록 ────────────────────────────────────────────────────────────────

export function claudeMdWant(spec: Pick<ProjectionSpec, "claudeBlock">): ClaudeMdWant {
  return { block: [...spec.claudeBlock] };
}

const claudeMd: Merger<ClaudeMdWant> = {
  merge(cur, want, prev = []) {
    const block = want.block;
    if (cur === null) return { ok: true, text: joinLines([AGENTS_LINE, "", ...block]), keys: ["line:@AGENTS.md", "block:claude"], created: true };
    let lines = splitLines(cur);
    const found = findBlock(lines, CLAUDE_BEGIN, CLAUDE_END);
    if (found === "unclosed") return fail("CLAUDE.md 킷 블록의 끝 표지가 없다");
    const hasLine = lines.some((l) => l === AGENTS_LINE);
    const keys: string[] = [];
    if (found !== null) {
      const [b, e] = found;
      const insert = hasLine ? [] : [AGENTS_LINE, ""];
      lines = [...lines.slice(0, b), ...insert, ...block, ...lines.slice(e + 1)];
      if (!hasLine || prev.includes("line:@AGENTS.md")) keys.push("line:@AGENTS.md");
    } else {
      if (!hasLine) {
        lines = appendBlock(lines, [AGENTS_LINE, ""]);
        keys.push("line:@AGENTS.md");
      } else if (prev.includes("line:@AGENTS.md")) keys.push("line:@AGENTS.md");
      lines = appendBlock(lines, block);
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
    return keys.filter((k) => (k === "line:@AGENTS.md" && !lines.includes(AGENTS_LINE)) || (k === "block:claude" && !Array.isArray(found)));
  },
};

export function gitattributesWant(spec: Pick<ProjectionSpec, "gitattributes">, agents: string[]): GitattributesWant {
  const patterns = HARNESS_ORDER.filter((h) => agents.includes(h)).flatMap((h) => spec.gitattributes[h] ?? []);
  return { lines: [GEN_BEGIN_LINE, ...patterns.map((p) => `${p} linguist-generated=true`), GEN_END] };
}

const gitattributes: Merger<GitattributesWant> = {
  merge(cur, want) {
    const block = want.lines;
    if (cur === null) return { ok: true, text: joinLines(block), keys: ["block:generated"], created: true };
    let lines = splitLines(cur);
    const found = findBlock(lines, GEN_BEGIN, GEN_END);
    if (found === "unclosed") return fail(".gitattributes 킷 블록의 끝 표지가 없다");
    lines = found === null ? appendBlock(lines, block) : [...lines.slice(0, found[0]), ...block, ...lines.slice(found[1] + 1)];
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
  },
};

// ── settings.json · .codex/hooks.json ────────────────────────────────────────

const sub = (value: string, tokens: Record<string, string>): string =>
  Object.entries(tokens).reduce((v, [k, x]) => (x ? v.split(`{{kit:${k}}}`).join(x).split(`{{${k}}}`).join(x) : v), value);

/** 권한 거부(projection.json) + 훅(hooks.json 에서 만든 것, HK-24). */
export function settingsWant(spec: Pick<ProjectionSpec, "claudeSettings">, tokens: Record<string, string>, hooks: HookSpec[] = [], suffixes: string[] = []): SettingsWant {
  return { deny: spec.claudeSettings.deny.map((d) => sub(d, tokens)), hooks: hooks.map((h) => ({ ...h })), suffixes: [...suffixes] };
}

export function codexHooksWant(hooks: HookSpec[] = [], suffixes: string[] = []): CodexHooksWant {
  return { hooks: hooks.map((h) => ({ ...h })), suffixes: [...suffixes] };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

function commandOf(h: unknown): string | null {
  return isObj(h) && typeof h.command === "string" ? h.command : null;
}

function rstrip(s: string): string {
  return s.replace(/\s+$/, "");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasId(cmd: string, id: string): boolean {
  return new RegExp(`(?:^|\\s)${escapeRe(id)}(?:\\s|$)`).test(cmd);
}

function scriptSuffixes(script: string | undefined): string[] {
  return script ? [script, `_ ${script.slice(script.lastIndexOf("/") + 1)}`] : [];
}

/** 킷 항목: 명령에 킷 훅 id 가 낱말로 있거나, 명령이 킷 스크립트 꼬리로 끝난다(v1 · HK-13 판 명령). */
function isKitHook(h: unknown, ids: string[], suffixes: string[]): boolean {
  const cmd = commandOf(h);
  if (cmd === null) return false;
  const tail = rstrip(cmd);
  return ids.some((i) => hasId(cmd, i)) || suffixes.some((s) => tail.endsWith(s));
}

function hookMatches(h: unknown, id: string, script: string | undefined): boolean {
  const cmd = commandOf(h);
  if (cmd === null) return false;
  const tail = rstrip(cmd);
  return hasId(cmd, id) || scriptSuffixes(script).some((s) => tail.endsWith(s));
}

function stripHooks(arr: unknown[], isKit: (h: unknown) => boolean): { out: unknown[]; first: number | null } {
  const out: unknown[] = [];
  let first: number | null = null;
  for (const g of arr) {
    const items = isObj(g) ? g.hooks : undefined;
    if (!Array.isArray(items)) {
      out.push(g);
      continue;
    }
    const kept = items.filter((h) => !isKit(h));
    if (kept.length === items.length) {
      out.push(g);
      continue;
    }
    if (kept.length) out.push({ ...(g as Obj), hooks: kept });
    else if (first === null) first = out.length;
  }
  return { out, first };
}

function desiredGroups(hooks: HookSpec[]): Map<string, Obj[]> {
  const out = new Map<string, Obj[]>();
  for (const h of hooks) {
    const groups = out.get(h.event) ?? [];
    out.set(h.event, groups);
    let group = groups.find((g) => g.matcher === h.matcher || (g.matcher === undefined && !h.matcher));
    if (!group) {
      group = h.matcher ? { matcher: h.matcher, hooks: [] } : { hooks: [] };
      groups.push(group);
    }
    (group.hooks as unknown[]).push({ ...h.hook });
  }
  return out;
}

function dump(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function parseObject(cur: string): Obj | string {
  let data: unknown;
  try {
    data = JSON.parse(cur);
  } catch (err) {
    return `JSON 을 해석할 수 없다: ${err instanceof Error ? err.message : String(err)}`;
  }
  return isObj(data) ? data : "최상위가 객체가 아니다";
}

const prevIds = (prev: string[]): string[] => prev.filter((k) => k.startsWith("hooks.") && k.includes(":")).map((k) => k.slice(k.indexOf(":") + 1));

/** data.hooks 의 킷 항목만 바꾼다(03 §3.5). 오류면 이유. */
function mergeHooks(data: Obj, want: HooksPart, prev: string[]): string | null {
  const hooks = data.hooks;
  if (hooks !== undefined && !isObj(hooks)) return "hooks 가 객체가 아니다";
  const ids = [...want.hooks.map((h) => h.id), ...prevIds(prev)];
  const suffixes = [...want.suffixes, ...want.hooks.flatMap((h) => scriptSuffixes(h.script))];
  const desired = desiredGroups(want.hooks);
  const src = (hooks as Obj | undefined) ?? {};
  const outHooks: Obj = {};
  const events = [...Object.keys(src), ...[...desired.keys()].filter((e) => !Object.hasOwn(src, e))];
  for (const event of events) {
    const arr = Object.hasOwn(src, event) ? src[event] : [];
    if (!Array.isArray(arr)) {
      if (desired.has(event)) return `hooks.${event} 가 배열이 아니다`;
      outHooks[event] = arr;
      continue;
    }
    const { out, first } = stripHooks(arr, (h) => isKitHook(h, ids, suffixes));
    const groups = desired.get(event) ?? [];
    const at = first ?? out.length;
    const next = [...out.slice(0, at), ...groups, ...out.slice(at)];
    if (!next.length && arr.length) continue;
    outHooks[event] = next;
  }
  if (hooks !== undefined || Object.keys(outHooks).length) data.hooks = outHooks;
  return null;
}

const hookKeys = (want: HooksPart): string[] => want.hooks.map((h) => `hooks.${h.event}:${h.id}`);

function unmergeHooks(data: Obj, keys: string[], want: HooksPart): void {
  const byId = new Map(want.hooks.map((h) => [h.id, h.script]));
  const ids = prevIds(keys);
  const hooks = data.hooks;
  if (!isObj(hooks)) return;
  const out: Obj = {};
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

function missingHooks(data: Obj, keys: string[], want: HooksPart): string[] {
  const byId = new Map(want.hooks.map((h) => [h.id, h.script]));
  const hooks = isObj(data.hooks) ? data.hooks : {};
  return keys.filter((k) => {
    if (!(k.startsWith("hooks.") && k.includes(":"))) return false;
    const rest = k.slice("hooks.".length);
    const event = rest.slice(0, rest.indexOf(":"));
    const id = rest.slice(rest.indexOf(":") + 1);
    const arr = hooks[event];
    const items = Array.isArray(arr) ? arr.flatMap((g) => (isObj(g) && Array.isArray(g.hooks) ? (g.hooks as unknown[]) : [])) : [];
    return !items.some((h) => hookMatches(h, id, byId.get(id)));
  });
}

const settings: Merger<SettingsWant> = {
  merge(cur, want, prev = []) {
    const parsed = cur === null ? {} : parseObject(cur);
    if (typeof parsed === "string") return fail(parsed);
    const data: Obj = { ...parsed };
    const perms = data.permissions;
    if (perms !== undefined && !isObj(perms)) return fail("permissions 가 객체가 아니다");
    const deny = isObj(perms) ? perms.deny : undefined;
    if (deny !== undefined && !Array.isArray(deny)) return fail("permissions.deny 가 배열이 아니다");
    if (data.hooks !== undefined && !isObj(data.hooks)) return fail("hooks 가 객체가 아니다");
    const prevDeny = prev.filter((k) => k.startsWith("permissions.deny:")).map((k) => k.slice("permissions.deny:".length));
    const newDeny = ((deny as unknown[] | undefined) ?? []).filter((v) => !(typeof v === "string" && prevDeny.includes(v) && !want.deny.includes(v)));
    for (const v of want.deny) if (!newDeny.includes(v)) newDeny.push(v);
    if (deny !== undefined || newDeny.length) data.permissions = { ...((perms as Obj | undefined) ?? {}), deny: newDeny };
    const error = mergeHooks(data, want, prev);
    if (error) return fail(error);
    const keys = [...want.deny.map((v) => `permissions.deny:${v}`), ...hookKeys(want)];
    return { ok: true, text: dump(data), keys, created: cur === null };
  },
  unmerge(cur, keys, want) {
    const parsed = parseObject(cur);
    if (typeof parsed === "string") return fail(parsed);
    const data: Obj = { ...parsed };
    unmergeHooks(data, keys, want);
    const denyVals = keys.filter((k) => k.startsWith("permissions.deny:")).map((k) => k.slice("permissions.deny:".length));
    const perms = data.permissions;
    if (isObj(perms) && Array.isArray(perms.deny)) {
      const deny = perms.deny as unknown[];
      const kept = deny.filter((v) => !(typeof v === "string" && denyVals.includes(v)));
      const next: Obj = { ...perms };
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
    const deny = isObj(data.permissions) ? data.permissions.deny : undefined;
    const hookMissing = new Set(missingHooks(data, keys, want));
    return keys.filter((k) => {
      if (k.startsWith("permissions.deny:")) return !Array.isArray(deny) || !deny.includes(k.slice("permissions.deny:".length));
      return hookMissing.has(k);
    });
  },
};

const codexHooks: Merger<CodexHooksWant> = {
  merge(cur, want, prev = []) {
    const parsed = cur === null ? {} : parseObject(cur);
    if (typeof parsed === "string") return fail(parsed);
    const data: Obj = { ...parsed };
    const error = mergeHooks(data, want, prev);
    if (error) return fail(error);
    return { ok: true, text: dump(data), keys: hookKeys(want), created: cur === null };
  },
  unmerge(cur, keys, want) {
    const parsed = parseObject(cur);
    if (typeof parsed === "string") return fail(parsed);
    const data: Obj = { ...parsed };
    unmergeHooks(data, keys, want);
    return { ok: true, text: dump(data), empty: Object.keys(data).length === 0 };
  },
  missing(cur, keys, want) {
    const data = parseObject(cur);
    if (typeof data === "string") return [...keys];
    return missingHooks(data, keys, want);
  },
};

// ── config.toml ──────────────────────────────────────────────────────────────

export function codexConfigWant(spec: Pick<ProjectionSpec, "codexConfig">, roles: CodexRoleRef[], keep: string[] = []): CodexConfigWant {
  const cc = spec.codexConfig;
  const ordered = [...roles].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  return {
    header: [...cc.header],
    defaults: cc.defaults.map((d) => ({ ...d })),
    tables: cc.tables.map((t) => ({ ...t, lines: [...t.lines] })),
    roles: ordered.map((r) => ({ name: r.name, description: r.description })),
    keep: [...keep],
  };
}

type Table = [string, number, number];

function tables(lines: string[]): Table[] {
  const heads: [number, string][] = [];
  lines.forEach((l, i) => {
    const m = TABLE_HEADER.exec(l);
    if (m) heads.push([i, m[1] as string]);
  });
  return heads.map(([i, name], n) => {
    const j = n + 1 < heads.length ? (heads[n + 1] as [number, string])[0] : lines.length;
    let last = i;
    for (let k = i + 1; k < j; k += 1) {
      const s = (lines[k] as string).trim();
      if (s && !s.startsWith("#")) last = k;
    }
    return [name, i, last + 1];
  });
}

function findTable(lines: string[], name: string): Table | null {
  return tables(lines).find((t) => t[0] === name) ?? null;
}

function keyLine(lines: string[], t: Table, key: string): number {
  const pat = new RegExp(`^\\s*(?:${escapeRe(key)}|"${escapeRe(key)}")\\s*=`);
  for (let k = t[1] + 1; k < t[2]; k += 1) if (pat.test(lines[k] as string)) return k;
  return -1;
}

function removeTable(lines: string[], t: Table): string[] {
  let start = t[1];
  while (start > 0 && isBlank(lines[start - 1] as string)) start -= 1;
  return [...lines.slice(0, start), ...lines.slice(t[2])];
}

function roleTable(r: CodexRoleRef): string[] {
  return [`[agents.${r.name}]`, `description = ${tomlString(r.description)}`, `config_file = ${tomlString(`agents/${r.name}.toml`)}`];
}

function keyKinds(want: CodexConfigWant): { defaults: Set<string>; tableKeys: Set<string> } {
  return { defaults: new Set(want.defaults.map((d) => `toml:${d.table}.${d.key}`)), tableKeys: new Set(want.tables.map((t) => `toml:${t.table}`)) };
}

const codexConfig: Merger<CodexConfigWant> = {
  merge(cur, want, prev = []) {
    let lines = splitLines(cur === null ? joinLines(want.header) : cur);
    const keys: string[] = [];
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
    const wanted = new Set(want.roles.map((r) => `toml:agents.${r.name}`));
    const keep = new Set(want.keep.map((n) => `toml:agents.${n}`));
    for (const k of prev) {
      if (k.startsWith("toml:agents.") && !defaults.has(k) && !tableKeys.has(k) && !wanted.has(k) && !keep.has(k)) {
        const t = findTable(lines, k.slice("toml:".length));
        if (t !== null) lines = removeTable(lines, t);
      }
    }
    for (const k of [...keep].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
      if (prev.includes(k) && findTable(lines, k.slice("toml:".length)) !== null) keys.push(k);
    }
    for (const r of want.roles) {
      const block = roleTable(r);
      const t = findTable(lines, `agents.${r.name}`);
      lines = t === null ? appendBlock(lines, block) : [...lines.slice(0, t[1]), ...block, ...lines.slice(t[2])];
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
  },
};

export const MERGERS = {
  "claude-md": claudeMd,
  settings,
  "codex-hooks": codexHooks,
  "codex-config": codexConfig,
  gitattributes,
  "vscode-settings": vscodeSettings,
} as const;

export type MergeWant = ClaudeMdWant | SettingsWant | CodexHooksWant | CodexConfigWant | GitattributesWant | VscodeSettingsWant;

/** 병합 종류와 조각으로 부르기(engine 용). */
export function mergeWith(kind: MergeKind, cur: string | null, want: MergeWant, prev?: string[]): MergeResult {
  return (MERGERS[kind] as Merger<MergeWant>).merge(cur, want, prev);
}

export function unmergeWith(kind: MergeKind, cur: string, keys: string[], want: MergeWant): UnmergeResult {
  return (MERGERS[kind] as Merger<MergeWant>).unmerge(cur, keys, want);
}

export function missingWith(kind: MergeKind, cur: string, keys: string[], want: MergeWant): string[] {
  return (MERGERS[kind] as Merger<MergeWant>).missing(cur, keys, want);
}
