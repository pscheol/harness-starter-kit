---
key: HK-15
area: worktree
type: feat
title: worktree 운영 — 리포 옆 폴더 · 둘째 세션부터 · 리포당 3개 · 끝나면 지움
status: approved
created: 2026-11-23
---

# Requirements — HK-15 worktree 운영 (P19)

근거: [설계 05](../../../../docs/design/05-worktree.md) §2 요구사항 전부 · §3, 결정 D5. 사용자 요청: "복붙 worktree 지양, 용량 · 경로 · IDE 문제, 폴더 위치 관리".

- 설계 05 §2의 요구사항 전부: `scripts/harness/worktree.py new|list|open|done|gc`, 자리 `../<리포>.worktrees/<키>-<이름>/`(submodule 리포는 도메인 단위), 둘째 쓰기 세션부터 만든다, 리포당 3개 상한, `--docs` sparse checkout, 공유 캐시, IDE 설정(VS Code · IntelliJ), `done`은 clean · push · 다른 세션 미사용 확인 뒤 지운다, `gc --apply`는 사람이 시킬 때만, Claude `WorktreeCreate` · `WorktreeRemove` 훅.
- worktree 안 세션의 훅이 그 worktree를 본다(HK-24 hook_root).
- 킷은 모델을 부르지 않는다.
