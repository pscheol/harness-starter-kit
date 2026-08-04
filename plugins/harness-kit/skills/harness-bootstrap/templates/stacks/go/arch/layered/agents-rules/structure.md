<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 아키텍처: layered · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 표준 Go 레이아웃 + 레이어드 — {{PROJECT_NAME}}

이 프로젝트는 **[golang-standards/project-layout](https://github.com/golang-standards/project-layout)** 을 최상위 뼈대로,
`internal/` 안에서 **레이어드 아키텍처(handler → service → repository → model)** 를 구현한다.
의존 방향은 **`internal/` 가시성 + import 사이클 금지(둘 다 컴파일러) + depguard 린트**로 강제한다. 아키텍처 상세 정본(선택 기준·전환 가이드 포함)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── go.mod / go.sum              # 모듈 경로 {{PACKAGE_NS}} · 의존성 단일 소스
├── cmd/
│   └── {{PROJECT_SLUG}}/main.go # 진입점. 설정 로드 + 의존성 조립 + 서버 기동만
├── internal/                    # 외부 모듈이 import 불가(컴파일러 강제)
│   ├── config/                  #   env 로드(구조체 1개) — main 에서 1회
│   ├── database/                #   커넥션 풀·트랜잭션 헬퍼
│   ├── logger/                  #   log/slog 구성
│   ├── middleware/              #   requestid·recover·access log·auth
│   ├── common/                  #   envelope·errcode·페이지네이션 타입
│   ├── handler/                 #   HTTP 경계: 라우팅·DTO·상태코드
│   ├── service/                 #   비즈니스 규칙 · 트랜잭션 경계
│   ├── repository/              #   데이터 접근(쿼리·스캔·매핑)
│   └── model/                   #   도메인 타입(엔티티·VO·상태 상수)
├── pkg/                         # 외부 공개 라이브러리만(없으면 만들지 않는다)
├── api/                         # OpenAPI·proto 계약 정본
├── configs/ · deployments/ · migrations/ · test/ · build/
├── scripts/verify.sh            # 단일 검증 게이트
└── docs/
```

- **`internal/`이 기본**이다. `pkg/`는 **정말로 외부에 공개할 코드가 있을 때만** 만든다.
- `cmd/<binary>/main.go`는 조립만 한다. 로직이 들어가기 시작하면 `internal/`로 옮긴다.
- **단위 테스트는 소스 옆**(`foo.go` ↔ `foo_test.go`). `test/`는 e2e·대용량 픽스처 전용.
- `src/` 디렉터리를 만들지 않는다(Go 관례 아님).
- 바이너리가 여러 개면 `cmd/` 아래에 각각 디렉터리를 둔다(`cmd/api`, `cmd/worker`). 공유 코드는 `internal/`에.

## 레이어 ↔ 의존 가능

| 패키지 | 책임 | 의존 가능 |
|---|---|---|
| `cmd/<binary>` | 조립(main) | `internal/...`(조립 목적) |
| `internal/handler` | 라우팅·DTO·상태코드·에러→응답 변환 | `service`, `common`, `model`(읽기용), `middleware` |
| `internal/service` | 비즈니스 규칙·**트랜잭션 경계**·정책 검사 | `repository`, `model`, `common` |
| `internal/repository` | 쿼리·스캔·매핑·페이지네이션 | `model`, `database`, `common` |
| `internal/model` | 엔티티·VO·상태 상수·불변식 메서드 | — (표준 라이브러리만) |
| `internal/common` | envelope·errcode·공용 타입 | `model` |
| `internal/{config,database,logger,middleware}` | 기술 토대 | 표준 라이브러리 + 드라이버 |

- **의존 금지**: `service → handler`, `repository → service/handler`, `model → 위 전부`, `service`·`repository`·`model` → `net/http`, **`handler` → `repository`(레이어 건너뛰기)**.
- **레이어를 건너뛰지 않는다**: 조회만 하는 엔드포인트라도 서비스를 통과시킨다(규칙은 나중에 생긴다).
- 강제 수단(depguard 규칙 예시)은 `ARCHITECTURE.md` §3.2. **새 레이어 패키지를 만들면 규칙 경로 패턴이 그것을 덮는지 확인**한다.

## 인터페이스는 소비자 쪽에 (Go 관례)

레이어드에서도 **인터페이스는 구현체가 아니라 사용하는 쪽이 선언**한다. `service`가 필요한 저장 동작을 인터페이스로 선언하고 `repository`가 시그니처를 만족한다(명시적 implements 선언 없음 = 컴파일 타임 덕 타이핑).

```go
// internal/service/{{DOMAIN_EXAMPLE}}.go
package service

// {{DOMAIN_EXAMPLE}}Store는 {{DOMAIN_EXAMPLE}} 영속에 필요한 최소 동작이다.
// service 가 선언하므로 테스트에서 fake 로 바꿔 끼울 수 있다.
type {{DOMAIN_EXAMPLE}}Store interface {
	Save(ctx context.Context, m *model.{{DOMAIN_EXAMPLE}}) error
	FindByCode(ctx context.Context, code string) (*model.{{DOMAIN_EXAMPLE}}, error)
}

// TxManager는 service 가 트랜잭션 경계를 소유하기 위한 계약이다.
// repository 는 커밋하지 않는다 — 경계가 분산되면 부분 반영이 생긴다.
type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
```

- **인터페이스는 작게**(1~3 메서드). 거대한 단일 `Repository` 인터페이스는 테스트 대역 작성을 어렵게 한다.
- **모든 메서드의 첫 인자는 `ctx context.Context`**. 시그니처에 SQL·컬럼·`*sql.Tx`를 노출하지 않는다.
- `repository`가 `service`를 import해 인터페이스를 "구현 선언"하지 않는다(의존 방향이 뒤집힌다).

## 패키지·네이밍 컨벤션

- 패키지명은 **짧은 소문자 단수형**(`handler`·`service`·`repository`·`model`). `util`·`helper` 같은 잡동사니 패키지를 만들지 않는다(`internal/common`은 역할이 좁게 정의된 예외).
- **패키지명 반복 금지**: `service.NewService()`가 아니라 도메인별로 `service.New{{DOMAIN_EXAMPLE}}(...)`. 호출부에서 읽히는 이름을 기준으로 짓는다.
- 파일명은 소문자 + 밑줄(`{{DOMAIN_EXAMPLE}}.go`·`{{DOMAIN_EXAMPLE}}_test.go`). 한 파일에 한 리소스.
- 인터페이스명: 단일 메서드는 `-er`(`Reader`·`Provisioner`), 역할형은 명사(`{{DOMAIN_EXAMPLE}}Store`).
- **exported는 최소화**한다. 패키지 밖에서 쓰지 않는 타입·함수는 소문자로 둔다.
- `model` 타입의 불변식이 중요하면 필드를 **비공개 + 접근자**로 두고 생성자에서 검증한다.
- **DB 스캔 구조체(`repository`)와 `model` 타입은 다른 타입**이며 repository가 변환한다. 스캔 구조체가 repository 밖으로 새지 않는다.
- **`handler`는 `model`을 그대로 반환하지 않는다.** 응답 DTO로 변환하고 공통 envelope에 담는다.
- **트랜잭션 경계는 service**: `TxManager`로 열고 커밋한다. repository는 `ctx`로 전파된 실행기를 쓰기만 한다.

## 새 기능 착수 워크플로

1. **레이어 결정**: 새 리소스인지, 기존 리소스의 새 동작인지 먼저 답한다.
2. 새 리소스면 파일 세트를 만든다: `model/<x>.go` → `repository/<x>.go` → `service/<x>.go` → `handler/<x>.go`. 새 레이어 패키지를 만들었다면 depguard 규칙이 덮는지 확인한다.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `model`: 테이블 주도 테스트로 불변식·상태 전이 → 생성자에서 검증하는 타입 구현.
   2. `service`: fake store 로 규칙·트랜잭션 순서 테스트 → 인터페이스 선언 → 서비스 구현.
   3. `repository`: 통합 테스트(실제 DB)로 쿼리·매핑 검증 → 구현.
   4. `handler`: `httptest`로 라우팅·상태코드 테스트 → 핸들러·DTO 구현. **응답은 공통 envelope**.
   5. `cmd`: 조립·smoke 테스트.
4. **검증**: `bash scripts/verify.sh`(fmt·vet·lint·race 테스트·커버리지) 통과 + `api/` OpenAPI 스펙 동기화.
5. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (린터의 보완)

depguard가 **import 방향**을 막는다. 그러나 못 잡는 규율이 있다: 핸들러가 모델을 직접 반환, repository의 커밋 호출, 네이밍 규약 등.
이런 것은 `internal/architecture_test.go` 같은 테스트로 강제한다(게이트가 자동 실행).

```go
package architecture_test

// TestRepository는커밋하지않는다는 트랜잭션 경계가 service 에 있어야 함을 강제한다.
// repository 가 커밋하면 여러 호출 사이에서 부분 반영이 생긴다.
func TestRepository는커밋하지않는다(t *testing.T) {
	t.Parallel()
	matches, err := filepath.Glob("repository/*.go")
	if err != nil {
		t.Fatalf("glob 실패: %v", err)
	}
	for _, path := range matches {
		src, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("파일 읽기 실패 %s: %v", path, err)
		}
		if bytes.Contains(src, []byte(".Commit(")) {
			t.Errorf("%s: repository 에서 Commit 호출 — 경계는 service 에 둔다", path)
		}
	}
}
```

> 규칙은 프로젝트에 맞게 늘린다. 핵심은 **위반을 `scripts/verify.sh`에서 실패로 만드는 것**(리뷰가 아니라 게이트).

## 새 기능 착수 규칙

1. 새 기능은 위 레이어 경계 안에서 구현한다. 한 레이어에 다른 레이어의 책임을 몰지 않는다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `api/`의 OpenAPI 스펙과 `.agents/docs/`를 함께 갱신한다.
4. 승격 신호(`service` 비대·세 디렉터리 왕복 비용·저장소 교체 요구)가 보이면 `ARCHITECTURE.md` §0·§11의 전환 가이드를 연다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: Order · Catalog · User · Notification).
