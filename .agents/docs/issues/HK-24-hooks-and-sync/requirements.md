---
key: HK-24
area: hooks
type: feat
title: hooks.json에서 하네스별 훅을 만들고, worktree를 따라가며, 복사본을 원본과 맞춘다
status: approved
created: 2026-11-23
---

# Requirements — HK-24 훅 · 동기화 (P18 둘째 조각)

근거: [설계 03](../../../../docs/design/03-projection-and-hooks.md) R2.1~R2.3 · R4.1 · R4.3 · R5.1 · R5.2 · R6.1, §3.4 · §3.10 · §3.11 · §3.12, [README 원칙 10](../../../../docs/design/README.md), [06 §3.18](../../../../docs/design/06-dashboard.md)(hook-output.jsonl).

- **R1** 훅은 `.agents/hooks.json`에 한 번 적고, 하네스별 설정(Claude `settings.json` · Codex `hooks.json` · Kiro IDE `.kiro/hooks/` · Kiro CLI 에이전트 `hooks`)은 거기서 `merge` · `render`로 만든다. 킷 항목은 `harness-` id로 찾고 다른 도구의 항목과 순서는 그대로 둔다(R2.1 · R2.2). 모듈 훅은 모듈을 켤 때만(R2.3).
- **R2** 모든 킷 훅은 `scripts/hooks/dispatch.sh`를 거치고, `hook_root.py`가 입력의 `cwd`에서 위로 올라가 하네스 루트(`harness-kit.json` 또는 `harness.json`)를 정한다. worktree 세션의 Stop 훅은 그 worktree를 검증한다(R5.1 · R5.2, §3.10).
- **R3** 동기화 훅 `harness-sync-projection`(PostToolUse)이 `.agents/skills|rules|roles` 원본을 고치면 복사본 · 생성물을 다시 만든다(Python, TS 어댑터와 같은 결과를 같은 fixture로 시험). 성공 출력 0바이트. 보호 훅 `harness-protect-generated`(PreToolUse)가 생성 파일 직접 편집을 막고 원본 경로를 알린다(R4.1 · R4.3, §3.12).
- **R4** 업그레이드 공지는 제목 한 줄 + 경로만 붙이고, 본문은 상태 예산 안에서만(§3.11).
- **R5** 세션 시작 훅 출력 합계 2,560바이트 이하(고정 1,024 · 단위 1,024 · 상태 512)를 훅이 지키고, 킷 훅은 실행마다 `.agents/state/hook-output.jsonl`에 `{at, event, hook, bytes, truncated}`를 남긴다(내용 없음).
- **R6** HK-2 full 차단 훅과 기존 훅(session-start · protect-sources · verify-gate)이 hooks.json 체계로 옮겨진 뒤에도 같은 시험을 통과한다.
