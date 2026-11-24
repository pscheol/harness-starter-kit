/**
 * 개인 층 `.agents/local/`(설계 04 §3.6, HK-14 design §5). gitignore 이고 공유 lock 에 기록하지 않는다.
 * 설정은 roles.<역할>.harness · git.ide 만 받는다(나머지는 무시하고 doctor personal-ignored). 개인 파일은 더하기만 한다 —
 * 공유 스킬 · 규칙과 이름이 같거나 하한 훅 id 를 쓰면 배치하지 않는다. 쓴 파일은 개인 lock 과 `.git/info/exclude` 킷 블록에 적는다.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FLOOR_HOOKS } from "./floor";
import { byteCompare, writeFileAtomic } from "./fsx";
import { sha256 } from "./hash";
import { removeEmptyDirs, removeFile } from "./remove";
import { HooksError, kiroIdeFiles, parseHooks, settingsHooks, type HookDef } from "../projection/hooks";
import { MERGERS, settingsWant } from "../projection/merge";
import { parseRule, renderKiroRule } from "../projection/render";
import type { ProjectionSpec } from "../projection/spec";

export const LOCAL_DIR = ".agents/local";
export const LOCAL_CONFIG = `${LOCAL_DIR}/knots-sync.local.json`;
export const LOCAL_LOCK = `${LOCAL_DIR}/knots-sync.local.lock`;
export const LOCAL_HOOKS = `${LOCAL_DIR}/hooks.json`;
export const SETTINGS_LOCAL = ".claude/settings.local.json";
export const LOCAL_MODEL_POLICY = `${LOCAL_DIR}/model-policy.local.json`;
const TIERS = ["light", "standard", "deep"];
const LOCAL_LOCK_SCHEMA = "knots-sync.local-lock/v1";
const EXCLUDE_BEGIN = "# knots-sync local begin";
const EXCLUDE_END = "# knots-sync local end";

export interface LocalConfig {
  /** 받은 값: roles.<역할>.harness · git.ide */
  roles: Record<string, string>;
  ide: string | null;
  /** 무시한 키(점 경로) */
  ignored: string[];
  error: string | null;
  present: boolean;
}

export interface LocalFinding {
  kind: "personal-ignored" | "personal-shadowed" | "personal-floor" | "personal-unsupported" | "local-invalid";
  severity: "error" | "warn" | "info";
  path: string;
  hint: string;
}

export interface LocalWant {
  path: string;
  content: Buffer;
  executable: boolean;
}

export interface LocalPlan {
  wants: LocalWant[];
  /** .claude/settings.local.json 에 넣을 개인 훅(merge) */
  settingsHooks: ReturnType<typeof settingsHooks>;
  findings: LocalFinding[];
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** 개인 설정을 읽고 받을 키와 무시할 키를 나눈다. */
export function readLocalConfig(target: string): LocalConfig {
  const out: LocalConfig = { roles: {}, ide: null, ignored: [], error: null, present: false };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(target, ...LOCAL_CONFIG.split("/")), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      out.present = true;
      out.error = err instanceof Error ? err.message : String(err);
    }
    return out;
  }
  out.present = true;
  if (!isObj(raw)) {
    out.error = "최상위가 객체가 아니다";
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key === "roles" && isObj(value)) {
      for (const [role, conf] of Object.entries(value)) {
        if (!isObj(conf)) {
          out.ignored.push(`roles.${role}`);
          continue;
        }
        for (const [k, v] of Object.entries(conf)) {
          if (k === "harness" && typeof v === "string") out.roles[role] = v;
          else out.ignored.push(`roles.${role}.${k}`);
        }
      }
    } else if (key === "git" && isObj(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (k === "ide" && typeof v === "string") out.ide = v;
        else out.ignored.push(`git.${k}`);
      }
    } else if (isObj(value)) for (const k of Object.keys(value)) out.ignored.push(`${key}.${k}`);
    else out.ignored.push(key);
  }
  return out;
}

export interface LocalModelPolicy {
  /** 받은 값: 잠기지 않은 분류 → 등급 */
  classes: Record<string, string>;
  /** 무시한 키(점 경로)와 이유 */
  ignored: { key: string; why: string }[];
  error: string | null;
  present: boolean;
}

/**
 * 개인 모델 등급(설계 12 §3.7 · MR-R7): `classes` 만 받고, 값은 light · standard · deep, 대상은 locked 가 아닌 분류뿐이다.
 * 역할 파일은 다시 만들지 않는다 — 세션 시작 훅이 한 줄로 알리고 위임하는 세션이 호출별 model 인자로 쓴다.
 */
export function readLocalModelPolicy(target: string): LocalModelPolicy {
  const out: LocalModelPolicy = { classes: {}, ignored: [], error: null, present: false };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(target, ...LOCAL_MODEL_POLICY.split("/")), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      out.present = true;
      out.error = err instanceof Error ? err.message : String(err);
    }
    return out;
  }
  out.present = true;
  if (!isObj(raw)) {
    out.error = "최상위가 객체가 아니다";
    return out;
  }
  let policy: Record<string, unknown> = {};
  try {
    const p = JSON.parse(fs.readFileSync(path.join(target, ".agents", "model-policy.json"), "utf8")) as unknown;
    policy = isObj(p) ? p : {};
  } catch {
    policy = {};
  }
  const locked = Array.isArray(policy.locked) ? policy.locked.filter((x): x is string => typeof x === "string") : [];
  const known = isObj(policy.classes) ? Object.keys(policy.classes) : [];
  for (const [key, value] of Object.entries(raw)) {
    if (key !== "classes" || !isObj(value)) {
      out.ignored.push({ key, why: "개인 모델 설정은 classes 만 받는다(locked · 등급 정의 · flow 는 프로젝트가 정한다)" });
      continue;
    }
    for (const [cls, tier] of Object.entries(value)) {
      if (locked.includes(cls)) out.ignored.push({ key: `classes.${cls}`, why: "locked 분류(구현 · 설계 · 리뷰)는 바꾸지 못한다" });
      else if (known.length && !known.includes(cls)) out.ignored.push({ key: `classes.${cls}`, why: "model-policy.json 에 없는 분류다" });
      else if (typeof tier !== "string" || !TIERS.includes(tier)) out.ignored.push({ key: `classes.${cls}`, why: "값은 light · standard · deep 이다" });
      else out.classes[cls] = tier;
    }
  }
  return out;
}

function listDir(target: string, rel: string): fs.Dirent[] {
  try {
    return fs.readdirSync(path.join(target, ...rel.split("/")), { withFileTypes: true }).sort((a, b) => byteCompare(a.name, b.name));
  } catch {
    return [];
  }
}

function walk(target: string, rel: string): string[] {
  const out: string[] = [];
  for (const e of listDir(target, rel)) {
    const sub = `${rel}/${e.name}`;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...walk(target, sub));
    else if (e.isFile() && !e.name.endsWith(".new") && e.name !== ".DS_Store") out.push(sub);
  }
  return out;
}

/** 개인 파일 → 하네스 폴더 배치 계획. 공유 원본과 이름이 같으면 배치하지 않는다(더하기만). */
export function planLocal(target: string, agents: string[], spec: ProjectionSpec, sharedHookIds: string[]): LocalPlan {
  const plan: LocalPlan = { wants: [], settingsHooks: [], findings: [] };
  const exists = (rel: string): boolean => fs.existsSync(path.join(target, ...rel.split("/")));
  for (const e of listDir(target, `${LOCAL_DIR}/skills`)) {
    if (!e.isDirectory() || !exists(`${LOCAL_DIR}/skills/${e.name}/SKILL.md`)) continue;
    if (exists(`.agents/skills/${e.name}`)) {
      plan.findings.push({ kind: "personal-shadowed", severity: "warn", path: `${LOCAL_DIR}/skills/${e.name}`, hint: `개인 스킬 ${e.name} 은 공유 스킬과 이름이 같아 배치하지 않았다` });
      continue;
    }
    const files = walk(target, `${LOCAL_DIR}/skills/${e.name}`);
    for (const harness of ["claude", "kiro"].filter((h) => agents.includes(h)))
      for (const f of files) {
        const abs = path.join(target, ...f.split("/"));
        plan.wants.push({ path: `.${harness}/skills/${e.name}/${f.slice(`${LOCAL_DIR}/skills/${e.name}/`.length)}`, content: fs.readFileSync(abs), executable: (fs.statSync(abs).mode & 0o111) !== 0 });
      }
    if (agents.includes("codex")) plan.findings.push({ kind: "personal-unsupported", severity: "info", path: `${LOCAL_DIR}/skills/${e.name}`, hint: "Codex 개인 스킬은 사용자 폴더(~/.codex/skills)에 둔다 — .agents/skills/ 는 공유 원본이다" });
  }
  for (const e of listDir(target, `${LOCAL_DIR}/rules`)) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const name = e.name.slice(0, -3);
    const rel = `${LOCAL_DIR}/rules/${e.name}`;
    if (exists(`.agents/rules/${e.name}`)) {
      plan.findings.push({ kind: "personal-shadowed", severity: "warn", path: rel, hint: `개인 규칙 ${name} 은 공유 규칙과 이름이 같아 배치하지 않았다` });
      continue;
    }
    if (agents.includes("kiro")) plan.wants.push({ path: `.kiro/steering/local-${name}.md`, content: Buffer.from(renderKiroRule(parseRule(rel, fs.readFileSync(path.join(target, ...rel.split("/"))))), "utf8"), executable: false });
    if (agents.some((a) => a === "claude" || a === "codex")) plan.findings.push({ kind: "personal-unsupported", severity: "info", path: rel, hint: "Claude · Codex 개인 규칙은 배치하지 않는다(개인 메모리 파일 지원 확인 전, 설계 04 §6)" });
  }
  let hooks: HookDef[] = [];
  try {
    const text = exists(LOCAL_HOOKS) ? fs.readFileSync(path.join(target, ...LOCAL_HOOKS.split("/")), "utf8") : null;
    hooks = parseHooks(text, spec.hookMap) ?? [];
  } catch (err) {
    plan.findings.push({ kind: "local-invalid", severity: "error", path: LOCAL_HOOKS, hint: err instanceof HooksError ? err.message : String(err) });
  }
  const kept = hooks.filter((h) => {
    if (FLOOR_HOOKS.includes(h.id) || sharedHookIds.includes(h.id)) {
      plan.findings.push({ kind: "personal-floor", severity: FLOOR_HOOKS.includes(h.id) ? "error" : "warn", path: LOCAL_HOOKS, hint: `개인 훅 ${h.id} 는 공유 훅 id 와 같아 배치하지 않았다(개인 층은 더하기만 한다)` });
      return false;
    }
    return true;
  });
  if (agents.includes("claude")) plan.settingsHooks = settingsHooks(kept, "claude", spec.hookMap, []);
  if (agents.includes("kiro")) for (const f of kiroIdeFiles(kept, spec.hookMap, [])) plan.wants.push({ path: f.path.replace(".kiro/hooks/", ".kiro/hooks/local-"), content: Buffer.from(f.text, "utf8"), executable: false });
  if (kept.length && agents.includes("codex")) plan.findings.push({ kind: "personal-unsupported", severity: "info", path: LOCAL_HOOKS, hint: "Codex 는 개인 훅 파일이 없다 — 개인 훅은 Claude · Kiro 에만 붙는다" });
  return plan;
}

interface LocalLock {
  schema: string;
  entries: { path: string; sha256: string }[];
  settingsKeys: string[];
}

function readLocalLock(target: string): LocalLock {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(target, ...LOCAL_LOCK.split("/")), "utf8")) as LocalLock;
    return { schema: LOCAL_LOCK_SCHEMA, entries: Array.isArray(raw.entries) ? raw.entries : [], settingsKeys: Array.isArray(raw.settingsKeys) ? raw.settingsKeys : [] };
  } catch {
    return { schema: LOCAL_LOCK_SCHEMA, entries: [], settingsKeys: [] };
  }
}

export interface LocalSyncResult {
  written: string[];
  removed: string[];
  kept: string[];
  settings: "merged" | "unmerged" | "none" | "conflict";
  findings: LocalFinding[];
}

/** `.git/info/exclude` 의 킷 블록을 개인 배치 경로로 바꾼다(worktree 도 공통 git 폴더라 같은 파일이다). */
function writeExclude(target: string, paths: string[]): void {
  const r = spawnSync("git", ["-C", target, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" });
  if (r.status !== 0) return;
  const file = path.join(r.stdout.trim(), "info", "exclude");
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    text = "";
  }
  const lines = text.split("\n");
  const b = lines.indexOf(EXCLUDE_BEGIN);
  const e = lines.indexOf(EXCLUDE_END);
  const outside = b >= 0 && e > b ? [...lines.slice(0, b), ...lines.slice(e + 1)] : lines;
  const body = outside.join("\n").replace(/\n+$/, "");
  const block = paths.length ? [EXCLUDE_BEGIN, ...paths.map((p) => `/${p}`), EXCLUDE_END] : [];
  const next = `${[body, ...(block.length ? [block.join("\n")] : [])].filter(Boolean).join("\n")}\n`;
  if (next !== text) writeFileAtomic(file, Buffer.from(next, "utf8"), false);
}

/** 개인 배치를 쓴다. 지난 배치에서 빠졌고 고치지 않은 파일은 지운다. dryRun 이면 판정만. */
export function syncLocal(target: string, plan: LocalPlan, dryRun: boolean): LocalSyncResult {
  const prev = readLocalLock(target);
  const res: LocalSyncResult = { written: [], removed: [], kept: [], settings: "none", findings: plan.findings };
  const wantPaths = new Set(plan.wants.map((w) => w.path));
  const entries: LocalLock["entries"] = [];
  for (const w of plan.wants) {
    const abs = path.join(target, ...w.path.split("/"));
    const cur = fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : null;
    const want = sha256(w.content);
    const had = prev.entries.find((x) => x.path === w.path);
    if (cur !== null && cur !== want && !(had && had.sha256 === cur)) {
      res.kept.push(w.path);
      continue;
    }
    if (cur !== want) {
      res.written.push(w.path);
      if (!dryRun) writeFileAtomic(abs, w.content, w.executable);
    }
    entries.push({ path: w.path, sha256: want });
  }
  const gone: string[] = [];
  for (const e of prev.entries) {
    if (wantPaths.has(e.path)) continue;
    const abs = path.join(target, ...e.path.split("/"));
    if (fs.existsSync(abs) && sha256(fs.readFileSync(abs)) !== e.sha256) {
      res.kept.push(e.path);
      continue;
    }
    res.removed.push(e.path);
    gone.push(e.path);
  }
  const settingsFile = path.join(target, ...SETTINGS_LOCAL.split("/"));
  const cur = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, "utf8") : null;
  const want = { ...settingsWant({ claudeSettings: { deny: [] } }, {}), hooks: plan.settingsHooks };
  let settingsKeys: string[] = [];
  if (plan.settingsHooks.length) {
    const r = MERGERS.settings.merge(cur, want, prev.settingsKeys);
    if (r.ok) {
      settingsKeys = r.keys;
      if (r.text !== cur) {
        res.settings = "merged";
        if (!dryRun) writeFileAtomic(settingsFile, Buffer.from(r.text, "utf8"), false);
      }
    } else res.settings = "conflict";
  } else if (cur !== null && prev.settingsKeys.length) {
    const r = MERGERS.settings.unmerge(cur, prev.settingsKeys, { ...want, hooks: [] });
    if (r.ok) {
      res.settings = "unmerged";
      if (!dryRun) {
        if (r.empty) removeFile(target, SETTINGS_LOCAL);
        else writeFileAtomic(settingsFile, Buffer.from(r.text, "utf8"), false);
      }
    }
  }
  if (!dryRun) {
    for (const p of gone) removeFile(target, p);
    removeEmptyDirs(target, gone);
    const lockFile = path.join(target, ...LOCAL_LOCK.split("/"));
    const hasLocal = fs.existsSync(path.join(target, ...LOCAL_DIR.split("/")));
    if (entries.length || settingsKeys.length) writeFileAtomic(lockFile, Buffer.from(`${JSON.stringify({ schema: LOCAL_LOCK_SCHEMA, entries, settingsKeys }, null, 2)}\n`, "utf8"), false);
    else if (hasLocal && fs.existsSync(lockFile)) removeFile(target, LOCAL_LOCK);
    writeExclude(target, [...entries.map((e) => e.path), ...(settingsKeys.length ? [SETTINGS_LOCAL] : [])].sort(byteCompare));
  }
  return res;
}
