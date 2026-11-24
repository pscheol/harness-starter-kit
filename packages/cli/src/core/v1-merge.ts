/**
 * 표시 줄 없는 v1 lock(v1.0.8)의 첫 update — 구별 불가 파일(sha(C) = B ≠ sha(D))의 병합(HK-25 R1, design §2.2~§2.4).
 * update.sh 는 같은 규칙을 update/v1_merge.py 로 쓴다. test/fixtures/v1-merge 가 두 구현의 바이트를 묶는다.
 */

export type V1Kind = "kit" | "lines" | "keys" | "new";

export const MERGE_BEGIN = "<!-- knots-sync: 설치 전 내용(병합) -->";
export const MERGE_END = "<!-- /knots-sync -->";
export const MERGE_BACKUP_DIR = ".agents/state/merge-backup";
const KIT_HEADER = "HARNESS STARTER KIT";
const KIT_FOLDERS = [".agents/rules/", ".agents/skills/", ".agents/roles/"];
const HEADER_LINES = 20;
const MAX_CELLS = 1_000_000;

const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function decode(data: Buffer): string | null {
  try {
    return UTF8.decode(data);
  } catch {
    return null;
  }
}

function extension(rel: string): string {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function hasKitHeader(text: string): boolean {
  return text.split("\n").slice(0, HEADER_LINES).some((l) => l.includes(KIT_HEADER));
}

/** design §2.2 의 갈래. new 면 content 가 null 이다. */
export function planV1Merge(rel: string, current: Buffer, kit: Buffer): { kind: V1Kind; content: Buffer | null } {
  if (KIT_FOLDERS.some((f) => rel.startsWith(f))) return { kind: "kit", content: kit };
  const ext = extension(rel);
  if (ext === ".md" || ext === ".txt") {
    const text = decode(current);
    if (text !== null && hasKitHeader(text)) return { kind: "kit", content: kit };
    const merged = mergeLines(current, kit);
    return merged ? { kind: "lines", content: merged } : { kind: "new", content: null };
  }
  if (ext === ".json") {
    const merged = mergeJson(current, kit);
    return merged ? { kind: "keys", content: merged } : { kind: "new", content: null };
  }
  return { kind: "new", content: null };
}

// ── 줄 병합(design §2.3) ─────────────────────────────────────────────────────

/** [A-Za-z0-9] 나 U+0080 이상 글자가 있는 줄(빈 줄 · --- · ``` 는 기준점이 아니다). */
export function significant(line: string): boolean {
  return /[A-Za-z0-9\u0080-\uffff]/.test(line);
}

const isBlank = (line: string): boolean => /^[ \t\r]*$/.test(line);

function splitLines(text: string): { lines: string[]; eol: boolean } {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") return { lines: lines.slice(0, -1), eol: true };
  return { lines, eol: false };
}

/** a · b 의 LCS 짝(앞 · 뒤의 같은 줄을 먼저 짝짓는다). 칸 수가 MAX_CELLS 를 넘으면 null. */
function lcsPairs(a: string[], b: string[]): [number, number][] | null {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const n = midA.length;
  const m = midB.length;
  if (n * m > MAX_CELLS) return null;
  const pairs: [number, number][] = [];
  for (let k = 0; k < head; k += 1) pairs.push([k, k]);
  if (n && m) {
    const w = m + 1;
    const table = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        const below = table[(i + 1) * w + j] as number;
        const right = table[i * w + j + 1] as number;
        table[i * w + j] = midA[i] === midB[j] ? (table[(i + 1) * w + j + 1] as number) + 1 : below >= right ? below : right;
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        pairs.push([head + i, head + j]);
        i += 1;
        j += 1;
      } else if ((table[(i + 1) * w + j] as number) >= (table[i * w + j + 1] as number)) i += 1;
      else j += 1;
    }
  }
  for (let k = 0; k < tail; k += 1) pairs.push([a.length - tail + k, b.length - tail + k]);
  return pairs;
}

function frontmatterEnd(lines: string[]): number {
  if (lines[0] !== "---") return 0;
  for (let k = 1; k < lines.length; k += 1) if (lines[k] === "---") return k + 1;
  return 0;
}

export function mergeLines(current: Buffer, kit: Buffer): Buffer | null {
  const cText = decode(current);
  const dText = decode(kit);
  if (cText === null || dText === null) return null;
  const c = splitLines(cText).lines;
  const { lines: d, eol } = splitLines(dText);
  const inC = new Set(c.filter(significant));
  const inD = new Set(d.filter(significant));
  const ca = c.flatMap((l, i) => (inD.has(l) ? [i] : []));
  const da = d.flatMap((l, j) => (inC.has(l) ? [j] : []));
  const pairs = lcsPairs(
    ca.map((i) => c[i] as string),
    da.map((j) => d[j] as string),
  );
  if (pairs === null) return null;
  const anchors = pairs.map(([x, y]) => [ca[x] as number, da[y] as number] as const);
  const fmEnd = frontmatterEnd(d);
  const blocks: { at: number; lines: string[] }[] = [];
  let prevC = -1;
  for (let k = 0; k <= anchors.length; k += 1) {
    const [nextC, nextD] = k < anchors.length ? (anchors[k] as readonly [number, number]) : [c.length, d.length];
    const run = c.slice(prevC + 1, nextC).filter((l) => !(significant(l) && inD.has(l)));
    if (run.some(significant)) {
      let s = 0;
      let e = run.length;
      while (s < e && isBlank(run[s] as string)) s += 1;
      while (e > s && isBlank(run[e - 1] as string)) e -= 1;
      blocks.push({ at: Math.max(nextD, fmEnd), lines: run.slice(s, e) });
    }
    prevC = nextC;
  }
  const out: string[] = [];
  let bi = 0;
  for (let p = 0; p <= d.length; p += 1) {
    while (bi < blocks.length && (blocks[bi] as { at: number }).at === p) {
      out.push(MERGE_BEGIN, ...(blocks[bi] as { lines: string[] }).lines, MERGE_END);
      bi += 1;
    }
    if (p < d.length) out.push(d[p] as string);
  }
  return Buffer.from(out.join("\n") + (eol ? "\n" : ""), "utf8");
}

// ── 키 병합(design §2.4) ─────────────────────────────────────────────────────

type JValue = { t: "obj"; pairs: [string, JValue][] } | { t: "arr"; items: JValue[] } | { t: "str"; v: string } | { t: "raw"; v: string };

class BadJson extends Error {}

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

/** 엄격한 JSON(RFC 8259) 읽기 — 키 순서 · 숫자 글자를 그대로 둔다. 같은 객체의 같은 키 · 짝 없는 서로게이트는 거부한다. */
function parseStrict(text: string): JValue {
  let i = 0;
  const ws = (): void => {
    while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i += 1;
  };
  const str = (): string => {
    if (text[i] !== '"') throw new BadJson("문자열");
    i += 1;
    let out = "";
    for (;;) {
      if (i >= text.length) throw new BadJson("문자열 끝");
      const ch = text[i] as string;
      if (ch === '"') {
        i += 1;
        break;
      }
      if (ch < " ") throw new BadJson("제어 문자");
      if (ch === "\\") {
        const e = text[i + 1];
        if (e === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new BadJson("\\u");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (e !== undefined && Object.hasOwn(ESCAPES, e)) {
          out += ESCAPES[e];
          i += 2;
        } else throw new BadJson("이스케이프");
      } else {
        out += ch;
        i += 1;
      }
    }
    if (LONE_SURROGATE.test(out)) throw new BadJson("짝 없는 서로게이트");
    return out;
  };
  const value = (): JValue => {
    ws();
    const ch = text[i];
    if (ch === "{") {
      i += 1;
      const pairs: [string, JValue][] = [];
      const keys = new Set<string>();
      ws();
      if (text[i] === "}") {
        i += 1;
        return { t: "obj", pairs };
      }
      for (;;) {
        ws();
        const k = str();
        if (keys.has(k)) throw new BadJson("같은 키");
        keys.add(k);
        ws();
        if (text[i] !== ":") throw new BadJson(":");
        i += 1;
        pairs.push([k, value()]);
        ws();
        if (text[i] === ",") {
          i += 1;
          continue;
        }
        if (text[i] === "}") {
          i += 1;
          return { t: "obj", pairs };
        }
        throw new BadJson("객체");
      }
    }
    if (ch === "[") {
      i += 1;
      const items: JValue[] = [];
      ws();
      if (text[i] === "]") {
        i += 1;
        return { t: "arr", items };
      }
      for (;;) {
        items.push(value());
        ws();
        if (text[i] === ",") {
          i += 1;
          continue;
        }
        if (text[i] === "]") {
          i += 1;
          return { t: "arr", items };
        }
        throw new BadJson("배열");
      }
    }
    if (ch === '"') return { t: "str", v: str() };
    for (const lit of ["true", "false", "null"]) {
      if (text.startsWith(lit, i)) {
        i += lit.length;
        return { t: "raw", v: lit };
      }
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) throw new BadJson("값");
    i += m[0].length;
    return { t: "raw", v: m[0] };
  };
  const v = value();
  ws();
  if (i !== text.length) throw new BadJson("끝 뒤 글자");
  return v;
}

function parseObject(data: Buffer): Extract<JValue, { t: "obj" }> | null {
  const text = decode(data);
  if (text === null) return null;
  try {
    const v = parseStrict(text);
    return v.t === "obj" ? v : null;
  } catch {
    return null; // BadJson · 너무 깊은 중첩(RangeError)
  }
}

type JObj = Extract<JValue, { t: "obj" }>;

function mergeObj(c: JObj, d: JObj): { v: JObj; extra: boolean } {
  const cMap = new Map(c.pairs);
  const dKeys = new Set(d.pairs.map(([k]) => k));
  const pairs: [string, JValue][] = [];
  let extra = false;
  for (const [k, dv] of d.pairs) {
    const cv = cMap.get(k);
    if (cv?.t === "obj" && dv.t === "obj") {
      const r = mergeObj(cv, dv);
      pairs.push([k, r.v]);
      extra = extra || r.extra;
    } else pairs.push([k, dv]);
  }
  for (const [k, cv] of c.pairs) {
    if (!dKeys.has(k)) {
      pairs.push([k, cv]);
      extra = true;
    }
  }
  return { v: { t: "obj", pairs }, extra };
}

/** 들여쓰기 2칸 · ": " — Python json.dumps(indent=2, ensure_ascii=False) 와 같은 모양(숫자는 원래 글자). */
function dump(v: JValue, level = 0): string {
  const pad = "  ".repeat(level + 1);
  const end = "  ".repeat(level);
  switch (v.t) {
    case "obj":
      return v.pairs.length ? `{\n${v.pairs.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${dump(x, level + 1)}`).join(",\n")}\n${end}}` : "{}";
    case "arr":
      return v.items.length ? `[\n${v.items.map((x) => pad + dump(x, level + 1)).join(",\n")}\n${end}]` : "[]";
    case "str":
      return JSON.stringify(v.v);
    case "raw":
      return v.v;
  }
}

export function mergeJson(current: Buffer, kit: Buffer): Buffer | null {
  const c = parseObject(current);
  const d = parseObject(kit);
  if (!c || !d) return null;
  const r = mergeObj(c, d);
  if (!r.extra) return kit;
  return Buffer.from(`${dump(r.v)}\n`, "utf8");
}

/** 백업 시각 폴더 이름(UTC YYYYMMDDTHHMMSSZ). update.sh 는 date -u +%Y%m%dT%H%M%SZ */
export function backupStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
