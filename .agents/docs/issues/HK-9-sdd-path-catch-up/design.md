---
key: HK-9
area: sdd
type: refactor
title: 템플릿 · 도구 · 업데이트를 이슈 단위 SDD 경로에 맞춘다
status: approved
created: 2026-11-23
---

# Design — HK-9

근거: [requirements.md](requirements.md), [HK-3 design](../HK-3-issue-unit-sdd/design.md) 「설계와 다른 점」 마지막 행(후속 정리 목록), [설계 01 §3.7](../../../../docs/design/01-v1.1-verify-and-issues.md).

## 1. 파일

경로는 `packages/` 기준이다. 생성물 `plugins/harness-kit/`은 `node scripts/gen-plugins.mjs`로 다시 만든다.

| 파일 | 바꿈 | 요구 |
|---|---|---|
| `templates/stacks/*/root/{AGENTS,CLAUDE}.md` | SDD 위치 표 · 계획 위치 · 완료 게이트 문장 | R9.1 |
| `templates/stacks/*/agents-rules/{guardrails,quality-score}.md` | 계획 위치 · 완료 게이트(상태 폴더 이동 → `state` 값) | R9.1 |
| `templates/stacks/*/arch/*/{root/ARCHITECTURE.md,agents-rules/structure.md}` | 「계획 추적」 위치 | R9.1 |
| `templates/optional/jira-workflow/agents-rules/issue-tracker-workflow.md` | §10 티켓 상태 ↔ tasks `state`(Kiro 포인터에는 바꿀 문장이 없다) | R9.1 |
| `templates/optional/jira-workflow/{agents-skills,claude/commands,cursor/commands,kiro-skills,kiro-steering}/hx-ticket*` | ② 착수 칸(키 · 이름 · 영역), ⑤ · ⑥ 칸과 어긋나는 지점의 `check/` · `active/` | R9.1 |
| `plugin/skills/hx-bootstrap/{SKILL,README,manifest}.md` | SDD 경로 · 명령 · 완료 게이트, manifest 파일 수 | R9.1 |
| `legacy-setup/hx-bootstrap/setup.sh` | 머리 주석 88~89행, 끝 안내(653~659행) | R9.1 |
| `templates/common/tools/docs/docskit/extract/sdd.py` | 새 구조 읽기 | R9.2 |
| `templates/common/tools/docs/README.md` | 61행 `sdd` 패턴 형식(새 구조 · 옛 구조) | R9.1 · R9.2 |
| `templates/common/tools/docs/tests/test_sdd.py` | 새로 | R9.2 |
| `legacy-setup/hx-update/update.sh` | 끝에 보드 한 번 다시 만들기 | R9.3 |
| `templates/stacks/*/root/.gitignore` | `.agents/local/` · `.agents/reports/` | R9.4 |
| `tests/test_template_wording.py` | 옛 SDD 형식 수 · manifest 파일 수 시험 | R9.1 |
| `tests/test_install.py` · `tests/test_cli_parity.py` | R9.2 · R9.3 · R9.4 시험 | — |

## 2. R9.1 문구

| 옛 문구 | 새 문구 |
|---|---|
| `.agents/docs/<slug>-specs/tasks/active/<feature>.md` · `…/tasks/active/` | `.agents/docs/issues/<키>-<이름>/tasks.md` |
| `.agents/docs/<slug>-specs/requirements/<feature>.md` (진입 제품 `index.md`) | `.agents/docs/issues/<키>-<이름>/requirements.md` (보드 `specs-index.md`) |
| `.agents/docs/<slug>-specs/design/<feature>.md` | `.agents/docs/issues/<키>-<이름>/design.md` |
| `SDD 기록(<slug>-specs/{requirements,design,tasks}·decisions)` | `SDD 기록(issues/<키>-<이름>/{requirements,design,tasks}.md·decisions)` |
| `기능은 스펙 단위(requirements → design → tasks):` | 이슈 하나 = 폴더 하나 + 새 명령 `new-feature.sh <키\|--next> <이름> --area <영역>` + 상태는 문서 머리 |
| `check/`로 옮기고 … `completed/`로 이동 | tasks.md 머리를 `state: check`로, 사용자 검증 뒤 `state: completed`로 바꾼다 |
| 상태 전이 `active/` → `check/` → `completed/` | 상태 전이(tasks.md `state`) `active` → `check` → `completed` |
| `new-feature.sh <product-slug> <feature> [--stage=…]` · `new-feature.sh <slug> <feature>` | `new-feature.sh <키\|--next> <이름> --area <영역>` · `new-feature.sh <키> --stage=…` |
| 제품 폴더 `<slug>-specs/`를 `new-feature.sh`가 만든다 | 이슈 폴더 `issues/<키>-<이름>/`를 `new-feature.sh`가 만든다 |
| 완료 게이트(active→check→completed) | 완료 게이트(tasks `state` active→check→completed) |
| hx-ticket ② "제품 slug·기능 이름 확정" | "키(티켓 키) · 이름 · 영역 확정" |

### 2.1 세는 시험(`tests/test_template_wording.py`)

- 범위: `packages/templates/**`(코드가 아닌 파일: `.md` · `.json` · `.yml` · `.yaml` · `.toml` · 확장자 없음), `packages/plugin/**`(`.md` · `.json`), `packages/legacy-setup/**/*.sh`(전체).
  템플릿의 `.py` · `.sh`는 옛 구조를 읽는 구현이라 세지 않는다. `tests/` · `test_*` · `fixtures/`도 세지 않는다.
- 옛 형식 정규식 5종:
  - `[\w<>{}.-]*-specs\b` — `<영역>-specs` · `<slug>-specs` · `demo-specs`
  - `<product-slug>`
  - `\btasks/(active|check|completed|superseded)/`
  - `` `(active|check|completed|superseded)/` ``(상태 폴더)
  - `new-feature\.sh\s+<(slug|product-slug|영역|area|제품)>` · `new-feature\.sh\s+[a-z][a-z0-9_-]*\s+[a-z<]`(옛 두 인자 호출)
- 제외 목록(읽기 전용 설명): (경로 glob, 줄에 든 문구) 짝을 명시한다. 지금 있는 문장 13곳(`hx-*` 스킬 9 · `sdd-workflow` · `specs-index` · `_spec-templates` 셋 · `guides/sdd-pattern` · `agents-docs/README` · `kiro-steering/sdd-workflow` · `tools/docs/README`)이다. 문구는 모두 "읽기만 한다" · "읽기 전용"을 담는다.
- 단언: 남은 수 0. 실패하면 `경로:줄: 내용`을 모두 낸다.

### 2.2 manifest 파일 수

`layout.json` 세그먼트로 센 지금 수(설치 경로 기준, `ABOUT` · `.DS_Store` 제외):

| 묶음 | core | claude | codex | cursor | kiro | 합 |
|---|---|---|---|---|---|---|
| `templates/common/` | 183 | 18 | 8 | 11 | 50 | 270 |
| 백엔드 설치(common + 스택 14 + 변형 4) | 197 | 19 | 8 | 11 | 53 | 288 |
| 프론트엔드 설치(+ `frontend` 8) | 201 | 19 | 8 | 11 | 57 | 296 |
| `jira-workflow` | 5 | 2 | 0 | 2 | 6 | 15 |
| `platform-guards` | 3 | 0 | 0 | 0 | 1 | 4 |
| `multi-harness` | 9 | 0 | 0 | 0 | 0 | 9(모듈 4 + 시험 5) |

시험이 같은 방식으로 세고 manifest 표 두 줄 · 모듈 표 세 줄 · `templates/common/` 수가 맞는지 본다. 숫자가 바뀌면 시험이 manifest를 고치라고 알린다.

## 3. R9.2 기능 문서 SDD 추출기(`docskit/extract/sdd.py`)

- 하네스마다 `.agents/docs/issues/*/`를 읽는다. 폴더 이름이 `^([A-Z][A-Z0-9]{1,9})-([1-9][0-9]{0,5})-(.+)$`가 아니면 건너뛴다.
- 문서: `requirements.md`가 있으면 그것, 없으면 `design.md` · `tasks.md` 중 처음 있는 것. 셋 다 없으면 건너뛴다.
- 머리 읽기: 첫 줄 `---`부터 다음 `---`까지 `이름: 값` 줄만 읽는다(값 뒤 ` # …` 주석, 따옴표는 뗀다). 틀린 줄은 무시한다 — 머리 검사는 fast 검사(`check_harness.py`)가 맡고, 생성기는 읽기만 한다.
- 값: `area`(없으면 `-`) · `type`(없으면 `feat`) · `title`(없으면 본문 제목 `# Requirements — …`, 그것도 없으면 폴더 이름의 이름 부분).
- 상태: `tasks.md`의 `state`가 `active` · `check` · `completed` · `superseded` 중 하나면 그 값, 아니면 `design.md`가 있으면 `design`, 그 밖은 `requirements`. 보드(`sdd_board.py`)와 같은 규칙이다.
- `Issue`에 `legacy: bool`을 더한다(기본 `True`, 옛 구조 코드는 그대로). `slug` 자리에 영역을 둔다. 화면의 `<영역>/<키>-<이름>` 표시는 지금 코드(`{slug}/{key}`) 그대로다.
- catalog `sdd` 패턴이 보는 값(`ref`): 새 구조 `<하네스 경로>:issues/<영역>/<키>-<이름>`, 옛 구조 `<하네스 경로>:<slug>-specs/<키>`(지금 그대로). 영역으로(`.:issues/notes/*`) · 키로(`.:issues/*/ACME-3-*`) 묶을 수 있다.
- 정렬: (하네스, 영역 · slug, 번호, 폴더 이름). 새 구조와 옛 구조에 같은 (하네스, 영역, 폴더 이름)은 생기지 않는다(폴더 이름 형식이 다르다).
- 결과: 새 이슈 문서 경로가 `generator_inputs`에 들어간다. 기본 changed 규칙 `.agents/docs/*`가 이미 덮는다. 이슈 문서를 바꾸면 기능 문서 `check`가 `build`를 요구한다(옛 구조 때와 같은 동작).

## 4. R9.3 update 뒤 보드(`hx-update/update.sh`)

lock · 메타를 쓴 뒤(`--dry-run`이 아닐 때) 다음을 모두 만족하면 보드를 본다.

- `scripts/board.sh`가 있고 `python3`가 있다.
- 이번 실행의 conflict 목록에 `scripts/board.sh` · `scripts/sdd-layout.py` · `scripts/harness/*`가 없다(사람이 고친 보드 코드를 업데이트가 실행하지 않는다 — HK-8 D17과 같은 이유).

`bash scripts/board.sh --check`가 0이면 아무것도 하지 않고 출력도 없다. 0이 아니면 `bash scripts/board.sh`를 한 번 돌리고 한 줄(`✎ SDD 보드를 새 형식으로 다시 만들었다 …`)을 낸다. 다시 만들기가 실패하면(머리가 틀린 문서 등) stderr에 경고 한 줄을 내고 update의 종료 코드는 바꾸지 않는다.

## 5. R9.4 `.gitignore`

설치되는 `.gitignore`는 `stacks/*/root/.gitignore` 다섯 개뿐이다(common · domains · optional에는 없다). `.agents/state/` 줄 아래에 `.agents/local/` · `.agents/reports/`를 더하고 주석 한 줄을 맞춘다. CLI `doctor`의 `GITIGNORE_NEEDS`(세 줄)와 같다.

## 6. 시험

| 시험 | 요구 | 내용 |
|---|---|---|
| `test_template_wording.LegacySddFormTest.test_no_legacy_sdd_forms` | R9.1 | §2.1 남은 수 0 |
| `test_template_wording.LegacySddFormTest.test_manifest_counts_match_templates` | R9.1 | §2.2 |
| `tools/docs/tests/test_sdd.py` | R9.2 | 새 구조 상태 4종(요구 · 설계 · `state` 값 · 틀린 `state`), 머리 값 · 기본값, `ref`와 catalog 패턴 배정, 형식이 아닌 폴더 무시, 옛 두 구조와 섞여도 각각 읽음 |
| `test_install.test_feature_docs_rule_covers_issue_docs_after_first_issue` | R9.2 | 첫 이슈 뒤 `build` · `check` 통과에 더해 백로그 화면에 `ACMENOTES-1-folder-bookmark`가 있다 |
| `test_install.test_update_rebuilds_board_after_format_change` | R9.3 | 옛 구조 이슈 + 옛 형식 보드인 설치본: update 전 `check-exec-plan-status.sh` 실패, update 뒤 통과 · `board.sh --check` 통과 · 안내 한 줄 |
| `test_cli_parity.test_doctor_passes_on_both_installs` | R9.4 | 두 설치 모두 `doctor --json`에 `gitignore` 항목이 없다(조합 전부) |
