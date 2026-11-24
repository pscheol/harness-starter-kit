---
key: HK-6
area: verify
type: feat
title: 다층 리포의 상위 게이트가 바뀐 도메인만 부른다
status: approved
created: 2026-11-23
---

# Requirements — HK-6 다층 리포 상위 게이트 (v1.1)

근거: [설계 01 R4 · §3.4](../../../../docs/design/01-v1.1-verify-and-issues.md). knots(루트 + 도메인 submodule 8개)에서 루트 게이트가 모든 도메인을 차례로 돌아 시간이 늘었다.

- **R4.1** 루트 게이트를 changed · affected로 부르면 변경이 있는 도메인의 게이트만 부른다.
- **R4.2** 도메인 변경 판정(하나라도 참): 루트 diff의 submodule 포인터 변경, submodule 작업 트리 변경, submodule HEAD에 원격 base에 없는 커밋, 도메인 경로 아래 루트 파일 변경.
- **R4.3** 부르지 않은 도메인은 `↷ <id> 건너뜀 — 변경 없음` 한 줄로 출력한다.
- **R4.4** fast · full은 모든 도메인을 부른다.
- **R4.5** 상위 게이트가 하위 단위를 부를 때 `HARNESS_VERIFY_PARENT`를 설정한다(HK-2 보조 점검이 하위의 full을 막지 않도록).
