---
inclusion: fileMatch
fileMatchPattern: '**/approvals.md|**/tasks.md|**/requirements.md|**/design.md'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 승인 어휘 (포인터)

원본: `.agents/rules/approval-vocabulary.md` — SDD 문서 · 승인 기록을 다룰 때 연다.

요약:
- 채팅에서 한 말은 어떤 말이든 승인이 아니다. 승인은 사람 터미널(approve.py) · 관리 페이지 · Jira · AI-DLC 네 경로로만 생긴다.
- 에이전트는 approvals.md · quality-baseline.json · 관리 페이지 토큰을 쓰지 않고, status 를 approved 로 바꾸지 않으며, done 승인 없이 completed 로 바꾸지 않는다.
