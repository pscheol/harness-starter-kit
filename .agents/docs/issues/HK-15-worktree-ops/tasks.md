---
key: HK-15
area: worktree
type: feat
title: worktree 운영 — 리포 옆 폴더 · 둘째 세션부터 · 리포당 3개 · 끝나면 지움
state: completed
created: 2026-11-24
---

# Tasks — HK-15

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험: 설치본 `test_worktree.py` · VS Code 병합 TS · Python · 엔진 · 훅 fixture | 전부 | done |
| T2 | `worktree_repo` · `worktree_state` · `worktree_prepare` | R1 · R2 | done |
| T3 | `new`(자리 · 상한 · design · sparse · 복사 · 의존성 · 포트 · 기록) | R1 · R2 | done |
| T4 | `list` · `open` · `done` · `gc` | R3 · R5 | done |
| T5 | 훅 create · remove + hooks.json · projection.json | R4 | done |
| T6 | VS Code 병합 종류(Python · TS) | R6 | done |
| T7 | 템플릿(`.worktreeinclude` · 규칙 문서) · manifest 수 · 점유 기록 prune | 전부 | done |
| T8 | 생성물 · 전체 시험 · 검증 기록 | 완료 기준 | done |

## 요구사항별 결과

| 요구 | 결과 | 근거(시험) |
|---|---|---|
| R1.1 `new <키>` → `<root>/<키>-<이름>/` · `<종류>/<키>-<이름>` · 시작점 `origin/<base>` | 충족 | `NewTest.test_creates_issue_worktree_at_sibling_folder_from_origin_base`(HEAD = origin/develop, upstream 없음 = `--no-track`), `test_branch_type_comes_from_requirements`, `test_worktree_root_setting_absolute_and_relative` |
| R1.2 design `approved` 일 때만 | 충족 | `test_unapproved_design_is_refused_with_exit_1_unless_docs`(exit 1 + `--docs` 안내), `test_skip_design_check_warns_and_records_it` |
| R1.3 리포당 `maxPerRepo` 상한, exit 3 | 충족 | `test_fourth_worktree_is_refused_with_exit_3_and_a_list`, `test_max_per_repo_setting_is_used`, `DomainTest.test_domain_limit_counts_per_repo` |
| R1.4 submodule 상위 리포는 `--docs` 아니면 거부, 도메인 `<root>/<도메인>/<키>-<이름>/` | 충족 | `DomainTest`(실제 submodule 7건: 거부 · `--domain` · 도메인 안 실행 · docs · 상한 · done 포인터 안내 · `list --all`) |
| R2.1 `--docs` sparse | 충족 | `test_docs_worktree_is_sparse_with_root_files_and_three_folders`(루트 파일 + `.agents` · `docs`, `src` 없음, 메인 폴더 sparse 설정 그대로), `test_only_adds_folders_to_the_sparse_set` |
| R2.2 `.worktreeinclude` + gitignore 된 파일만 | 충족 | `test_worktreeinclude_copies_only_ignored_local_files`(gitignore 안 된 `scratch.txt` 제외), sparse 로 빠진 폴더 제외, 50MB 초과 건너뜀 + 경고 |
| R2.3 npm APFS 복제 · pnpm · uv 안내 · `--deps` 실행 | 충족(macOS) | `test_npm_node_modules_is_cloned_when_lock_is_identical`, `test_pnpm_and_uv_are_only_announced_without_deps`, `test_deps_flag_runs_the_install_command_in_the_unit_folder` |
| R2.4 `.env.worktree` 포트 오프셋 | 충족 | `test_port_offset_is_index_times_100_and_frees_on_done`(`SERVER_PORT=8280`, 번호 재사용), `.env.local` 우선, 65535 초과 건너뜀, Cargo 공유 빌드 폴더 |
| R3.1 `done` — clean · push · 세션 · 부른 폴더 | 충족 | `DoneTest` 14건: 변경 있음 exit 1(이유 출력) · push 안 된 커밋 exit 1 · push 뒤 삭제와 브랜치 삭제 · 살아 있는 세션(10분) · worktree 안에서 실행 · ignore 파일이 있어도 삭제 · `--keep-branch` |
| R3.2 `gc` 목록만 · `--apply` 만 지움 | 충족 | `GcTest`(끝난 것만 지움, 진행 중 남김, 사라진 폴더 prune, 파일 있는 폴더 보존, 7일 세션 기록, 고아 상태 기록, 점유 저장소 prune) |
| R4.1 WorktreeCreate 훅 | 충족(시험) · 수동 확인 남음 | `HookTest`(디스패처를 거친 JSON 입력): 이슈 이름 → 같은 자리, 같은 이름 다시 → 같은 경로, 그 밖 이름 → `_agents/<이름>/` · `wt/<이름>` · HEAD 에서, 임시 상한 `2 × maxPerRepo`, 안전하지 않은 이름 정리 |
| R4.2 WorktreeRemove 훅 | 충족 | `HookTest`: 끝난 worktree + 브랜치 삭제, 변경 · push 안 된 커밋 · 다른 세션이면 exit 1 로 남김, 킷이 만들지 않은 경로 거부, 임시는 HEAD 가 다른 브랜치에 있으면 삭제 |
| R5.1 `list` 열 | 충족 | `ListTest`(변경 · 안올림 · 용량 · 마지막 사용 · 세션 · 상태, 10분 용량 캐시 · `--refresh-size` · `--disk` 구분) |
| R5.2 합계 20GB · 여유 10GB 경고 | 충족 | `test_list_warns_when_disk_is_low`(`HARNESS_WT_*` 로 임계 조정) |
| R6.1 `.vscode/settings.json` 병합 | 충족 | `vscode-merge.test.ts`(22) · `vscode-engine.test.ts`(9: init · update · uninstall · doctor · repair · TS = Python plan) · `tests/test_vscode_merge.py` |
| 훅 worktree 대응(requirements 2번째 줄) | 충족(HK-24) | 새 훅도 디스패처를 거친다. `HookTest` 가 디스패처 경유로 돈다 |
| 모델 호출 · 세션 바이트 | 충족 | 새 훅은 Claude 에만, 세션 시작 출력에 들어가지 않는다. 성공 출력은 Create 경로 한 줄, Remove 0바이트. 설치본 세션 시작 예산 시험(`test_session_start_budget`) 통과 |

## 설계 05 와 다르게 한 것

design.md §2 표 참고. 요약: `.env.worktree` 는 끝 조건 변경 수에서 뺀다 · `hook-remove` 는 부른 폴더 검사를 하지 않는다 · 세션을 `cwd` 로 센다 · 의존성 단위는 `git ls-files` 로 찾는다 · `.vscode/settings.json` 은 `.vscode/` 폴더가 있을 때만 만든다(`git.ide` 기본값 code 가 모든 리포에 만들게 하지 않는다).

## 시험을 쓴 순서(기록)

- 설계 문서 → 설치본 시험 · TS 시험을 먼저 썼고(구현 없이 import 가 실패하는 상태 = RED) 그 뒤에 구현했다. 커밋은 구현과 시험이 같은 커밋에 있다(`3b46b4e`).
- 시험이 찾은 것: ① submodule 안에서 `git worktree list --porcelain` 의 첫 줄이 작업 트리가 아니라 `.git/modules/<이름>` 이다(설계 05 §3.1 의 가정이 이 git 에서는 틀렸다) → `core.worktree` 로 작업 트리를 찾는다. ② 두 편집이 같은 위치(`{"a":1}` 의 `}` 앞)에 들어갈 때 쉼표가 새 줄 뒤로 갔다 → 편집 순서 키를 둔다. ③ `gc --dry-run` 은 상태 파일 서식만 다시 쓴다(내용 같음).

## 검증 기록

- `pnpm -C packages/cli build` → `node scripts/gen-plugins.mjs` → `--check` 일치(파일 427개).
- `pnpm -C packages/cli test`: 432개 통과(34 파일).
- `pnpm -C packages/dashboard test`: 94개 통과.
- 킷 Python 시험 `tests.test_template_wording tests.test_generated tests.test_projection_hooks tests.test_layer_files tests.test_vscode_merge`: 33개 OK. manifest 수 행 갱신(core 256 → 266 · 270, 공통 253).
- 설치본(`--stack=python --agents=all --modules=none`) `test_worktree`: NewTest 28 · ListTest 5 · OpenTest 5 · DoneTest 14 · GcTest 5 · HookTest 13 · DomainTest 7 = 77개 OK.
- 설치본 시험 전체 · 킷 시험 전체: 아래 "전체 시험".

## 전체 시험

(아래에 결과를 적는다)

## 확인 필요(사람)

- 살아 있는 Claude Code 에서 `claude -w <이슈키>` · `claude -w <이름>` · `claude -w "#1234"` · 하위 에이전트 `isolation: worktree` 의 훅 입력(`name` · `agent_id`)과 종료 화면에서 "지운다"를 골랐을 때 WorktreeRemove 동작(05 §6, §5 #4). Claude Code 판을 적는다.
- IntelliJ 2026.1 에서 도메인 리포 worktree 를 `open --ide idea` 로 열었을 때 Worktrees 탭(05 §6).
- VS Code 1.103+ 에서 `git.detectWorktrees: true` 로 Worktrees 가 보이는지, `git.worktreeIncludeFiles` 설정 존재 여부(05 §6).
- knots 사본의 `state.json`(25MB)에서 `gc --apply` 뒤 보존 기한 밖 기록 0건(05 §5 #6) — 실측하지 않았다. 구조는 `coordination_schema` 필드(epoch 초)로 시험했다.
- knots 의 `git.worktreeRoot` 를 `~/knots-work` 로 둘지, 자리 규칙을 바꿀지(05 §6, 사람 결정). 바꾸면 `knots-work-gc` 와 `~/.claude/rules/knots-worktrees.md` 를 같이 고친다.
- 앱 · compose 설정이 `.env.worktree` 를 `.env` 다음에 읽도록 하는 것은 각 프로젝트 몫이다(규칙 문서에 적었다).
- 승인 대기: `design.md` 는 `in-review` 다. 승인은 사람이 한다.
