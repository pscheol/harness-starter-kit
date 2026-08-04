---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 패키지 책임 (포인터)

정본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 패키지/도메인 착수 전 연다. 아키텍처 정본은 `ARCHITECTURE.md`.

요약:
- 표준 Go 레이아웃: `cmd/<binary>`(조립만) · `internal/`(기본) · `pkg/`(공개할 때만) · `api/`·`configs/`·`deployments/`·`migrations/`·`test/`.
- `internal/` 안에서 헥사고날: `core`·`common`·`platform` + `<ctx>/{domain,app,primary/http,infra}`.
- 의존 방향은 `internal/` 가시성(컴파일러) + import 사이클 금지(컴파일러) + **depguard**(린터)로 강제.
- **인터페이스는 소비자(app)가 선언**한다. 단위 테스트는 소스 옆(`*_test.go`).
- API 변경 시 `api/` OpenAPI 스펙 동기화.
