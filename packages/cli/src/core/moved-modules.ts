/**
 * 킷에서 빠진 경로 중 지금 켜지 않은 킷 모듈이 까는 것(update 안내). 공통 층에서 모듈로 옮긴 파일
 * (CI 진입 파일 → ci 모듈)은 옛 설치에서 '킷에서 빠짐'으로 보인다. 계속 쓰려면 그 모듈을 켜면 된다.
 * update.sh 도 같은 규칙으로 orphan 줄에 모듈 이름을 붙인다.
 */
import path from "node:path";
import { byteCompare, isDir } from "./fsx";
import type { Layout } from "./layout";
import { resolveCandidates } from "./resolve";
import type { Selection } from "./selection";

export interface MovedToModule {
  module: string;
  paths: string[];
}

function inModule(layer: string, module: string): boolean {
  const dir = `optional/${module}`;
  return layer === dir || layer.startsWith(`${dir}/`);
}

/** 모듈별 경로(layout.json modules 순서, 경로 바이트 순). 한 경로는 처음 맞는 모듈 하나에만 든다. */
export function movedToModules(layout: Layout, templatesDir: string, sel: Selection, tokens: Record<string, string>, left: string[]): MovedToModule[] {
  const rest = new Set(left);
  const out: MovedToModule[] = [];
  for (const m of layout.modules) {
    if (rest.size === 0) break;
    if (sel.modules.includes(m) || !isDir(path.join(templatesDir, "optional", m))) continue;
    const { winners } = resolveCandidates(layout, templatesDir, { ...sel, modules: [m] }, tokens);
    const dests = new Set(winners.filter((c) => inModule(c.layer, m)).map((c) => c.dest));
    const paths = [...rest].filter((p) => dests.has(p)).sort(byteCompare);
    if (paths.length === 0) continue;
    for (const p of paths) rest.delete(p);
    out.push({ module: m, paths });
  }
  return out;
}

/** 사람용 줄. 없으면 빈 목록. */
export function movedLines(moved: MovedToModule[]): string[] {
  return moved.map((x) => `  킷에서 빠진 파일 ${x.paths.length}개는 이제 ${x.module} 모듈이 깐다 — 계속 쓰려면: knots-sync add ${x.module}`);
}
