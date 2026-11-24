/**
 * 읽기 명령(설계 06 §3.15): status · sessions · quality · flow gates(skills · usage · history 는 skills.ts). --json 은 같은 REST 경로의 data 와 같다.
 */
import fs from "node:fs";
import path from "node:path";
import { GATE_FLOOR } from "../../../dashboard/src/project";
import { machineSessions, Projects, projectsOverview, readRegistry } from "../../../dashboard/src/projects";
import { bool, str } from "../cli/args";
import type { CommandResult, Ctx } from "../cli/context";
import { CliError, EXIT, usageError } from "../core/errors";
import { formatJson } from "../core/json";
import { homeOf, jsonLines, openProject, run } from "./api-call";
import { dashboardDeps } from "./dashboard-deps";

function registryProjects(ctx: Ctx): Projects {
  const home = homeOf(ctx);
  return new Projects(() => readRegistry(home, ctx.io.env), { env: ctx.io.env, home, readOnly: true, multi: true, deps: dashboardDeps() });
}

function overviewLines(d: Record<string, unknown>): string[] {
  const todo = (d.todo as { rank: number; title: string; reason: string }[]) ?? [];
  const stages = (d.stages as Record<string, number>) ?? {};
  const more = (d.more as Record<string, number>) ?? {};
  return [
    `처리할 일 ${String(d.total ?? todo.length)}건`,
    ...todo.map((t) => `  [${t.rank}] ${t.title} — ${t.reason}`),
    ...(Object.keys(more).length ? [`  더: ${Object.entries(more).map(([r, n]) => `rank ${r} ${n}건`).join(" · ")}`] : []),
    `단계: ${Object.entries(stages).map(([k, n]) => `${k} ${n}`).join(" · ") || "이슈 없음"}`,
  ];
}

function issueLines(d: Record<string, unknown>): string[] {
  const list = (d.issues as { key: string; name: string; stage: string; source: string; area: string | null }[]) ?? [];
  return list.length ? list.map((i) => `${i.key.padEnd(12)} ${i.stage.padEnd(13)} ${(i.area ?? "").padEnd(12)} ${i.source.padEnd(8)} ${i.name}`) : ["이슈 없음"];
}

export async function runStatus(ctx: Ctx): Promise<CommandResult> {
  const v = ctx.values;
  if (bool(v, "all")) {
    const data = await projectsOverview(registryProjects(ctx));
    const rows = data.projects as { name: string; state: string; total?: number; error?: string }[];
    return { code: EXIT.OK, data, lines: rows.length ? rows.map((r) => `${r.name.padEnd(24)} ${r.state === "ok" ? `처리할 일 ${String(r.total ?? 0)}건` : (r.error ?? r.state)}`) : ["등록한 프로젝트가 없다 — npx harness-kit projects add <폴더>"] };
  }
  if (bool(v, "ops")) return run(ctx, "GET", "/ops", {}, jsonLines);
  if (bool(v, "session")) return run(ctx, "GET", "/session", {}, jsonLines);
  if (str(v, "flow") !== undefined && bool(v, "burn")) return run(ctx, "GET", `/intents/${encodeURIComponent(str(v, "flow") as string)}/burn`, { query: str(v, "days") ? { days: str(v, "days") as string } : {} }, jsonLines);
  if (str(v, "flow") !== undefined) return run(ctx, "GET", "/flow", { query: { intent: str(v, "flow") as string } }, jsonLines);
  if (str(v, "doc") !== undefined) return run(ctx, "GET", "/docs", { query: { path: str(v, "doc") as string } }, (d) => [String(d.markdown ?? "")]);
  if (bool(v, "verify")) return run(ctx, "GET", "/verify", { query: str(v, "issue") ? { issue: str(v, "issue") as string } : {} }, jsonLines);
  if (bool(v, "worktrees")) return run(ctx, "GET", "/worktrees", {}, jsonLines);
  if (bool(v, "harness")) return run(ctx, "GET", "/harness", {}, jsonLines);
  if (bool(v, "issues")) {
    const query: Record<string, string> = {};
    for (const k of ["area", "stage", "intent"]) if (str(v, k)) query[k] = str(v, k) as string;
    return run(ctx, "GET", "/issues", { query }, issueLines);
  }
  if (str(v, "issue") !== undefined) return run(ctx, "GET", `/issues/${encodeURIComponent(str(v, "issue") as string)}`, {}, jsonLines);
  if (bool(v, "intents")) return run(ctx, "GET", "/intents", {}, jsonLines);
  if (str(v, "intent") !== undefined && str(v, "gate") !== undefined) return run(ctx, "GET", `/intents/${encodeURIComponent(str(v, "intent") as string)}/gates`, { query: { gate: str(v, "gate") as string } }, jsonLines);
  if (str(v, "intent") !== undefined) return run(ctx, "GET", `/intents/${encodeURIComponent(str(v, "intent") as string)}`, {}, jsonLines);
  return run(ctx, "GET", "/overview", {}, overviewLines);
}

export async function runSessions(ctx: Ctx): Promise<CommandResult> {
  if (bool(ctx.values, "machine")) {
    const p = await openProject(ctx).catch(() => null);
    const list = (await registryProjects(ctx).list()).map((s) => s.project).filter((x): x is NonNullable<typeof x> => x !== null);
    if (p && !list.some((x) => x.id === p.id)) list.unshift(p);
    const data = await machineSessions(list);
    return { code: EXIT.OK, data, lines: jsonLines(data) };
  }
  return run(ctx, "GET", "/sessions", {}, (d) => {
    const list = (d.sessions as { id: string; harness: string | null; role: string | null; issue: string | null; state: string; turn: string | null; permissionMode: string | null }[]) ?? [];
    return list.length ? list.map((s) => `${s.id.padEnd(20)} ${String(s.harness).padEnd(7)} ${String(s.role).padEnd(10)} ${String(s.issue ?? "—").padEnd(12)} ${s.state.padEnd(15)} ${String(s.turn)}${s.permissionMode === "bypassPermissions" ? " · bypassPermissions(요청이 사람 승인 없이 돈다)" : ""}`) : ["등록된 세션이 없다"];
  });
}

export async function runQuality(ctx: Ctx): Promise<CommandResult> {
  const v = ctx.values;
  if (bool(v, "findings")) {
    const query: Record<string, string> = {};
    if (str(v, "issue")) query.issue = str(v, "issue") as string;
    if (str(v, "severity")) query.severity = str(v, "severity") as string;
    if (bool(v, "new")) query.new = "1";
    return run(ctx, "GET", "/reports/findings", { query }, jsonLines);
  }
  return run(ctx, "GET", "/reports/summary", {}, jsonLines);
}

/** flow gates [--add <g> --after <g> | --remove <g>]. 바닥 넷(requirements · design · mr · done) 아래로 줄이면 exit 1(04 §3.8). */
export async function runFlow(ctx: Ctx): Promise<CommandResult> {
  const [sub] = ctx.positionals;
  if (sub !== "gates" || ctx.positionals.length > 1) throw usageError("harness-kit flow gates [--add <게이트> --after <게이트> | --remove <게이트>] [--json]");
  const add = str(ctx.values, "add");
  const remove = str(ctx.values, "remove");
  if (add === undefined && remove === undefined) return run(ctx, "GET", "/flow/gates", {}, (d) => [`게이트: ${(d.gates as string[]).join(" → ")}`, `바닥(줄일 수 없음): ${(d.floor as string[]).join(" · ")}`]);
  const p = await openProject(ctx);
  const file = path.join(p.root, ".agents/harness-kit.json");
  const meta = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const flow = (meta.flow && typeof meta.flow === "object" ? meta.flow : {}) as Record<string, unknown>;
  let gates = p.gates();
  if (remove !== undefined) {
    if (GATE_FLOOR.includes(remove)) throw new CliError(EXIT.CHECK, `${remove} 는 게이트 바닥이다(줄일 수 없다, 설계 04 §3.8)`);
    if (!gates.includes(remove)) throw new CliError(EXIT.CHECK, `${remove} 는 지금 flow.gates 에 없다`);
    gates = gates.filter((g) => g !== remove);
  } else if (add !== undefined) {
    const after = str(ctx.values, "after");
    if (gates.includes(add)) throw new CliError(EXIT.CHECK, `${add} 는 이미 flow.gates 에 있다`);
    const at = after === undefined ? gates.length : gates.indexOf(after) + 1;
    if (after !== undefined && at === 0) throw new CliError(EXIT.CHECK, `--after ${after} 가 flow.gates 에 없다`);
    gates = [...gates.slice(0, at), add, ...gates.slice(at)];
  }
  const next = { ...meta, flow: { ...flow, gates } };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, formatJson(next));
  fs.renameSync(tmp, file);
  return { code: EXIT.OK, data: { gates, floor: GATE_FLOOR, file: ".agents/harness-kit.json" }, lines: [`flow.gates: ${gates.join(" → ")}`, "팀 설정이다. MR 로 올린다"] };
}
