<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Python 백엔드(ASGI) · 아키텍처: modular(패키지 바이 피처) -->

# ARCHITECTURE — {{PROJECT_NAME}} (모듈러 · 패키지 바이 피처)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 모듈러 모놀리스(패키지 바이 피처) 를 Python src 레이아웃 위에서 구현한다.
코드는 기술 레이어가 아니라 **기능 모듈**로 먼저 나뉘고, 각 모듈 안에서만 얇은 레이어(router → service → repository → model)를 유지한다.
컴파일러가 경계를 막아주지 않는 언어이므로 import 계약 린터(import-linter) + 타입 체커(mypy strict) + 린터(Ruff) 를 검증 게이트에 묶어 **기계적으로 강제**한다.

스택 기준(버전 기준은 `pyproject.toml` + lock 파일 단일 소스 — 구체 버전은 예시이며 프로젝트에서 최신 안정 버전으로 확정):
Python 3.12+ · FastAPI(ASGI) · SQLAlchemy 2.0(async) + Alembic · Pydantic v2(경계 전용) · uv(또는 Poetry) · Ruff · mypy · pytest · import-linter.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 기능 영역이 이미 여러 개이고 각각 다른 사람·팀이 주로 만진다(변경이 모듈 안에서 끝난다).
- 언젠가 일부 모듈을 별도 서비스로 떼어낼 가능성이 있다(모듈 경계 = 미래의 분리선).
- 한 기능을 이해하려고 4~5개 레이어 디렉터리를 오가는 비용이 실제로 크다.
- 도메인 규칙은 중간 복잡도다 — 순수 도메인 모델까지는 아직 과하다.

**쓰지 않는다:**
- 도메인 경계가 아직 하나뿐이다(모듈이 1개면 레이어드가 더 단순하다) → `layered`.
- 모듈 간 호출이 거미줄처럼 얽혀 독립성이 지켜지지 않는다(경계가 잘못 그어진 것 — 먼저 경계를 다시 긋는다).
- 도메인 규칙이 복잡해 ORM과 분리된 순수 모델·불변식이 필요하다 → `hexagonal`.
- LLM 파이프라인·평가 하네스가 1급 관심사다 → `ai-service`.

승격 신호(이 중 둘 이상이면 `hexagonal` 전환을 검토한다):
1. 한 모듈의 `service.py`가 500줄을 넘고 규칙이 ORM 모델과 뒤엉킨다.
2. 저장소·외부 시스템을 교체할 요구가 실제로 생긴다(포트/어댑터의 실익).
3. 도메인 불변식을 테스트하려는데 DB 없이는 테스트가 불가능하다.

전환 절차는 §11.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| **모듈 간 독립** (직접 import 금지) | `import-linter` independence 계약 | `lint-imports` 실패 → 게이트 차단 |
| 모듈 내부 레이어 단방향 | `import-linter` layers 계약(`containers`) | 게이트 차단 |
| 안쪽 레이어는 웹 프레임워크 무의존 | `import-linter` forbidden 계약 | 게이트 차단 |
| `shared`는 모듈을 모른다 | `import-linter` forbidden 계약(shared → modules 금지) | 게이트 차단 |
| 타입 계약 준수 | `mypy --strict` | 게이트 차단 |
| API 응답 일관성 | `shared`의 envelope + `ErrorCode` 단일 매핑 + 전역 exception handler | 코드리뷰·핸들러가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(service 우선) | `pytest --cov-fail-under` 게이트 |

> 기계적 강제 우선. 모듈러의 가치는 "모듈이 실제로 독립적"일 때만 나온다. 독립성은 규율이 아니라 independence 계약이 지킨다.

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

- 모듈은 **하나의 프로세스·하나의 DB**를 공유하는 모놀리스로 배포된다(모듈 = 코드 경계이지 배포 경계가 아니다).
- 다만 테이블 소유권은 모듈에 있다: 다른 모듈의 테이블을 직접 조회하지 않는다(§4의 통합 규약).
- 애플리케이션 인스턴스는 **무상태**. 배포 단위는 ASGI 서버 + 컨테이너.

---

## 3. 모듈 구조 (src 레이아웃)

```
 ┌─────────────────────────────────────────────────────────┐
 │ main.py   app factory · 모듈 라우터 등록 · 미들웨어       │
 └───────────────┬─────────────────────┬───────────────────┘
                 │                     │
   ┌─────────────▼──────────┐ ┌────────▼───────────────┐
   │ modules/{{DOMAIN_EXAMPLE}}/ │ modules/auth/          │   서로 직접 import 금지
   │  __init__.py  ← 공개 API │ │  __init__.py           │   (independence 계약)
   │  router.py               │ │  router.py             │
   │  schema.py               │ │  schema.py             │
   │  service.py              │ │  service.py            │
   │  repository.py           │ │  repository.py         │
   │  model.py                │ │  model.py              │
   └─────────────┬────────────┘ └────────┬───────────────┘
                 └──────────┬────────────┘
              ┌─────────────▼─────────────┐
              │ shared/  db·settings·      │  모듈을 모른다(역참조 금지)
              │ envelope·deps·미들웨어      │
              └─────────────┬─────────────┘
              ┌─────────────▼─────────────┐
              │ core/   예외·ErrorCode·상수 │  서드파티 0
              └───────────────────────────┘
```

### 3.1 모듈 내부 레이어

| 파일 | 책임 | 의존 가능 |
|---|---|---|
| `router.py` | HTTP 경계: 경로·`Depends`·상태코드 | `service`, `schema`, `shared`, `core` |
| `schema.py` | 요청·응답 DTO(Pydantic v2) | `core` |
| `service.py` | 비즈니스 규칙·**트랜잭션 경계**·정책 검사 | `repository`, `schema`, `shared`, `core` |
| `repository.py` | 쿼리·매핑 | `model`, `shared`, `core` |
| `model.py` | ORM 모델(이 모듈이 소유하는 테이블) | `shared`(Base), `core` |
| `exceptions.py` | 모듈 고유 예외(`core` 예외 상속) | `core` |
| `__init__.py` | **모듈 공개 API**(다른 모듈이 볼 수 있는 것만 재수출) | 모듈 내부 |

- **의존 금지(게이트 차단)**: `service → router`, `repository → service/router`, `model → 위 전부`, `shared → modules`, `core → 서드파티`, 모듈 A → 모듈 B의 내부 파일.
- 모듈이 커지면 파일을 디렉터리로 승격한다(`service.py` → `service/{create,update,query}.py`). 레이어 이름은 유지한다(계약이 이름 기준이다).

### 3.2 import-linter 계약 (컴파일 강제의 대체물)

`pyproject.toml`에 계약을 선언하고 `scripts/verify.sh`가 `lint-imports`를 호출한다.

```toml
[tool.importlinter]
root_packages = ["{{PACKAGE_NS}}"]

# (1) 모듈 간 독립 — 이 변형의 핵심 계약
[[tool.importlinter.contracts]]
name = "모듈 간 독립"
type = "independence"
modules = [
  "{{PACKAGE_NS}}.modules.{{DOMAIN_EXAMPLE}}",
  "{{PACKAGE_NS}}.modules.auth",
]

# (2) 모듈 내부 레이어 단방향
[[tool.importlinter.contracts]]
name = "모듈 내부 레이어 단방향"
type = "layers"
containers = [
  "{{PACKAGE_NS}}.modules.{{DOMAIN_EXAMPLE}}",
  "{{PACKAGE_NS}}.modules.auth",
]
layers = ["router", "service", "repository", "model"]

# (3) 안쪽 레이어는 웹 프레임워크를 모른다
#     import-linter 2.x 는 모듈 표현식 와일드카드(*)를 지원한다.
#     지원 버전이 아니면 모듈을 아래처럼 하나씩 나열한다.
[[tool.importlinter.contracts]]
name = "service·repository·model 은 웹 프레임워크 무의존"
type = "forbidden"
source_modules = [
  "{{PACKAGE_NS}}.modules.*.service",
  "{{PACKAGE_NS}}.modules.*.repository",
  "{{PACKAGE_NS}}.modules.*.model",
]
forbidden_modules = ["fastapi", "starlette"]

# (4) shared 는 모듈을 모른다(역참조 금지 — 공유 커널이 기능에 오염되지 않게)
[[tool.importlinter.contracts]]
name = "shared·core 는 modules 를 모른다"
type = "forbidden"
source_modules = ["{{PACKAGE_NS}}.shared", "{{PACKAGE_NS}}.core"]
forbidden_modules = ["{{PACKAGE_NS}}.modules"]
```

> 새 모듈을 만들면 (1)의 `modules`와 (2)의 `containers`에 반드시 등록한다. 등록하지 않은 모듈은 독립성·레이어 강제 대상 밖이다(등록 누락 = 강제 누락).
> `main.py`는 모든 모듈의 라우터를 등록해야 하므로 계약에서 제외되는 유일한 조립 지점이다.

### 3.3 디렉터리 레이아웃

```
{{PROJECT_SLUG}}/
├── pyproject.toml              # 의존성·도구 설정 단일 소스(+ [tool.importlinter])
├── uv.lock                     # 잠금 파일(커밋 필수)
├── src/{{PACKAGE_NS}}/
│   ├── core/                   # 서드파티 0. 예외 계층·ErrorCode·상수
│   ├── shared/                 # 공유 커널: db(Base·session)·settings·envelope·deps·미들웨어
│   ├── modules/
│   │   ├── {{DOMAIN_EXAMPLE}}/
│   │   │   ├── __init__.py     #   공개 API(다른 모듈은 여기만 본다)
│   │   │   ├── router.py · schema.py · service.py · repository.py · model.py · exceptions.py
│   │   │   └── contract.py     #   (선택) 다른 모듈에 제공하는 읽기 계약·이벤트 정의
│   │   └── auth/ ...
│   └── main.py                 # app factory · 모듈 라우터 등록 · lifespan
├── tests/
│   ├── modules/{{DOMAIN_EXAMPLE}}/{unit,integration,e2e}/
│   └── architecture/
├── migrations/                 # Alembic (모듈별 마이그레이션도 한 히스토리에 모인다)
└── scripts/verify.sh           # 단일 검증 게이트
```

- **테스트도 모듈 단위로 미러링**한다(`tests/modules/<feature>/`). 한 모듈을 지우면 그 모듈 테스트도 같이 사라져야 한다.
- 모든 패키지에 `__init__.py`를 둔다. 모듈 루트의 `__init__.py`만 예외적으로 재수출을 담는다(공개 API 표면).

---

## 4. 모듈 간 통합 규약 (가장 중요한 규칙)

모듈은 서로의 내부 파일을 import하지 않는다. 통합이 필요하면 아래 셋 중 하나를 쓴다.

| 방식 | 언제 | 형태 |
|---|---|---|
| (a) 공개 API 경유 | 동기 읽기·간단한 질의 | 제공 모듈의 `__init__.py`(또는 `contract.py`)가 노출한 함수/DTO만 호출 |
| (b) 조립 지점 주입 | 쓰기·정책이 얽힐 때 | 소비 모듈이 `Protocol`을 선언하고 `main.py`가 제공 모듈 구현을 주입(모듈 A는 B의 존재를 모른다) |
| (c) 도메인 이벤트 | 부수 효과·비동기 | 제공 모듈이 이벤트 발행, 소비 모듈이 핸들러 등록. 실패는 소비 쪽 책임 |

- (a)도 DTO만 오간다. 다른 모듈의 ORM 모델·`Session`을 넘기지 않는다(경계가 무너진다).
- 다른 모듈의 테이블을 직접 조회하지 않는다. 조인이 꼭 필요하면 그 조인이 경계가 잘못됐다는 신호다 — 모듈을 합치거나 읽기 계약을 만든다.
- 순환 의존이 필요해 보이면 (b) 또는 (c)로 방향을 하나로 만든다. `independence` 계약이 (a)의 양방향을 이미 막는다.

---

## 5. 레이어 책임

- 트랜잭션 경계는 `service`에만. `AsyncSession`은 `shared/deps.py`가 요청 스코프로 생성해 주입하고, 커밋은 서비스가 한다. 리포지토리는 주입받은 세션을 쓰기만 한다.
  - 모듈을 넘는 트랜잭션은 만들지 않는다. 한 요청이 두 모듈을 바꿔야 하면 (c) 이벤트 + 멱등 처리로 최종 일관성을 택한다.
- **비즈니스 규칙은 `service`에**. 라우터에 `if` 분기로 규칙을 흘리지 않는다.
- **생성자 주입 only**. 서비스는 평범한 클래스 + `__init__` 주입. 모듈 전역 싱글턴·`global`·import 시점 부작용 금지. 시간·난수·ID는 `Protocol`(`Clock`·`IdGenerator`)로 주입한다.
  - FastAPI `Depends`는 **`router` 경계에서만**. 서비스 생성자에 `Depends`를 침투시키지 않는다.
- 예외는 모듈 `exceptions.py`에서 `core` 예외를 상속해 정의하고, `shared`의 전역 handler가 상태코드·`ErrorCode`로 한 곳에서 변환한다. 서비스가 `HTTPException`을 던지지 않는다.
- 로깅은 `router`/`service`/`repository`에서만, 한 번만. 구조화 로깅 + 모듈별 `logger = logging.getLogger(__name__)`. 민감정보는 로그 금지.
- **DB 접근**: SQLAlchemy 2.0 `select()`/`session.execute`. ORM 모델은 `router` 응답으로 나가지 않는다 — 반드시 `schema`의 DTO로 변환한다.

### 5.1 async 규약 (필수)

- `async def` 안에서 blocking 호출 금지(`requests`·`time.sleep`·동기 DB 드라이버·무거운 CPU 연산). 불가피하면 `await anyio.to_thread.run_sync(...)`.
- 동시 실행은 `asyncio.gather`/`anyio.create_task_group`. 참조를 버리는 `asyncio.create_task` 금지(예외가 삼켜지고 GC가 태스크를 취소할 수 있다).
- 모든 외부 호출에 타임아웃(`asyncio.timeout(...)` 또는 클라이언트 timeout — `.agents/rules/reliability.md`).

---

## 6. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. 코드로 말할 수 없는 것 — Why · 함정 · 외부 근거 · 억제 이유 — 만 적는다.
- 단계별 `처리 흐름:`은 분기가 얽혀 절차가 안 잡히거나, 순서를 바꾸면 버그가 나는 함수에 쓴다. 5단계 이내.
- 타입 힌트가 말하는 것을 `Args:`/`Returns:`로 되풀이하지 않는다. 타입이 못 담는 의미(단위·범위·시간대)만 적는다.
- 모듈 `__init__.py`의 공개 API에는 **"다른 모듈이 이걸 어떻게 쓰는지" 한 줄**을 남긴다(경계 문서화).
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 7. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 도메인 상수 | 코드 의미를 갖는 고정 라벨·키 | `enum.StrEnum`/`Final`(모듈 소유 또는 `core`) |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `shared/settings.py`의 pydantic-settings `BaseSettings`(+ `.env`) |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블/기능 플래그(캐시·무효화 동반) |

- 설정 객체는 **`main`에서 1회 생성해 주입**한다. 모듈이 `os.environ`을 직접 읽지 않는다.
- 모듈 고유 설정은 **그 모듈 소유 섹션**으로 분리한다(모듈을 떼어낼 때 설정도 같이 따라가게).
- 가변 기본 인자(`def f(items: list = [])`) 금지 — `None` 기본값 + 내부 생성.

---

## 8. 성능 예산 (부하테스트로 확정)

- 무한/대량 결과 금지: cursor pagination + 상한 `limit` 강제.
- **N+1 회피**: `selectinload`/`joinedload`로 명시적 로딩. 관계 기본값 `lazy="raise"`.
- **모듈 간 호출의 N+1 주의**: (a) 공개 API를 루프 안에서 부르지 않는다 — 배치 조회 계약(`find_many_by_ids`)을 제공한다.
- **핫패스 경량화**: 고빈도 경로는 단건 인덱스 조회 + 캐시(TTL·무효화 동반).
- **워커·풀 사이징**: 워커 프로세스마다 풀이 따로 생긴다 — `pool_size`·`max_overflow` × 워커 수 ≤ DB `max_connections`.

| 경로 부류 | 예 | 목표(예시 — 프로젝트 확정) | 도달 레버 |
|---|---|---|---|
| 캐시/인증 핫패스 | 키 검증·캐시 조회 | 고 TPS/워커 | 캐시(TTL+무효화) |
| 일반 읽기 | 목록·상세 | 수백~수천 TPS/인스턴스 | 인덱스·keyset·명시적 eager 로딩 |
| 쓰기 | 생성·수정 | 수백 TPS | 무거운 작업은 비동기 워커로 |
| 모듈 간 통합 | 공개 API·이벤트 | 배치 1회 | 루프 내 호출 금지·배치 계약 |

---

## 9. TDD 워크플로 (요약)

```
RED   모듈 service 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. 테스트 없는 service 변경 금지. 프레임워크는 **pytest**(+`pytest-asyncio`).
- 모듈 테스트는 그 모듈만으로 돌아야 한다. 다른 모듈을 기동해야 통과하는 테스트는 경계가 새고 있다는 신호다.

| 대상 | 도구 | 비고 |
|---|---|---|
| `core` | pytest (+ hypothesis) | 순수 함수·예외 계층 |
| 모듈 `service` | pytest + 손수 짠 fake(repository Protocol) | 규칙·트랜잭션 순서. 앱 미기동 |
| 모듈 `repository` | pytest + 실제 DB(testcontainers 선택) | 쿼리·매핑·격리 정책 |
| 모듈 `router` | pytest + `httpx.AsyncClient(ASGITransport)` | 라우터 slice, envelope·status |
| 모듈 간 통합 | pytest + 조립된 앱 | (a)/(b)/(c) 경로 계약 확인 |
| `architecture` | `lint-imports` + 보조 테스트 | 독립·레이어 계약(§3.2) |

- 검증 게이트: `bash scripts/verify.sh` (CI·pre-commit·hook이 모두 이 스크립트를 호출).

---

## 10. 새 모듈/기능 추가 워크플로

1. **모듈 결정**: 기존 모듈 안인지 새 기능 모듈인지 먼저 답한다. "어느 모듈이 이 데이터를 소유하는가"로 판단한다.
2. **(신규 모듈)** `src/{{PACKAGE_NS}}/modules/<feature>/` 생성(`__init__.py`·`router`·`schema`·`service`·`repository`·`model`·`exceptions`) → `pyproject.toml`의 (1)·(2) 계약에 등록(등록 누락 = 강제 누락) → `main.py`에 라우터 등록.
3. **TDD 사이클**: `service`(fake repository) → `repository`(실제 DB) → `router`(`AsyncClient`, 응답은 envelope) → `main`(등록·smoke).
4. **다른 모듈이 필요하면** §4의 (a)/(b)/(c) 중 하나를 고르고 그 이유를 `.agents/docs/decisions/`에 한 줄 남긴다.
5. **검증**: `bash scripts/verify.sh` 통과 + OpenAPI 스냅샷/문서 동기화(`.agents/docs/openapi`).
6. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록.

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- 다른 모듈의 내부 파일(`modules/other/service.py` 등)을 직접 import.
- 다른 모듈이 소유한 테이블을 직접 조회하거나 조인.
- 모듈 간에 ORM 모델·`Session`을 인자로 넘기기.
- `shared`/`core`가 `modules`를 import(공유 커널이 기능에 오염).
- 라우터가 `repository`를 직접 호출(레이어 건너뛰기).
- 라우터가 ORM 모델을 그대로 반환(응답 스키마·envelope 우회).
- `service`/`repository`/`model`에서 `fastapi`·`HTTPException` 참조.
- 리포지토리가 `commit()`/`rollback()` 호출(트랜잭션 경계 분산).
- 모듈을 넘는 단일 트랜잭션을 억지로 만들기.
- `async def` 안의 blocking I/O, 참조 없는 `asyncio.create_task` fire-and-forget.
- `shared`를 잡동사니 창고로 쓰기(역할이 정의되지 않은 헬퍼 축적).
- 순환 import를 함수 내부 import로 우회(설계 결함 은폐).
- 테스트 없이 `service` 코드 추가.

---

## 12. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `layered` (모듈이 하나로 수렴할 때) | `modules/<x>/{model,repository,service,schema,router}.py` 를 `models/`·`repositories/`·`services/`·`schemas/`·`api/routers/` 로 펼친다. `shared/` 는 그대로 둔다. | `independence` + `containers` 계약을 전역 `layers` 계약 하나로 교체 |
| → `hexagonal` (도메인 규칙이 복잡해질 때) | 모듈 하나를 바운디드 컨텍스트로 승격: `service.py` → `<ctx>/application/usecase/`, `repository.py`+`model.py` → `<ctx>/infra/persistence/`, `router.py`+`schema.py` → `<ctx>/primary/web/`. ORM과 분리된 순수 도메인 모델을 `<ctx>/domain/` 에 새로 만든다(가장 큰 작업). | `containers`·`layers` 를 `["primary : infra", "application", "domain"]` 로 교체, `domain → 프레임워크` forbidden 추가. `independence` 계약은 그대로 유지(모듈 = 컨텍스트) |
| → 모듈 분리(별도 서비스) | 모듈 디렉터리를 새 리포로 옮기고 §4의 (a)/(b) 호출을 HTTP/메시지로 바꾼다. | 남은 쪽 계약에서 그 모듈을 제거하고, 호출 지점은 `.agents/rules/reliability.md`의 타임아웃·재시도 규약을 적용 |

- 모듈러의 이점은 여기서 나온다: 독립 계약을 지켜왔다면 분리 비용이 "디렉터리 이동 + 호출 방식 교체"로 끝난다. 계약을 느슨하게 뒀다면 분리는 불가능에 가깝다.
- 전환은 **한 번에 한 모듈씩** 옮기고 각 단계마다 `scripts/verify.sh`를 통과시킨다.
- 전환 시작 전 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).

---

## 13. 관련 문서

- 스택·구조·보안·API 규약 원본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
