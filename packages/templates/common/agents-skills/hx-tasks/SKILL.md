---
name: hx-tasks
description: SDD 3단계 — 작업 생성. design을 실행 가능한 issues/<키>-<이름>/tasks.md 로 분해한다.
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-tasks` 절을 로드해 그대로 수행한다.

전제: design 승인(없으면 `scripts/check-sdd-prerequisites.sh <키> --stage tasks`).

핵심:
1. `scripts/new-feature.sh <키> --stage=tasks` 로 `tasks.md` 를 만든다(design 이 `approved` 가 아니면 스크립트가 거부한다). 그다음 requirements의 User Story(P1/P2/P3)와 design(컴포넌트·API·데이터)을 작업으로 변환.
2. **작업 포맷**: `- [ ] T001 [P] [US1] 설명 + 파일/모듈 경로`. `[P]`=병렬, `[US1]`=스토리 추적.
3. **Phase**: Setup → Foundational(차단 선행) → User Story별(P 순) → Polish. 각 작업에 요구사항 ID·설계 § 표기.
4. 의존 그래프·병렬 예시·구현 전략(핵심 우선 / 점진 인도) 포함. 상태 `active`. 완료 후 **사용자 승인** → `/hx-analyze` 또는 `/hx-implement`.

입력(맥락, 선택): 이 명령 뒤에 이어서 적은 내용

경로: 이슈는 `.agents/docs/issues/<키>-<이름>/`. 옛 `<영역>-specs/` 이슈는 읽기만 한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 범위를 확인하고, MR 전에는 `bash scripts/verify.sh --affected`를 돌린다. 전체 검증(full)은 CI가 돈다.

SDLC: S4 — Polish 에 문서 반영(`/hx-docs`) 작업과 기능 문서 검사 명령을 둔다.
