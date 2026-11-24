/** 관리 페이지가 쓰는 CLI 함수(doctor · outdated). 서버 모듈은 CLI 를 import 하지 않고 이것을 받는다. */
import type { Deps, DoctorSummary } from "../../../dashboard/src/project";
import type { Ctx, Io } from "../cli/context";
import { type Finding, runDoctor } from "./doctor";
import { runOutdated } from "./outdated";

function quietIo(env: Record<string, string | undefined>, cwd: string): Io {
  return { stdout: () => undefined, stderr: () => undefined, env, cwd, cliFile: __filename, isTTY: false, nodeVersion: process.versions.node };
}

function ctxFor(root: string, env: Record<string, string | undefined>, command: string): Ctx {
  return { io: quietIo(env, root), command, values: { cwd: root }, positionals: [], json: true, quiet: true };
}

const PROBLEM_KINDS = new Set(["drifted", "stale", "symlink-found", "missing", "role-mismatch"]);

export function doctorSummary(root: string, env: Record<string, string | undefined>): DoctorSummary {
  const r = runDoctor(ctxFor(root, env, "doctor"));
  const findings = (r.data.findings as Finding[]) ?? [];
  const problems = findings.filter((f) => f.severity === "error" || PROBLEM_KINDS.has(f.kind));
  const counts: Record<string, number> = {};
  for (const f of problems) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  return { status: problems.length ? "problems" : "ok", counts, problems: problems.slice(0, 20).map((f) => ({ kind: f.kind, ...(f.path ? { path: f.path } : {}), message: f.hint ?? f.kind })) };
}

export function dashboardDeps(): Deps {
  return {
    doctor: (root, env) => doctorSummary(root, env),
    outdated: (root, env) => {
      const r = runOutdated(ctxFor(root, env, "outdated"));
      const { target: _t, ...rest } = r.data as Record<string, unknown>;
      return rest;
    },
  };
}
