/** 선택값 해석(HK-8 design §4.1). setup.sh 의 인자 검사와 같은 규칙이다. */
import fs from "node:fs";
import path from "node:path";
import { CliError, EXIT, usageError } from "./errors";
import { isDir } from "./fsx";
import { stackSpecOf, type Layout } from "./layout";

export interface SelectionInput {
  stack?: string | undefined;
  arch?: string | undefined;
  domain?: string | undefined;
  lang?: string | undefined;
  agents?: string | undefined;
  modules?: string | undefined;
}

export interface Selection {
  stack: string;
  arch: string;
  /** 빈 문자열 = 도메인 없음(표에 없는 스택) */
  domain: string;
  lang: string | null;
  agents: string[];
  agentsOrigin: "flag" | "detected" | "default";
  modules: string[];
}

function subdirs(dir: string): string[] {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => isDir(path.join(dir, n)))
    .sort();
}

export function listStacks(templatesDir: string): string[] {
  return subdirs(path.join(templatesDir, "stacks"));
}

export function listArchs(templatesDir: string, stack: string): string[] {
  return subdirs(path.join(templatesDir, "stacks", stack, "arch"));
}

/** 쉼표 · 공백 목록. 'all' 은 전체, allowNone 이면 'none' 은 빈 목록. 적은 순서 유지, 중복 제거. */
export function parseList(raw: string, valid: string[], what: string, allowNone: boolean): string[] {
  const words = raw.split(/[\s,]+/).filter(Boolean);
  const keywords = allowNone ? ["all", "none"] : ["all"];
  const choices = `사용 가능: ${valid.join(" ")} (전체는 all${allowNone ? ", 없음은 none" : ""})`;
  const unknown = words.filter((w) => !valid.includes(w) && !keywords.includes(w));
  if (unknown.length) throw usageError(`알 수 없는 ${what}: ${unknown.join(" ")}`, choices);
  // setup.sh 와 같이 all · none 은 처음 나온 것이 목록 전체를 정한다
  for (const w of words) {
    if (w === "all") return [...valid];
    if (allowNone && w === "none") return [];
  }
  const out = words.filter((w, i) => words.indexOf(w) === i);
  if (out.length === 0 && !allowNone) throw usageError(`${what} 값이 비어 있다`, choices);
  return out;
}

/** 대상 리포의 하네스 폴더 → 없으면 실행 환경 변수(harness_detect_agents). */
export function detectHarnesses(layout: Layout, target: string, env: Record<string, string | undefined>): string[] {
  const byDir = layout.harnesses.filter((h) => (layout.harnessDetect[h]?.dirs ?? []).some((d) => isDir(path.join(target, d))));
  if (byDir.length) return byDir;
  return layout.harnesses.filter((h) => (layout.harnessDetect[h]?.env ?? []).some((v) => (env[v] ?? "") !== ""));
}

export function resolveSelection(
  layout: Layout,
  templatesDir: string,
  input: SelectionInput,
  ctx: { target: string; env: Record<string, string | undefined> },
): Selection {
  const stacks = listStacks(templatesDir);
  const stack = input.stack ?? layout.defaultStack;
  if (!stacks.includes(stack)) throw usageError(`알 수 없는 스택: '${stack}'`, `사용 가능: ${stacks.join(" ")}`);
  const spec = stackSpecOf(layout, stack);

  const archs = listArchs(templatesDir, stack);
  const arch = input.arch ?? spec.defaultArch;
  if (!archs.includes(arch)) throw usageError(`스택 '${stack}' 에 없는 아키텍처 변형: '${arch}'`, `사용 가능: ${archs.join(" ")}`);

  const domain = input.domain ?? spec.domain ?? "";
  if (domain !== "" && !layout.domains.includes(domain)) {
    throw usageError(`알 수 없는 도메인: '${domain}'`, `사용 가능: ${layout.domains.join(" ")}`);
  }

  let lang: string | null = null;
  if (input.lang !== undefined) {
    const withLang = Object.keys(layout.stacks).filter((s) => layout.stacks[s]?.lang);
    if (!spec.lang) throw usageError(`--lang 은 이 스택에서 쓰지 않는다: '${stack}'`, `--lang 을 받는 스택: ${withLang.join(" ")}`);
    if (!(input.lang in spec.lang)) throw usageError(`알 수 없는 --lang: '${input.lang}'`, `사용 가능: ${Object.keys(spec.lang).join(" ")}`);
    lang = input.lang;
  }

  let agents: string[];
  let agentsOrigin: Selection["agentsOrigin"];
  if (input.agents !== undefined) {
    agents = parseList(input.agents, layout.harnesses, "하네스", false);
    agentsOrigin = "flag";
  } else {
    agents = detectHarnesses(layout, ctx.target, ctx.env);
    agentsOrigin = "detected";
    if (agents.length === 0) {
      agents = [...layout.defaultHarnesses];
      agentsOrigin = "default";
    }
  }

  const modules = input.modules === undefined ? [] : parseList(input.modules, layout.modules, "모듈", true);
  for (const m of modules) {
    if (!isDir(path.join(templatesDir, "optional", m))) {
      throw new CliError(EXIT.ENV, `모듈 템플릿이 없다: ${path.join(templatesDir, "optional", m)}`);
    }
  }
  return { stack, arch, domain, lang, agents, agentsOrigin, modules };
}
