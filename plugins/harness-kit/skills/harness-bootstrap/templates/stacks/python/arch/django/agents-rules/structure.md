<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 아키텍처: django · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · Django 앱 레이아웃 (services/selectors 분리) — {{PROJECT_NAME}}

이 프로젝트는 Django 앱 단위 구조 + 서비스/셀렉터 레이어를 쓴다.
Django 기본형("뷰가 ORM을 직접 호출")은 규칙이 뷰·시그널·매니저에 흩어지므로, 쓰기는 `services`·읽기는 `selectors` 로 강제 분리하고 뷰는 얇게 유지한다.
경계는 컴파일러가 아니라 **`import-linter` 계약**이 막는다. 위반은 리뷰가 아니라 `scripts/verify.sh` 실패로 걸린다.
아키텍처 상세 원본(선택 기준·전환 가이드 포함)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── manage.py
├── pyproject.toml              # 의존성·도구 설정·import-linter 계약의 단일 소스
├── uv.lock                     # 잠금 파일(커밋 필수)
├── config/
│   ├── settings/
│   │   ├── base.py             #   공통 설정(비밀값 없음 — env 에서 읽는다)
│   │   ├── dev.py · prod.py · test.py
│   ├── urls.py · asgi.py · wsgi.py · celery.py(선택)
├── {{PACKAGE_NS}}/             # 앱 네임스페이스 패키지 (관례상 apps)
│   ├── core/                   #   예외·ErrorCode·베이스 모델(TimeStamped)·미들웨어·페이지네이션
│   └── {{DOMAIN_EXAMPLE}}/
│       ├── apps.py · admin.py
│       ├── models.py           #   테이블·제약·인덱스·QuerySet/Manager
│       ├── selectors.py        #   읽기 전용 조회(부작용 없음)
│       ├── services.py         #   쓰기·규칙·transaction.atomic 경계
│       ├── serializers.py      #   요청·응답 DTO(DRF)
│       ├── views.py · urls.py  #   HTTP 경계
│       ├── tasks.py            #   (선택) 비동기 작업 — 얇은 래퍼
│       └── migrations/
├── tests/{{DOMAIN_EXAMPLE}}/   # 앱 구조를 미러링
├── static/ · templates/        # (서버 렌더링을 쓴다면)
├── scripts/verify.sh           # 단일 검증 게이트
└── docs/
```

- 앱은 **네임스페이스 패키지 아래**에 모은다(`{{PACKAGE_NS}}/<app>/`). `startapp` 후 `apps.py`의 `name`을 `{{PACKAGE_NS}}.<app>` 으로 고치고 `INSTALLED_APPS`에 같은 경로로 등록한다.
- 앱이 커지면 파일을 디렉터리로 승격한다(`services.py` → `services/{create,update}.py` + `__init__.py` 재수출). **레이어 이름은 유지**한다 — 계약이 이름 기준이다.
- 테스트는 앱 구조를 미러링한다. 한 앱을 지우면 그 테스트도 같이 사라져야 한다.

## 레이어 ↔ 의존 가능 (import-linter 강제)

| 파일 | 책임 | 의존 가능 |
|---|---|---|
| `urls.py` | 라우팅 | `views` |
| `views.py` | 권한 검사·입력 파싱·**services/selectors 호출**·응답 구성 | `serializers`, `services`, `selectors`, `core` |
| `serializers.py` | 경계 DTO(DRF)·필드 검증 | `models`(참조용), `core` |
| `services.py` | **쓰기**: 규칙·`transaction.atomic` 경계·작업 발행 | `models`, `core` |
| `selectors.py` | **읽기**: 조회·필터·집계(부작용 없음) | `models`, `core` |
| `models.py` | 테이블·제약·인덱스·`QuerySet`/`Manager`·상태 불변식 | `core` |
| `{{PACKAGE_NS}}.core` | 예외·ErrorCode·베이스 모델·미들웨어 | — (Django만) |

- **의존 금지(게이트 차단)**: `services ↔ selectors`(형제), `services/selectors → views`, `models → 위 전부`, `models·selectors·services → rest_framework`, 앱 A → 앱 B의 내부 모듈.
- 뷰는 ORM을 직접 부르지 않는다. `Model.objects...`가 `views.py`에 있으면 규칙이 뷰로 새는 시작점이다.
- `services`가 조회가 필요하면 **`selectors`를 부르지 않고** 그 조회를 자기 안에 두거나 `models`의 `QuerySet` 메서드로 내린다(재사용 지점은 매니저다).
- 계약 선언과 추가 절차는 `ARCHITECTURE.md` §3.2. 새 앱은 `containers`와 `independence.modules` 양쪽에 등록해야 강제 대상이 된다.

## 앱 간 통합

앱은 서로의 내부 모듈(`services`·`selectors`·`models`)을 직접 import하지 않는다.

| 방식 | 언제 | 형태 |
|---|---|---|
| (a) 공개 API 경유 | 동기 읽기·간단한 질의 | 제공 앱의 `api.py`가 노출한 함수·DTO만 호출 |
| (b) 조립 지점 주입 | 쓰기·정책이 얽힐 때 | 소비 앱이 `Protocol` 선언, 앱 config/설정이 구현 주입 |
| (c) 명시적 이벤트 | 부수 효과·비동기 | 제공 앱 `services`가 발행, 소비 앱이 작업으로 처리(시그널 대신) |

- **`ForeignKey`는 문자열 참조**(`"{{PACKAGE_NS}}.auth.User"`)로 걸어 모듈 import를 만들지 않는다. 관계는 허용하되 로직 import는 막는다.
- 다른 앱이 소유한 테이블을 직접 조회·조인하지 않는다. 조인이 꼭 필요하면 경계가 잘못됐다는 신호다.

## Django 고유 규율 (요약 — 상세는 ARCHITECTURE.md §4)

- **설정**: `SECRET_KEY`·DB 비밀번호는 env에서 읽고 없으면 부팅 실패. 프로덕션 `DEBUG=False` + `ALLOWED_HOSTS` 명시. 배포 전 `manage.py check --deploy`.
- **User 모델**: 커스텀 `AUTH_USER_MODEL`을 첫 마이그레이션 전에 정한다(나중 교체 비용이 매우 크다).
- **마이그레이션**: 코드와 함께 커밋. 게이트가 `makemigrations --check --dry-run`으로 드리프트를 차단한다. 파괴적 변경은 확장→이중 쓰기→백필→축소로 나눈다.
- **제약**: 무결성은 DB 제약으로도 건다(`UniqueConstraint`·`CheckConstraint`). 애플리케이션 검증만으로는 동시성에서 뚫린다.
- **트랜잭션**: 경계는 `services`의 `transaction.atomic()`. 블록 안에서 외부 HTTP·메일·큐 발행 금지 — `transaction.on_commit(...)`으로 미룬다.
- **시그널 금지(원칙)**: 부수 효과는 `services`에서 명시적으로 호출한다. 프레임워크 훅이 불가피하면 핸들러는 얇게.
- **작업(task)**: 인자로 모델 인스턴스를 넘기지 않는다(PK 전달). 멱등하게 만들고 재시도 정책을 명시한다.
- **async 주의**: ORM은 동기다. `async def` 뷰 안에서 동기 ORM 직접 호출 금지. 실익이 없으면 동기 뷰를 유지한다.

## 네이밍 컨벤션

- 앱명은 **도메인 개념 단수형 소문자**(`{{DOMAIN_EXAMPLE}}`·`billing`·`audit`). `utils`·`misc` 앱을 만들지 않는다.
- 모듈·함수·변수 `snake_case`, 클래스 `PascalCase`, 상수 `UPPER_SNAKE_CASE`, 내부 전용은 `_leading_underscore`.
- 서비스·셀렉터는 **동사로 시작하는 모듈 함수**를 기본으로 한다(`create_{{DOMAIN_EXAMPLE}}(...)` · `list_active_{{DOMAIN_EXAMPLE}}s(...)`). 상태를 들고 있을 이유가 있을 때만 클래스로 올린다.
- 상태·역할·액션 라벨은 `models.TextChoices`로 정의한다(문자열 리터럴 금지).
- 모델 인스턴스를 응답으로 내보내지 않는다. 반드시 `serializers`를 거친다.

## 새 앱/기능 착수 워크플로

1. **앱 결정**: 기존 앱 안인지 새 앱인지 먼저 답한다. 판단 기준은 "어느 앱이 이 데이터를 소유하는가".
2. (신규 앱이면) `python manage.py startapp <name> {{PACKAGE_NS}}/<name>` → `apps.py`의 `name` 수정 → `INSTALLED_APPS` 등록 → `pyproject.toml` 계약 두 곳에 등록(누락 시 강제되지 않는다) → `config/urls.py`에 URL 포함.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `services`: 규칙·트랜잭션 경계·`on_commit` 동작 테스트 → 구현.
   2. `selectors`: 조회 테스트 + `assertNumQueries`로 **쿼리 수 회귀 차단** → 구현(`select_related`/`prefetch_related` 명시).
   3. `views`: `APIClient`로 권한·상태코드·응답 스키마 테스트 → 뷰·시리얼라이저 구현.
   4. 마이그레이션 생성·검토(되돌릴 수 있는지 확인).
4. **다른 앱이 필요하면** 위 (a)/(b)/(c) 중 하나를 고르고 이유를 `.agents/docs/decisions/`에 한 줄 남긴다.
5. **검증**: `bash scripts/verify.sh`(ruff·mypy·lint-imports·마이그레이션 드리프트·pytest) 통과 + OpenAPI/문서 동기화(`.agents/docs/openapi`).
6. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (계약 린터의 보완)

`import-linter`가 레이어 방향과 앱 독립성을 막는다. 그러나 계약이 못 잡는 위반이 있다:
뷰의 ORM 직접 호출, `atomic` 안의 외부 호출, 시그널 등록 등.
이런 것은 `tests/architecture/`의 테스트로 강제한다(게이트가 자동 실행).

```python
# tests/architecture/test_layer_rules.py
"""레이어 규율 중 import-linter 가 못 잡는 것을 테스트로 강제한다."""
import pathlib

APPS = pathlib.Path("{{PACKAGE_NS}}")

def test_뷰는_orm_을_직접_호출하지_않는다() -> None:
    """뷰가 ORM 을 직접 만지면 규칙이 뷰로 새고 재사용이 불가능해진다."""
    for path in APPS.glob("*/views.py"):
        source = path.read_text(encoding="utf-8")
        assert ".objects." not in source, f"{path}: services/selectors 를 통해 조회한다"

def test_시그널_수신자를_등록하지_않는다() -> None:
    """시그널 부수 효과는 호출 지점에서 보이지 않아 순서·테스트·디버깅이 무너진다."""
    for path in APPS.glob("*/*.py"):
        source = path.read_text(encoding="utf-8")
        assert "@receiver(" not in source, f"{path}: 부수 효과는 services 에서 명시적으로 호출한다"
```

> 규칙은 프로젝트에 맞게 늘린다. 핵심은 위반을 `scripts/verify.sh`에서 실패로 만드는 것(리뷰가 아니라 게이트).

## 새 기능 착수 규칙

1. 새 기능은 **한 앱 안에서 끝나게** 설계한다. 두 앱을 동시에 고쳐야 한다면 경계를 다시 본다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`(또는 OpenAPI 스냅샷)를 함께 갱신한다.
4. 승격 신호(`services.py` 비대·시그널 확산·DB 없는 단위 테스트 불가)가 보이면 `ARCHITECTURE.md` §0·§12의 전환 가이드를 연다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
