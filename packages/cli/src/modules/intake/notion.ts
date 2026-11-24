/**
 * Notion 접수 출처(설계 10 §3.6). 페이지 한 장 또는 "요구사항" 데이터베이스 항목을 읽어 Markdown 으로 바꾼다.
 * 토큰은 환경 변수 NOTION_TOKEN 에서만 읽는다(리포 · harness-kit.json 에 쓰지 않는다). 쓰기(writeBack)는 설정이 켜졌을 때만 한다.
 * 블록 → Markdown 은 결정적이다. 파일 · 이미지 블록은 첨부로 내려받고, 서명된 주소(S3)는 인증 헤더 없이 받는다.
 */
import { CliError, EXIT } from "../../core/errors";
import { checkBaseUrl, makeRequester, type HttpOptions, type Requester } from "../http";
import type { Imported } from "./types";

const VERSION = "2022-06-28";
const ID32 = /([0-9a-f]{32})(?![0-9a-f])/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NotionConfig {
  database: string | null;
  properties: { title?: string; kind?: string; status?: string; key?: string };
  kindMap: Record<string, string>;
  writeBack: boolean;
}

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string => (typeof v === "string" ? v : "");

export function notionConfigOf(meta: Record<string, unknown>): NotionConfig {
  const n = o(meta.notion);
  const props = o(n.properties);
  const strs = (v: unknown): Record<string, string> => Object.fromEntries(Object.entries(o(v)).filter(([, x]) => typeof x === "string")) as Record<string, string>;
  return { database: s(n.database) || null, properties: strs(props), kindMap: strs(n.kindMap), writeBack: n.writeBack === true };
}

/** 페이지 URL · 32자리 id · 하이픈 id → 하이픈 있는 UUID. */
export function notionIdOf(ref: string): string {
  const raw = ref.trim();
  if (UUID.test(raw)) return raw.toLowerCase();
  let target = raw;
  try {
    const u = new URL(raw);
    if (!/(^|\.)notion\.(so|site)$/.test(u.hostname)) throw new CliError(EXIT.USAGE, `Notion 주소가 아니다: ${u.hostname}`);
    target = u.pathname;
  } catch (err) {
    if (err instanceof CliError) throw err;
  }
  const m = ID32.exec(target.replace(/-/g, ""));
  if (!m) throw new CliError(EXIT.USAGE, `Notion 페이지 id 를 찾지 못했다: ${ref}`, "페이지 URL 또는 32자리 id 를 준다");
  const h = (m[1] as string).toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function notionToken(env: Record<string, string | undefined>): string {
  const t = env.NOTION_TOKEN;
  if (!t) throw new CliError(EXIT.ENV, "Notion 인증이 없다: 환경 변수 NOTION_TOKEN 에 통합 토큰을 넣는다", "토큰은 리포 · harness-kit.json 에 쓰지 않는다. 통합에 그 페이지를 공유해야 읽힌다");
  return t;
}

export interface NotionApi {
  page(id: string): Promise<Obj>;
  children(id: string): Promise<Obj[]>;
  patchPage(id: string, properties: Obj): Promise<void>;
  download(url: string, maxBytes: number): Promise<Buffer>;
}

export function makeNotionApi(token: string, env: Record<string, string | undefined>, opts: HttpOptions = {}): NotionApi {
  // NOTION_API_BASE 는 시험 · 사내 프록시용이다. https 가 아니면 루프백만 허용한다.
  const base = checkBaseUrl(env.NOTION_API_BASE || "https://api.notion.com");
  const http: Requester = makeRequester(base, { Authorization: `Bearer ${token}`, "Notion-Version": VERSION }, [token], opts);
  return {
    page: async (id) => o(await http.json("GET", `/v1/pages/${id}`)),
    async children(id) {
      const out: Obj[] = [];
      let cursor = "";
      for (let page = 0; page < 100; page += 1) {
        const res = o(await http.json("GET", `/v1/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`));
        out.push(...a(res.results).map(o));
        if (res.has_more !== true || !s(res.next_cursor)) break;
        cursor = s(res.next_cursor);
      }
      return out;
    },
    async patchPage(id, properties) {
      await http.json("PATCH", `/v1/pages/${id}`, { properties });
    },
    download: (url, maxBytes) => http.bytes(url, maxBytes),
  };
}

// ── rich text · 속성 ────────────────────────────────────────────────────────
function rich(list: unknown): string {
  return a(list)
    .map((x) => {
      const r = o(x);
      const raw = s(r.plain_text);
      const lead = /^\s*/.exec(raw)?.[0] ?? "";
      const trail = raw.trim() ? (/\s*$/.exec(raw)?.[0] ?? "") : "";
      let t = raw.trim();
      if (!t) return raw;
      const ann = o(r.annotations);
      if (ann.code === true) t = `\`${t}\``;
      if (ann.bold === true) t = `**${t}**`;
      if (ann.italic === true) t = `*${t}*`;
      if (ann.strikethrough === true) t = `~~${t}~~`;
      const href = s(r.href);
      return `${lead}${href ? `[${t}](${href})` : t}${trail}`;
    })
    .join("");
}

const plain = (list: unknown): string => a(list).map((x) => s(o(x).plain_text)).join("");

export function propertyText(p: Obj): string {
  const t = s(p.type);
  const v = p[t];
  switch (t) {
    case "title":
    case "rich_text":
      return plain(v);
    case "select":
    case "status":
      return s(o(v).name);
    case "multi_select":
      return a(v).map((x) => s(o(x).name)).join(", ");
    case "number":
      return v === null || v === undefined ? "" : String(v);
    case "checkbox":
      return v === true ? "예" : "아니오";
    case "date":
      return o(v).start ? `${s(o(v).start)}${o(v).end ? ` ~ ${s(o(v).end)}` : ""}` : "";
    case "url":
    case "email":
    case "phone_number":
      return s(v);
    case "people":
      return a(v).map((x) => s(o(x).name)).filter(Boolean).join(", ");
    case "relation":
      return `${a(v).length}건`;
    case "formula": {
      const f = o(v);
      return String(f[s(f.type)] ?? "");
    }
    case "created_time":
    case "last_edited_time":
      return s(v);
    default:
      return "";
  }
}

const cell = (x: string): string => x.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function propertiesTable(page: Obj, titleName: string): string {
  const rows = Object.entries(o(page.properties))
    .filter(([name, prop]) => name !== titleName && s(o(prop).type) !== "title")
    .map(([name, prop]) => [name, propertyText(o(prop))] as const)
    .filter(([, v]) => v !== "");
  if (rows.length === 0) return "";
  return ["| 속성 | 값 |", "|---|---|", ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`)].join("\n");
}

// ── 블록 → Markdown ─────────────────────────────────────────────────────────
interface Ctx {
  api: NotionApi;
  attachments: Imported["attachments"];
  links: string[];
  warnings: string[];
  maxBytes: number;
  depth: number;
  visited: Set<string>;
  versions: string[];
}

const HEAD: Record<string, string> = { heading_1: "###", heading_2: "####", heading_3: "#####" };

function fileOf(block: Obj): { name: string; url: string; external: boolean } | null {
  const t = s(block.type);
  const f = o(block[t]);
  const kind = s(f.type);
  const url = s(o(f[kind]).url);
  if (!url) return null;
  const caption = plain(f.caption);
  const tail = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "") || t;
  return { name: s(f.name) || (/\.[A-Za-z0-9]{1,5}$/.test(tail) ? tail : `${caption || t}-${tail}`), url, external: kind === "external" };
}

async function takeFile(block: Obj, ctx: Ctx): Promise<string> {
  const f = fileOf(block);
  if (!f) return "";
  const label = f.name;
  if (f.external) {
    ctx.links.push(f.url);
    return `[${label}](${f.url})`;
  }
  try {
    const data = await ctx.api.download(f.url, ctx.maxBytes);
    ctx.attachments.push({ name: label.replace(/[\\/\0]/g, "-"), data });
    return `(첨부: ${label})`;
  } catch (err) {
    ctx.warnings.push(`${label}: 내려받지 못했다(${err instanceof Error ? err.message : String(err)})`);
    return `(첨부 못 받음: ${label})`;
  }
}

async function render(blocks: Obj[], ctx: Ctx, indent: string, level: number): Promise<string[]> {
  const out: string[] = [];
  let n = 0;
  let listOpen = false;
  for (const b of blocks) {
    const t = s(b.type);
    const body = o(b[t]);
    const isList = ["bulleted_list_item", "numbered_list_item", "to_do", "toggle"].includes(t);
    if (!isList && listOpen && out.length && out[out.length - 1] !== "") out.push("");
    listOpen = isList;
    const text = rich(body.rich_text);
    n = t === "numbered_list_item" ? n + 1 : 0;
    const kids = b.has_children === true && !["child_page", "child_database", "table"].includes(t) ? await ctx.api.children(s(b.id)) : [];
    const sub = async (extra: string): Promise<string[]> => (kids.length ? render(kids, ctx, indent + extra, level) : []);
    switch (t) {
      case "paragraph":
        out.push(`${indent}${text}`, ...(await sub("")), "");
        break;
      case "heading_1":
      case "heading_2":
      case "heading_3":
        out.push(`${HEAD[t]} ${text}`, "", ...(await sub("")));
        break;
      case "bulleted_list_item":
        out.push(`${indent}- ${text}`, ...(await sub("  ")));
        break;
      case "numbered_list_item":
        out.push(`${indent}${n}. ${text}`, ...(await sub("   ")));
        break;
      case "to_do":
        out.push(`${indent}- [${body.checked === true ? "x" : " "}] ${text}`, ...(await sub("  ")));
        break;
      case "toggle":
        out.push(`${indent}- ${text}`, ...(await sub("  ")));
        break;
      case "quote":
      case "callout":
        out.push(...[text, ...(await sub(""))].join("\n").split("\n").map((l) => `${indent}> ${l}`), "");
        break;
      case "code":
        out.push(`${indent}\`\`\`${s(body.language) === "plain text" ? "" : s(body.language)}`, ...plain(body.rich_text).split("\n").map((l) => indent + l), `${indent}\`\`\``, "");
        break;
      case "divider":
        out.push("---", "");
        break;
      case "equation":
        out.push(`$$${s(body.expression)}$$`, "");
        break;
      case "table": {
        const rows = (await ctx.api.children(s(b.id))).map((r) => a(o(o(r).table_row).cells).map((c) => cell(rich(c))));
        if (rows.length) {
          const w = Math.max(...rows.map((r) => r.length));
          const line = (r: string[]): string => `| ${[...r, ...Array(w - r.length).fill("")].join(" | ")} |`;
          out.push(line(rows[0] as string[]), `|${"---|".repeat(w)}`, ...rows.slice(1).map(line), "");
        }
        break;
      }
      case "image":
      case "file":
      case "pdf":
      case "video":
      case "audio": {
        const link = await takeFile(b, ctx);
        const caption = plain(body.caption);
        if (link) out.push(`${indent}${link}${caption && !link.includes(caption) ? ` — ${caption}` : ""}`, "");
        break;
      }
      case "bookmark":
      case "embed":
      case "link_preview": {
        const url = s(body.url);
        if (url) {
          ctx.links.push(url);
          out.push(`${indent}<${url}>`, "");
        }
        break;
      }
      case "child_page": {
        const title = s(o(b.child_page).title);
        if (level < ctx.depth && !ctx.visited.has(s(b.id))) {
          ctx.visited.add(s(b.id));
          const page = await ctx.api.page(s(b.id));
          ctx.versions.push(s(page.last_edited_time));
          const inner = await render(await ctx.api.children(s(b.id)), ctx, "", level + 1);
          out.push(`## 하위 페이지: ${title}`, "", ...inner, "");
        } else out.push(`${indent}- (하위 페이지: ${title})`);
        break;
      }
      case "child_database":
        out.push(`${indent}- (하위 데이터베이스: ${s(o(b.child_database).title)} — 가져오지 않는다)`);
        break;
      case "column_list":
      case "column":
      case "synced_block":
        out.push(...(await sub("")));
        break;
      default:
        if (text) out.push(`${indent}${text}`, "");
        break;
    }
  }
  return out;
}

function titleOf(page: Obj, preferred?: string): { name: string; text: string } {
  const props = o(page.properties);
  const name = preferred && props[preferred] ? preferred : (Object.entries(props).find(([, p]) => s(o(p).type) === "title")?.[0] ?? "");
  return { name, text: propertyText(o(props[name])) };
}

export interface NotionFetchOptions {
  config: NotionConfig;
  depth: number;
  maxBytes: number;
  kind?: string;
}

export async function fetchNotion(api: NotionApi, ref: string, opts: NotionFetchOptions): Promise<Imported & { pageId: string }> {
  const id = notionIdOf(ref);
  const page = await api.page(id);
  const title = titleOf(page, opts.config.properties.title);
  const ctx: Ctx = { api, attachments: [], links: [], warnings: [], maxBytes: opts.maxBytes, depth: opts.depth, visited: new Set([id]), versions: [s(page.last_edited_time)] };
  const body = (await render(await api.children(id), ctx, "", 0)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const props = propertiesTable(page, title.name);
  const kindProp = opts.config.properties.kind ? propertyText(o(o(page.properties)[opts.config.properties.kind])) : "";
  const mapped = opts.config.kindMap[kindProp];
  const keyProp = opts.config.properties.key ? propertyText(o(o(page.properties)[opts.config.properties.key])) : "";
  const text = [props && `## 속성\n\n${props}`, body].filter(Boolean).join("\n\n");
  return {
    title: title.text || "(제목 없음)",
    kind: opts.kind ?? mapped ?? "feature",
    text,
    attachments: ctx.attachments,
    links: [...new Set([...ctx.links, ...(s(page.url).startsWith("http") ? [s(page.url)] : [])])],
    source: { type: "notion", ref: id, url: s(page.url), version: [...ctx.versions].sort().pop() ?? "" },
    warnings: ctx.warnings,
    key: keyProp || null,
    pageId: id,
  };
}

/** writeBack: 접수됨 + Intent 키를 페이지 속성에 쓴다. 설정에 없는 속성은 건드리지 않는다. 쓴 속성 이름을 돌려준다. */
export async function writeBackNotion(api: NotionApi, pageId: string, cfg: NotionConfig, values: { status: string; key: string }): Promise<string[]> {
  const page = await api.page(pageId);
  const props = o(page.properties);
  const patch: Obj = {};
  const done: string[] = [];
  const st = cfg.properties.status;
  if (st && props[st]) {
    const type = s(o(props[st]).type);
    if (type === "status" || type === "select") {
      patch[st] = { [type]: { name: values.status } };
      done.push(st);
    }
  }
  const k = cfg.properties.key;
  if (k && props[k] && s(o(props[k]).type) === "rich_text") {
    patch[k] = { rich_text: [{ type: "text", text: { content: values.key } }] };
    done.push(k);
  }
  if (done.length) await api.patchPage(pageId, patch);
  return done;
}
