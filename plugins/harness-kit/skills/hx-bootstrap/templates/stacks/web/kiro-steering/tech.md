---
inclusion: always
---
<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 기술 스택 · 실행 (포인터)

원본: `.agents/rules/tech.md` — Claude·Codex·Kiro 공통. 빌드·구조·스택 변경 전 연다. 의존성·버전 기준은 `package.json`(+락파일 커밋). 구체 버전은 예시이며 프로젝트에서 확정한다.

요약:

- TypeScript(strict) · React · 프로젝트가 고른 번들러/프레임워크. 패키지 매니저는 락파일과 일치하는 하나만 쓴다.
- ESLint(+ import 경계 규칙) · Prettier · 타입 검사 · 테스트 러너 · E2E.
- **강제 수단은 타입 strict + ESLint 경계 규칙 두 가지뿐이다.** 규칙에 등록하지 않은 경계는 없는 경계다.
- 검증 게이트 `bash scripts/verify.sh`(= 구조 점검 → 포맷 → lint → typecheck → 가드 → test → build).
- package.json 스크립트 이름을 게이트가 부른다: `lint` · `typecheck` · `test` · `build`(+ `format:check`).
