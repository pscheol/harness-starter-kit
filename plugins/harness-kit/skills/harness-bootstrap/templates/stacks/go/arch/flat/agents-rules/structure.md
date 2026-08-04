<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 아키텍처: flat · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 플랫 레이아웃 (소규모) — {{PROJECT_NAME}}

이 프로젝트는 **의도적으로 작은 레이아웃**을 쓴다: `cmd/<binary>/main.go` + `internal/app/` 한 패키지에 `handler.go`·`service.go`·`store.go`·`model.go`가 파일로 공존한다.
디렉터리 계층 대신 파일 이름이 역할을 나눈다. 강제는 최소한만 건다 — 순환 금지(컴파일러) + `store`·`model`의 전송 계층 금지(depguard).

이 변형에는 만료 조건이 있다. 규모가 커지면 `feature`로 승격한다 — 그때 옮기기 쉽도록 파일 이름과 책임을 미리 맞춰 둔 구조다.
아키텍처 상세 원본(선택 기준·승격 절차 포함)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── go.mod / go.sum              # 모듈 경로 {{PACKAGE_NS}}
├── cmd/
│   └── {{PROJECT_SLUG}}/main.go # 진입점. 설정 로드 + 조립 + 서버 기동만
├── internal/
│   └── app/                     # 애플리케이션 전체가 여기 한 패키지
│       ├── config.go            #   env 로드(구조체 1개)
│       ├── handler.go           #   라우트 등록·요청 디코딩·DTO·상태코드
│       ├── service.go           #   비즈니스 규칙 · 트랜잭션 경계
│       ├── store.go             #   데이터 접근(쿼리·스캔·매핑)
│       ├── model.go             #   도메인 타입·상태 상수·불변식·도메인 에러
│       ├── architecture_test.go #   파일 수 상한 감시(승격 신호)
│       └── *_test.go
├── migrations/                  # (DB 를 쓴다면)
├── api/                         # OpenAPI 스펙(공개 API 라면)
├── deployments/ · configs/
├── scripts/verify.sh            # 단일 검증 게이트
└── docs/
```

- `internal/`을 쓴다. 소규모라도 외부 모듈이 붙는 것을 막아야 나중에 자유롭게 재구성할 수 있다. `pkg/`는 만들지 않는다.
- `cmd/<binary>/main.go`는 **조립만** 한다(설정 로드 → 의존성 생성 → 라우터 마운트 → 기동). 로직이 들어가면 `internal/app/`으로 옮긴다.
- **단위 테스트는 소스 옆**(`service.go` ↔ `service_test.go`).
- `src/` 디렉터리를 만들지 않는다(Go 관례 아님).
- **패키지를 늘리고 싶어지면 그게 승격 신호**다. `internal/app/util` 같은 임시 패키지를 만들지 않는다.

## 승격 기준 (이 변형의 만료 조건)

아래 중 하나라도 해당하면 `--arch=feature`로 승격한다.

1. `internal/app/`의 `.go` 파일이 5~7개를 넘는다(테스트 파일 제외).
2. 한 파일(`service.go` 등)이 400줄을 넘어 서로 무관한 관심사가 섞인다.
3. 도메인 개념이 둘 이상 생겨 "이 함수는 어느 개념 소유인가"를 논쟁하기 시작한다.
4. 두 사람 이상이 같은 파일을 동시에 고쳐 충돌이 반복된다.

> 승격은 미루면 비싸진다. 기준에 닿으면 기능 추가를 멈추고 먼저 옮긴다.
> 절차는 `ARCHITECTURE.md` §10 — 파일 이름을 그대로 옮기도록 설계돼 있어 대부분 기계적이다.

## 파일 ↔ 책임 (디렉터리 대신 파일이 경계)

| 파일 | 책임 | 노출 |
|---|---|---|
| `config.go` | env 로드·검증(필수값 없으면 부팅 실패) | `Config` |
| `handler.go` | 라우트 등록·요청 디코딩·DTO·상태코드·에러→응답 | `Routes(...)` |
| `service.go` | 비즈니스 규칙·**트랜잭션 경계**·정책 검사 | 패키지 비공개 |
| `store.go` | 쿼리·스캔·매핑 | 패키지 비공개 |
| `model.go` | 엔티티·VO·상태 상수·불변식·도메인 에러 | 필요한 것만 exported |

- 방향은 `handler → service → store`. 같은 패키지라 컴파일러가 막지 못하므로 리뷰에서 지킨다: `handler.go`에 쿼리를 쓰지 않고, `store.go`에 규칙을 쓰지 않는다.
- **exported 최소화**: 밖으로 나가는 것은 `New(...)`·`Routes(...)`·`Config` 정도여야 한다. 공개 표면이 작을수록 나중에 쪼개기 쉽다.
- 파일을 더 쪼개고 싶으면 **접두사를 유지**한다(`service_billing.go`). 이 시점이 오면 승격 기준을 다시 읽는다.
- 강제 수단(depguard 최소 규칙)은 `ARCHITECTURE.md` §3.2. 규칙을 더 걸고 싶어진다면 승격할 때가 됐다는 뜻이다.

## 작아도 지키는 규율

작다고 규율이 없는 게 아니다. 이 변형이 포기하는 것은 **디렉터리 경계뿐**이다.

- 생성자 주입 only. 패키지 전역 변수(`var db *sql.DB`)·`init()` 부작용 금지. "작으니까 괜찮다"가 여기서 시작된다 — 테스트 가능성이 이 지점에서 갈린다.
- 인터페이스는 소비자 쪽에(Go 관례). `service`가 필요한 저장 동작을 인터페이스로 선언하면 fake로 바꿔 끼울 수 있다. 인터페이스는 작게(1~3 메서드), 첫 인자는 항상 `ctx context.Context`.
- 트랜잭션 경계는 `service`에만. `store`는 주입된 실행기를 쓰기만 하고 커밋하지 않는다.
- `handler`는 `model`을 그대로 반환하지 않는다. 응답 DTO로 변환하고 공통 envelope에 담는다 — 응답 형태는 처음부터 고정한다(나중에 바꾸면 클라이언트가 깨진다).
- 에러는 값이다: 모두 처리하거나 반환한다(`errcheck`). `%w`로 래핑해 맥락을 더하고, 도메인 오류는 `model.go`의 sentinel/타입으로 정의해 `handler.go`에서 `errors.Is/As`로 상태코드로 변환한다. panic 금지(요청 경로).
- **동시성**: `ctx`를 첫 인자로 전파(구조체 필드 저장 금지), 고루틴에는 소유자와 종료 조건(`errgroup` + `ctx.Done()`), `go test -race` 상시.
- **성능 기본기**(소급 적용이 가장 어렵다): 페이지네이션 상한 · 커넥션 풀 명시 설정 · `http.DefaultClient`는 타임아웃이 없으므로 타임아웃 설정 클라이언트 주입 · 서버 타임아웃 4종 · `defer resp.Body.Close()`.
- 로깅은 `handler`/`service`/`store`에서만, 한 번만. `log/slog` 구조화 로깅, 로거는 주입(전역 로거 지양).

## 네이밍 컨벤션

- 패키지명은 `app` 하나다. 파일명이 역할을 드러낸다(`handler.go`·`service.go`·`store.go`·`model.go`).
- 패키지명 반복 금지: `app.NewApp()`이 아니라 `app.New()`.
- 인터페이스명: 단일 메서드는 `-er`(`Reader`), 역할형은 명사(`{{DOMAIN_EXAMPLE}}Store`).
- 도메인 타입 필드는 **비공개 + 접근자**로 두고 생성자에서 불변식을 검증한다.
- **DB 스캔 구조체와 도메인 타입은 다른 타입**이며 `store`가 변환한다.
- 상태·역할 라벨은 타입 있는 상수로(`type Status string` + `const` 블록). 문자열 리터럴을 흩지 않는다.

## 새 기능 착수 워크플로

1. 승격 기준부터 확인한다. 이 기능을 넣으면 파일 수·파일 크기 상한을 넘는가? 넘으면 **먼저 승격**한다.
2. 파일 역할에 맞춰 코드를 넣는다: 타입은 `model.go`, 규칙은 `service.go`, 쿼리는 `store.go`, 경로는 `handler.go`.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `model`: 테이블 주도 테스트로 불변식·상태 전이 → 생성자에서 검증하는 타입 구현.
   2. `service`: fake store 로 규칙·트랜잭션 순서 테스트 → 인터페이스 선언 → 서비스 구현.
   3. `store`: (DB 를 쓴다면) 통합 테스트로 쿼리·매핑 검증 → 구현.
   4. `handler`: `httptest`로 라우팅·상태코드 테스트 → 핸들러·DTO 구현. **응답은 공통 envelope**.
   5. `main`: 조립·smoke 테스트.
4. **검증**: `bash scripts/verify.sh`(fmt·vet·lint·race 테스트·커버리지) 통과 + `api/` OpenAPI 스펙 동기화(공개 API라면).
5. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (승격 신호를 게이트로)

한 패키지라 린터가 잡을 것이 적다. 대신 승격 시점을 놓치지 않는 것이 이 변형에서 가장 중요한 강제다.

```go
// internal/app/architecture_test.go

// Test파일수상한은 flat 레이아웃의 만료 조건을 감시한다.
// 상한을 넘으면 --arch=feature 로 승격할 시점이다(ARCHITECTURE.md §0·§10).
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
		t.Errorf("internal/app 의 소스 파일이 %d개로 상한 %d개를 넘었다 — feature 로 승격한다", count, limit)
	}
}
```

> 상한은 프로젝트가 정한다. 핵심은 승격 시점이 자동으로 눈에 띄게 만드는 것이다.
> 필요하면 "`handler.go`에 SQL 문자열이 없다" 류의 파일 역할 테스트를 덧붙인다.

## 새 기능 착수 규칙

1. 새 기능은 위 파일 역할 안에서 구현한다. 임시 파일·임시 패키지를 만들어 역할을 흐리지 않는다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `api/`의 OpenAPI 스펙과 `.agents/docs/`를 함께 갱신한다.
4. 승격 기준을 넘겼는데 계속 파일을 늘리는 것이 이 변형에서 가장 비싼 실수다. 기준에 닿으면 `ARCHITECTURE.md` §10의 승격 절차를 연다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
