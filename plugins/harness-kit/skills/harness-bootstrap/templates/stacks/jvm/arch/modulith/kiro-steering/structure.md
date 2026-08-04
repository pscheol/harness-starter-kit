---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 모듈 책임 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 모듈/기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:
- **모듈러 모놀리스**: 단일 Gradle 모듈 안에서 `{{PACKAGE_NS}}.<module>` 패키지가 모듈 경계. `shared`는 공용 커널(OPEN).
- **공개 표면 = 모듈 루트 타입만**. `<module>/internal..` 은 다른 모듈이 참조할 수 없다(검증 실패). JPA 엔티티는 공개하지 않는다.
- 경계는 Spring Modulith `ApplicationModules.verify()` 가 `./gradlew check`에서 강제한다(순환·내부 접근·미허용 의존).
- 모듈 간 통합은 공개 API 호출 또는 도메인 이벤트(`@ApplicationModuleListener`) 둘뿐. 다른 모듈 테이블 직접 조회·모듈 가로지르는 트랜잭션 금지.
- 모듈 단위 테스트는 `@ApplicationModuleTest`. 검증 테스트를 끄지 않는다. API 변경 시 `.agents/docs/openapi` 동기화.
- 전환·분리 신호가 보이면 `ARCHITECTURE.md` §0·§12를 연다.
