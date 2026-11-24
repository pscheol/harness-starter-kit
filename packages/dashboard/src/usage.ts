/**
 * 기록 · 사용량(설계 06 §3.18, DB-R26 · R28). 모델을 부르지 않고 대화 내용을 요약하지 않는다.
 * 대화 기록(`~/.claude` · `~/.codex`)은 `~/.config/harness-kit/config.json` 의 `history` 가 "on" 일 때만 연다.
 * 켜져 있어도 복사본 · 집계 파일을 남기지 않는다(읽은 위치와 줄 값은 메모리에만 둔다).
 */
import fs from "node:fs";
import path from "node:path";
import { ApiError, bad } from "./errors";
import type { Project } from "./project";
import { readSessions } from "./readers/sessions";
import { isObj, readJson } from "./util";

const HISTORY_LIMIT = 200;
const PROMPT_CHARS = 2000;
const DAY = 86_400_000;
/** 모델별 컨텍스트 창 기본 표. `usage.contextWindows` 가 덮는다. 모르면 "기록에 없다". */
const DEFAULT_WINDOWS: [RegExp, number][] = [[/^claude-/, 200_000]];
export const SESSION_START_LIMIT = 2560;
const LOADED_FILES = [/^CLAUDE\.md$/, /^AGENTS\.md$/, /^GEMINI\.md$/, /^\.claude\/rules\//, /^\.agents\/rules\//, /^\.kiro\/steering\//, /^\.cursor\/rules\//];

interface Rec {
  ts: number;
  session: string;
  cwd: string | null;
  branch: string | null;
  model: string | null;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  harness: "claude" | "codex";
}

interface FileState {
  size: number;
  mtimeMs: number;
  offset: number;
  recs: Map<string, Rec>;
  cwd: string | null;
  session: string | null;
  model: string | null;
  bad: number;
  ok: boolean;
}

const states = new WeakMap<Project, Map<string, FileState>>();

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function historyOn(p: Project): boolean {
  return p.machineConfig().history === "on";
}

export function configHint(p: Project): Record<string, unknown> {
  return { config: "~/.config/harness-kit/config.json", enable: '{ "history": "on" }', current: p.machineConfig().history ?? null };
}

function enc(dir: string): string {
  return dir.replace(/[^A-Za-z0-9]/g, "-");
}

function realOr(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** 리포 폴더와 그 worktree 폴더(`git.worktreeRoot`). 기록의 cwd 가 이 안이면 이 리포의 것이다. */
function projectDirs(p: Project): string[] {
  const git = isObj(p.meta().git) ? (p.meta().git as Record<string, unknown>) : {};
  const tpl = typeof git.worktreeRoot === "string" ? git.worktreeRoot : "../{repo}.worktrees";
  const root = realOr(p.root);
  const wt = path.resolve(root, tpl.replace("{repo}", path.basename(root)));
  return [...new Set([root, p.root, wt, realOr(wt)])];
}

function inside(cwd: string | null, dirs: string[]): boolean {
  return !!cwd && dirs.some((d) => cwd === d || cwd.startsWith(`${d}${path.sep}`));
}

async function readAppended(file: string, st: FileState): Promise<string[]> {
  const fh = await fs.promises.open(file, "r");
  try {
    const stat = await fh.stat();
    if (stat.size < st.offset) {
      st.offset = 0;
      st.recs.clear();
      st.cwd = st.session = st.model = null;
    }
    const len = stat.size - st.offset;
    if (len <= 0) return [];
    const buf = Buffer.alloc(len);
    const { bytesRead } = await fh.read(buf, 0, len, st.offset);
    const text = buf.subarray(0, bytesRead).toString("utf8");
    const cut = text.lastIndexOf("\n");
    if (cut < 0) return [];
    st.offset += Buffer.byteLength(text.slice(0, cut + 1), "utf8");
    return text.slice(0, cut).split("\n");
  } finally {
    await fh.close();
  }
}

function parseClaude(line: string, st: FileState): void {
  let j: unknown;
  try {
    j = JSON.parse(line);
  } catch {
    st.bad += 1;
    return;
  }
  if (!isObj(j)) return;
  if (str(j.cwd)) st.cwd = str(j.cwd);
  if (str(j.sessionId)) st.session = str(j.sessionId);
  if (j.type !== "assistant" || !isObj(j.message)) return;
  const m = j.message;
  const u = isObj(m.usage) ? m.usage : null;
  const ts = typeof j.timestamp === "string" ? Date.parse(j.timestamp) : NaN;
  if (!u || !Number.isFinite(ts)) return;
  const id = str(m.id) ?? `${ts}:${st.recs.size}`;
  st.recs.set(id, {
    ts, session: str(j.sessionId) ?? st.session ?? "", cwd: str(j.cwd) ?? st.cwd, branch: str(j.gitBranch), model: str(m.model),
    input: num(u.input_tokens), output: num(u.output_tokens), cacheRead: num(u.cache_read_input_tokens), cacheWrite: num(u.cache_creation_input_tokens), harness: "claude",
  });
}

function parseCodex(line: string, st: FileState): void {
  let j: unknown;
  try {
    j = JSON.parse(line);
  } catch {
    st.bad += 1;
    return;
  }
  if (!isObj(j) || !isObj(j.payload)) return;
  const pl = j.payload;
  if (j.type === "session_meta") {
    st.cwd = str(pl.cwd) ?? st.cwd;
    st.session = str(pl.id) ?? st.session;
    return;
  }
  if (j.type === "turn_context") {
    st.model = str(pl.model) ?? st.model;
    st.cwd = str(pl.cwd) ?? st.cwd;
    return;
  }
  if (j.type !== "event_msg" || pl.type !== "token_count" || !isObj(pl.info)) return;
  const last = isObj(pl.info.last_token_usage) ? pl.info.last_token_usage : null;
  const ts = typeof j.timestamp === "string" ? Date.parse(j.timestamp) : NaN;
  if (!last || !Number.isFinite(ts)) return;
  const cached = num(last.cached_input_tokens);
  st.recs.set(`${ts}:${st.recs.size}`, {
    ts, session: st.session ?? "", cwd: st.cwd, branch: null, model: st.model,
    input: Math.max(0, num(last.input_tokens) - cached), output: num(last.output_tokens), cacheRead: cached, cacheWrite: 0, harness: "codex",
  });
}

async function walk(dir: string, depth: number, out: string[], keep: (name: string) => boolean): Promise<void> {
  let ents: fs.Dirent[];
  try {
    ents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) await walk(full, depth - 1, out, keep);
    else if (e.isFile() && e.name.endsWith(".jsonl") && keep(e.name)) out.push(full);
  }
}

interface Loaded {
  recs: Rec[];
  sources: Record<string, unknown>[];
  unreadable: number;
}

async function loadFile(p: Project, file: string, parse: (l: string, s: FileState) => void, from: number): Promise<FileState | null> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return null;
  }
  if (stat.mtimeMs < from) return null;
  const map = states.get(p) ?? new Map<string, FileState>();
  states.set(p, map);
  let st = map.get(file);
  if (!st) {
    st = { size: 0, mtimeMs: 0, offset: 0, recs: new Map(), cwd: null, session: null, model: null, bad: 0, ok: true };
    map.set(file, st);
  }
  if (st.mtimeMs !== stat.mtimeMs || st.size !== stat.size) {
    try {
      for (const l of await readAppended(file, st)) if (l) parse(l, st);
      st.ok = true;
    } catch {
      st.ok = false;
    }
    st.mtimeMs = stat.mtimeMs;
    st.size = stat.size;
  }
  return st;
}

async function loadRecords(p: Project, from: number, harness: string | null): Promise<Loaded> {
  const dirs = projectDirs(p);
  const home = p.home;
  const recs: Rec[] = [];
  const sources: Record<string, unknown>[] = [];
  let unreadable = 0;
  const source = { id: "claude-projects", label: "~/.claude/projects/_/*.jsonl", kind: "tokens", files: 0, sessions: new Set<string>(), unreadable: 0 };
  if (!harness || harness === "claude") {
    const base = path.join(home, ".claude/projects");
    const prefix = enc(realOr(p.root));
    const prefixes = [...new Set([prefix, enc(p.root)])];
    let names: string[] = [];
    try {
      names = await fs.promises.readdir(base);
    } catch {
      names = [];
    }
    for (const n of names.filter((x) => prefixes.some((pre) => x === pre || x.startsWith(`${pre}-`)))) {
      const files: string[] = [];
      await walk(path.join(base, n), 0, files, () => true);
      for (const f of files) {
        const st = await loadFile(p, f, parseClaude, from);
        if (!st) continue;
        source.files += 1;
        if (!st.ok || st.bad > 0) {
          source.unreadable += st.ok ? 0 : 1;
          unreadable += st.ok ? 0 : 1;
        }
        for (const r of st.recs.values()) {
          if (r.ts >= from && inside(r.cwd, dirs)) {
            recs.push(r);
            source.sessions.add(r.session);
          }
        }
      }
    }
  }
  sources.push({ id: source.id, label: source.label, kind: source.kind, state: "read", files: source.files, sessions: source.sessions.size, unreadable: source.unreadable });
  const codex = { files: 0, sessions: new Set<string>(), unreadable: 0 };
  if (!harness || harness === "codex") {
    const files: string[] = [];
    await walk(path.join(home, ".codex/sessions"), 4, files, () => true);
    for (const f of files) {
      const st = await loadFile(p, f, parseCodex, from);
      if (!st || !inside(st.cwd, dirs)) continue;
      codex.files += 1;
      if (!st.ok) {
        codex.unreadable += 1;
        unreadable += 1;
      }
      for (const r of st.recs.values()) {
        if (r.ts >= from) {
          recs.push(r);
          codex.sessions.add(r.session);
        }
      }
    }
  }
  sources.push({ id: "codex-sessions", label: "~/.codex/sessions/**", kind: "tokens", state: "read", files: codex.files, sessions: codex.sessions.size, unreadable: codex.unreadable });
  sources.push({ id: "kiro", label: "Kiro", kind: "tokens", state: "none", note: "기록 위치 확인 필요 · 자료 없음", files: 0, sessions: 0, unreadable: 0 });
  return { recs, sources, unreadable };
}

function sourcesOff(): Record<string, unknown>[] {
  return [
    { id: "claude-projects", label: "~/.claude/projects/_/*.jsonl", kind: "tokens", state: "off", files: 0, sessions: 0, unreadable: 0 },
    { id: "claude-history", label: "~/.claude/history.jsonl", kind: "prompts", state: "off", files: 0, sessions: 0, unreadable: 0 },
    { id: "codex-sessions", label: "~/.codex/sessions/**", kind: "tokens", state: "off", files: 0, sessions: 0, unreadable: 0 },
    { id: "kiro", label: "Kiro", kind: "tokens", state: "none", note: "기록 위치 확인 필요 · 자료 없음", files: 0, sessions: 0, unreadable: 0 },
  ];
}

const localDate = (ms: number): string => {
  const d = new Date(ms);
  const p2 = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

function rangeOf(daysText: string | null): { days: number; from: number; to: number } {
  const days = daysText === null ? 7 : Number(daysText);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw bad("days 는 1~90 입니다");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { days, from: start.getTime() - (days - 1) * DAY, to: Date.now() };
}

const issueOf = (branch: string | null): string | null => /^[a-z]+\/([A-Z][A-Z0-9]*-[0-9]+)(?:-|$)/.exec(branch ?? "")?.[1] ?? null;

async function sessionMap(p: Project): Promise<Map<string, { role: string | null; issue: string | null }>> {
  const m = new Map<string, { role: string | null; issue: string | null }>();
  for (const s of await readSessions(p)) m.set(s.id, { role: s.role ?? null, issue: s.issue ?? null });
  return m;
}

export interface UsageQuery {
  days: string | null;
  harness: string | null;
}

function priceOf(p: Project, model: string | null): { input: number; output: number; cacheRead: number; cacheWrite: number } | null {
  const usage = p.machineConfig().usage;
  const pricing = isObj(usage) && isObj(usage.pricing) ? usage.pricing : null;
  if (!pricing || !model) return null;
  const key = Object.keys(pricing).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k));
  const v = key ? pricing[key] : null;
  return isObj(v) ? { input: num(v.input), output: num(v.output), cacheRead: num(v.cacheRead), cacheWrite: num(v.cacheWrite) } : null;
}

/** GET /usage — 토큰이 쓰인 곳. 꺼져 있으면 무엇을 읽는지와 켜는 곳만 낸다(파일을 열지 않는다). */
export async function usageData(p: Project, q: UsageQuery): Promise<Record<string, unknown>> {
  const range = rangeOf(q.days);
  if (q.harness && !["claude", "codex", "kiro"].includes(q.harness)) throw bad("harness 는 claude · codex · kiro 중 하나입니다");
  if (!historyOn(p)) return { enabled: false, ...configHint(p), range: { days: range.days }, sources: sourcesOff(), totals: null, daily: [], roles: [], byIssue: [], cache: { average: null, daily: [] }, cost: null, unreadable: 0 };
  const { recs, sources, unreadable } = await loadRecords(p, range.from, q.harness);
  const sess = await sessionMap(p);
  const days: string[] = [];
  for (let i = 0; i < range.days; i += 1) days.push(localDate(range.from + i * DAY + DAY / 2));
  const daily = new Map(days.map((d) => [d, { date: d, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, sum: 0, byRole: {} as Record<string, number> }]));
  const issues = new Map<string, number>();
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, sum: 0, requests: recs.length };
  let cost = 0;
  let priced = false;
  const roles = new Set<string>();
  for (const r of recs) {
    const d = daily.get(localDate(r.ts));
    if (!d) continue;
    const sum = r.input + r.output + r.cacheRead + r.cacheWrite;
    const meta = sess.get(r.session);
    const role = meta?.role ?? "역할 없음";
    roles.add(role);
    d.input += r.input;
    d.output += r.output;
    d.cacheRead += r.cacheRead;
    d.cacheWrite += r.cacheWrite;
    d.sum += sum;
    d.byRole[role] = (d.byRole[role] ?? 0) + sum;
    const issue = meta?.issue ?? issueOf(r.branch) ?? "이슈 없음";
    issues.set(issue, (issues.get(issue) ?? 0) + sum);
    totals.input += r.input;
    totals.output += r.output;
    totals.cacheRead += r.cacheRead;
    totals.cacheWrite += r.cacheWrite;
    totals.sum += sum;
    const price = priceOf(p, r.model);
    if (price) {
      priced = true;
      cost += (r.input * price.input + r.output * price.output + r.cacheRead * price.cacheRead + r.cacheWrite * price.cacheWrite) / 1_000_000;
    }
  }
  const ratio = (x: { input: number; cacheRead: number; cacheWrite: number }): number | null => {
    const den = x.input + x.cacheRead + x.cacheWrite;
    return den > 0 ? x.cacheRead / den : null;
  };
  const dayList = [...daily.values()];
  return {
    enabled: true,
    range: { from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString(), days: range.days },
    sources, totals, daily: dayList, roles: [...roles].sort(),
    byIssue: [...issues].map(([issue, sum]) => ({ issue, sum })).sort((a, b) => b.sum - a.sum || (a.issue < b.issue ? -1 : 1)),
    cache: { average: ratio(totals), daily: dayList.map((d) => ({ date: d.date, ratio: ratio(d) })) },
    cost: priced ? { estimate: Math.round(cost * 100) / 100, note: "usage.pricing 으로 센 추정입니다. 청구 금액이 아니다" } : null,
    unreadable,
  };
}

/** GET /usage/now — 이 리포의 가장 최근 응답 하나의 컨텍스트 사용률. */
export async function usageNow(p: Project): Promise<Record<string, unknown>> {
  if (!historyOn(p)) return { enabled: false, ...configHint(p), session: null };
  const { recs } = await loadRecords(p, Date.now() - 2 * DAY, null);
  const sess = await sessionMap(p);
  const last = recs.reduce<Rec | null>((a, r) => (!a || r.ts > a.ts ? r : a), null);
  if (!last) return { enabled: true, session: null };
  const usage = isObj(p.machineConfig().usage) ? (p.machineConfig().usage as Record<string, unknown>) : {};
  const windows = isObj(usage.contextWindows) ? usage.contextWindows : {};
  let window: number | null = null;
  if (last.model) {
    const w = windows[last.model];
    window = typeof w === "number" && w > 0 ? w : (DEFAULT_WINDOWS.find(([re]) => re.test(last.model as string))?.[1] ?? null);
  }
  const used = last.input + last.cacheRead + last.cacheWrite;
  const warnAt = typeof usage.warnAt === "number" && usage.warnAt > 0 && usage.warnAt <= 1 ? usage.warnAt : 0.8;
  const mine = recs.filter((r) => r.session === last.session);
  const ratio = window ? used / window : null;
  const meta = sess.get(last.session);
  return {
    enabled: true,
    session: {
      id: last.session, harness: last.harness, model: last.model, role: meta?.role ?? null, issue: meta?.issue ?? issueOf(last.branch),
      at: new Date(last.ts).toISOString(), since: new Date(Math.min(...mine.map((r) => r.ts))).toISOString(), requests: mine.length,
      last: { input: last.input, output: last.output, cacheRead: last.cacheRead, cacheWrite: last.cacheWrite },
      used, window, ratio, warnAt, warn: ratio !== null && ratio >= warnAt, windowNote: window ? null : "기록에 없습니다",
    },
  };
}

function isSessionStart(event: string): boolean {
  return /^session-?start$/i.test(event);
}

/** GET /usage/kit — 킷이 세션에 덧붙인 양. 늘 켜져 있고 대화 기록을 열지 않는다. */
export async function usageKit(p: Project): Promise<Record<string, unknown>> {
  const file = path.join(p.root, ".agents/state/hook-output.jsonl");
  const by = new Map<string, { event: string; hook: string; count: number; total: number; last: number; max: number; truncated: number }>();
  let skipped = 0;
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let j: unknown;
      try {
        j = JSON.parse(line);
      } catch {
        skipped += 1;
        continue;
      }
      if (!isObj(j) || typeof j.hook !== "string" || typeof j.event !== "string") {
        skipped += 1;
        continue;
      }
      const key = `${j.event}\0${j.hook}`;
      const e = by.get(key) ?? { event: j.event, hook: j.hook, count: 0, total: 0, last: 0, max: 0, truncated: 0 };
      const b = num(j.bytes);
      e.count += 1;
      e.total += b;
      e.last = b;
      e.max = Math.max(e.max, b);
      if (j.truncated === true) e.truncated += 1;
      by.set(key, e);
    }
  } catch {
    // 아직 기록이 없다
  }
  const hooks = [...by.values()].map((e) => ({ event: e.event, hook: e.hook, count: e.count, avgBytes: Math.round(e.total / e.count), lastBytes: e.last, maxBytes: e.max, truncated: e.truncated })).sort((a, b) => (a.event + a.hook < b.event + b.hook ? -1 : 1));
  const start = hooks.filter((h) => isSessionStart(h.event));
  const avgTotal = start.reduce((s, h) => s + h.avgBytes, 0);
  return {
    hooks, skipped,
    sessionStart: { avgBytes: avgTotal, maxBytes: start.reduce((s, h) => s + h.maxBytes, 0), limit: SESSION_START_LIMIT, ratio: avgTotal / SESSION_START_LIMIT, within: avgTotal <= SESSION_START_LIMIT, estTokens: Math.round(avgTotal / 3) },
    modules: modulesOf(p),
    note: "바이트 ÷ 3 은 한글 위주 글의 토큰 추정입니다",
  };
}

/** lock 의 owner 별 세션마다 실리는 파일 · hooks.json 의 owner 별 이벤트 수(정적 합계). */
function modulesOf(p: Project): Record<string, unknown>[] {
  const lock = readJson(path.join(p.root, ".agents/harness-kit.lock"));
  const entries = lock && Array.isArray(lock.entries) ? lock.entries.filter(isObj) : [];
  const out = new Map<string, { owner: string; files: number; bytes: number; hooks: Record<string, number> }>();
  const get = (owner: string): { owner: string; files: number; bytes: number; hooks: Record<string, number> } => {
    const e = out.get(owner) ?? { owner, files: 0, bytes: 0, hooks: {} };
    out.set(owner, e);
    return e;
  };
  for (const e of entries) {
    const rel = typeof e.path === "string" ? e.path : "";
    if (!LOADED_FILES.some((re) => re.test(rel))) continue;
    try {
      const st = fs.statSync(path.join(p.root, rel));
      if (!st.isFile()) continue;
      const o = get(typeof e.owner === "string" ? e.owner : "kit");
      o.files += 1;
      o.bytes += st.size;
    } catch {
      // 지워진 파일은 세지 않는다
    }
  }
  const hooks = readJson(path.join(p.root, ".agents/hooks.json"));
  for (const h of hooks && Array.isArray(hooks.hooks) ? hooks.hooks.filter(isObj) : []) {
    const o = get(typeof h.owner === "string" ? h.owner : "kit");
    const ev = typeof h.event === "string" ? h.event : "-";
    o.hooks[ev] = (o.hooks[ev] ?? 0) + 1;
  }
  return [...out.values()].sort((a, b) => (a.owner < b.owner ? -1 : 1)).map((o) => ({ ...o, estTokens: Math.round(o.bytes / 3) }));
}

export interface HistoryQuery {
  q: string | null;
  session: string | null;
  role: string | null;
}

/** GET /history — 프롬프트 기록. 꺼져 있으면 404 history_off. 글을 보여 주기만 한다. */
export async function historyData(p: Project, q: HistoryQuery): Promise<Record<string, unknown>> {
  if (!historyOn(p)) throw new ApiError(404, "history_off", "대화 기록 읽기가 꺼져 있습니다. 켜려면 사람이 ~/.config/harness-kit/config.json 에 \"history\": \"on\" 을 씁니다", configHint(p));
  const dirs = projectDirs(p);
  const sess = await sessionMap(p);
  const prompts: { at: string; text: string; session: string | null; role: string | null; issue: string | null; harness: string }[] = [];
  let unreadable = 0;
  const readLines = (file: string): string[] => {
    try {
      return fs.readFileSync(file, "utf8").split("\n");
    } catch {
      return [];
    }
  };
  for (const line of readLines(path.join(p.home, ".claude/history.jsonl"))) {
    if (!line.trim()) continue;
    try {
      const j: unknown = JSON.parse(line);
      if (!isObj(j) || typeof j.display !== "string" || !inside(str(j.project), dirs)) continue;
      const ts = typeof j.timestamp === "number" ? j.timestamp : NaN;
      if (!Number.isFinite(ts)) continue;
      const id = str(j.sessionId);
      const meta = id ? sess.get(id) : undefined;
      prompts.push({ at: new Date(ts).toISOString(), text: j.display.slice(0, PROMPT_CHARS), session: id, role: meta?.role ?? null, issue: meta?.issue ?? null, harness: "claude" });
    } catch {
      unreadable += 1;
    }
  }
  const codexCwd = new Map<string, string | null>();
  const files: string[] = [];
  await walk(path.join(p.home, ".codex/sessions"), 4, files, () => true);
  for (const f of files) {
    const st = await loadFile(p, f, parseCodex, 0);
    if (st?.session) codexCwd.set(st.session, st.cwd);
  }
  for (const line of readLines(path.join(p.home, ".codex/history.jsonl"))) {
    if (!line.trim()) continue;
    try {
      const j: unknown = JSON.parse(line);
      if (!isObj(j) || typeof j.text !== "string") continue;
      const id = str(j.session_id);
      if (!id || !inside(codexCwd.get(id) ?? null, dirs)) continue;
      const ts = typeof j.ts === "number" ? j.ts * 1000 : NaN;
      if (!Number.isFinite(ts)) continue;
      prompts.push({ at: new Date(ts).toISOString(), text: j.text.slice(0, PROMPT_CHARS), session: id, role: sess.get(id)?.role ?? null, issue: sess.get(id)?.issue ?? null, harness: "codex" });
    } catch {
      unreadable += 1;
    }
  }
  const needle = q.q?.toLowerCase() ?? null;
  const all = prompts
    .filter((x) => (!needle || x.text.toLowerCase().includes(needle)) && (!q.session || x.session === q.session) && (!q.role || x.role === q.role))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { enabled: true, prompts: all.slice(0, HISTORY_LIMIT), total: all.length, shown: Math.min(all.length, HISTORY_LIMIT), unreadable, note: "글을 보여 주기만 합니다. 내보내기 · 커밋 · 세션 요청에 넣지 않습니다" };
}
