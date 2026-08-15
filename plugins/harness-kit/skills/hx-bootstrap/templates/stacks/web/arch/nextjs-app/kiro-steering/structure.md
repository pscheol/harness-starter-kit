---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 서버/클라이언트 경계 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 화면 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:

- Next.js App Router: `app/`(라우팅·조립만) · `src/server/`(데이터·비밀) · `src/features/` · `src/components/` · `src/lib/`.
- **기본은 서버 컴포넌트.** `'use client'` 는 상호작용이 필요한 잎에만 — 위로 올릴수록 번들이 커진다.
- `src/server/**` 진입 파일에 `import 'server-only'`. 클라이언트가 import 하면 **빌드가 실패한다**(유일한 컴파일 강제).
- 서버 → 클라이언트 props 는 HTML 에 직렬화돼 실린다. 보여줄 필드만 넘긴다(엔티티 통째 금지).
- 비밀은 `src/server/config` 에서만. 공개 접두사 변수는 브라우저 번들에 인라인된다.
- 나머지 경계(`components`→`features` 금지, `lib` 순수 유지)는 **ESLint `no-restricted-imports` 에 등록해야** 강제된다.
- 라우트 핸들러·서버 액션은 공개 엔드포인트다. 입력 파싱 + 권한 재판정 필수.
- 새 화면은 `page`·`loading`·`error` 를 함께 만들고 네 상태(loading·empty·error·partial)를 처음부터 만든다.
