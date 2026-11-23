---
key: HK-5
area: verify
type: feat
title: 바꾼 모듈과 그 모듈을 쓰는 모듈만 검사하는 affected 레벨을 더한다
state: check
created: 2026-11-23
---

# Tasks — HK-5

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험 작성(RED) — `test_verify_affected.py` | R1.1~R1.7 | done |
| T2 | `verify-entry.sh` 레벨 진입, `verify-changed.py --level` · `--budget` | R1.7 | done |
| T3 | base 결정 · 변경 집합(`verify_changes.py`) | R1.1 · R1.6 | done |
| T4 | 판정기(`verify_modules.py`) · Gradle 초기화 스크립트 | R1.2 · R1.3 | done |
| T5 | `verify_affected.py` 계획 · 넓힘 · 킷 스택 밖 단위 | R1.2~R1.5 | done |
| T6 | 실행기 명령별 환경 · 전체 상한, 요약 머리줄 | R1.3 | done |
| T7 | 스택 `verify.sh` 머리 주석 레벨 표 | R1.7 | done |
| T8 | 설치본 시험 통과(GREEN), 생성물 일치 | — | done |

## 검증 기록

- T1 RED: python 스택 설치본에서 `test_verify_affected.py` 24개 중 실패 21 · 오류 2(`--level` 인자 없음).
- T2~T7 GREEN: 같은 설치본에서 24개 통과.
  - 진입 5개: 기본 · `--changed` → changed, `--affected` · `HARNESS_VERIFY_LEVEL=affected` → affected, 인자가 환경 변수보다 앞선다, `--fast` 본문, 모르는 레벨 exit 2.
  - Gradle 6개: 전이 닫힘(`:lib` → `:orders` · `:admin-api` · `:web`, `:tools` 제외), 잎 모듈, 모듈 빌드 파일, 계약 파일 → `check` · `widened`, Groovy `include`, 리터럴이 아닌 `include` → 초기화 스크립트 1회 · 캐시.
  - pnpm · npm 3개, uv · Go 3개, base · 범위 7개(merge-base + 작업 트리 · 메타 `git.base` · 로컬 브랜치 · base 없음 안내 · 모듈 없는 파일 · 킷 스택 밖 단위 게이트 · 전체 상한 · 요약 머리줄).
- 회귀: 설치본 `scripts/tests` 전체 298개 통과.
- 초기화 스크립트를 Gradle 9.7.0으로 한 번 돌렸다(`include(*mods.toTypedArray())` 픽스처): `HARNESS_GRAPH [{":"…}, {":a"…}, {":b", "projectDeps": [":a"]}]`.
- `node scripts/gen-plugins.mjs --check`: 생성물 일치, 파일 486개.
