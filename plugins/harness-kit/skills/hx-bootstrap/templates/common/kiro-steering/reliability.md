---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 신뢰성 · 안정성 (포인터)

원본: `.agents/rules/reliability.md` — Claude·Codex·Kiro 공통. 외부 호출·비동기 작업 설계 전 이 원본을 연다.

요약:
- 모든 외부 호출에 timeout(gRPC deadline). 재시도는 exponential backoff+jitter, 재시도 가능 오류만(5xx/timeout).
- 서킷브레이커는 **아웃바운드** 의존성(infra 어댑터 `@CircuitBreaker`)에, timeout·재시도와 함께. open 시 보안 직결은 fail-closed.
- 멱등성(웹훅 dedup·upsert), 비동기 job은 retry/backoff + 실패 조회·재시도. 발행 일관성은 Transactional Outbox.
- 대규모 트래픽 전제: cursor pagination+limit, N+1 회피, 핫패스 경량화, 무상태 수평 확장.
