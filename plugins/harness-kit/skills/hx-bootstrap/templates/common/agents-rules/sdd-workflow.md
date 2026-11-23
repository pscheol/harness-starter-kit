# SDD 워크플로 — 이슈별 요구 · 설계 · 작업

Claude·Codex·Kiro의 SDD 원본이다. 한 이슈의 요구·설계·작업·검증을 한 폴더에 보관한다.
API·상태·저장소를 바꾸면 명세를 같은 변경에 갱신한다.

## 위치와 기존 문서 호환

새 기본 위치는 `.agents/docs/<slug>-specs/issues/<key>/`다.

```text
<slug>-specs/
  index.md
  issues/
    1-feat-upload-policy/
      requirements.md
      design.md
      checklists/
      tasks/
        active.md
        check.md
        completed.md
        superseded.md
```

각 단계에 진입할 때만 문서를 만든다. 위 task 목록은 가능한 상태이며 동시에 만들지 않는다.
기존 `requirements/<key>.md`, `design/<key>.md`, `tasks/<state>/<key>.md`는 읽고 이어 작성한다.
기존 명세를 자동 이동하지 않는다. 새 이슈를 기존 형식으로 만들려면 `--legacy`를 명시한다.
새 이슈는 모든 하네스에서 위치·정확한 상태·선행 문서·작업 ID·완료 체크를 검사한다. legacy는 각 하네스의 기존 검사 범위를 유지한다. `check_harness.py`가 없는 메인 루트의 과거 기록은 기존 상태 토큰 검사이며, 단위·도메인의 legacy는 기존 엄격한 검사를 유지한다.

| 단계 | 새 위치 | 명령 |
|---|---|---|
| requirements | `issues/<key>/requirements.md` | `bash scripts/new-feature.sh <slug> <name>` |
| design | `issues/<key>/design.md` | 같은 명령에 `--stage=design` |
| tasks | `issues/<key>/tasks/active.md` | 같은 명령에 `--stage=tasks` |
| 품질 체크 | `issues/<key>/checklists/<focus>.md` | `hx-checklist` |
| 검수 | `issues/<key>/tasks/check.md` | 위치·상태 변경 후 사용자 검수 |

`bash scripts/check-sdd-prerequisites.sh <slug> <key> --stage=design|tasks|implement`가 실제 경로를 출력한다.
스킬은 출력의 `BASE`, `REQUIREMENTS`, `DESIGN`, `TASKS`를 사용하고 경로를 추측하지 않는다.
같은 키가 두 형식에 있거나 짧은 이름에 후보가 여럿이면 전체 키와 중복 원인을 확인한다.

## 키와 승인

키는 `<순번>-<종류>-<이름>`이다. 종류는 feat/fix/refactor/perf/chore/docs, 이름은 kebab-case다.
번호는 생성 식별자다. 제품·스토리 우선순위는 requirements에 별도로 적는다.
트래커 이슈 ID·URL은 출처에 적는다. 외부 이슈 번호를 지어내지 않는다.
requirements와 design은 상태가 정확히 `approved`일 때 다음 문서를 만든다.
승인 전에는 draft/in-review다. 파일 존재를 승인으로 간주하지 않는다.
빈 단계의 일괄 생성은 없다. `--all`은 승인 게이트를 우회하므로 지원하지 않는다.
사용자가 직접 구현을 승인한 범위는 승인 근거를 기록하고 그 범위 안에서 진행한다. 범위 밖 계약 변경은 별도로 합의한다.

## 공통 기준

- 코드·계약·호출부를 확인한다. 불확실한 내용은 `[NEEDS CLARIFICATION: 질문]`으로 남긴다.
- requirements는 무엇을·왜, design은 어떻게, tasks는 파일·검증·실행 순서를 적는다.
- 독립 검증 가능한 User Story로 나눈다. 수용 기준은 EARS와 Given/When/Then으로 표현한다.
- 실제 결과로 조건을 판단한다. mock 호출 검증만으로 사용자 동작의 성공을 선언하지 않는다.
- 패키지·네이밍·조건·mapper·문서는 [코드 유지보수](code-maintenance.md), 소유권은 [세션 협업](session-collaboration.md)을 따른다.
- 변경 대상부터 검증한다. full은 명시적으로 선택한다([검증 사다리](verification-ladder.md)).

## SDLC 단계

SDD 이슈는 아래 여덟 단계를 지난다. 단계마다 산출물이 있고, 다음 단계는 앞 단계의 게이트를 통과한 뒤 시작한다.
이슈 문서(requirements·design·tasks)는 변경 기록이고, 기능 문서(`docs/<기능 문서>`)는 구현된 기능의 현재 모습이다. S7 에서 둘을 맞춘다.

| 단계 | 산출(이슈) | 산출(기능 문서) | 스킬 | 게이트 |
|---|---|---|---|---|
| S1 분석 | requirements — 스토리·`R#.#`·SC | 원고 §요구사항 초안 | `/hx-specify` · `/hx-clarify` | requirements `approved` |
| S2 기획 | requirements §정책(`P-#`)·§화면(목업) | 원고 §정책·§화면 · `_src/mockups` | `/hx-specify` · `/hx-checklist` | 같은 승인 |
| S3 설계 | design — 순서도·시퀀스·상태·DB·인덱스·캐시 키·동시성·API | 원고 §흐름·§시퀀스·§상태 전이 · catalog 배정 | `/hx-plan` · `/hx-analyze` | Constitution Check · design `approved` |
| S4 계획 | tasks/active.md | 백로그 추적(생성) | `/hx-tasks` | — |
| S5 구현 | 코드·시험·OpenAPI 스냅숏 | — | `/hx-implement` · `/hx-maintain` | changed 검증 |
| S6 테스트 | tasks `[VERIFICATION]` | 원고 §테스트 시나리오 | `/hx-checklist` · `scripts/verify.sh` | 검증 사다리 레벨 |
| S7 문서 반영 | tasks Polish 체크 | 원고·배정 갱신 → 생성 → 검사 | `/hx-docs` | 기능 문서 검사 통과 |
| S8 완료 | check.md → 사용자 검수 → completed.md | 원고 §변경 영향 | `/hx-converge` | 사용자 승인 |

- S2 는 S1 과 같은 requirements 에 쓴다. 화면이 없는 이슈는 §화면에 "화면 없음"을 쓴다.
- 기능 문서 생성기가 없는 리포는 S7 을 건너뛰고 이유를 tasks 결과에 적는다.
- 기존 기능을 처음 문서화할 때도 S7 형식(원고 절 12개·배정 0 미배정)을 따른다.

## /hx-specify — 요구사항

1. 단위·제품 slug·범위를 확인하고 requirements 하나만 스캐폴딩한다.
2. User Story, 우선순위 이유, `R#.#` 수용 기준, 범위, 실패·경계 동작을 적는다.
3. `SC-001`부터 측정 가능한 성공 기준을 적는다. 구현 기술을 성공 기준으로 쓰지 않는다.
4. 미확정 질문은 최대 3개다. 범위·보안/프라이버시·UX·기술 순으로 해결한다.
5. 정책 표(`| ID | 규칙 | 강제 위치 |`, ID `P-#`)와 화면 표(화면 ID·경로·상태·목업)를 쓴다. 갱신할 기능 문서 ID 를 머리 표에 적는다.
6. 모호성·측정성·독립 검증·누락을 보완하고 in-review로 둔다. 승인 뒤 approved로 바꾼다.

## /hx-clarify — 모호성

기능·데이터·UX·통합·엣지·완료 기준을 읽고 필요한 질문만 묻는다.
답은 requirements의 Clarifications에 날짜·질문·답으로 적고 관련 기준을 갱신한다.
미해소 고영향 항목을 기술 선택으로 임의 확정하지 않는다.

## /hx-checklist — 요구 문장 품질

완결성·명료성·일관성·측정가능성·출처/검증 추적을 판정한다.
체크리스트는 새 이슈의 checklists, legacy 이슈의 기존 checklists 위치에 둔다.
본문 근거·위치·PASS/FAIL/N·A를 적는다. 스펙을 수정하는 작업과 구분한다.

## /hx-plan — 설계

1. 승인 requirements의 실제 경로를 해석하고 design만 스캐폴딩한다.
2. 현재 아키텍처·규칙·계약을 읽고 재사용/확장/신규 근거를 적는다.
3. 패키지 책임·호출 방향·시퀀스·DTO·상태·데이터·오류·권한·관측성을 적는다.
   순서도(`flowchart`)·상태 전이(`stateDiagram-v2`)·쿼리별 사용 인덱스·캐시 이름과 키·무효화 시점·동시성 제어(잠금·멱등·고유 제약)를 각각 절로 둔다.
4. API는 operation별 Method/Path, 권한, 요청/응답, 검증, 오류, 예제, query/table/cache,
   외부 연동과 sequence/flow를 기록한다. OpenAPI 원본 소유 단위를 명시한다.
5. 테스트 전략은 변경 단위·관련 통합/계약·필요 E2E·사람 확인을 구분한다. full 여부와 이유를 적는다.
6. 요구 추적·마이그레이션·quickstart·대안 비용을 적는다. 미확정 고영향 항목은 clarify로 되돌린다.
7. Constitution Check 뒤 in-review, 사용자 승인 뒤 approved로 둔다.

## /hx-tasks — 작업

승인 design에서 실제 이슈의 active task를 스캐폴딩한다.
작업 줄은 `- [ ] T001 [P] [US1] 설명 — 정확한 파일/패키지 (R1.1, design 절)`이다.
Setup → Foundational → User Story → Polish로 나누고 검증을 구현보다 앞에 둔다.
Polish 에 문서 반영(`/hx-docs`) 작업과 기능 문서 검사 명령을 둔다.
[P]는 파일이 겹치지 않고 선행 의존이 없는 작업에만 붙인다. 소유권·의존·위험·검증 명령을 적는다.
승인 범위에서 구현하고 이미 실행 승인이 있으면 근거를 기록한다.

## /hx-analyze — 정합성

요구·설계·작업과 규칙에서 요구/작업 매핑·헌법 충돌·계약·누락·모순·용어를 검토한다.
읽기 전용 리포트에 심각도·위치·발견·수정 문서를 적는다. CRITICAL/HIGH를 해결한다.
파일 유무만으로 요구 구현을 판단하지 않는다.

## /hx-implement — 구현

1. 승인 범위·소유권·공지·재사용 후보를 확인한다.
2. 기능·버그는 테스트 실패 → 구현 → 통과를 기록한다. 동작 보존 리팩토링은 보존 테스트를 먼저 통과시킨다.
3. BDD의 정상·경계·권한·실패 조건을 구현과 맞춘다. 관련 테스트만 먼저 실행한다.
4. 완료 작업만 체크하고 문서/OpenAPI·호출부·계약 변경을 함께 포함한다.
5. reviewer의 CRITICAL/HIGH를 해결하고 실행·실패·건너뜀·미확인을 보고한다.

## /hx-docs — 문서 반영(S7)

이번 이슈가 바꾼 기능의 원고·배정을 갱신하고 기능 문서를 생성·검사한다. 생성기 사용법은 `tools/docs/README.md`다.

1. 갱신할 기능을 정한다(requirements 의 기능 문서 칸 + 변경 파일). 새 기능이면 catalog 에 더한다.
2. OpenAPI 스냅숏·마이그레이션이 바뀌었으면 스냅숏을 갱신한다. 새 operation·테이블·캐시·화면을 기능에 배정한다.
3. 원고 절 12개를 고친다. 요구(FR)·정책(P)은 requirements, 흐름·시퀀스·상태는 design 에서 옮기고 코드와 대조한다.
4. 생성한 뒤 검사가 통과해야 한다. 생성물은 손으로 고치지 않는다. 검사는 파일을 쓰지 않는다.
5. 원고에 확인 못 한 내용은 `[확인 필요: 질문]`으로 남긴다. 정적 분석 표는 근사이므로 원고에서 단정할 때 코드를 연다.

## 완료 상태

새 형식은 `tasks/active.md` → `tasks/check.md` → `tasks/completed.md`, 기존은 상태 디렉터리 간 이동이다.
상태 필드도 함께 바꾼다. DoD 뒤 check로 두고 사용자 검수를 받는다. 명시 승인 뒤에만 completed로 옮긴다.
기능 문서 생성기가 있는 리포는 S7 검사가 통과한 뒤에 check 로 옮긴다.
대체 계획은 superseded로 두고 후속 이슈와 이유를 적는다.
`bash scripts/board.sh --check`와 상태 검사는 읽기 전용이다. 보드 갱신은 명시적으로 실행한다.
보드는 새·기존 이슈를 함께 읽으며 자동 구간을 손으로 수정하지 않는다.

## /hx-converge — 잔여 작업

검증·리뷰·실패·Deferred에서 남은 일을 찾고 tasks 끝에 새 Phase와 연속 T번호를 추가한다.
지난 Phase와 완료 이력을 지우지 않는다. 스펙 결함은 specify/clarify/plan으로 되돌린다.
기존 이슈 형식을 유지하고 추가 승인 범위에서 실행한 뒤 같은 검수를 받는다.
