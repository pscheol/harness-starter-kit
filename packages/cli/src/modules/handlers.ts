/**
 * module.json 의 `{ "call": "<이름>" }` 단계가 부르는 도구별 처리기(고정 목록, MD-R1).
 * module.json 에 없는 이름은 부르지 않는다. 외부 도구의 명령으로만 그 도구 설정을 바꾼다 — 킷이 도구의 설정 파일을 직접 고치지 않는다.
 */
import type { Ctx } from "../cli/context";
import { CliError, EXIT } from "../core/errors";
import type { ModuleDecl, ToolDecl } from "./declaration";
import { checkVisibility, uploadsAllowed } from "./entire/visibility";
import { displayCmd, runCmd } from "./tools";

export interface HandlerArgs {
  ctx: Ctx;
  root: string;
  decl: ModuleDecl;
  meta: Record<string, unknown>;
  tool: ToolDecl | null;
  /** 도구가 쓰는 구현 하네스 이름 */
  harness: string;
}

type Handler = (a: HandlerArgs) => { lines: string[] };

/**
 * D6 · MD-R13: 원격이 private · internal 이면 같은 원격에 체크포인트를 올리고(Entire 기본값),
 * public 이거나 확인하지 못하면 올리지 않는 설정을 쓴다(entire configure --project --skip-push-sessions).
 */
const entirePushPolicy: Handler = (a) => {
  const vis = checkVisibility(a.ctx.io, a.root);
  const lines = [`  원격 공개 여부: ${vis.visibility}(${vis.via})${vis.remote ? ` · ${vis.host}` : ""}`];
  if (uploadsAllowed(vis.visibility)) {
    lines.push("  체크포인트 push 정책: 같은 원격에 올린다(Entire 기본값)");
    return { lines };
  }
  const argv = ["entire", "configure", "--project", "--skip-push-sessions"];
  const r = runCmd(a.ctx.io, a.root, argv, { timeout: 60_000 });
  lines.push(`  실행: ${displayCmd(argv)} → exit ${String(r.status)}`);
  if (r.status !== 0) throw new CliError(EXIT.STATE, "체크포인트를 올리지 않는 설정에 실패했다", (r.stderr || r.stdout).trim().split("\n").slice(-3).join("\n"));
  lines.push("  체크포인트 push 정책: 올리지 않는다(공개이거나 확인하지 못했다). 비공개 원격에 따로 올리려면 entire configure --checkpoint-remote github:<그룹>/<리포>");
  return { lines };
};

const HANDLERS: Record<string, Handler> = { "entire.pushPolicy": entirePushPolicy };

export function callHandler(name: string, args: HandlerArgs): { lines: string[] } {
  const h = HANDLERS[name];
  if (!h) throw new CliError(EXIT.ENV, `module.json 이 모르는 처리기를 부른다: ${name}`);
  return h(args);
}
