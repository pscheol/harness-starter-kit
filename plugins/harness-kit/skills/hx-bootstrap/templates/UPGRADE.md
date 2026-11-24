# 하네스 킷 업그레이드 공지

`harness-kit update` 가 판을 올릴 때 이전 판 초과 · 새 판 이하의 절을 모아 `.agents/harness-upgrade-notice.md` 를 만든다(설계 03 §3.11). 세션 시작 훅은 제목 한 줄과 경로만 붙이고, 본문 줄은 상태 예산(512바이트)이 남을 때만 붙인다. 절마다 800자 이하로 쓴다. 판 비교는 `-` 뒤 꼬리를 떼고 한다.

## 2.0.0

- MR 전 검증은 `bash scripts/verify.sh --affected`. full 은 CI 가 돈다(에이전트 세션의 full 은 훅이 막는다).
- 새 SDD 경로: `.agents/docs/issues/<이슈키>-<이름>/{requirements,design,tasks}.md`. 옛 `<영역>-specs/` 는 읽기 전용이다.
- 하네스 폴더(.claude · .codex · .cursor · .kiro)의 스킬 · 규칙 · 역할 · 훅은 `.agents/` 원본에서 만든 복사본이다. 원본을 고치면 동기화 훅이 다시 만든다.
- 훅 원본은 `.agents/hooks.json` 하나다. 하네스별 훅 설정은 거기서 만든다.
- 승인은 터미널 `harness-kit approve` 나 관리 페이지(PIN)로만 한다. 채팅의 말은 승인이 아니다.
- 사람이 병합할 `.new` 파일이 남았으면 `harness-kit doctor` 가 알린다.
