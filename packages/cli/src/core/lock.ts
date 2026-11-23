/** lock .agents/harness-kit.lock — v2 쓰기, v1(TSV) · v2 읽기(HK-8 design §6.2, README §6, 설계 02 §3.9). */
import fs from "node:fs";
import { byteCompare } from "./fsx";
import { formatJson } from "./json";

export const LOCK_REL = ".agents/harness-kit.lock";
export const LOCK_SCHEMA = "harness-kit.lock/v2";
const V1_HEADER = "# harness-kit lock v1";
/**
 * v1 lock 표시 줄(HK-12 R12.6). 이 줄이 있는 lock 은 설치 전부터 있던 파일을 해시 '-'(킷 판과 같으면 그 해시)로 적었다.
 * 없는 lock(v1.0.8 이하)은 미리 있던 파일을 그 파일 해시로 적어서 sha(C) = B 만으로는 킷 파일과 가리지 못한다.
 */
export const V1_MARK = "# pre-existing: -";
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

const ENTRY_ORDER = ["path", "op", "owner", "sha256", "layer", "from", "fromSha256", "keys", "createdByKit"];
/** v1 lock 의 배치 줄 라벨(HK-13 design §7.2). setup.sh · update.sh 가 projection.py 로 적는다. */
const V1_PROJECTION = new Set(["mirror", "render", "merge", "merge+"]);

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

/** v1 배치 줄 → v2 항목. merge 는 키를 적지 않는다(지금 원하는 키로 다시 구한다), merge+ 는 킷이 만든 파일. */
function v1ProjectionEntry(sha: string, label: string, rel: string): LockEntry {
  if (label === "merge+") return { path: rel, op: "merge", owner: "kit", createdByKit: true };
  if (label === "merge") return { path: rel, op: "merge", owner: "kit" };
  return { path: rel, op: label, owner: "kit", sha256: sha === "-" ? null : sha };
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
    if (V1_PROJECTION.has(label)) {
      seen.set(rel, v1ProjectionEntry(sha, label, rel));
      continue;
    }
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

export interface ParsedLock {
  format: "v1" | "v2";
  lock: LockV2;
  /** 표시 줄 없는 v1 — 기준 해시가 미리 있던 파일의 해시일 수 있다(legacy-lock.ts) */
  ambiguous: boolean;
}

export function parseLockText(text: string): ParsedLock {
  if (text.startsWith(V1_HEADER)) {
    const marked = text.split("\n").some((l) => l.replace(/\r$/, "") === V1_MARK);
    return { format: "v1", lock: parseV1(text), ambiguous: !marked };
  }
  if (text.trim() === "") throw new Error("비어 있다");
  return { format: "v2", lock: parseV2(text), ambiguous: false };
}

export type LockRead = { status: "missing" } | { status: "invalid"; error: string } | ({ status: "ok" } & ParsedLock);

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
