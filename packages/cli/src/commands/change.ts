/**
 * add · remove 가 같이 쓰는 흐름(HK-12 design §3.3 · §4): 설치 상태 읽기, 매니페스트, 적용 순서, 메타 · lock, 출력.
 * 적용 순서: 파일 → .new → 지우기 · 빈 폴더 → 매니페스트 → 기능 문서 → v1 백업 → lock → 메타(마지막 — "설치됨" 표시).
 */
import fs from "node:fs";
import path from "node:path";
import { bool, str } from "../cli/args";
import { targetOf, today, type Ctx } from "../cli/context";
import { buildFeatureDocs, FEATURE_DOCS, type FeatureDocsResult } from "../core/apply";
import { CliError, EXIT, fsError } from "../core/errors";
import { writeFileAtomic } from "../core/fsx";
import { sha256 } from "../core/hash";
import { loadInstalled, ownerKind, selectionFromMeta, tokensFromMeta, type Installed } from "../core/installed";
import { loadLayout, type Layout } from "../core/layout";
import { LOCK_REL, serializeLock, type LockEntry } from "../core/lock";
import { mergeMetaForUpdate, META_REL, serializeMeta } from "../core/meta";
import { AncestorCheck, BLOCKED, existing, MANIFEST_PATH, manifestContent } from "../core/plan";
import { removeEmptyDirs, removeFile } from "../core/remove";
import type { Selection } from "../core/selection";
import { locateTemplates, type TemplatesLocation } from "../core/templates";
import { compareSemver, VERSION } from "../core/version";
import { shellQuote, V1_LOCK_BACKUP } from "./update";

export const CHANGE_ACTIONS = [
  "create", "restore", "same", "keep", "relayer", "update", "conflict",
  "delete", "absent", "keep-modified", "skip-user", "skip-external", "skip-pack", "keep-user",
] as const;
export type ChangeAction = (typeof CHANGE_ACTIONS)[number];

export interface ChangeOp {
  path: string;
  owner: string;
  layer: string | null;
  action: ChangeAction;
  reason?: string;
  executable?: boolean;
  /** create · restore · update · conflict 의 D */
  content?: Buffer;
  /** conflict: D 를 둘 자리 */
  newFile?: string;
  /** delete: 같이 지울 <경로>.new */
  alsoNew?: string;
}

/** 목록에 내지 않고 개수로만 세는 판정 */
const QUIET = new Set<ChangeAction>(["keep", "same", "absent", "keep-user"]);

export interface Loaded {
  target: string;
  inst: Installed;
  layout: Layout;
  loc: TemplatesLocation;
  before: Selection;
  tokens: Record<string, string>;
  droppedModules: string[];
}

/** 템플릿 자리와 layout. 이름 검사(exit 2)를 설치 상태 검사(exit 3)보다 먼저 하려고 따로 둔다. */
export function kitOf(ctx: Ctx): { loc: TemplatesLocation; layout: Layout } {
  const { io } = ctx;
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io.env, cliFile: io.cliFile, cwd: io.cwd, version: VERSION });
  return { loc, layout: loadLayout(loc.dir) };
}

export function loadForChange(ctx: Ctx, command: string, kit: { loc: TemplatesLocation; layout: Layout }): Loaded {
  const { io } = ctx;
  const target = targetOf(ctx);
  const inst = loadInstalled(target, command);
  const cmp = compareSemver(inst.meta.kit.version, VERSION);
  if (cmp !== null && cmp > 0) {
    throw new CliError(EXIT.STATE, `설치된 킷(${inst.meta.kit.version})이 이 CLI(${VERSION})보다 새것이다`, "새 CLI 로 다시 실행한다");
  }
  const { loc, layout } = kit;
  const { selection, droppedModules } = selectionFromMeta(layout, loc.dir, inst.meta);
  return { target, inst, layout, loc, before: selection, tokens: tokensFromMeta(layout, selection, inst.meta, io.env, target), droppedModules };
}

export type Cur = { kind: "none" } | { kind: "file"; sha: string } | { kind: "other"; what: string };

export function currentOf(target: string, ancestors: AncestorCheck, rel: string): Cur {
  if (ancestors.state(rel) === "blocked") return { kind: "other", what: BLOCKED };
  const cur = existing(path.join(target, ...rel.split("/")));
  return cur.kind === "file" ? { kind: "file", sha: sha256(cur.bytes) } : cur;
}

export function ancestorsOf(target: string): AncestorCheck {
  return new AncestorCheck(target, fs.realpathSync(target));
}

export const isKitCopy = (e: LockEntry): boolean => ownerKind(e.owner) === "kit" && e.op === "copy";

export interface ManifestChange {
  action: "create" | "replace" | "same" | "conflict";
  content: Buffer;
  newFile?: string;
}

/** 하네스 목록이 바뀌면 매니페스트를 다시 쓴다. 사람이 고쳤으면 .new(design §3.3). */
export function manifestChange(l: Loaded, ancestors: AncestorCheck, after: Selection): ManifestChange | null {
  if (l.before.agents.join(",") === after.agents.join(",")) return null;
  const want = manifestContent(after, l.tokens);
  if (ancestors.state(MANIFEST_PATH) === "blocked") return { action: "conflict", content: want };
  const cur = existing(path.join(l.target, ...MANIFEST_PATH.split("/")));
  if (cur.kind === "none") return { action: "create", content: want };
  if (cur.kind === "file" && cur.bytes.equals(want)) return { action: "same", content: want };
  if (cur.kind === "file" && cur.bytes.equals(manifestContent(l.before, l.tokens))) return { action: "replace", content: want };
  const neu = `${MANIFEST_PATH}.new`;
  return existing(path.join(l.target, ...neu.split("/"))).kind === "other" ? { action: "conflict", content: want } : { action: "conflict", content: want, newFile: neu };
}

/** tools/docs/ 의 lock 항목이 모두 킷 판 그대로일 때만 기능 문서를 만든다(HK-8 D17과 같은 이유). */
function featureDocsAllowed(target: string, entries: LockEntry[]): boolean {
  const docs = entries.filter((e) => e.path.startsWith(`${path.posix.dirname(FEATURE_DOCS)}/`));
  if (!docs.some((e) => e.path === FEATURE_DOCS)) return false;
  return docs.every((e) => {
    if (!isKitCopy(e) || !e.sha256) return false;
    const cur = existing(path.join(target, ...e.path.split("/")));
    return cur.kind === "file" && sha256(cur.bytes) === e.sha256;
  });
}

export interface ChangeResult {
  ops: ChangeOp[];
  entries: LockEntry[];
  manifest: ManifestChange | null;
}

/** 쓰기. 기능 문서 결과를 준다. */
export function applyChange(ctx: Ctx, l: Loaded, after: Selection, r: ChangeResult): FeatureDocsResult {
  const { target, inst } = l;
  const full = (rel: string): string => path.join(target, ...rel.split("/"));
  let current = "";
  try {
    const deleted: string[] = [];
    for (const o of r.ops) {
      current = o.path;
      if ((o.action === "create" || o.action === "restore" || o.action === "update") && o.content) writeFileAtomic(full(o.path), o.content, o.executable === true);
      else if (o.action === "conflict" && o.newFile && o.content) writeFileAtomic(full(o.newFile), o.content, false);
      else if (o.action === "delete") {
        removeFile(target, o.path);
        deleted.push(o.path);
        if (o.alsoNew) removeFile(target, o.alsoNew);
      }
    }
    removeEmptyDirs(target, deleted);
    const m = r.manifest;
    current = MANIFEST_PATH;
    if (m && (m.action === "create" || m.action === "replace")) writeFileAtomic(full(MANIFEST_PATH), m.content, false);
    if (m?.action === "conflict" && m.newFile) writeFileAtomic(full(m.newFile), m.content, false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current}`);
  }
  const docs: FeatureDocsResult = featureDocsAllowed(target, r.entries)
    ? buildFeatureDocs(target, ctx.io.env)
    : { status: "skipped", reason: "tools/docs/ 에 킷 판이 아닌 파일이 있다" };
  const lockText = serializeLock({ schema: "harness-kit.lock/v2", kit: { version: inst.lock.kit.version ?? inst.meta.kit.version, source: inst.lock.kit.source }, packs: inst.lock.packs, entries: r.entries });
  const meta = mergeMetaForUpdate(inst.meta, { version: inst.meta.kit.version, selection: after, tokens: l.tokens, today: today(ctx.io) });
  const state: [string, Buffer][] = [
    ...(inst.lockFormat === "v1" ? ([[V1_LOCK_BACKUP, fs.readFileSync(full(LOCK_REL))]] as [string, Buffer][]) : []),
    [LOCK_REL, Buffer.from(lockText, "utf8")],
    [META_REL, Buffer.from(serializeMeta(meta), "utf8")],
  ];
  try {
    for (const [rel, data] of state) {
      current = rel;
      writeFileAtomic(full(rel), data, false);
    }
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current}`);
  }
  return docs;
}

export function conflictsOf(r: ChangeResult): Record<string, unknown>[] {
  const out = r.ops.filter((o) => o.action === "conflict").map((o) => ({ path: o.path, new: o.newFile ?? null, diff: o.newFile ? `diff -u ${shellQuote(o.path)} ${shellQuote(o.newFile)}` : null }));
  if (r.manifest?.action === "conflict") {
    const n = r.manifest.newFile;
    out.push({ path: MANIFEST_PATH, new: n ?? null, diff: n ? `diff -u ${shellQuote(MANIFEST_PATH)} ${shellQuote(n)}` : null });
  }
  return out;
}

export function countsOf(ops: ChangeOp[]): Record<ChangeAction, number> {
  const c = Object.fromEntries(CHANGE_ACTIONS.map((a) => [a, 0])) as Record<ChangeAction, number>;
  for (const o of ops) c[o.action] += 1;
  return c;
}

function opJson(o: ChangeOp): Record<string, unknown> {
  const j: Record<string, unknown> = { path: o.path, owner: o.owner, layer: o.layer, action: o.action };
  if (o.executable !== undefined && o.content) j.executable = o.executable;
  if (o.reason !== undefined) j.reason = o.reason;
  if (o.newFile !== undefined) j.new = o.newFile;
  return j;
}

const opLine = (o: ChangeOp): string => `  ${o.action.padEnd(13)} ${o.path}${o.newFile ? `  → ${o.newFile}` : ""}${o.reason ? `  ${o.reason}` : ""}`;

const selJson = (s: Selection): Record<string, unknown> => ({ stack: s.stack, arch: s.arch, domain: s.domain, agents: s.agents, modules: s.modules });

export interface Report {
  command: string;
  names: Record<string, unknown>;
  after: Selection;
  result: ChangeResult;
  dryRun: boolean;
  featureDocs: FeatureDocsResult | null;
  /** 사람용 머리 뒤에 붙일 줄(이미 켬 · 켜지 않음 경고 등) */
  notes: string[];
  extra?: Record<string, unknown>;
}

/** --json · 사람용 출력. 목록은 개수로 세는 판정(keep · same · absent)을 뺀다. */
export function report(ctx: Ctx, l: Loaded, rep: Report): { data: Record<string, unknown>; lines: string[] } {
  const shown = rep.result.ops.filter((o) => !QUIET.has(o.action) && (!ctx.quiet || o.action === "conflict" || o.action === "keep-modified"));
  const conflicts = conflictsOf(rep.result);
  const m = rep.result.manifest;
  const data: Record<string, unknown> = {
    command: rep.command,
    target: l.target,
    templates: l.loc.dir,
    dryRun: rep.dryRun,
    names: rep.names,
    selection: { before: selJson(l.before), after: selJson(rep.after) },
    droppedModules: l.droppedModules,
    formats: { meta: l.inst.metaFormat, lock: l.inst.lockFormat },
    counts: countsOf(rep.result.ops),
    ops: shown.map(opJson),
    conflicts,
    ...(rep.extra ?? {}),
    generated: m && m.action !== "same" ? [{ path: MANIFEST_PATH, action: m.action, ...(m.newFile ? { new: m.newFile } : {}) }] : [],
    featureDocs: rep.featureDocs,
    state: [META_REL, LOCK_REL, ...(l.inst.lockFormat === "v1" ? [V1_LOCK_BACKUP] : [])],
  };
  const counts = Object.entries(countsOf(rep.result.ops)).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(" · ");
  const lines = [
    `harness-kit ${rep.command} — ${l.target}`,
    `  하네스 ${l.before.agents.join(",")} → ${rep.after.agents.join(",")} · 모듈 ${l.before.modules.join(",") || "none"} → ${rep.after.modules.join(",") || "none"}`,
    ...rep.notes,
    ...(l.droppedModules.length ? [`  ⚠ 킷에 없는 모듈을 메타에서 뺀다: ${l.droppedModules.join(", ")}`] : []),
    ...shown.map(opLine),
    `  파일: ${counts || "바꿀 것 없음"}`,
  ];
  if (m && m.action !== "same") lines.push(`  매니페스트 ${MANIFEST_PATH}: ${m.action}${m.newFile ? ` → ${m.newFile}` : ""}`);
  if (conflicts.length) {
    lines.push("  충돌 — 고친 파일이라 덮지 않았다. 새 판은 .new 에 있다(리포 폴더에서):");
    for (const c of conflicts) if (c.diff) lines.push(`    ${String(c.diff)}`);
  }
  lines.push(rep.dryRun ? "  (dry-run — 쓰지 않았다)" : "  다음: harness-kit doctor");
  return { data, lines };
}

export const dryRunOf = (ctx: Ctx): boolean => bool(ctx.values, "dry-run");
