<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Kotlin/Java + Spring Boot(JVM) · 아키텍처: layered -->

# ARCHITECTURE — {{PROJECT_NAME}} (레이어드 · 단일 모듈)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 레이어드 아키텍처(controller → service → repository → entity) 를 **단일 Gradle 모듈** 위에서 구현한다.
모듈 그래프가 없으므로 의존 방향은 ArchUnit 구조 테스트가 `./gradlew check`에서 실패로 강제한다(리뷰가 아니라 게이트).

스택 기준(버전 기준은 프로젝트의 버전 카탈로그(예: `gradle/libs.versions.toml`) 단일 소스 — 구체 버전은 예시이며 프로젝트에서 최신 안정 버전으로 확정):
Kotlin/Java · Spring Boot(JVM) · Gradle(단일 모듈, wrapper) · Spring Data JPA · Spring Security · ArchUnit · JUnit5/Kotest.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 도메인 경계가 아직 하나다(바운디드 컨텍스트를 나눌 근거가 없다).
- CRUD 비중이 높고 비즈니스 규칙이 "데이터 + 얇은 정책" 수준이다.
- 팀이 작고(1~5명) 빌드·인지 비용을 낮게 유지하는 것이 우선이다.
- Spring Boot 관례를 그대로 따르는 팀이라 학습 비용을 0에 가깝게 두고 싶다.

**쓰지 않는다:**
- 서로 독립적으로 소유·배포될 도메인이 이미 둘 이상 보인다 → `modulith` 또는 `feature`.
- 도메인 규칙이 복잡해 **JPA 엔티티와 분리된 순수 도메인 모델**이 필요하다 → `hexagonal`.
- 저장소·외부 시스템을 교체 가능하게 유지해야 한다(포트/어댑터가 실익이다) → `hexagonal`.

승격 신호(이 중 둘 이상이면 전환을 검토한다):
1. `service` 패키지에 서로 무관한 도메인의 클래스가 10개 넘게 쌓인다.
2. 서비스끼리 부르는 호출 그래프가 순환하기 시작한다.
3. "이 규칙이 어느 서비스 소유인가"를 두고 논쟁이 반복된다.
4. JPA 엔티티에 규칙을 넣기 애매해 전부 서비스로 흘러나간다(Anemic Domain).

전환 절차는 §11.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 레이어 단방향 의존 (controller→service→repository→entity) | ArchUnit `layeredArchitecture()` | `./gradlew check` 실패 |
| 레이어 건너뛰기 금지 (controller ↛ repository) | ArchUnit 규칙 | `./gradlew check` 실패 |
| entity·repository는 web 타입 무의존 | ArchUnit 규칙(`org.springframework.web..` 금지) | `./gradlew check` 실패 |
| API 응답 일관성 | `common`의 envelope + `ErrorCode` 단일 매핑 + `GlobalExceptionHandler` | 코드리뷰·핸들러가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(service 우선) | `./gradlew check` 게이트 |

> 기계적 강제 우선. 단일 모듈에서는 컴파일러가 레이어를 막아주지 않으므로 구조 테스트가 컴파일 강제의 대체물이다.
> 구조 테스트는 아키텍처 문서와 같은 무게로 관리한다(테스트를 지우는 것 = 아키텍처를 지우는 것).

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌──────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}     │
 │(Web/CLI) │        │  (Spring Boot 단일 앱) │
 └──────────┘        └──────────┬───────────┘
                                │
        ┌──────────────┬────────┴───────┬──────────────┐
        ▼              ▼                ▼              ▼
  ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
  │ 관계형 DB   │ │ Cache/Queue │ │ Object Store│ │ 외부 시스템 │
  │  (선택)     │ │  (선택)      │ │  (선택)      │ │  (선택)     │
  └────────────┘ └─────────────┘ └─────────────┘ └────────────┘
```

- 데이터 저장소·부가 구성요소는 **모두 선택**이며 프로젝트가 채택 여부를 정한다.
- 서비스 인스턴스는 **무상태**. 세션/락 상태는 외부 저장소(DB·캐시)에 둔다.
- 배포 단위는 **JAR + 컨테이너** 하나다.

---

## 3. 레이어 구조 (단일 모듈)

```
        요청
         │
    ┌────▼─────────────────────────────────────┐
    │ controller/  REST 경계 · DTO · 상태코드   │  Spring Web 을 아는 유일한 레이어
    └────┬─────────────────────────────────────┘
    ┌────▼─────────────────────────────────────┐
    │ service/     비즈니스 규칙 · 트랜잭션 경계 │
    └────┬─────────────────────────────────────┘
    ┌────▼─────────────────────────────────────┐
    │ repository/  Spring Data JPA · 쿼리       │  쿼리는 여기서 끝난다
    └────┬─────────────────────────────────────┘
    ┌────▼─────────────────────────────────────┐
    │ entity/      JPA 엔티티(테이블 매핑)       │
    └──────────────────────────────────────────┘
         │
    ┌────▼─────────────────────────────────────┐
    │ common/      envelope · ErrorCode · 예외   │  web 공유 커널
    └──────────────────────────────────────────┘
```

### 3.1 레이어 ↔ 의존 가능

| 패키지 | 책임 | 의존 가능 |
|---|---|---|
| `{{PACKAGE_NS}}.Application` | `@SpringBootApplication` 진입점 | 전부(조립 목적) |
| `{{PACKAGE_NS}}.config` | Spring 설정(Security·OpenAPI·Jackson·Async·Cache) | 전부(조립 목적) |
| `{{PACKAGE_NS}}.controller` | 라우팅·DTO·검증·상태코드·인증 주체 추출 | `service`, `common`, 자신의 `dto` |
| `{{PACKAGE_NS}}.service` | 비즈니스 규칙·**트랜잭션 경계**·정책 검사·이벤트 발행 | `repository`, `entity`, `common` |
| `{{PACKAGE_NS}}.repository` | 쿼리 작성·실행·페이지네이션 | `entity`, `common` |
| `{{PACKAGE_NS}}.entity` | 테이블 매핑·제약·인덱스·상태 불변식 | `common`(상수·enum)만 |
| `{{PACKAGE_NS}}.common` | envelope·`ErrorCode`·`GlobalExceptionHandler`·`RequestIdFilter`·공용 상수 | — |

- **의존 금지(구조 테스트 차단)**: `service → controller`, `repository → service/controller`, `entity → 위 전부`, `entity·repository → org.springframework.web`.
- 레이어를 건너뛰지 않는다: `controller`가 `repository`를 직접 부르지 않는다(트랜잭션·정책이 service에 있어 우회하면 규칙이 새어 나간다).
- `dto`는 `controller` 하위(`controller/dto`)에 둔다. 엔티티를 컨트롤러 시그니처에 노출하지 않는다.

### 3.2 ArchUnit 구조 테스트 (컴파일 강제의 대체물)

`src/test/kotlin/{{PACKAGE_NS}}/architecture/LayeredArchitectureTest.kt`에 두면 `./gradlew check`(= `scripts/verify.sh`)가 자동으로 돌린다.

```kotlin
// build.gradle.kts (testImplementation): com.tngtech.archunit:archunit-junit5:<version>
package {{PACKAGE_NS}}.architecture

import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import com.tngtech.archunit.library.Architectures.layeredArchitecture

/** 단일 모듈이라 컴파일러가 막지 못하는 레이어 방향을 테스트로 강제한다. */
@AnalyzeClasses(
    packages = ["{{PACKAGE_NS}}"],
    importOptions = [ImportOption.DoNotIncludeTests::class],
)
class LayeredArchitectureTest {

    @ArchTest
    val 레이어_단방향: ArchRule = layeredArchitecture().consideringOnlyDependenciesInLayers()
        .layer("Controller").definedBy("..controller..")
        .layer("Service").definedBy("..service..")
        .layer("Repository").definedBy("..repository..")
        .layer("Entity").definedBy("..entity..")
        .whereLayer("Controller").mayNotBeAccessedByAnyLayer()
        .whereLayer("Service").mayOnlyBeAccessedByLayers("Controller")
        .whereLayer("Repository").mayOnlyBeAccessedByLayers("Service")

    @ArchTest
    val 레이어_건너뛰기_금지: ArchRule = noClasses()
        .that().resideInAPackage("..controller..")
        .should().dependOnClassesThat().resideInAPackage("..repository..")

    @ArchTest
    val 엔티티는_web_무의존: ArchRule = noClasses()
        .that().resideInAnyPackage("..entity..", "..repository..")
        .should().dependOnClassesThat().resideInAnyPackage("org.springframework.web..", "..controller..")

    @ArchTest
    val 트랜잭션은_서비스에만: ArchRule = noClasses()
        .that().resideInAnyPackage("..controller..", "..repository..")
        .should().beAnnotatedWith("org.springframework.transaction.annotation.Transactional")
}
```

> **레이어 패키지를 추가하면 이 테스트에 등록**한다. 등록하지 않은 패키지는 강제 대상 밖이다(등록 누락 = 강제 누락).
> 규칙이 0개 클래스를 검사하면 ArchUnit 1.x는 실패시킨다(`archRule.failOnEmptyShould` 기본값 `true`). 패키지명 오타나 패키지 이동으로 규칙이 조용히 죽는 것을 잡는 자동 감지이므로 `archunit.properties`에서 끄지 않는다.
> Kotlin이면 Konsist로도 같은 규칙을 표현할 수 있다. 어느 쪽이든 위반을 `./gradlew check`에서 실패로 만드는 것이 핵심이다.

### 3.3 디렉터리 레이아웃

```
{{PROJECT_SLUG}}/
├── settings.gradle.kts             # 단일 모듈(rootProject 만 등록)
├── build.gradle.kts                # 플러그인·의존성·JVM toolchain
├── gradle/libs.versions.toml       # 버전 단일 소스
├── src/main/kotlin/{{PACKAGE_NS}}/
│   ├── Application.kt              #   @SpringBootApplication
│   ├── config/                     #   SecurityConfig · OpenApiConfig · JacksonConfig …
│   ├── common/                     #   envelope · ErrorCode · GlobalExceptionHandler · RequestIdFilter
│   ├── controller/
│   │   ├── {{DOMAIN_EXAMPLE}}Controller.kt
│   │   ├── docs/                   #   *Api 인터페이스(OpenAPI 문서 전담)
│   │   └── dto/                    #   요청·응답 DTO
│   ├── service/{{DOMAIN_EXAMPLE}}Service.kt
│   ├── repository/{{DOMAIN_EXAMPLE}}Repository.kt
│   └── entity/{{DOMAIN_EXAMPLE}}.kt
├── src/main/resources/
│   ├── application.yml · application-{dev,prod}.yml
│   └── db/migration/               # 마이그레이션 도구 스크립트
├── src/test/kotlin/{{PACKAGE_NS}}/
│   ├── architecture/LayeredArchitectureTest.kt
│   └── (레이어별 테스트)
└── scripts/verify.sh               # 단일 검증 게이트
```

- 단일 모듈이다. `settings.gradle.kts`에 하위 모듈을 추가하기 시작하면 그건 `hexagonal`로 가는 신호다(§11).
- 클래스명은 도메인 개념으로 짓고 레이어 접미사로 역할을 드러낸다(`*Controller`·`*Service`·`*Repository`).

---

## 4. 레이어 책임

| 레이어 | 해야 할 일 | 하면 안 되는 일 |
|---|---|---|
| `controller` | 입력 검증(`@Valid`), 인증 주체 추출, 서비스 호출, envelope 응답 | 비즈니스 분기, JPA 접근, 트랜잭션 제어 |
| `service` | 비즈니스 규칙, 권한·정책 검사, **트랜잭션 경계**, 여러 리포지토리 조합, 이벤트 발행 | web 타입(`ResponseEntity`·`HttpStatus`) 참조, 응답 포맷 결정 |
| `repository` | 쿼리 작성·실행, 페이지네이션 | 비즈니스 판단, 트랜잭션 시작 |
| `entity` | 테이블 매핑·제약·상태 불변식 메서드 | 서비스 호출, web 타입 참조 |
| `common` | 예외 계층·`ErrorCode`·envelope·필터 | 도메인 규칙 |

- **트랜잭션 경계는 service에만**. `@Transactional`은 서비스 메서드에 붙이고 컨트롤러·리포지토리에는 붙이지 않는다(경계 분산 금지). 읽기 전용은 `@Transactional(readOnly = true)`.
- 비즈니스 규칙은 service 또는 entity에. 컨트롤러에 `if` 분기로 규칙을 흘리지 않는다. 상태 불변식은 엔티티 메서드로 표현하고 setter 남발을 피한다(Anemic Domain 회피).
- **생성자 주입 only**. `@Autowired` 필드/세터 주입·`lateinit var` 의존성 금지. 시간·난수·ID는 인터페이스(`Clock`·`IdGenerator`)로 주입한다(결정성·테스트 가능).
- 예외는 도메인 예외로 올린다. 서비스가 `ResponseStatusException`을 던지지 않는다. `common`의 `GlobalExceptionHandler`가 예외 → 상태코드·`ErrorCode`로 한 곳에서 변환한다.
- 로깅은 controller/service/repository 경계에서만, 한 번만(중복 로깅 금지). 민감정보(토큰·시크릿·개인정보)는 로그 금지.
- **DB 접근**: 표준 CRUD는 Spring Data JPA. 복잡 조회·통계는 별도 쿼리 메서드나 타입세이프 빌더로 분리한다. 엔티티를 그대로 응답에 내보내지 않는다(항상 DTO 변환).
- **N+1 방지**: 연관은 기본 `LAZY`, 필요한 곳에서 fetch join·`@EntityGraph`로 명시적으로 로딩한다.

---

## 5. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. 코드로 말할 수 없는 것 — Why · 함정 · 외부 근거 · 억제 이유 — 만 적는다.
- 단계별 `처리 흐름:`은 분기가 얽혀 절차가 안 잡히거나, 순서를 바꾸면 버그가 나는 함수에 쓴다. 5단계 이내.
- CRUD·getter·위임·매퍼·DTO에는 달지 않는다. 규칙 문서로 보내는 참조 주석도 쓰지 않는다. yml·SQL은 값의 근거만 한 줄.
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 6. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 컴파일 타임 도메인 상수 | 코드 의미를 갖는 고정 라벨·키 | `const`/`enum`/`object`(소유 레이어) |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `application.yml` + `@ConfigurationProperties`(+ env) |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블·기능 플래그(캐시·무효화 동반) |

- 에러코드·사용자 메시지는 문자열 리터럴 금지: 코드는 `common`의 `ErrorCode`, 메시지는 i18n 키로 경계가 `MessageSource`로 해석한다.
- URL·호스트·타임아웃은 (b)로 외부화한다. 하위 레이어에서 `System.getenv` 직접 호출 금지 — `@ConfigurationProperties` 객체를 주입받는다.

---

## 7. 성능 예산 (부하테스트로 확정)

- 무한/대량 결과 금지: 목록은 페이지네이션 + 상한 `size` 강제. 전체 스캔·메모리 적재 금지.
- **N+1 회피**: fetch join·`@EntityGraph`·배치 조회. WHERE/JOIN/ORDER BY 컬럼에 인덱스 동반.
- **핫패스 경량화**: 인증·키 검증 등 고빈도 경로는 단건 인덱스 조회 + 캐시(TTL·무효화 동반).
- **동기 응답 경로 보호**: 무거운 작업은 요청-응답 경로 밖(비동기 작업)으로.
- **커넥션 풀 사이징**: 워커·스레드 수와 함께 계산한다(가상 스레드를 켜도 DB 동시성 상한은 풀이 결정).

| 경로 부류 | 예 | 목표(예시 — 프로젝트 확정) | 도달 레버 |
|---|---|---|---|
| 캐시/인증 핫패스 | 키 검증·캐시 조회 | 고 TPS/인스턴스 | 캐시로 DB 왕복 제거 |
| 일반 읽기 | 목록·상세 | 수천 TPS/인스턴스 | 인덱스·페이지네이션·풀 사이징 |
| 쓰기 | 생성·수정 | 수백~수천 TPS | 무거운 작업은 비동기로 |

---

## 8. TDD 워크플로 (요약)

```
RED   서비스 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. 테스트 없는 서비스 변경 금지.

| 레이어 | 도구 | 비고 |
|---|---|---|
| `entity`/`common` | JUnit5/Kotest | 순수 로직·불변식. Spring 컨텍스트 미기동 |
| `service` | JUnit5/Kotest + 손수 짠 fake(리포지토리 인터페이스) | 규칙·트랜잭션 순서. 앱 미기동 |
| `repository` | `@DataJpaTest` (+ Testcontainers 선택) | 쿼리·매핑·제약 |
| `controller` | `@WebMvcTest` | 라우팅·검증·envelope·상태코드 |
| 통합 | `@SpringBootTest` (+ Testcontainers 선택) | 와이어링·헬스체크·smoke |
| 구조 | **ArchUnit**(§3.2) | 레이어 방향 — 이 테스트가 아키텍처다 |

- 검증 게이트: `./gradlew check` (CI·pre-commit·hook이 모두 `scripts/verify.sh`를 호출).

---

## 9. 새 기능 추가 워크플로

1. **범위 결정**: 새 리소스인지 기존 리소스의 새 동작인지 먼저 답한다.
2. **파일 세트 생성**: `entity/<X>.kt` → `repository/<X>Repository.kt` → `service/<X>Service.kt` → `controller/dto/` → `controller/<X>Controller.kt`. 레이어 패키지를 새로 만들면 §3.2 구조 테스트에 등록한다.
3. **TDD 사이클**: `service`(fake 리포지토리) → `repository`(`@DataJpaTest`) → `controller`(`@WebMvcTest`, 응답은 envelope) → 통합 smoke.
4. **검증**: `./gradlew check` 통과 + OpenAPI/문서 동기화(`.agents/docs/openapi`).
5. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록.

---

## 10. Anti-pattern (코드리뷰 즉시 차단)

- 컨트롤러가 리포지토리를 직접 호출(레이어 건너뛰기 — 트랜잭션·정책 우회).
- 컨트롤러가 JPA 엔티티를 그대로 반환(DTO·envelope 우회).
- 컨트롤러에서 `ResponseEntity<DTO>` 직접 반환(envelope 우회).
- `service`에서 `HttpStatus`·`ResponseEntity`·`HttpServletRequest` 참조.
- 리포지토리·컨트롤러에 `@Transactional` 부착.
- 엔티티에 서비스 호출·외부 I/O를 넣기.
- setter만 잔뜩 있는 Anemic 엔티티. 거대 "FacadeService"·거대 Util 정적 모음.
- `!!`로 null assert. `@Autowired` 필드/세터 주입·`lateinit var` 의존성.
- 순환 참조를 `@Lazy`로 우회(설계 결함 은폐 — 레이어를 고친다).
- 구조 테스트(§3.2)를 `@Disabled`로 끄거나 규칙을 지워서 통과시키기.
- 테스트 없이 서비스 코드 추가.

---

## 11. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `feature` (도메인이 둘 이상으로 갈릴 때) | `controller/`·`service/`·`repository/`·`entity/`를 **기능별로** `<feature>/{web,service,repository,domain}`으로 모은다. `config`·`common`은 그대로. | `layeredArchitecture()` 규칙에 `slices().notDependOnEachOther()`(기능 독립) 를 추가한다 |
| → `modulith` (모듈 경계를 명시하고 이벤트로 느슨히 잇고 싶을 때) | 기능 패키지를 모듈 루트로 올리고 구현을 `internal/`로 내린다(모듈 공개 표면 = 루트 타입). | ArchUnit 대신 Spring Modulith `ApplicationModules.verify()` 로 교체 |
| → `hexagonal` (도메인 규칙이 복잡해질 때) | `service/`를 `<ctx>/application/usecase/`로, `repository/`를 `<ctx>/infra/persistence/`로, `controller/`를 `<ctx>/primary/web/`으로 옮기고 JPA와 분리된 순수 도메인 모델을 `<ctx>/domain/`에 새로 만든다(가장 큰 작업). | 단일 모듈을 Gradle 멀티모듈로 쪼개 컴파일 강제로 승격. 구조 테스트는 보완으로 남긴다 |

- 전환은 **한 번에 한 기능씩** 옮기고 각 단계마다 `./gradlew check`를 통과시킨다.
- 전환 시작 전 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).

---

## 12. 관련 문서

- 스택·구조·보안·API 규약 원본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
