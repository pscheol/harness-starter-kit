---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 모듈 책임 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 모듈/컨텍스트 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`, 설계 원칙은 `.agents/rules/design-principles.md`.

요약:
- 컨텍스트 자립형 헥사고날. **바운디드 컨텍스트가 7모듈을 소유**한다: `core`·`common`·`domain`·`application`·`primary`·`infra`·`bootstrap`. 컨텍스트마다 실행 단위가 하나씩 있다.
- 모듈명은 평면 하이픈 `:{{PROJECT_SLUG}}-<ctx>-<layer>`. 디렉터리는 `settings.gradle.kts`의 `projectDir` 재지정으로 `<ctx>/<layer>/`에 묶는다. 7모듈은 항상 한 묶음으로 추가·제거한다.
- 의존은 안쪽으로만: `bootstrap → primary·infra·common`, `primary → application·common`, `infra → application·common·core`, `application → domain·core`, `domain → core`. 역방향·`primary ↔ infra`는 컴파일 실패.
- **컨텍스트 간 직접 의존 금지.** 컴파일러가 못 막으므로 각 `bootstrap`의 구조 테스트(Konsist/ArchUnit)가 잡는다 — 컨텍스트를 추가하면 **모든 컨텍스트의 `others` 목록에 등록**해야 검사된다(등록 누락 = 강제 누락). 통합은 HTTP·이벤트·`contract` 모듈 중 하나이고 `structure.md` §2 표에 기록한다.
- `core`·`domain`에 Spring/JPA 플러그인 금지. Spring Boot 플러그인은 `bootstrap`에만. 루트 `subprojects { }`로 의존성을 뿌리지 않는다.
- `core`·`common`이 컨텍스트마다 복제된다는 것이 이 변형이 지불하는 값이다. 복제본이 갈라지지 않게 컨텍스트마다 같은 이름의 envelope 계약 테스트를 둔다. 세 번째 복사에서 멈추고 `hexagonal` 후퇴를 검토한다.
- 데이터도 컨텍스트가 소유한다(스키마 분리 기본). 다른 컨텍스트의 테이블을 조인하지 않는다 — 리뷰가 유일한 방어선.
- 트랜잭션 경계는 `application` 유스케이스에만. 생성자 주입 only. 컨트롤러는 envelope로 응답. 포트는 애그리거트 기준으로 정의한다.
- 빌드: 모듈이 7×N개라 `build-logic` 레이어별 컨벤션 플러그인을 쓴다. 버전·좌표는 `gradle/libs.versions.toml` 단일 소스. 상세는 `.agents/rules/tech.md`.
- 컨텍스트가 하나로 수렴하거나 한 프로세스로만 배포하면 `hexagonal`, CRUD가 지배적이면 `layered-multimodule` — `ARCHITECTURE.md` §0·§12.
