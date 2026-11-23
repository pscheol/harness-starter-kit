import path from "node:path";
import type { Values } from "./args";

/** 프로세스 경계. 시험은 이것을 바꿔 끼운다. */
export interface Io {
  stdout(s: string): void;
  stderr(s: string): void;
  env: Record<string, string | undefined>;
  cwd: string;
  /** CLI 파일 경로(템플릿 찾기 기준) */
  cliFile: string;
  isTTY: boolean;
  nodeVersion: string;
  stdin?: NodeJS.ReadableStream;
  /** YYYY-MM-DD. 없으면 오늘(로컬) */
  today?: string;
}

export interface Ctx {
  io: Io;
  command: string;
  values: Values;
  /** add · remove 의 이름 */
  positionals: string[];
  json: boolean;
  quiet: boolean;
}

/** 명령 결과. data 는 --json 출력, lines 는 사람용 출력(stdout)이다. */
export interface CommandResult {
  code: number;
  data: Record<string, unknown>;
  lines: string[];
}

export function targetOf(ctx: Ctx): string {
  const cwd = ctx.values.cwd;
  return path.resolve(ctx.io.cwd, typeof cwd === "string" ? cwd : ".");
}

export function today(io: Io): string {
  if (io.today) return io.today;
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
