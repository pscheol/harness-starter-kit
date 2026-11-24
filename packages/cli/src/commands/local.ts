/**
 * `local sync | list`(설계 04 §3.6, HK-14 design §5) — 개인 층(.agents/local/)을 하네스 폴더에 배치하고 개인 lock · .git/info/exclude 에 적는다.
 * update · repair 끝에도 같은 일을 한다(개인 층이 없으면 아무것도 하지 않는다). 공유 lock 은 건드리지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { bool, str } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { EXIT, usageError } from "../core/errors";
import { FLOOR_HOOKS } from "../core/floor";
import { loadInstalled, type Installed } from "../core/installed";
import { LOCAL_DIR, planLocal, readLocalConfig, syncLocal, type LocalSyncResult } from "../core/local";
import { locateTemplates } from "../core/templates";
import { VERSION } from "../core/version";
import { HOOKS_DIR, HOOKS_REL, hookDocPaths, mergeHookDocs } from "../projection/hooks";
import { loadSpec, type ProjectionSpec } from "../projection/spec";

function sharedHookIds(target: string, spec: ProjectionSpec): string[] {
  const read = (rel: string): string | null => {
    try {
      return fs.readFileSync(path.join(target, ...rel.split("/")), "utf8");
    } catch {
      return null;
    }
  };
  const kit = read(HOOKS_REL);
  if (kit === null) return [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(path.join(target, ...HOOKS_DIR.split("/")));
  } catch {
    names = [];
  }
  const docs = [{ rel: HOOKS_REL, text: kit }, ...hookDocPaths(names).map((rel) => ({ rel, text: read(rel) ?? "" }))];
  try {
    return mergeHookDocs(docs, spec.hookMap, FLOOR_HOOKS).hooks.map((h) => h.id);
  } catch {
    return [];
  }
}

/** 개인 층이 있으면 배치하고 사람용 줄을 낸다(update · repair 끝). 없으면 null. */
export function localAfter(ctx: Ctx, target: string, inst: Installed, templatesDir: string, dryRun: boolean): { result: LocalSyncResult; lines: string[] } | null {
  if (!fs.existsSync(path.join(target, ...LOCAL_DIR.split("/")))) return null;
  const spec = loadSpec(templatesDir);
  const plan = planLocal(target, inst.meta.agents, spec, sharedHookIds(target, spec));
  const result = syncLocal(target, plan, dryRun);
  return { result, lines: localLines(result, readLocalConfig(target).ignored, ctx.quiet) };
}

function localLines(r: LocalSyncResult, ignored: string[], quiet: boolean): string[] {
  const lines = [`  개인 층: 씀 ${r.written.length} · 지움 ${r.removed.length} · 남김(고침) ${r.kept.length} · settings.local.json ${r.settings}`];
  if (!quiet) {
    lines.push(...r.written.map((p) => `    + ${p}`), ...r.removed.map((p) => `    - ${p}`), ...r.kept.map((p) => `    ↷ ${p}  (사람이 고쳤다 — 두었다)`));
    lines.push(...r.findings.map((f) => `    ${f.severity === "error" ? "✖" : f.severity === "warn" ? "⚠" : "·"} ${f.kind} ${f.path} — ${f.hint}`));
    if (ignored.length) lines.push(`    ⚠ 개인 설정에서 무시한 키: ${ignored.join(" · ")}(개인 층은 roles.<역할>.harness · git.ide 만 바꾼다)`);
  }
  return lines;
}

export function runLocal(ctx: Ctx): CommandResult {
  const [sub, ...rest] = ctx.positionals;
  if ((sub !== "sync" && sub !== "list") || rest.length) throw usageError("knots-sync local sync [--dry-run] | local list [--json]");
  const target = targetOf(ctx);
  const inst = loadInstalled(target, `local ${sub}`);
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: ctx.io.env, cliFile: ctx.io.cliFile, cwd: ctx.io.cwd, version: VERSION });
  const config = readLocalConfig(target);
  const spec = loadSpec(loc.dir);
  const plan = planLocal(target, inst.meta.agents, spec, sharedHookIds(target, spec));
  const dryRun = sub === "list" || bool(ctx.values, "dry-run");
  const result = syncLocal(target, plan, dryRun);
  const data = { command: "local", sub, target, dryRun, config: { roles: config.roles, ide: config.ide, ignored: config.ignored, error: config.error }, plan: plan.wants.map((w) => w.path), ...result };
  const lines = [
    `knots-sync local ${sub} — ${target}`,
    `  설정: ${config.present ? (config.error ? `✖ ${config.error}` : `roles ${JSON.stringify(config.roles)} · git.ide ${config.ide ?? "-"}`) : "없음(.agents/local/knots-sync.local.json)"}`,
    ...localLines(result, config.ignored, ctx.quiet),
    ...(dryRun ? ["  (쓰지 않았다)"] : []),
  ];
  const bad = plan.findings.some((f) => f.severity === "error") || result.settings === "conflict" || Boolean(config.error);
  return { code: bad ? EXIT.HUMAN : EXIT.OK, data, lines };
}
