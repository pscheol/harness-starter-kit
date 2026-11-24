---
key: HK-21
area: ops
type: feat
title: 배포 · 운영 기록 · 전달 지표 · 규칙 후보
state: check
created: 2026-11-24
---

# Tasks — HK-21

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | design 템플릿 §13 "배포 · 롤백" · §17 두 줄, `rollout.py`, design 승인 앞 조건(`sdd_gates.py`) | DO-R1 | done |
| T2 | `deploy.json` 틀(`agents-root/deploy.json`) · `deploy_config.py` · 배포 기록 템플릿(`ops/deploy.md`) · `deploy_record.py` · `deploy plan` | DO-R2 · R3 | done |
| T3 | `deploy_gate.py` D1~D7 · `deploy.py check [--require-approved]` · `approve.py deploy:<기록>` · `POST /approvals` deploy · `harness-kit approve deploy:` | DO-R4 ~ R6 | done |
| T4 | `deploy record --from-ci` · `deploy run` · `deploy result` | §3.3 | done |
| T5 | `auto-verify` · `history` · CI 템플릿 셋(GitLab · GitHub · GoCD)의 선택 작업 | DO-R7 · R8 | done |
| T6 | 운영 기록 템플릿 · `ops_records.py`(check · new) · fast 연결 | DO-R9 | done |
| T7 | `intake.py ops` · `ops_intake.py` · `POST /intake {from}` · `harness-kit intake --from` | DO-R10 · R11 | done |
| T8 | `delivery_metrics.py`(지표 · 기준선 · 재계산 · 운영 기록 §2) · `harness-kit metrics` | DO-R12 · R13 | done |
| T9 | `rule_candidates.py` · `harness-kit rules` · fast 의 accepted 검사 | DO-R14 · R15 | done |
| T10 | `ops_report.py` · `GET /ops` · `status --ops` · 처리할 일 항목 · S10 화면 · 접수 화면 `?from=` | DO-R16 | done |
| T11 | 예약 명령 해제 · doctor 점검 2종 · 생성물 · manifest 파일 수 · 전체 시험 | 완료 기준 | done |

## 요구사항별 결과

| 요구 | 결과 | 근거(시험) |
|---|---|---|
| DO-R1 | design §13.1 · §13.2 빈 값 · 판단 기준에 숫자 없음 · §13.3 항목 미처리는 승인 앞 조건 위반(TS 승인 API 422 `gate_precondition`, 터미널 exit 1). `배포 없음: <이유>` 한 줄이면 통과. 옛 템플릿 design 은 건너뛴다 | `test_deploy_ops.py`(RolloutTest · DesignGateTest), `deploy-ops.test.ts` |
| DO-R2 | `deploy plan INT-7` 이 `ops/deploys/<날짜>-INT-7.md`(`state: planned`)를 만든다. §1 2행 · §5 는 두 design §13.3 의 합집합 | `DeployPlanTest` |
| DO-R3 | done 을 통과하지 않은 이슈 키를 출력하고 exit 1, 파일을 만들지 않는다 | `test_plan_names_not_done_issue_and_exits_1` |
| DO-R4 | D1~D7 판정(`deploy_gate.py`), 맞지 않으면 422 `gate_precondition` + `details.conditions`(조건 ID) | `deploy-ops.test.ts`, `ops-cli.test.ts` |
| DO-R5 | 시험 없음은 승인 요청의 `waiveRollback`(10자 이상)이 있을 때만 201, 기록 본문 문장은 안 센다, risk high 는 면제 불가 | `DeployGateTest`, `deploy-ops.test.ts` |
| DO-R6 | `deploy.py check --require-approved`: 승인 없음 · 계획 구간 변경 → exit 1, 결과 구간만 바뀌면 exit 0. `run --env production` 은 승인 전 배포 명령 0회 | `test_require_approved_and_plan_sha`, `test_run_production_checks_approval_first` |
| DO-R7 | 세 CI 템플릿에 `deploy-verify` · `deploy-production`(deploy.py 만 부른다). `autoVerify.enabled` 거짓이면 "꺼짐" exit 0 | `test_ci_templates.py`, `test_disabled_is_off` |
| DO-R8 | 연속 실패 2회 뒤 `stopped`(배포 명령 0회), `HX_DEPLOY_RESUME=true` 통과 뒤 다음 push 는 배포. 직전 실행을 못 읽어도 stopped | `AutoVerifyTest`(history · 산출물 · gh) |
| DO-R9 | 출처 없는 실측 값 · 기간 없는 링크는 `check_harness.py`(fast) 실패, 줄 번호 포함. 미달 지표 미지정은 경고 | `OpsRecordTest` |
| DO-R10 | `intake ops:…#INC-1` 이 bug 이슈를 만들고 운영 기록 diff 는 1줄 | `IntakeFromOpsTest` |
| DO-R11 | `intake ops:…#NX-1` 이 `source: { type: ops, … }` Intent 를 만들고 같은 명령을 다시 해도 Intent 수가 그대로 | `IntakeFromOpsTest`, `ops-cli.test.ts` |
| DO-R12 | 입력은 git 기록 · approvals.md · 배포 기록 · 운영 기록의 장애 표지뿐. 같은 입력 → 같은 출력 | `KitMetricsTest` |
| DO-R13 | git fixture(병합 20 · 태그 5 · revert 1 · hotfix 1)에서 기준선이 기대값과 같고 `--verify-baseline` exit 0, 숫자를 바꾸면 exit 1. 이후 커밋이 늘어도 같다 | `test_delivery_metrics.py`, `delivery_expected.json` |
| DO-R14 | `규칙 후보: 예` 1건 + 같은 점검의 수용 지적 2 이슈 → 후보 2개 | `RuleCandidateTest` |
| DO-R15 | 규칙 파일을 안 바꾸고 `accepted` 로 바꾼 변경은 fast 실패, 바꾸면 통과 | `test_accepted_without_rule_change_fails_fast` |
| DO-R16 | `GET /ops` 와 `status --ops --json` 의 `data` 가 같다 | `dashboard-cli.test.ts` PAIRS, `ops-cli.test.ts` |

## 검증 기록

(아래 표는 실행 뒤 채웠다.)

| 시험 | 결과 |
|---|---|
