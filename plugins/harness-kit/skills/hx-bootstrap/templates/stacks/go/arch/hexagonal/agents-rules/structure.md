<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 아키텍처: hexagonal · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 표준 Go 레이아웃 + 헥사고날 — {{PROJECT_NAME}}

이 프로젝트는 [golang-standards/project-layout](https://github.com/golang-standards/project-layout) 을 최상위 뼈대로,
`internal/` 안에서 **클린 아키텍처(헥사고날) + DDD**를 구현한다.
의존 방향은 `internal/` 가시성 + import 사이클 금지(둘 다 컴파일러) + depguard 린트로 강제한다. 아키텍처 상세 원본은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── go.mod / go.sum              # 모듈 경로 {{PACKAGE_NS}} · 의존성 단일 소스
├── cmd/
│   └── {{PROJECT_SLUG}}/main.go # 진입점. 설정 로드 + 의존성 조립 + 서버 기동만
├── internal/                    # 외부 모듈이 import 불가(컴파일러 강제)
│   ├── core/                    #   도메인 에러·공용 타입(표준 라이브러리만)
│   ├── common/                  #   공유 커널: envelope·errcode·미들웨어·requestid
│   ├── {{DOMAIN_EXAMPLE}}/      #   바운디드 컨텍스트
│   │   ├── domain/
│   │   ├── app/
│   │   ├── primary/http/
│   │   └── infra/{postgres,client}/
│   └── platform/                #   config·db·logger·telemetry
├── pkg/                         # 외부 공개 라이브러리만(없으면 만들지 않는다)
├── api/                         # OpenAPI·proto 계약 원본
├── configs/                     # 설정 템플릿(비밀값 금지)
├── deployments/                 # Dockerfile·compose·IaC
├── migrations/                  # DB 마이그레이션 SQL
├── test/                        # e2e·픽스처(단위 테스트는 소스 옆)
├── build/                       # 패키징·CI 보조
├── scripts/verify.sh            # 단일 검증 게이트
└── docs/
```

- `internal/`이 기본이다. `pkg/`는 정말로 외부에 공개할 코드가 있을 때만 만든다(레이아웃 저장소도 `pkg/` 남용을 경고한다).
- `cmd/<binary>/main.go`는 조립만 한다. 로직이 들어가기 시작하면 `internal/`로 옮긴다.
- **단위 테스트는 소스 옆**(`foo.go` ↔ `foo_test.go`). `test/`는 e2e·대용량 픽스처 전용.
- `src/` 디렉터리를 만들지 않는다(Go 관례 아님).
- 바이너리가 여러 개면 `cmd/` 아래에 각각 디렉터리를 둔다(`cmd/api`, `cmd/worker`). 공유 코드는 `internal/`에.

## 레이어 ↔ 의존 가능

| 패키지 | 레이어 | 의존 가능 |
|---|---|---|
| `cmd/<binary>` | 조립(main) | `internal/...`(조립 목적) |
| `internal/<ctx>/primary/http` | Inbound Adapter | `app`, `common` |
| `internal/<ctx>/infra/...` | Outbound Adapter | `app`, `common`, `core` |
| `internal/<ctx>/app` | Use Case + Port | `domain`, `core` |
| `internal/<ctx>/domain` | Domain Model | `core` |
| `internal/common` | 공유 커널(web) | `core` |
| `internal/core` | Primitives | — (표준 라이브러리만) |
| `internal/platform` | 기술 토대 | 표준 라이브러리 + 드라이버 |

- 의존 금지: `domain → infra/primary`, `app → infra/primary`, `core → 서드파티`, `primary ↔ infra`.
- 강제 수단(depguard 규칙 예시)은 `ARCHITECTURE.md` §4.2. 새 컨텍스트를 추가하면 규칙 경로 패턴이 그 컨텍스트를 덮는지 확인한다.
- 한 컨텍스트의 4패키지(`domain`/`app`/`primary`/`infra`)는 **항상 한 묶음으로 추가·제거**한다.

## Port & Adapter (인터페이스는 소비자 쪽에)

- Go 관례: 인터페이스는 사용하는 쪽이 선언한다. 포트 인터페이스는 **`app` 패키지가 선언**하고, `infra`가 시그니처를 만족하는 구조체를 제공한다. `infra`는 `app`을 import해 인터페이스를 "구현 선언"할 필요가 없다(구조적 만족).
- 포트는 **애그리거트 기준**(`Save`·`FindByCode`)으로 정의하고 첫 인자는 항상 `ctx context.Context`.
- **인터페이스는 작게**(1~3 메서드). 거대한 단일 `Repository` 인터페이스는 테스트 대역 작성을 어렵게 한다.
- 새 외부 시스템 통합 = 새 포트 + 새 infra 어댑터. `app`/`domain`은 손대지 않는다(OCP).

```go
// internal/{{DOMAIN_EXAMPLE}}/app/port.go
package app

// {{DOMAIN_EXAMPLE}}Repository는 {{DOMAIN_EXAMPLE}} 애그리거트의 영속 포트다.
type {{DOMAIN_EXAMPLE}}Repository interface {
	Save(ctx context.Context, agg *domain.{{DOMAIN_EXAMPLE}}) error
	FindByCode(ctx context.Context, code domain.Code) (*domain.{{DOMAIN_EXAMPLE}}, error)
}

// TxManager는 유스케이스가 트랜잭션 경계를 소유하기 위한 포트다.
// 어댑터는 커밋하지 않는다 — 경계가 분산되면 부분 반영이 생긴다.
type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
```

## 패키지·네이밍 컨벤션

- 패키지명은 짧은 소문자 단수형(`user`, `billing`). 밑줄·대문자·복수형 금지. `util`·`common`·`helper` 같은 잡동사니 패키지를 만들지 않는다(`internal/common`은 공유 커널로 역할이 좁게 정의된 예외).
- 패키지명 반복 금지: `user.NewUser()`가 아니라 `user.New()`. 호출부에서 `user.New()`로 읽힌다.
- 파일명은 소문자 + 밑줄(`order_repository.go`). 한 파일에 한 주제.
- 인터페이스명: 단일 메서드는 `-er`(`Reader`·`Provisioner`), 역할형은 명사(`{{DOMAIN_EXAMPLE}}Repository`).
- 구현체는 역할이 드러나게: `postgres{{DOMAIN_EXAMPLE}}Repository`(비공개) + `NewPostgres{{DOMAIN_EXAMPLE}}Repository(...)` 생성자.
- **exported는 최소화**한다. 패키지 밖에서 쓰지 않는 타입·함수는 소문자로 둔다.
- 도메인 엔티티 필드는 **비공개 + 접근자**로 두어 외부 변조를 막는다(불변식 보호).
- DB 스캔 구조체(`infra`)와 도메인 엔티티는 **다른 타입**이며 매퍼가 변환한다. 스캔 구조체가 `infra` 밖으로 새지 않는다.
- 컨텍스트 간 직접 import 금지. 통합은 `internal/<ctx>/contract` 공개 계약 또는 도메인 이벤트 경유.

## 새 도메인/유스케이스 착수 워크플로

1. **컨텍스트 결정**: 기존 컨텍스트 안인지 새 바운디드 컨텍스트인지 먼저 답한다.
2. (신규 컨텍스트면) `internal/<ctx>/{domain,app,primary/http,infra}` 생성 → `.golangci.yml` depguard 규칙이 새 경로를 덮는지 확인.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `domain`: 엔티티/VO 테이블 주도 테스트 → 생성자에서 불변식 검증하는 모델 구현.
   2. `app`: 유스케이스 테스트(fake 포트) → 포트 인터페이스 선언 → 유스케이스 구현.
   3. `infra`: 통합 테스트(실제 DB)로 포트 구현 검증 → 리포지토리·매퍼 구현.
   4. `primary/http`: `httptest`로 핸들러 테스트 → 핸들러·DTO·라우팅 구현. **응답은 공통 envelope**.
   5. `cmd`: 조립·smoke 테스트.
4. **검증**: `bash scripts/verify.sh`(fmt·vet·lint·race 테스트·커버리지) 통과 + `api/` OpenAPI 스펙 동기화.
5. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (린터의 보완)

depguard가 **import 방향**을 막는다. 그러나 못 잡는 규율이 있다: 핸들러가 도메인 엔티티를 직접 반환, 어댑터의 커밋 호출, 네이밍 규약 등.
이런 것은 `internal/architecture_test.go` 같은 테스트로 강제한다(게이트가 자동 실행).

```go
package architecture_test

// TestInfra어댑터는커밋하지않는다는 트랜잭션 경계가 유스케이스에 있어야 함을 강제한다.
// 어댑터가 커밋하면 여러 어댑터 호출 사이에서 부분 반영이 생긴다.
func TestInfra어댑터는커밋하지않는다(t *testing.T) {
	t.Parallel()
	matches, err := filepath.Glob("*/infra/**/*.go")
	if err != nil {
		t.Fatalf("glob 실패: %v", err)
	}
	for _, path := range matches {
		src, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("파일 읽기 실패 %s: %v", path, err)
		}
		if bytes.Contains(src, []byte(".Commit(")) {
			t.Errorf("%s: 어댑터에서 Commit 호출 — 경계는 app 유스케이스에 둔다", path)
		}
	}
}
```

> 규칙은 프로젝트에 맞게 늘린다. 핵심은 위반을 `scripts/verify.sh`에서 실패로 만드는 것(리뷰가 아니라 게이트).

## 새 기능 착수 규칙

1. 새 기능은 위 패키지 경계 안에서 구현한다. 경계를 넘는 책임을 한 패키지에 몰지 않는다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `api/`의 OpenAPI 스펙과 `.agents/docs/`를 함께 갱신한다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
