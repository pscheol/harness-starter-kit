---
key: HK-3
area: sdd
type: feat
title: SDD를 이슈 단위(키-이름 폴더)로 만들고 영역별 보드로 묶는다
state: check
created: 2026-11-23
---

# Tasks — HK-3

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험 작성(RED): `test_issue_sdd.py` 새 구조 · `test_issue_keys.py` · `test_issue_migrate.py` · `test_install.py` | R7.1~R7.11 | done |
| T2 | `sdd_frontmatter.py` · `sdd_keys.py` · `sdd_issues.py` | R7.1~R7.4 · R7.10 | done |
| T3 | `sdd_commands.py` scaffold · prerequisites · freshness · plans 새 구조 | R7.1~R7.4 · R7.10 | done |
| T4 | `sdd_board.py` 영역별 보드 · `--area` | R7.5 | done |
| T5 | `check_harness.py` 키 충돌 · 옛 구조 동결 · 새 구조 상태 | R7.7 · R7.9 | done |
| T6 | `pre-push` 브랜치 규칙 | R7.8 | done |
| T7 | `sdd_migrate.py` migrate · rekey | R7.6 · R7.9 | done |
| T8 | `harness_write_meta` JSON 병합 · 기본값 | R7.11 | done |
| T9 | 템플릿 · 세션 시작 안내 · 사용법 문구(HK-7 일부) | R7.4 · R6.2 · R6.3 | done |
| T10 | 생성(`gen-plugins.mjs`) · 설치본 시험(GREEN) · 전체 시험 | — | done |

## 검증 기록

- T1 RED(구현 전, 설치본 python 스택 · `bash dev.sh <파일>`):
  - `test_issue_sdd.py` 37개: 실패 27 · 오류 1(`--next` · `--area` 인자 없음, 보드 형식 다름, frontmatter 검사 없음).
  - `test_issue_keys.py`: 모듈 오류 1(`harness.sdd_frontmatter` · `harness.sdd_keys` 없음).
  - `test_issue_migrate.py` 5개: 실패 5(`migrate` 명령 없음).
  - `test_harness_shared.py` 43개 중 실패 2, `test_session_hooks.py` 19개 중 실패 2(옛 호출 · 세션 안내 문구).
  - `tests/test_install.py` 새 시험 4개: 실패 2 · 오류 1(`issueKey` 없음, `--next` 없음, 세션 안내에 새 경로 없음). `test_fresh_install_board_is_current`는 지금도 통과(보호 시험).
- T2~T9 GREEN(설치본 python 스택):
  - `test_issue_sdd.py` 37개 · `test_issue_keys.py` 28개 · `test_issue_migrate.py` 5개 통과.
  - `test_harness_shared.py` 43개 · `test_session_hooks.py` 19개 · `test_git_hooks.py` 통과.
  - `scripts/tests` 전체(설치본 안): 315개 통과(브랜치 시험 하나를 더하기 전 수치. 더한 뒤 316개).
  - 브랜치 시험 `test_domain_repo_finds_the_issue_folder_in_the_main_repo`는 구현 뒤에 썼다. 설치본의 상위 리포 찾기를 끈 사본에서 실패(exit 1)하고 원본에서 통과하는 것을 확인했다.
  - `tests/test_install.py` 새 시험 4개와 바꾼 시험 2개 통과(설치 메타 기본값 · update 뒤 사용자 값 보존 · 세션 안내 바이트 · 새 호출).
- 세션 시작 고정 안내(heredoc): 1,517바이트 → 1,422바이트(템플릿 원본 기준, `test_session_start_fixed_context_stays_within_budget`가 ≤ 1,517을 본다).
- HK-7 문구 시험(`/tmp/hk7-test_template_wording.py`, 커밋하지 않음): 이 이슈 담당 파일의 지시 문장 4건(design · tasks 템플릿 칸 2, tasks 템플릿 문장 1, session-start 1)이 0건. `test_spec_templates_use_affected_column` 통과. 남은 건은 다른 담당(verify 스크립트 · `stacks/*/scripts/verify.sh`)이다.
- `node scripts/gen-plugins.mjs --check`: 생성물 일치(파일 486개). `bash scripts/sync-commands.sh --check`: 스킬 포인터 일치.
- 전체 시험 `python3 -m unittest discover -s tests -p "test_*.py"`: 1차 `Ran 22 tests in 317.963s OK`(브랜치 시험 추가 전).

## 바꾼 기존 시험과 이유

동작을 일부러 바꾼 곳만 고쳤다. 이유는 요구 번호로 적는다.

| 시험(전 → 후) | 바뀐 단언 | 이유 |
|---|---|---|
| `test_issue_sdd` `test_default_scaffold_creates_only_issue_requirements` → `test_next_scaffold_creates_only_requirements_with_frontmatter` | 경로 `demo-specs/issues/1-feat-sample/` → `issues/DEMO-1-sample-flow/`. 영역 `index.md` 등록 확인 → `specs-index.md` 영역 표 행 확인. frontmatter 값 · 상태 행 없음을 더 본다 | R7.1 · R7.4 · R7.5, 영역별 `index.md`를 만들지 않는다(§3.7.5) |
| `test_issue_stages_require_exact_approval` → `test_explicit_key_stages_follow_frontmatter_approval` | 승인 표시가 본문 표의 상태 행(approved) → `status: approved`. `approved later` → `in-review`(머리 값은 정해진 넷 중 하나). tasks 경로 `tasks/active.md` → `tasks.md`(`state: active`). 선행 조건 `demo sample` → `DEMO-12` | R7.4, tasks 한 파일 |
| `test_legacy_opt_out_and_continuation_preserve_layout` → `test_all_and_legacy_options_are_refused` · `test_legacy_layouts_are_read_by_prerequisites_and_board` · `test_legacy_stage_documents_are_not_created_anymore` | `--legacy` 성공 → exit 2. 옛 구조 다음 단계 생성 성공 → exit 2(읽기 전용). 옛 구조 선행 조건 출력은 그대로 본다 | R7.10 · R7.7 |
| `test_number_allocator_includes_superseded_and_both_layouts` → 삭제, `test_issue_keys.NextKeyTest` 6개 | 옛 번호(`13-feat-…`) 할당 → 키 번호(다섯 출처 최댓값 + 1). `--number` 성공 → exit 2 | R7.2 |
| `test_same_name_is_rejected_without_creating_another_issue` → `test_next_with_same_name_does_not_create_another_issue` | 같은 이름 exit 1 `already` → exit 0, 기존 폴더를 알린다. 폴더 1개는 그대로 | §3.7.1 "0 생성(또는 이미 있음)" |
| `test_ambiguous_short_name_requires_full_key` → `test_ambiguous_short_legacy_name_requires_full_key` | `new-feature.sh` 대신 `check-sdd-prerequisites.sh`로 옛 구조 모호성 확인 | 새 구조는 키로만 찾는다. 옛 구조 읽기는 선행 조건 명령이 맡는다 |
| `test_explicit_stage_does_not_overwrite_existing_document` · `test_tasks_are_not_recreated_after_review_completion_or_supersession` → `test_existing_documents_are_not_overwritten` | tasks 가 check · completed 면 exit 1 `already in <상태>` → exit 0 `이미 있습니다`, 바이트 그대로 | tasks 는 한 파일이고 상태는 값이다(§3.7.4) |
| `test_all_option_does_not_bypass_stage_approval` → `test_all_and_legacy_options_are_refused` | 실패 → exit 2 | §3.7.1 인자 오류 = 2 |
| `test_path_traversal_and_invalid_number_are_rejected` → `test_path_traversal_and_invalid_values_are_rejected` | 종료 코드 2를 본다. `--number=-1` → `--number`(지원 끝). 영역 · intent · unit 형식을 더 본다 | R7.10 · §3.7.1 |
| `test_scaffold_and_board_refuse_symlink_targets` → `test_symlinked_issue_paths_are_rejected` · `test_legacy_spec_symlink_is_rejected` | 새 구조 `issues/` 링크와 옛 영역 폴더 링크를 따로 본다 | 쓰기 대상이 `issues/`로 옮겼다 |
| `test_board_keeps_index_body_and_is_read_only_when_checking` → `test_board_check_is_read_only_and_detects_drift` · `test_legacy_index_board_keeps_body` | 영역 `index.md` 대신 `specs-index.md`를 본다. 옛 `index.md`는 손으로 만든 고정본으로 본다 | R7.5 |
| `test_concurrent_scaffolds_allocate_distinct_numbers_and_consistent_boards` → `test_concurrent_next_scaffolds_allocate_distinct_keys` | 번호 1~6 → 키 `DEMO-1`~`DEMO-6` | R7.2(같은 `sdd_lock`) |
| `test_symlinked_issue_document_and_board_index_are_rejected` → `test_symlinked_legacy_document_and_board_index_are_rejected` | 옛 구조 문서 링크 거부를 `new-feature.sh --stage` 대신 `check-sdd-prerequisites.sh`로 본다 | 옛 구조에 단계 문서를 만들지 않는다(R7.7) |
| `test_board_preserves_concurrent_index_content_and_mode_changes` · `test_board_atomic_replace_anchors_directory_during_symlink_race` | 옛 이슈와 `index.md`를 scaffold 대신 직접 쓴다. 단언은 그대로 | scaffold 가 옛 구조를 만들지 않는다 |
| `test_plan_checker_*` · `test_root_*` · `test_unit_legacy_*` · `test_legacy_template_*` · `test_issue_freshness_is_read_only` | 단언 그대로(옛 구조 시험으로 이름만 정리) | 옛 구조 검사 범위를 유지한다 |
| `test_harness_shared` `test_scaffold_follows_stage_order_and_approval` | `demo sample --legacy` → `--next sample-flow --area demo`, 경로 `issues/<prefix>-1-sample-flow/`, 승인은 frontmatter | R7.1 · R7.4 · R7.10 |
| `test_harness_shared` `test_scaffold_does_not_recreate_task_waiting_for_review` → `test_scaffold_does_not_write_into_the_legacy_layout` | `already in check` → `읽기 전용`, 옛 tasks 파일이 생기지 않는다 | R7.7 |
| `test_session_hooks` `test_session_start_loads_quality_collaboration_and_issue_workflow` | 세션 안내에 `--full` → `--affected` | HK-7 R6.3 |
| `test_session_hooks` `test_session_start_issue_paths_match_the_actual_scaffold` | 옛 호출 · `<slug>` `<N-type-name>` 자리표시 → 새 호출 · `<키>-<이름>` | R7.1 |
| `test_install` `test_new_feature_scaffolds_issue_folder_with_sdlc_sections` | 호출 `notes folder-bookmark` → `--next folder-bookmark --area notes`, 경로 `notes-specs/issues/*-feat-folder-bookmark/` → `issues/ACMENOTES-1-folder-bookmark/`. 머리 · 상태 행 없음 · 보드 행을 더 본다 | R7.1 · R7.4 · R7.5 |
| `test_install` `test_feature_docs_rule_covers_issue_docs_after_first_issue` | 호출 형식만 새 형식으로(단언 그대로) | R7.10 |
