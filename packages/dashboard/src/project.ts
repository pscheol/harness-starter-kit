/** 프로젝트 하나의 문맥: 메인 폴더 · 공유 메타 · git 사용자 · 캐시 · 쓰기 잠금 · 읽기 전용 · 의존 함수. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { policyOf, type Policy } from "./approvals";
import { Cache, fileStamp } from "./cache";
import { gitUser, locate, type Location } from "./repo";
import { type Env, isObj, kitConfigDir, readJson } from "./util";

export interface DoctorSummary {
  /** problems 가 있으면 "problems". 참고(notes)만 있으면 "ok" */
  status: "ok" | "problems" | "unavailable";
  counts: Record<string, number>;
  /** 사람이 손봐야 하는 것(오류 · 주의 · 되살릴 파일) */
  problems: DoctorItem[];
  /** 알아 두면 되는 것(사람이 고친 킷 파일 · 옛 이름 · 만료 공지 등). 홈 '처리할 일'에 넣지 않는다 */
  noteCounts?: Record<string, number>;
  notes?: DoctorItem[];
}

/** message 는 CLI hint 원문, label · help 는 관리 페이지용 쉬운 말(합니다체) */
export interface DoctorItem {
  kind: string;
  severity?: string;
  path?: string;
  message: string;
  label?: string;
  help?: string;
}

/** CLI 가 넣는 함수(서버는 CLI 모듈을 import 하지 않는다). 시험은 바꿔 끼운다. */
export interface Deps {
  doctor?: (root: string, env: Env) => Promise<DoctorSummary> | DoctorSummary;
  outdated?: (root: string, env: Env) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface ProjectOptions {
  env: Env;
  home: string;
  readOnly: boolean;
  /** 여러 프로젝트 모드: 정리 쓰기(죽은 세션 · 오래된 대기함)를 하지 않는다(DB-R27) */
  multi: boolean;
  deps: Deps;
}

export const DEFAULT_GATES = ["codebase", "intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"];
export const ISSUE_GATES = ["requirements", "design", "tasks", "mr", "done"];
/** 하한 게이트 — 원본은 CLI core/floor.ts(설정으로 바꿀 수 없다, 설계 04 §3.8). */
export { GATE_FLOOR } from "../../cli/src/core/floor";

export function projectIdOf(dir: string): string {
  let p = path.resolve(dir);
  try {
    p = fs.realpathSync(p);
  } catch {
    // 없는 폴더도 같은 식
  }
  return crypto.createHash("sha256").update(p).digest("hex").slice(0, 12);
}

export class Project {
  readonly loc: Location;
  readonly env: Env;
  readonly home: string;
  readonly readOnly: boolean;
  readonly multi: boolean;
  readonly deps: Deps;
  readonly cache = new Cache();
  readonly id: string;
  private locks = new Map<string, Promise<void>>();

  constructor(loc: Location, opts: ProjectOptions) {
    this.loc = loc;
    this.env = opts.env;
    this.home = opts.home;
    this.readOnly = opts.readOnly;
    this.multi = opts.multi;
    this.deps = opts.deps;
    this.id = projectIdOf(loc.root);
  }

  static async open(cwd: string, opts: ProjectOptions): Promise<Project> {
    return new Project(await locate(cwd, opts.env), opts);
  }

  get root(): string {
    return this.loc.root;
  }

  /** 공유 메타(.agents/knots-sync.json). 개인 층은 roles · git.ide 만 덮을 수 있어 여기서는 읽지 않는다(README §5). */
  meta(): Record<string, unknown> {
    const file = path.join(this.root, ".agents/knots-sync.json");
    const stamp = fileStamp(file);
    const hit = this.metaCache;
    if (hit && hit.stamp === stamp) return hit.value;
    const value = readJson(file) ?? {};
    this.metaCache = { stamp, value };
    return value;
  }
  private metaCache: { stamp: string; value: Record<string, unknown> } | null = null;

  name(): string {
    const project = this.meta().project;
    return isObj(project) && typeof project.name === "string" && project.name ? project.name : path.basename(this.root);
  }

  gates(): string[] {
    const flow = this.meta().flow;
    const g = isObj(flow) && Array.isArray(flow.gates) ? flow.gates.filter((x): x is string => typeof x === "string") : null;
    return g && g.length ? g : DEFAULT_GATES;
  }

  base(): string {
    const g = this.meta().git;
    return isObj(g) && typeof g.base === "string" && g.base ? g.base : "develop";
  }

  policy(): Policy {
    return policyOf(this.meta());
  }

  modules(): string[] {
    const m = this.meta().modules;
    return Array.isArray(m) ? m.filter((x): x is string => typeof x === "string") : [];
  }

  /** 이 컴퓨터 설정 ~/.config/knots-sync/config.json(사람이 쓴다, 킷은 읽기만, 06 §3.17). */
  machineConfig(): Record<string, unknown> {
    return readJson(path.join(kitConfigDir(this.home, this.env), "config.json")) ?? {};
  }

  async user(root: string = this.root): Promise<{ email: string | null; name: string | null }> {
    return this.cache.get(`user:${root}`, `${fileStamp(path.join(this.loc.common, "config"))}\n${fileStamp(path.join(this.home, ".gitconfig"))}`, () => gitUser(root, this.env));
  }

  /** 경로별 프로세스 안 잠금(06 §3.6 저장 순서 1). */
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const next = new Promise<void>((r) => {
      release = r;
    });
    const chained = prev.then(() => next);
    this.locks.set(key, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === chained) this.locks.delete(key);
    }
  }
}
