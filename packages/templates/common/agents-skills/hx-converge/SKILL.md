---
name: hx-converge
description: 'SDD 회수 — 구현 후 발견된 잔여·후속 작업을 tasks에 append-only(## Phase N: Convergence)로 되살린다.'
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-converge` 절을 로드해 그대로 수행한다.

append-only — 기존 Phase·작업 이력을 재작성·삭제하지 않는다. 새 `## Phase N: Convergence` 섹션만 덧붙인다.

핵심:
1. 근거 수집: `/hx-analyze` 커버리지 갭·리뷰 지적·escaped 버그·requirements의 Deferred·`scripts/check-spec-freshness.sh` 리포트(오래된 draft·미해결 `[NEEDS CLARIFICATION]`·정체된 active tasks).
2. TASKS 출력으로 해석한 대상 문서 끝에 `## Phase N: Convergence`를 추가하고 잔여 작업을 `- [ ] T### [P] [US#] 설명 + 파일 경로`로 이어붙인다(T 순번은 기존 마지막 번호 다음부터 연속). 대상은 이슈의 `tasks.md`다(옛 구조 이슈는 먼저 `sdd-layout.py migrate` 로 옮긴다). 각 작업에 **회수 출처**(analyze ID·이슈·마커 위치)를 근거로 표기한다.
3. 이미 완료된 기능이면 `tasks.md` 의 `state`를 `active`로 되돌린 뒤 회수 Phase를 추가한다(완료 이력은 커밋에 남는다).
4. **스펙 결함이면 회수가 아니라 되돌림** — 요구 누락은 `/hx-specify`, 모호는 `/hx-clarify`, 설계 변경은 `/hx-plan`. `/hx-converge`는 작업 목록 복구지 스펙 수정이 아니다.
5. 사용자 승인 후 `/hx-implement` 로 회수 Phase를 실행하고 완료 게이트(active→check→confirm→completed)를 다시 탄다.

대상(제품·기능): 이 명령 뒤에 이어서 적은 내용

경로: 이슈는 `.agents/docs/issues/<키>-<이름>/`. 옛 `<영역>-specs/` 이슈는 읽기만 한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 범위를 확인하고, MR 전에는 `bash scripts/verify.sh --affected`를 돌린다. 전체 검증(full)은 CI가 돈다.
