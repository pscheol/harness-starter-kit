<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 아키텍처: layered · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 레이어드 패키지 레이아웃 — {{PROJECT_NAME}}

이 프로젝트는 레이어드 아키텍처(api → services → repositories → models) 를 **src 레이아웃 + import 계약 린터**로 강제한다.
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
│       ├── core/               # 서드파티 0. 예외 계층·ErrorCode·envelope·상수
│       ├── api/                # HTTP 경계 (FastAPI 를 아는 유일한 레이어)
│       │   ├── deps.py         #   Depends 조립(세션·현재 사용자·서비스 팩토리)
│       │   ├── errors.py       #   도메인 예외 → 상태코드·ErrorCode 전역 매핑
│       │   └── routers/{{DOMAIN_EXAMPLE}}.py
│       ├── schemas/            # 요청·응답 DTO(Pydantic v2) — 경계 전용
│       ├── services/           # 비즈니스 규칙 · 트랜잭션 경계
│       ├── repositories/       # 데이터 접근(SQLAlchemy)
│       ├── models/             # ORM 모델(테이블 매핑)
│       ├── settings.py         # pydantic-settings BaseSettings
│       ├── db.py               # async engine · sessionmaker
│       └── main.py             # app factory · 라우터 등록 · 미들웨어 · lifespan
├── tests/
│   ├── unit/                   # core·services(fake repository)
│   ├── integration/            # repositories(실제 DB)
│   ├── e2e/                    # api·main(ASGI 클라이언트)
│   └── architecture/           # 레이어 계약 보조 테스트
├── migrations/                 # Alembic
├── scripts/verify.sh           # 단일 검증 게이트
└── docs/
```

- src 레이아웃을 쓴다. 테스트가 설치된 패키지를 import하게 되어 "로컬 경로 덕분에만 동작하는" 사고를 막는다.
- 모든 패키지에 `__init__.py`를 둔다. `__init__.py`에는 **재수출만**, 로직·부작용 금지(import 시점에 DB 연결·앱 생성 금지).
- 테스트 디렉터리는 소스 구조를 거울처럼 따라간다(`tests/unit/services/test_{{DOMAIN_EXAMPLE}}_service.py`).

## 레이어 ↔ 의존 가능 (import-linter 강제)

| 패키지 | 책임 | 의존 가능 |
|---|---|---|
| `{{PACKAGE_NS}}.main` | app factory·조립 | 전부(조립 목적) |
| `{{PACKAGE_NS}}.api` | 라우터·`Depends`·예외 변환 | `services`, `schemas`, `core` |
| `{{PACKAGE_NS}}.schemas` | 경계 DTO(Pydantic) | `core` |
| `{{PACKAGE_NS}}.services` | 비즈니스 규칙·트랜잭션 경계 | `repositories`, `schemas`, `core` |
| `{{PACKAGE_NS}}.repositories` | 쿼리·매핑 | `models`, `core` |
| `{{PACKAGE_NS}}.models` | ORM 모델 | `core` |
| `{{PACKAGE_NS}}.core` | 예외·에러코드·envelope | — (stdlib만) |

- **의존 금지(게이트 차단)**: `services → api`, `repositories → services/api`, `models → 위 전부`, `core → 서드파티`, `repositories·models → schemas`.
- 레이어를 건너뛰지 않는다: `api`가 `repositories`를 직접 부르면 트랜잭션·정책이 우회된다. 조회만 하는 엔드포인트라도 서비스를 통과시킨다(규칙이 나중에 생긴다).
- 계약 선언과 추가 절차는 `ARCHITECTURE.md` §3.2. **새 레이어 패키지를 만들면 계약에 등록**해야 강제 대상이 된다.

## 리포지토리는 Protocol 로 선언한다 (테스트 가능성)

서비스 단위 테스트에서 DB 없이 대역을 쓰려면 리포지토리 계약이 타입으로 있어야 한다.
`typing.Protocol`은 구조적 서브타이핑이라 **구현체가 상속하지 않아도** 계약을 만족한다.

```python
# services/{{DOMAIN_EXAMPLE}}_service.py
from typing import Protocol

class {{DOMAIN_EXAMPLE}}Reader(Protocol):
    async def find_by_code(self, code: str) -> {{DOMAIN_EXAMPLE}} | None: ...

class {{DOMAIN_EXAMPLE}}Writer(Protocol):
    async def save(self, entity: {{DOMAIN_EXAMPLE}}) -> {{DOMAIN_EXAMPLE}}: ...
```

- Protocol은 **좁게**(1~3 메서드) 나눈다. 거대한 단일 `Repository` 하나보다 역할별 소형 Protocol이 대역 작성을 쉽게 한다.
- 구현체(`repositories/{{DOMAIN_EXAMPLE}}_repository.py`)는 이 Protocol을 import하지 않아도 된다. 준수 여부는 mypy가 조립 지점에서 확인한다.

## 패키지 컨벤션

- 모듈·클래스명은 도메인 개념(ubiquitous language)으로 짓고 테이블 prefix를 붙이지 않는다.
- 네이밍: 모듈·함수·변수 `snake_case`, 클래스 `PascalCase`, 상수 `UPPER_SNAKE_CASE`, 내부 전용은 `_leading_underscore`.
  - 파일명에 역할을 드러낸다: `{{DOMAIN_EXAMPLE}}_service.py` · `{{DOMAIN_EXAMPLE}}_repository.py`.
  - 클래스명도 마찬가지: `{{DOMAIN_EXAMPLE}}Service` · `{{DOMAIN_EXAMPLE}}Repository` · `{{DOMAIN_EXAMPLE}}Model`(ORM).
- ORM 모델은 `api` 응답으로 나가지 않는다. 라우터는 반드시 `schemas`의 DTO로 변환해 반환한다(내부 스키마 유출·순환 직렬화 방지).
- **트랜잭션 경계는 서비스**: 세션은 `api/deps.py`가 요청 스코프로 만들어 주입하고 커밋은 서비스가 한다. 리포지토리는 커밋하지 않는다.
- DB 접근: SQLAlchemy 2.0 `select()`/`session.execute`. 복잡 조회·통계·keyset cursor는 리포지토리의 별도 메서드로 분리한다. 원시 SQL은 지양(불가피하면 Why 주석 + 파라미터 바인딩 필수).
- 서비스가 다른 서비스를 부르는 것은 허용하되 순환을 만들지 않는다. 순환이 생기면 규칙 소유가 잘못된 신호다 — 공통 규칙을 아래 레이어나 별도 서비스로 내린다.

## 새 기능 착수 워크플로

1. **레이어 결정**: 새 리소스인지, 기존 리소스의 새 동작인지 먼저 답한다.
2. 새 리소스면 파일 세트를 만든다: `models/<x>.py` → `repositories/<x>_repository.py` → `services/<x>_service.py` → `schemas/<x>.py` → `api/routers/<x>.py`.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `services`: fake 리포지토리로 규칙·트랜잭션 순서 테스트 → Protocol 정의 → 서비스 구현.
   2. `repositories`: 통합 테스트(실제 DB) → 쿼리·매핑 구현(격리 정책 포함).
   3. `api`: `httpx.AsyncClient(ASGITransport)` 테스트 → 라우터·스키마 구현. **응답은 공통 envelope**.
   4. `main`: 라우터 등록·smoke 테스트.
4. **검증**: `bash scripts/verify.sh`(ruff·mypy·lint-imports·pytest) 통과 + OpenAPI/문서 동기화(`.agents/docs/openapi`).
5. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (계약 린터의 보완)

`import-linter`가 패키지 간 의존 방향을 막는다. 그러나 계약이 못 잡는 위반이 있다:
라우터가 ORM 모델을 반환, 리포지토리의 `commit()` 호출, 모델에 비즈니스 메서드 추가 등.
이런 것은 `tests/architecture/`의 테스트로 강제한다(게이트가 자동 실행).

```python
# tests/architecture/test_layer_rules.py
"""레이어 규율 중 import-linter 가 못 잡는 것을 테스트로 강제한다."""
import pathlib

SRC = pathlib.Path("src/{{PACKAGE_NS}}")

def test_리포지토리는_commit_을_호출하지_않는다() -> None:
    """트랜잭션 경계는 서비스 소유다. 리포지토리가 커밋하면 부분 반영이 생긴다."""
    for path in SRC.glob("repositories/**/*.py"):
        source = path.read_text(encoding="utf-8")
        assert ".commit()" not in source, f"{path} 에서 commit() 호출 — 경계는 service 에 둔다"

def test_라우터는_orm_모델을_직접_반환하지_않는다() -> None:
    """ORM 모델을 그대로 내보내면 내부 스키마가 API 계약이 되어버린다."""
    for path in SRC.glob("api/routers/*.py"):
        source = path.read_text(encoding="utf-8")
        assert "from {{PACKAGE_NS}}.models" not in source, f"{path}: 라우터는 schemas 로 변환해 반환한다"
```

> 규칙은 프로젝트에 맞게 늘린다. 핵심은 위반을 `scripts/verify.sh`에서 실패로 만드는 것(리뷰가 아니라 게이트).

## 새 기능 착수 규칙

1. 새 기능은 위 레이어 경계 안에서 구현한다. 한 레이어에 다른 레이어의 책임을 몰지 않는다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`(또는 OpenAPI 스냅샷)를 함께 갱신한다.
4. 승격 신호(서비스 비대·순환 참조·규칙 소유 논쟁)가 보이면 `ARCHITECTURE.md` §0·§11의 전환 가이드를 연다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
