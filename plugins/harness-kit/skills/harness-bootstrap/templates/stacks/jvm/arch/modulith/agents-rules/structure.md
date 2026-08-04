<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: modulith · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 모듈러 모놀리스 — {{PROJECT_NAME}}

이 프로젝트는 **단일 Gradle 모듈 · 단일 배포 단위** 안에서 **패키지를 모듈 경계**로 쓴다.
경계는 **Spring Modulith의 `ApplicationModules.verify()`** 가 `./gradlew check`에서 강제한다. 아키텍처 상세 정본은 `ARCHITECTURE.md`.

## 패키지 레이아웃

```
{{PACKAGE_NS}}                      ← 애플리케이션 루트
├── Application.kt                  ← @SpringBootApplication (모듈 아님)
├── shared/                         ← 공용 커널(OPEN 모듈): envelope · ErrorCode · GlobalExceptionHandler
├── {{DOMAIN_EXAMPLE}}/             ← 모듈 1 — 루트 타입만 공개 API
│   ├── {{DOMAIN_EXAMPLE}}Service.kt      ←   공개 인터페이스
│   ├── {{DOMAIN_EXAMPLE}}Events.kt       ←   공개 도메인 이벤트(과거형 사실)
│   └── internal/                          ←   내부 구현 — 다른 모듈이 참조하면 검증 실패
│       ├── web/ · persistence/ · domain/
└── auth/                           ← 모듈 2 (같은 구조)
```

### 공개 표면 규칙 (Spring Modulith 규약)

| 위치 | 다른 모듈이 볼 수 있나 |
|---|---|
| `{{PACKAGE_NS}}.<module>` 의 **최상위 타입** | ✅ 공개 API |
| `{{PACKAGE_NS}}.<module>.internal..` | ❌ 내부(검증 실패) |
| `{{PACKAGE_NS}}.shared` | ✅ OPEN 모듈 |

- **공개 표면을 작게 유지한다.** 모듈 루트에 타입을 올리는 것은 "이건 계약이다"라는 선언이다.
- **JPA 엔티티는 공개하지 않는다.** 값 객체·DTO·ID만 건넨다.
- 하위 패키지를 선택적으로 공개해야 하면 `@NamedInterface`로 노출하고 `ARCHITECTURE.md`에 기록한다.
- 허용 의존을 좁히려면 `src/main/java/{{PACKAGE_NS}}/<module>/package-info.java`에 `@ApplicationModule(allowedDependencies = {...})`를 선언한다(**Kotlin에는 `package-info.java`가 없으므로 Java 소스셋에 이 파일만 둔다**).

## 모듈 간 통합 (두 가지뿐)

1. **공개 API 직접 호출** — 즉시 결과가 필요할 때. 제공 모듈의 루트 인터페이스만 주입받는다. 호출 사슬이 3단계를 넘으면 설계를 다시 본다.
2. **도메인 이벤트** — 부수 효과·비동기·역방향 의존일 때. 발행은 `ApplicationEventPublisher`, 수신은 `@ApplicationModuleListener`(커밋 후·비동기·새 트랜잭션). 전달 보장이 필요하면 **이벤트 발행 레지스트리**를 켜고 리스너를 **멱등**하게 만든다.

**금지**: 다른 모듈의 `internal..` 참조 · 다른 모듈 소유 테이블 직접 조회 · 모듈을 가로지르는 트랜잭션 전제.

## 모듈 내부 규약

- 모듈 안 방향: `internal/web → internal/domain·service → internal/persistence`.
- **트랜잭션 경계는 모듈의 서비스에만**. 리포지토리·컨트롤러에 `@Transactional` 금지.
- **생성자 주입 only**. 시간·난수·ID는 인터페이스로 주입.
- 예외는 `shared`의 도메인 예외로 올리고, 응답 변환은 `shared`의 전역 핸들러 한 곳.
- 모듈이 소유한 테이블만 읽고 쓴다.

## 새 모듈/기능 착수 워크플로

1. **모듈 결정**: 기존 모듈 안인지 새 모듈인지 먼저 답한다. **새 모듈은 소유자와 공개 API를 정의할 수 있을 때만** 만든다.
2. (신규 모듈) `{{PACKAGE_NS}}/<module>/` 생성 → 루트에 공개 API 타입 → `internal/` 아래 구현 → 필요하면 `package-info.java` 선언.
3. **통합 방식 선택**: 즉시 결과면 공개 API 호출, 부수 효과면 이벤트.
4. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. 모듈 내부 도메인: 순수 테스트(Spring 미기동).
   2. 모듈 단위: `@ApplicationModuleTest`로 그 모듈만 부팅.
   3. 이벤트 흐름: Scenario API로 발행→수신→결과 검증.
   4. 웹/영속: `@WebMvcTest`·`@DataJpaTest`(+ Testcontainers 선택).
5. **검증**: `scripts/verify.sh`(= `./gradlew check`, 모듈 검증 포함) + OpenAPI/문서 동기화(`.agents/docs/openapi`).
6. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 모듈 검증 테스트 (이 변형의 강제 장치)

```kotlin
// build.gradle.kts (testImplementation): org.springframework.modulith:spring-modulith-starter-test
package {{PACKAGE_NS}}.architecture

import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules
import org.springframework.modulith.docs.Documenter
import {{PACKAGE_NS}}.Application

class ModuleStructureTest {

    private val modules = ApplicationModules.of(Application::class.java)

    @Test
    fun `모듈 경계를 지킨다`() {
        modules.verify()      // 순환 · 내부 타입 접근 · 미허용 의존
    }

    @Test
    fun `모듈 문서를 생성한다`() {
        Documenter(modules).writeDocumentation()
    }
}
```

- 새 모듈은 **패키지를 만드는 것만으로 검증 대상**이 된다(등록 누락이 구조적으로 불가능하다).
- `verify()`를 지우거나 `@Disabled`로 끄는 것은 **모듈 경계를 없애는 것**이다. 규칙이 틀렸다면 ADR을 남기고 경계를 다시 긋는다.
- 생성된 모듈 문서는 "경계가 의도대로인가"를 리뷰에서 확인하는 근거로 쓴다.

## 새 기능 착수 규칙

1. 새 기능은 **한 모듈 안에서** 구현한다. 두 모듈을 동시에 고쳐야 한다면 경계가 맞는지 먼저 의심한다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`를 함께 갱신한다.
4. 한 모듈만 배포 주기·확장 요구가 확연히 달라지면 서비스 분리를 검토한다(`ARCHITECTURE.md` §0·§12).

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다.
