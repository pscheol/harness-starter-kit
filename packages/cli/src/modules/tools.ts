/**
 * 외부 도구 확인 · 설치 · 갱신(설계 10 §3.1 3단계, MD-R3 · R4 · R15).
 * 설치는 그 도구의 설치기가 한다. 킷은 설치 명령을 보이고(사람이 고르면) 부르기만 한다. 모델을 부르지 않는다.
 * 에이전트 세션이나 TTY 가 아니면 설치하지 않고 명령을 출력한 뒤 exit 5 로 끝낸다. sudo 명령은 실행하지 않고 출력만 한다.
 */
import { spawnSync } from "node:child_process";
import type { Io } from "../cli/context";
import { agentSession } from "../../../dashboard/src/agent";
import { compareSemver } from "../core/version";
import type { Platform, ToolDecl } from "./declaration";

export interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  /** 명령이 없다(ENOENT) */
  missing: boolean;
}

/** 외부 명령 실행. 환경은 Io.env 를 그대로 쓴다(시험은 PATH 를 바꿔 가짜 도구를 둔다). */
export function runCmd(io: Io, cwd: string, argv: string[], opts: { inherit?: boolean; timeout?: number } = {}): Run {
  const [cmd, ...args] = argv;
  const env = { ...io.env, PATH: io.env.PATH ?? process.env.PATH, HOME: io.env.HOME ?? process.env.HOME } as NodeJS.ProcessEnv;
  const r = spawnSync(cmd as string, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 120_000,
  });
  const missing = (r.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
  return { status: r.status, stdout: typeof r.stdout === "string" ? r.stdout : "", stderr: typeof r.stderr === "string" ? r.stderr : "", missing };
}

export function platformOf(io: Io): Platform {
  const p = io.env.KNOTS_SYNC_PLATFORM ?? process.platform;
  return p === "darwin" || p === "win32" ? p : "linux";
}

// ── 버전 범위 ─────────────────────────────────────────────────────────────────

function norm(v: string): string | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim());
  return m ? `${m[1]}.${m[2] ?? "0"}.${m[3] ?? "0"}` : null;
}

/** 출력 첫 줄들에서 처음 나오는 x.y[.z] 를 버전으로 뽑는다("aidlc 2.11.4 (runtime 2.11.4)" · "Entire CLI 0.13.4"). */
export function parseVersion(text: string): string | null {
  const m = /(?:^|[^\d.])v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)/.exec(text);
  return m ? (m[1] as string) : null;
}

/** `>=2.11 <3` · `>=0.13 <0.14` · `>=1.2.3` · `<2` · `=1.0` 같은 공백으로 이은 비교 목록. 해석하지 못하면 null. */
export function satisfiesRange(version: string, range: string): boolean | null {
  const v = norm(version);
  if (!v) return null;
  const parts = range.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return true;
  for (const part of parts) {
    const m = /^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/.exec(part);
    if (!m) return null;
    const cmp = compareSemver(v, norm(m[2] as string) as string);
    if (cmp === null) return null;
    const op = m[1] ?? "=";
    const ok = op === ">=" ? cmp >= 0 : op === "<=" ? cmp <= 0 : op === ">" ? cmp > 0 : op === "<" ? cmp < 0 : cmp === 0;
    if (!ok) return false;
  }
  return true;
}

/** 메타 `versions.<도구>`(점 경로의 마지막 키)가 있으면 그 범위, 없으면 선언의 기본값 */
export function rangeOf(tool: ToolDecl, meta: Record<string, unknown>): string {
  const versions = meta.versions && typeof meta.versions === "object" ? (meta.versions as Record<string, unknown>) : {};
  const key = tool.rangeKey.replace(/^versions\./, "");
  return typeof versions[key] === "string" ? (versions[key] as string) : tool.range;
}

export interface ToolState {
  name: string;
  installed: boolean;
  version: string | null;
  range: string;
  /** null = 버전을 읽거나 범위를 해석하지 못했다 */
  inRange: boolean | null;
}

export function checkTool(io: Io, cwd: string, tool: ToolDecl, range: string): ToolState {
  const r = runCmd(io, cwd, tool.versionCmd, { timeout: 15_000 });
  if (r.missing || r.status === null) return { name: tool.name, installed: false, version: null, range, inRange: null };
  const version = parseVersion(`${r.stdout}\n${r.stderr}`);
  return { name: tool.name, installed: true, version, range, inRange: version === null ? null : satisfiesRange(version, range) };
}

// ── 설치 ─────────────────────────────────────────────────────────────────────

export const SUDO = /(^|[\s;&|()])sudo(\s|$)/;

/** sudo 가 필요한 명령은 실행하지 않는다(출력만). */
export function needsSudo(argv: string[]): boolean {
  return argv[0] === "sudo" || argv.slice(1).some((a) => SUDO.test(a));
}

export function displayCmd(argv: string[]): string {
  return argv.map((a) => (/^[A-Za-z0-9_./@%+=:,-]+$/.test(a) ? a : a.includes("'") ? `"${a}"` : `'${a}'`)).join(" ");
}

export interface InstallOffer {
  /** 이 OS 의 설치 명령(없으면 null) */
  command: string[] | null;
  lines: string[];
}

/** 설치 명령 안내 줄(사람 · 에이전트 공통). 설치하지 않는다. */
export function installOffer(tool: ToolDecl, platform: Platform): InstallOffer {
  const command = tool.install.commands[platform] ?? null;
  const lines = [`  ${tool.name} 가 없다. 공식 설치 명령${command ? "" : "(이 OS 는 명령을 적어 두지 않았다)"}:`];
  if (command) lines.push(`    ${displayCmd(command)}`);
  for (const h of tool.install.hint) lines.push(`    ${h}`);
  if (tool.install.doc) lines.push(`    문서: ${tool.install.doc}`);
  return { command, lines };
}

/** 에이전트 세션 판정(설계 06 §3.11). 시험은 Io.agentSession 을 바꿔 끼운다. */
export function agentSessionOf(io: Io): string | null {
  return (io.agentSession ?? (() => agentSession(io.env)))();
}

export type InstallDecision =
  | { action: "run"; command: string[] }
  | { action: "print"; reason: "agent" | "no-tty" | "declined" | "sudo" | "no-command"; command: string[] | null };

/**
 * 설치할지 정한다(MD-R3).
 * - 에이전트 세션: --install-tools 가 있어도 실행하지 않는다.
 * - TTY: 사람이 고른 경우만 실행(--install-tools 면 묻지 않고 실행). TTY 가 아니고 --install-tools 가 없으면 출력만.
 * - sudo 가 든 명령은 실행하지 않는다.
 */
export async function decideInstall(
  io: Io,
  tool: ToolDecl,
  opts: { installTools: boolean; confirm: (q: string) => Promise<boolean> },
): Promise<InstallDecision> {
  const offer = installOffer(tool, platformOf(io));
  if (!offer.command) return { action: "print", reason: "no-command", command: null };
  if (needsSudo(offer.command)) return { action: "print", reason: "sudo", command: offer.command };
  if (agentSessionOf(io)) return { action: "print", reason: "agent", command: offer.command };
  if (opts.installTools) return { action: "run", command: offer.command };
  if (!io.isTTY) return { action: "print", reason: "no-tty", command: offer.command };
  const yes = await opts.confirm(`${tool.name} 를 설치한다(${displayCmd(offer.command)})`);
  return yes ? { action: "run", command: offer.command } : { action: "print", reason: "declined", command: offer.command };
}

// ── 최신 버전 · 갱신(MD-R15) ───────────────────────────────────────────────────

function dig(v: unknown, dotted: string): unknown {
  let cur: unknown = v;
  for (const key of dotted.split(".").filter(Boolean)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[Array.isArray(cur) ? Number(key) : key];
  }
  return cur;
}

/** 도구가 알려 주는 최신 판. 알 수 없으면 null. */
export function latestVersion(io: Io, cwd: string, tool: ToolDecl): string | null {
  if (!tool.latest) return null;
  const r = runCmd(io, cwd, tool.latest.cmd, { timeout: 30_000 });
  if (r.missing || !r.stdout.trim()) return null;
  if (!tool.latest.json) return parseVersion(r.stdout);
  try {
    const found = dig(JSON.parse(r.stdout) as unknown, tool.latest.json);
    return typeof found === "string" ? found : null;
  } catch {
    return null;
  }
}
