---
name: hx-implement
description: SDD 4단계 — 구현. tasks를 Phase 순서로 실행하고 완료 게이트(사용자 승인)를 따른다.
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-implement` 절을 로드해 그대로 수행한다.

전제: tasks 승인(없으면 `scripts/check-sdd-prerequisites.sh <slug> <feature> --stage implement`).

핵심:
1. TASKS 출력으로 해석한 문서를 Phase 순서로 실행한다. `[P]`는 독립 파일만 병렬, 같은 파일은 순차다. 신규 기능·버그는 TDD, 동작 보존 리팩터링은 보존 테스트로 시작한다.
2. 완료 작업 `- [X]` 체크. 변경마다 `scripts/verify.sh --files <변경 파일> --tests <관련 테스트>`로 검증한다.
3. **완료 게이트(사용자 승인 필수)**: DoD·verify 충족 → 새 형식의 `tasks/active.md`를 `tasks/check.md`로 이동·상태 `check`·근거 기록·사용자 검증 요청 → 승인 후에만 `tasks/completed.md` 이동·상태 `completed`. legacy는 기존 제품의 tasks/check·completed 디렉터리에 기능 파일을 이동한다. 임의 completed 전환 금지.

입력(범위, 선택): 이 명령 뒤에 이어서 적은 내용

경로: 새 이슈는 `.agents/docs/<slug>-specs/issues/<key>/`, 기존 이슈는 원래 위치를 유지한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 확인하고 full은 `--full`로 명시한다.

SDLC: S5·S6 뒤 S7 — check 로 옮기기 전에 `/hx-docs` 로 기능 문서를 반영하고 검사를 통과시킨다(생성기가 없는 리포는 이유를 적는다).
