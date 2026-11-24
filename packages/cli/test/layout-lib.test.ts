// 설계 02 §3.15 선행 시험: layout.json 해석 = harness-lib.sh 의 매핑 함수(템플릿 파일 전부).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isExecutable, loadLayout, mapPath } from "../src/core/layout";
import { LEGACY_LIB, REAL_TEMPLATES } from "./helpers";

const layout = loadLayout(REAL_TEMPLATES);

function filesUnder(dir: string, skipArch: boolean): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const rel = path.relative(dir, full).split(path.sep).join("/");
      if (fs.lstatSync(full).isDirectory()) {
        if (skipArch && rel === "arch") continue;
        walk(full);
      } else if (name !== ".DS_Store" && name !== "ABOUT") out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

/** setup.sh 가 순회하는 레이어 루트 전부(스택 · 변형 · 도메인 · 모듈 조합과 무관하게). */
function layerRoots(): { root: string; files: string[] }[] {
  const roots: { root: string; skipArch: boolean }[] = [{ root: "common", skipArch: false }];
  for (const d of fs.readdirSync(path.join(REAL_TEMPLATES, "domains"))) roots.push({ root: `domains/${d}`, skipArch: false });
  for (const s of fs.readdirSync(path.join(REAL_TEMPLATES, "stacks"))) {
    roots.push({ root: `stacks/${s}`, skipArch: true });
    for (const a of fs.readdirSync(path.join(REAL_TEMPLATES, "stacks", s, "arch"))) {
      roots.push({ root: `stacks/${s}/arch/${a}`, skipArch: false });
    }
  }
  for (const m of fs.readdirSync(path.join(REAL_TEMPLATES, "optional"))) roots.push({ root: `optional/${m}`, skipArch: false });
  return roots
    .filter((r) => fs.statSync(path.join(REAL_TEMPLATES, r.root)).isDirectory())
    .map((r) => ({ root: r.root, files: filesUnder(path.join(REAL_TEMPLATES, r.root), r.skipArch) }));
}

const BASH = `
set -u
. "$1"
PROJECT_SLUG=acme
while IFS= read -r rel; do
  d="$(harness_dest_name "$(harness_remap "$rel")")"
  if harness_is_executable "$d"; then x=1; else x=0; fi
  printf '%s\\t%s\\t%s\\t%s\\n' "$rel" "$(harness_agent_of "$rel")" "$d" "$x"
done
`;

describe("layout.json = harness-lib.sh", () => {
  const roots = layerRoots();
  const rels = [...new Set(roots.flatMap((r) => r.files))].sort();

  it("템플릿 파일 전부에서 하네스 · 설치 경로 · 실행 비트가 같다", () => {
    const r = spawnSync("bash", ["-c", BASH, "bash", LEGACY_LIB], { input: `${rels.join("\n")}\n`, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const lines = r.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(rels.length);
    const diffs: string[] = [];
    for (const line of lines) {
      const [rel, agent, dest, x] = line.split("\t");
      const got = mapPath(layout, rel as string, { PROJECT_SLUG: "acme" });
      const gotAgent = got.harness ?? "core";
      const gotX = isExecutable(layout, got.dest) ? "1" : "0";
      if (gotAgent !== agent || got.dest !== dest || gotX !== x) {
        diffs.push(`${rel}: lib=${agent},${dest},${x} layout=${gotAgent},${got.dest},${gotX}`);
      }
    }
    expect(diffs).toEqual([]);
    // HK-13 뒤 하네스 폴더 포인터 · 역할 생성물(132개)은 템플릿이 아니라 배치가 만든다.
    expect(rels.length).toBeGreaterThan(200);
  });

  it("한 레이어 안에서 두 파일이 같은 설치 경로로 가지 않는다", () => {
    for (const { root, files } of roots) {
      const seen = new Map<string, string>();
      for (const rel of files) {
        const dest = mapPath(layout, rel, { PROJECT_SLUG: "acme" }).dest;
        expect(seen.get(dest), `${root}: ${rel} · ${seen.get(dest)} → ${dest}`).toBeUndefined();
        seen.set(dest, rel);
      }
    }
  });
});
