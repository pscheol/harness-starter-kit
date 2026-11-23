/**
 * 문서 머리(frontmatter) 부분 집합 파서(설계 01 §3.7.4). 템플릿 scripts/harness/sdd_frontmatter.py 와 같은 규칙이다.
 * 형식: 첫 줄 `---` 부터 다음 `---` 까지, 줄마다 `이름: 값`. 값 뒤 ` # …` 는 주석으로 뗀다.
 */
const LINE = /^([a-z][a-zA-Z0-9]*):\s*([^\n]*?)(\s+#[^\n]*)?$/;
const FENCE = "---";
const ORDER = ["key", "area", "type", "title", "status", "state", "intent", "unit", "jira", "legacy", "created"];

export class FrontmatterError extends Error {}

/** (머리 줄 목록, 본문). 머리가 없으면 [null, text]. 닫는 줄이 없으면 FrontmatterError. */
export function split(text: string): [string[] | null, string] {
  const lines = text.split("\n");
  if (lines.length === 0 || (lines[0] as string).replace(/\r$/, "") !== FENCE) return [null, text];
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] as string).replace(/\r$/, "") === FENCE) return [lines.slice(1, i), lines.slice(i + 1).join("\n")];
  }
  throw new FrontmatterError("frontmatter is not closed with ---");
}

function unquote(value: string): string {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) return value.slice(1, -1);
  return value;
}

/** 머리의 키 → 값. 머리가 없으면 null. 형식이 틀리면 FrontmatterError. */
export function parse(text: string): Record<string, string> | null {
  const [head] = split(text);
  if (head === null) return null;
  const fields: Record<string, string> = {};
  head.forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) return;
    const m = LINE.exec(line);
    if (!m) throw new FrontmatterError(`invalid frontmatter line ${i + 2}: ${JSON.stringify(line)}`);
    const key = m[1] as string;
    if (Object.hasOwn(fields, key)) throw new FrontmatterError(`duplicate frontmatter key '${key}'`);
    fields[key] = unquote((m[2] as string).trim());
  });
  return fields;
}

/** 머리를 읽되 형식 오류면 null 대신 {} 를 준다. */
export function parseLoose(text: string): Record<string, string> | null {
  try {
    return parse(text);
  } catch {
    return {};
  }
}

/**
 * 머리의 한 키 값만 바꾼 내용. 그 줄만 바꾸고 다른 줄 · 본문 · 줄바꿈은 그대로 둔다(없으면 머리 끝에 더한다).
 * Python sdd_frontmatter.update 는 머리를 다시 쓰지만, 관리 페이지는 사람이 쓴 머리 줄 순서 · 주석을 지킨다.
 */
export function setField(text: string, key: string, value: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split("\n");
  if ((lines[0] ?? "").replace(/\r$/, "") !== FENCE) return `${FENCE}${eol}${key}: ${value}${eol}${FENCE}${eol}${text}`;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] as string).replace(/\r$/, "") === FENCE) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new FrontmatterError("frontmatter is not closed with ---");
  const re = new RegExp(`^${key}:`);
  for (let i = 1; i < end; i += 1) {
    const line = lines[i] as string;
    if (re.test(line)) {
      const cr = line.endsWith("\r") ? "\r" : "";
      const comment = /(\s+#[^\n]*?)\r?$/.exec(line.replace(/^[^:]*:\s*/, ""))?.[1] ?? "";
      lines[i] = `${key}: ${value}${comment}${cr}`;
      return lines.join("\n");
    }
  }
  const cr = eol === "\r\n" ? "\r" : "";
  lines.splice(end, 0, `${key}: ${value}${cr}`);
  return lines.join("\n");
}

export function ordered(fields: Record<string, string>): [string, string][] {
  const known = ORDER.filter((k) => Object.hasOwn(fields, k)).map((k) => [k, fields[k] as string] as [string, string]);
  return [...known, ...Object.entries(fields).filter(([k]) => !ORDER.includes(k))];
}
