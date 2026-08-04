<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 주석 작성 가이드 (Python · 실무 밀착형)

> 대원칙: 코드는 라인 단위의 What/How를, 주석은 Why를 말한다.
> 단, 함수·메서드 단위 주석(docstring)은 개발자가 로직을 빠르게 이해하도록 ① 함수의 책임(무엇을 하는 함수인지) + ② 처리 흐름(주요 단계 순서)을 함께 적는다. 흐름의 각 단계에는 "왜/무엇을 위해"가 드러나게 적어, 코드 라인을 그대로 옮긴 번역투가 되지 않게 한다.

이 문서가 주석 표준의 원본이다. steering·진입 파일은 요약과 포인터만 둔다.
Python 고유 원칙: 타입 힌트가 계약을 담는다. docstring은 타입이 못 담는 것(의미·단위·부작용·실패 조건)을 적는다.

## 함수·메서드 docstring 표준 (필수 구조)

"로직을 담은" 공개 함수/유스케이스/도메인 메서드에는 다음을 적는다.

1. **책임 요약(한 줄)**: 이 함수가 무엇을 하는지. 고수준 의도이지 라인별 받아쓰기가 아니다. PEP 257대로 첫 줄은 명령형 한 문장.
2. **Why(필요 시)**: 코드만으로 알 수 없는 배경·제약·트레이드오프(트랜잭션 경계 이유·멱등성·보안 가드·async 선택 이유).
3. **처리 흐름(`처리 흐름:`)**: 주요 단계를 순서대로. 각 단계는 "무엇을 — 왜/무엇을 위해" 형태로 의도를 곁들이고, 분기·예외 전이 같은 갈림길을 드러낸다.

> 흐름은 "코드 받아쓰기"가 아니라 "로직 지도"다. 단순 프로퍼티/단일 위임·자명한 1~2줄 함수는 흐름을 생략하고 책임 한 줄만 둔다.

**적용 대상(must)**: 도메인 타입의 상태 전이·불변식 메서드와 팩토리(`create`/`issue`/`reconstitute`), 오케스트레이션 계층 함수(UseCase·서비스 — 권한 게이트·트랜잭션 경계·순서·fail-closed), 정책/판정 근거를 담은 함수, 아웃바운드 어댑터·데이터 접근 계층의 비자명 동작(트랜잭션 경계·재시도·외부 호출·매핑 규칙).
**제외**: `@property` 단순 반환, 한 줄 위임, 매퍼의 필드 대응만 하는 함수, 자명한 표현식.

## 0. 공통 원칙

- 번역투 금지: 시그니처를 그대로 옮긴 주석(`"""id로 사용자를 조회해 반환한다."""` — 이름이 `find_user_by_id`인데)은 가치가 없다. 삭제한다.
- 타입을 되풀이하지 않는다: `Args: user_id (int): 사용자 ID` 같은 항목은 시그니처가 이미 말한다. **타입이 못 담는 의미**(단위, 허용 범위, 시간대, 소유 스코프)가 있을 때만 적는다.
- Why를 남긴다: "왜 이 방식인가", "왜 이 값인가", "어떤 함정이 있는가".
- 죽은 주석을 남기지 않는다: 코드가 바뀌면 docstring도 바꾼다. 거짓 주석은 없는 주석보다 나쁘다.
- 주석으로 코드 냄새를 덮지 않는다: 흐름이 7~8단계로 길면 함수를 분리해 단계가 코드로 드러나게 한다.
- `# type: ignore`·`# noqa` 에는 반드시 이유를 적는다: `# type: ignore[arg-type]  # 서드파티 스텁이 Optional 을 누락(이슈 #123)`. 코드만 남은 억제는 금지.
- **TODO/FIXME**: 근거와 추적 링크를 남긴다. 맥락 없는 `# TODO: 임시` 금지.
- 한국어로 작성한다(언어 규약). 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다.
- docstring은 `"""..."""`(큰따옴표 3개). 한 줄이면 한 줄로 닫고, 여러 줄이면 요약 줄 다음에 빈 줄을 둔다(PEP 257).

```text
Bad : # name 을 strip 해서 반환한다
Good: # 사용자 입력 앞뒤 공백은 흔한 실수라 저장 전 흡수한다(검색 키 일관성)
```

## 1. UseCase / Application Service

트랜잭션 경계·권한 게이트·순서 의존이 모이는 자리다. 흐름을 반드시 적는다.

```python
# Bad — 시그니처를 옮긴 번역투 + 타입 반복
async def create(self, command: Create{{DOMAIN_EXAMPLE}}Command) -> {{DOMAIN_EXAMPLE}}:
    """{{DOMAIN_EXAMPLE}} 를 생성한다.

    Args:
        command (Create{{DOMAIN_EXAMPLE}}Command): 생성 커맨드
    Returns:
        {{DOMAIN_EXAMPLE}}: 생성된 {{DOMAIN_EXAMPLE}}
    """
```

```python
# Good — 경계·불변식·Why + 처리 흐름
async def create(self, command: Create{{DOMAIN_EXAMPLE}}Command) -> {{DOMAIN_EXAMPLE}}:
    """{{DOMAIN_EXAMPLE}} 를 생성하고 요청자를 소유자로 기록한다.

    slug 는 미삭제 기준 전역 유일이어야 한다(소프트 삭제된 slug 는 재사용 허용).
    커밋은 이 메서드가 소유한다 — 어댑터가 커밋하면 부분 반영이 생긴다.

    처리 흐름:
    1. 권한 게이트 — 요청자가 이 리소스를 만들 수 있는지 유스케이스 진입에서 재확인(경계 검사와 이중 방어).
    2. slug 중복 검사 — 활성 리소스 간 유일성 보장(중복이면 ConflictError → 409).
    3. 애그리거트 생성·저장 — 요청자를 소유자로 기록(도메인 불변식).
    4. audit 기록 — 관리 행위 추적. 실패해도 본 트랜잭션은 롤백하지 않는다(중요도 차등).
    """
```

## 2. 도메인 모델 (dataclass · VO · 애그리거트)

- 불변식은 코드(`__post_init__`)로 강제하고, **왜 그 불변식인지**를 주석으로 남긴다.
- VO는 클래스 docstring 한 줄 + 제약 근거. getter/`__str__` 같은 자명한 메서드는 주석 없이 둔다.

```python
@dataclass(frozen=True, slots=True)
class Money:
    """통화 최소 단위(원/센트) 정수 금액.

    부동소수 오차로 정산 불일치가 나는 것을 원천 차단하려고 float 를 쓰지 않는다.
    """
    amount_minor: int
    currency: Currency

    def __post_init__(self) -> None:
        if self.amount_minor < 0:
            # 음수 금액은 환불 도메인이 따로 다룬다(여기서 허용하면 부호 규칙이 두 곳으로 갈라진다).
            raise ValueError("amount_minor 는 0 이상이어야 한다")
```

## 3. async 코드

async 는 "왜 여기서 await 하는가", "왜 이 작업만 스레드로 미는가"가 코드에 드러나지 않는다. 그 부분을 적는다.

```python
async def fetch_stock(self, item_code: str) -> Stock:
    """외부 재고 API 에서 품목 재고를 조회한다.

    응답이 느려도 요청 스레드를 잡지 않도록 async 클라이언트를 쓰고,
    3초 안에 답이 없으면 실패로 간주한다(핫패스라 지연이 곧 전체 처리량 저하).

    처리 흐름:
    1. 타임아웃 컨텍스트 진입 — 외부 지연이 우리 SLA 를 잠식하지 않도록 상한을 건다.
    2. HTTP 호출 — 4xx 는 재시도하지 않고 도메인 오류로 전환(재시도해도 결과가 같다).
    3. 응답 파싱 — 경계에서 도메인 타입으로 좁힌다(안쪽은 dict 를 모른다).
    """
    async with asyncio.timeout(_STOCK_TIMEOUT_SECONDS):
        ...
```

- `# 이벤트 루프를 막지 않으려고 스레드로 민다(라이브러리가 동기 전용)` 처럼 **`to_thread` 사용 이유**를 반드시 남긴다.
- fire-and-forget 이 불가피하면 **소유자·실패 처리·취소 시점**을 주석으로 명시한다(원칙은 금지).

## 4. SQL / ORM 쿼리

복잡한 Join/Subquery·인덱스 힌트·로딩 전략은 **비즈니스 의도와 카디널리티 가정**을 남긴다.

```python
# Bad — 구문을 한국어로 옮긴 주석
# orders 와 users 를 조인한다
stmt = select(Order.id, User.name).join(User, User.id == Order.user_id)
```

```python
# Good — 의도·가정·성능 근거
# 정산 대상은 결제 완료 주문뿐. users 는 FK 로 1:1 보장이라 inner join 으로 누락을 의도적으로 배제.
# selectinload 로 명시적 eager 로딩 — lazy 는 async 세션에서 예외이고, 조용한 N+1 도 막는다.
stmt = (
    select(Order)
    .join(User, User.id == Order.user_id)
    .where(Order.status == OrderStatus.PAID)
    .options(selectinload(Order.items))
)
```

```sql
-- 원시 SQL 을 쓸 때(불가피한 경우): 왜 ORM 으로 안 되는지 + 파라미터 바인딩 명시
-- 옵티마이저가 status 인덱스를 무시하고 풀스캔을 타서 강제한다(통계 편향: PAID 가 99%).
-- 주의: 미결제 비중이 늘면 역효과이므로 분포 변화 시 재검토할 것.
select o.id
from   orders o
where  o.status = :status;
```

## 5. 모듈 docstring

- 모듈 상단 docstring은 **그 모듈의 책임 한 줄**. 파일 목록 나열·변경 이력 금지(git이 한다).
- `common`·`core`처럼 공유되는 모듈은 "여기에 무엇을 넣고 무엇을 넣지 않는가"를 한 줄 덧붙인다.

```python
"""주문 상태 전이 정책.

허용 전이를 정의하는 유일한 지점이다. 다른 곳에서 상태를 직접 바꾸면
전이 규칙이 두 곳으로 갈라지므로 금지한다.
"""
```

## 6. 리뷰 체크리스트

- 함수의 **책임 한 줄**이 있는가? → 없으면 추가(무엇을 하는 함수인지).
- 로직 함수에 **처리 흐름**(의도를 곁들인 단계)이 있는가?
- 흐름 단계에 **의도("왜/무엇을 위해")**가 있는가? (번역투면 보강하거나 자명한 단계 삭제)
- 타입 힌트가 이미 말하는 것을 `Args:`/`Returns:`로 반복하는가? → 제거.
- 흐름이 너무 길어(7~8단계+) 함수가 비대한가? → 분리.
- `# type: ignore`/`# noqa`/`to_thread`/원시 SQL 에 근거가 있는가? → 없으면 추가.
- 코드가 바뀌었는데 docstring이 옛 로직을 말하는가? → 동기화(드리프트 제거).
