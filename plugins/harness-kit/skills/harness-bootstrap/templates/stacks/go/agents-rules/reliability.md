<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 신뢰성 · 안정성 기준 — {{PROJECT_NAME}}

장애 대응·타임아웃·재시도·멱등성 기준. **모든 외부 호출과 비동기 작업**에 적용한다.

## context 전파 (Go 신뢰성의 토대)

- **모든 I/O 함수의 첫 인자는 `ctx context.Context`** 다. 취소·데드라인이 하위까지 닿아야 요청 취소가 자원을 회수한다.
- `context.Background()`/`context.TODO()`를 요청 처리 경로에서 쓰지 않는다(요청 취소가 전파되지 않는다). 백그라운드 작업은 **의도적으로** 새 ctx를 만들되 자체 타임아웃·종료 조건을 준다.
- ctx를 구조체 필드에 저장하지 않는다.
- 요청 스코프 데드라인: `ctx, cancel := context.WithTimeout(ctx, d); defer cancel()`. **`cancel` 호출 누락은 컨텍스트 누수**다(`lostcancel` vet 검사가 잡는다).

## 외부 호출 (외부 API·Provider·Storage·gRPC·HTTP 등)

- 모든 외부 호출에 **timeout 필수**. 무한 대기 금지.
  - **`http.DefaultClient`는 타임아웃이 없다.** 반드시 `&http.Client{Timeout: d}`를 만들어 주입한다. 세밀한 제어가 필요하면 `Transport`의 `DialContext`·`TLSHandshakeTimeout`·`ResponseHeaderTimeout`을 설정한다.
  - gRPC는 per-call **deadline**을 항상 설정한다.
- **클라이언트를 재사용**한다(요청마다 생성 금지 — 커넥션 풀·TLS 핸드셰이크 낭비). `Transport`의 `MaxIdleConnsPerHost`를 트래픽에 맞게 올린다(기본 2는 낮다).
- **응답 본문은 항상 닫는다**: `defer resp.Body.Close()`. 재사용을 위해 본문을 끝까지 읽거나 버린다(`io.Copy(io.Discard, resp.Body)`). `bodyclose` 린터가 누락을 잡는다.
- 재시도는 **exponential backoff(+jitter)**. **재시도 가능 오류만** 재시도한다(4xx 비재시도, 5xx/timeout/커넥션 오류 재시도).
  - **비멱등 요청(POST 등)은 멱등 키 없이 재시도하지 않는다.**
  - 재시도 루프에서도 `ctx.Done()`을 확인해 취소를 존중한다.
- 커넥션 풀을 명시적으로 설정한다: `db.SetMaxOpenConns`·`SetMaxIdleConns`·`SetConnMaxLifetime`(기본은 무제한이라 DB를 고갈시킬 수 있다).
- 독립 호출은 `errgroup.Group`으로 병렬화한다(에러·취소 전파가 함께 온다).
- 외부 provider 장애는 전용 error code로 매핑하고 fallback 정책을 제공한다.

## 서킷브레이커 (아웃바운드 의존성 보호)

- 서킷브레이커는 **아웃바운드(내가 거는) 의존성 호출**에 적용한다. 인바운드 보호(rate limit)는 앞단 프록시나 미들웨어(`golang.org/x/time/rate`)에서 다룬다.
- **구현은 검증된 라이브러리**(`sony/gobreaker` 등)로 하고 **infra 어댑터에 적용**한다. `app`/`domain`은 서킷브레이커를 모른다.
  ```go
  // infra 아웃바운드 어댑터: 포트 구현 메서드에서 CB 를 감싼다.
  // 상태는 프로세스 로컬이라 인스턴스 수만큼 독립적으로 열린다(임계값을 그 전제로 잡는다).
  res, err := a.breaker.Execute(func() (any, error) { return a.call(ctx, req) })
  ```
- open 상태 fallback은 호출 성격에 따른다: 인증/권한 조회처럼 보안 직결이면 **fail-closed**(거부), 부가 기능이면 degrade.
- 서킷브레이커는 timeout·재시도와 **함께** 쓴다(CB가 timeout을 대체하지 않는다).

## 고루틴 · 동시성 안정성

- **모든 고루틴에 소유자와 종료 조건이 있어야 한다.** 누가 기다리는지(`sync.WaitGroup`/`errgroup`), 무엇으로 멈추는지(`ctx.Done()`)를 코드와 주석으로 드러낸다. 종료 경로 없는 고루틴 = 누수.
- **팬아웃 상한**: 무제한 고루틴 생성 금지. 세마포어(`golang.org/x/sync/semaphore`)나 워커 풀로 제한한다(외부 레이트리밋·메모리 보호).
- **채널 소유권**: 보내는 쪽이 닫는다. 버퍼 없는 채널에 리시버 없이 보내면 영구 블록된다.
- **공유 상태는 뮤텍스 또는 채널 중 하나로만** 보호한다. 경합은 `go test -race`가 잡는다(게이트 필수).
- **graceful shutdown**: `signal.NotifyContext` → `srv.Shutdown(ctx)` → 워커 `wg.Wait()` → DB·클라이언트 close. 종료 타임아웃을 두고, 초과 시 강제 종료한다.
- panic은 고루틴 안에서 프로세스를 죽인다. **고루틴 진입점에 recover**를 두고 로깅한 뒤 정책대로 재시작/종료한다(recover를 정상 흐름으로 쓰지는 않는다).

## 멱등성 (Idempotency)

- 리소스 생성·상태 변경 작업은 idempotent하게 설계한다(부분 성공 후 재실행 안전).
- Webhook은 `(provider, external_event_id)`로 dedup. 중복 수신 시 기존 결과 반환.
- 비동기 job은 재실행해도 중복 생성이 없어야 한다(upsert / 존재 확인 / unique 제약).
- 클라이언트 재시도를 위해 `Idempotency-Key` 헤더를 지원할 수 있다(키→결과 저장, TTL).

## 비동기 작업 (worker)

- 인덱싱·배치 등 장시간 작업은 요청-응답 경로 밖으로 분리한다(별도 `cmd/worker` 바이너리 + 큐).
- **핸들러에서 `go func()` 으로 백그라운드 작업을 띄우지 않는다** — 요청 ctx가 취소되면 끊기거나, 반대로 종료를 막는다. 유실되면 안 되는 작업은 영속 큐/outbox로.
- `retry_count`/backoff로 일시 실패를 재시도하고, 한계 초과 시 `FAILED` + `error_message` 기록.
- 실패 작업은 조회·재시도 가능해야 한다.

## 상태 · 정합성

- 상태 전이는 정의된 타입 있는 상수만 따른다. 잘못된 전이는 도메인에서 차단한다.
- 외부 저장소 간 불일치는 보정 job으로 재동기화한다.
- DB 트랜잭션과 이벤트 발행 일관성은 **Transactional Outbox** 패턴으로. 커밋 전에 외부로 이벤트를 쏘지 않는다.
- **트랜잭션은 유스케이스가 소유**한다(`TxManager.WithinTx`). `defer tx.Rollback()`을 걸어 조기 반환 시 누수를 막는다(커밋된 트랜잭션의 롤백은 무해).

## 관측성 (Observability)

- 구조화 로깅(`log/slog`)에 `request_id`·`actor`·`operation`을 실어 상관 가능하게 한다. 민감정보 금지.
- 헬스체크를 분리한다: **liveness**(프로세스 살아있음)와 **readiness**(의존성 준비됨). readiness에서 DB를 핑하되 캐시로 부하를 제한한다.
- 메트릭(요청률·에러율·지연 p95/p99·풀 사용률)과 트레이싱(OpenTelemetry, 선택)을 경계에 둔다.

## 대규모 트래픽 · 성능 예산

- **무한/대량 결과 금지**: cursor pagination + 상한 `limit`. 전체 스캔·전량 메모리 적재 금지.
- **N+1 회피**: 배치·조인·`IN` 조회. 인덱스 동반.
- **핫패스 경량화**: 고빈도 경로는 단건 인덱스 조회 + 캐시(TTL·무효화 동반). 할당을 줄이되 **측정 후 최적화**(pprof·`-bench`).
- **서버 타임아웃 설정**(`ReadHeaderTimeout` 등)으로 느린 클라이언트 공격을 막는다([`api-standards.md`](./api-standards.md)).
- **부하테스트**(k6·vegeta 등 선택): 핵심 경로 threshold를 KPI에 연결(오류율 <1%, p95/p99 예산). per-commit 아님, nightly/릴리스 전.

관련: [`security.md`](./security.md) · `ARCHITECTURE.md`(§5.2 동시성 · §8 성능 예산).
