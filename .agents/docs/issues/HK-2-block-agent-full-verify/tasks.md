---
key: HK-2
area: verify
type: feat
title: 에이전트 세션의 전체 검증(full)을 훅으로 막는다
state: active
created: 2026-11-23
---

# Tasks — HK-2

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험 작성(RED) | R2.1~R2.7 | done |
| T2 | `block_full_verify.py` · `block-full-verify.sh` | R2.1 · R2.3 · R2.4 · R2.7 | done |
| T3 | `verify-entry.sh` 보조 점검 | R2.6 | done |
| T4 | 하네스 네 곳 등록 | R2.5 | done |
| T5 | 생성 · 설치본 시험 통과(GREEN), 전체 시험 | — | todo |

## 검증 기록

- T1 RED: 설치본에서 11개 중 실패 2 · 오류 9(훅 파일 없음).
- T2~T4 GREEN: 설치본(python 스택)에서 `test_block_full_verify.py` 11개 통과.
  - 막음 6종, 통과 6종, 셸 아닌 도구 무시, Kiro 셸 도구 이름 3종, 해석 실패 3종 통과, 설정 끄기, 메타 없음 · 깨짐 → 막음.
  - 안내 문구 검사, `--entry-check` 5가지 환경 조합.
  - 설치본 `CLAUDECODE=1 bash scripts/verify.sh --full` → exit 3(본문을 돌지 않음).
  - 하네스 네 곳 등록 확인.
