/**
 * harness-kit mob(설계 08 §3.14 · DS-R24, HK-19 design §10) — 관리 페이지 GET/POST /intents/{key}/mob 와 같은 처리(mob.py).
 * 진행자는 사람이다: 에이전트 세션이면 쓰기(start · next · close)를 거부한다. 회차를 닫아도 세션에 요청을 보내지 않는다.
 */
import type { CommandResult, Ctx } from "../cli/context";
import { usageError } from "../core/errors";
import { agentSession } from "../../../dashboard/src/agent";
import { ApiError } from "../../../dashboard/src/errors";
import { failure, jsonLines, run } from "./api-call";

const USAGE = "harness-kit mob start <INT> --attendees a@x,b@y [--timebox 30] | mob next <INT> | mob close <INT> | mob status <INT>";

function lines(d: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (d.action === "start") out.push(`✔ 몹 세션을 열었다: ${String(d.path)}`);
  else if (d.action === "next" || d.action === "close") {
    out.push(`✔ 회차 ${String(d.ended)} 을 닫았다${d.action === "close" ? " · 세션을 닫았다" : ""}`);
    out.push(`설계 세션에 답 반영을 요청하려면 사람이 고른다: ${String(d.suggest)}`);
  } else return jsonLines(d);
  for (const w of (d.warnings as string[] | undefined) ?? []) out.push(`⚠ ${w}`);
  return out;
}

export async function runMob(ctx: Ctx): Promise<CommandResult> {
  const [sub, key, extra] = ctx.positionals;
  if (!sub || !key || extra) throw usageError(USAGE);
  if (sub === "status") return run(ctx, "GET", `/intents/${encodeURIComponent(key)}/mob`, {}, jsonLines);
  const action = sub === "end" ? "close" : sub;
  if (!["start", "next", "close"].includes(action)) throw usageError(USAGE);
  const marker = (ctx.io.agentSession ?? (() => agentSession(ctx.io.env)))();
  if (marker) return failure(ctx, new ApiError(403, "read_only", `에이전트 세션에서는 몹 세션을 열고 닫지 않는다(판정: ${marker}). 진행자가 자기 터미널에서 실행한다`));
  const body: Record<string, unknown> = { action };
  if (action === "start") {
    const attendees = typeof ctx.values.attendees === "string" ? ctx.values.attendees.split(",").map((a) => a.trim()).filter(Boolean) : [];
    if (!attendees.length) throw usageError("--attendees a@x,b@y 가 필요하다");
    body.attendees = attendees;
    if (typeof ctx.values.timebox === "string") {
      const n = Number(ctx.values.timebox);
      if (!Number.isInteger(n) || n <= 0) throw usageError("--timebox 는 양의 정수(분)다");
      body.timeboxMin = n;
    }
  }
  return run(ctx, "POST", `/intents/${encodeURIComponent(key)}/mob`, { body }, lines);
}
