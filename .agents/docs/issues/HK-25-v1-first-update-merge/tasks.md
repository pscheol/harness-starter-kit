---
key: HK-25
area: cli
type: feat
title: v1.0.8 설치본 첫 업데이트의 구별 불가 파일을 병합하고, 빈 platform-guards 모듈을 없앤다
state: completed
created: 2026-11-24
---

# Tasks — HK-25

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | 병합 fixture(C · D · 기대) 20개 · TS↔Python 동일성 시험 · `v1-first-update` · 없앤 모듈 단위 시험(RED) | R1 · R2 · R3 | 실패 수 기록 | done |
| T2 | Python 시험(RED): update 동일성 #07 · #09 · #11, 설치 동일성 #07 · #10 · #25, add · remove A3 · R1, kit.sh, 업그레이드, 문구, install | R1 · R2 · R3 | 실패 수 기록 | done |
| T3 | `hx-update/v1_merge.py` · `core/v1-merge.ts` | R1 | `v1-merge.test.ts` | done |
| T4 | update.sh · CLI update 병합 · 백업 · 목록 · `CLAUDE.md` 백업(`core/v1-first-update.ts`) | R1 | `v1-first-update.test.ts` · update 동일성 | done |
| T5 | platform-guards 삭제: 템플릿 · layout · harness-lib · setup.sh · add-agent.sh · update.sh · kit.sh · CLI | R2 | 단위 · 동일성 | done |
| T6 | 문서: README · 가이드 · 플러그인 문서 · 도움말 · verify.sh 주석 · 설계 02 · HK-12 · HK-13 교차 표시 | R2 | 문구 시험 · grep | done |
| T7 | 번들 · 플러그인 생성물 · 전체 시험 · 기록 | — | `gen-plugins.mjs --check` 일치 · 전체 시험 | done |

## 요구사항별 확인

| 요구 | 시험 |
|---|---|
| R1 줄 병합 · 키 병합 · `.new` · 백업 · 목록 | `v1-merge.test.ts` 23개(fixture 20 + 성질 3 — 두 구현의 바이트가 같다), `v1-first-update.test.ts` 5개, `legacy-lock.test.ts` 첫 시험, `test_cli_update_parity` #09 · #11, `test_install.test_update_with_legacy_lock_merges_instead_of_replacing` |
| R1 같은 줄 두 번 없음 | `v1-merge.test.ts` "묶음의 뜻 있는 줄은 킷 판에 없고, 묶음을 지우면 킷 판과 같다", `test_cli_update_parity` #11(README · 머리 줄 없는 문서) |
| R1 배치 원본 · HK-13 미결 질문 | `test_projection_upgrade.test_first_update_projects_at_once_and_keeps_budget`(`defer` 0 · 규칙 `.new` 0 · 상시 양 ≤ v1.0.8), `test_cli_update_parity` #09(규칙 kit) |
| R2 모듈 목록 · 템플릿 · 문서 | `test_template_wording.RetiredModuleTest` 2개, manifest 수 시험 |
| R2 받으면 안내 · exit 0 | `selection.test.ts` · `cli.test.ts` 2 · `add.test.ts` 3 · `remove.test.ts` 1 · `update.test.ts` 1, `test_cli_parity.test_retired_module_is_ignored_with_notice`, `test_cli_addremove_parity` A3 · R1, `test_kit_wrapper` legacy add |
| R2 옛 설치 update | `test_cli_update_parity` #07(메타 `modules` → `[]`, 안내 한 줄, lock 레이어 `common`, `.new` 0) |
| R3 겹침(HK-10) 유지 | `test_cli_parity` #25 · `test_install.test_overlap_later_layer_wins_on_install_and_update`(사본 `jira-workflow` 모듈의 겹침 경로), vitest 겹침 시험은 시험 전용 모듈 `zz-overlap` |

## 검증 기록

### RED(구현 전, 시험은 `a5d5aa0`)

- vitest(`vitest run`): 24파일 중 7파일 실패, 281개 중 14개 실패 · 267개 통과. `v1-merge.test.ts`는 `core/v1-merge` 모듈이 없어 불러오지 못했다(23개). 실패 = v1-first-update 5 · add 3 · cli 2 · selection 2 · remove 1 · update 1. `tsc --noEmit`은 `retiredModules`가 없어 오류.
- Python(`tests.test_template_wording` · `test_kit_wrapper` · `test_cli_update_parity` · `test_cli_parity` · `test_cli_addremove_parity` · `test_projection_upgrade` · `test_install`): `Ran 76 tests in 780.326s` · `FAILED (failures=12, errors=2)`. update 동일성 #07 · #09 · #11, 설치 동일성 없앤 모듈 2(하위 시험), add · remove A3 · R1, kit.sh 1, 문구 2, 업그레이드 1, install 1.

### GREEN

- vitest: `tsc --noEmit` 오류 0, 24파일 304개 통과(새 시험 36개).
- `v1_merge.py`를 fixture 20개에 직접 돌려 종류 · 바이트가 모두 기대값과 같다.
- 첫 GREEN에서 Python 6개가 실패했고 모두 시험 쪽 잘못이었다: #11 머리 줄 문서를 치환 전 템플릿과 비교(→ 새 판 표시 줄로 확인), 업그레이드 시험이 고친 포인터의 `.new`까지 `mv`로 받아 사람 줄을 지움(→ 그 `.new`는 받지 않는다), 고친 커맨드 포인터의 keep-modified가 첫 update로 옮겨짐(→ 첫 update JSON에서 확인).
- `test_install.test_harness_scripts_suite_passes_in_install`이 묶음 안에서 돌 때 `test_issue_keys.ExitCodeTest.test_key_taken_on_base_with_another_name_is_a_conflict`의 임시 폴더 정리가 `OSError: [Errno 66] Directory not empty: …/unit/.git`로 실패했다(전체 시험 2회 · `test_install` 모듈 1회). 그 시험만 설치본에서 8번 돌리면 40f76d6 · HK-25 모두 0/8 실패다. 원인: git 2.54가 `fetch` · `push` 뒤 따로 띄우는 maintenance가 정리와 겹친다. 시험 git 설정(`tests/harness_scripts/sdd_fixture.py`)에 `maintenance.auto = false` · `gc.auto = 0`을 넣었다. HK-25는 SDD 키 스크립트를 고치지 않았다.
- 고친 뒤: `test_cli_update_parity` `Ran 11 tests` OK · `test_projection_upgrade` 6 OK · `test_cli_addremove_parity` 6 OK · `test_kit_wrapper` 6 OK · `test_template_wording` 13 OK.
- 손으로 본 출력(python · claude, 미리 둔 사람 `AGENTS.md` · `README.md`, 표시 줄 지운 lock): update.sh `✔ new=0  update=0  same=226  conflict=0  orphan=0  merge=2`와 `v1 lock 첫 업데이트 — 병합 2 · 킷 판 0(원본: .agents/state/merge-backup/<시각>/)`, CLI `병합 2`. 두 트리가 같다(`diff -r`, 상태 파일 제외).
- 번들 `dist/cli.js` 219,010 → 234,864바이트(+15,854, gzip 57,358 → 62,555). `dependencies` 0. 플러그인 생성물 397 → 394개(모듈 4파일 빼고 `hx-update/v1_merge.py` 1개 더함). 설치되는 파일은 늘지 않는다(병합 도우미는 플러그인 안에만 있다).
- 세션 적재량: `hx-bootstrap` `description` 줄 1,672 → 1,615바이트. 진입 파일 · 규칙 · 스킬 본문은 그대로다.
- 커밋마다 압축으로 푼 트리에서 `node scripts/gen-plugins.mjs --check`: `77515c0` · `a5d5aa0` 397개, `d7493ec` · `3a952d0` 394개 모두 `생성물 일치`.
- vitest(`pnpm -C packages/cli test`): `Test Files  24 passed (24)` · `Tests  304 passed (304)`.
- 전체 시험 `python3 -m unittest discover -s tests -p "test_*.py"`(시험 git 설정 고친 뒤): `Ran 103 tests in 957.666s` · `OK`.

## 설계와 다른 점

[design.md §5](design.md#5-설계와-다른-점) D1~D6. 구현 중 design.md를 두 번 고쳤다: §2.5(`CLAUDE.md`는 머리 줄로 가리지 않는다 — v1.0.8 스택 `CLAUDE.md` 5개 중 머리 줄은 jvm 1개), §2.2 백업 이름 `.orig`(D6).

## 남은 것

- 병합본은 다음 update부터 수정본으로 보여 킷 판이 그대로여도 `.new`를 받는다(HK-11 §9 미결과 같은 원인).
- CLI `add` · `remove`가 첫 update보다 먼저 돌면 R1 대상이 아니다(design §6).
- `docs/analysis/` · `docs/roadmap.md` · `docs/reference/` · `docs/harness-next/`의 platform-guards 언급은 v1 분석 · 지난 기록이라 두었다.
