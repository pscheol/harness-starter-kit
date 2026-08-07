<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드(ASGI) · 아키텍처: modular · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (모듈러)

이 하네스는 **Python 백엔드 전용**이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
의존성·도구 설정은 단일 소스 `pyproject.toml` 에 모으고, 잠금 파일(`uv.lock`/`poetry.lock`)을 **반드시 커밋**한다.

레이아웃·모듈 독립 계약의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | Python 3.12+ | 최신 타입 문법 사용(`X \| None`, `type` 별칭) |
| 웹 프레임워크 | **FastAPI(ASGI)** | 모듈마다 `APIRouter` 1개. `main.py`가 모아 마운트 |
| ASGI 서버 | **Uvicorn**(프로덕션은 Gunicorn `UvicornWorker` 등으로 관리) | 워커 수는 커넥션 풀과 함께 결정 |
| DB 접근 | SQLAlchemy 2.0 (async) | `Base`·세션 팩토리는 `shared/db.py` 한 곳. 쿼리는 모듈의 `repository.py`에서 |
| Migration | Alembic | 모듈이 여럿이어도 마이그레이션 히스토리는 하나다(단일 배포 단위) |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 메타데이터·권한의 단일 소스 |
| 검증/직렬화 | **Pydantic v2** | 모듈의 `schema.py`(경계 DTO)·설정 전용 |
| 패키지·의존성 | **uv**(권장) 또는 Poetry / pip-tools | lock 커밋 필수 |
| 린트·포맷 | **Ruff**(lint + format) | Black·isort·flake8 대체. 규칙은 `pyproject.toml` |
| 타입 체크 | **mypy `--strict`** | 대안: pyright. 미주석 def·암묵 Any 금지 |
| 아키텍처 강제 | **import-linter**(`lint-imports`) | `independence`(모듈 간 직접 import 금지) + 모듈 내부 `layers` + forbidden |
| 테스트 | **pytest** · `pytest-asyncio` · `pytest-cov` · (선택) `hypothesis` · `testcontainers` | 테스트도 모듈별로 나눈다(`tests/modules/<m>/`) |
| 로깅 | **structlog** 또는 stdlib `logging` + JSON formatter | 구조화 로그. 민감정보 금지 |
| API 문서 | OpenAPI 3.1(FastAPI 자동 생성) | `/docs`·`/openapi.json`. 모듈별 tag 분리 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 "의존성 단일 소스 원칙"에 따라 관리한다.

## 의존성 단일 소스 원칙

- 모든 의존성·도구 설정은 `pyproject.toml` 한 곳에서 관리한다(`[project.dependencies]`·`[dependency-groups]` 또는 `[tool.poetry.group.*]`).
- 잠금 파일을 커밋하고 CI는 동결 설치한다(`uv sync --frozen` 등) — 재현 가능한 빌드.
- 모듈별로 의존성을 나누지 않는다. 배포 단위가 하나이므로 의존성도 하나다. 특정 모듈만 쓰는 무거운 의존성이 생기면 그 자체가 **분리 배포 신호**다(`ARCHITECTURE.md` §0의 승격 신호).
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

# import-linter 계약(independence·layers·forbidden)은 ARCHITECTURE.md §3.2 참조
# ★ 새 모듈을 추가하면 independence 계약의 modules 목록에 반드시 등록한다(등록 누락 = 강제 누락).
```

## 빌드 / 실행 명령

uv 기준(Poetry면 대응 명령으로 치환):

```bash
uv sync                                          # 잠금 파일 기준 의존성 설치
uv run uvicorn {{PACKAGE_NS}}.main:app --reload  # 로컬 실행(8000) — main.py 가 모듈 라우터를 마운트
uv run alembic upgrade head                      # 마이그레이션 적용(모듈 공통 히스토리)
uv run pytest                                    # 전체 테스트
uv run pytest tests/modules/{{DOMAIN_EXAMPLE}}   # 한 모듈만
bash scripts/verify.sh                           # 검증 게이트(아래 전부를 묶어 실행)
```

`scripts/verify.sh`가 묶는 것:

```bash
ruff format --check .        # 포맷 드리프트
ruff check .                 # 린트(보안·async·버그 패턴 포함)
mypy src tests               # 타입 계약
lint-imports                 # 모듈 독립 + 모듈 내부 레이어 계약
pytest                       # 테스트 + 커버리지 임계
```

- 강제 게이트는 `scripts/verify.sh` 한 곳이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 배포 아티팩트는 기본 컨테이너 이미지 하나다. 모듈은 배포 경계가 아니라 코드 소유 경계다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등)는 `docker compose`로 기동한다. 리버스 프록시·IdP·오브젝트 스토리지는 **필요할 때 선택적으로** 추가한다.
- 가상환경은 프로젝트 로컬(`.venv`)에 둔다(uv가 자동 관리).
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). 값 읽기는 `{{PACKAGE_NS}}/shared/settings.py`(pydantic-settings) 한 곳에서만 한다 — 모듈 내부의 `os.environ` 직접 접근 금지. 설정 객체는 `main.py`에서 1회 생성해 주입한다.
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
