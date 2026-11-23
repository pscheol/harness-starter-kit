---
name: hx-jvm-layered-multimodule
description: JVM(Kotlin/Java + Spring) 리포를 멀티모듈 레이어드로 세팅한다. 레이어를 Gradle 모듈로 자르고(:slug-api · :slug-service · :slug-domain · :slug-common, 선택 :slug-batch·:slug-admin·:slug-client) 레이어 방향을 컴파일 레벨에서 강제한다. 같은 도메인·서비스 계층 위에 실행 단위를 여럿(API·배치·관리자) 둘 수 있다. hx-bootstrap 의 setup.sh 를 ARCH=layered-multimodule 로 실행한 뒤 모듈 등록·엔티티 노출 범위(api vs implementation) 결정·구조 테스트를 안내한다. "멀티모듈 레이어드", "레이어를 모듈로 나눠줘", "api service domain 모듈 구조", "배치랑 API 같이 쓰는 구조" 요청 시 사용.
---

# hx-jvm-layered-multimodule — 멀티모듈 레이어드 세팅

레이어를 Gradle 모듈로 자른다. 단일 모듈 `layered` 가 ArchUnit 테스트로만 지키던 레이어 방향을
여기서는 **컴파일러가 막는다**. 그리고 같은 계층 위에 **실행 단위를 여럿** 둘 수 있다.

진입은 `hx-jvm-setup` 이지만 이 스킬만 단독으로 써도 된다.

## 1. 이 구조가 맞는지 먼저 확인

**맞다**:
- 같은 도메인·서비스 계층 위에 **실행 단위가 여럿**이다(API 서버 + 배치 + 관리자). 단일 모듈로는 표현할 수 없다.
- 레이어 방향을 테스트가 아니라 **컴파일러가** 막아 주기를 원한다.
- CRUD 비중이 높아 포트/어댑터는 과하지만 단일 모듈은 이미 부담스럽다.

**아니다**:

| 상황 | 대신 고를 것 |
|---|---|
| 실행 단위가 하나뿐이고 앞으로도 그렇다 | `layered`(모듈 경계 유지 비용만 든다) |
| 도메인 규칙이 복잡 · 저장소/외부 시스템 교체 가능성 | `hexagonal`(이 변형은 도메인이 JPA를 안다) |
| 컨텍스트를 독립 배포 단위로 다룰 계획 | `hexagonal-standalone` |
| 분할 축이 레이어가 아니라 도메인·기능이다 | `modulith` · `feature` |

> **헥사고날과의 결정적 차이: 포트/어댑터가 없다.** `service` 가 리포지토리를 직접 쓰고 도메인 모델이 JPA를 안다.
> 그 대가로 매핑 계층이 줄고 CRUD 가 단순해진다. 도메인 규칙이 얇을 때만 이 거래가 이득이다.

## 2. 설치

```bash
BOOTSTRAP_DIR="<플러그인 내 skills/hx-bootstrap 절대경로>"
STACK=jvm ARCH=layered-multimodule \
PROJECT_NAME="MyApp" PROJECT_SLUG="my-app" PACKAGE_NS="com.example.myapp" DOMAIN_EXAMPLE="order" \
  bash "$BOOTSTRAP_DIR/setup.sh" --lang=kotlin --agents=<목록> --dry-run <대상_경로>
```

`--dry-run` 으로 먼저 보여주고 승인 후 실제 설치.

## 3. 모듈 등록 (설치 후 첫 작업)

```kotlin
// settings.gradle.kts
rootProject.name = "my-app"
include(
    ":my-app-api",        // 실행 단위 — @SpringBootApplication
    ":my-app-service",    // 비즈니스 규칙 · 트랜잭션 경계
    ":my-app-domain",     // JPA 엔티티 + Spring Data 리포지토리 + 마이그레이션
    ":my-app-common",     // envelope · ErrorCode · 공용 상수
)
// 필요할 때 추가: ":my-app-batch", ":my-app-admin", ":my-app-client"
```

디렉터리는 모듈 경로와 같다(`my-app-api/`). `projectDir` 재지정이 필요 없다.
**`batch`·`admin`·`client` 를 처음부터 빈 모듈로 만들지 않는다.** 필요해질 때 만든다.

### 의존 방향 (컴파일 강제)

| 모듈 | 의존 가능 | Spring Boot 플러그인 |
|---|---|---|
| `api` · `batch` · `admin` | `service`, `common` | ✅ |
| `service` | `domain`, `client`, `common` | ✗ |
| `domain` | `common` | ✗ |
| `client` | `common` | ✗ |
| `common` | — | ✗ |

- **금지(컴파일 차단)**: `service → api` · `domain → service/api` · `common → 위 전부` · **실행 단위끼리 의존**.
- **Spring Boot 플러그인은 실행 단위에만.** 라이브러리 모듈에 붙으면 `bootJar` 가 생기고 일반 `jar` 가 비활성화돼
  `project(...)` 의존이 깨진다. 이건 이 변형에서 가장 흔한 첫 빌드 실패 원인이다.
- 루트 `subprojects { }` 에 Spring Web·JPA 의존성을 **넣지 않는다**. `common` 까지 오염되고 모든 모듈이 끌고 간다.
- `common` 을 늘리지 않는다. "둘 다 쓰니까 공유로"를 반복하면 `common` 이 곧 전체가 된다.

## 4. 엔티티 노출 범위 — 설치 직후 반드시 정한다

`service` 가 `domain` 을 **어떤 configuration 으로 노출하느냐**가 실행 단위의 엔티티 접근을 결정한다.
이 결정을 미루면 사람마다 다르게 선언해 곧 섞인다.

| 방식 | 선언 | 실행 단위가 엔티티를 | 강제 | 대가 |
|---|---|---|---|---|
| **(A) 노출**(기본) | `api(project(":my-app-domain"))` | 본다 | **ArchUnit** 이 컨트롤러 시그니처를 막는다 | 매핑 한 겹 절약 |
| (B) 차단 | `implementation(project(":my-app-domain"))` + 서비스가 결과 모델 반환 | **못 본다** | **컴파일러** | 결과 모델 + 매핑 한 겹 |

- 실행 단위가 3개 이상이거나 외부에 API 스펙을 공개한다면 (B)가 값을 한다.
- 실행 단위가 `api` 하나이고 CRUD 위주라면 (A)로 충분하다.
- **(A)를 골랐다면 §5의 `컨트롤러는_엔티티를_반환하지_않는다` 규칙이 유일한 방어선**이다. 그 규칙을 지우면 아키텍처가 사라진다.
- 고른 방식과 이유를 **설치된 `.agents/rules/structure.md` §1.2의 "채택한 방식"** 에 적는다.

## 5. 구조 테스트 (모듈 그래프가 못 잡는 것)

모든 모듈이 클래스패스에 올라오는 **`api` 모듈 테스트 소스셋**에 `LayeredModuleTest` 를 둔다.
스켈레톤 전문은 설치된 `.agents/rules/structure.md` 의 구조 테스트 절에 있다.

| 규칙 | 잡는 것 |
|---|---|
| 컨트롤러는 엔티티를 반환하지 않는다 | (A) 방식의 엔티티 누출 — **필수** |
| 트랜잭션은 `service` 에만 | `api`·`domain`·`client` 의 `@Transactional` |
| `domain`·`client` 는 web 을 모른다 | `org.springframework.web` 의존 |
| `common` 은 프레임워크를 모른다 | Spring Web·JPA 의존(모든 모듈이 끌고 간다) |
| `service` 는 컨트롤러 DTO 를 모른다 | 표현 관심사의 역류 |

- 레이어 모듈을 추가하면 **이 테스트에도 등록**한다(등록 누락 = 강제 누락).
- 규칙이 0개 클래스를 검사하면 실패로 취급한다(`failOnEmptyShould` 기본값 `true` 유지).
- 설치 직후 한 번은 일부러 어겨서(`service` 에서 `api` 를 import) **컴파일이 실패하는지** 확인한다.

## 6. 실행 단위를 늘릴 때

이 변형을 고른 이유가 대개 여기 있다.

1. 정말 별도 실행 단위인지 답한다. "관리자 화면" 만으로는 이유가 안 된다 —
   **배포 주기·스케일·보안 경계가 다를 때** 만든다. 경로 분리로 충분한 경우가 훨씬 많다.
2. `settings.gradle.kts` 등록 → Spring Boot 플러그인 적용 → `service`·`common` 의존.
3. **포트를 `.agents/rules/tech.md` 포트 표에 등록**한다. 등록 없이 8080을 재사용하면 로컬에서 두 번째가 뜨지 않는다.
4. 배포 파이프라인·헬스체크·로그 라벨을 추가한다.
5. **마이그레이션 적용 주체를 하나로 정한다.** 실행 단위 여럿이 동시에 기동하며 각자 마이그레이션을 시도하면
   락 경합·중복 적용 위험이 생긴다. 기본은 `api` 만 적용, 나머지는 `validate`.
6. 실행 단위 간 직접 의존을 만들지 않는다. 공유가 필요하면 `service`·`common` 으로 내린다.

## 7. 첫 기능까지의 순서

1. `domain/<X>`(엔티티) → `domain/<X>Repository` → `service/<X>Service` → `api/<X>/dto/` → `api/<X>/<X>Controller`.
2. TDD 사이클:
   1. `domain`: 엔티티 상태 불변식 테스트 → 구현.
   2. `service`: 규칙 테스트(fake 리포지토리) → 구현.
   3. `domain`: `@DataJpaTest`(+ Testcontainers 선택)로 쿼리·매핑 검증.
   4. `api`: `@WebMvcTest` 로 검증·상태코드·**envelope** 확인.
   5. 통합: `@SpringBootTest` smoke.
3. `bash scripts/verify.sh` 통과 + `.agents/docs/openapi` 동기화.
4. 복잡 작업은 `/hx-specify` 로 SDD 스펙을 먼저 만든다.

## 8. 자주 나오는 실수

- 라이브러리 모듈에 Spring Boot 플러그인을 붙여 `project(...)` 의존이 깨진다(§3).
- 루트 `subprojects { }` 로 Spring 의존성을 뿌려 `common`·`domain` 이 오염된다.
- 실행 단위가 `@ComponentScan(basePackages = "…다른 모듈…")` 으로 남의 패키지를 긁는다 →
  라이브러리 모듈이 `@AutoConfiguration` + `META-INF/spring/…AutoConfiguration.imports` 로 스스로 등록하거나 실행 단위가 명시적으로 `@Import` 한다.
- `api()` 와 `implementation()` 을 모듈마다 다르게 선언해 (A)/(B)가 섞인다(§4).
- `service` 가 비대해져 `XxxFacadeService` 가 된다 → 도메인별로 쪼갠다(SRP, `.agents/rules/design-principles.md`).
- 엔티티가 응답으로 새어 나가 영속 모델 변경이 곧 API 변경이 된다.
- 실행 단위끼리 의존해서(`admin → api`) 실행 단위가 아니라 레이어가 하나 더 생긴다.

## 9. 승격·후퇴 신호

| 신호 | 이동 |
|---|---|
| 실행 단위가 끝내 `api` 하나, 빌드 스크립트 유지가 부담 | `layered`(단일 모듈) — **ArchUnit 으로 레이어 방향을 옮기는 것을 빠뜨리지 않는다** |
| `service` 에 도메인 규칙이 쌓여 손대기 어렵다 | `hexagonal` |
| 컨텍스트를 독립 배포하고 싶다 | `hexagonal-standalone` |
| 한 기능을 고치면 5개 모듈을 동시에 만진다 | `modulith` · `feature`(분할 축을 도메인/기능으로) |

전환 절차는 설치된 `ARCHITECTURE.md` §12에 있다.

## 10. 관련

- 설치된 원본: `ARCHITECTURE.md`(§0 선택 기준·§3.2 엔티티 노출·§12 전환) · `.agents/rules/structure.md` · `.agents/rules/tech.md`
- 설계 원칙: `.agents/rules/design-principles.md`
- 다른 아키텍처: `hx-jvm-layered` · `hx-jvm-hexagonal` · 진입 `hx-jvm-setup`
