---
inclusion: always
---
<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 기술 스택 · 실행 (포인터)

원본: `.agents/rules/tech.md` — Claude·Codex·Kiro 공통. 빌드·구조·스택 변경 전 연다. 의존성·버전 기준은 `go.mod`(+`go.sum` 커밋). 구체 버전은 예시이며 프로젝트에서 확정한다.

요약:
- Go 1.22+ · net/http(+경량 라우터) · pgx/database·sql · golang-migrate/goose · log/slog.
- gofumpt · golangci-lint(govet·staticcheck·errcheck·**depguard**·gosec) · go test -race · govulncheck.
- 검증 게이트 `bash scripts/verify.sh`(= fmt → build → vet → lint → test -race → 커버리지).
