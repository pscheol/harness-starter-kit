<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{FEATURE_NAME}}·{{SERVICE_NAME}}·{{PACKAGE_NS}} 치환 후 사용 -->

# Design — {{FEATURE_NAME}}

| 항목 | 값 |
|---|---|
| 상태 | draft \| in-review \| approved |
| SDD 단계 | design |
| 담당 모듈 | {{SERVICE_NAME}} <!-- 바운디드 컨텍스트를 적는다(예: order \| auth \| catalog). 모듈 표기는 스택 규약(`.agents/rules/structure.md`)을 따른다. --> |
| 연계 | ../requirements/{{FEATURE_NAME}}.md (req), ../tasks/active/{{FEATURE_NAME}}.md (tasks) |

> 가이드: design은 requirements를 "어떻게" 구현할지 확정한다. 구현자가 추측 없이
> 코딩할 수 있을 만큼 인터페이스·데이터·오류·테스트를 구체화한다.
> 선택한 방식과 **버린 대안의 이유**를 함께 적는다. 문체는 `.agents/rules/writing-style.md`.
> **선행 조건**: requirements에 미해결 `[NEEDS CLARIFICATION]`이 남아 있으면 설계를 시작하지 말고 `/hx-clarify`로 되돌린다.
> 사용자 승인 전에는 `draft` 또는 `in-review`, 승인 후에는 상태를 `approved`로 바꾼다. `approved`만 tasks 생성 게이트를 통과한다.

## 1. Overview

- **요약**: (한두 문단)
- **설계 목표/비목표**: (무엇을 최적화하고 무엇은 안 하는가)
- **요구사항 매핑 요약**: (어떤 Req를 어떤 설계로 충족하는지 한 줄 요약)

## 2. Context & Constraints

- 적용 규약: 규칙 원본 `.agents/rules/`(API 표준·보안·도메인 데이터 등), `ARCHITECTURE.md`
- 레이어: `primary`와 `infra` → `application` → `domain`(안쪽으로만 의존). 컨텍스트 간 참조는 공개 `api`와 `infra/acl`을 경유
- 제약/가정: (requirements에서 이어받은 것 + 설계상 제약)

## 3. Constitution Check *(게이트 · 필수)*

> **게이트**: 아래를 모두 통과해야 이후 설계를 확정한다. 위반이 불가피하면 아래 Complexity Tracking에
> 정당화를 남긴다(정당화 없으면 진행 금지). 헌법 = `.agents/rules/*` 원본
> (특히 guardrails·security·structure·api-standards·reliability) + `.agents/docs/decisions/core-beliefs.md`.

- [ ] **추측 금지·경계 파싱** (guardrails): 미확정을 지어내지 않고, 외부/미확정 값은 경계에서 검증하도록 설계했는가
- [ ] **보안 / 접근 제어** (security): 권한 판정 지점(요청 경계 + 유스케이스)·secret 원문 미반환·입력 검증을 설계에 반영했는가
- [ ] **레이어 단방향 의존** (structure): `domain`·`application`이 `primary`·`infra`를 참조하지 않고, 컨텍스트 간 참조가 공개 `api`와 `infra/acl`을 경유하는가
- [ ] **영속성 경계** (structure, JVM/DB 변경 시): `structure.md`가 정한 스키마·테이블 이름 규칙과 영속성 도구·위치를 지키고, 업무 로직을 DB routine/trigger로 만들지 않는가
- [ ] **API 표준** (api-standards): 공통 envelope·error code·버저닝을 따르는가
- [ ] **안정성** (reliability): 타임아웃·재시도·멱등성을 고려했는가
- [ ] (프로젝트별 추가 헌법 규칙 …)

### 3.1 Complexity Tracking *(위반 정당화 — 위반이 있을 때만)*

> 위 게이트 위반이 있으면 여기에 정당화한다(헥사고날 레이어 추가·추상화 도입 등). 위반이 없으면 "위반 없음".

| 위반 | 왜 필요한가 | 기각한 더 단순한 대안(이유) |
|---|---|---|
| (예: 레이어/추상화 추가) | (현재 이 기능에 필요한 이유) | (왜 기존 구조로 불충분한지) |

## 4. Architecture

### 4.1 컴포넌트 / 데이터 흐름

```mermaid
flowchart LR
  %% 컴포넌트/데이터 흐름. 클라이언트 → 앱 → 저장소(선택: 게이트웨이·프록시 경유)
```

- 흐름 설명: (요청 → 처리 → 저장/응답 경로)
- 동기/비동기 경계: (job·outbox·worker 사용 여부)

### 4.2 시퀀스 다이어그램 (핵심 플로우 — 필수)

> 주요 유스케이스(성공 경로 + 대표 실패/분기)를 sequenceDiagram으로 1개 이상 그린다.
> 인증/권한/트랜잭션 경계 같은 횡단 단계도 화살표로 드러낸다.

```mermaid
sequenceDiagram
  autonumber
  actor C as Client
  participant GW as Gateway
  participant S as Service
  participant DB as DB
  C->>GW: 요청
  GW->>S: 전달(인증 헤더)
  S->>DB: 처리(권한 확인 후 질의)
  DB-->>S: 결과
  S-->>C: 응답(envelope)
```

### 4.3 순서도 (분기 로직 — 필수)

> 권한·상태·입력 검증·실패 분기를 flowchart 로 그린다. 기능 문서 원고 §흐름으로 옮겨진다.

```mermaid
flowchart TD
  A[요청] --> B{권한 있음?}
  B -- 아니오 --> E[403/404]
  B -- 예 --> C[처리]
```

### 4.4 상태 전이 (상태가 있을 때)

> 상태 칸이 있으면 stateDiagram-v2 로 허용 전이만 그린다. 없으면 "상태 없음 — 이유" 한 줄.

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> ACTIVE
```

## 5. Components & Interfaces

> 컴포넌트별로 책임·공개 인터페이스(시그니처)·의존성을 명시한다.

### 5.1 <Component>

- **책임**: ...
- **인터페이스** (언어 시그니처/의사코드):
  <!-- 프로젝트 언어의 포트 표현으로 작성한다. JVM=interface, Python=Protocol/ABC, Go=interface. -->
  ```text
  XxxUseCase (inbound port)
    doSomething(input: InputDto) -> OutputDto        # 실패는 도메인 오류로 표현
  XxxRepository (outbound port)
    save(aggregate: Xxx) -> Xxx
    findByCode(code: XxxCode) -> Xxx | None
  ```
- **의존성**: (Repository, 외부 client 등)
- **에러**: (발생 가능한 도메인 오류 → error code)

## 6. API Design (해당 시)

> API 표준 준수. operation별로 아래 항목을 채운다. 해당하지 않는 항목은 이유를 적는다.

| API operation | 내용 |
|---|---|
| Method / Path / operationId | 기존 계약 ID·summary·권한·부작용 설명 |
| request / response | 필드·필수·nullable·enum·길이·시간/크기 단위·안전한 예제 |
| validation / errors | 실제 입력 검증·401/403·업무 오류 코드·공통 envelope |
| query / storage / cache | 사용하는 query/table·트랜잭션·RLS·캐시·외부 연동 |
| flow | operation마다 정상/실패 sequence·flow. CRUD를 한 흐름에 합치지 않는다 |
| OpenAPI / Swagger | 생성 원본·canonical snapshot·변경 검증·소비 타입/계약 갱신 경로 |

패키지 책임 표에 API·application·domain·adapter·query/repository·mapper의 파일과 의존 방향을 적는다.
변환 코드의 이동과 정책·권한·트랜잭션 변경을 구분한다. 공용화 후보는 입력/실패 정책과 호출부를 기록한다.


### `<METHOD> /api/v1/...`

- 인증: (requirements가 정한 주체와 프로젝트 인증 계약)
- 권한/scope: (role, scope)
- 요청:
  ```json
  { }
  ```
- 응답(성공, 공통 envelope):
  ```json
  { "code": "SUCCESS", "message": "OK", "requestId": "req_...", "timestamp": "...", "data": { } }
  ```
- 오류: (error code → HTTP status 표)
- 멱등성/페이지네이션: (해당 시)

## 7. Data Models

> 도메인 데이터 규약/ERD와 일치. 테이블/엔티티별로.

### 테이블 `<schema>.<prefix_name>`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `<entity>_no` | bigint | PK | 내부 식별자. API 비노출 |
| `<entity>_id` | varchar(21) | UNIQUE, NOT NULL | 외부 식별자 |
| `workspace_no` | bigint | NOT NULL, leading index | workspace 격리 기준 |
| ... | | | |

- 인덱스: (WHERE/JOIN/ORDER BY 대상)
- 상태 전이: `A → B → C` (허용 전이만, §4.4 그림과 같게)

### 7.1 쿼리 → 인덱스 (필수)

| 쿼리(어댑터.메서드) | 조건·정렬 칸 | 쓰는 인덱스 | 예상 행 수·근거 |
|---|---|---|---|
| (예: FolderQueries.children) | workspace_id, parent_folder_id, sort | ix_folder_parent_002 | (EXPLAIN 또는 "측정 필요") |

### 7.2 캐시 (해당 시)

> 캐시가 없으면 "캐시 없음 — 이유". 키는 실제 키 식(예: `@cacheKeys.workspace(#workspaceNo, 'rows')`)과 저장소 키 모양을 함께 적는다.

| 캐시 이름 | 키 형식 | TTL·저장소 | 채우는 곳 | 무효화 시점 |
|---|---|---|---|---|
| (예: workspace-glossary) | (예: ws{N}-rows) | (예: 10분 · Valkey+로컬) | (메서드) | (쓰기 메서드 · 이벤트) |

### 7.3 동시성 제어 (필수)

> 같은 행·같은 키를 둘 이상이 바꿀 수 있는 지점마다 방식을 정한다. 없으면 "경합 지점 없음 — 이유".

| 경합 지점 | 방식(비관적 잠금·낙관적 @Version·분산 락·고유 제약·멱등 키) | 잠금 키·범위 | 실패·재시도 처리 |
|---|---|---|---|
| (예: 폴더 이동 순서) | (예: SELECT … FOR UPDATE) | (예: workspace_no, folder_no) | (예: 409 FOLDER_CONFLICT) |

## 8. Error Handling

| 상황 | error code | HTTP | 처리 |
|---|---|---|---|
| (예) 리소스 미준비 | RESOURCE_NOT_READY | 409 | 재시도 안내 |

- 재시도/타임아웃/멱등성 정책 (`.agents/rules/reliability.md`)

## 9. Security Design

- 인증/인가 흐름, 리소스 접근 권한을 판정하는 지점
- secret/key 처리(암호화·해시, 원문 미반환)
- 입력 검증(경계에서 parse), audit 대상 행위

## 10. Observability

- 로그(구조화, 민감정보 제외), 메트릭, audit 로그 기록 항목

## 11. Testing Strategy

- 단위 / 통합 / contract / E2E / 보안(권한 없는 접근 차단) / 실패 케이스
- 테스트 데이터·픽스처 전략

### 11.1 Quickstart (end-to-end 검증 시나리오 · 필수)

> 이 기능이 완성됐음을 사람이 직접 확인하는 최단 경로. tasks의 Polish 단계와 `/hx-analyze`가 이 시나리오를 참조한다.

- **선행**: (필요한 데이터·계정·환경 — 예: 시드 데이터, 인증된 테스트 계정)
- **실행**: (순서대로 밟을 명령/요청 — 예: `POST /api/v1/... ` → `GET /api/v1/...`)
- **기대 결과**: (관측 가능한 성공 신호 — 예: envelope `data` 반환, 상태 `A→B` 전이, audit 로그 1건)

## 12. Correctness Properties (PBT)

> 명세를 실행 가능한 불변식으로. property-based testing 대상.

- P1: <불변식> (예: "모든 결과 레코드는 caller의 소유 키를 가진다")
- P2: <불변식> (예: "동일 이벤트 재수신 시 부수효과는 1회만")

## 13. Migration / Rollout

- DB 마이그레이션 순서, 하위호환, 롤백 방법, 기능 플래그(해당 시)

## 14. Research & Decisions (ADR)

> 설계 조사(research) 로그. 설계 중 내린 결정과 근거, 기각한 대안을 남겨 재추론을 막는다.

### 14.1 결정 로그

| 결정 | 근거 | 기각한 대안 |
|---|---|---|
| (예: 상태 저장에 outbox 사용) | (일관성·재시도 요구) | (직접 호출 — 실패 시 유실) |

### 14.2 대안 비교 (해당 시)

| 대안 | 장점 | 단점 | 채택 여부 |
|---|---|---|---|

## 15. Open Questions

- [ ] (미해결 — 추측 금지. 남으면 `/hx-clarify`로 requirements를 먼저 갱신)

## 16. 요구사항 추적 매트릭스

| Requirement | 충족 설계 요소 |
|---|---|
| R1.1 | (컴포넌트/API/테이블/속성) |

## 17. 승인 체크리스트

- [ ] **Constitution Check**를 통과했는가(위반 시 §3.1 Complexity에 정당화 존재)
- [ ] 모든 Req(추적 ID `R#.#`)가 설계 요소로 추적되는가
- [ ] 인터페이스 시그니처가 구현 가능 수준인가
- [ ] 데이터 모델이 도메인 데이터 규약과 일치하는가
- [ ] 보안/접근 제어·오류·테스트 전략이 구체적인가
- [ ] Quickstart(end-to-end 검증 시나리오)가 정의되었는가
- [ ] 정확성 속성(PBT)이 정의되었는가
- [ ] 미해결 `[NEEDS CLARIFICATION]`이 없는가(있으면 `/hx-clarify`로 복귀)
- [ ] 순서도(§4.3)·상태 전이(§4.4)·쿼리→인덱스(§7.1)·캐시(§7.2)·동시성(§7.3)이 채워졌는가(해당 없음은 이유 한 줄)

## 변경 범위 검증 계획

| 변경 파일/패키지 | 관련 테스트 selector | 근거/보존 동작 | 통합·계약 확대 | full 선택/이유 |
|---|---|---|---|---|

조건 정책은 Given/When/Then과 경계·진리표, mapper는 필드·NULL·enum·단위, 데이터 접근은 RLS·동시성·멱등성을 검증한다.
