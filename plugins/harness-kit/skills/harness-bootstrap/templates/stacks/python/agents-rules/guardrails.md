<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 개발 가드레일 — {{PROJECT_NAME}}

모든 작업의 최소 기준이다. 무엇을 만들든 착수 전에 이 파일을 확인한다.

## 추측하지 말 것 (최우선)

- 코드·동작·설정을 추측해서 단정하지 않는다. **확인한 뒤 말한다.**
- 파일/함수/스키마를 언급하기 전에 실제로 읽는다. 읽지 않았으면 "확인하지 않았다"고 명시한다.
- 의존성·버전은 **`pyproject.toml`과 잠금 파일에서 확인한 뒤** 사용한다. 설치되지 않은 라이브러리를 쓰는 코드를 쓰지 않는다.
- 분석/기획 문서(`docs/`)에 근거가 있으면 그 근거를 따르고, 없으면 임의로 채우지 말고 사용자에게 확인한다.
- 모르거나 불확실하면 "모른다 / 확인 필요"라고 분명히 밝힌다.
- 검증한 사실과 미확인 가정을 구분해 표현한다.

## 하네스 작업 규칙

- 규칙 정본은 `.agents/rules/`, 기록/SDD 정본은 `.agents/docs/`다. 진입 파일(AGENTS.md 등)은 목차일 뿐 상세를 중복 보관하지 않는다.
- 규칙이 바뀌면 `.agents/rules/`의 정본을 **먼저** 고치고 진입 파일·kiro 포인터를 동기화한다(절차: [`agent-harness.md`](./agent-harness.md)).
- 복잡한 작업은 `.agents/docs/product-<slug>-specs/tasks/active/<feature>.md`에 계획을 남기고 진행한다.
- 기술 부채는 `.agents/docs/tech-debt-tracker.md`에 등록한다.
- 변경은 `scripts/verify.sh`(ruff·mypy·lint-imports·pytest)로 검증한 뒤 결과를 제시한다.

## exec-plan 완료 게이트 (사용자 검증 필수)

상태 전이 `active/` → `check/` → `completed/`.
- DoD/verify 충족 시 임의로 `completed/`로 옮기지 않는다. 상태를 `check`로 두고 `check/`로 이동해 **사용자 검증을 요청**한다.
- 사용자가 명시 승인한 뒤에만 `completed`로 바꿔 `completed/`로 이동한다.

## 기능 구현 시 docs 명세 동시 갱신 (필수)

- 기능 구현, API 변경, 상태 전이 변경, DB/캐시/외부 연동 변경 시 `.agents/docs/` 명세를 **같은 변경**에 포함한다.
- 인터페이스 명세는 API operation 단위로 작성한다. CRUD는 Create/List/Detail/Update/Delete/Action을 합치지 않고 각각 sequence diagram을 둔다.
- 각 operation에는 Method/Path, 권한/scope, request/response 스키마, validation, error code, 사용 table/query, 사용 cache, 외부 연동, flowchart, sequence diagram을 포함한다.
- Mermaid diagram은 렌더링 안정성을 우선한다. 노드 label에 `<`, `>`, `<=`, `>=`를 직접 넣지 말고 자연어로 쓴다.
- API 변경은 OpenAPI 스냅샷(`.agents/docs/openapi/`)을 함께 갱신한다. 없으면 `docs/interfaces/`와 `docs/database/`를 최소 정본으로 갱신한다.
- docs 영향이 없다고 판단되면 exec-plan 또는 변경 요약에 "docs 영향 없음"과 근거를 명시한다.

## 주석은 책임 + 처리 흐름 + Why (번역투 금지)

대원칙: **코드는 라인 단위 What·How를, 주석은 Why를 설명한다. 단 함수·메서드 docstring은 책임 + 처리 흐름으로 로직 이해를 돕는다.**
상세·Bad/Good 정본은 [`code-comments.md`](./code-comments.md).

- 로직을 담은 함수에는 ① 책임 한 줄 ② 비자명한 Why ③ `처리 흐름:` 주요 단계 순서를 적는다.
- **처리 흐름의 각 단계는 "무엇을 — 왜/무엇을 위해"** 로 의도를 곁들인다. 시그니처를 옮긴 번역투는 금지한다.
- **타입 힌트가 계약을 담는다** — `Args:`/`Returns:`로 타입을 되풀이하지 않는다. 타입이 못 담는 의미(단위·범위·부작용)만 적는다.
- 자명한 함수(`@property` 단순 반환·한 줄 위임)는 흐름 생략, 책임 한 줄만. 흐름이 7~8단계로 길면 함수를 분리한다.
- `# type: ignore`·`# noqa`·`to_thread`·원시 SQL에는 **반드시 근거**를 적는다.
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다.

## 레이어 책임 (아키텍처 변형 무관 원칙 — 필수)

아래는 **어떤 아키텍처 변형을 골랐든** 지키는 원칙이다.
구체적인 패키지 경로·모듈 이름은 변형마다 다르므로 **[`structure.md`](./structure.md)와 `ARCHITECTURE.md`가 정본**이다.

- **비즈니스 규칙은 안쪽에, 오케스트레이션은 바깥에 둔다.**
  - 한 개념이 소유한 규칙·상태 전이 → 그 개념을 표현하는 타입의 메서드.
  - 형식 구성·계산(식별자 조립·정규화·체크섬) → **값 타입**(`@dataclass(frozen=True, slots=True)` + `__post_init__` 검증).
  - 한 개념에 속하지 않는 무상태 규칙·정책 → **정책 모듈/도메인 서비스**. 외부 I/O 0. 의존이 없으면 모듈 함수, 주입·교체가 필요하면 클래스.
- **오케스트레이션 계층은 조립만 한다**: 권한 게이트 · 저장소·외부 호출 조립 · **트랜잭션 경계** · 감사/이벤트 발행. **비즈니스 규칙 인라인 금지**(anemic domain 회피).
- 판정: 저장소·외부 호출·트랜잭션·격리 세션이 필요 → **오케스트레이션 계층** / 순수 규칙·계산 → **안쪽 계층**.
- **트랜잭션 경계는 한 곳(오케스트레이션 계층)에만.** 데이터 접근·아웃바운드 어댑터는 주입된 세션을 쓰기만 하고 `commit()`을 호출하지 않는다(경계가 분산되면 부분 반영이 생긴다).
- **파싱·검증은 경계에서.** 외부 입력(HTTP·큐·파일)은 **인바운드 경계**에서 스키마로 파싱해 신뢰 가능한 타입으로 바꾼 뒤 안쪽으로 넘긴다. 안쪽 계층이 원시 dict·문자열을 다시 검증하지 않는다.
- **생성자 주입 only.** 모듈 전역 싱글턴·`global`·import 시점 부작용 금지. 프레임워크 DI(`Depends` 등)는 **인바운드 경계에서만** 쓰고 안쪽 계층 생성자에 침투시키지 않는다.
- **안쪽 계층에 프레임워크 침투 금지**: 규칙을 담은 계층에 웹 프레임워크 타입을 쓰지 않는다(`lint-imports`가 차단). **이 경계가 어디인지는 변형마다 다르므로** `ARCHITECTURE.md`의 계약을 따른다.
- 위반 예시(하지 말 것): 오케스트레이션 계층 안에서 파일 검증 정책·키 조립·해시 계산·상태 전이 판단을 직접 작성.

## Python 실수 방지 (자주 나는 것)

- 가변 기본 인자(`def f(x: list = [])`) — `None` 기본값 + 내부 생성.
- 광범위 `except Exception`으로 삼키기 — 잡았으면 **처리하거나 다시 던진다**(`raise ... from err`로 원인 보존).
- 순환 import를 함수 내부 import로 우회 — 레이어 설계를 고친다.
- `datetime.now()` 직접 호출 — `Clock` 포트를 주입한다(테스트 결정성). 시간은 **timezone-aware UTC**(`datetime.now(UTC)`)로 다룬다.
- 부동소수로 금액 계산 — 정수 최소 단위 또는 `Decimal`.
- `assert`로 런타임 검증 — `-O` 최적화에서 제거된다. 검증은 명시적 `raise`.
