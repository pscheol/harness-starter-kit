/** 배포 · 운영 시험 도우미(HK-21): 병합 · done 승인이 있는 이슈 · 배포 기록 만들기. */
import fs from "node:fs";
import { expect } from "vitest";
import { appendedText, approvalSha, type NewEntry } from "../src/approvals";
import { ulid } from "../src/util";
import { git, python, readFile, writeFile, writeIssue, type Repo } from "./helpers";

export const GOOD = `## 13. 배포 · 롤백 (Migration / Rollout)

### 13.1 배포 계획 *(필수)*
| 항목 | 값 |
|---|---|
| 순서 | 1 마이그레이션 expand → 2 API 배포 |
| 방식 | 단계적(10% → 100%) |
| 하위 호환 | 이전 판과 함께 돈다 |
| 마이그레이션 | 되돌릴 수 있음 |
| 확인 신호 | 스모크: curl /health |

### 13.2 롤백 *(필수)*
| 항목 | 값 |
|---|---|
| 방법 | 플래그 끄기 |
| 판단 기준 | 5xx 비율 1% 초과가 5분 이어짐 |
| 데이터 | 그대로 둔다 |
| 시험 | 검증 환경 |

### 13.3 운영 점검
- [x] 로그: 개인정보 없음
- [ ] 지표: 해당 없음: 새 지표 없음
- [ ] 알람: 해당 없음: 기존 알람
- [ ] SLO: 해당 없음: 없음
- [ ] 런북: 해당 없음: 기존 런북
- [ ] 비밀값: 해당 없음: 없음
- [ ] 환경 차이: 해당 없음: 같다
`;

export const entry = (gate: string, email: string, name: string, sha?: string): NewEntry => ({
  at: "2026-11-24T09:00:00+09:00", gate, decision: "approved", approver: { email }, target: sha ? { name, sha256: sha } : { name, head: "abcdef1" }, phrase: "확인", path: "terminal", entryId: ulid(),
});

export function doneIssue(repo: Repo, key: string, name: string, risk = "low"): string {
  const dir = writeIssue(repo.root, key, name, { area: "payment", requirements: "approved", design: "approved", body: { design: `${GOOD}` } });
  const req = readFile(repo.root, `${dir}/requirements.md`).replace("status: approved", `status: approved\nintent: INT-7\nrisk: ${risk}`);
  writeFile(repo.root, `${dir}/requirements.md`, req);
  const sha = approvalSha(fs.readFileSync(`${repo.root}/${dir}/design.md`));
  const people = risk === "high" ? ["kim@example.com", "lee@example.com"] : ["kim@example.com"];
  let text: string | null = null;
  for (const who of people) text = appendedText(text, key, [entry("design", who, "design.md", sha), entry("mr", who, "feat/x")]);
  text = appendedText(text, key, [entry("done", "kim@example.com", "feat/x")]);
  writeFile(repo.root, `${dir}/approvals.md`, text as string);
  return dir;
}

export function plan(repo: Repo): string {
  const r = python(["scripts/harness/deploy.py", "plan", "INT-7", "--json"], repo.root);
  expect(r.code, r.stdout + r.stderr).toBe(0);
  return JSON.parse(r.stdout).record as string;
}

export function ready(repo: Repo, record: string, test = true): void {
  const sha = git(repo.root, "rev-parse", "--short=12", "HEAD");
  let text = readFile(repo.root, record).replace("- full: none", `- full: passed · sha ${sha} · https://ci/1`).replace("- quality-gate: none", `- quality-gate: passed · sha ${sha}`);
  if (test) text = text.replace("- 시험: none", "- 시험: passed · env verify · https://ci/2 · 2026-11-30T16:20:00+09:00");
  writeFile(repo.root, record, text);
  const cfg = { schema: "harness-kit.deploy/v1", envs: { verify: { kind: "verification" }, production: { kind: "production" } }, commands: {}, autoVerify: { enabled: false } };
  writeFile(repo.root, ".agents/deploy.json", JSON.stringify(cfg));
}

