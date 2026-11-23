<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: hexagonal-standalone · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}}

이 킷은 Kotlin/Java + Spring Boot(JVM) 전용이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
버전은 **단일 소스**(Gradle `gradle/libs.versions.toml`, Maven `pom.xml`의 `<properties>`/`dependencyManagement`)에 고정하고 확정 시점·근거를 함께 기록한다.

이 변형은 **컨텍스트당 7모듈 · 실행 단위 N개**다. 모듈 수가 컨텍스트 수에 비례해 늘기 때문에
빌드 스크립트 중복을 어떻게 막을지가 다른 변형보다 먼저 결정돼야 한다(§빌드 로직 공유).

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | Kotlin 또는 Java | Kotlin이면 `-Xjsr305=strict` 권장 |
| 런타임 | **JDK** (LTS 등 프로젝트 확정) | 빌드 toolchain·JvmTarget 고정 |
| 프레임워크 | **Spring Boot** (JVM 빌드) | Spring Security · Actuator 포함 |
| DB 접근 | Spring Data JPA(Hibernate) 기본, 복잡 조회는 **쿼리 도구(선택)** | 표준 CRUD=JPA |
| Migration | **마이그레이션 도구(선택)** — 예: Flyway/Liquibase | 컨텍스트마다 스키마 소유를 명시(§스키마 소유) |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 컨텍스트별 스키마 분리 권장 |
| 빌드 도구 | Gradle(기본, Kotlin DSL, wrapper) | 모듈 수가 많아 컨벤션 플러그인이 사실상 필수 |
| 린트/정적분석 | **린트(선택)** — Kotlin=ktlint/detekt, Java=Checkstyle/Spotless 등 | 정확성 룰 위주로 |
| 구조 테스트 | Kotlin=**Konsist** / Java=**ArchUnit** | 컨텍스트마다 `bootstrap` 테스트 소스셋에 배치 |
| API 문서 | OpenAPI 3.1 (예: springdoc) | 실행 단위마다 문서가 따로 생긴다 |
| 테스트 | JUnit5/Kotest · MockK/Mockito(필요 시) · Testcontainers(선택) | Given-When-Then, 손수 짠 fake 우선 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 "버전 카탈로그 원칙"에 따라 단일 소스로 관리한다.

## 버전 카탈로그 원칙 (단일 소스)

- 모든 버전·의존성은 `gradle/libs.versions.toml` 한 곳에서 관리한다. 모듈 빌드 스크립트는 **별칭만** 참조한다(`libs.spring.boot.starter.web`).
- BOM이 잡는 라이브러리는 versionless로 선언한다(Spring Boot BOM · Testcontainers BOM 등). 버전을 개별 명시하면 BOM 정렬이 깨진다.
- 서드파티(BOM 밖) 라이브러리만 버전을 명시한다.
- **컨텍스트마다 다른 버전을 쓰지 않는다.** "이 컨텍스트만 최신 라이브러리로"는 이 변형에서 기술적으로 가능하지만, 그 순간 리포 하나에 두 개의 런타임 스택이 생긴다. 필요하면 ADR로 남긴다.
- 새 의존성은 카탈로그에 추가하고, 라이선스·유지보수 상태를 확인한 뒤 쓴다.

## 빌드 로직 공유 (모듈 7×N을 감당하는 방법)

컨텍스트 3개면 모듈 21개다. 각 `build.gradle.kts`에 toolchain·컴파일 옵션·테스트 설정을 복붙하면 **21곳을 동시에 고쳐야 하는 상태**가 된다.
레이어 성격은 컨텍스트가 달라도 같으므로, **레이어별 컨벤션 플러그인**을 만들어 각 모듈이 한 줄로 적용한다.

```
build-logic/                                       ← 포함 빌드(includeBuild)
└── src/main/kotlin/
    ├── {{PROJECT_SLUG}}.jvm-base.gradle.kts        toolchain · 컴파일 옵션 · 테스트 공통
    ├── {{PROJECT_SLUG}}.pure-module.gradle.kts     core · domain — Spring/JPA 부착 금지
    ├── {{PROJECT_SLUG}}.spring-module.gradle.kts   common · application · primary · infra
    └── {{PROJECT_SLUG}}.boot-app.gradle.kts        bootstrap — Spring Boot 플러그인 + bootJar
```

```kotlin
// {{DOMAIN_EXAMPLE}}/domain/build.gradle.kts
plugins { id("{{PROJECT_SLUG}}.pure-module") }

dependencies {
    implementation(project(":{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-core"))
}
```

- **`pure-module`은 프레임워크 무의존을 플러그인 레벨에서 보장한다.** Spring/JPA 플러그인을 여기에 넣지 않고, 넣으려는 시도를 리뷰가 막는다. `core`·`domain`이 이 플러그인만 쓰는 한 프레임워크 오염은 구조적으로 어렵다.
- **`boot-app`은 `bootstrap`에만 적용**한다. 다른 모듈에 Spring Boot 플러그인이 붙으면 `bootJar`가 생겨 라이브러리로 쓰기 어려워진다(일반 `jar`가 비활성화된다).
- 루트 `build.gradle.kts`에서 `subprojects { }`로 의존성을 뿌리지 않는다. 그러면 `core`·`domain`에도 Spring이 들어가 이 아키텍처의 전제가 깨진다.
- `buildSrc`도 같은 목적을 달성하지만, `buildSrc` 변경은 전체 재빌드를 유발한다. 모듈이 많을수록 `build-logic` 포함 빌드가 낫다.

## 빌드 / 실행 명령

```bash
./gradlew build                                                   # 전체 모듈 컴파일 + 패키징 + 테스트
./gradlew check                                                   # 검증 게이트 — scripts/verify.sh 가 호출
./gradlew :{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-bootstrap:bootRun   # 컨텍스트 하나 실행
./gradlew :{{PROJECT_SLUG}}-payment-bootstrap:bootRun              # 다른 컨텍스트 실행
./gradlew :{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-bootstrap:test      # 그 컨텍스트의 통합·구조 테스트
```

- **실행 단위가 여럿이라 `bootRun`이 하나가 아니다.** 로컬에서 전체를 띄우려면 `docker compose` 또는 각 `bootRun`을 별도 셸에서 돌린다.
- 컨텍스트 하나만 만졌다면 그 컨텍스트만 검증할 수 있다: `./gradlew :{{PROJECT_SLUG}}-<ctx>-bootstrap:check`. 다만 **커밋 전 게이트는 전체**(`bash scripts/verify.sh`)다 — 부분 검증은 작업 중 피드백용이다.
- 강제 게이트는 `scripts/verify.sh` 한 곳(`./gradlew check --no-daemon -q`). hook/CI/pre-commit은 이를 호출하는 얇은 트리거(`.agents/rules/agent-harness.md`).
- 빌드·배포 아티팩트는 **컨텍스트마다 JAR + 컨테이너 하나씩**이다. 배포 파이프라인도 컨텍스트 수만큼 필요하다.

## 스키마 소유 (컨텍스트 = 데이터 경계)

컨텍스트가 독립 실행 단위라면 **데이터도 독립이어야** 의미가 있다. 같은 테이블을 두 컨텍스트가 쓰면 분리는 이름뿐이다.

| 수준 | 방식 | 언제 |
|---|---|---|
| (a) DB 분리 | 컨텍스트마다 별도 DB 인스턴스/데이터베이스 | 분리 배포가 확정됐다 |
| (b) **스키마 분리**(기본 권장) | 한 DB 안에서 `{{DOMAIN_EXAMPLE}}`·`payment` 스키마 분리 | 아직 한 DB를 쓰지만 경계는 지킨다 |
| (c) 테이블 접두사 | `ord_*`·`pay_*` | 레거시 제약으로 스키마를 못 나눌 때 |

- 마이그레이션 파일도 컨텍스트가 소유한다: `<ctx>/infra/src/main/resources/db/migration/`. 실행은 그 컨텍스트의 `bootstrap`이 한다.
- **다른 컨텍스트의 테이블을 조인하지 않는다.** 필요하면 `structure.md` §2의 통합 방법(HTTP·이벤트·contract)을 쓴다. 조인은 컴파일러도 구조 테스트도 못 잡으므로 리뷰가 유일한 방어선이다.

## Testcontainers (선택 — 사용 시 Docker 필요)

- `infra`·`bootstrap` 통합 테스트에 Testcontainers를 쓰면 실제 DB 컨테이너로 검증한다 → 로컬 Docker 실행 중이어야 한다.
- 저장소 격리 정책·복잡 쿼리·마이그레이션은 통합 테스트로 검증한다(순수 도메인·유스케이스는 Docker 없이 실행).
- **테스트 토대는 컨텍스트마다 자기 것을 둔다**(`<ctx>-bootstrap`의 `testFixtures` 또는 `src/test`). 컨텍스트 간 공유 테스트 모듈을 만들면 `structure.md` §3의 "공유 0" 전제가 깨진다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등)는 `docker compose`로 기동한다. 컨텍스트가 여럿이므로 **애플리케이션도 compose에 넣어 한 번에 띄우는 편**이 실용적이다.
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). URL·호스트·타임아웃은 `application.yml` + `@ConfigurationProperties`로 외부화(하드코딩 금지).
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다. 이 변형은 컨텍스트별 독립 스케일링이 가능하다는 것이 채택 이유 중 하나다.

## 개발 포트 규약 (실행 단위마다 다르다)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} — {{DOMAIN_EXAMPLE}} bootstrap | 8080 |
| {{PROJECT_NAME}} — payment bootstrap | 8081 |
| 관계형 DB | 5432(PostgreSQL) / 3306(MySQL) |
| 그 외 선택 구성요소(IdP·스토리지·브로커 등) | 프로젝트에서 지정 |

> 컨텍스트를 추가할 때마다 포트를 이 표에 등록한다. 등록 없이 8080을 재사용하면 로컬에서 두 번째 컨텍스트가 뜨지 않는다.

## 명령 실행 주의 (macOS / zsh)

- dev 서버·watch 등 장시간 프로세스는 백그라운드로 실행한다. 실행 단위가 여럿이면 특히 그렇다.
- 테스트는 단발 실행한다(watch 금지).
