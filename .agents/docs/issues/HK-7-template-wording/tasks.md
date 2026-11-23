---
key: HK-7
area: templates
type: docs
title: 킷 템플릿에서 에이전트에게 full을 지시하는 문장을 없앤다
state: completed
created: 2026-11-23
---

# Tasks — HK-7

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 담당 파일 문장 고치기 | R6.1 | done |
| T2 | `sync-commands.sh --check`(스킬 포인터 일치) | — | done |
| T3 | HK-3 · HK-4/5 병합 뒤 `tests/test_template_wording.py`(0건) | R6.1 · R6.2 | done |
| T4 | 세션 시작 출력 바이트가 v1.0.8 이하인지(HK-3 결과로) | R6.3 | done |

## 검증 기록

- T3: HK-3 · HK-4/5/6 병합(`262fd40`) 뒤 `tests/test_template_wording.py` 2개 통과 — 에이전트에게 full을 지시하는 문장 0건, tasks · design 템플릿 칸이 "affected 결과 · CI full 링크".
- T4: 세션 시작 고정 안내 1,517 → 1,422바이트(HK-3, `test_session_hooks`가 1,517 이하를 시험한다). README 원칙 10의 "v1.0.8 이하"를 지킨다.
