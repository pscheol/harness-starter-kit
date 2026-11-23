/** lock .agents/harness-kit.lock — v2 쓰기, v1(TSV) · v2 읽기(HK-8 design §6.2, README §6, 설계 02 §3.9). */
import fs from "node:fs";
import { byteCompare } from "./fsx";
import { formatJson } from "./json";

export const LOCK_REL = ".agents/harness-kit.lock";
export const LOCK_SCHEMA = "harness-kit.lock/v2";
const V1_HEADER = "# harness-kit lock v1";
const OPS = new Set(["copy", "mirror", "render", "merge", "none"]);

export interface LockEntry {
  path: string;
  op: string;
  owner: string;
  sha256?: string | null;
  layer?: string;
  [k: string]: unknown;
}

export interface LockV2 {
  schema: string;
  kit: { version: string | null; source: string | null };
  packs: unknown[];
  entries: LockEntry[];
}

const ENTRY_ORDER = ["path", "op", "owner", "sha256", "layer", "from", "fromSha256", "keys"];

function orderEntry(e: LockEntry): Record<string, unknown> {
  const known = ENTRY_ORDER.filter((k) => k in e).map((k) => [k, e[k]] as const);
  const rest = Object.keys(e)
    .filter((k) => !ENTRY_ORDER.includes(k))
    .map((k) => [k, e[k]] as const);
  return Object.fromEntries([...known, ...rest]);
}

/** entries 는 path 사전순(바이트 순), 같은 path 는 마지막 것 하나. */
export function serializeLock(lock: LockV2): string {
  const byPath = new Map<string, LockEntry>();
  for (const e of lock.entries) byPath.set(e.path, e);
  const entries = [...byPath.keys()].sort(byteCompare).map((p) => orderEntry(byPath.get(p) as LockEntry));
  return formatJson({ schema: LOCK_SCHEMA, kit: lock.kit, packs: lock.packs, entries });
}

/** v1 라벨(setup.sh layer_roots) → v2 layer(템플릿 폴더 경로). */
export function v1LabelToLayer(label: string): string {
  if (label === "common") return "common";
  if (label === "frontend" || label === "backend") return `domains/${label}`;
  if (label.startsWith("mod/")) return `optional/${label.slice(4)}`;
  const slash = label.indexOf("/");
  if (slash > 0) return `stacks/${label.slice(0, slash)}/arch/${label.slice(slash + 1)}`;
  return `stacks/${label}`;
}

function parseV1(text: string): LockV2 {
  const seen = new Map<string, LockEntry>();
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i += 1) {
    const line = (lines[i] as string).replace(/\r$/, "");
    if (line === "" || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length !== 4 || cols.some((c) => c === "")) throw new Error(`v1 lock ${i + 1}번째 줄: 칸이 4개가 아니다`);
    const [sha, label, , rel] = cols as [string, string, string, string];
    const layer = v1LabelToLayer(label);
    const prev = seen.get(rel);
    // 같은 경로가 여러 줄: 뒤 줄의 layer, 앞 줄의 sha256(v1 setup.sh 가 실제로 쓴 판이 앞 레이어다)
    seen.set(rel, { path: rel, op: "copy", owner: "kit", sha256: prev ? (prev.sha256 ?? null) : sha === "-" ? null : sha, layer });
  }
  const entries = [...seen.keys()].sort(byteCompare).map((p) => seen.get(p) as LockEntry);
  return { schema: LOCK_SCHEMA, kit: { version: null, source: null }, packs: [], entries };
}

function parseV2(text: string): LockV2 {
  const raw = JSON.parse(text) as unknown;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("최상위가 객체가 아니다");
  const o = raw as Record<string, unknown>;
  if (o.schema !== LOCK_SCHEMA) throw new Error(`모르는 schema: ${String(o.schema)}`);
  if (!Array.isArray(o.entries)) throw new Error("entries 가 배열이 아니다");
  const entries = o.entries.map((e, i): LockEntry => {
    if (e === null || typeof e !== "object") throw new Error(`entries[${i}] 가 객체가 아니다`);
    const x = e as Record<string, unknown>;
    if (typeof x.path !== "string" || typeof x.op !== "string" || typeof x.owner !== "string") {
      throw new Error(`entries[${i}] 에 path · op · owner 가 없다`);
    }
    if (!OPS.has(x.op)) throw new Error(`entries[${i}].op 를 모른다: ${x.op}`);
    if (x.sha256 !== undefined && x.sha256 !== null && typeof x.sha256 !== "string") throw new Error(`entries[${i}].sha256 형식`);
    return x as LockEntry;
  });
  const kit = (o.kit && typeof o.kit === "object" ? o.kit : {}) as Record<string, unknown>;
  return {
    schema: LOCK_SCHEMA,
    kit: { version: typeof kit.version === "string" ? kit.version : null, source: typeof kit.source === "string" ? kit.source : null },
    packs: Array.isArray(o.packs) ? o.packs : [],
    entries,
  };
}

export function parseLockText(text: string): { format: "v1" | "v2"; lock: LockV2 } {
  if (text.startsWith(V1_HEADER)) return { format: "v1", lock: parseV1(text) };
  if (text.trim() === "") throw new Error("비어 있다");
  return { format: "v2", lock: parseV2(text) };
}

export type LockRead = { status: "missing" } | { status: "invalid"; error: string } | { status: "ok"; format: "v1" | "v2"; lock: LockV2 };

export function readLock(file: string): LockRead {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    return { status: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
  try {
    return { status: "ok", ...parseLockText(text) };
  } catch (err) {
    return { status: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
}
