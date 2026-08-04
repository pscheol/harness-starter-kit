---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 패키지 책임 (포인터)

정본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 기능 착수 전 연다. 아키텍처 정본은 `ARCHITECTURE.md`.

요약:
- 플랫(소규모): `cmd/<binary>/main.go`(조립만) + `internal/app/{config,handler,service,store,model}.go` 한 패키지. `pkg/`·`src/`는 만들지 않는다.
- **디렉터리 대신 파일이 경계**다: 방향은 `handler → service → store`. `handler.go`에 쿼리, `store.go`에 규칙을 쓰지 않는다.
- **승격 기준(만료 조건)**: `internal/app/`의 소스 파일이 **5~7개를 넘거나** 한 파일이 400줄을 넘으면 `--arch=feature`로 올린다. 구조 테스트가 파일 수 상한을 감시한다.
- depguard 최소 규칙: `store.go`·`model.go`는 `net/http` 무의존, `model.go`는 드라이버 무의존. **규칙을 더 걸고 싶어지면 승격할 때다.**
- 작아도 지키는 것: 생성자 주입(전역 상태 금지) · 트랜잭션 경계는 service · 페이지네이션 · 클라이언트/서버 타임아웃 · envelope 응답.
- 승격 절차는 `ARCHITECTURE.md` §10(파일 이름을 그대로 옮기도록 설계돼 있다).
