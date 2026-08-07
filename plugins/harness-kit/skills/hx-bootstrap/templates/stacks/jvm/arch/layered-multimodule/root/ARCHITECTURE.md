<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Kotlin/Java + Spring Boot(JVM) · 아키텍처: layered-multimodule -->

# ARCHITECTURE — {{PROJECT_NAME}}

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `.agents/rules/tech.md`, 레이아웃·착수 절차는 `.agents/rules/structure.md`를 본다.

본 프로젝트는 레이어드 아키텍처를 **레이어 = Gradle 모듈**로 자르고, 레이어 방향을 **컴파일 레벨로 강제**한다.
객체지향·SOLID 원칙은 레이어 안에서 적용한다(`.agents/rules/design-principles.md`).

---

## 0. 이 변형을 고르는 기준

### 이럴 때 쓴다

- **같은 도메인·서비스 계층 위에 실행 단위가 여럿**이다(API 서버 + 배치 + 관리자). 단일 모듈로는 이걸 표현할 수 없다.
- 레이어 방향을 **ArchUnit 테스트가 아니라 컴파일러가** 막아 주기를 원한다(테스트는 지우면 그만이지만 모듈 그래프는 지우기 어렵다).
- 팀이 커져 레이어별로 소유가 갈리고, 하위 레이어 변경이 상위 전체를 재컴파일하지 않기를 원한다.
- CRUD 비중이 높아 **포트/어댑터가 순수 오버헤드**이지만, 단일 모듈은 이미 부담스럽다.

### 이럴 때 쓰지 않는다

- 실행 단위가 **하나뿐이고 앞으로도 그럴 것이다** → `layered`(단일 모듈). 모듈 경계 유지 비용만 지불하게 된다.
- **도메인 규칙이 복잡**하거나 저장소·외부 시스템을 교체할 계획이 있다 → `hexagonal` 계열. 이 변형은 도메인이 JPA를 안다.
- 도메인이 둘 이상이고 **나중에 떼어낼** 가능성이 있다 → `modulith` 또는 `hexagonal-standalone`.
- 기능 영역이 여럿이고 사람마다 다른 영역을 만진다 → `feature`(레이어보다 기능이 우선하는 분할).

### 인접 변형과의 차이

| 변형 | 분할 축 | 도메인이 JPA를 아는가 | 강제 수단 | 실행 단위 |
|---|---|---|---|---|
| `layered` | 없음(단일 모듈, 패키지만) | 안다 | ArchUnit만 | 1 |
| **`layered-multimodule`**(이 변형) | **레이어** | **안다** | **모듈 그래프 + ArchUnit** | 1~N |
| `multimodule` | 프로젝트가 고른다(도메인·연동·기술) | 모듈에 따라 | 등급 방향 + ArchUnit | 1 |
| `hexagonal` | 바운디드 컨텍스트 × 레이어 | **모른다**(포트로 격리) | 모듈 그래프 + Konsist | 1 |

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 레이어 단방향 (위→아래) | Gradle 모듈 의존 그래프 | 컴파일 실패 |
| 레이어 건너뛰기 금지 | 모듈 그래프 + `api()`/`implementation()` 선택(§3.2) | 컴파일 실패 또는 ArchUnit 실패 |
| 실행 단위 간 의존 금지 | 모듈 그래프 | 컴파일 실패 |
| 엔티티가 API 응답으로 새지 않음 | ArchUnit(`컨트롤러는_엔티티를_반환하지_않는다`) | `./gradlew check` 실패 |
| 트랜잭션 경계는 `service`에만 | ArchUnit | `./gradlew check` 실패 |
| API 응답 일관성 | `common`의 envelope + `ErrorCode` 단일 매핑 | `GlobalExceptionHandler`가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80% | `./gradlew check` 게이트 |

> **기계적 강제 우선**. 빌드가 막아주는 위반은 리뷰 가드보다 우선한다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌──────────────────────────────────────┐
 │ Client   │───────▶│  :{{PROJECT_SLUG}}-api                │
 └──────────┘        └───────────────┬──────────────────────┘
 ┌──────────┐        ┌───────────────┴──────────────────────┐
 │ 운영자    │───────▶│  :{{PROJECT_SLUG}}-admin  (선택)      │
 └──────────┘        └───────────────┬──────────────────────┘
 ┌──────────┐        ┌───────────────┴──────────────────────┐
 │ 스케줄러  │───────▶│  :{{PROJECT_SLUG}}-batch  (선택)      │
 └──────────┘        └───────────────┬──────────────────────┘
                                     │  공유: service → domain → common
        ┌──────────────┬─────────────┴──┬──────────────┐
        ▼              ▼                ▼              ▼
  ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
  │ 관계형 DB   │ │ Cache/Queue │ │ Object Store│ │ 외부 시스템 │
  │            │ │  (선택)      │ │  (선택)      │ │  (선택)     │
  └────────────┘ └─────────────┘ └─────────────┘ └────────────┘
```

- **실행 단위가 여럿이어도 DB는 하나**다. 스키마·마이그레이션은 `domain` 모듈이 소유하고, 적용 주체를 하나로 정한다(`.agents/rules/tech.md`).
- 서비스 인스턴스는 **무상태**. 세션·락 상태는 외부 저장소(DB·캐시)에 둔다.
- 필요 시 앞단에 리버스 프록시/게이트웨이(선택). 관리 행위(Admin action)는 audit log에 남긴다.

---

## 3. 멀티모듈 레이어드

### 3.1 모듈 ↔ 레이어 매핑

| 모듈 | 레이어 | 의존 가능 | Spring Boot 플러그인 |
|---|---|---|---|
| `:{{PROJECT_SLUG}}-api` · `-batch` · `-admin` | 실행·표현 | `service`, `common` | ✅ |
| `:{{PROJECT_SLUG}}-service` | 응용·비즈니스 | `domain`, `client`, `common` | ✗ |
| `:{{PROJECT_SLUG}}-domain` | 모델·영속(JPA 엔티티 + 리포지토리) | `common` | ✗ |
| `:{{PROJECT_SLUG}}-client` (선택) | 외부 연동 | `common` | ✗ |
| `:{{PROJECT_SLUG}}-common` | 공유 커널(envelope·ErrorCode) | — | ✗ |

- **의존 금지(컴파일 차단)**: `service → api/batch/admin`, `domain → service/api`, `client → service/api`, `common → 위 전부`, `실행 단위 ↔ 실행 단위`.
- 패키지는 모듈과 1:1(`{{PACKAGE_NS}}.{common,domain,client,service,api}`). 도메인이 늘면 레이어 아래에 도메인 패키지를 둔다.
- `common`에 Spring Web·JPA를 넣지 않는다. 모든 모듈이 끌고 간다.

### 3.2 엔티티 노출 범위 (프로젝트가 고른다)

`service`가 `domain`을 `api()`로 노출하면 실행 단위가 엔티티를 컴파일 타임에 본다. `implementation()`이면 못 본다.

| 방식 | 실행 단위가 엔티티를 | 강제 | 대가 |
|---|---|---|---|
| **(A) 노출**(기본) | 본다 | ArchUnit 규칙이 컨트롤러 시그니처를 막는다 | 매핑 한 겹 절약 |
| (B) 차단 | 못 본다 | **컴파일러** | 서비스 결과 모델 + 매핑 한 겹 |

`.agents/rules/structure.md` §1.2에 채택한 방식과 이유를 기록한다. (A)를 골랐다면 ArchUnit 규칙을 지우는 것은 아키텍처를 지우는 것이다.

### 3.3 실행 단위를 늘리는 기준

- 별도 모듈은 **배포 주기·스케일·보안 경계가 다를 때** 만든다. "관리자 화면"만으로는 이유가 되지 않는다(경로 분리로 충분한 경우가 많다).
- 실행 단위 간 직접 의존을 만들지 않는다. 공유가 필요하면 `service`·`common`으로 내린다.
- 실행 단위가 늘면 포트·헬스체크·배포 파이프라인·마이그레이션 적용 주체를 함께 정한다(`.agents/rules/tech.md`).

---

## 4. 레이어 책임과 SOLID

| 레이어 | 책임 | 하지 않는 것 |
|---|---|---|
| `api`(실행 단위) | HTTP 파싱·검증·인증 경계·DTO 변환·envelope 응답 | 비즈니스 규칙, 트랜잭션, 리포지토리 직접 호출 |
| `service` | 비즈니스 규칙 조립, **트랜잭션 경계**, 권한·정책 검사, 이벤트 발행 | HTTP 타입 참조, 요청 DTO 의존, 응답 상태코드 결정 |
| `domain` | 엔티티 상태 불변식, 테이블 매핑, 쿼리 | 트랜잭션 시작, web 타입 참조 |
| `client` | 외부 시스템 호출·재시도·타임아웃·응답 변환 | 비즈니스 판단 |
| `common` | envelope·ErrorCode·공용 상수 | 프레임워크 의존, 도메인 지식 |

- **비즈니스 규칙은 가능한 한 엔티티 안에.** `service`가 엔티티의 getter/setter만 호출하며 규칙을 조립하고 있다면 Anemic Domain Model이다. 상태 전이(`order.cancel()`)는 엔티티가 소유한다.
- `service`가 비대해지면 **도메인별로 쪼갠다**(`OrderService`·`OrderPricingService`). "모든 것을 하는 `XxxFacadeService`"는 SRP 위반의 전형이다.
- 외부 시스템이 둘 이상이면 `client`에 인터페이스를 두고 구현을 갈아 끼운다(DIP·OCP). 구현이 하나뿐이면 인터페이스를 만들지 않는다.
- 트랜잭션 경계는 `service`에만. `domain`·`client`·`api`에 `@Transactional`을 붙이지 않는다.
- **생성자 주입 only**. `@Autowired` 필드/세터 주입·`lateinit var` 의존성 금지. 시간·난수·ID는 인터페이스(`Clock`·`IdGenerator`)로 주입한다.
- **로깅은 경계에서만**(`api`·`service`·`client`). 에러는 경계에서 한 번만 남긴다(중복 로깅 금지). 민감정보는 로그 금지.

> SOLID 5원칙의 판단 기준·위반 신호·리팩터링 절차는 `.agents/rules/design-principles.md`가 원본이다.
> 이 변형에서 특히 자주 문제가 되는 것은 **SRP**(`service` 비대화)와 **LSP**(엔티티 상속 계층)다.

---

## 5. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. 코드로 말할 수 없는 것 — Why · 함정 · 외부 근거 · 억제 이유 — 만 적는다.
- 단계별 `처리 흐름:`은 분기가 얽혀 절차가 안 잡히거나, 순서를 바꾸면 버그가 나는 함수에 쓴다. 5단계 이내.
- CRUD·getter·위임·매퍼·DTO에는 달지 않는다. 규칙 문서로 보내는 참조 주석도 쓰지 않는다.
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석·예시에도 넣지 않는다. 원본: `.agents/rules/code-comments.md`.

---

## 6. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 컴파일 타임 도메인 상수 | 코드 의미를 갖는 고정 라벨·키 | `const`/`enum`/`object`(소유 레이어) |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `application.yml` + `@ConfigurationProperties`(+ env) |
| (c) 운영자 변경 가능 값 | 운영사가 런타임에 조정 | DB 설정 테이블·기능 플래그(캐시·무효화 동반) |

- 에러코드·사용자 메시지는 문자열 리터럴 금지: 코드는 `common`의 `ErrorCode`, 메시지는 i18n 키(`error.{ErrorCode}`).
- 실행 단위마다 설정 파일이 갈리므로 **공통 설정은 `common` 리소스 또는 `application-common.yml`로** 두고 각 실행 단위가 import한다. 복붙하면 곧 갈라진다.

---

## 7. 대규모 트래픽 · 성능 예산

- 무한/대량 결과 금지: 목록은 cursor pagination + 상한 `limit` 강제.
- **N+1 회피**: fetch join·배치·`IN` 조회. WHERE/JOIN/ORDER BY 컬럼에 인덱스 동반.
- **핫패스 경량화**: 인증·키 검증 등 고빈도 경로는 단건 인덱스 조회 + 캐시(TTL·무효화 동반).
- **동기 응답 경로 보호**: 무거운 작업은 `batch` 실행 단위나 큐로 넘긴다 — 실행 단위를 나눌 수 있다는 것이 이 변형의 이점이다.
- **외부 호출 안정화**: `client`에 타임아웃·재시도·서킷브레이커·커넥션 풀 필수.
- **무상태·수평 확장**: 상태는 외부 저장소. 멱등키로 재시도 안전.
- **가상 스레드**: `spring.threads.virtual.enabled=true`(JDK 21+). 실제 DB 동시성 상한은 커넥션 풀이 결정한다.

| 경로 부류 | 목표(예시 — 프로젝트에서 확정) | 도달 레버 |
|---|---|---|
| 캐시/인증 핫패스 | 고 TPS/인스턴스 | 캐시로 DB 왕복 제거 |
| 일반 읽기 | 수천 TPS/인스턴스 | 인덱스·keyset·커넥션 풀 사이징 |
| 쓰기 | 수백~수천 TPS | 무거운 작업은 `batch`로 |
| 배치 | 처리량/윈도 기준 | 청크 처리·병렬 스텝 |

---

## 8. TDD 워크플로

```
RED   레이어 하나의 행위에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

| 모듈 | 도구 | 비고 |
|---|---|---|
| `common` | JUnit5/Kotest | 순수 함수·상수 |
| `domain` | `@DataJpaTest` + Testcontainers(선택) | 엔티티 불변식·쿼리·매핑 |
| `service` | Kotest + 손수 짠 fake 리포지토리 | Spring 컨텍스트 미기동 |
| `client` | WireMock/MockWebServer | 타임아웃·재시도·에러 변환 |
| `api` | `@WebMvcTest` + `@SpringBootTest` | envelope·status + smoke + **구조 테스트** |

- 테스트가 먼저, 구현이 나중. 테스트 없는 서비스·엔티티 변경 금지. Mock은 꼭 필요할 때만(우선 손수 짠 fake).
- 검증 게이트: `bash scripts/verify.sh`(= `./gradlew check`).

---

## 9. 새 기능 추가 워크플로

1. **범위 결정**: 새 리소스인지 기존 리소스의 새 동작인지 먼저 답한다.
2. `domain/<X>`(엔티티) → `domain/<X>Repository` → `service/<X>Service` → `api/<X>/dto/` → `api/<X>/<X>Controller`.
3. TDD 사이클(§8).
4. 레이어 모듈을 새로 만들었다면 `settings.gradle.kts` 등록 + §3.1 의존표대로 빌드 스크립트 + **구조 테스트에 등록**.
5. `bash scripts/verify.sh` 통과 + `.agents/docs/openapi` 동기화.
6. 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록한다.

---

## 10. Anti-pattern (코드리뷰 즉시 차단)

- 컨트롤러가 리포지토리를 직접 호출(레이어 건너뛰기).
- **JPA 엔티티를 컨트롤러 시그니처·응답에 노출.** 영속 모델 변경이 곧 API 변경이 된다.
- 컨트롤러에서 `ResponseEntity<DTO>`를 직접 반환(envelope 우회).
- `service`가 `HttpStatus`·`ResponseEntity`·요청 DTO를 참조.
- `domain`·`client`·`api`에 `@Transactional` 부착.
- 실행 단위끼리 의존(`admin → api`).
- 루트 `subprojects { }`로 Spring 의존성을 전 모듈에 뿌림(→ `common` 오염).
- 라이브러리 모듈에 Spring Boot 플러그인 적용(`bootJar`가 생겨 `project(...)` 의존이 깨진다).
- 실행 단위가 `@ComponentScan(basePackages = "…다른 모듈…")`으로 남의 패키지를 긁음.
- 모든 것을 하는 거대 `XxxFacadeService`. setter만 잔뜩 있는 Anemic Domain Model.
- `common`이 도메인 지식을 갖기 시작함(`common/OrderStatus`).
- `!!`로 null assert. `@Autowired` 필드/세터 주입·`lateinit var` 의존성.
- 테스트 없이 서비스·엔티티 코드 추가.

---

## 11. 관련 문서

- 레이아웃·모듈 등록·구조 테스트: `.agents/rules/structure.md`
- 스택·버전·빌드 스크립트 규약·마이그레이션 소유: `.agents/rules/tech.md`
- **설계 원칙(객체지향·클린 아키텍처·SOLID)**: `.agents/rules/design-principles.md`
- 보안·API 규약: `.agents/rules/security.md` · `.agents/rules/api-standards.md`
- 주석 규약: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md` · SDD 기록: `.agents/docs/README.md`

---

## 12. 다른 변형으로 전환

전환은 되돌릴 수 없는 결정이 아니다. 신호가 보이면 ADR(`.agents/docs/decisions/`)을 남기고 옮긴다.

### → `layered` (단일 모듈로 후퇴)

**신호**: 실행 단위가 끝내 `api` 하나다 · 모듈 경계를 넘나드는 변경이 매번 4~5개 빌드 스크립트를 건드린다 · 팀이 작아졌다.

1. 모듈들을 하나로 합치고 패키지 구조(`controller`·`service`·`repository`·`entity`)로 재배치한다.
2. 컴파일이 막아 주던 레이어 방향을 **ArchUnit `layeredArchitecture()`로 옮긴다** — 이걸 빠뜨리면 강제가 사라진다.
3. `ARCH=layered`로 재설치.

### → `hexagonal` (도메인을 프레임워크에서 떼어낸다)

**신호**: `service`에 도메인 규칙이 쌓여 손대기 어렵다 · 저장소·외부 시스템 교체 요구가 생겼다 · 엔티티가 DB 스키마에 끌려다닌다.

1. 순수 도메인 모델을 새로 만든다(JPA 어노테이션 없는 애그리거트·VO). 기존 엔티티는 영속 모델로 남긴다.
2. `service`가 쓰던 리포지토리 인터페이스를 `application/output`의 **포트**로 옮기고, JPA 구현을 `infra` 어댑터로 내린다.
3. 모듈을 컨텍스트 × 레이어로 재편한다: `<ctx>/{domain,application,primary,infra}` + 전역 `core`·`common`·`bootstrap`.
4. `ARCH=hexagonal`로 재설치(컨텍스트를 독립 배포할 계획이면 `hexagonal-standalone`).

### → `modulith` · `feature` (분할 축을 레이어에서 도메인/기능으로)

**신호**: 레이어보다 도메인 경계를 따라 변경이 몰린다 · 한 기능을 고치면 5개 모듈을 동시에 만진다.

1. 분할 축을 도메인으로 바꾼다. 레이어는 도메인 안의 패키지가 된다.
2. 단일 모듈 안에서 모듈 경계를 지키려면 `modulith`(Spring Modulith `verify()`), 기능 슬라이스 독립이 목적이면 `feature`(ArchUnit 슬라이스).
3. 해당 `ARCH`로 재설치.
