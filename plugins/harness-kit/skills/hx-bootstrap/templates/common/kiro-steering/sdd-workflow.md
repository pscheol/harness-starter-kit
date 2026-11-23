---
inclusion: always
---
# SDD 워크플로 (포인터)

원본: `.agents/rules/sdd-workflow.md` — Claude·Codex·Kiro 공통.

요약:
- SDD는 이슈 하나 = 폴더 하나: `.agents/docs/issues/<키>-<이름>/` 안에서 requirements.md → design.md → tasks.md. 상태는 문서 머리(`status` · `state`). 옛 `<영역>-specs/` 는 읽기 전용.
- 명령: `/hx-specify`(+`/hx-clarify`) → (`/hx-checklist` 요구사항 품질) → `/hx-plan` → `/hx-tasks` → (`/hx-analyze` 정합성) → `/hx-implement`. 각 단계 사용자 승인.
- SDLC 단계 S1 분석 → S2 기획(정책·화면) → S3 설계 → S4 계획 → S5 구현 → S6 테스트 → S7 문서 반영(`/hx-docs`) → S8 완료. 기능 문서 검사가 통과해야 `state: check` 로 바꾼다.
- 구현 후 잔여·후속 작업은 `/hx-converge`(append-only 회수, `## Phase N: Convergence`). 근거: `scripts/check-spec-freshness.sh`(신선도 리포트).
- 요구사항=무엇/왜(우선순위 User Story·측정가능 SC·`[NEEDS CLARIFICATION]`), design=어떻게(+Constitution Check), tasks=`T### [P] [US]` 포맷.
- 완료 게이트: `state` active → check → **사용자 승인** → completed(임의 변경 금지). 검증은 `scripts/verify.sh`.
- 스캐폴딩은 **단계마다 한 번씩**: `scripts/new-feature.sh <키|--next> <이름> --area <영역>`(requirements) → 승인 뒤 `scripts/new-feature.sh <키> --stage=design` → 승인 뒤 `--stage=tasks`. `--all`은 승인 게이트를 우회하므로 지원하지 않는다.
- 브랜치는 `<종류>/<키>-<이름>`. 템플릿 원본은 `.agents/docs/_spec-templates/`.
