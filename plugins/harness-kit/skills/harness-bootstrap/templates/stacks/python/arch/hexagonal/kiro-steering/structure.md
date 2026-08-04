---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 패키지 책임 (포인터)

정본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 패키지/도메인 착수 전 연다. 아키텍처 정본은 `ARCHITECTURE.md`.

요약:
- src 레이아웃 헥사고날: `src/{{PACKAGE_NS}}/{core,common,bootstrap}` + `<ctx>/{domain,application,primary,infra}`.
- 의존 방향은 **import-linter 계약**이 강제한다(컴파일러 대체). 새 컨텍스트는 `pyproject.toml` 계약에 등록해야 강제된다.
- 도메인은 프레임워크 무의존(Pydantic·SQLAlchemy·FastAPI 금지). ORM 모델과 애그리거트는 다른 타입.
- API 변경 시 OpenAPI 스냅샷 동기화.
