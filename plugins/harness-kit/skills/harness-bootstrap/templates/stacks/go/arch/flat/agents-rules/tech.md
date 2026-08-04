<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 아키텍처: flat · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (플랫)

이 하네스는 **Go 백엔드 전용**이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
의존성·버전은 단일 소스 `go.mod` 가 관리하고 `go.sum`을 커밋한다. 모듈 경로는 `{{PACKAGE_NS}}`(예: `github.com/org/{{PROJECT_SLUG}}`).

레이아웃·승격 기준의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

> 이 변형의 스택 원칙: 적게 쓴다. 도구를 하나 더 들이기 전에 "표준 라이브러리로 되는가"를 먼저 묻는다.
> 스택이 커지는 것도 승격 신호다(`ARCHITECTURE.md` §0).

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | Go 1.22+ | `go.mod`의 `go` 지시자가 언어 버전 기준 |
| HTTP | **net/http** 표준 `ServeMux`(1.22+ 메서드·와일드카드 패턴) | 라우터 라이브러리는 표준으로 부족할 때만 |
| DB 접근 | `database/sql` + 드라이버 또는 **pgx** | 쿼리는 `store.go`에서 끝난다 |
| Migration | golang-migrate 또는 goose | DB를 쓴다면. `migrations/`에 SQL 파일 |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 저장소가 필요 없으면 만들지 않는다 |
| 로깅 | **log/slog**(표준) | 구조화 로그. `main`이 만들어 주입 |
| 설정 | 표준 `os` + 파서 | `internal/app/config.go` 한 곳. 필수값이 없으면 부팅 실패 |
| 포맷 | **gofumpt**(gofmt 상위집합) | 포맷 드리프트는 게이트에서 차단 |
| 린트 | golangci-lint (govet·staticcheck·errcheck·revive·gosec·bodyclose·depguard) | depguard는 최소 규칙만(순환·`net/http` 격리) |
| 취약점 | **govulncheck** | 정기·CI 실행 |
| 테스트 | 표준 **testing**(테이블 주도) + `-race` | 소스 옆 `*_test.go`. 목 라이브러리 없이 손수 짠 fake |
| API 문서 | OpenAPI 3.x(`api/`) | 엔드포인트가 공개일 때만. 내부 도구면 생략 가능 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 원칙에 따라 관리한다.

## 의존성 단일 소스 원칙

- 모든 의존성은 `go.mod` 가 관리하고 `go.sum`을 커밋한다. 빌드 재현성은 여기서 나온다.
- `go mod tidy`를 커밋 전에 돌린다. CI는 `go mod tidy` 후 diff가 없어야 통과하도록 검사할 수 있다.
- **이 변형에서 의존성 추가는 특히 보수적으로** 한다. 직접 의존이 10개를 넘어가기 시작하면 규모가 커졌다는 뜻이므로 §0의 승격 기준을 다시 읽는다.
- 새 의존성은 라이선스·유지보수 상태·전이 의존 수를 확인한 뒤 추가하고 근거를 PR에 남긴다.
- 도구 의존성(golangci-lint 등)은 버전을 고정한다(`tools.go` 또는 CI 액션 버전 고정).

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
    - depguard       # 최소 규칙(ARCHITECTURE.md §3.2)
    - misspell
    - unconvert
    - errorlint

linters-settings:
  errcheck:
    check-type-assertions: true
  # depguard 최소 규칙(store.go·model.go → net/http 금지)은 ARCHITECTURE.md §3.2 참조(원본).
  # 같은 패키지 안의 방향(handler → service → store)은 컴파일러가 막지 못한다 — 리뷰와
  # §3.3 승격 기준 테스트가 대신 지킨다.

issues:
  exclude-rules:
    - path: _test\.go
      linters: [gosec]
```

## 빌드 / 실행 명령

```bash
go build ./...                                   # 전체 컴파일
go run ./cmd/{{PROJECT_SLUG}}                    # 로컬 실행 (8080)
go test -race ./...                              # 테스트(경합 검출 포함)
go test -race -covermode=atomic -coverprofile=coverage.out ./...   # 커버리지
migrate -path migrations -database "$DATABASE_URL" up               # (DB 를 쓴다면)
bash scripts/verify.sh                           # 검증 게이트(아래 전부를 묶어 실행)
```

`scripts/verify.sh`가 묶는 것:

```bash
gofumpt -l .                 # 포맷 드리프트(출력이 있으면 실패)
go build ./...               # 컴파일
go vet ./...                 # 표준 정적 분석
golangci-lint run            # 린트(depguard 최소 규칙 포함)
go test -race ./... -cover   # 테스트 + 경합 + 커버리지 임계 (+ 승격 기준 테스트)
govulncheck ./...            # (선택) 알려진 취약점
```

- 강제 게이트는 `scripts/verify.sh` 한 곳이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 승격 기준을 게이트로 만들 수 있다: `internal/app/`의 소스 파일 수 상한을 검사하는 테스트(`ARCHITECTURE.md` §3.3). 상한을 넘으면 게이트가 실패하며 `feature`로 승격하라고 알린다 — 이 변형이 조용히 방치되는 것을 막는 장치다.
- 배포 아티팩트는 **정적 링크 단일 바이너리**: `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$VERSION"`. 컨테이너는 distroless/scratch 베이스.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등)가 필요하면 `docker compose`(`deployments/`)로 기동한다. 필요 없으면 만들지 않는다.
- 반복 명령은 `Makefile`에 모아도 되지만, 강제 게이트 로직은 `scripts/verify.sh`에만 둔다(로직 복제 금지).
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). 값 읽기는 `internal/app/config.go` 한 곳에서만 — 다른 파일의 `os.Getenv` 직접 호출 금지. `main`이 1회 로드해 주입한다.
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다.

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (HTTP) | 8080 |
| 관계형 DB(선택) | 5432(PostgreSQL) / 3306(MySQL) |
| 그 외 선택 구성요소 | 프로젝트에서 지정 |

## 명령 실행 주의 (macOS / zsh)

- dev 서버·watch(`air` 등)는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지). 캐시된 결과가 헷갈리면 `go clean -testcache` 후 재실행한다.
- `go test ./...`는 기본 병렬이다. 공유 리소스(DB)를 쓰는 테스트는 격리하거나 `-p 1`로 제한한다.
