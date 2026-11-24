---
key: HK-6
area: verify
type: feat
title: 다층 리포의 상위 게이트가 바뀐 도메인만 부른다
state: active
created: 2026-11-23
---

# Tasks — HK-6

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 설치본에서 실패하는 모듈 시험 5개 고치기, `tests/test_multi_harness_module.py` | — | done |
| T2 | 시험 작성(RED) — `test_gates.py` 네 규칙, `test_root_gate.py` | R4.1~R4.5 | done |
| T3 | `gates.py --changed` · `--json` | R4.2 | done |
| T4 | 루트 affected 도메인 위임 · 건너뜀 줄 | R4.1 · R4.3 | done |
| T5 | `verify-entry.sh` `HARNESS_VERIFY_PARENT` export | R4.4 · R4.5 | done |
| T6 | 설치본 모듈 시험 통과(GREEN), 생성물 일치 | — | done |

## 검증 기록

- T1: `--modules=multi-harness` python 설치본에서 모듈 시험 62개 중 실패 3 · 오류 2 → 62개 통과.
  - `test_sync.py` · `test_sync_concurrency.py`는 `sync.py`가 채우지 않는 `{{PROJECT_NAME}}` · `{{PROJECT_SLUG}}`를 기대했다(템플릿 폴더에서도 실패). `sync.py`가 채우는 `UNIT_TITLE` · `UNIT_ID`로 바꾸고, 설치 치환을 피하도록 문자열을 이어 붙인다.
  - `test_verify_entry.py`는 없는 `tools/harness/shared/scripts/verify-entry.sh` 대신 설치본 `scripts/verify-entry.sh`를 쓴다.
- T2 RED: 같은 설치본에서 75개 중 실패 11 · 오류 1(새 시험 13개 중 12개).
- T3~T5 GREEN: 75개 통과.
  - `test_gates.py` 새 7개: 바뀐 것 없음 → 빈 출력, `path`(고친 파일 · 추적 안 된 파일), `worktree`, `pointer`(원격 base에 있는 커밋으로 포인터만 바꿈), `unmerged`(루트 base에 포인터가 있고 도메인 develop에 없는 커밋), base 없음 exit 2 · fetch 안내, `--changed` 없으면 전체.
  - `test_root_gate.py` 6개: 도메인 3곳 중 domain-b만 바꾸면 stderr에 `▶ 하네스 domain-b (affected)` 1줄 · `↷ … 건너뜀 — 변경 없음` 2줄, domain-b 게이트가 `--affected --summary` · `HARNESS_VERIFY_LEVEL=affected` · `HARNESS_VERIFY_PARENT=affected`로 한 번 불린다, `--plan`은 게이트를 부르지 않는다, 루트 파일만 바꾸면 도메인 게이트 0회, `--files`는 도메인 상대 경로를 넘긴다, 루트 기록 `units[].lastRun`, 허용된 루트 full이 부른 도메인 full은 `CLAUDECODE=1`에서도 돌고 도메인을 직접 부르면 exit 3.
- 회귀: python 설치본(모듈 없음) `scripts/tests` 320개 통과.
- `node scripts/gen-plugins.mjs --check`: 생성물 일치, 파일 488개.
