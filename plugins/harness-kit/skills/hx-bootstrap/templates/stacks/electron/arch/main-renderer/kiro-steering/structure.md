---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 프로세스 + 레이어 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:

- 1차 축은 프로세스: `src/main`(Node 권한) · `src/preload`(다리) · `src/renderer`(웹·권한 없음) · `src/shared`(타입·상수).
- main 내부 레이어: `ipc`(얇게) → `service`(도메인) → `store`·`external` → `platform`(Electron 어댑터).
- **`service` 는 Electron 을 모르는 것이 이상적**이다 — 그래야 테스트에서 Electron 을 흉내 낼 필요가 없다.
- **`shared` 에 런타임 Node API 금지.** 렌더러가 함께 import 하므로 번들이 깨진다.
- preload 는 **동작 단위로 좁게** 노출한다. 채널 이름을 인자로 받지 않고, 구독은 해제 함수를 반환한다.
- 렌더러는 `electron`·`fs`·`path`·`child_process` 를 import 하지 않는다. `renderer/ipc` 데이터 접근 계층을 경유한다.
- 채널 상수는 `shared/channels.ts` 한 곳(`<도메인>:<동작>`). 오류는 `{ ok, code, message }` 형태로 통일.
- 강제는 넷: **게이트의 경계 가드(fast 포함)** · ESLint import 규칙 · 타입 strict · 세 타깃 빌드.
- 새 기능은 **계약 먼저** → service → ipc → preload → renderer 순으로 만든다.
