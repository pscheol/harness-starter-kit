---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 패키지 책임 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 모듈/기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:
- src 레이아웃 모듈러: `src/{{PACKAGE_NS}}/{core,shared}` + `modules/<feature>/{router,schema,service,repository,model}.py` + `main.py`.
- 모듈 간 직접 import 금지 — 공개 API(`modules/<x>/__init__.py`)·주입·이벤트 중 하나로만 통합한다. `import-linter` independence 계약이 강제.
- 모듈 내부는 `router→service→repository→model` 단방향. `service`·`repository`·`model`은 FastAPI 무의존.
- 새 모듈은 `pyproject.toml` 계약(`independence`·`containers`)에 등록해야 강제된다. `shared`는 modules를 모른다.
- 트랜잭션 경계는 **service**에만(모듈을 넘는 트랜잭션 금지 — 이벤트로 최종 일관성).
- API 변경 시 OpenAPI 스냅샷 동기화. 승격 신호가 보이면 `ARCHITECTURE.md` §0·§12.
