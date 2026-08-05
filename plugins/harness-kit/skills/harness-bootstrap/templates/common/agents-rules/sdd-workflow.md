<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 스택 무관 공통 규칙 · 플레이스홀더({{PROJECT_NAME}}) 치환 후 사용 -->

# SDD 워크플로 원본 (Spec-Driven Development)

이 파일은 {{PROJECT_NAME}} SDD 워크플로의 원본이다. Claude Code 슬래시 명령(`.claude/commands/*`),
Codex, Kiro(`.kiro/steering/sdd-workflow.md`)는 모두 이 원본을 참조하는 **얇은 트리거**다("1곳 + N트리거").

스펙을 기준으로 삼고 코드는 그 결과물로 본다. 기능은 requirements → design → tasks 순으로,
제품(바운디드 컨텍스트) 폴더 안에서 진행한다. 각 단계 문서가 놓이는 위치는 다음과 같다.

| 단계 | 위치 | 명령 |
|---|---|---|
| requirements | `.agents/docs/product-<slug>-specs/requirements/<feature>.md` | `/hx-specify` (+ `/hx-clarify`) |
| (품질 검사) | `.agents/docs/product-<slug>-specs/checklists/<feature>-<도메인>.md` | `/hx-checklist` |
| design | `.agents/docs/product-<slug>-specs/design/<feature>.md` | `/hx-plan` |
| tasks | `.agents/docs/product-<slug>-specs/tasks/active/<feature>.md` | `/hx-tasks` → `/hx-implement` |
| (정합성 검사) | 읽기 전용 리포트 | `/hx-analyze` |

- 세 단계는 **같은 `<feature>` 파일명**을 쓴다. 새 기능/제품 스캐폴딩은 `scripts/new-feature.sh <slug> <feature>`.
- 각 단계는 **사용자 승인 후** 다음으로 넘어간다. 전역 결정은 `.agents/docs/decisions/`.

## 공통 원칙 (모든 단계)

- 추측 금지 (`.agents/rules/guardrails.md`): 확인 후 단정, 미확정은 `[NEEDS CLARIFICATION: 질문]` 마커로 남긴다(지어내지 않는다).
- **문체는 `.agents/rules/writing-style.md`**: 모든 단계 산출물에 적용된다. 작업 과정 서술(`대조 결과`·`~임을 확인했다`)과 공허한 문장을 쓰지 않고, 결과와 사실만 남긴다.
- **경계에서 파싱**: 외부/미확정 값은 추측한 형태로 진행하지 않는다.
- **무엇/왜 vs 어떻게 분리**: requirements는 무엇을·왜(스택·API·코드 금지), design부터 어떻게.
- 검증은 `scripts/verify.sh` 한 곳. 완료는 사용자 승인 게이트(active→check→**confirm**→completed).

---

## /hx-specify — 요구사항 생성

입력: (제품 slug + 기능 설명). 없으면 사용자에게 제품 slug와 한 줄 설명을 묻는다.

1. **기능 short-name 도출**(2~4단어, action-noun). 제품 slug 확인(기존 `product-*-specs` 중 택 또는 신규).
2. **스캐폴딩**: `scripts/new-feature.sh <slug> <feature>` 로 requirements/design/tasks 3종을 `.agents/docs/_spec-templates/` 원본에서 생성하고 제품 `index.md`에 등록. 제품 폴더가 없으면 골격까지 함께 만들어진다(설치가 미리 만들어 두지 않는다). 새 제품이면 `specs-index.md` 등록표에도 행을 추가한다.
3. `requirements/<feature>.md` 를 채운다:
   - User Story(우선순위 P1/P2/P3): 각 스토리는 독립 테스트 가능하고, 하나만 구현해도 사용자에게 가치를 주도록 슬라이싱. "왜 이 우선순위"를 적는다.
   - **수용 기준**: 기존 EARS(`WHEN/IF/WHERE/WHILE ... THE 시스템 SHALL ...`) 유지 + 필요 시 `Given/When/Then` 병용.
   - Success Criteria(측정가능·기술중립): `SC-001…` (예: "체크아웃 3분 이내", "동시 1만 사용자"). 프레임워크·DB 언급 금지.
   - **`[NEEDS CLARIFICATION]`**: 미확정은 마커로. 최대 3개, 우선순위 scope > 보안/프라이버시 > UX > 기술. 나머지는 합리적 기본값 + Assumptions에 기록.
4. **품질 자체검증**: 아래 체크를 모두 통과할 때까지(최대 3회) 보완한다. 미통과 항목은 사용자에게 보고.
   - 구현 세부 없음 / 테스트 가능·무모호 / SC 측정가능·기술중립 / scope 경계 명확 / 의존·가정 명시 / `[NEEDS CLARIFICATION]` 해소.
5. 상태 `draft→in-review`. **사용자 승인** 후 `/hx-clarify` 또는 `/hx-plan`.

## /hx-clarify — 모호성 해소 (선택, plan 전 권장)

1. requirements를 분류축(기능 범위·데이터 모델·UX·비기능·통합·엣지·제약·용어·완료신호)으로 스캔해 모호/누락을 찾는다.
2. 최대 5개 질문을 한 번에 하나씩 묻는다(객관식 2~5안 또는 ≤5단어 단답). 권장안을 먼저 제시한다.
3. 답을 받을 때마다 requirements에 `## Clarifications`(오늘 날짜 세션) 불릿을 추가하고, 관련 섹션(FR·데이터·SC 등)을 즉시 갱신한다.
4. 모호성 소진 또는 사용자 중단 시 종료. 미해소 고영향 항목은 Deferred로 명시.

## /hx-checklist — 요구사항 품질 게이트 (선택, plan 전 권장 · 읽기 전용)

"요구사항의 유닛테스트". 코드가 아니라 **스펙 문장 자체의 품질**을 검사한다("동작하는가"가 아니라 "잘 쓰였는가").
requirements↔design↔tasks **교차** 정합성은 `/hx-checklist`가 아니라 `/hx-analyze`가 본다(역할 분담).

입력: (제품·기능 + 도메인 초점). 도메인 생략 시 `requirements-quality`(기본).

1. 대상 requirements를 읽고, `.agents/docs/_spec-templates/checklists/_template.md` 를 제품 폴더의 `checklists/<feature>-<도메인>.md` 로 복제한다(제품 폴더에 `checklists/` 가 없으면 만든다). 템플릿 자체를 제품 폴더에 복사하지 않는다.
2. 기본 5축을 `CHK-###` 로 PASS / FAIL / N·A 판정한다:
   - **완결성**: 스토리·수용기준·SC·NFR·엣지·scope·제약/가정 누락 없음.
   - **명료성**: 측정 불가 형용사(빠른·쉬운·안정적) 제거, 한 기준=한 동작, 구현 세부 누출 없음, `[NEEDS CLARIFICATION]`≤3.
   - **일관성**: 용어 드리프트·모순 요구·헌법(`.agents/rules/*`) 충돌 없음.
   - **측정가능성**: 각 `SC-###` 숫자·임계값·측정 조건, 기술 중립.
   - **커버리지**: 스토리↔출처, `R#.#`↔SC/검증, (design·tasks 있으면) 추적 매트릭스·`[US#]` 작업 매핑.
3. **판정 규율(추측 금지)**: 근거는 스펙 본문 인용. 확인 불가 항목은 지어내지 말고 `[NEEDS CLARIFICATION: 질문]` 으로 남긴다.
4. 도메인 초점(security·api·data·ux 등)이 주어지면 해당 관점 항목을 **추가**(기본 5축은 유지).
5. 판정 요약 + 결론(통과 / 조건부(경미 FAIL 근거 명시) / 보류(핵심 FAIL)). 스펙은 고치지 않는다 — 보완은 `/hx-clarify`(모호성) 또는 `/hx-specify`(요구 누락)로 되돌린 뒤 재실행.

## /hx-plan — 설계 생성

전제: requirements 승인. 산출: `design/<feature>.md`.

1. requirements와 `.agents/rules/*`(특히 guardrails·security·structure·api-standards·reliability), `ARCHITECTURE.md`를 읽는다.
2. **Constitution Check (게이트)**: 설계가 규칙 원본을 위반하지 않는지 점검. 위반이 불가피하면 design의 "Complexity/대안" 섹션에 정당화를 남긴다(정당화 없으면 진행 금지).
3. design 템플릿을 채운다: 아키텍처·시퀀스, 컴포넌트/인터페이스 시그니처, API(공통 envelope·error code), 데이터 모델(=data-model), 오류·보안·관측성, 테스트 전략 + Quickstart(end-to-end 검증 시나리오), 정확성 속성(PBT), 마이그레이션, 요구사항 추적 매트릭스.
4. 미해결(`NEEDS CLARIFICATION`)이 남으면 **중단**하고 `/hx-clarify`로 되돌린다.
5. 상태 `draft→in-review`. **사용자 승인** 후 `/hx-tasks`.

## /hx-tasks — 작업 생성

전제: design 승인. 산출: `tasks/active/<feature>.md`.

1. requirements의 User Story(P1/P2/P3)와 design(컴포넌트·API·데이터)을 작업으로 변환한다.
2. **작업 포맷(필수)**: `- [ ] T001 [P] [US1] 설명 + 정확한 파일/모듈 경로`.
   - `T###` 실행 순번, `[P]` 병렬 가능(다른 파일·무의존), `[US1]` 스토리 추적(Setup/Foundational/Polish에는 스토리 라벨 없음).
3. **Phase 구조**: Phase 1 Setup → Phase 2 Foundational(모든 스토리 차단 선행) → Phase 3+ User Story별(P 우선순위) → Polish. 각 작업에 충족 요구사항 ID·설계 §를 표기.
4. 의존 그래프·병렬 예시·구현 전략(핵심 우선 / 점진 인도)을 포함. 상태 `active`.
5. **사용자 승인** 후 `/hx-analyze`(선택) 또는 `/hx-implement`.

## /hx-analyze — 정합성 검사 (읽기 전용, 파일 수정 금지)

한 문서의 품질은 `/hx-checklist`가, 세 문서(requirements↔design↔tasks) 사이의 정합성은 `/hx-analyze`가 본다.

1. requirements·design·tasks + `.agents/rules/*`(헌법)를 읽어 내부 모델을 만든다. 각 요구(`R#.#`)·SC(`SC-###`)·설계 컴포넌트·작업(`T### [US#]`)을 ID로 색인한다.
2. **탐지 분류 ↔ 심각도**:

   | 유형 | 무엇을 찾는가 | 기본 심각도 |
   |---|---|---|
   | 헌법 충돌 | requirements/design이 `.agents/rules/*`(보안·API·구조·신뢰성)를 위반 | **CRITICAL** |
   | 커버리지 갭(요구) | `R#.#`/User Story에 대응 작업·설계가 없음 | **CRITICAL**(핵심)/HIGH |
   | 커버리지 갭(역방향) | 스펙 근거 없는 작업·설계(스펙에 근거 없는 결과물) | HIGH |
   | 모순 | 요구↔설계↔작업이 서로 상충 | HIGH |
   | 중복 | 같은 요구/작업이 겹침 | MEDIUM |
   | 모호 | 측정 불가 형용사·미해결 `[NEEDS CLARIFICATION]`·미명세 | MEDIUM |
   | 용어 드리프트 | 같은 개념을 다른 용어로(문서 간 불일치) | LOW/MEDIUM |

3. **읽기 전용 리포트**(파일 수정 금지)로 출력한다. 최소 컬럼:

   | ID | 심각도 | 유형 | 위치(문서·ID) | 발견 | 권고(어느 명령으로 보완) |
   |---|---|---|---|---|---|
   | A-001 | CRITICAL | 헌법 충돌 | design §보안 | secret 평문 저장 설계 | `/hx-plan` 재설계(security.md 준수) |

4. **커버리지 매트릭스 요약**(요구↔설계↔작업 매핑, 갭 강조)과 심각도별 집계를 덧붙인다. 파일은 고치지 않는다 — 수정은 사용자 승인 후 해당 명령(`/hx-specify`·`/hx-clarify`·`/hx-plan`·`/hx-tasks`)으로.

## /hx-implement — 구현

전제: tasks 승인.

1. tasks를 Phase 순서로 실행. 병렬 `[P]`는 함께, 같은 파일은 순차. **TDD 우선**(테스트가 요청된 경우 실패 확인 후 구현).
2. 완료 작업은 `- [X]`로 체크. 변경마다 `scripts/verify.sh`로 검증.
3. **완료 게이트(사용자 승인 필수)**: DoD·verify 충족 시 task 파일을 `tasks/check/`로 옮기고 상태 `check`, 검증 근거를 `결과`에 적고 사용자 검증을 요청. 사용자 승인(confirm) 후에만 `tasks/completed/`로 이동하고 상태 `completed`. (에이전트가 임의로 completed 전환 금지 — 자동완료 대신 harness의 사용자 승인 게이트를 적용.)

## /hx-converge — 잔여 작업 회수 (구현 후 · append-only)

구현·검증 뒤에 남거나 새로 드러난 작업을 기존 tasks에 되살린다. 원칙은 **append-only** — 지난 Phase·작업 이력을
고쳐 쓰지 않고 새 회수 Phase만 덧붙인다(이력 보존). 이 명령은 **작업 목록 복구**지 스펙 수정이 아니다.

1. **근거 수집**: `/hx-analyze` 커버리지 갭·코드리뷰 지적·escaped 버그·requirements의 Deferred 항목, 그리고 `scripts/check-spec-freshness.sh` 리포트(오래된 draft·미해결 `[NEEDS CLARIFICATION]`·정체된 active tasks).
2. **append**: 대상 `tasks/active/<feature>.md` 끝에 `## Phase N: Convergence` 섹션을 추가하고, 잔여 작업을 `- [ ] T### [P] [US#] 설명 + 파일 경로` 포맷으로 이어붙인다. `T###` 순번은 기존 마지막 번호 다음부터 연속. 각 작업에 회수 출처(analyze ID·이슈 링크·마커 위치)를 근거로 표기.
3. **완료 기능의 재개방**: 이미 `completed/`로 옮겨진 기능이면 파일을 `active/`로 되돌리고 상태를 `active`로 바꾼 뒤 회수 Phase를 추가한다(완료 이력은 커밋 히스토리에 남는다).
4. **스펙 결함이면 회수가 아니라 되돌림**: 요구 누락은 `/hx-specify`, 모호는 `/hx-clarify`, 설계 변경은 `/hx-plan`으로. `/hx-converge`는 스펙 문장을 고치지 않는다.
5. **사용자 승인** 후 `/hx-implement`로 회수 Phase를 실행하고 완료 게이트(active→check→confirm→completed)를 다시 탄다.

---

## 명령이 아니어도

명령(슬래시)이 없는 에이전트(Codex 등)도 이 원본의 절차·산출 위치·게이트를 그대로 따른다.
스캐폴딩만 `scripts/new-feature.sh`로 하고 각 단계 파일을 이 문서 기준으로 채운다.
