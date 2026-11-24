/** API 오류(설계 06 §3.5 오류 코드 표). 응답 봉투 {ok: false, error: {code, message, details}}. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  body(): { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } } {
    return { ok: false, error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) } };
  }
}

export const bad = (message: string, details?: Record<string, unknown>): ApiError => new ApiError(400, "bad_request", message, details);
export const notFound = (message: string): ApiError => new ApiError(404, "not_found", message);
export const forbiddenPath = (p: string): ApiError => new ApiError(403, "forbidden_path", `쓰기 허용 경로가 아닙니다: ${p.slice(0, 200)}`);
export const readOnly = (): ApiError => new ApiError(403, "read_only", "읽기 전용 모드입니다(에이전트 세션 또는 --read-only). 사람이 자기 터미널에서 연 관리 페이지에서 합니다");
export const notImplemented = (stage: string, what: string): ApiError => new ApiError(501, "not_implemented", `${what}은(는) ${stage}에서 제공합니다`, { stage });
