---
inclusion: fileMatch
fileMatchPattern: '**/*.py|**/*.sql|**/*.yml|**/*.yaml'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 주석 표준 (포인터)

원본: `.agents/rules/code-comments.md` — Claude·Codex·Kiro 공통. 문체는 `.agents/rules/writing-style.md`.

요약:

- 기본은 **주석 없음**. Why·함정·외부 근거·억제 이유·복잡한 함수의 절차, 이 다섯일 때만 쓴다.
- CRUD·`@property`·위임·매퍼·Pydantic 스키마·설정 모듈에는 달지 않는다. 규칙 문서 참조 주석은 삭제.
- 타입 힌트가 말하는 것을 `Args:`/`Returns:`로 반복하지 않는다. 타입이 못 담는 의미만 적는다.
- 단계별 `처리 흐름:`은 분기가 얽혀 절차가 안 잡히거나, 순서를 바꾸면 버그가 나는 함수에 쓴다. 5단계 이내.
- yaml·SQL은 한 줄까지. 값의 근거(왜 이 숫자·왜 이 조인)만 적고 키 이름·구문은 설명하지 않는다.
- `# type: ignore`·`# noqa`·`to_thread`·원시 SQL에는 이유를 남긴다.
- 코드가 바뀌면 docstring도 고치거나 지운다. 한국어로 쓰고, 비밀·토큰·키 원문은 넣지 않는다.
