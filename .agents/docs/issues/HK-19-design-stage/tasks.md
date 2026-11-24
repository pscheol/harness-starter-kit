---
key: HK-19
area: design
type: feat
title: 킷 설계 단계 — 요구사항 접수 · /hx-intent · Unit 목록 · 질문 · 기획물 · 역할 배정
state: check
created: 2026-11-24
---

# Tasks — HK-19

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 템플릿(intent · questions · current-state · codebase · plans 다섯) · designer 역할 · mob-elaboration 규칙 | DS-R1 · R14~R16 · 08 §3.9 | done |
| T2 | `intent.py` key · new · next · check · backlog, `new-intent.sh`, verify fast 연결 | DS-R1~R8 · R17 | done |
| T3 | `intake.py` · CLI `intake` · API `POST /intake` | 08 §3.11 | done |
| T4 | `codebase_scan.py` · `codebase_check.py` · codebase 게이트(422 model_stale) | DS-R20~R23 | done |
| T5 | `from_unit.py` · `check-sdd-prerequisites.sh` dependsOn · hx-specify 절 | DS-R9~R13 | done |
| T6 | `plan_check.py` · `wireframe_check.py` · 스킬 지도 해석 · `hx-plans` 스킬 | DS-R14~R17 | done |
| T7 | `hx-intent` 스킬 · 세션 시작 역할 안내 · 답 줄 보호 훅 | DS-R2 · R18 · R19 | done |
| T8 | 몹(`mob.py` · CLI · 답 API 참석자) · risk high 두 사람 · `invariants.py` · hx-analyze 절 | DS-R24~R28 | done |
| T9 | MR-R6 문장 · R7 개인 등급 · R10 SubagentStop 훅 · R11 사용량 기본 꺼짐 · R12 시험 | 12 MR-R | done |
| T10 | 생성물 · manifest · 상시 바이트 · 전체 시험 · 검증 기록 | 완료 기준 | done |

## 요구사항별 결과

| 요구 | 결과 | 근거(시험) |
|---|---|---|
| DS-R1 · R2 | `intent.py new · key · next`(08 §3.1 표 그대로), `new-intent.sh`, `/hx-intent` 스킬 | `test_intent.py` |
| DS-R3 · R5~R8 | `intent.py check`(질문 형식 · 회차 5개 · 분해 수치 · 계약 Unit · 고리 · 스토리 배정), fast(`check_harness.py`)가 부른다 | `test_intent.py`, `flow.test.ts`(intent 게이트가 실제로 검사) |
| DS-R9~R13 | `from_unit.py`(intent 게이트 · 계약 먼저 · FROM-UNIT 구간 · units.json issue · jira 키), `check-sdd-prerequisites` dependsOn design 승인 | `test_from_unit.py` |
| DS-R14~R17 | 기획물 템플릿 · `plan_check.py` · `wireframe_check.py` · `/hx-plans`(스킬 지도는 `harness-kit skills --json` 의 `map.resolved`) · backlog 생성 구간 | `test_plans.py`, `intent-gates.test.ts`(plans 승인) |
| DS-R18 | `flow.design = aidlc` 이면 `next` 가 aidlc 안내로 끝 | `test_intent.py` |
| DS-R19 | 세션 시작: role design 한 줄 · 하네스 다르면 경고 | `test_session_start_budget.py` |
| DS-R20~R23 | `codebase_scan.py`(정적 행만) · `codebase_check.py`(출처 fast 실패 · 오래됨 경고) · codebase 승인 422 `model_stale` | `test_codebase.py`, `intent-gates.test.ts` |
| DS-R24 | `mob.py` · `harness-kit mob` · `/intents/{key}/mob`, 답 API 참석자 `by` · `기록:` | `test_mob.py`, `mob.test.ts` |
| DS-R25 | 설계 세션이 profile · risk 를 제안(스킬 · 역할 문장), 사람이 intent 승인 때 확정 | 역할 원본 · `hx-intent` 스킬 |
| DS-R26 | risk high 의 design · mr · deploy 는 서로 다른 승인자 2명(`partial`), 같은 사람 두 번은 409, mr 은 highPaths 하한 | `test_risk_gates.py`, `risk.test.ts` |
| DS-R27 · R28 | `invariants.py` · design 템플릿 §4.5 · `/hx-analyze` 절 | `test_invariants.py` |
| 접수(08 §3.11) | `intake.py` · `harness-kit intake` · `POST /intake` | `test_intake.py`, `intake.test.ts`, `dashboard-cli.test.ts` |
| 답 줄 보호(08 §3.3) | `questions.md` 새 답 · 바뀐 답 · 지운 답 차단, `mob.json` · mob 명령 차단 | `test_protect_approvals.py` |
| MR-R6 | `hx-implement` · `hx-review` 위임 문장 | 문장(킷은 모델을 부르지 않는다) |
| MR-R7 | `.agents/local/model-policy.local.json` classes 만 · doctor personal-ignored · 세션 시작 한 줄 | `local.test.ts`, `test_session_start_budget.py` |
| MR-R10 | Claude SubagentStop `subagent-result-cap`(6,000자, 한 번만 막는다) | `test_subagent_cap.py`, `projection-merge.test.ts` |
| MR-R11 | HK-18 `usage.ts` 가 기본 꺼짐 | `usage.test.ts` |
| MR-R12 | init --adopt · update · remove/add · repair · local sync · uninstall 전후 모델 · effort 키 같음 | `model-unchanged.test.ts` |

상시 바이트(원칙 10): 새로 세션마다 실리는 것은 스킬 설명 둘(`hx-intent` 241 · `hx-plans` 280바이트)과 역할 설명 하나(`designer` 200바이트), 합계 721바이트다. `mob-elaboration` 규칙은 `paths` 로 Intent 폴더를 다룰 때만 실린다. 세션 시작 줄(설계 세션 · 개인 모델)은 그 조건일 때만 상태 512바이트 안에 들어간다. SubagentStop 훅은 통과면 0바이트다.

## 검증 기록

2026-11-24, 통합 브랜치(`844f3a4`)에 HK-19(`6ac7486`)와 HK-26(`f14cd44`)을 합친 깨끗한 worktree(`a923b59`)에서 하나씩 돌렸다.

| 시험 | 결과 |
|---|---|
| `pnpm test:ui`(관리 페이지 화면, HK-26) | 4파일 30개 통과 |
| `pnpm -C packages/flow-view test` | 4개 통과 |
| `pnpm -C packages/dashboard test` | 17파일 148개 통과 |
| `pnpm -C packages/cli test` | 36파일 443개 통과 |
| `node scripts/gen-plugins.mjs --check` | 생성물 일치 453개 |
| 킷 Python `python3 -m unittest discover -s tests -p "test_*.py"` | 120개 통과(1,978초) |
| 설치본(python 스택) `scripts/tests` 전체 | 618개 통과(1,095초) |

- 앞서 HK-19 브랜치에서 관리 페이지 시험 1건이 부하(평균 18) 아래 60초 시간 초과로 실패했다가 혼자 돌리면 통과했다. 위 표는 하나씩 돌린 결과다.
- 사람 확인이 남은 것: 설계 세션 실제 한 바퀴(/hx-intent → 답 → intent 승인 → /hx-plans → /hx-specify --from-unit), 긴 위임 결과가 SubagentStop 훅으로 한 번 돌아오는지(설계 12 §5 #8), design.md 승인.
