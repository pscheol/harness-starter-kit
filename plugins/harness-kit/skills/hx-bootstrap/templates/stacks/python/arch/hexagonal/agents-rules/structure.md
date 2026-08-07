<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 아키텍처: hexagonal · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 헥사고날 패키지 레이아웃 — {{PROJECT_NAME}}

이 프로젝트는 클린 아키텍처(헥사고날) + DDD를 src 레이아웃 + import 계약 린터로 강제한다.
Python에는 모듈 의존을 막는 컴파일러가 없으므로, `import-linter` 계약이 컴파일 강제를 대신한다. 위반은 리뷰가 아니라 `scripts/verify.sh` 실패로 막힌다.
아키텍처 상세 원본은 `ARCHITECTURE.md`.

## 리포 레이아웃 (src layout)

```
{{PROJECT_SLUG}}/
├── pyproject.toml              # 의존성·도구 설정·import-linter 계약의 단일 소스
├── uv.lock                     # 잠금 파일(커밋 필수)
├── src/
│   └── {{PACKAGE_NS}}/
│       ├── __init__.py
│       ├── core/               # 프레임워크 0. DomainError·공용 타입·상수
│       ├── common/             # 공유 커널: envelope·error_code·exception_handler·미들웨어
│       ├── {{DOMAIN_EXAMPLE}}/ # 바운디드 컨텍스트 (컨텍스트마다 아래 4패키지 세트)
│       │   ├── domain/
│       │   ├── application/
│       │   ├── primary/
│       │   └── infra/
│       └── bootstrap/          # composition root: app factory·DI 조립·settings·lifespan
├── tests/
│   ├── unit/                   # domain·application
│   ├── integration/            # infra(실제 DB)
│   ├── e2e/                    # primary·bootstrap(ASGI 클라이언트)
│   └── architecture/           # 레이어 계약 보조 테스트
├── migrations/                 # Alembic
├── scripts/verify.sh           # 단일 검증 게이트
└── docs/                       # 사람이 읽는 문서
```

- src 레이아웃을 쓴다. 테스트가 설치된 패키지를 import하게 되어 "로컬 경로 덕분에만 동작하는" 사고를 막는다.
- 모든 패키지에 `__init__.py`를 둔다. `__init__.py`에는 **재수출만**, 로직·부작용 금지(import 시점에 DB 연결·앱 생성 금지).
- 테스트 디렉터리는 소스 구조를 거울처럼 따라간다(`tests/unit/{{DOMAIN_EXAMPLE}}/domain/test_*.py`).

## 레이어 ↔ 의존 가능 (import-linter 강제)

| 패키지 | 레이어 | 의존 가능 |
|---|---|---|
| `{{PACKAGE_NS}}.bootstrap` | Composition Root | `common` + 각 컨텍스트의 `primary`·`infra` |
| `<ctx>.primary` | Inbound Adapter(HTTP) | `application`, `common` |
| `<ctx>.infra` | Outbound Adapter(DB·외부) | `application`, `common`, `core` |
| `<ctx>.application` | Use Case + Port | `domain`, `core` |
| `<ctx>.domain` | Domain Model | `core` |
| `{{PACKAGE_NS}}.common` | 공유 커널(web) | `core` |
| `{{PACKAGE_NS}}.core` | Primitives | — (stdlib만) |

- **의존 금지(게이트 차단)**: `domain → infra/primary`, `application → infra/primary`, `core → 서드파티`, `primary ↔ infra`.
- 한 컨텍스트의 4패키지(`domain`/`application`/`primary`/`infra`)는 **항상 한 묶음으로 추가·제거**한다.
- 그룹 내 흐름: `primary → application`, `infra → application`, `application → domain`. `primary`와 `infra`는 서로 모르며 `bootstrap`이 조립한다.
- 계약 선언과 계약 추가 절차는 `ARCHITECTURE.md` §3.2. **새 컨텍스트를 만들면 계약에 등록**해야 강제 대상이 된다.

## Port & Adapter (Protocol)

- **Inbound Port** = 유스케이스 인터페이스. `application/usecase/<x>_usecase.py`에 `Protocol`로 선언하고 같은 모듈(또는 `service/`)에 구현체를 둔다. 라우터는 Protocol에만 의존한다.
- **Outbound Port** = 리포지토리·게이트웨이 추상. `application/port/`에 `Protocol`로 선언하고 `infra`가 구현한다.
- 포트는 **애그리거트 기준**(`save(aggregate)`·`find_by_code(...)`)으로 정의한다. `upsert(columns...)`·SQL·`AsyncSession` 같은 영속 메커니즘을 시그니처에 드러내지 않는다(멱등/충돌 처리는 어댑터 내부).
- 새 외부 시스템 통합 = 새 port + 새 infra 어댑터. `application`/`domain`은 손대지 않는다(OCP).

```python
# application/port/{{DOMAIN_EXAMPLE}}_repository.py
from typing import Protocol

class {{DOMAIN_EXAMPLE}}Repository(Protocol):
    async def save(self, aggregate: {{DOMAIN_EXAMPLE}}) -> {{DOMAIN_EXAMPLE}}: ...
    async def find_by_code(self, code: {{DOMAIN_EXAMPLE}}Code) -> {{DOMAIN_EXAMPLE}} | None: ...
```

## 패키지 컨벤션

```
{{PACKAGE_NS}}
├── core/                    ← 프레임워크 무의존 primitives (DomainError 등)
├── common/                  ← web 공유 커널 (envelope · error_code · exception_handler · request_id)
└── {{DOMAIN_EXAMPLE}}/      ← 바운디드 컨텍스트
    ├── domain/              ─ 순수 Python. 서드파티 0. 데코레이터·ORM·Pydantic 금지
    │   ├── aggregate.py / entity.py / vo.py / event.py / exception.py / service/ / constant.py
    ├── application/         ─ domain·core 에만 의존
    │   ├── usecase/         ← inbound Protocol + 구현(<x>_usecase.py)
    │   ├── port/            ← outbound Protocol (repository·gateway) — infra가 구현
    │   ├── command.py / query.py / dto.py / event_publisher.py
    ├── primary/             ─ inbound 어댑터
    │   └── web/             ← router.py · schema.py(Pydantic) · mapper.py · dependency.py
    └── infra/               ─ outbound 어댑터
        ├── persistence/     ← model.py(ORM) · repository.py · mapper.py · <x>_adapter.py
        └── client/          ← 외부 HTTP/스토리지 클라이언트
```

- 모듈·클래스명은 도메인 개념(ubiquitous language)으로 짓고 테이블 prefix를 붙이지 않는다(네임스페이스는 컨텍스트 패키지가 담당).
- 네이밍: 모듈·함수·변수 `snake_case`, 클래스 `PascalCase`, 상수 `UPPER_SNAKE_CASE`, 내부 전용은 `_leading_underscore`.
  - infra 구현체는 역할이 드러나게: `{{DOMAIN_EXAMPLE}}Model`(ORM) · `{{DOMAIN_EXAMPLE}}PersistenceAdapter` · `{{DOMAIN_EXAMPLE}}Mapper`.
- ORM 모델과 도메인 애그리거트는 다른 타입이다. `mapper.py`가 양방향 변환을 전담하고, ORM 모델은 `infra` 밖으로 새어 나가지 않는다.
- DB 접근: 표준 CRUD는 SQLAlchemy 2.0 `select()`/`session.execute`. 복잡 조회·통계·keyset cursor는 별도 read 어댑터로 분리한다. 원시 SQL은 지양(불가피하면 Why 주석 + 파라미터 바인딩 필수).
- 컨텍스트 간 직접 import 금지. 통합이 필요하면 제공 컨텍스트의 **공개 계약 모듈**(`<ctx>/contract.py`)이나 도메인 이벤트를 경유한다(independence 계약이 위반을 차단).

## 새 도메인/유스케이스 착수 워크플로

1. **컨텍스트 결정**: 기존 컨텍스트 안인지 새 바운디드 컨텍스트인지 먼저 답한다.
2. (신규 컨텍스트면) `src/{{PACKAGE_NS}}/<ctx>/{domain,application,primary,infra}/` 생성 + `__init__.py` → `pyproject.toml`의 import-linter 계약에 등록(누락 시 강제되지 않는다).
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `domain`: 애그리거트/VO 테스트 → 모델 구현(`@dataclass`, `__post_init__` 불변식).
   2. `application`: 유스케이스 테스트(fake outbound port) → Protocol 정의 → 유스케이스 구현.
   3. `infra`: 통합 테스트(실제 DB)로 포트 구현 검증 → ORM 모델·매퍼·어댑터 구현(격리 정책 포함).
   4. `primary`: `httpx.AsyncClient(ASGITransport)` 테스트 → 라우터·스키마·매퍼 구현. **응답은 공통 envelope**.
   5. `bootstrap`: 라우터 등록·의존 조립·smoke 테스트.
4. **검증**: `bash scripts/verify.sh`(ruff·mypy·lint-imports·pytest) 통과 + OpenAPI/문서 동기화(`.agents/docs/openapi`).
5. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (계약 린터의 보완)

`import-linter`가 패키지 간 의존 방향을 막는다. 그러나 계약이 못 잡는 위반이 있다:
같은 패키지 안의 규율(도메인 클래스가 Pydantic 상속), 네이밍 규약(`*PersistenceAdapter`), 라우터가 ORM 모델을 반환, `commit()` 호출 위치 등.
이런 것은 `tests/architecture/`의 테스트로 강제한다(게이트가 자동 실행).

```python
# tests/architecture/test_layer_rules.py
"""레이어 계약 중 import-linter 가 못 잡는 규율을 테스트로 강제한다."""
import ast, pathlib

SRC = pathlib.Path("src/{{PACKAGE_NS}}")

def _classes(path: pathlib.Path) -> list[ast.ClassDef]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return [n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]

def test_도메인_클래스는_pydantic_이나_orm_을_상속하지_않는다() -> None:
    """도메인 모델에 프레임워크가 침투하면 순수성이 깨진다(직렬화 규칙이 도메인을 오염)."""
    forbidden = {"BaseModel", "DeclarativeBase", "Base"}
    for path in SRC.glob("*/domain/**/*.py"):
        for cls in _classes(path):
            bases = {b.id for b in cls.bases if isinstance(b, ast.Name)}
            assert not (bases & forbidden), f"{path}:{cls.name} 이 프레임워크 베이스를 상속한다"

def test_infra_어댑터는_commit_을_호출하지_않는다() -> None:
    """트랜잭션 경계는 유스케이스 소유다. 어댑터가 커밋하면 경계가 분산된다."""
    for path in SRC.glob("*/infra/**/*.py"):
        source = path.read_text(encoding="utf-8")
        assert ".commit()" not in source, f"{path} 에서 commit() 호출 — 경계는 usecase 에 둔다"
```

> 규칙은 프로젝트에 맞게 늘린다. 핵심은 위반을 `scripts/verify.sh`에서 실패로 만드는 것(리뷰가 아니라 게이트).

## 새 기능 착수 규칙

1. 새 기능은 위 패키지 경계 안에서 구현한다. 경계를 넘는 책임을 한 모듈에 몰지 않는다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`(또는 OpenAPI 스냅샷)를 함께 갱신한다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
