/**
 * npm 팩 tgz 풀기(HK-14 design §3.2). Node 표준 zlib + 작은 ustar 해석기 — 런타임 의존성 0 을 지킨다(02).
 * 일반 파일 · 폴더만 받는다. 링크 · 장치 파일 · 리포 밖 경로는 거부한다.
 */
import zlib from "node:zlib";

export interface TarFile {
  path: string;
  data: Buffer;
  mode: number;
}

const BLOCK = 512;

function text(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len);
  const end = slice.indexOf(0);
  return slice.subarray(0, end < 0 ? slice.length : end).toString("utf8");
}

function octal(buf: Buffer, start: number, len: number): number {
  const s = text(buf, start, len).trim();
  return s ? Number.parseInt(s, 8) : 0;
}

/** pax 확장 머리(`<길이> <키>=<값>\n` 묶음)의 path. */
function paxPath(data: Buffer): string | null {
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    if (sp < 0) break;
    const len = Number.parseInt(data.subarray(i, sp).toString("utf8"), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const rec = data.subarray(sp + 1, i + len - 1).toString("utf8");
    const eq = rec.indexOf("=");
    if (eq > 0 && rec.slice(0, eq) === "path") return rec.slice(eq + 1);
    i += len;
  }
  return null;
}

function safe(p: string): boolean {
  return p !== "" && !p.startsWith("/") && !p.split("/").includes("..") && !p.includes("\\") && !p.includes("\0");
}

/** gzip 된 tar → 파일 목록(폴더는 뺀다). 형식이 틀리거나 받지 않는 종류면 Error. */
export function untgz(gz: Buffer): TarFile[] {
  const buf = zlib.gunzipSync(gz);
  const out: TarFile[] = [];
  let off = 0;
  let longName: string | null = null;
  while (off + BLOCK <= buf.length) {
    const header = buf.subarray(off, off + BLOCK);
    if (header.every((b) => b === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const prefix = text(header, 345, 155);
    let name = longName ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100));
    longName = null;
    const dataStart = off + BLOCK;
    const data = buf.subarray(dataStart, dataStart + size);
    off = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "x") {
      longName = paxPath(data);
      continue;
    }
    if (type === "L") {
      longName = data.toString("utf8").replace(/\0+$/, "");
      continue;
    }
    if (type === "g") continue;
    name = name.replace(/^\.\//, "");
    if (type === "5") continue;
    if (type !== "0" && type !== "\0" && type !== "7") throw new Error(`tar 항목 종류 '${type}' 는 받지 않는다(링크 · 장치): ${name}`);
    if (!safe(name)) throw new Error(`tar 항목 경로가 안전하지 않다: ${name}`);
    out.push({ path: name, data: Buffer.from(data), mode: octal(header, 100, 8) });
  }
  return out;
}
