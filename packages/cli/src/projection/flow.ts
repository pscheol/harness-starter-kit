/**
 * 명령(init · update · add · remove · repair · uninstall)이 같이 쓰는 배치 흐름: 보기 만들기 · 겹침 검사 · 출력 · 종료 코드.
 */
import type { Finding, Want } from "../adapters/types";
import { CliError, EXIT } from "../core/errors";
import type { LockEntry } from "../core/lock";
import { shellQuote } from "../core/shell";
import { ATTENTION_ACTIONS, buildContext, PROJECTION_OPS, projCounts, projLine, projOpJson, projSummary, QUIET_ACTIONS, wantedOps, type ProjectionPlan } from "./engine";
import type { Sources } from "./sources";
import type { ProjectionSpec } from "./spec";
import { FsView, OverlayView, type OverlayWrite } from "./view";

export interface Prepared {
  spec: ProjectionSpec;
  wants: Want[];
  sources: Sources;
  findings: Finding[];
}

/** 쓰기 전 원본 보기(지금 폴더 + 이번 copy 쓰기 − 지우기)에서 원하는 배치 작업. */
export function prepare(args: { target: string; spec: ProjectionSpec; tokens: Record<string, string>; agents: string[]; writes?: Map<string, OverlayWrite>; deletes?: Set<string>; copyPaths?: Iterable<string> }): Prepared {
  const base = new FsView(args.target);
  const view = args.writes || args.deletes ? new OverlayView(base, args.writes ?? new Map(), args.deletes ?? new Set()) : base;
  const ctx = buildContext({ view, spec: args.spec, tokens: args.tokens, agents: args.agents });
  const wants = wantedOps(ctx);
  if (args.copyPaths) assertNoCopyOverlap(wants, args.copyPaths);
  return { spec: args.spec, wants, sources: ctx.sources, findings: ctx.findings };
}

export function assertNoCopyOverlap(wants: Want[], copyPaths: Iterable<string>): void {
  const copies = [...copyPaths];
  for (const w of wants) {
    const hit = copies.find((p) => p === w.path || (w.op === "mirror" && w.kind === "dir" && p.startsWith(`${w.path}/`)));
    if (hit) throw new CliError(EXIT.STATE, `템플릿 copy 경로와 배치 경로가 겹친다: ${hit}`, "템플릿에서 그 하네스 파일을 지운다(하네스 파일은 .agents/ 원본에서 만든다)");
  }
}

export function needsHuman(plan: ProjectionPlan | null, findings: Finding[]): boolean {
  return Boolean(plan?.ops.some((o) => ATTENTION_ACTIONS.has(o.action))) || findings.some((f) => f.severity === "error");
}

export function projectionConflicts(plan: ProjectionPlan | null): Record<string, unknown>[] {
  if (!plan) return [];
  return plan.ops
    .filter((o) => o.action === "conflict")
    .map((o) => {
      const neu = o.newFiles?.[0] ?? null;
      return { path: o.path, new: neu, diff: neu ? `diff -u ${shellQuote(o.path)} ${shellQuote(neu)}` : null };
    });
}

export function projectionData(plan: ProjectionPlan | null, findings: Finding[], all = false): Record<string, unknown> | null {
  if (!plan) return null;
  return {
    counts: projCounts(plan.ops),
    ops: plan.ops.filter((o) => all || !QUIET_ACTIONS.has(o.action)).map(projOpJson),
    findings,
  };
}

/** 사람용 줄. all 이면 same 까지, hide 에 든 판정(init 의 create 등)은 개수로만 낸다. */
export function projectionLines(plan: ProjectionPlan | null, findings: Finding[], quiet: boolean, all = false, hide: ReadonlySet<string> = new Set()): string[] {
  if (!plan) return [];
  const shown = plan.ops.filter((o) => (all || (!QUIET_ACTIONS.has(o.action) && !hide.has(o.action))) && (!quiet || ATTENTION_ACTIONS.has(o.action)));
  return [
    ...findings.map((f) => `  ${f.severity === "error" ? "✖" : "⚠"} ${f.kind.padEnd(16)} ${f.path} — ${f.hint}`),
    ...shown.map(projLine),
    projSummary(plan.ops),
  ];
}

/** lock 항목 합치기: copy 쪽에서 배치가 가져간 경로 · 배치 항목을 빼고 배치 결과를 더한다. */
export function mergeEntries(copyEntries: LockEntry[], plan: ProjectionPlan | null): LockEntry[] {
  if (!plan) return copyEntries;
  const owned = new Set([...plan.claimed, ...plan.entries.map((e) => e.path), ...plan.ops.map((o) => o.path)]);
  return [...copyEntries.filter((e) => !owned.has(e.path) && !PROJECTION_OPS.has(e.op)), ...plan.entries];
}
