/** 레이어 후보와 이기는 판(HK-8 design §4.3, 설계 02 §3.5 의 kit 부분). */
import fs from "node:fs";
import path from "node:path";
import { CliError, EXIT } from "./errors";
import { byteCompare, isDir, walkFiles } from "./fsx";
import { globToRegExp, mapPath, type Layout } from "./layout";
import type { Selection } from "./selection";

export interface Candidate {
  dest: string;
  /** 템플릿 폴더 기준 경로 */
  src: string;
  /** 레이어 폴더(lock 의 layer) */
  layer: string;
  harness: string | null;
}

export interface Overlap {
  path: string;
  layers: string[];
  winner: string;
}

export interface Resolution {
  winners: Candidate[];
  overlaps: Overlap[];
  excludedByHarness: number;
}

function fill(dir: string, vars: Record<string, string>): string {
  return dir.replace(/\{([a-z]+)\}/g, (_m, k: string) => vars[k] ?? "");
}

/** 이번 설치가 걷는 레이어 폴더를 순서대로. */
export function layerDirs(layout: Layout, templatesDir: string, sel: Selection): { dir: string; exclude: RegExp[] }[] {
  const out: { dir: string; exclude: RegExp[] }[] = [];
  for (const spec of layout.layers) {
    const instances = spec.each === "modules" ? sel.modules : [null];
    for (const m of instances) {
      if (spec.dir.includes("{domain}") && sel.domain === "") continue;
      const dir = fill(spec.dir, { stack: sel.stack, arch: sel.arch, domain: sel.domain, module: m ?? "" });
      if (!isDir(path.join(templatesDir, dir))) {
        if (spec.whenExists) continue;
        throw new CliError(EXIT.ENV, `템플릿 레이어 폴더가 없다: ${path.join(templatesDir, dir)}`);
      }
      out.push({ dir, exclude: spec.exclude.map(globToRegExp) });
    }
  }
  return out;
}

export function resolveCandidates(layout: Layout, templatesDir: string, sel: Selection, tokens: Record<string, string>): Resolution {
  const byDest = new Map<string, Candidate[]>();
  let excludedByHarness = 0;
  const ignore = new Set(layout.ignore);
  for (const { dir, exclude } of layerDirs(layout, templatesDir, sel)) {
    for (const rel of walkFiles(path.join(templatesDir, dir))) {
      if (ignore.has(path.posix.basename(rel))) continue;
      if (exclude.some((re) => re.test(rel))) continue;
      const { dest, harness } = mapPath(layout, rel, tokens);
      if (harness !== null && !sel.agents.includes(harness)) {
        excludedByHarness += 1;
        continue;
      }
      const list = byDest.get(dest) ?? [];
      list.push({ dest, src: `${dir}/${rel}`, layer: dir, harness });
      byDest.set(dest, list);
    }
  }
  const winners: Candidate[] = [];
  const overlaps: Overlap[] = [];
  for (const dest of [...byDest.keys()].sort(byteCompare)) {
    const list = byDest.get(dest) as Candidate[];
    const winner = (layout.overlap === "first" ? list[0] : list[list.length - 1]) as Candidate;
    winners.push(winner);
    if (list.length > 1) overlaps.push({ path: dest, layers: list.map((c) => c.layer), winner: winner.layer });
  }
  return { winners, overlaps, excludedByHarness };
}

export function readTemplate(templatesDir: string, src: string): Buffer {
  return fs.readFileSync(path.join(templatesDir, ...src.split("/")));
}
