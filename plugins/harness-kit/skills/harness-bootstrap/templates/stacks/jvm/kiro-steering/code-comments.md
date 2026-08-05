---
inclusion: fileMatch
fileMatchPattern: '**/*.kt|**/*.java|**/*.sql|**/*.yml|**/*.yaml'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 주석 표준 (포인터)

원본: `.agents/rules/code-comments.md` — Claude·Codex·Kiro 공통. 문체는 `.agents/rules/writing-style.md`.

요약:

- 기본은 **주석 없음**. Why·함정·외부 근거·억제 이유, 이 넷일 때만 쓴다.
- CRUD·getter·위임·매퍼·DTO·설정 클래스에는 달지 않는다. 시그니처 받아쓰기와 규칙 문서 참조 주석은 삭제.
- 단계별 `처리 흐름:`은 **예외**다 — 순서를 바꾸면 버그가 나는 함수에만, 5단계 이내로.
- yml·SQL은 한 줄까지. 값의 근거(왜 이 숫자·왜 이 조인)만 적고 키 이름·구문은 설명하지 않는다.
- `@param`/`@return`은 타입이 못 담는 의미만. 어노테이션·옵티마이저 힌트는 근거가 있을 때만.
- 코드가 바뀌면 주석도 고치거나 지운다. 한국어로 쓰고, 비밀·토큰·키 원문은 넣지 않는다.
