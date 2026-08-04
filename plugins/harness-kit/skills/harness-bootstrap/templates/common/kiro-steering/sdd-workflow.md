---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# SDD 워크플로 (포인터)

원본: `.agents/rules/sdd-workflow.md` — Claude·Codex·Kiro 공통.

요약:
- 기능은 제품 폴더 `.agents/docs/product-<slug>-specs/` 안에서 requirements → design → tasks.
- 명령: `/hx-specify`(+`/hx-clarify`) → (`/hx-checklist` 요구사항 품질) → `/hx-plan` → `/hx-tasks` → (`/hx-analyze` 정합성) → `/hx-implement`. 각 단계 사용자 승인.
- 구현 후 잔여·후속 작업은 `/hx-converge`(append-only 회수, `## Phase N: Convergence`). 근거: `scripts/check-spec-freshness.sh`(신선도 리포트).
- 요구사항=무엇/왜(우선순위 User Story·측정가능 SC·`[NEEDS CLARIFICATION]`), design=어떻게(+Constitution Check), tasks=`T### [P] [US]` 포맷.
- 완료 게이트: tasks active → check → **사용자 승인** → completed(임의 이동 금지). 검증은 `scripts/verify.sh`.
- 새 기능 스캐폴딩: `scripts/new-feature.sh <slug> <feature>` (제품 폴더가 없으면 함께 생성. 템플릿 원본은 `.agents/docs/_spec-templates/`).
