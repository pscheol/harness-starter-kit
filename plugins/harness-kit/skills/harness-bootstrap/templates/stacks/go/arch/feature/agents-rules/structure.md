<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 아키텍처: feature · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 표준 Go 레이아웃 + 패키지 바이 피처 — {{PROJECT_NAME}}

이 프로젝트는 [golang-standards/project-layout](https://github.com/golang-standards/project-layout) 을 최상위 뼈대로,
`internal/` 안을 **기술 레이어가 아니라 기능(feature)** 으로 먼저 나눈다. 한 기능 = 한 패키지이고, 그 안에 `handler`·`service`·`store`·`model`이 파일로 공존한다.
의존 방향은 `internal/` 가시성 + import 사이클 금지(둘 다 컴파일러) + depguard 린트 + 구조 테스트로 강제한다. 아키텍처 상세 원본(선택 기준·전환 가이드 포함)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── go.mod / go.sum              # 모듈 경로 {{PACKAGE_NS}} · 의존성 단일 소스
├── cmd/
│   └── {{PROJECT_SLUG}}/main.go # 진입점. 기능 조립 + 라우터 마운트 + 서버 기동만
├── internal/
│   ├── platform/                # 기술 토대(기능을 모른다)
│   │   ├── config/ · db/ · log/ · httpx/   # httpx: envelope·에러 매핑·미들웨어
│   ├── {{DOMAIN_EXAMPLE}}/      # 기능 패키지 하나 = 디렉터리 하나
│   │   ├── handler.go           #   라우트 등록·요청 디코딩·DTO·상태코드
│   │   ├── service.go           #   비즈니스 규칙 · 트랜잭션 경계
│   │   ├── store.go             #   데이터 접근(쿼리·스캔·매핑)
│   │   ├── model.go             #   이 기능이 소유하는 타입
│   │   ├── contract.go          #   (선택) 다른 기능에 제공하는 공개 계약·이벤트
│   │   └── *_test.go            #   테스트는 기능 안에
│   ├── auth/ ...                # 다른 기능
│   └── architecture_test.go     # 기능 독립성 자동 검사
├── pkg/                         # 외부 공개 라이브러리만(없으면 만들지 않는다)
├── api/                         # OpenAPI·proto 계약 원본
├── configs/ · deployments/ · migrations/ · test/ · build/
├── scripts/verify.sh            # 단일 검증 게이트
└── docs/
```

- **`internal/`이 기본**이다. `pkg/`는 정말로 외부에 공개할 코드가 있을 때만 만든다.
- `cmd/<binary>/main.go`는 **기능을 조립하고 라우터를 마운트**만 한다. 기능 간 배선도 여기서 한다.
- **단위 테스트는 기능 패키지 안**에 `*_test.go`로 둔다. 기능을 지우면 테스트도 함께 사라진다(`test/`는 e2e·픽스처 전용).
- `src/` 디렉터리를 만들지 않는다(Go 관례 아님).

## 기능 패키지 내부 규약

한 기능은 하나의 Go 패키지다. 파일은 나뉘어 있어도 컴파일러 관점에서는 같은 패키지이므로 소문자 식별자로 캡슐화한다.

| 파일 | 책임 | 노출 |
|---|---|---|
| `handler.go` | 라우트 등록·요청 디코딩·DTO·상태코드·에러→응답 | `Routes(...)` 등 최소 exported |
| `service.go` | 비즈니스 규칙·**트랜잭션 경계**·정책 검사 | 패키지 비공개 |
| `store.go` | 쿼리·스캔·매핑 | 패키지 비공개 |
| `model.go` | 엔티티·VO·상태 상수·불변식 | 필요한 것만 exported |
| `contract.go` | **다른 기능에 제공하는 공개 계약** | exported (여기만이 공개 표면) |

- **exported 식별자를 최소화**한다. 기능 밖으로 나가는 것은 `New(...)`·`Routes(...)`·`contract.go`의 계약뿐이어야 한다.
- 기능 안 방향은 `handler → service → store`. 같은 패키지라 컴파일러가 막지 못하므로 리뷰와 구조 테스트로 지킨다.
- 파일이 커지면 나눈다(`service_create.go`·`service_query.go`). **접두사는 유지**해 역할이 파일명에 남게 한다.
- `platform`은 기능을 모른다(역참조 금지). 공통 HTTP 응답·에러 매핑은 `platform/httpx`에 둔다.

## 기능 간 통합 (이 변형의 핵심 규칙)

기능은 서로를 직접 import하지 않는다. 통합이 필요하면 셋 중 하나를 고른다.

| 방식 | 언제 | 형태 |
|---|---|---|
| (a) `contract.go` 경유 | 동기 읽기·간단한 질의(단방향일 때만) | 제공 기능의 `contract.go`가 노출한 함수·DTO만 호출 |
| (b) `main` 조립 주입 **(기본)** | 쓰기·정책이 얽힐 때 | 소비 기능이 자기 패키지에 인터페이스를 선언하고 `main`이 구현을 주입 |
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

- **(b)가 기본값**이다. Go 관례상 인터페이스는 소비자 쪽에 선언하고, 이 방식만이 양방향 의존을 만들지 않는다.
- (a)도 DTO만 오간다. 다른 기능의 내부 타입·`*sql.Tx`·`*sql.DB`를 넘기지 않는다.
- 다른 기능이 소유한 테이블을 직접 조회·조인하지 않는다. 조인이 꼭 필요하면 경계가 잘못됐다는 신호다.
- 기능을 넘는 단일 트랜잭션을 만들지 않는다. 두 기능을 바꿔야 하면 (c) 이벤트 + 멱등 처리로 최종 일관성을 택한다.
- 기능 간 호출을 루프 안에서 하지 않는다(N+1). 배치 계약(`DisplayNames(ctx, ids)`)을 제공한다.

## 강제 수단

- **depguard**(`.golangci.yml`): `store.go`·`model.go`의 `net/http` 금지, `platform` → 기능 역참조 금지, 기능 쌍 간 import 금지. 골격은 `ARCHITECTURE.md` §3.2.
  - depguard는 **쌍으로 선언**해야 해서 기능이 늘면 규칙도 늘어난다(등록 누락 = 강제 누락).
- 구조 테스트(`internal/architecture_test.go`): 디렉터리를 스캔해 모든 기능 쌍을 자동 검사한다. 기능을 추가해도 설정을 고칠 필요가 없다. 골격은 `ARCHITECTURE.md` §3.3.
- 둘을 **함께** 둔다. depguard는 빠른 피드백, 구조 테스트는 누락 없는 커버리지를 준다.

## 패키지·네이밍 컨벤션

- 기능 패키지명은 **짧은 소문자 단수형**(`{{DOMAIN_EXAMPLE}}`·`auth`·`billing`). 밑줄·대문자·복수형 금지. `util`·`helper` 패키지를 만들지 않는다.
- 패키지명 반복 금지: `{{DOMAIN_EXAMPLE}}.New{{DOMAIN_EXAMPLE}}()`가 아니라 `{{DOMAIN_EXAMPLE}}.New()`. 호출부에서 읽히는 이름을 기준으로 짓는다.
- 패키지 주석(`// Package {{DOMAIN_EXAMPLE}} ...`)에 **이 기능이 무엇을 소유하는지** 한 줄로 적는다.
- 인터페이스명: 단일 메서드는 `-er`(`Reader`·`Provisioner`), 역할형은 명사(`OwnerLookup`).
- 도메인 타입 필드는 **비공개 + 접근자**로 두고 생성자에서 불변식을 검증한다.
- DB 스캔 구조체와 `model` 타입은 다른 타입이며 `store`가 변환한다. 스캔 구조체가 기능 밖으로 새지 않는다.
- `handler`는 `model`을 그대로 반환하지 않는다. 응답 DTO로 변환하고 `platform/httpx`의 공통 envelope에 담는다.
- **트랜잭션 경계는 `service`**: 자기 패키지에 `TxManager` 인터페이스를 선언하고 `platform/db`가 구현한다. `store`는 커밋하지 않는다.

## 새 기능 착수 워크플로

1. **기능 결정**: 기존 기능 안인지 새 기능인지 먼저 답한다. 판단 기준은 "어느 기능이 이 데이터를 소유하는가".
2. (신규 기능이면) `internal/<feature>/` 생성(`handler.go`·`service.go`·`store.go`·`model.go`) → `.golangci.yml`에 독립 규칙 쌍 추가(구조 테스트가 자동 검사하는지도 확인) → `main.go`에서 조립·라우터 마운트.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `model`: 테이블 주도 테스트로 불변식·상태 전이 → 생성자에서 검증하는 타입 구현.
   2. `service`: fake store·fake 주입 인터페이스로 규칙·트랜잭션 순서 테스트 → 서비스 구현.
   3. `store`: 통합 테스트(실제 DB)로 쿼리·매핑 검증 → 구현.
   4. `handler`: `httptest`로 라우팅·상태코드 테스트 → 핸들러·DTO 구현. **응답은 공통 envelope**.
   5. `main`: 조립·smoke 테스트.
4. **다른 기능이 필요하면** 위 (a)/(b)/(c) 중 하나를 고르고 이유를 `.agents/docs/decisions/`에 한 줄 남긴다. 기본은 (b).
5. **검증**: `bash scripts/verify.sh`(fmt·vet·lint·race 테스트·커버리지) 통과 + `api/` OpenAPI 스펙 동기화.
6. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (린터의 보완)

컴파일러가 `internal/` 가시성과 사이클을, depguard가 선언된 쌍의 import를 막는다.
그러나 기능이 늘어날 때 규칙 등록을 잊는 것이 이 변형의 가장 흔한 실패다. 구조 테스트가 그 구멍을 메운다.

```go
// internal/architecture_test.go — 기능 목록을 하드코딩하지 않고 디렉터리를 스캔한다.
package internal_test

// Test기능간직접import금지는 기능 패키지가 서로를 import 하지 않음을 강제한다.
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
						if other != feature && strings.HasSuffix(target, "/internal/"+other) {
							t.Errorf("%s: 기능 %q 를 직접 import — contract 경유 또는 main 조립", path, other)
						}
					}
				}
			}
		}
	}
}
```

> 규칙은 프로젝트에 맞게 늘린다. 핵심은 위반을 `scripts/verify.sh`에서 실패로 만드는 것(리뷰가 아니라 게이트).

## 새 기능 착수 규칙

1. 새 기능은 **한 패키지 안에서 끝나게** 설계한다. 두 기능을 동시에 고쳐야 한다면 경계를 다시 본다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `api/`의 OpenAPI 스펙과 `.agents/docs/`를 함께 갱신한다.
4. 승격 신호(`service.go` 비대·저장소 교체 요구·DB 없는 규칙 테스트 불가) 또는 경계 오류 신호(기능 간 import 요구 반복·기능 넘는 트랜잭션)가 보이면 `ARCHITECTURE.md` §0·§12를 연다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
