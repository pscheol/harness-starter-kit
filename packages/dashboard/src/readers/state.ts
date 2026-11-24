/** 검증 기록 · 보고서 · 리뷰 · worktree 읽기(설계 06 §3.2 표의 verify · reports · worktrees, 형식은 01 · 09). */
import fs from "node:fs";
import path from "node:path";
import { fileStamp } from "../cache";
import { ApiError } from "../errors";
import type { Project } from "../project";
import { checkouts, gitStatus } from "../repo";
import { gitOut, isObj, python, readJson, rel } from "../util";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export async function readVerify(p: Project, issue: string | null): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const co of await checkouts(p)) {
    if (issue && co.key !== issue) continue;
    const file = path.join(co.root, ".agents/state/verify-last.json");
    const v = await p.cache.get(`verify:${co.root}`, fileStamp(file), () => readJson(file));
    const steps = v && Array.isArray(v.steps) ? (v.steps as Record<string, unknown>[]) : [];
    const shaped = steps.map((s) => ({ label: s.label ?? s.command ?? s.id ?? null, status: s.status ?? null, durationMs: typeof s.durationMs === "number" ? s.durationMs : null }));
    const slowest = shaped.filter((s) => s.durationMs !== null).sort((a, b) => (b.durationMs as number) - (a.durationMs as number))[0] ?? null;
    out.push({
      checkout: { kind: co.main ? "main" : "worktree", path: rel(p.loc.top, co.path), branch: co.branch },
      issue: co.key,
      record: v ? { level: v.level ?? null, status: v.status ?? null, startedAt: v.startedAt ?? null, finishedAt: v.finishedAt ?? null, durationMs: v.durationMs ?? null, head: isObj(v.head) ? v.head : null, exitCode: v.exitCode ?? null, steps: shaped } : null,
      slowest,
    });
  }
  return out;
}

function reportsDir(p: Project): string {
  return path.join(p.root, ".agents/reports");
}

export async function readSummary(p: Project): Promise<Record<string, unknown>> {
  const dir = reportsDir(p);
  const gateFile = path.join(dir, "quality-gate-last.json");
  const findingsFile = path.join(dir, "findings-latest.json");
  const metricsFile = path.join(dir, "metrics/latest.json");
  return p.cache.get("summary", [gateFile, findingsFile, metricsFile].map(fileStamp).join("\n"), () => {
    const gate = readJson(gateFile);
    const f = readJson(findingsFile);
    const list = f && Array.isArray(f.findings) ? (f.findings as Record<string, unknown>[]) : [];
    const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, list.filter((x) => x.severity === s).length]));
    const newBySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, list.filter((x) => x.severity === s && x.new === true).length]));
    return {
      gate: gate ? { status: gate.status ?? null, level: gate.level ?? null, head: gate.head ?? null, base: gate.base ?? null, mode: gate.mode ?? null, checks: gate.checks ?? [], incomplete: gate.incomplete ?? [] } : null,
      findings: f ? { at: f.at ?? null, head: f.head ?? null, level: f.level ?? null, total: list.length, bySeverity, new: newBySeverity, truncated: f.truncated === true, analyzers: f.analyzers ?? {} } : null,
      metrics: readJson(metricsFile),
    };
  });
}

export async function readFindings(p: Project, q: { issue: string | null; severity: string | null; onlyNew: boolean }): Promise<Record<string, unknown>> {
  const file = path.join(reportsDir(p), "findings-latest.json");
  const f = await p.cache.get("findings", fileStamp(file), () => readJson(file));
  let list = f && Array.isArray(f.findings) ? (f.findings as Record<string, unknown>[]) : [];
  if (q.severity) list = list.filter((x) => x.severity === q.severity);
  if (q.onlyNew) list = list.filter((x) => x.new === true);
  if (q.issue) {
    const branch = f && typeof f.branch === "string" ? f.branch : "";
    if (!branch.includes(`/${q.issue}-`)) list = [];
  }
  return { head: f?.head ?? null, branch: f?.branch ?? null, at: f?.at ?? null, findings: list };
}

/** 리뷰 보고서와 review.md 처리 상태: review_state.py <이슈 폴더> --json(HK-23 판정 원본). */
export async function readReview(p: Project, root: string, folderRel: string): Promise<Record<string, unknown>> {
  const script = fs.existsSync(path.join(root, "scripts/harness/review_state.py")) ? path.join(root, "scripts/harness/review_state.py") : path.join(p.root, "scripts/harness/review_state.py");
  const key = /issues\/([A-Z][A-Z0-9]*-\d+)-/.exec(folderRel)?.[1] ?? "";
  const stamp = [
    fileStamp(path.join(root, folderRel, "approvals.md")),
    fileStamp(path.join(root, folderRel, "review.md")),
    fileStamp(path.join(root, ".agents/reports/review", `${key}.md`)),
    fileStamp(path.join(p.root, ".agents/reports/review", `${key}.md`)),
  ].join("\n");
  return p.cache.get(`review:${root}:${folderRel}`, stamp, async () => {
    const r = await python(root, p.env, [script, path.join(root, folderRel), "--json"], 30_000);
    if (r.code === 2) return { key, report: null, head: null, stale: false, open: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }, findings: [] };
    if (r.code !== 0 && r.code !== 1) throw new ApiError(500, "internal", "리뷰 상태를 읽지 못했다");
    const data = JSON.parse(r.stdout) as Record<string, unknown>;
    if (typeof data.report === "string" && path.isAbsolute(data.report)) data.report = rel(p.root, data.report);
    return data;
  });
}

export async function readWorktrees(p: Project): Promise<Record<string, unknown>> {
  const cos = await checkouts(p);
  const base = p.base();
  const g = p.meta().git;
  const max = isObj(g) && typeof g.maxPerRepo === "number" ? g.maxPerRepo : 3;
  const items = await Promise.all(
    cos.map(async (co) => {
      const st = await gitStatus(co.path, p.env);
      let merged: boolean | null = null;
      if (!co.main && co.head) {
        const anc = await gitOut(co.path, p.env, "merge-base", "--is-ancestor", "HEAD", base);
        merged = anc !== null;
      }
      let lastUsed: string | null = null;
      try {
        lastUsed = new Date(fs.statSync(co.path).mtimeMs).toISOString();
      } catch {
        lastUsed = null;
      }
      const done = !co.main && !st.dirty && st.unpushed === 0 && merged === true;
      const name = path.basename(co.path);
      return { path: co.main ? "." : rel(p.loc.top, co.path), name, kind: co.main ? "main" : "worktree", branch: co.branch, head: co.head, issue: co.key, dirty: st.dirty, unpushed: st.unpushed, merged, done, lastUsed, abs: co.path };
    }),
  );
  const extra = items.filter((i) => i.kind === "worktree").length;
  return { worktrees: items.map(({ abs: _a, ...rest }) => rest), count: extra, maxPerRepo: max, over: extra > max, gc: "python3 scripts/harness/worktree.py gc --apply" };
}
