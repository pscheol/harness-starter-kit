<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Kotlin/Java + Spring Boot(JVM) · 아키텍처: hexagonal -->

# ARCHITECTURE — {{PROJECT_NAME}}

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 클린 아키텍처(헥사고날) + DDD + TDD + SOLID를 Kotlin/Spring 멀티모듈 위에서 **빌드 레벨로 강제**하고, 그 위에 검증된 디자인 패턴을 선택적으로 적용한다.

스택 기준(버전 기준은 프로젝트의 버전 카탈로그(예: `gradle/libs.versions.toml`) 등 단일 소스 — 구체 버전은 예시이며 프로젝트에서 최신 안정 버전으로 확정):
Kotlin/Java · Spring Boot(JVM) · Gradle(또는 Maven, wrapper) · Spring Data/JPA(관계형 DB — PostgreSQL/MySQL 등 선택) · Spring Security · ktlint(선택).

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 의존성 역전 (위→아래 단방향) | Gradle 모듈 의존 그래프 | 컴파일 실패 |
| 도메인은 프레임워크 무의존 | `core`·`domain` 모듈에 Spring/JPA plugin 부착 금지 | 컴파일 실패 |
| Primary/Infra 어댑터 격리 | 두 모듈은 서로 의존 금지, `bootstrap`이 조립 | 컴파일 실패 |
| API 응답 일관성 | `common`의 envelope + `ErrorCode` 단일 매핑 | 코드리뷰·`GlobalExceptionHandler`가 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(도메인/유스케이스 우선) | `./gradlew check` 게이트 |

> **기계적 강제 우선**. 빌드가 막아주는 위반은 리뷰 가드보다 우선한다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌──────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}     │
 │(Web/CLI) │        │  (본 서비스)          │
 └──────────┘        └──────────┬───────────┘
                                │
        ┌──────────────┬────────┴───────┬──────────────┐
        ▼              ▼                ▼              ▼
  ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
  │ 관계형 DB   │ │ Cache/Queue │ │ Object Store│ │ 외부 시스템 │
  │  (선택)     │ │  (선택)      │ │  (선택)      │ │  (선택)     │
  └────────────┘ └─────────────┘ └─────────────┘ └────────────┘
```

- 데이터 저장소(관계형 DB 등)와 부가 구성요소(캐시·큐·오브젝트 스토어·외부 시스템)는 **모두 선택**이며 프로젝트가 채택 여부를 정한다. DB는 특정 제품에 묶이지 않는다(PostgreSQL/MySQL 등).
- 필요 시 앞단에 **리버스 프록시/게이트웨이(선택)**를 둘 수 있다(인증·rate limit 등). 관리 행위(Admin action)는 audit log에 남긴다.
- 서비스 인스턴스는 **무상태**. 세션/락 상태는 외부 저장소(DB·캐시)에 둔다(수평 확장·재시도 안전).

---

## 3. 멀티모듈 헥사고날

한 바운디드 컨텍스트(`<ctx>`)는 `primary` · `application` · `domain` · `infra` 네 형제 모듈로 구성되고, 그 아래 `common`·`core` 공유 토대가 깔린다. 의존 방향을 Gradle 모듈 의존으로 강제(위반 시 컴파일 불가).

```
        ┌──────────────────────────────────────────────┐
        │ :bootstrap  @SpringBootApplication (조립·실행) │
        └───────────────────────┬──────────────────────┘
                                │ 조립
 ┌────────────────── :domain:<ctx> ──────────────────┐
 │  (예: {{DOMAIN_EXAMPLE}} · auth · ...)             │
 │  ┌──────────┐   ┌────────────────┐   ┌──────────┐ │
 │  │ primary  │──▶│  application    │◀──│  infra   │ │
 │  │ inbound  │   │  ├ port.in (IF) │   │ outbound │ │
 │  │ (REST)   │   │  └ port.out(IF) │   │(JPA 등)  │ │
 │  └──────────┘   └───────┬────────┘   └──────────┘ │
 │                         ▼                          │
 │              ┌──────────────────────┐              │
 │              │      domain          │              │
 │              │ Aggregate·VO·Service │              │
 │              │  (Spring/JPA 무의존) │              │
 │              └──────────────────────┘              │
 └───────────────────────┬───────────────────────────┘
                  ┌───────┴───────┐  :common (envelope·error·filter)
                  └───────┬───────┘
                  ┌───────┴───────┐  :core   (DomainException·primitives)
                  └───────────────┘
```

### 3.1 모듈 ↔ 레이어 매핑

| 모듈 | 레이어 | 의존 가능 |
|---|---|---|
| `:bootstrap` | Bootstrap(@SpringBootApplication) | `common` + 각 도메인의 `primary`, `infra` |
| `:domain:<ctx>:primary` | Inbound Adapter(REST) | `application`, `common` |
| `:domain:<ctx>:infra` | Outbound Adapter(JPA 등) | `application`, `common`, `core` |
| `:domain:<ctx>:application` | Use Case + Port | `domain`, `core` |
| `:domain:<ctx>:domain` | Domain Model | `core` |
| `:common` | 공유 커널(web·envelope·error·filter) | `core` |
| `:core` | Primitives(DomainException) | — (프레임워크 0) |

- **의존 금지 (컴파일 차단)**: `domain → infra/primary`, `application → infra/primary`, `core → 외부`, `primary ↔ infra`.
- `core`·`domain` 모듈의 `build.gradle.kts`에는 Spring/JPA plugin·라이브러리를 절대 부착하지 않는다(프레임워크 무의존을 빌드로 강제).
- 패키지: core=`{{PACKAGE_NS}}.core.*`, common=`{{PACKAGE_NS}}.common.*`, 도메인=`{{PACKAGE_NS}}.<ctx>.{domain,application,primary,infra}.*`.
- 4모듈은 **항상 한 묶음으로 추가/제거**한다. leaf 모듈명(`domain/application/primary/infra`)이 컨텍스트 간 중복되므로 Gradle `group`을 `{{PACKAGE_NS}}.<ctx>`로 분리해 capability 충돌을 막고, 산출물 jar 충돌은 `archivesName` 경로기반 유니크화로 막는다.

### 3.2 Port & Adapter

- Inbound Port(`port.in`) = 유스케이스 인터페이스(`application/usecase/<X>UseCase.kt`). 컨트롤러는 구현체가 아니라 이 인터페이스에만 의존한다.
- Outbound Port(`port.out`) = 리포지토리·외부 시스템 추상(`application/output/`). `application`이 정의하고 `infra`가 구현한다.
- 새 외부 시스템 통합 = 새 `port.out` + 새 `infra` 어댑터. `application`/`domain`은 손대지 않는다(OCP).
- 컨텍스트 간 직접 호출 금지. 통합이 필요하면 제공 컨텍스트의 공개 계약 모듈(`<ctx>:contract`, Published Language)이나 Domain Event(Outbox)를 경유한다. 다른 컨텍스트의 도메인 모델을 직접 import하지 않는다.

---

## 4. 레이어 책임 (Domain Service vs Application Service)

| 구분 | 위치 | 책임 | 구현 형태 |
|---|---|---|---|
| Domain Service | `domain` 모듈 | 한 애그리거트에 자연스럽게 속하지 않는 **순수 도메인 로직**. 외부 I/O 금지 | POJO `class`(어노테이션 0). `application/config`의 `@Configuration`에서 `@Bean` 등록 → UseCase 구현체가 생성자 주입 |
| Application Service (= UseCase 구현) | `application` 모듈 | 트랜잭션 경계, `port.out` 호출 조립, 권한·정책 검사, 이벤트 발행 | Spring `@Service`. 생성자 주입. `port.in` 구현. `application/usecase/service/`에 위치 |

- **Aggregate**: 트랜잭션·일관성 경계. 한 트랜잭션에서 하나의 루트만 수정. 자식은 루트를 통해서만 접근. 다른 애그리거트는 ID 참조(객체 그래프 강결합 금지). 내부 PK는 bigint(UUID 미사용), 외부 노출은 code.
- **Value Object**: `data class`/`@JvmInline value class`, `val`만·불변. 생성 시점에 invariant 검증(`init { require(...) }`/팩토리). 잘못된 상태로는 인스턴스화 불가.
- **비즈니스 규칙은 애그리거트/도메인 서비스로**. Application Service에 규칙을 인라인하지 않는다(Anemic Domain 회피). 판단 기준:
  - (a) 한 애그리거트의 상태 불변식 → **애그리거트 내부**.
  - (b) 애그리거트 소유가 아닌 정책·교차 규칙 → **`domain/service`**. 의존 없는 무상태 순수면 `object`/top-level 함수, 주입·교체·모킹이 필요하면 POJO + `application/config` `@Bean`.
  - (c) 트랜잭션·포트 호출·데이터 격리 세션 오케스트레이션 → **application service**.
- 트랜잭션 경계는 Application Service에만. `@Transactional`은 UseCase 구현체 메서드에만 부착하고, infra 어댑터·Repository에는 붙이지 않는다(어댑터는 유스케이스 트랜잭션에 참여 — 경계 분산 금지).
- **생성자 주입 only**. `@Autowired` 필드/세터 주입·`lateinit var` 의존성 금지. 시간·난수·ID는 인터페이스(`Clock`·`IdGenerator`)로 주입(결정성·테스트 가능).
- **로깅은 경계에서만**(`application`/`primary`/`infra`). `domain`은 로깅 금지(외부 의존 0). 라이브러리는 `kotlin-logging`(SLF4J facade), `private val log = KotlinLogging.logger {}`. 에러는 경계에서 한 번만(중복 로깅 금지). 민감정보(토큰·시크릿·개인정보)는 로그 금지.
- **DB 접근**: 표준 CRUD(애그리거트 영속)는 Spring Data/JPA. 복잡 조회·keyset cursor·통계 등은 필요 시 타입세이프 쿼리 빌더나 네이티브 SQL을 별도 어댑터로 둔다. 쿼리 계약(인터페이스)과 구현을 분리하고 어댑터(`*PersistenceAdapter`)는 변환·위임만 한다.

---

## 5. 코드 주석 규약 (요약)

- 코드는 라인 단위 What/How를, 주석은 Why를 설명한다. 단 함수·메서드 KDoc은 ① 책임 한 줄 + ② 비자명한 Why + ③ `처리 흐름:`(의도를 곁들인 단계)로 로직 이해를 돕는다.
- 시그니처를 옮긴 번역투, 의도 없는 라인 받아쓰기는 금지. 단순 getter/위임/매퍼는 책임 한 줄만. 흐름이 7~8단계로 길면 함수를 분리한다.
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 6. 상수·설정 외부화 (매직 리터럴 금지)

코드에 의미 있는 리터럴(문자열 키·숫자·URL·역할명 등)을 하드코딩하지 않는다. 값의 성격에 따라 3계층으로 관리한다.

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 컴파일 타임 도메인 상수 | 코드 의미를 갖는 고정 라벨·키 | `const`/`enum`/`object`(소유 레이어) — 감사 action·에러코드명·역할·상태 |
| (b) 환경별 설정 | 배포 환경마다 달라지는 값 | `application.yml` + `@Value`/`@ConfigurationProperties`(+ env) — base-url·타임아웃·외부 엔드포인트 |
| (c) 운영자 변경 가능 값 | 운영사가 런타임에 조정 | system property / **DB 설정 테이블(관리자 페이지)** — 기능 플래그·쿼터·정책 임계치 (캐시·무효화 동반) |

- 에러코드·사용자 메시지는 문자열 리터럴 금지: 코드는 `ErrorCode`(common, 단일 매핑), 메시지는 i18n 키(`error.{ErrorCode}`)로 경계가 `MessageSource`로 해석한다.
- URL·호스트·경로·기본 region·타임아웃은 (b) 설정으로 외부화한다. 테스트 픽스처 리터럴은 예외.

---

## 7. 대규모 트래픽 · 성능 예산 (부하테스트로 확정)

모든 기능은 처음부터 확장 가능한 구조로 설계하되, 마이크로 최적화는 측정 후에 한다(YAGNI).

- 무한/대량 결과 금지: 목록은 cursor pagination + 상한 `limit` 강제. 전체 스캔·메모리 적재 금지.
- **N+1 회피**: 배치·조인·`IN` 조회. WHERE/JOIN/ORDER BY 컬럼에 인덱스 동반.
- **핫패스 경량화**: 인증·키 검증 등 고빈도 경로는 단건 인덱스 조회 + 캐시(TTL·무효화 동반).
- **동기 응답 경로 보호**: 무거운 작업(파싱·인덱싱 등)은 요청-응답 경로 밖(jobs/queue)으로. 지연 민감 경로는 스트리밍(SSE).
- **외부 호출 안정화**: 타임아웃·재시도·서킷브레이커·커넥션 풀 필수.
- **무상태·수평 확장**: 상태는 외부 저장소(DB·캐시). 멱등키로 재시도 안전.
- **가상 스레드**: `spring.threads.virtual.enabled=true`(JDK 21+ Loom). 단 실제 DB 동시성 상한은 커넥션 풀(HikariCP)이 결정 — 풀·DB 사이징과 함께 가야 효과가 난다.

**성능 목표(예산) — 경로 성격별 차등**(모든 경로가 동일 목표가 아니다. 수치는 부하테스트로 확정):

| 경로 부류 | 예 | 목표(예시 — 프로젝트에 맞게 조정) | 도달 레버 |
|---|---|---|---|
| 캐시/인증 핫패스 | 키 검증·캐시 조회 | 고 TPS/인스턴스 | 캐시(TTL+무효화)로 DB 왕복 제거, 무상태 수평확장 |
| 일반 읽기(DB 단건/페이지) | 목록·상세 조회 | 수천 TPS/인스턴스 | 인덱스·keyset·커넥션 풀 사이징 |
| 쓰기(DB 변경) | 생성·수정 | 수백~수천 TPS | 저빈도 관리 경로. 무거운 작업은 비동기(jobs) |
| 비동기 워커 | 배치·색인 | 처리량/큐 기준 | 요청 경로 밖. 수평 워커 확장 |

- **부하테스트**: 핵심 경로 시나리오를 두고 threshold를 제품 KPI에 연결한다(오류율·p95/p99·처리량). 실행은 nightly 또는 릴리스 전. 모든 목표 수치는 검증 후 확정한다.

---

## 8. TDD 워크플로 (요약)

```
RED   유스케이스/도메인 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기·패턴 적용
```

- 테스트가 먼저, 구현이 나중. 테스트 없는 도메인/유스케이스 변경 금지. 프레임워크는 Kotest(`BehaviorSpec`/`FunSpec`), Mock은 꼭 필요할 때만 MockK(우선 손수 짠 fake).
- 시간·난수·외부 호출은 인터페이스 경유 → 결정성 확보.

| 레이어 | 도구 | 비고 |
|---|---|---|
| `core` / `domain` | Kotest | 순수 함수·VO·애그리거트. 프레임워크·DB 금지 |
| `application` | Kotest + 손수 짠 fake(`port.out`) | 유스케이스 단위. Spring 컨텍스트 미기동 |
| `primary` | Kotest + `@WebMvcTest` | Controller slice, envelope·status 검증 |
| `infra` | Kotest + JPA slice + Testcontainers(DB) | Repository 어댑터·데이터 격리 정책 |
| `bootstrap` | Kotest + `@SpringBootTest` + Testcontainers | 와이어링·헬스체크·smoke |

- 검증 게이트: `./gradlew check` (CI·pre-commit·hook이 모두 `scripts/verify.sh`를 호출).

---

## 9. 새 도메인/유스케이스 추가 워크플로

1. **컨텍스트 결정**: 기존 도메인 안인지 새 바운디드 컨텍스트인지 먼저 답한다.
2. **(신규 컨텍스트)** `settings.gradle.kts`에 4모듈 등록 → 각 `build.gradle.kts` 작성(§3.1 의존표 그대로, `group` 분리).
3. **TDD 사이클**: `domain`(애그리거트/VO) → `application`(유스케이스 + fake `port.out`) → `infra`(Testcontainers로 `port.out` 구현) → `primary`(`@WebMvcTest`, 응답은 envelope) → `bootstrap`(빈 등록·smoke).
4. **검증**: `./gradlew check` 통과 + OpenAPI/문서 동기화(`.agents/docs/openapi`).
5. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록.

---

## 10. Anti-pattern (코드리뷰 즉시 차단)

- 컨트롤러에서 `ResponseEntity<DTO>`를 직접 반환(envelope 우회).
- `application`/`domain`에서 `HttpStatus`·`ResponseEntity`·Spring web 타입 참조.
- JPA Entity를 컨트롤러·유스케이스 시그니처에 노출.
- `port.out`에 영속 메커니즘(SQL·컬럼·upsert) 노출. 포트는 애그리거트 기준(`save`/`findBy…`)으로 정의하고 충돌/멱등은 어댑터 내부에.
- infra 어댑터·Repository에 `@Transactional` 부착.
- 다른 바운디드 컨텍스트의 도메인 모델을 직접 import.
- 애그리거트의 자식 엔티티를 외부에서 직접 변경.
- `!!`로 null assert. `@Autowired` 필드/세터 주입·`lateinit var` 의존성.
- 도메인에 setter만 잔뜩 있는 Anemic Domain Model. 거대 "FacadeService"/거대 Util 정적 모음.
- 테스트 없이 도메인/유스케이스 코드 추가.

---

## 11. 관련 문서

- 스택·구조·보안·API 규약 원본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`)
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
