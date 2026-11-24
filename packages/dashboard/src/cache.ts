/**
 * stat 기반 캐시(설계 06 §3.2, DB-R6). 항목은 {stamp, value, computedAt}. 요청마다 stamp 만 다시 구하고 같으면 값을 쓴다.
 * stamp 는 파일 (mtimeMs, size, ino) · 폴더 항목 이름의 목록이다. stat 은 파일당 한 번이다.
 */
import fs from "node:fs";
import path from "node:path";

export function fileStamp(file: string): string {
  try {
    const st = fs.statSync(file);
    return `${file}:${st.mtimeMs}:${st.size}:${st.ino}`;
  } catch {
    return `${file}:-`;
  }
}

/** 폴더 아래 파일 stamp(깊이 제한, 이름 순). 심볼릭 링크는 따라가지 않고 이름만 적는다. */
export function treeStamp(dir: string, depth = 4, filter: (name: string) => boolean = () => true): string {
  const out: string[] = [];
  const walk = (d: string, left: number): void => {
    let names: string[];
    try {
      names = fs.readdirSync(d).sort();
    } catch {
      out.push(`${d}:-`);
      return;
    }
    for (const n of names) {
      if (!filter(n)) continue;
      const f = path.join(d, n);
      let st: fs.Stats;
      try {
        st = fs.lstatSync(f);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        out.push(`${f}/`);
        if (left > 0) walk(f, left - 1);
      } else out.push(`${f}:${st.mtimeMs}:${st.size}:${st.ino}${st.isSymbolicLink() ? ":l" : ""}`);
    }
  };
  walk(dir, depth);
  return out.join("\n");
}

interface Item<T> {
  stamp: string;
  value: T;
  computedAt: number;
}

export class Cache {
  private items = new Map<string, Item<unknown>>();
  private pending = new Map<string, { stamp: string; promise: Promise<unknown> }>();

  async get<T>(key: string, stamp: string, compute: () => Promise<T> | T, ttlMs?: number): Promise<T> {
    const hit = this.items.get(key);
    if (hit && hit.stamp === stamp && (ttlMs === undefined || Date.now() - hit.computedAt < ttlMs)) return hit.value as T;
    const running = this.pending.get(key);
    if (running && running.stamp === stamp) return running.promise as Promise<T>;
    const promise = (async () => {
      const value = await compute();
      this.items.set(key, { stamp, value, computedAt: Date.now() });
      return value;
    })();
    this.pending.set(key, { stamp, promise });
    try {
      return await promise;
    } finally {
      if (this.pending.get(key)?.promise === promise) this.pending.delete(key);
    }
  }
}
