---
name: hx-jvm-hexagonal
description: JVM(Kotlin/Java + Spring) 리포를 헥사고날(클린 아키텍처) 멀티모듈로 세팅한다. 세 변형 중에서 고른다 — hexagonal(컨텍스트 최상위 :slug-ctx:infra) · hexagonal-nested(도메인 컨테이너 아래 중첩) · hexagonal-standalone(컨텍스트가 core·common·bootstrap까지 소유하는 자립형 :slug-ctx-infra, 컨텍스트마다 실행 단위 1개). hx-bootstrap 의 setup.sh 로 규칙·문서를 깔고, settings.gradle 모듈 등록·의존 방향·포트/어댑터·구조 테스트 레시피를 이어서 안내한다. "헥사고날로 세팅", "포트 어댑터 구조 잡아줘", "바운디드 컨텍스트별 모듈", "클린 아키텍처 멀티모듈" 요청 시 사용.
---

# hx-jvm-hexagonal — 헥사고날 멀티모듈 세팅

의존 방향을 **Gradle 모듈 그래프로 컴파일 레벨에서 강제**하는 구조다.
도메인은 프레임워크를 모르고, 바깥이 안쪽의 포트를 구현한다(DIP).

진입은 `hx-jvm-setup` 이지만 이 스킬만 단독으로 써도 된다(그 경우 아키텍처가 헥사고날로 확정된 상태다).

## 1. 세 변형 중 하나를 고른다

| 변형 | 모듈 경로 | 공유 커널 | 실행 단위 | 이럴 때 |
|---|---|---|---|---|
| `hexagonal` | `:<slug>-<ctx>:infra` | 전역 `core`·`common` 각 1개 | **1개** | 컨텍스트가 여럿이어도 **한 배포 단위**다 (기본값) |
| `hexagonal-nested` | `:<slug>-domain:<ctx>:infra` | 전역 1개 | 1개 | 위와 같되 컨텍스트가 많아 리포 루트를 정돈하고 싶다 |
| `hexagonal-standalone` | `:<slug>-<ctx>-infra` | **컨텍스트마다 따로** | **컨텍스트마다 1개** | 컨텍스트를 **독립 배포 단위**로 다룬다(서비스 분리 예정) |

**세 변형의 레이어 규칙과 의존 방향은 같다.** 다른 것은 공유 범위와 실행 단위 수뿐이다.

묻는 순서:

1. 컨텍스트를 **각각 따로 배포할 계획**이 있는가(지금이든 나중이든)?
   - 있다 → `hexagonal-standalone`
   - 없다 → 2번.
2. 컨텍스트가 몇 개가 될 것 같은가?
   - 3개 이하 → `hexagonal`
   - 그보다 많아 리포 루트가 번잡해질 것 같다 → `hexagonal-nested`

> `hexagonal-standalone` 은 `core`·`common` 이 컨텍스트마다 복제된다. 그 값을 지불할 이유(독립 배포·독립 스케일·팀 분리)가
> 없으면 고르지 않는다. 판단이 서지 않으면 `hexagonal` 로 시작해 필요할 때 승격하는 편이 되돌리기 쉽다.

## 2. 설치

```bash
BOOTSTRAP_DIR="<플러그인 내 skills/hx-bootstrap 절대경로>"
STACK=jvm ARCH=<hexagonal|hexagonal-nested|hexagonal-standalone> \
PROJECT_NAME="MyApp" PROJECT_SLUG="my-app" PACKAGE_NS="com.example.myapp" DOMAIN_EXAMPLE="order" \
  bash "$BOOTSTRAP_DIR/setup.sh" --lang=kotlin --agents=<목록> --dry-run <대상_경로>
```

`--dry-run` 으로 먼저 보여주고 승인 후 실제 설치. 에이전트는 `--list-agents` 로 감지 결과를 확인받는다.

## 3. 모듈 등록 (설치 후 첫 작업)

### 3.1 `hexagonal` — 컨텍스트가 최상위 모듈

```kotlin
// settings.gradle.kts
rootProject.name = "my-app"
include(":my-app-core", ":my-app-common", ":my-app-bootstrap")
listOf("order", "payment").forEach { ctx ->
    listOf("domain", "application", "primary", "infra").forEach { layer ->
        include(":my-app-$ctx:$layer")
    }
}
```

디렉터리는 `my-app-order/domain/` 처럼 Gradle 기본 매핑을 그대로 쓴다(`projectDir` 재지정 불필요).
leaf 모듈명(`domain`·`infra`…)이 컨텍스트 간 중복되므로 **`group` 을 `<pkg>.<ctx>` 로 분리**하고
`archivesName` 을 경로 기반으로 유니크화한다(capability·jar 충돌 회피).

### 3.2 `hexagonal-nested` — 도메인 컨테이너 아래 중첩

```kotlin
include(":my-app-domain:order:domain", ":my-app-domain:order:application", /* … */)
```

디렉터리는 `my-app-domain/order/domain/`. 규칙은 3.1과 동일(`group` 분리 필요).

### 3.3 `hexagonal-standalone` — 컨텍스트당 7모듈 자립

```kotlin
// settings.gradle.kts
rootProject.name = "my-app"

val LAYERS = listOf("core", "common", "domain", "application", "primary", "infra", "bootstrap")

fun context(ctx: String, layers: List<String> = LAYERS) {
    layers.forEach { layer ->
        val path = ":my-app-$ctx-$layer"
        include(path)
        project(path).projectDir = file("$ctx/$layer")   // 모듈명은 평면, 디렉터리는 컨텍스트별
    }
}

context("order")
context("payment")
```

- 모듈명이 전역 유니크하므로 **`group` 분리·`archivesName` 유니크화가 필요 없다**(중첩 변형과의 실질적 차이).
- 전역 공유 모듈이 없다. `core`·`common`·`bootstrap` 을 컨텍스트마다 소유한다.
- 모듈이 7×N개가 되므로 **`build-logic` 컨벤션 플러그인**을 먼저 만든다:
  `jvm-base`(toolchain·컴파일 옵션·테스트) · `pure-module`(core·domain — Spring/JPA 금지) ·
  `spring-module`(common·application·primary·infra) · `boot-app`(bootstrap — Spring Boot 플러그인).

## 4. 의존 방향 (세 변형 공통 — 이 표대로 빌드 스크립트를 쓴다)

| 모듈 | 의존 가능 |
|---|---|
| `bootstrap` | `common` + (각 컨텍스트의) `primary`·`infra` |
| `primary` | `application`, `common` |
| `infra` | `application`, `common`, `core` |
| `application` | `domain`, `core` |
| `domain` | `core` |
| `common` | `core` |
| `core` | — (프레임워크 0) |

- **컴파일 차단**: `domain → infra/primary`, `application → infra/primary`, `core → 외부`, `primary ↔ infra`.
- `core`·`domain` 빌드 스크립트에 **Spring/JPA 플러그인을 부착하지 않는다**. 루트 `subprojects { }` 로 의존성을 뿌리지도 않는다.
- **Spring Boot 플러그인은 `bootstrap` 에만.** 라이브러리 모듈에 붙으면 `bootJar` 가 생겨 `project(...)` 의존이 깨진다.
- 컨텍스트의 모듈 묶음은 **항상 한 번에 추가·제거**한다(4모듈 또는 7모듈).
- `hexagonal-standalone` 에서는 위 의존이 모두 **같은 컨텍스트 안**으로 한정된다.

## 5. 포트 & 어댑터

- **Inbound Port**(`port.in`) = 유스케이스 인터페이스. `application/usecase/<X>UseCase`. 어노테이션 없는 POJO.
  컨트롤러는 구현체가 아니라 이 인터페이스에만 의존한다.
- **Outbound Port**(`port.out`) = 저장소·외부 시스템 추상. `application/output/`.
  **`application` 이 정의하고 `infra` 가 구현한다** — 추상의 소유자가 안쪽이라는 것이 DIP의 실체다.
- 포트는 **애그리거트 단위**로 정의한다(`save(order)`·`findById`). `upsert(컬럼들)`·SQL 같은 영속 메커니즘을
  시그니처에 드러내지 않는다(멱등·충돌 처리는 어댑터 내부).
- 새 외부 시스템 통합 = **새 `port.out` + 새 `infra` 어댑터**. `application`·`domain` 은 손대지 않는다(OCP).
- 판단이 갈리면 `.agents/rules/design-principles.md` (DIP·ISP·OCP 절).

## 6. 컨텍스트 간 통합

| 변형 | 기본 규칙 |
|---|---|
| `hexagonal` · `hexagonal-nested` | 다른 컨텍스트의 **도메인 모델을 직접 import 하지 않는다**. 공개 계약(`<ctx>:contract`) 또는 도메인 이벤트 경유 |
| `hexagonal-standalone` | 위에 더해 **컨텍스트 간 모듈 의존 자체를 금지**한다. HTTP/gRPC · 이벤트 · `contract` 모듈 중 하나를 고르고 `structure.md` §2 표에 기록 |

`hexagonal-standalone` 에서 컨텍스트 간 의존은 **컴파일러가 막지 않는다**(모듈 그래프는 선언만 하면 통과시킨다).
구조 테스트가 유일한 기계적 방어선이므로 §7의 `others` 목록 관리가 필수다.

## 7. 구조 테스트 (모듈 그래프가 못 잡는 것)

모듈 그래프는 레이어 방향을 막지만 **모듈 안 패키지 규율**과 **컨텍스트 간 의존**은 못 잡는다.

| 변형 | 어디에 두나 | 무엇을 검사하나 |
|---|---|---|
| `hexagonal` · `hexagonal-nested` | 전역 `bootstrap` 테스트 소스셋 | 도메인 프레임워크 무의존 · domain/application → primary/infra 금지 · 컨텍스트 간 도메인 직접 import · 컨트롤러 envelope · `*PersistenceAdapter` 네이밍 |
| `hexagonal-standalone` | **컨텍스트마다** 자기 `bootstrap` 테스트 소스셋 | 위 + **다른 컨텍스트 import 금지**(`others` 목록 기반) |

- Kotlin → **Konsist**, Java → **ArchUnit**. 스켈레톤은 설치된 `.agents/rules/structure.md` 의 구조 테스트 절에 있다.
- **컨텍스트를 추가하면 구조 테스트에 등록**한다. `hexagonal-standalone` 은 **모든 컨텍스트의 `others` 목록**을 갱신해야 한다(등록 누락 = 강제 누락).
- 규칙이 0개 클래스를 검사하면 실패로 취급한다(`failOnEmptyShould` 기본값 `true` 를 끄지 않는다).
- 해당 없는 규칙은 주석 처리가 아니라 **삭제**한다. `@Disabled` 로 끄는 것은 경계를 없애는 것이다.

## 8. 첫 기능까지의 순서

1. 컨텍스트 하나를 정한다(`DOMAIN_EXAMPLE` 로 넣은 이름이면 그대로).
2. 모듈 등록(§3) → 빌드 스크립트를 §4 의존표대로 작성 → `gradle/libs.versions.toml` 에 라이브러리 추가.
3. TDD 사이클:
   `domain`(애그리거트·VO) → `application`(유스케이스 + fake `port.out`) → `infra`(Testcontainers 로 어댑터) →
   `primary`(`@WebMvcTest`, 응답은 envelope) → `bootstrap`(빈 등록·smoke + 구조 테스트).
4. `bash scripts/verify.sh` 통과 확인 — 의존 위반이 **컴파일 실패**로 잡히는지 일부러 한 번 어겨서 확인한다.
5. `.agents/docs/openapi` 동기화. 복잡 작업은 `/hx-specify` 로 SDD 스펙을 먼저 만든다.

## 9. 자주 나오는 실수

- `port.out` 인터페이스를 `infra` 패키지에 둔다 → **추상의 소유자가 바깥이 된다**(DIP 미적용). `application` 으로 옮긴다.
- 포트 시그니처에 JPA 타입·SQL·컬럼명이 드러난다 → 애그리거트 단위로 다시 정의한다.
- 컨트롤러가 `ResponseEntity<DTO>` 를 직접 반환한다 → envelope 우회. 구조 테스트가 잡아야 한다.
- `application`·`domain` 이 `HttpStatus`·Spring web 타입을 참조한다 → 표현 관심사가 정책에 스몄다.
- 인터페이스와 구현 한 쌍을 레이어 안에서도 관성으로 만든다 → 포트가 아닌 곳엔 만들지 않는다.
- `hexagonal-standalone` 에서 다른 컨텍스트의 **테이블을 조인**한다 → 컴파일러도 구조 테스트도 못 잡는다. 리뷰가 유일한 방어선.

## 10. 관련

- 설치된 원본: `ARCHITECTURE.md`(§0 선택 기준·§12 전환) · `.agents/rules/structure.md` · `.agents/rules/tech.md`
- 설계 원칙: `.agents/rules/design-principles.md`
- 다른 아키텍처: `hx-jvm-layered` · `hx-jvm-layered-multimodule` · 진입 `hx-jvm-setup`
