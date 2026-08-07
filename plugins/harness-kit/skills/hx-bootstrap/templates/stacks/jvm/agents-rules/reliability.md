<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 신뢰성 · 안정성 기준 — {{PROJECT_NAME}}

장애 대응·타임아웃·재시도·멱등성 기준. **모든 외부 호출과 비동기 작업**에 적용한다.

## 외부 호출 (외부 API·Provider·Storage·gRPC·HTTP 등)

- 모든 외부 호출에 timeout 필수. 무한 대기 금지. gRPC는 per-call **deadline**을 항상 설정한다.
- 재시도는 exponential backoff(+jitter). **재시도 가능 오류만** 재시도한다(4xx 비재시도, 5xx/timeout 재시도).
- 커넥션 풀 사용(DB=HikariCP, HTTP). 독립 호출은 병렬화한다.
- 외부 provider 장애는 전용 error code로 매핑하고 fallback 정책을 제공한다(예: `PROVIDER_ERROR`).
- 무거운 외부 의존을 동기 응답 경로에 직렬로 쌓지 않는다(무거운 처리·배치성 작업 등은 jobs/큐로 분리).

## 서킷브레이커 (아웃바운드 의존성 보호)

- 서킷브레이커는 인바운드 API가 아니라 아웃바운드(내가 거는) 의존성 호출에 적용한다. 인바운드 보호(rate limit 등)는 앞단 리버스 프록시/게이트웨이(선택) 또는 앱 레벨에서 다룬다.
- 적용 대상: 서비스 간 gRPC, 외부 HTTP/오브젝트 스토리지, 외부 Provider 등.
- 구현은 서킷브레이커 라이브러리(예: Resilience4j)로 한다. 프로토콜 무관 데코레이터이므로 REST·gRPC 모두 적용 가능하며, 외부 호출을 감싸는 아웃바운드 어댑터 메서드에 `@CircuitBreaker`(+`@TimeLimiter`·제한 `@Retry`·필요 시 `@Bulkhead`)를 붙인다(gRPC `ClientInterceptor` 방식보다 어댑터 경계와 정합). 어댑터의 실제 위치는 아키텍처 변형마다 다르다 — 원본은 `ARCHITECTURE.md`·[`structure.md`](./structure.md).
  ```kotlin
  // 아웃바운드 어댑터: 외부 호출 구현 메서드에 CB를 붙인다(안쪽 계층은 CB를 모른다)
  @CircuitBreaker(name = "orchestrator", fallbackMethod = "provisionFallback")
  @TimeLimiter(name = "orchestrator")
  override fun provision(command: ProvisionCommand): ProvisionResult { ... }
  ```
- unary RPC(요청-응답 1건)에 서킷브레이커를 적용한다. 서버 스트리밍(예: 스트리밍 응답)은 실패 기준이 모호하므로 CB는 "스트림 개시" 단계에만 한정하거나 생략하고 deadline + 개시 타임아웃으로 다룬다.
- open 상태 fallback은 호출 성격에 따른다: 인증/권한 조회처럼 보안에 직결되면 **fail-closed**(거부), 부가 기능이면 degrade. fallback 정책을 명시한다.
- 서킷브레이커는 timeout·재시도와 **함께** 쓴다(CB가 timeout을 대체하지 않는다).

## 멱등성 (Idempotency)

- 리소스 생성·상태 변경 작업은 idempotent하게 설계한다(부분 성공 후 재실행 안전).
- Webhook은 `(provider, external_event_id)`로 dedup. 중복 수신 시 기존 결과 반환.
- 비동기 job은 재실행해도 중복 생성이 없어야 한다(upsert / 존재 확인 / unique key).

## 비동기 작업 (jobs)

- 인덱싱·배치 등 장시간 작업은 API 스레드를 점유하지 않는다(요청-응답 경로 밖으로 분리).
- `retry_count`/backoff로 일시 실패를 재시도하고, 한계 초과 시 `FAILED` + `error_message` 기록.
- 실패 작업은 Console/API에서 조회·재시도 가능해야 한다.

## 상태 · 정합성

- 상태 전이는 정의된 enum만 따른다(도메인 데이터 원본). 잘못된 전이 차단.
- 외부 저장소 간(예: 외부 인덱스 ↔ DB 메타데이터) 불일치는 보정 job으로 재동기화한다.
- DB 트랜잭션과 이벤트 발행 일관성은 **Transactional Outbox**(`event_outbox`) 패턴으로.

## 대규모 트래픽 · 성능 예산

모든 기능은 처음부터 대규모 트래픽을 어느 정도 전제하고 설계하되, 마이크로 최적화는 측정 후에 한다(YAGNI).

- 무한/대량 결과 금지: 목록은 cursor pagination + 상한 `limit`. 전체 스캔/메모리 적재 금지.
- **N+1 회피**: 배치·조인·`IN` 조회. WHERE/JOIN/ORDER BY 컬럼에 인덱스 동반.
- **핫패스 경량화**: 인증·토큰 검증 등 고빈도 경로는 단건 인덱스 조회. 무거운 직렬화·조인 지양. 캐시는 TTL·무효화 전략 동반해서만.
- **무상태·수평 확장**: 서비스 인스턴스는 무상태. 세션/락 상태는 외부(관계형 DB·캐시 등). 멱등키로 재시도 안전.
- 가상 스레드(`spring.threads.virtual.enabled=true`, JDK 21+): blocking I/O 동시성 효율을 높이되, 실제 DB 동시성 상한은 커넥션 풀이 결정하므로 풀·DB 사이징과 함께 조정한다.
- **경로별 차등 목표**(모두 부하테스트로 확정): 캐시/인증 핫패스는 높은 TPS 목표, DB 쓰기 경로는 저빈도 관리 경로로 별도 목표. 지연 민감 경로는 스트리밍(SSE)으로 TTFB 단축.
- **성능·부하테스트(부하테스트 도구, 선택)**: 완료 게이트에서 핵심 경로 1~2개 시나리오를 추가하고 threshold를 KPI에 연결(`http_req_failed < 1%`, p95/p99 지연 예산). per-commit 아님, nightly/릴리스 전.

관련: [`security.md`](./security.md) · `ARCHITECTURE.md`(§ 성능 예산).
