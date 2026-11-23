---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 모듈 책임 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 모듈/도메인 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:
- 멀티모듈 헥사고날(컨텍스트 최상위 flat): `bootstrap`·`common`·`core` + `{{PROJECT_SLUG}}-<ctx>/{domain,application,primary,infra}`.
- 모듈 경로는 `:{{PROJECT_SLUG}}-<ctx>:infra` 형태. 컨테이너로 한 단계 더 묶는 형태는 `hexagonal-nested` 변형.
- 각 모듈은 단일 책임, 새 기능은 모듈 경계 안에서 구현.
- API 변경 시 `.agents/docs/openapi` 동기화.
