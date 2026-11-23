/** update — 3방향 비교로 킷을 새 판으로 올린다(HK-11 design §3, 설계 02 §3.10). */
import fs from "node:fs";
import path from "node:path";
import { bool, list, str } from "../cli/args";
import { targetOf, today, type CommandResult, type Ctx } from "../cli/context";
import { boardLine, isBoardCode, refreshBoard, type BoardResult } from "../core/board";
import { CliError, EXIT, fsError, usageError } from "../core/errors";
import { byteCompare, lstatOrNull, writeFileAtomic } from "../core/fsx";
import { loadInstalled, selectionFromMeta, tokensFromMeta, type Installed } from "../core/installed";
import { loadLayout } from "../core/layout";
import { AMBIGUOUS_REASON, resolvedLock } from "../core/legacy-lock";
import { LOCK_REL, serializeLock } from "../core/lock";
import { mergeMetaForUpdate, META_REL, serializeMeta } from "../core/meta";
import { MANIFEST_PATH, manifestContent } from "../core/plan";
import { removeEmptyDirs, removeFile } from "../core/remove";
import { retiredNote, type Selection } from "../core/selection";
import { locateTemplates } from "../core/templates";
import { buildUpdatePlan, wanted, type UpdateAction, type UpdateOp, type UpdatePlan } from "../core/update-plan";
import { compareSemver, VERSION } from "../core/version";
import { applyV1Merge, claudeBackup, type BackupWrite, type MergedFile } from "../core/v1-first-update";
import { backupStamp, MERGE_BACKUP_DIR } from "../core/v1-merge";
import type { Finding } from "../adapters/types";
import type { LockEntry } from "../core/lock";
import { shellQuote } from "../core/shell";
import { applyProjection, judgeUpdate, PROJECTION_OPS, type ProjectionPlan } from "../projection/engine";
import { mergeEntries, needsHuman, prepare, projectionConflicts, projectionData, projectionLines } from "../projection/flow";
import { loadSpecOrNull } from "../projection/spec";
import type { OverlayWrite } from "../projection/view";

export const V1_LOCK_BACKUP = ".agents/state/harness-kit.lock.v1.bak";

const LATER_FLAGS: Record<string, string> = {
  packs: "--packs(팩 갱신)는 P18(확장 층, 설계 04)에서 제공한다",
  tools: "--tools(외부 도구 갱신)는 P22(외부 도구 모듈, 설계 10)에서 제공한다",
};

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

export { shellQuote };

function checkFlags(ctx: Ctx): string | undefined {
  for (const [flag, message] of Object.entries(LATER_FLAGS)) if (bool(ctx.values, flag)) throw usageError(message);
  const to = str(ctx.values, "to");
  if (to === undefined || to === VERSION) return to;
  if (/[:#/]/.test(to)) throw usageError(`--to 에 소스는 아직 받지 않는다: '${to}'`, "다른 템플릿 폴더는 --templates <폴더> 로 준다");
  throw usageError(`이 CLI 는 ${VERSION} 판만 깐다: --to ${to}`, `그 판은 npx harness-kit@${to} update 로 올린다`);
}

/** 설치된 킷이 CLI 보다 새것이면 exit 3. --to <CLI 버전> 이면 내려가는 update 를 허락한다. */
function checkVersion(installed: string, to: string | undefined): void {
  const cmp = compareSemver(installed, VERSION);
  if (cmp !== null && cmp > 0 && to !== VERSION) {
    throw new CliError(EXIT.STATE, `설치된 킷(${installed})이 이 CLI(${VERSION})보다 새것이다`, `새 CLI 로 다시 실행한다. 내리려면 harness-kit update --to ${VERSION}`);
  }
}

const NEEDS_DATA = new Set<UpdateAction>(["new", "restore", "update", "replace", "conflict", "merge"]);
const WRITES = new Set<UpdateAction>(["new", "restore", "update", "merge"]);

function opJson(o: UpdateOp): Record<string, unknown> {
  const j: Record<string, unknown> = { path: o.path, op: o.op, owner: o.owner, layer: o.layer, action: o.action };
  if (NEEDS_DATA.has(o.action)) j.executable = o.executable;
  if (o.reason !== undefined) j.reason = o.reason;
  if (o.newFile !== undefined) j.new = o.newFile;
  if (o.newRefreshed) j.newRefreshed = true;
  if (o.backup !== undefined) j.backup = o.backup;
  if (o.merge !== undefined) j.merge = o.merge;
  if (o.mergeBackup !== undefined) j.backup = o.mergeBackup;
  if (o.modified !== undefined) j.modified = o.modified;
  return j;
}

function opLine(o: UpdateOp): string {
  let extra = "";
  if (o.action === "conflict") extra = o.newFile ? `  → ${o.newFile}${o.newRefreshed ? " (갱신)" : ""}` : "";
  else if (o.action === "replace") extra = `  (수정본 → ${o.backup})`;
  else if (o.action === "orphan" && o.modified) extra = "  (고친 파일)";
  else if (o.merge) extra = `  (${o.merge})`;
  return `  ${o.action.padEnd(13)} ${o.path}${extra}${o.reason ? `  ${o.reason}` : ""}`;
}

function countsLine(c: Record<UpdateAction, number>): string {
  const skipped = c["skip-user"] + c["skip-external"] + c["skip-pack"];
  return `  파일: 새로 ${c.new} · 되살림 ${c.restore} · 교체 ${c.update} · 병합 ${c.merge} · 같음 ${c.same} · 충돌 ${c.conflict} · 덮음(.bak) ${c.replace} · 킷에서 빠짐 ${c.orphan} · 지움 ${c.delete} · 건너뜀 ${skipped} · 받지 않기로 함 ${c.forget}`;
}

function selectionLine(sel: Selection): string {
  return `  선택: ${sel.stack} · ${sel.arch} · ${sel.domain || "도메인 없음"} · 하네스 ${sel.agents.join(",")} · 모듈 ${sel.modules.join(",") || "none"}`;
}

interface Written {
  lockText: string;
  metaText: string;
  manifest: Buffer | null;
  v1Backup: Buffer | null;
  /** v1 lock 첫 update 의 원본(쓰기 전에 둔다, HK-25) */
  mergeBackups: BackupWrite[];
}

function applyUpdate(target: string, plan: UpdatePlan, w: Written, projection: ProjectionPlan | null): void {
  let current = "";
  try {
    for (const b of w.mergeBackups) {
      current = b.path;
      writeFileAtomic(full(target, b.path), b.data, false);
    }
    const deleted: string[] = [];
    for (const o of plan.ops) {
      current = o.path;
      if (WRITES.has(o.action)) writeFileAtomic(full(target, o.path), o.content as Buffer, o.executable === true);
      else if (o.action === "replace") {
        fs.renameSync(full(target, o.path), full(target, o.backup as string));
        writeFileAtomic(full(target, o.path), o.content as Buffer, o.executable === true);
      } else if (o.action === "conflict" && o.newFile) writeFileAtomic(full(target, o.newFile), o.content as Buffer, false);
      else if (o.action === "delete" && o.removeFile) {
        removeFile(target, o.path);
        deleted.push(o.path);
      }
    }
    removeEmptyDirs(target, deleted);
    current = "배치(mirror · render · merge)";
    if (projection) applyProjection(target, projection.ops);
    const state: [string, Buffer | null][] = [
      [MANIFEST_PATH, w.manifest],
      [V1_LOCK_BACKUP, w.v1Backup],
      [LOCK_REL, Buffer.from(w.lockText, "utf8")],
      [META_REL, Buffer.from(w.metaText, "utf8")],
    ];
    for (const [rel, data] of state) {
      current = rel;
      if (data) writeFileAtomic(full(target, rel), data, false);
    }
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current}`);
  }
}

function conflictList(plan: UpdatePlan): Record<string, unknown>[] {
  return plan.ops
    .filter((o) => o.action === "conflict")
    .map((o) => ({ path: o.path, new: o.newFile ?? null, diff: o.newFile ? `diff -u ${shellQuote(o.path)} ${shellQuote(o.newFile)}` : null }));
}

/** v1 lock 첫 update 목록(한 번, design §2.6). 킷 판(kit)은 파일 줄에 있어 CLAUDE.md 만 낸다. */
function mergedLines(merged: MergedFile[], backupDir: string): string[] {
  if (merged.length === 0) return [];
  const n = merged.filter((m) => m.kind !== "kit").length;
  const lines = [`  v1 lock 첫 업데이트 — 병합 ${n} · 킷 판 ${merged.length - n}(원본: ${backupDir}/)`];
  for (const m of merged) {
    if (m.kind !== "kit") lines.push(`    ${m.kind}  ${m.path}`);
    else if (m.path === "CLAUDE.md") lines.push("    kit    CLAUDE.md   (배치가 새 파일로 바꿨다 — 사람이 쓴 내용이면 원본에서 블록 밖으로 옮긴다)");
  }
  if (n) lines.push("    병합본의 '<!-- harness-kit: 설치 전 내용(병합) -->' 묶음을 보고 필요 없으면 지운다");
  return lines;
}

function humanLines(ctx: Ctx, head: string[], plan: UpdatePlan, shown: UpdateOp[], conflicts: Record<string, unknown>[], dryRun: boolean, board: BoardResult, merged: MergedFile[], backupDir: string): string[] {
  const lines = [...head, ...shown.map(opLine), countsLine(plan.counts), ...mergedLines(merged, backupDir)];
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

function writtenState(ctx: Ctx, target: string, inst: Installed, entries: LockEntry[], sel: Selection, tokens: Record<string, string>, source: string, mergeBackups: BackupWrite[]): Written {
  const lockText = serializeLock({ schema: "harness-kit.lock/v2", kit: { version: VERSION, source }, packs: inst.lock.packs, entries });
  const meta = mergeMetaForUpdate(inst.meta, { version: VERSION, selection: sel, tokens, today: today(ctx.io) });
  const manifest = lstatOrNull(full(target, MANIFEST_PATH)) ? null : manifestContent(sel, tokens);
  const v1Backup = inst.lockFormat === "v1" ? fs.readFileSync(full(target, LOCK_REL)) : null;
  return { lockText, metaText: serializeMeta(meta), manifest, v1Backup, mergeBackups };
}

const ANY_SKIP = new Set<UpdateAction>(["conflict", "skip-user", "skip-external", "skip-pack"]);

/** 보드 코드가 사람 판이면 그 경로(update.sh 는 conflict 만 본다 — design §12 A7). */
function boardBlocker(plan: UpdatePlan): string | null {
  return plan.ops.find((o) => isBoardCode(o.path) && ANY_SKIP.has(o.action))?.path ?? null;
}

const AMBIGUOUS_ACTIONS = new Set<UpdateAction>(["conflict", "replace", "orphan"]);

export function runUpdate(ctx: Ctx): CommandResult {
  const { io } = ctx;
  const to = checkFlags(ctx);
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "update");
  checkVersion(inst.meta.kit.version, to);
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io.env, cliFile: io.cliFile, cwd: io.cwd, version: VERSION });
  const layout = loadLayout(loc.dir);
  const { selection, droppedModules, retiredModules } = selectionFromMeta(layout, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout, selection, inst.meta, io.env, target);
  const prune = bool(ctx.values, "prune");
  const shaOf = (): Map<string, string> => new Map([...wanted({ layout, templatesDir: loc.dir, selection, tokens }).want].map(([p, d]) => [p, d.sha256]));
  const { lock, ambiguous } = resolvedLock(inst, target, shaOf);
  const acceptAll = bool(ctx.values, "accept-all");
  const raw = buildUpdatePlan({ layout, templatesDir: loc.dir, target, selection, tokens, lock, acceptAll, prune, forget: list(ctx.values, "forget") });
  const marked: UpdatePlan = { ...raw, ops: raw.ops.map((o) => (ambiguous.has(o.path) && AMBIGUOUS_ACTIONS.has(o.action) && !o.reason ? { ...o, reason: AMBIGUOUS_REASON } : o)) };
  // v1 lock 첫 update: 가리지 못한 conflict 를 새 판 · 병합으로(HK-25 R1). 배치는 그 결과를 원본으로 읽는다.
  const stamp = backupStamp(new Date());
  const v1 = applyV1Merge(marked, { target, ambiguous, acceptAll, stamp });
  const projection = projectionForUpdate({ target, templatesDir: loc.dir, tokens, agents: selection.agents, inst, plan: v1.plan, acceptAll });
  const claude = claudeBackup({ target, inst, agents: selection.agents, projection: projection !== null, stamp });
  const merged = [...v1.merged, ...(claude ? [claude.merged] : [])].sort((a, b) => byteCompare(a.path, b.path));
  const mergeBackups = [...v1.backups, ...(claude ? [claude.backup] : [])];
  const plan = withoutClaimed(v1.plan, projection?.plan ?? null);
  const entries = projection ? mergeEntries(plan.entries, projection.plan) : [...plan.entries, ...inst.lock.entries.filter((e) => PROJECTION_OPS.has(e.op))];
  const dryRun = bool(ctx.values, "dry-run");
  const w = writtenState(ctx, target, inst, entries, selection, tokens, loc.source, mergeBackups);
  if (!dryRun) applyUpdate(target, plan, w, projection?.plan ?? null);
  const board: BoardResult = dryRun ? { status: "skipped", reason: "dry-run" } : refreshBoard(target, io.env, boardBlocker(plan));

  const keptModified = prune && plan.ops.some((o) => o.action === "orphan" && o.modified);
  const human = projection ? needsHuman(projection.plan, projection.findings) : false;
  const code = plan.counts.conflict > 0 || keptModified || human ? EXIT.HUMAN : EXIT.OK;
  const shown = plan.ops.filter((o) => o.action !== "same" && (!ctx.quiet || o.action === "conflict"));
  const conflicts = [...conflictList(plan), ...projectionConflicts(projection?.plan ?? null)];
  const counts = { ...plan.counts, excludedByHarness: plan.excludedByHarness, overlapped: plan.overlaps.length };
  const data: Record<string, unknown> = {
    command: "update",
    target,
    templates: loc.dir,
    dryRun,
    kit: { from: inst.meta.kit.version, to: VERSION },
    formats: { meta: inst.metaFormat, lock: inst.lockFormat },
    selection: { stack: selection.stack, arch: selection.arch, domain: selection.domain, agents: selection.agents, modules: selection.modules },
    droppedModules,
    retiredModules,
    counts,
    ops: shown.map(opJson),
    conflicts,
    merged,
    generated: w.manifest ? [{ path: MANIFEST_PATH, action: "create" }] : [],
    board,
    state: [META_REL, LOCK_REL, ...(w.v1Backup ? [V1_LOCK_BACKUP] : [])],
  };
  if (projection) data.projection = projectionData(projection.plan, projection.findings);
  const head = [
    `harness-kit update — ${target}`,
    `  킷: ${inst.meta.kit.version} → ${VERSION} · 메타 ${inst.metaFormat} · lock ${inst.lockFormat}`,
    selectionLine(selection),
    ...retiredModules.map((m) => retiredNote(m, "meta")),
    ...(droppedModules.length ? [`  ⚠ 킷에 없는 모듈을 뺀다: ${droppedModules.join(", ")}`] : []),
  ];
  const lines = humanLines(ctx, head, plan, shown, conflicts, dryRun, board, merged, `${MERGE_BACKUP_DIR}/${stamp}`);
  if (projection) lines.splice(head.length + shown.length + 1, 0, ...projectionLines(projection.plan, projection.findings, ctx.quiet));
  else if (inst.lock.entries.some((e) => PROJECTION_OPS.has(e.op))) lines.splice(head.length + shown.length + 1, 0, "  배치: 이 템플릿에 projection.json 이 없다 — 배치 항목은 그대로 둔다");
  return { code, data, lines };
}

/** copy 판정 뒤의 원본으로 배치를 판정한다(design §6.3). 템플릿에 배치 상수가 없으면 null — 배치 항목을 그대로 둔다. */
function projectionForUpdate(args: { target: string; templatesDir: string; tokens: Record<string, string>; agents: string[]; inst: Installed; plan: UpdatePlan; acceptAll: boolean }): { plan: ProjectionPlan; findings: Finding[] } | null {
  const spec = loadSpecOrNull(args.templatesDir);
  if (!spec) return null;
  const writes = new Map<string, OverlayWrite>();
  const deletes = new Set<string>();
  for (const o of args.plan.ops) {
    if ((WRITES.has(o.action) || o.action === "replace") && o.content) writes.set(o.path, { content: o.content, executable: o.executable === true });
    else if (o.action === "conflict" && o.newFile && o.content) writes.set(o.newFile, { content: o.content, executable: false });
    else if (o.action === "delete" && o.removeFile) deletes.add(o.path);
  }
  const p = prepare({ target: args.target, spec, tokens: args.tokens, agents: args.agents, writes, deletes, copyPaths: args.plan.wantPaths });
  const plan = judgeUpdate({ target: args.target, spec, tokens: args.tokens, sources: p.sources, wants: p.wants, prev: args.inst.lock.entries, copyNow: args.plan.wantPaths, acceptAll: args.acceptAll, retire: true });
  return { plan, findings: p.findings };
}

/** 배치가 가져간 경로(v1 포인터 · retire)를 copy 판정에서 뺀다. 개수도 다시 센다. */
function withoutClaimed(plan: UpdatePlan, projection: ProjectionPlan | null): UpdatePlan {
  if (!projection || projection.claimed.size === 0) return plan;
  const ops = plan.ops.filter((o) => !projection.claimed.has(o.path));
  const counts = Object.fromEntries(Object.keys(plan.counts).map((k) => [k, 0])) as Record<UpdateAction, number>;
  for (const o of ops) counts[o.action] += 1;
  return { ...plan, ops, counts, entries: plan.entries.filter((e) => !projection.claimed.has(e.path)) };
}
