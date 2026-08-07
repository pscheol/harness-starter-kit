<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: hexagonal · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}}

이 킷은 Kotlin/Java + Spring Boot(JVM) 전용이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
버전은 **단일 소스**(예: Gradle `gradle/libs.versions.toml`, Maven `pom.xml`의 `<properties>`/`dependencyManagement`)에 고정하고 확정 시점·근거를 함께 기록한다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | Kotlin 또는 Java | Kotlin이면 `-Xjsr305=strict` 권장 |
| 런타임 | **JDK** (LTS 등 프로젝트 확정) | 빌드 toolchain·JvmTarget 고정 |
| 프레임워크 | **Spring Boot** (JVM 빌드) | Spring Security · Actuator 포함 |
| DB 접근 | Spring Data JPA(Hibernate) 기본, 복잡 조회는 **쿼리 도구(선택)** | 표준 CRUD=JPA |
| Migration | **마이그레이션 도구(선택)** — 예: Flyway/Liquibase | 스키마 버전 관리 |
| DB | **관계형 DB 선택**(PostgreSQL/MySQL 등) | 메타데이터·권한의 단일 소스 |
| 빌드 도구 | Gradle(기본, Kotlin DSL, wrapper) 또는 **Maven(선택)** | 버전 단일 카탈로그 |
| 린트/정적분석 | **린트(선택)** — Kotlin=ktlint/detekt, Java=Checkstyle/Spotless 등 | 정확성 룰 위주로 |
| API 문서 | OpenAPI 3.1 (예: springdoc) | `springdoc-openapi-starter-webmvc-ui` |
| 테스트 | JUnit5/Kotest · MockK/Mockito(필요 시) · Testcontainers(선택) | Given-When-Then, 손수 짠 fake 우선 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 "버전 카탈로그 원칙"에 따라 단일 소스로 관리한다.

## 버전 카탈로그 원칙 (단일 소스)

- 모든 버전·의존성은 빌드 도구의 **단일 버전 소스**에서 관리한다(Gradle=`gradle/libs.versions.toml`, Maven=`pom.xml` BOM/`<properties>`). 모듈 빌드 스크립트는 별칭/좌표만 참조한다.
- BOM이 잡는 라이브러리는 versionless로 선언한다(Spring Boot BOM · Testcontainers BOM 등). 버전을 개별 명시하면 BOM 정렬이 깨진다.
- 서드파티(BOM 밖) 라이브러리만 버전을 명시한다.
- 새 의존성은 카탈로그에 추가하고, 라이선스·유지보수 상태를 확인한 뒤 쓴다.

## 빌드 / 실행 명령

Gradle 기준(Maven이면 대응 goal로 치환):

```bash
./gradlew build                                   # 전체 모듈 컴파일 + 패키징 + 테스트
./gradlew check                                   # 검증 게이트(린트 + test) — scripts/verify.sh 가 호출
./gradlew :{{PROJECT_SLUG}}-bootstrap:bootRun     # 로컬 실행 (server.port=8080)
./gradlew :{{PROJECT_SLUG}}-bootstrap:test        # Bootstrap 통합테스트 (통합 테스트 사용 시)
```

> Maven 예: `mvn verify`(= 빌드+테스트), `mvn spring-boot:run`(로컬 실행). 명령은 프로젝트 빌드 도구에 맞게 맞춘다.

- 강제 게이트는 `scripts/verify.sh` 한 곳(예: `./gradlew check --no-daemon -q` 또는 `mvn -q verify`). hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 빌드·배포 아티팩트는 기본 **JVM JAR + 컨테이너**. 네이티브 이미지 등은 기본 범위 외(도입 시 별도 트랙에서 검증).

## Testcontainers (선택 — 사용 시 Docker 필요)

- `infra`/`bootstrap` 통합 테스트에 Testcontainers를 쓰면 실제 DB 컨테이너로 검증한다 → 로컬 Docker 실행 중이어야 한다.
- 저장소 격리 정책·복잡 쿼리·마이그레이션은 통합 테스트로 검증한다(순수 도메인/유스케이스는 Docker 없이 실행).
- 공용 테스트 토대(스키마 부트스트랩·컨테이너 설정)는 `:{{PROJECT_SLUG}}-testsupport`에 두고 각 모듈이 `testImplementation`으로만 쓴다.

## 로컬 개발 / 인프라

- 로컬 인프라(DB 등 필요한 구성요소)는 `docker compose`로 기동한다. 리버스 프록시/게이트웨이·IdP·오브젝트 스토리지 등은 **프로젝트가 필요할 때 선택적으로** 추가한다.
- 운영 확장 방식(예: Kubernetes)은 프로젝트에서 정한다.
- 환경변수는 `.env.example` 참조(`.env`는 git-ignore, 실값 commit 금지). URL·호스트·타임아웃 등은 `application.yml` + `@Value`/`@ConfigurationProperties`로 외부화(하드코딩 금지).

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (bootstrap) | 8080 |
| 관계형 DB | 5432(PostgreSQL) / 3306(MySQL) |
| 리버스 프록시/게이트웨이(선택) | 프로젝트에서 지정 |
| 그 외 선택 구성요소(IdP·스토리지 등) | 프로젝트에서 지정 |

> 포트 충돌을 피하려면 예약 포트를 한 표에 모아 관리한다.

## 명령 실행 주의 (macOS / zsh)

- dev 서버·watch 등 장시간 프로세스는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지).
