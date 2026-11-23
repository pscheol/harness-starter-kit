---
key: HK-11
area: cli
type: feat
title: CLI update(3방향 비교) · repair · uninstall
state: active
created: 2026-11-23
---

# Tasks — HK-11

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | 단위 시험 작성(RED): `update.test.ts` · `repair.test.ts` · `uninstall.test.ts`, `cli.test.ts` 예약 목록 | R3.1~R3.4 · R5.1 · R6.1 · R8.2 | 실패 수 기록 | todo |
| T2 | `tests/test_cli_update_parity.py` 작성(RED) | R7.2 · R3.2 | 실패 수 기록 | todo |
| T3 | core: `installed` · `update-plan` · `remove`, `plan` · `meta` · `selection` 손질 | R3.1~R3.3 · R5.1 · R6.1 | 단위 시험 | todo |
| T4 | 명령: `update` · `repair` · `uninstall`, 인자 · 등록 · 안내 문구 | R3.4 · R6.1 · R8.2 | 단위 시험 | todo |
| T5 | 동일성 시험 GREEN(조합 6개) | R7.2 · R3.2 | 시험 통과 | todo |
| T6 | 번들 · 플러그인 생성물 갱신 | — | `gen-plugins.mjs --check` 일치 | todo |
| T7 | 전체 시험 | — | `Ran N tests … OK` | todo |

## 검증 기록

(구현하면서 채운다)
