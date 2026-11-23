/**
 * 화면 없이 쓰기(설계 06 §3.15): CLI 명령이 관리 페이지와 같은 처리 함수(packages/dashboard/src/api.ts)를 HTTP 없이 부른다.
 * --json 은 API 의 data(실패면 API 의 {ok: false, error})를 그대로 낸다. 종료 코드: 400 · 501 → 2, read_only → 3, 그 밖의 4xx · 500 → 1.
 */
import os from "node:os";
import { agentSession } from "../../../dashboard/src/agent";
import { callApi, type Route } from "../../../dashboard/src/api";
import { ApiError } from "../../../dashboard/src/errors";
import { Project } from "../../../dashboard/src/project";
import type { Projects } from "../../../dashboard/src/projects";
import type { CommandResult, Ctx } from "../cli/context";
import { targetOf } from "../cli/context";
import { CliError, EXIT } from "../core/errors";
import { dashboardDeps } from "./dashboard-deps";

export function homeOf(ctx: Ctx): string {
  return ctx.io.env.HOME ?? os.homedir();
}

export async function openProject(ctx: Ctx): Promise<Project> {
  try {
    return await Project.open(targetOf(ctx), { env: ctx.io.env, home: homeOf(ctx), readOnly: false, multi: false, deps: dashboardDeps() });
  } catch (err) {
    throw new CliError(EXIT.STATE, err instanceof Error ? err.message : String(err), "npx harness-kit doctor");
  }
}

export function exitOf(e: ApiError): number {
  if (e.code === "read_only") return EXIT.STATE;
  if (e.status === 400 || e.status === 501) return EXIT.USAGE;
  return EXIT.CHECK;
}

export function failure(ctx: Ctx, e: ApiError): CommandResult {
  if (!ctx.json) {
    ctx.io.stderr(`✖ ${e.message}\n`);
    const reasons = e.details && Array.isArray(e.details.reasons) ? (e.details.reasons as string[]) : [];
    for (const r of reasons.slice(0, 5)) ctx.io.stderr(`  - ${r}\n`);
  }
  return { code: exitOf(e), data: e.body() as unknown as Record<string, unknown>, lines: [] };
}

/** 에이전트 세션 · TTY 아님이면 read_only(승인 · 답 · 리뷰 판단은 사람 터미널에서만, 06 §3.15). */
export function humanTerminal(ctx: Ctx): ApiError | null {
  const marker = (ctx.io.agentSession ?? (() => agentSession(ctx.io.env)))();
  if (marker) return new ApiError(403, "read_only", `에이전트 세션에서는 할 수 없다(판정: ${marker}). 사람이 자기 터미널에서 실행한다`);
  if (!ctx.io.isTTY) return new ApiError(403, "read_only", "TTY 가 아니다 — 사람이 터미널에서 직접 실행한다");
  return null;
}

export async function run(
  ctx: Ctx,
  method: Route["method"],
  path: string,
  opts: { query?: Record<string, string>; body?: unknown; projects?: Projects; mode?: "single" | "multi"; project?: Project },
  human: (data: Record<string, unknown>) => string[],
): Promise<CommandResult> {
  try {
    const p = opts.project ?? (await openProject(ctx));
    const r = await callApi(p, method, path, { ...(opts.query ? { query: opts.query } : {}), body: opts.body, via: "terminal", mode: opts.mode ?? "single", ...(opts.projects ? { projects: opts.projects } : {}) });
    const data = r.data as Record<string, unknown>;
    return { code: EXIT.OK, data, lines: human(data) };
  } catch (err) {
    if (err instanceof ApiError) return failure(ctx, err);
    throw err;
  }
}

/** 한 줄 요약용: JSON 을 들여 쓴 줄(사람용 표가 없는 명령). */
export function jsonLines(data: unknown): string[] {
  return JSON.stringify(data, null, 2).split("\n");
}

/** 사람이 이슈 키를 입력해 확인한다(approve.py 와 같다). */
export async function confirmKey(ctx: Ctx, key: string, summary: string[]): Promise<boolean> {
  for (const line of summary) ctx.io.stderr(`${line}\n`);
  ctx.io.stderr("확인하려면 이슈 키를 입력한다: ");
  const typed = await readLine(ctx.io.stdin);
  return typed.trim() === key;
}

function readLine(stream: NodeJS.ReadableStream | undefined): Promise<string> {
  if (!stream) return Promise.resolve("");
  return new Promise((resolve) => {
    let buf = "";
    const onData = (d: Buffer | string): void => {
      buf += d.toString();
      const i = buf.indexOf("\n");
      if (i >= 0) {
        cleanup();
        resolve(buf.slice(0, i));
      }
    };
    const onEnd = (): void => {
      cleanup();
      resolve(buf);
    };
    const cleanup = (): void => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.pause?.();
    };
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.resume?.();
  });
}
