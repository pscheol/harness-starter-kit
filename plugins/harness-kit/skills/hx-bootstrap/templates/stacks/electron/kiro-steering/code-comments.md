---
inclusion: fileMatch
fileMatchPattern: '**/*.ts|**/*.tsx|**/*.js|**/*.jsx|**/*.css|**/*.scss'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 주석 표준 (포인터)

원본: `.agents/rules/code-comments.md` — Claude·Codex·Kiro 공통. 문체는 `.agents/rules/writing-style.md`.

요약:

- **TSDoc 규약**: `/** */` 로 선언 바로 위. export 되는 컴포넌트·훅·유틸·핸들러에 한 줄. 타입이 말하는 것은 반복하지 않는다.
- 그 한 줄로 충분하면 멈춘다. 더 쓰는 경우는 Why·함정·외부 근거·억제 이유·복잡한 함수의 절차, 이 다섯뿐이다.
- **IPC 핸들러에는 신뢰 수준과 부작용**을 적는다 — 렌더러 입력을 어떻게 검증하는가, 무엇이 바뀌는가, 되돌릴 수 있는가.
- **공유 모듈**에는 제약을 못박는다 — "렌더러가 함께 import 한다. 런타임 Node API 금지".
- **플랫폼 분기**에는 왜 그 OS 만 다른지 적는다. 코드에는 조건만 남고 이유가 사라진다.
- 리스너·워처·워커에는 정리 시점과 수명을 적는다(창보다 오래 사는 것에 특히).
- props 나열·단순 표현 컴포넌트·매퍼·상수 객체에는 설명 주석을 달지 않는다.
- `eslint-disable`·`@ts-expect-error`·하드코딩된 경로·지연 시간에는 이유를 남긴다.
- 코드가 바뀌면 주석도 고치거나 지운다. 거짓 주석은 없는 것보다 나쁘다.
