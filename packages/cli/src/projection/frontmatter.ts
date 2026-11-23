/**
 * 원본 머리(frontmatter) 해석 — YAML 의 작은 부분만(HK-13 design §3).
 * `키: 값`, 따옴표, `[…]` 흐름 목록, `{키: 값}` 흐름 표, 블록 목록(`  - 값`).
 * Python `scripts/harness/projection_render.py` 와 같은 결과를 낸다(시험이 묶는다).
 */
export type FmValue = string | string[] | Record<string, string>;
export type Frontmatter = Record<string, FmValue>;

const FM_KEY = /^([A-Za-z0-9_-]+):(.*)$/;
const LIST_ITEM = /^\s+-\s?(.*)$/;

/** `---` 로 열고 닫은 머리와 본문. 머리가 없거나 닫히지 않았으면 block null. */
export function splitFrontmatter(text: string): { block: string | null; body: string } {
  if (!text.startsWith("---\n")) return { block: null, body: text };
  const end = text.indexOf("\n---\n", 3);
  if (end < 0) return { block: null, body: text };
  return { block: end >= 4 ? text.slice(4, end) : "", body: text.slice(end + 5) };
}

function splitFlow(inner: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote = "";
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() || parts.length) parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

/** Python str.strip() 과 같은 공백(ASCII 공백 · 탭 · 줄바꿈 등). */
function strip(s: string): string {
  return s.replace(/^[\s]+|[\s]+$/g, "");
}

export function scalar(raw: string): string {
  const v = strip(raw);
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
    try {
      const out: unknown = JSON.parse(v);
      return typeof out === "string" ? out : v.slice(1, -1);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") return v.slice(1, -1).split("''").join("'");
  return v;
}

export function parseFrontmatter(block: string): Frontmatter {
  const out: Frontmatter = {};
  const lines = block.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    i += 1;
    const m = FM_KEY.exec(line);
    if (!m) continue;
    const key = m[1] as string;
    const raw = strip(m[2] as string);
    if (raw === "") {
      const items: string[] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i] as string)) {
        items.push(scalar((LIST_ITEM.exec(lines[i] as string) as RegExpExecArray)[1] as string));
        i += 1;
      }
      out[key] = items.length ? items : "";
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      out[key] = splitFlow(raw.slice(1, -1)).map(scalar);
    } else if (raw.startsWith("{") && raw.endsWith("}")) {
      const table: Record<string, string> = {};
      for (const p of splitFlow(raw.slice(1, -1))) {
        const at = p.indexOf(":");
        if (at >= 0) table[scalar(p.slice(0, at))] = scalar(p.slice(at + 1));
      }
      out[key] = table;
    } else out[key] = scalar(raw);
  }
  return out;
}

export function fmStr(fm: Frontmatter, key: string): string {
  const v = fm[key];
  return typeof v === "string" ? v : "";
}

export function fmList(fm: Frontmatter, key: string): string[] {
  const v = fm[key];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x !== "");
  if (typeof v === "string" && v !== "") return [v];
  return [];
}
