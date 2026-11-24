---
paths:
  - "**/*.kt"
  - "**/*.kts"
  - "**/*.java"
  - "**/*.py"
  - "**/*.go"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.cjs"
---
# 코드 작성·유지보수 기준

적용 대상은 신규 코드와 이번에 바꾸는 코드다. 기존 위반의 일괄 교정은 별도 이슈로 잡는다.
폴더·레이어·파일당 선언 수·클래스 이름은 해당 단위의 `ARCHITECTURE.md`와 `.agents/rules/structure.md`를 먼저 따른다.
설계 원칙은 [design-principles](./design-principles.md), 재사용 판정은 [reuse-before-new](./reuse-before-new.md)가 원본이다.

## 1. 클래스와 패키지의 책임

파일을 나눌 때 각 코드가 바뀌는 이유와 호출하는 곳을 함께 본다.
HTTP 변환·업무 판단·조회·저장·외부 모델 호출이 한 서비스에 섞였다면 기존 레이어 안에서 책임을 나눈다.
파일 길이만 줄이려고 같은 책임을 임의의 조각으로 자르거나 빈 패키지를 만들지 않는다.

| 판단 | 실행 기준 |
|---|---|
| 패키지 SRP | 패키지 이름으로 업무 기능 또는 기술 책임을 말할 수 있어야 한다. 서로 다른 수명주기·변경 이유를 가진 코드를 한 `service`·`utils`에 모으지 않는다 |
| 패키지 순서 | Kotlin은 컨텍스트 → 레이어 → 하위 도메인 → 종류 순서다(하위 도메인 목록은 그 단위 `structure.md`). React는 `app → features → shared`, Python은 단위의 하위 도메인 → 레이어(domain/application/api/provider/infra) 규칙을 따르고 폴더 하나에 모듈 12개를 넘기면 업무 묶음 폴더로 나눈다 |
| 서비스 분리 | 정책·조립·I/O·변환을 구별하고 거대 클래스의 어떤 메서드와 의존을 옮기는지 설계에 적는다. 트랜잭션·권한 검사·공개 포트는 보존한다 |
| 선언과 파일 | 하나의 공개 책임을 파일 하나에 둔다. 파일당 선언 예외, 패키지 파일 수와 분리 축은 단위 규칙을 따른다. 공통 규칙으로 단위의 예외를 지우지 않는다 |
| 재사용 소유자 | 이름·입출력·호출부·후보 위치를 검색한다. 한 도메인만 쓰는 코드는 그 도메인이 소유한다. 같은 의미·실패 정책을 여러 곳에서 쓰는 경우에 공용으로 옮긴다 |
| 공용 이름 | `CommonUtils`·`Helper`·`Manager`로 모으기 전에 수행하는 동작을 이름으로 쓴다. `RecordingDurationFormatter`처럼 입력 개념과 책임이 드러나는 이름을 쓴다 |

### 함수 하나의 길이

- 함수 본문(문서 주석 포함)이 50줄을 넘으면 단계마다 이름 있는 함수로 나눈다. 여러 단계가 함께 바꾸는 상태가 있으면 그 상태를 갖는 비공개 타입으로 옮기고 단계를 그 메서드로 둔다. 나누지 않는 이유(선언적 매핑 표 등)가 있으면 SDD 예외 목록에 적는다.
- 나눌 때 트랜잭션 경계·Spring 프록시 호출(self-invocation)·테넌트 문맥·호출 순서·단락 평가를 보존한다. 나눈 함수를 원래 순서대로 부른다.
- 워크플로 엔진(Temporal 등)을 쓰면 워크플로 함수의 활동 호출과 버전 표식(`Workflow.getVersion` 등) 실행 순서를 바꾸지 않는다. 순서가 같아야 진행 중 실행의 이력 리플레이가 같다. 활동에 넘길 명령을 짓는 부분은 시각·난수·입출력 없는 순수 함수로 뺄 수 있다.

DDD는 같은 업무 용어, aggregate의 불변식, context 사이 공개 계약을 코드에 맞추는 데 적용한다.
SOLID와 Strategy·Factory·Adapter 같은 패턴은 실제 변경 이유·대체 구현·외부 경계가 있을 때 고른다.
하나뿐인 순수 변환을 위해 interface·factory·service를 동시에 만들지 않는다.

## 2. 읽을 수 있는 이름과 상수

이름은 대상·역할·범위를 나타낸다. 선언을 처음 읽는 개발자가 앞의 실행 내역을 추측해야 하면 바꾼다.

| 모호한 이름 | 역할을 확인한 뒤 고르는 이름 |
|---|---|
| `list` | `visibleNotes`·`pendingRecordingJobs` |
| `instance` | `transcriptRepository`·`sensitivityAwareModelProvider` |
| `r`·`s` | `recording`·`transcriptionStatus` |
| `req`·`resp` | `createNoteRequest`·`transcriptionResponse` |
| `data`·`result` | `validatedTranscript`·`savedNote` |
| `timeout`·`size` | `requestTimeoutMilliseconds`·`audioSizeBytes` |

예시를 기계적으로 치환하지 않는다. `recording`인지 `request`인지 실제 타입과 호출부로 확인한다.
API·HTTP·URL·ID·SQL·JPA·DTO·STT·LLM, 좌표·반복 인덱스와 단위가 정한 명명법은 유지한다.
외부 JSON 필드·SDK 매개변수·생성 코드 이름은 계약이다. 내부 이름 개선과 wire 이름 변경을 구분한다.

- 업무 상태·오류 코드·정책 값은 소유 도메인의 기존 enum·값 타입을 먼저 찾는다.
- 반복되는 문자열·수치에 의미가 있으면 그 소유 위치에 이름 있는 constant를 둔다. 숫자에는 단위를 담는다.
- 상태 전이·권한·저장 값의 이름을 바꾸어도 wire 값·DB 값·오류 코드는 승인된 계약 변경이 없으면 보존한다.
- 한 번 쓰는 문구·필드명·사소한 리터럴을 전부 상수 파일로 옮기지 않는다. 환경 값은 기존 설정 객체에서 읽고 검증한다.
- 비밀·실제 사용자 데이터는 상수·문서 예시·진단 출력에 넣지 않는다.

### 공개 계약 함수의 이름

유스케이스·출력 포트·응용 서비스·도메인 서비스·`api` 계약의 공개 함수 이름에는 **돌려주는 것과 기준**(조건·범위·정렬)을 쓴다.
`list`·`get`·`find`·`read`·`resolve`·`handle`·`process`·`run` 하나로 두지 않는다. 인터페이스 이름이 대상을 말해도 함수 이름에 쓴다 — 호출부에는 변수 이름과 함수 이름만 보인다.

| 본문이 하는 일 | 이름 |
|---|---|
| 시스템 템플릿을 화면 순서대로 읽는다 | `SystemTemplateRepository.list` → `listInDisplayOrder` |
| 에이전트를 이름순으로 읽는다 | `AgentCrewRepository.list` → `listByName` |
| 전사 작업을 띄운다 | `TranscriptionLauncherPort.launch` → `launchTranscription` |
| 30초 창마다 전사한다 | `Transcriber.transcribe` → `transcribe_windows` |

- 인자가 애그리거트 하나이고 그것을 저장·삭제하면 `save(crew)`처럼 동사 하나를 둔다. 인자 타입이 대상을 정한다. `of`·`from`·`parse` 같은 생성 함수도 그대로 둔다.
- 바꾸지 않는 이름: `override`, Spring Data 기본 연산, Python 특수 메서드, FastAPI 경로 함수(operationId가 된다), Temporal `@WorkflowMethod`·`@ActivityMethod`(활동 형식 이름이 된다), DTO 클래스 이름(OpenAPI 스키마 이름이 된다), 다른 단위·리포가 부르는 계약. 바꿔야 하면 계약 변경으로 SDD에 적는다.
- Python은 레이어 폴더(`application`·`domain`·`api`·`port`)의 모듈 맨 위 함수와 공개 서비스 클래스의 메서드가 대상이다. 값 타입(dataclass·pydantic 모델·열거형)의 메서드와 `_` 이름은 뺀다. 구현(`provider`·`infra`)은 포트 이름을 따른다. 구현 하나가 포트 둘을 맡으면 두 포트에 같은 이름을 준다.
- 타입 이름이 `*Save`·`*Lookup`·`*Assembler`·`*Helper`·`*Manager`·`*Util`로 끝나면 책임을 확인해 바꾼다. 결과 타입이 이름에 있는 조립기(`*ViewAssembler`·`*PlanAssembler`)와 프레임워크가 정한 이름(`CacheManager`)은 둔다.
- 이름을 바꾼 뒤에는 함수 이름을 **글자로** 쓰는 곳을 찾는다. 컴파일러·mypy가 잡지 못한다.
  - 리플렉션 시험(`it.method.name == "launch"`) — 이름이 바뀌면 "호출되지 않았다" 단언이 늘 참이 된다.
  - 구조 시험의 함수 이름 허용 목록.
  - Mock 설정(`Mock(fetch=…)`·`x.run.return_value`)과 `-> Any`를 돌려주는 대역.
  - 다른 리포 소비자(평가 도구·운영 스크립트 등). 단위 게이트는 다른 리포를 보지 않는다.

## 3. 조건식은 판단의 의미를 드러낸다

`if (a > b && c < d || s == a)`처럼 여러 판단을 한 줄에 섞으면 경계값과 예외를 읽기 어렵다.
도메인 의미가 다른 판단은 `hasRemainingUploadQuota`·`canReadRecording` 같은 predicate로 나눈다.
짧은 단일 비교나 자명한 null 확인은 그대로 둔다. 함수 호출 자체가 읽기 부담을 늘리면 분리하지 않는다.

```kotlin
if (hasRemainingUploadQuota(uploadSizeBytes, remainingQuotaBytes) &&
    acceptsAudioFormat(contentType) || hasUploadOverride(member)) {
    admitUpload()
}
```

이 예시는 원래 우선순위 `(quota && format) || override`를 유지한다.
전체 조건을 `canAdmitUpload(...)`로 묶을지는 그 함수가 놓일 도메인과 override 정책을 확인한 뒤 정한다.
함수 이름이 규칙을 설명해야 한다. `checkCondition`·`isValid`로만 바꾸면 판단이 여전히 숨는다.

거르기 람다·컬렉션 사슬·컴프리헨션 조건도 같다. null·빈 값 확인을 뺀 업무 판단이 둘 이상이면 판단이 속한 타입의 함수(`it.isEnabledFor(slot)`)나 이름 있는 지역 값으로 뺀다.
람다가 중첩되거나 본문이 세 줄을 넘으면 `it` 대신 이름 있는 매개변수를 쓴다.

분리 전후에는 다음을 비교한다.

- `&&`·`||`·`and`·`or`의 우선순위, 괄호, 단락 평가와 NULL 의미.
- 비교 경계값·성공·실패와 각 독립 판단의 진리표. BDD `Given / When / Then`에는 실제 결과를 단언한다.
- 호출 순서와 횟수. 뒤 판단을 미리 계산해 이전에 실행되지 않던 DB·모델·시간 조회를 실행하지 않는다.
- 예외·권한 검사·변경·로그 같은 부작용. `can*`·`is*` 판단 함수는 가능한 한 순수하게 만든다.
- 가드 절로 평탄화할 때 기존 오류 우선순위·반환값·finally 동작을 보존한다.

## 4. Kotlin·Spring: adapter와 mapper

영속 adapter는 application/<하위 도메인>/output port를 구현하고 조회·저장 결과와 실패를 그 계약으로 연결한다.
entity/domain/port model 변환은 `infra/<하위 도메인>/persistence/mapper`의 기존 mapper가 맡는다.
HTTP 요청·응답 DTO 변환은 `primary/<하위 도메인>/web/mapper`가 맡는다. persistence가 web DTO를 참조하지 않는다.

| 위치 | 둔다 | 옮겨야 하는 신호 |
|---|---|---|
| application/domain | 유스케이스 조립·업무 정책·불변식 | mapper 안의 권한 부여·요금 판정·상태 전이 |
| persistence adapter | 포트 수행·DB 접근 위임·저장 결과 연결 | 큰 필드 복사 블록·여러 모델의 변환·업무 정책 |
| persistence mapper | entity와 domain/port model 사이 타입·필드 변환 | repository 호출·트랜잭션 시작·모델 호출·권한 검사 |
| web mapper | 요청·응답 DTO와 유스케이스 모델 변환 | 업무 정책·entity 참조 |
| query/repository | 그 단위 `structure.md`가 정한 조회·저장 도구 | adapter 안의 직접 쿼리·문자열 SQL |

mapper 분리는 필드 누락·nullable·enum·시간 단위·컬렉션 순서와 원본 보존을 단위 테스트로 확인한다.
표현 타입의 형식 변환과 업무 유효성 검사를 구분한다. 정책을 mapper로 옮겨 서비스 줄 수를 줄이지 않는다.
기존 mapper 이름·주입 방식과 포트 계약을 따른다. mapper를 공용에 모으거나 포트에 JPA 타입을 노출하지 않는다.

업무 조회·쓰기 도구는 그 단위 `structure.md`·`tech.md`가 정한다(예: 조회는 타입 안전 쿼리 DSL, 쓰기는 JPA).
정한 도구를 우회하는 새 경로(파생 조회·`@Query`·문자열 JPQL·Criteria/Specification)를 만들지 않는다.

native SQL 전환 전에는 용도를 확인한다. RLS session/context, advisory lock, `pg_catalog` 관측,
migration·DB fixture 등 등록된 인프라 예외를 유지하며 예외 목록을 임의로 넓히지 않는다.
쿼리 DSL로 임의의 DB 기능을 그대로 대체할 수 있다고 가정하지 않는다.

조회는 workspace/권한 필터·NULL·join 중복·projection·정렬·count·cursor 동점 키를 비교한다.
쓰기는 원자성·잠금·flush·rollback·암호화·이력·멱등성을 비교한다.
서비스를 분리할 때 Spring proxy/self-invocation과 tenant 문맥을 확인한다. 저장·격리 변경은 관련 DB 통합 테스트도 고른다.

## 5. React·TypeScript / Python·LangChain·LangGraph

| 경로 | 실행 기준 |
|---|---|
| React·TypeScript | 컴포넌트는 표시·입력, hook은 해당 상태·수명, feature의 lib는 순수 업무 판단을 맡는다. API 계약 타입과 view model을 구별한다. 새로운 공유 함수는 `features` 의존을 `shared`로 가져오지 않는다 |
| React 리팩터링 | effect·구독 해제·query key·캐시 무효화·비동기 경쟁을 보존한다. memo·callback 추가는 렌더링 측정이나 참조 계약 근거가 있을 때 한다 |
| Python·FastAPI | API에서 외부 입력을 기존 schema로 검증한다. domain 판단, application 실행 순서, provider/infra SDK·전송의 위치를 따른다. dict/Any·동적 getattr가 계약을 숨기면 실제 타입을 드러낸다 |
| LangChain | 실제 호출 경로의 프롬프트 조립·모델 호출·출력 검증·저장 책임을 구분한다. 단순 결정적 변환에 chain/agent를 새로 강제하지 않는다. 기존 모델 선택·라우팅·재시도 총 상한을 유지한다 |
| LangGraph | 코드에 StateGraph/node/edge 사용이 있을 때만 적용한다. node의 부분 state 반환·reducer·분기·종료·반복 상한·checkpoint 재개와 부작용의 멱등성을 보존한다. 파일명 `graph`나 의존성 등록만으로 그래프를 도입하지 않는다 |

LLM 호출은 기존 정책·provider 경로를 지난다. 모델 선택 기준(설정·데이터 등급 등)은 그 단위 문서가 정한 것을 따른다.
알 수 없는 등급은 fail-closed로 처리하며, 외부 호출·fallback을 최적화라는 이유로 열지 않는다.
모델 fake의 호출 횟수·오류·출력 순서 테스트와 실제 모델 품질 평가를 구별한다.
사용하는 라이브러리 API를 바꿀 때 manifest·lock의 버전과 공식 문서를 확인한다.

## 6. Swagger·OpenAPI·문서

API 문서는 만든 단위가 소유한다. 기존 OpenAPI 생성 경로·스냅숏 파일·소비 단위의 생성 방식을 유지한다.
문서 테스트의 기준 스냅숏을 지우거나 오류를 숨겨서 통과시키지 않는다.

| API operation에 쓰는 것 | 확인하는 것 |
|---|---|
| `operationId`·summary·description | 작업을 구별하는 ID, 실제 동작·권한·부작용. 기존 operationId 변경은 소비 코드 호환성을 확인 |
| request/response | 각 필드의 의미·필수 여부·형식·enum·길이·단위·예시, 실제 validation 일치 |
| 인증·권한·오류 | 보안 scheme, scope/소유 권한, 성공·401/403·validation·업무 오류 상태와 envelope. 주체 주입 파라미터는 공개 입력에서 제외 |
| 목록·페이지 | filter·정렬·cursor/page·limit·hasNext·빈 목록·최대값, enum과 ID 형식의 안전한 예시 |
| SDD와 흐름 | 한 이슈의 operation별 request→권한→업무 판단→조회/저장→response와 실패 경로. table/query·cache·외부 연동은 변경이 있는 곳을 기록 |

Spring은 단위의 `*Api`/DTO 문서 어노테이션, FastAPI는 기존 schema/route 메타를 사용한다.
계약 테스트로 실제 생성 문서를 확인하고 canonical snapshot을 정해진 명령으로 갱신한다.
소비하는 웹/셸/서비스의 타입 생성과 호환 테스트를 같은 변경 범위에 포함한다.
계약 생성 파일을 수작업으로 고치지 않는다. 문서 영향이 없으면 변경 요약에 그 근거를 적는다.

## 7. 테스트와 작업 순서

| 작업 | 1. 범위 | 2. 기대 결과 | 3. 구현 | 4. 검증·리뷰 |
|---|---|---|---|---|
| 신규 코드·버그 수정 | 이슈·소유 파일·기존 구현·패키지 위치 | 실패하는 결과 테스트 RED | 최소 구현 GREEN, 필요할 때 책임 분리 | 변경 단위 테스트와 관련 계약 테스트·문서 diff |
| 동작 보존 리팩터링 | 현재 입출력·부작용·공개 계약·옮길 책임 | 현재 동작을 잡는 characterization 테스트, 버그라면 재현 RED | 작은 책임 이동·이름 변경, 테스트 반복 | 이전 결과·호출 순서·진리표·트랜잭션 비교 |
| 리뷰 | 배정 diff·단위 규칙·확인한 테스트 | 독립 실패 경로·이름·책임·문서 누락 | 수정할 파일과 근거 제시, 소유권 없는 파일은 수정하지 않음 | 실행한 검증/미검증과 잔여 위험 보고 |

BDD는 `Given` 입력·상태, `When` 실제 동작, `Then` 반환값·상태·부작용을 단언하는 방식으로 쓴다.
테스트 이름만 BDD로 바꾸거나 mock 호출을 그대로 복제하는 테스트로 기대 결과를 대체하지 않는다.

먼저 변경한 함수·클래스의 단위 테스트를 선택한다. SQL·인증·외부 계약·상태 저장을 바꾸면 인접 경계 테스트도 포함한다.
테스트 선택은 단위 manifest·runner의 실제 selector로 하고 명령·선택 이유·통과/실패 수를 남긴다.
전체 검증(full)은 CI가 돈다. hook/fast/changed/affected 통과를 full 통과로 쓰지 않는다.
동시에 실행 중인 다른 세션의 Gradle·모델·DB 작업은 [session-collaboration](./session-collaboration.md)의 협업 기록을 확인한 뒤 조율한다.
일괄 test·format·code generation으로 배정 밖 파일을 바꾸지 않는다.

각 하네스 루트의 선택 게이트로 실행 계획과 실제 테스트를 확인한다.

```bash
bash scripts/verify.sh --files <변경-상대-파일> --tests <관련-상대-테스트-파일> --plan
bash scripts/verify.sh --files <변경-상대-파일> --tests <관련-상대-테스트-파일>
bash scripts/verify.sh --affected
```

마지막 명령은 MR 전에 실행한다(바꾼 모듈과 그 모듈을 쓰는 모듈). 기본 `bash scripts/verify.sh`는 changed 선택 경로다.
선택할 테스트가 불명확하면 테스트 경로를 지정하거나 미검증으로 보고한다. 빠진 테스트를 통과로 쓰지 않는다.
`HARNESS_VERIFY_LEVEL=fast`는 구조·정적 검증이다. 전체 검증(full)은 CI가 돌고, 에이전트 세션에서는 훅이 막는다.

## 8. 선택 파일 경고 검사

각 하네스 루트에서 명시한 상대 파일만 검사한다.

```bash
python3 scripts/check-maintenance.py --files src/changed_policy.py src/changed_component.tsx
python3 scripts/check-maintenance.py --json --files src/changed_policy.py
```

| 코드 | 범위 |
|---|---|
| CM001 | Python AST의 한 조건식에 and/or 혼합. Kotlin·TypeScript·JavaScript의 if/while 괄호 안 &&/|| 혼합은 문자열 기반 후보 |
| CM002 | Python 함수 안의 모호한 지역 binding. Kotlin·TypeScript·JavaScript의 val/var/const/let binding은 문자열 기반 후보 |
| CM003 | 파일 읽기·Python AST 분석 실패. 그 파일은 의미를 확인하지 못했음 |

문서·테스트·fixture·일반 생성물 경로와 지원하지 않는 확장자는 제외한다. 저장소 전체를 탐색하지 않는다.
Python 매개변수·모델 필드·wire key는 강제 이름 변경 대상으로 삼지 않는다.
Kotlin·TypeScript 분석은 언어 parser가 아니다. 주석·문자열을 제외하지만 property scope·모든 문법을 판정하지 못한다.
정확한 의미 판정은 리뷰에서 한다. warning은 exit 0이며 baseline의 기존 위반을 차단하지 않는다.
선택 누락·없는 파일·디렉터리·상위 경로·루트 밖 symlink는 exit 2로 거부한다.
경고를 근거로 자동 predicate 추출·이름 변경을 하지 않는다. 이 검사는 단위 lint·타입·구조 검사를 대체하지 않는다.

