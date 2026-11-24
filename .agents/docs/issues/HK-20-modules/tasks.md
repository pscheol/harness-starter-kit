---
key: HK-20
area: modules
type: feat
title: 모듈 엔진 · aidlc · entire(HK-20a) — module.json · 도구 설치 · 어댑터 · 체크포인트 · 세션 적재량 측정
state: check
created: 2026-11-24
---

# Tasks — HK-20a

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 실제 도구 확인: aidlc 2.11.4 · Entire 0.13.4 를 /tmp 일회용 리포에서 돌려 산출물 · 설정 키 · 설치 명령을 기록(설계 10 §6) | 설계 10 §6 | done |
| T2 | `module.json` 선언(`declaration.ts`) · layout.json `ignore` `externalModules` · aidlc · entire · jira-workflow · multi-harness 선언 | HK20-R1 | done |
| T3 | 도구 확인 · 설치 결정(에이전트 · TTY · sudo) · 버전 범위(`tools.ts`) · `--install-tools` `--allow-unverified` | HK20-R3 · R4 | done |
| T4 | 모듈 엔진 `add`(계획 · dry-run · 스냅숏 · 단계 · 외부 등록 · 킷 몫 · 설정 · 되돌리기) · `remove` · `init --modules` | HK20-R2 · R5 · R6 · R8 · R9 · R16 | done |
| T5 | 훅 병합이 바뀔 메타를 보게(`withAfterMeta`) — add 가 모듈 훅을 병합하고 remove 가 뺀다 | HK20-R6 · R18 | done |
| T6 | 세션 적재량 측정(`core/measure.ts`) · add · remove 출력 · doctor · `GET /usage/kit` 의 `load` | HK20-R15 | done |
| T7 | aidlc: 훅 `harness-aidlc-freshness` · 어댑터 `sync aidlc` · `intent.py` · `from_unit.py` 의 intent.json 입력 · doctor | HK20-R9~R11 | done |
| T8 | entire: 구현 하네스 하나만 · push 정책(gh · glab) · doctor 점검 · 규칙 파일 | HK20-R12 · R13 | done |
| T9 | `update --tools` | HK20-R14 | done |
| T10 | `GET /checkpoints` · `GET /checkpoints/{id}` · CLI `checkpoints` · PAIRS 시험 | HK20-R17 | done |
| T11 | vitest: 엔진 · 어댑터 · 체크포인트(가짜 도구 PATH), 기존 시험 갱신 | 전부 | done |
| T12 | 실제 도구 e2e(킷 → AI-DLC → Entire, 역순, update · repair · remove · uninstall 뒤 sha256) | HK20-R7 | done |
| T13 | 생성물 · 전체 시험 · 검증 기록 | 완료 기준 | check |

## 요구사항별 결과

| 요구 | 결과 | 근거 |
|---|---|---|
| HK20-R1 | 네 모듈 모두 선언, 모듈 폴더 파일이 선언에 없으면 시험 실패, 선언한 훅이 `.agents/hooks.d` 에 없으면 doctor 오류 | `modules-engine`(선언) |
| HK20-R2 | `add aidlc --dry-run` 이 외부 명령 · 설정 · 훅을 보이고 트리가 그대로, 외부 명령 0건 | `modules-engine` |
| HK20-R3 | TTY "아니오" → exit 5 · brew 0건, `--install-tools` → brew 1회, `CLAUDECODE` → exit 5 · 0건, TTY 아님 → 0건, sudo → 0건 | `modules-engine`(도구 설치) |
| HK20-R4 | 0.14.0 → exit 4, `--allow-unverified` → 진행 + doctor 경고 | `modules-engine` |
| HK20-R5 · R6 · R7 | lock `op none` `external:aidlc` 404, remove 뒤 lock 에서만 빠지고 파일 · 훅 항목 sha256 그대로, 다시 add 하면 같은 수로 재등록 | `modules-engine` · 실제 e2e |
| HK20-R8 | 충돌 · 요구 모듈 exit 3 | `modules-engine` |
| HK20-R9 | `flow.design` aidlc ↔ kit | `modules-engine` |
| HK20-R10 | 구조 · 같은 입력 쓰기 0건 · `--check` exit 1 · Unit 삭제 후 `planned false` · 다른 Unit 의 `issue` 유지 · 필수 항목 없으면 exit 2 | `modules-aidlc-sync` |
| HK20-R11 | `design-harness` · `construction-artifacts` 경고 | `modules-aidlc-sync` · `modules-engine` |
| HK20-R12 · R13 | 구현 하네스 하나에만 `enable --agent`, kiro 는 exit 3, PUBLIC · gh 실패 → `--skip-push-sessions`, PRIVATE → 건드리지 않음, 다른 하네스 훅 → doctor 경고, 전역 hooksPath 경고 | `modules-engine` |
| HK20-R14 | 에이전트 세션 목록만, TTY 에서 `aidlc update`, 범위 밖 최신은 blocked | `modules-engine` |
| HK20-R15 | 규칙 2 · 스킬 5 · SessionStart 훅 2 fixture 의 증가량 = 바이트 합, 훅 0 → 2 | `modules-engine`(측정) |
| HK20-R16 | applyKit 뒤 setConfig 실패 → 킷 파일 · lock · 메타 되돌림, 외부 파일 남음 | `modules-engine`(되돌리기) |
| HK20-R17 | 트레일러 커밋만 목록, local · 원격에만, 설명의 제어 문자 제거, entire 꺼짐 · 도구 없음 | `modules-checkpoints` · `dashboard-cli` |
| HK20-R18 | 모듈 훅은 모듈이 켜졌을 때만 병합. 모듈 파일은 옵션 폴더라 끄면 안 깔린다 | `modules-engine` |

## 실제 도구 e2e 기록(2026-11-24, /tmp 일회용 리포 · 일회용 HOME)

스크립트는 임시(저장하지 않음). 절차: `git init` + 가짜 origin → `harness-kit init --stack python --agents claude,codex --no-register` → `add <첫째> --yes` → `add <둘째> --yes` → 외부 파일 · 외부 훅 항목 sha256 기록 → `update --yes` → `repair` → `doctor` → `remove <둘째>` → `remove <첫째>` → `uninstall --yes` 각 단계 뒤 비교.

| 순서 | 외부 항목 수 | update 뒤 | repair 뒤 | remove 뒤(lock 에서 뺀 파일) | uninstall 뒤 |
|---|---|---|---|---|---|
| 킷 → AI-DLC → Entire | 432(파일 406 + 훅 항목 26) | 달라진 0 | 달라진 0 | 406/406 그대로 | 달라진/없어진 0 |
| 킷 → Entire → AI-DLC | 432 | 달라진 0 | 달라진 0 | 406/406 그대로 | 달라진/없어진 0 |

관찰: AI-DLC 가 한 번에 73,333바이트(진입 파일 9 · 규칙 1 · 스킬 설명 43 · 에이전트 설명 14), 훅 17개를 더한다. Entire 는 0바이트, 훅 10개. `remove` 뒤 doctor `external-hooks-left` 가 남은 훅 수를 알린다. `.gitignore` 는 AI-DLC 가 블록을 더해 킷 `update` 가 `.gitignore.new` 충돌을 낸다(분석 4절). 처음 한 번 실제 홈으로 Entire 를 돌려 전역 훅 폴더가 바뀐 일은 `entire disable --uninstall --force` 로 원상 복구했다(분석 2.2).

## 시험 결과

(마지막에 채운다)
