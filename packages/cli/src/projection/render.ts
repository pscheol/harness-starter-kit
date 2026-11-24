/**
 * 배치 생성 형식 — 규칙 · 스킬 · 역할 · 모델 해석(HK-13 design §3 · §4, 03 §3.6 · §3.7, 12 §3.4 · §3.5).
 * Python `scripts/harness/projection_render.py` 와 같은 바이트를 낸다(시험이 묶는다).
 */
import { fmList, fmStr, parseFrontmatter, splitFrontmatter, type Frontmatter } from "./frontmatter";
import type { ProjectionSpec } from "./spec";

const LOCKED_MIN = ["implement", "design", "review"];
const LOCKED_NAMES = ["worker", "reviewer", "designer"];
const MODEL_HARNESSES = ["claude", "codex", "kiro"] as const;
type ModelHarness = (typeof MODEL_HARNESSES)[number];
const CLAUDE_TOOLS: [string, string[]][] = [["read", ["Read"]], ["search", ["Glob", "Grep"]], ["shell", ["Bash"]], ["write", ["Edit", "Write"]], ["web", ["WebFetch", "WebSearch"]]];
const KIRO_TOOLS: [string, string][] = [["read", "read"], ["search", "read"], ["shell", "shell"], ["write", "write"], ["web", "web"]];
export const KIRO_RESOURCES = ["file://AGENTS.md", "file://.agents/rules/guardrails.md", "skill://.agents/skills/**/SKILL.md"];
const EFFORT_KEY: Partial<Record<ModelHarness, string>> = { claude: "effort", codex: "model_reasoning_effort" };

export const genMd = (source: string): string => `<!-- knots-sync 생성 · 원본 ${source} · 고칠 때는 원본을 고친다 -->`;
export const genToml = (source: string): string => `# knots-sync 생성 · 원본 ${source} · 고칠 때는 원본을 고친다`;

function basename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

function decode(data: Buffer): string {
  return data.toString("utf8");
}

function parsed(text: string): { fm: Frontmatter; body: string; hasBlock: boolean } {
  const { block, body } = splitFrontmatter(text);
  return { fm: block === null ? {} : parseFrontmatter(block), body, hasBlock: block !== null };
}

export interface Rule {
  name: string;
  source: string;
  data: Buffer;
  paths: string[] | null;
  body: string;
}

export function parseRule(source: string, data: Buffer | string): Rule {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const { fm, body } = parsed(decode(bytes));
  const paths = fmList(fm, "paths");
  return { name: basename(source).slice(0, -".md".length), source, data: bytes, paths: paths.length ? paths : null, body };
}

export interface SkillFile {
  rel: string;
  bytes: Buffer;
  executable: boolean;
}

export interface Skill {
  name: string;
  source: string;
  files: SkillFile[];
  description: string;
  body: string;
  fm: Frontmatter;
}

export function parseSkill(source: string, files: SkillFile[] | Map<string, { bytes: Buffer; executable: boolean }>): Skill {
  const list = Array.isArray(files) ? files : [...files].map(([rel, f]) => ({ rel, bytes: f.bytes, executable: f.executable }));
  const data = list.find((f) => f.rel === "SKILL.md")?.bytes ?? Buffer.alloc(0);
  const { fm, body } = parsed(decode(data));
  return { name: fmStr(fm, "name") || basename(source), source, files: list, description: fmStr(fm, "description"), body, fm };
}

export interface Role {
  name: string;
  source: string;
  data: Buffer;
  description: string;
  mode: "read-only" | "write";
  tools: string[];
  fm: Frontmatter;
  body: string;
}

export function parseRole(source: string, data: Buffer | string): Role {
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
    body,
  };
}

export interface Policy {
  locked: string[];
  classes: Record<string, unknown>;
  tiers: Record<string, unknown>;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parsePolicy(text: string | null): Policy {
  let raw: unknown = null;
  try {
    raw = text === null ? null : JSON.parse(text);
  } catch {
    raw = null;
  }
  if (!isObject(raw)) return { locked: [], classes: {}, tiers: {} };
  const locked = Array.isArray(raw.locked) ? raw.locked.filter((x): x is string => typeof x === "string") : [];
  return { locked, classes: isObject(raw.classes) ? raw.classes : {}, tiers: isObject(raw.tiers) ? raw.tiers : {} };
}

function direct(fm: Frontmatter, key: string): Record<string, string> {
  const v = fm[key];
  if (!isObject(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string" && x !== "")) as Record<string, string>;
}

export type ModelFields = Record<ModelHarness, Record<string, string>>;
export type ModelResult = { ok: true; locked: boolean; fields: ModelFields } | { ok: false; error: string };

/** 역할의 하네스별 모델 · effort 필드(12 §3.4 · §3.5). 잠긴 역할은 inherit, 잠긴 역할에 모델 키가 있으면 오류(MR-R3). */
export function resolveModel(role: Role, policy: Policy): ModelResult {
  const cls = fmStr(role.fm, "class");
  const locked = new Set([...policy.locked, ...LOCKED_MIN]);
  const hasModel = ["tier", "model", "effort"].some((k) => Object.hasOwn(role.fm, k));
  if ((cls && locked.has(cls)) || LOCKED_NAMES.includes(role.name)) {
    if (hasModel) return { ok: false, error: `잠긴 역할 '${role.name}' 에는 tier · model · effort 를 둘 수 없다(12 MR-R3)` };
    return { ok: true, locked: true, fields: { claude: { model: "inherit" }, codex: {}, kiro: {} } };
  }
  const fromClass = cls && typeof policy.classes[cls] === "string" ? (policy.classes[cls] as string) : "";
  const tier = fmStr(role.fm, "tier") || fromClass || "inherit";
  const model = direct(role.fm, "model");
  const effort = direct(role.fm, "effort");
  const fields = {} as ModelFields;
  for (const h of MODEL_HARNESSES) {
    const tierSpec = tier !== "inherit" && isObject(policy.tiers[tier]) ? (policy.tiers[tier] as Record<string, unknown>)[h] : undefined;
    let out: Record<string, string> = {};
    if (isObject(tierSpec)) out = Object.fromEntries(Object.entries(tierSpec).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    if (Object.hasOwn(model, h)) out.model = model[h] as string;
    const ek = EFFORT_KEY[h];
    if (Object.hasOwn(effort, h) && ek) out[ek] = effort[h] as string;
    if (h === "kiro") out = Object.fromEntries(Object.entries(out).filter(([k]) => k === "model"));
    if (h === "claude" && !Object.hasOwn(out, "model")) out = { model: "inherit", ...out };
    fields[h] = out;
  }
  return { ok: true, locked: false, fields };
}

export function renderCursorRule(r: Rule): string {
  const globs = r.paths ? r.paths.join(",") : "";
  return `---\ndescription:\nglobs:${globs ? ` ${globs}` : ""}\nalwaysApply: ${r.paths ? "false" : "true"}\n---\n${genMd(r.source)}\n${r.body}`;
}

export function renderKiroRule(r: Rule): string {
  let head: string;
  if (r.paths) {
    const pattern = r.paths.length === 1 ? JSON.stringify(r.paths[0]) : `[${r.paths.map((p) => JSON.stringify(p)).join(", ")}]`;
    head = `---\ninclusion: fileMatch\nfileMatchPattern: ${pattern}\n---\n`;
  } else head = "---\ninclusion: always\n---\n";
  return `${head}${genMd(r.source)}\n${r.body}`;
}

export function renderCursorCommand(s: Skill): string {
  return `---\ndescription: ${s.description}\n---\n${genMd(`${s.source}/SKILL.md`)}\n${s.body}`;
}

export function renderKiroSkillSteering(s: Skill): string {
  return `---\ninclusion: manual\ndescription: ${s.description}\n---\n${genMd(`${s.source}/SKILL.md`)}\n${s.body}`;
}

export function claudeTools(tools: string[]): string[] {
  return CLAUDE_TOOLS.filter(([k]) => tools.includes(k)).flatMap(([, names]) => names);
}

export function kiroTools(tools: string[]): string[] {
  const out: string[] = [];
  for (const [k, name] of KIRO_TOOLS) if (tools.includes(k) && !out.includes(name)) out.push(name);
  return out;
}

function withNewline(text: string): string {
  return text === "" || text.endsWith("\n") ? text : `${text}\n`;
}

export function renderClaudeRole(r: Role, fields: Record<string, string>): string {
  const lines = ["---", `name: ${r.name}`, `description: ${r.description}`, `tools: ${claudeTools(r.tools).join(", ")}`];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
  lines.push("---", genMd(r.source));
  return `${lines.join("\n")}\n${r.body}`;
}

function control(ch: string, keep: string): string {
  const code = ch.codePointAt(0) as number;
  if (keep.includes(ch)) return ch;
  if (code < 0x20 || code === 0x7f) return `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
  return ch;
}

const TOML_SHORT: Record<string, string> = { "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r", '"': '\\"', "\\": "\\\\" };

export function tomlString(value: string): string {
  let out = "";
  for (const ch of value) out += TOML_SHORT[ch] ?? control(ch, "");
  return `"${out}"`;
}

export function tomlMultiline(value: string): string {
  const escaped = value.split("\\").join("\\\\").split('"""').join('""\\"');
  let out = "";
  for (const ch of escaped) out += control(ch, "\n\t");
  return out;
}

export function renderCodexRole(r: Role, fields: Record<string, string>, spec: Pick<ProjectionSpec, "readOnlyLine">): string {
  const lines = [genToml(r.source), `name = ${tomlString(r.name)}`, `description = ${tomlString(r.description)}`, `sandbox_mode = "${r.mode === "write" ? "workspace-write" : "read-only"}"`];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k} = ${tomlString(v)}`);
  lines.push("", 'developer_instructions = """');
  const instructions = (r.mode !== "write" ? `${spec.readOnlyLine}\n` : "") + withNewline(r.body);
  return `${lines.join("\n")}\n${tomlMultiline(instructions)}"""\n`;
}

/** hooks: 쓰기 역할에 넣는 Kiro CLI 훅(hooks.json 의 subagents 항목, HK-24). */
export function renderKiroRole(r: Role, fields: Record<string, string>, hooks: Record<string, unknown>): string {
  const obj: Record<string, unknown> = {
    name: r.name,
    description: r.description,
    prompt: r.body,
    tools: kiroTools(r.tools),
    allowedTools: r.mode === "write" ? ["read", "write"] : ["read"],
    resources: [...KIRO_RESOURCES],
  };
  if (r.mode === "write" && Object.keys(hooks).length) obj.hooks = hooks;
  Object.assign(obj, fields);
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** `context: fork` 가 아닌 스킬 머리에 model · effort 가 있다(03 §3.6, 12 MR-R8). */
export function skillModelProblem(s: Skill): boolean {
  return (Object.hasOwn(s.fm, "model") || Object.hasOwn(s.fm, "effort")) && fmStr(s.fm, "context") !== "fork";
}
