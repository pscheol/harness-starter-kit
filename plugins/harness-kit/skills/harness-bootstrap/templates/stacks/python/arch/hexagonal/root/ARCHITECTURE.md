<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Python 백엔드(ASGI) · 아키텍처: hexagonal -->

# ARCHITECTURE — {{PROJECT_NAME}}

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 정본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 **클린 아키텍처(헥사고날) + DDD + TDD + SOLID**를 Python **src 레이아웃** 위에서 구현하고,
컴파일러가 경계를 막아주지 않는 언어이므로 **import 계약 린터(import-linter) + 타입 체커(mypy strict) + 린터(Ruff)** 를 검증 게이트에 묶어 **기계적으로 강제**한다.

스택 기준(버전 정본은 `pyproject.toml` + lock 파일 단일 소스 — 구체 버전은 **예시이며 프로젝트에서 최신 안정 버전으로 확정**):
**Python 3.12+** · **FastAPI(ASGI)** · **SQLAlchemy 2.0(async) + Alembic** · **Pydantic v2**(경계 전용) · **uv**(또는 Poetry) · **Ruff · mypy · pytest · import-linter**.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 의존성 역전 (위→아래 단방향) | `import-linter` layers 계약 | `lint-imports` 실패 → 게이트 차단 |
| 도메인은 프레임워크 무의존 | `import-linter` forbidden 계약(domain/core → fastapi·sqlalchemy·pydantic 금지) | 게이트 차단 |
| 컨텍스트 간 격리 | `import-linter` independence 계약 | 게이트 차단 |
| 타입 계약 준수 | `mypy --strict`(미주석 def·암묵 `Any` 금지) | 게이트 차단 |
| API 응답 일관성 | `common`의 envelope + `ErrorCode` 단일 매핑 + 전역 exception handler | 코드리뷰·핸들러가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(도메인/유스케이스 우선) | `pytest --cov-fail-under` 게이트 |

> **기계적 강제 우선**. Python은 모듈 경계를 컴파일러가 막아주지 않으므로 **린터 계약이 컴파일 강제의 대체물**이다.
> 계약(`pyproject.toml`의 `[tool.importlinter]`)은 아키텍처 문서와 같은 무게로 관리한다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌──────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}     │
 │(Web/CLI) │        │  (ASGI 애플리케이션)   │
 └──────────┘        └──────────┬───────────┘
                                │
        ┌──────────────┬────────┴───────┬──────────────┐
        ▼              ▼                ▼              ▼
  ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
  │ 관계형 DB   │ │ Cache/Queue │ │ Object Store│ │ 외부 시스템 │
  │  (선택)     │ │  (선택)      │ │  (선택)      │ │  (선택)     │
  └────────────┘ └─────────────┘ └─────────────┘ └────────────┘
```

- 데이터 저장소·부가 구성요소는 **모두 선택**이며 프로젝트가 채택 여부를 정한다.
- 애플리케이션 인스턴스는 **무상태**. 세션/락 상태는 외부 저장소(DB·캐시)에 둔다(워커 다중화·재시도 안전).
- 배포 단위는 **ASGI 서버**(Uvicorn 워커, 프로덕션은 Gunicorn `UvicornWorker` 또는 supervisor로 관리) + 컨테이너. 워커는 프로세스 단위로 수평 확장한다.

---

## 3. 헥사고날 패키지 구조 (src 레이아웃)

한 바운디드 컨텍스트(`<ctx>`)는 **`primary` · `application` · `domain` · `infra` 네 형제 패키지**로 구성되고, 그 아래 `common`·`core` 공유 토대가 깔린다.

```
        ┌──────────────────────────────────────────────┐
        │ bootstrap/  app factory · DI 조립 · 설정       │
        └───────────────────────┬──────────────────────┘
                                │ 조립
 ┌────────────────── <ctx>/ ─────────────────────────┐
 │  (예: {{DOMAIN_EXAMPLE}} · auth · ...)             │
 │  ┌──────────┐   ┌────────────────┐   ┌──────────┐ │
 │  │ primary  │──▶│  application    │◀──│  infra   │ │
 │  │ inbound  │   │  ├ usecase(in)  │   │ outbound │ │
 │  │ (HTTP)   │   │  └ port(out)    │   │(SQLA 등) │ │
 │  └──────────┘   └───────┬────────┘   └──────────┘ │
 │                         ▼                          │
 │              ┌──────────────────────┐              │
 │              │      domain          │              │
 │              │ Aggregate·VO·Service │              │
 │              │  (프레임워크 무의존)  │              │
 │              └──────────────────────┘              │
 └───────────────────────┬───────────────────────────┘
                  ┌───────┴───────┐  common/ (envelope·error·미들웨어)
                  └───────┬───────┘
                  ┌───────┴───────┐  core/   (DomainError·primitives)
                  └───────────────┘
```

### 3.1 패키지 ↔ 레이어 매핑

| 패키지 | 레이어 | 의존 가능 |
|---|---|---|
| `{{PACKAGE_NS}}.bootstrap` | Composition Root | `common` + 각 컨텍스트의 `primary`·`infra` |
| `{{PACKAGE_NS}}.<ctx>.primary` | Inbound Adapter(HTTP) | `application`, `common` |
| `{{PACKAGE_NS}}.<ctx>.infra` | Outbound Adapter(DB·외부) | `application`, `common`, `core` |
| `{{PACKAGE_NS}}.<ctx>.application` | Use Case + Port | `domain`, `core` |
| `{{PACKAGE_NS}}.<ctx>.domain` | Domain Model | `core` |
| `{{PACKAGE_NS}}.common` | 공유 커널(web·envelope·error) | `core` |
| `{{PACKAGE_NS}}.core` | Primitives(DomainError) | — (프레임워크 0) |

- **의존 금지(게이트 차단)**: `domain → infra/primary`, `application → infra/primary`, `core → 외부`, `primary ↔ infra`.
- `core`·`domain`은 **stdlib + 자기 자신만** import한다. `fastapi`·`sqlalchemy`·`pydantic`·`starlette` import 금지.
- 4패키지는 **항상 한 묶음으로 추가·제거**한다.

### 3.2 import-linter 계약 (컴파일 강제의 대체물)

`pyproject.toml`에 계약을 선언하고 `scripts/verify.sh`가 `lint-imports`를 호출한다.

```toml
[tool.importlinter]
root_packages = ["{{PACKAGE_NS}}"]

# (1) 전역 레이어: bootstrap 이 가장 바깥, core 가 가장 안쪽
[[tool.importlinter.contracts]]
name = "전역 레이어 단방향"
type = "layers"
layers = ["{{PACKAGE_NS}}.bootstrap", "{{PACKAGE_NS}}.common", "{{PACKAGE_NS}}.core"]

# (2) 컨텍스트 내부 레이어: primary·infra 는 형제(서로 의존 금지)
[[tool.importlinter.contracts]]
name = "컨텍스트 내부 레이어 단방향"
type = "layers"
containers = ["{{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}}"]   # 컨텍스트 추가 시 함께 등록
layers = ["primary : infra", "application", "domain"]

# (3) 도메인은 프레임워크 무의존
[[tool.importlinter.contracts]]
name = "domain·core 는 프레임워크 무의존"
type = "forbidden"
source_modules = ["{{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}}.domain", "{{PACKAGE_NS}}.core"]
forbidden_modules = ["fastapi", "starlette", "sqlalchemy", "pydantic", "httpx"]

# (4) 컨텍스트 간 직접 참조 금지(공개 계약·이벤트 경유)
[[tool.importlinter.contracts]]
name = "컨텍스트 간 독립"
type = "independence"
modules = ["{{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}}", "{{PACKAGE_NS}}.auth"]
```

> 컨텍스트를 추가하면 (2)의 `containers`와 (4)의 `modules`에 **반드시 함께 등록**한다. 등록하지 않으면 그 컨텍스트는 강제 대상 밖이다.

### 3.3 Port & Adapter (Protocol 기반)

- **Inbound Port** = 유스케이스 인터페이스. `application/usecase/<x>_usecase.py`에 `typing.Protocol`로 선언한다. 라우터는 구현체가 아니라 Protocol에만 의존한다.
- **Outbound Port** = 리포지토리·외부 시스템 추상. `application/port/`에 `Protocol`로 선언하고 `infra`가 구현한다.
- 포트는 **애그리거트 기준**(`save(aggregate)`·`find_by_...`)으로 정의한다. SQL·컬럼·`upsert` 같은 영속 메커니즘을 시그니처에 드러내지 않는다(멱등/충돌 처리는 어댑터 내부).
- `Protocol`은 구조적 서브타이핑이라 **infra가 application을 상속하지 않고도** 계약을 만족한다. 다만 계약 준수는 mypy가 확인하므로 어댑터에 대한 타입 체크를 켜둔다.
- 새 외부 시스템 통합 = 새 port + 새 infra 어댑터. `application`/`domain`은 손대지 않는다(OCP).

### 3.4 디렉터리 레이아웃 (src layout)

```
{{PROJECT_SLUG}}/
├── pyproject.toml              # 의존성·도구 설정 단일 소스([tool.ruff]·[tool.mypy]·[tool.pytest]·[tool.importlinter]·[tool.coverage])
├── uv.lock                     # 잠금 파일(커밋 필수)
├── src/{{PACKAGE_NS}}/
│   ├── core/                   # 프레임워크 0. DomainError·공용 타입·상수
│   ├── common/                 # 공유 커널: envelope·error_code·exception_handler·request_id 미들웨어
│   ├── {{DOMAIN_EXAMPLE}}/     # 바운디드 컨텍스트
│   │   ├── domain/             #   aggregate·vo·event·exception·service (순수)
│   │   ├── application/        #   usecase(inbound port+구현)·port(outbound)·command·query·dto
│   │   ├── primary/web/        #   router·schema(Pydantic)·mapper·docs
│   │   └── infra/              #   persistence(model·repository·mapper·adapter)·client
│   └── bootstrap/              # app factory·DI 조립·settings·미들웨어·lifespan
├── tests/{unit,integration,e2e,architecture}/
├── migrations/                 # Alembic
└── scripts/verify.sh           # 단일 검증 게이트
```

- **src 레이아웃 필수**: 설치된 패키지를 테스트하게 되어 "로컬에서만 import되는" 사고를 막는다. 빌드 백엔드에 패키지 경로를 명시한다(예: hatchling `[tool.hatch.build.targets.wheel] packages = ["src/{{PACKAGE_NS}}"]`).
- 모듈명은 도메인 개념(ubiquitous language)으로 짓고 **테이블 prefix를 붙이지 않는다**. infra는 `<concept>_model.py`·`<concept>_repository.py`·`<concept>_adapter.py`·`<concept>_mapper.py`.
- 모든 패키지에 `__init__.py`를 둔다(암묵 네임스페이스 패키지 사고 방지). `__init__.py`에는 재수출만, 로직 금지.

---

## 4. 레이어 책임 (Domain Service vs Application Service)

| 구분 | 위치 | 책임 | 구현 형태 |
|---|---|---|---|
| Domain Service | `<ctx>/domain/service/` | 한 애그리거트에 자연스럽게 속하지 않는 **순수 도메인 로직**. 외부 I/O 금지 | 평범한 `class`/모듈 함수(프레임워크 데코레이터 0). 의존이 없으면 모듈 함수 |
| Application Service (= UseCase 구현) | `<ctx>/application/usecase/` | 트랜잭션 경계, outbound port 호출 조립, 권한·정책 검사, 이벤트 발행 | 평범한 `class` + `__init__` 생성자 주입. inbound Protocol 구현 |

- **Aggregate**: 트랜잭션·일관성 경계. 한 트랜잭션에서 하나의 루트만 수정. 다른 애그리거트는 **ID 참조**. 내부 PK는 정수, 외부 노출은 code.
  - 표현: `@dataclass`(불변식 검증은 `__post_init__`) 또는 일반 클래스. **`pydantic.BaseModel` 금지**(도메인은 프레임워크 무의존).
- **Value Object**: `@dataclass(frozen=True, slots=True)`. `__post_init__`에서 invariant 검증 → 잘못된 상태로 인스턴스화 불가.
- **비즈니스 규칙은 애그리거트/도메인 서비스로**. UseCase에 규칙을 인라인하지 않는다(Anemic Domain 회피). 판단 기준:
  - (a) 한 애그리거트의 상태 불변식 → **애그리거트 내부**.
  - (b) 애그리거트 소유가 아닌 정책·교차 규칙 → **`domain/service`**. 무상태 순수면 모듈 함수, 주입·교체가 필요하면 클래스.
  - (c) 트랜잭션·포트 호출·격리 세션 오케스트레이션 → **application usecase**.
- **트랜잭션 경계는 UseCase에만**. SQLAlchemy `AsyncSession`(Unit of Work)은 UseCase가 열고 커밋하며, **infra 어댑터는 주입받은 세션을 쓰기만 한다**(어댑터가 `commit()`을 호출하지 않는다 — 경계 분산 금지).
- **생성자 주입 only**. 모듈 전역 싱글턴·`global`·import 시점 부작용 금지. 시간·난수·ID는 Protocol(`Clock`·`IdGenerator`)로 주입(결정성·테스트 가능).
  - FastAPI `Depends`는 **primary 경계에서만** 쓴다. UseCase 생성자에 `Depends`를 침투시키지 않는다(application이 FastAPI를 알게 되면 계약 위반).
- **로깅은 경계에서만**(`application`/`primary`/`infra`). `domain`은 로깅 금지. 구조화 로깅(structlog 또는 stdlib `logging` + JSON formatter), 모듈별 `logger = logging.getLogger(__name__)`. 에러는 경계에서 한 번만. 민감정보는 로그 금지.
- **DB 접근**: 표준 CRUD(애그리거트 영속)는 **SQLAlchemy 2.0 스타일**(`select()`·`session.execute`). 복잡 조회·통계는 별도 read 어댑터로 분리한다. ORM 모델(`infra/persistence/model.py`)과 도메인 애그리거트는 **다른 타입**이며 `mapper.py`가 변환한다.

### 4.1 async 규약 (필수)

- I/O 경계(HTTP·DB·캐시)는 **async 일관성**을 유지한다. `async def` 안에서 **blocking 호출 금지**(`requests`·`time.sleep`·동기 DB 드라이버·무거운 CPU 연산) — 이벤트 루프가 멈춰 전체 워커 처리량이 무너진다.
  - 불가피한 blocking·CPU 작업은 `await anyio.to_thread.run_sync(...)`(또는 `loop.run_in_executor`)로 밀어낸다.
- 동시 실행은 `asyncio.gather`/`anyio.create_task_group`. **참조를 버리는 `asyncio.create_task` 금지** — 참조를 잃으면 예외가 삼켜지고 GC가 태스크를 취소할 수 있다. 백그라운드 작업은 task group·큐·워커로 소유자를 명시한다.
- 모든 외부 호출에 타임아웃: `asyncio.timeout(...)` 또는 클라이언트 자체 timeout(`.agents/rules/reliability.md`).
- 동기 스택(WSGI: Django/Flask)을 쓰는 프로젝트라면 이 절 대신 스레드 안전·커넥션 풀 규약을 `.agents/rules/tech.md`에 명시해 대체한다.

---

## 5. 코드 주석 규약 (요약)

- 코드는 라인 단위 What/How를, 주석은 Why를 설명한다. 단 **함수·메서드 docstring은 ① 책임 한 줄 + ② 비자명한 Why + ③ `처리 흐름:`(의도를 곁들인 단계)** 로 로직 이해를 돕는다.
- **타입 힌트가 계약을 담는다** — `Args:`/`Returns:`에 타입을 되풀이하지 않는다. 타입이 못 담는 의미(단위·범위·부작용·예외 조건)만 적는다.
- 시그니처를 옮긴 번역투 금지. 단순 프로퍼티·위임은 책임 한 줄만. 흐름이 7~8단계로 길면 함수를 분리한다.
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 정본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 6. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 도메인 상수 | 코드 의미를 갖는 고정 라벨·키 | `enum.StrEnum`/`Final` 상수(소유 레이어) — audit action·에러코드·역할·상태 |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `bootstrap/settings.py`의 **pydantic-settings `BaseSettings`**(+ `.env`) — base-url·타임아웃·외부 엔드포인트 |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블/기능 플래그(캐시·무효화 동반) |

- 설정 객체는 **bootstrap에서 1회 생성해 주입**한다. 하위 레이어가 `os.environ`을 직접 읽지 않는다(테스트 불가·은닉 의존).
- 에러코드·사용자 메시지는 문자열 리터럴 금지: 코드는 `ErrorCode`(common, 단일 매핑), 메시지는 i18n 키로 경계에서 해석한다.
- 가변 기본 인자(`def f(items: list = [])`) 금지 — `None` 기본값 + 내부 생성.

---

## 7. 성능 예산 (부하테스트로 확정)

- **무한/대량 결과 금지**: 목록은 cursor pagination + 상한 `limit` 강제. 전체 스캔·메모리 적재 금지.
- **N+1 회피**: SQLAlchemy `selectinload`/`joinedload`로 명시적 로딩. 관계 기본값을 `lazy="raise"`로 두어 **암묵 lazy 로딩을 조용한 성능 저하가 아니라 즉시 실패로** 만든다(async 세션에서는 어차피 예외).
- **핫패스 경량화**: 인증·키 검증 등 고빈도 경로는 단건 인덱스 조회 + 캐시(TTL·무효화 동반).
- **동기 응답 경로 보호**: 무거운 작업은 요청-응답 경로 밖(큐·워커: Celery/ARQ/Dramatiq 등 선택)으로. 지연 민감 경로는 스트리밍(SSE).
- **워커·풀 사이징**: 처리량 상한은 ASGI 워커 수 × DB 커넥션 풀이 결정한다. **워커 프로세스마다 풀이 따로 생긴다** — `pool_size`·`max_overflow` × 워커 수가 DB `max_connections`를 넘지 않게 계산한다.
- **직렬화 비용**: 응답 스키마는 필요한 필드만. 대량 응답은 필드를 줄이고 캐시한다.

**경로별 차등 목표**(수치는 부하테스트로 확정):

| 경로 부류 | 예 | 목표(예시 — 프로젝트 확정) | 도달 레버 |
|---|---|---|---|
| 캐시/인증 핫패스 | 키 검증·캐시 조회 | 고 TPS/워커 | 캐시(TTL+무효화)로 DB 왕복 제거 |
| 일반 읽기 | 목록·상세 | 수백~수천 TPS/인스턴스 | 인덱스·keyset·풀 사이징·명시적 eager 로딩 |
| 쓰기 | 생성·수정 | 수백 TPS | 무거운 작업은 비동기 워커로 |
| 비동기 워커 | 배치·색인 | 처리량/큐 기준 | 요청 경로 밖. 워커 수평 확장 |

---

## 8. TDD 워크플로 (요약)

```
RED   유스케이스/도메인 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. **테스트 없는 도메인/유스케이스 변경 금지**. 프레임워크는 **pytest**(+`pytest-asyncio`), 목은 꼭 필요할 때만(우선 손수 짠 fake — Protocol이라 fake 작성이 쉽다).
- 시간·난수·외부 호출은 Protocol 경유 → 결정성 확보(`freezegun`·고정 시드로 보완).

| 레이어 | 도구 | 비고 |
|---|---|---|
| `core` / `domain` | pytest (+ hypothesis) | 순수 함수·VO·애그리거트. 프레임워크·DB 금지 |
| `application` | pytest + 손수 짠 fake(port) | 유스케이스 단위. 앱 미기동 |
| `primary` | pytest + `httpx.AsyncClient(ASGITransport)` | 라우터 slice, envelope·status 검증 |
| `infra` | pytest + 실제 DB(testcontainers 선택) | 리포지토리 어댑터·데이터 격리 정책 |
| `bootstrap` | pytest + 앱 팩토리 기동 | 와이어링·헬스체크·smoke |
| `architecture` | `lint-imports` + 보조 테스트 | 레이어 계약(§3.2) |

- 검증 게이트: `bash scripts/verify.sh` (CI·pre-commit·hook이 모두 이 스크립트를 호출).

---

## 9. 새 도메인/유스케이스 추가 워크플로

1. **컨텍스트 결정**: 기존 컨텍스트 안인지 새 바운디드 컨텍스트인지 먼저 답한다.
2. **(신규 컨텍스트)** `src/{{PACKAGE_NS}}/<ctx>/{domain,application,primary,infra}/` 4패키지 생성 → **`pyproject.toml`의 import-linter 계약(§3.2)에 등록**(등록 누락 = 강제 누락).
3. **TDD 사이클**: `domain`(애그리거트/VO) → `application`(유스케이스 + fake port) → `infra`(실제 DB로 포트 구현) → `primary`(`AsyncClient`로 라우터, 응답은 envelope) → `bootstrap`(와이어링·smoke).
4. **검증**: `bash scripts/verify.sh` 통과 + OpenAPI 스냅샷/문서 동기화(`.agents/docs/openapi`).
5. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록.

---

## 10. Anti-pattern (코드리뷰 즉시 차단)

- 도메인 모델을 `pydantic.BaseModel`·SQLAlchemy `DeclarativeBase`로 정의(프레임워크 침투).
- 라우터가 ORM 모델·도메인 애그리거트를 직접 반환(응답 스키마·envelope 우회).
- `application`/`domain`에서 `fastapi`·`starlette`·`HTTPException` 참조.
- outbound port 시그니처에 SQL·컬럼·`session`을 노출.
- infra 어댑터가 `commit()`/`rollback()` 호출(트랜잭션 경계 분산).
- `async def` 안의 blocking I/O(`requests`·`time.sleep`·동기 드라이버).
- 참조를 보관하지 않는 `asyncio.create_task(...)` fire-and-forget.
- 가변 기본 인자, import 시점 부작용(전역 DB 연결·모듈 로드 중 앱 인스턴스 생성).
- `except Exception: pass` 또는 로그만 남기고 삼키기(silent failure).
- 순환 import를 함수 내부 import로 우회(설계 결함 은폐 — 레이어를 고친다).
- 근거 없는 `# type: ignore`·`Any` 남용, `cast()`로 타입 검사 회피.
- `from module import *`.
- 다른 바운디드 컨텍스트의 도메인 모듈을 직접 import.
- 테스트 없이 도메인/유스케이스 코드 추가.

---

## 11. 관련 문서

- 스택·구조·보안·API 규약 정본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 정본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
