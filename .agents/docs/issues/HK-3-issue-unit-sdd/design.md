---
key: HK-3
area: sdd
type: feat
title: SDD를 이슈 단위(키-이름 폴더)로 만들고 영역별 보드로 묶는다
status: approved
created: 2026-11-23
---

# Design — HK-3 이슈 단위 SDD (v1.1)

근거: [requirements](requirements.md), [설계 01 §3.7 · §4 · §5](../../../../docs/design/01-v1.1-verify-and-issues.md), [설계 README §4 · §9](../../../../docs/design/README.md).

## 1. 파일

경로는 `packages/templates/common/` 기준이다. 생성물 `plugins/harness-kit/`은 `node scripts/gen-plugins.mjs`로 다시 만든다.

| 파일 | 바꿈 |
|---|---|
| `scripts/harness/sdd_frontmatter.py` | 새로. frontmatter 부분 집합 파서(§3.7.4) · 쓰기 · 값 검사 |
| `scripts/harness/sdd_keys.py` | 새로. 키 · 이름 규칙, 설정 읽기(`issueKey` · `git.base`), `--next` 번호 수집, 키 충돌 · 옛 구조 동결 · 브랜치 검사 |
| `scripts/harness/sdd_issues.py` | 새로. 새 구조 `.agents/docs/issues/<키>-<이름>/` 찾기 · 상태 읽기 · 선행 조건 · 상태 검사 · 문서 본문 만들기 |
| `scripts/harness/sdd_migrate.py` | 새로. `migrate --dry-run|--apply`, `rekey` |
| `scripts/harness/sdd_layout.py` | 옛 구조(이슈 폴더 · 단계 폴더) 읽기는 그대로. `plan_errors` 이름을 `legacy_plan_errors`로 바꾼다 |
| `scripts/harness/sdd_board.py` | `specs-index.md` 보드를 영역별 표로 바꾼다. 옛 `<영역>-specs/index.md` 보드는 지금 형식을 유지한다 |
| `scripts/harness/sdd_commands.py` | 명령 해석. `scaffold`(새 형식) · `prerequisites` · `board --area` · `plans` · `freshness` · `migrate` · `rekey` · `branch-check` |
| `scripts/check_harness.py` | 새 구조 상태 검사 · `check-issue-keys` · `check-legacy-frozen`을 fast 검사에 넣는다 |
| `scripts/new-feature.sh` · `board.sh` · `check-sdd-prerequisites.sh` · `check-spec-freshness.sh` · `sdd-layout.py` | 머리 주석과 사용법 |
| `scripts/git-hooks/pre-push` | 브랜치 이름 검사(R7.8) |
| `scripts/hooks/session-start.sh` | "새 SDD:" 줄 · "검증:" 줄(HK-7 R6.3). 고정 안내 바이트 수 ≤ 1,517(지금 값) |
| `agents-docs/_spec-templates/{requirements,design,tasks}/_template.md` | frontmatter, `| 상태 |` 행 삭제, 같은 폴더 기준 연계, "affected 결과 · CI full 링크"(R6.2) |
| `agents-docs/_spec-templates/{README.md,tasks/README.md}` | 새 위치 · `state` 값 |
| `agents-docs/_spec-templates/index.md` | 삭제(영역별 `index.md`를 더 만들지 않는다, §3.7.5) |
| `agents-docs/specs-index.md` | 새 보드 빈 상태 · 새 명령 |
| `agents-docs/{README.md,guides/{sdd-pattern,doc-standards,harness-engineering}.md,references/README.md,decisions/{_template,index}.md}` · `agents-rules/{sdd-workflow,agent-harness,git-workflow,reuse-before-new}.md` · `kiro-steering/{sdd-workflow,agent-harness,git-workflow}.md` · `agents-skills/hx-{specify,clarify,checklist,plan,tasks,analyze,implement,converge,harness}/SKILL.md`(+ `sync-commands.sh` 포인터) · `agents-root/roles/planner.md` · `root/README.md` | `new-feature.sh` · `check-sdd-prerequisites.sh` 사용법 줄, SDD 경로, `state` 값, 브랜치 규칙(git-workflow) |
| `packages/legacy-setup/hx-bootstrap/lib/harness-lib.sh` | `harness_write_meta`를 Python JSON 병합으로(R7.11) |

## 2. 설정(`.agents/harness-kit.json`)

| 키 | 없을 때 기본값 | 읽는 곳 |
|---|---|---|
| `issueKey.source` | `kit` | `--next`, 키 접두 검사 |
| `issueKey.prefix` | `tokens.PROJECT_SLUG`를 대문자로, 영숫자만, 앞 숫자 제거, 10자까지. 2자 미만이면 `ISSUE` | 같음 |
| `git.base` | `develop` | `--next`, `check-issue-keys`, `check-legacy-frozen` |
| `verify.fullOnlyInCI` | `true` | HK-2 훅(읽기만) |

`harness_write_meta`는 지금 파일을 JSON으로 읽어 킷 관리 키(`kitVersion` · `domain` · `stack` · `arch` · `agents` · `modules` · `installedAt` · `updatedAt` · `tokens`)만 바꾸고, 나머지 키는 값과 순서를 그대로 둔다. 위 세 묶음이 없으면 기본값을 더한다. 이미 있으면 사용자 값을 바꾸지 않는다(빠진 하위 키만 채운다). 배열은 한 줄로 쓴다 — `harness_meta_list`가 줄 단위 `sed`로 읽는다. 파일이 깨졌으면 `.bak`으로 남기고 새로 쓴다. `python3`가 없으면 지금처럼 통째로 쓰고 경고한다.

## 3. 명령

### 3.1 `scripts/new-feature.sh`

```text
new-feature.sh <키|--next> <이름> --area <영역> [--type feat|fix|refactor|perf|chore|docs]
               [--intent INT-<n>] [--unit U-<n>] [--dry-run]
new-feature.sh <키> --stage=design|tasks [--dry-run]
```

| 조건 | 동작 | exit |
|---|---|---|
| requirements 단계, `--area` 없음 | 기존 이슈의 area 목록 출력 | 2 |
| 키 · 이름 · 영역 · intent · unit 형식 위반(§3.7.2) | 안내 | 2 |
| `source=kit`인데 키 접두 ≠ `issueKey.prefix` | 안내 | 2 |
| `source=jira`인데 접두 ≠ prefix | 경고만, 생성 | 0 |
| `source=jira`에서 `--next` | §3.7.3 문구 | 2 |
| `--legacy` · `--all` · `--number` | 지원 끝 안내 | 2 |
| 옛 형식 `<slug> <이름>`(첫 인자가 키 형식이 아닌 소문자 토큰) | stderr에 새 형식 안내, `--next <이름> --area <slug>`로 실행 | 실행 결과 |
| 옛 형식에 `--stage=design|tasks` | 옛 구조는 읽기 전용이라 거부, `migrate` 안내 | 2 |
| 같은 키 · 같은 이름 폴더에 요청 단계 문서가 있음 | "이미 있습니다" | 0 |
| `--next`인데 작업 트리에 같은 이름 이슈가 있음 | 그 폴더를 알리고 만들지 않음 | 0 |
| 작업 트리나 `origin/<base>`에 같은 키 · 다른 이름 폴더가 있음 | 키 충돌 | 3 |
| design · tasks: `issues/<키>-*`가 0개 또는 2개 이상 | 안내 | 1 |
| design: requirements `status`가 `approved` 아님 · tasks: design도 | 선행 조건 실패 | 1 |
| 성공 | 문서 하나 생성, 보드 갱신 | 0 |

- 생성 문서의 frontmatter: `key` · `area` · `type` · `title`(= 이름) · `status: draft`(tasks는 `state: active`) · 선택 `intent` · `unit` · `jira` · `created`(오늘). design · tasks는 requirements의 `key` · `area` · `type` · `title` · `intent` · `unit` · `jira`를 이어받는다.
- `jira`: `source=jira`이고 `.agents/issue-tracker.yml`의 `baseUrl`이 `TBD`가 아니면 `<baseUrl>/browse/<키>`.
- `--dry-run`: 만들 경로와 키만 출력하고 쓰지 않는다.
- 전 과정이 `sdd_lock` 안에서 돈다.

### 3.2 `--next` 번호(§3.7.3)

1. `origin` 원격이 있으면 `GIT_TERMINAL_PROMPT=0 git fetch origin <base> --quiet`(10초 상한). 실패하면 stderr 경고 뒤 캐시된 ref를 쓴다.
2. 접두 P의 번호를 모은다: `git ls-tree --name-only origin/<base> -- .agents/docs/issues/` · 작업 트리 폴더 · `git for-each-ref refs/heads refs/remotes`의 `(^|/)P-(\d+)(-|$)` · `git worktree list --porcelain`의 `branch` 줄과 `worktree` 경로의 마지막 이름.
3. N = 최댓값 + 1(없으면 1).

### 3.3 `scripts/check-sdd-prerequisites.sh`

- 새 형식: `<키|키-이름> [--stage design|tasks|implement]`. 첫 인자가 키 형식이면 새 구조에서 찾는다. `BASE` · `REQUIREMENTS` · `DESIGN` · `TASKS`를 출력한다(`TASKS`는 `tasks.md`). implement는 `tasks.md`의 `state`가 `active`여야 한다.
- 옛 형식 `<slug> <이름|키>`는 지금처럼 옛 두 구조를 읽는다.

### 3.4 `scripts/board.sh`

| 호출 | 동작 |
|---|---|
| `board.sh` | `specs-index.md` BOARD 마커 사이와 옛 `<영역>-specs/index.md` 보드를 다시 쓴다 |
| `board.sh --check` | 쓰지 않고, 다르면 exit 1 |
| `board.sh --area <영역>` | 그 영역 표만 stdout에 낸다. 없는 영역이면 exit 1 |
| `board.sh <slug>` | 옛 `<slug>-specs/index.md`만 다시 쓴다(지금 호출 유지) |

`specs-index.md` 보드: 영역 이름순, 영역마다 `### <영역> (새 N · 옛 M)`과 `| 키 | 이름 | 종류 | req | design | tasks | 상태 |` 표. 새 이슈는 키 번호순, 옛 이슈는 그 아래에 키 칸 `<옛 번호> (옛)`로 붙인다. 상태 = `tasks` 값(`active` 구현 · `check` 검증 · `completed` 완료 · `superseded` 폐기), 없고 design이 있으면 설계, 그 밖에는 요구. 맨 위에 전체 개수 한 줄을 둔다. frontmatter가 틀린 문서가 하나라도 있으면 보드를 쓰지 않고 exit 1. 옛 영역 폴더에 옛 이슈가 0개면 그 `index.md` 보드는 "이슈는 `.agents/docs/issues/`(area: <영역>)로 옮겼다" 한 줄이 된다.

### 3.5 fast 검사(`scripts/check_harness.py`)

- 새 구조 상태 검사: 폴더 이름 = `<키>-<이름>`(§3.7.2), frontmatter 형식 · 필수 키 · 값, `key` = 폴더 키, 세 문서의 `area` · `type`이 같음, 작업 트리 안 같은 키 두 폴더 금지, tasks는 requirements · design이 있고 `T###` 줄이 있고 중복이 없고 `check` · `completed`면 빈 체크박스가 없다.
- `check-issue-keys`(R7.9): `origin/<git.base>`가 있으면 작업 트리 이슈 폴더마다 base 트리에 같은 키 · 다른 이름 폴더가 있는지 본다. 있으면 §3.7.3 문구로 실패. ref가 없으면 건너뛴다.
- `check-legacy-frozen`(R7.7): `origin/<base>`가 있으면 merge-base부터 작업 트리까지 `git diff -M --diff-filter=A --name-only`, 없으면 HEAD부터. 둘 다 `git ls-files --others --exclude-standard`(추적 안 된 파일)를 더한다. 경로는 `.agents/docs/*-specs/{issues,requirements,design,tasks}/*`. 하나라도 있으면 실패. git이 없거나 HEAD가 없으면 건너뛴다. 이름 변경(`-M`)은 추가로 세지 않으므로 옛 tasks 파일을 상태 폴더 사이로 옮기는 일은 통과한다.

### 3.6 pre-push(R7.8)

`unset $(git rev-parse --local-env-vars)` 뒤, 게이트보다 먼저 `python3 scripts/sdd-layout.py branch-check <refs 파일>`을 부른다(`sdd-layout.py`가 없으면 건너뛴다). push ref마다 원격 ref 이름에서 브랜치를 얻는다.

| 브랜치 | 동작 |
|---|---|
| `^(feat|fix|refactor|perf|chore|docs)/([A-Z][A-Z0-9]{1,9}-[0-9]+)-[a-z0-9-]+$` | 올리는 커밋 트리에 `.agents/docs/issues/<키>-*`가 없으면 exit 1. 리포가 submodule이면 상위 리포 작업 트리에서 찾는다 |
| `exp/*` · 태그 · 삭제 push · `git.base` · `main` · `master` | 보지 않는다 |
| 그 밖 | stderr 경고, 통과 |

### 3.7 `sdd-layout.py migrate`(§3.7.6)

- `--dry-run [--include-legacy] [--prefix P] [--start N] [--areas a,b]`: `.agents/state/migrate-map.json`만 쓴다. 항목 = 옛 이슈 폴더 하나(`layout: issue`), `--include-legacy`면 단계 폴더 문서를 키로 묶은 것(`layout: stage`). 키는 (영역, 옛 번호, 이름) 순으로 `<prefix>-<start+i>`, start 기본값은 §3.2의 최댓값 + 1. 경고: `slug`(고친 이름 제안: `_`→`-`, 대문자→소문자, 6단어 이상은 앞 5단어, 1단어 · 숫자로 시작하면 `<영역>-` 접두), `duplicate`, `dirty`, `type`(단계 폴더 키에 종류가 없으면 `feat`), `tasks`(상태 파일이 둘 이상). `boardBefore`에 영역별 상태 개수를 적는다.
- `--apply --map <파일> [--rewrite-links]`:
  1. 검사(실패 시 아무것도 옮기지 않고 exit 3): schema, 키 형식 · 중복 · 기존 이슈 폴더와 충돌, `to` = `.agents/docs/issues/<key>-<slug>`이고 없음, `from`이 있고 깨끗함, `.agents/docs`에 커밋 안 된 변경 없음.
  2. `action: move` 항목마다 파일 · 폴더를 `git mv`. `tasks/<상태>.md`(단계 구조는 `tasks/<상태>/<키>.md`) → `tasks.md`. 빈 옛 폴더를 지운다.
  3. requirements · design · tasks에 frontmatter를 넣는다(`status`는 옛 `| 상태 |` 값, tasks의 `state`는 옛 위치). 표의 상태 행을 지우고 `legacy`에 옛 경로를 적는다.
  4. 옮긴 문서의 상대 링크를 새 위치 기준으로 다시 계산한다. `--rewrite-links`면 `.agents/docs/**/*.md`의 옛 경로 링크도 고친다. 그 밖의 추적 Markdown에서 옛 경로를 쓰는 파일은 목록만 낸다.
  5. 보드를 다시 만들고 영역별 상태 개수를 `boardBefore`와 비교한다. 다르면 `git restore --source=HEAD --staged --worktree -- .agents/docs`, 남은 `to` 폴더 삭제, 차이 출력, exit 1.
  6. 커밋하지 않는다. `git status --short` 줄 수와 커밋 명령 예를 낸다.
- `rekey <키> (--next | <새 키>)`: 폴더 이름(추적 중이면 `git mv`), 세 문서의 `key`와 본문의 옛 폴더 이름을 바꾸고, 현재 브랜치 이름에 옛 키가 있으면 `git branch -m` 명령을 출력한다.

## 4. 템플릿

- 세 템플릿 첫 줄부터 frontmatter(`{{ISSUE_KEY}}` · `{{AREA}}` · `{{TYPE}}` · `{{TITLE}}` · `{{CREATED}}`)를 둔다. `new-feature.sh`는 템플릿 frontmatter를 떼고 실제 값으로 새로 쓴다. `{{FEATURE_NAME}}`은 폴더 이름, `{{PRODUCT_SLUG}}`는 영역, `{{EPIC_ID}}`는 jira 키 또는 `미지정`.
- `| 상태 |` 행을 지운다. 연계 행은 같은 폴더의 `requirements.md` · `design.md` · `tasks.md`.
- tasks · design의 "full 선택/이유" 칸 → "affected 결과 · CI full 링크". "full은 `--full`로 명시한다" → "MR 전에는 `bash scripts/verify.sh --affected`, 전체 검증(full)은 CI가 돈다".
- tasks 완료 처리: 파일 이동 → `state` 값 변경.

## 5. 세션 시작 안내

| 줄 | 바꾼 뒤 |
|---|---|
| 새 SDD | `.agents/docs/issues/<키>-<이름>/{requirements.md,design.md,tasks.md}`, 상태는 frontmatter, 옛 `<영역>-specs/`는 읽기 전용 |
| 검증 | 기본 changed, MR 전 `--affected`, full은 CI |

고정 안내(heredoc) 바이트 수는 지금 1,517바이트 이하로 둔다. `tests/test_install.py`가 템플릿 원본에서 잰다.

## 6. 시험

설치본 안(`tests/harness_scripts/`, python 스택):

| 파일 | 시험 |
|---|---|
| `test_issue_sdd.py` | 새 구조 생성(requirements 하나만, frontmatter, 상태 행 없음), 단계 승인 게이트, 이미 있음, 키만으로 단계 찾기, 선행 조건 경로 출력, 보드 영역 표 · `--area` · `--check` 읽기 전용, frontmatter 틀림 → 보드 중단, 상태 검사(state · 체크 · 중복 ID · 키 불일치 · area 불일치), 신선도, 동시 `--next` 6개가 1~6, 심볼릭 링크 거부, 옛 두 구조 읽기(선행 조건 · 보드 `(옛)` · 상태 검사 · 신선도) |
| `test_issue_keys.py` | 키 · 이름 규칙(통과 · 거부 각 5종), `--next`가 다섯 출처(base 트리 · 작업 트리 · 로컬 브랜치 · 원격 브랜치 · worktree)의 최댓값 + 1, jira에서 `--next` exit 2와 문구, kit 접두 불일치 exit 2, jira 접두 불일치 경고, exit 0/1/2/3, 옛 호출 변환 안내, `--legacy` exit 2, 키 충돌 fast 실패 → `rekey` 뒤 통과, 옛 구조 동결(새 파일 실패 · 수정 통과 · 상태 폴더 이동 통과), pre-push 브랜치 규칙(폴더 없음 exit 1 · 있음 통과 · `exp/` 통과 · 형식 아님 경고), frontmatter 파서 |
| `test_issue_migrate.py` | dry-run이 지도만 쓰고 파일을 바꾸지 않음, 키 순서 · 경고(slug · dirty · duplicate), apply 이동 · frontmatter · 상태 행 삭제 · 링크 다시 계산 · 개수 같음, 검사 실패 exit 3 무변경, 개수 다름 → 되돌림 exit 1 |
| `test_harness_shared.py` · `test_session_hooks.py` | 옛 호출을 쓰는 시험을 새 형식으로 바꾼다(tasks에 이유) |

킷(`tests/test_install.py`):

- `test_new_feature_scaffolds_issue_folder_with_sdlc_sections`: 새 형식 호출, 결과 경로 `issues/ACMENOTES-1-folder-bookmark/`.
- 새로: 설치 메타에 `issueKey` · `git.base` · `verify.fullOnlyInCI` 기본값. 사용자가 고친 세 값과 모르는 키가 `update.sh` 뒤에 남는다.
- 새로: 세션 시작 고정 안내 ≤ 1,517바이트.

## 설계와 다른 점

| 설계 01 | 이 구현 | 이유 |
|---|---|---|
| §3.7.8 형식이 아닌 브랜치는 경고 | `git.base` · `main` · `master` · 태그는 경고도 내지 않는다 | 기본 브랜치 push마다 경고가 나면 경고를 읽지 않게 된다 |
| §3.7.7 merge-base 기준 diff | `origin/<base>`가 없으면 HEAD 기준, 추적 안 된 파일도 센다 | 원격이 없는 리포와 커밋 전 파일도 잡는다 |
| §3.7.3 fetch 실패는 경고 | `origin` 원격이 없으면 fetch를 부르지 않고 경고도 없다 | 로컬 전용 리포에서 매번 경고가 난다 |
| §3.6 `_spec-templates/index.md` 문구 수정 | 파일 삭제 | §3.7.5에 따라 영역별 `index.md`를 더 만들지 않아 쓰는 곳이 없다 |
| §3.7.1 명령에 이름 중복 규칙 없음 | `--next`에서 작업 트리에 같은 이름 이슈가 있으면 만들지 않고 exit 0 | 같은 명령을 다시 불러도 이슈가 둘 생기지 않는다 |
| §3.7.2 prefix = PROJECT_SLUG 대문자 | 영숫자만 · 앞 숫자 제거 · 10자, 2자 미만이면 `ISSUE` | 키 정규식(`^[A-Z][A-Z0-9]{1,9}`)을 만족해야 한다 |
| §3.7.6 apply 5단계 한 줄 교체 | 옛 `index.md` 보드 렌더러가 옛 이슈 0개일 때 그 한 줄을 낸다 | `board.sh`가 다시 돌아도 같은 결과가 나온다 |
| §3.7.3 `rekey <키> --next` | `rekey <키> <새 키>`도 받는다 | Jira 키로 바꿀 때 쓴다 |
| §3.7.2 `harness_write_meta`만 병합 | `harness_meta_list`도 python3 가 있으면 JSON 으로 읽는다 | 사람이 배열을 여러 줄로 고치면 sed 로는 에이전트 목록을 못 읽어 update 가 에이전트 층을 건너뛴다 |
| §3.6 표의 파일 범위 | `stacks/*`(AGENTS · CLAUDE · ARCHITECTURE · structure · guardrails)와 `tools/docs` · `optional/jira-workflow` · `packages/plugin` · `setup.sh` 의 옛 경로 문구는 바꾸지 않았다 | 이 이슈의 담당 파일이 아니다. 후속 정리 목록으로 넘긴다 |
