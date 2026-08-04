<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 신뢰성 · 안정성 기준 — {{PROJECT_NAME}}

장애 대응·타임아웃·재시도·멱등성 기준. **모든 외부 호출과 비동기 작업**에 적용한다.

## 외부 호출 (외부 API·Provider·Storage·gRPC·HTTP 등)

- 모든 외부 호출에 **timeout 필수**. 무한 대기 금지.
  - `httpx.AsyncClient(timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=1.0))` 처럼 **단계별로** 준다. 단일 total timeout만 두면 커넥션 고갈이 숨는다.
  - 라이브러리 타임아웃을 신뢰할 수 없으면 `async with asyncio.timeout(...)`로 한 겹 더 감싼다.
  - **`httpx` 기본 timeout은 5초지만 `timeout=None`을 넘기면 무한 대기**가 된다 — 명시적으로 금지한다.
- 클라이언트는 **재사용**한다(요청마다 `AsyncClient()` 생성 금지 — 커넥션 풀·TLS 핸드셰이크 낭비). lifespan에서 만들어 주입한다.
- 재시도는 **exponential backoff(+jitter)**. **재시도 가능 오류만** 재시도한다(4xx 비재시도, 5xx/timeout/커넥션 오류 재시도).
  - 구현은 `tenacity`(`@retry(stop=stop_after_attempt(3), wait=wait_exponential_jitter(), retry=retry_if_exception_type(...))`) 등 검증된 라이브러리로. 손수 짠 `while` 재시도 루프는 지양한다.
  - **POST 등 비멱등 요청은 멱등 키 없이 재시도하지 않는다**(중복 생성).
- 커넥션 풀을 쓴다(DB=SQLAlchemy 풀, HTTP=`AsyncClient`). 독립 호출은 `asyncio.gather`로 병렬화한다.
- 외부 provider 장애는 전용 error code로 매핑하고 fallback 정책을 제공한다(예: `PROVIDER_ERROR`).
- 무거운 외부 의존을 동기 응답 경로에 직렬로 쌓지 않는다(배치성 작업은 큐/워커로 분리).

## 서킷브레이커 (아웃바운드 의존성 보호)

- 서킷브레이커는 **아웃바운드(내가 거는) 의존성 호출**에 적용한다. 인바운드 보호(rate limit)는 앞단 프록시나 앱 레벨 미들웨어에서 다룬다.
- 적용 대상: 외부 HTTP/오브젝트 스토리지, 외부 Provider, 서비스 간 호출.
- **구현은 서킷브레이커 라이브러리**(`purgatory`·`pybreaker`·`aiobreaker` 등)로 하고, **아웃바운드 어댑터(외부 호출 구현) 메서드에 적용**한다. 규칙·오케스트레이션 계층은 서킷브레이커를 모른다.
  ```python
  # 아웃바운드 어댑터: 외부 호출 구현 메서드에 CB 를 건다.
  @circuit_breaker(name="orchestrator", failure_threshold=5, recovery_timeout=30)
  async def provision(self, command: ProvisionCommand) -> ProvisionResult: ...
  ```
- **CB 상태는 프로세스 로컬**이다. ASGI 워커가 여러 개면 워커마다 따로 열린다 — 임계값을 워커 수 기준으로 계산하거나 공유 저장소(Redis) 백엔드를 쓴다.
- open 상태 fallback은 호출 성격에 따른다: 인증/권한 조회처럼 보안 직결이면 **fail-closed**(거부), 부가 기능이면 degrade. 정책을 명시한다.
- 서킷브레이커는 timeout·재시도와 **함께** 쓴다(CB가 timeout을 대체하지 않는다).

## async 안정성 (Python 고유)

- **이벤트 루프를 막지 않는다**: `async def` 안에서 blocking I/O·CPU 바운드 작업 금지. 불가피하면 `await anyio.to_thread.run_sync(...)`(CPU 바운드는 프로세스 풀).
- **태스크 소유자를 명시한다**: `asyncio.create_task()` 결과를 버리면 예외가 삼켜지고 GC로 취소될 수 있다. `asyncio.TaskGroup`/`anyio.create_task_group`으로 묶고, 불가피하면 참조를 보관하고 `add_done_callback`으로 예외를 로깅한다.
- **취소(CancelledError)를 삼키지 않는다**: `except Exception`은 `CancelledError`를 잡지 않지만(3.8+ `BaseException` 상속), `except BaseException`·광범위 `except`로 삼키면 종료가 걸린다. 정리 코드는 `finally`에 둔다.
- **graceful shutdown**: lifespan(`@asynccontextmanager`)에서 진행 중 작업을 기다리고 클라이언트·풀·워커를 닫는다. 종료 시 커넥션 누수는 다음 배포에서 장애로 나타난다.
- **백프레셔**: 무제한 동시성 금지. `asyncio.Semaphore`나 큐 크기 상한으로 팬아웃을 제한한다(외부 API 레이트리밋·메모리 폭증 방지).

## 멱등성 (Idempotency)

- 리소스 생성·상태 변경 작업은 idempotent하게 설계한다(부분 성공 후 재실행 안전).
- Webhook은 `(provider, external_event_id)`로 dedup. 중복 수신 시 기존 결과 반환.
- 비동기 job은 재실행해도 중복 생성이 없어야 한다(upsert / 존재 확인 / unique 제약).
- 클라이언트 재시도를 위해 `Idempotency-Key` 헤더를 지원할 수 있다(키→결과 저장, TTL).

## 비동기 작업 (jobs / worker)

- 인덱싱·배치 등 장시간 작업은 요청-응답 경로 밖으로 분리한다(Celery·ARQ·Dramatiq·RQ 등 선택).
- **FastAPI `BackgroundTasks`는 워커 프로세스와 생명주기를 공유**한다 — 재배포·크래시 시 유실된다. 유실되면 안 되는 작업은 반드시 영속 큐를 쓴다.
- `retry_count`/backoff로 일시 실패를 재시도하고, 한계 초과 시 `FAILED` + `error_message` 기록.
- 실패 작업은 조회·재시도 가능해야 한다(운영 도구/API).

## 상태 · 정합성

- 상태 전이는 정의된 `StrEnum`만 따른다. 잘못된 전이는 도메인에서 차단한다.
- 외부 저장소 간 불일치는 보정 job으로 재동기화한다.
- DB 트랜잭션과 이벤트 발행 일관성은 **Transactional Outbox**(`event_outbox`) 패턴으로. 커밋 전에 외부로 이벤트를 쏘지 않는다.
- **세션 경계**: `AsyncSession`은 요청/유스케이스 단위로 만들고 재사용하지 않는다. 여러 태스크가 한 세션을 공유하면 안 된다(SQLAlchemy 세션은 동시성 안전하지 않다).

## 대규모 트래픽 · 성능 예산

- **무한/대량 결과 금지**: cursor pagination + 상한 `limit`. 전체 스캔·메모리 적재 금지.
- **N+1 회피**: `selectinload`/`joinedload` 명시. 관계 기본값 `lazy="raise"`로 암묵 로딩을 즉시 실패로 만든다.
- **핫패스 경량화**: 고빈도 경로는 단건 인덱스 조회 + 캐시(TTL·무효화 동반).
- **워커·풀 사이징**: 처리량 상한 = ASGI 워커 수 × 커넥션 풀. **워커마다 풀이 따로 생긴다** — `pool_size × workers ≤ DB max_connections`.
- **부하테스트**(Locust·k6 등 선택): 핵심 경로 시나리오의 threshold를 KPI에 연결(오류율 <1%, p95/p99 지연 예산). per-commit 아님, nightly/릴리스 전.

관련: [`security.md`](./security.md) · `ARCHITECTURE.md`(§7 성능 예산 · §4.1 async 규약).
