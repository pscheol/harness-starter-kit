/** init · plan(HK-8 design §5 · §7). plan = init --dry-run. */
import fs from "node:fs";
import path from "node:path";
import { bool, list, str } from "../cli/args";
import { targetOf, today, type CommandResult, type Ctx } from "../cli/context";
import { createPrompter, type Prompter } from "../cli/prompt";
import { applyPlan, type FeatureDocsResult } from "../core/apply";
import { CliError, EXIT, usageError } from "../core/errors";
import { lstatOrNull } from "../core/fsx";
import { loadLayout, stackSpecOf, type Layout } from "../core/layout";
import { LOCK_REL, serializeLock, type LockEntry } from "../core/lock";
import { buildMeta, META_REL, serializeMeta } from "../core/meta";
import { buildPlan, MANIFEST_PATH, type Plan, type PlannedOp } from "../core/plan";
import { listArchs, listStacks, resolveSelection, retiredNote, type Selection, type SelectionInput } from "../core/selection";
import { locateTemplates } from "../core/templates";
import { resolveTokens } from "../core/tokens";
import { VERSION } from "../core/version";
import { mergeEntries, needsHuman, projectionConflicts, projectionData, projectionLines } from "../projection/flow";
import { addProject, registryFile } from "../../../dashboard/src/projects";
import { addExternal } from "../modules/engine";
import { kitOf } from "./change";
import { metaFile } from "../core/legacy-names";

const TOKEN_FLAGS: Record<string, string> = {
  name: "PROJECT_NAME",
  slug: "PROJECT_SLUG",
  "package-ns": "PACKAGE_NS",
  "protected-path": "PROTECTED_PATH",
};
const ISSUE_SOURCES = ["kit", "jira"];

function tokenFlags(ctx: Ctx, layout: Layout): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of list(ctx.values, "token")) {
    const eq = raw.indexOf("=");
    if (eq <= 0) throw usageError(`--token 은 KEY=VALUE 형식이다: '${raw}'`);
    const key = raw.slice(0, eq);
    if (!layout.tokens.includes(key)) throw usageError(`모르는 토큰: ${key}`, `사용 가능: ${layout.tokens.join(" ")}`);
    out[key] = raw.slice(eq + 1);
  }
  for (const [flag, key] of Object.entries(TOKEN_FLAGS)) {
    const v = str(ctx.values, flag);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function checkSlug(slug: string): void {
  if (slug === "" || slug === "." || slug === ".." || /[/\\\0]/.test(slug)) {
    throw usageError(`PROJECT_SLUG 로 쓸 수 없는 값: '${slug}'`, "/ · \\ · . · .. 없이 폴더 이름처럼 쓴다");
  }
}

async function askMissing(p: Prompter, input: SelectionInput, layout: Layout, templatesDir: string): Promise<SelectionInput> {
  const out = { ...input };
  if (out.stack === undefined) out.stack = await p.ask(`스택 [${listStacks(templatesDir).join("/")}]`, layout.defaultStack);
  if (out.arch === undefined) {
    out.arch = await p.ask(`변형 [${listArchs(templatesDir, out.stack).join("/")}]`, stackSpecOf(layout, out.stack).defaultArch);
  }
  if (out.agents === undefined) out.agents = await p.ask(`하네스 [${layout.harnesses.join(",")}|all]`, "");
  if (out.agents === "") delete out.agents;
  if (out.modules === undefined) out.modules = await p.ask(`모듈 [${[...layout.modules, ...layout.externalModules].join(",")}|all|none] (aidlc · entire 는 이름을 줄 때만)`, "none");
  return out;
}

function opJson(o: PlannedOp): Record<string, unknown> {
  const j: Record<string, unknown> = { path: o.path, op: o.op, owner: o.owner, layer: o.layer, action: o.action, executable: o.executable };
  if (o.reason !== undefined) j.reason = o.reason;
  return j;
}

const needsAttention = (o: PlannedOp): boolean => o.action === "skip-user" || o.action === "replace";

function selectionLine(sel: Selection): string {
  const parts = [sel.stack, sel.arch, sel.domain || "도메인 없음", ...(sel.lang ? [`lang ${sel.lang}`] : [])];
  return `  선택: ${parts.join(" · ")} · 하네스 ${sel.agents.join(",")} · 모듈 ${sel.modules.join(",") || "none"}`;
}

function countsLine(plan: Plan): string {
  const c = plan.counts;
  return `  파일: 생성 ${c.create} · 교체 ${c.replace} · 같음 ${c.same} · 건너뜀(사람 파일) ${c["skip-user"]} · 하네스 제외 ${c.excludedByHarness} · 겹침 ${c.overlapped}`;
}

function opLine(o: PlannedOp): string {
  return `  ${o.action.padEnd(9)} ${o.path}  [${o.layer}]${o.reason ? `  ${o.reason}` : ""}`;
}

function docsLine(r: FeatureDocsResult): string {
  if (r.status === "built") return "  기능 문서: docs/features/ 생성";
  if (r.status === "skipped") return `  기능 문서: 건너뜀(${r.reason})`;
  return `  ⚠ 기능 문서 생성 실패 — 'python3 tools/docs/feature_docs.py build' 를 직접 실행한다 (${r.error})`;
}

interface InitOptions {
  force: boolean;
  adopt: boolean;
  issueSource: string | undefined;
  flags: Record<string, string>;
}

function readOptions(ctx: Ctx, layout: Layout): InitOptions {
  const force = bool(ctx.values, "force");
  const adopt = bool(ctx.values, "adopt");
  if (force && adopt) throw usageError("--force 와 --adopt 는 같이 쓰지 않는다", "--force 는 있는 파일을 덮고, --adopt 는 있는 파일을 모두 사람 파일로 둔다");
  const issueSource = str(ctx.values, "issue-source");
  if (issueSource !== undefined && !ISSUE_SOURCES.includes(issueSource)) {
    throw usageError(`알 수 없는 --issue-source: '${issueSource}'`, `사용 가능: ${ISSUE_SOURCES.join(" ")}`);
  }
  return { force, adopt, issueSource, flags: tokenFlags(ctx, layout) };
}

/** 대상이 폴더(또는 없음)이고 아직 설치되지 않았는지 본다(R2.3). */
function assertInstallable(target: string): void {
  const st = lstatOrNull(target);
  if (st && !(st.isDirectory() || (st.isSymbolicLink() && fs.statSync(target).isDirectory()))) {
    throw new CliError(EXIT.STATE, `대상이 폴더가 아니다: ${target}`);
  }
  if (fs.existsSync(metaFile(target))) {
    throw new CliError(EXIT.STATE, `이미 설치된 리포다: ${metaFile(target)}`, "킷 갱신은 knots-sync update, 하네스 · 모듈 추가는 knots-sync add 다. 지금 상태는 knots-sync doctor");
  }
}

/** --modules 에서 외부 도구 모듈 이름을 따로 뗀다. all 은 킷 모듈만이다. */
function splitExternal(layout: Layout, input: SelectionInput): { input: SelectionInput; externals: string[] } {
  if (input.modules === undefined) return { input, externals: [] };
  const words = input.modules.split(/[\s,]+/).filter(Boolean);
  const externals = words.filter((w, i) => layout.externalModules.includes(w) && words.indexOf(w) === i);
  if (externals.length === 0) return { input, externals };
  const rest = words.filter((w) => !layout.externalModules.includes(w));
  return { input: { ...input, modules: rest.length ? rest.join(",") : "none" }, externals };
}

function selectionInput(ctx: Ctx): SelectionInput {
  const keys = ["stack", "arch", "domain", "lang", "agents", "modules"] as const;
  return Object.fromEntries(keys.map((k) => [k, str(ctx.values, k)])) as SelectionInput;
}

function planData(command: string, target: string, templates: string, sel: Selection, tokens: Record<string, string>, plan: Plan, shown: PlannedOp[]): Record<string, unknown> {
  return {
    command,
    target,
    templates,
    dryRun: command === "plan",
    selection: { stack: sel.stack, arch: sel.arch, domain: sel.domain, lang: sel.lang, agents: sel.agents, agentsOrigin: sel.agentsOrigin, modules: sel.modules },
    tokens,
    counts: plan.counts,
    ops: shown.map(opJson),
    overlaps: plan.overlaps,
    generated: plan.generated.map((g) => ({ path: g.path, action: g.action })),
    state: [META_REL, LOCK_REL],
  };
}

function lockText(plan: Plan, source: string): string {
  const copies: LockEntry[] = plan.ops.map((o) =>
    o.owner === "kit"
      ? { path: o.path, op: "copy", owner: "kit", sha256: o.sha256, layer: o.layer }
      : { path: o.path, op: "copy", owner: "user", sha256: null, layer: o.layer },
  );
  return serializeLock({ schema: "knots-sync.lock/v2", kit: { version: VERSION, source }, packs: [], entries: mergeEntries(copies, plan.projection) });
}

const STATE_LINE = `  상태 파일: ${META_REL} · ${LOCK_REL} · ${MANIFEST_PATH}`;

/**
 * 설치가 끝나면 이 컴퓨터 등록부(~/.config/knots-sync/projects.json)에 리포를 더한다(사용자 결정 2026-11-24, 06 §3.17).
 * `--no-register` 면 하지 않는다. 등록부 위치를 정할 HOME · KNOTS_SYNC_CONFIG_DIR 이 없으면 하지 않는다(실제 홈 추측 금지).
 * 실패해도 설치는 성공이다 — 사람이 `knots-sync projects add .` 로 다시 한다.
 */
function registerAfterInit(ctx: Ctx, target: string): { status: "added" | "exists" | "skipped" | "failed"; reason?: string; name?: string; file?: string } {
  if (bool(ctx.values, "no-register")) return { status: "skipped", reason: "--no-register" };
  const env = ctx.io.env;
  const override = env.KNOTS_SYNC_CONFIG_DIR;
  const home = env.HOME ?? "";
  if (!(override && path.isAbsolute(override)) && !home) return { status: "skipped", reason: "HOME 이 없다" };
  try {
    const r = addProject(home, target, today(ctx.io), env);
    return { status: r.added ? "added" : "exists", name: r.entry.name, file: registryFile(home, env) };
  } catch (err) {
    return { status: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}

function registryLine(r: ReturnType<typeof registerAfterInit>): string {
  if (r.status === "added") return `  등록부: ${r.name} 를 더했다(${r.file}) — 관리 페이지 --all 에 보인다. 빼려면 knots-sync projects remove ${r.name}`;
  if (r.status === "exists") return `  등록부: 이미 있다(${r.name})`;
  if (r.status === "failed") return `  ⚠ 등록부에 더하지 못했다: ${r.reason} — knots-sync projects add . 로 다시 한다`;
  return `  등록부: 더하지 않았다(${r.reason})`;
}

export async function runInit(ctx: Ctx): Promise<CommandResult> {
  const command = ctx.command === "plan" || bool(ctx.values, "dry-run") ? "plan" : "init";
  const { io } = ctx;
  const target = targetOf(ctx);
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: io.env, cliFile: io.cliFile, cwd: io.cwd, version: VERSION });
  const layout = loadLayout(loc.dir);
  const opts = readOptions(ctx, layout);
  assertInstallable(target);

  const interactive = io.isTTY && !bool(ctx.values, "yes") && !ctx.json && io.stdin !== undefined;
  const prompter = interactive ? createPrompter(io.stdin as NodeJS.ReadableStream, io.stderr) : null;
  try {
    const asked = prompter ? await askMissing(prompter, selectionInput(ctx), layout, loc.dir) : selectionInput(ctx);
    // 외부 도구 모듈(aidlc · entire)은 init 이 끝난 뒤 모듈 엔진이 켠다(설계 10 §3.1). all 에는 들어가지 않는다.
    const { input, externals } = splitExternal(layout, asked);
    const selection = resolveSelection(layout, loc.dir, input, { target, env: io.env });
    const tokens = resolveTokens(layout, selection, { flags: opts.flags, env: io.env, targetBasename: path.basename(target) });
    checkSlug(tokens.PROJECT_SLUG ?? "");
    const plan = buildPlan({ layout, templatesDir: loc.dir, target, selection, tokens, mode: { force: opts.force, adopt: opts.adopt } });
    const shown = command === "plan" && !ctx.quiet ? plan.ops : plan.ops.filter(needsAttention);
    const data = planData(command, target, loc.dir, selection, tokens, plan, shown);
    const projection = projectionData(plan.projection, plan.projectionFindings, command === "plan");
    if (projection) data.projection = projection;
    const human = needsHuman(plan.projection, plan.projectionFindings);
    const conflicts = projectionConflicts(plan.projection);
    if (conflicts.length) data.conflicts = conflicts;
    const lines = [`knots-sync ${command} — ${target}`, selectionLine(selection), ...(selection.retiredModules ?? []).map((m) => retiredNote(m, "flag"))];
    if (selection.retiredModules) data.retiredModules = selection.retiredModules;
    const projectionShown = projectionLines(plan.projection, plan.projectionFindings, ctx.quiet, command === "plan" && !ctx.quiet, new Set(["create"]));
    if (command === "plan") {
      lines.push(...shown.map(opLine), countsLine(plan), ...projectionShown, STATE_LINE);
      if (externals.length) lines.push(`  외부 도구 모듈 ${externals.join(", ")}: init 뒤 add 단계로 켠다(도구 확인 · 설치 안내 · 외부 명령 · 측정 — knots-sync add ${externals.join(" ")} --dry-run 으로 계획을 본다)`);
      lines.push("  (plan — 쓰지 않았다)");
      data.externalModules = externals;
      return { code: EXIT.OK, data, lines };
    }
    if (prompter) {
      io.stderr(`${countsLine(plan)}\n`);
      if (!(await prompter.confirm("진행할까?"))) throw new CliError(EXIT.ABORT, "중단했다(아무것도 쓰지 않았다)");
    }
    const meta = buildMeta({ version: VERSION, selection, tokens, issue: { source: opts.issueSource, prefix: str(ctx.values, "issue-prefix") }, base: str(ctx.values, "base"), today: today(io) });
    const result = applyPlan({ plan, metaText: serializeMeta(meta), lockText: lockText(plan, loc.source), env: io.env });
    data.featureDocs = result.featureDocs;
    const registry = registerAfterInit(ctx, target);
    data.registry = registry;
    lines.push(countsLine(plan), ...shown.map(opLine), ...projectionShown, STATE_LINE, docsLine(result.featureDocs), registryLine(registry));
    let code: number = human ? EXIT.HUMAN : EXIT.OK;
    if (externals.length) {
      data.externalModules = externals;
      const kit = kitOf(ctx);
      const results: Record<string, unknown>[] = [];
      for (const id of externals) {
        try {
          const o = await addExternal({ ...ctx, command: "add", values: { ...ctx.values, cwd: target }, positionals: [id] }, kit, id);
          lines.push(...o.lines.slice(1));
          results.push(o.data);
          if (o.code !== EXIT.OK) code = Math.max(code, o.code);
        } catch (err) {
          if (!(err instanceof CliError)) throw err;
          lines.push(`  ✖ ${id}: ${err.message}`, ...(err.hint ? err.hint.split("\n").map((h) => `    ${h}`) : []), `  init 은 끝났다. 모듈은 도구를 준비한 뒤 knots-sync add ${id} 로 켠다`);
          results.push({ module: id, error: { code: err.code, message: err.message } });
          code = Math.max(code, err.code);
        }
      }
      data.modulesResult = results;
    }
    lines.push("  다음: knots-sync doctor");
    return { code, data, lines };
  } finally {
    prompter?.close();
  }
}
