/**
 * harness-kit intake(설계 08 §3.11, HK-19 design §4) — 관리 페이지 POST /intake 와 같은 처리 함수를 HTTP 없이 부른다.
 * 터미널은 첨부를 로컬 경로로 넘긴다(크기 상한은 intake.py 의 meta intake.maxFileMB · maxTotalMB). 세션에는 아무것도 보내지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import type { CommandResult, Ctx } from "../cli/context";
import { targetOf } from "../cli/context";
import { usageError } from "../core/errors";
import { run } from "./api-call";

const str = (ctx: Ctx, k: string): string | undefined => (typeof ctx.values[k] === "string" ? (ctx.values[k] as string) : undefined);
const list = (ctx: Ctx, k: string): string[] => (Array.isArray(ctx.values[k]) ? (ctx.values[k] as string[]) : []);

async function readStdin(ctx: Ctx): Promise<string> {
  const input = ctx.io.stdin;
  if (!input) return "";
  const chunks: Buffer[] = [];
  for await (const c of input) chunks.push(typeof c === "string" ? Buffer.from(c) : (c as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

/** 운영 기록의 장애 · 다음 Intent 후보에서 접수한다(설계 14 §3.8 · §3.9, DO-R10 · R11). 같은 후보를 다시 접수하면 기존 경로를 보이고 끝낸다. */
async function runIntakeFromOps(ctx: Ctx, from: string): Promise<CommandResult> {
  const kind = str(ctx, "kind");
  const name = str(ctx, "name");
  return run(ctx, "POST", "/intake", { body: { from, ...(kind ? { kind } : {}), ...(name ? { name } : {}) } }, (d) => {
    if (d.existing) return [String(d.message ?? "이미 접수했다")];
    const warnings = Array.isArray(d.warnings) ? (d.warnings as string[]) : [];
    return [`✔ 접수: ${String(d.folder)} ← ${String(d.ref ?? from)}`, ...warnings.map((w) => `⚠ ${w}`), `다음: ${String(d.next)} (세션 요청은 사람이 고를 때만)`];
  });
}

export async function runIntake(ctx: Ctx): Promise<CommandResult> {
  const from = str(ctx, "from");
  if (from !== undefined) return runIntakeFromOps(ctx, from);
  const title = str(ctx, "title");
  const kind = str(ctx, "kind");
  const name = str(ctx, "name");
  if (!title || !kind || !name) throw usageError("harness-kit intake --title <제목> --kind feature|change|refactor|product|bug --name <영문-kebab> [--text … | --text - | --text-file 파일] [--attach 파일]… [--link URL]…");
  const textArg = str(ctx, "text");
  const textFile = str(ctx, "text-file");
  if (textArg !== undefined && textFile !== undefined) throw usageError("--text 와 --text-file 은 하나만 쓴다");
  const cwd = targetOf(ctx);
  let text = textArg === "-" ? await readStdin(ctx) : textArg ?? "";
  if (textFile !== undefined) {
    const file = path.resolve(ctx.io.cwd, textFile);
    if (!fs.existsSync(file)) throw usageError(`--text-file 이 없다: ${textFile}`);
    text = fs.readFileSync(file, "utf8");
  }
  const paths = list(ctx, "attach").map((a) => path.resolve(ctx.io.cwd, a));
  const missing = paths.find((a) => !fs.statSync(a, { throwIfNoEntry: false })?.isFile());
  if (missing) throw usageError(`첨부가 없다: ${path.relative(cwd, missing) || missing}`);
  const area = str(ctx, "area");
  const body = { title, kind, name, text, links: list(ctx, "link"), paths, ...(area ? { area } : {}) };
  return run(ctx, "POST", "/intake", { body }, (d) => {
    const warnings = Array.isArray(d.warnings) ? (d.warnings as string[]) : [];
    return [`✔ 접수: ${String(d.folder)}`, ...warnings.map((w) => `⚠ ${w}`), `다음: ${String(d.next)} (세션 요청은 사람이 고를 때만)`];
  });
}
