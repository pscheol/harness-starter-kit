/**
 * Intent · Unit 목록 · 흐름 보기 데이터 · Unit 변경 제안(설계 06 §3.3 · §3.16, 08 §3.5, DB-R29).
 * 제안 저장은 units.proposed.json 만 쓴다. units.json 은 intent 게이트 승인 처리만 옮긴다.
 */
import fs from "node:fs";
import path from "node:path";
import { approvalSha, approvalState, parse as parseApprovals } from "./approvals";
import { fileStamp, treeStamp } from "./cache";
import { ApiError, bad, notFound } from "./errors";
import { parseLoose } from "./frontmatter";
import type { Project } from "./project";
import { parseQuestions } from "./questions";
import type { IssueModel } from "./readers/issues";
import { isObj, readJson, sha256 } from "./util";

export const INTENT_FOLDER = /^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-(.+)$/;

export interface Unit {
  id: string;
  title: string;
  kind: string;
  area: string | null;
  dependsOn: string[];
  issue: string | null;
  planned: boolean;
  order: number | null;
  stories: string[];
  provides: string[];
  [k: string]: unknown;
}

export interface IntentInfo {
  key: string;
  name: string;
  dir: string;
  abs: string;
}

export function intentFolders(root: string): IntentInfo[] {
  const dir = path.join(root, ".agents/docs/intents");
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  const out: IntentInfo[] = [];
  for (const n of names) {
    const m = INTENT_FOLDER.exec(n);
    if (!m) continue;
    try {
      if (!fs.lstatSync(path.join(dir, n)).isDirectory()) continue;
    } catch {
      continue;
    }
    out.push({ key: m[1] as string, name: m[2] as string, dir: `.agents/docs/intents/${n}`, abs: path.join(dir, n) });
  }
  return out;
}

export function findIntent(root: string, key: string): IntentInfo {
  const found = intentFolders(root).filter((i) => i.key === key);
  if (found.length === 0) throw notFound(`Intent 가 없습니다: ${key}`);
  if (found.length > 1) throw new ApiError(409, "ambiguous_branch", `같은 키의 Intent 폴더가 둘 이상입니다: ${key}`);
  return found[0] as IntentInfo;
}

export function readUnitsFile(abs: string): { raw: Buffer | null; data: Record<string, unknown> | null; units: Unit[] } {
  const file = path.join(abs, "units.json");
  let raw: Buffer | null = null;
  try {
    raw = fs.readFileSync(file);
  } catch {
    return { raw: null, data: null, units: [] };
  }
  let data: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(raw.toString("utf8")) as unknown;
    data = isObj(v) ? v : null;
  } catch {
    data = null;
  }
  const list = data && Array.isArray(data.units) ? (data.units as Record<string, unknown>[]) : [];
  const units = list.filter((u) => typeof u.id === "string").map((u) => ({
    ...u,
    id: u.id as string,
    title: typeof u.title === "string" ? u.title : (u.id as string),
    kind: typeof u.kind === "string" ? u.kind : "feature",
    area: typeof u.area === "string" ? u.area : null,
    dependsOn: Array.isArray(u.dependsOn) ? u.dependsOn.filter((x): x is string => typeof x === "string") : [],
    issue: typeof u.issue === "string" ? u.issue : null,
    planned: u.planned !== false,
    order: typeof u.order === "number" ? u.order : null,
    stories: Array.isArray(u.stories) ? u.stories.filter((x): x is string => typeof x === "string") : [],
    provides: Array.isArray(u.provides) ? u.provides.filter((x): x is string => typeof x === "string") : [],
  }));
  return { raw, data, units };
}

const num = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? 0);
const byId = (a: { id: string }, b: { id: string }): number => num(a.id) - num(b.id);

const STEPS = ["requirements", "design", "tasks", "impl", "verify", "mr", "done"];

/** 이슈 stage → 흐름 단계(지난 단계 :done, 지금 :active). 보드와 같은 원본(게이트 판정)이다. */
export function stepsOf(issue: IssueModel | undefined, withDeploy: boolean): string[] {
  const steps = withDeploy ? [...STEPS, "deploy"] : [...STEPS];
  if (!issue) return steps;
  let current: string;
  const state = issue.docs.tasks?.state ?? null;
  if (issue.stage === "mr") current = state === "check" || state === "completed" ? "mr" : state === "active" ? "impl" : "mr";
  else if (issue.stage === "completed") current = withDeploy ? "deploy" : "";
  else current = issue.stage;
  const at = current ? steps.indexOf(current) : steps.length;
  return steps.map((s, i) => (i < at ? `${s}:done` : i === at ? `${s}:active` : s));
}

export function layout(units: Unit[]): { nodes: { id: string; type: string; position: { x: number; y: number }; unit: Unit }[]; edges: { source: string; target: string; kind: string; label?: string }[] } {
  const live = units.filter((u) => u.planned).sort(byId);
  const ids = new Map(live.map((u) => [u.id, u]));
  const contracts = live.filter((u) => u.kind === "contract");
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (u: Unit): number => {
    if (depth.has(u.id)) return depth.get(u.id) as number;
    if (visiting.has(u.id)) return 0;
    visiting.add(u.id);
    const deps = u.dependsOn.map((d) => ids.get(d)).filter((d): d is Unit => Boolean(d) && (d as Unit).kind !== "contract");
    const v = deps.length ? Math.max(...deps.map((d) => depthOf(d) + 1)) : 0;
    visiting.delete(u.id);
    depth.set(u.id, v);
    return v;
  };
  const nodes: { id: string; type: string; position: { x: number; y: number }; unit: Unit }[] = [];
  contracts.forEach((u, i) => nodes.push({ id: u.id, type: "contract-unit", position: { x: i, y: 0 }, unit: u }));
  const columns = new Map<number, number>();
  for (const u of live.filter((x) => x.kind !== "contract")) {
    const x = depthOf(u);
    const y = (columns.get(x) ?? 0) + 1;
    columns.set(x, y);
    nodes.push({ id: u.id, type: "unit", position: { x, y }, unit: u });
  }
  const edges: { source: string; target: string; kind: string }[] = [];
  for (const u of live) for (const d of u.dependsOn) if (ids.has(d)) edges.push({ source: d, target: u.id, kind: (ids.get(d) as Unit).kind === "contract" ? "contract" : "depends" });
  return { nodes, edges };
}

export function proposalOf(abs: string): Record<string, unknown> | null {
  return readJson(path.join(abs, "units.proposed.json"));
}

export function intentModel(p: Project, info: IntentInfo, issues: IssueModel[]): Record<string, unknown> {
  const intentMd = path.join(info.abs, "intent.md");
  let fm: Record<string, string> = {};
  let iSha: string | null = null;
  try {
    const b = fs.readFileSync(intentMd);
    fm = parseLoose(b.toString("utf8")) ?? {};
    iSha = approvalSha(b);
  } catch {
    fm = {};
  }
  const { units } = readUnitsFile(info.abs);
  let questions = { open: 0, total: 0 };
  try {
    const q = parseQuestions(fs.readFileSync(path.join(info.abs, "questions.md"), "utf8"));
    questions = { open: q.questions.filter((x) => x.open).length, total: q.questions.length };
  } catch {
    // 질문 파일 없음
  }
  let plans: string[] = [];
  try {
    plans = (fs.readdirSync(path.join(info.abs, "plans"), { recursive: true }) as string[]).map((n) => String(n).split(path.sep).join("/")).filter((n) => n.endsWith(".md")).sort().map((n) => `${info.dir}/plans/${n}`);
  } catch {
    plans = [];
  }
  let entries: ReturnType<typeof parseApprovals>["entries"] = [];
  try {
    entries = parseApprovals(fs.readFileSync(path.join(info.abs, "approvals.md"))).entries;
  } catch {
    entries = [];
  }
  const intentState = approvalState(entries, "intent", iSha, p.policy());
  const plansState = approvalState(entries, "plans", null, p.policy());
  let csSha: string | null = null;
  try {
    csSha = approvalSha(fs.readFileSync(path.join(info.abs, "current-state.md")));
  } catch {
    csSha = null;
  }
  const codebaseState = csSha ? approvalState(entries, "codebase", csSha, p.policy()) : "none";
  const gates = p.gates();
  const stage = gates.includes("intent") && intentState !== "valid" ? "intent" : gates.includes("plans") && plansState !== "valid" ? "plans" : "issues";
  return {
    key: info.key, name: info.name, dir: info.dir, title: fm.title ?? null, source: fs.existsSync(path.join(info.abs, "intent.json")) ? "aidlc" : "kit",
    status: fm.status ?? null,
    units: units.map((u) => {
      const issue = u.issue ? issues.find((i) => i.key === u.issue) : undefined;
      return { id: u.id, title: u.title, kind: u.kind, dependsOn: u.dependsOn, issue: u.issue, planned: u.planned, progress: issue ? issue.stage : u.issue ? "unknown" : "not-started" };
    }),
    questions, plans, approvals: { codebase: codebaseState, intent: intentState, plans: plansState }, stage, proposal: proposalOf(info.abs) !== null,
  };
}

export function intentStamp(root: string): string {
  return treeStamp(path.join(root, ".agents/docs/intents"), 3);
}

export function flowData(p: Project, info: IntentInfo, issues: IssueModel[], sessions: { id: string; issue: string | null; name: string | null; harness: string | null; state: string }[]): Record<string, unknown> {
  const { units, data, raw } = readUnitsFile(info.abs);
  let fm: Record<string, string> = {};
  try {
    fm = parseLoose(fs.readFileSync(path.join(info.abs, "intent.md"), "utf8")) ?? {};
  } catch {
    fm = {};
  }
  let approved: { at: string; by: string } | null = null;
  try {
    const entries = parseApprovals(fs.readFileSync(path.join(info.abs, "approvals.md"))).entries.filter((e) => e.valid && e.gate === "intent" && e.decision === "approved");
    const last = entries[entries.length - 1];
    if (last) approved = { at: last.at, by: last.approver?.name ?? last.approver?.email ?? "" };
  } catch {
    approved = null;
  }
  const withDeploy = p.gates().includes("deploy");
  const { nodes, edges } = layout(units);
  const intentMeta = data && isObj(data.intent) ? data.intent : {};
  return {
    intent: { key: info.key, title: fm.title ?? (typeof intentMeta.title === "string" ? intentMeta.title : null), approved },
    nodes: nodes.map((n) => {
      const issue = n.unit.issue ? issues.find((i) => i.key === n.unit.issue) : undefined;
      if (n.type === "contract-unit") return { id: n.id, type: n.type, position: n.position, data: { title: n.unit.title, contracts: n.unit.provides, issue: n.unit.issue, steps: stepsOf(issue, withDeploy) } };
      const s = issue ? sessions.find((x) => x.issue === issue.key && x.state !== "gone") : undefined;
      const flags: string[] = [];
      if (issue?.review?.open.CRITICAL) flags.push(`critical:${issue.review.open.CRITICAL}`);
      if (issue?.review?.open.HIGH) flags.push(`high:${issue.review.open.HIGH}`);
      if (issue?.verify && (issue.verify.status === "failed" || issue.verify.status === "incomplete")) flags.push(`verify:${issue.verify.status}`);
      const b = issue?.docs.tasks?.bolts;
      return {
        id: n.id, type: n.type, position: n.position,
        data: { issue: n.unit.issue, area: n.unit.area, title: n.unit.title, session: s ? { name: s.name, harness: s.harness } : null, steps: stepsOf(issue, withDeploy), flags, bolts: b ? { done: b.done, total: b.total, estimated: false } : { done: 0, total: Math.max(1, Math.ceil(n.unit.stories.length / 3)), estimated: true } },
      };
    }),
    edges,
    proposal: proposalOf(info.abs),
    unitsSha256: unitsSha(raw),
    readAt: new Date().toISOString(),
  };
}

// ── 변경 제안 ────────────────────────────────────────────────────────────────

export interface Change {
  op: string;
  unit?: string;
  dependsOn?: string;
  into?: string[];
  units?: string[];
  reason?: string;
}

function validChanges(input: unknown): Change[] {
  if (!Array.isArray(input) || input.length > 100) throw bad("changes 는 100개 이하의 배열입니다");
  return input.map((c) => {
    if (!isObj(c) || typeof c.op !== "string" || !["add-dep", "remove-dep", "split", "merge", "order"].includes(c.op)) throw bad("op 는 add-dep · remove-dep · split · merge · order 다");
    const out: Change = { op: c.op };
    if (c.unit !== undefined) out.unit = String(c.unit);
    if (c.dependsOn !== undefined) out.dependsOn = String(c.dependsOn);
    if (c.into !== undefined) out.into = Array.isArray(c.into) ? c.into.map((x) => String(x).slice(0, 200)) : [];
    if (c.units !== undefined) out.units = Array.isArray(c.units) ? c.units.map(String) : [];
    if (c.reason !== undefined) out.reason = String(c.reason).replace(/[\r\n]+/g, " ").slice(0, 500);
    return out;
  });
}

/** 제안을 units 사본에 적용한다. 고리 · 없는 Unit · 계약 합치기는 422. */
export function applyChanges(units: Unit[], changes: Change[]): Unit[] {
  let list = units.map((u) => ({ ...u, dependsOn: [...u.dependsOn], stories: [...u.stories] }));
  const get = (id: string | undefined): Unit => {
    const u = list.find((x) => x.id === id);
    if (!u) throw new ApiError(422, "unknown_unit", `없는 Unit: ${id ?? ""}`, { unit: id ?? null });
    return u;
  };
  let next = Math.max(0, ...list.map((u) => num(u.id)));
  for (const c of changes) {
    if (c.op === "add-dep" || c.op === "remove-dep") {
      const u = get(c.unit);
      const d = get(c.dependsOn);
      if (u.kind === "contract" && d.kind !== "contract" && c.op === "add-dep") throw new ApiError(422, "contract_dependency", "계약 Unit 은 기능 Unit 에 의존하지 않습니다(08 §3.5)");
      list = list.map((x) => (x.id !== u.id ? x : { ...x, dependsOn: c.op === "add-dep" ? [...new Set([...x.dependsOn, d.id])] : x.dependsOn.filter((y) => y !== d.id) }));
    } else if (c.op === "merge") {
      const [a, b] = (c.units ?? []).map((id) => get(id));
      if (!a || !b || a.id === b.id) throw bad("merge 는 서로 다른 Unit 둘입니다");
      if (a.kind === "contract" || b.kind === "contract") throw new ApiError(422, "contract_merge", "계약 Unit 은 합치지 않습니다");
      list = list.map((x) => {
        if (x.id === a.id) return { ...x, stories: [...new Set([...x.stories, ...b.stories])], dependsOn: [...new Set([...x.dependsOn, ...b.dependsOn])].filter((y) => y !== a.id && y !== b.id) };
        if (x.id === b.id) return { ...x, planned: false };
        return { ...x, dependsOn: [...new Set(x.dependsOn.map((y) => (y === b.id ? a.id : y)))].filter((y) => y !== x.id) };
      });
    } else if (c.op === "split") {
      const u = get(c.unit);
      const titles = c.into ?? [];
      if (titles.length < 2) throw bad("split 의 into 는 제목 2개 이상입니다");
      const made = titles.map((t, i) => ({ ...u, id: `U-${++next}`, title: t, stories: i === 0 ? [...u.stories] : [], issue: null, planned: true }));
      const madeIds = made.map((m) => m.id);
      list = [...list.map((x) => (x.id === u.id ? { ...x, planned: false } : { ...x, dependsOn: x.dependsOn.flatMap((y) => (y === u.id ? madeIds : [y])) })), ...made];
    } else if (c.op === "order") {
      const ids = (c.units ?? []).map((id) => get(id).id);
      list = list.map((x) => (ids.includes(x.id) ? { ...x, order: ids.indexOf(x.id) + 1 } : x));
    }
  }
  const live = new Map(list.filter((u) => u.planned).map((u) => [u.id, u]));
  const state = new Map<string, number>();
  const cycle: string[] = [];
  const visit = (id: string, trail: string[]): boolean => {
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
    const ids = c.units ?? [];
    for (const id of ids) for (const d of live.get(id)?.dependsOn ?? []) if (ids.includes(d) && ids.indexOf(d) > ids.indexOf(id)) throw new ApiError(422, "cycle", `순서가 의존과 어긋납니다: ${d} 가 ${id} 보다 먼저입니다`, { cycle: [d, id] });
  }
  return list;
}

export function proposalBody(body: unknown): { intent: string; baseSha256: string; proposalSha256: string | null; changes: Change[] } {
  if (!isObj(body) || typeof body.intent !== "string" || typeof body.baseSha256 !== "string") throw bad("intent · baseSha256 · changes 가 필요합니다");
  return { intent: body.intent, baseSha256: body.baseSha256, proposalSha256: typeof body.proposalSha256 === "string" ? body.proposalSha256 : null, changes: validChanges(body.changes) };
}

/** units.json 에 제안을 옮긴 바이트(intent 승인 처리, DB-R29). 원래 들여쓰기(2칸)와 끝 줄바꿈을 따른다. */
export function appliedUnitsBytes(raw: Buffer, data: Record<string, unknown>, units: Unit[], changes: Change[]): Buffer {
  const applied = applyChanges(units, changes);
  const original = Array.isArray(data.units) ? (data.units as Record<string, unknown>[]) : [];
  const merged = applied.map((u) => {
    const before = original.find((o) => o.id === u.id);
    if (!before) return Object.fromEntries(Object.entries(u).filter(([, v]) => v !== null && v !== undefined));
    const out: Record<string, unknown> = { ...before, dependsOn: u.dependsOn };
    if (Object.hasOwn(before, "planned") || !u.planned) out.planned = u.planned;
    if (Object.hasOwn(before, "stories") || u.stories.length) out.stories = u.stories;
    if (Object.hasOwn(before, "order") || u.order !== null) out.order = u.order;
    return out;
  });
  const text = `${JSON.stringify({ ...data, units: merged }, null, 2)}${raw.toString("utf8").endsWith("\n") ? "\n" : ""}`;
  return Buffer.from(text, "utf8");
}

export const unitsSha = (raw: Buffer | null): string | null => (raw ? sha256(raw) : null);
export const proposalStamp = (abs: string): string => [fileStamp(path.join(abs, "units.json")), fileStamp(path.join(abs, "units.proposed.json"))].join("\n");
