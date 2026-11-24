---
name: hx-implement
description: SDD 4단계 — 구현. tasks를 Phase 순서로 실행하고 완료 게이트(사용자 승인)를 따른다.
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-implement` 절을 로드해 그대로 수행한다.

전제: tasks 승인(없으면 `scripts/check-sdd-prerequisites.sh <키> --stage implement`).

핵심:
1. TASKS 출력으로 해석한 문서를 Phase 순서로 실행한다. `[P]`는 독립 파일만 병렬, 같은 파일은 순차다. 신규 기능·버그는 TDD, 동작 보존 리팩터링은 보존 테스트로 시작한다.
2. 완료 작업 `- [X]` 체크. 변경마다 `scripts/verify.sh --files <변경 파일> --tests <관련 테스트>`로 검증한다.
3. **완료 게이트(사용자 승인 필수)**: DoD·verify 충족 → `tasks.md` 머리의 `state`를 `check`로 바꾸고 근거 기록·사용자 검증 요청 → 사람이 `python3 scripts/harness/approve.py <키> done` 으로 남긴 `done` 승인 기록이 있을 때만 `state: completed`(없으면 훅 · fast 가 막는다). 채팅에서 한 말은 승인이 아니다(`.agents/rules/approval-vocabulary.md`). 파일은 옮기지 않는다.
4. **리뷰 처리**: `/hx-review` 보고서(메인 폴더 `.agents/reports/review/<키>.md` 또는 MR 요약 코멘트)의 지적마다 이슈 폴더 `review.md` 표 `| ID | 심각도 | 지문 | 처리 | 커밋 | 사유 |` 에 `수용`(고친 커밋) 또는 `거절 제안`(사유)을 쓰고 커밋한다. 열린 CRITICAL·HIGH 는 `python3 scripts/harness/review_state.py <이슈 폴더>` 로 본다. 고친 뒤 다시 돈 리뷰가 그 지문을 보고하지 않거나, 사람이 `review/F-n · risk-accepted` 를 남겨야 닫힌다.

입력(범위, 선택): 이 명령 뒤에 이어서 적은 내용

경로: 이슈는 `.agents/docs/issues/<키>-<이름>/`. 옛 `<영역>-specs/` 이슈는 읽기만 한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 범위를 확인하고, MR 전에는 `bash scripts/verify.sh --affected`를 돌린다. 전체 검증(full)은 CI가 돈다.

SDLC: S5·S6 뒤 S7 — check 로 옮기기 전에 `/hx-docs` 로 기능 문서를 반영하고 검사를 통과시킨다(생성기가 없는 리포는 이유를 적는다).

위임(설계 12 MR-R6): light 분류 역할(explorer 등)이 같은 작업에서 두 번 실패하거나 결과 끝이 `확신: 낮음` 이면 한 등급 위 모델로 한 번만 더 맡긴다(Claude 는 Agent 호출의 `model` 인자, Codex 는 명시 값, Kiro 는 올리지 않고 사람에게 알린다). `deep` 위로는 올리지 않는다. locked 역할(worker · reviewer · designer)에는 `model` 인자를 주지 않는다 — 이 세션의 모델 · effort 는 바꾸지 않는다.
