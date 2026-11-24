/**
 * 표시 줄 없는 v1 lock(v1.0.8 이하)의 기준 해시 풀기(HK-12 R12.6, design §7.3).
 *
 * 옛 setup.sh 는 설치 전부터 있던 파일(예: AGENTS.md)을 건너뛰고 그 파일 해시를 lock 에 적었다.
 * 그래서 sha(C) = B 는 "킷이 쓴 판 그대로"일 수도, "사람 파일"일 수도 있다. 킷 판과 바이트가 같으면(B = sha(D))
 * 어느 쪽이든 안전하다. 다르면 가리지 못하므로 B 를 null(고친 파일)로 바꾼다 — update 는 .new 를 쓰고,
 * --prune · remove · uninstall 은 지우지 않는다.
 */
import path from "node:path";
import { sha256 } from "./hash";
import { ownerKind, type Installed } from "./installed";
import { renamedKitPath } from "./legacy-names";
import type { LockEntry, LockV2 } from "./lock";
import { existing } from "./plan";

export const AMBIGUOUS_REASON = "v1 lock — 미리 있던 파일인지 가릴 수 없다";

export interface Resolved {
  entries: LockEntry[];
  /** B 를 null 로 바꾼 경로 */
  ambiguous: Set<string>;
}

/**
 * want: 킷이 지금 원하는 경로 → sha(D). null 이면 D 를 모른다(템플릿을 못 찾음) — sha(C) = B 항목을 모두 null 로 둔다.
 */
export function resolveLegacyHashes(target: string, entries: LockEntry[], want: Map<string, string> | null): Resolved {
  const ambiguous = new Set<string>();
  const out = entries.map((e) => {
    if (ownerKind(e.owner) !== "kit" || e.op !== "copy" || !e.sha256) return e;
    if (want && want.get(e.path) === e.sha256) return e;
    // 킷 이름공간(hx-) 스킬 경로는 설치 전부터 있던 사람 파일일 수 없다 — B 를 지킨다. 고치지 않았으면 update 가 지운다(kns- 가 대신한다, HK-22b)
    if (renamedKitPath(e.path)) return e;
    const cur = existing(path.join(target, ...e.path.split("/")));
    if (cur.kind !== "file" || sha256(cur.bytes) !== e.sha256) return e;
    ambiguous.add(e.path);
    return { ...e, sha256: null };
  });
  return { entries: out, ambiguous };
}

/** 표시 줄 없는 v1 lock 이면 lock 항목의 기준 해시를 푼다. 아니면 그대로. shaOf 는 필요할 때만 부른다. */
export function resolvedLock(inst: Installed, target: string, shaOf: () => Map<string, string> | null): { lock: LockV2; ambiguous: Set<string> } {
  if (!inst.lockAmbiguous) return { lock: inst.lock, ambiguous: new Set() };
  const r = resolveLegacyHashes(target, inst.lock.entries, shaOf());
  return { lock: { ...inst.lock, entries: r.entries }, ambiguous: r.ambiguous };
}
