/**
 * 작업 요청 · Unit 변경 제안 · 등록부(설계 06 §3.10 · §3.15 · §3.16 · §3.17).
 *   dispatch --to <세션 id | 키:역할 | 세션 이름> --kind … --path … [--text …] [--via socket|deeplink|queue] · dispatch list · dispatch drop <id>
 *   units propose <INT> --add-dep U-3:U-1 | --remove-dep … | --split U-2=제목1|제목2 | --merge U-1,U-2 | --order U-1,U-2 [--reason …] · units discard <INT>
 *   projects list · projects add <dir> · projects remove <이름|경로>
 * 요청은 사람이 이 명령을 부를 때만 나간다(DB-R25). 제안은 승인이 아니다(DB-R29).
 */
import fs from "node:fs";
import path from "node:path";
import { agentSession } from "../../../dashboard/src/agent";
import { ApiError } from "../../../dashboard/src/errors";
import { findIntent, readUnitsFile } from "../../../dashboard/src/flow";
import { addProject, Projects, projectsList, readRegistry, removeProject } from "../../../dashboard/src/projects";
import { resolveIntentCheckout } from "../../../dashboard/src/repo";
import { sha256 } from "../../../dashboard/src/util";
import { list, str } from "../cli/args";
import { type CommandResult, type Ctx, today } from "../cli/context";
import { CliError, EXIT, usageError } from "../core/errors";
import { failure, homeOf, jsonLines, openProject, run } from "./api-call";
import { dashboardDeps } from "./dashboard-deps";

const ISSUE_ROLE = /^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5}):([a-z][a-z0-9-]*)$/;

export async function runDispatch(ctx: Ctx): Promise<CommandResult> {
  const [sub, id, extra] = ctx.positionals;
  if (sub === "list" && !id) {
    return run(ctx, "GET", "/dispatch/queue", {}, (d) => {
      const items = (d.items as { id: string; kind: string; message: string; stale: boolean }[]) ?? [];
      return items.length ? items.map((i) => `${i.id} ${i.kind}${i.stale ? " · 24시간 넘음" : ""} — ${i.message.slice(0, 120)}`) : ["대기함이 비었다"];
    });
  }
  if (sub === "drop" && id && !extra) return run(ctx, "DELETE", `/dispatch/queue/${id}`, {}, () => [`지웠다: ${id}`]);
  if (sub !== undefined) throw usageError("knots-sync dispatch --to … --kind … --path … | dispatch list | dispatch drop <id>");
  // 받는 세션이 턴을 돌려 토큰을 쓴다 — 에이전트 세션은 보내지 않는다(사용자 결정 2026-11-24, README 원칙 10)
  const marker = (ctx.io.agentSession ?? (() => agentSession(ctx.io.env)))();
  if (marker) throw new CliError(EXIT.STATE, `에이전트 세션에서는 다른 세션에 작업 요청을 보내지 않는다(판정: ${marker}) — 받는 세션이 턴을 돌려 토큰을 쓴다`, "사람이 자기 터미널이나 관리 페이지에서 고른다");
  const to = str(ctx.values, "to");
  if (!to) throw usageError("--to <세션 id | 키:역할 | 세션 이름> 이 필요하다");
  const text = str(ctx.values, "text");
  const kind = str(ctx.values, "kind") ?? (text ? "custom" : "doc-changed");
  const m = ISSUE_ROLE.exec(to);
  const p = await openProject(ctx);
  const isSession = fs.existsSync(path.join(p.root, ".agents/state/sessions", `${to}.json`));
  const target = m ? { issue: m[1], role: m[2] } : isSession ? { sessionId: to } : { name: to };
  const via = str(ctx.values, "via");
  return run(ctx, "POST", "/dispatch", { project: p, body: { target, kind, paths: list(ctx.values, "path"), text, ...(via ? { via } : {}) } }, (d) =>
    d.method === "deeplink" ? [`deep link(새 터미널에서 Enter 는 사람이 누른다): ${String(d.url)}`] : d.method === "queue" ? [`대기함에 넣었다: ${String(d.id)} — 받는 세션의 다음 프롬프트 제출 때 보인다`] : ["세션 수신함 소켓에 보냈다(수신 확인 신호는 없다)"],
  );
}

function pair(s: string, flag: string): [string, string] {
  const m = /^(U-\d+):(U-\d+)$/.exec(s);
  if (!m) throw usageError(`${flag} 는 U-a:U-b 다: ${s}`);
  return [m[1] as string, m[2] as string];
}

export async function runUnits(ctx: Ctx): Promise<CommandResult> {
  const [sub, intent, extra] = ctx.positionals;
  if (!intent || extra || (sub !== "propose" && sub !== "discard")) throw usageError("knots-sync units propose <INT> --add-dep U-a:U-b … | units discard <INT>");
  if (sub === "discard") return run(ctx, "DELETE", `/units/proposals/${intent}`, {}, () => [`제안을 버렸다: ${intent}`]);
  const reason = str(ctx.values, "reason");
  const changes: Record<string, unknown>[] = [];
  const withReason = (c: Record<string, unknown>): Record<string, unknown> => (reason ? { ...c, reason } : c);
  for (const s of list(ctx.values, "add-dep")) {
    const [unit, dep] = pair(s, "--add-dep");
    changes.push(withReason({ op: "add-dep", unit, dependsOn: dep }));
  }
  for (const s of list(ctx.values, "remove-dep")) {
    const [unit, dep] = pair(s, "--remove-dep");
    changes.push(withReason({ op: "remove-dep", unit, dependsOn: dep }));
  }
  for (const s of list(ctx.values, "split")) {
    const m = /^(U-\d+)=(.+)$/.exec(s);
    if (!m) throw usageError(`--split 는 U-n=제목1|제목2 다: ${s}`);
    changes.push(withReason({ op: "split", unit: m[1], into: (m[2] as string).split("|").map((x) => x.trim()).filter(Boolean) }));
  }
  for (const s of list(ctx.values, "merge")) changes.push(withReason({ op: "merge", units: s.split(",").map((x) => x.trim()) }));
  const order = str(ctx.values, "order");
  if (order) changes.push(withReason({ op: "order", units: order.split(",").map((x) => x.trim()) }));
  if (!changes.length) throw usageError("바꿀 것이 없다(--add-dep · --remove-dep · --split · --merge · --order)");
  try {
    const p = await openProject(ctx);
    const co = await resolveIntentCheckout(p, intent);
    const raw = readUnitsFile(findIntent(co.root, intent).abs).raw;
    return run(ctx, "POST", "/units/proposals", { project: p, body: { intent, baseSha256: raw ? sha256(raw) : "", changes } }, (d) => [`제안을 저장했다: ${String(d.path)} (변경 ${String(d.changes)}건). units.json 은 intent 게이트 승인 때 바뀐다`]);
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}

export async function runProjects(ctx: Ctx): Promise<CommandResult> {
  const [sub, arg, extra] = ctx.positionals;
  const home = homeOf(ctx);
  try {
    if ((sub === undefined || sub === "list") && !arg) {
      const projects = new Projects(() => readRegistry(home, ctx.io.env), { env: ctx.io.env, home, readOnly: true, multi: true, deps: dashboardDeps() });
      const data = await projectsList(projects);
      const rows = data.projects as { name: string; path: string; state: string }[];
      return { code: EXIT.OK, data, lines: rows.length ? rows.map((r) => `${r.name.padEnd(24)} ${r.state === "ok" ? "" : `(${r.state}) `}${r.path}`) : ["등록한 프로젝트가 없다"] };
    }
    if (sub === "add" && arg && !extra) {
      const r = addProject(home, path.resolve(ctx.io.cwd, arg), today(ctx.io), ctx.io.env);
      return { code: EXIT.OK, data: { added: r.added, project: r.entry }, lines: [r.added ? `등록했다: ${r.entry.name} ${r.entry.path}` : `이미 있다: ${r.entry.name}`] };
    }
    if (sub === "remove" && arg && !extra) {
      const r = removeProject(home, arg, ctx.io.env);
      return { code: EXIT.OK, data: { removed: r.removed }, lines: r.removed.map((e) => `등록부에서 뺐다: ${e.name} ${e.path}`) };
    }
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
  throw usageError("knots-sync projects list | add <폴더> | remove <이름|경로>");
}

export { jsonLines };
