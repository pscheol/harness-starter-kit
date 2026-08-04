---
inclusion: fileMatch
fileMatchPattern: '**/*.py|**/*.sql'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 주석 표준 (포인터)

정본: `.agents/rules/code-comments.md` — Claude·Codex·Kiro 공통. **로직 함수 작성/수정 전 이 정본을 연다.**

요약:
- 코드는 라인 단위 What/How, 주석은 Why. 로직 함수 docstring은 **책임 한 줄 + 처리 흐름**(각 단계에 "무엇을 — 왜/무엇을 위해").
- **타입 힌트가 계약을 담는다** — `Args:`/`Returns:`로 타입을 반복하지 않는다. 타입이 못 담는 의미만 적는다.
- 번역투 금지. `# type: ignore`·`# noqa`·`to_thread`·원시 SQL에는 근거를 남긴다.
- 죽은 주석 금지 — 코드가 바뀌면 docstring도 동기화. 흐름이 7~8단계로 길면 함수를 분리한다.
- 한국어로 작성, 비밀·토큰·키 원문은 주석에도 넣지 않는다.
