<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Kotlin/Java + Spring Boot(JVM) · 아키텍처: hexagonal-standalone -->

# ARCHITECTURE — {{PROJECT_NAME}}

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `.agents/rules/tech.md`, 레이아웃·착수 절차는 `.agents/rules/structure.md`를 본다.

본 프로젝트는 클린 아키텍처(헥사고날) + DDD + TDD + SOLID를 Kotlin/Spring 멀티모듈 위에서 **빌드 레벨로 강제**한다.
채택한 변형은 `hexagonal-standalone` — **바운디드 컨텍스트가 자기 `core`·`common`·`bootstrap`까지 소유하는 자립형**이다.

---

## 0. 이 변형을 고르는 기준

### 이럴 때 쓴다

- 바운디드 컨텍스트를 **언젠가 별도 서비스로 떼어낼 계획**이 있고, 그 시점에 코드 이동을 최소화하고 싶다.
- 컨텍스트마다 **배포 주기·스케일 특성·SLA가 다르다**(주문은 트래픽 폭주, 정산은 배치 위주).
- 팀이 컨텍스트 단위로 나뉘어 있고, **한 팀의 변경이 다른 팀의 빌드를 깨지 않아야** 한다.
- 컨텍스트별로 **데이터 경계가 이미 분리**돼 있거나 분리할 수 있다(스키마·DB).

### 이럴 때 쓰지 않는다

- 컨텍스트가 **하나뿐이다** → `layered`(단일 모듈) 또는 `hexagonal`.
- 여러 컨텍스트가 있지만 **한 프로세스로만 배포할 것이 확실하다** → `hexagonal`(전역 `core`·`common` 공유). 자립형의 비용(§3.4)만 지불하고 이득은 못 얻는다.
- **CRUD 비중이 높고 도메인 규칙이 얇다** → `layered-multimodule` 또는 `layered`. 포트/어댑터가 순수 오버헤드가 된다.
- 팀 규모가 작아 **모듈 7×N개를 관리할 여력이 없다** → `hexagonal`(컨텍스트당 4모듈)에서 시작해 필요할 때 승격한다.

### 다른 헥사고날 변형과의 차이

| 변형 | 모듈 경로 | 공유 커널 | 실행 단위 | 고르는 이유 |
|---|---|---|---|---|
| `hexagonal` | `:{{PROJECT_SLUG}}-<ctx>:infra` | 전역 `core`·`common` 각 1개 | 1개(`bootstrap`) | 컨텍스트가 여럿이어도 **한 배포 단위**다 |
| `hexagonal-nested` | `:{{PROJECT_SLUG}}-domain:<ctx>:infra` | 전역 1개 | 1개 | 위와 같되 컨텍스트가 많아 루트를 정돈하고 싶다 |
| **`hexagonal-standalone`**(이 변형) | `:{{PROJECT_SLUG}}-<ctx>-infra` | **컨텍스트마다 따로** | **컨텍스트마다 1개** | 컨텍스트를 **독립 배포 단위**로 다룬다 |

세 변형의 **레이어 규칙과 의존 방향은 동일**하다. 다른 것은 공유 범위와 실행 단위 수다.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 의존성 역전 (바깥→안쪽 단방향) | Gradle 모듈 의존 그래프 | 컴파일 실패 |
| 도메인은 프레임워크 무의존 | `core`·`domain` 모듈에 Spring/JPA 플러그인 부착 금지(`pure-module` 컨벤션 플러그인) | 컴파일 실패 |
| Primary/Infra 어댑터 격리 | 두 모듈은 서로 의존 금지, `bootstrap`이 조립 | 컴파일 실패 |
| **컨텍스트 간 직접 의존 금지** | 구조 테스트(Konsist/ArchUnit) + 리뷰 | `./gradlew check` 실패 |
| API 응답 일관성 | 컨텍스트별 `common`의 envelope + `ErrorCode` + **컨텍스트마다 같은 계약 테스트** | 계약 테스트 실패 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(도메인/유스케이스 우선) | `./gradlew check` 게이트 |

> **기계적 강제 우선**. 빌드가 막아주는 위반은 리뷰 가드보다 우선한다.
> 다만 이 변형에서 **컨텍스트 간 의존은 컴파일러가 막지 못한다**(모듈 그래프는 선언만 하면 통과시킨다). 그래서 구조 테스트가 필수다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌────────────────────────────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}                           │
 │(Web/CLI) │        │  ┌──────────────────┐  ┌────────────────┐  │
 └──────────┘        │  │ <ctx-a> 실행 단위 │  │ <ctx-b> 실행 단위│  │
                     │  └────────┬─────────┘  └────────┬───────┘  │
                     └───────────┼─────────────────────┼──────────┘
                                 │                     │
        ┌──────────────┬─────────┴──────┬──────────────┴┬──────────────┐
        ▼              ▼                ▼               ▼              ▼
  ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ ┌──────────┐
  │ DB 스키마 A │ │ DB 스키마 B  │ │ Cache/Queue │ │Object Store│ │외부 시스템│
  │  (선택)     │ │  (선택)      │ │  (선택)      │ │  (선택)     │ │  (선택)   │
  └────────────┘ └─────────────┘ └─────────────┘ └────────────┘ └──────────┘
```

- **실행 단위가 컨텍스트 수만큼 있다.** 앞단에 리버스 프록시/게이트웨이를 두어 경로별로 라우팅하는 구성이 자연스럽다(선택).
- 데이터 저장소는 컨텍스트마다 스키마를 분리하는 것이 기본이다(`.agents/rules/tech.md` 스키마 소유 절). 같은 테이블을 두 컨텍스트가 쓰면 분리는 이름뿐이다.
- 서비스 인스턴스는 **무상태**. 세션·락 상태는 외부 저장소(DB·캐시)에 둔다(수평 확장·재시도 안전).
- 컨텍스트 간 호출은 HTTP/gRPC 또는 이벤트다(§3.3). 관리 행위(Admin action)는 audit log에 남긴다.

---

## 3. 컨텍스트 자립형 헥사고날

한 바운디드 컨텍스트(`<ctx>`)가 `core`·`common`·`domain`·`application`·`primary`·`infra`·`bootstrap` **7모듈**을 소유한다.
모듈명은 `:{{PROJECT_SLUG}}-<ctx>-<layer>` 평면 하이픈이고, 디렉터리는 `settings.gradle.kts`의 `projectDir` 재지정으로 컨텍스트별로 묶는다(`.agents/rules/structure.md` §1.1).

```
 ┌────────── 컨텍스트: {{DOMAIN_EXAMPLE}} ───────────┐    ┌──── 컨텍스트: payment ────┐
 │ ┌──────────────────────────────────────────────┐ │    │                            │
 │ │ bootstrap  @SpringBootApplication (조립·실행) │ │    │  bootstrap                 │
 │ └──────────────────────┬───────────────────────┘ │    │      │                     │
 │            ┌───────────┴───────────┐             │    │      …(동일 7모듈)          │
 │  ┌─────────┴┐  ┌────────────────┐ ┌┴─────────┐   │    │                            │
 │  │ primary  │─▶│  application   │◀│  infra   │   │    └────────────────────────────┘
 │  │ inbound  │  │ ├ port.in (IF) │ │ outbound │   │
 │  │ (REST)   │  │ └ port.out(IF) │ │(JPA 등)  │   │                 ▲
 │  └──────────┘  └───────┬────────┘ └──────────┘   │                 │
 │                        ▼                          │  HTTP · 이벤트 · contract
 │             ┌──────────────────────┐              │  (직접 모듈 의존 금지)
 │             │      domain          │              │─────────────────┘
 │             │ Aggregate·VO·Service │              │
 │             │  (Spring/JPA 무의존) │              │
 │             └──────────┬───────────┘              │
 │       ┌────────────────┴──────────┐               │
 │       │ common (envelope·error)   │               │
 │       ├───────────────────────────┤               │
 │       │ core   (primitives)       │               │
 │       └───────────────────────────┘               │
 └───────────────────────────────────────────────────┘
```

### 3.1 모듈 ↔ 레이어 매핑

| 모듈 | 레이어 | 의존 가능 (모두 **같은 컨텍스트** 안) |
|---|---|---|
| `:{{PROJECT_SLUG}}-<ctx>-bootstrap` | Bootstrap(@SpringBootApplication) | `primary`·`infra`·`common` |
| `:{{PROJECT_SLUG}}-<ctx>-primary` | Inbound Adapter(REST) | `application`·`common` |
| `:{{PROJECT_SLUG}}-<ctx>-infra` | Outbound Adapter(JPA 등) | `application`·`common`·`core` |
| `:{{PROJECT_SLUG}}-<ctx>-application` | Use Case + Port | `domain`·`core` |
| `:{{PROJECT_SLUG}}-<ctx>-domain` | Domain Model | `core` |
| `:{{PROJECT_SLUG}}-<ctx>-common` | 공유 커널(web·envelope·error·filter) | `core` |
| `:{{PROJECT_SLUG}}-<ctx>-core` | Primitives(DomainException 등) | — (프레임워크 0) |

- **의존 금지 (컴파일 차단)**: `domain → infra/primary`, `application → infra/primary`, `core → 외부`, `primary ↔ infra`.
- **의존 금지 (구조 테스트 차단)**: 컨텍스트 A의 모듈 → 컨텍스트 B의 모듈(§3.3의 `contract` 예외).
- 7모듈은 **항상 한 묶음으로 추가·제거**한다. 모듈명이 전역 유니크하므로 `group` 분리·`archivesName` 유니크화가 필요 없다.
- 패키지는 모듈과 1:1: `{{PACKAGE_NS}}.<ctx>.{core,common,domain,application,primary,infra,bootstrap}`.

### 3.2 Port & Adapter

- Inbound Port(`port.in`) = 유스케이스 인터페이스(`application/usecase/<X>UseCase`). 컨트롤러는 구현체가 아니라 이 인터페이스에만 의존한다.
- Outbound Port(`port.out`) = 리포지토리·외부 시스템 추상(`application/output/`). **`application`이 정의하고 `infra`가 구현한다** — 추상의 소유자가 안쪽이라는 것이 DIP의 실체다.
- 포트는 애그리거트 기준(`save`/`findBy…`)으로 정의한다. SQL·컬럼·`upsert` 같은 영속 메커니즘을 포트 시그니처에 드러내지 않는다.
- 새 외부 시스템 통합 = 새 `port.out` + 새 `infra` 어댑터. `application`·`domain`은 손대지 않는다(OCP).

### 3.3 컨텍스트 간 통합

| 방법 | 언제 | 대가 |
|---|---|---|
| HTTP/gRPC | 이미 별도 프로세스로 뜬다 | 네트워크 실패·타임아웃·재시도·서킷 |
| 도메인 이벤트(Outbox → 브로커) | 결과적 일관성으로 충분하다 | 브로커·Outbox 테이블·중복 처리(멱등) |
| `contract` 모듈 | 아직 한 프로세스에 같이 있다 | 컨텍스트 간 컴파일 결합 — 분리 시 되돌려야 한다 |

- `contract` 모듈에는 **인터페이스·요청/응답 DTO·enum만** 둔다. 애그리거트·엔티티·JPA 타입은 넣지 않는다.
- 어떤 방법을 쓰든 `.agents/rules/structure.md` §2의 표에 **from·to·방법·이유·승인일**을 기록한다. 기록되지 않은 간선은 리뷰에서 되돌린다.
- 다른 컨텍스트의 **테이블을 조인하지 않는다**. 이건 컴파일러도 구조 테스트도 못 잡는다 — 리뷰가 유일한 방어선이다.

### 3.4 이 변형이 지불하는 비용 (알고 고른다)

| 비용 | 실제로 나타나는 모습 | 완화 |
|---|---|---|
| **코드 중복** | envelope·ErrorCode·예외 변환이 컨텍스트마다 복제 | 규약 원본은 `.agents/rules/api-standards.md` 문서 한 곳. 컨텍스트마다 같은 이름의 계약 테스트 |
| **모듈 폭증** | 컨텍스트 3개 = 21모듈, 빌드 스크립트 21개 | `build-logic` 레이어별 컨벤션 플러그인(`.agents/rules/tech.md`) |
| **운영 표면 증가** | 포트·헬스체크·로그·대시보드·배포 파이프라인이 N배 | 컨텍스트 추가 시 체크리스트로 관리(§9) |
| **규약 드리프트** | 컨텍스트마다 응답 형태·에러 코드가 조금씩 갈라짐 | 계약 테스트 + 정기 리뷰. 세 번째 복제에서 멈추고 재평가(§12) |

이 비용을 지불할 이유가 없다면 `hexagonal`이 옳은 선택이다. §0으로 돌아간다.

---

## 4. 레이어 책임과 SOLID

| 구분 | 위치 | 책임 | 구현 형태 |
|---|---|---|---|
| Domain Service | `domain` 모듈 | 한 애그리거트에 자연스럽게 속하지 않는 **순수 도메인 로직**. 외부 I/O 금지 | POJO `class`(어노테이션 0). `application/config`의 `@Configuration`에서 `@Bean` 등록 → UseCase 구현체가 생성자 주입 |
| Application Service (= UseCase 구현) | `application` 모듈 | 트랜잭션 경계, `port.out` 호출 조립, 권한·정책 검사, 이벤트 발행 | Spring `@Service`. 생성자 주입. `port.in` 구현. `application/usecase/service/`에 위치 |

- **Aggregate**: 트랜잭션·일관성 경계. 한 트랜잭션에서 하나의 루트만 수정. 자식은 루트를 통해서만 접근. 다른 애그리거트는 ID 참조(객체 그래프 강결합 금지).
- **Value Object**: `data class`/`@JvmInline value class`, `val`만·불변. 생성 시점에 invariant 검증(`init { require(...) }`/팩토리). 잘못된 상태로는 인스턴스화 불가.
- **비즈니스 규칙은 애그리거트·도메인 서비스로**. Application Service에 규칙을 인라인하지 않는다(Anemic Domain 회피). 판단 기준:
  - (a) 한 애그리거트의 상태 불변식 → **애그리거트 내부**.
  - (b) 애그리거트 소유가 아닌 정책·교차 규칙 → **`domain/service`**.
  - (c) 트랜잭션·포트 호출 오케스트레이션 → **application service**.
- 트랜잭션 경계는 Application Service에만. `infra` 어댑터·리포지토리에 `@Transactional`을 붙이지 않는다.
- **생성자 주입 only**. `@Autowired` 필드/세터 주입·`lateinit var` 의존성 금지. 시간·난수·ID는 인터페이스(`Clock`·`IdGenerator`)로 주입한다.
- **로깅은 경계에서만**(`application`·`primary`·`infra`). `domain`은 로깅 금지(외부 의존 0). 에러는 경계에서 한 번만 남긴다.

> SOLID 5원칙의 판단 기준·위반 신호·리팩터링 절차는 `.agents/rules/design-principles.md`가 원본이다.
> 이 변형에서 특히 자주 문제가 되는 것은 **DIP**(`application`이 포트를 소유하는가)와 **ISP**(포트가 애그리거트 단위로 좁은가)다.

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

- 에러코드·사용자 메시지는 문자열 리터럴 금지: 코드는 컨텍스트 `common`의 `ErrorCode`, 메시지는 i18n 키(`error.{ErrorCode}`).
- **컨텍스트 간 통합 엔드포인트(base-url·타임아웃)는 반드시 (b)로 외부화**한다. 하드코딩하면 컨텍스트를 분리 배포하는 순간 코드를 고쳐야 한다.

---

## 7. 대규모 트래픽 · 성능 예산

- 무한/대량 결과 금지: 목록은 cursor pagination + 상한 `limit` 강제.
- **N+1 회피**: 배치·조인·`IN` 조회. WHERE/JOIN/ORDER BY 컬럼에 인덱스 동반. 조인은 **같은 컨텍스트 안에서만**.
- **컨텍스트 간 호출은 동기 응답 경로의 비용**이다. 타임아웃·재시도·서킷브레이커 없이 호출하지 않는다. 가능하면 이벤트로 비동기화한다.
- **핫패스 경량화**: 인증·키 검증 등 고빈도 경로는 단건 인덱스 조회 + 캐시(TTL·무효화 동반).
- **무상태·수평 확장**: 상태는 외부 저장소. 멱등키로 재시도 안전. **컨텍스트마다 독립 스케일링**이 이 변형의 이득이다.
- **가상 스레드**: `spring.threads.virtual.enabled=true`(JDK 21+). 실제 DB 동시성 상한은 커넥션 풀이 결정하므로 풀·DB 사이징과 함께 간다.

| 경로 부류 | 목표(예시 — 프로젝트에서 확정) | 도달 레버 |
|---|---|---|
| 캐시/인증 핫패스 | 고 TPS/인스턴스 | 캐시로 DB 왕복 제거, 무상태 수평확장 |
| 일반 읽기 | 수천 TPS/인스턴스 | 인덱스·keyset·커넥션 풀 사이징 |
| 쓰기 | 수백~수천 TPS | 무거운 작업은 비동기(jobs) |
| 컨텍스트 간 호출 | p99가 호출자 예산 안에 | 타임아웃 상한·서킷·캐시·이벤트 전환 |

---

## 8. TDD 워크플로

```
RED   유스케이스/도메인 행위 1개에 대한 실패 테스트
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

| 레이어 | 도구 | 비고 |
|---|---|---|
| `core` / `domain` | Kotest/JUnit5 | 순수 함수·VO·애그리거트. 프레임워크·DB 금지 |
| `application` | Kotest + 손수 짠 fake(`port.out`) | Spring 컨텍스트 미기동 |
| `primary` | `@WebMvcTest` | Controller slice, envelope·status 검증 |
| `infra` | JPA slice + Testcontainers(선택) | Repository 어댑터·마이그레이션 |
| `bootstrap` | `@SpringBootTest` + Testcontainers | 와이어링·smoke + **구조 테스트** + **envelope 계약 테스트** |

- 테스트가 먼저, 구현이 나중. 테스트 없는 도메인·유스케이스 변경 금지. Mock은 꼭 필요할 때만(우선 손수 짠 fake).
- 검증 게이트: `bash scripts/verify.sh`(= `./gradlew check`).

---

## 9. 새 바운디드 컨텍스트 추가 워크플로

1. **정말 새 컨텍스트인지 답한다.** 기존 컨텍스트의 애그리거트로 표현되면 모듈을 만들지 않는다.
2. `settings.gradle.kts`에 `context("<ctx>")` 한 줄 → 7모듈 빌드 스크립트를 §3.1 의존표대로 작성(컨벤션 플러그인 적용).
3. 스키마를 분리한다(`.agents/rules/tech.md`). 마이그레이션은 그 컨텍스트의 `infra`가 소유한다.
4. TDD 사이클(§8): `domain` → `application` → `infra` → `primary` → `bootstrap`.
5. **모든 컨텍스트의 구조 테스트 `others` 목록에 새 컨텍스트를 등록**한다(등록 누락 = 강제 누락).
6. 포트·헬스체크·배포 파이프라인·로컬 `docker compose`·`.agents/rules/tech.md` 포트 표에 등록한다.
7. `bash scripts/verify.sh` 통과 + `.agents/docs/openapi` 동기화(어느 컨텍스트의 API인지 드러낸다).

---

## 10. Anti-pattern (코드리뷰 즉시 차단)

- **다른 컨텍스트의 모듈을 `implementation project(...)`로 의존**(공개된 `contract` 제외).
- **다른 컨텍스트의 테이블을 조인**하거나 그 스키마에 직접 쓴다.
- 컨텍스트 간 통합을 타임아웃·재시도 없이 동기 호출.
- 한 컨텍스트의 `common`을 다른 컨텍스트가 복사해 쓰면서 **양쪽이 조금씩 다르게 수정**됨(계약 테스트 부재).
- 컨트롤러에서 `ResponseEntity<DTO>`를 직접 반환(envelope 우회).
- `application`·`domain`에서 `HttpStatus`·`ResponseEntity`·Spring web 타입 참조.
- JPA Entity를 컨트롤러·유스케이스 시그니처에 노출.
- `port.out`에 영속 메커니즘(SQL·컬럼·upsert) 노출.
- `infra` 어댑터·리포지토리에 `@Transactional` 부착.
- 루트 `build.gradle.kts`의 `subprojects { }`로 Spring 의존성을 전 모듈에 뿌림(→ `core`·`domain` 오염).
- `bootstrap` 아닌 모듈에 Spring Boot 플러그인 적용.
- `!!`로 null assert. `@Autowired` 필드/세터 주입·`lateinit var` 의존성.
- 도메인에 setter만 잔뜩 있는 Anemic Domain Model. 거대 "FacadeService".
- 테스트 없이 도메인·유스케이스 코드 추가.

---

## 11. 관련 문서

- 레이아웃·모듈 등록·구조 테스트: `.agents/rules/structure.md`
- 스택·버전·빌드 로직 공유·스키마 소유: `.agents/rules/tech.md`
- **설계 원칙(객체지향·클린 아키텍처·SOLID)**: `.agents/rules/design-principles.md`
- 보안·API 규약: `.agents/rules/security.md` · `.agents/rules/api-standards.md`
- 주석 규약: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md` · SDD 기록: `.agents/docs/README.md`

---

## 12. 다른 변형으로 전환

전환은 되돌릴 수 없는 결정이 아니다. 신호가 보이면 ADR(`.agents/docs/decisions/`)을 남기고 옮긴다.

### → `hexagonal` (공유 커널을 전역으로, 실행 단위를 1개로)

**신호**: `common`을 세 번째 컨텍스트로 복사하고 있다 · `bootstrap`이 사실상 하나만 쓰인다 · 컨텍스트를 분리 배포할 계획이 사라졌다.

1. 전역 `:{{PROJECT_SLUG}}-core`·`:{{PROJECT_SLUG}}-common` 모듈을 만들고, 컨텍스트별 `core`·`common`의 **공통 부분만** 옮긴다.
2. 컨텍스트 고유 상수·예외는 그 컨텍스트의 `domain`으로 내린다(전역 커널을 잡동사니로 만들지 않는다).
3. 실행 단위를 하나로 합친다: 전역 `:{{PROJECT_SLUG}}-bootstrap`이 모든 컨텍스트의 `primary`·`infra`를 조립.
4. 모듈 경로를 `:{{PROJECT_SLUG}}-<ctx>:<layer>`로 바꾸고 `projectDir` 재지정을 제거한다. leaf 이름이 겹치므로 `group` 분리·`archivesName` 유니크화를 추가한다.
5. `hx-bootstrap`을 `ARCH=hexagonal`로 재실행해 이 문서·`structure.md`·`tech.md`를 교체한다(기존 파일은 `--force` 없이는 보존된다).

### → `layered-multimodule` (헥사고날을 걷어낸다)

**신호**: 컨텍스트가 하나로 수렴했다 · 포트/어댑터가 위임만 하고 있다 · 도메인 규칙이 거의 없다.

1. `port.out` 인터페이스를 제거하고 서비스가 리포지토리를 직접 쓰게 한다.
2. `domain`을 엔티티 모듈로, `infra`를 리포지토리 모듈로 재배치한다.
3. `ARCH=layered-multimodule`로 재설치.

### → 별도 리포/서비스로 분리 (이 변형의 목적지)

**신호**: 컨텍스트의 배포 주기·팀·SLA가 완전히 갈렸다.

1. 그 컨텍스트의 7모듈 디렉터리(`<ctx>/`)를 통째로 새 리포로 옮긴다. **모듈 간 의존이 컨텍스트 안에서 닫혀 있으므로 코드 수정이 거의 없다** — 이것이 이 변형을 고른 이유다.
2. 남은 리포의 `settings.gradle.kts`에서 `context("<ctx>")` 한 줄을 지운다.
3. `contract` 모듈로 통합했다면 그 부분만 HTTP/이벤트로 바꾼다.
4. 새 리포에 `hx-bootstrap`을 `ARCH=hexagonal`(컨텍스트 1개)로 설치한다.
