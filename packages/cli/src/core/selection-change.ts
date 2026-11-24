/**
 * add · remove 의 이름 해석과 선택값 비교(HK-12 design §3 · §4, 설계 02 §3.3 · 10 §3.1 의 v1 모듈 부분).
 * v1 모듈은 layout.json `modules` 와 `optional/<모듈>/` 폴더로 정한다(module.json 은 P18 · P22).
 */
import path from "node:path";
import { CliError, EXIT, usageError } from "./errors";
import { isDir } from "./fsx";
import type { Layout } from "./layout";
import { resolveCandidates } from "./resolve";
import { isRetiredModule, type Selection } from "./selection";

/** 나중 단계 모듈. 이번 판에서는 이름만 알아보고 exit 2 와 제공 단계를 낸다. */
export const LATER_MODULES: Record<string, string> = {};

export interface Names {
  harnesses: string[];
  modules: string[];
  /** 없앤 모듈(HK-25 R2) — 안내만 한다 */
  retired: string[];
}

/** 위치 인자(공백 · 쉼표 목록) → 하네스 · 모듈. 적은 순서를 지키고 중복은 뺀다. */
export function parseNames(layout: Layout, raw: string[], command: string): Names {
  const words = raw.flatMap((r) => r.split(/[\s,]+/)).filter(Boolean);
  const modules = [...layout.modules, ...layout.externalModules];
  const choices = `하네스: ${layout.harnesses.join(" ")} · 모듈: ${modules.join(" ")}`;
  if (words.length === 0) throw usageError(`${command}: 이름이 없다`, `knots-sync ${command} <이름>… (${choices})`);
  const later = words.find((w) => Object.hasOwn(LATER_MODULES, w));
  if (later) throw usageError(`'${later}' 모듈은 아직 없다 — ${LATER_MODULES[later]}에서 제공한다`, choices);
  if (words.some((w) => w === "all" || w === "none")) throw usageError(`${command}: all · none 은 받지 않는다(하네스인지 모듈인지 갈리지 않는다)`, choices);
  const unknown = words.filter((w) => !layout.harnesses.includes(w) && !modules.includes(w) && !isRetiredModule(w));
  if (unknown.length) throw usageError(`${command}: 모르는 이름 ${unknown.join(" ")}`, choices);
  const uniq = words.filter((w, i) => words.indexOf(w) === i);
  return {
    harnesses: uniq.filter((w) => layout.harnesses.includes(w)),
    modules: uniq.filter((w) => modules.includes(w)),
    retired: uniq.filter((w) => isRetiredModule(w) && !modules.includes(w)),
  };
}

/** 모듈 템플릿 폴더가 있는지(없으면 exit 5 — init 과 같다). */
export function assertModuleDirs(templatesDir: string, modules: string[]): void {
  for (const m of modules) {
    if (!isDir(path.join(templatesDir, "optional", m))) throw new CliError(EXIT.ENV, `모듈 템플릿이 없다: ${path.join(templatesDir, "optional", m)}`);
  }
}

export function withNames(sel: Selection, names: Names): Selection {
  return {
    ...sel,
    agents: [...sel.agents, ...names.harnesses.filter((h) => !sel.agents.includes(h))],
    modules: [...sel.modules, ...names.modules.filter((m) => !sel.modules.includes(m))],
  };
}

export function withoutNames(sel: Selection, names: Names): Selection {
  return { ...sel, agents: sel.agents.filter((a) => !names.harnesses.includes(a)), modules: sel.modules.filter((m) => !names.modules.includes(m)) };
}

/** 선택값의 설치 경로 → 이기는 판의 레이어(내용은 읽지 않는다). */
export function winnerLayers(layout: Layout, templatesDir: string, sel: Selection, tokens: Record<string, string>): Map<string, string> {
  return new Map(resolveCandidates(layout, templatesDir, sel, tokens).winners.map((c) => [c.dest, c.layer]));
}

/**
 * add 의 몫(design §3.2): 고른 이름마다 "그 이름을 뺀 선택값"에 없는 새 선택값의 경로. 새 이름이면 D_new − D_old 다.
 * 이미 켠 이름은 그 이름 때문에만 생기는 경로(그 몫에서 빠진 파일을 채운다).
 */
export function shareOf(layout: Layout, templatesDir: string, after: Selection, names: Names, tokens: Record<string, string>, afterLayers: Map<string, string>): Set<string> {
  const share = new Set<string>();
  const each: Names[] = [...names.harnesses.map((h) => ({ harnesses: [h], modules: [], retired: [] })), ...names.modules.map((m) => ({ harnesses: [], modules: [m], retired: [] }))];
  for (const one of each) {
    const without = winnerLayers(layout, templatesDir, withoutNames(after, one), tokens);
    for (const p of afterLayers.keys()) if (!without.has(p)) share.add(p);
  }
  return share;
}

/** 두 선택값 모두에 있고 이기는 판의 레이어가 바뀐 경로(겹침, HK-10 뒤 레이어 우선). */
export function relayered(before: Map<string, string>, after: Map<string, string>, skip: Set<string> = new Set()): string[] {
  return [...after].filter(([p, layer]) => !skip.has(p) && before.has(p) && before.get(p) !== layer).map(([p]) => p);
}
