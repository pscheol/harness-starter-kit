# JVM 아키텍처 실전 레시피

`hx-bootstrap` 이 깔아 주는 것은 규칙·문서·검증 게이트다. **빌드 스크립트와 소스는 만들지 않는다.**
이 문서는 설치 직후 손으로 세워야 하는 것 — 모듈 등록 · 의존 선언 · 강제 도구 배치 — 을 변형별로 모아 둔 것이다.

예시는 `PROJECT_SLUG=my-app` · `PACKAGE_NS=com.example.myapp` · 컨텍스트 `order`·`payment` 기준이다.

> 어떤 변형을 고를지는 [02-choosing-architecture.md](02-choosing-architecture.md) 를 먼저 본다.

---

## 0. 8변형 한눈에

| ARCH | 모듈 구성 | 실행 단위 | 컴파일이 막는 것 | 테스트가 막는 것 |
|---|---|---|---|---|
| `hexagonal` | `<ctx>` × 4 + 전역 `core`·`common`·`bootstrap` | 1 | 레이어 방향 | 패키지 규율 · 컨텍스트 간 도메인 import |
| `hexagonal-nested` | 위와 같음(경로 중첩) | 1 | 레이어 방향 | 동일 |
| `hexagonal-standalone` | `<ctx>` × 7 | **N** | 레이어 방향(컨텍스트 내부) | **컨텍스트 간 의존 전체** |
| `layered` | 단일 | 1 | — | **레이어 방향 전부** |
| `layered-multimodule` | 레이어당 1 | 1~N | 레이어 방향 | 엔티티 누출 · 트랜잭션 위치 |
| `modulith` | 단일 + 모듈 패키지 | 1 | — | 순환 · `internal` 접근 · 허용 의존 |
| `feature` | 단일 + 기능 패키지 | 1 | — | 기능 슬라이스 독립 · 순환 |
| `multimodule` | 프로젝트가 결정 | 1 | 등급 방향 | 타입 누출 · 순환 |

**컴파일이 막는 칸이 비어 있는 변형은 구조 테스트가 유일한 방어선이다.** 그 테스트를 지우면 아키텍처가 없어진다.

---

## 1. 모든 변형 공통 — 첫 30분

### 1.1 검증 게이트 경로 맞추기

`scripts/verify.sh` 의 `GRADLE_DIR` 를 코드 위치에 맞춘다. Maven이면 대응 명령(`mvn -q verify`)으로 교체한다.

### 1.2 버전 카탈로그 단일 소스

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "…"
springBoot = "…"

[libraries]
spring-boot-starter-web = { module = "org.springframework.boot:spring-boot-starter-web" }  # BOM이 잡으므로 versionless
archunit-junit5 = { module = "com.tngtech.archunit:archunit-junit5", version = "…" }
konsist = { module = "com.lemonappdev:konsist", version = "…" }
```

- BOM이 관리하는 라이브러리는 **versionless**로 선언한다. 버전을 개별 명시하면 BOM 정렬이 깨진다.
- 모듈 빌드 스크립트는 **별칭만** 참조한다(`libs.spring.boot.starter.web`).
- **Java는 Groovy DSL(`build.gradle`), Kotlin은 Kotlin DSL(`.kts`).** 섞지 않는다.

### 1.3 루트에서 의존성을 뿌리지 않는다

```kotlin
// 루트 build.gradle.kts — 여기까지만
subprojects {
    apply(plugin = "org.jetbrains.kotlin.jvm")
    // toolchain · 컴파일 옵션 · test 설정만. dependencies 블록 금지
}
```

`subprojects { dependencies { … } }` 로 Spring·JPA를 뿌리면 `core`·`domain`·`common` 까지 오염돼
모듈을 나눈 의미가 사라진다.

### 1.4 Spring Boot 플러그인은 실행 모듈에만

라이브러리 모듈에 붙이면 `bootJar` 가 생기고 일반 `jar` 가 비활성화돼 `project(...)` 의존이 깨진다.
**멀티모듈 변형에서 가장 흔한 첫 빌드 실패 원인이다.**

---

## 2. `hexagonal` — 컨텍스트 최상위

```kotlin
// settings.gradle.kts
rootProject.name = "my-app"
include(":my-app-core", ":my-app-common", ":my-app-bootstrap")
listOf("order", "payment").forEach { ctx ->
    listOf("domain", "application", "primary", "infra").forEach { layer ->
        include(":my-app-$ctx:$layer")
    }
}
```

디렉터리는 `my-app-order/domain/` (Gradle 기본 매핑).

| 모듈 | 의존 가능 |
|---|---|
| `:my-app-bootstrap` | `common` + 각 컨텍스트의 `primary`·`infra` |
| `:my-app-<ctx>:primary` | `application`, `common` |
| `:my-app-<ctx>:infra` | `application`, `common`, `core` |
| `:my-app-<ctx>:application` | `domain`, `core` |
| `:my-app-<ctx>:domain` | `core` |
| `:my-app-common` | `core` |
| `:my-app-core` | — |

**leaf 이름이 컨텍스트 간 중복된다**(`domain` 이 여러 개). Gradle `group` 을 `com.example.myapp.<ctx>` 로
분리해 capability 충돌을 막고, `archivesName` 을 경로 기반으로 유니크화해 jar 충돌을 막는다.

구조 테스트는 전역 `bootstrap` 테스트 소스셋에 둔다(모든 모듈이 클래스패스에 올라오는 유일한 지점).

---

## 3. `hexagonal-nested` — 도메인 컨테이너 아래 중첩

```kotlin
include(":my-app-domain:order:domain", ":my-app-domain:order:application" /* … */)
```

디렉터리는 `my-app-domain/order/domain/`. **레이어 규칙·의존 방향·`group` 분리 모두 `hexagonal` 과 같다.**
컨텍스트가 많아 리포 루트가 번잡할 때만 고른다.

---

## 4. `hexagonal-standalone` — 컨텍스트당 7모듈 자립

### 4.1 모듈명은 평면, 디렉터리는 컨텍스트별

```kotlin
// settings.gradle.kts
rootProject.name = "my-app"

val LAYERS = listOf("core", "common", "domain", "application", "primary", "infra", "bootstrap")

fun context(ctx: String, layers: List<String> = LAYERS) {
    layers.forEach { layer ->
        val path = ":my-app-$ctx-$layer"
        include(path)
        project(path).projectDir = file("$ctx/$layer")   // ← 이게 핵심
    }
}

context("order")
context("payment")
```

`projectDir` 재지정이 없으면 컨텍스트 3개에 폴더 21개가 루트를 채운다.

```
리포 루트
├── order/{core,common,domain,application,primary,infra,bootstrap}/
├── payment/{core,common,domain,application,primary,infra,bootstrap}/
└── settings.gradle.kts
```

**모듈명이 전역 유니크하므로 `group` 분리·`archivesName` 유니크화가 필요 없다.** 중첩 변형과의 실질적 차이다.

레이어를 빼려면 명시한다: `context("order", LAYERS - "infra")`. 빈 모듈을 두지 않는다.

### 4.2 `build-logic` 컨벤션 플러그인 (사실상 필수)

모듈이 7×N개라 각 빌드 스크립트에 toolchain·컴파일 옵션을 복붙하면 21곳을 동시에 고쳐야 한다.

```
build-logic/src/main/kotlin/
├── my-app.jvm-base.gradle.kts        toolchain · 컴파일 옵션 · 테스트 공통
├── my-app.pure-module.gradle.kts     core · domain — Spring/JPA 부착 금지
├── my-app.spring-module.gradle.kts   common · application · primary · infra
└── my-app.boot-app.gradle.kts        bootstrap — Spring Boot 플러그인
```

```kotlin
// order/domain/build.gradle.kts
plugins { id("my-app.pure-module") }
dependencies { implementation(project(":my-app-order-core")) }
```

`pure-module` 에 Spring/JPA를 넣지 않는 한 `core`·`domain` 의 프레임워크 오염은 구조적으로 어려워진다.

### 4.3 컨텍스트 간 의존 — 컴파일러가 막지 않는다

모듈 그래프는 `implementation(project(":my-app-payment-domain"))` 를 그냥 통과시킨다.
**구조 테스트가 유일한 기계적 방어선이다.**

```kotlin
// order/bootstrap/src/test/kotlin/…/ArchitectureTest.kt
val own = "order"
val others = listOf("payment")      // ← 컨텍스트를 추가하면 모든 컨텍스트의 이 목록을 갱신

test("다른 컨텍스트의 코드를 직접 import 하지 않는다") {
    scope.files.withPackage("com.example.myapp.$own..").assertFalse { file ->
        file.imports.any { imp ->
            others.any { other ->
                imp.name.startsWith("com.example.myapp.$other.") &&
                    !imp.name.startsWith("com.example.myapp.$other.contract.")
            }
        }
    }
}
```

**`others` 목록에 등록하지 않은 컨텍스트로 향하는 의존은 검사되지 않는다.** 등록 누락 = 강제 누락.

통합이 필요하면 HTTP/gRPC · 도메인 이벤트 · `contract` 모듈 중 하나를 고르고
`.agents/rules/structure.md` §2 표에 from·to·방법·이유·승인일을 기록한다.

### 4.4 데이터 경계

컨텍스트마다 스키마를 분리한다(기본 권장). 마이그레이션은 `<ctx>/infra/src/main/resources/db/migration/`.
**다른 컨텍스트의 테이블을 조인하지 않는다** — 컴파일러도 구조 테스트도 못 잡는다. 리뷰가 유일한 방어선.

실행 단위가 컨텍스트마다 하나이므로 포트·헬스체크·배포 파이프라인도 그만큼 필요하다.
`.agents/rules/tech.md` 의 포트 표에 등록한다.

---

## 5. `layered` — 단일 모듈

```
com.example.myapp
├── Application · config/ · common/
├── controller/{docs,dto}
├── service/
├── repository/
└── entity/
```

| 패키지 | 의존 가능 |
|---|---|
| `controller` | `service`, `common`, 자신의 `dto` |
| `service` | `repository`, `entity`, `common` |
| `repository` | `entity`, `common` |
| `entity` | `common` 만 |

**모듈 그래프가 없다. ArchUnit이 전부다.**
`src/test/…/architecture/LayeredArchitectureTest` 에 최소 4개 규칙을 둔다.

| 규칙 | 잡는 것 |
|---|---|
| `layeredArchitecture()` | 역방향 접근 |
| 건너뛰기 금지 | `controller` → `repository` |
| 엔티티 web 무의존 | `entity`·`repository` → `org.springframework.web` |
| 트랜잭션 위치 | `controller`·`repository` 의 `@Transactional` |

---

## 6. `layered-multimodule` — 레이어 = 모듈

```kotlin
// settings.gradle.kts
include(":my-app-api", ":my-app-service", ":my-app-domain", ":my-app-common")
// 필요할 때: ":my-app-batch", ":my-app-admin", ":my-app-client"
```

| 모듈 | 의존 가능 | Spring Boot 플러그인 |
|---|---|---|
| `api` · `batch` · `admin` | `service`, `common` | ✅ |
| `service` | `domain`, `client`, `common` | ✗ |
| `domain`(엔티티 + 리포지토리) | `common` | ✗ |
| `client` | `common` | ✗ |
| `common` | — | ✗ |

### 6.1 엔티티 노출 범위 — 설치 직후 정한다

```kotlin
// my-app-service/build.gradle.kts
api(project(":my-app-domain"))               // (A) 실행 단위가 엔티티를 본다
// implementation(project(":my-app-domain")) // (B) 컴파일러가 차단
```

| 방식 | 강제 | 대가 |
|---|---|---|
| **(A)** 기본 | ArchUnit 이 컨트롤러 시그니처를 막는다 | 매핑 한 겹 절약 |
| (B) | **컴파일러** | 서비스 결과 모델 + 매핑 한 겹 |

실행 단위가 3개 이상이거나 API 스펙을 외부 공개하면 (B)가 값을 한다.
**고른 방식을 `.agents/rules/structure.md` §1.2 에 기록한다.** 안 적으면 다음 사람이 반대로 선언한다.

### 6.2 구조 테스트 (`api` 모듈 테스트 소스셋)

| 규칙 | 잡는 것 |
|---|---|
| 컨트롤러는 엔티티를 반환하지 않는다 | (A) 방식의 유일한 방어선 |
| 트랜잭션은 `service` 에만 | `api`·`domain`·`client` 의 `@Transactional` |
| `domain`·`client` 는 web 을 모른다 | `org.springframework.web` 의존 |
| `common` 은 프레임워크를 모른다 | Spring Web·JPA 의존 |
| `service` 는 컨트롤러 DTO 를 모른다 | 표현 관심사 역류 |

### 6.3 실행 단위를 늘릴 때

**배포 주기·스케일·보안 경계가 다를 때만** 만든다("관리자 화면"은 대개 경로 분리로 충분하다).
포트 표 등록 + 배포 파이프라인 + **마이그레이션 적용 주체를 하나로** 정한다(나머지는 `validate`).
실행 단위끼리 의존하지 않는다.

---

## 7. `modulith` — 단일 모듈 + Spring Modulith

```
com.example.myapp
├── shared/
└── <module>/            ← 공개 표면 = 모듈 루트의 타입
    └── internal/        ← 구현. 다른 모듈이 접근하면 verify() 실패
```

- 의존성: `spring-modulith-starter-core` · `spring-modulith-starter-test`
- 검증: `ApplicationModules.of(Application.class).verify()` — 순환 · `internal` 접근 · 허용 의존을 함께 본다
- **Kotlin이면** `@ApplicationModule` 선언용 `package-info.java` 만 `src/main/java` 에 둔다

---

## 8. `feature` — 단일 모듈 + 기능 슬라이스

```
com.example.myapp
├── config/ · common/
└── <feature>/{api,web,service,repository,domain}
```

- 강제: ArchUnit 슬라이스 — `slices().matching("…(*)..").should().beFreeOfCycles()` +
  `notDependOnEachOther()`
- 기능 간 통신은 `<feature>/api` 공개 계약을 경유한다. 직접 import 금지.

---

## 9. `multimodule` — 분할 축을 프로젝트가 정한다

킷이 강제하는 것은 **등급 방향 하나**뿐이다.

| 등급 | 개수 | 의존 가능 |
|---|---|---|
| 실행(runtime) | 1 | 구성 · 공유 전부 |
| 구성(component) | N | 공유만 |
| 공유(shared) | 0~2 | 없음 |

분할 축(도메인 · 연동 대상 · 기술 관심사 · 공개 표면)과 네이밍은 프로젝트가 정해
`ARCHITECTURE.md` §3.1~3.3 의 **"채택한 규약" · "모듈 등급표" · "허용 간선표"** 빈칸을 채운다.
그게 첫 작업이다.

구조 테스트(`ModuleBoundaryTest`)의 `<persistence-module>`·`<vendor-module>`·`<shared>` 자리표시자를
**실제 모듈명으로 채워야 작동한다.** 안 채우면 아무것도 검사하지 않는다.

---

## 10. 공통 함정

| 증상 | 원인 |
|---|---|
| 라이브러리 모듈을 `project(...)` 로 못 쓴다 | Spring Boot 플러그인을 붙였다(`bootJar` 생성) |
| `core`·`domain` 에 Spring이 딸려 왔다 | 루트 `subprojects { dependencies }` |
| 다른 모듈의 빈이 안 잡힌다 | 라이브러리 `@Configuration` 은 스캔 범위 밖 → `@AutoConfiguration` + `AutoConfiguration.imports` 또는 명시적 `@Import`. **`@ComponentScan` 으로 남의 패키지를 긁지 않는다** |
| 구조 테스트가 항상 통과한다 | 자리표시자 미치환 · 패키지명 오타. `failOnEmptyShould` 기본값 `true` 를 끄지 않는다 |
| capability 충돌 / jar 이름 중복 | leaf 모듈명 중복(`hexagonal`·`hexagonal-nested`) → `group` 분리 + `archivesName` |
| 엔티티가 API 응답으로 샌다 | 구조 테스트의 컨트롤러 시그니처 규칙 부재 |
| 엔티티 메서드의 `@Transactional` 이 안 먹는다 | 프록시 대상이 아니다. 트랜잭션은 유스케이스·서비스에만 |

## 관련 문서

- [02-choosing-architecture.md](02-choosing-architecture.md) — 어떤 변형을 고를까
- [01-getting-started.md](01-getting-started.md) — 설치부터 첫 기능까지
- 설치 후 원본: `ARCHITECTURE.md` · `.agents/rules/structure.md` · `.agents/rules/tech.md` ·
  `.agents/rules/design-principles.md`(객체지향·클린 아키텍처·SOLID)
