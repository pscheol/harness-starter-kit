---
name: hx-jvm-layered
description: JVM(Kotlin/Java + Spring) 리포를 단일 모듈 레이어드 아키텍처로 세팅한다. controller → service → repository → entity 패키지 레이아웃을 깔고, 모듈 그래프가 없는 대신 ArchUnit layeredArchitecture() 구조 테스트로 레이어 방향·건너뛰기 금지·엔티티 노출 금지를 ./gradlew check 에서 강제한다. hx-bootstrap 의 setup.sh 를 ARCH=layered 로 실행한 뒤 패키지 생성·구조 테스트·첫 기능 순서를 안내한다. "레이어드로 세팅", "단일 모듈 Spring 프로젝트", "controller service repository 구조", "CRUD 위주 백엔드 초기 설정" 요청 시 사용.
---

# hx-jvm-layered — 단일 모듈 레이어드 세팅

가장 단순한 구조다. 모듈이 하나뿐이라 **컴파일러가 레이어를 막아 주지 않는다** — 그래서 ArchUnit 구조 테스트가
이 변형의 유일한 기계적 강제 장치다. 이 테스트를 안 넣으면 레이어드가 아니라 그냥 패키지가 나뉜 코드다.

진입은 `hx-jvm-setup` 이지만 이 스킬만 단독으로 써도 된다.

## 1. 이 구조가 맞는지 먼저 확인

**맞다**: 도메인 경계가 하나 · CRUD 비중이 높다 · 실행 단위가 하나 · 팀이 작다 · 빠르게 시작해야 한다.

**아니다**:

| 상황 | 대신 고를 것 |
|---|---|
| 실행 단위가 여럿(API + 배치 + 관리자) | `layered-multimodule` |
| 도메인 규칙이 복잡 · 저장소 교체 가능성 | `hexagonal` |
| 도메인이 둘 이상, 나중에 분리 가능성 | `modulith` |
| 기능 영역이 여럿, 사람마다 다른 영역 소유 | `feature` |

> **작게 시작하는 것은 실수가 아니다.** `layered` 로 시작해 신호가 보일 때 승격하는 편이,
> 처음부터 헥사고날을 깔고 포트가 위임만 하는 상태로 두는 것보다 낫다. 승격 신호와 절차는 `ARCHITECTURE.md` §0·§11에 있다.

## 2. 설치

```bash
BOOTSTRAP_DIR="<플러그인 내 skills/hx-bootstrap 절대경로>"
STACK=jvm ARCH=layered \
PROJECT_NAME="MyApp" PROJECT_SLUG="my-app" PACKAGE_NS="com.example.myapp" DOMAIN_EXAMPLE="order" \
  bash "$BOOTSTRAP_DIR/setup.sh" --lang=kotlin --agents=<목록> --dry-run <대상_경로>
```

`--dry-run` 으로 먼저 보여주고 승인 후 실제 설치. 에이전트는 `--list-agents` 로 확인받는다.

## 3. 패키지 생성 (설치 후 첫 작업)

```
com.example.myapp
├── Application                 ← @SpringBootApplication 진입점
├── config/                     ← Security · OpenAPI · Jackson · Async · Cache
├── common/                     ← envelope · ErrorCode · GlobalExceptionHandler · RequestIdFilter
├── controller/                 ← REST 경계. Spring Web 을 아는 유일한 레이어
│   ├── docs/                   ←   *Api 인터페이스(OpenAPI 문서 전담)
│   └── dto/                    ←   요청·응답 DTO
├── service/                    ← 비즈니스 규칙 · 트랜잭션 경계 · 정책 검사
├── repository/                 ← Spring Data JPA · 쿼리
└── entity/                     ← JPA 엔티티(테이블 매핑 · 상태 불변식)
```

### 레이어 ↔ 의존 가능

| 패키지 | 의존 가능 |
|---|---|
| `config` | 전부(조립 목적) |
| `controller` | `service`, `common`, 자신의 `dto` |
| `service` | `repository`, `entity`, `common` |
| `repository` | `entity`, `common` |
| `entity` | `common`(상수·enum)만 |
| `common` | — |

- **금지**: `service → controller` · `repository → service/controller` · `entity → 위 전부` · `entity·repository → org.springframework.web`.
- **레이어 건너뛰기 금지**: `controller` 는 `repository` 를 직접 import 하지 않는다(트랜잭션·정책이 `service` 에 있다).
- 도메인이 늘면 레이어 아래에 도메인 패키지를 둔다(`service/order`·`service/user`). 반대로 두면 그건 `feature` 변형이다.

## 4. 구조 테스트 — 이것이 없으면 강제가 없다

`src/test/<lang>/<pkg>/architecture/LayeredArchitectureTest` 에 두면 `./gradlew check` 가 자동으로 돌린다.
스켈레톤 전문은 설치된 `.agents/rules/structure.md` 의 구조 테스트 절에 있다. 최소 4개 규칙:

| 규칙 | 잡는 것 |
|---|---|
| `layeredArchitecture()` 단방향 | Controller ← Service ← Repository 역방향 접근 |
| 건너뛰기 금지 | `controller` → `repository` 직접 의존 |
| 엔티티 web 무의존 | `entity`·`repository` → `org.springframework.web`·`controller` |
| 트랜잭션 위치 | `controller`·`repository` 의 `@Transactional` |

- 의존성: Kotlin/Java 공통 `com.tngtech.archunit:archunit-junit5`(Kotlin 이면 Konsist 로 표현해도 된다).
- **레이어 패키지를 추가하면 이 테스트에 등록**한다(등록 누락 = 강제 누락).
- 규칙이 0개 클래스를 검사하면 실패로 취급한다 — `failOnEmptyShould` 기본값 `true` 를 `archunit.properties` 에서 끄지 않는다.
  이건 패키지명 오타로 규칙이 조용히 죽는 것을 잡는 자동 감지다.
- 해당 없는 규칙은 주석 처리가 아니라 **삭제**한다. `@Disabled` 로 끄는 것은 아키텍처를 지우는 것이다.

**설치 직후 한 번은 일부러 어겨서** 컨트롤러에 리포지토리를 주입해 보고 `./gradlew check` 가 실패하는지 확인한다.
실패하지 않으면 테스트가 붙지 않은 것이다.

## 5. 첫 기능까지의 순서

1. `entity/<X>` → `repository/<X>Repository` → `service/<X>Service` → `controller/dto/` → `controller/<X>Controller`.
2. TDD 사이클:
   1. `service`: 규칙 테스트(fake 리포지토리) → 구현.
   2. `repository`: `@DataJpaTest`(+ Testcontainers 선택)로 쿼리·매핑 검증.
   3. `controller`: `@WebMvcTest` 로 검증·상태코드·**envelope** 확인.
   4. 통합: `@SpringBootTest` smoke.
3. `bash scripts/verify.sh` 통과 + `.agents/docs/openapi` 동기화.
4. 복잡 작업은 `/hx-specify` 로 SDD 스펙을 먼저 만든다.

## 6. 레이어 규약 (리뷰에서 자주 걸리는 것)

- **`@Transactional` 은 `service` 에만.** 컨트롤러·리포지토리·엔티티에 붙이지 않는다 —
  엔티티 메서드의 `@Transactional` 은 프록시 대상이 아니라 아무 효과가 없다.
- **엔티티를 컨트롤러 시그니처에 노출하지 않는다.** 항상 `controller/dto` 로 변환한다.
  영속 모델 변경이 곧 API 변경이 되는 것을 막는 규칙이다.
- 컨트롤러는 **envelope 로 응답**한다. `ResponseEntity<DTO>` 직접 반환 금지.
- **비즈니스 규칙은 가능한 한 엔티티 안에.** `service` 가 getter/setter 만 호출하며 규칙을 조립하고 있다면
  Anemic Domain Model 이다(`.agents/rules/design-principles.md` §3.2).
- **서비스 인터페이스를 습관적으로 만들지 않는다.** 구현이 하나뿐이면 클래스 하나로 충분하다.
  인터페이스는 테스트 대역이 필요한 경계(외부 클라이언트)에만 둔다.
- 생성자 주입 only. `@Value`·`@Autowired` 필드 주입 금지 — 설정은 `@ConfigurationProperties`.
- 외부 호출을 트랜잭션 안에 넣지 않는다. 카운터·집계는 DB 의 원자적 연산으로.

## 7. 승격 신호 (이때 다른 변형을 검토한다)

| 신호 | 이동 |
|---|---|
| `settings.gradle` 에 하위 모듈을 추가하고 싶어진다 | `layered-multimodule`(레이어를 모듈로) 또는 `hexagonal` |
| 배치·관리자를 별도로 띄워야 한다 | `layered-multimodule` |
| `service` 에 도메인 규칙이 쌓여 손대기 어렵다 | `hexagonal` |
| 도메인이 둘 이상으로 갈라진다 | `modulith` |
| 사람마다 다른 기능 영역을 만진다 | `feature` |

전환 절차는 설치된 `ARCHITECTURE.md` §11에 있다. **전환할 때 ArchUnit 규칙을 모듈 그래프로 옮기는 것을 빠뜨리지 않는다.**

## 8. 관련

- 설치된 원본: `ARCHITECTURE.md`(§0 선택 기준·§11 전환) · `.agents/rules/structure.md` · `.agents/rules/tech.md`
- 설계 원칙: `.agents/rules/design-principles.md`
- 다른 아키텍처: `hx-jvm-layered-multimodule` · `hx-jvm-hexagonal` · 진입 `hx-jvm-setup`
