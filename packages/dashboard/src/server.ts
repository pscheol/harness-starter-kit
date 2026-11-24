/**
 * 관리 페이지 서버(설계 06 §3.1 · §3.5 · §3.14, DB-R1~R5 · R12 · R22 · R23 · R27). Node 표준 http 만 쓴다.
 * 127.0.0.1 에만 바인드하고 Host · Bearer 토큰 · Origin · Content-Type · 크기 · PIN 을 검사한다. 모델을 부르지 않는다(DB-R26).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { agentSession } from "./agent";
import { match, type ApiRequest } from "./api";
import { ApiError } from "./errors";
import { contentType, rawTarget } from "./paths";
import { type Deps, Project } from "./project";
import { modeEntries, Projects, type ProjectsMode } from "./projects";
import { type Env, readJson } from "./util";
import { readRaw } from "./writers/docs";

declare const __HK_STATIC__: Record<string, string>;
const STATIC: Record<string, string> = typeof __HK_STATIC__ === "object" && __HK_STATIC__ ? __HK_STATIC__ : {};

export interface ServerOptions {
  cwd: string;
  env: Env;
  port?: number;
  readOnly?: boolean;
  mode?: ProjectsMode;
  /** 시험만 바꿔 끼운다(기본: 환경 표지 + 부모 프로세스) */
  agentSession?: () => string | null;
  deps?: Deps;
  /** 서버 터미널(500 오류 기록) */
  stderr?: (s: string) => void;
  home?: string;
}

export interface RunningServer {
  port: number;
  url: string;
  token: string;
  pin: string | null;
  readOnly: boolean;
  /** 읽기 전용 근거(에이전트 세션 판정 · --read-only) */
  readOnlyReason: string | null;
  address: string;
  mode: ProjectsMode["kind"];
  close(): Promise<void>;
}

export class StartError extends Error {
  readonly exitCode: number;
  readonly hint: string | undefined;
  constructor(exitCode: number, message: string, hint?: string) {
    super(message);
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

const LIMIT = 1024 * 1024;
const PIN_TRIES = 5;
const RAW_TTL = 600;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const RAW_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'";

export function newPin(): string {
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i += 1) out += CROCKFORD[(bytes[i] as number) & 31];
  return out;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function stateFiles(root: string): { dir: string; token: string; info: string } {
  const dir = path.join(root, ".agents/state");
  return { dir, token: path.join(dir, "dashboard.token"), info: path.join(dir, "dashboard.json") };
}

function writeSecret(file: string, text: string): void {
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || st.isFile()) fs.unlinkSync(file);
  } catch {
    // 없음
  }
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fs.writeSync(fd, text);
  } finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(file, 0o600);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function healthz(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/healthz", method: "GET", headers: { Host: `127.0.0.1:${port}` }, timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/** 같은 리포에서 돌고 있는 서버(DB-R23). 사람 터미널이면 토큰을 붙인 주소, 에이전트 세션이면 토큰 없는 주소. */
export async function findRunning(cwd: string, env: Env, agent: () => string | null = () => agentSession(env)): Promise<{ url: string; port: number } | null> {
  let root: string;
  try {
    root = (await Project.open(cwd, { env, home: env.HOME ?? os.homedir(), readOnly: true, multi: true, deps: {} })).root;
  } catch {
    return null;
  }
  const files = stateFiles(root);
  const info = readJson(files.info);
  if (!info || typeof info.pid !== "number" || typeof info.port !== "number") return null;
  if (!pidAlive(info.pid) || !(await healthz(info.port))) return null;
  const base = `http://127.0.0.1:${info.port}/`;
  if (agent()) return { url: base, port: info.port };
  let token = "";
  try {
    token = fs.readFileSync(files.token, "utf8").trim();
  } catch {
    token = "";
  }
  return { url: token ? `${base}#t=${token}` : base, port: info.port };
}

function send(res: http.ServerResponse, status: number, body: string | Buffer, headers: Record<string, string>): void {
  res.writeHead(status, { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...headers });
  res.end(body);
}

function sendJson(res: http.ServerResponse, status: number, value: unknown, extra: Record<string, string> = {}): void {
  send(res, status, JSON.stringify(value), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
}

function sendError(res: http.ServerResponse, err: ApiError): void {
  sendJson(res, err.status, err.body());
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > LIMIT) over = true;
      else chunks.push(c);
    });
    req.on("end", () => (over ? reject(new ApiError(400, "bad_request", "본문이 1 MiB 를 넘습니다")) : resolve(Buffer.concat(chunks))));
    req.on("error", () => reject(new ApiError(400, "bad_request", "본문을 읽지 못했습니다")));
  });
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const mode: ProjectsMode = opts.mode ?? { kind: "single" };
  const home = opts.home ?? opts.env.HOME ?? os.homedir();
  const marker = (opts.agentSession ?? (() => agentSession(opts.env)))();
  const readOnly = opts.readOnly === true || marker !== null;
  const readOnlyReason = marker ?? (opts.readOnly ? "--read-only" : null);
  const deps = opts.deps ?? {};
  const log = opts.stderr ?? ((s: string) => process.stderr.write(s));
  const projectOpts = { env: opts.env, home, readOnly, deps };
  let single: Project | null = null;
  let projects: Projects | null = null;
  if (mode.kind === "single") {
    try {
      single = await Project.open(opts.cwd, { ...projectOpts, multi: false });
    } catch (err) {
      throw new StartError(3, err instanceof Error ? err.message : String(err), "npx harness-kit doctor");
    }
    const meta = single.meta();
    if (meta.schema !== "harness-kit/v2") throw new StartError(3, `.agents/harness-kit.json 의 schema 가 harness-kit/v2 가 아닙니다(${String(meta.schema ?? "없음")})`, "npx harness-kit doctor");
  } else {
    projects = new Projects(() => modeEntries(mode, home, opts.env), { ...projectOpts, multi: true });
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const pin = readOnly ? null : newPin();
  let failures = 0;
  const files = single ? stateFiles(single.root) : null;
  if (files) {
    fs.mkdirSync(files.dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(files.dir, 0o700);
    writeSecret(files.token, `${token}\n`);
  }
  let port = 0;
  const hosts = (): string[] => [`127.0.0.1:${port}`, `localhost:${port}`];
  const origins = (): string[] => [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const sign = (prefix: string) => (relPath: string): string => {
    const exp = Math.floor(Date.now() / 1000) + RAW_TTL;
    const sig = crypto.createHmac("sha256", token).update(`${relPath}\n${exp}`).digest("hex");
    return `${prefix}/raw/${relPath.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}`;
  };

  async function projectFor(rest: string): Promise<{ p: Project; path: string; prefix: string } | null> {
    if (single) return { p: single, path: rest, prefix: "" };
    const m = /^\/p\/([0-9a-f]{12})(\/.*)$/.exec(rest);
    if (!m || !projects) return null;
    const p = await projects.get(m[1] as string);
    return p ? { p, path: m[2] as string, prefix: `/p/${m[1]}` } : null;
  }

  async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const auth = req.headers.authorization ?? "";
    const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!given || !same(given, token)) throw new ApiError(401, "unauthorized", "토큰이 없거나 틀렸습니다");
    const method = req.method ?? "GET";
    const writes = method === "POST" || method === "PUT" || method === "DELETE";
    const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined;
    if (writes) {
      const origin = req.headers.origin ?? "";
      const ct = String(req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
      if (!origins().includes(origin)) throw new ApiError(403, "forbidden_origin", "Origin 이 이 서버가 아닙니다");
      if ((method !== "DELETE" || hasBody) && ct !== "application/json") throw new ApiError(403, "forbidden_origin", "Content-Type 이 application/json 이 아닙니다");
    }
    let body: unknown;
    if (writes && hasBody) {
      const raw = await readBody(req);
      try {
        body = raw.length ? JSON.parse(raw.toString("utf8")) : undefined;
      } catch {
        throw new ApiError(400, "bad_request", "JSON 형식 오류");
      }
    }
    const rest = url.pathname.slice("/api/v1".length) || "/";
    let target = await projectFor(rest);
    if (!target && projects) {
      const top = match(method, rest);
      if (top && "route" in top && (top.route.multi || (rest === "/sessions" && url.searchParams.get("scope") === "machine"))) {
        const first = (await projects.list()).find((s) => s.project)?.project ?? null;
        if (!first && !top.route.multi) throw new ApiError(404, "not_found", "읽을 프로젝트가 없습니다");
        target = { p: first as Project, path: rest, prefix: "" };
      }
    }
    if (!target) throw new ApiError(404, "not_found", "프로젝트가 없습니다");
    const m = match(method, target.path);
    if (!m) throw new ApiError(404, "not_found", `경로 없음: ${target.path}`);
    if (!("route" in m)) throw new ApiError(405, "method_not_allowed", `허용 메서드: ${m.methods.join(", ")}`);
    if (m.route.pin) {
      if (readOnly) throw new ApiError(403, "read_only", "읽기 전용 모드입니다 — PIN 이 없습니다");
      if (failures >= PIN_TRIES) throw new ApiError(403, "pin_locked", "PIN 을 5번 틀려 서버가 끝날 때까지 막았습니다");
      const given = body && typeof body === "object" ? (body as Record<string, unknown>).pin : undefined;
      if (typeof given !== "string" || !same(given, pin as string)) {
        failures += 1;
        throw new ApiError(403, "pin_required", "승인 PIN 이 없거나 틀렸습니다(서버를 연 터미널에만 보입니다)");
      }
    }
    const request: ApiRequest = {
      method, params: m.params, query: url.searchParams, body, via: "dashboard", mode: single ? "single" : "multi",
      sign: sign(target.prefix), ...(projects ? { projects } : {}),
    };
    const out = await m.route.handler(target.p, request);
    const envelope = { ok: true, data: out.data, ...(out.meta ? { meta: out.meta } : {}) };
    const text = JSON.stringify(envelope);
    if (method === "GET") {
      const etag = `W/"${crypto.createHash("sha256").update(text).digest("hex").slice(0, 32)}"`;
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, { ETag: etag, "Cache-Control": "no-store" });
        res.end();
        return;
      }
      send(res, out.status, text, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ETag: etag });
      return;
    }
    send(res, out.status, text, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  }

  async function handleRaw(res: http.ServerResponse, url: URL): Promise<void> {
    let rest = url.pathname;
    let p = single;
    const pm = /^\/p\/([0-9a-f]{12})(\/raw\/.*)$/.exec(rest);
    if (pm && projects) {
      p = await projects.get(pm[1] as string);
      rest = pm[2] as string;
    }
    if (!p) throw new ApiError(404, "not_found", "프로젝트가 없습니다");
    let relPath: string;
    try {
      relPath = rest.slice("/raw/".length).split("/").map(decodeURIComponent).join("/");
    } catch {
      throw new ApiError(403, "forbidden_path", "경로를 읽지 못했습니다");
    }
    rawTarget(relPath);
    const exp = Number(url.searchParams.get("exp") ?? "");
    const sig = url.searchParams.get("sig") ?? "";
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(exp) || exp < now || exp > now + RAW_TTL + 5) throw new ApiError(403, "forbidden_path", "서명 URL 이 지났습니다");
    const want = crypto.createHmac("sha256", token).update(`${relPath}\n${exp}`).digest("hex");
    if (!same(sig, want)) throw new ApiError(403, "forbidden_path", "서명이 틀렸습니다");
    const bytes = await readRaw(p, relPath);
    const ct = contentType(relPath);
    send(res, 200, bytes, { "Content-Type": ct, "Content-Security-Policy": ct.startsWith("text/html") ? `${RAW_CSP}; sandbox allow-scripts` : RAW_CSP, "Cache-Control": "private, max-age=60" });
  }

  function handleStatic(res: http.ServerResponse, url: URL): void {
    let name = url.pathname.replace(/^\/p\/[0-9a-f]{12}/, "");
    if (name === "" || name === "/" || !name.includes(".")) name = "/index.html";
    const body = Object.hasOwn(STATIC, name.slice(1)) ? STATIC[name.slice(1)] : undefined;
    if (body === undefined) {
      send(res, 404, "없음\n", { "Content-Type": "text/plain; charset=utf-8", "Content-Security-Policy": PAGE_CSP });
      return;
    }
    const ext = name.slice(name.lastIndexOf(".") + 1);
    const types: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8" };
    send(res, 200, body, { "Content-Type": types[ext] ?? "application/octet-stream", "Content-Security-Policy": PAGE_CSP, "X-Frame-Options": "DENY", "Cache-Control": "no-cache" });
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        if (!hosts().includes(String(req.headers.host ?? ""))) throw new ApiError(421, "misdirected", "Host 가 127.0.0.1 · localhost 와 이 포트가 아닙니다");
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (url.pathname === "/healthz") {
          sendJson(res, 200, { ok: true });
          return;
        }
        if (url.pathname.startsWith("/api/v1/") || url.pathname === "/api/v1") await handleApi(req, res, url);
        else if (url.pathname.startsWith("/api/")) throw new ApiError(404, "not_found", "경로 없음");
        else if (url.pathname.startsWith("/raw/") || /^\/p\/[0-9a-f]{12}\/raw\//.test(url.pathname)) await handleRaw(res, url);
        else if (req.method === "GET" || req.method === "HEAD") handleStatic(res, url);
        else throw new ApiError(405, "method_not_allowed", "화면 파일은 GET 만 받습니다");
      } catch (err) {
        if (res.headersSent) {
          res.end();
          return;
        }
        if (err instanceof ApiError) {
          if (err.status === 500) log(`관리 페이지 오류: ${err.message}\n`);
          sendError(res, err);
          return;
        }
        log(`관리 페이지 내부 오류: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
        sendError(res, new ApiError(500, "internal", "예상하지 못한 오류(서버 터미널에 적었습니다)"));
      }
    })();
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const addr = server.address();
  port = typeof addr === "object" && addr ? addr.port : 0;
  if (files) {
    writeSecret(files.info, `${JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString(), readOnly })}\n`);
  }
  let closed = false;
  return {
    port,
    url: `http://127.0.0.1:${port}/#t=${token}`,
    token,
    pin,
    readOnly,
    readOnlyReason,
    address: typeof addr === "object" && addr ? addr.address : "",
    mode: mode.kind,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
      if (files) {
        for (const f of [files.token, files.info]) fs.rmSync(f, { force: true });
      }
    },
  };
}
