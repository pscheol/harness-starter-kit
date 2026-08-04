<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Python 백엔드 · 아키텍처: django -->

# ARCHITECTURE — {{PROJECT_NAME}} (Django)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 정본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 **Django 앱 단위 구조 + 서비스/셀렉터 레이어**를 쓴다.
Django의 기본형("뷰가 ORM을 직접 호출")은 규칙이 뷰·시그널·매니저에 흩어지므로, 이 프로젝트는 **쓰기는 `services`, 읽기는 `selectors`** 로 강제 분리하고 뷰는 얇게 유지한다.
경계는 컴파일러가 아니라 **import 계약 린터(import-linter) + 타입 체커(mypy) + 린터(Ruff)** 가 검증 게이트에서 막는다.

스택 기준(버전 정본은 `pyproject.toml` + lock 파일 단일 소스 — 구체 버전은 **예시이며 프로젝트에서 최신 안정 버전으로 확정**):
**Python 3.12+** · **Django 5.x** · **Django REST Framework**(API를 낸다면) · **PostgreSQL** · **uv**(또는 Poetry) · **Ruff · mypy(+django-stubs) · pytest-django · import-linter**.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 관리자 화면(Django Admin)·인증·권한·폼·마이그레이션을 **프레임워크가 주는 대로** 쓰는 것이 가장 큰 이득이다.
- 데이터 모델 중심 서비스이고 관계형 DB 하나가 진실의 원천이다.
- 팀이 Django 생태계(ORM·DRF·Celery)에 익숙하고 배터리 포함의 속도가 필요하다.
- 서버 렌더링 화면과 API가 한 코드베이스에 공존한다.

**쓰지 않는다:**
- 고동시성 async I/O가 핵심이다(Django ORM은 동기다 — ASGI 위에서도 쿼리는 `sync_to_async` 경유) → `hexagonal`·`layered`(FastAPI).
- 도메인 규칙이 복잡해 ORM과 분리된 순수 모델·불변식이 필요하다 → `hexagonal`.
- LLM 파이프라인·평가 하네스가 1급 관심사다 → `ai-service`.
- Admin·인증·마이그레이션을 쓰지 않을 거라면 Django를 고를 이유가 대부분 사라진다.

**승격 신호(이 중 둘 이상이면 구조를 다시 본다):**
1. `services.py`가 800줄을 넘고 여러 앱의 모델을 직접 만진다(앱 경계가 잘못 그어졌다).
2. 시그널로 부수 효과를 엮기 시작해 실행 순서를 아무도 설명하지 못한다.
3. 도메인 규칙 테스트에 매번 DB가 필요해 단위 테스트가 느려진다 → `hexagonal` 검토.

전환 절차는 §12.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 레이어 단방향 (views → services·selectors → models) | `import-linter` layers 계약 | `lint-imports` 실패 → 게이트 차단 |
| **쓰기/읽기 분리** (services ↔ selectors 상호 import 금지) | `import-linter` layers 계약의 형제 선언 | 게이트 차단 |
| 앱 간 독립 | `import-linter` independence 계약 | 게이트 차단 |
| 안쪽 레이어는 DRF 무의존 | `import-linter` forbidden 계약(models·selectors·services → rest_framework 금지) | 게이트 차단 |
| 마이그레이션 드리프트 없음 | `manage.py makemigrations --check --dry-run` | 게이트 차단 |
| 설정에 비밀값 없음 | env 로드 + `.agents/rules/security.md` 스캔 | 게이트 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(services·selectors 우선) | `pytest --cov-fail-under` 게이트 |

> **기계적 강제 우선**. Django는 "무엇이든 어디서든 import되는" 구조라 규율만으로는 레이어가 유지되지 않는다.
> 계약(`pyproject.toml`의 `[tool.importlinter]`)은 아키텍처 문서와 같은 무게로 관리한다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌──────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}     │
 │(Web/API) │        │  (Django · ASGI/WSGI) │
 └──────────┘        └──────────┬───────────┘
                                │
        ┌──────────────┬────────┴───────┬──────────────┐
        ▼              ▼                ▼              ▼
  ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
  │ PostgreSQL │ │ Cache/Broker│ │ Object Store│ │ 외부 시스템 │
  │            │ │  (선택)      │ │  (선택)      │ │  (선택)     │
  └────────────┘ └─────────────┘ └─────────────┘ └────────────┘
```

- 애플리케이션 인스턴스는 **무상태**. 세션·캐시·락 상태는 외부 저장소에 둔다(`SESSION_ENGINE`을 로컬 메모리로 두지 않는다).
- 배포 단위는 **Gunicorn(WSGI) 또는 Uvicorn/Daphne(ASGI) + 컨테이너**. 정적 파일은 WhiteNoise 또는 CDN.
- 비동기 작업(메일·배치·색인)은 요청 경로 밖의 워커(Celery 등)로 분리한다.

---

## 3. 앱 구조

```
        요청
         │
    ┌────▼──────────────────────────────────────────┐
    │ views.py / urls.py   HTTP 경계 · 권한 · 직렬화 │  DRF 를 아는 유일한 레이어
    └────┬───────────────────────────┬──────────────┘
         │                           │
   ┌─────▼─────────┐         ┌───────▼────────┐
   │ services.py   │         │ selectors.py   │   서로 import 하지 않는다(형제)
   │  쓰기 · 규칙   │         │  읽기 · 조회    │
   │  트랜잭션 경계 │         │  (부작용 없음)  │
   └─────┬─────────┘         └───────┬────────┘
         └───────────┬───────────────┘
              ┌──────▼───────────────────────┐
              │ models.py  ORM · 제약 · 매니저 │
              └──────┬───────────────────────┘
              ┌──────▼───────────────────────┐
              │ {{PACKAGE_NS}}/core  예외·에러코드·베이스 모델 │
              └──────────────────────────────┘
```

### 3.1 레이어 ↔ 책임

| 파일 | 책임 | 의존 가능 |
|---|---|---|
| `urls.py` | 라우팅 | `views` |
| `views.py` | 권한 검사, 입력 파싱(serializer), **services/selectors 호출**, 응답 구성 | `serializers`, `services`, `selectors`, `core` |
| `serializers.py` | 요청·응답 DTO(DRF) · 필드 수준 검증 | `models`(참조용), `core` |
| `services.py` | **쓰기**: 비즈니스 규칙, `transaction.atomic` 경계, 이벤트/작업 큐 발행 | `models`, `core` |
| `selectors.py` | **읽기**: 조회·필터·집계. 부작용 없음 | `models`, `core` |
| `models.py` | 테이블·제약·인덱스·`QuerySet`/`Manager`·상태 불변식 메서드 | `core` |
| `{{PACKAGE_NS}}.core` | 예외 계층·`ErrorCode`·베이스 모델(`TimeStamped`)·미들웨어 | — (Django만) |

- **의존 금지(게이트 차단)**: `services ↔ selectors`(형제), `services/selectors → views`, `models → 위 전부`, `models·selectors·services → rest_framework`, **앱 A → 앱 B의 내부 모듈**.
- **뷰는 ORM을 직접 부르지 않는다.** `Model.objects...`가 `views.py`에 있으면 규칙이 뷰로 새는 시작점이다.
- `services`가 조회가 필요하면 **`selectors`를 부르지 않고** 그 조회를 자기 안에 두거나 `models`의 `QuerySet` 메서드로 내린다(재사용 지점은 매니저다). 이 규칙이 읽기/쓰기 경로가 서로 얽히는 것을 막는다.

### 3.2 import-linter 계약 (컴파일 강제의 대체물)

`pyproject.toml`에 계약을 선언하고 `scripts/verify.sh`가 `lint-imports`를 호출한다.

```toml
[tool.importlinter]
root_packages = ["config", "{{PACKAGE_NS}}"]

# (1) 앱 내부 레이어: services 와 selectors 는 형제(서로 import 금지)
[[tool.importlinter.contracts]]
name = "앱 내부 레이어 단방향"
type = "layers"
containers = [
  "{{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}}",
  "{{PACKAGE_NS}}.auth",
]
layers = ["views", "services : selectors", "models"]

# (2) 앱 간 독립 — 통합은 공개 API·시그널이 아니라 명시적 계약으로
[[tool.importlinter.contracts]]
name = "앱 간 독립"
type = "independence"
modules = [
  "{{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}}",
  "{{PACKAGE_NS}}.auth",
]

# (3) 안쪽 레이어는 DRF 를 모른다
[[tool.importlinter.contracts]]
name = "models·selectors·services 는 DRF 무의존"
type = "forbidden"
source_modules = [
  "{{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}}.models",
  "{{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}}.selectors",
  "{{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}}.services",
]
forbidden_modules = ["rest_framework"]

# (4) 설정 패키지는 앱 로직을 모른다(순환 로딩·부팅 순서 사고 방지)
[[tool.importlinter.contracts]]
name = "config 는 앱 내부를 모른다"
type = "forbidden"
source_modules = ["config.settings"]
forbidden_modules = ["{{PACKAGE_NS}}"]
```

> **새 앱을 만들면 (1)의 `containers`와 (2)의 `modules`에 반드시 등록**한다. 등록하지 않은 앱은 강제 대상 밖이다(등록 누락 = 강제 누락).
> `config/urls.py`는 모든 앱의 URL을 모으므로 (4)의 대상은 `config.settings`로 좁힌다.

### 3.3 디렉터리 레이아웃

```
{{PROJECT_SLUG}}/
├── manage.py
├── pyproject.toml              # 의존성·도구 설정 단일 소스(+ [tool.importlinter])
├── uv.lock                     # 잠금 파일(커밋 필수)
├── config/
│   ├── settings/
│   │   ├── base.py             #   공통 설정(비밀값 없음 — env 에서 읽는다)
│   │   ├── dev.py · prod.py · test.py
│   ├── urls.py · asgi.py · wsgi.py · celery.py(선택)
├── {{PACKAGE_NS}}/             # 앱 네임스페이스 패키지 (관례상 apps)
│   ├── core/                   #   예외·ErrorCode·베이스 모델·미들웨어·페이지네이션
│   └── {{DOMAIN_EXAMPLE}}/
│       ├── apps.py · admin.py
│       ├── models.py · selectors.py · services.py · serializers.py · views.py · urls.py
│       ├── tasks.py            #   (선택) 비동기 작업 — 얇게, 로직은 services 에
│       └── migrations/
├── tests/{{DOMAIN_EXAMPLE}}/   # 앱 구조를 미러링
├── static/ · templates/        # (서버 렌더링을 쓴다면)
├── scripts/verify.sh           # 단일 검증 게이트
└── docs/
```

- **설정은 환경별로 분리**한다(`base` + `dev`/`prod`/`test`). `DJANGO_SETTINGS_MODULE`로 선택한다.
- 앱이 커지면 파일을 디렉터리로 승격한다(`services.py` → `services/{create,update}.py` + `__init__.py` 재수출). **레이어 이름은 유지**한다 — 계약이 이름 기준이다.
- 테스트는 앱 구조를 미러링한다. 한 앱을 지우면 그 테스트도 같이 사라져야 한다.

---

## 4. Django 고유 규약 (필수)

### 4.1 설정·부팅

- **`SECRET_KEY`·DB 비밀번호·외부 키는 코드에 두지 않는다.** env(또는 시크릿 매니저)에서 읽고, 없으면 **부팅 시 실패**시킨다(조용한 기본값 금지).
- **프로덕션에서 `DEBUG = False`**, `ALLOWED_HOSTS`를 명시한다. `DEBUG=True`는 예외 페이지로 설정·쿼리를 노출한다.
- 보안 헤더 기본값을 켠다: `SECURE_SSL_REDIRECT` · `SESSION_COOKIE_SECURE` · `CSRF_COOKIE_SECURE` · `SECURE_HSTS_SECONDS` · `X_FRAME_OPTIONS`.
- 배포 전 `manage.py check --deploy`를 게이트에 넣는다.
- **커스텀 User 모델을 첫 마이그레이션 전에** 정한다(`AUTH_USER_MODEL`). 나중에 바꾸는 비용이 매우 크다.

### 4.2 모델·마이그레이션

- 마이그레이션은 **코드와 함께 커밋**한다. CI에서 `makemigrations --check --dry-run`으로 **드리프트(모델 변경 후 마이그레이션 누락)** 를 차단한다.
- 파괴적 변경(컬럼 삭제·타입 변경)은 **확장 → 이중 쓰기 → 백필 → 축소** 순으로 나눈다. 배포와 마이그레이션이 동시에 도는 순간을 가정한다.
- 대용량 테이블의 인덱스 추가는 동시 생성 옵션(`AddIndexConcurrently`)을 검토한다(잠금 시간 최소화).
- 데이터 무결성은 **DB 제약으로도** 건다(`UniqueConstraint`·`CheckConstraint`). 애플리케이션 검증만으로는 동시성에서 뚫린다.
- 재사용 가능한 조회는 **`QuerySet` 메서드 + `Manager`** 로 내린다(`selectors`가 얇아지고 `services`도 재사용할 수 있다).

### 4.3 트랜잭션

- **쓰기 경계는 `services`의 `transaction.atomic()`**. 뷰나 시그널에서 트랜잭션을 열지 않는다.
- `transaction.atomic()` 블록 안에서 **외부 호출(HTTP·메일·큐 발행)을 하지 않는다.** 커밋 후 실행으로 미룬다(`transaction.on_commit(...)`) — 롤백됐는데 메일이 나가는 사고를 막는다.
- 경쟁 조건이 있는 갱신은 `select_for_update()` 또는 DB 제약 + 재시도로 처리한다. 읽고-검사하고-쓰는 패턴을 트랜잭션 없이 두지 않는다.

### 4.4 시그널 · 비동기 작업

- **시그널은 원칙적으로 쓰지 않는다.** 부수 효과가 호출 지점에서 보이지 않아 실행 순서·테스트·디버깅이 무너진다. 필요한 일은 `services`에서 **명시적으로** 호출한다.
  - 예외: 프레임워크가 요구하는 훅(`post_migrate` 등)이나 앱 경계를 넘는 알림. 이 경우도 핸들러는 얇게, 로직은 `services`에.
- 비동기 작업(`tasks.py`)은 **얇은 래퍼**다: 인자 직렬화 + `services` 호출만. 작업은 **멱등**해야 하고 재시도 정책을 명시한다.
- 작업 인자로 모델 인스턴스를 넘기지 않는다(PK를 넘기고 워커가 다시 읽는다 — 직렬화·오래된 데이터 문제).

### 4.5 async 주의

- Django ORM은 **동기**다. ASGI로 띄워도 쿼리는 스레드 풀(`sync_to_async`) 경유다. `async def` 뷰 안에서 동기 ORM을 직접 호출하면 예외가 난다.
- 뷰를 async로 만들 실익이 없으면 **동기 뷰를 유지**한다. 외부 HTTP 팬아웃처럼 실익이 분명할 때만 async 뷰 + `sync_to_async(...)`로 ORM을 감싼다.
- 고동시성 async가 아키텍처의 핵심 요구라면 이 변형이 아니라 ASGI 네이티브 스택(`hexagonal`·`layered`)을 쓴다.

---

## 5. 앱 간 통합 규약

앱은 서로의 **내부 모듈(`services`·`selectors`·`models`)을 직접 import하지 않는다**(independence 계약).

| 방식 | 언제 | 형태 |
|---|---|---|
| (a) 공개 API 경유 | 동기 읽기·간단한 질의 | 제공 앱의 `api.py`(또는 `__init__.py`)가 노출한 함수·DTO만 호출 |
| (b) 조립 지점 주입 | 쓰기·정책이 얽힐 때 | 소비 앱이 `Protocol`을 선언하고 설정·앱 config가 구현을 주입 |
| (c) 명시적 이벤트 | 부수 효과·비동기 | 제공 앱이 `services`에서 이벤트를 발행하고 소비 앱이 작업으로 처리(시그널 대신) |

- **`ForeignKey`는 문자열 참조**(`"{{PACKAGE_NS}}.auth.User"`)로 걸어 모듈 import를 만들지 않는다. 관계는 허용하되 **로직 import는 막는다**.
- 다른 앱의 테이블을 직접 조회·조인하지 않는다. 조인이 꼭 필요하면 경계가 잘못됐다는 신호다.

---

## 6. 코드 주석 규약 (요약)

- 코드는 라인 단위 What/How를, 주석은 Why를 설명한다. 단 **함수·메서드 docstring은 ① 책임 한 줄 + ② 비자명한 Why + ③ `처리 흐름:`(의도를 곁들인 단계)** 로 로직 이해를 돕는다.
- **타입 힌트가 계약을 담는다** — `Args:`/`Returns:`에 타입을 되풀이하지 않는다. 타입이 못 담는 의미(단위·범위·부작용·예외 조건)만 적는다.
- 마이그레이션 파일에는 **왜 이 변경인지·되돌릴 수 있는지** 한 줄을 남긴다(운영 사고 시 판단 근거).
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 정본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 7. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 도메인 상수 | 상태·역할·액션 라벨 | `models.TextChoices`/`enum.StrEnum`(소유 앱) |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `config/settings/*` + env |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블/기능 플래그(캐시·무효화 동반) |

- 앱 코드가 `os.environ`을 직접 읽지 않는다. **설정은 `django.conf.settings` 한 곳**을 통한다.
- 에러코드·사용자 메시지는 문자열 리터럴 금지: 코드는 `core`의 `ErrorCode`, 메시지는 번역 키로 경계에서 해석한다.
- 가변 기본 인자(`def f(items: list = [])`) 금지 — `None` 기본값 + 내부 생성.

---

## 8. 성능 예산 (부하테스트로 확정)

- **N+1 회피**: `select_related`(FK) · `prefetch_related`(역참조·M2M)를 `selectors`에서 명시한다. 템플릿·시리얼라이저가 조용히 쿼리를 유발하는 경로를 테스트로 잡는다(`assertNumQueries`).
- **무한/대량 결과 금지**: 목록은 페이지네이션 + 상한. `Model.objects.all()`을 그대로 직렬화하지 않는다.
- **필요한 컬럼만**: 큰 테이블 조회는 `.only()`/`.values()`로 좁힌다. `count()` 남용 대신 `exists()`를 쓴다.
- **인덱스**: WHERE/ORDER BY/JOIN 컬럼에 인덱스를 동반한다. 마이그레이션에 인덱스가 함께 들어갔는지 리뷰 항목으로 둔다.
- **커넥션**: 워커 프로세스마다 커넥션이 따로 생긴다 — `CONN_MAX_AGE` × 워커 수가 DB `max_connections`를 넘지 않게 계산한다.
- **캐시**: 고빈도 조회는 캐시(TTL + 무효화 동반). 무효화 없는 캐시는 만들지 않는다.

| 경로 부류 | 예 | 목표(예시 — 프로젝트 확정) | 도달 레버 |
|---|---|---|---|
| 캐시/인증 핫패스 | 세션·권한 확인 | 고 TPS/워커 | 캐시·인덱스 단건 조회 |
| 일반 읽기 | 목록·상세 | 수백~수천 TPS/인스턴스 | `select_related`·페이지네이션·`only()` |
| 쓰기 | 생성·수정 | 수백 TPS | 짧은 `atomic` 블록·외부 호출은 `on_commit` |
| 비동기 작업 | 메일·배치·색인 | 처리량/큐 기준 | 요청 경로 밖·멱등·재시도 |

---

## 9. TDD 워크플로 (요약)

```
RED   services/selectors 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. **테스트 없는 `services` 변경 금지**. 프레임워크는 **pytest + pytest-django**.
- 픽스처는 팩토리(`factory_boy` 등)로 만든다. 앱마다 픽스처가 다른 앱을 필요로 하면 경계가 새고 있다는 신호다.

| 대상 | 도구 | 비고 |
|---|---|---|
| `core` | pytest | 순수 함수·예외 계층 |
| `services` | pytest-django(DB) | 규칙·트랜잭션 경계·`on_commit` 동작 |
| `selectors` | pytest-django + `assertNumQueries` | 조회 정확성 + **쿼리 수 회귀 차단** |
| `views` | pytest-django `APIClient` | 권한·상태코드·응답 스키마 |
| 마이그레이션 | `makemigrations --check --dry-run` | 드리프트 차단 |
| `architecture` | `lint-imports` + 보조 테스트 | 레이어·독립 계약(§3.2) |

- 검증 게이트: `bash scripts/verify.sh` (CI·pre-commit·hook이 모두 이 스크립트를 호출).

---

## 10. 새 앱/기능 추가 워크플로

1. **앱 결정**: 기존 앱 안인지 새 앱인지 먼저 답한다. 판단 기준은 **"어느 앱이 이 데이터를 소유하는가"**.
2. **(신규 앱)** `python manage.py startapp <name> {{PACKAGE_NS}}/<name>` → `apps.py`의 `name`을 `{{PACKAGE_NS}}.<name>`으로 수정 → `INSTALLED_APPS` 등록 → **`pyproject.toml`의 (1)·(2) 계약에 등록**(등록 누락 = 강제 누락) → `config/urls.py`에 URL 포함.
3. **TDD 사이클**: `services`/`selectors`(DB 테스트) → `serializers` → `views`(`APIClient`) → 마이그레이션 생성·검토.
4. **다른 앱이 필요하면** §5의 (a)/(b)/(c) 중 하나를 고르고 이유를 `.agents/docs/decisions/`에 한 줄 남긴다.
5. **검증**: `bash scripts/verify.sh` 통과(마이그레이션 드리프트 체크 포함) + OpenAPI 스냅샷/문서 동기화(`.agents/docs/openapi`).
6. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록.

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- `views.py`에서 `Model.objects...` 직접 호출(레이어 건너뛰기 — 규칙이 뷰로 샌다).
- `services`가 `selectors`를 import하거나 그 반대(형제 계약 위반).
- 모델·셀렉터·서비스에서 `rest_framework` 참조.
- 다른 앱의 `services`·`selectors`·`models`를 직접 import.
- 시그널로 비즈니스 부수 효과를 엮기(실행 순서 불명·테스트 불가).
- `transaction.atomic()` 안에서 외부 HTTP·메일·큐 발행(롤백돼도 나가버린다 — `on_commit` 사용).
- 뷰나 시그널에서 트랜잭션 열기.
- 작업(task) 인자로 모델 인스턴스 전달(PK를 넘긴다).
- 마이그레이션 없이 모델 변경 커밋(드리프트).
- `SECRET_KEY`·DB 비밀번호를 settings에 하드코딩, 프로덕션 `DEBUG=True`.
- `Model.objects.all()`을 페이지네이션 없이 직렬화.
- `async def` 뷰 안에서 동기 ORM 직접 호출.
- 커스텀 User 모델 없이 시작해 나중에 갈아끼우려 시도.
- `except Exception: pass` 또는 로그만 남기고 삼키기(silent failure).
- 테스트 없이 `services` 코드 추가.

---

## 12. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `modular` (프레임워크는 유지, 경계만 더 뚜렷하게) | 이미 앱 = 모듈이다. `views/services/selectors/models`를 앱 안에 유지한 채 **공개 API(`api.py`)를 명시**하고 앱 간 참조를 그쪽으로 몰면 된다. | `independence` 계약은 그대로. `layers` 의 `containers` 에 새 앱을 계속 등록 |
| → `hexagonal`·`layered` (프레임워크 교체) | 사실상 재작성이다. **옮겨 쓸 수 있는 것**: 레이어 책임 구분, 트랜잭션 경계 규칙, 앱=컨텍스트 경계, 테스트 전략. **다시 만들어야 하는 것**: ORM 모델 → 순수 도메인 모델 + 매퍼, Admin 대체, 인증·권한. | `layers` 를 대상 변형의 계약으로 교체. 마이그레이션 히스토리는 Alembic 등으로 이관 |
| → 앱 분리(별도 서비스) | 앱 디렉터리를 새 리포로 옮기고 §5의 (a)/(b) 호출을 HTTP/메시지로 바꾼다. FK 참조는 ID 참조로 끊는다. | 남은 쪽 계약에서 그 앱을 제거. 호출 지점에 `.agents/rules/reliability.md`의 타임아웃·재시도 적용 |

- 전환은 **한 번에 한 앱씩** 옮기고 각 단계마다 `scripts/verify.sh`를 통과시킨다.
- **FK가 앱 경계를 넘는 곳이 분리의 실제 비용**이다. 전환을 염두에 둔다면 경계를 넘는 FK를 미리 ID 참조로 바꿔둔다.
- 전환 시작 전 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).

---

## 13. 관련 문서

- 스택·구조·보안·API 규약 정본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 정본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
