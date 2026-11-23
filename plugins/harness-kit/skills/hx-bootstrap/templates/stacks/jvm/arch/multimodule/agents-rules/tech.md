<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: multimodule · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (Gradle 멀티모듈)

모듈 등급·의존 방향의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

> 이 문서는 라이브러리를 정해주지 않는다. §1이 이 변형이 *구조적으로 요구하는 것*이고,
> 나머지(웹 프레임워크·ORM·HTTP 클라이언트·테스트 도구·린터)는 **프로젝트가 필요한 것만 골라 카탈로그에 추가**한다.
> 쓰지도 않을 스타터를 미리 넣지 않는다 — 멀티모듈에서는 **한 모듈에 넣은 의존이 그 모듈을 오염**시킨다.

## 1. 이 변형이 요구하는 것 (나머지는 전부 선택)

| 요구 | 이유 | 선택지 |
|---|---|---|
| **Gradle 멀티모듈**(wrapper 포함) | 의존 방향을 컴파일 레벨에서 강제하는 수단 자체 | Maven 멀티모듈도 가능하나 이 문서 예시는 Gradle 기준 |
| **버전 카탈로그**(`gradle/libs.versions.toml`) | 모듈이 늘어도 버전·좌표가 한 곳 | — (모듈마다 버전을 박으면 곧 어긋난다) |
| 구조 테스트 도구 1개 | 모듈 그래프가 못 잡는 타입 누출 차단(`ARCHITECTURE.md` §3.6) | Java=ArchUnit / Kotlin=Konsist |
| **실행 모듈 1개에만 실행 패키징** | 라이브러리 모듈이 실행형으로 패키징되면 클래스 로딩이 깨진다 | §5 |

그 외 전부 — Spring Web을 쓸지, JPA를 쓸지, 어떤 HTTP 클라이언트·목 서버·린터를 쓸지 — 는 프로젝트가 정한다.

## 2. 언어별 빌드 DSL (섞지 않는다)

| 언어 | 빌드 스크립트 | 이유 |
|---|---|---|
| Java | `settings.gradle` · `build.gradle` (Groovy DSL) | Java 프로젝트에 Kotlin DSL을 쓰면 빌드 스크립트만 Kotlin이 되어 팀 러닝커브·스크립트 컴파일 시간을 얹는다 |
| Kotlin | `settings.gradle.kts` · `build.gradle.kts` (Kotlin DSL) | 애플리케이션 언어와 같아 타입 안전 접근자·자동완성 이득이 그대로 |

- 한 리포에서 DSL을 섞지 않는다. 모듈마다 `.gradle`과 `.gradle.kts`가 섞이면 컨벤션이 두 벌이 된다.
- 버전 카탈로그(`libs.versions.toml`)는 **두 DSL 모두 동일**하다. 참조 문법만 다르다(§3.3).

> **이 프로젝트의 선택**: `(Java + Groovy DSL / Kotlin + Kotlin DSL 중 하나를 적는다)`

## 3. 버전 카탈로그 (`gradle/libs.versions.toml`)

`gradle/libs.versions.toml`은 **Gradle이 자동으로 인식**한다 — `settings.gradle`에 별도 설정이 필요 없다.

### 3.1 파일 구조

```toml
# gradle/libs.versions.toml
# 이 프로젝트가 "실제로 쓰는 것"만 적는다. 안 쓰는 항목은 지운다.

[versions]
# 여러 라이브러리가 버전을 공유할 때만 여기에 둔다.
java        = "<LTS 버전>"          # toolchain 에서 참조
spring-boot = "<최신 안정 버전>"
archunit    = "<최신 안정 버전>"

[libraries]
# BOM(플랫폼) — 이걸 import 하면 아래 것들은 버전을 안 적어도 된다.
spring-boot-bom          = { module = "org.springframework.boot:spring-boot-dependencies", version.ref = "spring-boot" }

# BOM 이 관리하는 것은 version 없이 선언한다(BOM 정렬이 깨지지 않게).
# 아래 두 줄은 "형식 예시"다 — 실제로 쓸 것만 남기고 나머지는 지운다.
spring-boot-starter      = { module = "org.springframework.boot:spring-boot-starter" }
spring-boot-starter-test = { module = "org.springframework.boot:spring-boot-starter-test" }

# BOM 밖 서드파티만 버전을 명시한다.
archunit-junit5          = { module = "com.tngtech.archunit:archunit-junit5", version.ref = "archunit" }

[bundles]
# 같은 묶음이 3개 모듈 이상에서 반복될 때만 만든다. 남용하면 무엇이 들어오는지 안 보인다.
# 예: architecture-test = ["archunit-junit5", "spring-boot-starter-test"]

[plugins]
spring-boot = { id = "org.springframework.boot", version.ref = "spring-boot" }
```

### 3.2 별칭 → 접근자 규칙

별칭의 `-`/`_`는 접근자에서 `.`이 된다.

| 카탈로그 별칭 | 접근자 |
|---|---|
| `spring-boot-starter-web` | `libs.spring.boot.starter.web` |
| `archunit-junit5` | `libs.archunit.junit5` |
| `[versions] spring-boot` | `libs.versions.spring.boot` |
| `[plugins] spring-boot` | `libs.plugins.spring.boot` |
| `[bundles] architecture-test` | `libs.bundles.architecture.test` |

### 3.3 참조 문법 (DSL별)

```groovy
// Java · build.gradle (Groovy DSL)
dependencies {
    implementation platform(libs.spring.boot.bom)   // BOM 먼저 — 아래 것들의 버전을 잡아준다
    implementation libs.spring.boot.starter
    testImplementation libs.spring.boot.starter.test
}
```

```kotlin
// Kotlin · build.gradle.kts (Kotlin DSL)
dependencies {
    implementation(platform(libs.spring.boot.bom))
    implementation(libs.spring.boot.starter)
    testImplementation(libs.spring.boot.starter.test)
}
```

### 3.4 카탈로그 규칙

- 버전·좌표를 모듈 빌드 스크립트에 직접 박지 않는다. 모듈이 늘어나면 반드시 어긋난다.
- BOM(플랫폼)이 관리하는 라이브러리는 버전 없이 선언한다. 개별 버전을 명시하면 BOM 정렬이 깨져 런타임에 이상한 조합이 뜬다.
- **BOM 밖 서드파티만 버전을 명시**한다.
- 새 의존성은 **카탈로그에 추가한 뒤** 라이선스·유지보수 상태를 확인하고 쓴다.
- 카탈로그에 안 쓰는 항목을 남겨두지 않는다. 지운다.

## 4. 멀티모듈 빌드 골격

아래는 **구조 골격**이다. 어떤 플러그인·라이브러리를 실제로 적용할지는 프로젝트가 정한다.

### 4.1 `settings.gradle` — 모듈 등록

```groovy
rootProject.name = '{{PROJECT_SLUG}}'

// 모듈 추가 = 여기 한 줄. 이름은 ARCHITECTURE.md §3.2 에서 정한 규약을 따른다.
include '<shared>'
include '<module-a>'
include '<runtime>'
```

### 4.2 루트 `build.gradle` — 컨벤션만, 의존성은 금지

```groovy
plugins {
    // 루트는 버전만 선언하고 적용하지 않는다(apply false).
    // 루트에 Spring Boot 플러그인을 적용하면 루트가 실행 모듈처럼 동작한다.
    alias(libs.plugins.spring.boot) apply false
}

subprojects {
    apply plugin: 'java'          // Kotlin 이면 'org.jetbrains.kotlin.jvm'

    group   = '{{PACKAGE_NS}}'
    version = '0.0.1-SNAPSHOT'

    repositories { mavenCentral() }

    java {
        toolchain { languageVersion = JavaLanguageVersion.of(<java 버전>) }
    }

    tasks.named('test') { useJUnitPlatform() }
}
```

> `subprojects { dependencies { … } }` 로 라이브러리를 뿌리지 않는다.
> 모든 모듈이 같은 의존을 갖게 되어 모듈로 자른 의미가 사라진다. 공통으로 둘 것은 위처럼
> toolchain·repositories·test 같은 **컨벤션**뿐이고, 의존은 각 모듈이 자기 것만 선언한다.
> 컨벤션이 커지면 `buildSrc`의 convention plugin으로 옮긴다.

### 4.3 모듈별 `build.gradle` — 의존은 등급 규칙대로

```groovy
// <shared> — 공유 등급. 프레임워크 무의존이 핵심.
dependencies {
    // 계약·공용 모델만 두는 곳이다. Spring Web·JPA·벤더 SDK 를 넣지 않는다.
    // 검증/직렬화 어노테이션이 꼭 필요하면 compileOnly 로 최소화하고 왜 필요한지 답한다.
}
```

```groovy
// <module-a> — 구성 등급. 공유 등급 + 이 모듈이 실제로 쓰는 라이브러리뿐.
dependencies {
    implementation project(':<shared>')
    implementation platform(libs.spring.boot.bom)

    // 이 모듈이 실제로 쓰는 것만 추가한다.
    // 영속 모듈이면 ORM, 외부 연동 모듈이면 HTTP 클라이언트 — 서로의 것을 넣지 않는다.
}
```

```groovy
// <runtime> — 실행 등급. 여기서만 Spring Boot 플러그인을 적용한다.
plugins {
    id 'org.springframework.boot'          // 버전은 루트에서 이미 선언됨
}

dependencies {
    implementation project(':<shared>')
    implementation project(':<module-a>')  // 구성 모듈을 여기서 조립한다
    implementation platform(libs.spring.boot.bom)

    // 구조 테스트 — 없으면 모듈 경계가 강제되지 않는다(ARCHITECTURE.md §3.6)
    testImplementation libs.archunit.junit5
}
```

- 구성 모듈의 `dependencies`에 다른 구성 모듈을 넣지 않는다(`ARCHITECTURE.md` §3.4의 기록된 예외만).
- 모듈이 **실제로 컴파일에 쓰는 것만** 선언한다. "혹시 몰라서" 넣은 의존이 경계를 무너뜨린다.
- 다른 모듈에 **전이시켜야 하는 것만** `api`로 선언한다(`java-library` 플러그인). 기본은 `implementation`이다.

## 5. 실행 패키징 (멀티모듈에서 가장 자주 틀리는 곳)

실행 가능한 아티팩트는 실행 모듈 하나뿐이다.

- **권장**: Spring Boot 플러그인을 실행 모듈에만 적용한다(루트는 `apply false`). 이러면 나머지 모듈에는 `bootJar` 태스크 자체가 생기지 않아 끄는 것을 잊을 일이 없다.
- 이미 모든 모듈에 플러그인을 적용한 프로젝트라면 라이브러리 모듈에서 명시적으로 꺼야 한다:

```groovy
// 라이브러리 모듈 — Boot 플러그인이 적용된 경우에만 필요
bootJar { enabled = false }
jar      { enabled = true  }
```

- 반대로 하면(라이브러리 모듈까지 `bootJar` 활성) 그 jar가 실행형 레이아웃(`BOOT-INF/`)으로 패키징되어 다른 모듈이 클래스를 못 찾는다.
- 라이브러리 모듈이 Boot 플러그인 없이도 BOM 버전 정렬을 받게 하려면 `platform(libs.…bom)` 을 쓴다(§4.3). 그래서 플러그인을 실행 모듈에만 적용해도 문제가 없다.
- `@SpringBootApplication`은 **실행 모듈에만** 둔다. 라이브러리 모듈의 `@Configuration`은 스캔 범위 밖이므로 `@AutoConfiguration` + `META-INF/spring/…AutoConfiguration.imports`로 스스로 등록하거나 실행 모듈이 `@Import` 한다(`ARCHITECTURE.md` §4.2).

## 6. 빌드 / 실행 명령

```bash
./gradlew build                                # 전체 모듈 컴파일 + 패키징 + 테스트
./gradlew check                                # 검증 게이트(린트 + 테스트 + 구조) — scripts/verify.sh 가 호출
./gradlew :<runtime>:bootRun                   # 로컬 실행 (server.port=8080)
./gradlew :<runtime>:test --tests '*ModuleBoundaryTest'              # 구조 경계 검증만
./gradlew :<runtime>:dependencies --configuration runtimeClasspath   # 의존 그래프 확인
./gradlew projects                             # 등록된 모듈 목록 확인
```

> Maven 멀티모듈이면 `mvn verify`(빌드+테스트), `mvn -pl <runtime> spring-boot:run`(로컬 실행)로 치환한다.

- 강제 게이트는 `scripts/verify.sh` 한 곳(예: `./gradlew check --no-daemon -q`). hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- **의존 방향 위반은 컴파일 실패**로 나타난다. 원인이 모호하면 `:<runtime>:dependencies`로 그래프를 본다.
- 타입 누출은 `./gradlew check`의 `ModuleBoundaryTest` 실패로 나타난다.
- 멀티모듈은 전체 빌드가 느리다. 작업 중에는 `:<모듈>:test`로 좁히고, 커밋 전에는 반드시 `scripts/verify.sh` 전체를 돌린다. 느리면 `gradle.properties`에 `org.gradle.parallel=true`·`org.gradle.caching=true`부터 켠다.

## 7. 테스트 도구 (프로젝트가 고르되 지킬 규약)

- 구조 테스트는 필수다(§1). 나머지 도구는 필요할 때 카탈로그에 추가한다.
- **외부 연동 모듈은 HTTP 목 서버로 테스트**한다(도구는 프로젝트 선택). 최소 시나리오: 200 정상 · 5xx · 타임아웃 · 429 · 깨진 응답 · 빈 결과.
- 실제 외부 시스템을 때리는 테스트를 `./gradlew check` 기본 경로에 두지 않는다. 남의 가용성에 빌드를 묶고, CI에 실 자격증명이 있어야 하며, rate limit에 걸린다. 계약 확인이 필요하면 태그로 분리해 수동/야간 실행한다.
- 외부 응답 샘플은 `src/test/resources/fixtures/<vendor>/`에 두고 **스키마가 바뀌면 픽스처부터 갱신**한다.
- 응답 역직렬화는 **알 수 없는 필드에 관대하게** 설정한다(예: Jackson `FAIL_ON_UNKNOWN_PROPERTIES=false`). 상대가 필드를 추가했다고 우리 서비스가 죽으면 안 된다.
- 목 서버 포트는 **랜덤**을 쓴다(고정 포트는 병렬 테스트에서 충돌).
- 원자적 카운터 증가(`UPDATE … SET count = count + 1`) 같은 동시성 동작은 인메모리 DB가 아니라 운영과 같은 DB로 검증한다(Testcontainers 선택 — 사용 시 로컬 Docker 필요).

## 8. 로컬 개발 / 설정

- 로컬 인프라(DB 등)는 `docker compose`로 기동한다. 부가 구성요소는 **필요할 때 선택적으로** 추가한다.
- 자격증명·시크릿은 환경변수/시크릿 매니저에서만 온다. `.env`는 git-ignore(`.env.example`만 커밋), `application.yml`에는 `${ENV_VAR}` 참조만 둔다.
- 설정은 `@ConfigurationProperties`로 외부화하고 **모듈 이름을 prefix**로 쓴다 — 소유가 드러나고 모듈을 떼어낼 때 그대로 옮겨진다. `@Value` 필드 주입은 쓰지 않는다(테스트에서 값을 바꿔 끼울 수 없다).
- 인스턴스가 2대 이상이 되는 순간 JVM 로컬 락·`static` 캐시는 전부 깨진다는 것을 전제로 코드를 쓴다.

## 9. 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (`:<runtime>`) | 8080 |
| 관계형 DB(선택) | 5432(PostgreSQL) / 3306(MySQL) |
| HTTP 목 서버(테스트) | 랜덤(고정 금지) |
| 그 외 선택 구성요소 | 프로젝트에서 지정 |

## 10. 명령 실행 주의 (macOS / zsh)

- dev 서버(`bootRun`)·watch 등 장시간 프로세스는 백그라운드로 실행한다.
- 테스트는 단발 실행한다(watch 금지). Gradle 데몬 상태가 의심되면 `./gradlew --stop` 후 재실행한다.
- 구조 검증만 빠르게 보려면 `--tests '*ModuleBoundaryTest'`로 좁혀 실행한다.

---

> 기준 버전은 프로젝트가 확정한다. 이 문서와 `gradle/libs.versions.toml`의 `<...>` 자리를 채우고,
> 확정 시점·근거(왜 이 버전인지, 무엇과의 호환 때문인지)를 함께 기록한다.
