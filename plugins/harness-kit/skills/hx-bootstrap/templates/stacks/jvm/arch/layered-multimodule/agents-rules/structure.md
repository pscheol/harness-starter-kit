<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: layered-multimodule · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 멀티모듈 레이어드 — {{PROJECT_NAME}}

이 프로젝트는 레이어드 아키텍처를 **레이어 = Gradle 모듈**로 자른다.
단일 모듈 `layered`가 ArchUnit 테스트로만 지키던 레이어 방향을 여기서는 **컴파일러가 막는다**.
그리고 실행 단위(api·batch·admin)를 여럿 두면서 그 아래 계층을 공유할 수 있다 — 이것이 단일 모듈 대신 이 변형을 고르는 실질적 이유다.
아키텍처 상세 원본은 `ARCHITECTURE.md`.

> 헥사고날과의 차이: **포트/어댑터가 없다.** `service`가 리포지토리를 직접 쓰고, 도메인 모델이 JPA를 안다.
> 도메인 규칙이 복잡하거나 저장소를 교체할 계획이 있으면 `hexagonal` 계열이 맞다(`ARCHITECTURE.md` §0).

## 1. 모듈 레이아웃

```
실행 단위(하나 이상)
  :{{PROJECT_SLUG}}-api           @SpringBootApplication · REST 경계 · dto · 예외 핸들러  → service, common
  :{{PROJECT_SLUG}}-batch         (선택) 스케줄러·배치 실행 단위                          → service, common
  :{{PROJECT_SLUG}}-admin         (선택) 관리자 API 실행 단위                             → service, common

공통 계층
  :{{PROJECT_SLUG}}-service       비즈니스 규칙 · 트랜잭션 경계 · 정책 검사               → domain, client, common
  :{{PROJECT_SLUG}}-domain        JPA 엔티티 + Spring Data 리포지토리 · 마이그레이션      → common
  :{{PROJECT_SLUG}}-client        (선택) 외부 시스템 연동                                 → common
  :{{PROJECT_SLUG}}-common        envelope · ErrorCode · 공용 상수 · 유틸                 → —
```

```
리포 루트
├── {{PROJECT_SLUG}}-api/
├── {{PROJECT_SLUG}}-batch/          (선택)
├── {{PROJECT_SLUG}}-service/
├── {{PROJECT_SLUG}}-domain/
├── {{PROJECT_SLUG}}-client/         (선택)
├── {{PROJECT_SLUG}}-common/
├── gradle/libs.versions.toml
└── settings.gradle.kts
```

```kotlin
// settings.gradle.kts
rootProject.name = "{{PROJECT_SLUG}}"
include(
    ":{{PROJECT_SLUG}}-api",
    ":{{PROJECT_SLUG}}-service",
    ":{{PROJECT_SLUG}}-domain",
    ":{{PROJECT_SLUG}}-common",
)
```

- Gradle 기본 매핑(모듈 경로 = 디렉터리 경로)을 그대로 쓴다. `projectDir` 재지정이 필요 없다.
- **Spring Boot 플러그인은 실행 단위 모듈에만** 적용한다(`api`·`batch`·`admin`). 나머지에 붙이면 `bootJar`가 생겨 라이브러리로 쓰기 어려워진다.
- `client`·`batch`·`admin`은 필요할 때 만든다. 처음부터 빈 모듈을 만들어 두지 않는다.

### 1.1 레이어 ↔ 의존 가능 (컴파일 강제)

| 모듈 | 레이어 | 의존 가능 | Spring Boot 플러그인 |
|---|---|---|---|
| `api` · `batch` · `admin` | 실행·표현 | `service`, `common` | ✅ |
| `service` | 응용·비즈니스 | `domain`, `client`, `common` | ✗ |
| `domain` | 모델·영속 | `common` | ✗ |
| `client` | 외부 연동 | `common` | ✗ |
| `common` | 공유 커널 | — | ✗ |

- **의존 금지(컴파일 차단)**: `service → api/batch`, `domain → service/api`, `client → service/api`, `common → 위 전부`.
- **실행 단위끼리 의존하지 않는다.** `admin`이 `api`를 의존하기 시작하면 실행 단위가 아니라 그냥 레이어가 하나 더 생긴 것이다.
- `common`은 프레임워크를 최소한으로만 안다. 여기에 Spring Web·JPA를 넣으면 모든 모듈이 끌고 간다.
- **`common`을 늘리지 않는다.** "둘 다 쓰니까 공유로"를 반복하면 `common`이 곧 전체가 된다.

### 1.2 레이어 건너뛰기를 어디까지 컴파일로 막을 것인가 (선택)

`api`가 `domain`(엔티티)을 보게 되는가는 `service`가 `domain`을 **어떤 configuration으로 노출하느냐**로 결정된다.
이건 프로젝트가 골라야 하는 실제 선택이다.

| 방식 | 선언 | `api`가 엔티티를 | 강제 수단 | 대가 |
|---|---|---|---|---|
| **(A) 노출**(기본) | `service` 에서 `api(project(":{{PROJECT_SLUG}}-domain"))` | 본다 | 컨트롤러 시그니처 규칙은 **ArchUnit**이 강제 | 매핑 한 겹이 없어 단순. 엔티티 누출은 테스트가 막는다 |
| (B) 차단 | `service` 에서 `implementation(project(":{{PROJECT_SLUG}}-domain"))` + 서비스가 별도 결과 모델 반환 | **못 본다(컴파일 차단)** | 컴파일러 | 서비스↔실행단위 사이에 결과 모델·매핑이 한 겹 늘어난다 |

- (A)를 고르면 §5 구조 테스트의 "컨트롤러는 엔티티를 시그니처에 쓰지 않는다" 규칙이 **필수**다. 그게 유일한 방어선이다.
- (B)를 고르면 `service`가 반환하는 결과 모델을 `service` 모듈이 소유한다(`{{PACKAGE_NS}}.service.result`). 엔티티→결과 모델 변환은 `service` 안에서 끝낸다.
- 실행 단위가 3개 이상이거나 외부에 API 스펙을 공개한다면 (B)가 값을 한다. 실행 단위가 `api` 하나이고 CRUD 위주라면 (A)로 충분하다.

> **채택한 방식**: `(여기에 A 또는 B와 이유를 적는다)`

## 2. 패키지 컨벤션

패키지는 모듈과 1:1로 맞춘다. 이러면 구조 테스트가 패키지만 보고 모듈 경계를 검사할 수 있다.

```
{{PACKAGE_NS}}
├── common                  ← envelope · ErrorCode · 공용 상수 · 예외 기반 타입
├── domain                  ← JPA 엔티티 + Spring Data 리포지토리
│   └── {{DOMAIN_EXAMPLE}}       ← <concept>(엔티티) · <concept>Repository
├── client                  ← (선택) 외부 시스템 연동. <vendor>/{client,dto,config}
├── service                 ← 비즈니스 규칙 · 트랜잭션 경계
│   └── {{DOMAIN_EXAMPLE}}       ← <concept>Service (+ (B)면 result/)
└── api                     ← 실행 단위. Application · config/ · GlobalExceptionHandler
    └── {{DOMAIN_EXAMPLE}}       ← <concept>Controller · dto/ · docs/(*Api 인터페이스)
```

- 도메인이 늘면 **레이어 아래에 도메인 패키지**를 둔다(`service/{{DOMAIN_EXAMPLE}}`·`service/user`). 반대로 도메인을 최상위에 두고 그 아래 레이어를 두면 그건 `feature` 변형이다.
- 클래스명은 도메인 개념으로 짓고 테이블 prefix를 붙이지 않는다(`TbOrder` ✗ → `Order` + `@Table(name = "tb_order")` ○).
- 레이어 접미사는 일관되게: `{{DOMAIN_EXAMPLE}}Controller` · `{{DOMAIN_EXAMPLE}}Service` · `{{DOMAIN_EXAMPLE}}Repository`. 엔티티는 접미사 없이 `{{DOMAIN_EXAMPLE}}`.
- DTO는 용도를 이름에 담는다: `Create{{DOMAIN_EXAMPLE}}Request` · `{{DOMAIN_EXAMPLE}}Response`.
- **인터페이스 + `*Impl` 한 쌍을 관성으로 만들지 않는다.** 구현이 하나뿐이면 클래스만 둔다. 테스트 대역이 필요한 경계(외부 클라이언트)에만 인터페이스를 둔다(`.agents/rules/design-principles.md` ISP·DIP).

## 3. 레이어 규약

- **`@Transactional`은 `service`에만.** 컨트롤러·리포지토리·엔티티에 붙이지 않는다 — 엔티티 메서드의 `@Transactional`은 프록시 대상이 아니라 아무 효과가 없다.
- 외부 호출(`client`)을 트랜잭션 안에 넣지 않는다(응답 3초 = DB 커넥션 3초 점유).
- **집계·카운터는 DB의 원자적 연산으로**. read-modify-write와 JVM 락(`synchronized`/`ReentrantLock`)은 인스턴스 2대에서 갱신 손실이 난다.
- **생성자 주입 only**. `@Value`·`@Autowired` 필드 주입 금지 — 설정은 `@ConfigurationProperties`로 받아 생성자로 넘긴다.
- 파싱·검증은 인바운드 경계(`api`)에서. `service`가 원시 문자열·맵을 다시 검증하지 않는다.
- 비즈니스 규칙은 가능한 한 **엔티티 안**에. `service`가 엔티티의 getter/setter만 호출하며 규칙을 조립하고 있다면 Anemic Domain이다(`.agents/rules/design-principles.md`).
- 자격증명·토큰·인증 헤더는 로그 금지. 예외는 `common`의 도메인 예외로 올리고 응답 변환은 `GlobalExceptionHandler` 한 곳.
- 응답은 항상 공통 envelope. 컨트롤러가 `ResponseEntity<DTO>`를 직접 반환하지 않는다.

## 4. 실행 단위를 늘릴 때

이 변형을 고른 이유가 대개 여기 있다 — **같은 도메인·서비스 계층 위에 여러 실행 단위**.

1. 정말 별도 실행 단위인지 답한다. "관리자 화면"은 대개 `api` 안의 경로 분리로 충분하다. 별도 모듈은 **배포 주기·스케일·보안 경계가 다를 때** 만든다.
2. `settings.gradle.kts`에 등록 → Spring Boot 플러그인 적용 → `service`·`common` 의존.
3. **포트를 `.agents/rules/tech.md` 포트 표에 등록**한다. 등록 없이 8080을 재사용하면 로컬에서 두 번째가 뜨지 않는다.
4. 배포 파이프라인·헬스체크·로그 라벨을 추가한다.
5. 실행 단위 간 직접 의존을 만들지 않는다. 공유가 필요하면 `service` 또는 `common`으로 내린다.

## 5. 구조 테스트 (모듈 그래프가 못 잡는 것)

모듈 그래프는 레이어 방향을 컴파일로 막지만 **모듈 안의 규율**은 못 잡는다.
모든 모듈이 클래스패스에 올라오는 **실행 단위 모듈(`api`)의 테스트 소스셋**에 둔다.

```kotlin
// {{PROJECT_SLUG}}-api/build.gradle.kts (testImplementation): com.tngtech.archunit:archunit-junit5:<version>
package {{PACKAGE_NS}}.architecture

import com.tngtech.archunit.base.DescribedPredicate
import com.tngtech.archunit.core.domain.JavaClass
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods

@AnalyzeClasses(
    packages = ["{{PACKAGE_NS}}"],
    importOptions = [ImportOption.DoNotIncludeTests::class],
)
class LayeredModuleTest {

    private val jpaEntity = object : DescribedPredicate<JavaClass>("JPA 엔티티") {
        override fun test(input: JavaClass) = input.isAnnotatedWith("jakarta.persistence.Entity")
    }

    /** (A) 방식에서 필수. 엔티티가 컨트롤러 시그니처로 새는 것을 막는 유일한 장치다. */
    @ArchTest
    val 컨트롤러는_엔티티를_반환하지_않는다: ArchRule = noMethods()
        .that().areDeclaredInClassesThat().resideInAPackage("..api..")
        .should().haveRawReturnType(jpaEntity)

    @ArchTest
    val 트랜잭션은_service에만: ArchRule = noClasses()
        .that().resideInAnyPackage("..api..", "..domain..", "..client..")
        .should().beAnnotatedWith("org.springframework.transaction.annotation.Transactional")

    @ArchTest
    val domain_client_는_web을_모른다: ArchRule = noClasses()
        .that().resideInAnyPackage("..domain..", "..client..")
        .should().dependOnClassesThat().resideInAnyPackage("org.springframework.web..")

    @ArchTest
    val common_은_프레임워크를_모른다: ArchRule = noClasses()
        .that().resideInAPackage("..common..")
        .should().dependOnClassesThat()
        .resideInAnyPackage("org.springframework.web..", "jakarta.persistence..")

    @ArchTest
    val 서비스는_컨트롤러_dto를_모른다: ArchRule = noClasses()
        .that().resideInAPackage("..service..")
        .should().dependOnClassesThat().resideInAPackage("..api..")
}
```

- 레이어 모듈을 추가하면 **이 테스트에도 등록**한다(등록 누락 = 강제 누락).
- 규칙이 0개 클래스를 검사하면 실패로 취급한다. ArchUnit 1.x의 `archRule.failOnEmptyShould` 기본값 `true`를 `archunit.properties`에서 끄지 않는다 — 패키지명 오타로 규칙이 조용히 죽는 것을 잡는 자동 감지다.
- 해당 없는 규칙은 **주석 처리가 아니라 삭제**한다. 죽은 규칙은 "검사하고 있다"는 착각만 남긴다.
- Kotlin이면 Konsist로 같은 규칙을 표현해도 된다. 핵심은 위반을 `./gradlew check`에서 실패로 만드는 것이다.
- 규칙을 `@Disabled`로 끄는 것 = 경계를 없애는 것이다. 규칙이 틀렸다면 ADR을 남기고 경계를 다시 긋는다.

## 6. 새 기능 착수 워크플로

1. **범위 결정**: 새 리소스인지 기존 리소스의 새 동작인지 먼저 답한다.
2. **파일 세트 생성**: `domain/<X>`(엔티티) → `domain/<X>Repository` → `service/<X>Service` → `api/<X>/dto/` → `api/<X>/<X>Controller`.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `domain`: 엔티티 상태 불변식 테스트 → 구현.
   2. `service`: 규칙 테스트(fake 리포지토리) → 구현.
   3. `domain`: `@DataJpaTest`(+ Testcontainers 선택)로 쿼리·매핑 검증.
   4. `api`: `@WebMvcTest`로 검증·상태코드·**envelope** 확인.
   5. 통합: `@SpringBootTest` smoke.
4. **검증**: `bash scripts/verify.sh`(= `./gradlew check`) 통과 + `.agents/docs/openapi` 동기화.
5. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 7. 새 기능 착수 규칙

1. 새 기능은 위 레이어 경계 안에서 구현한다. 한 클래스가 두 레이어의 책임을 겸하지 않는다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`를 함께 갱신한다.
4. 도메인 규칙이 `service`에 쌓여 손대기 어려워지면 `hexagonal` 승격을, 실행 단위가 끝내 하나뿐이고 모듈 경계가 부담이면 단일 모듈 `layered` 후퇴를 검토한다(`ARCHITECTURE.md` §0·§12).

> `{{DOMAIN_EXAMPLE}}`는 실제 도메인으로 치환한다.
> 설치기는 토큰을 그대로 갈아 끼우므로 타입명 자리는 PascalCase로 손본다(패키지·설정 키·모듈명은 소문자 그대로).
