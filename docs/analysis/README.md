# harness-starter-kit 분석

> **킷을 고칠 때 보는 문서다.** 킷을 *쓰는* 방법(설치·아키텍처 선택·JVM 세팅)은 [../guides/](../guides/) 에 있다.


`harness-starter-kit/`(이하 "킷")의 현행 v1 구조를 다른 문서 없이도 읽을 수 있게 정리한 묶음이다.
킷은 단일 프로젝트(JVM · Python · Go · Web · Electron 중 선택)를 위한 에이전트 하네스 스타터로,
`setup.sh` 한 번으로 규칙 원본, SDD 워크플로, 검증 게이트, 에이전트 배선을 대상 리포에 설치한다.

## 요약

킷이 설치하는 하네스는 네 개의 축으로 나눠 볼 수 있다.

| 축 | 실체 | 요지 |
|---|---|---|
| 규칙 원본 | `.agents/rules/*.md` 12종 (공통 4 + 스택별 6 + 변형별 2) | 규칙 본문은 한 곳에만. 세 에이전트가 공유 |
| 기록/SDD | `.agents/docs/` (제품 단위 `<slug>-specs/`) | 컨텍스트에 들어오지 않은 내용은 에이전트에게 없는 것과 같다. 스펙이 기준이고 코드가 결과물 |
| 강제 게이트 | `scripts/verify.sh` 한 곳 | 강제 로직은 1곳, 트리거(훅·CI·pre-commit)는 N개가 이 한 곳만 호출 |
| 에이전트 배선 | `.claude/` · `.codex/` · `.kiro/steering/` | 진입 파일은 목차, 상세는 원본으로 유도. 규칙 중복 금지 |

전체에 깔려 있는 설계 원칙은 다섯 가지다.

1. 1곳 + N트리거 — 강제 로직은 `scripts/verify.sh` 하나, 나머지는 얇은 트리거다.
2. 원본은 한 곳 — 규칙은 `.agents/rules/`, 아키텍처는 `ARCHITECTURE.md`, 기록은 `.agents/docs/`.
3. 세 에이전트가 규칙을 공유 — Claude Code · Codex · Kiro가 같은 원본을 각자의 얇은 진입점을 거쳐 참조한다.
4. 기계적 강제 우선 — 의존 방향을 문서 약속이 아니라 도구가 막는다. 수단은 스택마다 다르고
   (JVM은 Gradle 모듈 그래프로 컴파일 실패, ArchUnit, Spring Modulith / Python은 import-linter 계약과 mypy strict /
   Go는 `internal/` 가시성과 import 사이클로 컴파일 실패, depguard), 계약의 내용은 아키텍처 변형마다 또 달라진다.
5. 완료는 사람이 확정 — `active → check → (사용자 승인) → completed` 게이트를 거친다.
   verify.sh 통과는 필요조건일 뿐이다.

## 문서 색인

| 문서 | 다루는 것 |
|---|---|
| [01-overview.md](01-overview.md) | 목적·구성·설계 원칙(1곳+N트리거, 자기완결 원칙, 3에이전트 공유, 스택 오버레이) |
| [02-architecture.md](02-architecture.md) | `setup.sh` 설치 매핑(공통+스택+변형 3루트, 7 세그먼트)·아키텍처 변형과 계층 모델·규칙 원본 12종·Kiro 포인터·치환 토큰표 |
| [03-sdd-workflow.md](03-sdd-workflow.md) | 7 명령 + `/hx-converge`·SDD 문서 위치·완료 게이트·스크립트·템플릿 강제 장치 (스택 무관) |
| [04-enforcement.md](04-enforcement.md) | 단일 게이트 `verify.sh`(스택별 단계)·N트리거(훅3·CI·pre-commit·kiro)·구조 테스트·settings·protect-sources |

## 지원 스택 (STACK=…)

| STACK | 언어/프레임워크 | 구조 | 레이어 강제(기계) | 게이트 |
|---|---|---|---|---|
| `jvm`(기본) | Kotlin/Java + Spring Boot, JDK LTS, Gradle(Maven 대안) | 멀티모듈 | Gradle 모듈 그래프 + Konsist | `./gradlew check` |
| `python` | Python 3.12+ + FastAPI(ASGI) 또는 Django, SQLAlchemy 2.0, uv | src 레이아웃(django 변형은 루트) | import-linter 계약 + mypy strict | ruff→mypy→lint-imports→pytest |
| `go` | Go 1.22+ + net/http, pgx, log/slog | 표준 Go 레이아웃 | `internal/`·import 사이클 + depguard | fmt→build→vet→lint→test -race |
| `web` | TypeScript strict + React (Next.js/Vite) | 변형별 | **컴파일 강제 없음** — `strict` + ESLint import 경계 | fmt→lint→typecheck→가드→test→build |
| `electron` | TypeScript strict + Electron | `src/{main,preload,renderer,shared}` 또는 워크스페이스 | 위 + 프로세스 권한 경계(게이트가 grep 차단) | 위 + 프로세스 경계 가드(`fast`) |

백엔드 3종은 스택과 변형에 관계없이 공통 전제를 깔고 간다. DDD와 TDD, 관계형 DB(PostgreSQL/MySQL 등),
권한은 요청 경계와 유스케이스 두 곳에서 확인, 비즈니스 규칙은 안쪽에 오케스트레이션은 바깥에,
트랜잭션 경계는 한 곳에, 생성자 주입, 경계에서 파싱.

`web`·`electron` 은 `frontend` **도메인 레이어**를 공유한다(디자인 시스템·접근성·UI 상태·성능 4종).
백엔드 3종에는 도메인 레이어가 없다 — 규칙이 이미 언어별이라 스택 레이어가 그 역할을 한다.

## 아키텍처 변형 (ARCH=…)

기본값은 스택마다 다르다 — 백엔드 3종 `hexagonal` · `web` `nextjs-app` · `electron` `main-renderer`.

| STACK | 사용 가능한 ARCH |
|---|---|
| `jvm` | `hexagonal` · `hexagonal-nested` · `hexagonal-standalone` · `layered-multimodule` · `multimodule`(이상 멀티모듈) · `layered` · `modulith` · `feature`(이상 단일 모듈) |
| `python` | `hexagonal` · `layered` · `modular` · `django` · `ai-service` |
| `go` | `hexagonal` · `layered` · `feature` · `flat` |
| `web` | `nextjs-app` · `react-spa` · `feature-sliced` |
| `electron` | `main-renderer` · `feature` · `monorepo` |

변형이 바꾸는 파일은 네 개뿐이다(`ARCHITECTURE.md`, `.agents/rules/structure.md`,
`.agents/rules/tech.md`, `.kiro/steering/structure.md`). 그래서 조합이 늘어도 설치 파일 수는 달라지지 않는다(실제 수는 스택군과 고른 에이전트에 달렸다 — 백엔드 core 42 · 프론트엔드 core 46 + 선택분).
각 변형 문서에는 선택 기준, 승격 신호, 전환 절차가 함께 들어 있다.

## 선택 모듈 (`--modules=`, 기본 `none`)

| 모듈 | 무엇을 넣나 |
|---|---|
| `jira-workflow` | 이슈 트래커 연동 — 한 세션 = 한 활성 티켓 · pull gate · **ID 로 전이** · 에이전트는 In Review 까지 |
| `platform-guards` | 프로젝트 고유 불변식을 **문서 → 경고 가드 → 강제 가드** 3단으로 승격시키는 실행기 |

## 읽는 순서

처음이면 `01 → 02 → 03 → 04` 순서를 권한다. 특정 관심사만 볼 거라면 설치와 모듈 구조는 `02`,
스펙 작성 절차는 `03`, 무엇이 자동으로 막히는지는 `04`를 보면 된다.

> 이 묶음은 현행 킷을 있는 그대로 기술한다. 계획이나 로드맵이 아니라 지금 킷이 어떤 상태인지에 대한 스냅샷이다.
