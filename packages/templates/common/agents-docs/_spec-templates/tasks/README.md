# 실행 계획 — 이슈의 tasks

tasks 는 이슈 폴더의 `tasks.md` 한 파일이다(`.agents/docs/issues/<키>-<이름>/tasks.md`).
design 승인 뒤 `bash scripts/new-feature.sh <키> --stage=tasks` 로 만든다. 옛 구조(`<영역>-specs/tasks/<상태>/`)는 읽기만 한다.

## 작업 기준

- `T### [P] [US#]`에 실제 소유 파일·패키지·수용 기준과 검증 명령을 적는다.
- 새 기능·버그는 실패 테스트를 먼저, 리팩토링은 보존 테스트를 먼저 실행한다.
- BDD 시나리오의 입력·행동·결과와 경계·권한·실패를 확인한다.
- 변경 대상 테스트부터 실행한다. MR 전에는 `bash scripts/verify.sh --affected`, 전체 검증(full)은 CI가 돈다.
- 다른 세션의 소유 파일을 수정하거나 전체 포맷/생성 명령으로 덮지 않는다.
- 잔여 작업은 끝에 새 Phase와 연속 번호로 추가한다. 지난 이력을 다시 쓰지 않는다.

## 완료 검수

상태는 문서 머리의 `state` 값이다: `active` → `check` → `completed`, 대체되면 `superseded`. 파일은 옮기지 않는다.
DoD 충족 뒤 `check`로 두고 검증 결과를 사용자에게 제시한다.
사용자가 명시 승인한 뒤에만 `completed`로 바꾼다. 대체 계획은 `superseded`와 사유를 남긴다.
상태 검사는 사용자 승인 여부 자체를 입증하지 못한다.

`bash scripts/board.sh --check`는 읽기 전용이다. 보드 갱신은 `bash scripts/board.sh`로 명시한다.

## 결과 기록

변경 파일·보존한 계약·실행 테스트·실패/건너뜀·미확인·사람 확인 결과를 적는다.
문서/API에 영향이 없으면 그 이유를 적는다. 완료를 E2E 통과와 같은 뜻으로 쓰지 않는다.
