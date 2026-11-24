/** 배치(HK-13) 시험 공용: 작은 템플릿 · 설치 · 하네스 폴더 목록. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fixtureTemplates, FIXTURE_ENV, REAL_TEMPLATES, run, tmpDir, type RunOptions, type RunResult } from "./helpers";

export const SPEC_REL = "common/scripts/harness/projection.json";
export const POLICY_REL = "common/agents-root/model-policy.json";
export const HOOKS_REL = "common/agents-root/hooks.json";
export const PY_DIR = path.join(REAL_TEMPLATES, "common/scripts/harness");
export const HARNESS_DIRS = [".claude", ".codex", ".cursor", ".kiro"];

function real(rel: string): string {
  return fs.readFileSync(path.join(REAL_TEMPLATES, ...rel.split("/")), "utf8");
}

/** 배치 원본이 든 작은 템플릿(설치 경로: .agents/rules · skills · roles · model-policy.json · hooks.json · scripts/harness/projection.json). */
export function projectionFiles(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "common/root/AGENTS.md": "# {{PROJECT_NAME}}\n",
    "common/root/.gitignore": ".agents/state/\n.agents/local/\n.agents/reports/\n",
    "common/agents-rules/always.md": "# 늘 싣는 규칙\n\n같은 폴더 [kt](./kt.md)\n",
    "common/agents-rules/kt.md": '---\npaths:\n  - "src/**/*.kt"\n---\n# 코틀린 규칙\n',
    "common/agents-rules/multi.md": '---\npaths: ["**/*.ts", "**/*.tsx"]\n---\n# 여럿\n',
    "common/agents-skills/kns-plan/SKILL.md": "---\nname: kns-plan\ndescription: 설계 — design.md 를 만든다\n---\n\n본문 {{PROJECT_NAME}}\n",
    "common/agents-skills/kns-plan/agents/openai.yaml": 'interface:\n  display_name: "kns-plan"\n',
    "common/agents-skills/kns-plan/tool.sh": "#!/bin/sh\necho hi\n",
    "common/agents-root/roles/explorer.md":
      "---\nname: explorer\ndescription: 코드에서 근거를 찾는다. 읽기 전용이다.\nmode: read-only\ntools: [read, search]\nclass: explore\n---\n# explorer — {{PROJECT_NAME}}\n\n본문 \"\"\" 와 \\ 를 그대로 둔다.\n",
    "common/agents-root/roles/worker.md":
      "---\nname: worker\ndescription: 배정 파일을 구현한다.\nmode: write\ntools: [read, search, shell, write]\nclass: implement\n---\n# worker\n\n구현한다.\n",
    [POLICY_REL]: real(POLICY_REL),
    [SPEC_REL]: real(SPEC_REL),
    [HOOKS_REL]: real(HOOKS_REL),
    "stacks/jvm/agents-rules/tech.md": '---\npaths:\n  - "**/*.gradle.kts"\n---\njvm {{BUILD_TOOL}}\n',
    "stacks/jvm/arch/hexagonal/agents-rules/structure.md": '---\npaths:\n  - "src/**"\n---\nhexagonal\n',
    ...extra,
  };
}

export function projectionTemplates(extra: Record<string, string> = {}, drop: string[] = []): string {
  const files = projectionFiles(extra);
  for (const d of drop) delete files[d];
  return fixtureTemplates(files);
}

export async function initWith(templates: string, agents = "all", opts: { pre?: (target: string) => void; extra?: string[]; env?: RunOptions["env"] } = {}) {
  const target = path.join(tmpDir(), "acme");
  fs.mkdirSync(target, { recursive: true });
  opts.pre?.(target);
  const r = await run(["init", "--yes", "--json", "--templates", templates, "--cwd", target, "--agents", agents, ...(opts.extra ?? [])], { env: opts.env ?? FIXTURE_ENV });
  const cli = (command: string, args: string[] = [], o: RunOptions = {}): Promise<RunResult> => run([command, "--cwd", target, ...args], { env: FIXTURE_ENV, ...o });
  return { target, r, cli };
}

/** 하네스 폴더 아래 파일(링크 포함, POSIX 상대 경로). */
export function harnessFiles(target: string): { files: string[]; links: string[] } {
  const files: string[] = [];
  const links: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const rel = path.relative(target, full).split(path.sep).join("/");
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) links.push(rel);
      else if (st.isDirectory()) walk(full);
      else files.push(rel);
    }
  };
  for (const d of HARNESS_DIRS) walk(path.join(target, d));
  return { files, links };
}

/** lock 배치 항목이 덮는 파일 경로(mirror 폴더는 그 아래 파일 전부). */
export function coveredByProjection(target: string, entries: Record<string, any>[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (!["mirror", "render", "merge"].includes(e.op)) continue;
    const full = path.join(target, ...String(e.path).split("/"));
    if (fs.existsSync(full) && fs.lstatSync(full).isDirectory()) {
      for (const f of harnessFilesUnder(target, full)) out.add(f);
    } else out.add(e.path);
  }
  return out;
}

function harnessFilesUnder(target: string, dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.lstatSync(full).isDirectory()) out.push(...harnessFilesUnder(target, full));
    else out.push(path.relative(target, full).split(path.sep).join("/"));
  }
  return out;
}

/** v1 포인터 문장(본문 없이 원본을 읽으라고만 하는 파일). */
export const POINTER_PHRASES = ["를 읽고 그대로 수행한다", "를 읽고 그대로 따른다", "얇은 포인터", "(포인터)"];

export function python(args: string[], cwd?: string): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("python3", ["-B", ...args], { cwd, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
