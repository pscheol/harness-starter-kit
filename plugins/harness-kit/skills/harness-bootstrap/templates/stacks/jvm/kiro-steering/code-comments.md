---
inclusion: fileMatch
fileMatchPattern: '**/*.kt|**/*.java|**/*.sql'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 주석 표준 (포인터)

정본: `.agents/rules/code-comments.md` — Claude·Codex·Kiro 공통. **로직 함수 작성/수정 전 이 정본을 연다.**

요약:
- 코드는 라인 단위 What/How, 주석은 Why. 로직 함수는 **책임 한 줄 + 처리 흐름**(각 단계에 "무엇을 — 왜/무엇을 위해").
- 번역투 금지(시그니처 받아쓰기 삭제). `@param`/`@return`은 타입이 못 담는 의미만, 어노테이션·옵티마이저 힌트는 근거를 남긴다.
- 죽은 주석 금지 — 코드가 바뀌면 주석도 동기화. 흐름이 7~8단계로 길면 함수를 분리한다.
- 한국어로 작성, 비밀·토큰·키 원문은 주석에도 넣지 않는다.
