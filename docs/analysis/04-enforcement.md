# 04. 강제 레이어 — 단일 게이트·changed 계획·트리거·구조 테스트

킷의 강제는 "1곳 + N트리거"로 설계된다. 스택 검증 로직은 `scripts/verify.sh` 한 곳에만 있고,
에이전트 hook·git hook·CI 는 로직을 복제하지 않고 이 한 곳(또는 그 앞의 changed 계획기)을 **호출만** 한다.

## 1. 단일 게이트 — `scripts/verify.sh`

### 1.1 레벨

`verify.sh` 맨 앞의 진입 블록(`scripts/verify-entry.sh`)이 레벨을 가른다.

| 레벨 | 어떻게 부르나 | 하는 일 |
|---|---|---|
| `changed`(기본) | `bash scripts/verify.sh` · `--files <경로…>` · `--session <세션 ID>` | `scripts/verify-changed.py`로 넘긴다. 바뀐 파일과 세션 점유 파일에 필요한 검사·시험만 고른다. `--plan`은 실행 없이 계획(JSON)만 낸다 |
| `fast` | `--fast` 또는 `HARNESS_VERIFY_LEVEL=fast` | 구조 점검(하네스 검사·exec-plan 상태) + 포맷·린트처럼 빌드 도구를 띄우지 않는 단계 |
| `full` | `--full` 또는 `HARNESS_VERIFY_LEVEL=full`(CI) | 전체 단계 — 타입·구조 테스트·시험·커버리지·조건부 단계 |

changed·fast 통과는 full 통과가 아니다. 결과를 보고할 때 레벨을 함께 적는다.

### 1.2 changed 계획기

`verify-changed.py`(구현 `scripts/harness/verify_*.py`)는 바뀐 파일을 종류별로 나눠 검사를 고른다.

- 하네스 파일(`.agents/`·`scripts/`·에이전트 폴더)이 바뀌면 `check_harness.py`.
- 소스·시험 파일이면 그 스택의 해당 시험(추론이 틀리면 `--tests`로 직접 준다).
- 관련 시험을 하나라도 못 찾으면 미완료로 두고 **명령을 하나도 실행하지 않는다**. `--tests`로 고르거나 full 을 고른다.
- 한 프로젝트에 언어가 섞이면(파이썬 도구 + 사이트 JS) 언어 묶음마다 따로 고른다. 지운 시험 파일은 권고로 남긴다.
- `.agents/verify-checks.json`의 경로 규칙에 걸리면 그 명령. 기본값은 문서·생성기·소스·마이그레이션·OpenAPI 경로 → `python3 tools/docs/feature_docs.py check`.
  `"covers": true`인 규칙은 그 경로의 코드 파일을 관련 시험 대신 책임진다 — 기본값은 사이트 자산(`docs/features/assets/*` → `check --assets`: 복사본 = 원본, 외부 스크립트 = 잠금 sha256)과 생성기 시험 입력(`tools/docs/tests/fixtures/*` → 생성기 시험).
- 다른 세션이 점유한 파일은 빼고, 같은 하네스의 검증이 겹치면 잠금으로 기다린다(`--lock-timeout`).

### 1.3 스택 게이트(full)

스택마다 다른 `verify.sh`가 설치되지만 구조는 같다. 여러 단계의 실패를 모아 한 번에 보고한다.
변형 전용 단계는 파일 존재 감지로 한 스크립트 안에 흡수한다(`manage.py` → Django 점검과 마이그레이션 드리프트,
`evaluation/`·`evals/` + `EVAL_ON_VERIFY=1` → eval 스모크, `scripts/run-guards.sh` → 플랫폼 가드).

| 스택 | 실행 단계 |
|---|---|
| `jvm` | fast 는 구조 점검만 하고 Gradle 을 띄우지 않는다(`HARNESS_VERIFY_FAST_GRADLE=1`이면 `ktlintCheck`). full 은 `./gradlew check`(ktlint·detekt·test·구조 테스트) + 선택 DB 게이트 |
| `python` | `ruff format --check` → `ruff check` → `mypy` → `lint-imports`(레이어 계약) → `pytest`(커버리지 임계). `uv.lock`이 있으면 `uv run` 접두사 |
| `go` | `gofumpt -l`(없으면 `gofmt`) → `go build` → `go vet` → `golangci-lint run`(depguard) → `go test -race`(+ `COVERAGE_MIN`) → 있으면 `govulncheck` |
| `web` · `electron` | `lint`(ESLint — import 경계 규칙) → 타입 → 시험 → 빌드. electron 은 프로세스 경계 가드(`nodeIntegration`·`contextIsolation`·`sandbox`)를 fast 에서 grep 으로 막는다 |

도구가 없어 단계를 건너뛰면 그 사실을 출력한다 — 강제가 조용히 사라지지 않게 하기 위해서다.

## 2. 트리거

### 2.1 에이전트 hook — 본문은 `scripts/hooks/` 한 벌

| hook | 시점 | 하는 일 |
|---|---|---|
| `session-start.sh` | SessionStart | 짧은 하네스 컨텍스트(진입점·규칙 원본·이슈 SDD 위치·협업·검증 레벨)를 붙인다. 하네스 고유 안내는 `.agents/session-context.md` |
| `protect-sources.sh` | PreToolUse(쓰기 도구) | 경로 키 여섯(`file_path`·`notebook_path`·`path`·`targetFile`·`sourcePath`·`destinationPath`)과 Codex 패치 머리줄에서 `PROTECTED_PATH`를 찾으면 exit 2 로 막는다. 이어서 `session-context.py --event pre-tool`이 다른 세션 점유를 확인한다 |
| `verify-gate.sh` | Stop | 세션 ID 로 changed 검증(`verify-changed.py --session … --summary`)을 돌린다. 세션 ID 를 못 찾으면 통과로 치지 않고 직접 검증하라고 알린다 |

Claude(`.claude/settings.json`)·Codex(`.codex/hooks.json`)·Kiro(`.kiro/hooks/*.json`)는 배선만 갖고 같은 파일을 부른다.
Codex·Kiro 배선은 작업 폴더에서 위로 올라가며 `.agents/harness.json`이 있는 가장 가까운 하네스 루트를 찾는다.
Kiro 의 Stop 은 `HARNESS_VERIFY_FAIL_EXIT=1`로 실패를 exit 1 로 돌려준다.

### 2.2 git hook · CI

- `scripts/git-hooks/pre-commit`·`pre-push`: 커밋·push 할 파일로 changed 검증. `bash scripts/install-git-hooks.sh`가 리포 로컬 `core.hooksPath`를 이 폴더로 건다(전역 설정은 건드리지 않는다, 되돌리기 `git config --local --unset core.hooksPath`).
  리포 로컬 값이 사용자 전역 hook 폴더를 가리므로, `global-hook.sh`가 같은 이름의 전역 hook(비밀 값 검사 등)을 찾아 이어 부른다.
- `.github/workflows/verify.yml`(스택별): 런타임·도구를 준비한 뒤 `HARNESS_VERIFY_LEVEL=full bash scripts/verify.sh`.
  CI 가 하는 스택별 일은 도구 준비까지이고 검증 단계는 게이트에만 있다.

### 2.3 Kiro 포인터

`.kiro/steering/*`는 `inclusion` 기반 얇은 포인터로 규칙 원본을 가리킨다(본문 없음). 상세는 [02-architecture.md](02-architecture.md) §4.

## 3. 하네스 검사 — `scripts/check_harness.py`

| 검사 | 실패 예 |
|---|---|
| 필수 파일 · 설정 파싱(JSON·TOML) · Codex 역할 필드 · Kiro hook 형식 | `missing required file` · `Codex role needs developer_instructions` |
| 규칙마다 Kiro 포인터, 스킬마다 Claude·Kiro 포인터, 역할 파일은 `.agents/roles/<역할>.md`를 가리킨다 | `missing Kiro rule pointer` |
| task 파일 위치와 상태 필드가 같고 check·completed 에 미완료 작업이 없다(`--plans-only`) | `state mismatch, expected check, found ['active']` |
| 문서 링크가 하네스 밖으로 나가지 않고 끊기지 않는다 · 코드 블록이 닫힌다 | `broken link` |

검사는 `.agents/harness.json`의 `agents`를 읽어 **고른 에이전트의 파일만** 요구한다. Claude 만 고른 설치에서 `.kiro/`가 없어도 실패하지 않는다.
`scripts/board.sh --check`는 SDD 보드가 파일 위치와 같은지 본다.

## 4. 동시 세션 협업 — `scripts/session-coordination.py`

여러 에이전트(또는 같은 에이전트의 여러 세션)가 한 리포에서 일할 때 파일 점유를 기록한다.

- `register --files …`(실제 세션 ID 로) · `claim` · `release` · `heartbeat` · `status` · `changed-files`
- 공지: `notify` · `inbox` · `acknowledge`. 공지는 참고 데이터이고, 확인 기록은 사용자 승인이 아니다.
- PreToolUse hook(`session-context.py --event pre-tool`)이 다른 세션이 명시적으로 점유한 파일 쓰기를 exit 2 로 막는다. 자기 점유가 만료됐거나 등록표를 읽을 수 없을 때도 막는다.
- Stop hook 의 changed 검증은 다른 세션 파일을 빼고 고른다.

## 5. 레이어 강제 + 구조 테스트 (스택별)

의존 방향 강제는 두 층이다: (a) 방향 자체를 막는 1차 수단, (b) 1차가 못 잡는 규율을 잡는 구조 테스트. 둘 다 full 게이트가 실행한다.

| 스택 | (a) 1차 강제 | (b) 구조 테스트 위치 |
|---|---|---|
| `jvm` | Gradle 모듈 그래프 → 컴파일 실패 | Konsist `…/architecture/ArchitectureTest.kt`(ArchUnit 대안) |
| `python` | `[tool.importlinter]` 계약 → `lint-imports` 실패 | `tests/architecture/test_layer_rules.py`(AST 검사) |
| `go` | `internal/` 가시성·import 사이클 → 컴파일 실패, 방향은 depguard | `internal/architecture_test.go` |
| `web` · `electron` | ESLint import 경계 규칙(`boundaries`·`no-restricted-imports`) | 변형 `structure.md`의 규칙 예시 |

jvm 구조 테스트 예시는 다섯이다 — domain 의 프레임워크 무의존, domain·application 이 primary/infra 를 import 하지 않음,
컨텍스트 간 도메인 모델 직접 import 금지, 컨트롤러 envelope 응답, `*PersistenceAdapter` 이름 규칙.
`ARCHITECTURE.md`의 Anti-pattern 과 대응하고, 위반은 리뷰가 아니라 게이트에서 실패한다.

## 6. 완료 게이트의 기계적 보완

완료 게이트(`active → check → confirm → completed`, [03-sdd-workflow.md](03-sdd-workflow.md) §3)는 사람의 승인을 요구한다.
`check_harness.py --plans-only`는 위치·상태 모순만 잡는다. "사용자가 승인했는가"는 사람 단계라 스크립트가 강제하지 못한다.
`check-spec-freshness.sh`는 게이트가 아니라 리포트다(항상 exit 0). 정체된 draft·미해결 마커·정체된 active tasks 를 알려 `/hx-converge` 근거로 쓴다.
기능 문서 생성기가 있으면 S7 의 `feature_docs.py check`(원고 절·작성 전 표시·미배정·원본 변경·생성물 불일치·끊긴 링크)가 check 로 옮기기 전 조건이다.

## 7. 권한 모드와 보호 경로

- `.claude/settings.json`: `defaultMode: "acceptEdits"`, `permissions.deny`에 `Edit(//**/{{PROTECTED_PATH}}/**)`.
  `bypassPermissions`는 권한 프롬프트를 모두 끈다 — PreToolUse 안전장치는 남지만 위험 도구까지 프롬프트 없이 돈다. 격리된 환경에서만 올린다.
- 보호 경로는 hook(exit 2)과 deny 가 이중으로 막는다. 셸 명령 안의 경로는 보지 않는다(hook 의 한계).

## 8. 강제 레이어 요약

| 무엇을 막나 | 어디서 |
|---|---|
| 의존 방향 위반 | jvm=모듈 그래프 · python=import-linter · go=`internal`+depguard · web·electron=ESLint 경계 |
| 패키지 규율·이름·응답 형식 | 스택별 구조 테스트(§5) |
| 빌드·린트·타입·시험·커버리지 | `verify.sh` full(§1.3) |
| 바뀐 파일에 필요한 검사 누락 | changed 계획기 + `verify-checks.json`(§1.2) |
| 하네스 파일 누락·포인터 어긋남·task 상태 모순 | `check_harness.py`(§3) |
| SDD 보드 손편집 | `board.sh --check` |
| 기능 문서와 코드 어긋남 | `feature_docs.py check`(S7) |
| 보호 경로 편집 | `protect-sources.sh` hook + `settings.json` deny |
| 다른 세션 파일 덮어쓰기 | `session-coordination.py` 점유 + PreToolUse 차단(§4) |
| 작업 자동완료 | 사용자 승인 게이트(사람 단계) |
| 세션마다 컨텍스트 누락 | `session-start.sh` hook |
