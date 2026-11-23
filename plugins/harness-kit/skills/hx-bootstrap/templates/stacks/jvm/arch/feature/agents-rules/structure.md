<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: feature · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 패키지 바이 피처(단일 모듈) — {{PROJECT_NAME}}

이 프로젝트는 패키지를 **기술 레이어가 아니라 기능(feature)** 으로 먼저 나눈다.
단일 Gradle 모듈이므로 경계는 ArchUnit 슬라이스 규칙이 `./gradlew check`에서 실패로 강제한다. 아키텍처 상세 원본은 `ARCHITECTURE.md`.

## 패키지 레이아웃

```
{{PACKAGE_NS}}
├── Application.kt                  ← @SpringBootApplication
├── config/                         ← Spring 설정(Security · OpenAPI · Jackson · Async)
├── common/                         ← envelope · ErrorCode · GlobalExceptionHandler · RequestIdFilter
├── {{DOMAIN_EXAMPLE}}/             ← 기능 1 = 디렉터리 1
│   ├── api/                        ←   다른 기능에 제공하는 공개 계약(인터페이스·DTO·이벤트)
│   ├── web/                        ←   컨트롤러 · 요청/응답 DTO
│   ├── service/                    ←   비즈니스 규칙 · 트랜잭션 경계
│   ├── repository/                 ←   Spring Data JPA · 쿼리
│   └── domain/                     ←   엔티티 · VO · 상태 상수
└── auth/                           ← 기능 2 (같은 구조)
```

### 기능 내부 방향 (구조 테스트 강제)

| 하위 패키지 | 의존 가능 |
|---|---|
| `<feature>.api` | `common` |
| `<feature>.web` | 같은 기능의 `service`·`domain`(읽기), `common` |
| `<feature>.service` | 같은 기능의 `repository`·`domain`, **다른 기능의 `api`**, `common` |
| `<feature>.repository` | 같은 기능의 `domain`, `common` |
| `<feature>.domain` | `common`(상수·enum)만 |

- 기능 간 직접 참조 금지: 다른 기능의 `web`·`service`·`repository`·`domain`을 import하지 않는다. **`api`만** 본다.
- 기능 안에서도 레이어 건너뛰기 금지: `web`이 `repository`를 직접 부르지 않는다.
- **기능이 소유한 테이블만** 읽고 쓴다. 다른 기능 데이터가 필요하면 그 기능의 `api`를 부른다.
- `@Transactional`은 `service`에만. 기능을 가로지르는 트랜잭션을 전제하지 않는다.

## 기능 간 통합 (두 가지뿐)

1. **공개 계약 호출** — 즉시 결과가 필요할 때. 제공 기능의 `api` 인터페이스만 주입받고, 반환은 `api`의 DTO(엔티티 금지).
2. **도메인 이벤트** — 부수 효과·역방향 의존일 때. `ApplicationEventPublisher` 발행 + `@TransactionalEventListener(phase = AFTER_COMMIT)` 수신. 이벤트 타입은 발행 기능의 `api`에 두고 과거형 사실로 이름 짓는다(`OrderPlaced`).

## 네이밍 컨벤션

- 기능 패키지명은 도메인 개념 하나(`{{DOMAIN_EXAMPLE}}`·`auth`). `util`·`common2` 같은 잡동사니 기능을 만들지 않는다.
- 클래스명에 기능 접두사를 중복해 붙이지 않는다(패키지가 네임스페이스다). 레이어 접미사(`*Controller`·`*Service`·`*Repository`)는 **한 프로젝트 안에서 일관**되게 쓴다.
- `api` 패키지의 타입은 계약이므로 이름·시그니처 변경은 호환성 변경으로 취급한다.

## 새 기능 착수 워크플로

1. **기능 결정**: 기존 기능 안인지 새 기능인지 먼저 답한다.
2. (신규 기능) `{{PACKAGE_NS}}/<feature>/{api,web,service,repository,domain}/` 생성. 다른 기능이 쓸 계약만 `api`에 노출한다.
3. **통합 방식 선택**: 즉시 결과면 `api` 호출, 부수 효과면 이벤트.
4. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `domain`: 불변식 테스트 → 구현.
   2. `service`: 규칙 테스트(fake 리포지토리) → 구현.
   3. `repository`: `@DataJpaTest`(+ Testcontainers 선택).
   4. `web`: `@WebMvcTest`로 검증·상태코드·**envelope** 확인.
   5. 통합: `@SpringBootTest` smoke.
5. **검증**: `scripts/verify.sh`(= `./gradlew check`, 슬라이스 규칙 포함) + OpenAPI/문서 동기화(`.agents/docs/openapi`).
6. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (ArchUnit — 이 변형의 강제 장치)

`src/test/kotlin/{{PACKAGE_NS}}/architecture/FeatureArchitectureTest.kt`에 두면 `./gradlew check`가 자동으로 돌린다.

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

@AnalyzeClasses(
    packages = ["{{PACKAGE_NS}}"],
    importOptions = [ImportOption.DoNotIncludeTests::class],
)
class FeatureArchitectureTest {

    @ArchTest
    val 기능_순환_금지: ArchRule = slices()
        .matching("{{PACKAGE_NS}}.(*)..")
        .should().beFreeOfCycles()

    @ArchTest
    val 기능_독립: ArchRule = slices()
        .matching("{{PACKAGE_NS}}.(*)..")
        .should().notDependOnEachOther()
        .ignoreDependency(alwaysTrue(), resideInAnyPackage("..api..", "{{PACKAGE_NS}}.common..", "{{PACKAGE_NS}}.config.."))

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

- 새 기능을 추가해도 규칙을 고칠 필요가 없다 — 슬라이스 패턴이 자동으로 잡는다.
- `config`·`common`만 예외다. 예외 목록에 기능 패키지를 추가하는 것은 경계를 허무는 것이니 ADR을 남긴다.
- 규칙이 0개 클래스를 검사하면 실패로 취급한다. ArchUnit 1.x는 `archRule.failOnEmptyShould` 기본값이 `true`다 — 패키지명 오타나 패키지 이동으로 규칙이 조용히 죽는 것을 잡는 자동 감지이므로 `archunit.properties`에서 끄지 않는다.
- 규칙을 끄거나 지워서 통과시키지 않는다. 규칙이 틀렸다면 경계를 다시 긋는다.

## 새 기능 착수 규칙

1. 새 기능은 **한 기능 디렉터리 안에서** 구현한다. 두 기능을 동시에 고쳐야 한다면 경계가 맞는지 먼저 의심한다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`를 함께 갱신한다.
4. 기능이 10개를 넘거나 공개/비공개 구분이 필요해지면 `modulith` 승격을 검토한다(`ARCHITECTURE.md` §0·§11).

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다.
