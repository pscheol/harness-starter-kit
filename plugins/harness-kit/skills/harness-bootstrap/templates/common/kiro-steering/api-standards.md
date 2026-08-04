---
inclusion: fileMatch
fileMatchPattern: '**/primary/**|.agents/docs/openapi/**'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# API 표준 (포인터)

원본: `.agents/rules/api-standards.md` — Claude·Codex·Kiro 공통. API 추가/변경 전 반드시 이 원본을 연다.

요약:
- 공통 응답 envelope(code·message·requestId·timestamp + data/page 또는 details), 성공·실패는 HTTP status로 분기.
- ErrorCode 단일 매핑 + i18n 메시지(`error.{ErrorCode}`), 목록은 cursor pagination.
- OpenAPI 문서는 `*Api` 인터페이스가 단일 관리, API 변경 시 함께 갱신.
