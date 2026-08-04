---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 기능 책임 (포인터)

정본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 기능 착수 전 연다. 아키텍처 정본은 `ARCHITECTURE.md`.

요약:
- **패키지 바이 피처**(단일 Gradle 모듈): `{{PACKAGE_NS}}.<feature>/{api,web,service,repository,domain}` + `config`·`common`.
- **기능 간 직접 참조 금지** — 다른 기능은 `api` 패키지만 본다. 기능이 소유한 테이블만 읽고 쓴다.
- 기능 안에서도 방향은 `web → service → repository → domain`(건너뛰기 금지). `domain`·`repository`는 web 타입 무의존.
- 경계는 **ArchUnit 슬라이스 규칙**(`slices().notDependOnEachOther()`·`beFreeOfCycles()`)이 `./gradlew check`에서 강제한다. 새 기능은 규칙 수정 없이 자동 적용.
- 기능 간 통합은 **`api` 호출** 또는 **도메인 이벤트**(`@TransactionalEventListener` AFTER_COMMIT). `@Transactional`은 service에만.
- 예외 목록에 기능 패키지를 추가하거나 구조 테스트를 끄지 않는다. API 변경 시 `.agents/docs/openapi` 동기화.
- 승격 신호가 보이면 `ARCHITECTURE.md` §0·§11의 전환 가이드를 연다.
