---
description: SDD 4단계 — 구현. tasks를 Phase 순서로 실행하고 완료 게이트(사용자 승인)를 따른다.
---

<!-- HARNESS STARTER KIT · 얇은 트리거. 원본: .agents/rules/sdd-workflow.md (/hx-implement 절) -->

SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-implement` 절을 로드해 그대로 수행한다.

전제: tasks 승인(없으면 `scripts/check-sdd-prerequisites.sh <slug> <feature> --stage implement`).

핵심:
1. tasks를 Phase 순서로 실행. `[P]`는 병렬, 같은 파일은 순차. TDD 우선(테스트 요청 시 실패 확인 후 구현).
2. 완료 작업 `- [X]` 체크. 변경마다 `scripts/verify.sh` 로 검증.
3. **완료 게이트(사용자 승인 필수)**: DoD·verify 충족 → task 파일 `tasks/check/` 이동·상태 `check`·근거 기록·사용자 검증 요청 → 승인 후에만 `tasks/completed/` 이동·상태 `completed`. 임의 completed 전환 금지.

입력(범위, 선택): $ARGUMENTS
