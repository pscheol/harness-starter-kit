/**
 * 모듈 엔진: `add <모듈>` · `remove <모듈>` 의 외부 도구 모듈 절차(설계 10 §3.1).
 * 순서: 선언 읽기 → 충돌 · 요구 → 도구(설치 · 범위) → 측정 전 → 계획 출력 → 스냅숏 → 단계 실행 → 측정 후.
 * 킷 몫(파일 · 훅 병합 · lock · 메타)은 기존 add · remove 의 계획 · 적용 함수를 그대로 쓴다. 외부 도구 파일은 lock 에 op none 으로만 적는다.
 * 모델을 부르지 않는다. 외부 명령은 module.json 의 steps 에 적힌 것만 부른다.
 */
import fs from "node:fs";
import path from "node:path";
import { bool } from "../cli/args";
import type { CommandResult, Ctx } from "../cli/context";
import { createPrompter, type Prompter } from "../cli/prompt";
import { planAdd, runKitAdd } from "../commands/add";
import { applyChange, dryRunOf, kitOf, loadForChange, report, type ChangeResult, type Loaded } from "../commands/change";
import { planRemove, runKitRemove } from "../commands/remove";
import { CliError, EXIT } from "../core/errors";
import { writeFileAtomic } from "../core/fsx";
import type { LockEntry } from "../core/lock";
import { compare, hookCount, measureLines, measureSession, THRESHOLD_BYTES, type Measure } from "../core/measure";
import { META_REL, serializeMeta } from "../core/meta";
import { satisfiesKit } from "../core/packs";
import { LOCK_REL } from "../core/lock";
import type { Names } from "../core/selection-change";
import { withoutNames } from "../core/selection-change";
import { VERSION } from "../core/version";
import { loadModuleOrNull, loadModule, type ModuleDecl, type Step, type ToolDecl } from "./declaration";
import { hookOwnerTable, moduleFindings, type ModuleFinding } from "./doctor";
import { registerExternal, setDotted, takeSnapshot, toolOwner, writeSnapshot, type Registration, type Snapshot } from "./external";
import { callHandler } from "./handlers";
import { designHarness, fillPlaceholders, implementHarness, toolHarnessName } from "./roles";
import { Rollback } from "./rollback";
import { checkTool, decideInstall, displayCmd, installOffer, platformOf, rangeOf, runCmd, type ToolState } from "./tools";
import { lockFile } from "../core/legacy-names";

export function isExternalModule(templatesDir: string, id: string): boolean {
  return loadModuleOrNull(templatesDir, id)?.kind === "external";
}

const asRecord = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

interface StepLog {
  step: string;
  argv?: string[];
  status?: number | null;
  skipped?: string;
}

interface Out {
  code: number;
  lines: string[];
  data: Record<string, unknown>;
}

function prompterOf(ctx: Ctx): Prompter | null {
  const { io } = ctx;
  return io.isTTY && io.stdin !== undefined && !ctx.json ? createPrompter(io.stdin, io.stderr) : null;
}

/** 이 모듈의 측정 하네스: aidlc 는 설계 · 나머지는 구현 역할 하네스(meta.agents 에 있는 것만) */
function measureHarness(meta: Record<string, unknown>, decl: ModuleDecl, agents: string[]): string {
  const h = decl.id === "aidlc" ? designHarness(meta) : implementHarness(meta);
  return agents.includes(h) || agents.length === 0 ? h : (agents[0] as string);
}

function measureOf(l: Loaded, root: string, templatesDir: string, harness: string): Measure {
  const lockEntries = readEntries(root) ?? l.inst.lock.entries;
  return measureSession(root, { harness, entries: lockEntries.map((e) => ({ path: e.path, owner: e.owner })), hookOwners: hookOwnerTable(templatesDir) });
}

function readEntries(root: string): LockEntry[] | null {
  try {
    const j = JSON.parse(fs.readFileSync(lockFile(root), "utf8")) as { entries?: LockEntry[] };
    return Array.isArray(j.entries) ? j.entries : null;
  } catch {
    return null;
  }
}

function checkKitRange(decl: ModuleDecl): void {
  if (decl.requires.kit && !satisfiesKit(VERSION, decl.requires.kit)) {
    throw new CliError(EXIT.STATE, `${decl.id} 모듈은 kit ${decl.requires.kit} 을 요구한다(이 CLI ${VERSION})`);
  }
}

function checkRequires(l: Loaded, decl: ModuleDecl): void {
  const on = l.before.modules;
  const hit = decl.conflicts.filter((c) => on.includes(c));
  if (hit.length) throw new CliError(EXIT.STATE, `${decl.id} 모듈은 ${hit.join(", ")} 와 같이 켤 수 없다(충돌)`, `먼저 knots-sync remove ${hit.join(" ")}`);
  const missing = decl.requires.modules.filter((r) => !on.includes(r));
  if (missing.length) throw new CliError(EXIT.STATE, `${decl.id} 모듈은 먼저 ${missing.join(", ")} 를 켜야 한다`, missing.map((m) => `knots-sync add ${m}`).join(" · "));
}

interface ToolOutcome {
  state: ToolState;
  lines: string[];
}

/** 도구 확인 · 설치 · 범위 검사(MD-R3 · R4). dryRun 이면 설치하지 않고 계획만 적는다. */
async function ensureTool(ctx: Ctx, l: Loaded, tool: ToolDecl, prompter: Prompter | null, dryRun: boolean): Promise<ToolOutcome> {
  const { io } = ctx;
  const range = rangeOf(tool, asRecord(l.inst.meta));
  let state = checkTool(io, l.target, tool, range);
  const lines: string[] = [];
  if (!state.installed) {
    const offer = installOffer(tool, platformOf(io));
    lines.push(...offer.lines);
    if (dryRun) {
      lines.push("  (dry-run — 설치하지 않았다)");
      return { state, lines };
    }
    const decision = await decideInstall(io, tool, { installTools: bool(ctx.values, "install-tools"), confirm: (q) => (prompter ? prompter.confirm(q) : Promise.resolve(false)) });
    if (decision.action === "print") {
      const why: Record<string, string> = {
        agent: "에이전트 세션에서는 설치하지 않는다(--install-tools 도 같다). 사람 터미널에서 위 명령을 실행한 뒤 다시 한다",
        "no-tty": "사람 터미널이 아니다. 위 명령을 실행하거나 터미널에서 --install-tools 로 다시 한다",
        declined: "설치하지 않았다. 위 명령을 직접 실행한 뒤 다시 한다",
        sudo: "sudo 가 필요한 명령은 실행하지 않는다. 직접 실행한 뒤 다시 한다",
        "no-command": "이 OS 의 설치 명령을 적어 두지 않았다. 문서를 보고 직접 설치한 뒤 다시 한다",
      };
      throw new CliError(EXIT.ENV, `${tool.name} 가 없다 — ${why[decision.reason]}`, lines.join("\n"));
    }
    lines.push(`  설치: ${displayCmd(decision.command)}`);
    const r = runCmd(io, l.target, decision.command, { inherit: io.isTTY && !ctx.json, timeout: 600_000 });
    if (r.status !== 0) throw new CliError(EXIT.ENV, `${tool.name} 설치 명령이 실패했다(exit ${String(r.status)})`, (r.stderr || r.stdout).trim().split("\n").slice(-3).join("\n"));
    state = checkTool(io, l.target, tool, range);
    if (!state.installed) throw new CliError(EXIT.ENV, `${tool.name} 를 설치했지만 PATH 에서 찾지 못했다`, "새 터미널을 열거나 PATH 를 확인한다");
  }
  lines.push(`  ${tool.name} ${state.version ?? "(버전 확인 못 함)"} · 검증 범위 ${range}`);
  if (state.inRange === false) {
    lines.push(`  ⚠ ${tool.name} ${state.version} 은 검증된 범위(${range}) 밖이다`);
    if (!bool(ctx.values, "allow-unverified") && !dryRun) {
      throw new CliError(EXIT.HUMAN, `${tool.name} ${state.version} 은 검증된 범위(${range}) 밖이다`, "그래도 쓰려면 --allow-unverified");
    }
  } else if (state.inRange === null) lines.push(`  ⚠ ${tool.name} 버전을 해석하지 못해 범위(${range})를 확인하지 못했다`);
  return { state, lines };
}

function planLines(decl: ModuleDecl, steps: Step[], meta: Record<string, unknown>, tool: ToolDecl | null, kitResult: ChangeResult, harness: string): string[] {
  const lines = [`  계획 — ${decl.id}(${decl.title})`];
  const files = kitResult.ops.filter((o) => o.action !== "keep" && o.action !== "same");
  lines.push(`    킷 파일 ${files.length}개: ${files.slice(0, 6).map((o) => o.path).join(", ")}${files.length > 6 ? " …" : ""}`);
  if (decl.hooks.length) lines.push(`    병합할 훅: ${decl.hooks.map((h) => `${h.id}(${h.event}, ${h.harnesses.join("/") || "전체"})`).join(", ")}`);
  const runs = steps.filter((s): s is Extract<Step, { kind: "run" }> => s.kind === "run");
  for (const r of runs) lines.push(`    외부 명령: ${displayCmd(fillPlaceholders(r.argv, meta, tool))}${r.confirm ? "  (확인)" : ""}`);
  for (const s of steps) if (s.kind === "call") lines.push(`    도구 설정 단계: ${s.name}`);
  const set = Object.entries(decl.config.set);
  if (set.length) lines.push(`    바뀔 설정(${META_REL}): ${set.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ")}`);
  if (decl.settings.length) lines.push(`    병합할 설정 키: ${decl.settings.map((s) => `${s.path} ${s.keys.join(",")}`).join(" · ")}`);
  const warn = decl.harnessWarnings[harness];
  if (warn) lines.push(`    ⚠ ${warn}`);
  return lines;
}

function rollbackPaths(r: ChangeResult): string[] {
  const out = [LOCK_REL, META_REL, ...r.ops.flatMap((o) => [o.path, ...(o.newFile ? [o.newFile] : [])])];
  for (const p of r.projection?.ops ?? []) {
    out.push(p.path, ...(p.newFiles ?? []), ...(p.backups ?? []));
    for (const x of p.effect?.extra ?? []) out.push(x.path);
    for (const [from, to] of p.effect?.renames ?? []) out.push(from, to);
  }
  if (r.manifest) out.push(".agents/MANIFEST.md");
  return out;
}

function writeMeta(l: Loaded, mutate: (m: Record<string, unknown>) => Record<string, unknown>): void {
  const file = path.join(l.target, ...META_REL.split("/"));
  const cur = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  writeFileAtomic(file, Buffer.from(serializeMeta(mutate(cur)), "utf8"), false);
}

function applyConfig(l: Loaded, values: Record<string, unknown>): void {
  writeMeta(l, (m) => Object.entries(values).reduce((acc, [k, v]) => setDotted(acc, k, v), m));
}

function runOne(ctx: Ctx, l: Loaded, step: Extract<Step, { kind: "run" }>, tool: ToolDecl | null, interactive: boolean, log: StepLog[], lines: string[]): { ok: boolean } {
  const argv = fillPlaceholders(step.argv, asRecord(l.inst.meta), tool);
  const inherit = interactive && !ctx.json;
  const r = runCmd(ctx.io, l.target, argv, { inherit, timeout: 900_000 });
  log.push({ step: "run", argv, status: r.status });
  lines.push(`  실행: ${displayCmd(argv)} → exit ${String(r.status)}`);
  if (!inherit) {
    const out = `${r.stdout}${r.stderr}`.trim().split("\n").filter(Boolean);
    for (const o of out.slice(-12)) lines.push(`    ${o}`);
  }
  if (r.missing) throw new CliError(EXIT.ENV, `${argv[0]} 를 찾지 못했다`);
  if (r.status !== 0 && !step.allowFail) throw new CliError(EXIT.STATE, `${displayCmd(argv)} 가 실패했다(exit ${String(r.status)})`, "외부 도구가 만든 파일은 남겼다. 킷 몫은 아직 적용하지 않았다");
  return { ok: r.status === 0 };
}

async function confirmRun(ctx: Ctx, step: Extract<Step, { kind: "run" }>, argv: string[], prompter: Prompter | null): Promise<boolean> {
  if (!step.confirm || bool(ctx.values, "yes")) return true;
  if (!prompter) {
    throw new CliError(EXIT.ENV, `외부 명령을 실행하려면 확인이 필요하다: ${displayCmd(argv)}`, "사람 터미널에서 묻는 대로 답하거나 --yes 를 준다");
  }
  return prompter.confirm(`실행한다: ${displayCmd(argv)}`);
}

function doctorLines(findings: ModuleFinding[], id: string): string[] {
  const mine = findings.filter((f) => f.owner === id || f.owner === undefined);
  return mine.length ? mine.map((f) => `  ${f.severity === "error" ? "✖" : f.severity === "warn" ? "⚠" : "·"} ${f.kind} — ${f.hint ?? ""}`) : ["  모듈 점검: 문제 없음"];
}

function doctorFor(ctx: Ctx, kit: ReturnType<typeof kitOf>, id: string): ModuleFinding[] {
  const l = loadForChange(ctx, "doctor", kit);
  return moduleFindings({ io: ctx.io, root: l.target, templatesDir: kit.loc.dir, meta: l.inst.meta, entries: readEntries(l.target) ?? l.inst.lock.entries }).filter((f) => f.owner === id);
}

export async function addExternal(ctx: Ctx, kit: ReturnType<typeof kitOf>, id: string): Promise<Out> {
  const dryRun = dryRunOf(ctx);
  const decl = loadModule(kit.loc.dir, id);
  checkKitRange(decl);
  const l0 = loadForChange(ctx, "add", kit);
  checkRequires(l0, decl);
  const meta0 = asRecord(l0.inst.meta);
  const tool = decl.requires.tools[0] ?? null;
  const prompter = prompterOf(ctx);
  const lines: string[] = [`knots-sync add ${id} — ${l0.target}`];
  const log: StepLog[] = [];
  try {
    // 3. 도구
    const toolOutcomes: ToolOutcome[] = [];
    for (const t of decl.requires.tools) toolOutcomes.push(await ensureTool(ctx, l0, t, prompter, dryRun));
    for (const o of toolOutcomes) lines.push(...o.lines);
    // 하네스 이름 자리표를 먼저 풀어 본다(지원하지 않는 하네스면 쓰기 전에 exit 3)
    for (const s of decl.steps.add) if (s.kind === "run") fillPlaceholders(s.argv, meta0, tool);
    // 3a. 측정 전
    const harness = measureHarness(meta0, decl, l0.before.agents);
    const before = measureOf(l0, l0.target, kit.loc.dir, harness);
    // 4. 계획
    const names: Names = { harnesses: [], modules: [id], retired: [] };
    const plan = planAdd(l0, names);
    lines.push(...planLines(decl, decl.steps.add, meta0, tool, plan.result, harness));
    const data: Record<string, unknown> = {
      command: "add",
      module: id,
      target: l0.target,
      dryRun,
      tools: toolOutcomes.map((o) => o.state),
      plan: { kitFiles: plan.result.ops.filter((o) => o.action !== "keep" && o.action !== "same").length, hooks: decl.hooks.map((h) => h.id), config: decl.config.set, run: decl.steps.add.filter((s) => s.kind === "run").map((s) => fillPlaceholders((s as { argv: string[] }).argv, meta0, tool)) },
    };
    if (dryRun) {
      lines.push("  (dry-run — 쓰지 않았다)");
      return { code: EXIT.OK, lines, data };
    }
    // 실행 확인(쓰기 전에 모든 확인을 받아 둔다)
    for (const s of decl.steps.add) {
      if (s.kind !== "run") continue;
      const argv = fillPlaceholders(s.argv, meta0, tool);
      if (!(await confirmRun(ctx, s, argv, prompter))) throw new CliError(EXIT.ABORT, "중단했다(아무것도 쓰지 않았다)");
    }
    // 5. 스냅숏
    const at = new Date().toISOString();
    const snap: Snapshot = takeSnapshot(l0.target, decl, at);
    const snapPath = writeSnapshot(l0.target, snap);
    data.snapshot = snapPath;
    // 6~10. 단계
    let registration: Registration | null = null;
    let rollback: Rollback | null = null;
    let kitReport: { data: Record<string, unknown>; lines: string[] } | null = null;
    let kitCode: number = EXIT.OK;
    const interactive = ctx.io.isTTY && prompter !== null;
    try {
      for (const s of decl.steps.add) {
        if (s.kind === "run") runOne(ctx, l0, s, tool, interactive, log, lines);
        else if (s.kind === "call") {
          const r = callHandler(s.name, { ctx, root: l0.target, decl, meta: meta0, tool, harness: toolHarnessName(tool as ToolDecl, implementHarness(meta0), "implement") });
          lines.push(...r.lines);
          log.push({ step: `call ${s.name}` });
        } else if (s.kind === "registerExternal") {
          const lockNow = readEntries(l0.target) ?? l0.inst.lock.entries;
          registration = registerExternal(l0.target, decl, lockNow, snap);
          lines.push(`  외부 소유로 기록 ${registration.entries.length}개(owner ${toolOwner(decl)}, op none) — 새로 ${registration.created} · 이미 있던 것 ${registration.existing}`);
          if (registration.unknown.length) lines.push(`  알 수 없는 파일 ${registration.unknown.length}개(externalPaths 밖이라 등록하지 않았다): ${registration.unknown.slice(0, 5).join(", ")}${registration.unknown.length > 5 ? " …" : ""}`);
          log.push({ step: "registerExternal" });
        } else if (s.kind === "applyKit") {
          const l = loadForChange(ctx, "add", kit);
          const planned = planAdd(l, names);
          const extra = new Map((registration?.entries ?? []).map((e) => [e.path, e]));
          const result: ChangeResult = { ...planned.result, entries: [...planned.result.entries.filter((e) => !extra.has(e.path)), ...extra.values()] };
          rollback = Rollback.capture(l.target, rollbackPaths(result));
          const featureDocs = applyChange(ctx, l, planned.after, result);
          kitReport = report(ctx, l, { command: "add", names: { ...names, already: [] }, after: planned.after, result, dryRun: false, featureDocs, notes: [] });
          const conflict = result.ops.some((o) => o.action === "conflict") || result.manifest?.action === "conflict";
          if (conflict) kitCode = EXIT.HUMAN;
          lines.push(...kitReport.lines.slice(1, -1));
          log.push({ step: "applyKit" });
        } else if (s.kind === "setConfig") {
          applyConfig(loadForChange(ctx, "add", kit), decl.config.set);
          lines.push(`  설정: ${Object.entries(decl.config.set).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ")}`);
          log.push({ step: "setConfig" });
        } else if (s.kind === "doctor") {
          const f = doctorFor(ctx, kit, s.id);
          lines.push(...doctorLines(f, s.id));
          data.doctor = f;
          log.push({ step: "doctor" });
        } else if (s.kind === "print") lines.push(`  ${s.text}`);
      }
    } catch (err) {
      let note: string;
      if (rollback) {
        const n = (rollback as Rollback).restore();
        note = `킷 몫을 되돌렸다(경로 ${n}개). 외부 도구가 만든 파일은 남겼다(스냅숏 ${snapPath})`;
      } else note = `킷 몫은 아직 쓰지 않았다. 외부 도구가 만든 파일은 남겼다(스냅숏 ${snapPath})`;
      throw withNote(err, [...lines.slice(1), note]);
    }
    // 11. 측정 후
    const lAfter = loadForChange(ctx, "add", kit);
    const after = measureOf(lAfter, l0.target, kit.loc.dir, harness);
    lines.push(...measureLines(`add ${id}`, before, after));
    data.measure = { harness, before: compactMeasure(before), after: compactMeasure(after), added: compare(before, after).added };
    data.steps = log;
    data.registered = registration ? { created: registration.created, existing: registration.existing, unknown: registration.unknown } : null;
    if (kitReport) data.kit = kitReport.data;
    const added = compare(before, after).added;
    if (added > THRESHOLD_BYTES && prompter && !bool(ctx.values, "yes")) {
      const keep = await prompter.confirm(`세션마다 ${added.toLocaleString("en-US")}바이트가 늘었다. 계속 쓸까요?`);
      if (!keep) {
        const undone = removeKitPart(ctx, kit, decl);
        lines.push(`  켜지 않기로 했다 — 킷 몫을 뺐다(${undone}). 외부 도구가 만든 파일은 남았다`);
        data.reverted = true;
        return { code: EXIT.HUMAN, lines, data };
      }
    } else if (added > THRESHOLD_BYTES) lines.push(`  ⚠ 늘어난 양이 ${THRESHOLD_BYTES.toLocaleString("en-US")}바이트를 넘는다 — 되돌리려면 knots-sync remove ${id}`);
    lines.push("  다음: knots-sync doctor");
    return { code: kitCode, lines, data };
  } finally {
    prompter?.close();
  }
}

/** 실패 오류에 진행 상황 줄을 붙여 다시 던진다(main 이 stderr 에 낸다) */
function withNote(err: unknown, notes: string[]): CliError {
  const e = err instanceof CliError ? err : new CliError(EXIT.STATE, err instanceof Error ? err.message : String(err));
  return new CliError(e.code, e.message, [...(e.hint ? [e.hint] : []), ...notes].join("\n"));
}

function compactMeasure(m: Measure): Record<string, unknown> {
  return { total: m.total, owners: m.owners, hooks: m.hooks, hookTotals: Object.fromEntries(Object.keys(m.hooks).map((o) => [o, hookCount(m, o)])) };
}

/** 측정 확인에서 "아니오" — 킷 몫만 뺀다(remove 절차의 removeKit · unsetConfig) */
function removeKitPart(ctx: Ctx, kit: ReturnType<typeof kitOf>, decl: ModuleDecl): string {
  const l = loadForChange(ctx, "remove", kit);
  const names: Names = { harnesses: [], modules: [decl.id], retired: [] };
  const after = withoutNames(l.before, names);
  const result = dropExternal(planRemove(l, after), decl);
  applyChange(ctx, l, after, result);
  applyConfig(loadForChange(ctx, "remove", kit), decl.config.unset);
  return `파일 ${result.ops.filter((o) => o.action === "delete").length}개 삭제`;
}

/** 외부 소유 항목은 lock 에서만 뺀다(파일은 둔다, MD-R6) */
function dropExternal(r: ChangeResult, decl: ModuleDecl): ChangeResult {
  const owner = toolOwner(decl);
  return { ...r, entries: r.entries.filter((e) => e.owner !== owner) };
}

export async function removeExternal(ctx: Ctx, kit: ReturnType<typeof kitOf>, id: string): Promise<Out> {
  const dryRun = dryRunOf(ctx);
  const decl = loadModule(kit.loc.dir, id);
  const l = loadForChange(ctx, "remove", kit);
  const lines: string[] = [`knots-sync remove ${id} — ${l.target}`];
  if (!l.before.modules.includes(id)) {
    lines.push(`  · 켜져 있지 않다 — 건너뛴다: ${id}`);
    return { code: EXIT.OK, lines, data: { command: "remove", module: id, target: l.target, dryRun, notOn: true } };
  }
  const meta = asRecord(l.inst.meta);
  const harness = measureHarness(meta, decl, l.before.agents);
  const before = measureOf(l, l.target, kit.loc.dir, harness);
  const data: Record<string, unknown> = { command: "remove", module: id, target: l.target, dryRun };
  const names: Names = { harnesses: [], modules: [id], retired: [] };
  const tool = decl.requires.tools[0] ?? null;
  let code: number = EXIT.OK;
  for (const s of decl.steps.remove) {
    if (s.kind === "removeKit") {
      const after = withoutNames(l.before, names);
      const result = dropExternal(planRemove(l, after), decl);
      const featureDocs = dryRun ? null : applyChange(ctx, l, after, result);
      const rep = report(ctx, l, { command: "remove", names: { ...names, notOn: [] }, after, result, dryRun, featureDocs, notes: [] });
      lines.push(...rep.lines.slice(1, dryRun ? undefined : -1));
      data.kit = rep.data;
      const external = l.inst.lock.entries.filter((e) => e.owner === toolOwner(decl)).length;
      lines.push(`  외부 소유 항목 ${external}개는 lock 에서만 뺐다(파일은 그대로)`);
      const keep = result.ops.filter((o) => o.action === "keep-modified");
      if (keep.length || result.ops.some((o) => o.action === "conflict")) code = EXIT.HUMAN;
    } else if (s.kind === "unsetConfig") {
      if (!dryRun) applyConfig(loadForChange(ctx, "remove", kit), decl.config.unset);
      lines.push(`  설정: ${Object.entries(decl.config.unset).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ")}`);
    } else if (s.kind === "print") {
      lines.push(`  ${fillPlaceholders([s.text], meta, tool)[0]}`);
    }
  }
  if (!dryRun) {
    const lAfter = loadForChange(ctx, "remove", kit);
    const after = measureOf(lAfter, l.target, kit.loc.dir, harness);
    lines.push(...measureLines(`remove ${id}`, before, after).map((x) => x));
    data.measure = { harness, before: compactMeasure(before), after: compactMeasure(after) };
    const left = doctorFor(ctx, kit, id).filter((f) => f.kind === "external-hooks-left");
    for (const f of left) lines.push(`  · ${f.hint}`);
    lines.push("  다음: knots-sync doctor");
  } else lines.push("  (dry-run — 쓰지 않았다)");
  return { code, lines, data };
}

function merge(outs: { code: number; lines: string[]; data: Record<string, unknown> }[], command: string): CommandResult {
  if (outs.length === 1) return outs[0] as CommandResult;
  return { code: Math.max(...outs.map((o) => o.code)), lines: outs.flatMap((o) => o.lines), data: { command, results: outs.map((o) => o.data) } };
}

export async function runModuleAdd(ctx: Ctx, kit: ReturnType<typeof kitOf>, rest: Names, externals: string[]): Promise<CommandResult> {
  const outs: CommandResult[] = [];
  if (rest.harnesses.length + rest.modules.length + rest.retired.length > 0) outs.push(runKitAdd(ctx, kit, rest));
  for (const id of externals) {
    const o = await addExternal(ctx, kit, id);
    outs.push(o);
    if (o.code === EXIT.HUMAN && Object.hasOwn(o.data, "reverted")) break;
  }
  return merge(outs, "add");
}

export async function runModuleRemove(ctx: Ctx, kit: ReturnType<typeof kitOf>, rest: Names, externals: string[]): Promise<CommandResult> {
  const outs: CommandResult[] = [];
  if (rest.harnesses.length + rest.modules.length + rest.retired.length > 0) outs.push(runKitRemove(ctx, kit, rest));
  for (const id of externals) outs.push(await removeExternal(ctx, kit, id));
  return merge(outs, "remove");
}
