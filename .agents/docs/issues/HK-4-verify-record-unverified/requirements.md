---
key: HK-4
area: verify
type: feat
title: 검증 실행 기록을 남기고, 테스트를 못 찾으면 full 대신 모듈로 넓히거나 미검증으로 보고한다
status: approved
created: 2026-11-23
---

# Requirements — HK-4 실행 기록 · 테스트를 못 찾을 때 (v1.1)

근거: [설계 01 R3 · R5 · §3.3 · §3.5](../../../../docs/design/01-v1.1-verify-and-issues.md).

- **R5.1** `verify.sh`는 레벨과 상관없이 끝날 때 `.agents/state/verify-last.json`을 원자적으로 쓴다(임시 파일 → rename).
- **R5.2** 기록에는 단계마다 명령 · 시작 시각 · 걸린 시간(ms) · exit code · 상태가 있다(형식은 §3.5).
- **R5.3** `.agents/state/`는 `.gitignore`에 있다.
- **R3.1** changed 레벨이 코드 파일에 연결된 테스트를 찾지 못하면, 그 파일이 속한 모듈 하나의 테스트 명령을 더하고 `widened`에 남긴다.
- **R3.2** 모듈 테스트도 없거나 실행된 테스트가 0개면 그 파일을 `unverified`로 보고하고 상태 `incomplete`, exit 2로 끝낸다.
- **R3.3** 게이트 출력 · 권고 문구에 full을 권하는 문장이 없다.
