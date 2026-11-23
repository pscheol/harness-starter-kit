/** 지우기(update --prune · uninstall). 파일 하나씩, 그다음 비게 된 상위 폴더(리포 폴더는 두고). */
import fs from "node:fs";
import path from "node:path";
import { byteCompare } from "./fsx";

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

/** 파일을 지운다. 이미 없으면 넘어간다. */
export function removeFile(target: string, rel: string): void {
  fs.rmSync(full(target, rel), { force: true });
}

/** rels 의 상위 폴더(리포 폴더 제외)를 깊은 것부터. */
export function ancestorDirs(rels: Iterable<string>): string[] {
  const dirs = new Set<string>();
  for (const rel of rels) {
    const parts = rel.split("/");
    for (let i = parts.length - 1; i > 0; i -= 1) dirs.add(parts.slice(0, i).join("/"));
  }
  return [...dirs].sort((a, b) => b.split("/").length - a.split("/").length || byteCompare(a, b));
}

/**
 * rels 의 상위 폴더 중 비어 있는 것을 지운다. 비어 있지 않거나 링크 · 파일이면 둔다(rmdir 은 링크를 따라가지 않는다).
 * 지운 폴더 수를 준다.
 */
export function removeEmptyDirs(target: string, rels: Iterable<string>): number {
  let removed = 0;
  for (const dir of ancestorDirs(rels)) {
    const p = full(target, dir);
    try {
      if (!fs.lstatSync(p).isDirectory()) continue;
      fs.rmdirSync(p);
      removed += 1;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST" && code !== "ENOTDIR") throw err;
    }
  }
  return removed;
}
