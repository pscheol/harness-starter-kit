# harness-starter-kit 분석

`harness-starter-kit/`(이하 "킷")의 **현행 v1 구조**를 self-contained로 정리한 분석 문서 묶음이다.
킷은 백엔드 단일 프로젝트(**JVM · Python · Go** 중 선택)를 위한 **에이전트 하네스 스타터**로, 하나의
`setup.sh` 실행으로 규칙 정본·SDD 워크플로·검증 게이트·에이전트 배선을 대상 리포에 설치한다.

## 한눈 결론

킷이 설치하는 하네스는 네 개의 축으로 요약된다.

| 축 | 실체 | 핵심 원리 |
|---|---|---|
| **규칙 정본** | `.agents/rules/*.md` 11종 (공통 3 + 스택별 6 + 변형별 2) | 규칙 본문은 한 곳(정본)에만. 세 에이전트가 공유 |
| **기록/SDD** | `.agents/docs/` (제품 단위 `product-<slug>-specs/`) | "컨텍스트에서 안 보이면 존재하지 않는다" — 스펙이 정본, 코드는 산출물 |
| **강제 게이트** | `scripts/verify.sh` 한 곳 | 강제 로직은 1곳, 트리거(훅·CI·pre-commit)는 N개가 이 한 곳만 호출 |
| **에이전트 배선** | `.claude/` · `.codex/` · `.kiro/steering/` | 진입 파일은 목차, 상세는 정본으로 유도. 규칙 중복 금지 |

관통하는 설계 명제:

1. **1곳 + N트리거** — 강제 로직은 `scripts/verify.sh` 하나, 나머지는 얇은 트리거.
2. **정본 단일화** — 규칙은 `.agents/rules/`, 아키텍처는 `ARCHITECTURE.md`, 기록은 `.agents/docs/`.
3. **세 에이전트 규칙 공유** — Claude Code · Codex · Kiro가 동일 정본을 참조(각자 얇은 진입점 경유).
4. **기계적 강제 우선** — 의존 방향을 문서 약속이 아니라 도구가 막는다. 수단은 **스택마다** 다르고(JVM=Gradle 모듈 그래프(컴파일 실패)·ArchUnit·Spring Modulith, Python=import-linter 계약+mypy strict, Go=`internal/` 가시성·import 사이클(컴파일 실패)+depguard), 계약의 내용은 **아키텍처 변형마다** 또 다르다.
5. **완료는 사람이 확정** — `active → check → (사용자 승인) → completed` 게이트. verify.sh 통과는 필요조건일 뿐.

## 문서 색인

| 문서 | 다루는 것 |
|---|---|
| [01-overview.md](01-overview.md) | 목적·구성·설계 원칙(1곳+N트리거, self-contained 불변식, 3에이전트 공유, 스택 오버레이) |
| [02-architecture.md](02-architecture.md) | `setup.sh` 설치 매핑(공통+스택+변형 3루트, 7 세그먼트)·아키텍처 변형과 계층 모델·규칙 정본 11종·Kiro 포인터·치환 토큰표 |
| [03-sdd-workflow.md](03-sdd-workflow.md) | 7 명령 + `/hx-converge`·SDD 산출 위치·완료 게이트·스크립트·템플릿 강제 장치 (스택 무관) |
| [04-enforcement.md](04-enforcement.md) | 단일 게이트 `verify.sh`(스택별 단계)·N트리거(훅3·CI·pre-commit·kiro)·구조 테스트·settings·protect-sources |

## 지원 스택 (STACK=…)

| STACK | 언어/프레임워크 | 구조 | 레이어 강제(기계) | 게이트 |
|---|---|---|---|---|
| `jvm`(기본) | Kotlin/Java + Spring Boot, JDK LTS, Gradle(Maven 대안) | 멀티모듈 | Gradle 모듈 그래프 + Konsist | `./gradlew check` |
| `python` | Python 3.12+ + FastAPI(ASGI) 또는 Django, SQLAlchemy 2.0, uv | src 레이아웃(django 변형은 루트) | import-linter 계약 + mypy strict | ruff→mypy→lint-imports→pytest |
| `go` | Go 1.22+ + net/http, pgx, log/slog | 표준 Go 레이아웃 | `internal/`·import 사이클 + depguard | fmt→build→vet→lint→test -race |

공통 전제(스택·변형 무관): DDD + TDD, 관계형 DB(PostgreSQL/MySQL 등), 권한은 요청 경계와 유스케이스 두 곳에서 확인,
비즈니스 규칙은 안쪽·오케스트레이션은 바깥·트랜잭션 경계는 한 곳·생성자 주입·경계에서 파싱.

## 아키텍처 변형 (ARCH=…, 기본 `hexagonal`)

| STACK | 사용 가능한 ARCH |
|---|---|
| `jvm` | `hexagonal` · `multimodule`(이상 멀티모듈) · `layered` · `modulith` · `feature`(이상 단일 모듈) |
| `python` | `hexagonal` · `layered` · `modular` · `django` · `ai-service` |
| `go` | `hexagonal` · `layered` · `feature` · `flat` |

변형이 바꾸는 파일은 **4개뿐**(`ARCHITECTURE.md`·`.agents/rules/structure.md`·`.agents/rules/tech.md`·`.kiro/steering/structure.md`)이라
조합이 늘어도 설치 파일 수는 104개로 불변이다. 각 변형 문서에는 **선택 기준·승격 신호·전환 절차**가 함께 들어 있다.

## 읽는 순서

처음이면 `01 → 02 → 03 → 04` 순서를 권장한다. 특정 관심사만 볼 경우:
설치·모듈 구조는 `02`, 스펙 작성 절차는 `03`, "무엇이 자동으로 막히는가"는 `04`.

> 이 묶음은 **현행 킷을 있는 그대로** 기술한다. 계획·로드맵이 아니라 "지금 킷이 무엇인지"의 스냅샷이다.
