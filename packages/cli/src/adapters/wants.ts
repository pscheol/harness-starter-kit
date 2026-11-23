/** 어댑터가 같이 쓰는 작업 만들기(mirror 폴더 · mirror 파일 · render). Python projection.py 의 같은 이름 함수와 같다. */
import { sha256 } from "../core/hash";
import type { Rule, Skill } from "../projection/render";
import { treeSha } from "../projection/sources";
import type { RepoView } from "../projection/view";
import type { MirrorWant, RenderWant } from "./types";

export function stem(source: string): string {
  const base = source.slice(source.lastIndexOf("/") + 1);
  return base.endsWith(".md") ? base.slice(0, -".md".length) : base;
}

export function mirrorDir(path: string, harness: string, skill: Skill, deferred: Set<string>): MirrorWant {
  const t = treeSha(skill.files);
  return { op: "mirror", path, harness, from: skill.source, kind: "dir", files: skill.files, data: Buffer.alloc(0), executable: false, sha256: t, fromSha256: t, deferred: deferred.has(skill.source) };
}

export function mirrorFile(path: string, harness: string, rule: Rule, view: RepoView, deferred: Set<string>): MirrorWant {
  const s = sha256(rule.data);
  return { op: "mirror", path, harness, from: rule.source, kind: "file", files: [], data: rule.data, executable: view.executable(rule.source), sha256: s, fromSha256: s, deferred: deferred.has(rule.source) };
}

export function renderWant(path: string, harness: string, from: string, text: string, sourceData: Buffer, deferred: Set<string>): RenderWant {
  const data = Buffer.from(text, "utf8");
  return { op: "render", path, harness, from, kind: "file", files: [], data, executable: false, sha256: sha256(data), fromSha256: sha256(sourceData), deferred: deferred.has(from) };
}

export function skillData(skill: Skill): Buffer {
  return skill.files.find((f) => f.rel === "SKILL.md")?.bytes ?? Buffer.alloc(0);
}

/** 스킬 폴더가 대기 중이면 그 SKILL.md 에서 만든 render 도 대기다. */
export function withSkillFiles(deferred: Set<string>): Set<string> {
  return new Set([...deferred, ...[...deferred].map((d) => `${d}/SKILL.md`)]);
}
