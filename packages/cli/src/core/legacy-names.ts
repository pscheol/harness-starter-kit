/**
 * 옛 이름(harness-kit) 호환(HK-22b). 제품 이름이 knots-sync 로 바뀌었다.
 * - v1 · v2-alpha 리포는 상태 파일이 `.agents/harness-kit.json` · `.agents/harness-kit.lock` 이다. 읽기 명령은 새 이름이 없으면 옛 이름을 읽고,
 *   쓰는 명령(update · repair · add · remove · uninstall)은 쓰기 단계 처음에 새 이름으로 옮긴다(사람이 따로 옮기지 않는다).
 * - v2-alpha 메타 · lock 의 schema(`harness-kit/v2` · `harness-kit.lock/v2`)도 읽는다. 쓸 때는 새 schema 다.
 * - 킷 스킬 접두사가 `hx-` 에서 `kns-` 로 바뀌었다. lock 에 있는 옛 `hx-` 킷 파일은 새 이름 파일이 대신하므로, 고치지 않았으면 update 가 지운다.
 */
import fs from "node:fs";
import path from "node:path";

export const LEGACY_META_REL = ".agents/harness-kit.json";
export const LEGACY_LOCK_REL = ".agents/harness-kit.lock";
export const LEGACY_META_SCHEMA = "harness-kit/v2";
export const LEGACY_LOCK_SCHEMA = "harness-kit.lock/v2";
/** 새 이름 상태 파일(meta.ts · lock.ts 의 META_REL · LOCK_REL 과 같다 — 순환 import 를 피해 여기 둔다) */
const NEW_META_REL = ".agents/knots-sync.json";
const NEW_LOCK_REL = ".agents/knots-sync.lock";
const PAIRS: [string, string][] = [
  [NEW_META_REL, LEGACY_META_REL],
  [NEW_LOCK_REL, LEGACY_LOCK_REL],
];

function exists(file: string): boolean {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

/** 읽을 상태 파일: 새 이름이 있거나 옛 이름도 없으면 새 이름, 아니면 옛 이름. */
function stateFile(target: string, rel: string, legacy: string): string {
  const neu = path.join(target, rel);
  if (exists(neu)) return neu;
  const old = path.join(target, legacy);
  return exists(old) ? old : neu;
}

export function metaFile(target: string): string {
  return stateFile(target, NEW_META_REL, LEGACY_META_REL);
}

export function lockFile(target: string): string {
  return stateFile(target, NEW_LOCK_REL, LEGACY_LOCK_REL);
}

/** 남아 있는 옛 이름 상태 파일(상대 경로) */
export function legacyStateFiles(target: string): string[] {
  return PAIRS.filter(([, old]) => exists(path.join(target, old))).map(([, old]) => old);
}

/**
 * 쓰기 단계 처음에 부른다: 옛 이름만 있는 상태 파일을 새 이름으로 옮긴다(rename — 내용은 그대로, 뒤의 쓰기가 새 판으로 덮는다).
 * 둘 다 있으면 건드리지 않는다(doctor 가 알린다). 옮긴 옛 경로를 돌려준다.
 */
export function renameLegacyState(target: string): string[] {
  const out: string[] = [];
  for (const [neu, old] of PAIRS) {
    if (!exists(path.join(target, neu)) && exists(path.join(target, old))) {
      fs.renameSync(path.join(target, old), path.join(target, neu));
      out.push(old);
    }
  }
  return out;
}

export function legacyStateLine(files: string[], dryRun: boolean): string[] {
  if (!files.length) return [];
  return [`  옛 이름 상태 파일 ${files.join(" · ")} → 새 이름(.agents/knots-sync.*)으로 ${dryRun ? "옮길 것이다" : "옮겼다"}(제품 이름이 knots-sync 로 바뀌었다)`];
}

/** 옛 킷 스킬 경로(`hx-` 접두사): 새 이름(`kns-`) 파일이 대신한다. */
const RENAMED_SKILL = /(^|\/)(skills|commands|steering)\/hx-[a-z0-9-]+(\/|\.md$)/;

export function renamedKitPath(rel: string): boolean {
  return RENAMED_SKILL.test(rel);
}
