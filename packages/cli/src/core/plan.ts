/** 작업 목록(HK-8 design §5.1). P17 은 op "copy" 만 만든다. */
import fs from "node:fs";
import path from "node:path";
import { CliError, EXIT } from "./errors";
import { isInside, lstatOrNull } from "./fsx";
import { sha256 } from "./hash";
import { isExecutable, type Layout } from "./layout";
import { readTemplate, resolveCandidates, type Overlap } from "./resolve";
import type { Finding } from "../adapters/types";
import { judgeInstall, type ProjectionPlan } from "../projection/engine";
import { prepare } from "../projection/flow";
import { loadSpecOrNull } from "../projection/spec";
import type { Selection } from "./selection";
import { substitute } from "./tokens";

export type Action = "create" | "replace" | "same" | "skip-user";

export interface PlannedOp {
  path: string;
  op: "copy";
  owner: "kit" | "user";
  layer: string;
  action: Action;
  reason?: string;
  src: string;
  content: Buffer;
  sha256: string;
  executable: boolean;
}

export interface GeneratedFile {
  path: string;
  action: Action;
  content: Buffer;
}

export interface Counts {
  create: number;
  replace: number;
  same: number;
  "skip-user": number;
  excludedByHarness: number;
  overlapped: number;
}

export interface Plan {
  target: string;
  ops: PlannedOp[];
  overlaps: Overlap[];
  excludedByHarness: number;
  generated: GeneratedFile[];
  counts: Counts;
  /** 하네스 배치(HK-13). 템플릿에 projection.json 이 없으면 null */
  projection: ProjectionPlan | null;
  projectionFindings: Finding[];
}

export interface PlanMode {
  force: boolean;
  adopt: boolean;
}

export const MANIFEST_PATH = ".agents/harness.json";

/** 리포 기준 상대 경로인가. 절대 경로 · '..' · '.git' 조각(대소문자 무시 — macOS 기본 파일 시스템) · 빈 조각은 아니다. */
export function isSafeRelPath(p: string): boolean {
  if (p === "" || p.startsWith("/") || p.includes("\\") || p.includes("\0")) return false;
  return !p.split("/").some((s) => s === "" || s === "." || s === ".." || s.toLowerCase() === ".git");
}

/** 안전하지 않은 설치 경로는 계획 단계에서 거부한다(exit 3). */
export function assertSafeRelPath(p: string): void {
  if (!isSafeRelPath(p)) throw new CliError(EXIT.STATE, `리포 밖이나 .git 으로 가는 설치 경로를 거부한다: ${p}`);
}

/** setup.sh harness_write_manifest 와 같은 바이트. 값은 JSON 으로 이스케이프한다(design §10 D14). */
export function manifestContent(sel: Pick<Selection, "stack" | "agents">, tokens: Record<string, string>): Buffer {
  const s = (v: string): string => JSON.stringify(v);
  const agents = sel.agents.map(s).join(", ");
  return Buffer.from(
    `{\n  "unit": ${s(tokens.PROJECT_SLUG || "project")},\n  "title": ${s(tokens.PROJECT_NAME || "Project")},\n  "stack": ${s(sel.stack)},\n  "agents": [${agents}],\n  "shared": []\n}\n`,
    "utf8",
  );
}

export type Existing = { kind: "none" } | { kind: "file"; bytes: Buffer; executable: boolean } | { kind: "other"; what: string };

/** 설치 경로의 지금 상태. 링크 · 폴더 · 특수 파일은 "other" 다(따라가지 않는다). */
export function existing(full: string): Existing {
  const st = lstatOrNull(full);
  if (!st) return { kind: "none" };
  if (st.isSymbolicLink()) return { kind: "other", what: "링크다" };
  if (st.isDirectory()) return { kind: "other", what: "같은 이름의 폴더가 있다" };
  if (!st.isFile()) return { kind: "other", what: "일반 파일이 아니다" };
  return { kind: "file", bytes: fs.readFileSync(full), executable: (st.mode & 0o100) !== 0 };
}

function decide(cur: Existing, content: Buffer, executable: boolean, mode: PlanMode): { action: Action; reason?: string } {
  if (cur.kind === "none") return { action: "create" };
  if (cur.kind === "other") return { action: "skip-user", reason: cur.what };
  const same = cur.bytes.equals(content);
  if (mode.adopt) return { action: "skip-user", reason: "--adopt" };
  if (mode.force) return same && cur.executable === executable ? { action: "same" } : { action: "replace" };
  return same ? { action: "same" } : { action: "skip-user", reason: "사람이 둔 파일이다" };
}

/**
 * 설치 경로의 상위 폴더를 위에서부터 본다(같은 폴더는 한 번만).
 * 링크가 끊어졌거나 리포 밖을 가리키면 exit 3. 폴더가 아닌 것이 있으면 "blocked"(그 아래는 쓰지 않는다).
 */
export class AncestorCheck {
  private readonly cache = new Map<string, "ok" | "missing" | "blocked">();

  constructor(
    private readonly target: string,
    private readonly targetReal: string,
  ) {}

  state(rel: string): "ok" | "blocked" {
    let cur = this.target;
    for (const part of rel.split("/").slice(0, -1)) {
      cur = path.join(cur, part);
      const known = this.cache.get(cur) ?? this.inspect(cur, rel);
      this.cache.set(cur, known);
      if (known === "missing") return "ok";
      if (known === "blocked") return "blocked";
    }
    return "ok";
  }

  private inspect(dir: string, rel: string): "ok" | "missing" | "blocked" {
    const st = lstatOrNull(dir);
    if (!st) return "missing";
    if (st.isDirectory()) return "ok";
    if (!st.isSymbolicLink()) return "blocked";
    let real: string;
    try {
      real = fs.realpathSync(dir);
    } catch {
      throw new CliError(EXIT.STATE, `설치 경로의 상위 폴더가 끊어진 링크다: ${rel}`, `${dir} 를 확인한다`);
    }
    if (!isInside(real, this.targetReal)) {
      throw new CliError(EXIT.STATE, `설치 경로가 링크를 따라 리포 밖으로 나간다: ${rel}`, `${dir} → ${real}`);
    }
    return fs.statSync(dir).isDirectory() ? "ok" : "blocked";
  }
}

export const BLOCKED = "상위 경로가 폴더가 아니다";

function manifestPlan(target: string, ancestors: AncestorCheck | null, content: Buffer, adopt: boolean): GeneratedFile {
  if (ancestors?.state(MANIFEST_PATH) === "blocked") return { path: MANIFEST_PATH, action: "skip-user", content };
  const cur = ancestors ? existing(path.join(target, ...MANIFEST_PATH.split("/"))) : ({ kind: "none" } as Existing);
  if (cur.kind === "none") return { path: MANIFEST_PATH, action: "create", content };
  if (adopt || cur.kind === "other") return { path: MANIFEST_PATH, action: "skip-user", content };
  return { path: MANIFEST_PATH, action: cur.bytes.equals(content) ? "same" : "replace", content };
}

export function buildPlan(args: {
  layout: Layout;
  templatesDir: string;
  target: string;
  selection: Selection;
  tokens: Record<string, string>;
  mode: PlanMode;
}): Plan {
  const { layout, templatesDir, target, selection, tokens, mode } = args;
  const res = resolveCandidates(layout, templatesDir, selection, tokens);
  const ancestors = fs.existsSync(target) ? new AncestorCheck(target, fs.realpathSync(target)) : null;

  const ops: PlannedOp[] = res.winners.map((c) => {
    assertSafeRelPath(c.dest);
    const content = substitute(readTemplate(templatesDir, c.src), tokens, layout.tokens);
    const executable = isExecutable(layout, c.dest);
    const blocked = ancestors?.state(c.dest) === "blocked";
    const cur: Existing = !ancestors || blocked ? { kind: "none" } : existing(path.join(target, ...c.dest.split("/")));
    const { action, reason } = blocked ? { action: "skip-user" as const, reason: BLOCKED } : decide(cur, content, executable, mode);
    const op: PlannedOp = {
      path: c.dest,
      op: "copy",
      owner: action === "skip-user" ? "user" : "kit",
      layer: c.layer,
      action,
      src: c.src,
      content,
      sha256: sha256(content),
      executable,
    };
    if (reason !== undefined) op.reason = reason;
    return op;
  });

  const generated = [manifestPlan(target, ancestors, manifestContent(selection, tokens), mode.adopt)];
  const counts: Counts = { create: 0, replace: 0, same: 0, "skip-user": 0, excludedByHarness: res.excludedByHarness, overlapped: res.overlaps.length };
  for (const o of ops) counts[o.action] += 1;
  const { projection, projectionFindings } = planProjection(args, ops);
  return { target, ops, overlaps: res.overlaps, excludedByHarness: res.excludedByHarness, generated, counts, projection, projectionFindings };
}

/** copy 를 적용한 뒤의 원본으로 배치 작업을 정한다(HK-13 design §6.1 · §6.2). */
function planProjection(args: { templatesDir: string; target: string; selection: Selection; tokens: Record<string, string>; mode: PlanMode }, ops: PlannedOp[]): { projection: ProjectionPlan | null; projectionFindings: Finding[] } {
  const spec = loadSpecOrNull(args.templatesDir);
  if (!spec) return { projection: null, projectionFindings: [] };
  const writes = new Map(ops.filter((o) => o.action === "create" || o.action === "replace").map((o) => [o.path, { content: o.content, executable: o.executable }]));
  const p = prepare({ target: args.target, spec, tokens: args.tokens, agents: args.selection.agents, writes, copyPaths: ops.map((o) => o.path) });
  const projection = judgeInstall({ target: args.target, spec, tokens: args.tokens, sources: p.sources, wants: p.wants, prev: [], force: args.mode.force });
  return { projection, projectionFindings: p.findings };
}
