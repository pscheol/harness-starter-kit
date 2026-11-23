<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{FEATURE_NAME}}·{{DOMAIN_EXAMPLE}} 치환 후 사용 -->

# Checklist — {{FEATURE_NAME}} · <도메인>

| 항목 | 값 |
|---|---|
| 대상 스펙 | `../requirements/{{FEATURE_NAME}}.md` (필요 시 `../design/{{FEATURE_NAME}}.md`) |
| 도메인 초점 | <예: requirements-quality \| security \| ux \| api \| data \| a11y> |
| 상태 | draft \| in-review \| approved |
| 생성 | `/hx-checklist <도메인>` (원본: `.agents/rules/sdd-workflow.md` /checklist 절) |

> 이 체크리스트는 "요구사항의 유닛테스트"다. 코드가 아니라 **스펙 문장 자체의 품질**을 검사한다.
> "기능이 동작하는가"가 아니라 "요구사항이 **완결·명료·일관·측정가능·커버**되게 쓰였는가"를 묻는다.
> 각 항목은 스펙을 읽고 **PASS / FAIL / N/A** 로 판정하고, FAIL은 근거(어느 줄·왜)와 조치(어느 명령으로 보완)를 적는다.
>
> **작성 규율(추측 금지):** 판정 근거는 스펙 본문에서 인용한다. 확인 불가한 항목은 지어내지 말고
> `[NEEDS CLARIFICATION: 질문]` 으로 남기고 `/hx-clarify` 로 되돌린다(`.agents/rules/guardrails.md`).

## 사용법

- 이 템플릿을 도메인별로 복제해 쓴다: `checklists/{{FEATURE_NAME}}-<도메인>.md` (예: `order-security.md`).
- 아래는 **requirements-quality**(기본) 항목이다. `/hx-checklist security` 등 도메인 초점이 주어지면
  해당 도메인 관점의 항목을 **추가로 생성**해 붙인다(기본 5축은 항상 유지).
- 판정 표기: `[x]` PASS · `[ ]` FAIL(미충족) · `[-]` N/A. 각 항목 ID `CHK-###`.

---

## 1. 완결성 (Completeness) — 빠진 것이 없는가

- [ ] CHK-001 모든 User Story에 우선순위(P1/P2/P3) 와 "왜 이 우선순위" 가 있는가.
- [ ] CHK-002 각 User Story에 독립 테스트 기준 — 단독 검증·시연 방법 — 이 있는가.
- [ ] **CHK-003** 각 User Story에 최소 1개의 Acceptance Criteria(EARS `R#.#`) 가 있는가.
- [ ] **CHK-004** Success Criteria(`SC-###`) 가 존재하고 결과(성과)를 다루는가(구현 단계가 아니라).
- [ ] CHK-005 Non-Functional(보안·성능·안정성·관측성·API)이 빠짐없이 명시됐는가.
- [ ] CHK-006 Edge Case / 오류·실패 시나리오 가 식별됐는가(정상 경로만 있지 않은가).
- [ ] CHK-007 In scope / Out of scope 경계가 명시됐는가.
- [ ] CHK-008 제약·가정·의존성이 기록됐는가(기본값으로 진행한 미확정은 Assumptions에 있는가).

## 2. 명료성 (Clarity) — 한 가지로만 읽히는가

- [ ] CHK-101 측정 불가한 형용사(빠른·쉬운·안정적·직관적·충분히·적절히)가 정량 표현으로 대체됐는가.
- [ ] CHK-102 각 수용 기준이 한 가지 검증 가능한 동작만 말하는가(and/or로 여러 요구를 뭉치지 않았는가).
- [ ] CHK-103 대명사·"그것/해당"이 가리키는 대상이 모호하지 않은가.
- [ ] CHK-104 미확정이 추측·창작 없이 `[NEEDS CLARIFICATION]` 로 남겨졌는가(3개 이하).
- [ ] **CHK-105** 요구사항에 구현 세부(프레임워크·DB·클래스·API 이름) 가 새어들지 않았는가(그건 design).

## 3. 일관성 (Consistency) — 서로 충돌하지 않는가

- [ ] CHK-201 같은 개념이 한 용어로 쓰였는가(Glossary와 본문 용어 드리프트 없음).
- [ ] CHK-202 서로 모순되는 요구가 없는가(한쪽은 허용, 다른 쪽은 금지).
- [ ] CHK-203 상태·enum·식별자 명칭이 도메인 규약 원본과 일치하는가.
- [ ] **CHK-204** 요구사항이 **헌법(`.agents/rules/*` — 보안·API·구조·신뢰성)** 과 충돌하지 않는가.
- [ ] **CHK-205** 우선순위(P1>P2>P3)가 product.md 우선순위/KPI 와 어긋나지 않는가.

## 4. 측정가능성 (Measurability) — 검증할 수 있는가

- [ ] CHK-301 각 `SC-###` 에 숫자·비율·시간·임계값 이 있는가(예: "3분 이내", "성공률 90%↑").
- [ ] CHK-302 Success Criteria가 기술 중립인가(프레임워크·DB·언어·API 이름 미언급).
- [ ] CHK-303 각 수용 기준이 통과/실패를 판정할 관찰 가능한 결과를 명시하는가.
- [ ] CHK-304 성능/용량 요구에 측정 조건(부하·동시성·데이터량)이 붙어 있는가.

## 5. 커버리지 (Coverage) — 추적이 이어지는가

- [ ] CHK-401 모든 User Story가 출처(PRD/EPIC/백로그 ID) 로 역추적되는가.
- [ ] **CHK-402** 각 수용 기준 `R#.#` 에 대응하는 Success Criteria 또는 검증 수단이 있는가.
- [ ] CHK-403 (design 존재 시) 모든 `R#.#` 가 design의 요구사항 추적 매트릭스에 나타나는가.
- [ ] CHK-404 (tasks 존재 시) 각 User Story에 최소 1개 작업(`[US#]`) 이 매핑되는가(작업 없는 요구 없음).
- [ ] CHK-405 요구 없는 작업/설계(스펙에 근거 없는 결과물)가 없는가.

---

## 6. 도메인 추가 항목 *(선택 · `/hx-checklist <도메인>` 이 채운다)*

> 도메인 초점이 주어지면 기본 5축 위에 아래를 **추가**한다. 예시 씨앗(프로젝트에 맞게 교체):

- **security**: 리소스 접근 권한 판정 기준이 명시됐는가 · secret 취급 규칙 · 인증/인가 경계 · 감사 대상.
- **api**: 공통 envelope·error code 언급 없이 행동만 기술됐는가(계약은 design) · 하위호환/버전 정책.
- **data**: 보존/삭제·PII 분류·정합성(멱등·중복) 요구가 있는가.
- **ux / a11y**: 키보드·포커스·대비·reduced-motion 등 접근성 수용 기준이 있는가.

## 7. 판정 요약

| 축 | PASS | FAIL | N/A | 비고 |
|---|---:|---:|---:|---|
| 완결성 |  |  |  |  |
| 명료성 |  |  |  |  |
| 일관성 |  |  |  |  |
| 측정가능성 |  |  |  |  |
| 커버리지 |  |  |  |  |
| 도메인 |  |  |  |  |

**결론:** ☐ 통과(모든 FAIL 해소) / ◐ 조건부(경미 FAIL 잔존·근거 명시) / ✖ 보류(핵심 FAIL — `/hx-clarify`·`/hx-specify`로 보완 후 재검).

> 체크리스트는 **읽기 전용 판정**이다. 스펙을 고치려면 `/hx-clarify`(모호성) 또는 `/hx-specify`(요구 보완)로 되돌린 뒤 재실행한다.
> requirements↔design↔tasks **교차 정합성**(커버리지 갭·모순·헌법 충돌)은 `/hx-analyze` 가 담당한다(역할 분담).
