/**
 * 모듈 선언 파일 `optional/<id>/module.json` 읽기와 검사(설계 10 §3.1, MD-R1).
 * 모든 모듈(kit · external)이 이 파일 하나로 파일 · 훅 · 설정 키 · 외부 경로 · 요구 · 충돌을 선언한다.
 * 이 파일에 없는 것은 깔지 않는다. 여기서는 읽고 검사만 한다(쓰지 않는다).
 */
import fs from "node:fs";
import path from "node:path";
import { CliError, EXIT } from "../core/errors";
import { isDir } from "../core/fsx";

export const MODULE_SCHEMA = "knots-sync.module/v1";
export const MODULE_FILE = "module.json";

export type Platform = "darwin" | "linux" | "win32";
export const PLATFORMS: Platform[] = ["darwin", "linux", "win32"];

export interface ToolDecl {
  name: string;
  versionCmd: string[];
  /** 메타 `versions.<도구>` 처럼 점 경로. 없으면 range 만 쓴다 */
  rangeKey: string;
  /** 기본 범위(메타가 덮는다) */
  range: string;
  /** 킷 하네스 id → 이 도구가 쓰는 하네스 이름. 없는 하네스는 이 도구가 지원하지 않는다 */
  harnessNames: Record<string, string>;
  install: { commands: Partial<Record<Platform, string[] | null>>; doc: string; hint: string[] };
  update: Partial<Record<Platform, string[] | null>>;
  latest: { cmd: string[]; json: string } | null;
}

export type Step =
  | { kind: "run"; argv: string[]; confirm: boolean; allowFail: boolean }
  | { kind: "call"; name: string }
  | { kind: "registerExternal" }
  | { kind: "applyKit" }
  | { kind: "removeKit" }
  | { kind: "setConfig" }
  | { kind: "unsetConfig" }
  | { kind: "doctor"; id: string }
  | { kind: "print"; text: string };

export interface HookDecl {
  id: string;
  event: string;
  harnesses: string[];
  script: string;
}

export interface ModuleDecl {
  id: string;
  title: string;
  summary: string;
  kind: "kit" | "external";
  requires: { kit: string | null; modules: string[]; tools: ToolDecl[] };
  conflicts: string[];
  /** "layer" = 모듈 폴더의 파일 전부(layout.json 매핑). 목록이면 그 파일만(폴더에 더 있으면 오류) */
  files: "layer" | { from: string; op: string }[];
  hooks: HookDecl[];
  settings: { path: string; keys: string[] }[];
  externalPaths: string[];
  /** 외부 도구 훅 명령에 들어 있는 글(설정 파일 속 훅 항목의 주인을 가린다) */
  externalHooks: string[];
  harnessWarnings: Record<string, string>;
  config: { set: Record<string, unknown>; unset: Record<string, unknown> };
  steps: { add: Step[]; remove: Step[] };
  doctor: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

function bad(id: string, message: string): CliError {
  return new CliError(EXIT.ENV, `module.json 형식 오류(${id}): ${message}`, "킷 템플릿을 다시 받는다");
}

function strList(id: string, v: unknown, what: string, optional = true): string[] {
  if (v === undefined && optional) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw bad(id, `${what} 는 문자열 배열이어야 한다`);
  return [...(v as string[])];
}

function argv(id: string, v: unknown, what: string): string[] {
  const l = strList(id, v, what, false);
  if (l.length === 0) throw bad(id, `${what} 가 비었다`);
  return l;
}

function toolOf(id: string, raw: unknown, i: number): ToolDecl {
  const where = `requires.tools[${i}]`;
  if (!isObj(raw)) throw bad(id, `${where} 가 객체가 아니다`);
  if (typeof raw.name !== "string" || !/^[a-z][a-z0-9-]*$/.test(raw.name)) throw bad(id, `${where}.name`);
  if (typeof raw.range !== "string") throw bad(id, `${where}.range`);
  const names = isObj(raw.harnessNames) ? raw.harnessNames : {};
  const inst = isObj(raw.install) ? raw.install : {};
  const upd = isObj(raw.update) ? raw.update : {};
  const commands: Partial<Record<Platform, string[] | null>> = {};
  const updates: Partial<Record<Platform, string[] | null>> = {};
  for (const p of PLATFORMS) {
    commands[p] = inst[p] === null || inst[p] === undefined ? null : argv(id, inst[p], `${where}.install.${p}`);
    updates[p] = upd[p] === null || upd[p] === undefined ? null : argv(id, upd[p], `${where}.update.${p}`);
  }
  const latest = isObj(raw.latest) ? { cmd: argv(id, raw.latest.cmd, `${where}.latest.cmd`), json: typeof raw.latest.json === "string" ? raw.latest.json : "" } : null;
  return {
    name: raw.name,
    versionCmd: argv(id, raw.versionCmd, `${where}.versionCmd`),
    rangeKey: typeof raw.rangeKey === "string" ? raw.rangeKey : `versions.${raw.name}`,
    range: raw.range,
    harnessNames: Object.fromEntries(Object.entries(names).filter(([, v]) => typeof v === "string")) as Record<string, string>,
    install: { commands, doc: typeof inst.doc === "string" ? inst.doc : "", hint: strList(id, inst.hint, `${where}.install.hint`) },
    update: updates,
    latest,
  };
}

function stepOf(id: string, raw: unknown, where: string): Step {
  if (!isObj(raw)) throw bad(id, `${where} 가 객체가 아니다`);
  if (raw.run !== undefined) return { kind: "run", argv: argv(id, raw.run, `${where}.run`), confirm: raw.confirm === true, allowFail: raw.allowFail === true };
  if (typeof raw.call === "string") return { kind: "call", name: raw.call };
  if (raw.registerExternal === true) return { kind: "registerExternal" };
  if (raw.applyKit === true) return { kind: "applyKit" };
  if (raw.removeKit === true) return { kind: "removeKit" };
  if (raw.setConfig === true) return { kind: "setConfig" };
  if (raw.unsetConfig === true) return { kind: "unsetConfig" };
  if (typeof raw.doctor === "string") return { kind: "doctor", id: raw.doctor };
  if (typeof raw.print === "string") return { kind: "print", text: raw.print };
  throw bad(id, `${where}: 모르는 단계 ${JSON.stringify(raw)}`);
}

function stepsOf(id: string, v: unknown, what: string): Step[] {
  if (!Array.isArray(v)) throw bad(id, `steps.${what} 가 배열이 아니다`);
  return v.map((s, i) => stepOf(id, s, `steps.${what}[${i}]`));
}

export function parseModule(text: string, expectId?: string): ModuleDecl {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw bad(expectId ?? "?", err instanceof Error ? err.message : String(err));
  }
  if (!isObj(raw)) throw bad(expectId ?? "?", "최상위가 객체가 아니다");
  const id = typeof raw.id === "string" ? raw.id : "?";
  if (raw.schema !== MODULE_SCHEMA) throw bad(id, `schema 가 ${MODULE_SCHEMA} 가 아니다`);
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw bad(id, "id 형식");
  if (expectId !== undefined && id !== expectId) throw bad(id, `폴더 이름 ${expectId} 와 id 가 다르다`);
  if (raw.kind !== "kit" && raw.kind !== "external") throw bad(id, "kind 는 kit 또는 external");
  if (typeof raw.title !== "string" || typeof raw.summary !== "string") throw bad(id, "title · summary 는 문자열");
  const req = isObj(raw.requires) ? raw.requires : {};
  const tools = Array.isArray(req.tools) ? req.tools.map((t, i) => toolOf(id, t, i)) : [];
  if (raw.kind === "kit" && tools.length) throw bad(id, "kind kit 은 외부 도구를 요구하지 않는다");
  let files: ModuleDecl["files"];
  if (raw.files === "layer") files = "layer";
  else if (Array.isArray(raw.files)) {
    files = raw.files.map((f, i) => {
      if (!isObj(f) || typeof f.from !== "string" || f.from.includes("..") || path.isAbsolute(f.from)) throw bad(id, `files[${i}].from`);
      if (f.op !== undefined && f.op !== "copy") throw bad(id, `files[${i}].op 는 copy 만 쓴다`);
      return { from: f.from, op: "copy" };
    });
  } else throw bad(id, 'files 는 "layer" 또는 목록');
  const hooks = (Array.isArray(raw.hooks) ? raw.hooks : []).map((h, i): HookDecl => {
    if (!isObj(h) || typeof h.id !== "string" || typeof h.event !== "string" || typeof h.script !== "string") throw bad(id, `hooks[${i}]`);
    return { id: h.id, event: h.event, harnesses: strList(id, h.harnesses, `hooks[${i}].harnesses`), script: h.script };
  });
  const settings = (Array.isArray(raw.settings) ? raw.settings : []).map((s, i) => {
    if (!isObj(s) || typeof s.path !== "string") throw bad(id, `settings[${i}]`);
    return { path: s.path, keys: strList(id, s.keys, `settings[${i}].keys`) };
  });
  const cfg = isObj(raw.config) ? raw.config : {};
  const steps = isObj(raw.steps) ? raw.steps : {};
  const decl: ModuleDecl = {
    id,
    title: raw.title,
    summary: raw.summary,
    kind: raw.kind,
    requires: { kit: typeof req.kit === "string" ? req.kit : null, modules: strList(id, req.modules, "requires.modules"), tools },
    conflicts: strList(id, raw.conflicts, "conflicts"),
    files,
    hooks,
    settings,
    externalPaths: strList(id, raw.externalPaths, "externalPaths"),
    externalHooks: strList(id, raw.externalHooks, "externalHooks"),
    harnessWarnings: isObj(raw.harnessWarnings) ? (Object.fromEntries(Object.entries(raw.harnessWarnings).filter(([, v]) => typeof v === "string")) as Record<string, string>) : {},
    config: { set: isObj(cfg.set) ? cfg.set : {}, unset: isObj(cfg.unset) ? cfg.unset : {} },
    steps: { add: stepsOf(id, steps.add ?? [], "add"), remove: stepsOf(id, steps.remove ?? [], "remove") },
    doctor: strList(id, raw.doctor, "doctor"),
  };
  checkOrder(decl);
  return decl;
}

/** 단계 순서 규칙: registerExternal 은 applyKit 앞(lock 은 applyKit 이 한 번에 쓴다). 외부 단계는 kind external 에만. */
function checkOrder(m: ModuleDecl): void {
  const add = m.steps.add.map((s) => s.kind);
  const reg = add.indexOf("registerExternal");
  const apply = add.indexOf("applyKit");
  if (reg >= 0 && apply >= 0 && reg > apply) throw bad(m.id, "registerExternal 은 applyKit 앞에 둔다");
  if (m.kind === "kit" && [...m.steps.add, ...m.steps.remove].some((s) => s.kind === "run" || s.kind === "call" || s.kind === "registerExternal")) {
    throw bad(m.id, "kind kit 은 외부 명령 단계를 갖지 않는다");
  }
  if (!add.includes("applyKit")) throw bad(m.id, "steps.add 에 applyKit 이 없다");
  if (!m.steps.remove.some((s) => s.kind === "removeKit")) throw bad(m.id, "steps.remove 에 removeKit 이 없다");
}

export function modulePath(templatesDir: string, id: string): string {
  return path.join(templatesDir, "optional", id, MODULE_FILE);
}

export function loadModule(templatesDir: string, id: string): ModuleDecl {
  const file = modulePath(templatesDir, id);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new CliError(EXIT.ENV, `module.json 이 없다: ${file}`);
  }
  return parseModule(text, id);
}

/** module.json 이 있는 모듈 id 목록(폴더 이름 순). 없으면 빈 목록(옛 템플릿 폴더) */
export function listModuleIds(templatesDir: string): string[] {
  const dir = path.join(templatesDir, "optional");
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => isDir(path.join(dir, n)) && fs.existsSync(path.join(dir, n, MODULE_FILE)))
    .sort();
}

/** module.json 이 있으면 읽고, 없으면 null(옛 템플릿 · 시험용 템플릿은 모듈 선언 없이 폴더만 있다) */
export function loadModuleOrNull(templatesDir: string, id: string): ModuleDecl | null {
  return fs.existsSync(modulePath(templatesDir, id)) ? loadModule(templatesDir, id) : null;
}
