/** 배치 원본 읽기 — `.agents/rules` · `skills` · `roles` · `model-policy.json` · `hooks.json`(HK-13 design §2 · §6.1, HK-24). */
import { byteCompare } from "../core/fsx";
import { sha256 } from "../core/hash";
import { HOOKS_DIR, HOOKS_REL, hookDocPaths } from "./hooks";
import { parsePolicy, parseRole, parseRule, parseSkill, type Policy, type Role, type Rule, type Skill, type SkillFile } from "./render";
import type { RepoView } from "./view";

/** 원본 목록 · 폴더 해시에서 빼는 이름(.DS_Store · .new · .bak · 원자적 쓰기 임시 파일 · 바이트코드). */
export function ignoredName(name: string): boolean {
  return name === ".DS_Store" || name.endsWith(".new") || name.endsWith(".bak") || (name.startsWith(".") && name.includes(".hk-")) || name === "__pycache__" || name.endsWith(".pyc");
}

/** tree-sha256: 상대 경로 사전순 `<경로>\0<sha256>\n` 의 sha256(02 §3.9). */
export function treeSha(files: { rel: string; bytes: Buffer }[]): string {
  const sorted = [...files].sort((a, b) => byteCompare(a.rel, b.rel));
  return sha256(sorted.map((f) => `${f.rel}\0${sha256(f.bytes)}\n`).join(""));
}

/** 폴더 아래 일반 파일(링크 · 무시 이름 제외), 상대 경로 바이트 순. */
export function walkView(view: RepoView, rel: string, prefix = ""): SkillFile[] {
  const out: SkillFile[] = [];
  for (const e of view.list(rel) ?? []) {
    if (ignoredName(e.name)) continue;
    const sub = prefix ? `${prefix}/${e.name}` : e.name;
    const full = rel ? `${rel}/${e.name}` : e.name;
    if (e.kind === "dir") out.push(...walkView(view, full, sub));
    else if (e.kind === "file") out.push({ rel: sub, bytes: view.read(full) as Buffer, executable: view.executable(full) });
  }
  return out.sort((a, b) => byteCompare(a.rel, b.rel));
}

function hasPendingNew(view: RepoView, rel: string): boolean {
  const k = view.kind(rel);
  if (k === "file") return view.kind(`${rel}.new`) !== "none";
  if (k !== "dir") return false;
  for (const e of view.list(rel) ?? []) {
    const sub = `${rel}/${e.name}`;
    if (e.kind === "file" && e.name.endsWith(".new")) return true;
    if (e.kind === "dir" && hasPendingNew(view, sub)) return true;
  }
  return false;
}

export interface Sources {
  rules: Rule[];
  skills: Skill[];
  roles: Role[];
  policy: Policy;
  /** `.new` 대기 중인 원본(design §6.3 — 배치를 미룬다) */
  deferred: Set<string>;
  /** `.agents/hooks.json` 내용(없으면 null) */
  hooksText: string | null;
  /** 훅 원본 전체(hooks.json + hooks.d)의 경로 · 내용 묶음 — Kiro 생성물의 원본 해시 */
  hooksData: Buffer;
  /** `.agents/hooks.d/*.json`(팩 · 프로젝트, HK-14) — 읽는 순서 */
  hookDocs: { rel: string; text: string }[];
  /** 메타(`.agents/harness-kit.json`)의 modules — 모듈 훅 거르기 */
  modules: string[];
}

export function loadSources(view: RepoView): Sources {
  const src: Sources = { rules: [], skills: [], roles: [], policy: parsePolicy(null), deferred: new Set(), hooksText: null, hooksData: Buffer.alloc(0), hookDocs: [], modules: [] };
  for (const e of view.list(".agents/rules") ?? []) {
    if (!e.name.endsWith(".md") || ignoredName(e.name) || e.kind !== "file") continue;
    const rel = `.agents/rules/${e.name}`;
    src.rules.push(parseRule(rel, view.read(rel) as Buffer));
    if (hasPendingNew(view, rel)) src.deferred.add(rel);
  }
  for (const e of view.list(".agents/skills") ?? []) {
    const rel = `.agents/skills/${e.name}`;
    if (ignoredName(e.name) || e.name.startsWith(".") || e.kind !== "dir" || view.kind(`${rel}/SKILL.md`) !== "file") continue;
    src.skills.push(parseSkill(rel, walkView(view, rel)));
    if (hasPendingNew(view, rel)) src.deferred.add(rel);
  }
  for (const e of view.list(".agents/roles") ?? []) {
    if (!e.name.endsWith(".md") || ignoredName(e.name) || e.kind !== "file") continue;
    const rel = `.agents/roles/${e.name}`;
    src.roles.push(parseRole(rel, view.read(rel) as Buffer));
    if (hasPendingNew(view, rel)) src.deferred.add(rel);
  }
  const policy = view.read(".agents/model-policy.json");
  src.policy = parsePolicy(policy === null ? null : policy.toString("utf8"));
  if (view.kind(HOOKS_REL) === "file") {
    const data = view.read(HOOKS_REL) as Buffer;
    src.hooksText = data.toString("utf8");
    src.hooksData = Buffer.concat([Buffer.from(`${HOOKS_REL}\0`, "utf8"), data]);
    if (hasPendingNew(view, HOOKS_REL)) src.deferred.add(HOOKS_REL);
  }
  if (view.kind(HOOKS_DIR) === "dir") {
    for (const rel of hookDocPaths((view.list(HOOKS_DIR) ?? []).map((e) => e.name))) {
      if (view.kind(rel) !== "file") continue;
      const data = view.read(rel) as Buffer;
      src.hookDocs.push({ rel, text: data.toString("utf8") });
      src.hooksData = Buffer.concat([src.hooksData, Buffer.from(`\n${rel}\0`, "utf8"), data]);
      if (hasPendingNew(view, rel)) src.deferred.add(HOOKS_REL);
    }
  }
  src.modules = metaModules(view.read(".agents/harness-kit.json"));
  return src;
}

/** 훅 원본 묶음(hooks.json + hooks.d)의 sha256 — Kiro 생성물의 원본 해시(배치 검사용). hooks.json 이 없으면 null. */
export function hooksBundleSha(view: RepoView): string | null {
  const src = loadSources(view);
  return src.hooksText === null ? null : sha256(src.hooksData);
}

function metaModules(raw: Buffer | null): string[] {
  if (raw === null) return [];
  try {
    const meta = JSON.parse(raw.toString("utf8")) as unknown;
    const modules = meta !== null && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>).modules : undefined;
    return Array.isArray(modules) ? modules.filter((m): m is string => typeof m === "string") : [];
  } catch {
    return [];
  }
}
