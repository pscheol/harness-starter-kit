<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: layered-multimodule · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}}

이 킷은 Kotlin/Java + Spring Boot(JVM) 전용이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
버전은 **단일 소스**(Gradle `gradle/libs.versions.toml`, Maven `pom.xml`의 `<properties>`/`dependencyManagement`)에 고정하고 확정 시점·근거를 함께 기록한다.

이 변형은 레이어를 모듈로 자른 구조다. **실행 단위가 여럿일 수 있다**(`api`·`batch`·`admin`)는 것이
빌드 스크립트·포트·배포에서 가장 먼저 드러나는 차이다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | Kotlin 또는 Java | Kotlin이면 `-Xjsr305=strict` 권장 |
| 런타임 | **JDK** (LTS 등 프로젝트 확정) | 빌드 toolchain·JvmTarget 고정 |
| 프레임워크 | **Spring Boot** (JVM 빌드) | Spring Security · Actuator 포함 |
| DB 접근 | Spring Data JPA(Hibernate) 기본, 복잡 조회는 **쿼리 도구(선택)** | `domain` 모듈이 소유 |
| Migration | **마이그레이션 도구(선택)** — 예: Flyway/Liquibase | 스크립트는 `domain` 모듈 리소스에 |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 실행 단위가 여럿이어도 DB는 하나 |
| 빌드 도구 | Gradle(기본, Kotlin DSL, wrapper) 또는 **Maven(선택)** | 버전 단일 카탈로그 |
| 린트/정적분석 | **린트(선택)** — Kotlin=ktlint/detekt, Java=Checkstyle/Spotless 등 | 정확성 룰 위주로 |
| 구조 테스트 | Java=**ArchUnit** / Kotlin=**Konsist** 또는 ArchUnit | 실행 단위 모듈의 테스트 소스셋에 배치 |
| API 문서 | OpenAPI 3.1 (예: springdoc) | 실행 단위마다 문서가 따로 생긴다 |
| 테스트 | JUnit5/Kotest · MockK/Mockito(필요 시) · Testcontainers(선택) | Given-When-Then, 손수 짠 fake 우선 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 "버전 카탈로그 원칙"에 따라 단일 소스로 관리한다.

## 버전 카탈로그 원칙 (단일 소스)

- 모든 버전·의존성은 `gradle/libs.versions.toml` 한 곳에서 관리한다. 모듈 빌드 스크립트는 **별칭만** 참조한다(`libs.spring.boot.starter.web`).
- BOM이 잡는 라이브러리는 versionless로 선언한다(Spring Boot BOM · Testcontainers BOM 등). 버전을 개별 명시하면 BOM 정렬이 깨진다.
- 서드파티(BOM 밖) 라이브러리만 버전을 명시한다.
- Java는 Groovy DSL(`build.gradle`), Kotlin은 Kotlin DSL(`build.gradle.kts`)로 **한쪽을 골라 통일**한다. 섞으면 IDE 지원과 리팩터링이 둘 다 나빠진다.
- 새 의존성은 카탈로그에 추가하고, 라이선스·유지보수 상태를 확인한 뒤 쓴다.

## 모듈별 빌드 스크립트 규약

레이어가 5~7개뿐이라 컨벤션 플러그인 없이도 관리된다. 다만 **루트에서 의존성을 뿌리지 않는다**.

```kotlin
// 루트 build.gradle.kts — 공통은 여기까지만
subprojects {
    apply(plugin = "org.jetbrains.kotlin.jvm")
    // toolchain · 컴파일 옵션 · test 설정만. 의존성 선언 금지
}
```

```kotlin
// {{PROJECT_SLUG}}-api/build.gradle.kts — 실행 단위
plugins { id("org.springframework.boot") }

dependencies {
    implementation(project(":{{PROJECT_SLUG}}-service"))
    implementation(project(":{{PROJECT_SLUG}}-common"))
    implementation(libs.spring.boot.starter.web)
}
```

```kotlin
// {{PROJECT_SLUG}}-service/build.gradle.kts — 라이브러리 모듈
dependencies {
    api(project(":{{PROJECT_SLUG}}-domain"))                 // (A) 방식: 실행 단위가 엔티티를 본다
    // implementation(project(":{{PROJECT_SLUG}}-domain"))   // (B) 방식: 컴파일로 차단
    implementation(project(":{{PROJECT_SLUG}}-common"))
}
```

- **`subprojects { }`에 Spring Web·JPA 의존성을 넣지 않는다.** `common`까지 프레임워크에 오염되고, `common`은 모든 모듈이 끌고 가므로 격리가 사라진다.
- **Spring Boot 플러그인은 실행 단위에만**. 라이브러리 모듈에 붙으면 `bootJar`가 생기고 일반 `jar`가 비활성화돼 `project(...)` 의존이 깨진다.
- `api()` vs `implementation()` 선택은 아키텍처 결정이다 — `structure.md` §1.2의 (A)/(B)를 먼저 정하고 그대로 선언한다.
- 라이브러리 모듈의 `@Configuration`은 실행 단위의 컴포넌트 스캔 범위 밖이다. `@AutoConfiguration` + `META-INF/spring/…AutoConfiguration.imports`로 스스로 등록하거나 실행 단위가 명시적으로 `@Import`한다. **`@ComponentScan(basePackages = "…다른 모듈…")`으로 남의 패키지를 긁지 않는다.**

## 빌드 / 실행 명령

Gradle 기준(Maven이면 대응 goal로 치환):

```bash
./gradlew build                                    # 전체 모듈 컴파일 + 패키징 + 테스트
./gradlew check                                    # 검증 게이트 — scripts/verify.sh 가 호출
./gradlew :{{PROJECT_SLUG}}-api:bootRun            # API 실행 (server.port=8080)
./gradlew :{{PROJECT_SLUG}}-batch:bootRun          # (선택) 배치 실행 단위
./gradlew :{{PROJECT_SLUG}}-api:test               # 구조 테스트 + 통합 테스트
```

> Maven 예: `mvn verify`(빌드+테스트), `mvn -pl {{PROJECT_SLUG}}-api spring-boot:run`.

- 강제 게이트는 `scripts/verify.sh` 한 곳(`./gradlew check --no-daemon -q` 또는 `mvn -q verify`). hook/CI/pre-commit은 이를 호출하는 얇은 트리거(`.agents/rules/agent-harness.md`).
- 실행 단위가 여럿이면 **아티팩트도 여럿**이다. 배포 파이프라인을 실행 단위마다 둔다.
- 빌드·배포 아티팩트는 기본 JVM JAR + 컨테이너. 네이티브 이미지는 기본 범위 외.

## 마이그레이션 소유

- 마이그레이션 스크립트는 `{{PROJECT_SLUG}}-domain/src/main/resources/db/migration/`에 둔다. 엔티티와 같은 모듈이라 스키마와 매핑이 같이 움직인다.
- **실행 단위가 여럿이면 마이그레이션을 누가 돌릴지 정한다.** 여럿이 동시에 기동하며 각자 마이그레이션을 시도하면 락 경합·중복 적용 위험이 생긴다. 기본은 `api`만 적용하고 나머지는 검증만(`validate`) 하도록 설정한다.
- 스키마 변경은 하위 호환으로 두 단계(추가 → 사용처 배포 → 제거)로 나눈다. 실행 단위가 여럿이면 배포 시점이 어긋나므로 특히 중요하다.

## Testcontainers (선택 — 사용 시 Docker 필요)

- `domain`(리포지토리 슬라이스)·`api`(통합) 테스트에 Testcontainers를 쓰면 실제 DB 컨테이너로 검증한다 → 로컬 Docker 실행 중이어야 한다.
- 복잡 쿼리·마이그레이션은 통합 테스트로 검증한다(순수 규칙 테스트는 Docker 없이 실행).
- 공용 테스트 토대(스키마 부트스트랩·컨테이너 설정)는 `testFixtures` 또는 `:{{PROJECT_SLUG}}-testsupport` 모듈에 두고 각 모듈이 `testImplementation`으로만 쓴다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등)는 `docker compose`로 기동한다. 리버스 프록시·IdP·오브젝트 스토리지는 필요할 때 선택적으로 추가한다.
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). URL·호스트·타임아웃은 `application.yml` + `@ConfigurationProperties`로 외부화(하드코딩 금지).
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다.

## 개발 포트 규약 (실행 단위마다 다르다)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} — api | 8080 |
| {{PROJECT_NAME}} — admin(선택) | 8081 |
| {{PROJECT_NAME}} — batch(선택) | 8082 |
| 관계형 DB | 5432(PostgreSQL) / 3306(MySQL) |
| 그 외 선택 구성요소 | 프로젝트에서 지정 |

> 실행 단위를 추가할 때마다 포트를 이 표에 등록한다. 등록 없이 8080을 재사용하면 로컬에서 두 번째가 뜨지 않는다.

## 명령 실행 주의 (macOS / zsh)

- dev 서버·watch 등 장시간 프로세스는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지).
