/**
 * update --tools — 켠 외부 도구 모듈의 도구마다 지금 버전 · 최신 버전을 보이고, 사람이 고른 도구만 그 도구의 공식 업데이트 명령을 실행한다
 * (설계 10 MD-R15). 새 버전이 module.json(또는 메타 versions)의 범위 밖이면 경고하고 --allow-unverified 없이는 올리지 않는다.
 * 에이전트 세션 · TTY 아님이면 목록만 보인다. 킷 파일은 건드리지 않는다. 모델을 부르지 않는다.
 */
import { bool } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { createPrompter } from "../cli/prompt";
import { EXIT } from "../core/errors";
import { loadInstalled } from "../core/installed";
import { loadModuleOrNull } from "../modules/declaration";
import { agentSessionOf, checkTool, displayCmd, latestVersion, needsSudo, platformOf, rangeOf, runCmd, satisfiesRange } from "../modules/tools";
import { kitOf } from "./change";

interface Row {
  module: string;
  tool: string;
  current: string | null;
  latest: string | null;
  range: string;
  /** 최신 판이 범위 안인가(null = 알 수 없다) */
  latestInRange: boolean | null;
  update: string[] | null;
  action: "none" | "listed" | "updated" | "declined" | "blocked" | "failed" | "print";
  note?: string;
}

export async function runUpdateTools(ctx: Ctx): Promise<CommandResult> {
  const { io } = ctx;
  const target = targetOf(ctx);
  const inst = loadInstalled(target, "update");
  const kit = kitOf(ctx);
  const agent = agentSessionOf(io);
  const human = !agent && io.isTTY && io.stdin !== undefined && !ctx.json;
  const prompter = human ? createPrompter(io.stdin as NodeJS.ReadableStream, io.stderr) : null;
  const rows: Row[] = [];
  const lines = [`knots-sync update --tools — ${target}`];
  try {
    for (const id of inst.meta.modules) {
      const decl = loadModuleOrNull(kit.loc.dir, id);
      if (!decl || decl.kind !== "external") continue;
      for (const tool of decl.requires.tools) {
        const range = rangeOf(tool, inst.meta as unknown as Record<string, unknown>);
        const state = checkTool(io, target, tool, range);
        const latest = state.installed ? latestVersion(io, target, tool) : null;
        const cmd = tool.update[platformOf(io)] ?? null;
        const row: Row = { module: id, tool: tool.name, current: state.version, latest, range, latestInRange: latest ? satisfiesRange(latest, range) : null, update: cmd, action: "listed" };
        const newer = state.installed && latest !== null && state.version !== null && latest !== state.version;
        lines.push(`  ${tool.name.padEnd(8)} 지금 ${state.installed ? (state.version ?? "?") : "없음"} · 최신 ${latest ?? "알 수 없음"} · 검증 범위 ${range}${state.installed ? "" : "  (설치되어 있지 않다 — knots-sync add " + id + ")"}`);
        if (!newer) {
          row.action = "none";
          rows.push(row);
          continue;
        }
        if (row.latestInRange === false && !bool(ctx.values, "allow-unverified")) {
          row.action = "blocked";
          row.note = "최신 판이 검증된 범위 밖이다";
          lines.push(`    ⚠ 최신 ${latest} 는 검증된 범위(${range}) 밖이다 — 올리려면 --allow-unverified`);
        } else if (!cmd) {
          row.action = "print";
          lines.push(`    이 OS 의 업데이트 명령을 적어 두지 않았다. 문서: ${tool.install.doc}`);
        } else if (needsSudo(cmd)) {
          row.action = "print";
          lines.push(`    sudo 가 필요한 명령은 실행하지 않는다: ${displayCmd(cmd)}`);
        } else if (!prompter) {
          row.action = "listed";
          lines.push(`    업데이트 명령: ${displayCmd(cmd)}${agent ? "  (에이전트 세션이라 실행하지 않는다 — 사람이 터미널에서 실행한다)" : "  (사람 터미널에서 다시 하면 묻는다)"}`);
        } else if (await prompter.confirm(`${tool.name} ${state.version} → ${latest} 로 올린다(${displayCmd(cmd)})`)) {
          const r = runCmd(io, target, cmd, { inherit: true, timeout: 900_000 });
          const after = checkTool(io, target, tool, range);
          row.action = r.status === 0 ? "updated" : "failed";
          lines.push(`    ${row.action === "updated" ? `올렸다 → ${after.version ?? "?"}` : `실패(exit ${String(r.status)})`}`);
        } else {
          row.action = "declined";
          lines.push("    올리지 않았다");
        }
        rows.push(row);
      }
    }
  } finally {
    prompter?.close();
  }
  if (rows.length === 0) lines.push("  켜 둔 외부 도구 모듈이 없다(knots-sync add aidlc · entire)");
  return { code: EXIT.OK, data: { command: "update", tools: rows, target }, lines };
}
