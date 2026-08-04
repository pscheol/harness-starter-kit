# 01. 개요 — 목적·구성·설계 원칙

## 1. 킷은 무엇인가

harness-starter-kit는 **백엔드 단일 프로젝트**를 위한 에이전트 하네스 스타터다. 대상 스택은
**`jvm`(Kotlin/Java + Spring) · `python`(FastAPI/ASGI) · `go`(표준 Go 레이아웃)** 중에서 고른다.
대상 리포에 `setup.sh`를 한 번 실행하면, AI 에이전트가 일관되고 안전하게 작업하도록
만드는 네 가지 골격 — 규칙 정본, 기록/SDD 시스템, 검증 게이트, 에이전트 배선 — 을 설치한다.

"하나의 리포 = 하나의 하네스"라는 **단일 프로젝트 하네스**를 전제로 한다. 루트↔서비스 2계층이나
서비스별 자족 하네스를 두지 않는다(YAGNI). 멀티 서비스가 필요해지면 그때 분할한다.

킷 자체의 최상위 구성:

```text
harness-starter-kit/
├── setup.sh          # 설치기: common + stacks/<STACK> 을 대상 리포로 복사 + 토큰 치환
├── manifest.md       # 파일→역할 매핑 · 치환 토큰표 · 경로 매핑 · 공통/스택 분리표
├── README.md         # 킷 사용법
├── SKILL.md          # 부트스트랩 스킬(설치 절차를 에이전트가 재사용)
└── templates/
    ├── common/       # 스택 무관 골격 (51개) — SDD·에이전트 배선·공통 규칙 3종
    └── stacks/       # 스택 오버레이 (각 13개 + arch/<변형>/ 4개) — jvm · python · go
```

**스택 오버레이**가 v3의 핵심이다. 하네스 골격(SDD 기록 시스템·게이트 구조·3에이전트 배선)은 언어와
무관하므로 한 벌만 두고, 언어에 따라 실제로 달라지는 것 — 아키텍처·디렉터리 레이아웃·주석 표준·
보안 위험·동시성 함정·검증 명령 — 만 스택별로 갈아 끼운다.

`templates/` 내부 구조와 설치 매핑은 [02-architecture.md](02-architecture.md)에서 다룬다.

## 2. 네 개의 축

| 축 | 설치 후 위치 | 요지 |
|---|---|---|
| 규칙 정본 | `.agents/rules/*.md` (11종 = 공통 3 + 스택별 6 + 변형별 2) | 세 에이전트가 공유하는 규칙 본문의 단일 소스 |
| 기록/SDD(SSOT) | `.agents/docs/` | 스펙·설계·작업·결정의 단일 진실 소스. 제품 단위 묶음 |
| 검증 게이트 | `scripts/verify.sh` | 강제 로직이 모이는 유일한 지점(스택별 빌드·린트·타입·테스트를 묶음) |
| 에이전트 배선 | `.claude/` · `.codex/` · `.kiro/steering/` | 각 에이전트의 진입점·트리거(얇은 포인터) |

아키텍처의 정본은 `ARCHITECTURE.md`(루트), 규칙의 정본은 `.agents/rules/`, 기록의 정본은
`.agents/docs/`다. 진입 파일(`AGENTS.md`·`CLAUDE.md`·Kiro steering)은 **목차이지 백과사전이 아니다** —
상세를 복제하지 않고 정본으로 유도만 한다.

## 3. 설계 원칙

### 3.1 1곳 + N트리거

강제 로직은 **`scripts/verify.sh` 한 곳**에만 둔다. 그 외의 강제 접점 — 에이전트 훅, CI 워크플로,
pre-commit — 은 로직을 복제하지 않고 이 한 곳을 **호출만** 하는 얇은 트리거다.

- 정본 강제(이식 가능): `scripts/verify.sh` = exec-plan 일관성 검사(스택 무관) + 스택 게이트 + (선택) DB 통합·구조 테스트.
  스택 게이트는 jvm=`./gradlew check`, python=`ruff→mypy→lint-imports→pytest`, go=`fmt→build→vet→golangci-lint→test -race`.
- 에이전트별 가속기: Claude 훅·Codex config·Kiro 훅은 로직 없이 트리거만.

이 원칙 덕분에 검증 기준이 에이전트마다 갈라지지 않고, 규칙을 바꿀 때 한 곳만 고치면 된다.
자세한 강제 레이어는 [04-enforcement.md](04-enforcement.md).

### 3.2 정본 단일화 (규칙은 한 곳)

규칙 본문은 어느 에이전트도 소유하지 않는다. 정본은 `.agents/rules/` 한 곳이고, 진입 파일은
그리로 유도한다. 규칙을 바꾸는 절차도 이 원칙을 강제한다:

1. `.agents/rules/` **정본을 먼저** 수정한다.
2. `AGENTS.md`·`CLAUDE.md`·`.kiro/steering/*` 얇은 포인터를 동기화한다(복제 금지).
3. 진입 파일은 짧게 유지한다.
4. 기능 설계/계획이면 `.agents/docs/`에 기록한다.

### 3.3 세 에이전트 규칙 공유

Claude Code · Codex · Kiro 세 에이전트가 **같은 정본**을 참조한다. 진입 경로만 다르다.

| 에이전트 | 진입점 | 정본 접근 |
|---|---|---|
| Claude Code | `CLAUDE.md` → `AGENTS.md` 위임 | `.agents/rules/*` 직접 |
| Codex | `AGENTS.md` + `.codex/config.toml` | `.agents/rules/*` 직접 |
| Kiro | `.kiro/steering/*.md`(얇은 포인터, `inclusion: always`) | 포인터가 정본으로 유도 |

어느 에이전트도 `.agents/rules/` 전체 자동 주입을 가정하지 않는다. 최소 기준은
`.agents/rules/guardrails.md`이며, 필요한 파일을 직접 연다.

### 3.4 기계적 강제 우선

클린 아키텍처(헥사고날)+DDD의 의존 방향을 **문서상 약속이 아니라 도구**로 강제한다. 잘못된 방향으로
의존하면 코드리뷰가 아니라 **게이트가 실패**한다. 수단은 스택마다 다르다:

| 스택 | 1차 강제 | 보완 |
|---|---|---|
| `jvm` | Gradle 모듈 의존 그래프 → **컴파일 실패** | Konsist 구조 테스트(패키지 규율·네이밍·응답 형식) |
| `python` | **import-linter 계약**(layers·forbidden·independence) → `lint-imports` 실패 | mypy strict + `tests/architecture/` 보조 테스트 |
| `go` | `internal/` 가시성·import 사이클 → **컴파일 실패** | **depguard** 규칙(레이어 방향) + 구조 테스트 |

컴파일러가 레이어를 막아주지 않는 언어(Python)에서는 **린터 계약이 컴파일 강제를 대신한다**.
어느 스택이든 새 바운디드 컨텍스트·모듈·앱·기능을 추가하면 **강제 설정에도 등록**해야 한다(등록 누락 = 강제 누락).

**강제의 형태는 아키텍처 변형에 따라 또 달라진다.** 스택 안에서 변형을 고르면(`ARCH=…`) 계약도 함께 바뀐다:
`layered`는 레이어 단방향 + 건너뛰기 금지, `modular`·`feature`는 기능 단위 `independence`,
`modulith`(jvm)는 모듈 순환·internal 접근·허용 의존을 `ApplicationModules.verify()`로,
`django`는 쓰기(services)/읽기(selectors) 형제 분리 + 앱 간 독립, `ai-service`는 프로바이더 SDK 격리 + eval 회귀 게이트,
`flat`은 최소 규칙 + 파일 수 상한 감시(승격 신호)다. `multimodule`(jvm)은 분할 축을 프로젝트가 고르되 **등급(실행→구성→공유) 단방향을 모듈 그래프로, 타입 누출을 구조 테스트로** 강제한다.
**JVM 단일 모듈 변형(`layered`·`feature`)에서는 ArchUnit 구조 테스트가 컴파일 강제를 대신한다.**
상세는 각 변형의 `ARCHITECTURE.md`.
상세는 [02-architecture.md](02-architecture.md)·[04-enforcement.md](04-enforcement.md).

### 3.5 완료는 사람이 확정한다

작업 완료는 자동 판정하지 않는다. `active → check → (사용자 승인) → completed`의 게이트를 거친다.
DoD와 `verify.sh` 통과는 완료의 **필요조건일 뿐 충분조건이 아니다** — 최종 승인은 사람이 한다.
상세는 [03-sdd-workflow.md](03-sdd-workflow.md).

### 3.6 추측 금지

모든 작업의 최소 기준(`guardrails.md`)은 "추측하지 말 것"이다. 파일·함수·스키마는 실제로 읽고
말하고, 빌드 도구·버전은 설정 파일에서 확인하며, 모르면 "모른다/확인 필요"를 명시한다. 검증한
사실과 미확인 가정을 구분한다. SDD 템플릿의 `[NEEDS CLARIFICATION]` 마커가 이 규율의 산물이다.

## 4. self-contained 불변식

킷은 항상 **self-contained**여야 한다. 규칙·워크플로·템플릿의 내용은 전부 킷 안에 인라인으로
존재하며, 외부 방법론의 고유명이나 외부 참조 경로에 의존하지 않는다. 이 분석 문서 묶음도 같은
규율을 따른다 — 킷을 있는 그대로 기술하고, 외부 출처를 이름으로 끌어오지 않는다.

## 5. 이 묶음의 나머지 문서

- [02-architecture.md](02-architecture.md) — 설치 매핑(공통+스택+변형 3루트, 7 세그먼트), 아키텍처 변형과 계층 모델, 규칙 정본 11종, Kiro 포인터, 치환 토큰표.
- [03-sdd-workflow.md](03-sdd-workflow.md) — 7 명령 + `/hx-converge`, SDD 산출 위치, 완료 게이트, 스크립트, 템플릿 강제 장치(스택 무관).
- [04-enforcement.md](04-enforcement.md) — 단일 게이트 `verify.sh`(스택별 단계), N트리거(훅·CI·pre-commit·kiro), 구조 테스트, settings, protect-sources.
