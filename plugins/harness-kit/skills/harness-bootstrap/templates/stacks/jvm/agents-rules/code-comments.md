<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 주석 작성 가이드

> 대원칙: 코드는 라인 단위의 What/How를, 주석은 Why를 말한다.
> 단, 함수·메서드 단위 주석은 개발자가 로직을 빠르게 이해하도록 ① 함수의 책임(무엇을 하는 함수인지) + ② 처리 흐름(주요 단계 순서)을 함께 적는다. 흐름의 각 단계에는 "왜/무엇을 위해"가 드러나게 적어, 코드 라인을 그대로 옮긴 번역투가 되지 않게 한다.

이 문서가 주석 표준의 원본이다. steering·진입 파일은 요약과 포인터만 둔다.

## 함수·메서드 주석 표준 (필수 구조)

"로직을 담은" 공개 메서드/유스케이스/도메인 함수에는 다음을 적는다.

1. **책임 요약(한 줄)**: 이 함수가 무엇을 하는지. 고수준 의도이지 라인별 받아쓰기가 아니다.
2. **Why(필요 시)**: 코드만으로 알 수 없는 배경·제약·트레이드오프(트랜잭션 경계 이유·멱등성·보안 가드 등).
3. **처리 흐름(`처리 흐름:`)**: 주요 단계를 순서대로. 각 단계는 "무엇을 — 왜/무엇을 위해" 형태로 의도를 곁들이고, 분기·예외 전이 같은 갈림길을 드러낸다.

> 흐름은 "코드 받아쓰기"가 아니라 "로직 지도"다. 단순 getter/단일 위임·자명한 1~2줄 함수는 흐름을 생략하고 책임 한 줄만 둔다.

**적용 대상(must)**: 애그리거트·엔티티의 상태 전이·불변식 메서드와 팩토리(`create`/`issue`/`reconstitute`), 오케스트레이션 계층의 유스케이스/서비스(권한 게이트·트랜잭션 경계·순서·fail-closed), 도메인 서비스의 정책/판정 근거, 아웃바운드 어댑터의 비자명 동작(통제 조회·캐스트·트랜잭션 경계·외부 호출).
**제외**: 단순 getter/위임/매퍼 1줄 함수, 자명한 표현식 바디.

## 0. 공통 원칙

- 번역투 금지: 시그니처를 그대로 옮긴 주석(`// id를 받아 사용자를 반환한다`)은 가치가 없다. 삭제한다.
- Why를 남긴다: "왜 이 방식인가", "왜 이 값인가", "어떤 함정이 있는가"를 적는다.
- **함수 단위는 책임 + 처리 흐름**: 로직 함수는 책임 한 줄과 처리 흐름(의도를 곁들인 단계)을 적어 이해를 돕는다.
- 죽은 주석을 남기지 않는다: 코드가 바뀌면 주석도 바꾼다(드리프트 금지). 거짓 주석은 없는 주석보다 나쁘다.
- 흐름은 받아쓰기가 아니다: 단계에 의도가 없으면 코드 번역일 뿐이다. 의도를 못 적겠는 단계는 자명하므로 생략한다.
- 주석으로 코드 냄새를 덮지 않는다: 흐름이 7~8단계로 길면 함수를 분리해 단계가 코드로 드러나게 한다.
- **TODO/FIXME**: 근거와 추적 링크를 남긴다. 맥락 없는 `// TODO: 임시` 금지.
- 한국어로 작성한다(언어 규약). 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다.

```text
Bad : // name을 trim해서 반환한다
Good: // 사용자 입력 앞뒤 공백은 흔한 실수라 저장 전 흡수한다(검색 키 일관성)
```

## 1. Kotlin (KDoc)

KDoc(`/** */`, 마크다운)을 쓴다. 공개 타입/함수는 한 줄 책임 요약 + 비자명한 결정만.
`@param`/`@return`은 타입이 못 담는 의미가 있을 때만. `@throws`는 호출자가 분기해야 하는 도메인 예외만.
Spring 어노테이션은 "왜 붙였는가"(경계 이유)를 적는다.

```kotlin
// Bad — 어노테이션과 코드를 받아쓴 주석
/**
 * {{DOMAIN_EXAMPLE}}를 생성한다.
 * @param command 생성 커맨드
 * @return 생성된 {{DOMAIN_EXAMPLE}}
 */
@Transactional // 트랜잭션을 연다
fun create(command: Create{{DOMAIN_EXAMPLE}}Command) = repository.save({{DOMAIN_EXAMPLE}}.create(command))

// Good — 경계·불변식·Why + 처리 흐름
/**
 * {{DOMAIN_EXAMPLE}}를 생성하고 요청자를 소유자로 기록한다.
 *
 * slug 는 미삭제 기준 전역 유일이어야 한다(소프트 삭제된 slug 는 재사용 허용).
 *
 * 처리 흐름:
 * 1. 권한 게이트 — 요청자가 이 리소스를 만들 수 있는지 유스케이스 진입에서 재확인(경계 검사와 이중 방어).
 * 2. slug 중복 검사 — 활성 리소스 간 유일성 보장(중복 시 409).
 * 3. 애그리거트 생성·저장 — 요청자를 소유자로 기록(도메인 불변식).
 * 4. audit 기록 — 관리 행위 추적.
 */
@Transactional
override fun create(command: Create{{DOMAIN_EXAMPLE}}Command): {{DOMAIN_EXAMPLE}} { ... }
```

## 2. Java (Javadoc)

Javadoc(`/** */`)을 쓴다. 규칙은 KDoc과 동일 — 책임 한 줄 + Why + `처리 흐름:`.
`@param`/`@return`/`@throws`는 **타입/시그니처가 못 담는 의미**가 있을 때만. 프레임워크 어노테이션은 "왜 붙였는가"를 적는다.

```java
// Bad — 시그니처를 옮긴 번역투
/**
 * 결제한다.
 * @param userId 사용자 ID
 * @param amountMinor 금액
 * @return 성공 여부
 */
public boolean charge(long userId, long amountMinor) { ... }

// Good — 계약·제약·Why + 처리 흐름
/**
 * 결제를 시도하고 성공 여부를 반환한다.
 *
 * <p>amountMinor 는 통화 최소 단위(원/센트)다. 부동소수 오차를 피하려 정수로만 다룬다.
 * PG 타임아웃은 실패로 간주한다(중복 청구 방지 재시도는 호출자가 멱등 키로 제어).
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>금액 사전 검증 — 0 이하는 PG 가 거부하므로 왕복 전에 차단.</li>
 *   <li>PG 청구 요청 — 타임아웃/거절은 false 로 흡수.</li>
 * </ol>
 *
 * @param amountMinor 통화 최소 단위(원/센트). 0 이하는 즉시 실패.
 */
public boolean charge(long userId, long amountMinor) { ... }
```

## 3. SQL

복잡한 Join/Subquery·옵티마이저 힌트는 **비즈니스 의도와 제약**을 남긴다(카디널리티 가정, 힌트 근거와 제거 조건).
Native SQL·쿼리 빌더 fragment는 실제 코드와 같은 책임 경계(adapter vs repository)를 반영하고, multiline은 오와 열을 정렬한다.

```sql
-- Bad — 구문을 한국어로 옮긴 주석
-- orders와 users를 조인한다
select o.id, u.name from orders o join users u on u.id = o.user_id where o.status = 'PAID';

-- Good — 의도·가정
-- 정산 대상은 결제 완료 주문뿐. users는 1:1 보장(FK)이라 inner join으로 누락을 의도적으로 배제.
select o.id, u.name
from   orders o
join   users  u on u.id = o.user_id
where  o.status = 'PAID';

-- 옵티마이저가 status 인덱스를 무시하고 풀스캔을 타서 강제한다(통계 편향: PAID가 99%).
-- 주의: 미결제 비중이 늘면 이 힌트가 역효과이므로 분포 변화 시 재검토할 것.
select /*+ index(o ix_orders_status) */ o.id
from   orders o
where  o.status = 'PENDING';
```

## 4. 리뷰 체크리스트

- 함수의 **책임 한 줄**이 있는가? → 없으면 추가(무엇을 하는 함수인지).
- 로직 함수에 **처리 흐름**(의도를 곁들인 단계)이 있는가?
- 흐름 단계에 **의도("왜/무엇을 위해")**가 있는가? (번역투면 보강하거나 자명한 단계 삭제)
- 타입/시그니처가 이미 말하는 것을 `@param`/`@return`으로 반복하는가? → 제거.
- 흐름이 너무 길어(7~8단계+) 함수가 비대한가? → 분리.
- 어노테이션(`@Transactional` 등)/옵티마이저 힌트에 근거가 있는가? → 없으면 추가.
- 코드가 바뀌었는데 주석이 옛 로직을 말하는가? → 동기화(드리프트 제거).
