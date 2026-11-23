---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 프로세스 + 기능 슬라이스 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:

- 프로세스 경계(main · preload · renderer · shared) 위에 기능 슬라이스를 얹는다.
- **한 기능 = 세 경로**: `main/features/<f>` · `renderer/features/<f>` · `shared/features/<f>`. **이름을 같게 유지한다.**
- `shared/features/<f>/contract.ts` 가 기능의 **공개 표면**(채널 상수·스키마·타입). 계약을 다른 곳에 두지 않는다.
- `main/features/<f>/ipc.ts` 는 `register(deps)` 하나를 내보내고 `main/index.ts` 가 호출한다(중복 `handle` 방지).
- 기능 안 방향은 `ipc → service → store`. **저장 파일도 기능이 소유**한다.
- **기능 간 직접 import 금지** — contract 경유 · index 조립 주입(기본) · 이벤트 중 하나. 렌더러는 앱 셸에서 조립.
- `main/platform`·`main/window`·`renderer/components` 는 기능을 모른다(역참조 금지).
- `shared` 에 런타임 Node API 금지. 렌더러는 `electron`·`fs`·`path` 를 import 하지 않는다.
- 강제는 넷: 게이트의 경계 가드(fast 포함) · ESLint(프로세스 방향 + 기능 독립) · 타입 strict · 세 타깃 빌드.
- 새 기능은 **계약 먼저** → service → ipc → preload → renderer 순.
