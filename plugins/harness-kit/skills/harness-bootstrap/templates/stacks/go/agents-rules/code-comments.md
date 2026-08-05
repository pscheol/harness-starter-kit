<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 주석 작성 가이드 (Go)

> 기본값은 **주석 없음**이다. exported 식별자의 doc comment만 관례로 챙기고, 나머지는 코드로 말할 수 없는 것만 적는다.
> 문장을 어떻게 쓸지는 [`writing-style.md`](./writing-style.md)가 정한다. 이 파일은 **어디에 얼마나** 쓸지를 정한다.

이 문서가 주석 표준의 원본이다. steering·진입 파일은 요약과 포인터만 둔다.

## godoc 규약 (지켜야 하는 형식)

1. doc comment는 선언 바로 위에 `//`로 쓴다. 블록 주석(`/* */`)은 쓰지 않는다.
2. 선언 이름으로 시작한다: `// CreateOrder는 …`, `// ErrNotFound는 …`. 한국어로 써도 이름 + 조사로 연다.
3. 패키지 주석은 `// Package <name> …` 으로 시작하고 패키지당 한 곳(`doc.go` 또는 대표 파일)에만 둔다.
4. `//` 뒤에 공백 하나. 들여쓴 줄은 godoc에서 코드 블록이 되므로 의도할 때만 쓴다.
5. 폐기 예정은 마지막 문단에 `// Deprecated: <대체 방법>` 으로 적는다(도구가 인식한다).

exported 식별자에는 **한 줄** doc comment를 단다. 그 한 줄로 충분하면 거기서 멈춘다.

## 주석을 더 다는 경우 (이 넷뿐)

1. **Why** — 코드만 봐선 알 수 없는 결정·제약·트레이드오프. "왜 이 방식", "왜 이 값".
2. **함정** — 순진하게 고치면 깨지는 지점. 순서 의존, 부분 커밋, 멱등성, 고루틴 소유권.
3. **외부 근거** — 스펙·규격·장애 이력·티켓처럼 코드 밖에 있는 사실.
4. **억제 이유** — `//nolint:<linter>` 를 붙였다면 왜 안전한지. 이유 없는 억제는 리뷰에서 막는다.

여기에 안 걸리면 쓰지 않는다. 특히 **CRUD·접근자·위임·매퍼·DTO·설정 구조체에는 설명 주석을 달지 않는다.**

## 주석을 달지 않는 것

- 시그니처 받아쓰기: `// FindByID는 ID로 찾아서 반환한다`.
- 인자·반환 타입 나열. 타입이 못 담는 의미(단위·범위·소유권·nil 의미)만 남긴다.
- 규칙 문서로 보내는 참조 주석: `// 자세한 내용은 .agents/rules/security.md 참고`. 규칙은 규칙 파일이 소유한다.
- 구획 나누기 주석(`// ===== 핸들러 =====`), 변경 이력(`// 2026-03-02 수정`). git이 한다.
- `context.Context` 인자 설명(관례상 불필요). 단 **취소 시 부분 처리 여부**는 적는다.

```text
✗ // name을 trim해서 반환한다
✓ // 검색 키 일관성 때문에 저장 전에 앞뒤 공백을 흡수한다
```

## 처리 흐름 주석은 예외다

단계별 흐름(`처리 흐름: 1. … 2. …`)은 **기본이 아니라 예외**다. 아래를 **모두** 만족할 때만 쓴다.

- 조건 분기나 외부 연동이 얽혀 있고,
- 단계 **순서를 바꾸면 버그가 나며**(권한 → 검증 → 저장 → 보상),
- 그 이유가 코드 어디에도 안 적혀 있다.

쓸 때도 **5단계 이내**로, 각 단계는 "무엇을 — 왜"로 한 줄. 여섯 단계가 필요하면 주석이 아니라 함수를 쪼갠다.
저장·조회만 하는 평범한 유스케이스에는 흐름을 쓰지 않는다.

```go
// ✗ 흐름을 쓸 자리가 아니다 — 코드를 그대로 옮겼을 뿐
// Create는 {{DOMAIN_EXAMPLE}}를 생성한다.
//
// 처리 흐름:
//  1. 커맨드를 검증한다.
//  2. 도메인 객체를 만든다.
//  3. 저장하고 반환한다.
func (s *Service) Create(ctx context.Context, cmd Create{{DOMAIN_EXAMPLE}}Command) (*domain.{{DOMAIN_EXAMPLE}}, error)
```

```go
// ✓ Why 한두 줄이면 충분한 대부분의 경우
// Create는 {{DOMAIN_EXAMPLE}}를 생성하고 요청자를 소유자로 기록한다.
//
// slug는 미삭제 기준으로만 유일하다. 소프트 삭제된 slug는 다시 쓸 수 있다.
func (s *Service) Create(ctx context.Context, cmd Create{{DOMAIN_EXAMPLE}}Command) (*domain.{{DOMAIN_EXAMPLE}}, error)
```

```go
// ✓ 흐름을 쓸 만한 드문 경우 — 순서가 곧 정합성이다
// Confirm은 주문을 확정하고 재고를 차감한다.
//
// 처리 흐름:
//  1. 재고 선점 — 결제보다 먼저. 뒤집으면 결제만 되고 재고가 없는 주문이 남는다.
//  2. 결제 승인 — PG 타임아웃은 실패로 본다.
//  3. 실패 시 선점 해제 — 보상 처리. 여기서 에러를 삼키면 재고가 영구히 잠긴다.
func (s *Service) Confirm(ctx context.Context, id domain.OrderID) (*domain.Order, error)
```

## 도메인 타입 · sentinel 에러

- 불변식은 생성자(`New…`)에서 강제하고, **왜 그 불변식인지**만 주석으로 남긴다.
- sentinel 에러에는 **호출자가 어떻게 분기하는지**를 적는다.
- 에러 문자열은 주석이 아니다. 소문자로 시작하고 마침표를 붙이지 않는다(래핑 시 문장이 이어진다).

```go
// Money는 통화 최소 단위(원·센트) 정수 금액이다.
//
// 정산 불일치를 원천 차단하려고 float를 쓰지 않는다.
type Money struct {
	amountMinor int64
	currency    Currency
}

// ErrNotFound는 요청한 리소스가 없음을 뜻한다.
// 호출자는 errors.Is로 판별해 404로 매핑한다.
var ErrNotFound = errors.New("not found")
```

## 동시성

고루틴은 **소유자와 종료 조건**이 코드에 안 드러난다. 그 부분만 적는다.

```go
// StartOutboxWorker는 outbox 이벤트를 주기적으로 발행하는 워커를 띄운다.
//
// 고루틴 소유자는 호출자다. ctx 취소로 종료하며, 반환된 채널이 닫히면 정리가 끝난 것이다.
// 발행 실패는 재시도 대상이라 로그만 남기고 루프를 유지한다.
func StartOutboxWorker(ctx context.Context, ...) <-chan struct{}
```

뮤텍스가 보호하는 대상은 필드 주석으로 명시한다: `mu sync.Mutex // 아래 cache를 보호한다`.

## 설정 파일 (yml · env 예시)

**기본은 무주석**이다. 키 이름이 이미 설명한다.

- 값의 **근거**가 있을 때만 한 줄: 왜 이 숫자인지, 어디서 나온 제한인지.
- 기본값과 다르게 튜닝했거나, 바꾸면 장애가 나는 값에만 남긴다.

```yaml
# ✗
server:
  port: 8080        # 서버 포트
  timeout: 30s      # 타임아웃

# ✓
database:
  max_open_conns: 20   # DB max_connections(100) / 인스턴스 5대 기준
```

## SQL · 쿼리

한두 줄이면 충분하다. **왜 이 형태인지**만 적고 구문 설명은 하지 않는다.

```go
// ✗ 구문을 한국어로 옮긴 주석
// orders와 users를 조인한다
const q = `select o.id, u.name from orders o join users u on u.id = o.user_id`

// ✓ 의도와 성능 근거
// 정산 대상은 결제 완료 주문뿐. users는 FK로 1:1이라 inner join으로 누락을 의도적으로 배제.
const selectSettlementTargets = `
select o.id, u.name
from   orders o
join   users  u on u.id = o.user_id
where  o.status = $1`
```

파라미터 바인딩(`$1`·`?`)만 쓴다. 문자열 결합으로 쿼리를 만들지 않는다(주석으로 정당화할 수 없다).

## 패키지 주석

패키지의 **책임과 경계**를 한 문단으로. 파일 목록·변경 이력은 넣지 않는다.
공유 패키지(`internal/common`·`internal/core`)는 "무엇을 넣고 무엇을 넣지 않는가"를 한 줄 덧붙인다.

```go
// Package common은 HTTP 경계에서 공유하는 응답 envelope·에러 코드·미들웨어를 제공한다.
//
// 도메인 규칙은 두지 않는다. 비즈니스 판단이 들어오면 컨텍스트 간 결합이 생긴다.
package common
```

## TODO · FIXME

근거와 추적 링크를 남긴다. `// TODO: 임시` 처럼 맥락 없는 것은 금지.

```go
// TODO(#312): 정산 배치가 단건 API를 N번 부른다. 벌크 엔드포인트 나오면 교체.
```

## 리뷰 체크리스트

- exported 식별자에 doc comment가 있고 **이름으로 시작**하는가.
- 이 주석이 없으면 무엇을 못 알아보는가 → 답이 없으면 삭제.
- 흐름 주석이 예외 조건(순서=정합성, 5단계 이내)을 충족하는가 → 아니면 삭제하거나 함수를 쪼갠다.
- 설정·쿼리 주석이 값의 근거를 말하는가, 키 이름을 반복하는가.
- 고루틴을 띄우는 함수에 소유권·종료 조건이 적혀 있는가.
- `//nolint`·원시 SQL·타임아웃 값에 이유가 붙어 있는가.
- 코드가 바뀌었는데 주석이 옛 로직을 말하는가 → 고치거나 지운다. 거짓 주석은 없는 것보다 나쁘다.
