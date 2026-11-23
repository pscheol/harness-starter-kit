/**
 * 설치 상태(메타 · lock) 읽기와 메타에서 선택값 · 토큰 만들기(HK-11 design §2).
 * update · repair · uninstall 이 같이 쓴다.
 */
import path from "node:path";
import { CliError, EXIT } from "./errors";
import { isDir } from "./fsx";
import { stackSpecOf, type Layout } from "./layout";
import { LOCK_REL, readLock, type LockEntry, type LockV2 } from "./lock";
import { META_REL, readMeta, type MetaV2 } from "./meta";
import { isSafeRelPath } from "./plan";
import { listArchs, listStacks, type Selection } from "./selection";
import { resolveTokens } from "./tokens";
import { VERSION } from "./version";

export interface Installed {
  meta: MetaV2;
  metaFormat: "v1" | "v2";
  lock: LockV2;
  lockFormat: "v1" | "v2";
  /** 표시 줄 없는 v1 lock(HK-12 R12.6) */
  lockAmbiguous: boolean;
}

/** 이 판이 다루는 op. 나머지(mirror · render · merge)는 P18 어댑터 몫이다. */
export type EntryKind = "copy" | "none";

const NOT_INSTALLED_HINT = "설치는 harness-kit init";

/** 메타 · lock 을 읽는다. 없거나 깨졌으면 exit 3. 경로 검사 · op 검사까지 끝낸 값을 준다. */
export function loadInstalled(target: string, command: string): Installed {
  const m = readMeta(path.join(target, META_REL));
  if (m.status === "missing") throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, NOT_INSTALLED_HINT);
  if (m.status === "invalid") throw new CliError(EXIT.STATE, `메타를 해석하지 못했다: ${m.error}`, "harness-kit doctor 로 상태를 본다");
  const l = readLock(path.join(target, LOCK_REL));
  if (l.status === "missing") {
    throw new CliError(EXIT.STATE, `lock 이 없다(${LOCK_REL})`, `lock 없이 ${command} 하면 사람 파일과 킷 파일을 가리지 못한다. harness-kit doctor 로 상태를 본다`);
  }
  if (l.status === "invalid") throw new CliError(EXIT.STATE, `lock 을 해석하지 못했다: ${l.error}`, "harness-kit doctor 로 상태를 본다");
  assertLockUsable(l.lock.entries);
  return { meta: m.meta, metaFormat: m.schema, lock: l.lock, lockFormat: l.format, lockAmbiguous: l.ambiguous };
}

/** lock 경로가 리포 안인지, op 를 이 판이 다루는지 본다. 아무것도 쓰기 전에 부른다. */
export function assertLockUsable(entries: LockEntry[]): void {
  const unsafe = entries.filter((e) => !isSafeRelPath(e.path)).map((e) => e.path);
  if (unsafe.length) throw new CliError(EXIT.STATE, `lock 에 리포 밖이나 .git 을 가리키는 항목이 있다: ${unsafe.join(" ")}`, "lock 을 고치거나 harness-kit doctor 로 본다");
  for (const e of entries) entryKind(e);
}

export function entryKind(e: LockEntry): EntryKind {
  switch (e.op) {
    case "copy":
    case "none":
      return e.op;
    default:
      throw new CliError(EXIT.STATE, `lock 항목 ${e.path} 의 op '${e.op}' 는 이 판(${VERSION})에서 지원하지 않는다`, "mirror · render · merge 는 P18 판 CLI 로 실행한다");
  }
}

export type OwnerKind = "kit" | "user" | "external" | "pack" | "unknown";

export function ownerKind(owner: string): OwnerKind {
  if (owner === "kit" || owner === "user") return owner;
  if (owner.startsWith("external:")) return "external";
  if (owner.startsWith("pack:")) return "pack";
  return "unknown";
}

export interface MetaSelection {
  selection: Selection;
  droppedModules: string[];
}

/** 메타의 스택 · 변형 · 도메인 · 하네스 · 모듈(design §2.2). 킷에 없는 스택 · 변형은 exit 3, 없는 모듈은 뺀다. */
export function selectionFromMeta(layout: Layout, templatesDir: string, meta: MetaV2): MetaSelection {
  if (!listStacks(templatesDir).includes(meta.stack)) {
    throw new CliError(EXIT.STATE, `이 킷에 없는 스택이다: '${meta.stack}'`, "메타의 stack 을 고치거나 그 스택이 있는 킷 판을 쓴다");
  }
  if (!listArchs(templatesDir, meta.stack).includes(meta.arch)) {
    throw new CliError(EXIT.STATE, `이 킷에 없는 변형이다: '${meta.arch}' (스택 ${meta.stack})`, "메타의 arch 를 고치거나 그 변형이 있는 킷 판을 쓴다");
  }
  const modules = meta.modules.filter((m) => isDir(path.join(templatesDir, "optional", m)));
  const selection: Selection = {
    stack: meta.stack,
    arch: meta.arch,
    domain: meta.domain || (stackSpecOf(layout, meta.stack).domain ?? ""),
    lang: null,
    agents: [...meta.agents],
    agentsOrigin: "meta",
    modules,
  };
  return { selection, droppedModules: meta.modules.filter((m) => !modules.includes(m)) };
}

/**
 * update · repair 의 토큰(design §2.2): 환경변수(빈 값 제외) > 메타 tokens 에 있는 키(빈 값 포함)
 * > 스택 기본값 > tokenDefaults. 메타에 없는 키만 기본값으로 채운다.
 */
export function tokensFromMeta(layout: Layout, sel: Selection, meta: MetaV2, env: Record<string, string | undefined>, target: string): Record<string, string> {
  const fixed = new Map<string, string>();
  for (const k of layout.tokens) {
    const fromEnv = env[k];
    if (fromEnv) fixed.set(k, fromEnv);
    else if (Object.hasOwn(meta.tokens, k)) fixed.set(k, meta.tokens[k] as string);
  }
  const flags = Object.fromEntries([...fixed].filter(([, v]) => v !== ""));
  const defaults = resolveTokens(layout, sel, { flags, env: {}, targetBasename: path.basename(target) });
  return Object.fromEntries(layout.tokens.map((k) => [k, fixed.get(k) ?? defaults[k] ?? ""]));
}
