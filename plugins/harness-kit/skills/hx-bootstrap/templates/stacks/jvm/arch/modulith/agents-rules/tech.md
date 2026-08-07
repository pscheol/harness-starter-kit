<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: modulith · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (모듈러 모놀리스)

이 킷은 Kotlin/Java + Spring Boot(JVM) 전용이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
버전은 **단일 소스**(Gradle `gradle/libs.versions.toml`, Maven `pom.xml`의 `<properties>`/`dependencyManagement`)에 고정하고 확정 시점·근거를 함께 기록한다.

모듈 경계·통합 규약의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | Kotlin 또는 Java | Kotlin이면 `-Xjsr305=strict` 권장 |
| 런타임 | **JDK** (LTS 등 프로젝트 확정) | 빌드 toolchain·JvmTarget 고정 |
| 프레임워크 | **Spring Boot** | Spring Web · Spring Security · Actuator |
| 모듈 경계 | Spring Modulith(`spring-modulith-starter-core`) | 이 변형의 핵심 의존성. 모듈 인식·검증·문서 생성 |
| 모듈 검증·테스트 | `spring-modulith-starter-test` | `ApplicationModules.verify()` · `@ApplicationModuleTest` · Scenario API |
| 이벤트 전달 보장(선택) | `spring-modulith-events-*`(예: JPA 저장소) | 미완료 이벤트를 저장·재발행 — 커밋 후 리스너 유실 방지 |
| 관측(선택) | `spring-modulith-observability` | 모듈 경계 기준 트레이싱 |
| 빌드 도구 | Gradle(기본, Kotlin DSL, wrapper) — 단일 모듈 | 모듈은 **패키지**로 나눈다. Gradle 하위 모듈로 쪼개면 다른 아키텍처다 |
| DB 접근 | Spring Data JPA(Hibernate) | 모듈이 소유한 테이블만. 모듈 간 조인 금지 |
| Migration | **마이그레이션 도구(선택)** — 예: Flyway/Liquibase | 배포 단위가 하나이므로 히스토리도 하나 |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 스키마를 모듈별로 나누는 것은 선택 |
| 린트/정적분석 | **린트(선택)** — Kotlin=ktlint/detekt, Java=Checkstyle/Spotless | 정확성 룰 위주로 |
| API 문서 | OpenAPI 3.1 (예: springdoc) | 모듈별 tag 분리 |
| 테스트 | JUnit5/Kotest · Testcontainers(선택) | 모듈 단위 테스트가 기본 단위 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 "버전 카탈로그 원칙"에 따라 단일 소스로 관리한다.

## 버전 카탈로그 원칙 (단일 소스)

- 모든 버전·의존성은 빌드 도구의 **단일 버전 소스**에서 관리한다(Gradle=`gradle/libs.versions.toml`, Maven=`pom.xml` BOM/`<properties>`).
- BOM이 잡는 라이브러리는 versionless로 선언한다. **Spring Modulith는 자체 BOM**을 제공하므로 BOM을 import하고 개별 아티팩트는 versionless로 쓴다.
- Spring Boot 버전과 Spring Modulith 버전의 호환 조합을 확인하고 함께 올린다(둘 중 하나만 올리면 모듈 검증이 깨질 수 있다).
- 새 의존성은 카탈로그에 추가하고, 라이선스·유지보수 상태를 확인한 뒤 쓴다.
- 모듈별로 의존성을 나누지 않는다. 배포 단위가 하나이므로 의존성도 하나다. 한 모듈만 쓰는 무거운 의존성이 생기면 그 자체가 **분리 신호**다(`ARCHITECTURE.md` §0).

### `build.gradle.kts` 핵심 (예시 골격 — 단일 모듈)

```kotlin
dependencies {
    implementation(platform("org.springframework.modulith:spring-modulith-bom:<version>"))
    implementation("org.springframework.modulith:spring-modulith-starter-core")
    // (선택) 이벤트 전달 보장 — 미완료 이벤트 저장·재발행
    implementation("org.springframework.modulith:spring-modulith-starter-jpa")

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-security")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    // 모듈 경계 강제(ARCHITECTURE.md §3.3) — 없으면 경계가 강제되지 않는다
    testImplementation("org.springframework.modulith:spring-modulith-starter-test")
}
```

> `@ApplicationModule` 선언은 `package-info.java`에 붙는다. Kotlin 프로젝트라면 `src/main/java/` 소스셋을 열어 이 파일만 Java로 둔다(나머지 코드는 Kotlin 유지).

## 빌드 / 실행 명령

Gradle 기준(Maven이면 대응 goal로 치환):

```bash
./gradlew build          # 컴파일 + 패키징 + 테스트
./gradlew check          # 검증 게이트(린트 + 테스트 + 모듈 검증) — scripts/verify.sh 가 호출
./gradlew bootRun        # 로컬 실행 (server.port=8080)
./gradlew test --tests '*ModuleStructureTest'   # 모듈 경계 검증만
```

> Maven 예: `mvn verify`(= 빌드+테스트), `mvn spring-boot:run`(로컬 실행).

- 강제 게이트는 `scripts/verify.sh` 한 곳(예: `./gradlew check --no-daemon -q`). hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 모듈 경계 위반은 `./gradlew check`에서 `ApplicationModules.verify()` 실패로 나타난다(순환·내부 타입 접근·미허용 의존).
- `Documenter`가 생성한 모듈 다이어그램·의존 목록은 빌드 결과물에 남는다. 리뷰에서 경계 변화를 확인하는 근거로 쓴다.
- 빌드·배포 아티팩트는 기본 **JVM JAR + 컨테이너** 하나다(모듈은 배포 경계가 아니다).

## 이벤트 전달 보장 (선택 — 켤 때의 조건)

- `spring-modulith-events-*`를 쓰면 **이벤트 발행 레지스트리 테이블**이 생긴다 → 마이그레이션 스크립트에 포함시킨다.
- 미완료 이벤트 재발행은 최소 1회 전달이다 → 리스너는 멱등해야 한다(같은 이벤트를 두 번 받아도 안전).
- 재발행 정책(시작 시 자동 재발행 여부·보관 기간)을 `application.yml`에 명시하고 운영 문서에 남긴다.

## Testcontainers (선택 — 사용 시 Docker 필요)

- `@DataJpaTest`·`@SpringBootTest` 통합 테스트에 Testcontainers를 쓰면 실제 DB 컨테이너로 검증한다 → 로컬 Docker 실행 중이어야 한다.
- 모듈 단위 테스트(`@ApplicationModuleTest`)는 그 모듈만 부팅하므로 전체 통합 테스트보다 빠르다 — 기본 테스트 단위로 쓴다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등)는 `docker compose`로 기동한다. 부가 구성요소는 **필요할 때 선택적으로** 추가한다.
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). 설정은 `application.yml` + `@ConfigurationProperties`로 외부화하고 **모듈 이름을 prefix**로 쓴다(`{{DOMAIN_EXAMPLE}}.*`) — 소유가 드러나고 나중에 분리할 때 그대로 옮겨진다.
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다.

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (Spring Boot) | 8080 |
| 관계형 DB | 5432(PostgreSQL) / 3306(MySQL) |
| 캐시·브로커(선택) | 프로젝트에서 지정 |
| 그 외 선택 구성요소 | 프로젝트에서 지정 |

## 명령 실행 주의 (macOS / zsh)

- dev 서버(`bootRun`)·watch 등 장시간 프로세스는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지). Gradle 데몬 상태가 의심되면 `./gradlew --stop` 후 재실행한다.
- 모듈 검증만 빠르게 보려면 `--tests '*ModuleStructureTest'`로 좁혀 실행한다.
