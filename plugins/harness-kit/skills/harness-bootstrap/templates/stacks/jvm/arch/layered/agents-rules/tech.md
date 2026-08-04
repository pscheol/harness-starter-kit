<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: layered · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (레이어드 · 단일 모듈)

이 킷은 **Kotlin/Java + Spring Boot(JVM) 전용**이다. 아래 스택·버전은 **예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정**한다.
버전은 **단일 소스**(Gradle `gradle/libs.versions.toml`, Maven `pom.xml`의 `<properties>`/`dependencyManagement`)에 고정하고 확정 시점·근거를 함께 기록한다.

레이아웃·레이어 계약의 정본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | **Kotlin** 또는 **Java** | Kotlin이면 `-Xjsr305=strict` 권장 |
| 런타임 | **JDK** (LTS 등 프로젝트 확정) | 빌드 toolchain·JvmTarget 고정 |
| 프레임워크 | **Spring Boot** | Spring Web · Spring Security · Actuator |
| 빌드 도구 | **Gradle(기본, Kotlin DSL, wrapper) — 단일 모듈** | `settings.gradle.kts`에 rootProject만. 하위 모듈을 추가하려는 순간이 `hexagonal` 승격 신호 |
| DB 접근 | **Spring Data JPA(Hibernate)** | 복잡 조회는 쿼리 메서드·타입세이프 빌더(선택) |
| Migration | **마이그레이션 도구(선택)** — 예: Flyway/Liquibase | 스키마 버전 관리 |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 메타데이터·권한의 단일 소스 |
| **아키텍처 강제** | **ArchUnit**(`archunit-junit5`) | **이 변형의 핵심 의존성.** 레이어 방향을 테스트로 강제(모듈 그래프 없음) |
| 린트/정적분석 | **린트(선택)** — Kotlin=ktlint/detekt, Java=Checkstyle/Spotless | 정확성 룰 위주로 |
| API 문서 | **OpenAPI 3.1** (예: springdoc) | `controller/docs`의 `*Api` 인터페이스가 문서 전담 |
| 테스트 | **JUnit5/Kotest** · **MockK/Mockito**(필요 시) · **Testcontainers(선택)** | Given-When-Then, 손수 짠 fake 우선 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 "버전 카탈로그 원칙"에 따라 단일 소스로 관리한다.

## 버전 카탈로그 원칙 (단일 소스)

- 모든 버전·의존성은 빌드 도구의 **단일 버전 소스**에서 관리한다(Gradle=`gradle/libs.versions.toml`, Maven=`pom.xml` BOM/`<properties>`).
- **BOM이 잡는 라이브러리는 versionless**로 선언한다(Spring Boot BOM · Testcontainers BOM 등). 버전을 개별 명시하면 BOM 정렬이 깨진다.
- **서드파티(BOM 밖) 라이브러리만 버전을 명시**한다 — ArchUnit이 대표적이다.
- 새 의존성은 카탈로그에 추가하고, 라이선스·유지보수 상태를 확인한 뒤 쓴다.

### `build.gradle.kts` 핵심 (예시 골격 — 단일 모듈)

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-security")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    // 아키텍처 강제(ARCHITECTURE.md §3.2) — 이 의존성이 없으면 레이어 규칙이 강제되지 않는다
    testImplementation("com.tngtech.archunit:archunit-junit5:<version>")
}
```

## 빌드 / 실행 명령

Gradle 기준(Maven이면 대응 goal로 치환):

```bash
./gradlew build          # 컴파일 + 패키징 + 테스트
./gradlew check          # 검증 게이트(린트 + 테스트 + ArchUnit) — scripts/verify.sh 가 호출
./gradlew bootRun        # 로컬 실행 (server.port=8080)
./gradlew test --tests '*ArchitectureTest'   # 구조 테스트만
```

> Maven 예: `mvn verify`(= 빌드+테스트), `mvn spring-boot:run`(로컬 실행).

- **강제 게이트는 `scripts/verify.sh` 한 곳**(예: `./gradlew check --no-daemon -q`). hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- **레이어 위반은 `./gradlew check`에서 ArchUnit 테스트 실패로 나타난다**. 이 테스트를 끄면 아키텍처 강제가 사라진다.
- 빌드·배포 아티팩트는 기본 **JVM JAR + 컨테이너**(단일 모듈이라 산출 jar도 하나다).

## Testcontainers (선택 — 사용 시 Docker 필요)

- `@DataJpaTest`·`@SpringBootTest` 통합 테스트에 **Testcontainers**를 쓰면 실제 DB 컨테이너로 검증한다 → **로컬 Docker 실행 중**이어야 한다.
- 복잡 쿼리·마이그레이션·제약은 통합 테스트로 검증한다(순수 로직·서비스 규칙은 Docker 없이 실행).
- 공용 테스트 토대(컨테이너 설정·스키마 부트스트랩)는 테스트 소스셋의 한 곳에 모은다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등)는 `docker compose`로 기동한다. 리버스 프록시·IdP·오브젝트 스토리지는 **필요할 때 선택적으로** 추가한다.
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). URL·호스트·타임아웃은 `application.yml` + `@ConfigurationProperties`로 외부화(하드코딩 금지). 하위 레이어의 `System.getenv` 직접 호출 금지.
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다.

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (Spring Boot) | 8080 |
| 관계형 DB | 5432(PostgreSQL) / 3306(MySQL) |
| 리버스 프록시/게이트웨이(선택) | 프로젝트에서 지정 |
| 그 외 선택 구성요소 | 프로젝트에서 지정 |

## 명령 실행 주의 (macOS / zsh)

- dev 서버(`bootRun`)·watch 등 장시간 프로세스는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지). Gradle 데몬 상태가 의심되면 `./gradlew --stop` 후 재실행한다.
