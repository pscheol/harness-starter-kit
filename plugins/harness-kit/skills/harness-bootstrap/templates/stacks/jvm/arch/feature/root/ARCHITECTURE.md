<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Kotlin/Java + Spring Boot(JVM) · 아키텍처: feature -->

# ARCHITECTURE — {{PROJECT_NAME}} (패키지 바이 피처 · 단일 모듈)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 정본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 **패키지를 기술 레이어가 아니라 기능(feature)으로 먼저 나눈다**. 한 기능은 한 패키지이고 그 안에 `web`·`service`·`repository`·`domain`이 하위 패키지로 공존한다.
단일 Gradle 모듈이므로 경계는 **ArchUnit 슬라이스 규칙**이 `./gradlew check`에서 **실패로 강제**한다.

스택 기준(버전 정본은 프로젝트의 버전 카탈로그(예: `gradle/libs.versions.toml`) 단일 소스 — 구체 버전은 **예시이며 프로젝트에서 최신 안정 버전으로 확정**):
**Kotlin/Java · Spring Boot(JVM)** · **Gradle**(단일 모듈, wrapper) · **Spring Data JPA** · **Spring Security** · **ArchUnit** · **JUnit5/Kotest**.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 기능이 여럿이고 **기능 단위로 작업이 배분**된다(한 기능을 고칠 때 파일이 한 디렉터리에 모여 있으면 좋다).
- 레이어별 패키지(`service/`에 20개 클래스)가 커져 "무엇이 무엇과 관련 있는지" 보이지 않는다.
- 나중에 기능 단위로 떼어낼 가능성이 있지만, **모듈 검증 프레임워크까지 도입할 이유는 아직 없다**.
- 팀이 기능 오너십으로 움직인다.

**쓰지 않는다:**
- 도메인이 하나뿐이다 → `layered`(기능 디렉터리가 오히려 소음이 된다).
- 경계를 **문서·다이어그램·이벤트 보장까지 포함해 공식적으로** 관리하고 싶다 → `modulith`.
- 한 기능의 도메인 규칙이 매우 복잡해 순수 모델·포트/어댑터가 핵심이다 → `hexagonal`.

**승격 신호(이 중 둘 이상이면 전환을 검토한다):**
1. 기능 간 직접 참조를 허용해달라는 요청이 반복된다(경계를 이벤트로 바꿔야 한다는 신호).
2. 기능이 10개를 넘고 공개/비공개 구분이 필요해진다 → `modulith`.
3. 한 기능만 배포 주기·확장 요구가 다르다 → 서비스 분리 검토.
4. 한 기능 안의 도메인 규칙이 지배적으로 복잡해진다 → 그 기능만 `hexagonal`로.

전환 절차는 §11.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| **기능 간 직접 참조 금지** | **ArchUnit `slices().notDependOnEachOther()`** | `./gradlew check` 실패 |
| 기능 간 순환 금지 | **ArchUnit `slices().beFreeOfCycles()`** | `./gradlew check` 실패 |
| 기능 안 레이어 단방향 (web→service→repository→domain) | ArchUnit `layeredArchitecture()` | `./gradlew check` 실패 |
| domain·repository는 web 타입 무의존 | ArchUnit 규칙 | `./gradlew check` 실패 |
| API 응답 일관성 | `common`의 envelope + `ErrorCode` 단일 매핑 + `GlobalExceptionHandler` | 코드리뷰·핸들러가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80% | `./gradlew check` 게이트 |

> **기계적 강제 우선**. 단일 모듈에는 컴파일 차단이 없으므로 **슬라이스 규칙이 컴파일 강제의 대체물**이다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌─────────────────────────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}  (단일 배포 단위)        │
 │(Web/CLI) │        │  ┌─────────┐  이벤트/계약  ┌─────────┐     │
 └──────────┘        │  │ 기능 A   │─────────────▶│ 기능 B   │     │
                     │  └─────────┘               └─────────┘     │
                     └───────────────────┬─────────────────────────┘
        ┌──────────────┬─────────────────┴──┬──────────────┐
        ▼              ▼                    ▼              ▼
  ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
  │ 관계형 DB   │ │ Cache/Queue │ │ Object Store│ │ 외부 시스템 │
  │  (선택)     │ │  (선택)      │ │  (선택)      │ │  (선택)     │
  └────────────┘ └─────────────┘ └─────────────┘ └────────────┘
```

- **배포 단위는 하나**다. 기능은 배포 경계가 아니라 **코드 소유 경계**다.
- 서비스 인스턴스는 **무상태**. 데이터베이스는 하나이며 기능은 자기가 소유한 테이블만 다룬다.

---

## 3. 기능 구조

```
{{PACKAGE_NS}}
├── Application.kt                  ← @SpringBootApplication
├── config/                         ← Spring 설정(Security · OpenAPI · Jackson · Async)
├── common/                         ← envelope · ErrorCode · GlobalExceptionHandler · RequestIdFilter
├── {{DOMAIN_EXAMPLE}}/             ← 기능 1
│   ├── api/                        ←   다른 기능에 제공하는 공개 계약(인터페이스·DTO·이벤트)
│   ├── web/                        ←   컨트롤러 · 요청/응답 DTO
│   ├── service/                    ←   비즈니스 규칙 · 트랜잭션 경계
│   ├── repository/                 ←   Spring Data JPA · 쿼리
│   └── domain/                     ←   엔티티 · VO · 상태 상수
└── auth/                           ← 기능 2 (같은 구조)
```

### 3.1 기능 패키지 내부 규약

| 하위 패키지 | 책임 | 의존 가능 |
|---|---|---|
| `<feature>.api` | **다른 기능이 보는 유일한 표면**(인터페이스·DTO·이벤트) | `common` |
| `<feature>.web` | 컨트롤러·DTO·검증·상태코드 | 같은 기능의 `service`·`domain`(읽기), `common` |
| `<feature>.service` | 비즈니스 규칙·**트랜잭션 경계**·정책 검사 | 같은 기능의 `repository`·`domain`, 다른 기능의 `api`, `common` |
| `<feature>.repository` | 쿼리·페이지네이션 | 같은 기능의 `domain`, `common` |
| `<feature>.domain` | 엔티티·VO·불변식 | `common`(상수·enum)만 |

- **기능 안에서도 방향은 `web → service → repository → domain`** 이다. 컨트롤러가 리포지토리를 직접 부르지 않는다.
- **다른 기능은 `api` 패키지를 통해서만** 본다. `web`·`service`·`repository`·`domain`은 그 기능 소유다.
- 기능이 소유한 테이블만 읽고 쓴다. 다른 기능 소유 테이블이 필요하면 그 기능의 `api`를 부른다.

### 3.2 기능 간 통합 규약 (가장 중요한 규칙)

**(a) 공개 계약 호출** — 즉시 결과가 필요할 때. 제공 기능의 `api` 인터페이스만 주입받는다. 반환은 `api`의 DTO(엔티티 금지).

**(b) 도메인 이벤트** — 부수 효과·역방향 의존일 때. `ApplicationEventPublisher`로 발행하고 `@TransactionalEventListener(phase = AFTER_COMMIT)`로 수신한다. 이벤트 타입은 발행 기능의 `api`에 둔다. 이름은 **과거형 사실**(`OrderPlaced`).

> **금지**: 다른 기능의 `service`·`repository`·`domain` 직접 import, 다른 기능 소유 테이블 직접 조회, 기능을 가로지르는 트랜잭션 전제.

### 3.3 ArchUnit 슬라이스 테스트 (이 변형의 강제 장치)

`src/test/kotlin/{{PACKAGE_NS}}/architecture/FeatureArchitectureTest.kt`에 두면 `./gradlew check`(= `scripts/verify.sh`)가 자동으로 돌린다.

```kotlin
// build.gradle.kts (testImplementation): com.tngtech.archunit:archunit-junit5:<version>
package {{PACKAGE_NS}}.architecture

import com.tngtech.archunit.base.DescribedPredicate.alwaysTrue
import com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAnyPackage
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import com.tngtech.archunit.library.Architectures.layeredArchitecture
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices

/** 기능 독립과 기능 내부 레이어 방향을 강제한다. 새 기능이 늘어도 규칙은 그대로 적용된다. */
@AnalyzeClasses(
    packages = ["{{PACKAGE_NS}}"],
    importOptions = [ImportOption.DoNotIncludeTests::class],
)
class FeatureArchitectureTest {

    /** 기능 슬라이스에 순환이 없다. */
    @ArchTest
    val 기능_순환_금지: ArchRule = slices()
        .matching("{{PACKAGE_NS}}.(*)..")
        .should().beFreeOfCycles()

    /** 기능끼리 직접 의존하지 않는다 — 공개 계약(api)과 토대(common·config)만 예외. */
    @ArchTest
    val 기능_독립: ArchRule = slices()
        .matching("{{PACKAGE_NS}}.(*)..")
        .should().notDependOnEachOther()
        .ignoreDependency(alwaysTrue(), resideInAnyPackage("..api..", "{{PACKAGE_NS}}.common..", "{{PACKAGE_NS}}.config.."))

    /** 기능 안에서도 레이어는 단방향이다. */
    @ArchTest
    val 기능_내부_레이어: ArchRule = layeredArchitecture().consideringOnlyDependenciesInLayers()
        .layer("Web").definedBy("..web..")
        .layer("Service").definedBy("..service..")
        .layer("Repository").definedBy("..repository..")
        .layer("Domain").definedBy("..domain..")
        .whereLayer("Web").mayNotBeAccessedByAnyLayer()
        .whereLayer("Repository").mayOnlyBeAccessedByLayers("Service")

    @ArchTest
    val 도메인은_web_무의존: ArchRule = noClasses()
        .that().resideInAnyPackage("..domain..", "..repository..")
        .should().dependOnClassesThat().resideInAnyPackage("org.springframework.web..", "..web..")

    @ArchTest
    val 트랜잭션은_서비스에만: ArchRule = noClasses()
        .that().resideInAnyPackage("..web..", "..repository..")
        .should().beAnnotatedWith("org.springframework.transaction.annotation.Transactional")
}
```

- **새 기능을 추가해도 규칙을 고칠 필요가 없다** — 슬라이스 패턴이 자동으로 잡는다(이 변형의 장점).
- `config`·`common`은 기능이 아니라 토대이므로 예외로 둔다. 예외 목록을 늘리는 것은 경계를 허무는 것이니 ADR을 남긴다.
- **규칙이 0개 클래스를 검사하면 실패로 취급한다.** ArchUnit 1.x는 `archRule.failOnEmptyShould` 기본값이 `true`다 — 패키지명 오타나 패키지 이동으로 규칙이 조용히 죽는 것을 잡는 자동 감지이므로 `archunit.properties`에서 끄지 않는다.
- 규칙을 `@Disabled`로 끄거나 지워서 통과시키는 것은 **아키텍처를 지우는 것**이다.

### 3.4 디렉터리 레이아웃

```
{{PROJECT_SLUG}}/
├── settings.gradle.kts             # 단일 모듈(rootProject 만 등록)
├── build.gradle.kts
├── gradle/libs.versions.toml       # 버전 단일 소스
├── src/main/kotlin/{{PACKAGE_NS}}/
│   ├── Application.kt
│   ├── config/ · common/
│   ├── {{DOMAIN_EXAMPLE}}/{api,web,service,repository,domain}/
│   └── auth/{api,web,service,repository,domain}/
├── src/main/resources/application.yml
├── src/test/kotlin/{{PACKAGE_NS}}/
│   ├── architecture/FeatureArchitectureTest.kt
│   └── {{DOMAIN_EXAMPLE}}/ …       #   테스트도 기능 단위로 모은다
└── scripts/verify.sh               # 단일 검증 게이트
```

---

## 4. 기능 내부 책임

| 하위 패키지 | 해야 할 일 | 하면 안 되는 일 |
|---|---|---|
| `api` | 다른 기능에 제공할 계약(인터페이스·DTO·이벤트) 정의 | 구현 노출, 엔티티 노출 |
| `web` | 입력 검증, 인증 주체 추출, 서비스 호출, envelope 응답 | 비즈니스 분기, JPA 접근, 트랜잭션 제어 |
| `service` | 비즈니스 규칙, 권한·정책 검사, **트랜잭션 경계**, 이벤트 발행 | web 타입 참조, 다른 기능의 내부 참조 |
| `repository` | 쿼리·페이지네이션 | 비즈니스 판단, 트랜잭션 시작 |
| `domain` | 엔티티·VO·상태 불변식 | 서비스 호출, web 타입 참조 |

- **트랜잭션 경계는 `service`에만**. 읽기 전용은 `@Transactional(readOnly = true)`.
- **생성자 주입 only**. `@Autowired` 필드/세터 주입·`lateinit var` 의존성 금지. 시간·난수·ID는 인터페이스로 주입한다.
- **예외는 `common`의 도메인 예외 계층으로 올린다.** 응답 변환은 `common`의 `GlobalExceptionHandler` 한 곳.
- **로깅은 경계에서 한 번만**. 민감정보는 로그 금지.
- **N+1 방지**: 연관은 기본 `LAZY`, 필요한 곳에서 fetch join·`@EntityGraph`.

---

## 5. 코드 주석 규약 (요약)

- 코드는 라인 단위 What/How를, 주석은 Why를 설명한다. 단 **함수·메서드 KDoc은 ① 책임 한 줄 + ② 비자명한 Why + ③ `처리 흐름:`(의도를 곁들인 단계)** 로 로직 이해를 돕는다.
- **`api` 패키지의 타입에는 계약 주석을 반드시 단다**(누가 소비하는가·보장 범위·멱등 여부).
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 정본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 6. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 컴파일 타임 도메인 상수 | 코드 의미를 갖는 고정 라벨·키 | `const`/`enum`(소유 **기능** 안) |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `application.yml` + `@ConfigurationProperties`(기능별 prefix) |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블·기능 플래그(캐시·무효화 동반) |

- 설정 프로퍼티는 **기능 이름을 prefix로** 쓴다(`{{DOMAIN_EXAMPLE}}.*`) — 소유가 드러난다.
- 에러코드·사용자 메시지는 문자열 리터럴 금지: `common`의 `ErrorCode` + i18n 키.

---

## 7. 성능 예산 (부하테스트로 확정)

- **무한/대량 결과 금지**: 목록은 페이지네이션 + 상한 강제.
- **N+1 회피**: fetch join·`@EntityGraph`·배치 조회. WHERE/JOIN/ORDER BY 컬럼에 인덱스 동반.
- **기능 간 호출 사슬 관리**: 같은 프로세스라 싸지만 사슬이 길면 장애 전파도 길다. 부수 효과는 이벤트로 끊는다.
- **동기 응답 경로 보호**: 무거운 작업은 요청-응답 경로 밖으로.
- **커넥션 풀 사이징**: 워커·스레드 수와 함께 계산한다.

---

## 8. TDD 워크플로 (요약)

```
RED   기능 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

| 대상 | 도구 | 비고 |
|---|---|---|
| `domain` | JUnit5/Kotest | 순수 로직·불변식. Spring 미기동 |
| `service` | JUnit5/Kotest + 손수 짠 fake(리포지토리 인터페이스) | 규칙·트랜잭션 순서 |
| `repository` | `@DataJpaTest` (+ Testcontainers 선택) | 쿼리·매핑 |
| `web` | `@WebMvcTest` | envelope·상태코드 |
| 통합 | `@SpringBootTest` | 와이어링·smoke |
| **구조** | **ArchUnit**(§3.3) | 기능 독립·레이어 방향 |

- 테스트도 **기능 단위 디렉터리**에 모은다(소스와 같은 구조).
- 검증 게이트: `./gradlew check` (CI·pre-commit·hook이 모두 `scripts/verify.sh`를 호출).

---

## 9. 새 기능 추가 워크플로

1. **기능 결정**: 기존 기능 안인지 새 기능인지 먼저 답한다.
2. **(신규 기능)** `{{PACKAGE_NS}}/<feature>/{api,web,service,repository,domain}/` 생성. 다른 기능이 쓸 계약이 있으면 `api`에만 노출한다.
3. **통합 방식 선택**: 즉시 결과면 `api` 호출, 부수 효과면 이벤트(§3.2).
4. **TDD 사이클**: `domain` → `service`(fake) → `repository`(`@DataJpaTest`) → `web`(`@WebMvcTest`, envelope) → 통합 smoke.
5. **검증**: `./gradlew check` 통과(슬라이스 규칙 포함) + OpenAPI/문서 동기화(`.agents/docs/openapi`).
6. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록.

---

## 10. Anti-pattern (코드리뷰 즉시 차단)

- 다른 기능의 `service`·`repository`·`domain` 직접 import(`api` 우회).
- 다른 기능 소유 테이블 직접 조회·조인.
- JPA 엔티티를 `api` 계약이나 컨트롤러 시그니처에 노출.
- 기능 안에서 `web`이 `repository`를 직접 호출(레이어 건너뛰기).
- `service`에서 `HttpStatus`·`ResponseEntity` 참조. 컨트롤러의 `ResponseEntity<DTO>` 직접 반환(envelope 우회).
- 리포지토리·컨트롤러에 `@Transactional` 부착. 기능을 가로지르는 트랜잭션 전제.
- 슬라이스 예외 목록에 기능 패키지를 추가해 규칙을 무력화.
- `FeatureArchitectureTest`를 `@Disabled` 처리하거나 규칙을 지우기.
- 이름만 기능인 껍데기 패키지(`util`·`common2` 같은 잡동사니).
- `@Autowired` 필드/세터 주입, `!!` null assert.
- 테스트 없이 기능 코드 추가.

---

## 11. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `modulith` (경계를 공식화하고 이벤트 보장이 필요할 때) | `<feature>/api`는 모듈 루트로, 나머지는 `<feature>/internal/`로 내린다. | ArchUnit 슬라이스 → **Spring Modulith `ApplicationModules.verify()`** |
| → `layered` (기능이 하나로 수렴할 때) | `<feature>/{web,service,repository,domain}`을 `controller/service/repository/entity`로 펼친다. | 슬라이스 규칙 제거, `layeredArchitecture()`만 유지 |
| → `hexagonal` (한 기능의 도메인 규칙이 지배적일 때) | 그 기능만 `<ctx>/{domain,application,primary,infra}`로 재배치하고 Gradle 멀티모듈로 승격. | 컴파일 강제(모듈 그래프) + 구조 테스트 보완 |
| → 서비스 분리(이 킷 범위 밖) | 기능 디렉터리를 그대로 새 리포로 옮긴다. `api` 호출은 HTTP/메시지로 교체. | 슬라이스 규칙 → 계약 테스트 |

- 전환은 **한 기능씩** 옮기고 각 단계마다 `./gradlew check`를 통과시킨다.
- 전환 시작 전 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).

---

## 12. 관련 문서

- 스택·구조·보안·API 규약 정본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 정본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
