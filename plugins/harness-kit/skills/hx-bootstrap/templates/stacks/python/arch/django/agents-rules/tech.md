<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드(Django) · 아키텍처: django · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (Django)

이 하네스는 **Django 백엔드 전용**이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
의존성·도구 설정은 단일 소스 `pyproject.toml` 에 모으고, 잠금 파일(`uv.lock`/`poetry.lock`)을 **반드시 커밋**한다.

앱 레이아웃·`services`/`selectors` 분리 계약의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | Python 3.12+ | 최신 타입 문법 사용(`X \| None`, `type` 별칭) |
| 웹 프레임워크 | Django 5.x | LTS 여부를 확인해 확정. 설정은 `config/settings/` 분리 |
| API 레이어 | **Django REST Framework** | serializer=경계 DTO. 뷰는 얇게 — 로직은 `services`/`selectors` |
| ORM | **Django ORM** | 쿼리는 `selectors`(읽기)·`services`(쓰기)에서 끝난다. 뷰에서 `Model.objects` 직접 호출 금지 |
| Migration | Django migrations | 코드와 같은 커밋에 넣는다. 드리프트는 게이트가 차단(`makemigrations --check`) |
| DB | **관계형 DB 선택**(PostgreSQL 권장 / MySQL 등) | 메타데이터·권한의 단일 소스 |
| 서버 | Gunicorn(WSGI) 또는 Gunicorn `UvicornWorker`(ASGI) | ASGI는 async 뷰·채널을 쓸 때만 |
| 비동기 작업 | **Celery**(+ 브로커) 또는 django-q/RQ | `tasks.py`는 얇게 — 로직은 `services`에. 재시도·멱등 필수 |
| 캐시(선택) | Django cache framework(Redis 등) | 무효화 전략을 함께 정한다 |
| 설정 로드 | `config/settings/{base,dev,prod,test}.py` + env 로더 | 비밀값은 코드에 두지 않는다. `DJANGO_SETTINGS_MODULE`로 선택 |
| 인증 | Django auth (+ DRF 인증 클래스 — 세션/토큰은 프로젝트 확정) | 권한 검사는 `services`에서도 한 번 더(뷰 우회 방지) |
| 패키지·의존성 | **uv**(권장) 또는 Poetry / pip-tools | lock 커밋 필수 |
| 린트·포맷 | **Ruff**(lint + format, `DJ` 룰셋 포함) | Black·isort·flake8 대체 |
| 타입 체크 | mypy `--strict` + django-stubs(`mypy_django_plugin`) | 플러그인이 `DJANGO_SETTINGS_MODULE`를 알아야 한다 |
| 아키텍처 강제 | **import-linter**(`lint-imports`) | `layers`(views→services·selectors→models) + 앱 간 `independence` + forbidden |
| 테스트 | pytest + pytest-django (+ `pytest-cov`, 선택 `model-bakery`) | Django `TestCase` 대신 pytest 픽스처 기반 |
| 로깅 | Django `LOGGING` + JSON formatter(또는 structlog) | 구조화 로그. 민감정보 금지 |
| API 문서 | OpenAPI 3.x(스키마 생성 도구 — 예: drf-spectacular) | 스냅샷을 리포에 커밋 |
| 정적 파일 | `collectstatic` (+ WhiteNoise 또는 오브젝트 스토리지) | 배포 파이프라인에 포함 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 "의존성 단일 소스 원칙"에 따라 관리한다.

## 의존성 단일 소스 원칙

- 모든 의존성·도구 설정은 `pyproject.toml` 한 곳에서 관리한다(`[project.dependencies]`·`[dependency-groups]` 또는 `[tool.poetry.group.*]`).
- 잠금 파일을 커밋하고 CI는 동결 설치한다(`uv sync --frozen` 등) — 재현 가능한 빌드.
- 런타임/개발 의존성을 분리한다(dev 그룹: ruff·mypy·django-stubs·pytest·pytest-django·import-linter). 프로덕션 이미지에 dev 의존성을 넣지 않는다.
- 서드파티 Django 앱을 추가하면 `INSTALLED_APPS`·설정·마이그레이션 영향까지 함께 검토한다(앱 하나가 미들웨어·시그널·모델을 동시에 들여온다).
- 최소 지원 버전은 `requires-python`에 명시하고 CI 매트릭스와 일치시킨다.

### `pyproject.toml` 핵심 설정 (예시 골격)

```toml
[project]
name = "{{PROJECT_SLUG}}"
requires-python = ">=3.12"

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP", "B", "C4", "SIM", "S", "DJ", "RUF"]
# DJ = Django 전용 룰(널러블 문자열 필드·__str__ 누락 등)

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101"]                 # 테스트의 assert 허용
"*/migrations/*" = ["E501", "N806"]   # 자동 생성 마이그레이션

[tool.mypy]
python_version = "3.12"
strict = true
warn_unreachable = true
plugins = ["mypy_django_plugin.main"]

[tool.django-stubs]
django_settings_module = "config.settings.test"

[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings.test"
addopts = "-q --strict-markers --cov={{PACKAGE_NS}} --cov-report=term-missing --cov-fail-under=80"
testpaths = ["tests"]

[tool.coverage.run]
omit = ["*/migrations/*", "config/asgi.py", "config/wsgi.py"]

# import-linter 계약(layers·independence·forbidden)은 ARCHITECTURE.md §3.2 참조
# ★ 새 앱을 추가하면 containers·independence 양쪽에 등록한다(등록 누락 = 강제 누락).
```

## 빌드 / 실행 명령

uv 기준(Poetry면 대응 명령으로 치환). 설정 모듈은 `DJANGO_SETTINGS_MODULE`로 고른다:

```bash
uv sync                                                    # 잠금 파일 기준 의존성 설치
uv run python manage.py migrate                            # 마이그레이션 적용
uv run python manage.py runserver                          # 로컬 실행(8000)
uv run python manage.py makemigrations {{DOMAIN_EXAMPLE}}  # 모델 변경 시 — 반드시 코드와 함께 커밋
uv run python manage.py createsuperuser                    # 관리자 계정(admin 사용 시)
uv run python manage.py collectstatic --noinput            # 배포 전 정적 파일
uv run celery -A config worker -l info                     # (선택) 비동기 워커
uv run pytest                                              # 테스트(커버리지 포함)
bash scripts/verify.sh                                     # 검증 게이트(아래 전부를 묶어 실행)
```

`scripts/verify.sh`가 묶는 것:

```bash
ruff format --check .                              # 포맷 드리프트
ruff check .                                       # 린트(보안·Django 룰 포함)
mypy .                                             # 타입 계약(django-stubs 플러그인)
lint-imports                                       # 레이어·앱 독립 계약
pytest                                             # 테스트 + 커버리지 임계
python manage.py check                             # Django 시스템 점검(설정·앱·모델 정합성)
python manage.py makemigrations --check --dry-run  # 마이그레이션 드리프트 차단
```

- 강제 게이트는 `scripts/verify.sh` 한 곳이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 마지막 두 단계는 `manage.py` 존재를 감지해 자동 실행된다(스크립트는 스택 안에서 하나로 유지한다).
- **마이그레이션 드리프트가 이 스택의 최다 사고**다: 모델을 고치고 마이그레이션을 만들지 않으면 배포 시점에 터진다. 게이트가 그 전에 막는다.
- 배포 아티팩트는 기본 **컨테이너 이미지**(멀티스테이지 + `collectstatic`). `DEBUG=False`·`ALLOWED_HOSTS`·시크릿 키는 env로만 주입한다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB·브로커 등)는 `docker compose`로 기동한다. 리버스 프록시·오브젝트 스토리지는 **필요할 때 선택적으로** 추가한다.
- 가상환경은 프로젝트 로컬(`.venv`)에 둔다(uv가 자동 관리).
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). 값 읽기는 **`config/settings/` 한 곳**에서만 한다 — 앱 코드(`services`·`selectors`·`models`)의 `os.environ` 직접 접근 금지. 앱은 `django.conf.settings`를 통해서만 설정을 본다.
- `config/settings/base.py`에는 비밀값을 두지 않는다. dev/prod/test는 base를 import해 차이만 덮어쓴다.
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다.

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (runserver / gunicorn) | 8000 |
| 관계형 DB | 5432(PostgreSQL) / 3306(MySQL) |
| 캐시·브로커(선택) | 6379(Redis) |
| 그 외 선택 구성요소 | 프로젝트에서 지정 |

## 명령 실행 주의 (macOS / zsh)

- `runserver`·Celery 워커·watch 등 장시간 프로세스는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지). DB 재사용이 필요하면 `pytest --reuse-db`, 스키마를 바꿨으면 `--create-db`로 강제 재생성한다.
- `manage.py` 명령은 **설정 모듈을 명시**해 실행한다(`DJANGO_SETTINGS_MODULE=config.settings.dev`). 운영 설정으로 로컬 명령을 돌리지 않는다.
