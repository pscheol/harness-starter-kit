<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 주석 작성 가이드

> 기본값은 **주석 없음**이다. 코드가 스스로 말하게 두고, 코드로 말할 수 없는 것만 주석으로 적는다.
> 문장을 어떻게 쓸지는 [`writing-style.md`](./writing-style.md)가 정한다. 이 파일은 **어디에 얼마나** 쓸지를 정한다.

이 문서가 주석 표준의 원본이다. steering·진입 파일은 요약과 포인터만 둔다.

## 주석을 다는 경우 (이 넷뿐)

1. **Why** — 코드만 봐선 알 수 없는 결정·제약·트레이드오프. "왜 이 방식", "왜 이 값".
2. **함정** — 순진하게 고치면 깨지는 지점. 순서 의존, 부분 반영, 멱등성, 동시성.
3. **외부 근거** — 스펙·규격·장애 이력·티켓처럼 코드 밖에 있는 사실.
4. **억제 이유** — `@Suppress`·`@SuppressWarnings`를 붙였다면 왜 안전한지. 이유 없는 억제는 리뷰에서 막는다.

여기에 안 걸리면 쓰지 않는다. 특히 **CRUD·getter·위임·매퍼·DTO·설정 클래스에는 주석을 달지 않는다.**

## 주석을 달지 않는 것

- 시그니처 받아쓰기: `// id로 사용자를 조회한다` (이름이 `findUserById`인데).
- 타입이 이미 말하는 `@param`/`@return`. 타입이 못 담는 의미(단위·범위·null 의미)가 있을 때만 남긴다.
- 규칙 문서로 보내는 참조 주석: `// 자세한 내용은 .agents/rules/security.md 참고`. 규칙은 규칙 파일이 소유한다.
- 구획 나누기 주석(`// ===== 서비스 메서드 =====`), 변경 이력(`// 2026-03-02 수정`). git이 한다.
- 자명한 코드에 붙인 한국어 해설. 지워도 이해에 지장이 없으면 지운다.

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
평범한 유스케이스 하나에 저장·조회만 있으면 흐름을 쓰지 않는다.

```kotlin
// ✗ 흐름을 쓸 자리가 아니다 — 코드를 그대로 옮겼을 뿐
/**
 * {{DOMAIN_EXAMPLE}}를 생성한다.
 *
 * 처리 흐름:
 * 1. 커맨드를 검증한다.
 * 2. 애그리거트를 만든다.
 * 3. 저장하고 반환한다.
 */
@Transactional
override fun create(command: Create{{DOMAIN_EXAMPLE}}Command) = repository.save({{DOMAIN_EXAMPLE}}.create(command))
```

```kotlin
// ✓ Why 한두 줄이면 충분한 대부분의 경우
/**
 * slug는 미삭제 기준으로만 유일하다. 소프트 삭제된 slug는 다시 쓸 수 있다.
 */
@Transactional
override fun create(command: Create{{DOMAIN_EXAMPLE}}Command): {{DOMAIN_EXAMPLE}} { ... }
```

```kotlin
// ✓ 흐름을 쓸 만한 드문 경우 — 순서가 곧 정합성이다
/**
 * 주문을 확정하고 재고를 차감한다.
 *
 * 처리 흐름:
 * 1. 재고 선점 — 결제보다 먼저. 뒤집으면 결제만 되고 재고가 없는 주문이 남는다.
 * 2. 결제 승인 — PG 타임아웃은 실패로 본다.
 * 3. 실패 시 선점 해제 — 보상 트랜잭션. 여기서 예외를 삼키면 재고가 영구히 잠긴다.
 */
@Transactional
fun confirm(orderId: OrderId): Order { ... }
```

## Kotlin · Java

- KDoc/Javadoc(`/** */`)은 **공개 타입과 비자명한 공개 함수**에만. 내부 구현·private에는 필요할 때만 한 줄 주석.
- `@throws`는 호출자가 분기해야 하는 도메인 예외만 적는다.
- Spring 어노테이션은 경계 이유가 비자명할 때만: `@Transactional // 재고 차감과 이력이 한 단위여야 한다`. 관습적인 자리에는 붙이지 않는다.
- 도메인 불변식은 코드(`require`/`init`)로 강제하고, **왜 그 불변식인지**만 주석으로 남긴다.

```kotlin
@JvmInline
value class Money private constructor(val amountMinor: Long) {
    // 정산 불일치를 원천 차단하려고 최소 단위(원·센트) 정수만 쓴다. 부동소수는 반올림에서 어긋난다.
}
```

## 설정 파일 (yml · properties · Gradle)

**기본은 무주석**이다. 키 이름이 이미 설명한다.

- 값의 **근거**가 있을 때만 한 줄: 왜 이 숫자인지, 어디서 나온 제한인지.
- 기본값과 다르게 튜닝했거나, 바꾸면 장애가 나는 값에만 남긴다.

```yaml
# ✗
server:
  port: 8080          # 서버 포트
spring:
  datasource:
    url: ...          # 데이터소스 URL

# ✓
spring:
  datasource:
    hikari:
      maximum-pool-size: 20   # DB max_connections(100) / 인스턴스 5대 기준
```

## SQL · 쿼리

한두 줄이면 충분하다. **왜 이 형태인지**만 적고 구문 설명은 하지 않는다.

```sql
-- ✗ 구문을 한국어로 옮긴 주석
-- orders와 users를 조인한다
select o.id, u.name from orders o join users u on u.id = o.user_id where o.status = 'PAID';

-- ✓ 의도와 가정
-- 정산 대상은 결제 완료 주문뿐. users는 FK로 1:1이라 inner join으로 누락을 의도적으로 배제.
select o.id, u.name
from   orders o
join   users  u on u.id = o.user_id
where  o.status = 'PAID';

-- ✓ 힌트는 근거와 철회 조건을 함께
-- PAID가 99%라 옵티마이저가 풀스캔으로 기운다. 미결제 비중이 늘면 이 힌트는 역효과다.
select /*+ index(o ix_orders_status) */ o.id from orders o where o.status = 'PENDING';
```

## TODO · FIXME

근거와 추적 링크를 남긴다. `// TODO: 임시` 처럼 맥락 없는 것은 금지.

```kotlin
// TODO(#312): 정산 배치가 단건 API를 N번 부른다. 벌크 엔드포인트 나오면 교체.
```

## 리뷰 체크리스트

- 이 주석이 없으면 무엇을 못 알아보는가 → 답이 없으면 삭제.
- 코드를 한국어로 옮긴 문장인가 → 삭제.
- 흐름 주석이 예외 조건(순서=정합성, 5단계 이내)을 충족하는가 → 아니면 삭제하거나 함수를 쪼갠다.
- 설정·쿼리 주석이 값의 근거를 말하는가, 키 이름을 반복하는가.
- 규칙 문서로 보내는 참조 주석이 남아 있는가 → 삭제.
- 코드가 바뀌었는데 주석이 옛 로직을 말하는가 → 고치거나 지운다. 거짓 주석은 없는 것보다 나쁘다.
