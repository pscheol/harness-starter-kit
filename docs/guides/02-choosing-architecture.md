# 아키텍처 선택 가이드

스택 3종 × 아키텍처 17변형 중 하나를 고르는 문서다. 고르고 나면 `ARCH` 값 하나가 정해지고,
그 값이 `ARCHITECTURE.md` · `.agents/rules/structure.md` · `.agents/rules/tech.md` · `.kiro/steering/structure.md`
**네 파일**을 결정한다. 나머지는 스택 안에서 공유되므로 변형을 바꿔도 설치 파일 수는 달라지지 않는다.

> **먼저 알아둘 것**: 이 선택은 되돌릴 수 없는 결정이 아니다. 각 변형의 `ARCHITECTURE.md` 마지막 절에
> **전환 절차**가 들어 있고, 승격·후퇴 신호도 함께 적혀 있다. 확신이 없으면 **작은 쪽에서 시작**하는 편이
> 되돌리기 쉽다 — 과한 구조를 걷어내는 것보다 필요할 때 얹는 편이 항상 싸다.

---

## 0. 기존 코드가 있으면 그것이 먼저다

새 리포가 아니라면 고르는 게 아니라 **판독**하는 것이다. 임의로 전환하지 않는다.

| 리포에서 보이는 것 | 변형 |
|---|---|
| `manage.py` | `python` / `django` |
| `src/<pkg>/<ctx>/{domain,application,primary,infra}` | `python` / `hexagonal` |
| `src/<pkg>/modules/<feature>/` | `python` / `modular` |
| `prompts/` · `evaluation/` · `llm/` | `python` / `ai-service` |
| `internal/<feature>/handler.go` | `go` / `feature` |
| `internal/{handler,service,repository}/` | `go` / `layered` |
| `cmd/<app>/main.go` + `internal/app/` 몇 파일 | `go` / `flat` |
| `<ctx>/{domain,application,primary,infra}/` 모듈 | `jvm` / `hexagonal` (컨테이너 아래 중첩이면 `hexagonal-nested`) |
| `:<slug>-<ctx>-domain` 처럼 **평면 하이픈** 모듈 | `jvm` / `hexagonal-standalone` |
| `:<slug>-api` · `-service` · `-domain` 모듈 분리 | `jvm` / `layered-multimodule` |
| `controller`/`service`/`repository` 패키지(단일 모듈) | `jvm` / `layered` |
| `@ApplicationModule` · `spring-modulith` 의존 | `jvm` / `modulith` |
| 위 규격이 아닌 Gradle 멀티모듈 | `jvm` / `multimodule` |

---

## 1. 결정 트리 (새 리포)

세 질문이면 대부분 갈린다.

```
Q1. 배포 단위(실행 프로세스)가 몇 개인가?
    ├─ 여럿 ─┬─ 도메인 규칙이 무겁다 ───────────────▶ jvm: hexagonal-standalone
    │        └─ CRUD 위주(API + 배치 + 관리자) ──────▶ jvm: layered-multimodule
    └─ 하나 ─▶ Q2

Q2. 도메인 규칙이 복잡한가? 저장소·외부 시스템을 교체할 가능성이 있는가?
    ├─ 그렇다 ─┬─ 컨텍스트 3개 이하 ────────────────▶ hexagonal      (3스택 공통)
    │          └─ 그보다 많아 루트가 번잡 ───────────▶ jvm: hexagonal-nested
    └─ 아니다 ─▶ Q3

Q3. 무엇을 기준으로 나눌 것인가?
    ├─ 나누지 않는다(경계 하나·CRUD) ───────────────▶ layered        (3스택 공통)
    ├─ 도메인 — 나중에 떼어낼 수도 ─────────────────▶ jvm: modulith / python: modular
    ├─ 기능 영역 — 사람마다 다른 영역 소유 ─────────▶ jvm·go: feature / python: modular
    ├─ 축을 직접 정하겠다(연동 대상·기술 관심사 등) ─▶ jvm: multimodule
    └─ 엔드포인트가 손에 꼽는 프로토타입 ───────────▶ go: flat
```

**특수 케이스 둘**

- 제품의 핵심 동작이 모델 호출(생성·RAG·에이전트)이다 → `python` / `ai-service`
- Admin·인증·마이그레이션 등 배터리 포함이 최대 이득이다 → `python` / `django`

---

## 2. 스택별 전체 목록

### jvm (Kotlin/Java + Spring Boot) — 8종

| ARCH | 모듈 | 실행 단위 | 도메인이 프레임워크를 아는가 | 강제 수단 |
|---|---|---|---|---|
| `hexagonal` | 컨텍스트당 4 + 전역 `core`·`common`·`bootstrap` | 1 | **모른다** | 모듈 그래프(컴파일) + Konsist |
| `hexagonal-nested` | 위와 같음(경로만 중첩) | 1 | 모른다 | 동일 |
| `hexagonal-standalone` | **컨텍스트당 7**(`core`·`common`·`bootstrap`까지 소유) | **컨텍스트마다 1** | 모른다 | 모듈 그래프 + **구조 테스트**(컨텍스트 간) |
| `layered` | 단일 | 1 | 안다 | ArchUnit `layeredArchitecture()` |
| `layered-multimodule` | 레이어당 1 | **1~N** | 안다 | 모듈 그래프 + ArchUnit(엔티티 누출) |
| `modulith` | 단일 + 모듈 패키지 | 1 | 안다 | Spring Modulith `verify()` |
| `feature` | 단일 + 기능 패키지 | 1 | 안다 | ArchUnit 슬라이스 |
| `multimodule` | 프로젝트가 결정 | 1 | 모듈에 따라 | 모듈 그래프(등급) + ArchUnit |

**헥사고날 3종의 차이는 공유 범위와 실행 단위 수뿐이다.** 레이어 규칙과 의존 방향은 셋 다 같다.

```
hexagonal              :my-app-order:infra          전역 core·common 공유, bootstrap 1개
hexagonal-nested       :my-app-domain:order:infra   위와 같고 경로만 한 단계 깊다
hexagonal-standalone   :my-app-order-infra          컨텍스트마다 core·common·bootstrap 따로
```

### python (FastAPI/ASGI 또는 Django) — 5종

| ARCH | 레이아웃 | import-linter 계약 |
|---|---|---|
| `hexagonal` | `src/<pkg>/{core,common,bootstrap}` + `<ctx>/{domain,application,primary,infra}` | layers 2종 + forbidden + independence |
| `layered` | `src/<pkg>/{core,api,schemas,services,repositories,models}` | `layers = [api, services, repositories, models]` + forbidden |
| `modular` | `src/<pkg>/shared/` + `modules/<feature>/` | `independence`(모듈 간) + 모듈 내부 `layers` |
| `django` | 프로젝트 루트 + `apps/<app>/` | `layers = [views, "services : selectors", models]` + `independence` |
| `ai-service` | `api`·`agents`·`prompts`·`llm`·`retrieval`·`pipelines`·`evaluation` | `layers` + 프로바이더 SDK 격리 |

### go (net/http, 표준 레이아웃) — 4종

| ARCH | 레이아웃 | depguard 규칙 |
|---|---|---|
| `hexagonal` | `internal/<ctx>/{domain,app,primary/http,infra}` | domain 순수 · app↛infra · primary↮infra |
| `layered` | `internal/{handler,service,repository,model}` | 레이어 방향 + **handler↛repository** |
| `feature` | `internal/<feature>/{handler,service,store,model}.go` | 기능 패키지 간 직접 import 금지 |
| `flat` | `cmd/<app>/main.go` + `internal/app/` | 최소 규칙 + **파일 수 상한 감시** |

---

## 3. 자주 헷갈리는 짝

### `hexagonal` vs `layered`

포트/어댑터가 값을 하는 건 **바깥을 바꿀 일이 있을 때**다. 저장소를 교체할 계획이 없고 도메인 규칙이
얇으면 포트는 위임만 하는 껍데기가 된다. "언젠가 바꿀지도"는 이유가 되지 않는다 — `layered` 로 시작해
실제로 그 요구가 생기면 승격한다.

### `hexagonal` vs `hexagonal-standalone`

`standalone` 이 얻는 것은 **컨텍스트를 통째로 들어내 별도 리포로 옮길 수 있다**는 것 하나다.
지불하는 것은 `core`·`common` 복제, 모듈 7×N개, 운영 표면 N배, 규약 드리프트 위험이다.
분리 계획이 없으면 비용만 낸다.

### `layered-multimodule` vs `multimodule`

분할 축이 다르다. 전자는 **레이어**(api·service·domain)로 자르고, 후자는 프로젝트가 축을 고른다
(도메인·연동 대상·기술 관심사·공개 표면). 레이어로 자르는 것이 자연스럽지 않다면 `multimodule` 이다.

### `modulith` vs `feature`

둘 다 단일 모듈이다. `modulith` 는 **도메인 모듈**을 나누고 나중에 서비스로 떼어내는 경로를 염두에 둔다
(Spring Modulith가 순환·`internal` 접근을 검증). `feature` 는 **기능 슬라이스**의 독립이 목적이고
사람마다 다른 영역을 만지는 팀 구조에 맞는다.

### `flat`(go) 은 만료 조건이 있는 변형이다

파일이 5~7개를 넘으면 `feature` 로 승격한다. 이 조건은 `ARCHITECTURE.md` 에 명시돼 있고
구조 테스트가 파일 수 상한을 감시한다.

---

## 4. 승격·후퇴 신호

변형을 고른 뒤에도 신호를 본다. 신호가 보이면 ADR(`.agents/docs/decisions/`)을 남기고 옮긴다.

| 신호 | 뜻 | 이동 |
|---|---|---|
| 포트가 저장소 호출을 그대로 위임만 한다 | 헥사고날이 과하다 | → `layered` 계열 |
| 서비스에 도메인 규칙이 쌓여 손대기 어렵다 | 도메인 모델이 없다 | → `hexagonal` |
| `settings.gradle` 에 모듈을 추가하고 싶어진다 | 단일 모듈의 한계 | → `layered-multimodule` · `hexagonal` |
| 배치·관리자를 따로 띄워야 한다 | 실행 단위가 늘었다 | → `layered-multimodule` |
| `common` 을 세 번째 컨텍스트로 복사하고 있다 | 자립형이 과하다 | `hexagonal-standalone` → `hexagonal` |
| 한 기능을 고치는데 5개 모듈을 만진다 | 분할 축이 틀렸다 | 축을 도메인·기능으로 재설정 |
| `flat` 의 파일이 7개를 넘었다 | 만료 | `go: flat` → `go: feature` |
| 컨텍스트의 배포 주기·팀·SLA가 완전히 갈렸다 | 분리 시점 | → 별도 리포(자립형이면 디렉터리 이동만) |

---

## 5. 고른 다음

```bash
# 3스택 공통 진입
/harness-kit:hx-bootstrap --stack=<jvm|python|go> --arch=<변형> --dry-run

# JVM이면 전용 진입(선택 안내 + 언어 확정)
/hx-jvm-setup
```

설치가 끝나면 `setup.sh` 가 **스택×변형별 후속 작업**을 출력한다. 그것이 다음 할 일이다.
JVM 아키텍처의 실전 레시피(모듈 등록·의존 선언·구조 테스트 배치)는
[03-jvm-architecture-recipes.md](03-jvm-architecture-recipes.md) 에 있다.

## 관련 문서

- [01-getting-started.md](01-getting-started.md) — 설치부터 첫 기능까지
- [03-jvm-architecture-recipes.md](03-jvm-architecture-recipes.md) — jvm 8변형 실전 레시피
- [../analysis/02-architecture.md](../analysis/02-architecture.md) — 킷 내부 구조(설치 매핑·계층 모델)
- 설치 후 원본: 리포의 `ARCHITECTURE.md` §0(선택 기준) · 마지막 절(전환 절차)
