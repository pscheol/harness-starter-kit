/** checkpoints — Entire 체크포인트 목록 · 설명(설계 10 §3.3, 06 `GET /checkpoints`). 관리 페이지와 같은 처리 함수를 부른다. 읽기만 한다. */
import { str } from "../cli/args";
import type { CommandResult, Ctx } from "../cli/context";
import { usageError } from "../core/errors";
import { run } from "./api-call";

export async function runCheckpoints(ctx: Ctx): Promise<CommandResult> {
  const [id, ...extra] = ctx.positionals;
  if (extra.length) throw usageError(`checkpoints: 위치 인자가 많다: ${extra.join(" ")}`);
  if (id !== undefined) {
    if (str(ctx.values, "issue") !== undefined) throw usageError("checkpoints: <id> 와 --issue 는 같이 쓰지 않는다");
    return run(ctx, "GET", `/checkpoints/${encodeURIComponent(id)}`, {}, (d) => {
      if (d.enabled === false) return [`체크포인트 ${id}: ${String(d.reason)}`];
      if (d.available === false) return [`체크포인트 ${id}: ${String(d.reason)}`];
      return [`체크포인트 ${id}(신뢰하지 않는 내용)`, ...String(d.text ?? "").split("\n")];
    });
  }
  const issue = str(ctx.values, "issue");
  return run(ctx, "GET", "/checkpoints", { query: issue ? { issue } : {} }, (d) => {
    if (d.enabled === false) return [String(d.note)];
    const rows = (d.checkpoints as { id: string; commit: string; subject: string; state: string }[]) ?? [];
    return [
      `체크포인트 ${rows.length}개 · 브랜치 ${String(d.branch ?? "-")}${d.range ? ` · ${String(d.range)}` : ""}`,
      ...rows.map((r) => `  ${r.id}  ${r.commit}  ${r.state === "local" ? "local" : "원격에만 또는 없음"}  ${r.subject}`),
      ...(d.note ? [String(d.note)] : []),
    ];
  });
}
