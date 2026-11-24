---
key: HK-21
area: ops
type: feat
title: 배포 · 운영 기록 · 전달 지표 · 규칙 후보
status: in-review
created: 2026-11-24
---

# Design — HK-21

근거: [requirements](requirements.md), [설계 14](../../../../docs/design/14-deploy-and-ops.md) DO-R1~R16 · §3.2~§3.13 · §5 완료 기준, [09](../../../../docs/design/09-verification-quality.md) §3.7(CI 템플릿) · §3.8(승인 강제), [06](../../../../docs/design/06-dashboard.md) §3.5 · §3.15(API · CLI 짝), [08](../../../../docs/design/08-design-stage.md) §3.11(접수) · §3.15(위험 등급). 선행: HK-16(CI 템플릿 · 품질 게이트), HK-19(접수 · 위험 두 사람 승인), HK-23(approvals.md · 게이트 판정), HK-26(astryx 화면).

킷은 모델을 부르지 않는다. 배포 명령 자체는 팀의 `deploy.json` 명령을 부를 뿐이고, 지표는 git · 승인 기록 · 배포 기록에서만 계산한다. 세션마다 새로 실리는 바이트는 없다(스킬 · 역할 · 상시 규칙을 더하지 않았다. 규칙 문장 하나가 `approval-vocabulary.md`(paths 로 승인 문서를 다룰 때만 실린다)에 들어갔다).

## 1. 판정 원본은 Python 하나

TS(관리 페이지 · CLI)와 Python 이 같은 것을 둘 다 계산하면 어긋난다. 그래서 새로 만든 판정 · 계산은 전부 설치본 `scripts/harness/*.py` 하나이고, TS 는 그 스크립트를 부르거나(`/ops` · deploy 조건 · 접수) 이미 두 벌인 승인 기록 읽기 · 쓰기(`approvals.py` ↔ `approvals.ts`)만 쓴다. `GET /ops` 와 `status --ops --json` 은 같은 처리 함수라 `data` 가 같다(`dashboard-cli.test.ts` PAIRS 에 `/api/v1/ops` 추가).

| 파일(`scripts/harness/`) | 하는 일 | 요구 |
|---|---|---|
| `rollout.py` | design §13 검사 · §13.3 항목 모으기 · §13 sha | DO-R1 |
| `deploy_config.py` | `.agents/deploy.json` 읽기 · 검사(연속 실패 상한 1~2, 비밀값 모양 거부) · 자리표 채우기 | §3.3 |
| `deploy_record.py` | 배포 기록 읽기 · 계획 구간 sha256 · 결과 구간 쓰기 | §3.3 |
| `deploy_plan.py` | `deploy plan` — 포함 이슈(done 통과) design §13 을 모아 기록 만들기 | DO-R2 · R3 |
| `deploy_gate.py` | D1~D7 판정 · 승인 기록 항목 만들기 · `--require-approved` | DO-R4~R6 |
| `deploy_ci.py` | `deploy record --from-ci` — CI 산출물로 §4 시험 줄 · §6 검증 줄 채우기(head 가 다르면 거부) | §3.3 |
| `deploy_run.py` | `run`(운영은 승인 검사 먼저) · `auto-verify` · `result` · `history`(glab · gh) | DO-R7 · R8 |
| `deploy.py` | 위 하위 명령의 입구 | — |
| `ops_records.py` | 운영 기록 읽기 · 검사(DO-R9) · `new` | DO-R9 |
| `ops_intake.py` + `intake.py ops` | 장애 → bug 이슈, 후보 → Intent | DO-R10 · R11 |
| `delivery_metrics.py` | 전달 지표 5개 · 기준선 · 재계산 검증 · 운영 기록 §2 채우기 | DO-R12 · R13 |
| `rule_candidates.py` | 후보 만들기 · 승격 · 거절 · accepted 검사 | DO-R14 · R15 |
| `ops_report.py` | `/ops` 응답 · "처리할 일" 항목 | DO-R16 |

fast(`check_harness.py` 의 `ops_errors`)는 deploy.json 형식 · 운영 기록 출처 · accepted 후보의 규칙 파일 변경을 본다. design 승인 앞 조건은 `sdd_gates.py` 의 design 앞 조건에 `rollout_reasons` 를 더해 TS 승인 API(`sdd_gates.py check --json` 을 부른다)와 터미널 `approve.py` 가 같은 422 / exit 1 을 낸다.

## 2. 배포 기록 · 계획 sha

- 기록: `.agents/docs/ops/deploys/<날짜>-<키>.md`(설계 14 §3.3 그대로). 머리 `issues: […]` · `commit: { base, sha }` 같은 한 줄 표기는 `deploy_record.inline` 이 읽는다.
- 승인 sha = 계획 구간(`PLAN:BEGIN`·`PLAN:END` 표지 줄 **사이** 줄들을 `\n` 으로 이은 UTF-8, 앞뒤 빈 줄 제거)의 sha256. 결과 구간 · 머리 `state` 는 sha 에 들지 않아 배포 뒤 결과를 써도 승인이 유지된다(완료 기준 5, `test_deploy_ops.py`).
- 승인은 포함 이슈 `approvals.md` 마다 같은 내용 · 같은 기록 ID 로 덧붙인다(대상 `…/<기록>.md#PLAN`). 터미널(`approve.py deploy:<기록> deploy`)과 관리 페이지(`POST /approvals` `gate: deploy`, `target: {deploy}`)가 같은 항목을 낸다. 상태는 모든 포함 이슈가 `valid` 일 때만 `valid`, risk high 는 서로 다른 `user.email` 2명(`need_of`).
- D3 면제: 승인하는 사람이 승인 요청에 넣은 `롤백 면제:` 줄(10자 이상, risk high 는 불가)만 센다. 기록 본문의 면제 문장은 세지 않는다(`test_waiver_counts_only_when_in_approval_entry`). 면제는 시험이 없어 필요할 때만 기록에 남는다(`rollbackWaived`).

## 3. 자동 검증 배포

`deploy.py auto-verify`: 설계 14 §3.5 의 1~6 그대로(배포 → 스모크 → 헬스 → E2E 한 번 → 롤백 시험, 실패하면 `lastPassedSha` 로 되돌린다). 직전 실행 읽기는 세 길이다.

1. `HX_DEPLOY_HISTORY`(JSON 목록, 최신 먼저)나 기본 파일 `.agents/state/deploy-history.json`. GitLab · GitHub 템플릿은 앞 단계 `deploy.py history --platform gitlab|github` 가 `glab api` · `gh run list` 로 직전 작업 결과를 읽어 그 파일을 쓴다(빈 목록도 "읽었다"다).
2. 이전 단계 산출물 `.agents/reports/deploy/auto-verify-*.json`(GoCD).
3. 둘 다 못 읽으면 `stopped`(이유: 실패 수 모름). 첫 실행도 같다 — 사람이 `HX_DEPLOY_RESUME=true` 로 한 번 수동 실행한다.

`failed` · `stopped` 가 연달아 `maxConsecutiveFailures`(1~2) 이상이면 배포하지 않고 `stopped`. `HX_DEPLOY_RESUME=true` 실행이 통과하면 0 이 되어 다음 push 는 다시 배포한다(완료 기준 6, `AutoVerifyTest`). 산출물 순번 `seq` 로 같은 초에 끝난 실행의 앞뒤를 가른다.

## 4. 운영 기록 · 접수 · 규칙 후보 · 지표

- 운영 기록: 실측 값마다 출처(`from`·`to` 가 든 URL 또는 `ci:<경로>`)가 없으면 fast 실패, `미달` 인데 장애 · 후보가 가리키지 않으면 경고. 장애 제목 정규식은 설계 그대로.
- 접수: `intake.py ops ops:<기록>#INC-n|NX-n`. 장애는 `new-feature.sh --next … --type fix` 이슈에 `risk: medium` · `source:` 머리와 "장애에서 온 접수" 절을 붙이고 운영 기록의 `- 후속 이슈:` 한 줄만 고친다(diff 1줄, 시험). 후보는 Intent 를 만들고 `intake.md` 머리에 `source: { type: ops, ref, url: null, importedAt, version }`, NX 행의 `접수` 칸에 키를 쓴다. 같은 후보를 다시 접수하면 기존 경로를 보이고 끝낸다.
- 전달 지표: 리드 타임 · 배포 실패율 · 복구 시간 · 승인 대기 시간 · 재작업 비율. 도입 뒤는 `method: kit`(운영 배포 기록이 없으면 리드 타임만 `merge`), 도입 전 기준선은 `method: git`. 승인 대기 시간은 (in-review 로 바꾼 첫 커밋 → 같은 sha 의 approved 기록 시각)으로 양수가 되게 했다(설계 문장의 뺄셈 방향은 뒤바뀐 표기로 보았다). `mr` 게이트의 MR 열림 시각은 glab · gh 가 필요해 이 판에서 뺐다(`unavailable`).
- 기준선: 킷 도입 커밋(`harness-kit.lock` 을 처음 더한 커밋) 앞 90일, `headSha` 로 고정한 입력의 `inputDigest`. 나중 커밋이 늘어도 `--verify-baseline` 은 같은 값이다.
- 규칙 후보: 출처 셋(승인 `규칙 후보: 예` · 같은 점검의 `수용` 지적 2개 이슈 이상 · 운영 기록 `배운 것`)에서 파일만 만들고 `제안 규칙` 은 비워 둔다. 승격 · 거절은 사람 터미널만(`env_marker` 로 에이전트 표지 거부). accepted 는 같은 MR 에서 target 이 바뀌었을 때만(fast).

## 5. 화면 S10 · 처리할 일 · CLI

- `Ops.tsx`: 숫자 카드 4, 기록(배포 · 장애 · 운영 기록), 다음 요구사항 후보(→ S11 `/intake?from=ops:…`), 전달 지표(30일 · 기준선 · 계산 방법 다름), 자동 검증 배포(멈춤 · 재개 안내), 규칙 후보(승격 · 거절 명령 복사). 읽기만 한다. `Intake.tsx` 는 `?from=` 일 때 `POST /intake {from}` 로 접수한다.
- 처리할 일(`overview.todo`): `deploy-stopped`(rank 1) · `deploy-approval`(2) · `ops-metric-miss`(4) · `rule-candidate-stale`(7). 운영 폴더가 없으면 스크립트를 부르지 않는다.
- CLI: `deploy plan|check|record|run|result`, `ops new|check`, `metrics`, `rules`, `approve deploy:<기록>`, `intake --from ops:…`, `status --ops`. 예약 명령에서 `deploy` · `ops` · `metrics` · `rules` 를 뺐다(`sync` 만 남는다). doctor 는 `deploy-config`(연속 실패 상한) · `deploy-guard-missing`(운영 환경이 있는데 CI 에 승인 검사가 없음) 을 낸다.

## 6. 설계와 다르게 한 것

| 설계 | 이 판 | 이유 |
|---|---|---|
| 이슈 폴더 `HK-21-deploy-ops` | 이미 있던 `HK-21-deploy-and-ops`(requirements 승인됨)에 design · tasks 를 더했다 | 같은 키 폴더가 둘이면 이슈 키가 중복(`ambiguous`)이고, 승인된 requirements 를 옮기지 않으려고 |
| design 승인 앞 조건은 §13 이 있으면 항상 | 새 템플릿 제목(`13. 배포 · 롤백`)이 있는 design 만 본다 | 옛 템플릿(`Migration / Rollout`) design 과 시험용 최소 design 이 승인되지 못하는 것을 막는다. 새 템플릿을 쓰는 design 은 그대로 막힌다 |
| §13.4 표가 있으면 같은 검사 | 값이 하나라도 채워진 §13.4 만 전부 채우기를 요구한다 | 템플릿에 항상 있는 빈 표가 인프라를 안 바꾸는 변경도 막지 않게 |
| `deploy record --from-ci <파이프라인 URL>` 이 산출물을 받아 온다 | URL 이면 이 체크아웃의 기본 자리(CI 가 내려받은 산출물)를 읽고 URL 을 근거로 적는다 | 킷은 네트워크로 CI 를 읽지 않는다. 폴더 · 파일 인자도 받는다 |
| D4 "CI 토큰이 있으면 플랫폼 API 로 다시 본다" | 하지 않았다 | 네트워크 · 토큰 의존. 산출물의 head · sha 대조까지만 |
| GitLab 직전 실행 읽기 `glab api pipelines` | `history` 하위 명령이 `glab api` · `gh run list` 를 부르고(가짜 실행 파일로 시험), 결과를 `.agents/state/deploy-history.json` 으로 `auto-verify` 에 넘긴다 | 시험 가능한 한 곳으로 모으려고. 권한 · 토큰 확인은 설계 §6 "확인 필요"에 남는다 |
| 승인 대기 시간 `mr` 열림 시각 | 뺐다(`unavailable`) | glab · gh 호출 비용 · 권한 확인 전(설계 §6) |
| S03 승인 화면에 "롤백 시험 없이 승인" 칸 | 넣지 않았다 | 이 판은 S10 만 채웠다. API · 터미널 승인은 `waiveRollback`(`--waive-rollback`)으로 된다. 화면 칸은 다음 일 |
| `ops new` §1 의 NFR 은 이슈 NFR 도 | Intent §3 성공 지표 · §7 NFR 만 | 이슈 requirements 의 NFR 형식이 일정하지 않다 |
| `pnpm test:ui` 크기 예산 520KB | 524KB 로 올렸다 | 자리만 있던 S10 을 채워 532,916 바이트(예산 532,480 초과 436바이트). 기능 하나 값이다 |
| 변경 계획 시험의 `--plan` 제한 15초 | 60초 | 시험 fixture 가 `scripts/harness` 를 통째로 새 파일로 보아 스크립트 수에 비례해 느려진다(base 11.7초 → 15.8초). 15초는 이미 한계였다 |
| 위험 높은 배포 승인 상태를 한 이슈 기록에서 | 모든 포함 이슈가 valid 여야 valid | 같은 기록을 이슈마다 붙이므로 하나라도 빠지면 막는 쪽이 안전하다 |

## 7. 공유 파일(합칠 때)

`packages/cli/src/main.ts` · `cli/args.ts` · `commands/reserved.ts` · `commands/doctor.ts`(import 한 줄 · kinds · push 한 줄) · `commands/intake.ts` · `commands/decide.ts`, `packages/dashboard/src/{api.ts, model.ts, writers/approvals.ts, writers/intake.ts}`, `packages/templates/common/scripts/{check_harness.py, harness/{sdd_gates.py, approve.py, intake.py}}`, CI 템플릿 셋, design 템플릿, `approval-vocabulary.md`, `manifest.md` 파일 수, `dashboard-ui` 의 `Home.tsx` · `Intake.tsx` · `Ops.tsx`, demo-fixture.
