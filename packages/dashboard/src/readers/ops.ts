/**
 * GET /ops(설계 14 §3.12, DO-R16): 배포 기록 · 운영 기록 · 장애 · 다음 Intent 후보 · 전달 지표 · 자동 검증 배포 상태 · 규칙 후보.
 * 처리는 scripts/harness/ops_report.py 하나다 — 관리 페이지와 `knots-sync status --ops --json` 이 같은 응답을 받는다.
 * 모델을 부르지 않고 파일을 쓰지 않는다(전달 지표 보고서는 ops_report 가 쓰지 않는다).
 */
import fs from "node:fs";
import path from "node:path";
import { ApiError } from "../errors";
import type { Project } from "../project";
import { isObj, python } from "../util";

const SCRIPT = "scripts/harness/ops_report.py";

/** 스크립트가 없는 옛 설치본: 빈 응답(화면은 '제공 예정' 대신 빈 표를 보인다). */
export const EMPTY_OPS = {
  deploys: [],
  records: [],
  incidents: [],
  candidates: [],
  delivery: { range: null, current: {}, baseline: null, methodMismatch: [] },
  autoVerify: { enabled: false, status: "off", consecutiveFailures: 0, lastPassedSha: null, lastRun: null },
  ruleCandidates: [],
  todo: [],
};

function scriptOf(p: Project): string | null {
  const file = path.join(p.root, SCRIPT);
  return fs.existsSync(file) ? file : null;
}

export async function readOps(p: Project): Promise<Record<string, unknown>> {
  const script = scriptOf(p);
  if (!script) return { ...EMPTY_OPS, unavailable: `${SCRIPT} 가 없습니다 — knots-sync update 로 킷을 올립니다` };
  const r = await python(p.root, p.env, [script, "--root", p.root], 120_000);
  try {
    const data = JSON.parse(r.stdout) as unknown;
    if (r.code === 0 && isObj(data)) return data;
  } catch {
    // 아래 오류
  }
  throw new ApiError(500, "internal", `운영 기록을 읽지 못했습니다: ${(r.stderr.trim().split("\n").pop() ?? "").slice(0, 300)}`);
}

export interface OpsTodo {
  rank: number;
  kind: string;
  target: string;
  title: string;
  reason: string;
  since: string;
  link: string;
  mine: boolean;
}

/** "처리할 일"에 더할 운영 항목(자동 검증 배포 멈춤 · deploy 승인 대기 · 미달 지표 · 오래된 규칙 후보). 운영 폴더가 없으면 스크립트를 부르지 않는다. */
export async function opsTodos(p: Project): Promise<OpsTodo[]> {
  const script = scriptOf(p);
  if (!script || !(fs.existsSync(path.join(p.root, ".agents/docs/ops")) || fs.existsSync(path.join(p.root, ".agents/docs/rule-candidates")) || fs.existsSync(path.join(p.root, ".agents/reports/deploy")))) return [];
  const r = await python(p.root, p.env, [script, "--root", p.root, "--todo"], 60_000);
  try {
    const data = JSON.parse(r.stdout) as unknown;
    return r.code === 0 && Array.isArray(data) ? (data as OpsTodo[]) : [];
  } catch {
    return [];
  }
}
