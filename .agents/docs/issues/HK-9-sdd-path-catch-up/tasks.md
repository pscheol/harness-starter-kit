---
key: HK-9
area: sdd
type: refactor
title: 템플릿 · 도구 · 업데이트를 이슈 단위 SDD 경로에 맞춘다
state: completed
created: 2026-11-23
---

# Tasks — HK-9

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | 시험 작성(RED): 옛 형식 수 · manifest 수 · `test_sdd.py` · 백로그 · update 보드 · doctor gitignore | R9.1~R9.4 | 실패 수 기록 | done |
| T2 | 스택 템플릿 · jira-workflow · plugin 문서 · setup.sh 안내 문구 | R9.1 | 옛 형식 0 | done |
| T3 | manifest 파일 수 | R9.1 | 수 시험 | done |
| T4 | 기능 문서 SDD 추출기 새 구조 | R9.2 | `test_sdd.py` · 백로그 | done |
| T5 | update.sh 보드 다시 만들기 | R9.3 | update 시험 | done |
| T6 | `.gitignore` 세 줄 | R9.4 | doctor 시험 | done |
| T7 | 생성(`gen-plugins.mjs`) · 전체 시험 | — | `Ran N tests … OK` | done |

## 검증 기록

- T1 RED(구현 전, 커밋 `b165162` 위):
  - `test_template_wording.LegacySddFormTest.test_no_legacy_sdd_forms`: 옛 형식 125줄(스택 템플릿 94 · jira-workflow 18 · 플러그인 문서 7 · setup.sh 5 · `tools/docs/README.md` 1).
  - `test_manifest_counts_match_templates`: 하위 시험 6개 중 5개 실패(백엔드 · 프론트엔드 행, `jira-workflow` · `multi-harness` 행, `templates/common/` 수). `platform-guards` 행만 맞았다.
  - `tools/docs/tests/test_sdd.py` 6개: 실패 2 · 오류 3(새 구조 이슈를 읽지 않는다). 형식이 아닌 폴더 무시 시험은 처음부터 통과(읽는 것이 없으니).
  - `test_install.test_feature_docs_rule_covers_issue_docs_after_first_issue`: 백로그 화면에 `ACMENOTES-1-folder-bookmark` 없음.
  - `test_install.test_update_rebuilds_board_after_format_change`: update 출력에 보드 안내 0줄(뒤의 fast 검사도 실패).
  - `test_cli_parity.test_doctor_passes_on_both_installs`: 24조합 전부 `gitignore` 경고.
- T2 · T3:
  - 스택 진입 파일은 바이트가 줄었다. `AGENTS.md` 다섯 개 각 −34바이트, `CLAUDE.md` 다섯 개 각 −4바이트(Codex가 `AGENTS.md`를 세션마다 읽는다). 플러그인 `SKILL.md` description −4바이트.
  - 읽기 전용 설명은 19줄 남았다. 제외 목록 12항목(`hx-*` 스킬은 glob 하나)이 모두 "읽기만 한다" · "읽기 전용"을 담는다.
  - manifest: 백엔드 198 · 19 · 8 · 11 · 53 = 289, 프론트엔드 202 · 19 · 8 · 11 · 57 = 297, `templates/common/` 271(이 이슈의 `test_sdd.py` 포함), `jira-workflow` 15(core 5 · claude 2 · cursor 2 · kiro 6), `multi-harness` 9. Kiro hook 4 · Claude hook 4개 배선도 고쳤다.
- T4 GREEN: `tools/docs` 시험 60개 통과(54 + 새 6). 백로그 화면에 새 이슈가 나온다. 단계 원고 `04-백로그-추적.md`의 상태 설명을 `state` 기준으로 고쳤다.
- T5 GREEN: 옛 구조 이슈 + 옛 형식 보드 설치본에서 update 전 `check-exec-plan-status.sh` 실패 → update 뒤 통과, `board.sh --check` 통과, 안내 1줄. 두 번째 update는 안내 0줄.
- T6 GREEN: 동일성 9개 OK(24조합 doctor에 `gitignore` 항목 없음).
- T7: `node scripts/gen-plugins.mjs --check` → `생성물 일치: 파일 494개`. `bash scripts/sync-commands.sh --check` → 포인터 일치.
- 전체 시험(커밋 `6f0ba45`): `Ran 40 tests in 480.530s` · `OK`.

## 설계와 다른 점

| 설계(design.md) | 구현 | 이유 |
|---|---|---|
| §2.1 제외 문장 "13곳" | 19줄 · 목록 12항목 | 설계를 쓸 때 줄 수를 세지 않았다. `planner.md` 한 줄을 구현 중에 더 찾았다 |
| §2.2 `templates/common/` 270 | 271 | 이 이슈가 `tools/docs/tests/test_sdd.py`를 더했다 |
| 요구 범위 밖 | `docs/features/_src/stages/04-백로그-추적.md` 한 줄 | 생성되는 백로그 화면이 "상태는 tasks 파일 위치"라고 적어 새 구조와 어긋난다 |

## 남은 것

- 루트 `README.md` 209~210행 파일 수 표(187 · 277 등)는 R9.1 범위(템플릿 · 플러그인 · setup.sh) 밖이라 고치지 않았다.
- 스택 `AGENTS.md` · `CLAUDE.md`의 "full은 커밋·푸시 전에 직접 실행" 문장은 HK-7 방향(full은 CI)과 다르다. HK-7 문구 시험이 이 문형을 세지 않는다.
