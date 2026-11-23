<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: hexagonal · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 멀티모듈 헥사고날 — {{PROJECT_NAME}}

이 프로젝트는 **클린 아키텍처(헥사고날) + DDD**를 빌드 도구(Gradle 기본, Maven 선택)의 모듈 의존 그래프로 컴파일 레벨에서 강제한다.
의존 방향 위반은 리뷰가 아니라 **컴파일 실패**로 막힌다(기계적 강제 우선). 아키텍처 상세 원본은 `ARCHITECTURE.md`.

## 모듈 레이아웃 (단일 프로젝트) — 컨텍스트 최상위(flat)

4개 공용 레이어 + **바운디드 컨텍스트(도메인)당 4모듈**.
컨텍스트가 **최상위 모듈**(`{{PROJECT_SLUG}}-<ctx>`)이고 그 아래에 헥사고날 4레이어가 붙는다.

```
:{{PROJECT_SLUG}}-bootstrap                    @SpringBootApplication. common + 각 도메인 primary·infra 조립·실행
:{{PROJECT_SLUG}}-<ctx>:primary                inbound(REST) 어댑터        → application, common
:{{PROJECT_SLUG}}-<ctx>:infra                  outbound(JPA/쿼리 도구) 어댑터 → application, common, core
:{{PROJECT_SLUG}}-<ctx>:application            유스케이스 + port(in/out)    → domain, core
:{{PROJECT_SLUG}}-<ctx>:domain                 순수 Kotlin(Spring/JPA 무의존) → core
:{{PROJECT_SLUG}}-common                       공유 커널(envelope·ErrorCode·GlobalExceptionHandler·RequestIdFilter) → core
:{{PROJECT_SLUG}}-core                         순수 Kotlin primitives(DomainException 등). 프레임워크 0
:{{PROJECT_SLUG}}-query                        (선택) 횡단 인프라 테이블용 쿼리 도구 DSL(audit/outbox 등)만
:{{PROJECT_SLUG}}-testsupport                  (선택) 통합 테스트 토대·스키마 부트스트랩·JWKS 키(각 모듈 testImplementation)
```

컨텍스트를 `dispatch`·`reception`으로 잡으면 실제 경로는 이렇게 읽힌다.

```
settings.gradle.kts 모듈 경로              디렉터리
  :{{PROJECT_SLUG}}-dispatch:domain          {{PROJECT_SLUG}}-dispatch/domain/
  :{{PROJECT_SLUG}}-dispatch:application     {{PROJECT_SLUG}}-dispatch/application/
  :{{PROJECT_SLUG}}-dispatch:primary         {{PROJECT_SLUG}}-dispatch/primary/
  :{{PROJECT_SLUG}}-dispatch:infra           {{PROJECT_SLUG}}-dispatch/infra/
  :{{PROJECT_SLUG}}-reception:domain         {{PROJECT_SLUG}}-reception/domain/
  …
```

Gradle 기본 매핑(모듈 경로 = 디렉터리 경로)을 그대로 쓰므로 `projectDir` 재지정이 필요 없다.

> **대안 레이아웃**: 컨텍스트를 `{{PROJECT_SLUG}}-domain` 컨테이너 아래로 한 단계 더 묶는 방식
> (`:{{PROJECT_SLUG}}-domain:<ctx>:infra`)은 `ARCH=hexagonal-nested` 변형이다.
> 컨텍스트가 많아 리포 루트가 번잡해질 때 유리하다. 레이어 규칙·의존 방향은 두 변형이 같다.

### 레이어 ↔ 의존 가능 (컴파일 강제)

| 모듈 | 레이어 | 의존 가능 |
|---|---|---|
| `:{{PROJECT_SLUG}}-bootstrap` | Bootstrap | `common` + 각 도메인의 `primary`·`infra` |
| `:{{PROJECT_SLUG}}-<ctx>:primary` | Inbound Adapter | `application`, `common` |
| `:{{PROJECT_SLUG}}-<ctx>:infra` | Outbound Adapter | `application`, `common`, `core` |
| `:{{PROJECT_SLUG}}-<ctx>:application` | Use Case + Port | `domain`, `core` |
| `:{{PROJECT_SLUG}}-<ctx>:domain` | Domain Model | `core` |
| `:{{PROJECT_SLUG}}-common` | 공유 커널(web) | `core` |
| `:{{PROJECT_SLUG}}-core` | Primitives | — (프레임워크 0) |

- **의존 금지(컴파일 차단)**: `domain → infra/primary`, `application → infra/primary`, `core → 외부`, `primary ↔ infra`.
- 한 컨텍스트의 4모듈(`domain`/`application`/`primary`/`infra`)은 **항상 한 묶음으로 추가·제거**한다.
- 그룹 내 의존 흐름: `primary → application`, `infra → application`, `application → domain`. `primary`와 `infra`는 서로 의존하지 않고 bootstrap이 조립한다.
- leaf 모듈명(`domain/application/primary/infra`)이 컨텍스트 간 중복되므로 Gradle `group`을 `{{PACKAGE_NS}}.<ctx>`로 분리해 capability 충돌을 막고, jar 충돌 방지용 `archivesName`을 경로 기반으로 유니크화한다(루트 `build.gradle.kts`).

## Port & Adapter

- Inbound Port(`port.in`) = 유스케이스 인터페이스. 위치 `application/usecase/<X>UseCase.kt`(POJO, 어노테이션 없음). 컨트롤러는 이 인터페이스에만 의존한다.
- Outbound Port(`port.out`) = Repository/Gateway 추상. 위치 `application/output/`. `application`이 정의하고 `infra`가 구현한다.
- 포트는 **애그리거트 기준**(`save(aggregate)`·`findBy…`)으로 정의한다. `upsert(컬럼들)`·SQL 같은 영속 메커니즘을 포트 시그니처에 드러내지 않는다(멱등/충돌 처리는 어댑터 내부).
- 새 외부 시스템 통합 = 새 `port.out` + 새 `infra` 어댑터. `application`/`domain`은 손대지 않는다(OCP).

## 패키지 컨벤션

```
{{PACKAGE_NS}}
├── core.<sub>              ← 프레임워크 무의존 primitives (DomainException 등)
├── common.<sub>            ← Spring/web 공유 커널 (envelope · error · filter)
└── <ctx>                   ← 바운디드 컨텍스트 (예: {{DOMAIN_EXAMPLE}})
    ├── domain              ─ POJO. 외부 라이브러리 0. @Component/@Service 금지
    │   ├── aggregate / entity / vo / enum / constant / event / exception / service / util
    ├── application         ─ domain·core 에만 의존. DI=Spring @Service
    │   ├── usecase (<X>UseCase.kt=port.in, command/, query/, service/=구현체 @Service)
    │   ├── output          ← Outbound Port(Repository/Gateway) — infra가 구현
    │   ├── event / exceptions / config / vo
    ├── primary             ─ inbound 어댑터. application UseCase 호출
    │   └── web (controller=*RestController, docs=*Api, dto, mapper)
    └── infra               ─ outbound 어댑터. application/output 구현
        ├── persistence (entity, repository[+query/], mapper, adapter=*PersistenceAdapter)
        ├── client / config
```

- 클래스명은 도메인 개념(ubiquitous language)으로 짓고 테이블 prefix를 붙이지 않는다(네임스페이스는 컨텍스트 패키지가 담당). 예: `Order`/`OrderLine`(테이블 `ord_*`), infra는 `<concept>Entity`/`<concept>JpaRepository`/`<concept>PersistenceAdapter`/`<concept>Mapper`.
- DB 접근: 표준 CRUD는 JPA(또는 Spring Data), 복잡 조회·keyset cursor·저장소 레벨 격리·JSON 컬럼 등은 쿼리 도구(선택)로. 네이티브 SQL은 지양(불가피하면 Why 주석 + 정렬).
- 컨텍스트 간 직접 호출·모델 공유 금지. 통합이 필요하면 제공 컨텍스트의 **공개 계약(contract) 인터페이스**를 경유한다(impl 직접 의존 금지).

## 새 도메인/유스케이스 착수 워크플로

1. **컨텍스트 결정**: 기존 도메인 안인지 새 바운디드 컨텍스트인지 먼저 답한다.
2. (신규 컨텍스트면) `settings.gradle.kts`에 4모듈 등록 → 각 `build.gradle.kts`를 위 의존표대로 작성.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `domain`: 애그리거트/VO 테스트 → 모델 구현.
   2. `application`: 유스케이스 테스트(fake `port.out`) → `port.in`/`port.out` 정의 → 유스케이스 구현.
   3. `infra`: 통합 테스트(예: Testcontainers)로 `port.out` 구현 테스트 → JPA/쿼리 도구 구현(DB가 지원하면 저장소 격리 정책 포함).
   4. `primary`: `@WebMvcTest`로 컨트롤러 테스트 → 컨트롤러·DTO·매퍼 구현. 응답은 `ApiResponses` envelope.
   5. `bootstrap`: 빈 등록·smoke 테스트.
4. **검증**: `scripts/verify.sh`(= `./gradlew check`) 통과 + OpenAPI/문서 동기화(`.agents/docs/openapi`).
5. **계획 추적**: 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (Konsist — 컴파일 강제의 보완)

의존 방향은 Gradle 모듈 그래프가 1차로 컴파일 차단한다(위 표). 그러나 모듈 그래프가 **못 잡는** 위반이 있다:
같은 모듈 안에서의 패키지 규율(도메인 패키지가 Spring/JPA 어노테이션 참조), 네이밍 규약(`*PersistenceAdapter`),
컨트롤러가 `ResponseEntity`를 직접 반환(§Anti-pattern), 컨텍스트 간 도메인 직접 import 등. 이를 **테스트로 강제**한다.

Kotlin 스택이라 **Konsist**(Kotlin 네이티브)를 기본으로 쓴다. ArchUnit(JVM 범용)도 대안이다.
아래 스켈레톤을 `:{{PROJECT_SLUG}}-bootstrap` 테스트 소스셋(예: `src/test/kotlin/{{PACKAGE_NS}}/architecture/ArchitectureTest.kt`)에 두면
`./gradlew check`(= `scripts/verify.sh`)가 자동으로 돌린다. 규칙은 프로젝트에 맞게 늘린다.

```kotlin
// build.gradle.kts (bootstrap testImplementation): com.lemonappdev:konsist:<version>
package {{PACKAGE_NS}}.architecture

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.ext.list.withPackage
import com.lemonappdev.konsist.api.verify.assertFalse
import com.lemonappdev.konsist.api.verify.assertTrue
import io.kotest.core.spec.style.FunSpec

/** 헥사고날 레이어 단방향 의존을 패키지 레벨에서 강제한다(모듈 그래프가 못 잡는 위반 보완). */
class ArchitectureTest : FunSpec({

    val scope = Konsist.scopeFromProject()

    test("domain 은 프레임워크(Spring/JPA)에 무의존이다") {
        scope.files
            .withPackage("..domain..")
            .assertFalse { file ->
                file.imports.any {
                    it.name.startsWith("org.springframework") ||
                        it.name.startsWith("jakarta.persistence") ||
                        it.name.startsWith("javax.persistence")
                }
            }
    }

    test("domain·application 은 primary/infra 를 import 하지 않는다(안으로만 의존)") {
        scope.files
            .withPackage("..domain..", "..application..")
            .assertFalse { file ->
                file.imports.any { "$it".contains(".primary.") || "$it".contains(".infra.") }
            }
    }

    test("컨텍스트 간 도메인 모델을 직접 import 하지 않는다(공개 계약/이벤트 경유)") {
        // 예: order 컨텍스트가 payment.domain 을 직접 참조하면 실패. contract 모듈만 허용.
        scope.files.withPackage("..domain..").assertTrue { file ->
            val ownCtx = file.packagee?.name?.substringBefore(".domain") ?: return@assertTrue true
            file.imports.none { imp -> Regex("""\.(\w+)\.domain\.""").find("$imp")?.let { it.groupValues[1] !in ownCtx } ?: false }
        }
    }

    test("컨트롤러는 envelope 로 응답한다(ResponseEntity<DTO> 직접 반환 금지)") {
        scope.classes()
            .filter { it.name.endsWith("Controller") }
            .flatMap { it.functions() }
            .assertFalse { fn -> fn.returnType?.name?.startsWith("ResponseEntity") == true }
    }

    test("infra 어댑터 네이밍: *PersistenceAdapter") {
        scope.classes()
            .withPackage("..infra.persistence..")
            .filter { it.hasAnnotationWithName("Component", "Repository") }
            .assertTrue { it.name.endsWith("PersistenceAdapter") || it.name.endsWith("Mapper") }
    }
})
```

> ArchUnit을 쓴다면 `layeredArchitecture()`로 같은 레이어 규칙(`domain` ← `application` ← `primary`/`infra`)과
> `noClasses().that().resideInAPackage("..domain..").should().dependOnClassesThat().resideInAPackage("org.springframework..")`를 표현한다.
> 어느 쪽이든 위반을 `./gradlew check`에서 실패로 만드는 것이 핵심이다(리뷰가 아니라 게이트).

## 새 기능 착수 규칙

1. 새 기능은 위 모듈 경계 안에서 구현한다. 경계를 넘는 책임을 한 모듈에 몰지 않는다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`를 함께 갱신한다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
