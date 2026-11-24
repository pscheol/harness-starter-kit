/**
 * 모듈 doctor 검사(설계 10 §3.1 10단계 · §3.2 · §3.3, MD-R4 · R11 · R12 · R13 · R16). 읽기만 한다.
 * 도구 버전 확인(versionCmd)과 gh · glab 조회만 외부 명령을 부른다. 모델을 부르지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import type { Io } from "../cli/context";
import { git } from "../core/git";
import type { LockEntry } from "../core/lock";
import { HARNESS_LOAD, measureSession, type Measure } from "../core/measure";
import type { MetaV2 } from "../core/meta";
import { globToRegExp } from "../core/layout";
import { isDir } from "../core/fsx";
import { loadModuleOrNull, listModuleIds, type ModuleDecl } from "./declaration";
import { checkVisibility, uploadsAllowed } from "./entire/visibility";
import { checkTool, rangeOf, runCmd } from "./tools";
import { readPushState, entireHarnesses } from "./entire/settings";
import { designHarness, implementHarness } from "./roles";

export interface ModuleFinding {
  kind: string;
  severity: "error" | "warn" | "info";
  path?: string;
  owner?: string;
  hint?: string;
  detail?: Record<string, unknown>;
}

export const MODULE_KINDS = [
  "tool-missing", "tool-version", "design-harness", "construction-artifacts", "aidlc-freshness", "implement-only", "trailer-allowed",
  "push-policy", "global-hooks-path", "gitlab-squash-template", "concurrent-sessions", "external-hooks-left", "module-conflict", "module-decl", "module-undeclared",
];

const HARNESS_DIRS: [string, string][] = [[".claude/", "claude"], [".codex/", "codex"], [".cursor/", "cursor"], [".kiro/", "kiro"]];

/** lock 의 external:<tool> 항목 경로로 그 도구가 깔린 하네스를 알아낸다 */
export function harnessesOfOwner(entries: LockEntry[], owner: string): string[] {
  const out = new Set<string>();
  for (const e of entries) if (e.owner === owner) for (const [dir, h] of HARNESS_DIRS) if (e.path.startsWith(dir)) out.add(h);
  return [...out].sort();
}

/** 하네스 설정 파일에 남은 외부 훅 수(그 모듈 externalHooks 에 맞는 명령) */
export function externalHookCount(m: ModuleDecl, measure: Measure, owner: string): number {
  void m;
  return Object.values(measure.hooks[owner] ?? {}).reduce((s, n) => s + n, 0);
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export interface DoctorCtx {
  io: Io;
  root: string;
  templatesDir: string | null;
  meta: MetaV2;
  entries: LockEntry[];
}

/** 훅 명령 판별용: 모든 모듈 선언의 외부 훅 글 → owner */
export function hookOwnerTable(templatesDir: string | null): [string, string[]][] {
  if (!templatesDir) return [];
  const out: [string, string[]][] = [];
  for (const id of listModuleIds(templatesDir)) {
    const m = loadModuleOrNull(templatesDir, id);
    if (m && m.externalHooks.length) out.push([`external:${m.requires.tools[0]?.name ?? m.id}`, m.externalHooks]);
  }
  return out;
}

export function measureFor(c: DoctorCtx, harness: string): Measure {
  return measureSession(c.root, { harness, entries: c.entries.map((e) => ({ path: e.path, owner: e.owner })), hookOwners: hookOwnerTable(c.templatesDir) });
}

function toolFindings(c: DoctorCtx, m: ModuleDecl): ModuleFinding[] {
  const out: ModuleFinding[] = [];
  for (const t of m.requires.tools) {
    const range = rangeOf(t, c.meta as unknown as Record<string, unknown>);
    const s = checkTool(c.io, c.root, t, range);
    if (!s.installed) out.push({ kind: "tool-missing", severity: "warn", owner: m.id, hint: `${m.id} 모듈이 켜져 있는데 ${t.name} 가 없다. 설치 명령은 harness-kit add ${m.id} --dry-run 에 나온다` });
    else if (s.inRange === false) out.push({ kind: "tool-version", severity: "warn", owner: m.id, hint: `${t.name} ${s.version} 은 검증된 범위(${range}) 밖이다`, detail: { version: s.version, range } });
    else if (s.inRange === null) out.push({ kind: "tool-version", severity: "info", owner: m.id, hint: `${t.name} 버전을 읽지 못했다(범위 ${range})` });
  }
  return out;
}

function aidlcFindings(c: DoctorCtx, m: ModuleDecl): ModuleFinding[] {
  const out: ModuleFinding[] = [];
  const owner = `external:${m.requires.tools[0]?.name ?? m.id}`;
  const installed = harnessesOfOwner(c.entries, owner);
  const design = designHarness(c.meta as unknown as Record<string, unknown>);
  if (installed.length && !installed.includes(design)) {
    out.push({ kind: "design-harness", severity: "warn", owner: m.id, hint: `설계 역할은 ${design} 인데 AI-DLC 는 ${installed.join(", ")} 에만 있다`, detail: { design, installed } });
  }
  const spaces = path.join(c.root, "aidlc", "spaces");
  const construction: string[] = [];
  if (isDir(spaces)) {
    for (const space of fs.readdirSync(spaces)) {
      const intents = path.join(spaces, space, "intents");
      if (!isDir(intents)) continue;
      for (const rec of fs.readdirSync(intents)) {
        const cd = path.join(intents, rec, "construction");
        if (isDir(cd) && fs.readdirSync(cd).length) construction.push(`aidlc/spaces/${space}/intents/${rec}/construction`);
      }
    }
  }
  if (construction.length) {
    out.push({ kind: "construction-artifacts", severity: "warn", owner: m.id, hint: "AI-DLC 구현 쪽 산출물이 생겼다. 구현은 킷 SDD 가 맡는다 — 두 곳에서 구현하지 않는다", detail: { paths: construction } });
  }
  for (const w of Object.entries(m.harnessWarnings)) {
    if (installed.includes(w[0])) out.push({ kind: "design-harness", severity: "info", owner: m.id, hint: `${w[0]}: ${w[1]}` });
  }
  return out;
}

function trailerFinding(c: DoctorCtx): ModuleFinding | null {
  const files = ["scripts/git-hooks/commit-msg", ".githooks/commit-msg", ".husky/commit-msg"];
  for (const rel of files) {
    const text = readText(path.join(c.root, rel));
    if (text === null || /Entire-Checkpoint/.test(text)) continue;
    if (/trailer|Co-Authored-By|Signed-off-by|sed -i|grep -v/i.test(text)) {
      return { kind: "trailer-allowed", severity: "warn", path: rel, owner: "entire", hint: "커밋 메시지 검사가 트레일러를 지우거나 거부할 수 있다. Entire-Checkpoint: 를 허용 목록에 더한다" };
    }
  }
  return null;
}

function sessionFinding(c: DoctorCtx): ModuleFinding | null {
  const dir = path.join(c.root, ".agents/state/sessions");
  if (!isDir(dir)) return null;
  const byCwd = new Map<string, number>();
  const cutoff = Date.now() - 3600_000;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>;
      if (j.role !== "implement" || typeof j.cwd !== "string") continue;
      const seen = typeof j.lastSeenAt === "string" ? Date.parse(j.lastSeenAt) : NaN;
      if (Number.isFinite(seen) && seen < cutoff) continue;
      byCwd.set(j.cwd, (byCwd.get(j.cwd) ?? 0) + 1);
    } catch {
      // 깨진 세션 파일은 센 것에 넣지 않는다
    }
  }
  const dup = [...byCwd].filter(([, n]) => n > 1);
  return dup.length ? { kind: "concurrent-sessions", severity: "warn", owner: "entire", hint: `같은 폴더에 구현 세션이 둘 이상이다(${dup[0]?.[0]}). 기록이 섞인다, 둘째 세션은 worktree 로 연다` } : null;
}

function entireFindings(c: DoctorCtx, m: ModuleDecl): ModuleFinding[] {
  const out: ModuleFinding[] = [];
  const impl = implementHarness(c.meta as unknown as Record<string, unknown>);
  const have = entireHarnesses(c.root);
  const extra = have.filter((h) => h !== impl);
  if (extra.length) out.push({ kind: "implement-only", severity: "warn", owner: m.id, hint: `Entire 훅이 구현 하네스(${impl}) 밖에도 있다: ${extra.join(", ")}. 리뷰 하네스에는 켜지 않는다`, detail: { implement: impl, found: have } });
  else if (have.length === 0) out.push({ kind: "implement-only", severity: "warn", owner: m.id, hint: `구현 하네스(${impl})에 Entire 훅이 없다. harness-kit add entire 를 다시 하거나 entire agent add 로 켠다` });
  else if (impl === "claude" || have.includes(impl)) {
    const review = ((c.meta as unknown as Record<string, unknown>).roles as Record<string, { harness?: string }> | undefined)?.review?.harness ?? "codex";
    if (review === impl) out.push({ kind: "implement-only", severity: "info", owner: m.id, hint: "리뷰 하네스가 구현 하네스와 같다. 같은 폴더의 리뷰 세션 대화도 기록된다, 리뷰는 원격 diff 만 읽는다" });
  }
  const t = trailerFinding(c);
  if (t) out.push(t);
  const vis = checkVisibility(c.io, c.root);
  const push = readPushState(c.root);
  if (!uploadsAllowed(vis.visibility) && push.uploads) {
    out.push({ kind: "push-policy", severity: "error", path: ".entire/settings.json", owner: m.id, hint: `원격 공개 여부가 ${vis.visibility}(${vis.via}). 체크포인트를 올리지 않는 설정이 아니다 — entire configure --project --skip-push-sessions`, detail: { visibility: vis.visibility, via: vis.via } });
  }
  const hooksPath = git(["-C", c.root, "config", "--show-scope", "--get", "core.hooksPath"], c.io.env);
  if (hooksPath.status === 0 && hooksPath.stdout.trim()) {
    const [scope, value] = hooksPath.stdout.trim().split(/\s+/, 2);
    if (scope === "global" || scope === "system") {
      out.push({ kind: "global-hooks-path", severity: "warn", owner: m.id, hint: `전역 core.hooksPath(${value})가 있다. Entire 는 git 훅을 그 폴더에 설치해 이 컴퓨터의 모든 리포에 영향을 준다 — 리포별 폴더를 쓰려면 먼저 git config --global --unset core.hooksPath`, detail: { scope, value } });
    }
  }
  if (vis.host === "gitlab") {
    const r = runCmd(c.io, c.root, ["glab", "api", "projects/:id"], { timeout: 20_000 });
    let tpl: string | null = null;
    try {
      const j = JSON.parse(r.stdout) as Record<string, unknown>;
      tpl = typeof j.squash_commit_template === "string" ? j.squash_commit_template : null;
    } catch {
      tpl = null;
    }
    if (tpl === null || !tpl.includes("%{all_commits}")) {
      out.push({ kind: "gitlab-squash-template", severity: tpl === null ? "info" : "warn", owner: m.id, hint: "GitLab squash 커밋 메시지 템플릿에 %{all_commits} 가 있어야 Entire-Checkpoint 트레일러가 남는다. Settings → Merge requests → Squash commit message template 을 '%{title} (%{reference})' 다음 줄에 '%{all_commits}' 로 바꾼다" + (tpl === null ? "(템플릿을 API 로 읽지 못해 안내만 한다)" : "") });
    }
  }
  const s = sessionFinding(c);
  if (s) out.push(s);
  return out;
}

/** 외부 모듈을 끈 뒤에도 하네스 설정에 남은 외부 훅 */
function leftoverFindings(c: DoctorCtx, off: ModuleDecl[]): ModuleFinding[] {
  const out: ModuleFinding[] = [];
  const table = hookOwnerTable(c.templatesDir);
  for (const m of off) {
    if (!m.externalHooks.length) continue;
    const owner = `external:${m.requires.tools[0]?.name ?? m.id}`;
    let n = 0;
    for (const h of Object.keys(HARNESS_LOAD)) n += externalHookCount(m, measureSession(c.root, { harness: h, entries: [], hookOwners: table }), owner);
    if (n > 0) out.push({ kind: "external-hooks-left", severity: "info", owner: m.id, hint: `${m.id} 모듈은 꺼졌지만 ${owner} 훅이 하네스 설정에 ${n}개 남아 있다. 그 도구의 명령으로 뺀다(킷은 건드리지 않는다)`, detail: { count: n } });
  }
  return out;
}

export function moduleFindings(c: DoctorCtx): ModuleFinding[] {
  if (!c.templatesDir) return [];
  const out: ModuleFinding[] = [];
  const on = c.meta.modules;
  const off: ModuleDecl[] = [];
  for (const id of listModuleIds(c.templatesDir)) {
    let m: ModuleDecl | null;
    try {
      m = loadModuleOrNull(c.templatesDir, id);
    } catch (err) {
      out.push({ kind: "module-decl", severity: "warn", owner: id, hint: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (!m) continue;
    if (!on.includes(id)) {
      if (m.kind === "external") off.push(m);
      continue;
    }
    for (const other of m.conflicts) if (on.includes(other)) out.push({ kind: "module-conflict", severity: "error", owner: id, hint: `${id} 와 ${other} 는 같이 켤 수 없다` });
    if (m.kind !== "external") continue;
    out.push(...toolFindings(c, m));
    if (m.id === "aidlc") out.push(...aidlcFindings(c, m));
    if (m.id === "entire") out.push(...entireFindings(c, m));
    out.push(...declaredHookFindings(c, m));
  }
  out.push(...leftoverFindings(c, off));
  return out;
}

/** module.json 에 적은 훅이 설치된 hooks.d 에 있는지(MD-R1: 선언에 없는 것을 깔지 않고, 선언한 것은 깔려 있다) */
function declaredHookFindings(c: DoctorCtx, m: ModuleDecl): ModuleFinding[] {
  if (!m.hooks.length) return [];
  const dir = path.join(c.root, ".agents/hooks.d");
  const ids = new Set<string>();
  if (isDir(dir)) {
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { hooks?: { id?: string }[] };
        for (const h of j.hooks ?? []) if (typeof h.id === "string") ids.add(h.id);
      } catch {
        // 깨진 훅 파일은 배치 검사가 잡는다
      }
    }
  }
  const missing = m.hooks.filter((h) => !ids.has(h.id)).map((h) => h.id);
  return missing.length ? [{ kind: "module-undeclared", severity: "error", owner: m.id, hint: `module.json 이 선언한 훅 ${missing.join(" · ")} 가 .agents/hooks.d 에 없다. harness-kit repair`, detail: { missing } }] : [];
}

/** 선언한 파일 목록 vs 모듈 폴더 안 실제 파일(템플릿 쪽 검사, 시험이 부른다) */
export function undeclaredTemplateFiles(templatesDir: string, m: ModuleDecl): string[] {
  if (m.files === "layer") return [];
  const base = path.join(templatesDir, "optional", m.id);
  const declared = new Set(m.files.map((f) => f.from));
  const found: string[] = [];
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else if (e.name !== "module.json" && e.name !== "ABOUT" && e.name !== ".DS_Store") found.push(child);
    }
  };
  walk("");
  void globToRegExp;
  return found.filter((f) => !declared.has(f)).sort();
}
