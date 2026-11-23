/** 토큰 값 정하기와 치환(HK-8 design §4.2). */
import { stackSpecOf, type Layout } from "./layout";

export interface TokenSources {
  /** --name · --slug · --package-ns · --protected-path · --token K=V */
  flags: Record<string, string>;
  env: Record<string, string | undefined>;
  targetBasename: string;
}

/**
 * 값: 플래그 > 환경변수(빈 값은 없는 것으로 본다) > 스택 · lang 기본값 > tokenDefaults > "".
 * tokenDefaults 의 `{KEY}` 는 이미 정한 다른 토큰 값, `{targetBasename}` 은 대상 폴더 이름이다.
 * 결과의 키 순서는 layout.tokens 순서다.
 */
export function resolveTokens(layout: Layout, sel: { stack: string; lang: string | null }, src: TokenSources): Record<string, string> {
  const spec = stackSpecOf(layout, sel.stack);
  const stackDefaults: Record<string, string> = { ...spec.tokens, ...(sel.lang && spec.lang ? spec.lang[sel.lang] : {}) };
  const done = new Map<string, string>();
  const resolving = new Set<string>();

  const valueFor = (key: string): string => {
    const known = done.get(key);
    if (known !== undefined) return known;
    if (resolving.has(key)) return "";
    resolving.add(key);
    let v: string | undefined = src.flags[key] || undefined;
    if (v === undefined) v = src.env[key] || undefined;
    if (v === undefined) v = stackDefaults[key] || undefined;
    if (v === undefined && layout.tokenDefaults[key] !== undefined) {
      v = (layout.tokenDefaults[key] as string).replace(/\{([A-Za-z_]+)\}/g, (_m, name: string) =>
        name === "targetBasename" ? src.targetBasename : valueFor(name),
      );
    }
    resolving.delete(key);
    const out = v ?? "";
    done.set(key, out);
    return out;
  };

  return Object.fromEntries(layout.tokens.map((k) => [k, valueFor(k)]));
}

function replaceAllBytes(buf: Buffer, needle: Buffer, value: Buffer): Buffer {
  let at = buf.indexOf(needle);
  if (at < 0) return buf;
  const parts: Buffer[] = [];
  let from = 0;
  while (at >= 0) {
    parts.push(buf.subarray(from, at), value);
    from = at + needle.length;
    at = buf.indexOf(needle, from);
  }
  parts.push(buf.subarray(from));
  return Buffer.concat(parts);
}

/**
 * `{{KEY}}` 를 order 순서대로 리터럴 치환한다. 값이 빈 토큰은 남긴다.
 * NUL 바이트가 있는 파일(이진)은 그대로 돌려준다.
 */
export function substitute(content: Buffer, tokens: Record<string, string>, order: string[]): Buffer {
  if (content.includes(0)) return content;
  let out = content;
  for (const key of order) {
    const value = tokens[key] ?? "";
    if (value === "") continue;
    out = replaceAllBytes(out, Buffer.from(`{{${key}}}`, "utf8"), Buffer.from(value, "utf8"));
  }
  return out;
}
