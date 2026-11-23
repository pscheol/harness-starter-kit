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
| T1 | 시험 작성(RED) — `test_verify_record.py`, `test_verify_unverified.py`, `test_verify_changed.py` 5개 수정 | R3.1~R3.3 · R5.1~R5.3 | done |
| T2 | 모듈 시험 · 미검증(`verify_planner.py` · `verify_modules.py`), `.go` 패키지 시험 | R3.1 · R3.2 | done |
| T3 | 실행기 시각 · 시험 수 · 0개 실행 미검증 | R3.2 · R5.2 | done |
| T4 | 요약 §3.3 형식 | R3.2 · R3.3 | done |
| T5 | `verify_record.py`(기록 · 원자적 쓰기 · `--tee` · `--status`) | R5.1 · R5.2 | done |
| T6 | `verify-entry.sh` 기록기 감싸기 · 차단 기록, `verify-changed.py` 기록 | R5.1 | done |
| T7 | full 권고 문장 교체(`verify_planner` · `verify_runner` · `verify_changes` · `verify-gate.sh` · `verify-entry.sh` · 스택 `verify.sh`) | R3.3 | done |
| T8 | `.gitignore` 템플릿 `.agents/state/` | R5.3 | done |
| T9 | 설치본 시험 통과(GREEN), 문구 검사, 생성물 일치 | — | done |

## 검증 기록

- T1 RED: python 스택 설치본에서 `test_verify_*.py` 112개 중 실패 14 · 오류 11(새 시험 22개, 고친 시험 5개 중 25개).
- T2~T8 GREEN: 같은 묶음 112개 통과.
  - `test_verify_record.py` 11개: changed 기록 스키마 · 임시 파일 없음 · `.gitignore` `*`, affected 모듈, fast · full이 기록기를 거쳐도 출력이 같고 `::harness-exit`가 보이지 않는다 · 단계 2개(구조 passed, 린트 failed), `previous` 레벨별, 쓰기 실패여도 exit code 같음(changed · fast), `--plan` 기록 없음, 에이전트 세션 full → `blocked` · exit 3, `trigger` · `harness` 판정, 오류 실행 → `incomplete`, 256KB 상한, 설치본 `.gitignore`의 `.agents/state/`.
  - `test_verify_unverified.py` 11개: Python · Gradle · Go · pnpm 모듈 시험, 모듈 시험 없음 → `unverified` · exit 2 · 명령 0개, 0개 실행 → `zero-tests`, 빌드 계약 → `--affected` 안내, 요약 넓힘 · 미검증 줄, 런타임 없음은 `incomplete`.
- 회귀: 설치본 `scripts/tests` 전체 320개 통과.
- 문구: `/tmp/hk7-test_template_wording.py`(커밋하지 않음) 결과에서 이 이슈 파일은 0줄. 남은 4줄은 HK-3 담당 파일(`_spec-templates/{design,tasks}/_template.md`, `hooks/session-start.sh`)이다.
- `node scripts/gen-plugins.mjs --check`: 생성물 일치, 파일 487개.
