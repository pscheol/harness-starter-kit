---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 패키지 책임 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:
- 표준 Go 레이아웃 + **패키지 바이 피처**: `cmd/<binary>`(조립만) · `internal/platform/{config,db,log,httpx}` · `internal/<feature>/{handler,service,store,model}.go`.
- 기능 패키지 간 직접 import 금지 — `contract.go` 경유·`main` 조립 주입(기본)·이벤트 중 하나로만 통합한다. depguard + `internal/architecture_test.go`가 강제.
- 기능 내부 방향은 `handler → service → store`. `store.go`·`model.go`는 `net/http` 무의존. `platform`은 기능을 모른다.
- **exported 최소화**: 기능의 공개 표면은 `New`·`Routes`·`contract.go`뿐이다.
- 트랜잭션 경계는 `service`에만(기능을 넘는 트랜잭션 금지 — 이벤트로 최종 일관성). 다른 기능 테이블 직접 조회 금지.
- 단위 테스트는 기능 패키지 안(`*_test.go`) — 그 기능만으로 통과해야 한다. API 변경 시 `api/` OpenAPI 동기화.
- 승격/경계 오류 신호가 보이면 `ARCHITECTURE.md` §0·§12.
