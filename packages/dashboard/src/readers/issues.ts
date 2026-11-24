/**
 * 이슈 읽기(설계 06 §3.2 · §3.3). 출처 셋의 합집합이고 같은 키는 앞이 이긴다:
 * 1. 이슈 브랜치가 체크아웃된 폴더(worktree) 2. 체크아웃 안 된 로컬 이슈 브랜치의 git 객체(branch) 3. 메인 폴더 base(base).
 * 보드 상태 · 게이트 · 리뷰 판정은 체크아웃마다 dashboard_snapshot.py 한 번(Python 판정 원본)에서 온다.
 */
import fs from "node:fs";
import path from "node:path";
import { boardStatusOf, type BoardStatus } from "../board-status";
import { approvalSha, approvalState, needOf, parse as parseApprovals, type ApprovalState, type Entry } from "../approvals";
import { fileStamp, treeStamp } from "../cache";
import { parseLoose } from "../frontmatter";
import { ISSUE_GATES, type Project } from "../project";
import { branches, type Checkout, checkouts, FOLDER, gitStamp, ISSUE_BRANCH } from "../repo";
import { git, gitOut, isObj, python, readJson, rel, sha256 } from "../util";

export interface GateResult {
  gate: string;
  passed: boolean;
  reasons: string[];
  preconditions: string[];
  approval: string;
}

export interface BoardItem {
  key: string;
  name: string;
  folder: string;
  area: string;
  type: string | null;
  requirements: string | null;
  design: string | null;
  tasks: string | null;
  state: string;
  legacy: boolean;
}

export interface ReviewState {
  key: string;
  report: string | null;
  head: string | null;
  stale: boolean;
  open: Record<string, number>;
  findings: { id: string; severity: string; fp: string; state: string }[];
}

export interface Snapshot {
  board: { issues: BoardItem[] };
  gates: { key: string; folder: string; gates: GateResult[]; error?: string }[];
  reviews: ReviewState[];
  errors: { part: string; message: string }[];
}

export interface DocInfo {
  status: string | null;
  state?: string | null;
  sha256: string;
  approvalSha256: string;
  clarify: number;
  approval: ApprovalState;
  mtimeMs?: number;
  bolts?: { total: number; done: number };
}

export interface IssueModel {
  key: string;
  name: string;
  dir: string;
  area: string | null;
  type: string | null;
  title: string | null;
  intent: string | null;
  unit: string | null;
  branch: string | null;
  checkout: { kind: "main" | "worktree"; path: string; dirty: boolean } | null;
  source: "worktree" | "branch" | "base";
  legacy: boolean;
  boardState: string | null;
  docs: { requirements: DocInfo | null; design: DocInfo | null; tasks: DocInfo | null };
  stage: string;
  /** 보드 여덟 상태(설계 10 §3.4, MD-R15). 킷 단계에서 계산하므로 Jira 가 없어도 같다 */
  boardStatus: BoardStatus;
  gates: GateResult[];
  waitingOn: { gate: string; approvers: string[]; mine: boolean } | null;
  review: { open: Record<string, number>; report: string | null; stale: boolean } | null;
  verify: VerifySummary | null;
  roles: Record<string, string>;
  sessions: string[];
  /** 내부: 읽은 체크아웃(내보내기 · 쓰기 위치) */
  root: string | null;
}

export interface VerifySummary {
  level: string | null;
  status: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  slowestStep: string | null;
}

const CLARIFY = "[NEEDS CLARIFICATION";

export function clarifyCount(text: string): number {
  return text.split(CLARIFY).length - 1;
}

/** tasks.md 의 Bolt(= Phase 제목) 수와 모든 작업이 체크된 Phase 수. */
export function bolts(text: string): { total: number; done: number } {
  const lines = text.split(/\r?\n/);
  let total = 0;
  let done = 0;
  let open = 0;
  let tasks = 0;
  const close = (): void => {
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

export function docInfo(bytes: Buffer, gate: string, entries: Entry[], p: Project, mtimeMs?: number, need = 1): DocInfo {
  const text = bytes.toString("utf8");
  const fm = parseLoose(text) ?? {};
  const aSha = approvalSha(bytes);
  const info: DocInfo = {
    status: fm.status ?? null,
    sha256: sha256(bytes),
    approvalSha256: aSha,
    clarify: clarifyCount(text),
    approval: approvalState(entries, gate, gate === "tasks" ? null : aSha, p.policy(), need),
  };
  if (mtimeMs !== undefined) info.mtimeMs = mtimeMs;
  if (gate === "tasks") {
    info.state = fm.state ?? null;
    info.bolts = bolts(text);
  }
  return info;
}

function snapStamp(p: Project, co: Checkout): string {
  const r = co.root;
  const docs = path.join(r, ".agents/docs");
  let specs: string[] = [];
  try {
    specs = fs.readdirSync(docs).filter((n) => n.endsWith("-specs"));
  } catch {
    specs = [];
  }
  return [
    treeStamp(path.join(docs, "issues"), 2),
    ...specs.map((s) => treeStamp(path.join(docs, s), 4)),
    fileStamp(path.join(r, ".agents/knots-sync.json")),
    fileStamp(path.join(r, ".agents/state/verify-last.json")),
    fileStamp(path.join(r, ".agents/reports/quality-gate-last.json")),
    treeStamp(path.join(r, ".agents/reports/review"), 0),
    treeStamp(path.join(p.root, ".agents/reports/review"), 0),
    gitStamp(p.loc.common),
    treeStamp(path.join(p.loc.common, "refs/remotes"), 4),
  ].join("\n");
}

const EMPTY: Snapshot = { board: { issues: [] }, gates: [], reviews: [], errors: [] };

export async function snapshot(p: Project, co: Checkout): Promise<Snapshot> {
  return p.cache.get(`snap:${co.root}`, snapStamp(p, co), async () => {
    const own = path.join(co.root, "scripts/harness/dashboard_snapshot.py");
    const script = fs.existsSync(own) ? own : path.join(p.root, "scripts/harness/dashboard_snapshot.py");
    if (!fs.existsSync(script)) return { ...EMPTY, errors: [{ part: "snapshot", message: "scripts/harness/dashboard_snapshot.py 없음" }] };
    const r = await python(co.root, p.env, [script, "--root", co.root], 120_000);
    if (r.code !== 0) return { ...EMPTY, errors: [{ part: "snapshot", message: (r.stderr.trim().split("\n").pop() ?? "").slice(0, 300) }] };
    try {
      return JSON.parse(r.stdout) as Snapshot;
    } catch {
      return { ...EMPTY, errors: [{ part: "snapshot", message: "JSON 아님" }] };
    }
  });
}

function readEntries(file: string): Entry[] {
  try {
    return parseApprovals(fs.readFileSync(file)).entries;
  } catch {
    return [];
  }
}

export function verifyOf(root: string): VerifySummary | null {
  const v = readJson(path.join(root, ".agents/state/verify-last.json"));
  if (!v) return null;
  const steps = Array.isArray(v.steps) ? (v.steps as Record<string, unknown>[]) : [];
  let slow: Record<string, unknown> | null = null;
  for (const s of steps) if (typeof s.durationMs === "number" && (!slow || (s.durationMs as number) > (slow.durationMs as number))) slow = s;
  const label = slow ? String(slow.label ?? slow.command ?? slow.id ?? "") : "";
  return {
    level: typeof v.level === "string" ? v.level : null,
    status: typeof v.status === "string" ? v.status : null,
    finishedAt: typeof v.finishedAt === "string" ? v.finishedAt : null,
    durationMs: typeof v.durationMs === "number" ? v.durationMs : null,
    slowestStep: slow ? `${label} ${Math.round((slow.durationMs as number) / 1000)}s`.trim() : null,
  };
}

/** 문서 게이트만 Node 로 판정한다(git 객체로 읽는 이슈, v2 배치). */
function nodeGates(docs: IssueModel["docs"], legacyFlags: Record<string, boolean>): GateResult[] {
  const out: GateResult[] = [];
  let ok = true;
  for (const gate of ISSUE_GATES) {
    const d = (docs as Record<string, DocInfo | null>)[gate];
    let passed = false;
    const reasons: string[] = [];
    if (gate === "mr" || gate === "done") reasons.push("git 객체로 읽은 이슈는 이 게이트를 판정하지 않습니다(체크아웃 필요)");
    else if (!d) reasons.push(`${gate}.md 가 없습니다`);
    else {
      if (d.clarify) reasons.push(`${gate}.md 에 [NEEDS CLARIFICATION 가 남았습니다`);
      if (gate !== "tasks" && d.status !== "approved") reasons.push(`${gate}.md 머리 status 가 approved 가 아닙니다`);
      const valid = d.approval === "valid" || (gate === "tasks" && d.approval === "stale") || legacyFlags[gate] === true;
      if (!valid) reasons.push(`${gate} 승인 기록이 ${d.approval}`);
      passed = reasons.length === 0 && ok;
    }
    const pre = ok ? [] : ["앞 게이트를 통과하지 않았습니다"];
    out.push({ gate, passed: passed && ok, reasons: [...pre, ...reasons], preconditions: pre, approval: d?.approval ?? "none" });
    ok = ok && passed;
  }
  return out;
}

const LEGACY_STAGE: Record<string, string> = { requirements: "requirements", design: "design", active: "mr", check: "mr", completed: "completed", superseded: "superseded" };

export function stageOf(p: Project, gates: GateResult[]): string {
  for (const g of p.gates()) {
    if (!ISSUE_GATES.includes(g)) continue;
    const r = gates.find((x) => x.gate === g);
    if (r && !r.passed) return g;
  }
  return "completed";
}

function waitingOf(p: Project, stage: string, gates: GateResult[], docs: IssueModel["docs"], email: string | null): IssueModel["waitingOn"] {
  const r = gates.find((g) => g.gate === stage);
  if (!r || r.passed || r.preconditions.length) return null;
  const d = (docs as Record<string, DocInfo | null>)[stage];
  if (stage === "requirements" || stage === "design") {
    if (!d || d.status !== "in-review") return null;
  } else if (stage === "tasks" && !d) return null;
  const policy = p.policy();
  const approvers = (policy.approvers ?? {})[stage] ?? [];
  const groups = policy.groups ?? {};
  const mine = approvers.length === 0 || approvers.some((a) => (a.includes("@") ? a.toLowerCase() === (email ?? "").toLowerCase() : (groups[a] ?? []).some((m) => m.toLowerCase() === (email ?? "").toLowerCase())));
  return { gate: stage, approvers, mine };
}

function rolesOf(p: Project): Record<string, string> {
  const roles = p.meta().roles;
  const out: Record<string, string> = {};
  if (isObj(roles)) for (const [k, v] of Object.entries(roles)) if (isObj(v) && typeof v.harness === "string") out[k] = v.harness;
  return out;
}

interface FolderDocs {
  folder: string;
  name: string;
  files: Record<string, Buffer | null>;
  mtimes: Record<string, number>;
  entries: Entry[];
}

function readFolder(root: string, folderRel: string, name: string): FolderDocs {
  const files: Record<string, Buffer | null> = {};
  const mtimes: Record<string, number> = {};
  for (const d of ["requirements", "design", "tasks"]) {
    const f = path.join(root, folderRel, `${d}.md`);
    try {
      const st = fs.lstatSync(f);
      files[d] = st.isFile() ? fs.readFileSync(f) : null;
      mtimes[d] = st.mtimeMs;
    } catch {
      files[d] = null;
    }
  }
  return { folder: folderRel, name, files, mtimes, entries: readEntries(path.join(root, folderRel, "approvals.md")) };
}

/** 문서 머리 risk 중 가장 높은 값(이슈는 올릴 수만 있다, 08 §3.15). */
export function riskOf(files: Record<string, Buffer | null>): string {
  const values = Object.values(files).map((b) => (b ? (parseLoose(b.toString("utf8")) ?? {}).risk : undefined));
  return values.includes("high") ? "high" : values.includes("medium") ? "medium" : "low";
}

function docsOf(p: Project, f: FolderDocs): IssueModel["docs"] {
  const risk = riskOf(f.files);
  const info = (gate: string): DocInfo | null => {
    const b = f.files[gate];
    return b ? docInfo(b, gate, f.entries, p, f.mtimes[gate], needOf(p.meta(), risk, gate)) : null;
  };
  return { requirements: info("requirements"), design: info("design"), tasks: info("tasks") };
}

function headFields(f: FolderDocs): Record<string, string> {
  for (const d of ["requirements", "design", "tasks"]) {
    const b = f.files[d];
    if (b) return parseLoose(b.toString("utf8")) ?? {};
  }
  return {};
}

interface Context {
  p: Project;
  email: string | null;
  sessions: { id: string; issue: string | null; state: string }[];
}

function build(ctx: Context, key: string, f: FolderDocs, extra: Partial<IssueModel> & Pick<IssueModel, "source" | "checkout" | "branch">, snap: Snapshot | null, verify: VerifySummary | null, root: string | null): IssueModel {
  const { p } = ctx;
  const docs = docsOf(p, f);
  const head = headFields(f);
  const board = snap?.board.issues.find((i) => i.key === key && !i.legacy) ?? null;
  const pyGates = snap?.gates.find((g) => g.key === key)?.gates;
  const legacyFlags: Record<string, boolean> = {};
  const gates = pyGates && pyGates.length ? pyGates : nodeGates(docs, legacyFlags);
  if (docs.tasks && pyGates) {
    const t = pyGates.find((g) => g.gate === "tasks");
    if (t) docs.tasks.approval = t.approval as ApprovalState;
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
    boardStatus: boardStatusOf(docs),
    gates,
    waitingOn: waitingOf(p, stage, gates, docs, ctx.email),
    review: review ? { open: review.open, report: review.report ? rel(p.root, path.resolve(root ?? p.root, review.report)) : null, stale: review.stale } : null,
    verify,
    roles: rolesOf(p),
    sessions: ctx.sessions.filter((s) => s.issue === key && s.state !== "gone").map((s) => s.id),
    root,
    ...extra,
  };
}

async function fromGitObjects(p: Project, ref: string): Promise<{ key: string; f: FolderDocs }[]> {
  const prefix = p.loc.prefix ? `${p.loc.prefix}/` : "";
  const ls = await gitOut(p.loc.top, p.env, "ls-tree", "-r", "--name-only", ref, "--", `${prefix}.agents/docs/issues/`);
  const byFolder = new Map<string, string[]>();
  for (const line of (ls ?? "").split("\n").filter(Boolean)) {
    const relPath = line.slice(prefix.length);
    const m = /^\.agents\/docs\/issues\/([^/]+)\/([^/]+)$/.exec(relPath);
    if (!m) continue;
    byFolder.set(m[1] as string, [...(byFolder.get(m[1] as string) ?? []), m[2] as string]);
  }
  const out: { key: string; f: FolderDocs }[] = [];
  for (const [folder, names] of [...byFolder.entries()].sort()) {
    const fm = FOLDER.exec(folder);
    if (!fm) continue;
    const files: Record<string, Buffer | null> = {};
    for (const d of ["requirements", "design", "tasks"]) {
      if (!names.includes(`${d}.md`)) {
        files[d] = null;
        continue;
      }
      const shown = await git(p.loc.top, p.env, "show", `${ref}:${prefix}.agents/docs/issues/${folder}/${d}.md`);
      files[d] = shown.code === 0 ? Buffer.from(shown.stdout, "utf8") : null;
    }
    const ap = names.includes("approvals.md") ? await gitOut(p.loc.top, p.env, "show", `${ref}:${prefix}.agents/docs/issues/${folder}/approvals.md`) : null;
    out.push({ key: fm[1] as string, f: { folder: `.agents/docs/issues/${folder}`, name: fm[2] as string, files, mtimes: {}, entries: ap ? parseApprovals(ap).entries : [] } });
  }
  return out;
}

async function branchIssues(p: Project, ref: string): Promise<{ key: string; f: FolderDocs }[]> {
  const sha = await gitOut(p.loc.top, p.env, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  if (!sha) return [];
  return p.cache.get(`objects:${ref}`, sha, () => fromGitObjects(p, ref));
}

function issueFolders(root: string): { key: string; folder: string; name: string }[] {
  const dir = path.join(root, ".agents/docs/issues");
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  const out: { key: string; folder: string; name: string }[] = [];
  for (const n of names) {
    if (n.startsWith("_") || n.startsWith(".")) continue;
    const m = FOLDER.exec(n);
    if (!m) continue;
    try {
      if (!fs.lstatSync(path.join(dir, n)).isDirectory()) continue;
    } catch {
      continue;
    }
    out.push({ key: m[1] as string, folder: `.agents/docs/issues/${n}`, name: m[2] as string });
  }
  return out;
}

export interface IssueSet {
  issues: IssueModel[];
  errors: string[];
}

export async function readIssues(p: Project, sessions: Context["sessions"], dirty: Map<string, boolean>): Promise<IssueSet> {
  const cos = await checkouts(p);
  const main = cos[0] as Checkout;
  const email = (await p.user()).email;
  const ctx: Context = { p, email, sessions };
  const seen = new Map<string, IssueModel>();
  const errors: string[] = [];
  const coView = (co: Checkout): IssueModel["checkout"] => ({ kind: co.main ? "main" : "worktree", path: rel(p.loc.top, co.path), dirty: dirty.get(co.path) ?? false });
  const snaps = new Map<string, Snapshot>();
  const snapOf = async (co: Checkout): Promise<Snapshot> => {
    if (!snaps.has(co.root)) {
      const s = await snapshot(p, co);
      for (const e of s.errors) errors.push(`${rel(p.loc.top, co.path)}: ${e.part}: ${e.message}`);
      snaps.set(co.root, s);
    }
    return snaps.get(co.root) as Snapshot;
  };
  // 1. 이슈 브랜치 체크아웃
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
  // 2. 체크아웃 안 된 이슈 브랜치
  const checkedOut = new Set(cos.map((c) => c.branch).filter(Boolean));
  for (const b of await branches(p)) {
    const m = ISSUE_BRANCH.exec(b);
    if (!m || checkedOut.has(b) || seen.has(m[2] as string)) continue;
    for (const { key, f } of await branchIssues(p, b)) {
      if (key !== m[2] || seen.has(key)) continue;
      seen.set(key, build(ctx, key, f, { source: "branch", checkout: null, branch: b }, null, null, null));
    }
  }
  // 3. base
  const base = p.base();
  if (main.branch === base) {
    const snap = await snapOf(main);
    const verify = verifyOf(main.root);
    for (const item of issueFolders(main.root)) {
      if (seen.has(item.key)) continue;
      const f = readFolder(main.root, item.folder, item.name);
      seen.set(item.key, build(ctx, item.key, f, { source: "base", checkout: coView(main), branch: base }, snap, verify, main.root));
    }
    for (const legacy of snap.board.issues.filter((i) => i.legacy)) {
      if (seen.has(legacy.key)) continue;
      seen.set(legacy.key, legacyModel(ctx, legacy, coView(main), base, main.root));
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

function legacyModel(ctx: Context, b: BoardItem, checkout: IssueModel["checkout"], base: string, root: string): IssueModel {
  const stage = LEGACY_STAGE[b.state] ?? "requirements";
  const d = (s: string | null): DocInfo | null => (s ? { status: s, sha256: "", approvalSha256: "", clarify: 0, approval: "none" } : null);
  return {
    key: b.key, name: b.name, dir: b.folder, area: b.area, type: b.type, title: null, intent: null, unit: null, branch: base, checkout,
    source: "base", legacy: true, boardState: b.state,
    docs: { requirements: d(b.requirements), design: d(b.design), tasks: b.tasks ? { status: null, state: b.tasks, sha256: "", approvalSha256: "", clarify: 0, approval: "none", bolts: { total: 0, done: 0 } } : null },
    stage, boardStatus: boardStatusOf({ requirements: d(b.requirements), design: d(b.design), tasks: b.tasks ? { status: null, state: b.tasks } : null }), gates: [], waitingOn: null, review: null, verify: null, roles: rolesOf(ctx.p), sessions: [], root,
  };
}

export function byKey(a: { key: string }, b: { key: string }): number {
  const pa = /^(.*)-(\d+)$/.exec(a.key);
  const pb = /^(.*)-(\d+)$/.exec(b.key);
  if (pa && pb && pa[1] === pb[1]) return Number(pa[2]) - Number(pb[2]);
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** 응답용: 내부 칸(root · mtimeMs)을 뺀 사본. */
export function publicIssue(i: IssueModel): Omit<IssueModel, "root"> {
  const { root: _root, ...rest } = i;
  const strip = (d: DocInfo | null): DocInfo | null => {
    if (!d) return null;
    const { mtimeMs: _m, ...x } = d;
    return x;
  };
  return { ...rest, docs: { requirements: strip(i.docs.requirements), design: strip(i.docs.design), tasks: strip(i.docs.tasks) } };
}
