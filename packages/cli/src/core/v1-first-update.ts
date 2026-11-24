/**
 * 표시 줄 없는 v1 lock(v1.0.8)의 첫 update(HK-25 R1, design §2). update 계획의 "가리지 못한" conflict 를
 * 종류대로 새 판(kit) · 줄 병합 · 키 병합(merge)으로 바꾸고, 원본을 .agents/state/merge-backup/<시각>/ 에 둔다.
 * 판정 규칙은 core/v1-merge.ts(update.sh 는 update/v1_merge.py)에 있다.
 */
import path from "node:path";
import { sha256 } from "./hash";
import { ownerKind, type Installed } from "./installed";
import type { LockEntry } from "./lock";
import { existing } from "./plan";
import type { UpdateAction, UpdateOp, UpdatePlan } from "./update-plan";
import { MERGE_BACKUP_DIR, planV1Merge } from "./v1-merge";

export const V1_MERGE_REASON = "v1 lock — 원본은 merge-backup 에 둔다";
const CLAUDE_MD = "CLAUDE.md";
const CLAUDE_BLOCK = "<!-- knots-sync:begin claude";

export interface MergedFile {
  path: string;
  kind: "kit" | "lines" | "keys";
  backup: string;
}

/** 원본을 남길 파일(쓰기 전에 backup 자리에 C 를 둔다). */
export interface BackupWrite {
  path: string;
  data: Buffer;
}

export interface V1MergeResult {
  plan: UpdatePlan;
  merged: MergedFile[];
  backups: BackupWrite[];
}

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

/**
 * 원본 자리: .agents/state/merge-backup/<시각>/<경로>.orig. 설치본 검사(check_harness.py, v1.0.8 판 포함)가
 * .agents/**\/*.md 의 링크 · 코드 울타리를 보므로 .md 이름을 남기지 않는다(옮긴 자리에서 상대 링크가 끊긴다).
 */
export function backupPath(stamp: string, rel: string): string {
  return `${MERGE_BACKUP_DIR}/${stamp}/${rel}.orig`;
}

function recount(ops: UpdateOp[], like: Record<UpdateAction, number>): Record<UpdateAction, number> {
  const counts = Object.fromEntries(Object.keys(like).map((k) => [k, 0])) as Record<UpdateAction, number>;
  for (const o of ops) counts[o.action] += 1;
  return counts;
}

/**
 * ambiguous = 기준 해시를 풀어 null 로 바꾼 경로(core/legacy-lock). 그중 conflict 로 판정된 copy 만 바꾼다.
 * --accept-all 이면 바꾸지 않는다(사람이 새 판을 골랐다 — .bak).
 */
export function applyV1Merge(plan: UpdatePlan, opts: { target: string; ambiguous: Set<string>; acceptAll: boolean; stamp: string }): V1MergeResult {
  if (opts.acceptAll || opts.ambiguous.size === 0) return { plan, merged: [], backups: [] };
  const merged: MergedFile[] = [];
  const backups: BackupWrite[] = [];
  const kitSha = new Map<string, string>();
  const ops = plan.ops.map((o): UpdateOp => {
    if (o.action !== "conflict" || !opts.ambiguous.has(o.path) || !o.content || !o.sha256) return o;
    const cur = existing(full(opts.target, o.path));
    if (cur.kind !== "file") return o;
    const r = planV1Merge(o.path, cur.bytes, o.content);
    if (r.kind === "new" || !r.content) return o;
    const backup = backupPath(opts.stamp, o.path);
    merged.push({ path: o.path, kind: r.kind, backup });
    backups.push({ path: backup, data: cur.bytes });
    kitSha.set(o.path, o.sha256);
    const rest = Object.fromEntries(Object.entries(o).filter(([k]) => k !== "newFile" && k !== "newRefreshed")) as unknown as UpdateOp;
    return { ...rest, action: r.kind === "kit" ? "update" : "merge", merge: r.kind, mergeBackup: backup, content: r.content, reason: V1_MERGE_REASON };
  });
  if (merged.length === 0) return { plan, merged, backups };
  const entries = plan.entries.map((e): LockEntry => {
    const sha = kitSha.get(e.path);
    return sha ? { ...e, owner: "kit", sha256: sha } : e;
  });
  return { plan: { ...plan, ops, entries, counts: recount(ops, plan.counts) }, merged, backups };
}

/**
 * v1 CLAUDE.md(배치 merge, design §2.5): 표시 줄 없는 lock 의 copy 항목이 sha(C) = B 이고 킷 블록이 없으면 배치가 새 파일로 바꾼다.
 * 설치 전 사람 파일일 수 있으니 원본을 남긴다. 조건이 맞지 않으면 null.
 */
export function claudeBackup(args: { target: string; inst: Installed; agents: string[]; projection: boolean; stamp: string }): { merged: MergedFile; backup: BackupWrite } | null {
  if (!args.inst.lockAmbiguous || !args.projection || !args.agents.includes("claude")) return null;
  const e = args.inst.lock.entries.find((x) => x.path === CLAUDE_MD);
  if (!e || e.op !== "copy" || ownerKind(e.owner) !== "kit" || !e.sha256) return null;
  const cur = existing(full(args.target, CLAUDE_MD));
  if (cur.kind !== "file" || sha256(cur.bytes) !== e.sha256) return null;
  if (cur.bytes.toString("utf8").split("\n").some((l) => l.startsWith(CLAUDE_BLOCK))) return null;
  const backup = backupPath(args.stamp, CLAUDE_MD);
  return { merged: { path: CLAUDE_MD, kind: "kit", backup }, backup: { path: backup, data: cur.bytes } };
}
