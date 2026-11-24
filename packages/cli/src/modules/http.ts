/**
 * 외부 서비스(Jira · Notion) REST 호출의 공통 바닥. Node 내장 fetch 만 쓴다(런타임 의존성 0).
 * - 토큰은 환경 변수에서만 읽고 이 파일 밖으로 내지 않는다. 오류 문구에도 넣지 않는다.
 * - 평문 http 는 루프백(127.0.0.1 · localhost · ::1)만 허용한다(시험용 모의 서버).
 */
import { CliError, EXIT } from "../core/errors";

export interface HttpOptions {
  /** 시험이 바꿔 끼운다. 기본은 전역 fetch */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function checkBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError(EXIT.STATE, `주소 형식이 틀리다: ${raw}`, "baseUrl 은 https://<조직>.atlassian.net 꼴이다");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new CliError(EXIT.STATE, `https 가 아닌 주소는 쓰지 않는다: ${url.origin}`, "토큰이 평문으로 나간다. 루프백 시험 서버만 http 를 허용한다");
  }
  return url;
}

/** 토큰 값을 문자열에서 지운다(오류 문구용). */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s.length >= 4) out = out.split(s).join("***");
  return out;
}

export interface Requester {
  json(method: string, pathAndQuery: string, body?: unknown): Promise<unknown>;
  bytes(urlOrPath: string, maxBytes: number): Promise<Buffer>;
}

export function makeRequester(base: URL, headers: Record<string, string>, secrets: string[], opts: HttpOptions = {}): Requester {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? 30_000;
  const resolve = (p: string): URL => {
    const u = new URL(p, base.origin + (base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`));
    if (u.origin !== base.origin) throw new HttpError(0, "다른 출처 주소로는 인증 정보를 보내지 않는다");
    return u;
  };
  const call = async (method: string, url: URL, extra: Record<string, string>, body?: unknown): Promise<Response> => {
    try {
      return await doFetch(url, {
        method,
        headers: { Accept: "application/json", ...headers, ...extra },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      throw new HttpError(0, redact(`연결하지 못했다(${url.origin}): ${err instanceof Error ? err.message : String(err)}`, secrets));
    }
  };
  return {
    async json(method, pathAndQuery, body) {
      const res = await call(method, resolve(pathAndQuery), body !== undefined ? { "Content-Type": "application/json" } : {}, body);
      const text = await res.text();
      if (!res.ok) throw new HttpError(res.status, redact(`${method} ${pathAndQuery} → ${res.status} ${text.slice(0, 200)}`, secrets));
      if (!text.trim()) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new HttpError(res.status, `JSON 이 아닌 응답: ${pathAndQuery}`);
      }
    },
    async bytes(urlOrPath, maxBytes) {
      const url = new URL(urlOrPath, base.origin);
      // 첨부 내려받기: 같은 출처면 인증 헤더를 붙이고, 서명된 다른 출처(CDN)면 헤더 없이 받는다.
      const same = url.origin === base.origin;
      const res = same ? await call("GET", url, { Accept: "*/*" }) : await doFetch(url, { signal: AbortSignal.timeout(timeout) }).catch((err: unknown) => {
        throw new HttpError(0, redact(`내려받지 못했다: ${err instanceof Error ? err.message : String(err)}`, secrets));
      });
      if (!res.ok) throw new HttpError(res.status, `첨부를 받지 못했다(${res.status})`);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > maxBytes) throw new HttpError(413, `첨부가 ${maxBytes} 바이트보다 크다`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) throw new HttpError(413, `첨부가 ${maxBytes} 바이트보다 크다`);
      return buf;
    },
  };
}
