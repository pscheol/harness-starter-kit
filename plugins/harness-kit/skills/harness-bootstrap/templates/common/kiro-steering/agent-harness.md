---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 멀티 에이전트 하네스 (포인터)

정본: `.agents/rules/agent-harness.md` — Claude·Codex·Kiro 공통.

요약:
- 규칙 정본 = `.agents/rules/`, 설계·기록의 단일 진실 소스 = `.agents/docs/`. 진입 파일은 목차.
- SDD: 제품 폴더 `product-<slug>-specs/` 안 requirements → design → tasks/active. 워크플로 정본 `.agents/rules/sdd-workflow.md`.
- exec-plan 완료 게이트: active → check → **사용자 검증** → completed(임의 이동 금지).
- 강제 로직은 리포 스크립트 1곳 + 에이전트별 얇은 트리거(로직 복제 금지).
