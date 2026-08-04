<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드(ASGI) · 아키텍처: hexagonal · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}}

이 하네스는 **Python 백엔드 전용**이다. 아래 스택·버전은 **예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정**한다.
의존성·도구 설정은 **단일 소스 `pyproject.toml`** 에 모으고, 잠금 파일(`uv.lock`/`poetry.lock`)을 **반드시 커밋**한다.

> **아키텍처 변형에 따라 이 표를 교체한다.** 아래는 ASGI(FastAPI) 기준 기본값이다.
> `django` 변형을 골랐다면 웹 프레임워크·ORM·직렬화·테스트 행을 **Django · Django ORM · DRF serializer · pytest-django**로 바꾸고,
> `ai-service` 변형이라면 LLM 프로바이더 SDK·벡터 저장소·평가 도구 행을 추가한다. 레이아웃·강제 계약의 정본은 `ARCHITECTURE.md`.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | **Python 3.12+** | 최신 타입 문법 사용(`X | None`, `type` 별칭) |
| 웹 프레임워크 | **FastAPI(ASGI)** | 대안: Litestar · Django REST(동기 스택이면 async 규약을 대체 명시) |
| ASGI 서버 | **Uvicorn**(프로덕션은 Gunicorn `UvicornWorker` 등으로 관리) | 워커 수는 커넥션 풀과 함께 결정 |
| DB 접근 | **SQLAlchemy 2.0 (async)** | 복잡 조회는 별도 read 어댑터. 도메인은 ORM 무의존 |
| Migration | **Alembic** | 자동 생성 diff는 반드시 사람이 검토 |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 메타데이터·권한의 단일 소스 |
| 검증/직렬화 | **Pydantic v2** | **경계(인바운드 어댑터·설정) 전용**. 규칙을 담은 안쪽 계층에 쓰지 않는다 |
| 패키지·의존성 | **uv**(권장) 또는 Poetry / pip-tools | lock 커밋 필수 |
| 린트·포맷 | **Ruff**(lint + format) | Black·isort·flake8 대체. 규칙은 `pyproject.toml` |
| 타입 체크 | **mypy `--strict`** | 대안: pyright. 미주석 def·암묵 Any 금지 |
| 아키텍처 강제 | **import-linter**(`lint-imports`) | 레이어·forbidden·independence 계약 = 컴파일 강제 대체물 |
| 테스트 | **pytest** · `pytest-asyncio` · `pytest-cov` · (선택) `hypothesis` · `testcontainers` | Given-When-Then, 손수 짠 fake 우선 |
| 로깅 | **structlog** 또는 stdlib `logging` + JSON formatter | 구조화 로그. 민감정보 금지 |
| API 문서 | **OpenAPI 3.1**(FastAPI 자동 생성) | `/docs`·`/openapi.json`. 스냅샷을 리포에 커밋 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 "의존성 단일 소스 원칙"에 따라 관리한다.

## 의존성 단일 소스 원칙

- 모든 의존성·도구 설정은 **`pyproject.toml` 한 곳**에서 관리한다(`[project.dependencies]`·`[dependency-groups]` 또는 `[tool.poetry.group.*]`).
- **잠금 파일을 커밋**하고 CI는 **동결 설치**한다(`uv sync --frozen` 등) — 재현 가능한 빌드.
- 런타임/개발 의존성을 분리한다(dev 그룹: ruff·mypy·pytest·import-linter). 프로덕션 이미지에 dev 의존성을 넣지 않는다.
- 새 의존성은 라이선스·유지보수 상태를 확인한 뒤 추가하고 근거를 PR에 남긴다.
- 최소 지원 버전은 `requires-python`에 명시하고 CI 매트릭스와 일치시킨다.

### `pyproject.toml` 핵심 설정 (예시 골격)

```toml
[project]
name = "{{PROJECT_SLUG}}"
requires-python = ">=3.12"

[tool.ruff]
src = ["src", "tests"]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP", "B", "C4", "SIM", "ASYNC", "S", "RUF"]
# ASYNC=async 안티패턴, S=보안(bandit), B=버그 유발 패턴, I=import 정렬

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101"]     # 테스트의 assert 허용

[tool.mypy]
python_version = "3.12"
strict = true
warn_unreachable = true
plugins = ["pydantic.mypy"]

[tool.pytest.ini_options]
addopts = "-q --strict-markers --cov={{PACKAGE_NS}} --cov-report=term-missing --cov-fail-under=80"
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.coverage.report]
exclude_also = ["if TYPE_CHECKING:", "raise NotImplementedError"]

# import-linter 계약(레이어·forbidden·independence)은 ARCHITECTURE.md §3.2 참조
```

## 빌드 / 실행 명령

uv 기준(Poetry면 대응 명령으로 치환):

```bash
uv sync                                   # 잠금 파일 기준 의존성 설치
# 로컬 실행(8000) — 진입점은 아키텍처 변형마다 다르다(정본: ARCHITECTURE.md)
uv run uvicorn {{PACKAGE_NS}}.bootstrap.app:create_app --factory --reload   # hexagonal · ai-service
# uv run uvicorn {{PACKAGE_NS}}.main:app --reload                          # layered · modular
# uv run python manage.py runserver                                        # django
uv run alembic upgrade head               # 마이그레이션 적용
uv run pytest                             # 테스트(커버리지 포함)
bash scripts/verify.sh                    # 검증 게이트(정본 · 아래 전부를 묶어 실행)
```

`scripts/verify.sh`가 묶는 것:

```bash
ruff format --check .        # 포맷 드리프트
ruff check .                 # 린트(보안·async·버그 패턴 포함)
mypy src tests               # 타입 계약
lint-imports                 # 아키텍처 레이어 계약(import-linter)
pytest                       # 테스트 + 커버리지 임계
```

- **강제 게이트는 `scripts/verify.sh` 한 곳**이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 배포 아티팩트는 기본 **컨테이너 이미지**(멀티스테이지: 빌드 스테이지에서 의존성 설치 → 슬림 런타임). 시스템 Python을 오염시키지 않는다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등)는 `docker compose`로 기동한다. 리버스 프록시·IdP·오브젝트 스토리지는 **필요할 때 선택적으로** 추가한다.
- 가상환경은 프로젝트 로컬(`.venv`)에 둔다(uv가 자동 관리).
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). 값 읽기는 **설정 로더 한 곳**에서만 한다(위치는 변형마다 다르다 — `ARCHITECTURE.md`). 하위 레이어의 `os.environ` 직접 접근 금지.
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다.

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (ASGI) | 8000 |
| 관계형 DB | 5432(PostgreSQL) / 3306(MySQL) |
| 캐시(선택) | 6379 |
| 그 외 선택 구성요소 | 프로젝트에서 지정 |

## 명령 실행 주의 (macOS / zsh)

- dev 서버(`--reload`)·watch 등 장시간 프로세스는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지). 병렬이 필요하면 `pytest -n auto`(`pytest-xdist`)를 쓰되 DB 테스트 격리를 확인한다.
