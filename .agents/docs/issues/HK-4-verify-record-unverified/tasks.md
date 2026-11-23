---
key: HK-4
area: verify
type: feat
title: 검증 실행 기록을 남기고, 테스트를 못 찾으면 full 대신 모듈로 넓히거나 미검증으로 보고한다
state: active
created: 2026-11-23
---

# Tasks — HK-4

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험 작성(RED) — `test_verify_record.py`, `test_verify_changed.py` R3 | R3.1~R3.3 · R5.1~R5.3 | todo |
| T2 | 모듈 시험 · 미검증(`verify_planner.py` · `verify_modules.py`), `.go` 패키지 시험 | R3.1 · R3.2 | todo |
| T3 | 실행기 시각 · 시험 수 · 0개 실행 미검증 | R3.2 · R5.2 | todo |
| T4 | 요약 §3.3 형식 | R3.2 · R3.3 | todo |
| T5 | `verify_record.py`(기록 · 원자적 쓰기 · `--tee` · `--status`) | R5.1 · R5.2 | todo |
| T6 | `verify-entry.sh` 기록기 감싸기 · 차단 기록, `verify-changed.py` 기록 | R5.1 | todo |
| T7 | full 권고 문장 교체(`verify_planner` · `verify_runner` · `verify_changes` · `verify-gate.sh` · `verify-entry.sh` · 스택 `verify.sh`) | R3.3 | todo |
| T8 | `.gitignore` 템플릿 `.agents/state/` | R5.3 | todo |
| T9 | 설치본 시험 통과(GREEN), 문구 검사, 생성물 일치 | — | todo |

## 검증 기록

(작업 후 기록)
