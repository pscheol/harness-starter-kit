---
inclusion: always
---
<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 기술 스택 · 실행 (포인터)

원본: `.agents/rules/tech.md` — Claude·Codex·Kiro 공통. 빌드·구조·스택 변경 전 연다. 의존성·버전 기준은 `package.json`(+락파일 커밋). 구체 버전은 예시이며 프로젝트에서 확정한다.

요약:

- Electron + TypeScript(strict) + React. 프로세스는 main · preload · renderer 셋이고 각각 따로 번들된다.
- **Electron 버전을 최신 안정선으로 유지한다** — Chromium 보안 패치가 이 경로로 들어온다.
- ESLint(+ import 경계 규칙) · Prettier · 타입 검사 · 테스트 러너 · E2E · electron-builder(패키징).
- 강제 수단은 셋: 타입 strict · ESLint 경계 규칙 · **게이트의 프로세스 경계 가드**(verify.sh).
- 검증 게이트 `bash scripts/verify.sh`(= 구조 점검 → 포맷 → **경계 가드** → lint → typecheck → 가드 → test → build).
- package.json 스크립트 이름을 게이트가 부른다: `lint` · `typecheck` · `test` · `build`(+ `format:check`).
- 패키징·코드 서명은 게이트가 아니라 릴리스 절차다(서명 비밀·OS 별 러너 필요).
