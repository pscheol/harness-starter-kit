<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{FEATURE_NAME}} 치환 후 사용 -->

# Tasks — {{FEATURE_NAME}}

| 항목 | 값 |
|---|---|
| 상태 | active \| check \| completed |
| SDD 단계 | tasks |
| 연계 | ../requirements/{{FEATURE_NAME}}.md (req), ../design/{{FEATURE_NAME}}.md (design) |

> 가이드: 각 작업은 코딩 에이전트가 바로 실행 가능한 단위로 쪼갠다.
> 작업마다 (a) 건드리는 파일/모듈, (b) 충족 요구사항 ID, (c) 검증 방법을 명시한다.
> 검증은 `scripts/verify.sh`(빌드/린트/테스트)로 한다.

## 작업 포맷 *(필수)*

`- [ ] T001 [P] [US1] 설명 + 정확한 파일/모듈 경로`

- **`T###`**: 실행 순번(전역 유일). 완료 시 `- [X]`로 체크.
- **`[P]`**: 병렬 가능 표시 — 다른 파일이고 선행 의존이 없을 때만. 같은 파일을 건드리면 `[P]` 금지(순차).
- **`[US1]`**: 이 작업이 속한 User Story 추적(requirements의 `US1`/`US2`…). Setup·Foundational·Polish 작업에는 스토리 라벨을 붙이지 않는다.
- 설명에는 **정확한 파일/모듈 경로**를 포함한다(예: `services/{{PROJECT_SLUG}}-api/.../XxxService.kt`).

## Phase 구조

> Phase 1 Setup → Phase 2 Foundational(모든 스토리 차단 선행) → Phase 3+ **User Story별(우선순위 순)** → Polish.
> User Story 단위로 묶어 각 스토리를 **독립적으로 구현·테스트·시연**할 수 있게 한다.

### Phase 1: Setup (공용 기반)

**목적**: 프로젝트/모듈 초기화·공통 구조.

- [ ] T001 <작업 제목> + 파일/모듈 경로
- [ ] T002 [P] <병렬 가능 작업> + 파일/모듈 경로

### Phase 2: Foundational (차단 선행)

**목적**: 어떤 User Story도 시작하기 전에 반드시 완료돼야 하는 핵심 인프라(공용 엔티티·마이그레이션·인증/미들웨어 등).

⚠️ 이 Phase가 끝나기 전에는 어떤 User Story 작업도 시작하지 않는다.

- [ ] T003 <공용 엔티티/스키마> + 경로
  - _요구사항: (공용)_  _설계: design §7_
- [ ] T004 [P] <인증/미들웨어/에러 핸들링 기반> + 경로
  - _요구사항: (공용)_  _설계: design §9_

**Checkpoint**: 기반 준비 완료 — 이후 User Story들을 (여력이 되면) 병렬로 시작 가능.

### Phase 3: User Story 1 — <제목> (우선순위: P1) 🎯 핵심

**목표**: (이 스토리가 전달하는 가치 한 줄)

**독립 테스트**: (design §11.1 Quickstart 기준 — 이 스토리만으로 어떻게 단독 검증하는가)

- [ ] T005 [US1] 테스트 작성(성공 + 최소 1개 실패 + 권한 없는 접근 차단) — **구현 전 실패 확인(TDD)** + 경로
  - _요구사항: R1.1, R1.2_  _설계: design §11, §12(PBT)_
- [ ] T006 [P] [US1] <모델/타입> + 경로
  - _요구사항: R1.1_  _설계: design §7_
- [ ] T007 [US1] <서비스/엔드포인트 구현> + 경로 (T006 의존)
  - _요구사항: R1.1, R1.3_  _설계: design §5.1, §6_

**Checkpoint**: User Story 1이 단독으로 동작·테스트 가능해야 한다.

### Phase 4: User Story 2 — <제목> (우선순위: P2)

**목표**: ...
**독립 테스트**: ...

- [ ] T008 [US2] 테스트 작성 + 경로
  - _요구사항: R2.1_  _설계: design §11_
- [ ] T009 [US2] <구현> + 경로

**Checkpoint**: User Story 1·2가 각각 독립적으로 동작.

### Phase N: Polish & 횡단 관심사

**목적**: 여러 스토리에 걸친 마무리.

- [ ] TXXX [P] 문서/OpenAPI 갱신 (`.agents/docs/openapi/`)
- [ ] TXXX design §11.1 **Quickstart 검증 시나리오** 실행
- [ ] TXXX 성능/보안 하드닝, 리팩터링

## 의존 그래프 & 실행 순서

- **Phase 의존**: Setup → Foundational(모든 스토리 차단) → User Stories(P1→P2→P3, 여력 시 병렬) → Polish.
- **User Story 간**: 각 스토리는 Foundational 이후 시작하며 서로 독립 테스트 가능해야 한다(교차 의존이 독립성을 깨면 안 됨).
- **스토리 내부**: 테스트(요청 시) → 모델 → 서비스 → 엔드포인트 → 통합 순. 스토리 완료 후 다음 우선순위로.

## 병렬 예시

```text
# Foundational 완료 후, 스토리별 [P] 작업을 함께 착수:
T006 [P] [US1] 모델 A (파일 a.kt)
T008 [P] [US2] 모델 B (파일 b.kt)   # 다른 파일·무의존 → 병렬 가능
# 같은 파일을 만지는 작업은 [P] 없이 순차.
```

## 구현 전략

- **핵심 우선**: Phase 1 → 2 → 3(US1)까지만 완성하고 멈춰서 검증(Quickstart) → 필요 시 데모/배포.
- **점진 인도**: US1 → US2 → US3 순으로 각 스토리를 독립 검증하며 하나씩 인도(이전 스토리를 깨지 않음).
- **병렬 진행**: Foundational 공동 완료 후, 개발자별로 스토리를 나눠 병렬 작업.

## 작업 규칙

- 한 번에 1~2개 작업만 진행하고 검증 후 다음으로.
- 외부 상황 없이 이 문서만으로 작업을 재개할 수 있어야 한다.
- 설계와 어긋나면 먼저 design 문서를 갱신한 뒤 구현한다.

## 의사결정 로그

| 날짜 | 결정 | 이유 |
|---|---|---|

## 검증 (DoD)

- [ ] `scripts/verify.sh` 통과 (빌드/린트/테스트)
- [ ] 성공 + 최소 1개 실패 케이스 테스트
- [ ] 인증 필요 시 401/403 케이스, 권한 없는 접근 차단 테스트
- [ ] `.agents/rules/quality-score.md` 체크리스트 충족
- [ ] API 변경 시 `.agents/docs/openapi/` 갱신
- [ ] design §11.1 Quickstart 시나리오 통과

## 완료 처리 (사용자 검증 게이트)

1. DoD와 `scripts/verify.sh`를 충족하면 상태를 `check`로 바꾸고, 파일을 `check/`로 이동한다(active → check).
2. `결과` 섹션에 검증 근거(빌드/테스트/린트 결과)를 적고 **사용자에게 검증·확인을 요청**한다.
3. **사용자 승인(confirm) 후에만** 상태를 `completed`로 바꾸고 파일을 `completed/`로 이동, 결과/PR 링크를 남긴다.

> 에이전트는 사용자 승인 없이 `completed`로 전환하거나 `completed/`로 이동하지 않는다.
> (에이전트 자동완료를 금지하고 harness의 사용자 승인 게이트를 적용한다.)

## 결과 / PR

검증 명령과 그 출력만 적는다 — 통과·실패 수, 실패했다면 무엇이. 소감(`성공적으로 완료했습니다`)이나
작업 과정 서술(`대조 결과`·`~임을 확인했다`)은 쓰지 않는다(`.agents/rules/writing-style.md`).

```text
예) bash scripts/verify.sh — 통과. 테스트 42개 중 42개 성공, 린트 0건.
    Quickstart(design §11.1) 시나리오 3개 중 3개 통과.
```

(작업 후 기록)
