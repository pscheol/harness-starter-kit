/** 관리 페이지 시험 도우미: 임시 git 리포(설치본 scripts 복사) · 이슈 문서 · 서버 · 요청. */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { startServer, type RunningServer, type ServerOptions } from "../src/server";

export const DASH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const KIT = path.resolve(DASH_DIR, "../..");
export const TEMPLATE_SCRIPTS = path.join(KIT, "packages/templates/common/scripts");
export const FIXTURES = path.join(KIT, "tests/fixtures/approvals");

const made: string[] = [];
const servers: RunningServer[] = [];
afterEach(async () => {
  while (servers.length) await (servers.pop() as RunningServer).close();
  while (made.length) fs.rmSync(made.pop() as string, { recursive: true, force: true });
});

export function tmpDir(prefix = "hk-dash-"): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

const AGENT_KEYS = /^(CLAUDECODE|CLAUDE_CODE_|CODEX_|KIRO_|CURSOR_AGENT|GIT_|HX_|HARNESS_)/;

/** 에이전트 표지 · git 환경 · 킷 변수를 뺀 환경. HOME 은 주어진 폴더다. */
export function cleanEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !AGENT_KEYS.test(k)) out[k] = v;
  return { ...out, HOME: home, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", PYTHONDONTWRITEBYTECODE: "1", ...extra };
}

export function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "maintenance.auto=false", "-c", "gc.auto=0", ...args], {
    cwd,
    encoding: "utf8",
    env: cleanEnv(process.env.HOME ?? os.homedir()),
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

export function writeFile(root: string, rel: string, body: string | Buffer): string {
  const full = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
  return full;
}

export function readFile(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, ...rel.split("/")), "utf8");
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export interface RepoOptions {
  gates?: string[];
  approvers?: Record<string, string[]>;
  groups?: Record<string, string[]>;
  email?: string;
  name?: string;
  modules?: string[];
}

export interface Repo {
  root: string;
  home: string;
  base: string;
}

const DEFAULT_GATES = ["codebase", "intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"];

export function meta(opts: RepoOptions = {}, name = "demo"): Record<string, unknown> {
  const m: Record<string, unknown> = {
    schema: "knots-sync/v2",
    kit: { version: "2.0.0-alpha.0" },
    project: { name, slug: name },
    stack: "python",
    arch: "layered",
    domain: "backend",
    agents: ["claude", "codex"],
    modules: opts.modules ?? [],
    flow: { design: "kit", record: "none", gates: opts.gates ?? DEFAULT_GATES },
    roles: { design: { harness: "claude" }, implement: { harness: "claude" }, review: { harness: "codex" } },
    issueKey: { source: "kit", prefix: "DEMO" },
    git: { base: "develop", worktreeRoot: "../{repo}.worktrees", maxPerRepo: 3, ide: "code" },
    packs: [],
    verify: { fullOnlyInCI: true },
    tokens: { PROJECT_NAME: name },
    installedAt: "2026-11-23",
    updatedAt: "2026-11-23",
  };
  if (opts.approvers) m.approvers = opts.approvers;
  if (opts.groups) m.groups = opts.groups;
  return m;
}

/** 설치본 scripts 를 복사한 임시 리포(브랜치 develop, 커밋 하나). */
export function makeRepo(opts: RepoOptions = {}, name = "demo", parent?: string): Repo {
  const base = parent ?? tmpDir();
  const root = path.join(base, name);
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, path.join(root, "scripts"), {
    recursive: true,
    filter: (src) => !src.includes("__pycache__") && !src.endsWith(".pyc"),
  });
  writeFile(root, ".agents/knots-sync.json", `${JSON.stringify(meta(opts, name), null, 2)}\n`);
  writeFile(root, ".agents/harness.json", `${JSON.stringify({ unit: name, title: name, stack: "python", agents: ["claude", "codex"], shared: [] }, null, 2)}\n`);
  writeFile(root, ".gitignore", ".agents/state/\n.agents/reports/\n.agents/local/\n");
  writeFile(root, "README.md", "# demo\n");
  git(root, "init", "-q", "-b", "develop");
  git(root, "config", "user.email", opts.email ?? "kim@example.com");
  git(root, "config", "user.name", opts.name ?? "Kim");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  const home = path.join(base, "home");
  fs.mkdirSync(home, { recursive: true });
  return { root, home, base };
}

export function commitAll(root: string, message = "change"): void {
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", message);
}

export function front(fields: Record<string, string>): string {
  return ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), "---", ""].join("\n");
}

export interface IssueDocs {
  area?: string;
  requirements?: string;
  design?: string;
  tasks?: string;
  body?: Record<string, string>;
}

/** 이슈 폴더 문서. requirements · design 은 status, tasks 는 state 값. */
export function writeIssue(root: string, key: string, name: string, docs: IssueDocs): string {
  const dir = `.agents/docs/issues/${key}-${name}`;
  const area = docs.area ?? "upload";
  const common = { key, area, type: "feat", title: name };
  if (docs.requirements)
    writeFile(root, `${dir}/requirements.md`, `${front({ ...common, status: docs.requirements, created: "2026-11-23" })}\n# Requirements — ${key}\n\n${docs.body?.requirements ?? "## 1. 요구\n\n- R1 업로드를 정리한다.\n"}`);
  if (docs.design)
    writeFile(root, `${dir}/design.md`, `${front({ ...common, status: docs.design, created: "2026-11-23" })}\n# Design — ${key}\n\n${docs.body?.design ?? "## 1. 설계\n\n본문.\n"}`);
  if (docs.tasks)
    writeFile(root, `${dir}/tasks.md`, `${front({ ...common, state: docs.tasks, created: "2026-11-23" })}\n# Tasks — ${key}\n\n${docs.body?.tasks ?? "### Phase 1: Setup\n\n- [ ] T001 준비한다\n"}`);
  return dir;
}

export interface TestServer extends RunningServer {
  repo: Repo;
}

export async function serve(repo: Repo, opts: Partial<ServerOptions> = {}): Promise<RunningServer> {
  const srv = await startServer({
    cwd: repo.root,
    env: cleanEnv(repo.home),
    agentSession: () => null,
    stderr: () => undefined,
    ...opts,
  });
  servers.push(srv);
  return srv;
}

export interface CallOptions {
  body?: unknown;
  raw?: string | Buffer;
  token?: string | null;
  host?: string;
  origin?: string | null;
  contentType?: string | null;
  headers?: Record<string, string>;
  address?: string;
}

export interface CallResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: any;
}

export function call(srv: RunningServer, method: string, urlPath: string, opts: CallOptions = {}): Promise<CallResult> {
  const headers: Record<string, string> = { Host: opts.host ?? `127.0.0.1:${srv.port}`, ...(opts.headers ?? {}) };
  if (opts.token !== null) headers.Authorization = `Bearer ${opts.token ?? srv.token}`;
  const writes = method !== "GET" && method !== "HEAD";
  if (writes && opts.origin !== null) headers.Origin = opts.origin ?? `http://127.0.0.1:${srv.port}`;
  let payload: Buffer | undefined;
  if (opts.raw !== undefined) payload = Buffer.from(opts.raw);
  else if (opts.body !== undefined) payload = Buffer.from(JSON.stringify(opts.body));
  if (payload && opts.contentType !== null) headers["Content-Type"] = opts.contentType ?? "application/json";
  if (payload) headers["Content-Length"] = String(payload.length);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: opts.address ?? "127.0.0.1", port: srv.port, method, path: urlPath, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** 파일 트리의 (경로 → sha256 · mtime). .git 은 뺀다. */
export function snapshotTree(root: string, skip: (rel: string) => boolean = () => false): Map<string, string> {
  const out = new Map<string, string>();
  if (!fs.existsSync(root)) return out;
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (name === ".git" || skip(rel)) continue;
      const st = fs.lstatSync(full);
      if (st.isDirectory()) walk(full);
      else out.set(rel, `${st.isFile() ? sha256(fs.readFileSync(full)) : "link"}:${st.mtimeMs}`);
    }
  };
  walk(root);
  return out;
}

export function python(args: string[], cwd: string, env?: Record<string, string>): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("python3", ["-B", ...args], { cwd, encoding: "utf8", env: env ?? cleanEnv(os.homedir()) });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** 문서 경로의 GET /docs 응답에서 sha256. */
export async function docSha(srv: RunningServer, rel: string, prefix = ""): Promise<string> {
  const r = await call(srv, "GET", `${prefix}/api/v1/docs?path=${encodeURIComponent(rel)}`);
  if (r.status !== 200) throw new Error(`GET docs ${rel}: ${r.status} ${r.text}`);
  return r.json.data.sha256 as string;
}
