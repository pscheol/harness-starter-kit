<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Kotlin/Java + Spring Boot(JVM) · 아키텍처: modulith -->

# ARCHITECTURE — {{PROJECT_NAME}} (모듈러 모놀리스 · 단일 모듈)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 정본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 **모듈러 모놀리스**다: 하나의 Gradle 모듈·하나의 배포 단위 안에서 **패키지가 모듈 경계**가 되고,
모듈 간 접근은 **Spring Modulith의 `ApplicationModules.verify()`** 가 `./gradlew check`에서 **실패로 강제**한다.

스택 기준(버전 정본은 프로젝트의 버전 카탈로그(예: `gradle/libs.versions.toml`) 단일 소스 — 구체 버전은 **예시이며 프로젝트에서 최신 안정 버전으로 확정**):
**Kotlin/Java · Spring Boot(JVM)** · **Spring Modulith** · **Gradle**(단일 모듈, wrapper) · **Spring Data JPA** · **Spring Security** · **JUnit5/Kotest**.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 도메인이 **둘 이상으로 갈렸고** 각 도메인에 소유 팀·소유자가 있다.
- 지금은 한 덩어리로 배포하지만 **나중에 일부를 떼어낼 가능성**을 열어두고 싶다(경계를 미리 세워둔다).
- 모듈 간 결합을 **도메인 이벤트로 느슨하게** 만들고 싶다(동기 호출 사슬을 줄인다).
- 마이크로서비스의 운영 비용(분산 트랜잭션·네트워크·배포 파이프라인 N개)은 아직 감당할 이유가 없다.

**쓰지 않는다:**
- 도메인 경계가 하나뿐이다 → `layered`. 모듈 경계는 오버헤드만 된다.
- 기능은 여럿이지만 **경계를 검증으로 강제할 필요까지는 없다** → `feature`(ArchUnit 슬라이스로 충분).
- 한 도메인의 내부 규칙이 매우 복잡해 순수 도메인 모델·포트/어댑터가 핵심이다 → `hexagonal`.
- 이미 독립 배포가 필요하고 조직도 그렇게 나뉘어 있다 → 별도 서비스로 분리(이 킷의 범위 밖).

**승격/후퇴 신호:**
1. 한 모듈만 배포 주기·확장 요구가 확연히 다르다 → **서비스 분리** 검토.
2. 모듈 간 동기 호출이 사슬처럼 길어진다 → 이벤트로 전환하거나 경계를 다시 긋는다.
3. 모듈이 사실상 하나만 살아 있다 → `layered`로 후퇴(경계 유지 비용을 없앤다).

전환 절차는 §12.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 모듈 간 순환 금지 | **`ApplicationModules.verify()`** | `./gradlew check` 실패 |
| 다른 모듈의 **내부 타입** 참조 금지 | Spring Modulith 모듈 규약(하위 패키지 = internal) | `./gradlew check` 실패 |
| 선언한 의존만 허용 | `@ApplicationModule(allowedDependencies = …)` | `./gradlew check` 실패 |
| 모듈 간 통신은 공개 API 또는 도메인 이벤트로 | 위 세 규칙 + 코드리뷰 | 게이트·리뷰 차단 |
| API 응답 일관성 | `shared`의 envelope + `ErrorCode` 단일 매핑 + `GlobalExceptionHandler` | 코드리뷰·핸들러가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80% | `./gradlew check` 게이트 |

> **기계적 강제 우선**. 이 변형에서 아키텍처는 문서가 아니라 **모듈 검증 테스트**다.
> 검증 테스트를 끄는 것 = 모듈 경계를 없애는 것이다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌─────────────────────────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}  (단일 배포 단위)        │
 │(Web/CLI) │        │  ┌─────────┐ 이벤트 ┌─────────┐            │
 └──────────┘        │  │ 모듈 A   │──────▶│ 모듈 B   │            │
                     │  └─────────┘        └─────────┘            │
                     └───────────────────┬─────────────────────────┘
        ┌──────────────┬─────────────────┴──┬──────────────┐
        ▼              ▼                    ▼              ▼
  ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
  │ 관계형 DB   │ │ Cache/Queue │ │ Object Store│ │ 외부 시스템 │
  │  (선택)     │ │  (선택)      │ │  (선택)      │ │  (선택)     │
  └────────────┘ └─────────────┘ └─────────────┘ └────────────┘
```

- **배포 단위는 하나**다. 모듈은 배포 경계가 아니라 **소유·변경 경계**다.
- 데이터베이스도 하나다(스키마를 모듈별로 나누는 것은 선택). 모듈 간 **테이블 직접 조인은 피하고** 공개 API·이벤트를 쓴다 — 나중에 분리할 때 이 규율이 비용을 결정한다.
- 서비스 인스턴스는 **무상태**.

---

## 3. 모듈 구조

Spring Modulith 규약: **애플리케이션 루트 패키지 바로 아래의 패키지 하나 = 애플리케이션 모듈**.
그 패키지의 **최상위 타입만 공개 API**이고, **하위 패키지는 모듈 내부**로 간주되어 다른 모듈이 참조하면 검증이 실패한다.

```
{{PACKAGE_NS}}                      ← 애플리케이션 루트
├── Application.kt                  ← @SpringBootApplication (모듈 아님)
├── shared/                         ← 공용 커널(모든 모듈이 의존 가능 — OPEN 모듈)
├── {{DOMAIN_EXAMPLE}}/             ← 모듈 1
│   ├── {{DOMAIN_EXAMPLE}}Service.kt      ← 공개 API(루트 타입)
│   ├── {{DOMAIN_EXAMPLE}}Events.kt       ← 공개 도메인 이벤트
│   └── internal/                          ← 내부 구현(다른 모듈 접근 시 검증 실패)
│       ├── web/ · persistence/ · domain/
└── auth/                           ← 모듈 2 (같은 구조)
```

### 3.1 모듈 ↔ 공개 표면

| 위치 | 성격 | 다른 모듈이 볼 수 있나 |
|---|---|---|
| `{{PACKAGE_NS}}.<module>` 의 최상위 타입 | **공개 API**(서비스 인터페이스·이벤트·DTO) | ✅ |
| `{{PACKAGE_NS}}.<module>.internal..` | 내부 구현(web·persistence·domain) | ❌ (검증 실패) |
| `{{PACKAGE_NS}}.shared` | 공용 커널(envelope·ErrorCode·예외·상수) | ✅ (OPEN 모듈로 선언) |
| `{{PACKAGE_NS}}.Application` | 조립 | — |

- **공개 표면을 작게 유지한다.** 모듈 루트에 타입을 하나 더 올리는 것은 "이건 계약이다"라는 선언이다.
- 특정 하위 패키지를 선택적으로 공개해야 하면 **명명된 인터페이스**(`@NamedInterface`)로 노출하고, 그 사실을 이 문서에 기록한다.
- **JPA 엔티티는 공개하지 않는다.** 다른 모듈에는 값 객체·DTO·ID만 넘긴다.

### 3.2 모듈 선언 (`@ApplicationModule`)

명시 선언은 선택이지만, **허용 의존을 좁히고 싶을 때는 반드시 쓴다**. 어노테이션은 `package-info.java`에 붙인다.

```java
// src/main/java/{{PACKAGE_NS}}/{{DOMAIN_EXAMPLE}}/package-info.java
@org.springframework.modulith.ApplicationModule(
    displayName = "{{DOMAIN_EXAMPLE}}",
    allowedDependencies = { "shared" }   // 여기에 없는 모듈을 참조하면 검증 실패
)
package {{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}};
```

```java
// src/main/java/{{PACKAGE_NS}}/shared/package-info.java
@org.springframework.modulith.ApplicationModule(type = ApplicationModule.Type.OPEN)
package {{PACKAGE_NS}}.shared;
```

> **Kotlin 프로젝트 주의**: Kotlin에는 `package-info.java`가 없다. Java 소스셋(`src/main/java/...`)에 이 파일만 두면 된다(나머지 코드는 Kotlin으로 유지).
> 명시 선언을 쓰지 않으면 Modulith가 **패키지 관례로 모듈을 인식**하고 순환·내부 접근을 검증한다.

### 3.3 모듈 검증 테스트 (이 변형의 강제 장치)

```kotlin
// build.gradle.kts (testImplementation): org.springframework.modulith:spring-modulith-starter-test
package {{PACKAGE_NS}}.architecture

import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules
import org.springframework.modulith.docs.Documenter
import {{PACKAGE_NS}}.Application

/** 모듈 경계(순환·내부 접근·허용 의존)를 검증한다. 이 테스트가 이 아키텍처의 강제 장치다. */
class ModuleStructureTest {

    private val modules = ApplicationModules.of(Application::class.java)

    @Test
    fun `모듈 경계를 지킨다`() {
        modules.verify()      // 순환 · 내부 타입 접근 · 미허용 의존을 모두 검사
    }

    @Test
    fun `모듈 문서를 생성한다`() {
        Documenter(modules).writeDocumentation()   // 모듈 다이어그램·의존 목록(빌드 산출물)
    }
}
```

- `verify()`가 잡는 것: **모듈 간 순환**, **다른 모듈의 internal 타입 참조**, **`allowedDependencies` 밖의 의존**.
- 생성된 모듈 문서는 리뷰에서 "경계가 의도대로인가"를 보는 근거로 쓴다(`.agents/docs/generated/`로 옮겨 보관해도 좋다).
- 새 모듈을 추가하면 **패키지를 만드는 것만으로 검증 대상이 된다**(등록 누락이 구조적으로 불가능한 점이 이 변형의 장점이다).

### 3.4 디렉터리 레이아웃

```
{{PROJECT_SLUG}}/
├── settings.gradle.kts             # 단일 모듈(rootProject 만 등록)
├── build.gradle.kts                # Spring Boot + Spring Modulith
├── gradle/libs.versions.toml       # 버전 단일 소스
├── src/main/kotlin/{{PACKAGE_NS}}/
│   ├── Application.kt
│   ├── shared/                     #   envelope · ErrorCode · GlobalExceptionHandler · 공용 상수
│   ├── {{DOMAIN_EXAMPLE}}/
│   │   ├── {{DOMAIN_EXAMPLE}}Service.kt     #   공개 API
│   │   ├── {{DOMAIN_EXAMPLE}}Events.kt      #   공개 이벤트
│   │   └── internal/{web,persistence,domain}/
│   └── auth/ …
├── src/main/java/{{PACKAGE_NS}}/*/package-info.java   # (선택) 모듈 선언
├── src/main/resources/application.yml
├── src/test/kotlin/{{PACKAGE_NS}}/
│   ├── architecture/ModuleStructureTest.kt
│   └── <module>/ …                 #   @ApplicationModuleTest 로 모듈 단위 테스트
└── scripts/verify.sh               # 단일 검증 게이트
```

---

## 4. 모듈 간 통합 규약 (가장 중요한 규칙)

모듈이 서로를 부르는 방법은 **두 가지뿐**이다.

**(a) 공개 API 직접 호출 — 즉시 결과가 필요할 때**
- 제공 모듈의 **루트 타입**(인터페이스)만 주입받는다. `internal..`은 컴파일되더라도 검증에서 막힌다.
- 반환값은 그 모듈이 소유한 값 객체·DTO다. **JPA 엔티티를 건네지 않는다**.
- 호출 사슬이 3단계를 넘으면 설계를 다시 본다(이벤트로 끊는다).

**(b) 도메인 이벤트 — 부수 효과·비동기·역방향 의존일 때**
- 발행: `ApplicationEventPublisher.publishEvent(...)`. 이벤트 타입은 **발행 모듈의 공개 표면**에 둔다.
- 수신: `@ApplicationModuleListener`(트랜잭션 커밋 후 · 비동기 · 새 트랜잭션). 수신 모듈이 발행 모듈의 구현을 의존하지 않도록 이벤트 타입만 참조한다.
- **전달 보장이 필요하면 이벤트 발행 레지스트리**(`spring-modulith-events-*`)를 켠다. 미완료 이벤트가 저장되어 재발행되므로 "커밋됐는데 리스너가 죽어 유실"을 막는다. 재발행은 **최소 1회 전달**이므로 리스너는 **멱등**해야 한다.
- 이벤트는 **과거형 사실**로 이름 짓는다(`OrderPlaced`·`PaymentCaptured`). 명령형(`SendEmail`)은 이벤트가 아니라 호출이다.

> **금지**: 다른 모듈의 `internal..` 타입 참조, 다른 모듈의 테이블 직접 조회, 모듈 간 `@Transactional` 경계 공유를 전제한 설계.

---

## 5. 모듈 내부 책임

한 모듈 안에서는 `internal/web → internal/domain·service → internal/persistence` 방향을 지킨다(모듈 내부 구조는 팀이 정하되 **문서화**한다).

- **트랜잭션 경계는 모듈의 서비스에만.** 모듈을 가로지르는 트랜잭션을 전제하지 않는다(나중에 분리할 때 그대로 깨진다).
- **생성자 주입 only**. `@Autowired` 필드/세터 주입·`lateinit var` 의존성 금지. 시간·난수·ID는 인터페이스로 주입한다.
- **예외는 `shared`의 도메인 예외 계층으로 올린다.** 응답 변환은 `shared`의 `GlobalExceptionHandler` 한 곳.
- **로깅은 경계에서 한 번만**. 민감정보는 로그 금지.
- **DB 접근**: 모듈이 소유한 테이블만 읽고 쓴다. 다른 모듈 소유 테이블이 필요하면 그 모듈의 공개 API를 부른다(조인하고 싶은 유혹이 이 아키텍처를 무너뜨린다).

---

## 6. 코드 주석 규약 (요약)

- 코드는 라인 단위 What/How를, 주석은 Why를 설명한다. 단 **함수·메서드 KDoc은 ① 책임 한 줄 + ② 비자명한 Why + ③ `처리 흐름:`(의도를 곁들인 단계)** 로 로직 이해를 돕는다.
- **모듈 공개 API와 이벤트에는 계약 주석을 반드시 단다**(누가 소비하는가·언제 발행되는가·멱등 여부).
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 정본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 7. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 컴파일 타임 도메인 상수 | 코드 의미를 갖는 고정 라벨·키 | `const`/`enum`(소유 **모듈** 안) |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `application.yml` + `@ConfigurationProperties`(모듈별 prefix) |
| (c) 운영자 변경 가능 값 | 런타임 조정 | DB 설정 테이블·기능 플래그(캐시·무효화 동반) |

- 설정 프로퍼티는 **모듈 이름을 prefix로** 쓴다(`{{DOMAIN_EXAMPLE}}.*`) — 소유가 드러나고 분리할 때 그대로 옮겨진다.
- 에러코드·사용자 메시지는 문자열 리터럴 금지: `shared`의 `ErrorCode` + i18n 키.

---

## 8. 성능 예산 (부하테스트로 확정)

- **무한/대량 결과 금지**: 목록은 페이지네이션 + 상한 강제.
- **N+1 회피**: fetch join·`@EntityGraph`·배치 조회. WHERE/JOIN/ORDER BY 컬럼에 인덱스 동반.
- **모듈 간 호출 비용 인식**: 같은 프로세스라 싸지만, **호출 사슬이 길면 장애 전파도 길다**. 비동기로 끊을 곳을 정한다.
- **이벤트 처리 지연**: `@ApplicationModuleListener`는 비동기다 — 사용자에게 즉시 반영이 필요한 것을 이벤트로 미루지 않는다.
- **동기 응답 경로 보호**: 무거운 작업은 요청-응답 경로 밖으로.

---

## 9. TDD 워크플로 (요약)

```
RED   모듈 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

| 대상 | 도구 | 비고 |
|---|---|---|
| 모듈 내부 도메인 | JUnit5/Kotest | 순수 로직. Spring 미기동 |
| 모듈 단위 | **`@ApplicationModuleTest`** | 그 모듈만 부팅. 다른 모듈 의존은 명시적으로 대체 |
| 이벤트 흐름 | `@ApplicationModuleTest` + Scenario API | 발행 → 수신 → 결과를 시나리오로 검증 |
| 영속 | `@DataJpaTest` (+ Testcontainers 선택) | 쿼리·매핑 |
| 웹 | `@WebMvcTest` | envelope·상태코드 |
| **구조** | **`ApplicationModules.verify()`**(§3.3) | 이 테스트가 아키텍처다 |

- 검증 게이트: `./gradlew check` (CI·pre-commit·hook이 모두 `scripts/verify.sh`를 호출).

---

## 10. 새 모듈/기능 추가 워크플로

1. **모듈 결정**: 기존 모듈 안인지 새 모듈인지 먼저 답한다. **새 모듈은 소유자와 공개 API를 정의할 수 있을 때만** 만든다.
2. **(신규 모듈)** `{{PACKAGE_NS}}/<module>/` 생성 → 루트에 공개 API 타입 → `internal/` 아래 구현. 필요하면 `package-info.java`로 `allowedDependencies` 선언.
3. **통합 방식 선택**: 즉시 결과가 필요하면 공개 API 호출, 부수 효과면 이벤트(§4).
4. **TDD 사이클**: 모듈 내부 도메인 → `@ApplicationModuleTest` → 웹/영속 → 구조 검증.
5. **검증**: `./gradlew check` 통과(모듈 검증 포함) + OpenAPI/문서 동기화(`.agents/docs/openapi`).
6. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록.

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- 다른 모듈의 `internal..` 타입 import(검증 실패 — 억제 어노테이션으로 우회 금지).
- 다른 모듈 소유 테이블을 직접 조회·조인.
- JPA 엔티티를 모듈 공개 API 시그니처에 노출.
- 모듈 간 순환 의존을 이벤트로 "위장"하기(이벤트 방향도 설계다 — 순환이면 경계가 틀린 것).
- 명령형 이벤트(`SendEmailEvent`) 남발 — 그건 호출이다.
- 모듈을 가로지르는 트랜잭션 전제.
- `ModuleStructureTest`를 `@Disabled` 처리하거나 `verify()`를 지우기.
- 모듈 루트에 타입을 무분별하게 올려 공개 표면을 넓히기.
- `@Autowired` 필드/세터 주입, `!!` null assert.
- 테스트 없이 모듈 코드 추가.

---

## 12. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → 서비스 분리(이 킷 범위 밖) | 한 모듈을 그대로 새 리포로 옮긴다. 공개 API 호출은 HTTP/메시지로, 이벤트는 브로커로 교체. | 모듈 검증 대신 **계약 테스트**로 대체 |
| → `feature` (경계 강제가 과하다고 판단될 때) | `internal/`을 걷어내고 `<feature>/{web,service,repository,domain}`으로 평탄화. | `ApplicationModules.verify()` → **ArchUnit 슬라이스 규칙** |
| → `layered` (모듈이 사실상 하나일 때) | 모듈 패키지를 풀어 `controller/service/repository/entity`로 모은다. | ArchUnit `layeredArchitecture()` |
| → `hexagonal` (한 모듈의 도메인 규칙이 지배적일 때) | 그 모듈만 `<ctx>/{domain,application,primary,infra}`로 재배치하고 Gradle 멀티모듈로 승격. | 컴파일 강제(모듈 그래프) + 구조 테스트 보완 |

- 전환은 **한 모듈씩** 옮기고 각 단계마다 `./gradlew check`를 통과시킨다.
- 전환 시작 전 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).

---

## 13. 관련 문서

- 스택·구조·보안·API 규약 정본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 정본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
