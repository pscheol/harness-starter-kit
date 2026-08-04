<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{FEATURE_NAME}}·{{EPIC_ID}}·{{SERVICE_NAME}}·{{DOMAIN_EXAMPLE}} 치환 후 사용 -->

# Requirements — {{FEATURE_NAME}}

| 항목 | 값 |
|---|---|
| 상태 | draft \| in-review \| approved |
| SDD 단계 | requirements |
| 출처 | {{EPIC_ID}} / PRD §, 백로그 Story ID |
| 우선순위 | P0 \| P1 \| P2 |
| 담당 모듈 | {{SERVICE_NAME}} <!-- 바운디드 컨텍스트를 적는다(예: project \| auth \| storage). 모듈 표기는 스택 규약(`.agents/rules/structure.md`)을 따른다. --> |
| 연계 | ../design/{{FEATURE_NAME}}.md, ../tasks/active/{{FEATURE_NAME}}.md |

> 작성 가이드: requirements는 "무엇을/왜"만 다룬다. "어떻게"(기술 선택·구조)는 design에서.
> 각 수용 기준은 테스트 가능해야 하며 EARS 형식을 따른다.

> **[NEEDS CLARIFICATION] 규약 (필수):** 미확정 항목은 **추측·창작 금지**. 대신 해당 위치에
> `[NEEDS CLARIFICATION: 구체 질문]` 마커를 남긴다. **최대 3개**, 우선순위 `scope > 보안/프라이버시 > UX > 기술`.
> 그 외 사소한 미확정은 **합리적 기본값**으로 진행하되 §8 가정(Assumptions)에 반드시 기록한다.
> (`.agents/rules/guardrails.md` "추측 금지"와 동일한 규율.)

## 1. Introduction

- **문제**: (현재 어떤 문제가 있는가)
- **목표**: (이 기능이 달성할 결과)
- **핵심 흐름에서의 위치**: (전체 흐름 중 어디)
- **성공 지표 요약**: (측정 가능한 대표 지표 — 상세는 §6 Success Criteria)

## 2. 범위

- **In scope**: (이번에 다루는 것)
- **Out of scope**: (명시적으로 제외 — 후속 EPIC/Phase 링크)

## 3. Actors / Personas

<!-- [STACK 예시] 인증 수단(JWT·API Key 등)은 프로젝트에 맞게 치환한다. -->
| 액터 | 설명 | 인증 |
|---|---|---|
| (예) 콘솔 사용자 | 운영 콘솔 사용자 | JWT |
| (예) 연동 클라이언트 | 서버 간 호출 | API Key |

## 4. Glossary

- 용어: 정의 (도메인 용어·상태 enum은 프로젝트 도메인 데이터 규약 정본과 일치)

## 5. User Scenarios & Requirements *(필수)*

> 요구사항은 **우선순위(P1/P2/P3)로 슬라이싱한 User Story** 단위로 쓴다. P1이 가장 중요.
> 각 스토리는 **독립적으로 개발·테스트·시연 가능**해야 하고, **하나만 구현해도 사용자에게 가치를 주는 단위**여야 한다.
> 수용 기준은 테스트 가능한 EARS(`WHEN/IF/WHERE/WHILE … THE 시스템 SHALL …`)로 쓴다(필요 시 Given/When/Then 병용).
> **추적 ID**: 스토리 = `US1`, `US2`… / 수용 기준 = `R1.1`, `R1.2`… (design·tasks에서 이 ID로 역참조).

### User Story 1 — <제목>  (우선순위: P1, 추적: PRD-XXX-001 / <백로그 ID>)

**User Story:** As a <역할>, I want <기능>, so that <가치>.

**왜 이 우선순위:** (이 스토리가 주는 가치와 P1인 이유 — 없으면 제품이 성립하지 않는가?)

**독립 테스트 기준:** (이 스토리만 구현해도 어떻게 단독 검증·시연 가능한지 — 예: "…를 하면 …가 되어 사용자에게 …가치를 준다")

#### Acceptance Criteria (EARS)

1. **R1.1** — WHEN <이벤트> THEN THE <시스템> SHALL <검증 가능한 동작>.
2. **R1.2** — IF <조건/예외> THEN THE <시스템> SHALL <동작>.
3. **R1.3** — WHERE <상황/위치> THE <시스템> SHALL <동작>.
4. **R1.4** — WHILE <상태 지속> THE <시스템> SHALL <동작>.
   - (병용 예) **Given** <초기 상태>, **When** <행동>, **Then** <기대 결과>.

**비고/예시:** (요청·응답 예시, 경계값, 데이터 예시 등 구현자가 알아야 할 구체 정보)

### User Story 2 — <제목>  (우선순위: P2, 추적: )

**User Story:** As a ..., I want ..., so that ...

**왜 이 우선순위:** ...

**독립 테스트 기준:** ...

#### Acceptance Criteria (EARS)

1. **R2.1** — ...

### Edge Cases (경계 · 예외)

> 우선순위 스토리를 가로지르는 경계·오류 시나리오. 여기서 나온 항목은 위 스토리의 EARS 기준으로 승격한다.

- <경계 조건>일 때 시스템은 어떻게 동작하는가?
- <오류/실패 시나리오>를 시스템은 어떻게 처리하는가?

## 6. Success Criteria *(필수 · 측정가능 · 기술중립)*

> 결과를 **측정 가능**하게, **기술 중립**으로 적는다. 프레임워크·DB·언어·API 이름 **금지**(그건 design에서).
> "빠르다/안정적이다" 같은 형용사 대신 숫자·비율·시간으로.

- **SC-001**: (예: "사용자가 체크아웃을 3분 이내에 완료한다")
- **SC-002**: (예: "동시 사용자 1만 명에서 응답 저하 없이 처리한다")
- **SC-003**: (예: "주요 작업 첫 시도 성공률 90% 이상")
- **SC-004**: (예: "관련 문의(support ticket) 50% 감소")

## 7. Non-Functional Requirements

<!-- [STACK 예시] 기준/근거 열은 프로젝트 규약·NFR 문서로 치환한다. -->
| 분류 | 요구 | 기준/근거 |
|---|---|---|
| 보안 | 권한 없는 접근 차단(401/403), secret 평문 금지 | 보안 규약 |
| 성능 | (예: 1차 응답 5초 이내) | PRD NFR |
| 안정성 | 타임아웃·재시도·멱등성 | RELIABILITY.md |
| 관측성 | 주요 동작 로그·audit | NFR-OPS |
| API | 공통 envelope·error code | API 표준 |

## 8. 제약 / 가정 (Constraints & Assumptions)

- 제약: (기술/규약상 반드시 지켜야 하는 것)
- 가정: (참이라고 전제하는 것 — 틀리면 재검토). **미확정을 기본값으로 진행한 경우 여기에 근거와 함께 기록.**

## 9. 의존성 (Dependencies)

- 선행 스펙/EPIC: (예: {{DOMAIN_EXAMPLE}} 기반 스펙)
- 외부 시스템: <!-- [STACK 예시] 인증 서버·벡터 DB·오브젝트 스토리지 등 -->

## 10. Open Questions

- [ ] (확정 필요한 미해결 질문 — 추측 금지. 본문에 `[NEEDS CLARIFICATION: …]`로 남긴 항목을 여기 모아 추적한다.)

## 11. 승인 체크리스트

- [ ] User Story가 **우선순위(P1/P2/P3)** 로 슬라이싱되고, 각 스토리에 **왜 이 우선순위**·**독립 테스트** 기준이 있는가
- [ ] 모든 수용 기준이 테스트 가능한 EARS(추적 ID `R#.#`)인가
- [ ] Success Criteria가 **측정가능·기술중립**(프레임워크·DB 미언급)인가
- [ ] In/Out scope가 명확한가
- [ ] 추적(PRD/백로그) 링크가 있는가
- [ ] NFR(보안 포함)이 빠짐없는가
- [ ] `[NEEDS CLARIFICATION]`이 **3개 이하**이고, 미해소분은 Open Questions로 추적 또는 design으로 위임되었는가
