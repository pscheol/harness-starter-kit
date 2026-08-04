# 03. SDD 워크플로 — 명령·산출 위치·게이트·강제 장치

SDD(Spec-Driven Development)의 명제는 "스펙이 정본, 코드는 산출물"이다. 워크플로 정본은
`.agents/rules/sdd-workflow.md` 한 곳이며, Claude 슬래시 명령·Codex·Kiro는 이 정본을 참조하는
얇은 트리거다("1곳 + N트리거").

## 1. 명령 체인

정본이 규정하는 흐름:

```text
specify → clarify → checklist → plan → tasks → analyze → implement
                                                        (구현 후) → converge
```

| 명령 | 단계 | 하는 일 | 특성 |
|---|---|---|---|
| `/hx-specify` | 1. 요구사항 | `requirements/<feature>.md`를 무엇/왜로 채움(우선순위 User Story·측정가능 SC·`[NEEDS CLARIFICATION]`≤3) | `new-feature.sh`로 스캐폴딩, 자체검증 후 `in-review`→승인 |
| `/hx-clarify` | 보조 | 모호성을 한 번에 하나씩 최대 5개 질문으로 해소, `## Clarifications`에 반영 | 스펙 즉시 갱신 |
| `/hx-checklist` | 품질 게이트 | 요구사항 문장 자체의 "유닛테스트"(5축)로 PASS/FAIL 판정 | **읽기 전용**(스펙 미수정). "한 문서 품질" |
| `/hx-plan` | 2. 설계 | `design/<feature>.md` 채우고 **Constitution Check 게이트** 통과 | 전제=requirements 승인. 위반은 Complexity Tracking에 정당화 |
| `/hx-tasks` | 3. 작업 | design을 실행가능 `tasks/active/<feature>.md`로 분해 | 전제=design 승인. `T001 [P] [US1]` 포맷 |
| `/hx-analyze` | 검사 | requirements·design·tasks 3문서의 정합성·커버리지·규칙 충돌 리포트 | **읽기 전용**(파일 미수정). "세 문서 간 정합성" |
| `/hx-implement` | 4. 구현 | tasks를 Phase 순서로 실행, 변경마다 verify.sh 검증 | 전제=tasks 승인. 완료 게이트(active→check→승인→completed) |
| `/hx-converge` | 회수 | 구현 후 잔여·후속 작업을 tasks에 append-only(`## Phase N: Convergence`)로 되살림 | **append-only**(이력 재작성 금지). 근거=check-spec-freshness.sh |

모든 SDD 명령은 얇은 트리거다 — 명령 파일에 절차 본문이 없고, 전부 `sdd-workflow.md`의 해당 절을
로드해 수행한다. 별도로 `/hx-harness` 명령이 있는데, 이건 SDD가 아니라 작업 시작 시 하네스 컨텍스트
(`AGENTS.md`·규칙 정본·docs·`ARCHITECTURE.md`·core-beliefs)를 로드하는 용도다.

**역할 분담**: `/hx-checklist`는 한 문서(요구사항)의 품질, `/hx-analyze`는 세 문서 간 정합성.
둘 다 읽기 전용이고, `/hx-converge`는 append-only다 — 파괴적 편집을 하는 SDD 명령은 없다(구현은 코드
편집이고 스펙은 승인 흐름을 거친다).

## 2. 산출 위치 (`.agents/docs/`)

SDD는 **제품(바운디드 컨텍스트) 단위 묶음** `product-<slug>-specs/`로 관리된다.
템플릿은 제품 폴더 밖 `_spec-templates/` **한 곳**에만 두고, 제품 폴더에는 복사하지 않는다
(제품이 늘어도 템플릿 사본이 늘지 않는다).

```text
.agents/docs/
├── README.md                     # 기록 시스템(SSOT) 자기서술
├── specs-index.md                # 전 제품 스펙 색인(최상위 진입점)
├── _spec-templates/              # ★ SDD 단계 템플릿 정본 한 벌 — 설치 산출물(제품 아님)
│   ├── README.md                 #   이 폴더가 복사 원본임을 명시
│   ├── index.md                  #   제품 색인 템플릿({{PRODUCT_SLUG}} 미치환 상태로 보관)
│   ├── requirements/_template.md
│   ├── checklists/_template.md
│   ├── design/_template.md
│   └── tasks/{_template.md, README.md}
├── product-<slug>-specs/         # 제품 단위 SDD 묶음 (복수 가능)
│                                 # ★ 설치가 아니라 new-feature.sh 가 첫 기능에서 만든다
│   ├── index.md                  #   이 제품의 feature 등록표
│   ├── requirements/             #   <feature>.md                     (/specify·/clarify)
│   ├── checklists/               #   <feature>-<도메인>.md             (/checklist)
│   ├── design/                   #   <feature>.md                     (/plan)
│   └── tasks/                    #   README.md
│       ├── active/               #     진행 중                        (/tasks·/implement)
│       ├── check/                #     검증 완료·사용자 확인 대기
│       └── completed/            #     사용자 승인 완료(이력 보존)
├── decisions/                    # 전역 ADR + core-beliefs (기능·제품 횡단)
├── tech-debt-tracker.md          # 전역 기술 부채 추적기
├── generated/                    # 에이전트 생성물(손편집 금지, 코드/스키마에서 재생성)
└── references/                   # 압축 참고자료(*-llms.txt)
```

- 세 단계는 **같은 `<feature>` 파일명**으로 상호 추적한다(예: `requirements/order.md ↔ design/order.md ↔ tasks/active/order.md`).
- 전역 결정은 `decisions/`(상태 `제안|채택|폐기`, 폐기해도 삭제 금지·상태만 변경). 기능별 설계는 `product-*/design/`.
- `generated/`는 코드/마이그레이션이 정본이고 손편집 금지, CI drift 검사 대상.

## 3. 완료 게이트 (`active → check → confirm → completed`)

작업 생애주기는 폴더 이동으로 표현되고 상태값이 이를 따른다.

1. **active** — 진행 중.
2. **check** — DoD와 `verify.sh`를 충족하면 에이전트가 `check/`로 이동 + 상태 변경 + 근거 기록 + 사용자에게 검증 요청.
3. **completed** — **사용자의 명시적 승인(confirm) 뒤에만** 에이전트가 `completed/`로 이동.

핵심: "verify.sh 통과는 완료의 필요조건일 뿐 충분조건이 아니다 — 최종 승인은 사람." 에이전트가
승인 없이 `check → completed`로 전환하는 것은 금지(자동완료 금지)다.

이 게이트를 규정하는 문서는 세 곳이 일치한다: 제품 `index.md`, `tasks/_template.md`(완료 처리 섹션),
`tasks/README.md`(생애주기 섹션). 기계적 강제는 `scripts/check-exec-plan-status.sh`가 위치↔상태
일관성을 검사하는 것으로 보완한다(자세히는 [04-enforcement.md](04-enforcement.md)).

## 4. SDD 스크립트

| 스크립트 | 역할 |
|---|---|
| `new-feature.sh <slug> <feature>` | `_spec-templates/`의 `_template.md`를 복사해 제품 폴더에 `<feature>.md` 3종 생성(requirements·design·tasks/active). 제품 폴더가 없으면 골격(`index.md`·`tasks/README.md`·빈 하위폴더)까지 생성하며 이때 `{{PRODUCT_SLUG}}`를 치환한다. **템플릿 자체는 제품 폴더에 복사하지 않는다.** 기존 파일 미덮어씀 |
| `check-sdd-prerequisites.sh <slug> <feature> [--stage design\|tasks\|implement]` | 단계별 선행 산출물(design=requirements, tasks=+design, implement=+tasks) 존재 확인 |
| `check-exec-plan-status.sh` | 제품별 `tasks/{active,check,completed}/` 순회, 첫 상태 라인과 폴더 일치 강제 |
| `check-spec-freshness.sh` | 정체 draft/in-review·미해결 `[NEEDS CLARIFICATION:]`·정체 active tasks 리포트. **게이트 아님·항상 exit 0**. `/hx-converge` 근거 |
| `verify.sh` | 단일 강제 게이트([04-enforcement.md](04-enforcement.md) 참조) |

명령(LLM 프롬프트)과 스크립트(결정론 셋업)를 분리한다 — 경로·스캐폴딩은 스크립트가, 내용 생성은
에이전트가 한다.

## 5. 템플릿 강제 장치 (각인 마커)

SDD 품질은 템플릿에 직접 각인된 마커로 강제된다. 템플릿은 서식이 아니라 **에이전트를 제약하는
프롬프트**다.

### 5.1 requirements/_template.md

- **[NEEDS CLARIFICATION] 규약**: 미확정은 추측·창작 금지, `[NEEDS CLARIFICATION: 구체 질문]` 마커. **최대 3개**, 우선순위 `scope > 보안/프라이버시 > UX > 기술`. 그 외 사소 미확정은 합리적 기본값 + Assumptions 기록.
- **§5 우선순위 User Story**: `P1/P2/P3`로 슬라이싱, P1이 가장 중요. 각 스토리는 독립 개발·테스트·시연 가능하고 **하나만 구현해도 사용자 가치를 준다**. 추적 ID = `US1`,`US2`…, 수용 기준 = EARS(`WHEN/IF/WHERE/WHILE … SHALL …`) `R1.1`,`R1.2`….
- **§6 Success Criteria**: `SC-001`… 측정가능·기술중립(프레임워크·DB·언어 이름 금지, 형용사 대신 숫자·비율·시간).

### 5.2 design/_template.md (17개 섹션)

- **§3 Constitution Check 게이트**(체크박스): 추측 금지·경계 파싱(guardrails) / 보안·접근 제어(security) / 레이어 단방향 의존(structure) / API 표준(api-standards) / 안정성(reliability) / (프로젝트별 추가). 헌법은 `.agents/rules/*` + `decisions/core-beliefs.md`. 위반 불가피 시 §3.1에 정당화 없으면 진행 금지.
- **§3.1 Complexity Tracking**: (위반 / 왜 필요한가 / 기각한 더 단순한 대안) 표.
- **§11.1 Quickstart**: end-to-end 검증 시나리오(선행·실행·기대 결과). tasks Polish와 `/hx-analyze`가 참조.
- **§14 Research & Decisions**: 결정 로그 + 대안 비교(ADR).
- 선행 조건: requirements에 미해결 `[NEEDS CLARIFICATION]`이 있으면 설계 시작 금지, `/hx-clarify`로 복귀. §16 요구사항 추적 매트릭스가 `R#.#`을 설계 요소로 매핑.

### 5.3 checklists/_template.md — CHK-### 5축

"요구사항의 유닛테스트". 코드가 아니라 스펙 문장의 품질을 검사한다. 판정 `PASS`(`[x]`)·`FAIL`(`[ ]`)·`N/A`(`[-]`).

| 축 | 번호대 | 검사 |
|---|---|---|
| 완결성 | CHK-001~008 | 우선순위+"왜", 독립 테스트 기준, EARS `R#.#`, `SC-###`, NFR, Edge/오류, scope, 제약·가정 |
| 명료성 | CHK-101~105 | 측정불가 형용사 정량화, 한 수용기준=한 동작, 대명사 모호성, `[NEEDS CLARIFICATION]≤3`, 구현 세부 누출 금지 |
| 일관성 | CHK-201~205 | 한 용어, 모순 없음, 도메인 규약 일치, 헌법 충돌 없음, 우선순위 product.md/KPI 일치 |
| 측정가능성 | CHK-301~304 | `SC-###` 숫자·비율·시간, SC 기술중립, 관찰가능 결과, 성능·용량 측정 조건 |
| 커버리지 | CHK-401~405 | 스토리 출처 역추적, `R#.#`↔SC/검증수단, 추적 매트릭스, 각 스토리 최소1개 `[US#]` 작업, 요구 없는 작업 없음 |

### 5.4 tasks/_template.md

- **작업 포맷**: `- [ ] T001 [P] [US1] 설명 + 정확한 파일/모듈 경로`. `T###`=전역 유일 순번(완료 시 `[X]`), `[P]`=병렬 가능(다른 파일·무의존일 때만, 같은 파일이면 금지), `[US1]`=소속 User Story.
- **Phase 구조**: Phase 1 Setup → Phase 2 Foundational(모든 스토리 차단 선행) → Phase 3+ User Story별(P1→P2→P3, P1=🎯 핵심) → Phase N Polish. 각 스토리 Phase에 목표·독립 테스트(design §11.1 참조)·Checkpoint.
- **TDD**: 첫 작업이 "테스트 작성(성공+최소1 실패+권한 없는 접근 차단) 구현 전 실패 확인".
- **DoD 체크박스**: `verify.sh` 통과, 성공+최소1 실패, 401/403·권한 없는 접근 차단, `quality-score.md` 충족, API 변경 시 openapi 갱신, Quickstart 통과.

## 6. 결정·부채 기록

- `decisions/` — 전역 ADR(`_template.md`: 맥락·결정·근거·대안·결과) + `core-beliefs.md`(핵심 신념, 상태 채택). 미등록=존재하지 않음.
- `tech-debt-tracker.md` — 전역 기술 부채 표(ID·항목·위치·심각도·상태). 발견 즉시 등록, 해결 시 PR 링크로 closed, 항목 삭제 금지(이력 보존).
