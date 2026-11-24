/**
 * dashboard — 관리 페이지 서버(설계 06 §3.1 · §3.12 · §3.17, HK-17 design §2).
 *   knots-sync dashboard [--port <n>] [--open] [--read-only] [--export <폴더>] [--all | --root <dir> | --workspace <file>]
 * 같은 리포에 서버가 있으면 그 주소를 내고 끝낸다(DB-R23). 주소는 표준 출력, 승인 PIN 은 표준 오류에만 낸다.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { ExportError, ExportLeakError, exportStatic } from "../../../dashboard/src/export";
import type { ProjectsMode } from "../../../dashboard/src/projects";
import { findRunning, StartError, startServer } from "../../../dashboard/src/server";
import { bool, str } from "../cli/args";
import { type CommandResult, type Ctx, targetOf } from "../cli/context";
import { CliError, EXIT, usageError } from "../core/errors";
import { homeOf } from "./api-call";
import { dashboardDeps } from "./dashboard-deps";

export { dashboardDeps } from "./dashboard-deps";

function modeOf(ctx: Ctx): ProjectsMode {
  const v = ctx.values;
  const all = bool(v, "all");
  const root = str(v, "root");
  const ws = str(v, "workspace");
  if ([all, root !== undefined, ws !== undefined].filter(Boolean).length > 1) throw usageError("--all · --root · --workspace 는 하나만 준다");
  if (all) return { kind: "all" };
  if (root !== undefined) return { kind: "root", dir: path.resolve(ctx.io.cwd, root) };
  if (ws !== undefined) return { kind: "workspace", file: path.resolve(ctx.io.cwd, ws) };
  return { kind: "single" };
}

function openBrowser(url: string): void {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    spawn(cmd as string, args as string[], { stdio: "ignore", detached: true }).unref();
  } catch {
    // 브라우저를 못 열면 주소를 손으로 연다
  }
}

async function runExport(ctx: Ctx, out: string): Promise<CommandResult> {
  try {
    const r = await exportStatic({ cwd: targetOf(ctx), env: ctx.io.env, out: path.resolve(ctx.io.cwd, out) });
    return { code: EXIT.OK, data: { command: "dashboard", export: r.out, files: r.files }, lines: [`정적 내보내기: ${r.out} (파일 ${r.files.length}개, 스크립트 · 버튼 없음)`] };
  } catch (err) {
    if (err instanceof ExportLeakError) throw new CliError(EXIT.CHECK, `${err.message} — 출력 폴더를 지웠다`, err.hits.slice(0, 5).join(" · "));
    if (err instanceof ExportError) throw new CliError(EXIT.USAGE, err.message);
    throw new CliError(EXIT.STATE, err instanceof Error ? err.message : String(err), "npx knots-sync doctor");
  }
}

export async function runDashboard(ctx: Ctx): Promise<CommandResult> {
  const v = ctx.values;
  const out = str(v, "export");
  if (out !== undefined) return runExport(ctx, out);
  const mode = modeOf(ctx);
  const agent = ctx.io.agentSession;
  if (mode.kind === "single") {
    const running = await findRunning(targetOf(ctx), ctx.io.env, agent);
    if (running) return { code: EXIT.OK, data: { command: "dashboard", url: running.url, running: true }, lines: [running.url] };
  }
  const portText = str(v, "port");
  const port = portText === undefined ? 0 : Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw usageError(`--port 는 0~65535 다: ${portText ?? ""}`);
  let srv;
  try {
    srv = await startServer({ cwd: targetOf(ctx), env: ctx.io.env, port, readOnly: bool(v, "read-only"), mode, deps: dashboardDeps(), home: homeOf(ctx), ...(agent ? { agentSession: agent } : {}), stderr: ctx.io.stderr });
  } catch (err) {
    if (err instanceof StartError) throw new CliError(err.exitCode, err.message, err.hint);
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") throw new CliError(EXIT.ENV, `포트를 쓸 수 없다: ${port}`);
    throw err;
  }
  ctx.io.stdout(`${srv.url}\n`);
  if (srv.pin) ctx.io.stderr(`승인 PIN: ${srv.pin} — 승인 · 질문 답 · 리뷰 판단 때 넣는다. 이 터미널에만 보인다(파일에 쓰지 않는다)\n`);
  else ctx.io.stderr(`읽기 전용(${srv.readOnlyReason ?? "--read-only"}) — 저장 · 승인 · 답 · 리뷰 판단 · 작업 요청을 끈다\n`);
  if (mode.kind !== "single") ctx.io.stderr("여러 프로젝트 모드 — 토큰 파일 · dashboard.json 을 쓰지 않는다. 토큰은 위 주소에만 있다\n");
  if (bool(v, "open")) openBrowser(srv.url);
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  await srv.close();
  return { code: EXIT.OK, data: { command: "dashboard", closed: true }, lines: ["관리 페이지를 닫았다(토큰 · dashboard.json 을 지웠다)"] };
}
