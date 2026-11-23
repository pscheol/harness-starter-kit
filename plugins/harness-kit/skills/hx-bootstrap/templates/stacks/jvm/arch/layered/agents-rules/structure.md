<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: layered · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 레이어드(단일 모듈) — {{PROJECT_NAME}}

이 프로젝트는 레이어드 아키텍처를 단일 Gradle 모듈 안에서 구현한다.
모듈 그래프가 없으므로 의존 방향은 ArchUnit 구조 테스트가 `./gradlew check`에서 실패로 강제한다. 아키텍처 상세 원본은 `ARCHITECTURE.md`.

## 패키지 레이아웃

```
{{PACKAGE_NS}}
├── Application.kt          ← @SpringBootApplication 진입점
├── config/                 ← Spring 설정(Security · OpenAPI · Jackson · Async · Cache)
├── common/                 ← envelope · ErrorCode · GlobalExceptionHandler · RequestIdFilter · 공용 상수
├── controller/             ← REST 경계. Spring Web 을 아는 유일한 레이어
│   ├── docs/               ←   *Api 인터페이스(OpenAPI 문서 전담)
│   └── dto/                ←   요청·응답 DTO(엔티티 노출 금지)
├── service/                ← 비즈니스 규칙 · 트랜잭션 경계 · 정책 검사
├── repository/             ← Spring Data JPA · 쿼리
└── entity/                 ← JPA 엔티티(테이블 매핑 · 상태 불변식)
```

### 레이어 ↔ 의존 가능 (구조 테스트 강제)

| 패키지 | 레이어 | 의존 가능 |
|---|---|---|
| `config` | 조립 | 전부(조립 목적) |
| `controller` | 표현 | `service`, `common`, 자신의 `dto` |
| `service` | 응용·도메인 | `repository`, `entity`, `common` |
| `repository` | 영속 | `entity`, `common` |
| `entity` | 모델 | `common`(상수·enum)만 |
| `common` | 공유 커널 | — |

- **의존 금지(구조 테스트 차단)**: `service → controller`, `repository → service/controller`, `entity → 위 전부`, `entity·repository → org.springframework.web`.
- 레이어 건너뛰기 금지: `controller`는 `repository`를 직접 import하지 않는다(트랜잭션·정책이 service에 있다).
- `@Transactional`은 service에만. 컨트롤러·리포지토리에 붙이지 않는다.
- 엔티티를 컨트롤러 시그니처에 노출하지 않는다 — 항상 `controller/dto`로 변환한다.

## 네이밍 컨벤션

- 클래스명은 도메인 개념(ubiquitous language) + 레이어 접미사: `{{DOMAIN_EXAMPLE}}Controller` · `{{DOMAIN_EXAMPLE}}Service` · `{{DOMAIN_EXAMPLE}}Repository` · 엔티티는 접미사 없이 `{{DOMAIN_EXAMPLE}}`.
- DTO는 용도를 이름에 담는다: `Create{{DOMAIN_EXAMPLE}}Request` · `{{DOMAIN_EXAMPLE}}Response`.
- 테이블 prefix를 클래스명에 붙이지 않는다(테이블명은 `@Table`로 지정).
- 서비스 인터페이스를 습관적으로 만들지 않는다. 구현이 하나뿐이면 클래스 하나로 충분하고, 테스트 대역이 필요한 경계(리포지토리·외부 클라이언트)에만 인터페이스를 둔다.

## 새 기능 착수 워크플로

1. **범위 결정**: 새 리소스인지 기존 리소스의 새 동작인지 먼저 답한다.
2. **파일 세트 생성**: `entity/<X>.kt` → `repository/<X>Repository.kt` → `service/<X>Service.kt` → `controller/dto/` → `controller/<X>Controller.kt`.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `service`: 규칙 테스트(fake 리포지토리) → 구현.
   2. `repository`: `@DataJpaTest`(+ Testcontainers 선택)로 쿼리·매핑 검증.
   3. `controller`: `@WebMvcTest`로 검증·상태코드·**envelope** 확인.
   4. 통합: `@SpringBootTest` smoke.
4. **검증**: `scripts/verify.sh`(= `./gradlew check`) 통과 + OpenAPI/문서 동기화(`.agents/docs/openapi`).
5. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (ArchUnit — 이 변형의 강제 장치)

단일 모듈에는 컴파일 차단이 없다. 레이어 방향·건너뛰기·엔티티 오염을 잡는 유일한 기계적 장치가 이 테스트다.
`src/test/kotlin/{{PACKAGE_NS}}/architecture/LayeredArchitectureTest.kt`에 두면 `./gradlew check`가 자동으로 돌린다.

```kotlin
// build.gradle.kts (testImplementation): com.tngtech.archunit:archunit-junit5:<version>
package {{PACKAGE_NS}}.architecture

import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import com.tngtech.archunit.library.Architectures.layeredArchitecture

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

- **레이어 패키지를 추가하면 이 테스트에 등록**한다(등록 누락 = 강제 누락).
- 규칙이 0개 클래스를 검사하면 실패로 취급한다. ArchUnit 1.x는 `archRule.failOnEmptyShould` 기본값이 `true`다 — 패키지명 오타나 패키지 이동으로 규칙이 조용히 죽는 것을 잡는 자동 감지이므로 `archunit.properties`에서 끄지 않는다.
- 규칙을 `@Disabled`로 끄거나 지워서 통과시키는 것은 아키텍처를 지우는 것이다. 규칙이 틀렸다면 ADR을 남기고 고친다.
- Kotlin 프로젝트라면 Konsist로도 같은 규칙을 표현할 수 있다. 중요한 것은 **위반이 게이트에서 실패**하는 것이다.

## 새 기능 착수 규칙

1. 새 기능은 위 레이어 경계 안에서 구현한다. 한 클래스가 두 레이어의 책임을 겸하지 않는다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`를 함께 갱신한다.
4. `settings.gradle.kts`에 하위 모듈을 추가하고 싶어지면 그건 `hexagonal`로 가는 신호다(`ARCHITECTURE.md` §0·§11).

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다.
