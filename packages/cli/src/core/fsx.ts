import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 바이트(UTF-8) 순 비교. LC_ALL=C sort 와 같은 순서다. */
export function byteCompare(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** 폴더 아래 일반 파일의 상대 경로(POSIX, 바이트 순). 링크는 건너뛴다(find -type f 와 같다). */
export function walkFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, prefix: string): void => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = fs.lstatSync(full);
      if (st.isDirectory()) walk(full, rel);
      else if (st.isFile()) out.push(rel);
    }
  };
  walk(dir, "");
  return out.sort(byteCompare);
}

export function lstatOrNull(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" || (err as NodeJS.ErrnoException).code === "ENOTDIR") return null;
    throw err;
  }
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * 같은 폴더의 임시 파일에 쓰고 rename 한다. 모드는 umask 를 거친다
 * (0666 · 실행 파일 0777 → umask 022 에서 644 · 755). setup.sh 의 `sed > tmp && mv` + `chmod +x` 와 같다.
 */
export function writeFileAtomic(dest: string, data: Uint8Array, executable: boolean): void {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(dest)}.hk-${crypto.randomBytes(4).toString("hex")}`);
  try {
    fs.writeFileSync(tmp, data, { mode: executable ? 0o777 : 0o666, flag: "wx" });
    fs.renameSync(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}
