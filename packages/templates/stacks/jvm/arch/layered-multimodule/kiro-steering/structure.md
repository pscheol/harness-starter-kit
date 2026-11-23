---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 모듈 책임 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 모듈/기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`, 설계 원칙은 `.agents/rules/design-principles.md`.

요약:
- 멀티모듈 레이어드. **레이어 = Gradle 모듈**이라 레이어 방향을 컴파일러가 막는다(단일 모듈 `layered`는 ArchUnit만으로 지킨다).
- 모듈: 실행 단위 `:{{PROJECT_SLUG}}-api`(+ 선택 `-batch`·`-admin`) → `-service` → `-domain`(JPA 엔티티 + 리포지토리) → `-common`. 외부 연동은 `-client`(선택).
- 의존은 위→아래 단방향. `service → api`·`domain → service`·`common → 위 전부`·**실행 단위끼리 의존**은 컴파일 실패.
- 실행 단위가 여럿일 수 있다는 것이 이 변형을 고르는 이유다. 별도 실행 단위는 **배포 주기·스케일·보안 경계가 다를 때만** 만들고, 포트를 `.agents/rules/tech.md` 표에 등록한다.
- **엔티티 노출 범위는 프로젝트가 고른다**: `service`가 `domain`을 `api()`로 노출(A, 기본 — ArchUnit이 컨트롤러 시그니처를 막는다) vs `implementation()`으로 차단(B — 컴파일러가 막고 결과 모델 한 겹 추가). 채택 방식은 `structure.md` §1.2에 기록.
- `@Transactional`은 `service`에만(엔티티·리포지토리·컨트롤러 금지 — 엔티티는 효과도 없다). 생성자 주입 only. 컨트롤러는 envelope로 응답하고 엔티티를 시그니처에 쓰지 않는다.
- 비즈니스 규칙은 가능한 한 엔티티 안에. `service`가 getter/setter만 조립하면 Anemic Domain이다. `service` 비대화(SRP)와 엔티티 상속(LSP)이 이 변형의 단골 문제다.
- 빌드: Spring Boot 플러그인은 실행 단위에만(라이브러리 모듈에 붙으면 `bootJar`가 생겨 `project(...)` 의존이 깨진다). 루트 `subprojects { }`로 의존성을 뿌리지 않는다. 버전·좌표는 `gradle/libs.versions.toml` 단일 소스.
- 마이그레이션은 `-domain`이 소유하고 **적용 주체를 하나로** 정한다(나머지는 validate).
- 구조 테스트는 `api` 테스트 소스셋의 `LayeredModuleTest`(ArchUnit/Konsist). 레이어 모듈을 추가하면 여기에도 등록한다(등록 누락 = 강제 누락).
- 실행 단위가 끝내 하나면 `layered` 후퇴, 도메인 규칙이 무거워지면 `hexagonal` 승격 — `ARCHITECTURE.md` §0·§12.
