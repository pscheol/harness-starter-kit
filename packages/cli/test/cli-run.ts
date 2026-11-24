// HK-20b 시험 공통: 저장소(대시보드 시험 fixture)에서 main() 을 부르고, 로컬 모의 HTTP 서버(Jira · Notion)를 띄운다. 실제 네트워크는 쓰지 않는다.
import http from "node:http";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { Repo } from "../../dashboard/test/helpers";
import { main, type Io } from "../src/main";
import { CLI_DIR } from "./helpers";

export interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
  json: any;
}

export async function cli(argv: string[], repo: Repo, opts: { env?: Record<string, string>; agent?: string | null; tty?: boolean } = {}): Promise<CliRun> {
  let stdout = "";
  let stderr = "";
  const stdin = new PassThrough();
  const io: Io = {
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    env: { PATH: process.env.PATH ?? "", HOME: repo.home, ...(opts.env ?? {}) },
    cwd: repo.root,
    cliFile: path.join(CLI_DIR, "dist", "cli.js"),
    isTTY: opts.tty ?? false,
    nodeVersion: process.versions.node,
    stdin,
    today: "2026-11-24",
    agentSession: () => (opts.agent === undefined ? null : opts.agent),
  };
  const code = await main(argv, io);
  stdin.end();
  let json: any = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  return { code, stdout, stderr, json };
}

export interface Seen {
  method: string;
  url: string;
  auth: string | undefined;
  body: any;
}

export interface MockServer {
  url: string;
  seen: Seen[];
  close(): Promise<void>;
}

export type Handler = (req: { method: string; url: URL; body: any }) => { status?: number; json?: unknown; raw?: Buffer; type?: string } | null;

/** 루프백 모의 서버. handler 가 null 을 주면 404. */
export async function mockServer(handler: Handler): Promise<MockServer> {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      seen.push({ method: req.method ?? "GET", url: url.pathname + url.search, auth: req.headers.authorization, body });
      const r = handler({ method: req.method ?? "GET", url, body });
      if (!r) {
        res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "not found" }));
        return;
      }
      if (r.raw) {
        res.writeHead(r.status ?? 200, { "Content-Type": r.type ?? "application/octet-stream" }).end(r.raw);
        return;
      }
      res.writeHead(r.status ?? 200, { "Content-Type": "application/json" }).end(r.json === undefined ? "" : JSON.stringify(r.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, seen, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
