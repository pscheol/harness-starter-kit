---
key: HK-1
area: repo
type: refactor
title: 킷 저장소를 모노레포로 옮기고 플러그인 폴더를 생성물로 바꾼다
state: active
created: 2026-11-23
---

# Tasks — HK-1

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | 이동 전 기준선: 시험 전체 결과와 스택 5개 설치 결과를 `/tmp/hk1-before/`에 남긴다 | R4.2 · 성공 기준 | 로그 · 폴더 | done |
| T2 | `git mv`로 원본을 `packages/`로 옮긴다(커밋 1) | R1.1 · R1.2 | `git log --follow` | done |
| T3 | `tests/test_generated.py` 작성(RED) | R2.x · R4.1 | 실패 확인 | done |
| T4 | `scripts/gen-plugins.mjs` 작성 → 생성물 만들기(GREEN) | R2.1~R2.4 · R3.1 | 시험 통과 | done |
| T5 | `test_install.py`의 `SYNC_COMMANDS` 경로, `sync-commands.sh`의 템플릿 경로 | R4.2 | 시험 통과 | done |
| T6 | `package.json`(private) · `pnpm-workspace.yaml` · `.gitattributes` | R5.1 | 파일 | done |
| T7 | 루트 README · 설계 02 §3.1 경로 안내 | R5.2 | 문서 | done |
| T8 | 이동 뒤 시험 전체 + 스택 5개 설치 diff 0 | R3.1 · R4.2 · 성공 기준 | 로그 | done |
| T9 | 커밋 2 | — | `git log` | todo |

## 검증 기록

- T1 기준선: 이동 전 시험 12개 OK(245초). 스택 5개 + web 모듈 전부, 설치 결과 6벌을 `/tmp/hk1-before/`에 남겼다(파일 1,836개).
- T2: 커밋 `802ae40` — rename 481건, 내용 변경 0. `git log --follow packages/templates/common/agents-rules/git-workflow.md`가 이동 전 커밋 `5f57c2a`까지 이어진다(R1.2).
- T3 RED: `tests/test_generated.py` 7개 중 실패 5 · 오류 2(스크립트 없음).
- T4 GREEN에서 시험이 잡은 결함 2건:
  - macOS의 `/var` → `/private/var` 링크 때문에 "이 파일을 직접 실행했나" 판정이 거짓이 되어, 임시 복사본에서 스크립트가 아무것도 하지 않고 exit 0으로 끝났다.
  - 같은 이유로 출력 폴더 안전 검사의 "저장소 안인가" 비교가 어긋났다.
  - 수정: 모든 경로를 실제 경로로 풀어 비교한다(`realResolve`).
  - 시험 쪽 결함도 2건 고쳤다. 실행 권한 시험이 원래 644인 `setup.sh`를 골랐고, 복사 제외 목록의 `docs`가 템플릿의 `docs/`까지 뺐다.
- T4 결과: 생성물 480개. 이동 전 트리(`1c89e9e`)와 비교한 차이는 개발 도구 `tools/sync-commands.sh` 하나이고, 실행 비트 불일치는 0이다(R3.1).
- T5: `bash scripts/sync-commands.sh --check` → 일치.
- T8: 생성물 `setup.sh`로 같은 6벌을 설치해 `/tmp/hk1-before/`와 `diff -r` → 6벌 모두 0줄. 시험 전체 결과는 아래에 적는다.
