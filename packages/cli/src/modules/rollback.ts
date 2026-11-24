/**
 * 킷 몫 되돌리기(설계 10 §3.1 "6 이후 실패"). applyKit 앞에서 킷이 쓸 경로의 바이트를 잡아 두고,
 * 뒤 단계가 실패하면 그 경로만 원래대로 되돌린다. 외부 도구가 만든 파일은 건드리지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { removeEmptyDirs } from "../core/remove";
import { writeFileAtomic } from "../core/fsx";
import { walkFiles } from "./external";

interface Saved {
  bytes: Buffer;
  mode: number;
}

export class Rollback {
  private readonly saved = new Map<string, Saved>();
  private readonly roots: string[];

  private constructor(
    private readonly root: string,
    roots: string[],
  ) {
    this.roots = roots;
  }

  /** paths 는 파일 또는 폴더(배치가 폴더를 만든다). 있는 파일은 바이트를 잡고, 없던 경로는 되돌릴 때 지운다. */
  static capture(root: string, paths: string[]): Rollback {
    const rb = new Rollback(root, [...new Set(paths)]);
    for (const p of rb.roots) {
      const abs = path.join(root, ...p.split("/"));
      let st: fs.Stats | null = null;
      try {
        st = fs.lstatSync(abs);
      } catch {
        st = null;
      }
      if (!st) continue;
      if (st.isDirectory()) for (const f of walkFiles(root, p)) rb.save(f);
      else if (st.isFile()) rb.save(p);
    }
    return rb;
  }

  private save(rel: string): void {
    const abs = path.join(this.root, ...rel.split("/"));
    this.saved.set(rel, { bytes: fs.readFileSync(abs), mode: fs.statSync(abs).mode & 0o777 });
  }

  /** 되돌린 경로 수 */
  restore(): number {
    let n = 0;
    for (const [rel, s] of this.saved) {
      const abs = path.join(this.root, ...rel.split("/"));
      let same = false;
      try {
        same = fs.readFileSync(abs).equals(s.bytes);
      } catch {
        same = false;
      }
      if (same) continue;
      writeFileAtomic(abs, s.bytes, (s.mode & 0o111) !== 0);
      n += 1;
    }
    const gone: string[] = [];
    for (const p of this.roots) {
      const abs = path.join(this.root, ...p.split("/"));
      let st: fs.Stats | null = null;
      try {
        st = fs.lstatSync(abs);
      } catch {
        st = null;
      }
      if (!st) continue;
      const now = st.isDirectory() ? walkFiles(this.root, p) : [p];
      for (const f of now) {
        if (this.saved.has(f)) continue;
        fs.rmSync(path.join(this.root, ...f.split("/")), { force: true });
        gone.push(f);
        n += 1;
      }
    }
    removeEmptyDirs(this.root, [...gone, ...this.roots.map((r) => `${r}/x`)]);
    return n;
  }
}
