---
key: HK-11
area: cli
type: feat
title: CLI update(3방향 비교) · repair · uninstall
status: approved
created: 2026-11-23
---

# Requirements — HK-11 CLI update · repair · uninstall (P17 둘째 조각)

근거: [설계 02](../../../../docs/design/02-cli-engine.md) R3.1~R3.3 · R5.1 · R6.1, §3.9 · §3.10 · §3.12 · §3.13. 앞 조각: [HK-8](../HK-8-cli-engine-core/requirements.md).

- **R3.1** `update`는 킷이 깐 뒤 사람이 고치지 않은 파일만 새 판으로 바꾸고, 고친 파일은 `<경로>.new`로 옆에 둔다(§3.10 표). `--accept-all`이면 고친 파일을 `.bak`으로 옮기고 새 판을 쓴다.
- **R3.2** `update`는 v1 lock(TSV)과 v1 메타를 읽어 lock v2 · 메타 v2로 쓴다. setup.sh로 깐 리포를 CLI로 올릴 수 있다.
- **R3.3** `update`는 주인이 `user` · `external:*`인 파일과 팩 파일(`--packs`가 아닐 때)을 쓰지 않는다. `--forget <경로>`는 그 경로를 `user` · `none`으로 바꿔 다음부터 받지 않는다. `--prune`은 킷에서 빠진 미수정 파일을 지운다.
- **R3.4** `update --dry-run`은 판정 목록만 낸다. conflict가 있으면 exit 4와 `diff -u` 명령 목록을 낸다.
- **R5.1** `repair`는 `missing` · 생성물의 `drifted` · `stale` · 병합 키 누락을 되돌리고, 사람이 고친 템플릿 복사 파일(`copy`)은 건드리지 않는다. lock `kit.version`과 CLI 버전이 다르면 `missing`(copy)을 다시 쓰지 않고 `update`를 안내한다.
- **R6.1** `uninstall`은 킷 소유이면서 고치지 않은 파일을 지우고, 고친 파일은 남기고 목록과 exit 4를 낸다. `user` · `external:*`는 남긴다. TTY면 지울 목록을 보이고 확인을 받는다.
- **R7.2** setup.sh로 깐 리포에 `update`를 돌린 결과가 update.sh를 돌린 결과와 같다(동일성 시험, lock · 메타 제외). 사람이 고친 파일이 있는 경우를 포함한다.
- **R8.2** 세 명령 모두 `--json`을 받는다. 킷은 모델을 부르지 않는다.
