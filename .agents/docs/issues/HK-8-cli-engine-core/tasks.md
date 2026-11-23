---
key: HK-8
area: cli
type: feat
title: npx harness-kit CLI의 뼈대와 init · plan · doctor · list를 만든다
state: active
created: 2026-11-23
---

# Tasks — HK-8

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | `packages/cli` 골격: package.json · tsconfig · build.mjs · src-hash · `pnpm install` · `.gitignore` · 루트 scripts | R1.2 | `pnpm -C packages/cli build` | todo |
| T2 | `packages/templates/layout.json` | R2.1 | layout-lib 시험 | todo |
| T3 | 단위 시험 작성(RED) | R1.1 · R2.1~R2.4 · R4.1 · R4.2 · R8.1 | 실패 수 기록 | todo |
| T4 | `tests/test_cli_parity.py` 작성(RED) | R2.1 · R9.2 | 실패 수 기록 | todo |
| T5 | core 구현: layout · selection · tokens · resolve · plan · apply · meta · lock · json | R2.1~R2.4 | 단위 시험 | todo |
| T6 | 명령 구현: init · plan · doctor · list · 예약 명령 · 인자 · 출력 · Node 확인 | R1.1 · R2.2 · R2.3 · R4.1 · R4.2 · R8.1 | 단위 시험 | todo |
| T7 | 동일성 시험 GREEN(조합 전부) | R2.1 · R4.2 | 시험 통과 | todo |
| T8 | `gen-plugins.mjs`가 CLI 사본을 넣는다 · `test_generated.py` | R9.1 | `--check` 일치 | todo |
| T9 | 전체 시험 | — | `Ran N tests … OK` | todo |

## 검증 기록
