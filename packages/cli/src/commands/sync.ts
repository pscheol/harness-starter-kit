/** sync — 외부 도구 산출물 가져오기. 지금은 `sync aidlc`(HK-20a). `sync units` · `sync jira` 는 HK-20b(설계 10 §3.4 · §3.5). */
import type { CommandResult, Ctx } from "../cli/context";
import { usageError } from "../core/errors";
import { runSyncAidlc } from "../modules/aidlc/sync";

const LATER: Record<string, string> = {
  units: "HK-20b(multi-harness, 설계 10 §3.5)",
  jira: "HK-20b(jira-workflow, 설계 10 §3.4)",
};

export function runSync(ctx: Ctx): CommandResult {
  const [what, ...extra] = ctx.positionals;
  if (!what) throw usageError("sync: 무엇을 가져올지 없다", "harness-kit sync aidlc [--intent <폴더>] [--check]");
  if (extra.length) throw usageError(`sync: 위치 인자가 많다: ${extra.join(" ")}`);
  if (Object.hasOwn(LATER, what)) throw usageError(`'sync ${what}' 는 아직 없다 — ${LATER[what]}에서 제공한다`);
  if (what !== "aidlc") throw usageError(`sync: 모르는 대상 ${what}`, "sync aidlc");
  return runSyncAidlc(ctx);
}
