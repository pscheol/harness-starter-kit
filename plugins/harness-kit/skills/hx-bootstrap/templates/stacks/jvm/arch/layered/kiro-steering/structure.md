---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 레이어 책임 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:
- **단일 Gradle 모듈** 레이어드: `controller → service → repository → entity` 단방향 + `config`·`common`.
- 모듈 그래프가 없으므로 의존 방향은 **ArchUnit 구조 테스트**(`./gradlew check`)가 강제한다. 레이어 패키지를 추가하면 테스트에도 등록.
- 레이어 건너뛰기 금지: 컨트롤러는 리포지토리를 직접 부르지 않는다. 엔티티·리포지토리는 web 타입 무의존.
- `@Transactional`은 service에만. 엔티티를 컨트롤러 시그니처에 노출하지 않는다(항상 DTO + envelope).
- 구조 테스트를 끄거나 지워서 통과시키지 않는다. API 변경 시 `.agents/docs/openapi` 동기화.
- 승격 신호가 보이면 `ARCHITECTURE.md` §0·§11의 전환 가이드를 연다.
