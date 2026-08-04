---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 품질 기준 / DoD (포인터)

정본: `.agents/rules/quality-score.md` — Claude·Codex·Kiro 공통. **코드 생성·수정·PR 전 자체 점검한다.**

요약:
- 코드 품질: 단위 테스트(성공 + 최소 1 실패), 도메인/유스케이스 **TDD**, 생성자 주입, `@Transactional`은 Application Service에만, 레이어 단방향 의존, 경계 입력 검증.
- Story DoD: API 명세 일치·401/403, **권한 없는 접근 차단 테스트**, 공통 envelope, secret 원문 미저장, OpenAPI 동시 갱신.
- 커버리지: 도메인/유스케이스 ≥ 90%, 모듈 평균 ≥ 80%. 검증은 `scripts/verify.sh` 한 곳.
