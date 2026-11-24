/**
 * 배포 상태 비교 · 심볼릭 링크 차단 · 잠금 · 원자 쓰기(tools/harness/sync_safety.py 이식, 설계 10 §3.5).
 * Python 은 디렉터리 기술자(dir_fd)로 경로 중간 바꿔치기를 막는다. Node 는 같은 기술자 API 가 없어
 * 경로의 모든 조각을 lstat 으로 검사하고 파일은 O_NOFOLLOW 로 연다(그 사이 경로를 바꾸는 경쟁까지는 막지 못한다).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class SafetyError extends Error {}

export interface FileState {
  sha256: string;
  mode: number;
}

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const isLink = (mode: number): boolean => (mode & S_IFMT) === S_IFLNK;
const isDirMode = (mode: number): boolean => (mode & S_IFMT) === S_IFDIR;
const isRegMode = (mode: number): boolean => (mode & S_IFMT) === S_IFREG;

export function validatePath(root: string, target: string, directory = false): void {
  const parts = path.relative(root, target).split(path.sep).filter((x) => x !== "");
  if (parts[0] === "..") throw new SafetyError(`invalid path: ${target}`);
  let current = root;
  parts.forEach((part, index) => {
    if (part === "." || part === "..") throw new SafetyError(`invalid path: ${target}`);
    current = path.join(current, part);
    let mode: number;
    try {
      mode = fs.lstatSync(current).mode;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    if (isLink(mode)) throw new SafetyError(`symlink path refused: ${current}`);
    const isParent = index < parts.length - 1 || directory;
    if (isParent && !isDirMode(mode)) throw new SafetyError(`not a directory: ${current}`);
    if (!isParent && !isRegMode(mode)) throw new SafetyError(`not a regular file: ${current}`);
  });
}

export function fileState(root: string, relative: string): FileState | null {
  const target = path.join(root, relative);
  validatePath(root, target);
  let fd: number;
  try {
    fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw err;
  }
  try {
    const before = fs.fstatSync(fd);
    if (!isRegMode(before.mode)) throw new SafetyError(`not a regular file: ${path.basename(target)}`);
    const hash = crypto.createHash("sha256");
    const buf = Buffer.alloc(65536);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      hash.update(buf.subarray(0, n));
    }
    const after = fs.fstatSync(fd);
    if (before.mtimeMs !== after.mtimeMs || before.size !== after.size || before.mode !== after.mode) throw new SafetyError(`changed while reading: ${path.basename(target)}`);
    return { sha256: hash.digest("hex"), mode: after.mode & 0o7777 };
  } finally {
    fs.closeSync(fd);
  }
}

export function collectStates(root: string, paths: Iterable<string>): Map<string, FileState | null> {
  const out = new Map<string, FileState | null>();
  for (const rel of [...new Set(paths)].sort()) out.set(rel, fileState(root, rel));
  return out;
}

export const sameState = (a: FileState | null, b: FileState | null): boolean => (a === null || b === null ? a === b : a.sha256 === b.sha256 && a.mode === b.mode);

function assertUnchanged(root: string, relative: string, expected: FileState | null): void {
  validatePath(root, path.join(root, relative));
  if (!sameState(fileState(root, relative), expected)) throw new SafetyError(`changed since snapshot: ${relative}`);
}

function ensureParents(root: string, relative: string): void {
  let current = root;
  for (const part of path.dirname(relative).split(path.sep)) {
    if (part === "." || part === "") continue;
    current = path.join(current, part);
    try {
      fs.mkdirSync(current);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    if (isLink(fs.lstatSync(current).mode)) throw new SafetyError(`symlink path refused: ${current}`);
  }
}

export function atomicWrite(root: string, relative: string, text: string, mode: number, expected: FileState | null): void {
  validatePath(root, path.join(root, relative));
  ensureParents(root, relative);
  const temporary = path.join(root, path.dirname(relative), `.harness-sync-${crypto.randomBytes(16).toString("hex")}.tmp`);
  const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    try {
      fs.writeSync(fd, Buffer.from(text, "utf8"));
      fs.fchmodSync(fd, mode);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    assertUnchanged(root, relative, expected);
    fs.renameSync(temporary, path.join(root, relative));
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function safeUnlink(root: string, relative: string, expected: FileState | null): void {
  assertUnchanged(root, relative, expected);
  fs.unlinkSync(path.join(root, relative));
}

export function lockPath(root: string): string {
  const digest = crypto.createHash("sha256").update(fs.realpathSync(root)).digest("hex");
  return path.join(os.tmpdir(), `harness-sync-${process.getuid?.() ?? 0}-${digest}.lock`);
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
};

/**
 * 같은 리포의 동시 배포를 막는다. Python 은 flock 을 쓰지만 Node 에는 없어, 같은 이름 뒤에 `.node` 를 붙인 파일을
 * O_EXCL 로 만들어 잡는다(주인 pid 가 죽었으면 낡은 잠금으로 보고 지운다). 두 도구가 서로를 막지는 않는다.
 */
export function withDeploymentLock<T>(root: string, fn: () => T): T {
  const file = `${lockPath(root)}.node`;
  let fd = -1;
  for (let attempt = 0; attempt < 2 && fd < 0; attempt += 1) {
    try {
      fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const pid = Number.parseInt(fs.readFileSync(file, "utf8"), 10);
      if (Number.isFinite(pid) && alive(pid)) throw new SafetyError("another harness sync is running; retry after it finishes");
      fs.rmSync(file, { force: true });
    }
  }
  if (fd < 0) throw new SafetyError("another harness sync is running; retry after it finishes");
  try {
    fs.writeSync(fd, String(process.pid));
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(file, { force: true });
  }
}
