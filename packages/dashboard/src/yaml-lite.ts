/**
 * SKILL.md 머리용 작은 YAML 해석기(설계 07 §3.2). 런타임 의존성 0.
 * 읽는 것: 맵(들여쓰기로 안쪽 맵) · 블록 배열(`- x`) · 흐름 배열(`[a, b]`) · 흐름 맵(`{a: b}`) · 따옴표 문자열 ·
 * 이어지는 줄(plain 여러 줄) · `|` `>` 블록 문자열 · 논리값 · 정수 · 실수 · null.
 * 오류로 보는 것: 별칭(`*`) · 앵커(`&`) · 태그(`!`) · 탭 들여쓰기 · 깊이 8 초과 · 같은 키 두 번 · 안 닫힌 따옴표 · 배열 · 맵 섞임.
 */
export class YamlError extends Error {}

const MAX_DEPTH = 8;

interface Line {
  indent: number;
  text: string;
  no: number;
}

function stripComment(s: string): string {
  let quote = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] as string;
    if (quote) {
      if (c === "\\" && quote === '"') i += 1;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s[{,:]/.test(s[i - 1] as string)) quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(s[i - 1] as string))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

function dq(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] as string;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = s[++i];
    if (n === "n") out += "\n";
    else if (n === "t") out += "\t";
    else if (n === "r") out += "\r";
    else if (n === "0") out += "\0";
    else if (n === "u") {
      const hex = s.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new YamlError("잘못된 \\u 이스케이프");
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else if (n === undefined) throw new YamlError("끝의 역슬래시");
    else out += n;
  }
  return out;
}

function scalar(raw: string): unknown {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL") return null;
  if (s === "true" || s === "True" || s === "TRUE") return true;
  if (s === "false" || s === "False" || s === "FALSE") return false;
  if (/^[-+]?(0|[1-9][0-9]*)$/.test(s)) return Number(s);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s);
  return s;
}

/** 따옴표 · 흐름 · plain 한 값 하나. 값이 끝난 뒤 남는 글이 있으면 오류. */
function value(raw: string, depth: number): unknown {
  const s = raw.trim();
  if (depth > MAX_DEPTH) throw new YamlError("깊이 8 초과");
  if (s === "") return null;
  const c = s[0] as string;
  if (c === "*") throw new YamlError("별칭(*)은 쓸 수 없다");
  if (c === "&") throw new YamlError("앵커(&)는 쓸 수 없다");
  if (c === "!") throw new YamlError("태그(!)는 쓸 수 없다");
  if (c === '"') {
    const end = closing(s, '"');
    if (s.slice(end + 1).trim()) throw new YamlError("따옴표 뒤에 글이 남았다");
    return dq(s.slice(1, end));
  }
  if (c === "'") {
    const end = closing(s, "'");
    if (s.slice(end + 1).trim()) throw new YamlError("따옴표 뒤에 글이 남았다");
    return s.slice(1, end).replace(/''/g, "'");
  }
  if (c === "[") return flow(s, depth);
  if (c === "{") return flow(s, depth);
  if (c === "@" || c === "`") throw new YamlError(`예약된 첫 글자 ${c}`);
  return scalar(s);
}

function closing(s: string, q: string): number {
  for (let i = 1; i < s.length; i += 1) {
    const c = s[i] as string;
    if (q === '"' && c === "\\") {
      i += 1;
      continue;
    }
    if (c === q) {
      if (q === "'" && s[i + 1] === "'") {
        i += 1;
        continue;
      }
      return i;
    }
  }
  throw new YamlError("따옴표가 닫히지 않았다");
}

function flow(s: string, depth: number): unknown {
  let i = 0;
  const ws = (): void => {
    while (i < s.length && /\s/.test(s[i] as string)) i += 1;
  };
  const item = (d: number): unknown => {
    ws();
    if (d > MAX_DEPTH) throw new YamlError("깊이 8 초과");
    const c = s[i];
    if (c === "[") {
      i += 1;
      const out: unknown[] = [];
      ws();
      if (s[i] === "]") {
        i += 1;
        return out;
      }
      for (;;) {
        out.push(item(d + 1));
        ws();
        if (s[i] === ",") {
          i += 1;
          ws();
          if (s[i] === "]") {
            i += 1;
            return out;
          }
          continue;
        }
        if (s[i] === "]") {
          i += 1;
          return out;
        }
        throw new YamlError("흐름 배열이 닫히지 않았다");
      }
    }
    if (c === "{") {
      i += 1;
      const out: Record<string, unknown> = {};
      ws();
      if (s[i] === "}") {
        i += 1;
        return out;
      }
      for (;;) {
        ws();
        const k = String(item(d + 1));
        ws();
        if (s[i] !== ":") throw new YamlError("흐름 맵의 ':' 가 없다");
        i += 1;
        if (Object.hasOwn(out, k)) throw new YamlError(`같은 키 ${k}`);
        out[k] = item(d + 1);
        ws();
        if (s[i] === ",") {
          i += 1;
          continue;
        }
        if (s[i] === "}") {
          i += 1;
          return out;
        }
        throw new YamlError("흐름 맵이 닫히지 않았다");
      }
    }
    if (c === '"' || c === "'") {
      const end = closing(s.slice(i), c) + i;
      const lit = s.slice(i, end + 1);
      i = end + 1;
      return value(lit, d);
    }
    let j = i;
    while (j < s.length && !",]}".includes(s[j] as string) && !(s[j] === ":" && /[\s]/.test(s[j + 1] ?? " "))) j += 1;
    const lit = s.slice(i, j);
    i = j;
    return value(lit, d);
  };
  const out = item(depth);
  ws();
  if (i < s.length) throw new YamlError("흐름 값 뒤에 글이 남았다");
  return out;
}

function lines(text: string): Line[] {
  const out: Line[] = [];
  text.split("\n").forEach((raw, n) => {
    const line = raw.replace(/\r$/, "");
    if (/^\t/.test(line) || /^ *\t/.test(line)) {
      if (line.trim()) throw new YamlError(`탭 들여쓰기(${n + 1}째 줄)`);
    }
    out.push({ indent: line.length - line.trimStart().length, text: line.trimStart(), no: n + 1 });
  });
  return out;
}

class Reader {
  i = 0;
  constructor(readonly all: Line[]) {}

  skipBlank(): void {
    while (this.i < this.all.length && (this.all[this.i] as Line).text.trim() === "") this.i += 1;
  }
  peek(): Line | null {
    this.skipBlank();
    return this.i < this.all.length ? (this.all[this.i] as Line) : null;
  }
}

function blockScalar(r: Reader, header: string, parentIndent: number): string {
  const m = /^([|>])([+-]?)([1-9]?)$/.exec(header.trim());
  if (!m) throw new YamlError(`블록 문자열 머리가 틀렸다: ${header}`);
  const [, style, chomp] = m;
  const body: { indent: number; text: string }[] = [];
  let contentIndent = -1;
  while (r.i < r.all.length) {
    const l = r.all[r.i] as Line;
    if (l.text.trim() === "") {
      body.push({ indent: 0, text: "" });
      r.i += 1;
      continue;
    }
    if (l.indent <= parentIndent) break;
    if (contentIndent < 0) contentIndent = l.indent;
    if (l.indent < contentIndent) break;
    body.push({ indent: l.indent, text: " ".repeat(l.indent - contentIndent) + l.text });
    r.i += 1;
  }
  while (body.length && (body[body.length - 1] as { text: string }).text === "" && chomp !== "+") body.pop();
  let out: string;
  if (style === "|") out = body.map((b) => b.text).join("\n");
  else {
    out = "";
    body.forEach((b, k) => {
      if (k === 0) out = b.text;
      else if (b.text === "") out += "\n";
      else if (body[k - 1] && (body[k - 1] as { text: string }).text === "") out += b.text;
      else out += ` ${b.text}`;
    });
  }
  return chomp === "-" || body.length === 0 ? out : `${out}\n`;
}

function parseBlock(r: Reader, indent: number, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new YamlError("깊이 8 초과");
  const first = r.peek();
  if (!first) return null;
  if (first.text.startsWith("- ") || first.text === "-") return parseSeq(r, first.indent, depth);
  return parseMap(r, indent < 0 ? first.indent : first.indent, depth);
}

function parseSeq(r: Reader, indent: number, depth: number): unknown[] {
  const out: unknown[] = [];
  for (;;) {
    const l = r.peek();
    if (!l || l.indent !== indent || !(l.text.startsWith("- ") || l.text === "-")) {
      if (l && l.indent > indent) throw new YamlError(`들여쓰기가 맞지 않다(${l.no}째 줄)`);
      return out;
    }
    r.i += 1;
    const rest = stripComment(l.text.slice(1).trim());
    if (rest === "") {
      const nxt = r.peek();
      out.push(nxt && nxt.indent > indent ? parseBlock(r, nxt.indent, depth + 1) : null);
    } else if (/^[^"'[{&*!|>#][^:]*:(\s|$)/.test(rest) || /^"[^"]*":(\s|$)/.test(rest)) {
      // "- key: value" — 안쪽 맵을 같은 들여쓰기 칸으로 읽는다
      const inner = indent + 2;
      r.i -= 1;
      (r.all[r.i] as Line) = { indent: inner, text: rest, no: l.no };
      out.push(parseMap(r, inner, depth + 1));
    } else if (rest[0] === "|" || rest[0] === ">") out.push(blockScalar(r, rest, indent));
    else out.push(value(rest, depth + 1));
  }
}

function parseMap(r: Reader, indent: number, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (;;) {
    const l = r.peek();
    if (!l || l.indent < indent) return out;
    if (l.indent > indent) throw new YamlError(`들여쓰기가 맞지 않다(${l.no}째 줄)`);
    if (l.text.startsWith("- ") || l.text === "-") return out;
    const text = stripComment(l.text);
    const m = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s:#][^:]*?)\s*:(?:\s+(.*))?$/.exec(text);
    if (!m) throw new YamlError(`'키: 값' 모양이 아니다(${l.no}째 줄)`);
    let key = m[1] as string;
    if (key[0] === '"' || key[0] === "'") key = String(value(key, depth));
    else if (/^[&*!]/.test(key)) throw new YamlError("키에 별칭 · 앵커 · 태그를 쓸 수 없다");
    if (key === "<<") throw new YamlError("병합 키(<<)는 쓸 수 없다");
    if (Object.hasOwn(out, key)) throw new YamlError(`같은 키 ${key}(${l.no}째 줄)`);
    r.i += 1;
    const rest = (m[2] ?? "").trim();
    if (rest === "") {
      const nxt = r.peek();
      if (nxt && (nxt.indent > indent || (nxt.indent === indent && (nxt.text.startsWith("- ") || nxt.text === "-")))) {
        out[key] = parseBlock(r, nxt.indent, depth + 1);
      } else out[key] = null;
    } else if (rest[0] === "|" || rest[0] === ">") out[key] = blockScalar(r, rest, indent);
    else {
      // plain 값이 다음 줄들로 이어진다(들여쓴 줄)
      let cur = rest;
      if (!/^["'[{]/.test(cur)) {
        for (;;) {
          const nxt = r.all[r.i];
          if (!nxt) break;
          if (nxt.text.trim() === "") {
            const after = r.all.slice(r.i).find((x) => x.text.trim() !== "");
            if (after && after.indent > indent) {
              cur += "\n";
              r.i += 1;
              continue;
            }
            break;
          }
          if (nxt.indent <= indent) break;
          cur += ` ${stripComment(nxt.text)}`;
          r.i += 1;
        }
        cur = cur.replace(/ ?\n ?/g, " ").trim();
      } else if (cur[0] === "[" || cur[0] === "{") {
        // 흐름 값이 여러 줄이면 닫힐 때까지 잇는다
        let guard = 0;
        while (!flowClosed(cur) && r.i < r.all.length && guard < 200) {
          cur += ` ${stripComment((r.all[r.i] as Line).text)}`;
          r.i += 1;
          guard += 1;
        }
      }
      out[key] = value(cur, depth + 1);
    }
  }
}

function flowClosed(s: string): boolean {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] as string;
    if (quote) {
      if (c === "\\" && quote === '"') i += 1;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{") depth += 1;
    else if (c === "]" || c === "}") depth -= 1;
  }
  return depth <= 0;
}

/** 머리 본문(--- 사이)을 읽는다. 맵이 아니면 오류. */
export function parseYaml(text: string): Record<string, unknown> {
  const r = new Reader(lines(text));
  const first = r.peek();
  if (!first) return {};
  const res = parseBlock(r, first.indent, 0);
  if (r.peek()) throw new YamlError(`읽지 못한 줄이 남았다(${(r.peek() as Line).no}째 줄)`);
  if (res === null || typeof res !== "object" || Array.isArray(res)) throw new YamlError("머리가 맵이 아니다");
  return res as Record<string, unknown>;
}
