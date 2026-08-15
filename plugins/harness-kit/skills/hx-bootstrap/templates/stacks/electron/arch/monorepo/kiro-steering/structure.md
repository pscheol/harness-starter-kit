---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 워크스페이스 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:

- `apps/{desktop,web}` + `packages/{core,ui}`. 의존 방향은 **apps → packages 단방향**.
- **`packages/core` 는 Electron 도 DOM 도 모른다.** 이 순수성이 구조 전체의 근거다.
  플랫폼이 필요하면 core 가 **인터페이스만 선언**하고 앱이 구현을 주입한다.
- `packages/ui` 는 DOM 을 알아도 되지만 Electron 은 모른다(웹에서도 그대로 쓰인다). 디자인 토큰은 여기 한 벌만.
- **가장 강한 강제는 `package.json` 의 `dependencies`** — core 에 `electron` 을 넣지 않으면 import 자체가 안 된다.
- `apps/desktop/src/shared`(IPC 계약)와 `packages/core`(도메인 로직)는 다른 것이다.
- 데스크톱 내부 프로세스 규약(main·preload·renderer)은 단일 앱 변형과 동일하다.
- 패키지는 `exports` 로만 열린다. 내부 경로 직접 import 금지. 참조는 패키지 이름으로.
- **"나중에 공유할 것 같아서" 올리지 않는다.** 앱에서 시작해 나중에 올린다(내리는 비용이 더 크다).
- 게이트는 **두 앱 모두 빌드**해야 통과다. 한 앱만 빌드하면 공유 코드 오염을 놓친다.
- 루트 `package.json` 에 런타임 의존성 금지. 락파일은 루트 하나.
