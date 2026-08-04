---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 모듈 책임 (포인터)

정본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 모듈/기능 착수 전 연다. 아키텍처 정본은 `ARCHITECTURE.md`.

요약:
- **Gradle 멀티모듈**. 킷이 강제하는 것은 **등급 간 의존 방향 하나**이고, **모듈을 무엇으로 자를지·어떻게 이름 붙일지는 프로젝트가 정한다**(도메인·연동 대상·기술 관심사·공개 표면 중 선택. `client-` 같은 접두사 강제 없음).
- 등급은 셋: **실행**(1개, `bootJar`) → **구성**(N개) → **공유**(계약·공용 모델). 의존은 위→아래 단방향. `구성 → 실행`·`공유 → 위`·`구성 A ↔ 구성 B`는 **컴파일 실패**. 구성 모듈 간 의존이 꼭 필요하면 `structure.md` §3 표에 **기록**한다.
- **공유 모듈에 Spring Web·JPA·벤더 SDK 금지**(모든 모듈이 끌고 간다). 공유 모듈을 늘리지 않는다.
- **JPA 엔티티·외부 SDK 타입은 소유 모듈 밖으로 안 나간다.** 변환은 소유 모듈 안에서 끝낸다. 위반은 실행 모듈의 `ModuleBoundaryTest`(ArchUnit/Konsist)가 `./gradlew check`에서 잡는다 — **자리표시자를 실제 모듈명으로 채워야 작동한다.**
- 패키지는 **모듈과 1:1**(`{{PACKAGE_NS}}.<module>`). 모듈 **안쪽** 구조는 모듈마다 달라도 된다.
- 트랜잭션 경계는 유스케이스 서비스에만(엔티티·리포지토리 `@Transactional` 금지 — 엔티티는 효과도 없다). 카운터는 **DB 원자적 UPDATE**. 조립은 실행 모듈에서(`@ComponentScan`으로 남의 모듈 긁기 금지).
- 빌드: **Java=Groovy DSL / Kotlin=Kotlin DSL**, 버전·좌표는 `gradle/libs.versions.toml` 단일 소스. **루트에서 의존성을 뿌리지 않는다.** 상세는 `.agents/rules/tech.md`.
- 모듈이 하나로 수렴하면 `layered`, 한 모듈의 도메인이 지배적이면 `hexagonal` 승격 — `ARCHITECTURE.md` §0·§12.
