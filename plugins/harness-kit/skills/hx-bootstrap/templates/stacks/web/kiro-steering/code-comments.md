---
inclusion: fileMatch
fileMatchPattern: '**/*.ts|**/*.tsx|**/*.js|**/*.jsx|**/*.css|**/*.scss'
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 주석 표준 (포인터)

원본: `.agents/rules/code-comments.md` — Claude·Codex·Kiro 공통. 문체는 `.agents/rules/writing-style.md`.

요약:

- **TSDoc 규약**: `/** */` 로 선언 바로 위. export 되는 컴포넌트·훅·유틸에 한 줄. 타입이 말하는 것은 반복하지 않는다.
- 그 한 줄로 충분하면 멈춘다. 더 쓰는 경우는 Why·함정·외부 근거·억제 이유·복잡한 함수의 절차, 이 다섯뿐이다.
- props 나열·단순 표현 컴포넌트·매퍼·상수 객체에는 설명 주석을 달지 않는다. 규칙 문서 참조 주석은 삭제.
- **effect** 에는 무엇을 왜 정리하는지 적는다. 의존성 배열에서 값을 뺐으면 왜 안전한지 적는다.
- `eslint-disable`·`@ts-expect-error`·하드코딩된 지연 시간·`z-index` 값에는 이유를 남긴다.
- CSS 매직 값은 근거만 적는다(층 순서·브라우저 우회). 색·간격 하드코딩은 왜 토큰이 아닌지를 남긴다.
- 단계별 `처리 흐름:` 은 분기가 얽히거나 순서를 바꾸면 깨지는 함수에만. 5단계 이내.
- 코드가 바뀌면 주석도 고치거나 지운다. 거짓 주석은 없는 것보다 나쁘다.
