---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 패키지 책임 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 패키지/기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:
- src 레이아웃 레이어드: `src/{{PACKAGE_NS}}/{core,api,schemas,services,repositories,models}` + `main.py`.
- 의존 방향은 **import-linter 계약**이 강제한다(컴파일러 대체). `api→services→repositories→models` 단방향, 레이어 건너뛰기 금지.
- `services`·`repositories`·`models`는 FastAPI 무의존. 라우터는 ORM 모델이 아니라 `schemas` DTO로 응답한다.
- 트랜잭션 경계는 **서비스**에만(리포지토리는 커밋하지 않는다).
- API 변경 시 OpenAPI 스냅샷 동기화. 승격 신호가 보이면 `ARCHITECTURE.md` §0·§11.
