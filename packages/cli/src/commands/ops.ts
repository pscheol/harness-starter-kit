/**
 * 배포 · 운영 명령(설계 14, HK-21): deploy · ops · metrics · rules. 판정 · 계산은 설치본의 scripts/harness/*.py 하나다
 * (Node 없는 CI 와 같은 결과). 이 파일은 그 스크립트를 부르고 종료 코드 · --json 을 옮길 뿐이다. 모델을 부르지 않는다.
 * 규칙 승격 · 거절은 사람 터미널에서만 한다(에이전트 세션 · TTY 아님은 exit 3).
 */
import fs from "node:fs";
import path from "node:path";
import { python } from "../../../dashboard/src/util";
import { bool, str } from "../cli/args";
import type { CommandResult, Ctx } from "../cli/context";
import { targetOf } from "../cli/context";
import { CliError, EXIT, usageError } from "../core/errors";
import { failure, humanTerminal } from "./api-call";

const SCRIPTS_HINT = "npx harness-kit update 로 킷을 올린다(scripts/harness 에 배포 · 운영 스크립트가 있어야 한다)";

interface Out {
  code: number;
  stdout: string;
  stderr: string;
}

async function script(ctx: Ctx, name: string, args: string[]): Promise<Out> {
  const root = targetOf(ctx);
  const file = path.join(root, "scripts/harness", name);
  if (!fs.existsSync(file)) throw new CliError(EXIT.STATE, `scripts/harness/${name} 가 없다`, SCRIPTS_HINT);
  return python(root, ctx.io.env, [file, "--root", root, ...args], 300_000);
}

/** 스크립트 종료 코드를 CLI 코드로(0 · 1 · 2 · 3 은 그대로, 그 밖은 1). */
function codeOf(out: Out): number {
  return [0, 1, 2, 3, 4].includes(out.code) ? out.code : EXIT.CHECK;
}

function emit(ctx: Ctx, out: Out): CommandResult {
  const text = out.stdout.trimEnd();
  if (ctx.json) {
    try {
      const data = JSON.parse(text) as unknown;
      if (data && typeof data === "object" && !Array.isArray(data)) return { code: codeOf(out), data: data as Record<string, unknown>, lines: [] };
      return { code: codeOf(out), data: { items: data }, lines: [] };
    } catch {
      return { code: codeOf(out), data: { ok: out.code === 0, message: text, ...(out.stderr.trim() ? { error: out.stderr.trim() } : {}) }, lines: [] };
    }
  }
  if (out.stderr.trim()) ctx.io.stderr(`${out.stderr.trimEnd()}\n`);
  return { code: codeOf(out), data: {}, lines: text ? text.split("\n") : [] };
}

const flag = (ctx: Ctx, key: string, name = key): string[] => {
  const v = str(ctx.values, key);
  return v === undefined ? [] : [`--${name}`, v];
};

export async function runDeploy(ctx: Ctx): Promise<CommandResult> {
  const [sub, ...rest] = ctx.positionals;
  const json = ctx.json ? ["--json"] : [];
  if (sub === "plan") {
    if (!rest.length) throw usageError("harness-kit deploy plan <이슈 · Intent 키…> [--env production] [--tag v2.3.0]");
    return emit(ctx, await script(ctx, "deploy.py", ["plan", ...rest, ...flag(ctx, "env"), ...flag(ctx, "tag"), ...json]));
  }
  if (sub === "check") {
    if (rest.length !== 1) throw usageError("harness-kit deploy check <배포 기록> [--require-approved] [--waive <사유>]");
    return emit(ctx, await script(ctx, "deploy.py", ["check", rest[0] as string, ...(bool(ctx.values, "require-approved") ? ["--require-approved"] : []), ...flag(ctx, "waive"), ...json]));
  }
  if (sub === "record") {
    const source = str(ctx.values, "from-ci");
    if (rest.length !== 1 || !source) throw usageError("harness-kit deploy record <배포 기록> --from-ci <파이프라인 URL | 산출물 파일 · 폴더>");
    return emit(ctx, await script(ctx, "deploy.py", ["record", rest[0] as string, "--from-ci", source, ...json]));
  }
  if (sub === "run") {
    const env = str(ctx.values, "env");
    if (!env) throw usageError("harness-kit deploy run --env <이름> [--record <배포 기록>] [--rollback-test] [--to-sha <sha>]");
    return emit(ctx, await script(ctx, "deploy.py", ["run", "--env", env, ...flag(ctx, "record"), ...(bool(ctx.values, "rollback-test") ? ["--rollback-test"] : []), ...flag(ctx, "to-sha"), ...json]));
  }
  if (sub === "result") {
    const source = str(ctx.values, "from");
    if (rest.length !== 1 || !source) throw usageError("harness-kit deploy result <배포 기록> --from <deploy-result.json>");
    return emit(ctx, await script(ctx, "deploy.py", ["result", rest[0] as string, "--from", source]));
  }
  throw usageError("harness-kit deploy plan | check | record | run | result  (승인은 harness-kit approve deploy:<기록> --gate deploy)");
}

export async function runOps(ctx: Ctx): Promise<CommandResult> {
  const [sub, ...rest] = ctx.positionals;
  if (sub === "new" && !rest.length) {
    const topic = str(ctx.values, "topic");
    if (!topic) throw usageError("harness-kit ops new --topic <영문-kebab 2~5단어> [--from YYYY-MM-DD] [--to YYYY-MM-DD]");
    return emit(ctx, await script(ctx, "ops_records.py", ["new", "--topic", topic, ...flag(ctx, "from"), ...flag(ctx, "to"), ...(ctx.json ? ["--json"] : [])]));
  }
  if (sub === "check" && !rest.length) return emit(ctx, await script(ctx, "ops_records.py", ["check"]));
  throw usageError("harness-kit ops new --topic <주제> [--from --to] | ops check   (읽기: harness-kit status --ops [--json])");
}

export async function runMetrics(ctx: Ctx): Promise<CommandResult> {
  if (ctx.positionals.length) throw usageError("harness-kit metrics [--baseline [--force] [--adopted-at <날짜|커밋>]] [--verify-baseline] [--from YYYY-MM-DD --to YYYY-MM-DD] [--fill <운영 기록>]");
  const args = [
    ...(bool(ctx.values, "baseline") ? ["--baseline"] : []),
    ...(bool(ctx.values, "force") ? ["--force"] : []),
    ...(bool(ctx.values, "verify-baseline") ? ["--verify-baseline"] : []),
    ...flag(ctx, "from", "from"),
    ...flag(ctx, "to"),
    ...flag(ctx, "fill"),
    ...flag(ctx, "adopted-at"),
    ...(ctx.json ? ["--json"] : []),
  ];
  return emit(ctx, await script(ctx, "delivery_metrics.py", args));
}

export async function runRules(ctx: Ctx): Promise<CommandResult> {
  const [sub, id, extra] = ctx.positionals;
  const json = ctx.json ? ["--json"] : [];
  if (sub === "candidates" && !id) return emit(ctx, await script(ctx, "rule_candidates.py", ["candidates", ...flag(ctx, "since"), ...json]));
  if (sub === "list" && !id) return emit(ctx, await script(ctx, "rule_candidates.py", ["list", ...json]));
  if ((sub === "promote" || sub === "reject") && id && !extra) {
    const reason = str(ctx.values, "reason");
    if (sub === "reject" && !reason) throw usageError('harness-kit rules reject RC-<n> --reason "<이유>"');
    const refused = humanTerminal(ctx);
    if (refused) return failure(ctx, refused);
    return emit(ctx, await script(ctx, "rule_candidates.py", [sub, id, ...(sub === "reject" ? ["--reason", reason as string] : [])]));
  }
  throw usageError("harness-kit rules candidates [--since 30d] | list | promote RC-<n> | reject RC-<n> --reason …");
}
