<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 아키텍처: feature · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (패키지 바이 피처)

이 하네스는 **Go 백엔드 전용**이다. 아래 스택·버전은 **예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정**한다.
의존성·버전은 **단일 소스 `go.mod`** 가 관리하고 `go.sum`을 커밋한다. 모듈 경로는 `{{PACKAGE_NS}}`(예: `github.com/org/{{PROJECT_SLUG}}`).

레이아웃·기능 독립 계약의 정본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | **Go 1.22+** | `go.mod`의 `go` 지시자가 언어 버전 기준 |
| HTTP | **net/http** (+ `chi` 등 경량 라우터) | 라우트 등록은 기능의 `handler.go`, 마운트는 `main`이 한다 |
| DB 접근 | **pgx**(PostgreSQL) 또는 `database/sql` + 드라이버 | 커넥션 풀은 `internal/platform/db` 한 곳. 쿼리는 기능의 `store.go`에서 |
| Migration | **golang-migrate** 또는 **goose** | `migrations/`에 SQL 파일. **기능별로 나누지 않고 한 히스토리**로 관리 |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 메타데이터·권한의 단일 소스 |
| 로깅 | **log/slog**(표준) | `internal/platform/log`에서 구성하고 주입. 전역 지양 |
| 설정 | env 로드(표준 `os` + 파서, `envconfig`·`viper` 선택) | **`internal/platform/config` 한 곳**에서 구조체 1개로 |
| 공통 HTTP | `internal/platform/httpx` | envelope·에러 매핑·미들웨어. **기능을 모른다** |
| 포맷 | **gofumpt**(gofmt 상위집합) | 포맷 드리프트는 게이트에서 차단 |
| 린트 | **golangci-lint** (govet·staticcheck·errcheck·revive·**depguard**·gosec·bodyclose·contextcheck) | depguard = **기능 간 직접 import 차단** |
| 취약점 | **govulncheck** | 정기·CI 실행 |
| 테스트 | 표준 **testing**(테이블 주도) + `-race` · 구조 테스트(`internal/architecture_test.go`) | 기능 단위로 완결된 테스트를 쓴다 |
| API 문서 | **OpenAPI 3.x**(`api/` 에 스펙) + `oapi-codegen`(선택) | spec-first 권장(스펙이 계약 정본) |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 원칙에 따라 관리한다.

## 의존성 단일 소스 원칙

- 모든 의존성은 **`go.mod`** 가 관리하고 **`go.sum`을 커밋**한다. 빌드 재현성은 여기서 나온다.
- `go mod tidy`를 커밋 전에 돌린다(불필요 의존 제거 · 누락 추가). CI는 **`go mod tidy` 후 diff가 없어야** 통과하도록 검사할 수 있다.
- **기능별로 의존성을 나누지 않는다.** 모듈이 하나이므로 의존성도 하나다. 한 기능만 쓰는 무거운 의존성이 생기면 그 자체가 **분리 신호**다(`ARCHITECTURE.md` §0).
- **의존성을 늘리기 전에 표준 라이브러리를 먼저 본다.** 작은 유틸을 위해 의존성을 추가하지 않는다.
- 도구 의존성(golangci-lint 등)은 버전을 고정한다(`tools.go` 또는 `go.mod` tool 지시자, CI 액션 버전 고정).

### `.golangci.yml` 핵심 설정 (예시 골격)

```yaml
run:
  timeout: 5m

linters:
  enable:
    - govet
    - staticcheck
    - errcheck
    - revive
    - gosec
    - bodyclose
    - contextcheck
    - depguard       # 기능 독립·platform 격리 강제(ARCHITECTURE.md §3.2)
    - misspell
    - unconvert
    - errorlint

linters-settings:
  errcheck:
    check-type-assertions: true
  # depguard 규칙(기능 간 직접 import 금지 · platform → 기능 금지 ·
  # store.go·model.go → net/http 금지)은 ARCHITECTURE.md §3.2 참조(정본)
  # ★ 새 기능을 추가하면 독립 규칙 쌍을 등록한다(등록 누락 = 강제 누락).
  #   구조 테스트(§3.3)를 쓰면 등록 없이도 자동 검사된다.

issues:
  exclude-rules:
    - path: _test\.go
      linters: [gosec]
```

## 빌드 / 실행 명령

```bash
go build ./...                                        # 전체 컴파일
go run ./cmd/{{PROJECT_SLUG}}                         # 로컬 실행 (8080)
go test -race ./...                                   # 전체 테스트
go test -race ./internal/{{DOMAIN_EXAMPLE}}/...       # 한 기능만
go test -race -covermode=atomic -coverprofile=coverage.out ./...   # 커버리지
migrate -path migrations -database "$DATABASE_URL" up              # 마이그레이션(예시)
bash scripts/verify.sh                                # 검증 게이트(정본 · 아래 전부를 묶어 실행)
```

`scripts/verify.sh`가 묶는 것:

```bash
gofumpt -l .                 # 포맷 드리프트(출력이 있으면 실패)
go build ./...               # 컴파일
go vet ./...                 # 표준 정적 분석
golangci-lint run            # 린트(depguard 기능 독립 강제 포함)
go test -race ./... -cover   # 테스트 + 경합 + 커버리지 임계 (+ 구조 테스트)
govulncheck ./...            # (선택) 알려진 취약점
```

- **강제 게이트는 `scripts/verify.sh` 한 곳**이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 기능 독립은 depguard와 **구조 테스트**가 이중으로 지킨다. 구조 테스트는 새 기능이 늘어도 자동으로 따라간다(`ARCHITECTURE.md` §3.3).
- 배포 아티팩트는 **정적 링크 단일 바이너리**: `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION"`. 컨테이너는 distroless/scratch 베이스.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등)는 `docker compose`(`deployments/`)로 기동한다. 부가 구성요소는 **필요할 때 선택적으로** 추가한다.
- 반복 명령은 `Makefile`에 모은다. 단, **강제 게이트 로직은 `scripts/verify.sh`에만** 두고 Makefile은 이를 호출만 한다(로직 복제 금지).
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). 값 읽기는 **`internal/platform/config` 한 곳**에서만 — 기능 패키지의 `os.Getenv` 직접 호출 금지. `main`이 1회 로드해 각 기능에 주입한다.
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
