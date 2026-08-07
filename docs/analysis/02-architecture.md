# 02. 아키텍처 — 설치 매핑·헥사고날 계층·규칙 원본

## 1. 설치 매핑 (`setup.sh`)

`setup.sh`는 **세 개의 템플릿 루트**를 순서대로 순회하며 대상 리포로 복사하고 토큰을 치환한다.

1. `templates/common/` — 스택 무관 골격 51개
2. `templates/stacks/<STACK>/` — 선택한 스택 전용 13개 (**`arch/` 하위는 제외하고 순회**)
3. `templates/stacks/<STACK>/arch/<ARCH>/` — 선택한 아키텍처 변형 전용 4개

뒤에 복사되는 루트가 앞을 덮는다(경로가 겹치면 arch > stack > common).

- 사용법: `STACK=python ARCH=modular PROJECT_NAME=… PROJECT_SLUG=… PACKAGE_NS=… bash setup.sh [대상경로]` (대상 생략 시 `$PWD`).
- 옵션: `--stack=<jvm|python|go>`(기본 `jvm`), `--arch=<변형>`(기본 `hexagonal`) — 둘 다 환경변수 `STACK`·`ARCH`로도 지정. `--force`(존재해도 덮어씀, 기본은 skip), `--dry-run`(계획만 출력).
- 처리: 각 루트 하위 파일을 정렬 순회 → 경로를 `remap()`으로 매핑 → 존재+비force면 skip, 아니면 복사 후 토큰 치환, `*.sh`는 실행권한 부여.
- 스택 순회는 `find "$root" -type f ! -path "*/arch/*"`로 변형 레이어를 건너뛴다(선택된 하나만 따로 복사).
- 알 수 없는 스택·변형을 주면 각각 사용 가능한 목록을 출력하고 `exit 2`로 중단한다.
- 템플릿은 모든 스택×변형에서 106개(공통 89 + 스택 13 + 변형 4)로 동일하다. 실제 설치는 이 중 core 38 + 고른 에이전트(claude 14 · codex 14 · cursor 9 · kiro 31)만 깔린다.

### 1.1 7개 설치 세그먼트

`remap()`이 소스 세그먼트를 대상 경로로 옮긴다(세 루트 모두 같은 규칙).

| 소스 (`<root>/…`) | 대상 | 역할 |
|---|---|---|
| `root/*` | `./` (프로젝트 루트) | `AGENTS.md`·`CLAUDE.md`·`.gitignore`·CI(스택별) + `ARCHITECTURE.md`(변형별) + pre-commit(공통) |
| `agents-rules/*` | `.agents/rules/*` | **규칙 원본 12종** = 공통 4(`agent-harness`·`sdd-workflow`·`product`·`design-principles`) + 스택별 6 + 변형별 2(`structure`·`tech`) |
| `agents-docs/*` | `.agents/docs/*` | 기록/SDD 스캐폴딩 (전부 공통) |
| `scripts/*` | `scripts/*` | 공통 4종(check-exec-plan-status·check-sdd-prerequisites·check-spec-freshness·new-feature) + 스택별 `verify.sh` |
| `claude/*` | `.claude/*` | Claude 명령·훅·settings (전부 공통) |
| `codex/*` | `.codex/*` | Codex config·훅 (전부 공통) |
| `kiro-steering/*` | `.kiro/steering/*` | Kiro 얇은 포인터 12종 = 공통 9 + 스택별 2(`tech`·`code-comments`) + 변형별 1(`structure`) |

### 1.2 치환 토큰표

`setup.sh`의 치환 루프가 다루는 토큰(값이 비면 그대로 남김):

| 토큰 | 의미 | 기본값 |
|---|---|---|
| `{{PROJECT_NAME}}` | 프로젝트 표시 이름 | `PROJECT_SLUG` |
| `{{PROJECT_SLUG}}` | 프로젝트 슬러그 | 대상 디렉터리 basename |
| `{{PACKAGE_NS}}` | **스택별 의미 상이** — jvm=패키지 네임스페이스(`com.example.app`), python=최상위 패키지명(`myapp`→`src/myapp/`), go=모듈 경로(`github.com/org/app`) | 빈값(미치환) |
| `{{SERVICE_NAME}}` | 서비스 이름 | `PROJECT_SLUG` |
| `{{PRIMARY_LANGUAGE}}` | 주 언어 | 스택 기본값(Kotlin/Java · Python · Go) |
| `{{BUILD_TOOL}}` | 빌드 도구 | 스택 기본값(Gradle · uv · go) |
| `{{TEST_CMD}}` | 테스트 명령 | 스택 기본값(`./gradlew check` · `pytest` · `go test -race ./...`) |
| `{{DOMAIN_EXAMPLE}}` | 예시 도메인 명 | 빈값 |
| `{{PROTECTED_PATH}}` | 편집 차단 경로 | `docs/references` |

**치환하지 않는 토큰**: `{{PRODUCT_SLUG}}`·`{{EPIC_ID}}`·`{{FEATURE_NAME}}`은 **설치 시점에 아직 정해지지
않은 값**이다. 제품·기능은 SDD를 시작할 때 결정되므로 `setup.sh`는 이 셋을 그대로 남긴다.
`{{PRODUCT_SLUG}}`는 `.agents/docs/_spec-templates/` 안에 남아 있다가 `new-feature.sh <slug>`가
제품 폴더로 복사하는 시점에 치환된다.

설치 후 미치환 토큰 점검은 `grep -rn '{{' . | grep -vE '_spec-templates/|\{\{\.\.\.\}\}|PRODUCT_SLUG'`로 한다
— `_spec-templates/`의 잔여 토큰은 의도된 것이라 제외하고 본다.

`setup.sh`는 목적지 **경로**에 대한 토큰 치환을 하지 않는다. 경로에 슬러그가 박히는 유일한 대상이던
`<slug>-specs/`가 설치되는 파일에서 빠졌기 때문이다(제품 폴더는 `new-feature.sh`가 만든다).

## 2. 아키텍처 변형과 계층 모델

아키텍처 원본은 루트 `ARCHITECTURE.md`, 구조 규칙 원본은 `.agents/rules/structure.md`다.
둘 다 스택×변형별로 다른 파일이 설치된다(Kiro 포인터 `structure.md`와 `.agents/rules/tech.md`까지 합쳐 변형 종속 파일은 이 4개뿐이다).

| STACK | 사용 가능한 ARCH | 비고 |
|---|---|---|
| `jvm` | `hexagonal` · `hexagonal-nested` · `hexagonal-standalone` · `layered` · `layered-multimodule` · `modulith` · `feature` · `multimodule` | 멀티모듈 5종(헥사고날 3 + `layered-multimodule` + `multimodule`)은 모듈 그래프가 컴파일로 막고, 단일 모듈 3종(`layered`·`modulith`·`feature`)은 구조 테스트가 강제를 담당 |
| `python` | `hexagonal` · `layered` · `modular` · `django` · `ai-service` | 계약은 전부 `[tool.importlinter]`로 표현 |
| `go` | `hexagonal` · `layered` · `feature` · `flat` | 계약은 depguard + 구조 테스트로 표현 |

기본값 `hexagonal`에서는 **세 스택이 같은 계층 모델**을 쓴다 — 한 바운디드 컨텍스트는
`primary`·`application(app)`·`domain`·`infra` 네 형제로 구성되고, 그 아래 `common`·`core`
공유 토대를 둔다. 다른 것은 그 계층을 무엇으로 표현하고 무엇으로 강제하는가다.

| 스택 | 계층 표현 단위 | 컨텍스트 경로(`hexagonal`) | 강제 수단 |
|---|---|---|---|
| `jvm` | Gradle **모듈** | `:<slug>-<ctx>:{domain,application,primary,infra}` (기본 `hexagonal`. `hexagonal-nested`는 `:<slug>-domain:<ctx>:…`, `hexagonal-standalone`은 평면 `:<slug>-<ctx>-<layer>`) | 모듈 의존 그래프(컴파일) + Konsist |
| `python` | **패키지**(src 레이아웃) | `src/<pkg>/<ctx>/{domain,application,primary,infra}` | import-linter 계약 + mypy strict |
| `go` | **패키지**(표준 레이아웃) | `internal/<ctx>/{domain,app,primary/http,infra}` | `internal/`·import 사이클(컴파일) + depguard |

변형을 바꾸면 계층 모델 자체가 바뀐다. 각 변형의 레이아웃·계약은 그 변형의 `ARCHITECTURE.md`에 있고,
문서마다 선택 기준(언제 쓰나/아닌가)·승격 신호·전환 절차가 함께 각인돼 있다:

| ARCH | 핵심 경계 | 강제의 형태 |
|---|---|---|
| `layered`(jvm·py·go) | 레이어 단방향 + 건너뛰기 금지 | ArchUnit `layeredArchitecture()` / `layers` 계약 / depguard `handler↛repository` |
| `modular`(py) · `feature`(jvm·go) | **기능 단위 독립** | ArchUnit 슬라이스(`notDependOnEachOther`) / `independence` 계약 / depguard 쌍 + 구조 테스트 |
| `modulith`(jvm) | **모듈 공개 표면 = 루트 타입**, 구현은 `internal` | Spring Modulith `ApplicationModules.verify()`(순환·internal 접근·허용 의존) |
| `multimodule`(jvm) | **모듈 등급**(실행→구성→공유) 단방향. 분할 축·이름은 프로젝트가 결정 | 모듈 의존 그래프(컴파일) + ArchUnit/Konsist 누출·순환 테스트 |
| `hexagonal-standalone`(jvm) | **컨텍스트가 자기 core·common·bootstrap까지 소유**(7모듈·실행 단위 N개). 컨텍스트 간 공유 코드 0 | 모듈 그래프(레이어) + **구조 테스트**(컨텍스트 간 의존 — 컴파일러가 못 막는 유일한 경계) |
| `layered-multimodule`(jvm) | **레이어 = 모듈**. 같은 계층 위에 실행 단위(api·batch·admin) 1~N개 | 모듈 그래프(레이어 단방향) + ArchUnit(엔티티 누출·트랜잭션 위치) + `api()`/`implementation()` 노출 범위 선택 |
| `django`(py) | 쓰기=services / 읽기=selectors 형제 분리 + 앱 간 독립 | `layers = [views, "services : selectors", models]` + `independence` |
| `ai-service`(py) | 프로바이더 SDK 격리 + 프롬프트 버전 자산 + eval 회귀 | forbidden 계약(SDK) + `evaluation/` 기준선 게이트 |
| `flat`(go) | 파일이 경계 · **만료 조건이 있는 변형** | 최소 depguard + 파일 수 상한 구조 테스트 |

### 2.1 jvm — 모듈 레이아웃과 의존 방향

```text
:{{PROJECT_SLUG}}-bootstrap             @SpringBootApplication. common + 각 도메인 primary·infra 조립·실행
:{{PROJECT_SLUG}}-domain:<ctx>:primary  inbound(REST) 어댑터         → application, common
:{{PROJECT_SLUG}}-domain:<ctx>:infra    outbound(JPA/쿼리) 어댑터     → application, common, core
:{{PROJECT_SLUG}}-domain:<ctx>:application 유스케이스 + port(in/out)  → domain, core
:{{PROJECT_SLUG}}-domain:<ctx>:domain   순수 Kotlin(Spring/JPA 무의존) → core
:{{PROJECT_SLUG}}-common                공유 커널(envelope·ErrorCode·GlobalExceptionHandler·RequestIdFilter) → core
:{{PROJECT_SLUG}}-core                  순수 Kotlin primitives(DomainException 등). 프레임워크 0
:{{PROJECT_SLUG}}-query                 (선택) 횡단 인프라 테이블용 쿼리 DSL(audit/outbox 등)
:{{PROJECT_SLUG}}-testsupport           (선택) 통합 테스트 토대·스키마 부트스트랩·JWKS 키
```

바깥이 안을 의존하는 방향(안쪽으로만):

```text
core ← common / domain
domain ← application
application ← primary, infra
{primary, infra} ← bootstrap
```

즉 core → domain → application → (primary, infra) → bootstrap 순으로 안쪽이 가장 순수하다.

### 2.2 jvm — 컴파일이 막는 의존 (모듈 그래프)

다음은 Gradle 모듈 의존 그래프상 **불가능**하다 — 시도하면 컴파일 실패한다.

- `domain → infra/primary` (도메인이 어댑터를 알 수 없음)
- `application → infra/primary` (유스케이스가 어댑터를 알 수 없음)
- `core → 외부` (core는 프레임워크 0)
- `primary ↔ infra` (인바운드·아웃바운드 어댑터 상호 무의존, bootstrap이 조립)

`core`·`domain`의 `build.gradle.kts`에는 Spring/JPA 플러그인·라이브러리를 절대 부착하지 않는다.
네 모듈은 항상 한 묶음으로 추가·제거하며, leaf 모듈명 충돌은 Gradle `group`을 `{{PACKAGE_NS}}.<ctx>`로
분리해 피한다.

### 2.2.1 python — 계약 린터가 막는 의존 (src 레이아웃)

Python에는 모듈 경계를 막는 컴파일러가 없다. 그래서 **`pyproject.toml`의 `[tool.importlinter]` 계약이
컴파일 강제를 대신**하고, `scripts/verify.sh`가 `lint-imports`로 실행한다.

```text
src/{{PACKAGE_NS}}/
├── core/        프레임워크 0 (DomainError·primitives)
├── common/      공유 커널 (envelope·error_code·exception_handler·미들웨어)
├── <ctx>/       domain / application / primary(web) / infra(persistence·client)
└── bootstrap/   composition root (app factory·DI 조립·settings·lifespan)
```

계약 4종: (1) 전역 layers(`bootstrap → common → core`), (2) 컨텍스트 내부 layers
(`primary : infra` → `application` → `domain`), (3) forbidden(`domain`·`core`가 fastapi·sqlalchemy·
pydantic import 금지), (4) independence(컨텍스트 간 직접 참조 금지).
새 컨텍스트는 (2)의 `containers`와 (4)의 `modules`에 등록해야 강제 대상이 된다.

src 레이아웃을 쓰는 이유는 테스트가 **설치된 패키지**를 import하게 만들어 "로컬 경로 덕분에만
동작하는" 사고를 막기 위해서다.

### 2.2.2 go — internal 가시성과 depguard (표준 Go 레이아웃)

Go는 `internal/`(외부 모듈 import 불가)과 import 사이클을 컴파일러가 막는다. 컴파일러가 못 잡는
레이어 방향만 `.golangci.yml`의 depguard 규칙이 채운다.

```text
cmd/<binary>/main.go   조립만(설정 로드·DI·서버 기동)
internal/
├── core/ common/ platform/          primitives · 공유 커널 · 기술 토대(config·db·log)
└── <ctx>/{domain, app, primary/http, infra/{postgres,client}}
pkg/                   외부 공개용만(없으면 만들지 않는다)
api/ configs/ deployments/ migrations/ test/ build/
```

`pkg/` 남용을 피하고 `internal/`을 기본으로 두는 것, 단위 테스트를 소스 옆(`*_test.go`)에 두는 것,
`src/`를 만들지 않는 것이 [golang-standards/project-layout](https://github.com/golang-standards/project-layout)
규약이다.

### 2.3 Port & Adapter (스택 공통 원리)

- Inbound Port: 유스케이스 인터페이스. 어댑터(컨트롤러/핸들러)는 구현체가 아니라 이 인터페이스에만 의존한다.
- Outbound Port: Repository/Gateway 추상. application(app)이 정의, infra가 구현(의존성 역전).
- 포트는 애그리거트 기준(`save`/`findBy…`)이며 `upsert`·SQL·세션 같은 영속 메커니즘을 노출하지 않는다.
- 새 외부 시스템 = 새 outbound port + 새 infra 어댑터. application·domain은 불변(OCP).
- 컨텍스트 간 직접 호출·모델 공유 금지. 통합은 공개 계약(contract)이나 도메인 이벤트(Outbox) 경유.

스택별 표현 방식만 다르다:

| 스택 | Inbound Port | Outbound Port | 비고 |
|---|---|---|---|
| `jvm` | `application/usecase/<X>UseCase.kt`(POJO 인터페이스) | `application/output/` 인터페이스 | infra가 `implements` |
| `python` | `application/usecase/<x>_usecase.py`의 `Protocol` | `application/port/`의 `Protocol` | 구조적 서브타이핑(상속 불필요) |
| `go` | `app` 패키지 인터페이스 | `app` 패키지 인터페이스 | **인터페이스는 소비자(app)가 선언**(Go 관례) |

### 2.4 레이어 책임 요약

공통 규칙: Application Service는 오케스트레이션만(권한 게이트·포트 조립·트랜잭션 경계·감사/이벤트),
비즈니스 규칙은 domain(애그리거트 불변식·VO 팩토리·도메인 서비스), 생성자 주입만, 도메인은 프레임워크 무의존.

| 스택 | 트랜잭션 경계 | 도메인 표현 | 프레임워크 침투 금지 대상 |
|---|---|---|---|
| `jvm` | `@Transactional`은 Application Service에만(어댑터 금지) | POJO/`data class`, `@JvmInline value class` | `domain`에 Spring/JPA 어노테이션·`ResponseEntity` |
| `python` | UseCase가 세션(UoW)을 열고 커밋(어댑터는 `commit()` 금지) | `@dataclass`(+`__post_init__` 불변식) | `domain`에 Pydantic `BaseModel`·SQLAlchemy·FastAPI |
| `go` | UseCase가 `TxManager.WithinTx`로 소유(어댑터 `Commit()` 금지) | 구조체 + `New...` 생성자 검증, 필드 비공개 | `domain`에 `net/http`·`database/sql`·드라이버 |

금지 목록의 구체 사례는 각 스택 `ARCHITECTURE.md`의 Anti-pattern 절에 있다.

## 3. 규칙 원본 12종 (`.agents/rules/`) — 공통 4 + 스택별 6 + 변형별 2

| 파일 | 소스 | 한 줄 요약 |
|---|---|---|
| `agent-harness.md` | 공통 | 하네스 규약 원본 — SSOT·완료 게이트·강제 레이어(1곳+N트리거)·규칙 변경 절차 |
| `sdd-workflow.md` | 공통 | SDD 워크플로 원본 — specify→clarify→checklist→plan→tasks→analyze→implement(+converge)·산출 위치·게이트 |
| `product.md` | 공통 | 제품 정체성·목표·범위·원칙·우선순위(P0/P1/P2)·KPI (채우기 템플릿) |
| `design-principles.md` | 공통 | **설계 원칙 원본** — 클린 아키텍처 의존 규칙 · SOLID를 `원칙→위반 신호→고치는 법`으로 · 캡슐화/Tell Don't Ask/합성 · 과잉 설계 방지. 구조가 아니라 **그 구조 안에서 코드를 어떻게 짤지**를 정한다 |
| `guardrails.md` | 스택별 | 행동 헌법 — 추측 금지 + docs 동시 갱신 + DDD 레이어 책임 + 언어별 실수 방지 |
| `security.md` | 스택별 | 인증/인가 경계 · 접근 제어 이중 방어선 · secret 처리 · 언어별 고유 위험 |
| `api-standards.md` | **스택별** | 응답 envelope · ErrorCode 매핑 · 예외 변환 · 요청 검증 · OpenAPI 문서화 |
| `structure.md` | **변형별** | 레이아웃 · 패키지 컨벤션 · 통합 규약 · 구조 테스트 · 새 도메인/기능 착수 |
| `tech.md` | **변형별** | 스택 표·버전 단일 소스(`libs.versions.toml` / `pyproject.toml` / `go.mod`) · 빌드·실행 명령 · 포트 규약 |
| `code-comments.md` | 스택별 | 주석 표준 — 기본은 '없음'(Why·함정·외부 근거·억제 이유·복잡한 함수의 절차) · 언어별 예시(KDoc·Javadoc / docstring / Go doc) |
| `writing-style.md` | 공통 | 문체 원본 — 스펙·주석·커밋·리포트를 사람이 읽는 글로 |
| `reliability.md` | 스택별 | timeout·retry·서킷브레이커 · 멱등성 · fail-closed · 성능 예산 · 언어별 동시성 함정 |
| `quality-score.md` | **스택별** | 코드 품질 · Story/Epic DoD · 커버리지(도메인≥90%, 전체≥80%) · 검증 절차 |

핵심 규약 몇 가지(모든 스택 원본에서 동일하게 강제):

- **응답 envelope**(`api-standards.md`): 성공/실패 분기는 HTTP status가 담당(body에 success 플래그 금지). 성공·오류가 `code`·`message`·`request_id`·`timestamp`를 대칭 공유, 성공은 `data`(+`page`), 오류는 `details`. 어댑터가 도메인 모델·ORM 객체를 직접 반환 금지. 예외 변환 경계는 한 곳(jvm=`GlobalExceptionHandler`, python=전역 exception handler, go=`httpx.WriteError`). ErrorCode는 `AU0001` 식 prefix+일련번호.
- **접근 제어**(`security.md`): 1차 방어선은 요청 경계(인증 401 / 인가 403, 보호는 라우터 그룹 단위), 2차 방어선은 유스케이스 진입의 리소스 권한 재확인(IDOR 차단). 판단 컨텍스트가 없으면 기본 거부(fail-closed). 자격증명은 재검증용이면 해시만 저장·원문 1회만 반환, 원문 재사용이 필요하면 인증 암호화(AES-256-GCM). 비교는 상수 시간(`hmac.compare_digest`/`subtle.ConstantTimeCompare`), 난수는 암호학적 안전 소스.
- **레이어 강제**(`structure.md`·`ARCHITECTURE.md`): 규칙을 담은 안쪽 계층은 전송·영속 타입을 모른다. 위반은 스택·변형별 강제 수단(모듈 그래프 / ArchUnit·Spring Modulith / import-linter / depguard)이 차단한다.

## 4. Kiro 얇은 포인터 (`.kiro/steering/`)

Kiro용 12종은 원본과 **1:1**로 대응하는 얇은 포인터다. 각 파일은 `inclusion` front-matter +
"원본: `.agents/rules/<name>.md` — Claude·Codex·Kiro 공통" + 짧은 요약으로 구성되며, **규칙 본문을
담지 않는다**.

12종 중 9종은 공통, `tech`·`code-comments` 2종은 스택별, **`structure` 1종은 변형별**로 다른 요약을 담는다.

inclusion 방식은 둘:

- `inclusion: always` (9종): `agent-harness`·`guardrails`·`product`·`quality-score`·`reliability`·`sdd-workflow`·`security`·`structure`·`tech`.
- `inclusion: fileMatch` (2종):
  - `api-standards.md` → `**/primary/**|.agents/docs/openapi/**`
  - `code-comments.md` → **스택별 패턴**: jvm `**/*.kt|**/*.java|**/*.sql` · python `**/*.py|**/*.sql` · go `**/*.go|**/*.sql`

## 5. 진입 파일 (`root/`)

진입 파일 3종은 모두 **스택별**로 설치된다(스택 한 줄·검증 명령·아키텍처 본문이 다르기 때문).

- `AGENTS.md` — 에이전트 작업 가이드. "상세가 아니라 목차". 3에이전트 로딩 규칙·규약 표·핵심 가드레일 요약·규칙 변경 절차. "규칙 본문은 어느 에이전트도 소유하지 않는다".
- `CLAUDE.md` — Claude Code 진입 파일(짧음). `AGENTS.md`를 단일 진입점으로 위임 + 스택 한 줄(검증 게이트 명령).
- `ARCHITECTURE.md` — 기술 아키텍처 원본. 헥사고날 계층·Port&Adapter·레이어 책임·Anti-pattern(코드리뷰 즉시 차단 목록)·성능 예산·TDD 워크플로. 스택별로 강제 수단 설정 골격(import-linter 계약 / depguard 규칙)을 포함한다.

이 파일들은 상세를 복제하지 않고 `.agents/rules/`·`ARCHITECTURE.md` 원본으로 유도한다.
치환 토큰은 헤더 주석에 `{{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}`로 명시된다.
