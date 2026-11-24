/** 공용 도구: sha256 · 원자적 쓰기 · ULID · 시각 · 하위 프로세스(git · python). 모델 · 네트워크 서비스를 부르지 않는다. */
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type Env = Record<string, string | undefined>;

export function sha256(data: string | Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** 같은 폴더 임시 파일 → fsync → rename. 권한은 원래 파일(없으면 mode)을 따른다. */
export function atomicWrite(file: string, data: string | Buffer, mode?: number): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  let keep = mode;
  try {
    const st = fs.lstatSync(file);
    if (st.isFile()) keep = st.mode & 0o777;
  } catch {
    // 새 파일
  }
  const fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, keep ?? 0o644);
  try {
    fs.writeSync(fd, typeof data === "string" ? Buffer.from(data, "utf8") : data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (keep !== undefined) fs.chmodSync(tmp, keep);
  fs.renameSync(tmp, file);
}

/** 폴더를 만들고 권한을 mode 로 맞춘다(이미 있으면 권한만). */
export function ensureDir(dir: string, mode: number): void {
  fs.mkdirSync(dir, { recursive: true, mode });
  fs.chmodSync(dir, mode);
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID(시각 48비트 + 난수 80비트, Crockford base32 26자). approvals.py new_entry_id 와 같은 식이다. */
export function ulid(now: number = Date.now()): string {
  let value = (BigInt(Math.floor(now)) << 80n) | BigInt(`0x${crypto.randomBytes(10).toString("hex")}`);
  let out = "";
  for (let i = 0; i < 26; i += 1) {
    out = CROCKFORD[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return out;
}

/** 지역 시각 ISO 8601(초 단위, ±hh:mm). approvals.now_text 와 같은 모양이다. */
export function nowText(d: Date = new Date()): string {
  const p = (n: number): string => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
}

export interface Proc {
  code: number;
  stdout: string;
  stderr: string;
}

/** 상위 리포 설정이 끼지 않게 git 환경 변수를 뺀 환경. */
export function childEnv(env: Env): NodeJS.ProcessEnv {
  const out: Env = { ...env, PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME, GIT_TERMINAL_PROMPT: "0", PYTHONDONTWRITEBYTECODE: "1" };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG", "GIT_PREFIX"]) delete out[k];
  return out as NodeJS.ProcessEnv;
}

export function run(cmd: string, args: string[], opts: { cwd: string; env: Env; timeout?: number; maxBuffer?: number }): Promise<Proc> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: opts.cwd, env: childEnv(opts.env), timeout: opts.timeout ?? 30_000, maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024, encoding: "utf8" }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

/** git 읽기 명령(쓰기 잠금을 잡지 않는다). */
export function git(cwd: string, env: Env, ...args: string[]): Promise<Proc> {
  return run("git", ["--no-optional-locks", "-c", "core.quotePath=false", ...args], { cwd, env });
}

export async function gitOut(cwd: string, env: Env, ...args: string[]): Promise<string | null> {
  const r = await git(cwd, env, ...args);
  return r.code === 0 ? r.stdout.replace(/\n$/, "") : null;
}

export function python(cwd: string, env: Env, args: string[], timeout = 60_000): Promise<Proc> {
  return run("python3", ["-B", ...args], { cwd, env, timeout });
}

/** 이 컴퓨터 설정 폴더(~/.config/harness-kit). `HARNESS_KIT_CONFIG_DIR`(절대 경로)이 있으면 그것 — 시험이 실제 홈을 쓰지 않게 한다. */
export function kitConfigDir(home: string, env: Env = {}): string {
  const o = env.HARNESS_KIT_CONFIG_DIR;
  return o && path.isAbsolute(o) ? o : path.join(home, ".config/harness-kit");
}

export function readJson(file: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function rel(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join("/") || ".";
}

/** 줄바꿈 · 제어 문자를 지우고 공백을 묶는다. */
export function oneLine(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/** UTF-8 바이트 상한으로 자른다(글자 중간을 끊지 않는다). */
export function cutBytes(s: string, limit: number): string {
  if (Buffer.byteLength(s) <= limit) return s;
  let out = "";
  for (const ch of s) {
    if (Buffer.byteLength(out + ch) > limit) break;
    out += ch;
  }
  return out;
}
