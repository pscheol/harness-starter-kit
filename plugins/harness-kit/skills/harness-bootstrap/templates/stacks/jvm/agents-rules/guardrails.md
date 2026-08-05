<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 개발 가드레일 — {{PROJECT_NAME}}

모든 작업의 최소 기준이다. 무엇을 만들든 착수 전에 이 파일을 확인한다.

## 추측하지 말 것 (최우선)

- 코드·동작·설정을 추측해서 단정하지 않는다. 확인한 뒤 말한다.
- 파일/함수/스키마를 언급하기 전에 실제로 읽는다. 읽지 않았으면 "확인하지 않았다"고 명시한다.
- 빌드 도구·버전은 빌드 설정 파일에서 확인한 뒤 사용한다(예: Gradle `build.gradle.kts`·`gradle/libs.versions.toml`, 또는 Maven `pom.xml`).
- 분석/기획 문서(`docs/`)에 근거가 있으면 그 근거를 따르고, 없으면 임의로 채우지 말고 사용자에게 확인한다.
- 모르거나 불확실하면 "모른다 / 확인 필요"라고 분명히 밝힌다. 그럴듯한 값을 지어내지 않는다.
- 검증한 사실과 미확인 가정을 구분해 표현한다.

## 하네스 작업 규칙

- 규칙 원본은 `.agents/rules/`, 기록/SDD 원본은 `.agents/docs/`다. 진입 파일(AGENTS.md 등)은 목차일 뿐 상세를 중복 보관하지 않는다.
- 규칙이 바뀌면 `.agents/rules/`의 원본을 **먼저** 고치고 진입 파일·kiro 포인터를 동기화한다(절차: [`agent-harness.md`](./agent-harness.md)).
- 복잡한 작업은 `.agents/docs/product-<slug>-specs/tasks/active/<feature>.md`에 계획을 남기고 진행한다.
- 기술 부채는 `.agents/docs/tech-debt-tracker.md`에 등록한다.
- 변경은 `scripts/verify.sh`(= `./gradlew check`)로 검증한 뒤 결과를 제시한다.

## exec-plan 완료 게이트 (사용자 검증 필수)

상태 전이 `active/` → `check/` → `completed/`.
- DoD/verify 충족 시 임의로 `completed/`로 옮기지 않는다. 상태를 `check`로 두고 `check/`로 이동해 **사용자 검증을 요청**한다.
- 사용자가 명시 승인한 뒤에만 `completed`로 바꿔 `completed/`로 이동한다.

## 기능 구현 시 docs 명세 동시 갱신 (필수)

- 기능 구현, API 변경, 상태 전이 변경, DB/캐시/외부 연동 변경 시 `.agents/docs/` 명세를 **같은 변경**에 포함한다.
- 인터페이스 명세는 API operation 단위로 작성한다. CRUD는 Create/List/Detail/Update/Delete/Action을 합치지 않고 각각 sequence diagram을 둔다.
- 각 operation에는 Method/Path, 권한/scope, request/response DTO, validation, error code, 사용 table/query, 사용 cache, 외부 연동, flowchart, sequence diagram을 포함한다.
- Mermaid diagram은 렌더링 안정성을 우선한다. 노드 label에는 `<`, `>`, `<=`, `>=` 같은 비교 연산자를 직접 넣지 말고 "기간 유효?" 같은 자연어로 쓴다.
- API 변경은 `.agents/docs/openapi/`가 존재하면 함께 갱신한다. 없으면 `docs/interfaces/`와 `docs/database/`를 최소 기준으로 갱신한다.
- docs 영향이 없다고 판단되면 exec-plan 또는 변경 요약에 "docs 영향 없음"과 근거를 명시한다.

## 주석은 기본이 '없음'이다

상세·Bad/Good 원본은 [`code-comments.md`](./code-comments.md). 문장을 어떻게 쓸지는 [`writing-style.md`](./writing-style.md).

- 코드가 스스로 말하게 두고, 코드로 말할 수 없는 것만 적는다. 다는 경우는 넷뿐이다 — Why · 함정 · 외부 근거 · 억제 이유.
- CRUD·getter·위임·매퍼·DTO·설정 클래스에는 달지 않는다. 시그니처 받아쓰기(`// id로 사용자를 조회한다`)는 삭제한다.
- 규칙 문서로 보내는 참조 주석(`// .agents/rules/*.md 참고`), 구획 주석, 변경 이력은 쓰지 않는다.
- 단계별 `처리 흐름:`은 **예외**다. 순서를 바꾸면 버그가 나고 그 이유가 코드에 없을 때만, 5단계 이내로.
- yml·SQL은 한 줄까지. 값의 근거(왜 이 숫자·왜 이 조인·힌트 철회 조건)만 적고 키 이름·구문은 설명하지 않는다.
- KDoc/Javadoc의 `@param`/`@throws`는 타입이 못 담는 의미가 있을 때만. `@Transactional` 등은 경계 이유가 비자명할 때만.
- 코드가 바뀌면 주석도 고치거나 지운다. 한국어로 쓰고, 비밀·토큰·키 원문은 넣지 않는다.

## 레이어 책임 (아키텍처 변형 무관 원칙 — 필수)

아래는 **어떤 아키텍처 변형을 골랐든**(hexagonal · hexagonal-nested · layered · modulith · feature · multimodule) 지키는 원칙이다.
구체적인 패키지 경로·모듈 이름은 변형마다 다르므로 [`structure.md`](./structure.md)와 `ARCHITECTURE.md`가 원본이다.

- 비즈니스 규칙은 안쪽에, 오케스트레이션은 바깥에 둔다.
  - 한 개념이 소유한 규칙·상태 전이 → 그 개념을 표현하는 타입(애그리거트·엔티티)의 메서드. 상태 일관성(불변식)을 서비스로 빼지 않는다.
  - 형식 구성·계산(식별자 조립·정규화·체크섬 등) → **값 타입 팩토리**(`@JvmInline value class` / `data class` + `init { require(...) }`).
  - 한 개념에 속하지 않는 무상태 규칙·정책 → **도메인 서비스**. 외부 I/O 0. 의존이 없으면 `object`/top-level 함수, 주입·교체·모킹이 필요하면 POJO `class` + 설정 클래스의 `@Bean`.
- 오케스트레이션 계층(유스케이스·서비스)은 조립만 한다: 권한 게이트 · 저장소·외부 호출 조립 · 트랜잭션 경계(`@Transactional`) · 감사/이벤트 발행. 비즈니스 규칙 인라인 금지(anemic domain 회피).
- 판정: 저장소·외부 호출·트랜잭션·격리 세션이 필요 → 오케스트레이션 계층 / 순수 규칙·계산 → 안쪽 계층.
- 트랜잭션 경계는 한 곳(오케스트레이션 계층)에만. 영속 어댑터·Repository·인바운드 경계에는 `@Transactional`을 붙이지 않는다(어댑터는 유스케이스가 연 트랜잭션에 참여 — 경계가 분산되면 부분 반영이 생긴다).
- 파싱·검증은 경계에서. 외부 입력(HTTP·큐·파일)은 **인바운드 경계**에서 DTO로 파싱·검증한 뒤 안쪽으로 넘긴다. 안쪽 계층이 원시 문자열·맵을 다시 검증하지 않는다.
- 생성자 주입 only. `@Autowired` 필드/세터 주입·`lateinit var` 의존성 금지. 시간·난수·ID는 인터페이스(`Clock`·`IdGenerator`)로 주입한다.
- 안쪽 계층에 web 타입 침투 금지: 규칙을 담은 계층은 `HttpStatus`·`ResponseEntity` 같은 web 타입을 모른다. 이 경계를 무엇이 강제하는지는 변형마다 다르다(모듈 그래프의 컴파일 차단 또는 구조 테스트) — `ARCHITECTURE.md`의 계약을 따른다.
- 위반 예시(하지 말 것): 오케스트레이션 계층 안에서 파일 검증 정책·키 조립·해시 계산·도메인 상태 전이 판단을 직접 작성.
