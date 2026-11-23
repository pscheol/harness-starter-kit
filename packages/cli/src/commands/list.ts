/** list — 메타 요약, --files 면 lock 항목(HK-8 design §7). */
import path from "node:path";
import { bool } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { CliError, EXIT } from "../core/errors";
import { LOCK_REL, readLock } from "../core/lock";
import { META_REL, readMeta } from "../core/meta";

function tally(values: string[]): Record<string, number> {
  const out = new Map<string, number>();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return Object.fromEntries(out);
}

export function runList(ctx: Ctx): CommandResult {
  const target = targetOf(ctx);
  const read = readMeta(path.join(target, META_REL));
  if (read.status === "missing") throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, "설치는 harness-kit init");
  if (read.status === "invalid") throw new CliError(EXIT.STATE, `메타를 해석하지 못했다: ${read.error}`, "harness-kit doctor 로 상태를 본다");
  const m = read.meta;
  const data: Record<string, unknown> = {
    command: "list",
    target,
    metaSchema: read.schema,
    kit: { version: m.kit.version },
    project: m.project,
    stack: m.stack,
    arch: m.arch,
    domain: m.domain,
    agents: m.agents,
    modules: m.modules,
    packs: m.packs,
    issueKey: m.issueKey,
    git: { base: m.git.base },
    installedAt: m.installedAt,
    updatedAt: m.updatedAt,
  };
  const lines = [
    `harness-kit list — ${target}`,
    `  킷 ${m.kit.version} (메타 ${read.schema}) · 설치 ${m.installedAt || "?"} · 갱신 ${m.updatedAt || "?"}`,
    `  ${m.project.name} (${m.project.slug}) · 스택 ${m.stack} · 변형 ${m.arch} · 도메인 ${m.domain || "없음"}`,
    `  하네스 ${m.agents.join(", ") || "없음"} · 모듈 ${m.modules.join(", ") || "none"} · 팩 ${m.packs.length || "none"}`,
    `  이슈 키 ${m.issueKey.source}:${m.issueKey.prefix} · base ${m.git.base}`,
  ];
  if (bool(ctx.values, "files")) {
    const lr = readLock(path.join(target, LOCK_REL));
    if (lr.status !== "ok") {
      throw new CliError(EXIT.STATE, `lock 을 읽지 못했다: ${lr.status === "missing" ? "없음" : lr.error}`, "harness-kit doctor 로 상태를 본다");
    }
    const entries = lr.lock.entries.map((e) => ({ path: e.path, op: e.op, owner: e.owner, layer: e.layer ?? null }));
    const files = { format: lr.format, total: entries.length, byOwner: tally(entries.map((e) => e.owner)), byOp: tally(entries.map((e) => e.op)), entries };
    data.files = files;
    const own = Object.entries(files.byOwner).map(([k, n]) => `${k} ${n}`).join(" · ");
    lines.push(`  파일 ${files.total} (${own}) · lock ${lr.format}`);
    if (!ctx.quiet) for (const e of entries) lines.push(`  ${`${e.owner}/${e.op}`.padEnd(10)} ${e.path}${e.layer ? `  [${e.layer}]` : ""}`);
  }
  return { code: EXIT.OK, data, lines };
}
