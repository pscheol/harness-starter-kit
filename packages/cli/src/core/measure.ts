/**
 * 세션마다 실리는 양을 lock 의 owner 별로 잰다(설계 10 §3.7, MD-R16). 정적 바이트 합계다.
 * 모델을 부르지 않고, 외부 도구의 훅을 실행하지 않는다. 읽기만 한다.
 *
 * 재는 것(하네스 하나 기준):
 *  - 진입 파일과 그 `@` 가져오기(CLAUDE.md · .claude/CLAUDE.md · AGENTS.md)
 *  - `paths` 가 없는 규칙(.claude/rules · .kiro/steering · .cursor/rules)
 *  - 스킬 · 서브에이전트 설명(`name` + `description` 머리 글)
 *  - 훅 수(설정 파일의 이벤트별 항목 수)
 */
import fs from "node:fs";
import path from "node:path";

export interface Entry {
  path: string;
  owner: string;
}

export type LoadKind = "entry" | "rule" | "skill" | "agent";

export interface Loaded {
  path: string;
  owner: string;
  kind: LoadKind;
  bytes: number;
}

export interface OwnerMeasure {
  bytes: number;
  files: number;
  entries: number;
  rules: number;
  skills: number;
  agents: number;
}

export interface Measure {
  harness: string;
  owners: Record<string, OwnerMeasure>;
  /** owner → 이벤트 → 훅 수 */
  hooks: Record<string, Record<string, number>>;
  total: number;
  files: Loaded[];
}

interface HarnessSpec {
  entries: string[];
  rules: string | null;
  skills: string | null;
  agents: string | null;
  hookFiles: string[];
}

export const HARNESS_LOAD: Record<string, HarnessSpec> = {
  claude: { entries: ["CLAUDE.md", ".claude/CLAUDE.md"], rules: ".claude/rules", skills: ".claude/skills", agents: ".claude/agents", hookFiles: [".claude/settings.json"] },
  codex: { entries: ["AGENTS.md"], rules: null, skills: ".agents/skills", agents: null, hookFiles: [".codex/hooks.json"] },
  cursor: { entries: ["AGENTS.md"], rules: ".cursor/rules", skills: ".cursor/skills", agents: ".cursor/agents", hookFiles: [".cursor/hooks.json"] },
  kiro: { entries: ["AGENTS.md"], rules: ".kiro/steering", skills: ".kiro/skills", agents: null, hookFiles: [] },
};

const IMPORT_DEPTH = 5;
const KIT_HOOK_MARKS = ["scripts/hooks/dispatch.sh", "scripts/hooks/"];

function readText(file: string): string | null {
  try {
    const st = fs.statSync(file);
    return st.isFile() ? fs.readFileSync(file, "utf8") : null;
  } catch {
    return null;
  }
}

function frontmatter(text: string): { head: string; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  return m ? { head: m[1] as string, body: text.slice(m[0].length) } : null;
}

/** 머리의 최상위 키 하나의 값(접는 `>` · `|` 블록과 이어지는 들여쓴 줄 포함). */
function headValue(head: string, key: string): string | null {
  const lines = head.split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i < 0) return null;
  let value = (lines[i] as string).slice(key.length + 1).trim();
  const out: string[] = [];
  for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j] as string); j += 1) out.push((lines[j] as string).trim());
  if (/^[>|][+-]?$/.test(value)) value = "";
  return [value, ...out].filter(Boolean).join(" ");
}

const hasPaths = (head: string): boolean => head.split(/\r?\n/).some((l) => /^(paths|globs):/.test(l));

/** 경로 → owner. 정확히 맞는 항목, 없으면 가장 가까운 상위 폴더 항목, 없으면 user(lock 밖). */
export function ownerResolver(entries: Entry[]): (rel: string) => string {
  const map = new Map(entries.map((e) => [e.path, e.owner]));
  return (rel) => {
    let p = rel;
    for (;;) {
      const o = map.get(p);
      if (o !== undefined) return o;
      const i = p.lastIndexOf("/");
      if (i < 0) return "user";
      p = p.slice(0, i);
    }
  };
}

function listDir(root: string, rel: string): { name: string; dir: boolean }[] {
  try {
    return fs.readdirSync(path.join(root, rel), { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() })).sort((a, b) => (a.name < b.name ? -1 : 1));
  } catch {
    return [];
  }
}

/** `@경로` 만 있는 줄. 파일 기준 상대 → 리포 루트 기준 순으로 찾는다. */
function importsOf(root: string, rel: string, text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*@(\S+)\s*$/.exec(line);
    if (!m) continue;
    const target = m[1] as string;
    for (const base of [path.posix.dirname(rel), ""]) {
      const cand = path.posix.normalize(path.posix.join(base, target));
      if (cand.startsWith("..") || path.posix.isAbsolute(cand)) continue;
      if (readText(path.join(root, cand)) !== null) {
        out.push(cand);
        break;
      }
    }
  }
  return out;
}

export interface MeasureOptions {
  harness: string;
  entries: Entry[];
  /** owner → 그 owner 의 훅 명령에 든 글(외부 도구). 킷 훅은 scripts/hooks/ 로 알아본다 */
  hookOwners: [string, string[]][];
}

export function measureSession(root: string, opts: MeasureOptions): Measure {
  const spec = HARNESS_LOAD[opts.harness] ?? HARNESS_LOAD.claude;
  const ownerOf = ownerResolver(opts.entries);
  const files: Loaded[] = [];
  const seen = new Set<string>();
  const add = (rel: string, kind: LoadKind, bytes: number): void => {
    if (seen.has(`${kind}:${rel}`)) return;
    seen.add(`${kind}:${rel}`);
    files.push({ path: rel, owner: ownerOf(rel), kind, bytes });
  };
  const walkImports = (rel: string, depth: number): void => {
    const text = readText(path.join(root, rel));
    if (text === null || seen.has(`entry:${rel}`)) return;
    add(rel, "entry", Buffer.byteLength(text));
    if (depth >= IMPORT_DEPTH) return;
    for (const next of importsOf(root, rel, text)) walkImports(next, depth + 1);
  };
  for (const rel of (spec as HarnessSpec).entries) walkImports(rel, 0);

  const rulesDir = (spec as HarnessSpec).rules;
  if (rulesDir) {
    const stack = [rulesDir];
    while (stack.length) {
      const dir = stack.pop() as string;
      for (const e of listDir(root, dir)) {
        const rel = `${dir}/${e.name}`;
        if (e.dir) {
          stack.push(rel);
          continue;
        }
        const text = readText(path.join(root, rel));
        if (text === null || !/\.(md|mdc)$/.test(e.name)) continue;
        const fm = frontmatter(text);
        if (fm && hasPaths(fm.head)) continue;
        add(rel, "rule", Buffer.byteLength(text));
        for (const next of importsOf(root, rel, text)) walkImports(next, 1);
      }
    }
  }

  const described = (dir: string | null, kind: LoadKind, file: (name: string, isDir: boolean) => string | null): void => {
    if (!dir) return;
    for (const e of listDir(root, dir)) {
      const f = file(e.name, e.dir);
      if (!f) continue;
      const rel = `${dir}/${f}`;
      const text = readText(path.join(root, rel));
      const fm = text === null ? null : frontmatter(text);
      if (!fm) continue;
      const name = headValue(fm.head, "name") ?? e.name;
      const desc = headValue(fm.head, "description") ?? "";
      add(rel, kind, Buffer.byteLength(`${name}: ${desc}`));
    }
  };
  described((spec as HarnessSpec).skills, "skill", (n, d) => (d ? `${n}/SKILL.md` : null));
  described((spec as HarnessSpec).agents, "agent", (n, d) => (!d && n.endsWith(".md") ? n : null));

  const owners: Record<string, OwnerMeasure> = {};
  const slot = (o: string): OwnerMeasure => (owners[o] ??= { bytes: 0, files: 0, entries: 0, rules: 0, skills: 0, agents: 0 });
  for (const f of files) {
    const m = slot(f.owner);
    m.bytes += f.bytes;
    m.files += 1;
    if (f.kind === "entry") m.entries += 1;
    else if (f.kind === "rule") m.rules += 1;
    else if (f.kind === "skill") m.skills += 1;
    else m.agents += 1;
  }

  const hooks: Record<string, Record<string, number>> = {};
  for (const hf of (spec as HarnessSpec).hookFiles) {
    const text = readText(path.join(root, hf));
    if (text === null) continue;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    const table = data !== null && typeof data === "object" ? (data as Record<string, unknown>).hooks : undefined;
    if (table === null || typeof table !== "object" || Array.isArray(table)) continue;
    for (const [event, groups] of Object.entries(table as Record<string, unknown>)) {
      if (!Array.isArray(groups)) continue;
      for (const g of groups) {
        const inner = g !== null && typeof g === "object" && Array.isArray((g as Record<string, unknown>).hooks) ? ((g as Record<string, unknown>).hooks as unknown[]) : [g];
        for (const h of inner) {
          const cmd = h !== null && typeof h === "object" && typeof (h as Record<string, unknown>).command === "string" ? ((h as Record<string, unknown>).command as string) : "";
          const owner = hookOwnerOf(cmd, opts.hookOwners);
          const byEvent = (hooks[owner] ??= {});
          byEvent[event] = (byEvent[event] ?? 0) + 1;
        }
      }
    }
  }
  for (const o of Object.keys(hooks)) slot(o);
  const total = files.reduce((s, f) => s + f.bytes, 0);
  return { harness: opts.harness, owners: Object.fromEntries(Object.entries(owners).sort(([a], [b]) => (a < b ? -1 : 1))), hooks, total, files };
}

export function hookOwnerOf(command: string, patterns: [string, string[]][]): string {
  for (const [owner, texts] of patterns) if (texts.some((t) => command.includes(t))) return owner;
  if (KIT_HOOK_MARKS.some((m) => command.includes(m))) return "kit";
  return "user";
}

export const hookCount = (m: Measure, owner: string): number => Object.values(m.hooks[owner] ?? {}).reduce((s, n) => s + n, 0);

/** 세션 시작 위주의 추정 토큰(06 §3.18 과 같은 바이트 ÷ 3) */
export const estTokens = (bytes: number): number => Math.round(bytes / 3);

export const THRESHOLD_BYTES = 4096;

export interface Delta {
  owner: string;
  before: number;
  after: number;
  detail: string;
}

/** 전 · 후 비교. 한 owner 라도 있으면 줄을 낸다. */
export function compare(before: Measure, after: Measure): { rows: Delta[]; added: number; hookRows: { event: string; before: number; after: number }[] } {
  const names = [...new Set([...Object.keys(before.owners), ...Object.keys(after.owners)])].sort((a, b) => (a === "kit" ? -1 : b === "kit" ? 1 : a < b ? -1 : 1));
  const rows = names.map((owner) => {
    const a = after.owners[owner];
    const parts = a ? [a.rules ? `규칙 ${a.rules}` : "", a.skills ? `스킬 설명 ${a.skills}` : "", a.agents ? `에이전트 설명 ${a.agents}` : "", a.entries ? `진입 파일 ${a.entries}` : ""].filter(Boolean) : [];
    return { owner, before: before.owners[owner]?.bytes ?? 0, after: a?.bytes ?? 0, detail: parts.join(" · ") };
  });
  const events = [...new Set([...Object.values(before.hooks), ...Object.values(after.hooks)].flatMap((h) => Object.keys(h)))].sort();
  const sum = (m: Measure, ev: string): number => Object.values(m.hooks).reduce((s, h) => s + (h[ev] ?? 0), 0);
  return { rows, added: Math.max(0, after.total - before.total), hookRows: events.map((event) => ({ event, before: sum(before, event), after: sum(after, event) })) };
}

export function measureLines(command: string, before: Measure, after: Measure): string[] {
  const c = compare(before, after);
  const fmt = (n: number): string => n.toLocaleString("en-US").padStart(8);
  const lines = [`${command} — 세션마다 실리는 양(바이트, 하네스 ${after.harness})`];
  for (const r of c.rows) lines.push(`  ${r.owner.padEnd(16)}${fmt(r.before)} →${fmt(r.after)}${r.detail ? `   ${r.detail}` : ""}`);
  const changed = c.hookRows.filter((h) => h.before !== h.after || h.after > 0);
  if (changed.length) lines.push(`  훅  ${changed.map((h) => `${h.event} ${h.before} → ${h.after}`).join(" · ")}`);
  lines.push(`늘어남 ${c.added.toLocaleString("en-US")}바이트(추정 약 ${estTokens(c.added).toLocaleString("en-US")}토큰 / 세션). 이 양은 킷 상한 밖이고 켠 모듈 몫이다.`);
  return lines;
}
