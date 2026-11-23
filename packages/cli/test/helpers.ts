import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { main, type Io } from "../src/main";

export const CLI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REAL_TEMPLATES = path.resolve(CLI_DIR, "../templates");
export const LEGACY_LIB = path.resolve(CLI_DIR, "../legacy-setup/hx-bootstrap/lib/harness-lib.sh");

const made: string[] = [];
afterEach(() => {
  while (made.length) fs.rmSync(made.pop() as string, { recursive: true, force: true });
});

/** 시험마다 지워지는 임시 폴더(실제 경로 — macOS /var → /private/var). */
export function tmpDir(prefix = "hk-cli-"): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

export function writeTree(root: string, files: Record<string, string | Buffer>): void {
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

export interface TreeEntry {
  bytes: Buffer;
  mode: number;
  mtimeMs: number;
}

export function readTree(root: string): Map<string, TreeEntry> {
  const out = new Map<string, TreeEntry>();
  if (!fs.existsSync(root)) return out;
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const st = fs.lstatSync(full);
      if (st.isDirectory()) walk(full);
      else
        out.set(path.relative(root, full).split(path.sep).join("/"), {
          bytes: st.isFile() ? fs.readFileSync(full) : Buffer.alloc(0),
          mode: st.mode & 0o777,
          mtimeMs: st.mtimeMs,
        });
    }
  };
  walk(root);
  return out;
}

export function realLayout(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(REAL_TEMPLATES, "layout.json"), "utf8")) as Record<string, unknown>;
}

/** 시험 전용 모듈: common 과 같은 설치 경로(scripts/guards/_template.sh)를 하나 둔다(HK-10 뒤 레이어 우선 시험). */
export const OVERLAP_MODULE = "zz-overlap";

/** 작은 템플릿 폴더. layout.json 은 실제 파일(+ 시험 모듈 OVERLAP_MODULE)에 patch 를 덮어 만든다. */
export function fixtureTemplates(files: Record<string, string | Buffer>, patch: Record<string, unknown> = {}): string {
  const dir = tmpDir("hk-tpl-");
  writeTree(dir, files);
  const real = realLayout();
  const layout = { ...real, modules: [...(real.modules as string[]), OVERLAP_MODULE], ...patch };
  fs.writeFileSync(path.join(dir, "layout.json"), JSON.stringify(layout, null, 2));
  return dir;
}

/** 시험용 기본 템플릿: 하네스 4종 · 겹치는 경로 1개 · 경로 토큰 · 실행 파일 · 무시 파일. */
export const BASIC_FILES: Record<string, string> = {
  "common/root/AGENTS.md": "# {{PROJECT_NAME}}\n",
  "common/root/CLAUDE.md": "@AGENTS.md\n",
  "common/root/.gitignore": ".agents/state/\n.agents/local/\n.agents/reports/\n",
  "common/agents-rules/a.md": "ns={{PACKAGE_NS}} lang={{PRIMARY_LANGUAGE}}\n",
  "common/claude/settings.json": "{}\n",
  "common/codex/config.toml": "x = 1\n",
  "common/cursor/commands/hx.md": "cursor\n",
  "common/kiro-agents/__PROJECT_SLUG__.json": "{\"name\": \"{{PROJECT_SLUG}}\"}\n",
  "common/scripts/run.sh": "#!/bin/sh\necho {{PROJECT_SLUG}}\n",
  "common/scripts/guards/_template.sh": "common\n",
  "common/.DS_Store": "junk",
  "stacks/jvm/agents-rules/tech.md": "jvm {{BUILD_TOOL}}\n",
  "stacks/jvm/arch/hexagonal/agents-rules/structure.md": "hexagonal\n",
  "stacks/jvm/arch/layered/agents-rules/structure.md": "layered\n",
  "stacks/web/agents-rules/tech.md": "web\n",
  "stacks/web/arch/nextjs-app/agents-rules/structure.md": "next\n",
  "domains/frontend/agents-rules/frontend.md": "fe\n",
  "optional/zz-overlap/ABOUT": "겹침 시험 모듈\n",
  "optional/zz-overlap/scripts/guards/_template.sh": "module\n",
  "optional/jira-workflow/agents-rules/jira.md": "jira\n",
  "optional/multi-harness/tools/harness/units.json": "{}\n",
};

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  isTTY?: boolean;
  nodeVersion?: string;
  answers?: string[];
  today?: string;
}

/** main() 을 프로세스 없이 부른다. 환경변수는 주어진 것만 보인다. */
export async function run(argv: string[], opts: RunOptions = {}): Promise<RunResult> {
  let stdout = "";
  let stderr = "";
  const stdin = new PassThrough();
  if (opts.answers) {
    for (const a of opts.answers) stdin.write(`${a}\n`);
  }
  const io: Io = {
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    env: opts.env ?? {},
    cwd: opts.cwd ?? process.cwd(),
    cliFile: path.join(CLI_DIR, "dist", "cli.js"),
    isTTY: opts.isTTY ?? false,
    nodeVersion: opts.nodeVersion ?? process.versions.node,
    stdin,
    today: opts.today ?? "2026-11-23",
  };
  const code = await main(argv, io);
  stdin.end();
  return { code, stdout, stderr };
}

export function json(r: RunResult): Record<string, any> {
  return JSON.parse(r.stdout) as Record<string, any>;
}

export const LOCK_FILE = ".agents/harness-kit.lock";
export const META_FILE = ".agents/harness-kit.json";
export const FIXTURE_ENV = { PROJECT_NAME: "Acme", PROJECT_SLUG: "acme" };

export function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function readJsonFile(file: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, any>;
}

export function writeJsonFile(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function lockEntries(target: string): Record<string, any>[] {
  return readJsonFile(path.join(target, LOCK_FILE)).entries as Record<string, any>[];
}

export function lockEntry(target: string, rel: string): Record<string, any> | undefined {
  return lockEntries(target).find((e) => e.path === rel);
}

/** lock 항목을 바꾸거나(객체 — 없으면 더한다) 지운다(null). */
export function patchLock(target: string, patches: Record<string, Record<string, unknown> | null>): void {
  const file = path.join(target, LOCK_FILE);
  const lock = readJsonFile(file);
  const kept = (lock.entries as Record<string, any>[]).filter((e) => patches[e.path] !== null);
  lock.entries = kept.map((e) => (patches[e.path] ? { ...e, ...patches[e.path] } : e));
  for (const [p, v] of Object.entries(patches)) {
    if (v && !kept.some((e) => e.path === p)) lock.entries.push({ path: p, ...v });
  }
  writeJsonFile(file, lock);
}

export function readText(target: string, rel: string): string {
  return fs.readFileSync(path.join(target, ...rel.split("/")), "utf8");
}

export function exists(target: string, rel: string): boolean {
  return fs.existsSync(path.join(target, ...rel.split("/")));
}

export function modeOf(target: string, rel: string): number {
  return fs.statSync(path.join(target, ...rel.split("/"))).mode & 0o777;
}

/** BASIC_FILES(또는 files)로 init 한 리포(하네스 claude). cli(명령, 인자)는 같은 리포에 명령을 부른다. */
export async function installedFixture(opts: { files?: Record<string, string>; modules?: string; pre?: Record<string, string> } = {}) {
  const templates = fixtureTemplates(opts.files ?? BASIC_FILES);
  const target = path.join(tmpDir(), "acme");
  if (opts.pre) writeTree(target, opts.pre);
  const extra = opts.modules ? ["--modules", opts.modules] : [];
  const r = await run(["init", "--yes", "--templates", templates, "--cwd", target, "--agents", "claude", ...extra], { env: FIXTURE_ENV });
  if (r.code !== 0) throw new Error(`init 실패: ${r.stdout}${r.stderr}`);
  const cli = (command: string, args: string[] = [], o: RunOptions = {}): Promise<RunResult> => run([command, "--cwd", target, ...args], o);
  return { target, templates, cli };
}

const STATE_SKIP = new Set([LOCK_FILE, META_FILE, ".agents/state/harness-kit.lock.v1.bak"]);

/** lock · 메타 · v1 백업을 뺀 파일 → (내용, 권한). */
export function filesOf(target: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [rel, e] of readTree(target)) if (!STATE_SKIP.has(rel)) out.set(rel, `${e.mode.toString(8)} ${e.bytes.toString("hex")}`);
  return out;
}

/** 같은 템플릿 · 같은 폴더 이름으로 새로 init 한 리포. */
export async function freshInit(templates: string, agents: string, modules = "none"): Promise<string> {
  const target = path.join(tmpDir(), "acme");
  const r = await run(["init", "--yes", "--templates", templates, "--cwd", target, "--agents", agents, "--modules", modules], { env: FIXTURE_ENV });
  if (r.code !== 0) throw new Error(r.stdout + r.stderr);
  return target;
}

