/** 종료 코드(설계 02 §3.2). */
export const EXIT = {
  OK: 0,
  CHECK: 1,
  USAGE: 2,
  STATE: 3,
  HUMAN: 4,
  ENV: 5,
  ABORT: 130,
} as const;

/** 사람에게 보여 줄 오류. code 가 종료 코드가 된다. */
export class CliError extends Error {
  readonly code: number;
  readonly hint: string | undefined;

  constructor(code: number, message: string, hint?: string) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.hint = hint;
  }
}

export function usageError(message: string, hint?: string): CliError {
  return new CliError(EXIT.USAGE, message, hint);
}

/** 파일 시스템 오류를 종료 코드로 옮긴다. 권한 · 읽기 전용은 실행 환경 오류(5)다. */
export function fsError(err: unknown, action: string): CliError {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  const detail = err instanceof Error ? err.message : String(err);
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return new CliError(EXIT.ENV, `${action}: 쓰기 권한이 없다 (${code})`, detail);
  }
  return new CliError(EXIT.STATE, `${action}: ${detail}`);
}
