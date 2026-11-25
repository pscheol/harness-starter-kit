/**
 * `knots-sync sync units [--check] [--unit <id>] [--adopt]`(설계 10 §3.5, MD-R16).
 * tools/harness/sync.py 와 같은 계획 · 같은 `--check` 줄 형식. 쓰기는 사람이 고친 단위 파일을 `.new` 로 옆에 두고 계속한다.
 */
import fs from "node:fs";
import path from "node:path";
import { bool, list } from "../../cli/args";
import type { CommandResult, Ctx } from "../../cli/context";
import { targetOf } from "../../cli/context";
import { CliError, EXIT } from "../../core/errors";
import { applyPlan, buildPlans, collisions, differences, loadUnits, REGISTRY, RegistryError, selectUnits, type ApplyResult } from "./engine";
import { SafetyError, withDeploymentLock } from "./safety";

export function runSyncUnits(ctx: Ctx): CommandResult {
  const cwd = targetOf(ctx);
  const repo = fs.existsSync(cwd) ? fs.realpathSync(cwd) : cwd;
  const check = bool(ctx.values, "check");
  const adopt = bool(ctx.values, "adopt");
  if (check && adopt) throw new CliError(EXIT.USAGE, "sync units: --check 와 --adopt 는 같이 쓰지 않는다");
  if (!fs.existsSync(path.join(repo, REGISTRY))) {
    throw new CliError(EXIT.STATE, `배포 단위 목록이 없다: ${REGISTRY}`, "multi-harness 모듈을 켠다(knots-sync add multi-harness)");
  }
  try {
    const all = loadUnits(repo, path.join(repo, REGISTRY));
    const units = selectUnits(all, list(ctx.values, "unit"));
    const plans = buildPlans(repo, all, units);
    const clashes = adopt ? [] : plans.flatMap((p) => collisions(p.unit, p.planned, p.previous));
    if (check) {
      const problems = [...plans.flatMap((p) => differences(p)), ...clashes];
      if (problems.length) {
        ctx.io.stderr("✖ 공통 하네스 파일이 원본과 다릅니다. tools/harness/shared 를 고치고 knots-sync sync units 를 실행하십시오.\n");
        return { code: EXIT.CHECK, data: { check: true, ok: false, problems, units: plans.length }, lines: problems };
      }
      return { code: EXIT.OK, data: { check: true, ok: true, problems: [], units: plans.length }, lines: [`공통 하네스 파일 일치 — 단위 ${plans.length}개`] };
    }
    if (bool(ctx.values, "dry-run")) {
      const problems = [...plans.flatMap((p) => differences(p)), ...clashes];
      return { code: EXIT.OK, data: { dryRun: true, problems, units: plans.length }, lines: [...problems, `(--dry-run) 쓰지 않았다 — 단위 ${plans.length}개`] };
    }
    const results: ApplyResult[] = withDeploymentLock(repo, () => plans.map((p) => applyPlan(repo, p, adopt)));
    const lines: string[] = [];
    for (const r of results) {
      lines.push(`${r.unit}: ${r.shared} shared files, ${r.changed} written or removed`);
      for (const k of r.kept) lines.push(`  .new: ${r.unit}/${k}.new — 단위에서 고친 파일이라 덮지 않고 옆에 두었다`);
      for (const k of r.removedKept) lines.push(`  kept: ${r.unit}/${k} — 원본에서 사라졌지만 단위에서 고쳐 지우지 않았다`);
    }
    const held = results.some((r) => r.kept.length || r.removedKept.length);
    return { code: held ? EXIT.HUMAN : EXIT.OK, data: { check: false, units: results }, lines };
  } catch (err) {
    if (err instanceof SafetyError) {
      ctx.io.stderr(`✖ ${err.message}\n중단했다. 실행 중 변경이면 앞서 배포된 파일은 남을 수 있다.\n`);
      return { code: EXIT.CHECK, data: { error: err.message }, lines: [] };
    }
    if (err instanceof RegistryError) throw new CliError(EXIT.USAGE, err.message);
    throw err;
  }
}
