/**
 * templates/layout.json 읽기와 해석(HK-8 design §3).
 * setup.sh · harness-lib.sh 의 매핑(harness_agent_of · harness_remap · harness_dest_name ·
 * harness_is_executable · list_layer · 스택 기본값)을 데이터로 옮긴 것이다.
 */
import fs from "node:fs";
import path from "node:path";
import { CliError, EXIT } from "./errors";

export const LAYOUT_SCHEMA = "harness-kit.layout/v1";

export interface LayerSpec {
  id: string;
  dir: string;
  whenExists: boolean;
  exclude: string[];
  each: "modules" | null;
}

export interface Segment {
  from: string;
  to: string;
  harness: string | null;
}

export interface StackSpec {
  domain: string | null;
  defaultArch: string;
  tokens: Record<string, string>;
  lang: Record<string, Record<string, string>> | null;
}

export interface HarnessDetect {
  dirs: string[];
  env: string[];
}

export interface Layout {
  schema: string;
  ignore: string[];
  overlap: "first" | "last";
  layers: LayerSpec[];
  segments: Segment[];
  pathTokens: Record<string, string>;
  executable: string[];
  executableRe: RegExp[];
  tokens: string[];
  harnesses: string[];
  harnessDetect: Record<string, HarnessDetect>;
  defaultHarnesses: string[];
  modules: string[];
  domains: string[];
  defaultStack: string;
  stacks: Record<string, StackSpec>;
  stackFallback: StackSpec;
  tokenDefaults: Record<string, string>;
}

function bad(message: string): CliError {
  return new CliError(EXIT.ENV, `layout.json 형식 오류: ${message}`);
}

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw bad(`${what} 는 객체여야 한다`);
  return v as Obj;
}

function str(v: unknown, what: string): string {
  if (typeof v !== "string") throw bad(`${what} 는 문자열이어야 한다`);
  return v;
}

function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw bad(`${what} 는 문자열 배열이어야 한다`);
  return [...(v as string[])];
}

function strMap(v: unknown, what: string): Record<string, string> {
  const o = obj(v, what);
  for (const [k, x] of Object.entries(o)) str(x, `${what}.${k}`);
  return { ...(o as Record<string, string>) };
}

function stackSpec(v: unknown, what: string): StackSpec {
  const o = obj(v, what);
  const domain = o.domain === null || o.domain === undefined ? null : str(o.domain, `${what}.domain`);
  let lang: StackSpec["lang"] = null;
  if (o.lang !== undefined) {
    const l = obj(o.lang, `${what}.lang`);
    lang = Object.fromEntries(Object.entries(l).map(([k, x]) => [k, strMap(x, `${what}.lang.${k}`)]));
  }
  return { domain, defaultArch: str(o.defaultArch, `${what}.defaultArch`), tokens: strMap(o.tokens ?? {}, `${what}.tokens`), lang };
}

/** glob → 정규식. `**` 는 `/` 를 넘고(`**\/` 는 0개 이상의 폴더), `*` · `?` 는 넘지 않는다. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i] as string;
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function parseLayout(raw: unknown): Layout {
  const o = obj(raw, "layout");
  if (o.schema !== LAYOUT_SCHEMA) throw bad(`schema 가 ${LAYOUT_SCHEMA} 가 아니다 (${String(o.schema)})`);
  if (o.overlap !== "first" && o.overlap !== "last") throw bad("overlap 은 first 또는 last");
  if (!Array.isArray(o.layers) || o.layers.length === 0) throw bad("layers 가 비었다");
  if (!Array.isArray(o.segments) || o.segments.length === 0) throw bad("segments 가 비었다");
  const layers = o.layers.map((l, i): LayerSpec => {
    const x = obj(l, `layers[${i}]`);
    if (x.each !== undefined && x.each !== "modules") throw bad(`layers[${i}].each 는 modules 만 된다`);
    return {
      id: str(x.id, `layers[${i}].id`),
      dir: str(x.dir, `layers[${i}].dir`),
      whenExists: x.whenExists === true,
      exclude: x.exclude === undefined ? [] : strList(x.exclude, `layers[${i}].exclude`),
      each: x.each === "modules" ? "modules" : null,
    };
  });
  const segments = o.segments.map((s, i): Segment => {
    const x = obj(s, `segments[${i}]`);
    const harness = x.harness === null ? null : str(x.harness, `segments[${i}].harness`);
    return { from: str(x.from, `segments[${i}].from`), to: str(x.to, `segments[${i}].to`), harness };
  });
  const stacksRaw = obj(o.stacks, "stacks");
  const executable = strList(o.executable, "executable");
  const detectRaw = obj(o.harnessDetect ?? {}, "harnessDetect");
  return {
    schema: LAYOUT_SCHEMA,
    ignore: strList(o.ignore, "ignore"),
    overlap: o.overlap,
    layers,
    segments,
    pathTokens: strMap(o.pathTokens ?? {}, "pathTokens"),
    executable,
    executableRe: executable.map(globToRegExp),
    tokens: strList(o.tokens, "tokens"),
    harnesses: strList(o.harnesses, "harnesses"),
    harnessDetect: Object.fromEntries(
      Object.entries(detectRaw).map(([k, v]) => {
        const d = obj(v, `harnessDetect.${k}`);
        return [k, { dirs: strList(d.dirs ?? [], `harnessDetect.${k}.dirs`), env: strList(d.env ?? [], `harnessDetect.${k}.env`) }];
      }),
    ),
    defaultHarnesses: strList(o.defaultHarnesses ?? [], "defaultHarnesses"),
    modules: strList(o.modules, "modules"),
    domains: strList(o.domains, "domains"),
    defaultStack: str(o.defaultStack, "defaultStack"),
    stacks: Object.fromEntries(Object.entries(stacksRaw).map(([k, v]) => [k, stackSpec(v, `stacks.${k}`)])),
    stackFallback: stackSpec(o.stackFallback ?? { defaultArch: "hexagonal" }, "stackFallback"),
    tokenDefaults: strMap(o.tokenDefaults ?? {}, "tokenDefaults"),
  };
}

export function loadLayout(templatesDir: string): Layout {
  const file = path.join(templatesDir, "layout.json");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new CliError(EXIT.ENV, `layout.json 이 없다: ${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw bad(err instanceof Error ? err.message : String(err));
  }
  return parseLayout(raw);
}

/** 위에서 처음 맞는 세그먼트. `from` 이 `/` 로 끝나거나 비었으면 접두 일치, 아니면 정확히 일치. */
export function matchSegment(layout: Layout, rel: string): Segment {
  for (const seg of layout.segments) {
    const prefix = seg.from === "" || seg.from.endsWith("/");
    if (prefix ? rel.startsWith(seg.from) : rel === seg.from) return seg;
  }
  throw bad(`어느 세그먼트에도 맞지 않는다: ${rel} (마지막 세그먼트는 from "" 이어야 한다)`);
}

/** 설치 경로 속 경로 토큰을 값으로 바꾼다. 값이 비면 그대로 둔다(harness_dest_name). */
export function applyPathTokens(layout: Layout, rel: string, tokens: Record<string, string>): string {
  let out = rel;
  for (const [needle, key] of Object.entries(layout.pathTokens)) {
    const value = tokens[key] ?? "";
    if (value !== "") out = out.split(needle).join(value);
  }
  return out;
}

/** 레이어 안 상대 경로 → 설치 경로와 하네스(null = core). */
export function mapPath(layout: Layout, rel: string, tokens: Record<string, string>): { dest: string; harness: string | null } {
  const seg = matchSegment(layout, rel);
  const dest = seg.from.endsWith("/") || seg.from === "" ? seg.to + rel.slice(seg.from.length) : seg.to;
  return { dest: applyPathTokens(layout, dest, tokens), harness: seg.harness };
}

export function isExecutable(layout: Layout, dest: string): boolean {
  return layout.executableRe.some((re) => re.test(dest));
}

export function stackSpecOf(layout: Layout, stack: string): StackSpec {
  return layout.stacks[stack] ?? layout.stackFallback;
}
