/**
 * 템플릿 폴더 찾기(HK-8 design §7).
 * --templates > KNOTS_SYNC_TEMPLATES > <CLI 폴더>/../templates > <CLI 폴더>/../../templates.
 * layout.json 이 있는 첫 폴더를 쓴다.
 */
import fs from "node:fs";
import path from "node:path";
import { CliError, EXIT } from "./errors";

export interface TemplatesLocation {
  dir: string;
  /** lock 의 kit.source */
  source: string;
}

function hasLayout(dir: string): boolean {
  return fs.existsSync(path.join(dir, "layout.json"));
}

export function locateTemplates(opts: {
  flag: string | undefined;
  env: Record<string, string | undefined>;
  cliFile: string;
  cwd: string;
  version: string;
}): TemplatesLocation {
  const explicit = opts.flag ?? (opts.env.KNOTS_SYNC_TEMPLATES || undefined);
  if (explicit !== undefined) {
    const dir = path.resolve(opts.cwd, explicit);
    if (!hasLayout(dir)) throw new CliError(EXIT.ENV, `템플릿 폴더가 아니다(layout.json 없음): ${dir}`);
    return { dir, source: `file:${dir}` };
  }
  let cliDir: string;
  try {
    cliDir = path.dirname(fs.realpathSync(opts.cliFile));
  } catch {
    cliDir = path.dirname(path.resolve(opts.cliFile));
  }
  const beside = path.resolve(cliDir, "..", "templates");
  if (hasLayout(beside)) {
    const where = path.basename(cliDir) === "bin" ? "plugin" : "npm";
    return { dir: beside, source: `${where}:knots-sync@${opts.version}` };
  }
  const mono = path.resolve(cliDir, "..", "..", "templates");
  if (hasLayout(mono)) return { dir: mono, source: `file:${mono}` };
  throw new CliError(EXIT.ENV, "템플릿 폴더를 찾지 못했다", `--templates <폴더> 또는 KNOTS_SYNC_TEMPLATES 로 준다 (찾은 곳: ${beside} · ${mono})`);
}
