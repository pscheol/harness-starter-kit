<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}(모듈 경로)·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Go 백엔드 · 아키텍처: flat(소규모) -->

# ARCHITECTURE — {{PROJECT_NAME}} (플랫 · 소규모)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 **의도적으로 작은 레이아웃**을 쓴다: `cmd/<binary>/main.go` + `internal/app/` 한 패키지에 `handler.go`·`service.go`·`store.go`·`model.go`가 파일로 공존한다.
디렉터리 계층 대신 파일 이름이 역할을 나눈다. 강제는 최소한만 건다 — 순환 금지(컴파일러) + `store`·`model`의 전송 계층 금지(depguard).

이 변형에는 명시적인 만료 조건이 있다(§0의 승격 기준). 규모가 커지면 `feature`로 올린다 — 그때 옮기기 쉽도록 파일 이름과 책임을 미리 맞춰 둔 구조다.

스택 기준(버전 기준은 `go.mod` — 구체 버전은 **예시이며 프로젝트에서 확정**):
Go 1.22+ · net/http · pgx/database\_sql(관계형 DB, 선택) · log/slog · golangci-lint · gofumpt · go test -race.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 엔드포인트가 손에 꼽고(대략 10개 이하), 도메인 개념도 하나둘이다.
- 내부 도구·사이드카·수명이 짧은 서비스·프로토타입이다.
- 만드는 사람이 1~2명이고, 구조 논쟁보다 **속도**가 명백히 중요하다.
- CLI 바이너리나 단일 목적 워커라 HTTP 표면 자체가 작다.

**쓰지 않는다:**
- 도메인 영역이 이미 둘 이상이다 → `feature`.
- 여러 사람이 동시에 다른 영역을 만진다(한 패키지에서 충돌한다) → `feature`.
- 저장소·외부 시스템 교체가 요구된다 → `hexagonal`.
- "언젠가 커질 것"이 확실하다 → 처음부터 `layered`나 `feature`로 시작한다(전환에도 비용이 든다).

### 승격 기준 (이 변형의 만료 조건 — 문서로 각인)

아래 중 하나라도 해당하면 `--arch=feature`로 승격한다.

1. `internal/app/`의 `.go` 파일이 5~7개를 넘는다(테스트 파일 제외).
2. 한 파일(`service.go` 등)이 400줄을 넘어 서로 무관한 관심사가 섞인다.
3. 도메인 개념이 둘 이상 생겨 "이 함수는 어느 개념 소유인가"를 논쟁하기 시작한다.
4. 두 사람 이상이 같은 파일을 동시에 고쳐 충돌이 반복된다.

> 승격은 미루면 비싸진다. 위 기준에 닿으면 기능 추가를 멈추고 먼저 옮긴다(§10). 플랫에서 `feature`로 가는 비용은 파일을 디렉터리로 나누는 정도지만, 더 커진 뒤에는 함수 단위로 뜯어야 한다.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 내부 패키지 외부 노출 차단 | **`internal/`** (Go 컴파일러 기본 규칙) | 컴파일 실패 |
| 순환 의존 금지 | Go 컴파일러(import cycle) | 컴파일 실패 |
| `store`·`model`은 전송 계층 무의존 | depguard: `net/http` 금지 | 린트 실패 → 게이트 차단 |
| 파일 역할 분리 (handler→service→store) | 같은 패키지라 컴파일러가 못 막는다 → 리뷰 + 파일 규약 | 코드리뷰 차단 |
| **승격 기준 감시** | 구조 테스트(§3.3)가 파일 수 상한을 검사 | 게이트 경고/차단 |
| 에러는 값으로 전파 | `errcheck` | 게이트 차단 |
| 경합 없는 동시성 | `go test -race` | 게이트 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(service 우선) | 커버리지 게이트 |

> 작다고 규율이 없는 게 아니다. 이 변형이 포기하는 것은 *디렉터리 경계*뿐이고, 파일 역할·에러·동시성·테스트 규율은 그대로다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌──────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}     │
 │(Web/CLI) │        │  (Go 단일 바이너리)   │
 └──────────┘        └──────────┬───────────┘
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
          ┌────────────┐ ┌────────────┐ ┌────────────┐
          │ 관계형 DB   │ │  캐시       │ │ 외부 시스템 │
          │  (선택)     │ │  (선택)     │ │  (선택)     │
          └────────────┘ └────────────┘ └────────────┘
```

- 서비스 인스턴스는 **무상태**. 상태는 외부 저장소에 둔다.
- 배포 아티팩트는 정적 링크 단일 바이너리 + 스크래치/디스트로리스 컨테이너(`CGO_ENABLED=0`).

---

## 3. 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── go.mod / go.sum
├── cmd/
│   └── {{PROJECT_SLUG}}/main.go   # 진입점. 설정 로드 + 조립 + 서버 기동만
├── internal/
│   └── app/                       # 애플리케이션 전체가 여기 한 패키지
│       ├── config.go              #   env 로드(구조체 1개)
│       ├── handler.go             #   라우트 등록·요청 디코딩·DTO·상태코드
│       ├── service.go             #   비즈니스 규칙 · 트랜잭션 경계
│       ├── store.go               #   데이터 접근(쿼리·스캔·매핑)
│       ├── model.go               #   도메인 타입·상태 상수·불변식
│       └── *_test.go
├── migrations/                    # (DB 를 쓴다면)
├── api/                           # OpenAPI 스펙(엔드포인트가 공개라면)
├── deployments/ · configs/
├── scripts/verify.sh              # 단일 검증 게이트
└── docs/
```

- `internal/`을 쓴다. 소규모라도 외부 모듈이 붙는 것을 막아야 나중에 자유롭게 재구성할 수 있다. `pkg/`는 만들지 않는다.
- `cmd/<binary>/main.go`는 **조립만** 한다(설정 로드 → 의존성 생성 → 라우터 마운트 → 기동). 로직이 들어가면 `internal/app/`으로 옮긴다.
- **단위 테스트는 소스 옆**(`service.go` ↔ `service_test.go`).
- `src/` 디렉터리를 만들지 않는다(Go 관례 아님).
- **패키지를 늘리고 싶어지면 그게 승격 신호**다(§0). 임시로 `internal/app/util` 같은 것을 만들지 않는다.

### 3.1 파일 ↔ 책임 (디렉터리 대신 파일이 경계)

| 파일 | 책임 | 노출 |
|---|---|---|
| `config.go` | env 로드·검증(필수값 없으면 부팅 실패) | `Config` |
| `handler.go` | 라우트 등록·요청 디코딩·DTO·상태코드·에러→응답 | `Routes(...)` |
| `service.go` | 비즈니스 규칙·**트랜잭션 경계**·정책 검사 | 패키지 비공개 |
| `store.go` | 쿼리·스캔·매핑 | 패키지 비공개 |
| `model.go` | 엔티티·VO·상태 상수·불변식·도메인 에러 | 필요한 것만 exported |

- 방향은 `handler → service → store`. 같은 패키지라 컴파일러가 막지 못하므로 리뷰에서 지킨다: `handler.go`에 쿼리를 쓰지 않고, `store.go`에 규칙을 쓰지 않는다.
- **exported 최소화**: 밖으로 나가는 것은 `New(...)`·`Routes(...)`·`Config` 정도여야 한다. 나중에 `feature`로 쪼갤 때 공개 표면이 작을수록 쉽다.
- 파일을 더 쪼개고 싶으면 **접두사를 유지**한다(`service_billing.go`). 이 시점이 오면 §0의 승격 기준을 다시 읽는다.

### 3.2 depguard 최소 규칙 (`.golangci.yml`)

플랫에서는 규칙을 최소로 건다. 많이 걸어봐야 한 패키지 안이라 우회가 쉽고, 규칙 유지 비용만 는다.

```yaml
linters-settings:
  depguard:
    rules:
      data-layer-has-no-transport:          # 데이터·타입 파일은 전송을 모른다
        files:
          - "**/internal/app/store.go"
          - "**/internal/app/model.go"
        deny:
          - pkg: "net/http"
            desc: "전송 계층은 handler.go 에서만 다룬다"
      model-has-no-driver:                  # 도메인 타입은 영속 메커니즘을 모른다
        files: ["**/internal/app/model.go"]
        deny:
          - pkg: "database/sql"
            desc: "model 은 SQL 을 모른다. 쿼리는 store.go 에서 다룬다"
          - pkg: "github.com/jackc/pgx/v5"
            desc: "model 은 드라이버를 모른다"
```

> 순환 의존은 컴파일러가 이미 막는다(한 패키지 안이므로 애초에 발생하지 않는다).
> 규칙을 더 걸고 싶어진다면 그건 `feature`로 갈 때가 됐다는 뜻이다 — 디렉터리 경계가 있어야 규칙이 의미를 갖는다.

### 3.3 승격 기준을 게이트로 (선택이지만 권장)

승격 시점을 사람의 판단에 맡기면 대개 놓친다. 파일 수 상한을 **테스트로** 감시한다.

```go
// internal/app/architecture_test.go

// Test파일수상한은 flat 레이아웃의 만료 조건을 감시한다.
// 상한을 넘으면 --arch=feature 로 승격할 시점이다(ARCHITECTURE.md §0).
func Test파일수상한(t *testing.T) {
	t.Parallel()
	const limit = 7
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("디렉터리 읽기 실패: %v", err)
	}
	count := 0
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() && strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go") {
			count++
		}
	}
	if count > limit {
		t.Errorf("internal/app 의 소스 파일이 %d개로 상한 %d개를 넘었다 — feature 로 승격한다(§0)", count, limit)
	}
}
```

> 상한은 프로젝트가 정한다. 중요한 것은 승격 시점이 자동으로 눈에 띄게 만드는 것이다.

---

## 4. 책임 규약

- 트랜잭션 경계는 `service`에만. `service`가 열고 커밋한다. `store`는 주입된 실행기를 쓰기만 한다(어댑터가 커밋하면 경계가 분산된다).
- 비즈니스 규칙은 `service`와 `model`에. 상태 불변식은 모델 생성자·메서드로, 오케스트레이션·정책은 서비스로. `handler.go`에 `if` 분기로 규칙을 흘리지 않는다.
- 생성자 주입 only. 패키지 전역 변수(`var db *sql.DB`)·`init()` 부작용 금지. 작아도 이건 지킨다 — 테스트 가능성이 여기서 갈린다. 시간·난수·ID는 인터페이스로 주입한다.
- 인터페이스는 소비자 쪽에(Go 관례). `service`가 필요한 저장 동작을 인터페이스로 선언하면 fake로 바꿔 끼울 수 있다. 인터페이스는 작게(1~3 메서드).
- 로깅은 `handler`/`service`/`store`에서만, 한 번만. `log/slog` 구조화 로깅, 로거는 주입(전역 로거 지양).
- `handler`는 `model`을 그대로 반환하지 않는다. 응답 DTO로 변환하고 공통 envelope에 담는다(작아도 응답 형태는 처음부터 고정한다 — 나중에 바꾸면 클라이언트가 깨진다).

### 4.1 에러 처리 규약 (Go 핵심)

- 에러는 값이다. 모든 error를 처리하거나 반환한다(`errcheck`). `_ = err`로 버리지 않는다.
- 래핑으로 맥락을 더한다: `fmt.Errorf("{{DOMAIN_EXAMPLE}} 저장 실패: %w", err)`. `%w`로 원인을 보존해 `errors.Is/As`가 동작하게 한다.
- **도메인 오류는 sentinel 또는 타입**으로 `model.go`에 정의한다(`var ErrNotFound = errors.New("not found")`). `handler.go`에서 `errors.Is/As`로 판별해 상태코드로 변환한다.
- 에러 문자열은 소문자로 시작하고 마침표를 붙이지 않는다(Go 관례).
- panic 금지(요청 처리 경로). recover 미들웨어는 두되 정상 흐름으로 쓰지 않는다.
- 에러에 민감정보(토큰·키·개인정보)를 넣지 않는다.

### 4.2 동시성 규약

- `context.Context`를 첫 인자로 전파한다. 구조체 필드에 저장하지 않는다.
- 고루틴에는 소유자와 종료 조건이 있어야 한다(`errgroup.Group` + `ctx.Done()`). 종료 경로 없는 고루틴 = 누수.
- **채널 소유권**: 보내는 쪽이 닫는다. 공유 상태는 뮤텍스 또는 채널 중 하나로만 보호한다. `go test -race`는 항상 켠다.
- 팬아웃은 상한을 둔다(세마포어·워커 풀).

---

## 5. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. 코드로 말할 수 없는 것 — Why · 함정 · 외부 근거 · 억제 이유 — 만 적는다.
- 단계별 `처리 흐름:`은 분기가 얽혀 절차가 안 잡히거나, 순서를 바꾸면 버그가 나는 함수에 쓴다. 5단계 이내.
- Go doc 규약을 따른다: doc comment는 **선언 이름으로 시작**한다. exported 식별자에는 doc comment를 단다. 패키지 주석은 `// Package app ...`.
- CRUD·접근자·위임·매퍼에는 설명 주석을 달지 않는다. `//nolint:` 에는 이유를 적는다. yml·SQL은 값의 근거만 한 줄.
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 6. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 도메인 상수 | 상태·역할·액션 라벨 | `const` + 타입 있는 상수(`model.go`) |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `config.go`에서 env 로드(구조체 1개) |
| (c) 운영자 변경 가능 값 | 런타임 조정 | 기능 플래그(필요할 때만 — 작을 땐 대개 불필요) |

- 설정은 **`main`에서 1회 로드해 주입**한다. `service.go`·`store.go`가 `os.Getenv`를 직접 부르지 않는다.
- 필수 설정이 없으면 **부팅 시 실패**시킨다(조용한 기본값 금지).
- 타임아웃·리트라이 횟수·페이지 상한은 이름 있는 상수로.

---

## 7. 성능 예산

작아도 **아래 넷은 처음부터** 지킨다. 나중에 소급 적용하기가 가장 어려운 것들이다.

- 무한/대량 결과 금지: 목록은 페이지네이션 + 상한 `limit`.
- **커넥션 풀 설정**: `SetMaxOpenConns`·`SetMaxIdleConns`·`SetConnMaxLifetime`을 명시적으로 설정한다(기본값은 무제한이라 DB를 고갈시킬 수 있다).
- **HTTP 클라이언트/서버 타임아웃**: `http.DefaultClient`는 타임아웃이 없다 — `Timeout` 설정 클라이언트를 만들어 주입한다. 서버는 `ReadHeaderTimeout`·`ReadTimeout`·`WriteTimeout`·`IdleTimeout`을 설정한다.
- 응답 본문은 항상 닫는다(`defer resp.Body.Close()`).

그 외 최적화는 **측정 후에** 한다(`go test -bench`·pprof). 작은 서비스에서 조기 최적화는 대개 손해다.

---

## 8. TDD 워크플로 (요약)

```
RED   service 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. 테스트 없는 `service` 변경 금지.
- 표준 `testing` + 테이블 주도 테스트. 목 프레임워크보다 **직접 만든 fake**를 우선한다.
- `t.Parallel()`을 기본으로 쓰되 공유 상태를 만들지 않는다. `-race`는 항상 켠다.

| 대상 | 도구 | 비고 |
|---|---|---|
| `model` | `testing`(테이블 주도) | 불변식·상태 전이 |
| `service` | `testing` + 손수 짠 fake(store) | 규칙·트랜잭션 순서. DB·HTTP 없음 |
| `store` | `testing` + 실제 DB(선택) | 쿼리·매핑 |
| `handler` | `net/http/httptest` | 라우팅·envelope·status |
| 구조 | `architecture_test.go` | 파일 수 상한(§3.3) |

- 검증 게이트: `bash scripts/verify.sh` (CI·pre-commit·hook이 모두 이 스크립트를 호출).

---

## 9. 새 기능 추가 워크플로

1. 승격 기준부터 확인한다(§0). 이 기능을 넣으면 파일 수·파일 크기 상한을 넘는가? 넘으면 **먼저 승격**한다.
2. 파일 역할에 맞춰 코드를 넣는다: 타입은 `model.go`, 규칙은 `service.go`, 쿼리는 `store.go`, 경로는 `handler.go`.
3. **TDD 사이클**: `model`(불변식) → `service`(fake store) → `store`(실제 DB) → `handler`(`httptest`, 응답은 envelope) → `main`(조립·smoke).
4. **검증**: `bash scripts/verify.sh` 통과 + `api/`의 OpenAPI 스펙 동기화(공개 API라면).
5. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록.

---

## 10. `feature`로 승격하는 절차

가장 흔한 전환이고, 이 레이아웃은 그것을 쉽게 하려고 설계됐다.

1. 도메인 경계를 먼저 정한다. `service.go`의 함수를 소유 개념별로 묶어 목록을 만든다(예: `{{DOMAIN_EXAMPLE}}`·`auth`).
2. 디렉터리를 만든다: `internal/<feature>/`. 기술 토대(`config.go` 등)는 `internal/platform/{config,db,log,httpx}`로 옮긴다.
3. 파일을 옮긴다: `handler.go`·`service.go`·`store.go`·`model.go`를 각 기능 디렉터리로 나눠 담는다. 파일 이름은 그대로 쓴다(이 레이아웃이 같은 이름을 쓴 이유다).
4. 컴파일러가 누락을 잡는다. `gopls` 리네임/이동으로 기계적으로 처리하고, 남은 참조는 빌드 오류로 드러난다.
5. **기능 간 참조가 남으면** 그것이 진짜 경계 문제다: `contract.go` 경유·`main` 조립 주입·이벤트 중 하나로 뒤집는다(기본은 주입).
6. 강제 규칙을 교체한다: depguard에 기능 쌍 독립 규칙을 추가하고, 파일 수 상한 테스트를 **기능 독립성 테스트**로 바꾼다.
7. 각 단계마다 `scripts/verify.sh`를 통과시킨다. 전환 전 `.agents/docs/decisions/`에 ADR을 남긴다.

**다른 방향:**

| 목표 | 요약 |
|---|---|
| → `layered` | 파일을 `internal/{handler,service,repository,model}/` 패키지로 펼친다. 도메인이 하나로 유지될 때만 의미가 있다 |
| → `hexagonal` | 먼저 `feature`로 승격한 뒤 기능 하나를 컨텍스트로 올린다. 플랫에서 바로 가지 않는다(중간 단계가 위험을 줄인다) |

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- **승격 기준을 넘겼는데 계속 파일을 늘리기**(§0 — 가장 비싼 실수).
- `handler.go`에서 쿼리 실행, `store.go`에 비즈니스 규칙 작성(파일 역할 붕괴).
- `handler`가 `model`을 그대로 JSON으로 반환(DTO·envelope 우회).
- `store.go`·`model.go`가 `net/http`·드라이버를 import.
- store가 트랜잭션을 커밋(경계 분산).
- 패키지 전역 가변 상태(`var db *sql.DB`)·`init()`에서 I/O 수행("작으니까 괜찮다"가 여기서 시작된다).
- `internal/app/util.go` 같은 잡동사니 파일 추가(승격 신호를 덮는 행위).
- `context.Context`를 구조체 필드에 저장하거나 `context.TODO()` 방치.
- 종료 조건 없는 고루틴(누수), `err` 무시(`_ = err`), `panic`으로 정상 오류 처리.
- 타임아웃 없는 `http.Client`/`http.Server`, `resp.Body.Close()` 누락.
- 페이지네이션 없는 목록 응답.
- 테스트 없이 `service` 코드 추가("프로토타입이라서"는 이유가 되지 않는다 — 프로토타입이 그대로 운영에 남는다).

---

## 12. 관련 문서

- 스택·구조·보안·API 규약 원본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
- 레이아웃 근거: [golang-standards/project-layout](https://github.com/golang-standards/project-layout)
