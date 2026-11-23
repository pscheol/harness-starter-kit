---
key: HK-16
area: verify
type: feat
title: 오픈소스 정적 분석 · SARIF · 새 문제만 막는 품질 게이트 · CI 템플릿
state: active
created: 2026-11-23
---

# Tasks — HK-16

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험 작성(RED): SARIF · 지문 · 변환기 · 게이트 · 레벨 · verify 연결 · CI 템플릿 · base 판 | 전부 | todo |
| T2 | `sarif/normalize.py` · `sarif_io.py` · 변환기 넷 | VQ-R8 · R10 | todo |
| T3 | `quality_config.py` · `quality_select.py` · `quality_run.py`(실행 · 산출물 · 요약) | VQ-R5 · R6 · R7 · R8 · R18 | todo |
| T4 | `quality_baseline.py` · `quality_gate.py` · `quality_git.py` · 지표 | VQ-R9 · R10 · R19 | todo |
| T5 | `quality.py` CLI, verify-changed.py · verify-entry.sh 연결(fast · full · Stop 훅) | VQ-R5 · R7 | todo |
| T6 | `--from-base` · `--bootstrap`, `verify_sources.py`, 플래너 경로 | VQ-R11 | todo |
| T7 | 템플릿: `analyzers.json` ×5 · `quality-gate.json` · CI 셋 · `harness-setup` ×5 · 옛 `verify.yml` 삭제 | VQ-R16 · R18 | todo |
| T8 | `/hx-scan` 스킬 · 포인터 생성 | §3.2 | todo |
| T9 | 생성 · 설치본 시험 통과(GREEN), 실제 도구 스모크, 전체 시험 | — | todo |

## 검증 기록
