<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드(ASGI · AI 서비스) · 아키텍처: ai-service · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (AI 서비스)

이 하네스는 **LLM 기반 Python 백엔드 전용**이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
의존성·도구 설정은 단일 소스 `pyproject.toml` 에 모으고, 잠금 파일(`uv.lock`/`poetry.lock`)을 **반드시 커밋**한다.

레이아웃·프롬프트/eval 규약의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

### 애플리케이션 토대

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | Python 3.12+ | 최신 타입 문법 사용(`X \| None`, `type` 별칭) |
| 웹 프레임워크 | **FastAPI(ASGI)** | 스트리밍(SSE) 응답이 1급 요구다 |
| ASGI 서버 | Uvicorn(프로덕션은 Gunicorn `UvicornWorker` 등) | 워커 수는 동시 LLM 호출 상한과 함께 결정 |
| DB 접근(선택) | SQLAlchemy 2.0 (async) + Alembic | 대화·실행 이력·피드백 저장이 필요할 때 |
| 검증/직렬화 | Pydantic v2 | 경계 DTO + 구조화 출력 스키마 |
| 패키지·의존성 | **uv**(권장) 또는 Poetry | lock 커밋 필수 |
| 린트·포맷 | **Ruff**(lint + format) | 규칙은 `pyproject.toml` |
| 타입 체크 | **mypy `--strict`** | 프로바이더 SDK 타입이 느슨하면 어댑터에서 좁힌다 |
| 아키텍처 강제 | **import-linter**(`lint-imports`) | `layers`(api→agents→llm·retrieval→domain) + domain·prompts → 프로바이더 SDK 금지 |
| 테스트 | **pytest** · `pytest-asyncio` · `pytest-cov` · HTTP 스텁(`respx` 등) | 단위 테스트에서 실제 모델 호출 금지 |
| 로깅 | **structlog** 또는 stdlib `logging` + JSON formatter | 프롬프트 원문·개인정보는 기본 미기록(마스킹·샘플링 정책을 명시) |
| API 문서 | OpenAPI 3.1(FastAPI 자동 생성) | 스트리밍 엔드포인트의 이벤트 스키마도 문서화 |

### AI 고유 구성요소

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| LLM 프로바이더 SDK | 프로젝트가 채택한 **공식 SDK**(복수 가능) | `llm/<provider>_adapter.py`에서만 import. 상위 계층은 `LLMClient` Protocol만 본다 |
| 모델 선택 | 용도별로 분리(고품질 추론 / 저비용 대량 / 임베딩) | 모델 ID·파라미터는 **설정값**이다. 코드에 하드코딩 금지 |
| 임베딩·벡터 저장소 | 벡터 DB 또는 관계형 DB의 벡터 확장 | 차원·거리 척도·인덱스 파라미터를 문서에 고정. 재색인 절차 필수 |
| 검색(RAG) | 청킹 · 임베딩 · (선택) 리랭커 · 하이브리드 검색 | 청킹 전략 변경은 **재색인 + eval 재실행** 대상 |
| 프롬프트 관리 | 리포 내 버전 있는 파일(`prompts/<도메인>/<이름>/v<N>.md`) + 레지스트리 로더 | 프롬프트는 코드가 아니라 자산이다. 변경 시 eval 필수 |
| 구조화 출력 | Pydantic 스키마 + 프로바이더의 구조화 출력/도구 호출 기능 | 자유 텍스트 정규식 파싱 금지. 실패 시 복구 경로를 정의 |
| 평가(eval) | `evaluation/`(datasets · scorers · baselines · `run_eval.py`) | **회귀 게이트**. 채점기는 규칙 기반 우선, 모델 채점은 보조 |
| 관측(필수) | 토큰 수 · 비용 · 지연(TTFT/총) · 재시도 · 실패율 | 호출마다 계측. 대시보드·예산 알림과 연결 |
| 트레이싱(선택) | OpenTelemetry 또는 LLM 전용 트레이싱 | 한 요청의 전체 체인(검색→프롬프트→호출→파싱)을 잇는다 |
| 재시도·동시성 | 백오프 + 지터, 동시 호출 상한(세마포어) | 429·과부하는 **정상 경로**다. 타임아웃 없는 호출 금지 |

> 위 표는 기본 골격이다. 실제 프로바이더·모델·저장소는 프로젝트가 확정하고, 선택 근거와 대안을 `.agents/docs/decisions/`에 ADR로 남긴다(교체가 잦은 영역이다).

## 의존성 단일 소스 원칙

- 모든 의존성·도구 설정은 `pyproject.toml` 한 곳에서 관리한다. **잠금 파일을 커밋**하고 CI는 동결 설치한다(`uv sync --frozen`).
- 프로바이더 SDK는 어댑터 경계 안에서만 쓴다. SDK가 상위 계층에 새면 교체 비용이 폭발하고 import-linter 계약이 실패한다.
- SDK·모델은 자주 바뀐다. 버전을 올릴 때 (a) 구조화 출력 동작, (b) 토크나이저·가격, (c) 기본 파라미터를 확인하고 **eval을 돌린 뒤** 머지한다.
- 무거운 ML 의존성(로컬 임베딩·리랭커 등)을 추가하면 이미지 크기·콜드스타트를 함께 측정한다. 가능하면 별도 서비스로 분리한다.
- 최소 지원 버전은 `requires-python`에 명시하고 CI 매트릭스와 일치시킨다.

### `pyproject.toml` 핵심 설정 (예시 골격)

```toml
[project]
name = "{{PROJECT_SLUG}}"
requires-python = ">=3.12"

[tool.ruff]
src = ["src", "tests", "evaluation"]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP", "B", "C4", "SIM", "ASYNC", "S", "RUF"]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101"]

[tool.mypy]
python_version = "3.12"
strict = true
warn_unreachable = true
plugins = ["pydantic.mypy"]

[tool.pytest.ini_options]
addopts = "-q --strict-markers --cov={{PACKAGE_NS}} --cov-report=term-missing --cov-fail-under=80"
asyncio_mode = "auto"
testpaths = ["tests"]
markers = ["live: 실제 프로바이더를 호출한다(기본 제외 — 수동/nightly 전용)"]

[tool.coverage.report]
exclude_also = ["if TYPE_CHECKING:", "raise NotImplementedError"]

# import-linter 계약(layers·forbidden)은 ARCHITECTURE.md §3.2 참조
# ★ domain·prompts 는 프로바이더 SDK 를 import 할 수 없다(forbidden 계약).
```

## 빌드 / 실행 명령

uv 기준(Poetry면 대응 명령으로 치환):

```bash
uv sync                                                                   # 의존성 설치
uv run uvicorn {{PACKAGE_NS}}.bootstrap.app:create_app --factory --reload # 로컬 실행(8000)
uv run pytest                                                             # 테스트(모델 호출 없음)
uv run pytest -m live                                                     # (수동) 실제 프로바이더 호출 테스트
uv run python evaluation/run_eval.py --smoke                              # eval 스모크(부분 데이터셋)
uv run python evaluation/run_eval.py                                      # eval 전체(비용 발생 — nightly 권장)
bash scripts/verify.sh                                                    # 검증 게이트(원본)
EVAL_ON_VERIFY=1 bash scripts/verify.sh                                   # 게이트 + eval 스모크
```

`scripts/verify.sh`가 묶는 것:

```bash
ruff format --check .        # 포맷 드리프트
ruff check .                 # 린트(보안·async·버그 패턴 포함)
mypy src tests               # 타입 계약
lint-imports                 # 레이어 계약(프로바이더 SDK 격리 포함)
pytest                       # 테스트 + 커버리지 임계
# EVAL_ON_VERIFY=1 이고 evaluation/run_eval.py 가 있으면 → eval 스모크
```

### `EVAL_ON_VERIFY` 규약

- **기본은 비활성(0)** 이다. 모델 호출은 비용이 들고 비결정적이라 매 커밋마다 돌리면 게이트가 불안정해진다.
- **켜야 하는 변경**: 프롬프트 파일, 모델 ID·파라미터, 검색·청킹 설정, 파싱·스키마, 에이전트 정지 조건. 이 중 하나라도 건드린 PR은 `EVAL_ON_VERIFY=1`로 게이트를 돌린다.
- **전체 eval은 nightly**로 돌리고 결과를 `evaluation/baselines/`와 비교한다. 기준선 갱신은 사람이 승인한다(자동 갱신 금지 — 회귀를 기준선으로 흡수해버린다).
- eval 실행에는 실제 API 키가 필요하다. CI에서는 시크릿으로 주입하고 예산 상한·타임아웃을 건다.

- 강제 게이트는 `scripts/verify.sh` 한 곳이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 배포 아티팩트는 기본 컨테이너 이미지(멀티스테이지). 프롬프트 파일은 이미지에 포함되며 버전이 로그·응답 메타데이터에 남아야 한다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB·벡터 저장소·캐시)는 `docker compose`로 기동한다.
- 가상환경은 프로젝트 로컬(`.venv`)에 둔다(uv가 자동 관리).
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore). API 키는 절대 커밋하지 않는다 — 노출되면 즉시 회수·재발급한다. 값 읽기는 `{{PACKAGE_NS}}/bootstrap/settings.py`(pydantic-settings) 한 곳에서만 하고, `llm`·`retrieval` 어댑터는 주입받는다.
- 로컬 개발 비용을 통제하려면 **저비용 모델 + 작은 데이터셋**을 기본값으로 두고, 고비용 경로는 명시적으로 켠다.
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다.

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (ASGI) | 8000 |
| 관계형 DB(선택) | 5432(PostgreSQL) / 3306(MySQL) |
| 벡터 저장소(선택) | 프로젝트에서 지정 |
| 캐시(선택) | 6379 |

## 명령 실행 주의 (macOS / zsh)

- dev 서버(`--reload`)·watch 등 장시간 프로세스는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지). **`-m live`와 eval은 비용이 발생**하므로 의도적으로만 실행한다.
- 긴 eval은 백그라운드 + 로그 파일로 돌리고, 중간 결과를 `evaluation/`에 남긴다.
