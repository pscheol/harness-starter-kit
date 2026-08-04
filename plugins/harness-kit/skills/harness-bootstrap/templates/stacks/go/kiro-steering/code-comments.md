---
inclusion: fileMatch
fileMatchPattern: '**/*.go|**/*.sql'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 주석 표준 (포인터)

원본: `.agents/rules/code-comments.md` — Claude·Codex·Kiro 공통. 로직 함수 작성/수정 전 이 원본을 연다.

요약:
- **Go doc 규약**: `//` 로 선언 바로 위, 선언 이름으로 시작(`// CreateOrder는 ...`). exported 식별자에는 doc comment 필수. 패키지 주석은 `// Package <name> ...`.
- 코드는 라인 단위 What/How, 주석은 Why. 로직 함수는 **책임 한 줄 + 처리 흐름**(각 단계에 "무엇을 — 왜/무엇을 위해").
- 타입이 말하는 것을 반복하지 않는다. 번역투 금지. `//nolint`·원시 SQL·타임아웃 값에는 근거를 남긴다.
- 고루틴을 띄우는 함수에는 **소유권·종료 조건**을 적는다. 에러 문자열은 소문자·무마침표.
- 죽은 주석 금지 — 코드가 바뀌면 주석도 동기화. 흐름이 7~8단계로 길면 함수를 분리한다.
- 한국어로 작성, 비밀·토큰·키 원문은 주석에도 넣지 않는다.
