/**
 * 원본 보기(HK-13 design §6.1). 배치는 copy 를 적용한 뒤의 리포를 원본으로 읽는다.
 * FsView = 지금 폴더, OverlayView = 지금 폴더 + 이번 copy 쓰기 − 지우기(쓰기 전에 계산하려고).
 */
import fs from "node:fs";
import path from "node:path";
import { byteCompare } from "../core/fsx";

export type EntryKind = "file" | "dir" | "link" | "other";

export interface RepoView {
  /** 폴더 안 이름과 종류. 폴더가 아니면 null */
  list(rel: string): { name: string; kind: EntryKind }[] | null;
  /** 일반 파일(링크 아님)의 바이트. 없으면 null */
  read(rel: string): Buffer | null;
  executable(rel: string): boolean;
  kind(rel: string): EntryKind | "none";
}

function full(root: string, rel: string): string {
  return rel === "" ? root : path.join(root, ...rel.split("/"));
}

function kindOf(st: fs.Stats): EntryKind {
  if (st.isSymbolicLink()) return "link";
  if (st.isDirectory()) return "dir";
  if (st.isFile()) return "file";
  return "other";
}

export class FsView implements RepoView {
  constructor(readonly root: string) {}

  kind(rel: string): EntryKind | "none" {
    try {
      return kindOf(fs.lstatSync(full(this.root, rel)));
    } catch {
      return "none";
    }
  }

  list(rel: string): { name: string; kind: EntryKind }[] | null {
    if (this.kind(rel) !== "dir") return null;
    return fs
      .readdirSync(full(this.root, rel))
      .sort(byteCompare)
      .map((name) => ({ name, kind: this.kind(rel ? `${rel}/${name}` : name) as EntryKind }));
  }

  read(rel: string): Buffer | null {
    return this.kind(rel) === "file" ? fs.readFileSync(full(this.root, rel)) : null;
  }

  executable(rel: string): boolean {
    try {
      return (fs.lstatSync(full(this.root, rel)).mode & 0o100) !== 0;
    } catch {
      return false;
    }
  }
}

export interface OverlayWrite {
  content: Buffer;
  executable: boolean;
}

export class OverlayView implements RepoView {
  private readonly dirs = new Set<string>();

  constructor(
    private readonly base: RepoView,
    private readonly writes: Map<string, OverlayWrite>,
    private readonly deletes: Set<string> = new Set(),
  ) {
    for (const rel of writes.keys()) {
      const parts = rel.split("/");
      for (let i = 1; i < parts.length; i += 1) this.dirs.add(parts.slice(0, i).join("/"));
    }
  }

  kind(rel: string): EntryKind | "none" {
    if (this.writes.has(rel)) return "file";
    if (this.dirs.has(rel)) return "dir";
    if (this.deletes.has(rel)) return "none";
    return this.base.kind(rel);
  }

  list(rel: string): { name: string; kind: EntryKind }[] | null {
    if (this.kind(rel) !== "dir") return null;
    const names = new Set<string>();
    for (const e of this.base.list(rel) ?? []) names.add(e.name);
    const prefix = rel ? `${rel}/` : "";
    for (const w of [...this.writes.keys(), ...this.dirs]) {
      if (w.startsWith(prefix) && w.length > prefix.length) names.add((w.slice(prefix.length).split("/")[0]) as string);
    }
    const out: { name: string; kind: EntryKind }[] = [];
    for (const name of [...names].sort(byteCompare)) {
      const k = this.kind(`${prefix}${name}`);
      if (k !== "none") out.push({ name, kind: k });
    }
    return out;
  }

  read(rel: string): Buffer | null {
    const w = this.writes.get(rel);
    if (w) return w.content;
    if (this.deletes.has(rel)) return null;
    return this.base.read(rel);
  }

  executable(rel: string): boolean {
    const w = this.writes.get(rel);
    if (w) return w.executable;
    return this.base.executable(rel);
  }
}
