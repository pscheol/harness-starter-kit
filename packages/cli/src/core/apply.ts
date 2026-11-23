/** 작업 목록 적용(HK-8 design §5.2). 파일 → 매니페스트 → 기능 문서 → lock → 메타. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fsError } from "./errors";
import { writeFileAtomic } from "./fsx";
import { LOCK_REL } from "./lock";
import { META_REL } from "./meta";
import type { Plan } from "./plan";

export const FEATURE_DOCS = "tools/docs/feature_docs.py";

export type FeatureDocsResult = { status: "built" } | { status: "skipped"; reason: string } | { status: "failed"; error: string };

export interface ApplyResult {
  written: number;
  featureDocs: FeatureDocsResult;
}

function full(target: string, rel: string): string {
  return path.join(target, ...rel.split("/"));
}

/**
 * 기능 문서를 만들어도 되는가. tools/docs/ 아래 파일이 모두 킷 판(create · replace · same)일 때만 돌린다.
 * 사람이 둔 파일(skip-user)이 하나라도 있으면 리포의 코드를 실행하게 되므로 건너뛴다(design §10 D17).
 */
export function featureDocsAllowed(plan: Plan): boolean {
  const docs = plan.ops.filter((o) => o.path.startsWith(`${path.posix.dirname(FEATURE_DOCS)}/`));
  return docs.some((o) => o.path === FEATURE_DOCS) && docs.every((o) => o.owner === "kit");
}

/** setup.sh 처럼 설치 끝에 기능 문서 사이트를 한 번 만든다. python3 가 없으면 건너뛴다. 실패해도 설치는 계속한다. */
export function buildFeatureDocs(target: string, env: Record<string, string | undefined>): FeatureDocsResult {
  if (!fs.existsSync(full(target, FEATURE_DOCS))) return { status: "skipped", reason: `${FEATURE_DOCS} 없음` };
  const r = spawnSync("python3", [FEATURE_DOCS, "build"], {
    cwd: target,
    env: (env.PATH === undefined ? { ...env, PATH: process.env.PATH } : env) as NodeJS.ProcessEnv,
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
    timeout: 180_000,
  });
  if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") return { status: "skipped", reason: "python3 없음" };
  if (r.error || r.status !== 0) {
    const tail = (r.stderr ?? "").trim().split("\n").slice(-3).join(" / ");
    return { status: "failed", error: tail || (r.error ? r.error.message : `exit ${String(r.status)}`) };
  }
  return { status: "built" };
}

export function applyPlan(args: {
  plan: Plan;
  metaText: string;
  lockText: string;
  env: Record<string, string | undefined>;
}): ApplyResult {
  const { plan, metaText, lockText, env } = args;
  const target = plan.target;
  let written = 0;
  let current = "";
  try {
    current = target;
    fs.mkdirSync(target, { recursive: true });
    for (const op of plan.ops) {
      if (op.action !== "create" && op.action !== "replace") continue;
      current = op.path;
      writeFileAtomic(full(target, op.path), op.content, op.executable);
      written += 1;
    }
    for (const g of plan.generated) {
      if (g.action !== "create" && g.action !== "replace") continue;
      current = g.path;
      writeFileAtomic(full(target, g.path), g.content, false);
    }
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current}`);
  }
  const featureDocs = featureDocsAllowed(plan)
    ? buildFeatureDocs(target, env)
    : ({ status: "skipped", reason: "tools/docs/ 에 킷 판이 아닌 파일이 있다" } as const);
  try {
    current = LOCK_REL;
    writeFileAtomic(full(target, LOCK_REL), Buffer.from(lockText, "utf8"), false);
    current = META_REL;
    writeFileAtomic(full(target, META_REL), Buffer.from(metaText, "utf8"), false);
  } catch (err) {
    throw fsError(err, `쓰기 실패 ${current}`);
  }
  return { written, featureDocs };
}
