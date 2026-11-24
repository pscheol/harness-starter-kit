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

| 시험 | 결과 |
|---|---|
| `pnpm -C packages/cli test`(tsc + vitest) | 40 파일 · 479 통과(새 시험 `modules-engine` 25 · `modules-aidlc-sync` 8 · `modules-checkpoints` 3 포함) |
| `pnpm -C packages/dashboard test` | 17 파일 · 148 통과(처음 한 번은 다른 시험이 동시에 돌아 시간 초과 2건 — 단독 재실행 통과) |
| `pnpm test:ui` | 화면 파일을 건드리지 않아 돌리지 않았다 |
| `node scripts/gen-plugins.mjs --check` | 생성물 일치(파일 461개). `tests.test_generated` 10 통과 |
| 킷 python 전체(`unittest discover -s tests`) | 120 중 114 통과. 실패 5(`test_generated` — 시험 중 소스를 고쳐 생성물이 낡았다, 다시 만든 뒤 10 통과) + 오류 1(`test_install` 의 설치본 시험이 동시에 도는 다른 시험 때문에 1,200초 제한 초과 — 같은 설치본 시험을 단독으로 돌려 아래 621 통과) |
| 설치본 시험(`<설치>/scripts/tests`, 새 `test_aidlc_intent.py` 포함) | 621 통과(1,165초) |
| 실제 도구 e2e | 위 표 — 두 순서 모두 달라진 외부 항목 0 |

---

# Tasks — HK-20b

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| B1 | 승인 기록의 jira 경로 `(jira)` sha · `근거` 쓰기 — Python · Node 파서 · fixture | HK20B-R3 | done |
| B2 | 보드 여덟 상태 `boardStatusOf` · 이슈 모델 `boardStatus` | HK20B-R5 | done |
| B3 | `issue-tracker.yml` v2 · 규칙 · `hx-issue` · `hx-ticket` · `hx-jira-setup` | HK20B-R1 | done |
| B4 | Jira REST 클라이언트 · `sync jira`(전이 · 링크 · 승인 전이 거부) | HK20B-R2 · R5 · R9 | done |
| B5 | `sync jira --approvals` · `--verify` | HK20B-R3 · R4 | done |
| B6 | `intake.py` 출처 · 다시 가져오기 diff · `--key` | HK20B-R6 · R7 | done |
| B7 | `intake --from jira:` (ADF → Markdown · 첨부 · 하위 항목) | HK20B-R6 · R7 · R9 | done |
| B8 | notion 모듈 선언 · `intake --from notion:` · 블록 → Markdown · writeBack | HK20B-R8 | done |
| B9 | `sync units` 이식(`sync.py` 와 같은 `--check`, `.new`, 단위 lock) | HK20B-R10 | done |
| B10 | `cross-repo.md` · `check_submodules.py` · 도메인 간 경로 가드 · `affected` 연결 · `from_unit.py` repo | HK20B-R11 · R12 · R13 | done |
| B11 | 시험 · 생성물 · manifest 수 · 전체 시험 | 전부 | check |
| B12 | 실제 Jira · Notion · knots 확인(사람) | design.md HK-20b §7 | 사람 |

## 요구사항별 결과

| 요구 | 결과 | 근거 |
|---|---|---|
| HK20B-R1 | 설치한 템플릿이 읽히고 기본 `sync none` · `maxStatus verifying` · 여덟 상태 TBD | `modules-hk20b` |
| HK20B-R2 | 백로그 → 승인 대기 전이만 보냄, 설계 · 완료 · 배포됨 · 구현 중 요청은 exit 4 · 전이 0건, 승인 전이 대기 · Jira 가 앞서면 되돌리지 않음 | `modules-jira` |
| HK20B-R3 | 승인 전이 3건 기록 · 재실행 0건 · approvers 밖과 이메일 없음은 경고만 · Python 파서 유효 · 문서 sha 가 바뀌어도 valid · 로그에 기록 ID | `modules-jira` · `approvals-fixture`(Node) · `test_approvals_fixtures`(Python) |
| HK20B-R4 | 위조한 changelog id 는 exit 1 | `modules-jira` |
| HK20B-R5 | 모듈 꺼짐 · `none` · 템플릿 기본에서 요청 0건 exit 0, `GET /issues` 에 `boardStatus` | `modules-jira` · `modules-hk20b` · `board-status` |
| HK20B-R6 · R7 | 에픽 키가 Intent 키 · `source` 줄 · 제어 문자 제거 · 비밀값 거부 · 같은 입력 변화 없음 · 바뀌면 diff exit 4 · `--yes` 로만 반영 · 접수 시각 유지 | `modules-intake-from` · `test_intake` |
| HK20B-R8 | 블록 · 속성 표 · 하위 페이지(`--depth`) · 이미지 첨부(서명 주소에 인증 없음) · kindMap · writeBack off/on · 모듈 add/remove | `modules-intake-from` · `modules-hk20b` |
| HK20B-R9 | 출력 · 첨부 · 설정에 토큰이 없음, 인증 헤더는 모의 서버에서 확인 | `modules-jira` · `modules-intake-from` |
| HK20B-R10 | 23곳 합성 fixture: python · TS `--check` 줄 · exit 가 같고 배포 결과 바이트가 같다. `.new` · lock · 거부 | `modules-units` |
| HK20B-R11 | 제공 → 소비 → 상위 순서는 통과하고 `--record` SHA 가 두 도메인 커밋과 같다. 포인터 먼저 · dirty · 브랜치 · 초기화는 실패. `affected` 계획에 바뀐 도메인 하나만 | `test_cross_repo` |
| HK20B-R12 | 가드 위반 목록 · 경고 수준에서 게이트 통과 · 강제에서 실패 · 사유 없는 예외는 위반 | `test_cross_repo` |
| HK20B-R13 | Unit `repo` → 도메인 폴더, 계약 Unit 은 상위, 없는 repo 는 exit 3 | `test_from_unit` |
| HK20B-R14 | notion 규칙 추가 전후 세션 적재량 같음 | `modules-hk20b` |

## 시험 결과 (HK-20b)

| 시험 | 결과 |
|---|---|
| `pnpm -C packages/cli test`(tsc + vitest) | 44 파일 · 509 통과. 전체를 도는 중 부하로 시간 초과(60초)가 난 파일(`dashboard-cli` · `skills-usage` · `modules-jira` · `modules-intake-from`)은 단독 재실행에서 모두 통과 |
| `pnpm -C packages/dashboard test` | 18 파일 · 153 통과(전체 실행 때 `approvals` · `overview` · `projects` 4건이 부하로 시간 초과 — 세 파일 단독 재실행 19 통과) |
| `node scripts/gen-plugins.mjs --check` | 생성물 일치(파일 468개) |
| 킷 python 전체(`unittest discover -s tests`) | 120 통과(`test_multi_harness_module` 의 모듈 시험 83개에 `test_cross_repo.py` 포함) |
| 설치본 시험(`<설치>/scripts/tests`) | 624 통과(새 `test_intake` · `test_from_unit` 항목 포함) |
| 실제 서비스 | 호출하지 않았다(모의 HTTP 서버만). 사람이 확인할 것은 design.md HK-20b §7 |
