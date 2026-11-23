---
inclusion: fileMatch
fileMatchPattern: '**/*.go|**/*.sql|**/*.yml|**/*.yaml'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 주석 표준 (포인터)

원본: `.agents/rules/code-comments.md` — Claude·Codex·Kiro 공통. 문체는 `.agents/rules/writing-style.md`.

요약:

- **Go doc 규약**: `//` 로 선언 바로 위, 선언 이름으로 시작(`// CreateOrder는 ...`). exported 식별자에는 한 줄 doc comment. 패키지 주석은 `// Package <name> ...`.
- 그 한 줄로 충분하면 거기서 멈춘다. 더 쓰는 경우는 Why·함정·외부 근거·억제 이유·복잡한 함수의 절차, 이 다섯뿐이다.
- CRUD·접근자·위임·매퍼·DTO·설정 구조체에는 설명 주석을 달지 않는다. 규칙 문서 참조 주석은 삭제.
- 단계별 `처리 흐름:`은 분기가 얽혀 절차가 안 잡히거나, 순서를 바꾸면 버그가 나는 함수에 쓴다. 5단계 이내.
- yml·SQL은 한 줄까지. 값의 근거(왜 이 숫자·왜 이 조인)만 적고 키 이름·구문은 설명하지 않는다.
- 고루틴을 띄우는 함수에는 **소유권·종료 조건**을 적는다. 에러 문자열은 소문자·무마침표.
- `//nolint`·원시 SQL·타임아웃 값에는 이유를 남긴다. 코드가 바뀌면 주석도 고치거나 지운다.
