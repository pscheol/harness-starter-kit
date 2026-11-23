---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · SPA 레이아웃 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 화면 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:

- `src/app`(라우터·프로바이더·전역) · `pages`(조립) · `features` · `components`·`hooks`(공용) · `api`(네트워크 출입구) · `lib`(순수).
- **라우트 선언은 `app/routes.tsx` 한 곳.** 흩뿌리면 코드 스플리팅 지점이 사라진다. 라우트 단위 지연 로드가 기본.
- **네트워크 출입구는 `src/api` 한 곳.** 컴포넌트에서 `fetch` 금지, 엔드포인트 문자열 하드코딩 금지.
- 응답은 스키마로 파싱한다. 서버 상태는 쿼리 라이브러리가 소유하고 캐시 키에 사용자 스코프를 넣는다.
- 공용 UI·훅은 도메인과 네트워크를 모른다. `lib` 은 앱 모듈에 의존하지 않는다.
- **서버가 없어 컴파일 강제 장치가 없다** — 경계는 ESLint `no-restricted-imports` 와 타입 strict 뿐이다. 등록 누락 = 강제 누락.
- 라우트 가드는 UX 다. 권한 판정은 서버가 한다. 환경변수는 전부 번들에 실린다(비밀 금지).
- 새 화면은 네 상태(loading·empty·error·partial)를 처음부터 만든다.
