/** update — 3방향 비교로 킷을 새 판으로 올린다(HK-11 design §3, 설계 02 §3.10). */
import fs from "node:fs";
import path from "node:path";
import { bool, list, str } from "../cli/args";
import { targetOf, today, type CommandResult, type Ctx } from "../cli/context";
import { CliError, EXIT, fsError, usageError } from "../core/errors";
import { lstatOrNull, writeFileAtomic } from "../core/fsx";
import { loadInstalled, selectionFromMeta, tokensFromMeta, type Installed } from "../core/installed";
import { loadLayout } from "../core/layout";
import { LOCK_REL, serializeLock } from "../core/lock";
import { mergeMetaForUpdate, META_REL, serializeMeta } from "../core/meta";
import { MANIFEST_PATH, manifestContent } from "../core/plan";
import { removeEmptyDirs, removeFile } from "../core/remove";
import type { Selection } from "../core/selection";
import { locateTemplates } from "../core/templates";
import { buildUpdatePlan, type UpdateAction, type UpdateOp, type UpdatePlan } from "../core/update-plan";
import { compareSemver, VERSION } from "../core/version";

export const V1_LOCK_BACKUP = ".agents/state/harness-kit.lock.v1.bak";

const LATER_FLAGS: Record<string, string> = {
  packs: "--packs(팩 갱신)는 P18(확장 층, 설계 04)에서 제공한다",
  tools: "--tools(외부 도구 갱신)는 P22(외부 도구 모듈, 설계 10)에서 제공한다",
};

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

/** 셸에 붙여 넣을 수 있게 필요할 때만 작은따옴표로 감싼다. */
export function shellQuote(s: string): string {
  return /^[A-Za-z0-9_./@%+=:,-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

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

const NEEDS_DATA = new Set<UpdateAction>(["new", "restore", "update", "replace", "conflict"]);

function opJson(o: UpdateOp): Record<string, unknown> {
  const j: Record<string, unknown> = { path: o.path, op: o.op, owner: o.owner, layer: o.layer, action: o.action };
  if (NEEDS_DATA.has(o.action)) j.executable = o.executable;
  if (o.reason !== undefined) j.reason = o.reason;
  if (o.newFile !== undefined) j.new = o.newFile;
  if (o.newRefreshed) j.newRefreshed = true;
  if (o.backup !== undefined) j.backup = o.backup;
  if (o.modified !== undefined) j.modified = o.modified;
  return j;
}

function opLine(o: UpdateOp): string {
  let extra = "";
  if (o.action === "conflict") extra = o.newFile ? `  → ${o.newFile}${o.newRefreshed ? " (갱신)" : ""}` : "";
  else if (o.action === "replace") extra = `  (수정본 → ${o.backup})`;
  else if (o.action === "orphan" && o.modified) extra = "  (고친 파일)";
  return `  ${o.action.padEnd(13)} ${o.path}${extra}${o.reason ? `  ${o.reason}` : ""}`;
}

function countsLine(c: Record<UpdateAction, number>): string {
  const skipped = c["skip-user"] + c["skip-external"] + c["skip-pack"];
  return `  파일: 새로 ${c.new} · 되살림 ${c.restore} · 교체 ${c.update} · 같음 ${c.same} · 충돌 ${c.conflict} · 덮음(.bak) ${c.replace} · 킷에서 빠짐 ${c.orphan} · 지움 ${c.delete} · 건너뜀 ${skipped} · 받지 않기로 함 ${c.forget}`;
}

function selectionLine(sel: Selection): string {
  return `  선택: ${sel.stack} · ${sel.arch} · ${sel.domain || "도메인 없음"} · 하네스 ${sel.agents.join(",")} · 모듈 ${sel.modules.join(",") || "none"}`;
}

interface Written {
  lockText: string;
  metaText: string;
  manifest: Buffer | null;
  v1Backup: Buffer | null;
}

function applyUpdate(target: string, plan: UpdatePlan, w: Written): void {
  let current = "";
  try {
    const deleted: string[] = [];
    for (const o of plan.ops) {
      current = o.path;
      if (o.action === "new" || o.action === "restore" || o.action === "update") writeFileAtomic(full(target, o.path), o.content as Buffer, o.executable === true);
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

function humanLines(ctx: Ctx, head: string[], plan: UpdatePlan, shown: UpdateOp[], conflicts: Record<string, unknown>[], dryRun: boolean): string[] {
  const lines = [...head, ...shown.map(opLine), countsLine(plan.counts)];
  if (conflicts.length) {
    lines.push("  충돌 — 고친 파일이라 덮지 않았다. 새 판은 .new 에 있다(리포 폴더에서):");
    for (const c of conflicts) if (c.diff) lines.push(`    ${String(c.diff)}`);
    lines.push("  병합했으면 .new 를 지운다. 새 판을 그대로 쓰려면 mv 로 덮는다. 전부 새 판으로: harness-kit update --accept-all");
  }
  if (plan.ops.some((o) => o.action === "orphan") && !bool(ctx.values, "prune")) lines.push("  킷에서 빠진 미수정 파일을 지우려면: harness-kit update --prune");
  lines.push(dryRun ? "  (dry-run — 쓰지 않았다)" : "  다음: harness-kit doctor");
  return lines;
}

function writtenState(ctx: Ctx, target: string, inst: Installed, plan: UpdatePlan, sel: Selection, tokens: Record<string, string>, source: string): Written {
  const lockText = serializeLock({ schema: "harness-kit.lock/v2", kit: { version: VERSION, source }, packs: inst.lock.packs, entries: plan.entries });
  const meta = mergeMetaForUpdate(inst.meta, { version: VERSION, selection: sel, tokens, today: today(ctx.io) });
  const manifest = lstatOrNull(full(target, MANIFEST_PATH)) ? null : manifestContent(sel, tokens);
  const v1Backup = inst.lockFormat === "v1" ? fs.readFileSync(full(target, LOCK_REL)) : null;
  return { lockText, metaText: serializeMeta(meta), manifest, v1Backup };
}

export function runUpdate(ctx: Ctx): CommandResult {
  const { io } = ctx;
  const to = checkFlags(ctx);
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "update");
  checkVersion(inst.meta.kit.version, to);
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io.env, cliFile: io.cliFile, cwd: io.cwd, version: VERSION });
  const layout = loadLayout(loc.dir);
  const { selection, droppedModules } = selectionFromMeta(layout, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout, selection, inst.meta, io.env, target);
  const prune = bool(ctx.values, "prune");
  const plan = buildUpdatePlan({ layout, templatesDir: loc.dir, target, selection, tokens, lock: inst.lock, acceptAll: bool(ctx.values, "accept-all"), prune, forget: list(ctx.values, "forget") });
  const dryRun = bool(ctx.values, "dry-run");
  const w = writtenState(ctx, target, inst, plan, selection, tokens, loc.source);
  if (!dryRun) applyUpdate(target, plan, w);

  const keptModified = prune && plan.ops.some((o) => o.action === "orphan" && o.modified);
  const code = plan.counts.conflict > 0 || keptModified ? EXIT.HUMAN : EXIT.OK;
  const shown = plan.ops.filter((o) => o.action !== "same" && (!ctx.quiet || o.action === "conflict"));
  const conflicts = conflictList(plan);
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
    counts,
    ops: shown.map(opJson),
    conflicts,
    generated: w.manifest ? [{ path: MANIFEST_PATH, action: "create" }] : [],
    state: [META_REL, LOCK_REL, ...(w.v1Backup ? [V1_LOCK_BACKUP] : [])],
  };
  const head = [
    `harness-kit update — ${target}`,
    `  킷: ${inst.meta.kit.version} → ${VERSION} · 메타 ${inst.metaFormat} · lock ${inst.lockFormat}`,
    selectionLine(selection),
    ...(droppedModules.length ? [`  ⚠ 킷에 없는 모듈을 뺀다: ${droppedModules.join(", ")}`] : []),
  ];
  return { code, data, lines: humanLines(ctx, head, plan, shown, conflicts, dryRun) };
}
