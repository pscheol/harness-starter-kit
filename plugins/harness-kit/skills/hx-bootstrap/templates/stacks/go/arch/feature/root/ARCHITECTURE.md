<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}(모듈 경로)·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Go 백엔드 · 아키텍처: feature(패키지 바이 피처) -->

# ARCHITECTURE — {{PROJECT_NAME}} (패키지 바이 피처)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 **표준 Go 프로젝트 레이아웃**([golang-standards/project-layout](https://github.com/golang-standards/project-layout))을 최상위 뼈대로 쓰고,
`internal/` 안을 **기술 레이어가 아니라 기능(feature)** 으로 먼저 나눈다. 한 기능은 한 패키지이고, 그 안에 `handler`·`service`·`store`·`model`이 파일로 공존한다.
의존 방향은 `internal/` 가시성(컴파일러) + import 사이클 금지(컴파일러) + depguard 린트 + 구조 테스트로 강제한다.

스택 기준(버전 기준은 `go.mod` — 구체 버전은 **예시이며 프로젝트에서 확정**):
Go 1.22+ · net/http(+chi 등 라우터) · pgx/database\_sql(관계형 DB) · golang-migrate/goose · log/slog · golangci-lint · gofumpt · go test -race.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 기능 영역이 이미 여러 개이고, 한 기능을 고치는 변경이 그 기능 안에서 끝난다.
- 여러 사람이 서로 다른 기능을 동시에 만져 충돌을 줄이고 싶다.
- 언젠가 일부 기능을 별도 서비스로 떼어낼 가능성이 있다(기능 경계 = 미래의 분리선).
- Go의 패키지 단위 캡슐화(소문자 = 패키지 비공개)를 실제 경계로 쓰고 싶다.

**쓰지 않는다:**
- 기능이 하나뿐이거나 서로 심하게 얽혀 있다 → `layered`.
- 파일이 손에 꼽을 만큼 적다 → `flat`.
- 도메인 규칙이 복잡해 순수 모델 + 포트/어댑터가 필요하다 → `hexagonal`(기능 = 바운디드 컨텍스트로 승격).

승격 신호(이 중 둘 이상이면 `hexagonal` 전환을 검토한다):
1. 한 기능의 `service.go`가 500줄을 넘고 규칙이 DB 스캔 구조체와 뒤엉킨다.
2. 저장소·외부 시스템을 교체할 요구가 실제로 생긴다(포트/어댑터의 실익).
3. DB 없이 도메인 규칙을 테스트할 수 없어 단위 테스트가 느려진다.

경계 오류 신호(전환이 아니라 경계를 다시 그어야 한다):
- 기능 간 직접 import가 필요하다는 요구가 반복된다.
- 한 요청이 두 기능의 테이블을 트랜잭션으로 함께 바꿔야 한다.

전환 절차는 §11.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 내부 패키지 외부 노출 차단 | **`internal/`** (Go 컴파일러 기본 규칙) | 컴파일 실패 |
| 순환 의존 금지 | Go 컴파일러(import cycle) | 컴파일 실패 |
| 기능 패키지 간 직접 import 금지 | depguard 규칙 + 구조 테스트(§3.3) | 게이트 차단 |
| 기능 내부 방향 (handler→service→store) | 같은 패키지라 컴파일러가 못 막는다 → 구조 테스트 + 리뷰 | 게이트 차단 |
| `store`·`model`은 전송 계층 무의존 | depguard: `net/http` 금지 | 게이트 차단 |
| `platform`은 기능을 모른다 | depguard: `platform` → `internal/<feature>` 금지 | 게이트 차단 |
| 에러는 값으로 전파 | `errcheck` | 게이트 차단 |
| 경합 없는 동시성 | `go test -race` | 게이트 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80% | 커버리지 게이트 |

> 기계적 강제 우선. 이 변형의 가치는 "기능이 실제로 독립적"일 때만 나온다. 독립성은 규율이 아니라 린트 + 구조 테스트가 지킨다.

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

- 기능은 **하나의 프로세스·하나의 DB**를 공유하는 모놀리스로 배포된다(기능 = 코드 경계이지 배포 경계가 아니다).
- 다만 테이블 소유권은 기능에 있다: 다른 기능의 테이블을 직접 조회하지 않는다(§4).
- 서비스 인스턴스는 **무상태**. 배포 아티팩트는 정적 링크 단일 바이너리 + 컨테이너.

---

## 3. 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── cmd/
│   └── {{PROJECT_SLUG}}/main.go   # 진입점. 기능 조립·라우터 마운트만
├── internal/
│   ├── platform/                  # 기술 토대(기능을 모른다)
│   │   ├── config/ · db/ · log/ · httpx/    # httpx: envelope·에러 매핑·미들웨어
│   ├── {{DOMAIN_EXAMPLE}}/        # 기능 패키지 하나 = 디렉터리 하나
│   │   ├── handler.go             #   HTTP 경계: 라우트 등록·DTO·상태코드
│   │   ├── service.go             #   비즈니스 규칙 · 트랜잭션 경계
│   │   ├── store.go               #   데이터 접근(쿼리·스캔·매핑)
│   │   ├── model.go               #   이 기능이 소유하는 타입
│   │   ├── contract.go            #   (선택) 다른 기능에 제공하는 공개 계약·이벤트
│   │   └── *_test.go
│   └── auth/ ...                  # 다른 기능
├── pkg/                           # 외부 공개 라이브러리만(없으면 만들지 않는다)
├── api/ · configs/ · deployments/ · migrations/ · test/ · build/
├── scripts/verify.sh              # 단일 검증 게이트
└── docs/
```

- `internal/`이 기본이다. `pkg/`는 정말로 외부에 공개할 코드가 있을 때만 만든다.
- `cmd/<binary>/main.go`는 **기능을 조립하고 라우터를 마운트**만 한다. 기능 간 배선이 필요하면 여기서 한다(§4-(b)).
- **단위 테스트는 기능 패키지 안**에 `*_test.go`로 둔다. 기능을 지우면 테스트도 함께 사라진다.
- `src/` 디렉터리를 만들지 않는다(Go 관례 아님).

### 3.1 기능 패키지 내부 규약

한 기능은 하나의 Go 패키지다. 파일은 나뉘어 있지만 컴파일러 관점에서는 같은 패키지이므로 소문자 식별자로 캡슐화한다.

| 파일 | 책임 | 노출 |
|---|---|---|
| `handler.go` | 라우트 등록·요청 디코딩·DTO·상태코드·에러→응답 | `Routes(r chi.Router)` 등 **최소 exported** |
| `service.go` | 비즈니스 규칙·**트랜잭션 경계**·정책 검사 | 패키지 비공개(`service` 타입) |
| `store.go` | 쿼리·스캔·매핑 | 패키지 비공개(`store` 타입) |
| `model.go` | 엔티티·VO·상태 상수·불변식 | 필요한 것만 exported |
| `contract.go` | **다른 기능에 제공하는 공개 계약**(읽기 함수·DTO·이벤트) | exported (여기만이 공개 표면) |

- **exported 식별자를 최소화**한다. 기능 패키지에서 대문자로 나가는 것은 `New(...)`·`Routes(...)`·`contract.go`의 계약뿐이어야 한다.
- 파일이 커지면 나눈다(`service_create.go`·`service_query.go`). **접두사는 유지**해 역할이 파일명에 남게 한다.
- 기능 안에서 `handler → service → store` 방향을 지킨다. 같은 패키지라 컴파일러가 막지 못하므로 구조 테스트로 확인한다(§3.3).

### 3.2 depguard 로 경계 강제 (`.golangci.yml`)

```yaml
linters-settings:
  depguard:
    rules:
      store-and-model-have-no-transport:    # 데이터·타입 계층은 전송을 모른다
        files:
          - "**/internal/*/store.go"
          - "**/internal/*/model.go"
        deny:
          - pkg: "net/http"
            desc: "전송 계층은 handler.go 에서만 다룬다"
      platform-does-not-know-features:      # 기술 토대가 기능에 오염되지 않게
        files: ["**/internal/platform/**"]
        deny:
          - pkg: "{{PACKAGE_NS}}/internal/{{DOMAIN_EXAMPLE}}"
            desc: "platform 은 기능을 모른다(역참조 금지)"
          - pkg: "{{PACKAGE_NS}}/internal/auth"
            desc: "platform 은 기능을 모른다(역참조 금지)"
      feature-{{DOMAIN_EXAMPLE}}-is-independent:   # 기능 간 직접 import 금지
        files: ["**/internal/{{DOMAIN_EXAMPLE}}/**"]
        deny:
          - pkg: "{{PACKAGE_NS}}/internal/auth"
            desc: "기능 간 직접 import 금지 — contract 경유 또는 main 조립"
      feature-auth-is-independent:
        files: ["**/internal/auth/**"]
        deny:
          - pkg: "{{PACKAGE_NS}}/internal/{{DOMAIN_EXAMPLE}}"
            desc: "기능 간 직접 import 금지 — contract 경유 또는 main 조립"
```

> depguard는 **쌍**으로 선언해야 해서 기능이 늘면 규칙도 늘어난다(등록 누락 = 강제 누락).
> 기능 수가 많아지면 §3.3의 **구조 테스트**가 더 실용적이다 — 규칙 없이 자동으로 모든 쌍을 검사한다. 둘을 함께 두는 것을 권한다.

### 3.3 구조 테스트 (경계를 자동으로 검사)

기능 목록을 하드코딩하지 않고 **디렉터리를 스캔해** 모든 쌍을 검사한다. 기능을 추가해도 설정을 고칠 필요가 없다.

```go
// internal/architecture_test.go
package internal_test

// Test기능간직접import금지는 기능 패키지가 서로를 import 하지 않음을 강제한다.
// 예외는 contract 패스뿐이며, 그 외 참조는 main 조립 또는 이벤트로 뒤집는다.
func Test기능간직접import금지(t *testing.T) {
	t.Parallel()
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("internal 디렉터리 읽기 실패: %v", err)
	}
	features := map[string]bool{}
	for _, e := range entries {
		if e.IsDir() && e.Name() != "platform" {
			features[e.Name()] = true
		}
	}
	fset := token.NewFileSet()
	for feature := range features {
		pkgs, err := parser.ParseDir(fset, feature, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("%s 파싱 실패: %v", feature, err)
		}
		for _, pkg := range pkgs {
			for path, file := range pkg.Files {
				for _, imp := range file.Imports {
					target := strings.Trim(imp.Path.Value, `"`)
					for other := range features {
						if other == feature {
							continue
						}
						if strings.HasSuffix(target, "/internal/"+other) {
							t.Errorf("%s: 기능 %q 를 직접 import — contract 경유 또는 main 조립", path, other)
						}
					}
				}
			}
		}
	}
}
```

> 같은 패키지 안의 `handler → service → store` 방향은 컴파일러도 depguard도 막지 못한다.
> 필요하면 위와 같은 방식으로 "`store.go`가 `handler` 심볼을 참조하지 않는다" 류의 테스트를 덧붙인다.

---

## 4. 기능 간 통합 규약 (가장 중요한 규칙)

기능은 서로를 직접 import하지 않는다. 통합이 필요하면 아래 셋 중 하나를 쓴다.

| 방식 | 언제 | 형태 |
|---|---|---|
| (a) `contract.go` 경유 | 동기 읽기·간단한 질의 | 제공 기능의 `contract.go`가 노출한 함수·DTO만 호출. **단방향일 때만** — 양방향이면 (b)로 |
| (b) `main` 조립 주입 | 쓰기·정책이 얽힐 때 | 소비 기능이 **자기 패키지에 인터페이스를 선언**하고 `main`이 제공 기능의 구현을 주입(기능 A는 B의 존재를 모른다) |
| (c) 이벤트 | 부수 효과·비동기 | 제공 기능이 발행, 소비 기능이 핸들러 등록. 실패·재시도는 소비 쪽 책임 |

```go
// (b) 소비 기능이 필요한 것만 선언한다 — 제공 기능을 import 하지 않는다.
// internal/{{DOMAIN_EXAMPLE}}/service.go
package {{DOMAIN_EXAMPLE}}

// OwnerLookup은 소유자 표시 이름을 조회한다. 구현은 main 이 주입한다.
type OwnerLookup interface {
	DisplayName(ctx context.Context, ownerID int64) (string, error)
}
```

- **(b)가 기본값**이다. Go에서 인터페이스는 소비자 쪽에 선언하는 것이 관례이고, 이 방식이 유일하게 양방향 의존을 만들지 않는다.
- (a)도 DTO만 오간다. 다른 기능의 내부 타입·`*sql.Tx`를 넘기지 않는다.
- 다른 기능이 소유한 테이블을 직접 조회·조인하지 않는다. 조인이 꼭 필요하면 경계가 잘못됐다는 신호다.
- 기능을 넘는 단일 트랜잭션을 만들지 않는다. 한 요청이 두 기능을 바꿔야 하면 (c) 이벤트 + 멱등 처리로 최종 일관성을 택한다.
- 기능 간 호출을 루프 안에서 하지 않는다(N+1). 필요하면 배치 계약(`DisplayNames(ctx, ids)`)을 제공한다.

---

## 5. 기능 내부 책임

- 트랜잭션 경계는 `service`에만. `service`가 `TxManager`(자기 패키지에 선언, `platform/db`가 구현)로 열고 커밋한다. `store`는 `ctx`로 전파된 실행기를 쓰기만 한다.
- 비즈니스 규칙은 `service`와 `model`에. 상태 불변식은 모델 생성자·메서드로, 오케스트레이션·정책은 서비스로. `handler`에 규칙을 흘리지 않는다.
- 생성자 주입 only. 패키지 전역 변수(`var db *sql.DB`)·`init()` 부작용 금지. 시간·난수·ID는 인터페이스(`Clock`·`IDGenerator`)로 주입한다.
- 로깅은 `handler`/`service`/`store`에서만, 한 번만. `model`은 로깅 금지. `log/slog` 구조화 로깅, 로거는 주입(전역 로거 지양).
- `handler`는 `model`을 그대로 반환하지 않는다. 응답 DTO로 변환하고 `platform/httpx`의 공통 envelope에 담는다.
- **DB 접근**: `pgx`(또는 `database/sql`) + 파라미터 바인딩. 스캔 구조체와 `model` 타입은 다른 타입이며 `store`가 변환한다.

### 5.1 에러 처리 규약 (Go 핵심)

- 에러는 값이다. 모든 error를 처리하거나 반환한다(`errcheck`). `_ = err`로 버리지 않는다.
- 래핑으로 맥락을 더한다: `fmt.Errorf("{{DOMAIN_EXAMPLE}} 저장 실패: %w", err)`. `%w`로 원인을 보존해 `errors.Is/As`가 동작하게 한다.
- **도메인 오류는 sentinel 또는 타입**으로 기능 패키지에 정의한다(`var ErrNotFound = errors.New("not found")`). `handler`에서 `errors.Is/As`로 판별해 상태코드로 변환한다.
- 에러 문자열은 소문자로 시작하고 마침표를 붙이지 않는다(Go 관례).
- panic 금지(요청 처리 경로). recover 미들웨어는 두되 정상 흐름으로 쓰지 않는다.
- 에러에 민감정보를 넣지 않는다.

### 5.2 동시성 규약

- `context.Context`를 첫 인자로 전파한다. 구조체 필드에 저장하지 않는다.
- 고루틴에는 소유자와 종료 조건이 있어야 한다(`errgroup.Group` + `ctx.Done()`). 종료 경로 없는 고루틴 = 누수.
- **채널 소유권**: 보내는 쪽이 닫는다. 공유 상태는 뮤텍스 또는 채널 중 하나로만 보호한다. `go test -race`는 항상 켠다.
- 팬아웃은 상한을 둔다(세마포어·워커 풀).

---

## 6. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. 코드로 말할 수 없는 것 — Why · 함정 · 외부 근거 · 억제 이유 — 만 적는다.
- 단계별 `처리 흐름:`은 분기가 얽혀 절차가 안 잡히거나, 순서를 바꾸면 버그가 나는 함수에 쓴다. 5단계 이내.
- Go doc 규약을 따른다: doc comment는 선언 이름으로 시작한다. exported 식별자에는 doc comment를 단다. 패키지 주석은 `// Package {{DOMAIN_EXAMPLE}} ...` — 이 기능이 무엇을 소유하는지 한 줄로 적는다.
- `contract.go`의 각 항목에는 **"다른 기능이 이걸 어떻게 쓰는지"** 를 남긴다(경계 문서화).
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 7. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 도메인 상수 | 상태·역할·액션 라벨 | `const` + 타입 있는 상수(기능 패키지의 `model.go`) |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `internal/platform/config`에서 env 로드(구조체 1개) |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블/기능 플래그(캐시·무효화 동반) |

- 설정은 **`main`에서 1회 로드해 주입**한다. 기능 패키지가 `os.Getenv`를 직접 부르지 않는다.
- 기능 고유 설정은 **그 기능 소유 구조체 필드**로 분리한다(기능을 떼어낼 때 설정도 따라가게).
- 타임아웃·리트라이 횟수·페이지 상한은 이름 있는 상수로.

---

## 8. 성능 예산 (부하테스트로 확정)

- 무한/대량 결과 금지: cursor pagination + 상한 `limit`.
- **N+1 회피**: 배치·조인·`IN` 조회. 기능 간 호출의 N+1도 같이 본다(루프 내 contract 호출 금지 — 배치 계약 제공).
- **커넥션 풀 설정**: `SetMaxOpenConns`·`SetMaxIdleConns`·`SetConnMaxLifetime`을 명시적으로 설정한다(기본값은 무제한).
- **HTTP 클라이언트 재사용**: 요청마다 생성 금지. `http.DefaultClient`는 타임아웃이 없다 — `Timeout` 설정 클라이언트를 주입한다.
- **서버 타임아웃**: `ReadHeaderTimeout`·`ReadTimeout`·`WriteTimeout`·`IdleTimeout` 설정(미설정 시 slowloris 노출).
- 응답 본문은 항상 닫는다(`defer resp.Body.Close()`).

| 경로 부류 | 예 | 목표(예시 — 프로젝트 확정) | 도달 레버 |
|---|---|---|---|
| 캐시/인증 핫패스 | 키 검증·캐시 조회 | 고 TPS/인스턴스 | 캐시(TTL+무효화), 할당 최소화 |
| 일반 읽기 | 목록·상세 | 수천 TPS/인스턴스 | 인덱스·keyset·풀 사이징 |
| 쓰기 | 생성·수정 | 수백~수천 TPS | 무거운 작업은 비동기 워커로 |
| 기능 간 통합 | contract·이벤트 | 배치 1회 | 루프 내 호출 금지·배치 계약 |

---

## 9. TDD 워크플로 (요약)

```
RED   기능 service 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. 테스트 없는 `service` 변경 금지.
- 표준 `testing` + 테이블 주도 테스트. 목 프레임워크보다 **직접 만든 fake**를 우선한다(인터페이스가 작아 쉽다).
- 기능 테스트는 그 기능만으로 돌아야 한다. 다른 기능을 조립해야 통과하는 테스트는 경계가 새고 있다는 신호다.
- `t.Parallel()`을 기본으로 쓰되 공유 상태를 만들지 않는다. `-race`는 항상 켠다.

| 대상 | 도구 | 비고 |
|---|---|---|
| `model` | `testing`(테이블 주도) | 불변식·상태 전이. 표준 라이브러리만 |
| `service` | `testing` + 손수 짠 fake(store·주입 인터페이스) | 규칙·트랜잭션 순서. DB·HTTP 없음 |
| `store` | `testing` + 실제 DB(testcontainers-go 선택) | 쿼리·매핑·격리 정책 |
| `handler` | `net/http/httptest` | 라우팅·envelope·status |
| 기능 간 통합 | `test/` + 조립된 서버 | (a)/(b)/(c) 경로 계약 확인 |
| 구조 | `internal/architecture_test.go` | 기능 독립성(§3.3) |

- 검증 게이트: `bash scripts/verify.sh` (CI·pre-commit·hook이 모두 이 스크립트를 호출).

---

## 10. 새 기능 추가 워크플로

1. **기능 결정**: 기존 기능 안인지 새 기능인지 먼저 답한다. 판단 기준은 "어느 기능이 이 데이터를 소유하는가".
2. **(신규 기능)** `internal/<feature>/` 생성(`handler.go`·`service.go`·`store.go`·`model.go`) → `.golangci.yml`에 독립 규칙 쌍 추가(또는 구조 테스트가 자동 검사하는지 확인) → `main.go`에서 조립·라우터 마운트.
3. **TDD 사이클**: `model`(불변식) → `service`(fake store) → `store`(실제 DB) → `handler`(`httptest`, 응답은 envelope) → `main`(조립·smoke).
4. **다른 기능이 필요하면** §4의 (a)/(b)/(c) 중 하나를 고르고 이유를 `.agents/docs/decisions/`에 한 줄 남긴다. 기본은 (b).
5. **검증**: `bash scripts/verify.sh` 통과 + `api/`의 OpenAPI 스펙 동기화.
6. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록.

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- 다른 기능 패키지를 직접 import(`{{PACKAGE_NS}}/internal/<other>`).
- 다른 기능이 소유한 테이블을 직접 조회·조인.
- 기능 간에 내부 타입·`*sql.Tx`·`*sql.DB`를 인자로 넘기기.
- `platform`이 기능 패키지를 import(기술 토대가 기능에 오염).
- 기능을 넘는 단일 트랜잭션을 억지로 만들기.
- `handler`가 `store`를 직접 호출(기능 내부 방향 위반).
- `handler`가 `model`을 그대로 JSON으로 반환(DTO·envelope 우회).
- `store.go`·`model.go`가 `net/http`를 import.
- store가 트랜잭션을 커밋(경계 분산).
- 기능 패키지에서 exported 식별자를 남발(공개 표면은 `New`·`Routes`·`contract.go`뿐).
- `context.Context`를 구조체 필드에 저장하거나 `context.TODO()`를 프로덕션 경로에 방치.
- 종료 조건 없는 고루틴(누수), `err` 무시(`_ = err`), `panic`으로 정상 오류 처리.
- 패키지 전역 가변 상태·`init()`에서 I/O 수행.
- 타임아웃 없는 `http.Client`/`http.Server`, `resp.Body.Close()` 누락.
- 테스트 없이 `service` 코드 추가.

---

## 12. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `hexagonal` (도메인 규칙이 복잡해질 때) | 기능 하나를 바운디드 컨텍스트로 승격: `service.go` → `<ctx>/app/`, `store.go` → `<ctx>/infra/`, `handler.go` → `<ctx>/primary/http/`, `model.go` → `<ctx>/domain/`. 포트 인터페이스를 `app`에 모은다. | depguard를 `domain-is-pure`·`app-has-no-adapters`·`primary-and-infra-are-siblings` 3종으로 교체. **기능 독립 규칙은 그대로 유지**(기능 = 컨텍스트) |
| → `layered` (기능이 하나로 수렴할 때) | `internal/<f>/{handler,service,store,model}.go` 를 `internal/{handler,service,repository,model}/` 로 펼친다. `platform/`은 `config`·`database`·`logger`·`middleware`로 되돌린다. | 기능 독립 규칙을 레이어 방향 규칙으로 교체 |
| → 기능 분리(별도 서비스) | 기능 디렉터리를 새 리포로 옮기고 §4의 (a)/(b) 호출을 HTTP/메시지로 바꾼다. | 남은 쪽 규칙에서 그 기능을 제거. 호출 지점에 `.agents/rules/reliability.md`의 타임아웃·재시도 적용 |

- 이 변형의 이점은 여기서 나온다: 독립 규칙을 지켜왔다면 분리 비용이 "디렉터리 이동 + 호출 방식 교체"로 끝난다.
- Go는 **패키지 이동이 곧 import 경로 변경**이라 도구(`gopls` 리네임)로 기계적으로 처리할 수 있다. 컴파일러가 누락을 잡아준다.
- 전환은 한 번에 한 기능씩 옮기고 각 단계마다 `scripts/verify.sh`를 통과시킨다.
- 전환 시작 전 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).

---

## 13. 관련 문서

- 스택·구조·보안·API 규약 원본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
- 레이아웃 근거: [golang-standards/project-layout](https://github.com/golang-standards/project-layout)
