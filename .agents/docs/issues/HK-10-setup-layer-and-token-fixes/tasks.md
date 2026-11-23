---
key: HK-10
area: install
type: fix
title: setup.sh의 층 겹침 순서와 치환값 특수 문자를 고친다
state: active
created: 2026-11-23
---

# Tasks — HK-10

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN). setup.sh와 CLI는 같은 커밋에서 바꾼다(R10.3).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | 시험 작성(RED): 동일성 #25 · #26과 새 시험 3개, install 시험 2개, CLI 시험 기대값 | R10.1~R10.3 | 실패 수 기록 | todo |
| T2 | `harness-lib.sh` 후보 · 뒤 레이어 우선 함수, setup.sh · update.sh 적용 | R10.1 | install 시험 | todo |
| T3 | `platform-guards` 모듈 4파일을 common 판으로 | R10.1 | 바이트 비교 | todo |
| T4 | `layout.json` `overlap: last` · CLI 시험 | R10.1 · R10.3 | `pnpm -C packages/cli test` | todo |
| T5 | `harness_subst` awk 리터럴 · `harness_json_str` · `harness_load_tokens` | R10.2 | install · 동일성 시험 | todo |
| T6 | 생성(`pnpm build` · `gen-plugins.mjs`) · 동일성 26조합 · 전체 시험 | R10.3 | `Ran N tests … OK` | todo |

## 검증 기록

(구현하며 채운다)
