/** doctor 의 배포 설정 점검(설계 14 §3.3 · §3.4, HK-21): deploy.json 연속 실패 상한 · 운영 환경이 있는데 CI 가 승인 검사를 부르지 않는 경우. 읽기만 한다. */
import fs from "node:fs";
import path from "node:path";
import type { Finding } from "./doctor";

export const DEPLOY_KINDS = ["deploy-config", "deploy-guard-missing"];
const CONFIG = ".agents/deploy.json";
const CI_FILES = [".gitlab-ci.yml", "ci", ".github/workflows", "Jenkinsfile"];
const GUARD = /deploy\.py\s+(check\b[^\n]*--require-approved|run\b)/;

function readJson(file: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function ciText(target: string): string {
  const out: string[] = [];
  const walk = (rel: string, depth: number): void => {
    const full = path.join(target, rel);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      return;
    }
    if (st.isFile()) {
      if (st.size < 512 * 1024) out.push(fs.readFileSync(full, "utf8"));
    } else if (st.isDirectory() && depth < 3) for (const name of fs.readdirSync(full)) walk(path.join(rel, name), depth + 1);
  };
  for (const rel of CI_FILES) walk(rel, 0);
  return out.join("\n");
}

export function deployFindings(target: string): Finding[] {
  const file = path.join(target, CONFIG);
  if (!fs.existsSync(file)) return [];
  const data = readJson(file);
  if (!data) return [{ kind: "deploy-config", severity: "error", path: CONFIG, hint: "JSON 객체로 읽지 못했다" }];
  const out: Finding[] = [];
  const auto = data.autoVerify && typeof data.autoVerify === "object" ? (data.autoVerify as Record<string, unknown>) : {};
  const limit = auto.maxConsecutiveFailures;
  if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 2)) {
    out.push({ kind: "deploy-config", severity: "error", path: CONFIG, hint: "autoVerify.maxConsecutiveFailures 는 1 또는 2 다(줄이기만 한다)", detail: { value: limit } });
  }
  const envs = data.envs && typeof data.envs === "object" ? (data.envs as Record<string, unknown>) : {};
  const hasProduction = Object.values(envs).some((e) => e && typeof e === "object" && (e as Record<string, unknown>).kind === "production");
  if (hasProduction && !GUARD.test(ciText(target))) {
    out.push({ kind: "deploy-guard-missing", severity: "warn", path: CONFIG, hint: "운영 환경이 있는데 CI 설정에서 'deploy.py check <기록> --require-approved'(또는 그것을 먼저 하는 deploy.py run)를 찾지 못했다. 운영 배포의 첫 단계에 넣는다(DO-R6)" });
  }
  return out;
}
