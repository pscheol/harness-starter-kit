---
inclusion: always
---
<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 기술 스택 · 실행 (포인터)

원본: `.agents/rules/tech.md` — Claude·Codex·Kiro 공통. 빌드·구조·스택 변경 전 연다. 버전 기준은 프로젝트의 버전 카탈로그(예: `gradle/libs.versions.toml`). 구체 버전은 예시이며 프로젝트에서 최신 안정 버전으로 확정한다.

요약:
- Kotlin/Java + Spring Boot(JVM) · Gradle(또는 Maven, 버전 카탈로그 권장).
- Spring Data/JPA(관계형 DB — PostgreSQL/MySQL 등 선택) · Spring Security · ktlint(선택).
- 모듈 구성(단일/멀티)과 아키텍처 강제 의존성(Konsist · ArchUnit · Spring Modulith)은 변형마다 다르다 — 원본 `.agents/rules/tech.md` 를 연다.
- 검증 게이트 `./gradlew check`(= `scripts/verify.sh`).
