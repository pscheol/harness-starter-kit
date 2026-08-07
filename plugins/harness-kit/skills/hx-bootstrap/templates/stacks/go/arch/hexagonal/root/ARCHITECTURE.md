<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}(모듈 경로)·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Go 백엔드 · 아키텍처: hexagonal -->

# ARCHITECTURE — {{PROJECT_NAME}}

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 **표준 Go 프로젝트 레이아웃**([golang-standards/project-layout](https://github.com/golang-standards/project-layout))을 최상위 뼈대로 쓰고,
그 안(`internal/`)에서 클린 아키텍처(헥사고날) + DDD + TDD를 구현한다. 의존 방향은 `internal/` 가시성(컴파일러) + import 사이클 금지(컴파일러) + depguard/아키텍처 린터로 강제한다.

스택 기준(버전 기준은 `go.mod` — 구체 버전은 **예시이며 프로젝트에서 확정**):
Go 1.22+ · net/http(+chi 등 라우터) · pgx/database\_sql(관계형 DB) · golang-migrate/goose · log/slog · golangci-lint · gofumpt · go test -race.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 내부 패키지 외부 노출 차단 | **`internal/`** (Go 컴파일러 기본 규칙) | 컴파일 실패 |
| 순환 의존 금지 | Go 컴파일러(import cycle) | 컴파일 실패 |
| 레이어 단방향 의존 | `golangci-lint`의 **depguard** 규칙(+ 선택 `go-arch-lint`) | 린트 실패 → 게이트 차단 |
| 도메인은 프레임워크 무의존 | depguard: `domain`에서 http/sql/router import 금지 | 게이트 차단 |
| 에러는 값으로 전파 | `errcheck`(미처리 error 검출) | 게이트 차단 |
| 경합 없는 동시성 | `go test -race` | 게이트 차단 |
| API 응답 일관성 | `common`의 envelope + 에러 매핑 1곳 | 코드리뷰·핸들러가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(도메인/유스케이스 우선) | 커버리지 게이트 |

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
- 배포 아티팩트는 정적 링크 단일 바이너리 + 스크래치/디스트로리스 컨테이너. 크로스 컴파일(`CGO_ENABLED=0`)을 기본으로 한다.

---

## 3. 리포 레이아웃 (golang-standards/project-layout)

```
{{PROJECT_SLUG}}/
├── cmd/
│   └── {{PROJECT_SLUG}}/main.go   # 진입점. "조립만" 한다(로직 금지, 100줄 내외)
├── internal/                      # 외부 모듈이 import 할 수 없다(컴파일러 강제)
│   ├── core/                      #   프레임워크 0. 도메인 에러·공용 타입·상수
│   ├── common/                    #   공유 커널: envelope·errcode·미들웨어·requestid
│   ├── {{DOMAIN_EXAMPLE}}/        #   바운디드 컨텍스트
│   │   ├── domain/                #     엔티티·VO·도메인 서비스 (순수 Go)
│   │   ├── app/                   #     유스케이스 + 포트(인터페이스 선언)
│   │   ├── primary/http/          #     inbound 어댑터: handler·dto·route
│   │   └── infra/                 #     outbound 어댑터: postgres/ · client/
│   └── platform/                  #   기술 토대: config·db·logger·telemetry
├── pkg/                           # 외부 공개 라이브러리만. 공개할 게 없으면 만들지 않는다
├── api/                           # OpenAPI 스펙·proto (계약 원본)
├── configs/                       # 설정 파일 템플릿(비밀값 금지)
├── deployments/                   # Dockerfile·compose·IaC
├── migrations/                    # DB 마이그레이션 SQL
├── test/                          # e2e·외부 테스트 데이터(단위 테스트는 소스 옆)
├── build/                         # 패키징·CI 보조 스크립트
├── scripts/verify.sh              # 단일 검증 게이트
└── docs/                          # 사람이 읽는 문서
```

- `internal/`이 기본이다. 외부에 라이브러리로 공개할 코드가 실제로 있을 때만 `pkg/`를 만든다(빈 `pkg/`를 관례로 만들지 않는다 — 레이아웃 저장소도 남용을 경고한다).
- `cmd/<binary>/main.go`는 **의존성 조립·설정 로드·서버 기동만** 한다. 비즈니스 로직·핸들러 구현을 두지 않는다.
- **단위 테스트는 소스와 같은 패키지 디렉터리**에 `*_test.go`로 둔다(`test/`는 e2e·픽스처 전용).
- `src/` 디렉터리를 만들지 않는다(Go 관례 아님).

---

## 4. 헥사고날 (internal/ 내부)

한 바운디드 컨텍스트(`<ctx>`)는 `primary` · `app` · `domain` · `infra` 로 구성되고, 그 아래 `common`·`core` 공유 토대가 깔린다.

```
        ┌──────────────────────────────────────────────┐
        │ cmd/{{PROJECT_SLUG}}  조립·실행(main)          │
        └───────────────────────┬──────────────────────┘
                                │ 조립(생성자 주입)
 ┌────────────── internal/<ctx>/ ────────────────────┐
 │  (예: {{DOMAIN_EXAMPLE}} · auth · ...)             │
 │  ┌──────────┐   ┌────────────────┐   ┌──────────┐ │
 │  │ primary  │──▶│      app        │◀──│  infra   │ │
 │  │ inbound  │   │  ├ UseCase(IF)  │   │ outbound │ │
 │  │ (HTTP)   │   │  └ Port(IF)     │   │(pgx 등)  │ │
 │  └──────────┘   └───────┬────────┘   └──────────┘ │
 │                         ▼                          │
 │              ┌──────────────────────┐              │
 │              │      domain          │              │
 │              │ Entity·VO·Service    │              │
 │              │   (순수 Go)          │              │
 │              └──────────────────────┘              │
 └───────────────────────┬───────────────────────────┘
                  ┌───────┴───────┐  internal/common (envelope·errcode·미들웨어)
                  └───────┬───────┘
                  ┌───────┴───────┐  internal/core   (도메인 에러·primitives)
                  └───────────────┘
```

### 4.1 패키지 ↔ 레이어 매핑

| 패키지 | 레이어 | 의존 가능 |
|---|---|---|
| `cmd/<binary>` | 조립(main) | `internal/...` 전부(조립 목적) |
| `internal/<ctx>/primary/http` | Inbound Adapter | `app`, `common` |
| `internal/<ctx>/infra/...` | Outbound Adapter | `app`, `common`, `core` |
| `internal/<ctx>/app` | Use Case + Port | `domain`, `core` |
| `internal/<ctx>/domain` | Domain Model | `core` |
| `internal/common` | 공유 커널(web) | `core` |
| `internal/core` | Primitives | — (표준 라이브러리만) |
| `internal/platform` | 기술 토대(config·db·log) | 표준 라이브러리 + 드라이버 |

- 의존 금지: `domain → infra/primary`, `app → infra/primary`, `core → 서드파티`, `primary ↔ infra`.
- 4패키지는 **항상 한 묶음으로 추가·제거**한다.
- 컨텍스트 간 직접 import 금지. 통합이 필요하면 제공 컨텍스트의 **공개 계약 패키지**(`internal/<ctx>/contract`)나 도메인 이벤트를 경유한다.

### 4.2 depguard 로 레이어 강제 (`.golangci.yml`)

컴파일러가 못 막는 **레이어 방향**을 린터가 막는다. 규칙은 아키텍처가 바뀔 때만 바꾼다.

```yaml
linters-settings:
  depguard:
    rules:
      domain-is-pure:                       # 도메인은 프레임워크·인프라 무의존
        files: ["**/internal/*/domain/**"]
        deny:
          - pkg: "net/http"
            desc: "도메인은 전송 계층을 모른다. HTTP 는 primary 어댑터에서 다룬다"
          - pkg: "database/sql"
            desc: "도메인은 영속 메커니즘을 모른다. SQL 은 infra 어댑터에서 다룬다"
          - pkg: "github.com/jackc/pgx/v5"
            desc: "도메인은 드라이버를 모른다"
      app-has-no-adapters:                  # 유스케이스는 어댑터를 모른다(포트로만 대화)
        files: ["**/internal/*/app/**"]
        deny:
          - pkg: "net/http"
            desc: "유스케이스는 전송 계층을 모른다"
          - pkg: "{{PACKAGE_NS}}/internal/*/infra"
            desc: "app 은 infra 를 import 하지 않는다(포트를 통해 역전)"
      primary-and-infra-are-siblings:       # 두 어댑터는 서로 모른다(main 이 조립)
        files: ["**/internal/*/primary/**"]
        deny:
          - pkg: "{{PACKAGE_NS}}/internal/*/infra"
            desc: "primary 와 infra 는 서로 의존하지 않는다"
```

> 대안으로 `go-arch-lint`(YAML로 컴포넌트·의존 그래프 선언)를 쓸 수 있다. 어느 쪽이든 위반이 `scripts/verify.sh`에서 실패로 나오는 것이 핵심이다.

### 4.3 Port & Adapter (인터페이스는 소비자 쪽에)

- Go 관례: 인터페이스는 구현체가 아니라 사용하는 쪽에 선언한다. 따라서 **포트 인터페이스는 `app` 패키지가 선언**하고, `infra`가 그 시그니처를 만족하는 구조체를 제공한다(명시적 implements 선언 없음 = 컴파일 타임 덕 타이핑).
- **Inbound Port(UseCase)** = `app` 패키지의 인터페이스. 핸들러는 구현체가 아니라 이 인터페이스에 의존한다.
- Outbound Port(Repository/Gateway) = `app` 패키지의 인터페이스. `infra`가 구현한다.
- 포트는 **애그리거트 기준**(`Save(ctx, aggregate)`·`FindByCode(ctx, code)`)으로 정의한다. SQL·컬럼·`*sql.Tx`를 시그니처에 드러내지 않는다.
- **인터페이스는 작게**(1~3 메서드). 거대한 `Repository` 하나보다 역할별 소형 인터페이스가 낫다(테스트 대역이 쉬워진다).
- 모든 포트 메서드의 첫 인자는 `ctx context.Context` 다(취소·타임아웃·요청 스코프 값 전파).

```go
// internal/{{DOMAIN_EXAMPLE}}/app/port.go
package app

// {{DOMAIN_EXAMPLE}}Repository는 {{DOMAIN_EXAMPLE}} 애그리거트의 영속 포트다.
// 구현은 infra 어댑터가 제공하며, app 은 저장 메커니즘을 알지 않는다.
type {{DOMAIN_EXAMPLE}}Repository interface {
	Save(ctx context.Context, agg *domain.{{DOMAIN_EXAMPLE}}) error
	FindByCode(ctx context.Context, code domain.Code) (*domain.{{DOMAIN_EXAMPLE}}, error)
}
```

---

## 5. 레이어 책임 (Domain Service vs Application Service)

| 구분 | 위치 | 책임 | 구현 형태 |
|---|---|---|---|
| Domain Service | `<ctx>/domain` | 한 애그리거트에 자연스럽게 속하지 않는 **순수 도메인 로직**. 외부 I/O 금지 | 평범한 구조체/함수. 표준 라이브러리만 사용 |
| Application Service (= UseCase 구현) | `<ctx>/app` | 트랜잭션 경계, 포트 호출 조립, 권한·정책 검사, 이벤트 발행 | 구조체 + 생성자 함수(`NewXxxService(deps...)`). 인터페이스 구현 |

- **Aggregate/Entity**: 트랜잭션·일관성 경계. 한 트랜잭션에서 하나의 루트만 수정. 다른 애그리거트는 ID 참조. 내부 PK는 정수, 외부 노출은 code.
  - 불변식은 생성자 함수(`NewOrder(...) (*Order, error)`)에서 검증한다. 필드는 비공개(소문자) 로 두고 접근자를 통해 노출해 외부 변조를 막는다.
- **Value Object**: 작은 값 타입(`type Code string`, `type Money struct{...}`). 생성자에서 검증하고 불변으로 다룬다(포인터 대신 값 전달).
- **비즈니스 규칙은 도메인에**. UseCase에 규칙을 인라인하지 않는다(Anemic Domain 회피).
  - (a) 한 애그리거트의 상태 불변식 → 애그리거트 메서드.
  - (b) 애그리거트 소유가 아닌 정책·교차 규칙 → `domain` 서비스(무상태면 함수).
  - (c) 트랜잭션·포트 호출·격리 세션 → `app` 유스케이스.
- 트랜잭션 경계는 UseCase에만. 트랜잭션은 `app`이 시작·커밋하고, 어댑터는 주입된 실행기(`Querier`/`*sql.Tx` 추상)를 쓰기만 한다. 어댑터가 커밋하지 않는다.
  - 패턴: `TxManager` 포트(`WithinTx(ctx, func(ctx) error) error`)를 `app`이 선언하고 `infra`가 구현. 트랜잭션 핸들은 `ctx`로 전파한다.
- 생성자 주입 only. 패키지 전역 변수(`var db *sql.DB`)·`init()` 부작용 금지. 시간·난수·ID는 인터페이스(`Clock`·`IDGenerator`)로 주입한다.
- **로깅은 경계에서만**(`app`/`primary`/`infra`). `domain`은 로깅 금지. `log/slog` 구조화 로깅을 쓰고 로거는 주입한다(전역 로거 지양). 에러는 경계에서 한 번만 로깅한다.
- **DB 접근**: 표준 CRUD는 `pgx`(또는 `database/sql`) + 파라미터 바인딩. 쿼리 생성은 `sqlc`(컴파일 타임 검증)나 쿼리 빌더를 쓸 수 있다. 스캔 결과 구조체(`infra`)와 도메인 엔티티는 다른 타입이며 매퍼가 변환한다.

### 5.1 에러 처리 규약 (Go 핵심)

- 에러는 값이다. 모든 error를 처리하거나 반환한다(`errcheck`가 미처리를 잡는다). `_ = err`로 버리지 않는다.
- 래핑으로 맥락을 더한다: `fmt.Errorf("워크스페이스 저장 실패: %w", err)`. `%w`로 원인을 보존해 `errors.Is/As`가 동작하게 한다.
- **도메인 오류는 sentinel 또는 타입**으로 정의한다: `var ErrNotFound = errors.New("not found")`, `type ConflictError struct{...}`. 경계(`primary`)에서 `errors.Is/As`로 판별해 HTTP status·에러코드로 변환한다.
- 에러 문자열은 소문자로 시작하고 마침표를 붙이지 않는다(Go 관례 — 래핑 시 문장이 이어진다).
- panic 금지(라이브러리·요청 처리 경로). panic은 복구 불가능한 프로그래머 오류에만. HTTP 서버는 recover 미들웨어를 두되, recover를 정상 흐름으로 쓰지 않는다.
- 에러에 민감정보(토큰·키·개인정보)를 넣지 않는다(로그로 유출된다).

### 5.2 동시성 규약

- `context.Context`를 첫 인자로 전파한다. 구조체 필드에 저장하지 않는다. 요청 취소·타임아웃이 하위 호출까지 닿아야 한다.
- 고루틴에는 소유자와 종료 조건이 있어야 한다. 누가 기다리고(`sync.WaitGroup`/`errgroup.Group`), 무엇으로 멈추는지(`ctx.Done()`) 명시한다. 종료 경로 없는 고루틴 = 누수.
- **채널 소유권**: 보내는 쪽이 닫는다. 받는 쪽은 닫지 않는다.
- **공유 상태는 뮤텍스 또는 채널 중 하나로만** 보호한다. 데이터 경합은 `go test -race`가 잡는다(게이트 필수).
- 팬아웃은 상한을 둔다(세마포어·워커 풀). 무제한 고루틴 생성 금지.
- `sync.WaitGroup`은 `Add`를 고루틴 밖에서 호출한다. 루프 변수 캡처는 Go 1.22+에서 안전하지만, 명시적으로 인자로 넘기는 습관을 유지한다.

---

## 6. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. 코드로 말할 수 없는 것 — Why · 함정 · 외부 근거 · 억제 이유 — 만 적는다.
- 단계별 `처리 흐름:`은 분기가 얽혀 절차가 안 잡히거나, 순서를 바꾸면 버그가 나는 함수에 쓴다. 5단계 이내.
- Go doc 규약을 따른다: doc comment는 **선언 이름으로 시작**한다(`// CreateOrder는 ...`). exported 식별자에는 doc comment를 단다. 패키지 주석은 `// Package <name> ...`.
- CRUD·접근자·위임·매퍼에는 설명 주석을 달지 않는다. `//nolint:` 에는 이유를 적는다. yml·SQL은 값의 근거만 한 줄.
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 7. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 도메인 상수 | 코드 의미를 갖는 고정 라벨·키 | `const` 블록 + 타입 있는 상수(`type Status string`) — audit action·에러코드·역할·상태 |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `internal/platform/config`에서 env 로드(구조체 1개) — base-url·타임아웃·엔드포인트 |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블/기능 플래그(캐시·무효화 동반) |

- 설정은 **`main`에서 1회 로드해 주입**한다. 하위 패키지가 `os.Getenv`를 직접 부르지 않는다(테스트 불가·은닉 의존).
- 타임아웃·리트라이 횟수·페이지 상한은 이름 있는 상수로. 숫자 리터럴을 코드에 흩지 않는다.

---

## 8. 성능 예산 (부하테스트로 확정)

- 무한/대량 결과 금지: cursor pagination + 상한 `limit`. 전체 스캔·전량 메모리 적재 금지.
- **N+1 회피**: 배치·조인·`IN` 조회. WHERE/JOIN/ORDER BY 컬럼에 인덱스 동반.
- **커넥션 풀 설정**: `SetMaxOpenConns`·`SetMaxIdleConns`·`SetConnMaxLifetime`을 명시적으로 설정한다(기본값은 무제한이라 DB를 고갈시킬 수 있다).
- **HTTP 클라이언트 재사용**: 요청마다 `http.Client` 생성 금지. `http.DefaultClient`는 타임아웃이 없다 — 반드시 `Timeout`을 설정한 클라이언트를 만들어 주입한다.
- **서버 타임아웃**: `http.Server`의 `ReadHeaderTimeout`·`ReadTimeout`·`WriteTimeout`·`IdleTimeout`을 설정한다(설정하지 않으면 slowloris에 노출).
- **할당 줄이기**: 핫패스에서 불필요한 문자열 연결·슬라이스 재할당을 피한다(`strings.Builder`, 용량 지정). 단, 측정 후 최적화(`go test -bench`·pprof).
- 응답 본문은 항상 닫는다(`defer resp.Body.Close()`) — 누락 시 커넥션 누수.

**경로별 차등 목표**(수치는 부하테스트로 확정):

| 경로 부류 | 예 | 목표(예시 — 프로젝트 확정) | 도달 레버 |
|---|---|---|---|
| 캐시/인증 핫패스 | 키 검증·캐시 조회 | 고 TPS/인스턴스 | 캐시(TTL+무효화), 할당 최소화 |
| 일반 읽기 | 목록·상세 | 수천 TPS/인스턴스 | 인덱스·keyset·풀 사이징 |
| 쓰기 | 생성·수정 | 수백~수천 TPS | 무거운 작업은 비동기 워커로 |
| 비동기 워커 | 배치·색인 | 처리량/큐 기준 | 요청 경로 밖. 워커 수평 확장 |

---

## 9. TDD 워크플로 (요약)

```
RED   유스케이스/도메인 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. 테스트 없는 도메인/유스케이스 변경 금지.
- 표준 `testing` + 테이블 주도 테스트가 기본이다. 목 프레임워크보다 **직접 만든 fake**(작은 인터페이스라 쉽다)를 우선한다.
- `t.Parallel()`을 기본으로 쓰되 공유 상태를 만들지 않는다. `-race`는 항상 켠다.
- 시간·난수·외부 호출은 인터페이스 경유 → 결정성 확보.

| 레이어 | 도구 | 비고 |
|---|---|---|
| `core` / `domain` | `testing`(테이블 주도) | 순수 함수·VO·엔티티. 표준 라이브러리만 |
| `app` | `testing` + 손수 짠 fake(port) | 유스케이스 단위. DB·HTTP 없음 |
| `primary/http` | `net/http/httptest` | 핸들러·라우팅·envelope·status 검증 |
| `infra` | `testing` + 실제 DB(testcontainers-go 선택) | 리포지토리 어댑터·격리 정책 |
| e2e | `test/` + 기동된 바이너리/컨테이너 | 핵심 플로우 smoke |

- 검증 게이트: `bash scripts/verify.sh` (CI·pre-commit·hook이 모두 이 스크립트를 호출).

---

## 10. 새 도메인/유스케이스 추가 워크플로

1. **컨텍스트 결정**: 기존 컨텍스트 안인지 새 바운디드 컨텍스트인지 먼저 답한다.
2. **(신규 컨텍스트)** `internal/<ctx>/{domain,app,primary/http,infra}` 생성 → `.golangci.yml`의 depguard 규칙 확인(패턴이 새 경로를 덮는지).
3. **TDD 사이클**: `domain`(엔티티/VO) → `app`(유스케이스 + fake 포트) → `infra`(실제 DB로 포트 구현) → `primary/http`(`httptest`, 응답은 envelope) → `cmd`(조립·smoke).
4. **검증**: `bash scripts/verify.sh` 통과 + `api/`의 OpenAPI 스펙 동기화.
5. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록.

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- `domain`이 `net/http`·`database/sql`·드라이버를 import(프레임워크 침투).
- 핸들러가 도메인 엔티티·DB 스캔 구조체를 그대로 JSON으로 반환(DTO·envelope 우회).
- 포트 시그니처에 `*sql.Tx`·SQL 문자열·컬럼명 노출.
- infra 어댑터가 트랜잭션을 커밋(경계 분산).
- `context.Context`를 구조체 필드에 저장하거나 `context.TODO()`를 프로덕션 경로에 방치.
- 종료 조건 없는 고루틴(누수), 결과를 아무도 읽지 않는 채널.
- `err`를 무시(`_ = err`)하거나 `if err != nil { log.Println(err) }` 로 삼키고 계속 진행.
- `panic`으로 정상 오류 흐름 처리.
- 패키지 전역 가변 상태(`var db *sql.DB`)·`init()`에서 I/O 수행.
- 타임아웃 없는 `http.Client`/`http.Server`, `resp.Body.Close()` 누락.
- `interface{}`/`any` 남용, 리플렉션으로 타입 검사 회피.
- 거대 `util`/`common` 패키지에 무관한 함수 쌓기(응집도 붕괴).
- 다른 바운디드 컨텍스트의 domain 패키지를 직접 import.
- 테스트 없이 도메인/유스케이스 코드 추가.

---

## 12. 관련 문서

- 스택·구조·보안·API 규약 원본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
- 레이아웃 근거: [golang-standards/project-layout](https://github.com/golang-standards/project-layout)
