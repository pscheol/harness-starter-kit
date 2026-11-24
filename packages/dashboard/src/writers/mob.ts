/**
 * 몹 정리 세션(설계 08 §3.14 · DS-R24, HK-19 design §10). 처리는 scripts/harness/mob.py 하나다(CLI · 화면 같은 결과).
 * 회차를 닫아도 세션에 요청을 보내지 않는다 — answers-ready 는 사람이 POST /dispatch 로 고를 때만(DB-R25).
 */
import fs from "node:fs";
import path from "node:path";
import { ApiError, bad, readOnly } from "../errors";
import { findIntent } from "../flow";
import type { Project } from "../project";
import { resolveIntentCheckout } from "../repo";
import { isObj, python } from "../util";

const ACTIONS = new Set(["start", "next", "close"]);
const EMAIL = /^[^\s@,]+@[^\s@,]+$/;

export interface MobSession {
  facilitator: string;
  attendees: { email: string; group: string | null }[];
  closedAt: string | null;
}

/** 열린 몹 세션(없거나 닫혔으면 null). 답 API 가 참석자 검사에 쓴다. */
export function openMob(intentAbs: string): MobSession | null {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(intentAbs, "mob.json"), "utf8")) as Record<string, unknown>;
    if (data.schema !== "harness-kit.mob/v1" || data.closedAt) return null;
    return Array.isArray(data.attendees) ? (data as unknown as MobSession) : null;
  } catch {
    return null;
  }
}

async function runMob(p: Project, key: string, args: string[]): Promise<Record<string, unknown>> {
  const co = await resolveIntentCheckout(p, key);
  findIntent(co.root, key);
  const own = path.join(co.root, "scripts/harness/mob.py");
  const script = fs.existsSync(own) ? own : path.join(p.root, "scripts/harness/mob.py");
  const r = await python(co.root, p.env, [script, ...args, "--json"], 60_000);
  let out: Record<string, unknown>;
  try {
    out = JSON.parse(r.stdout) as Record<string, unknown>;
  } catch {
    throw new ApiError(500, "internal", `mob.py 출력이 JSON 이 아닙니다: ${(r.stderr || r.stdout).slice(0, 200)}`);
  }
  if (r.code === 3) throw new ApiError(422, "mob_refused", String(out.error ?? "몹 세션 처리를 거부했습니다"));
  if (r.code !== 0) throw new ApiError(500, "internal", String(out.error ?? "mob.py 실패"));
  return out;
}

export async function getMob(p: Project, key: string): Promise<Record<string, unknown>> {
  return runMob(p, key, ["status", key]);
}

export async function postMob(p: Project, key: string, body: unknown): Promise<Record<string, unknown>> {
  if (p.readOnly) throw readOnly();
  if (!isObj(body) || typeof body.action !== "string" || !ACTIONS.has(body.action)) throw bad("action 은 start · next · close 다");
  if (body.action !== "start") return runMob(p, key, [body.action, key]);
  const attendees = Array.isArray(body.attendees) ? body.attendees.filter((a): a is string => typeof a === "string") : [];
  if (!attendees.length || attendees.some((a) => !EMAIL.test(a))) throw bad("attendees 는 email 목록입니다");
  const timebox = typeof body.timeboxMin === "number" && Number.isInteger(body.timeboxMin) && body.timeboxMin > 0 ? body.timeboxMin : 30;
  return runMob(p, key, ["start", key, "--attendees", attendees.join(","), "--timebox", String(timebox)]);
}
