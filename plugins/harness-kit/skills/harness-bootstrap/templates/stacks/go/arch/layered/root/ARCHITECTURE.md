<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}(모듈 경로)·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Go 백엔드 · 아키텍처: layered -->

# ARCHITECTURE — {{PROJECT_NAME}} (레이어드)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 **표준 Go 프로젝트 레이아웃**([golang-standards/project-layout](https://github.com/golang-standards/project-layout))을 최상위 뼈대로 쓰고,
`internal/` 안에서 레이어드 아키텍처(handler → service → repository → model) 를 구현한다.
의존 방향은 `internal/` 가시성(컴파일러) + import 사이클 금지(컴파일러) + depguard 린트로 강제한다.

스택 기준(버전 기준은 `go.mod` — 구체 버전은 **예시이며 프로젝트에서 확정**):
Go 1.22+ · net/http(+chi 등 라우터) · pgx/database\_sql(관계형 DB) · golang-migrate/goose · log/slog · golangci-lint · gofumpt · go test -race.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 하나의 응집된 서비스이고 도메인 경계가 아직 하나다.
- CRUD 비중이 높고 규칙이 "데이터 + 얇은 정책" 수준이다.
- 팀이 작고 인지 비용을 낮게 유지하는 것이 우선이다.
- 관계형 DB 하나가 주 저장소이고 외부 시스템 통합이 적다.

**쓰지 않는다:**
- 기능 영역이 이미 여럿이고 각각 다른 사람이 만진다 → `feature`(패키지 바이 피처).
- 도메인 규칙이 복잡해 순수 모델·불변식·포트/어댑터가 필요하다 → `hexagonal`.
- 파일이 손에 꼽을 만큼 적은 초기 프로토타입이다 → `flat`.

승격 신호(이 중 둘 이상이면 `feature`·`hexagonal` 전환을 검토한다):
1. `internal/service`에 서로 무관한 도메인의 파일이 10개 넘게 쌓인다.
2. `handler`·`service`·`repository` 세 디렉터리를 오가며 한 기능을 고치는 비용이 체감된다.
3. 저장소·외부 시스템을 교체할 요구가 실제로 생긴다(포트/어댑터의 실익).

전환 절차는 §11.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 내부 패키지 외부 노출 차단 | **`internal/`** (Go 컴파일러 기본 규칙) | 컴파일 실패 |
| 순환 의존 금지 | Go 컴파일러(import cycle) | 컴파일 실패 |
| 레이어 단방향 (handler→service→repository→model) | `golangci-lint`의 **depguard** 규칙 | 린트 실패 → 게이트 차단 |
| 레이어 건너뛰기 금지 (handler → repository 직접 import 금지) | depguard 규칙 | 게이트 차단 |
| 안쪽 레이어는 전송 계층 무의존 | depguard: `service`·`repository`·`model`에서 `net/http` 금지 | 게이트 차단 |
| 에러는 값으로 전파 | `errcheck`(미처리 error 검출) | 게이트 차단 |
| 경합 없는 동시성 | `go test -race` | 게이트 차단 |
| API 응답 일관성 | `common`의 envelope + 에러 매핑 1곳 | 코드리뷰·핸들러가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(service 우선) | 커버리지 게이트 |

> 기계적 강제 우선. Go는 `internal/`과 import 사이클을 컴파일러가 막아준다. 컴파일러가 못 잡는 레이어 방향은 depguard가 막는다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌──────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}     │
 │(Web/CLI) │        │  (Go 서비스 바이너리) │
 └──────────┘        └──────────┬───────────┘
                                │
        ┌──────────────┬────────┴───────┬──────────────┐
        ▼              ▼                ▼              ▼
  ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
  │ 관계형 DB   │ │ Cache/Queue │ │ Object Store│ │ 외부 시스템 │
  │  (선택)     │ │  (선택)      │ │  (선택)      │ │  (선택)     │
  └────────────┘ └─────────────┘ └─────────────┘ └────────────┘
```

- 데이터 저장소·부가 구성요소는 **모두 선택**이며 프로젝트가 채택 여부를 정한다.
- 서비스 인스턴스는 **무상태**. 세션/락 상태는 외부 저장소(DB·캐시)에 둔다.
- 배포 아티팩트는 정적 링크 단일 바이너리 + 스크래치/디스트로리스 컨테이너(`CGO_ENABLED=0`).

---

## 3. 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── cmd/
│   └── {{PROJECT_SLUG}}/main.go   # 진입점. "조립만" 한다(로직 금지, 100줄 내외)
├── internal/                      # 외부 모듈이 import 할 수 없다(컴파일러 강제)
│   ├── config/                    #   env 로드(구조체 1개) — main 에서 1회
│   ├── database/                  #   커넥션 풀·트랜잭션 헬퍼
│   ├── logger/                    #   log/slog 구성
│   ├── middleware/                #   requestid·recover·access log·auth
│   ├── common/                    #   envelope·errcode·페이지네이션 타입
│   ├── handler/                   #   HTTP 경계: 라우팅·DTO·상태코드
│   ├── service/                   #   비즈니스 규칙 · 트랜잭션 경계
│   ├── repository/                #   데이터 접근(쿼리·스캔·매핑)
│   └── model/                     #   도메인 타입(엔티티·VO·상태 상수)
├── pkg/                           # 외부 공개 라이브러리만. 공개할 게 없으면 만들지 않는다
├── api/                           # OpenAPI 스펙·proto (계약 원본)
├── configs/ · deployments/ · migrations/ · test/ · build/
├── scripts/verify.sh              # 단일 검증 게이트
└── docs/
```

- `internal/`이 기본이다. 외부에 라이브러리로 공개할 코드가 실제로 있을 때만 `pkg/`를 만든다.
- `cmd/<binary>/main.go`는 **의존성 조립·설정 로드·서버 기동만** 한다.
- **단위 테스트는 소스와 같은 디렉터리**에 `*_test.go`로 둔다(`test/`는 e2e·픽스처 전용).
- `src/` 디렉터리를 만들지 않는다(Go 관례 아님).

### 3.1 레이어 ↔ 의존 가능

```
        요청
         │
    ┌────▼──────────────────────────────────┐
    │ internal/handler   HTTP 경계 · DTO     │  net/http 를 아는 유일한 레이어
    └────┬──────────────────────────────────┘
    ┌────▼──────────────────────────────────┐
    │ internal/service   규칙 · 트랜잭션 경계 │
    └────┬──────────────────────────────────┘
    ┌────▼──────────────────────────────────┐
    │ internal/repository  쿼리 · 스캔 · 매핑 │
    └────┬──────────────────────────────────┘
    ┌────▼──────────────────────────────────┐
    │ internal/model     도메인 타입          │  표준 라이브러리만
    └───────────────────────────────────────┘

  가로지르는 것: config · database · logger · middleware · common
```

| 패키지 | 책임 | 의존 가능 |
|---|---|---|
| `cmd/<binary>` | 조립(main) | `internal/...` 전부(조립 목적) |
| `internal/handler` | 라우팅·DTO·상태코드·에러→응답 변환 | `service`, `common`, `model`(읽기용), `middleware` |
| `internal/service` | 비즈니스 규칙·**트랜잭션 경계**·정책 검사 | `repository`, `model`, `common` |
| `internal/repository` | 쿼리·스캔·매핑·페이지네이션 | `model`, `database`, `common` |
| `internal/model` | 엔티티·VO·상태 상수·불변식 메서드 | — (표준 라이브러리만) |
| `internal/common` | envelope·errcode·공용 타입 | `model` |
| `internal/{config,database,logger,middleware}` | 기술 토대 | 표준 라이브러리 + 드라이버 |

- **의존 금지(게이트 차단)**: `service → handler`, `repository → service/handler`, `model → 위 전부`, `service`·`repository`·`model` → `net/http`, `handler` → `repository`(레이어 건너뛰기).
- 레이어를 건너뛰지 않는다: 조회만 하는 엔드포인트라도 서비스를 통과시킨다(규칙은 나중에 생긴다).

### 3.2 depguard 로 레이어 강제 (`.golangci.yml`)

컴파일러가 못 막는 **레이어 방향**을 린터가 막는다. 규칙은 아키텍처가 바뀔 때만 바꾼다.

```yaml
linters-settings:
  depguard:
    rules:
      inner-layers-have-no-transport:       # 안쪽 레이어는 전송 계층을 모른다
        files:
          - "**/internal/service/**"
          - "**/internal/repository/**"
          - "**/internal/model/**"
        deny:
          - pkg: "net/http"
            desc: "전송 계층은 handler 에서만 다룬다"
          - pkg: "github.com/go-chi/chi/v5"
            desc: "라우터는 handler 의 관심사다"
      model-is-pure:                        # 도메인 타입은 영속 메커니즘을 모른다
        files: ["**/internal/model/**"]
        deny:
          - pkg: "database/sql"
            desc: "model 은 SQL 을 모른다. 쿼리는 repository 에서 다룬다"
          - pkg: "github.com/jackc/pgx/v5"
            desc: "model 은 드라이버를 모른다"
      handler-does-not-skip-service:        # 레이어 건너뛰기 금지
        files: ["**/internal/handler/**"]
        deny:
          - pkg: "{{PACKAGE_NS}}/internal/repository"
            desc: "handler 는 service 를 통해 데이터에 접근한다(트랜잭션·정책 우회 방지)"
      repository-does-not-look-up:          # 아래 레이어는 위를 모른다
        files: ["**/internal/repository/**"]
        deny:
          - pkg: "{{PACKAGE_NS}}/internal/service"
            desc: "repository 는 service 를 모른다"
          - pkg: "{{PACKAGE_NS}}/internal/handler"
            desc: "repository 는 handler 를 모른다"
```

> 새 레이어 패키지를 만들면 규칙 경로 패턴이 그것을 덮는지 확인한다(덮지 않으면 강제 대상 밖이다).
> 대안으로 `go-arch-lint`(YAML로 컴포넌트·의존 그래프 선언)를 쓸 수 있다. 어느 쪽이든 위반이 `scripts/verify.sh`에서 실패로 나오는 것이 핵심이다.

### 3.3 인터페이스는 소비자 쪽에 (Go 관례)

레이어드에서도 인터페이스는 구현체가 아니라 사용하는 쪽이 선언한다. `service`가 필요한 저장 동작을 인터페이스로 선언하고 `repository`가 그 시그니처를 만족한다(명시적 implements 선언 없음).

```go
// internal/service/{{DOMAIN_EXAMPLE}}.go
package service

// {{DOMAIN_EXAMPLE}}Store는 {{DOMAIN_EXAMPLE}} 영속에 필요한 최소 동작이다.
// service 가 선언하므로 테스트에서 fake 로 바꿔 끼울 수 있다.
type {{DOMAIN_EXAMPLE}}Store interface {
	Save(ctx context.Context, m *model.{{DOMAIN_EXAMPLE}}) error
	FindByCode(ctx context.Context, code string) (*model.{{DOMAIN_EXAMPLE}}, error)
}
```

- **인터페이스는 작게**(1~3 메서드). 거대한 단일 `Repository` 인터페이스는 테스트 대역 작성을 어렵게 한다.
- 모든 메서드의 첫 인자는 `ctx context.Context` 다(취소·타임아웃·요청 스코프 값 전파).
- 시그니처에 SQL·컬럼·`*sql.Tx`를 노출하지 않는다.

---

## 4. 레이어 책임

| 레이어 | 해야 할 일 | 하면 안 되는 일 |
|---|---|---|
| `handler` | 입력 디코딩·검증, 인증 주체 추출, 서비스 호출, envelope 응답, 에러→상태코드 매핑 | 비즈니스 분기, 쿼리 실행, 트랜잭션 제어 |
| `service` | 비즈니스 규칙, 권한·정책 검사, **트랜잭션 경계**, 여러 저장소 조합 | HTTP 개념(`http.Request`·상태코드), 원시 SQL 직접 실행 |
| `repository` | 쿼리 작성·실행, 스캔 구조체 ↔ 모델 매핑, 페이지네이션 | 비즈니스 판단, 트랜잭션 커밋 |
| `model` | 타입·불변식·상태 전이 메서드 | 외부 호출, DB·HTTP 참조 |

- 트랜잭션 경계는 `service`에만. 트랜잭션은 service가 시작·커밋하고, repository는 주입된 실행기(`Querier` 추상)를 쓰기만 한다.
  - 패턴: `TxManager` 인터페이스(`WithinTx(ctx, func(ctx) error) error`)를 `service`가 선언하고 `database`/`repository`가 구현. 트랜잭션 핸들은 `ctx`로 전파한다.
- 비즈니스 규칙은 `service`와 `model`에. 상태 불변식은 모델 메서드로, 오케스트레이션·정책은 서비스로.
- 생성자 주입 only. 패키지 전역 변수(`var db *sql.DB`)·`init()` 부작용 금지. 시간·난수·ID는 인터페이스(`Clock`·`IDGenerator`)로 주입한다.
- 로깅은 `handler`/`service`/`repository`에서만, 한 번만. `model`은 로깅 금지. `log/slog` 구조화 로깅을 쓰고 로거는 주입한다(전역 로거 지양).
- **DB 접근**: `pgx`(또는 `database/sql`) + 파라미터 바인딩. `sqlc`로 컴파일 타임 검증된 쿼리를 생성해도 좋다. 스캔 구조체와 `model` 타입은 다른 타입이며 repository가 변환한다.

### 4.1 에러 처리 규약 (Go 핵심)

- 에러는 값이다. 모든 error를 처리하거나 반환한다(`errcheck`가 미처리를 잡는다). `_ = err`로 버리지 않는다.
- 래핑으로 맥락을 더한다: `fmt.Errorf("{{DOMAIN_EXAMPLE}} 저장 실패: %w", err)`. `%w`로 원인을 보존해 `errors.Is/As`가 동작하게 한다.
- **도메인 오류는 sentinel 또는 타입**으로 `model`(또는 `common`)에 정의한다: `var ErrNotFound = errors.New("not found")`. `handler`에서 `errors.Is/As`로 판별해 HTTP status·에러코드로 변환한다.
- 에러 문자열은 소문자로 시작하고 마침표를 붙이지 않는다(Go 관례 — 래핑 시 문장이 이어진다).
- panic 금지(요청 처리 경로). HTTP 서버는 recover 미들웨어를 두되, recover를 정상 흐름으로 쓰지 않는다.
- 에러에 민감정보(토큰·키·개인정보)를 넣지 않는다.

### 4.2 동시성 규약

- `context.Context`를 첫 인자로 전파한다. 구조체 필드에 저장하지 않는다.
- 고루틴에는 소유자와 종료 조건이 있어야 한다. 누가 기다리고(`sync.WaitGroup`/`errgroup.Group`), 무엇으로 멈추는지(`ctx.Done()`) 명시한다.
- **채널 소유권**: 보내는 쪽이 닫는다. 공유 상태는 뮤텍스 또는 채널 중 하나로만 보호한다. 데이터 경합은 `go test -race`가 잡는다(게이트 필수).
- 팬아웃은 상한을 둔다(세마포어·워커 풀). 무제한 고루틴 생성 금지.

---

## 5. 코드 주석 규약 (요약)

- 코드는 라인 단위 What/How를, 주석은 Why를 설명한다. 단 함수·메서드 doc comment는 ① 책임 한 줄 + ② 비자명한 Why + ③ `처리 흐름:`(의도를 곁들인 단계) 로 로직 이해를 돕는다.
- Go doc 규약을 따른다: doc comment는 **선언 이름으로 시작**한다(`// Create{{DOMAIN_EXAMPLE}}는 ...`). exported 식별자에는 doc comment를 단다. 패키지 주석은 `// Package <name> ...`.
- 시그니처를 옮긴 번역투 금지. 자명한 접근자는 주석 생략. `//nolint:` 에는 반드시 이유를 적는다.
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 6. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 도메인 상수 | 상태·역할·액션 라벨 | `const` 블록 + 타입 있는 상수(`type Status string`) — `model` |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `internal/config`에서 env 로드(구조체 1개) |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블/기능 플래그(캐시·무효화 동반) |

- 설정은 **`main`에서 1회 로드해 주입**한다. 하위 패키지가 `os.Getenv`를 직접 부르지 않는다.
- 타임아웃·리트라이 횟수·페이지 상한은 이름 있는 상수로.

---

## 7. 성능 예산 (부하테스트로 확정)

- 무한/대량 결과 금지: cursor pagination + 상한 `limit`. 전체 스캔·전량 메모리 적재 금지.
- **N+1 회피**: 배치·조인·`IN` 조회. WHERE/JOIN/ORDER BY 컬럼에 인덱스 동반.
- **커넥션 풀 설정**: `SetMaxOpenConns`·`SetMaxIdleConns`·`SetConnMaxLifetime`을 명시적으로 설정한다(기본값은 무제한이라 DB를 고갈시킬 수 있다).
- **HTTP 클라이언트 재사용**: 요청마다 `http.Client` 생성 금지. `http.DefaultClient`는 타임아웃이 없다 — `Timeout`을 설정한 클라이언트를 만들어 주입한다.
- **서버 타임아웃**: `ReadHeaderTimeout`·`ReadTimeout`·`WriteTimeout`·`IdleTimeout`을 설정한다(미설정 시 slowloris에 노출).
- 응답 본문은 항상 닫는다(`defer resp.Body.Close()`).

| 경로 부류 | 예 | 목표(예시 — 프로젝트 확정) | 도달 레버 |
|---|---|---|---|
| 캐시/인증 핫패스 | 키 검증·캐시 조회 | 고 TPS/인스턴스 | 캐시(TTL+무효화), 할당 최소화 |
| 일반 읽기 | 목록·상세 | 수천 TPS/인스턴스 | 인덱스·keyset·풀 사이징 |
| 쓰기 | 생성·수정 | 수백~수천 TPS | 무거운 작업은 비동기 워커로 |

---

## 8. TDD 워크플로 (요약)

```
RED   service 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. 테스트 없는 `service` 변경 금지.
- 표준 `testing` + 테이블 주도 테스트가 기본이다. 목 프레임워크보다 **직접 만든 fake**를 우선한다(인터페이스가 작아 쉽다).
- `t.Parallel()`을 기본으로 쓰되 공유 상태를 만들지 않는다. `-race`는 항상 켠다.

| 레이어 | 도구 | 비고 |
|---|---|---|
| `model` | `testing`(테이블 주도) | 불변식·상태 전이. 표준 라이브러리만 |
| `service` | `testing` + 손수 짠 fake(store) | 규칙·트랜잭션 순서. DB·HTTP 없음 |
| `repository` | `testing` + 실제 DB(testcontainers-go 선택) | 쿼리·매핑·격리 정책 |
| `handler` | `net/http/httptest` | 라우팅·envelope·status 검증 |
| e2e | `test/` + 기동된 바이너리/컨테이너 | 핵심 플로우 smoke |

- 검증 게이트: `bash scripts/verify.sh` (CI·pre-commit·hook이 모두 이 스크립트를 호출).

---

## 9. 새 기능 추가 워크플로

1. **레이어 결정**: 새 리소스인지, 기존 리소스의 새 동작인지 먼저 답한다.
2. **파일 세트 생성**: `model/<x>.go` → `repository/<x>.go` → `service/<x>.go` → `handler/<x>.go`. 새 레이어 패키지를 만들면 depguard 규칙이 덮는지 확인한다.
3. **TDD 사이클**: `model`(불변식) → `service`(fake store) → `repository`(실제 DB) → `handler`(`httptest`, 응답은 envelope) → `cmd`(조립·smoke).
4. **검증**: `bash scripts/verify.sh` 통과 + `api/`의 OpenAPI 스펙 동기화.
5. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록.

---

## 10. Anti-pattern (코드리뷰 즉시 차단)

- `handler`가 `repository`를 직접 호출(레이어 건너뛰기 — 트랜잭션·정책 우회).
- `handler`가 `model` 타입이나 DB 스캔 구조체를 그대로 JSON으로 반환(DTO·envelope 우회).
- `service`/`repository`/`model`이 `net/http`·라우터를 import.
- `model`이 `database/sql`·드라이버를 import.
- repository가 트랜잭션을 커밋(경계 분산).
- 인터페이스를 구현체 쪽(`repository`)에 선언하고 `service`가 그것을 import(의존 방향 역전 실패).
- `context.Context`를 구조체 필드에 저장하거나 `context.TODO()`를 프로덕션 경로에 방치.
- 종료 조건 없는 고루틴(누수), 결과를 아무도 읽지 않는 채널.
- `err`를 무시(`_ = err`)하거나 로그만 남기고 계속 진행.
- `panic`으로 정상 오류 흐름 처리.
- 패키지 전역 가변 상태(`var db *sql.DB`)·`init()`에서 I/O 수행.
- 타임아웃 없는 `http.Client`/`http.Server`, `resp.Body.Close()` 누락.
- 거대 `util`/`helper` 패키지에 무관한 함수 쌓기(응집도 붕괴).
- 테스트 없이 `service` 코드 추가.

---

## 11. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `feature` (기능 영역이 여럿으로 갈릴 때) | `handler/<x>.go`·`service/<x>.go`·`repository/<x>.go`·`model/<x>.go` 를 `internal/<x>/{handler,service,store,model}.go` 로 모은다. `config`·`database`·`logger`·`middleware`는 `internal/platform/`으로 옮긴다. | 레이어 경로 규칙을 feature 간 직접 import 금지 규칙으로 교체(`internal/<a>` → `internal/<b>` deny) |
| → `hexagonal` (도메인 규칙이 복잡해질 때) | `service/` → `<ctx>/app/`, `repository/` → `<ctx>/infra/`, `handler/` → `<ctx>/primary/http/`, `model/` → `<ctx>/domain/`. 포트 인터페이스를 `app`에 모으고 어댑터를 분리한다. | depguard 규칙을 `domain-is-pure`·`app-has-no-adapters`·`primary-and-infra-are-siblings` 3종으로 교체 |
| → `flat` (범위가 줄어 파일이 몇 개뿐일 때) | 네 레이어 파일을 `internal/app/` 한 패키지로 합친다(파일명은 유지: `handler.go`·`service.go`·`store.go`·`model.go`). | 레이어 규칙을 최소 규칙(순환 금지·`store`에서 `net/http` 금지)으로 축소 |

- 전환은 **한 번에 한 리소스씩** 옮기고 각 단계마다 `scripts/verify.sh`를 통과시킨다. 규칙을 먼저 고치면 전 구간이 빨간불이 되어 되돌리기 어렵다.
- Go는 **패키지 이동이 곧 import 경로 변경**이라 도구(`gopls` 리네임)로 기계적으로 처리할 수 있다. 컴파일러가 누락을 잡아준다.
- 전환 시작 전 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).

---

## 12. 관련 문서

- 스택·구조·보안·API 규약 원본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
- 레이아웃 근거: [golang-standards/project-layout](https://github.com/golang-standards/project-layout)
