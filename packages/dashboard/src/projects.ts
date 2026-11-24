/**
 * 전체 프로젝트(설계 06 §3.17, DB-R27). 등록부 ~/.config/harness-kit/projects.json 은 `projects add|remove` 만 쓴다.
 * 여러 프로젝트 모드(--all · --root · --workspace)는 아무 파일도 쓰지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { ApiError, bad } from "./errors";
import { overview } from "./model";
import { Project, type ProjectOptions, projectIdOf } from "./project";
import { publicSession, readSessions } from "./readers/sessions";
import { atomicWrite, type Env, ensureDir, isObj, kitConfigDir, readJson } from "./util";

export type ProjectsMode = { kind: "single" } | { kind: "all" } | { kind: "root"; dir: string } | { kind: "workspace"; file: string };

export interface RegistryEntry {
  path: string;
  name: string;
  addedAt: string;
}

/** 이 컴퓨터 설정 폴더. `HARNESS_KIT_CONFIG_DIR`(절대 경로)이 있으면 그것 — 시험이 실제 홈을 쓰지 않게 한다. */
export function configDir(home: string, env: Env = {}): string {
  return kitConfigDir(home, env);
}

export function registryFile(home: string, env: Env = {}): string {
  return path.join(configDir(home, env), "projects.json");
}

export function readRegistry(home: string, env: Env = {}): RegistryEntry[] {
  const data = readJson(registryFile(home, env));
  const list = data && Array.isArray(data.projects) ? data.projects : [];
  return list.filter((x): x is Record<string, unknown> => isObj(x) && typeof x.path === "string").map((x) => ({ path: String(x.path), name: typeof x.name === "string" ? x.name : path.basename(String(x.path)), addedAt: typeof x.addedAt === "string" ? x.addedAt : "" }));
}

function writeRegistry(home: string, projects: RegistryEntry[], env: Env = {}): void {
  ensureDir(configDir(home, env), 0o700);
  atomicWrite(registryFile(home, env), `${JSON.stringify({ schema: "harness-kit.projects/v1", projects }, null, 2)}\n`, 0o600);
  fs.chmodSync(registryFile(home, env), 0o600);
}

export function isHarnessRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".agents/harness-kit.json"));
}

export function addProject(home: string, dir: string, today: string, env: Env = {}): { added: boolean; entry: RegistryEntry } {
  let real: string;
  try {
    real = fs.realpathSync(dir);
  } catch {
    throw new ApiError(404, "not_found", `폴더가 없습니다: ${dir}`);
  }
  if (!isHarnessRepo(real)) throw new ApiError(422, "not_a_harness_repo", `킷을 설치한 리포가 아니다(.agents/harness-kit.json 없음): ${real}`);
  const list = readRegistry(home, env);
  const found = list.find((e) => e.path === real);
  if (found) return { added: false, entry: found };
  const meta = readJson(path.join(real, ".agents/harness-kit.json")) ?? {};
  const project = isObj(meta.project) ? meta.project : {};
  const entry = { path: real, name: typeof project.name === "string" && project.name ? project.name : path.basename(real), addedAt: today };
  writeRegistry(home, [...list, entry], env);
  return { added: true, entry };
}

export function removeProject(home: string, nameOrPath: string, env: Env = {}): { removed: RegistryEntry[] } {
  const list = readRegistry(home, env);
  let real = nameOrPath;
  try {
    real = fs.realpathSync(nameOrPath);
  } catch {
    real = path.resolve(nameOrPath);
  }
  const removed = list.filter((e) => e.name === nameOrPath || e.path === nameOrPath || e.path === real);
  if (removed.length === 0) throw new ApiError(404, "not_found", `등록부에 없습니다: ${nameOrPath}`);
  writeRegistry(home, list.filter((e) => !removed.includes(e)), env);
  return { removed };
}

/** --root: 깊이 3까지 .agents/harness-kit.json 이 있는 폴더(등록부에 더하지 않는다). */
export function discover(dir: string, depth = 3): RegistryEntry[] {
  const out: RegistryEntry[] = [];
  const walk = (d: string, left: number): void => {
    if (isHarnessRepo(d)) out.push({ path: d, name: path.basename(d), addedAt: "" });
    if (left === 0) return;
    let names: string[] = [];
    try {
      names = fs.readdirSync(d).sort();
    } catch {
      return;
    }
    for (const n of names) {
      if (n.startsWith(".") || n === "node_modules") continue;
      const f = path.join(d, n);
      try {
        if (fs.lstatSync(f).isDirectory()) walk(f, left - 1);
      } catch {
        // 읽지 못한 폴더는 건너뛴다
      }
    }
  };
  walk(fs.realpathSync(dir), depth);
  return out;
}

export function workspaceEntries(file: string): RegistryEntry[] {
  const data = readJson(file);
  if (!data) throw bad(`workspace 파일을 읽지 못했습니다: ${file}`);
  const list = Array.isArray(data.projects) ? data.projects : [];
  return list.map((x) => (typeof x === "string" ? x : isObj(x) && typeof x.path === "string" ? x.path : null)).filter((x): x is string => x !== null).map((p) => {
    const abs = path.resolve(path.dirname(file), p);
    return { path: abs, name: path.basename(abs), addedAt: "" };
  });
}

export function modeEntries(mode: ProjectsMode, home: string, env: Env = {}): RegistryEntry[] {
  if (mode.kind === "all" || mode.kind === "single") return readRegistry(home, env);
  if (mode.kind === "root") return discover(mode.dir);
  return workspaceEntries(mode.file);
}

export interface ProjectSlot {
  entry: RegistryEntry;
  id: string;
  state: "ok" | "missing" | "not-harness";
  project: Project | null;
}

export class Projects {
  private slots = new Map<string, ProjectSlot>();

  constructor(
    private readonly entries: () => RegistryEntry[],
    private readonly opts: ProjectOptions,
  ) {}

  async list(): Promise<ProjectSlot[]> {
    const out: ProjectSlot[] = [];
    for (const e of this.entries()) {
      const id = projectIdOf(e.path);
      let slot = this.slots.get(id);
      if (!slot || slot.entry.path !== e.path) {
        const exists = fs.existsSync(e.path);
        const state: ProjectSlot["state"] = !exists ? "missing" : isHarnessRepo(e.path) ? "ok" : "not-harness";
        let project: Project | null = null;
        if (state === "ok") {
          try {
            project = await Project.open(e.path, { ...this.opts, multi: true });
          } catch {
            project = null;
          }
        }
        slot = { entry: e, id, state: state === "ok" && !project ? "not-harness" : state, project };
        this.slots.set(id, slot);
      }
      out.push(slot);
    }
    return out;
  }

  async get(id: string): Promise<Project | null> {
    return (await this.list()).find((s) => s.id === id)?.project ?? null;
  }
}

export async function projectsList(projects: Projects): Promise<Record<string, unknown>> {
  return {
    projects: (await projects.list()).map((s) => ({
      id: s.id, name: s.entry.name, path: s.entry.path, addedAt: s.entry.addedAt || null, state: s.state,
      version: s.project ? (isObj(s.project.meta().kit) ? ((s.project.meta().kit as Record<string, unknown>).version ?? null) : null) : null,
      remove: s.state === "ok" ? null : `npx harness-kit projects remove ${s.entry.name}`,
    })),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${ms}ms 넘음`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** 프로젝트마다 처리할 일 · 단계 수. 동시 4개, 프로젝트당 3초. 못 읽은 프로젝트는 그 줄만 "읽기 실패"(06 §3.17). */
export async function projectsOverview(projects: Projects, timeoutMs = 3000): Promise<Record<string, unknown>> {
  const slots = await projects.list();
  const rows: Record<string, unknown>[] = new Array(slots.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < slots.length) {
      const i = next++;
      const s = slots[i] as ProjectSlot;
      const base = { id: s.id, name: s.entry.name, path: s.entry.path };
      if (!s.project) {
        rows[i] = { ...base, state: s.state, error: s.state === "missing" ? "폴더 없음" : "킷 리포가 아니다" };
        continue;
      }
      try {
        const o = await withTimeout(overview(s.project), timeoutMs);
        rows[i] = { ...base, state: "ok", todo: (o.todo as unknown[]).slice(0, 10), total: o.total, stages: o.stages, issues: o.issues, sessions: o.sessions };
      } catch (err) {
        rows[i] = { ...base, state: "error", error: `읽기 실패: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const nested = rows.map((r) => ({ ...r, children: [] as unknown[] }) as Record<string, unknown> & { children: unknown[] });
  const top: typeof nested = [];
  for (const r of nested) {
    const parent = nested.find((o) => o !== r && String(r.path).startsWith(`${String(o.path)}${path.sep}`));
    if (parent) parent.children.push({ id: r.id, name: r.name, state: r.state });
    else top.push(r);
  }
  return { projects: top };
}

export async function machineSessions(projects: Project[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown>[] = [];
  for (const p of projects) for (const s of await readSessions(p)) out.push({ project: p.name(), projectId: p.id, ...publicSession(s) });
  return { sessions: out };
}
