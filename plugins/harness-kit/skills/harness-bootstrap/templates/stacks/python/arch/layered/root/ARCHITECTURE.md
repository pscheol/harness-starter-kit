<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Python 백엔드(ASGI) · 아키텍처: layered -->

# ARCHITECTURE — {{PROJECT_NAME}} (레이어드)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 정본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 **레이어드 아키텍처(api → services → repositories → models)** 를 Python **src 레이아웃** 위에서 구현한다.
컴파일러가 경계를 막아주지 않는 언어이므로 **import 계약 린터(import-linter) + 타입 체커(mypy strict) + 린터(Ruff)** 를 검증 게이트에 묶어 **기계적으로 강제**한다.

스택 기준(버전 정본은 `pyproject.toml` + lock 파일 단일 소스 — 구체 버전은 **예시이며 프로젝트에서 최신 안정 버전으로 확정**):
**Python 3.12+** · **FastAPI(ASGI)** · **SQLAlchemy 2.0(async) + Alembic** · **Pydantic v2**(경계 전용) · **uv**(또는 Poetry) · **Ruff · mypy · pytest · import-linter**.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 하나의 응집된 서비스이고 도메인 경계가 아직 하나다(바운디드 컨텍스트를 나눌 근거가 없다).
- CRUD 비중이 높고 비즈니스 규칙이 "데이터 + 얇은 정책" 수준이다.
- 팀이 작고(1~5명) 인지 비용을 낮게 유지하는 것이 우선이다.
- 관계형 DB 하나가 주 저장소이고 외부 시스템 통합이 적다.

**쓰지 않는다:**
- 서로 독립적으로 배포·소유될 도메인이 이미 둘 이상 보인다 → `modular`.
- 도메인 규칙이 복잡해 순수 모델·불변식·도메인 서비스가 필요하다 → `hexagonal`.
- 저장소·외부 시스템을 교체 가능하게 유지해야 한다(포트/어댑터가 실익이다) → `hexagonal`.
- LLM 파이프라인·평가 하네스가 1급 관심사다 → `ai-service`.

**승격 신호(이 셋 중 둘 이상이면 전환을 검토한다):**
1. `services/`의 한 모듈이 400줄을 넘고 서로 무관한 관심사가 섞인다.
2. 서비스 간 순환 참조를 피하려고 함수 안에서 import를 하기 시작한다.
3. "이 규칙이 어느 서비스 소유인가"를 두고 논쟁이 반복된다.

전환 절차는 §11.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 레이어 단방향 의존 (api→services→repositories→models) | `import-linter` layers 계약 | `lint-imports` 실패 → 게이트 차단 |
| 안쪽 레이어는 웹 프레임워크 무의존 | `import-linter` forbidden 계약(services·repositories·models → fastapi 금지) | 게이트 차단 |
| 경계 DTO가 영속 레이어로 새지 않음 | `import-linter` forbidden 계약(repositories·models → schemas 금지) | 게이트 차단 |
| 타입 계약 준수 | `mypy --strict`(미주석 def·암묵 `Any` 금지) | 게이트 차단 |
| API 응답 일관성 | `core`의 envelope + `ErrorCode` 단일 매핑 + 전역 exception handler | 코드리뷰·핸들러가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(services 우선) | `pytest --cov-fail-under` 게이트 |

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
- 애플리케이션 인스턴스는 **무상태**. 세션/락 상태는 외부 저장소(DB·캐시)에 둔다.
- 배포 단위는 **ASGI 서버**(Uvicorn 워커, 프로덕션은 Gunicorn `UvicornWorker` 등) + 컨테이너.

---

## 3. 레이어 구조 (src 레이아웃)

```
        요청
         │
    ┌────▼─────────────────────────────────────┐
    │ api/        라우터 · 의존성 · 예외 변환   │  FastAPI 를 아는 유일한 레이어
    └────┬─────────────────────────────────────┘
         │            ┌───────────────┐
         │  ◀────────▶│  schemas/     │ 경계 DTO(Pydantic) — api·services 만 사용
    ┌────▼─────────────────────────────────────┐
    │ services/   비즈니스 로직 · 트랜잭션 경계 │  프레임워크 무의존
    └────┬─────────────────────────────────────┘
    ┌────▼─────────────────────────────────────┐
    │ repositories/  데이터 접근(SQLAlchemy)    │  쿼리는 여기서 끝난다
    └────┬─────────────────────────────────────┘
    ┌────▼─────────────────────────────────────┐
    │ models/     ORM 모델(테이블 매핑)         │
    └──────────────────────────────────────────┘
         │
    ┌────▼─────────────────────────────────────┐
    │ core/       예외·에러코드·envelope·상수   │  서드파티 0
    └──────────────────────────────────────────┘
```

### 3.1 레이어 ↔ 의존 가능

| 패키지 | 책임 | 의존 가능 |
|---|---|---|
| `{{PACKAGE_NS}}.main` | app factory · 라우터 등록 · 미들웨어 · lifespan | 전부(조립 목적) |
| `{{PACKAGE_NS}}.api` | HTTP 경계: 라우터·`Depends`·상태코드·예외→응답 변환 | `services`, `schemas`, `core` |
| `{{PACKAGE_NS}}.schemas` | 요청·응답 DTO(Pydantic v2) | `core` |
| `{{PACKAGE_NS}}.services` | 비즈니스 규칙·트랜잭션 경계·정책 검사 | `repositories`, `schemas`, `core` |
| `{{PACKAGE_NS}}.repositories` | 데이터 접근(쿼리·매핑) | `models`, `core` |
| `{{PACKAGE_NS}}.models` | ORM 모델 | `core` |
| `{{PACKAGE_NS}}.core` | 예외·에러코드·envelope·상수 | — (stdlib만) |
| `{{PACKAGE_NS}}.settings` / `.db` | 설정 로드 · 엔진/세션 팩토리 | `core` |

- **의존 금지(게이트 차단)**: `services → api`, `repositories → services/api`, `models → 위 전부`, `core → 서드파티`, `repositories·models → schemas`.
- **레이어를 건너뛰지 않는다**: `api`가 `repositories`를 직접 부르지 않는다(트랜잭션·정책이 services에 있어 우회하면 규칙이 새어 나간다).

### 3.2 import-linter 계약 (컴파일 강제의 대체물)

`pyproject.toml`에 계약을 선언하고 `scripts/verify.sh`가 `lint-imports`를 호출한다.

```toml
[tool.importlinter]
root_packages = ["{{PACKAGE_NS}}"]

# (1) 레이어 단방향: 위가 아래를 부르고, 아래는 위를 모른다
[[tool.importlinter.contracts]]
name = "레이어 단방향"
type = "layers"
layers = [
  "{{PACKAGE_NS}}.api",
  "{{PACKAGE_NS}}.services",
  "{{PACKAGE_NS}}.repositories",
  "{{PACKAGE_NS}}.models",
]

# (2) 안쪽 레이어는 웹 프레임워크를 모른다
[[tool.importlinter.contracts]]
name = "services·repositories·models 는 웹 프레임워크 무의존"
type = "forbidden"
source_modules = [
  "{{PACKAGE_NS}}.services",
  "{{PACKAGE_NS}}.repositories",
  "{{PACKAGE_NS}}.models",
]
forbidden_modules = ["fastapi", "starlette"]

# (3) core 는 서드파티를 모른다
[[tool.importlinter.contracts]]
name = "core 는 순수"
type = "forbidden"
source_modules = ["{{PACKAGE_NS}}.core"]
forbidden_modules = ["fastapi", "starlette", "sqlalchemy", "pydantic", "httpx"]

# (4) 경계 DTO 는 영속 레이어로 내려가지 않는다
[[tool.importlinter.contracts]]
name = "schemas 는 영속 레이어에서 쓰지 않는다"
type = "forbidden"
source_modules = ["{{PACKAGE_NS}}.repositories", "{{PACKAGE_NS}}.models"]
forbidden_modules = ["{{PACKAGE_NS}}.schemas"]
```

> `schemas`는 `layers` 목록에 넣지 않는다(api·services 양쪽이 쓰는 잎 모듈). 대신 (4)로 하강을 막는다.
> **레이어 패키지를 추가하면 (1)에 등록**한다. 등록하지 않은 패키지는 강제 대상 밖이다.

### 3.3 디렉터리 레이아웃

```
{{PROJECT_SLUG}}/
├── pyproject.toml              # 의존성·도구 설정 단일 소스([tool.ruff]·[tool.mypy]·[tool.pytest]·[tool.importlinter]·[tool.coverage])
├── uv.lock                     # 잠금 파일(커밋 필수)
├── src/{{PACKAGE_NS}}/
│   ├── core/                   # 서드파티 0. DomainError·ErrorCode·envelope·상수
│   ├── api/
│   │   ├── deps.py             #   FastAPI Depends 조립(세션·현재 사용자·서비스 팩토리)
│   │   ├── errors.py           #   예외 → HTTP 상태·에러코드 매핑(전역 handler)
│   │   └── routers/{{DOMAIN_EXAMPLE}}.py
│   ├── schemas/{{DOMAIN_EXAMPLE}}.py    # 요청·응답 DTO(Pydantic v2)
│   ├── services/{{DOMAIN_EXAMPLE}}_service.py
│   ├── repositories/{{DOMAIN_EXAMPLE}}_repository.py
│   ├── models/{{DOMAIN_EXAMPLE}}.py     # ORM 모델
│   ├── settings.py             # pydantic-settings BaseSettings
│   ├── db.py                   # async engine · sessionmaker
│   └── main.py                 # app factory · 라우터 등록 · 미들웨어 · lifespan
├── tests/{unit,integration,e2e,architecture}/
├── migrations/                 # Alembic
└── scripts/verify.sh           # 단일 검증 게이트
```

- **src 레이아웃 필수**: 설치된 패키지를 테스트하게 되어 "로컬에서만 import되는" 사고를 막는다.
- 모든 패키지에 `__init__.py`를 둔다. `__init__.py`에는 재수출만, 로직·부작용 금지.
- 파일명은 도메인 개념으로 짓고 레이어 접미사로 역할을 드러낸다(`_service` · `_repository`).

---

## 4. 레이어 책임

| 레이어 | 해야 할 일 | 하면 안 되는 일 |
|---|---|---|
| `api` | 입력 파싱·검증(Pydantic), 인증 주체 추출, 서비스 호출, 응답 envelope 구성 | 비즈니스 분기, ORM 접근, 트랜잭션 제어 |
| `services` | 비즈니스 규칙, 권한·정책 검사, **트랜잭션 경계**, 여러 리포지토리 조합, 이벤트 발행 | HTTP 개념(`HTTPException`·`Request`), 원시 SQL 직접 실행 |
| `repositories` | 쿼리 작성·실행, ORM ↔ 반환 타입 매핑, 페이지네이션 | 비즈니스 판단, `commit()` 호출 |
| `models` | 테이블 매핑·제약·인덱스 선언 | 비즈니스 메서드, 서비스 호출 |
| `core` | 예외 계층·에러코드·envelope·공용 상수 | 프레임워크 참조 |

- **트랜잭션 경계는 서비스에만**. `AsyncSession`은 `api/deps.py`가 요청 스코프로 생성해 주입하고, **커밋은 서비스가** 한다. 리포지토리는 주입받은 세션을 쓰기만 한다(경계 분산 금지).
- **비즈니스 규칙은 서비스에**. 라우터에 `if` 분기로 규칙을 흘리지 않는다. 규칙이 모델 상태 불변식이면 모델에 검증 메서드를 두되, ORM 모델에 외부 호출을 넣지 않는다.
- **생성자 주입 only**. 서비스는 평범한 클래스 + `__init__` 주입으로 만든다. 모듈 전역 싱글턴·`global`·import 시점 부작용 금지. 시간·난수·ID는 `Protocol`(`Clock`·`IdGenerator`)로 주입한다.
  - FastAPI `Depends`는 **`api` 경계에서만** 쓴다. 서비스 생성자에 `Depends`를 침투시키지 않는다(services가 FastAPI를 알게 되면 계약 (2) 위반).
- **예외는 `core`의 도메인 예외로 올린다**. 서비스가 `HTTPException`을 던지지 않는다. `api/errors.py`의 전역 handler가 도메인 예외 → 상태코드·`ErrorCode`로 한 곳에서 변환한다.
- **로깅은 `api`/`services`/`repositories` 경계에서만**, 한 번만. 구조화 로깅(structlog 또는 stdlib `logging` + JSON formatter), 모듈별 `logger = logging.getLogger(__name__)`. 민감정보는 로그 금지.
- **DB 접근**: SQLAlchemy 2.0 스타일(`select()`·`session.execute`). 복잡 조회·통계는 별도 read 메서드로 분리한다. ORM 모델은 `repositories` 밖으로 새어 나가도 되지만(레이어드의 실용적 타협), **`api` 응답에는 반드시 `schemas`의 DTO로 변환**해 내보낸다.

### 4.1 async 규약 (필수)

- I/O 경계(HTTP·DB·캐시)는 **async 일관성**을 유지한다. `async def` 안에서 **blocking 호출 금지**(`requests`·`time.sleep`·동기 DB 드라이버·무거운 CPU 연산) — 이벤트 루프가 멈춰 워커 처리량이 무너진다.
  - 불가피한 blocking·CPU 작업은 `await anyio.to_thread.run_sync(...)`로 밀어낸다.
- 동시 실행은 `asyncio.gather`/`anyio.create_task_group`. **참조를 버리는 `asyncio.create_task` 금지**(예외가 삼켜지고 GC가 태스크를 취소할 수 있다).
- 모든 외부 호출에 타임아웃: `asyncio.timeout(...)` 또는 클라이언트 자체 timeout(`.agents/rules/reliability.md`).

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
| (a) 도메인 상수 | 코드 의미를 갖는 고정 라벨·키 | `enum.StrEnum`/`Final` 상수(`core` 또는 소유 레이어) |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `settings.py`의 **pydantic-settings `BaseSettings`**(+ `.env`) |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블/기능 플래그(캐시·무효화 동반) |

- 설정 객체는 **`main`에서 1회 생성해 주입**한다. 하위 레이어가 `os.environ`을 직접 읽지 않는다.
- 에러코드·사용자 메시지는 문자열 리터럴 금지: 코드는 `core`의 `ErrorCode`, 메시지는 i18n 키로 경계에서 해석한다.
- 가변 기본 인자(`def f(items: list = [])`) 금지 — `None` 기본값 + 내부 생성.

---

## 7. 성능 예산 (부하테스트로 확정)

- **무한/대량 결과 금지**: 목록은 cursor pagination + 상한 `limit` 강제.
- **N+1 회피**: `selectinload`/`joinedload`로 명시적 로딩. 관계 기본값을 `lazy="raise"`로 두어 암묵 lazy 로딩을 즉시 실패로 만든다.
- **핫패스 경량화**: 인증·키 검증 등 고빈도 경로는 단건 인덱스 조회 + 캐시(TTL·무효화 동반).
- **동기 응답 경로 보호**: 무거운 작업은 요청-응답 경로 밖(큐·워커)으로. 지연 민감 경로는 스트리밍(SSE).
- **워커·풀 사이징**: **워커 프로세스마다 풀이 따로 생긴다** — `pool_size`·`max_overflow` × 워커 수가 DB `max_connections`를 넘지 않게 계산한다.

| 경로 부류 | 예 | 목표(예시 — 프로젝트 확정) | 도달 레버 |
|---|---|---|---|
| 캐시/인증 핫패스 | 키 검증·캐시 조회 | 고 TPS/워커 | 캐시(TTL+무효화)로 DB 왕복 제거 |
| 일반 읽기 | 목록·상세 | 수백~수천 TPS/인스턴스 | 인덱스·keyset·풀 사이징·명시적 eager 로딩 |
| 쓰기 | 생성·수정 | 수백 TPS | 무거운 작업은 비동기 워커로 |

---

## 8. TDD 워크플로 (요약)

```
RED   서비스 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. **테스트 없는 서비스 변경 금지**. 프레임워크는 **pytest**(+`pytest-asyncio`).

| 레이어 | 도구 | 비고 |
|---|---|---|
| `core` | pytest (+ hypothesis) | 순수 함수·예외 계층 |
| `services` | pytest + 손수 짠 fake(repository Protocol) | 규칙·트랜잭션 순서. 앱 미기동 |
| `repositories` | pytest + 실제 DB(testcontainers 선택) | 쿼리·매핑·격리 정책 |
| `api` | pytest + `httpx.AsyncClient(ASGITransport)` | 라우터 slice, envelope·status 검증 |
| `architecture` | `lint-imports` + 보조 테스트 | 레이어 계약(§3.2) |

- 서비스 테스트를 위해 리포지토리를 `typing.Protocol`로 선언해두면 fake 작성이 쉬워진다(구조적 서브타이핑이라 상속 불필요).
- 검증 게이트: `bash scripts/verify.sh` (CI·pre-commit·hook이 모두 이 스크립트를 호출).

---

## 9. 새 기능 추가 워크플로

1. **레이어 결정**: 이 기능이 새 리소스인지, 기존 리소스의 새 동작인지 먼저 답한다.
2. **파일 세트 생성**: `models/<x>.py` → `repositories/<x>_repository.py` → `services/<x>_service.py` → `schemas/<x>.py` → `api/routers/<x>.py`. **레이어 패키지를 새로 만들면 §3.2 (1)에 등록**한다.
3. **TDD 사이클**: `services`(fake repository) → `repositories`(실제 DB) → `api`(`AsyncClient`, 응답은 envelope) → `main`(라우터 등록·smoke).
4. **검증**: `bash scripts/verify.sh` 통과 + OpenAPI 스냅샷/문서 동기화(`.agents/docs/openapi`).
5. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록.

---

## 10. Anti-pattern (코드리뷰 즉시 차단)

- 라우터가 `repositories`/`models`를 직접 호출(레이어 건너뛰기 — 트랜잭션·정책 우회).
- 라우터가 ORM 모델을 그대로 반환(응답 스키마·envelope 우회).
- `services`/`repositories`에서 `fastapi`·`HTTPException` 참조.
- 리포지토리가 `commit()`/`rollback()` 호출(트랜잭션 경계 분산).
- `models`에 비즈니스 메서드나 외부 호출을 넣기.
- `async def` 안의 blocking I/O(`requests`·`time.sleep`·동기 드라이버).
- 참조를 보관하지 않는 `asyncio.create_task(...)` fire-and-forget.
- 가변 기본 인자, import 시점 부작용(전역 DB 연결·모듈 로드 중 앱 인스턴스 생성).
- `except Exception: pass` 또는 로그만 남기고 삼키기(silent failure).
- 순환 import를 함수 내부 import로 우회(설계 결함 은폐 — 레이어를 고친다).
- 근거 없는 `# type: ignore`·`Any` 남용, `cast()`로 타입 검사 회피.
- `from module import *`.
- 테스트 없이 서비스 코드 추가.

---

## 11. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `modular` (도메인이 둘 이상으로 갈릴 때) | 리소스별로 `models/<x>.py`·`repositories/<x>_repository.py`·`services/<x>_service.py`·`schemas/<x>.py`·`api/routers/<x>.py` 를 `modules/<x>/{model,repository,service,schema,router}.py` 로 모은다. 공용 인프라는 `shared/` 로. | `layers` 계약을 **모듈별 `containers` + `independence`** 계약으로 교체. 모듈 공개 API는 `modules/<x>/__init__.py` |
| → `hexagonal` (도메인 규칙이 복잡해질 때) | `services/` 를 `<ctx>/application/usecase/` 로, `repositories/` 를 `<ctx>/infra/persistence/` 로, `api/routers/` 를 `<ctx>/primary/web/` 로 옮기고, ORM 과 분리된 **순수 도메인 모델**을 `<ctx>/domain/` 에 새로 만든다(가장 큰 작업). | `layers` 계약을 `containers = [<ctx>]` + `layers = ["primary : infra", "application", "domain"]` 로 교체하고 `domain → 프레임워크` forbidden 계약 추가 |
| → `django` (관리자 화면·인증·ORM 통합이 주 요구가 될 때) | 프레임워크 교체이므로 사실상 재작성이다. 규칙(레이어 책임·트랜잭션 경계)은 그대로 옮겨 쓸 수 있다. | `services`/`selectors` 분리 계약으로 교체 |

- 전환은 **한 번에 한 리소스씩** 옮기고 각 단계마다 `scripts/verify.sh`를 통과시킨다. 계약을 먼저 고치면 전 구간이 빨간불이 되어 되돌리기 어렵다.
- 전환 시작 전 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).

---

## 12. 관련 문서

- 스택·구조·보안·API 규약 정본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 정본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
