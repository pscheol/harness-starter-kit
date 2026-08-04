# 04. 강제 레이어 — 단일 게이트·N트리거·구조 테스트

킷의 강제는 "1곳 + N트리거"로 설계된다. 강제 로직은 `scripts/verify.sh` 한 곳에만 있고,
나머지 접점(에이전트 훅·CI·pre-commit)은 로직을 복제하지 않고 이 한 곳을 **호출만** 한다.

## 1. 단일 게이트 — `scripts/verify.sh`

훅·CI·pre-commit이 전부 이 하나를 호출한다. 여러 단계 실패를 한 번에 보고하도록 실패를 누적한다.
아키텍처 변형마다 파일을 나누지는 않는다. 변형 전용 단계는 **파일 존재 감지 기반 선택 실행**으로
한 스크립트 안에 흡수한다 — `manage.py`가 있으면 Django 점검 + `makemigrations --check`(마이그레이션 드리프트),
`evaluation/`·`evals/`가 있고 `EVAL_ON_VERIFY=1`이면 eval 스모크(기본은 비활성 — 비용·비결정성 때문에 nightly 권장).
아키텍처 변형마다 파일을 나누지는 않는다. 변형 전용 단계는 **파일 존재 감지 기반 선택 실행**으로
한 스크립트 안에 흡수한다 — `manage.py`가 있으면 Django 점검 + `makemigrations --check`(마이그레이션 드리프트),
`evaluation/`·`evals/`가 있고 `EVAL_ON_VERIFY=1`이면 eval 스모크(기본은 비활성 — 비용·비결정성 때문에 nightly 권장).
**스택마다 다른 파일이 설치**되지만(스택별 `verify.sh`), 구조는 같다: 1단계는 스택 무관 검사, 2단계는
스택 게이트, 마지막은 선택적 DB 게이트.

1. `bash scripts/check-exec-plan-status.sh` — exec-plan 위치↔상태 일관성 검사(스택 무관, **항상**).
2. **스택 게이트**:

   | 스택 | 실행 단계 |
   |---|---|
   | `jvm` | `( cd "$GRADLE_DIR" && ./gradlew check --no-daemon -q )` — ktlint·detekt·test·구조 테스트. 기본 `GRADLE_DIR="."` |
   | `python` | `ruff format --check` → `ruff check` → `mypy src tests` → `lint-imports`(레이어 계약) → `pytest`(커버리지 임계). `uv.lock`이 있으면 `uv run` 접두사를 자동 사용 |
   | `go` | `gofumpt -l`(없으면 `gofmt` 폴백) → `go build ./...` → `go vet ./...` → `golangci-lint run`(depguard 포함) → `go test -race -covermode=atomic`(+ 커버리지 임계 `COVERAGE_MIN`, 기본 80) → 설치돼 있으면 `govulncheck` |

3. **(선택) DB 게이트** — `scripts/db-migrate.sh`·`scripts/db-test.sh`가 둘 다 존재할 때만 실행(없으면 자동 skip. jvm은 `db/migrations`가 비어있지 않을 것도 함께 요구).

실패가 누적되면 `exit 1`, 아니면 `exit 0`.
python·go 게이트는 도구 미설치 시 그 단계를 건너뛰거나(golangci-lint·govulncheck) 폴백(gofumpt→gofmt)하되,
건너뛴 사실을 stdout에 알린다 — **강제가 조용히 사라지지 않게** 하기 위해서다.

## 2. N트리거

같은 게이트를 여러 접점에서 부르되, 로직은 복제하지 않는다.

### 2.1 에이전트 훅 3종 (Claude · Codex 바이트 동일)

| 훅 | 시점 | 하는 일 |
|---|---|---|
| `session-start.sh` | SessionStart | 하네스 컨텍스트를 stdout으로 주입 — 진입점(AGENTS.md)·규칙 원본·SDD SSOT·ARCHITECTURE·가드레일·verify.sh 안내 |
| `protect-sources.sh` | PreToolUse(`Write\|Edit\|MultiEdit`) | 편집 대상 `file_path`가 `PROTECTED_PATH`(기본 `docs/references`)면 **exit 2 + stderr로 차단** |
| `verify.sh` | Stop | 얇은 트리거 — `scripts/verify.sh`가 있으면 `exec bash scripts/verify.sh`, 없으면 no-op(exit 0) |

세 훅은 Claude용(`.claude/hooks/`)과 Codex용(`.codex/hooks/`)이 **바이트 동일**(MD5 3쌍 일치)하다.
배선만 다르다:

- Claude `settings.json`: SessionStart / PreToolUse(`Write|Edit|MultiEdit`) / Stop을 `$CLAUDE_PROJECT_DIR` **절대경로**로 연결.
- Codex `hooks.json`: 동일한 3-hook 매핑을 `.codex/hooks/` **상대경로**로 연결. (경로 차이만 존재 — hooks.json `_comment`에 명시된 의도적 차이.)

### 2.2 CI · pre-commit

- `root/.github/workflows/verify.yml`(**스택별**): push/PR에서 런타임·도구를 준비한 뒤 `bash scripts/verify.sh` 실행.
  - `jvm` — `setup-java`(예시 JDK 21) + `gradle/actions/setup-gradle`.
  - `python` — `setup-python`(예시 3.12) + `astral-sh/setup-uv`(캐시) + `uv sync --frozen`(잠금 파일 동결 설치).
  - `go` — `setup-go`(예시 1.22, 캐시) + `gofumpt`·`govulncheck` 설치 + `golangci-lint-action`(설치만, 실행은 verify.sh가 담당).
- `root/.pre-commit-config.yaml`(**공통**): 로컬 hook(기본 pre-push), `entry: bash scripts/verify.sh`.

셋 다 로직 복제가 0이고 `verify.sh` 한 곳만 호출한다. CI가 하는 스택별 작업은 **런타임/도구 준비까지**이며
검증 단계 자체는 게이트에만 있다.

### 2.3 Kiro 포인터

`.kiro/steering/*`는 `inclusion` 기반 얇은 포인터로, 원본과 verify.sh를 가리킨다(규칙 본문 없음).
상세는 [02-architecture.md](02-architecture.md) §4.

## 3. 레이어 강제 + 구조 테스트 (스택별)

의존 방향 강제는 **두 층**으로 되어 있다: (a) 방향 자체를 막는 1차 수단, (b) 1차가 못 잡는 규율을
잡는 구조 테스트. 어느 스택이든 (a)·(b) 모두 `scripts/verify.sh`가 실행한다.

| 스택 | (a) 1차 강제 | (b) 구조 테스트 위치 |
|---|---|---|
| `jvm` | Gradle 모듈 그래프 → **컴파일 실패** | Konsist `…/architecture/ArchitectureTest.kt`(bootstrap 테스트 소스셋). ArchUnit이 대안 |
| `python` | `[tool.importlinter]` 계약 → `lint-imports` 실패 | `tests/architecture/test_layer_rules.py`(AST 검사) |
| `go` | `internal/` 가시성·import 사이클 → **컴파일 실패**, 방향은 depguard → 린트 실패 | `internal/architecture_test.go` |

1차 강제가 못 잡는 것은 세 스택 모두 비슷하다 — 같은 패키지 안의 규율(도메인이 프레임워크 베이스를
상속/어노테이션 참조), 네이밍 규약, 어댑터의 커밋 호출, 핸들러가 도메인 모델을 그대로 반환하는 것.

### 3.1 jvm — Konsist `ArchitectureTest`의 5개 테스트

1. `domain 은 프레임워크(Spring/JPA)에 무의존이다` — `..domain..` import에 `org.springframework`/`jakarta.persistence`/`javax.persistence` 시작 금지.
2. `domain·application 은 primary/infra 를 import 하지 않는다` — `..domain..`·`..application..` import에 `.primary.`/`.infra.` 포함 금지.
3. `컨텍스트 간 도메인 모델을 직접 import 하지 않는다` — 자기 컨텍스트 외의 `.<ctx>.domain.` import 금지(공개 계약/이벤트 경유).
4. `컨트롤러는 envelope 로 응답한다` — 이름이 `Controller`로 끝나는 클래스 함수 returnType이 `ResponseEntity`로 시작 금지.
5. `infra 어댑터 네이밍: *PersistenceAdapter` — `..infra.persistence..`의 `@Component`/`@Repository` 클래스는 이름이 `PersistenceAdapter` 또는 `Mapper`로 끝나야 함.

이는 `ARCHITECTURE.md`의 Anti-pattern(코드리뷰 즉시 차단 목록)과 대응한다 — "위반을
`./gradlew check`에서 실패로"(리뷰가 아니라 게이트).

### 3.2 python · go — 구조 테스트 예시

킷은 각 스택 `structure.md`에 스켈레톤을 담아두고, 프로젝트가 규칙을 늘려 쓰게 한다.

- `python`(`tests/architecture/test_layer_rules.py`) — AST로 검사: (1) 도메인 클래스가 `BaseModel`·
  `DeclarativeBase`를 상속하지 않는다, (2) `*/infra/**`에 `.commit()` 호출이 없다(트랜잭션 경계는 유스케이스 소유).
- `go`(`internal/architecture_test.go`) — 소스 스캔으로 검사: `*/infra/**`에 `.Commit(` 호출이 없다.

두 스택 모두 계약 린터(import-linter/depguard)가 import 방향을, **구조 테스트가 그 밖의 규율**을
맡는 분담이며, 실패는 `scripts/verify.sh`에서 그대로 게이트 실패가 된다.

## 4. 완료 게이트의 기계적 보완

작업 완료 게이트(`active → check → confirm → completed`, [03-sdd-workflow.md](03-sdd-workflow.md) §3)는
사람의 승인을 요구한다. `scripts/check-exec-plan-status.sh`가 폴더↔상태 일관성을 검사(active/→active,
check/→check, completed/→completed)해 **위치/상태 모순만** 기계적으로 잡는다. "사용자 승인 여부"
자체는 사람 단계라 스크립트가 강제하지 못한다 — verify.sh 통과는 완료의 필요조건일 뿐이다.

`check-spec-freshness.sh`는 게이트가 아니라 리포트다(**항상 exit 0**). 정체된 draft/in-review 스펙,
미해결 `[NEEDS CLARIFICATION:]` 마커(콜론 형식만, `_template`·백틱 예시 제외로 스캐폴딩 오탐 제거),
정체 active tasks를 알려 `/hx-converge` 회수의 근거로 쓴다.

## 5. 권한 모드 (`settings.json`)

- `defaultMode: "acceptEdits"` — 편집은 자동 승인, 그 외 도구는 프롬프트.
- `permissions.deny`: `Edit({{PROTECTED_PATH}}/)`, `Write({{PROTECTED_PATH}}/)`.
- `_comment_defaultMode` 경고: `bypassPermissions`는 모든 권한 프롬프트를 끈다. protect-sources 같은 PreToolUse 안전장치는 남지만 권한 게이트가 사라져 위험 도구(임의 쉘·삭제)까지 무프롬프트로 실행된다. 완전 신뢰·격리 환경(컨테이너/전용 워크트리)에서만 상향하고, 낮추려면 `default`로.

## 6. 소스 보호 (`protect-sources.sh`)

편집·쓰기 도구(`Write`/`Edit`/`MultiEdit`)의 대상 경로가 `PROTECTED_PATH`(치환값, 기본
`docs/references`)를 가리키면 훅이 **exit 2**로 차단하고 stderr로 사유를 알린다. 외부 참고/원본
경로를 에이전트가 실수로 덮어쓰는 것을 막는다. 일반 문서 편집은 허용된다. 훅 차단과 별개로
`settings.json`의 `permissions.deny`가 같은 경로를 이중으로 막는다.

## 7. 강제 레이어 요약

| 무엇을 막나 | 어디서 |
|---|---|
| 의존 방향 위반 | jvm=Gradle 모듈 그래프(컴파일 실패) · python=import-linter 계약 · go=`internal`·import 사이클(컴파일 실패)+depguard |
| 패키지 규율·네이밍·응답 형식·컨텍스트 간 import | 스택별 구조 테스트(§3) — Konsist / `tests/architecture` / `architecture_test.go` |
| 타입 계약 위반 | python=`mypy --strict` · go=컴파일러 · jvm=컴파일러(+ Kotlin null 안전성) |
| 빌드·린트·테스트·커버리지 | `verify.sh` → 스택 게이트(§1) |
| exec-plan 위치↔상태 모순 | `check-exec-plan-status.sh`(verify.sh 경유) |
| 보호 경로 편집 | `protect-sources.sh` 훅 + `settings.json` deny |
| 작업 자동완료 | 사용자 승인 게이트(사람 단계, 스크립트 밖) |
| 세션마다 컨텍스트 누락 | `session-start.sh` 훅 |

모든 자동 강제는 결국 `scripts/verify.sh` 한 곳으로 수렴하고, 훅·CI·pre-commit은 그 한 곳을 부르는
트리거일 뿐이다 — 이것이 "1곳 + N트리거"의 실체다.
