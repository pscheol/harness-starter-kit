---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 패키지 책임 (포인터)

정본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 패키지/기능 착수 전 연다. 아키텍처 정본은 `ARCHITECTURE.md`.

요약:
- 표준 Go 레이아웃: `cmd/<binary>`(조립만) · `internal/`(기본) · `pkg/`(공개할 때만) · `api/`·`configs/`·`deployments/`·`migrations/`·`test/`.
- `internal/` 안은 레이어드: `handler → service → repository → model` 단방향 + `config`·`database`·`logger`·`middleware`·`common`.
- 의존 방향은 `internal/` 가시성(컴파일러) + import 사이클 금지(컴파일러) + **depguard**(린터)로 강제.
- **레이어 건너뛰기 금지**: `handler`는 `repository`를 직접 import하지 않는다(service 경유). `service`·`repository`·`model`은 `net/http` 무의존.
- **인터페이스는 소비자(service)가 선언**한다. 트랜잭션 경계는 service에만(repository는 커밋하지 않는다).
- 단위 테스트는 소스 옆(`*_test.go`). API 변경 시 `api/` OpenAPI 스펙 동기화.
- 승격 신호가 보이면 `ARCHITECTURE.md` §0·§11의 전환 가이드를 연다.
