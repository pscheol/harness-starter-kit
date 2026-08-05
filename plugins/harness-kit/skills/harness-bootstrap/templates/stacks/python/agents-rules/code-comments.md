<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 주석 작성 가이드 (Python)

> 기본값은 **주석 없음**이다. 타입 힌트와 이름이 대부분을 설명한다. docstring은 타입이 못 담는 것만 적는다.
> 문장을 어떻게 쓸지는 [`writing-style.md`](./writing-style.md)가 정한다. 이 파일은 **어디에 얼마나** 쓸지를 정한다.

이 문서가 주석 표준의 원본이다. steering·진입 파일은 요약과 포인터만 둔다.

## 주석을 다는 경우 (이 넷뿐)

1. **Why** — 코드만 봐선 알 수 없는 결정·제약·트레이드오프. "왜 이 방식", "왜 이 값".
2. **함정** — 순진하게 고치면 깨지는 지점. 순서 의존, 부분 커밋, 멱등성, 이벤트 루프 블로킹.
3. **외부 근거** — 스펙·규격·장애 이력·티켓처럼 코드 밖에 있는 사실.
4. **억제 이유** — `# type: ignore`·`# noqa`를 붙였다면 왜 안전한지. 이유 없는 억제는 리뷰에서 막는다.

여기에 안 걸리면 쓰지 않는다. 특히 **CRUD·`@property`·위임·매퍼·Pydantic 스키마·설정 모듈에는 주석을 달지 않는다.**

## 주석을 달지 않는 것

- 시그니처 받아쓰기: `"""id로 사용자를 조회한다."""` (이름이 `find_user_by_id`인데).
- 타입 힌트를 되풀이하는 `Args:`/`Returns:` 블록. 타입이 못 담는 의미(단위·허용 범위·시간대·소유 스코프)만 남긴다.
- 규칙 문서로 보내는 참조 주석: `# 자세한 내용은 .agents/rules/security.md 참고`. 규칙은 규칙 파일이 소유한다.
- 구획 나누기 주석(`# ===== 서비스 =====`), 변경 이력(`# 2026-03-02 수정`). git이 한다.
- 자명한 코드에 붙인 한국어 해설. 지워도 이해에 지장이 없으면 지운다.

```text
✗ # name을 strip해서 반환한다
✓ # 검색 키 일관성 때문에 저장 전에 앞뒤 공백을 흡수한다
```

## 처리 흐름 주석은 예외다

단계별 흐름(`처리 흐름: 1. … 2. …`)은 **기본이 아니라 예외**다. 아래를 **모두** 만족할 때만 쓴다.

- 조건 분기나 외부 연동이 얽혀 있고,
- 단계 **순서를 바꾸면 버그가 나며**(권한 → 검증 → 저장 → 보상),
- 그 이유가 코드 어디에도 안 적혀 있다.

쓸 때도 **5단계 이내**로, 각 단계는 "무엇을 — 왜"로 한 줄. 여섯 단계가 필요하면 주석이 아니라 함수를 쪼갠다.
저장·조회만 하는 평범한 유스케이스에는 흐름을 쓰지 않는다.

```python
# ✗ 흐름을 쓸 자리가 아니다 — 코드를 그대로 옮겼을 뿐
async def create(self, command: Create{{DOMAIN_EXAMPLE}}Command) -> {{DOMAIN_EXAMPLE}}:
    """{{DOMAIN_EXAMPLE}}를 생성한다.

    처리 흐름:
    1. 커맨드를 검증한다.
    2. 도메인 객체를 만든다.
    3. 저장하고 반환한다.
    """
```

```python
# ✓ Why 한두 줄이면 충분한 대부분의 경우
async def create(self, command: Create{{DOMAIN_EXAMPLE}}Command) -> {{DOMAIN_EXAMPLE}}:
    """slug는 미삭제 기준으로만 유일하다. 소프트 삭제된 slug는 다시 쓸 수 있다."""
```

```python
# ✓ 흐름을 쓸 만한 드문 경우 — 순서가 곧 정합성이다
async def confirm(self, order_id: OrderId) -> Order:
    """주문을 확정하고 재고를 차감한다.

    처리 흐름:
    1. 재고 선점 — 결제보다 먼저. 뒤집으면 결제만 되고 재고가 없는 주문이 남는다.
    2. 결제 승인 — PG 타임아웃은 실패로 본다.
    3. 실패 시 선점 해제 — 보상 처리. 여기서 예외를 삼키면 재고가 영구히 잠긴다.
    """
```

## docstring 규약

- 모듈·공개 클래스·비자명한 공개 함수에만. 내부 헬퍼·`@property`·`__str__`에는 쓰지 않는다.
- 첫 줄은 명령형 한 문장으로 끝낸다(PEP 257). 여러 줄이면 요약 다음에 빈 줄.
- 모듈 docstring은 **그 모듈의 책임 한 줄**. 파일 목록·변경 이력은 넣지 않는다.
- 도메인 불변식은 코드(`__post_init__`)로 강제하고, **왜 그 불변식인지**만 적는다.

```python
@dataclass(frozen=True, slots=True)
class Money:
    """통화 최소 단위(원·센트) 정수 금액."""

    amount_minor: int
    currency: Currency

    def __post_init__(self) -> None:
        if self.amount_minor < 0:
            # 음수는 환불 도메인이 따로 다룬다. 여기서 허용하면 부호 규칙이 두 곳으로 갈라진다.
            raise ValueError("amount_minor는 0 이상이어야 한다")
```

## async 코드

async는 선택 이유가 코드에 안 드러난다. 그 부분만 적는다.

- `asyncio.to_thread`를 쓴 이유: `# 라이브러리가 동기 전용이라 이벤트 루프를 막지 않으려고 스레드로 민다`.
- fire-and-forget이 불가피하면 소유자·실패 처리·취소 시점을 남긴다(원칙은 금지).
- 타임아웃 값에는 근거를 적는다: `# 핫패스라 3초를 넘기면 전체 처리량이 무너진다`.

## 설정 파일 (yaml · toml · env 예시)

**기본은 무주석**이다. 키 이름이 이미 설명한다.

- 값의 **근거**가 있을 때만 한 줄: 왜 이 숫자인지, 어디서 나온 제한인지.
- 기본값과 다르게 튜닝했거나, 바꾸면 장애가 나는 값에만 남긴다.

```yaml
# ✗
app:
  port: 8000        # 앱 포트
  debug: false      # 디버그 여부

# ✓
database:
  pool_size: 20     # DB max_connections(100) / 워커 5개 기준
```

## SQL · ORM 쿼리

한두 줄이면 충분하다. **왜 이 형태인지**만 적고 구문 설명은 하지 않는다.

```python
# ✗ 구문을 한국어로 옮긴 주석
# orders와 users를 조인한다
stmt = select(Order.id, User.name).join(User, User.id == Order.user_id)

# ✓ 의도와 성능 근거
# 정산 대상은 결제 완료 주문뿐. selectinload는 async 세션에서 lazy가 터지는 것과 N+1을 함께 막는다.
stmt = (
    select(Order)
    .join(User, User.id == Order.user_id)
    .where(Order.status == OrderStatus.PAID)
    .options(selectinload(Order.items))
)
```

원시 SQL을 쓸 때는 **ORM으로 안 되는 이유**를 한 줄 적고 파라미터 바인딩(`:name`)만 쓴다.

## TODO · FIXME

근거와 추적 링크를 남긴다. `# TODO: 임시` 처럼 맥락 없는 것은 금지.

```python
# TODO(#312): 정산 배치가 단건 API를 N번 부른다. 벌크 엔드포인트 나오면 교체.
```

## 리뷰 체크리스트

- 이 주석이 없으면 무엇을 못 알아보는가 → 답이 없으면 삭제.
- 타입 힌트가 이미 말하는 것을 `Args:`/`Returns:`로 반복하는가 → 삭제.
- 흐름 주석이 예외 조건(순서=정합성, 5단계 이내)을 충족하는가 → 아니면 삭제하거나 함수를 쪼갠다.
- 설정·쿼리 주석이 값의 근거를 말하는가, 키 이름을 반복하는가.
- `# type: ignore`·`# noqa`·`to_thread`·원시 SQL에 이유가 붙어 있는가.
- 코드가 바뀌었는데 docstring이 옛 로직을 말하는가 → 고치거나 지운다. 거짓 주석은 없는 것보다 나쁘다.
