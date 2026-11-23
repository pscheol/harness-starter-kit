<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 아키텍처: modular · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 모듈러(패키지 바이 피처) 레이아웃 — {{PROJECT_NAME}}

이 프로젝트는 모듈러 모놀리스를 src 레이아웃 + import 계약 린터로 강제한다.
코드는 기술 레이어가 아니라 **기능 모듈**로 먼저 나뉘고, 모듈 안에서만 얇은 레이어(router → service → repository → model)를 유지한다.
Python에는 모듈 의존을 막는 컴파일러가 없으므로, `import-linter` 계약이 컴파일 강제를 대신한다. 위반은 리뷰가 아니라 `scripts/verify.sh` 실패로 막힌다.
아키텍처 상세 원본(선택 기준·전환 가이드 포함)은 `ARCHITECTURE.md`.

## 리포 레이아웃 (src layout)

```
{{PROJECT_SLUG}}/
├── pyproject.toml              # 의존성·도구 설정·import-linter 계약의 단일 소스
├── uv.lock                     # 잠금 파일(커밋 필수)
├── src/
│   └── {{PACKAGE_NS}}/
│       ├── __init__.py
│       ├── core/               # 서드파티 0. 예외 계층·ErrorCode·상수
│       ├── shared/             # 공유 커널: db(Base·session)·settings·envelope·deps·미들웨어
│       ├── modules/
│       │   ├── {{DOMAIN_EXAMPLE}}/
│       │   │   ├── __init__.py     # 모듈 공개 API(다른 모듈은 여기만 본다)
│       │   │   ├── router.py       # HTTP 경계
│       │   │   ├── schema.py       # 요청·응답 DTO(Pydantic v2)
│       │   │   ├── service.py      # 비즈니스 규칙 · 트랜잭션 경계
│       │   │   ├── repository.py   # 쿼리·매핑
│       │   │   ├── model.py        # 이 모듈이 소유하는 ORM 모델
│       │   │   ├── exceptions.py   # 모듈 고유 예외(core 상속)
│       │   │   └── contract.py     # (선택) 다른 모듈에 제공하는 읽기 계약·이벤트
│       │   └── auth/ ...
│       └── main.py             # app factory · 모듈 라우터 등록 · lifespan
├── tests/
│   ├── modules/{{DOMAIN_EXAMPLE}}/{unit,integration,e2e}/
│   └── architecture/
├── migrations/                 # Alembic
├── scripts/verify.sh           # 단일 검증 게이트
└── docs/
```

- src 레이아웃을 쓴다. 테스트가 설치된 패키지를 import하게 되어 "로컬 경로 덕분에만 동작하는" 사고를 막는다.
- **테스트도 모듈 단위로 미러링**한다. 한 모듈을 지우면 그 모듈 테스트도 같이 사라져야 한다.
- 모듈 루트 `__init__.py`만 재수출(공개 API 표면)을 담는다. 나머지 `__init__.py`는 비워두고 로직·부작용을 넣지 않는다.
- 모듈이 커지면 파일을 디렉터리로 승격한다(`service.py` → `service/{create,update,query}.py`). **레이어 이름은 유지**한다 — 계약이 이름 기준이다.

## 레이어 ↔ 의존 가능 (import-linter 강제)

| 파일/패키지 | 책임 | 의존 가능 |
|---|---|---|
| `{{PACKAGE_NS}}.main` | app factory·모듈 라우터 등록 | 전부(조립 목적) |
| `modules/<f>/router` | 경로·`Depends`·상태코드 | `service`, `schema`, `shared`, `core` |
| `modules/<f>/schema` | 경계 DTO(Pydantic) | `core` |
| `modules/<f>/service` | 비즈니스 규칙·트랜잭션 경계 | `repository`, `schema`, `shared`, `core` |
| `modules/<f>/repository` | 쿼리·매핑 | `model`, `shared`, `core` |
| `modules/<f>/model` | ORM 모델(모듈 소유 테이블) | `shared`(Base), `core` |
| `{{PACKAGE_NS}}.shared` | db·settings·envelope·deps | `core` |
| `{{PACKAGE_NS}}.core` | 예외·에러코드·상수 | — (stdlib만) |

- **의존 금지(게이트 차단)**: 모듈 A → 모듈 B의 내부 파일, `service → router`, `repository → service/router`, `model → 위 전부`, `shared → modules`, `core → 서드파티`.
- 계약 선언과 추가 절차는 `ARCHITECTURE.md` §3.2. 새 모듈을 만들면 `independence`의 `modules`와 `layers`의 `containers` 양쪽에 등록해야 강제 대상이 된다.

## 모듈 간 통합 (이 변형의 핵심 규칙)

모듈은 서로의 내부 파일을 import하지 않는다. 통합이 필요하면 셋 중 하나를 고른다.

| 방식 | 언제 | 형태 |
|---|---|---|
| (a) 공개 API 경유 | 동기 읽기·간단한 질의 | 제공 모듈의 `__init__.py`(또는 `contract.py`)가 노출한 함수/DTO만 호출 |
| (b) 조립 지점 주입 | 쓰기·정책이 얽힐 때 | 소비 모듈이 `Protocol`을 선언하고 `main.py`가 제공 모듈 구현을 주입(모듈 A는 B를 모른다) |
| (c) 도메인 이벤트 | 부수 효과·비동기 | 제공 모듈이 발행, 소비 모듈이 핸들러 등록. 실패·재시도는 소비 쪽 책임 |

```python
# (b) 소비 모듈이 필요한 것만 Protocol 로 선언한다 — 제공 모듈을 import 하지 않는다.
# modules/{{DOMAIN_EXAMPLE}}/service.py
from typing import Protocol

class OwnerLookup(Protocol):
    async def find_display_name(self, owner_id: int) -> str | None: ...
```

- (a)도 DTO만 오간다. 다른 모듈의 ORM 모델·`Session`을 넘기지 않는다.
- 다른 모듈이 소유한 테이블을 직접 조회·조인하지 않는다. 조인이 꼭 필요하면 경계가 잘못됐다는 신호다 — 모듈을 합치거나 읽기 계약을 만든다.
- 모듈을 넘는 단일 트랜잭션을 만들지 않는다. 한 요청이 두 모듈을 바꿔야 하면 (c) 이벤트 + 멱등 처리로 최종 일관성을 택한다.
- 모듈 간 호출을 루프 안에서 하지 않는다(N+1). 필요하면 배치 계약(`find_many_by_ids`)을 제공한다.

## 패키지·네이밍 컨벤션

- 모듈명은 **기능/도메인 개념 단수형**(`{{DOMAIN_EXAMPLE}}`·`auth`·`billing`). `utils`·`misc` 같은 모듈을 만들지 않는다.
- 네이밍: 모듈·함수·변수 `snake_case`, 클래스 `PascalCase`, 상수 `UPPER_SNAKE_CASE`, 내부 전용은 `_leading_underscore`.
  - 클래스는 모듈이 네임스페이스이므로 접두사를 반복하지 않는다(`{{DOMAIN_EXAMPLE}}.service.Service`가 아니라 역할이 드러나는 `{{DOMAIN_EXAMPLE}}Service` 하나면 충분하다).
- ORM 모델은 라우터 응답으로 나가지 않는다. 반드시 `schema`의 DTO로 변환해 반환한다.
- **트랜잭션 경계는 service**: 세션은 `shared/deps.py`가 요청 스코프로 만들어 주입하고 커밋은 서비스가 한다. 리포지토리는 커밋하지 않는다.
- 모듈 고유 설정은 `shared/settings.py` 안에서 **그 모듈 소유 섹션**으로 분리한다(모듈을 떼어낼 때 설정도 따라가게).
- DB 접근: SQLAlchemy 2.0 `select()`/`session.execute`. 복잡 조회·keyset cursor는 `repository`의 별도 메서드로 분리한다. 원시 SQL은 지양(불가피하면 Why 주석 + 파라미터 바인딩 필수).

## 새 모듈/기능 착수 워크플로

1. **모듈 결정**: 기존 모듈 안인지 새 기능 모듈인지 먼저 답한다. 판단 기준은 "어느 모듈이 이 데이터를 소유하는가".
2. (신규 모듈이면) `src/{{PACKAGE_NS}}/modules/<feature>/` 생성 → `pyproject.toml` 계약 두 곳(`independence.modules` · `layers.containers`)에 등록(누락 시 강제되지 않는다) → `main.py`에 라우터 등록.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `service`: fake 리포지토리로 규칙·트랜잭션 순서 테스트 → Protocol 정의 → 서비스 구현.
   2. `repository`: 통합 테스트(실제 DB) → 쿼리·매핑 구현(격리 정책 포함).
   3. `router`: `httpx.AsyncClient(ASGITransport)` 테스트 → 라우터·스키마 구현. **응답은 공통 envelope**.
   4. `main`: 라우터 등록·smoke 테스트.
4. **다른 모듈이 필요하면** 위 (a)/(b)/(c) 중 하나를 고르고 이유를 `.agents/docs/decisions/`에 한 줄 남긴다.
5. **검증**: `bash scripts/verify.sh`(ruff·mypy·lint-imports·pytest) 통과 + OpenAPI/문서 동기화(`.agents/docs/openapi`).
6. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (계약 린터의 보완)

`import-linter`가 모듈 독립성과 레이어 방향을 막는다. 그러나 계약이 못 잡는 위반이 있다:
모듈 공개 API가 ORM 모델을 노출, 리포지토리의 `commit()` 호출, 라우터가 모델을 그대로 반환 등.
이런 것은 `tests/architecture/`의 테스트로 강제한다(게이트가 자동 실행).

```python
# tests/architecture/test_module_rules.py
"""모듈 규율 중 import-linter 가 못 잡는 것을 테스트로 강제한다."""
import pathlib

MODULES = pathlib.Path("src/{{PACKAGE_NS}}/modules")

def test_리포지토리는_commit_을_호출하지_않는다() -> None:
    """트랜잭션 경계는 service 소유다. 리포지토리가 커밋하면 부분 반영이 생긴다."""
    for path in MODULES.glob("*/repository*.py"):
        assert ".commit()" not in path.read_text(encoding="utf-8"), f"{path}: 경계는 service 에 둔다"

def test_모듈_공개_api_는_orm_모델을_노출하지_않는다() -> None:
    """공개 API 가 ORM 을 노출하면 모듈을 떼어낼 때 경계가 통째로 무너진다."""
    for path in MODULES.glob("*/__init__.py"):
        assert "from .model" not in path.read_text(encoding="utf-8"), f"{path}: DTO 만 공개한다"
```

> 규칙은 프로젝트에 맞게 늘린다. 핵심은 위반을 `scripts/verify.sh`에서 실패로 만드는 것(리뷰가 아니라 게이트).

## 새 기능 착수 규칙

1. 새 기능은 **한 모듈 안에서 끝나게** 설계한다. 두 모듈을 동시에 고쳐야 한다면 경계를 다시 본다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`(또는 OpenAPI 스냅샷)를 함께 갱신한다.
4. 승격 신호(모듈 service 비대·저장소 교체 요구·DB 없이 규칙 테스트 불가)가 보이면 `ARCHITECTURE.md` §0·§12의 전환 가이드를 연다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
