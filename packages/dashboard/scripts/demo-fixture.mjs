#!/usr/bin/env node
// demo-fixture.mjs — 화면을 눈으로 확인하려고 임시 리포 · 임시 HOME 을 채운다(HK-18). 시험이 아니라 개발 도구다.
//
//   node packages/dashboard/scripts/demo-fixture.mjs <빈 폴더>
//   HOME=<폴더>/home node packages/cli/dist/cli.js dashboard --cwd <폴더>/knots-platform
//
// 만드는 것: 이슈 4개(요구사항 승인 대기 · 설계 · 막힘 · 완료), Intent 1개(Unit 4개 · 질문 2개), 검증 · 품질 · 리뷰 기록,
// 세션 등록 2개, 대기함 1건, 스킬 몇 개, 대화 기록(history: on). 숫자 · 이름은 모두 예시다.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("사용법: node demo-fixture.mjs <빈 폴더>");
  process.exit(2);
}
const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
fs.mkdirSync(out, { recursive: true });
const realOut = fs.realpathSync(out);
const root = path.join(realOut, "knots-platform");
const home = path.join(realOut, "home");
fs.mkdirSync(root, { recursive: true });
fs.mkdirSync(home, { recursive: true });

const write = (base, rel, body) => {
  const f = path.join(base, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`);
};
const env = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "김지윤", GIT_AUTHOR_EMAIL: "jiyoon@acme.dev", GIT_COMMITTER_NAME: "김지윤", GIT_COMMITTER_EMAIL: "jiyoon@acme.dev" };
const git = (...a) => {
  const r = spawnSync("git", a, { cwd: root, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
};
const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n`;

fs.cpSync(path.join(KIT, "packages/templates/common/scripts"), path.join(root, "scripts"), { recursive: true, filter: (s) => !s.includes("__pycache__") });
write(root, ".agents/knots-sync.json", {
  schema: "knots-sync/v2", kit: { version: "2.0.0-alpha.0" }, project: { name: "knots-platform", slug: "knots-platform" }, stack: "python", arch: "layered", domain: "backend",
  agents: ["claude", "codex", "kiro"], modules: [], flow: { design: "kit", record: "none", gates: ["intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"] },
  roles: { design: { harness: "claude" }, implement: { harness: "claude" }, review: { harness: "codex" }, docs: { harness: "kiro" } },
  approvers: { requirements: ["po"], design: ["dev"], mr: ["dev"] }, groups: { po: ["jiyoon@acme.dev"], dev: ["jiyoon@acme.dev", "junho@acme.dev"] },
  issueKey: { source: "kit", prefix: "KNOTS" }, git: { base: "develop", worktreeRoot: "../{repo}.worktrees", maxPerRepo: 3, ide: "code" }, packs: [], verify: { fullOnlyInCI: true }, tokens: { PROJECT_NAME: "knots-platform" },
  installedAt: "2026-11-20", updatedAt: "2026-11-24",
});
write(root, ".agents/harness.json", { unit: "knots-platform", title: "knots-platform", stack: "python", agents: ["claude", "codex", "kiro"], shared: [] });
write(root, ".gitignore", ".agents/state/\n.agents/reports/\n.agents/local/\n");
write(root, "README.md", "# knots-platform\n");

const issue = (key, name, title, area, docs, extra = {}) => {
  const dir = `.agents/docs/issues/${key}-${name}`;
  const c = { key, area, type: "feat", title, ...extra };
  if (docs.requirements) write(root, `${dir}/requirements.md`, `${fm({ ...c, status: docs.requirements, created: "2026-11-20" })}\n# Requirements — ${key}\n\n## 목표\n\n${title} 를 정리한다. 지금은 평균 41GB 가 쌓여 운영자가 매주 손으로 지운다.\n\n## 범위 밖\n\n- 원본 저장소 수명 주기 정책\n- 이어 올리기(resumable upload)\n\n## 요구사항\n\n### R1 완료된 업로드\n\n- R1.1 업로드가 완료되면 임시 조각 파일을 10분 안에 지운다.\n- R1.2 지운 파일 수와 크기를 \`upload_cleanup\` 지표로 남긴다.\n\n### R2 실패하거나 멈춘 업로드\n\n- R2.1 업로드가 실패하면 조각 파일을 1시간 안에 지운다.\n- R2.2 진행 중인 업로드의 파일은 지우지 않는다.\n- R2.3 마지막 쓰기에서 3일이 지난 멈춘 업로드는 실패로 바꾸고 조각 파일을 지운다.\n\n| ID | 수용 기준 |\n|---|---|\n| SC-1 | 3일 보관 후 지움 |\n`);
  if (docs.design) write(root, `${dir}/design.md`, `${fm({ ...c, status: docs.design, created: "2026-11-21" })}\n# Design — ${key}\n\n## 구성\n\n정리 작업은 \`cleanup_uploads\` 배치 하나다.\n`);
  if (docs.tasks) write(root, `${dir}/tasks.md`, `${fm({ ...c, state: docs.tasks, created: "2026-11-22" })}\n# Tasks — ${key}\n\n### Phase 1: 준비\n\n- [x] T001 설정 읽기\n\n### Phase 2: 정리 배치\n\n- [x] T002 지우기\n- [ ] T003 지표\n\n### Phase 3: 시험\n\n- [ ] T004 시험\n`);
};
issue("KNOTS-12", "upload-cleanup", "업로드 임시 파일 정리", "upload", { requirements: "in-review", design: "draft" }, { intent: "INT-3", unit: "U-2" });
issue("KNOTS-18", "green-quality", "녹화 품질 저하 수정", "quality", { requirements: "approved", design: "approved", tasks: "active" });
issue("KNOTS-21", "payment-methods", "결제수단 등록", "payment", { requirements: "approved", design: "approved", tasks: "active" }, { intent: "INT-7", unit: "U-1" });
issue("KNOTS-19", "old-parity", "데스크톱 동등성", "desktop", { requirements: "approved", design: "approved", tasks: "completed" });
const INT = ".agents/docs/intents/INT-7-pay-reform";
write(root, `${INT}/intent.md`, `${fm({ key: "INT-7", title: "결제 개편", status: "approved" })}\n# 결제 개편\n`);
write(root, `${INT}/units.json`, { schema: "knots-sync.units/v1", intent: { key: "INT-7", title: "결제 개편", doc: "intent.md" }, source: { kind: "kit" }, units: [
  { id: "U-4", title: "API 결제 이벤트", kind: "contract", area: "payments", dependsOn: [], order: 1, issue: null, planned: true, provides: ["api:payments.v2"] },
  { id: "U-1", title: "결제수단 등록", kind: "feature", area: "payment", dependsOn: ["U-4"], order: 2, issue: "KNOTS-21", planned: true, stories: ["S-1", "S-2", "S-3", "S-4"] },
  { id: "U-2", title: "정산 주기와 지급", kind: "feature", area: "settlement", dependsOn: ["U-1"], order: 3, issue: null, planned: true, stories: ["S-5", "S-6"] },
  { id: "U-3", title: "결제 실패 알림", kind: "feature", area: "notify", dependsOn: ["U-2"], order: 4, issue: null, planned: true, stories: ["S-7"] },
] });
write(root, `${INT}/questions.md`, "---\ntarget: INT-7\nstatus: open\nround: 1\n---\n\n# 질문\n\n## Q-3 · 범위 · 답할 직무: po · 막는 게이트: intent\n부분 환불을 이번 범위에 넣는가?\n\n- A. 넣는다 — 영향: U-2 정산이 부분 금액을 다룬다\n- B. 뺀다 — 영향: 전액 환불만 다룬다\n- C. 다음 Intent — 영향: 백로그에 묶는다\n- 권장: B — 근거: 정산 계약이 아직 없다\n- 답:\n\n## Q-5 · UX · 답할 직무: po · 막는 게이트: plans\n실패 알림을 어디로 보내는가?\n\n- A. 이메일 — 영향: 템플릿 하나\n- B. 앱 푸시 — 영향: 알림 서버 연동\n- 권장: A — 근거: 이미 있다\n- 답:\n");

// 운영(S10, HK-21): 배포 기록 2건 · 운영 기록 1건(장애 1 · 후보 2) · 규칙 후보 1 · 자동 검증 배포(멈춤) · 기준선
const deployRecord = (key, state, issues, risk, result) =>
  `${fm({ kind: "deploy", key, env: "production", state, issues: `[${issues.join(", ")}]`, commit: "{ base: develop, sha: 4c1d9e0 }", tag: "null", risk, created: "2026-11-20" })}
# 배포 — ${key}

<!-- PLAN:BEGIN -->
## 1. 포함 Unit
| 이슈 | Unit | design §13 sha | 병합 커밋 |
|---|---|---|---|
| ${issues[0]} | U-1 결제수단 등록 | 1a2b3c4d5e6f | 77c0e1a |

## 4. 롤백
- 시험: ${state === "succeeded" ? "passed · env verify · https://ci.example/pipelines/812 · 2026-11-19T16:20:00+09:00" : "none"}

## 5. 배포 점검
| 항목 | 이슈 | 상태 |
|---|---|---|
| 로그 | ${issues[0]} | 체크 |

## 6. 검증
- full: ${state === "succeeded" ? "passed · sha 4c1d9e0 · https://ci.example/pipelines/810" : "none"}
- quality-gate: ${state === "succeeded" ? "passed · sha 4c1d9e0" : "none"}
<!-- PLAN:END -->

## 7. 결과
<!-- RESULT:BEGIN -->
| 단계 | 시작 | 끝 | 결과 | 근거 |
|---|---|---|---|---|
${result}
상태: ${state}
<!-- RESULT:END -->
`;
write(root, ".agents/docs/ops/deploys/2026-11-20-KNOTS-19.md", deployRecord("KNOTS-19", "succeeded", ["KNOTS-19"], "medium", "| deploy | 2026-11-20T10:05:12+09:00 | 2026-11-20T10:09:40+09:00 | ok | pipeline 815 |\n"));
write(root, ".agents/docs/ops/deploys/2026-11-24-INT-7.md", deployRecord("INT-7", "planned", ["KNOTS-21"], "high", ""));
write(root, ".agents/docs/ops/records/2026-11-23-payment-v1-week1.md", `${fm({ kind: "ops-record", topic: "payment-v1-week1", period: "{ from: 2026-11-16, to: 2026-11-22 }", created: "2026-11-23" })}
## 1. 목표 대비 실측
| ID | 지표 | 목표 | 실측 | 판정 | 출처 |
|---|---|---|---|---|---|
| INT-6 SC-1 | 결제 실패율 | ≤ 0.5% | 0.42% | 충족 | https://grafana.example/d/pay?from=1763218800000&to=1763823600000 |
| KNOTS-19 NFR-1 | 결제 API p95 | ≤ 300ms | 340ms | 미달 | ci:artifacts/perf.json |

## 3. 장애
### INC-1 · 등급 2 · 2026-11-21
- 감지: 알람 · 2026-11-21T14:10+09:00
- 영향: 카드 결제 일부 실패(약 40분)
- 원인 배포: ops/deploys/2026-11-20-KNOTS-19.md
- 조치: 플래그 끄기
- 런북: 런북 없음
- 후속 이슈:

## 5. 다음 Intent 후보
| ID | 후보 | 근거 | 종류 | 접수 |
|---|---|---|---|---|
| NX-1 | 결제 API p95 개선 | KNOTS-19 NFR-1 | change | — |
| NX-2 | 결제 실패 알림 개선 | INC-1 | feature | — |

## 6. 배운 것
| ID | 내용 | 규칙 후보 |
|---|---|---|
| L-1 | PG 토큰 만료 설정을 배포 전에 확인하지 않았다 | .agents/rules/payment.md |
`);
write(root, ".agents/docs/rule-candidates/RC-1-ops-payment-v1-week1-l-1.md", `---
id: RC-1
status: proposed
target: .agents/rules/payment.md
sources:
  - { type: ops, ref: "ops/records/2026-11-23-payment-v1-week1.md#L-1" }
created: 2026-11-01
mr: null
---

# RC-1 PG 토큰 만료 설정을 design §13.3 에 적는다

## 제안 규칙

(규칙 파일에 들어갈 문장)

## 근거

- 운영 기록 L-1

## 적용하지 않는 경우

`);
write(root, ".agents/deploy.json", { schema: "knots-sync.deploy/v1", envs: { verify: { kind: "verification", url: "https://verify.example.internal" }, production: { kind: "production" } }, commands: {}, autoVerify: { enabled: true, env: "verify", maxConsecutiveFailures: 2, timeoutSec: 1800 } });
write(root, ".agents/reports/deploy/auto-verify-4c1d9e0.json", { schema: "knots-sync.auto-verify/v1", sha: "4c1d9e0", env: "verify", status: "stopped", reason: "연속 2회 실패 — 사람이 KNS_DEPLOY_RESUME=true 로 파이프라인을 수동 실행해야 다시 배포한다", steps: [], consecutiveFailures: 2, lastPassedSha: "77c0e1a", seq: 3, startedAt: "2026-11-24T09:00:00+09:00", finishedAt: "2026-11-24T09:00:05+09:00" });
write(root, ".agents/docs/ops/metrics-baseline.json", { schema: "knots-sync.delivery-baseline/v1", range: { from: "2026-08-25", to: "2026-11-23", base: "develop", headSha: "a1b2c3d" }, inputDigest: "sha256:demo", metrics: {
  leadTimeHours: { median: 96.5, p85: 210, n: 41, method: "git" }, changeFailureRate: { value: 0.12, n: 17, method: "git" }, mttrHours: { median: 5.2, p85: null, n: 2, method: "git" }, approvalWaitHours: { median: null, p85: null, n: 0, method: "unavailable" }, reworkRate: { value: 0.18, n: 41, method: "git" } }, createdAt: "2026-11-23T12:00:00+09:00" });
git("init", "-q", "-b", "develop");
git("config", "user.email", "jiyoon@acme.dev");
git("config", "user.name", "김지윤");
git("add", "-A");
git("commit", "-q", "-m", "init");

const pidStart = spawnSync("ps", ["-o", "lstart=", "-p", "1"], { encoding: "utf8" }).stdout.trim() || null;
const sessionDir = ".agents/state/sessions";
write(root, `${sessionDir}/api-worker.json`, { id: "api-worker", name: "api-worker", harness: "claude", role: "implement", issue: "KNOTS-21", pid: 1, pidStartedAt: pidStart, cwd: root, turn: "working", startedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), permissionMode: "acceptEdits", inbox: null });
write(root, `${sessionDir}/design-desk.json`, { id: "design-desk", name: "design-desk", harness: "claude", role: "design", issue: "KNOTS-12", pid: 1, pidStartedAt: pidStart, cwd: root, turn: "idle", startedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), inbox: null });
write(root, ".agents/state/dispatch-queue/01JDEMO0000000000000000001.json", { schema: "knots-sync.dispatch/v1", id: "01JDEMO0000000000000000001", createdAt: new Date().toISOString(), createdBy: "jiyoon@acme.dev", target: { issue: "KNOTS-17", role: "docs", harness: "any" }, kind: "doc-changed", message: "[knots-sync 관리 페이지] KNOTS-17 문서를 사람이 고쳤다. 이 글은 승인이 아니다.", paths: [".agents/docs/issues/KNOTS-17/design.md"], expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() });
write(root, ".agents/state/verify-last.json", { level: "changed", status: "failed", startedAt: new Date(Date.now() - 140000).toISOString(), finishedAt: new Date().toISOString(), durationMs: 134000, exitCode: 1, head: { sha: "abc1234" }, steps: [
  { label: "구조 · SDD 상태", status: "passed", durationMs: 600 }, { label: "배치 검사", status: "passed", durationMs: 500 }, { label: "포맷", status: "passed", durationMs: 3200 }, { label: "컴파일 · payment 모듈", status: "passed", durationMs: 31300 },
  { label: "연결된 테스트 14개", status: "passed", durationMs: 62400 }, { label: "비밀값", status: "failed", durationMs: 1900 }, { label: "품질 · 복잡도", status: "failed", durationMs: 15400 }] });
write(root, ".agents/state/hook-output.jsonl", `${[["SessionStart", "harness-session-start", 913], ["SessionStart", "harness-session-start", 1024], ["PreToolUse", "harness-protect-sources", 0], ["UserPromptSubmit", "harness-session-prompt", 120]].map(([event, hook, bytes]) => JSON.stringify({ at: new Date().toISOString(), event, hook, bytes, truncated: false, exit: 0 })).join("\n")}\n`);
write(root, ".agents/reports/quality-gate-last.json", { status: "failed", mode: "changed", level: "changed", head: "abc1234", base: "develop", checks: [
  { id: "newIssues.CRITICAL", value: 1, limit: 0, status: "failed" }, { id: "newIssues.HIGH", value: 0, limit: 0, status: "passed" }, { id: "duplication.newCodePercent", value: 2.4, limit: 3, status: "passed" }, { id: "complexity.max", value: 18, limit: 15, status: "failed" }, { id: "coverage.newCodeMinPercent", status: "skipped", reason: "no-calculator" }], incomplete: [] });
write(root, ".agents/reports/findings-latest.json", { at: new Date().toISOString(), head: "abc1234", branch: "feat/KNOTS-21-payment-methods", level: "changed", analyzers: { gitleaks: "ran", pmd: "ran" }, findings: [
  { severity: "CRITICAL", check: "secret", title: "PG 시크릿 키가 설정 파일에 있다", path: "payment/src/main/resources/application-local.yml", line: 14, new: true }, { severity: "MEDIUM", check: "complexity", title: "복잡도 18 · PaymentMethodSelector.resolve()", path: "payment/PaymentMethodSelector.kt", line: 52, new: true }, { severity: "LOW", check: "style", title: "긴 줄", path: "payment/PaymentLogger.kt", line: 41, new: false }] });
const review = { issue: "KNOTS-18", mr: "#231", head: "abc1234", findings: [{ id: "F-1", severity: "HIGH", check: "RV-EDGE", path: "README.md", line: 1, fp: "ab".repeat(32), title: "위험 수용인지 수정인지 정한다" }, { id: "F-2", severity: "MEDIUM", check: "RV-NAME", path: "README.md", line: 2, fp: "cd".repeat(32), title: "이름" }] };
write(root, ".agents/reports/review/KNOTS-18.md", `---\nissue: KNOTS-18\n---\n\n<!-- knots-sync:review-data ${JSON.stringify(review)} -->\n`);

// 스킬 · 대화 기록(이 컴퓨터)
const skill = (rel, name, desc, extra = "") => write(home, `${rel}/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${desc}\n${extra}---\n\n본문\n`);
skill(".agents/skills", "service-planning-agent", "서비스 기획서, IA, 화면 정의서, 스토리보드를 쓴다");
skill(".agents/skills", "impeccable", "대시보드 · 앱 화면의 디자인 방향과 다듬기");
skill(".claude/skills", "impeccable", "대시보드 · 앱 화면의 디자인 방향 (다른 판)");
skill(".claude/skills", "code-review", "Review code for quality and security");
skill(".claude/skills", "tdd-guide", "Test-driven development: write tests first");
skill(".claude/skills", "korea-weather", "Korea weather forecast by region");
skill(".claude/skills", "kns-demo", "킷 스킬", "metadata:\n  kns-stages: [design]\n");
fs.symlinkSync(path.join(home, ".agents/skills/service-planning-agent"), path.join(home, ".claude/skills/service-planning-agent"));
skill(".kiro/skills", "docs-keeper", "Update documentation, readme and changelog");
write(root, ".agents/skill-map.json", { schema: "knots-sync.skill-map/v1", stages: { design: { "screen-plan": ["service-planning-agent", "impeccable"], requirements: ["pm-execution:create-prd"] }, verify: { review: ["code-review"] } }, commands: { "/kns-screen-plan": { slots: ["design.screen-plan"], fallback: "template:plans/screens" }, "/kns-intent": { slots: ["design.requirements"], fallback: "builtin" }, "/kns-review": { slots: ["verify.review"], fallback: "builtin", mode: "advisory" } }, exclude: [] });
write(home, ".config/knots-sync/config.json", { history: "on", usage: { warnAt: 0.8 } });
write(home, ".config/knots-sync/projects.json", { schema: "knots-sync.projects/v1", projects: [{ path: root, name: "knots-platform", addedAt: "2026-11-02" }, { path: path.join(realOut, "gone-admin"), name: "old-admin", addedAt: "2026-09-02" }] });
const enc = (d) => d.replace(/[^A-Za-z0-9]/g, "-");
const noon = (daysAgo) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime() - daysAgo * 864e5;
};
const lines = [];
const sizes = [[6, 2.9e6, "design"], [5, 3.6e6, "implement"], [4, 3.9e6, "implement"], [3, 4.4e6, "implement"], [2, 2e6, "implement"], [1, 1.6e6, "review"], [0, 3.0e6, "implement"]];
let n = 0;
for (const [ago, total, kind] of sizes) {
  for (let i = 0; i < 12; i += 1) {
    n += 1;
    const t = total / 12;
    const input = Math.round(t * 0.02);
    lines.push(JSON.stringify({ type: "assistant", sessionId: kind === "design" ? "design-desk" : "api-worker", cwd: root, gitBranch: kind === "design" ? "docs/INT-7-pay" : "feat/KNOTS-21-payment-methods", timestamp: new Date(noon(ago) + i * 60000).toISOString(), message: { id: `m${n}`, model: "claude-sonnet-4-5", usage: { input_tokens: input, output_tokens: Math.round(t * 0.01), cache_read_input_tokens: Math.round(t * 0.28), cache_creation_input_tokens: Math.round(t * 0.02) } } }));
  }
}
write(home, `.claude/projects/${enc(root)}/s1.jsonl`, `${lines.join("\n")}\n`);
write(home, ".claude/history.jsonl", `${[["결제 개편 Q3 부분 환불 범위를 정리해 줘", 1, "design-desk"], ["업로드 임시 파일 정리 배치를 구현한다", 0, "api-worker"]].map(([t, a, s]) => JSON.stringify({ display: t, timestamp: noon(a), project: root, sessionId: s })).join("\n")}\n`);
console.log(JSON.stringify({ root, home }));
