/** sync — 외부 · 하위 산출물 맞추기. `sync aidlc`(HK-20a) · `sync jira`(설계 10 §3.4) · `sync units`(설계 10 §3.5). */
import type { CommandResult, Ctx } from "../cli/context";
import { usageError } from "../core/errors";
import { runSyncAidlc } from "../modules/aidlc/sync";
import { runSyncJira } from "../modules/jira/sync";
import { runSyncUnits } from "../modules/units/sync";

export async function runSync(ctx: Ctx): Promise<CommandResult> {
  const [what, ...extra] = ctx.positionals;
  if (!what) throw usageError("sync: 무엇을 맞출지 없다", "harness-kit sync aidlc | jira | units");
  if (extra.length) throw usageError(`sync: 위치 인자가 많다: ${extra.join(" ")}`);
  if (what === "aidlc") return runSyncAidlc(ctx);
  if (what === "jira") return runSyncJira(ctx);
  if (what === "units") return runSyncUnits(ctx);
  throw usageError(`sync: 모르는 대상 ${what}`, "sync aidlc | jira | units");
}
