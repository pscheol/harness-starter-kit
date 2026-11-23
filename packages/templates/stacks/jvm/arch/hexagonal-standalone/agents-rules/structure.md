<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: hexagonal-standalone · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 컨텍스트 자립형 헥사고날 — {{PROJECT_NAME}}

이 프로젝트는 **클린 아키텍처(헥사고날) + DDD**를 Gradle 모듈 의존 그래프로 컴파일 레벨에서 강제한다.
다른 헥사고날 변형과 다른 점은 하나다 — **바운디드 컨텍스트가 자기 core·common·bootstrap까지 소유한다**.
컨텍스트 하나가 그 자체로 실행 가능한 완결 단위이고, 컨텍스트끼리 공유하는 코드 모듈이 **없다**.
아키텍처 상세 원본은 `ARCHITECTURE.md`.

## 1. 모듈 레이아웃 — 컨텍스트당 7모듈

모듈명은 `:{{PROJECT_SLUG}}-<ctx>-<layer>` 형태의 **평면 하이픈**이다. 콜론 중첩(`:a:b`)을 쓰지 않는다.

```
:{{PROJECT_SLUG}}-<ctx>-core           순수 primitives(DomainException·Id·Clock 계약). 프레임워크 0
:{{PROJECT_SLUG}}-<ctx>-common         이 컨텍스트의 공유 커널(envelope·ErrorCode·예외 변환·필터) → core
:{{PROJECT_SLUG}}-<ctx>-domain         애그리거트·VO·도메인 서비스(Spring/JPA 무의존)          → core
:{{PROJECT_SLUG}}-<ctx>-application    유스케이스 + port(in/out)                              → domain, core
:{{PROJECT_SLUG}}-<ctx>-primary        inbound 어댑터(REST)                                   → application, common
:{{PROJECT_SLUG}}-<ctx>-infra          outbound 어댑터(JPA·외부 클라이언트)                    → application, common, core
:{{PROJECT_SLUG}}-<ctx>-bootstrap      @SpringBootApplication. 이 컨텍스트의 실행 단위          → primary, infra, common
```

컨텍스트를 `{{DOMAIN_EXAMPLE}}`·`payment`로 잡으면 모듈 목록은 이렇게 읽힌다.

```
:{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-core        :{{PROJECT_SLUG}}-payment-core
:{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-common      :{{PROJECT_SLUG}}-payment-common
:{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-domain      :{{PROJECT_SLUG}}-payment-domain
:{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-application :{{PROJECT_SLUG}}-payment-application
:{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-primary     :{{PROJECT_SLUG}}-payment-primary
:{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-infra       :{{PROJECT_SLUG}}-payment-infra
:{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}-bootstrap   :{{PROJECT_SLUG}}-payment-bootstrap
```

### 1.1 디렉터리는 컨텍스트로 묶는다 (projectDir 재지정)

모듈명이 평면이라고 디렉터리까지 루트에 평면으로 늘어놓으면 컨텍스트 3개에 21개 폴더가 루트를 채운다.
`settings.gradle.kts`에서 `projectDir`을 재지정해 **모듈명은 평면, 디렉터리는 컨텍스트별**로 둔다.

```kotlin
// settings.gradle.kts
rootProject.name = "{{PROJECT_SLUG}}"

val LAYERS = listOf("core", "common", "domain", "application", "primary", "infra", "bootstrap")

fun context(ctx: String, layers: List<String> = LAYERS) {
    layers.forEach { layer ->
        val path = ":{{PROJECT_SLUG}}-$ctx-$layer"
        include(path)
        project(path).projectDir = file("$ctx/$layer")
    }
}

context("{{DOMAIN_EXAMPLE}}")
context("payment")
```

```
리포 루트
├── {{DOMAIN_EXAMPLE}}/{core,common,domain,application,primary,infra,bootstrap}/
├── payment/{core,common,domain,application,primary,infra,bootstrap}/
├── gradle/libs.versions.toml
└── settings.gradle.kts
```

- 컨텍스트를 추가하는 것은 `context("<ctx>")` 한 줄이다. 7모듈은 **항상 한 묶음으로 추가·제거**한다.
- 레이어를 빼고 싶으면(예: 아직 외부 연동이 없어 `infra` 불필요) `context("<ctx>", LAYERS - "infra")`로 명시한다. 빈 모듈을 두지 않는다.
- 모듈명이 전역 유니크하므로 Gradle `group` 분리·`archivesName` 유니크화가 **필요 없다**. leaf 이름이 겹치는 중첩 변형(`hexagonal`·`hexagonal-nested`)에서 필요했던 capability 충돌 회피가 여기서는 사라진다.

### 1.2 레이어 ↔ 의존 가능 (컴파일 강제)

| 모듈 | 레이어 | 의존 가능 |
|---|---|---|
| `<ctx>-bootstrap` | 실행·조립 | 같은 컨텍스트의 `primary`·`infra`·`common` |
| `<ctx>-primary` | Inbound Adapter | 같은 컨텍스트의 `application`·`common` |
| `<ctx>-infra` | Outbound Adapter | 같은 컨텍스트의 `application`·`common`·`core` |
| `<ctx>-application` | Use Case + Port | 같은 컨텍스트의 `domain`·`core` |
| `<ctx>-domain` | Domain Model | 같은 컨텍스트의 `core` |
| `<ctx>-common` | 공유 커널(web) | 같은 컨텍스트의 `core` |
| `<ctx>-core` | Primitives | — (프레임워크 0) |

- **의존 금지(컴파일 차단)**: `domain → infra/primary`, `application → infra/primary`, `core → 외부`, `primary ↔ infra`, 그리고 **컨텍스트 A의 어떤 모듈도 컨텍스트 B의 모듈을 의존하지 않는다**(§2).
- 그룹 내 흐름: `primary → application`, `infra → application`, `application → domain`. `primary`와 `infra`는 서로 모르고 `bootstrap`이 조립한다.
- `core`·`domain` 모듈의 빌드 스크립트에 Spring/JPA 플러그인을 부착하지 않는다(프레임워크 무의존을 빌드로 강제).
- Spring Boot 플러그인은 **`bootstrap` 모듈에만** 적용한다. 나머지 모듈에는 `bootJar` 태스크가 아예 생기지 않아야 한다.

## 2. 컨텍스트 간 통합 (직접 의존 없음)

이 변형의 규칙은 하나다 — **컨텍스트 A는 컨텍스트 B의 모듈을 의존하지 않는다.**
모듈 그래프는 선언만 하면 통과시키므로 컴파일러가 이 간선을 막아 주지 않는다. §8 구조 테스트와 리뷰가 지킨다.

| 방법 | 언제 | 대가 |
|---|---|---|
| (a) **HTTP/gRPC 호출** | 두 컨텍스트가 이미 별도 프로세스로 뜬다 | 네트워크 실패·타임아웃·재시도를 다뤄야 한다 |
| (b) **도메인 이벤트**(Outbox → 브로커) | 결과적 일관성으로 충분하다 | 인프라(브로커·Outbox 테이블)가 필요하다 |
| (c) **contract 모듈**(`:{{PROJECT_SLUG}}-<ctx>-contract`) | 아직 한 프로세스에서 같이 뜬다 | 컨텍스트 간 컴파일 결합이 생긴다 — 분리할 때 되돌려야 한다 |

- (c)를 고르면 **공개하는 쪽이 `contract` 모듈을 소유**하고, 그 안에는 인터페이스·요청/응답 DTO·enum만 둔다. 애그리거트·엔티티·JPA 타입은 넣지 않는다.
- 소비하는 쪽은 `contract`에만 의존한다. 제공 컨텍스트의 `domain`·`application`·`infra`를 직접 의존하는 순간 이 변형의 유일한 이점(독립 배포)이 사라진다.
- 어떤 방법을 쓰든 **채택 사실과 이유를 아래 표에 기록**한다. 기록되지 않은 컨텍스트 간 간선은 리뷰에서 되돌린다.

> **컨텍스트 간 통합 현황** (없으면 "없음"으로 유지)
>
> | from | to | 방법 | 이유 | 승인일 |
> |---|---|---|---|---|
> | — | — | — | — | — |

## 3. 중복을 관리한다 (이 변형이 지불하는 값)

컨텍스트마다 `core`·`common`이 따로 있다는 것은 **envelope·ErrorCode·예외 변환이 컨텍스트 수만큼 복제된다**는 뜻이다.
복제는 이 변형이 지불하기로 한 값이지 사고가 아니다. 다만 복제본이 **갈라지는 것**은 사고다.

- API 응답 규약의 원본은 코드가 아니라 문서다 — `.agents/rules/api-standards.md` 한 곳. 컨텍스트마다 그 규약을 각자 구현한다.
- 응답 형태가 갈라지지 않게 **계약 테스트를 컨텍스트마다 같은 이름으로** 둔다(`<ctx>-primary`의 `ApiEnvelopeContractTest`). 성공·실패·검증 실패 응답의 JSON 키와 상태코드를 검사한다.
- `common`을 컨텍스트 간에 복사해 쓰기 시작하면 **세 번째 복사 시점**에 멈추고 판단한다: 컨텍스트가 사실 하나인가, 아니면 전역 공유 커널이 필요한가. 후자면 `ARCH=hexagonal`로 후퇴하는 것이 정직하다(§6).
- 라이브러리·Spring Boot 버전은 복제 대상이 아니다. `gradle/libs.versions.toml` 단일 소스에서만 온다(`.agents/rules/tech.md`).

## 4. 패키지 컨벤션

패키지도 모듈처럼 컨텍스트가 최상위다. **모듈 하나 = 패키지 하나(1:1)**.

```
{{PACKAGE_NS}}
└── <ctx>                      ← 바운디드 컨텍스트 (예: {{DOMAIN_EXAMPLE}})
    ├── core                   ─ 프레임워크 무의존 primitives
    ├── common                 ─ envelope · ErrorCode · GlobalExceptionHandler · RequestIdFilter
    ├── domain                 ─ POJO. 외부 라이브러리 0. @Component/@Service 금지
    │   ├── aggregate / entity / vo / enum / event / exception / service
    ├── application            ─ domain·core 에만 의존. DI=Spring @Service
    │   ├── usecase            ← <X>UseCase(=port.in) · command/ · query/ · service/(구현체)
    │   ├── output             ← Outbound Port(Repository/Gateway) — infra 가 구현
    │   └── event / config
    ├── primary                ─ inbound 어댑터
    │   └── web                ← controller(*RestController) · docs(*Api) · dto · mapper
    ├── infra                  ─ outbound 어댑터. application/output 구현
    │   ├── persistence        ← entity · repository · mapper · adapter(*PersistenceAdapter)
    │   └── client / config
    └── bootstrap              ← Application · 조립 설정
```

- 클래스명은 도메인 개념(ubiquitous language)으로 짓고 테이블 prefix를 붙이지 않는다(`TbOrder` ✗ → `Order` + `@Table(name = "tb_order")` ○). 네임스페이스는 컨텍스트 패키지가 담당한다.
- infra 네이밍: `<concept>Entity` · `<concept>JpaRepository` · `<concept>PersistenceAdapter` · `<concept>Mapper`.
- **인터페이스 + `*Impl` 한 쌍을 관성으로 만들지 않는다.** 포트(`port.in`/`port.out`)는 레이어 경계라 인터페이스가 정당하지만, 한 레이어 안의 헬퍼까지 인터페이스로 감싸지 않는다(`.agents/rules/design-principles.md` ISP·DIP).

## 5. Port & Adapter

- Inbound Port(`port.in`) = 유스케이스 인터페이스. 위치 `application/usecase/<X>UseCase`(POJO, 어노테이션 없음). 컨트롤러는 이 인터페이스에만 의존한다.
- Outbound Port(`port.out`) = Repository/Gateway 추상. 위치 `application/output/`. `application`이 정의하고 `infra`가 구현한다(DIP — 추상을 소유하는 쪽이 안쪽이다).
- 포트는 **애그리거트 기준**(`save(aggregate)`·`findBy…`)으로 정의한다. `upsert(컬럼들)`·SQL 같은 영속 메커니즘을 포트 시그니처에 드러내지 않는다(멱등·충돌 처리는 어댑터 내부).
- 새 외부 시스템 통합 = 새 `port.out` + 새 `infra` 어댑터. `application`·`domain`은 손대지 않는다(OCP).
- 설계 원칙(SRP·OCP·LSP·ISP·DIP)의 판단 기준과 위반 신호는 `.agents/rules/design-principles.md`.

## 6. 다른 변형으로 가는 신호

| 신호 | 뜻 | 이동 |
|---|---|---|
| `common`을 세 번째 컨텍스트로 복사하고 있다 | 컨텍스트가 사실 하나이거나 전역 커널이 필요하다 | `ARCH=hexagonal`(전역 core·common + 컨텍스트당 4모듈) |
| 컨텍스트 간 `contract` 의존이 3개를 넘었다 | 경계가 잘못 그어졌다 | 컨텍스트 병합 또는 경계 재설정 |
| `bootstrap`이 하나뿐이고 앞으로도 그럴 것이다 | 독립 배포가 목적이 아니다 | `ARCH=hexagonal`로 후퇴 |
| 컨텍스트가 하나이고 CRUD 비중이 높다 | 헥사고날 자체가 과하다 | `ARCH=layered-multimodule` 또는 `layered` |

## 7. 새 컨텍스트 착수 워크플로

1. **정말 새 바운디드 컨텍스트인지 답한다.** 기존 컨텍스트의 애그리거트로 표현되면 모듈을 만들지 않는다.
2. `settings.gradle.kts`에 `context("<ctx>")` 한 줄 추가 → 7모듈 빌드 스크립트를 §1.2 의존표대로 작성.
3. `gradle/libs.versions.toml`에 필요한 라이브러리를 추가하고 **카탈로그 별칭으로만** 참조한다(`.agents/rules/tech.md`).
4. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `domain`: 애그리거트·VO 테스트 → 모델 구현.
   2. `application`: 유스케이스 테스트(fake `port.out`) → 포트 정의 → 유스케이스 구현.
   3. `infra`: 통합 테스트(Testcontainers 선택)로 `port.out` 구현 검증.
   4. `primary`: `@WebMvcTest`로 컨트롤러·DTO·매퍼. 응답은 envelope.
   5. `bootstrap`: 빈 등록·smoke 테스트 + `ApiEnvelopeContractTest`(§3).
5. §8 구조 테스트의 `OTHERS` 목록에 새 컨텍스트를 **등록**한다(등록 누락 = 강제 누락).
6. **검증**: `bash scripts/verify.sh`(= `./gradlew check`) 통과 + `.agents/docs/openapi` 동기화.
7. 실행 단위가 늘었으므로 포트·헬스체크·배포 파이프라인·로컬 `docker compose`에도 등록한다.

## 8. 구조 테스트 (모듈 그래프가 못 잡는 것)

모듈 그래프는 레이어 방향을 컴파일로 막지만 **컨텍스트 간 의존과 모듈 안 패키지 규율**은 못 잡는다.
실행 모듈이 컨텍스트마다 있으므로 이 테스트는 **컨텍스트마다 자기 `bootstrap` 테스트 소스셋**에 둔다.

```kotlin
// <ctx>/bootstrap/build.gradle.kts (testImplementation): com.lemonappdev:konsist:<version>
package {{PACKAGE_NS}}.{{DOMAIN_EXAMPLE}}.architecture

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.ext.list.withPackage
import com.lemonappdev.konsist.api.verify.assertFalse
import com.lemonappdev.konsist.api.verify.assertTrue
import io.kotest.core.spec.style.FunSpec

/** 컨텍스트 경계와 헥사고날 레이어 규율을 패키지 레벨에서 강제한다. */
class ArchitectureTest : FunSpec({

    val own = "{{DOMAIN_EXAMPLE}}"            // 이 컨텍스트
    val others = listOf("payment")            // 같은 리포의 다른 컨텍스트 — 추가할 때 여기에 등록
    val scope = Konsist.scopeFromProject()

    test("다른 컨텍스트의 코드를 직접 import 하지 않는다") {
        scope.files.withPackage("{{PACKAGE_NS}}.$own..").assertFalse { file ->
            file.imports.any { imp ->
                others.any { other ->
                    imp.name.startsWith("{{PACKAGE_NS}}.$other.") &&
                        !imp.name.startsWith("{{PACKAGE_NS}}.$other.contract.")
                }
            }
        }
    }

    test("domain·core 는 프레임워크(Spring/JPA)에 무의존이다") {
        scope.files.withPackage("..$own.domain..", "..$own.core..").assertFalse { file ->
            file.imports.any {
                it.name.startsWith("org.springframework") ||
                    it.name.startsWith("jakarta.persistence") ||
                    it.name.startsWith("javax.persistence")
            }
        }
    }

    test("domain·application 은 primary/infra 를 import 하지 않는다") {
        scope.files.withPackage("..$own.domain..", "..$own.application..").assertFalse { file ->
            file.imports.any { it.name.contains(".primary.") || it.name.contains(".infra.") }
        }
    }

    test("컨트롤러는 envelope 로 응답한다(ResponseEntity<DTO> 직접 반환 금지)") {
        scope.classes()
            .filter { it.name.endsWith("Controller") }
            .flatMap { it.functions() }
            .assertFalse { fn -> fn.returnType?.name?.startsWith("ResponseEntity") == true }
    }

    test("infra 어댑터 네이밍: *PersistenceAdapter 또는 *Mapper") {
        scope.classes()
            .withPackage("..$own.infra.persistence..")
            .filter { it.hasAnnotationWithName("Component", "Repository") }
            .assertTrue { it.name.endsWith("PersistenceAdapter") || it.name.endsWith("Mapper") }
    }
})
```

- **`others` 목록에 새 컨텍스트를 등록하지 않으면 그 컨텍스트로 향하는 의존은 검사되지 않는다.** 컨텍스트를 추가하면 모든 컨텍스트의 이 목록을 갱신한다.
- Java 프로젝트면 ArchUnit으로 같은 규칙을 표현한다: `noClasses().that().resideInAPackage("..<own>..").should().dependOnClassesThat().resideInAPackage("..<other>..")` + `layeredArchitecture()`.
- 규칙이 0개 클래스를 검사하면 실패로 취급한다. ArchUnit 1.x의 `archRule.failOnEmptyShould` 기본값 `true`를 끄지 않는다 — 패키지명 오타로 규칙이 조용히 죽는 것을 잡는 자동 감지다.
- 해당 없는 규칙은 **주석 처리가 아니라 삭제**한다. 죽은 규칙은 "검사하고 있다"는 착각만 남긴다.
- 규칙을 `@Disabled`로 끄는 것 = 경계를 없애는 것이다. 규칙이 틀렸다면 ADR을 남기고 경계를 다시 긋는다.

## 9. 레이어 규약

- 트랜잭션 경계는 `application`의 유스케이스 구현체에만. `infra` 어댑터·리포지토리·엔티티에 `@Transactional` 금지 — 엔티티 메서드의 `@Transactional`은 프록시 대상이 아니라 아무 효과가 없다.
- 외부 호출을 트랜잭션 안에 넣지 않는다(응답 3초 = DB 커넥션 3초 점유).
- **집계·카운터는 DB의 원자적 연산으로**. read-modify-write와 JVM 락(`synchronized`/`ReentrantLock`)은 인스턴스 2대에서 갱신 손실이 난다.
- **생성자 주입 only**. `@Value`·`@Autowired` 필드 주입 금지 — 설정은 `@ConfigurationProperties`로 받아 생성자로 넘긴다.
- 파싱·검증은 인바운드 경계(`primary`)에서. 안쪽 레이어가 원시 문자열·맵을 다시 검증하지 않는다.
- 자격증명·토큰·인증 헤더는 로그 금지. 예외는 `common`의 도메인 예외로 올리고 응답 변환은 `GlobalExceptionHandler` 한 곳.
- 시간·난수·ID는 인터페이스(`Clock`·`IdGenerator`)로 주입한다(결정성·테스트 가능).

## 10. 새 기능 착수 규칙

1. 새 기능은 **한 컨텍스트 안에서** 구현한다. 두 컨텍스트를 동시에 고쳐야 한다면 경계가 맞는지 먼저 의심한다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`를 함께 갱신한다. 실행 단위가 여럿이므로 **어느 컨텍스트의 API인지** 문서에 드러낸다.
4. 컨텍스트가 하나로 수렴하면 `hexagonal`로 후퇴, CRUD가 지배적이면 `layered-multimodule`을 검토한다(`ARCHITECTURE.md` §0·§12).

> `{{DOMAIN_EXAMPLE}}`·`payment`는 실제 바운디드 컨텍스트명으로 치환한다.
> 설치기는 토큰을 그대로 갈아 끼우므로 타입명 자리는 PascalCase로 손본다(패키지·설정 키·모듈명은 소문자 그대로).
