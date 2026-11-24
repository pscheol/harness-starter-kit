/** 하네스 어댑터 인터페이스(HK-13 design §8.1, 03 §3.1). 어댑터는 원하는 작업만 낸다. 쓰기 · lock 은 엔진이 한다. */
import type { HookDef } from "../projection/hooks";
import type { MergeKind, MergeWant } from "../projection/merge";
import type { Role, Rule, Skill, SkillFile } from "../projection/render";
import type { Sources } from "../projection/sources";
import type { ProjectionSpec } from "../projection/spec";
import type { RepoView } from "../projection/view";

export type HarnessId = "claude" | "codex" | "cursor" | "kiro" | (string & {});

export interface MirrorWant {
  op: "mirror";
  path: string;
  harness: string;
  from: string;
  kind: "dir" | "file";
  /** kind dir */
  files: SkillFile[];
  /** kind file */
  data: Buffer;
  executable: boolean;
  sha256: string;
  fromSha256: string;
  deferred: boolean;
}

export interface RenderWant {
  op: "render";
  path: string;
  harness: string;
  from: string;
  kind: "file";
  files: SkillFile[];
  data: Buffer;
  executable: boolean;
  sha256: string;
  fromSha256: string;
  deferred: boolean;
}

export interface MergeOpWant {
  op: "merge";
  path: string;
  harness: string;
  kind: MergeKind;
  want: MergeWant;
}

export type Want = MirrorWant | RenderWant | MergeOpWant;
export type FileWant = MirrorWant | RenderWant;

export interface Finding {
  kind: string;
  severity: "error" | "warn";
  path: string;
  hint: string;
}

export interface ProjectionContext {
  view: RepoView;
  spec: ProjectionSpec;
  tokens: Record<string, string>;
  agents: string[];
  sources: Sources;
  /** 배치할 스킬(킷 스킬 머리 오류를 뺀 것) */
  skills: Skill[];
  /** 배치할 역할과 하네스별 모델 필드(잠긴 역할 오류를 뺀 것) */
  roles: { role: Role; fields: Record<string, Record<string, string>> }[];
  rules: Rule[];
  /** hooks.json 의 훅(없거나 비면 빈 목록, HK-24) */
  hooks: HookDef[];
  /** hooks.json 이 있다(없으면 Kiro 조율 에이전트를 만들지 않는다) */
  hooksPresent: boolean;
  findings: Finding[];
}

export interface HarnessAdapter {
  id: HarnessId;
  label: string;
  /** 릴리스 점검표에서 확인한 하네스 판 */
  checkedVersion: string;
  plan(ctx: ProjectionContext): Want[];
}
