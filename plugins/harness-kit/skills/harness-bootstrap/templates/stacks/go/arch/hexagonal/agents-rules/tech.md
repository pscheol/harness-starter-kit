<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 아키텍처: hexagonal · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}}

이 하네스는 **Go 백엔드 전용**이다. 아래 스택·버전은 **예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정**한다.
의존성·버전은 **단일 소스 `go.mod`** 가 관리하고 `go.sum`을 커밋한다. 모듈 경로는 `{{PACKAGE_NS}}`(예: `github.com/org/{{PROJECT_SLUG}}`).

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | **Go 1.22+** | `go.mod`의 `go` 지시자가 언어 버전 기준 |
| HTTP | **net/http** (+ `chi` 등 경량 라우터) | 표준 `ServeMux`(1.22+ 메서드·와일드카드 패턴)도 충분 |
| DB 접근 | **pgx**(PostgreSQL) 또는 `database/sql` + 드라이버 | 쿼리 생성은 `sqlc`(컴파일 타임 검증) 선택 |
| Migration | **golang-migrate** 또는 **goose** | `migrations/`에 SQL 파일. 롤백 스크립트 포함 |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 메타데이터·권한의 단일 소스 |
| 로깅 | **log/slog**(표준) | 구조화 로그. 로거는 주입, 전역 지양 |
| 설정 | env 로드(표준 `os` + 파서, `envconfig`·`viper` 선택) | `internal/platform/config` 한 곳에서 |
| 포맷 | **gofumpt**(gofmt 상위집합) | 포맷 드리프트는 게이트에서 차단 |
| 린트 | **golangci-lint** (govet·staticcheck·errcheck·revive·**depguard**·gosec·bodyclose·contextcheck) | depguard = 레이어 강제 |
| 취약점 | **govulncheck** | 정기·CI 실행 |
| 테스트 | 표준 **testing**(테이블 주도) + `-race` · (선택) `testcontainers-go` | 목보다 손수 짠 fake 우선 |
| API 문서 | **OpenAPI 3.x**(`api/` 에 스펙) + `oapi-codegen`(선택) | spec-first 권장(스펙이 계약 정본) |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 원칙에 따라 관리한다.

## 의존성 단일 소스 원칙

- 모든 의존성은 **`go.mod`** 가 관리하고 **`go.sum`을 커밋**한다. 빌드 재현성은 여기서 나온다.
- `go mod tidy`를 커밋 전에 돌린다(불필요 의존 제거 · 누락 추가). CI는 **`go mod tidy` 후 diff가 없어야** 통과하도록 검사할 수 있다.
- **의존성을 늘리기 전에 표준 라이브러리를 먼저 본다.** Go 표준 라이브러리는 넓다(`net/http`·`log/slog`·`encoding/json`·`context`·`sync`). 작은 유틸을 위해 의존성을 추가하지 않는다.
- 새 의존성은 라이선스·유지보수 상태·전이 의존 수를 확인한 뒤 추가하고 근거를 PR에 남긴다.
- 도구 의존성(golangci-lint 등)은 버전을 고정한다(`tools.go` 또는 `go.mod` tool 지시자, CI 액션 버전 고정).

### `.golangci.yml` 핵심 설정 (예시 골격)

```yaml
run:
  timeout: 5m

linters:
  enable:
    - govet          # 표준 정적 분석
    - staticcheck    # 광범위 버그 패턴
    - errcheck       # 처리되지 않은 error
    - revive         # 스타일·네이밍(golint 후속)
    - gosec          # 보안 취약 패턴
    - bodyclose      # HTTP 응답 본문 미close
    - contextcheck   # context 전파 누락
    - depguard       # 레이어 의존 강제(ARCHITECTURE.md §4.2)
    - misspell
    - unconvert
    - errorlint      # %w 래핑·errors.Is/As 오용

linters-settings:
  errcheck:
    check-type-assertions: true
  # depguard 레이어 규칙은 ARCHITECTURE.md §4.2 참조(정본)

issues:
  exclude-rules:
    - path: _test\.go
      linters: [gosec]     # 테스트 픽스처의 하드코딩 값 허용
```

## 빌드 / 실행 명령

```bash
go build ./...                                   # 전체 컴파일
go run ./cmd/{{PROJECT_SLUG}}                    # 로컬 실행 (8080)
go test -race ./...                              # 테스트(경합 검출 포함)
go test -race -covermode=atomic -coverprofile=coverage.out ./...   # 커버리지
migrate -path migrations -database "$DATABASE_URL" up               # 마이그레이션(예시)
bash scripts/verify.sh                           # 검증 게이트(정본 · 아래 전부를 묶어 실행)
```

`scripts/verify.sh`가 묶는 것:

```bash
gofumpt -l .                 # 포맷 드리프트(출력이 있으면 실패)
go build ./...               # 컴파일
go vet ./...                 # 표준 정적 분석
golangci-lint run            # 린트(depguard 레이어 강제 포함)
go test -race ./... -cover   # 테스트 + 경합 + 커버리지 임계
govulncheck ./...            # (선택) 알려진 취약점
```

- **강제 게이트는 `scripts/verify.sh` 한 곳**이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 배포 아티팩트는 **정적 링크 단일 바이너리**: `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION"`. 컨테이너는 distroless/scratch 베이스.
- 빌드 정보(버전·커밋)는 `-ldflags -X`로 주입하고 `/healthz`나 로그 시작 줄에 노출한다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등)는 `docker compose`(`deployments/`)로 기동한다. 리버스 프록시·IdP·오브젝트 스토리지는 **필요할 때 선택적으로** 추가한다.
- 반복 명령은 `Makefile`에 모은다(`make run`·`make test`·`make lint`). 단, **강제 게이트 로직은 `scripts/verify.sh`에만** 두고 Makefile은 이를 호출만 한다(로직 복제 금지).
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). 값 읽기는 **`internal/platform/config` 한 곳**에서만 — 하위 패키지의 `os.Getenv` 직접 호출 금지.
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다.

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (HTTP) | 8080 |
| 관계형 DB | 5432(PostgreSQL) / 3306(MySQL) |
| 캐시(선택) | 6379 |
| 메트릭/pprof(선택) | 프로젝트에서 지정(외부 노출 금지) |

## 명령 실행 주의 (macOS / zsh)

- dev 서버·watch(`air` 등)는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지). 캐시된 결과가 헷갈리면 `go clean -testcache` 후 재실행한다.
- `go test ./...`는 기본 병렬이다. 공유 리소스(DB)를 쓰는 테스트는 격리하거나 `-p 1`로 제한한다.
