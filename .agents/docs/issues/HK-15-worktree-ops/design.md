---
key: HK-15
area: worktree
type: feat
title: worktree 운영 — 리포 옆 폴더 · 둘째 세션부터 · 리포당 3개 · 끝나면 지움
status: in-review
created: 2026-11-24
---

# Design — HK-15

근거: [requirements](requirements.md), [설계 05](../../../../docs/design/05-worktree.md) §2 · §3, [README](../../../../docs/design/README.md) 원칙 7 · 9 · 10, [03](../../../../docs/design/03-projection-and-hooks.md) §3.4 · §3.5(병합 규칙). 선행: HK-13(배치 엔진 · 병합 종류), HK-24(`hooks.json` · 디스패처 · `hook_root`), HK-17(세션 등록 `.agents/state/sessions/`), HK-14(개인 층 `git.ide`).

`worktree.py` 는 git 과 파일 시스템만 부른다. 모델을 부르지 않고, 세션에 실리는 바이트를 늘리지 않는다(새 훅 둘은 세션 시작 출력에 들어가지 않고, 성공 출력은 Create 가 경로 한 줄, Remove 는 0바이트다). 리포 밖에 쓰는 것은 사람이 명령한 worktree 자리(`git.worktreeRoot`)뿐이다.

## 1. 바뀌는 파일

| 자리 | 내용 |
|---|---|
| `scripts/harness/worktree.py`(새) | 명령 입구: `new` · `list` · `open` · `done` · `gc` · `hook-create` · `hook-remove`. 인자 · 종료 코드 · 출력 |
| `scripts/harness/worktree_repo.py`(새) | git 호출 · 메인 폴더 M · 상위 리포 S · root · 자리 · 설정 읽기(메타 · 개인 층) · 이슈 찾기 |
| `scripts/harness/worktree_state.py`(새) | 상태 기록(05 §3.14) 읽기 · 쓰기 · 세션 기록 읽기 · 끝 조건 · 용량 |
| `scripts/harness/worktree_prepare.py`(새) | `.worktreeinclude` · 의존성 · `.env.worktree` · sparse · `df` |
| `scripts/harness/worktree_create.py`(새) | `new` 알고리즘(05 §3.3) · 훅 create(이슈 · 임시) |
| `scripts/harness/worktree_finish.py`(새) | `done` · `gc` · 훅 remove · `list` · `open` |
| `scripts/hooks/worktree-create.sh` · `worktree-remove.sh`(새) | 디스패처가 부르는 훅 스크립트. `worktree.py hook-create` · `hook-remove` 로 넘긴다 |
| `agents-root/hooks.json` | `harness-worktree-create` · `harness-worktree-remove`(Claude 만) |
| `scripts/harness/projection.json` | `hookMap.events` 에 `worktree-create` · `worktree-remove`(Claude 만) |
| `root/.worktreeinclude`(새) · 스택별 `.gitignore` | 복사 목록 템플릿 · `.env.worktree` 무시 |
| `projection_merge.py` · `projection_wants.py` / `merge.ts` · `engine.ts` | 병합 종류 `vscode-settings`: `.vscode/settings.json` 에 `git.detectWorktrees: true`(R6.1) |
| `agents-rules/git-workflow.md` · `session-collaboration.md` | worktree 규칙 · 끝내지 못했을 때 알림 · `gc --apply` 는 사람이 시킬 때만 |

CLI(`npx harness-kit`)에 명령을 더하지 않는다. 설계 05 · README §7 이 `worktree.py` 를 리포 스크립트로만 정하고, 대시보드는 `list --all --json` 을 읽는다(원칙 9: 화면 · CLI 가 같은 스크립트를 쓴다).

## 2. 설계 05 와 다르게 하는 것(먼저 읽는다)

| 05 | 이 판 | 이유 |
|---|---|---|
| §2 R3.1 `git status --porcelain` 이 비어 있어야 | 킷이 만든 `.env.worktree`(gitignore 가 없는 리포의 `?? .env.worktree`)만 빼고 센다 | 템플릿 `.gitignore` 가 없는 기존 리포에서 `new` 직후 `done` 이 영영 막힌다. 다른 추적 안 된 파일은 그대로 센다 |
| §3.11 2d 부른 프로세스의 작업 폴더가 P 안이면 거부 | `hook-remove` 는 이 검사를 하지 않고, 훅 입력의 `session_id` 세션 기록은 2c 에서 뺀다 | 훅을 부르는 쪽이 Claude 자신이고 그 세션이 막 끝났다. 검사하면 `claude -w` 로 만든 worktree 가 지워지지 않는다 |
| §3.5 `.worktreeinclude` 패턴 | gitignore 문법 중 `*` · `**` · `?` · 앞 `/`(루트 고정) · 끝 `/`(폴더) · `!`(제외)를 지원한다. 문자 클래스는 `fnmatch` 규칙 | 표준 라이브러리만 쓴다. 후보는 `git ls-files -oi --exclude-standard --directory`(무시된 폴더는 들어가지 않는다)에서 뽑으므로 무시 판정은 git 이 한다 |
| §3.6 의존성 단위 | `git ls-files` 가 아는 `pnpm-lock.yaml` · `uv.lock` · `package-lock.json` · `Cargo.toml` 위치(sparse 로 빠진 폴더 제외)다. `.agents/harness.json` 표지를 읽지 않는다 | 표지가 없는 단일 리포도 같은 규칙으로 돈다 |
| §3.10 세션의 `worktree` 객체 | 만들지 않고 세션 기록의 `cwd` 가 P 아래인지로 센다 | HK-17 형식이 이미 `cwd` · `checkout` 을 가진다. 필드를 늘리면 세션 시작 훅 출력 예산 시험을 다시 묶어야 한다 |
| §3.12 · §5 #6 `session-coordination.py prune` | 이 이슈에 넣지 않는다. `gc --apply` 는 세션 기록(`state/sessions/*.json`, 7일)만 지운다 | 점유 저장소(knots 사본 `state.json`)의 시각 필드를 확인한 뒤 따로 더한다(05 §6). 05 §5 의 6번이 남는다 |
| §3.13 `claude -w "#1234"` 이름 | 임시 이름에서 `[A-Za-z0-9._-]` 밖의 글자를 `-` 로 바꾸고 `#` 로 시작하면 `pr-` 를 붙인다 | `name` 값이 확인되지 않았다(05 §6). 어떤 값이 와도 폴더 이름으로 안전하게 만든다 |
| §3.8 `wt list` 대상 | 기본은 지금 리포의 worktree, `--all` 은 S 의 모든 기록. root 밖 worktree 는 `외부` 로 한 줄만 | 05 §3.8 에 대상 범위 문장이 없어 정한다 |

## 3. 자리 · 설정 읽기

- M: `git worktree list --porcelain` 의 첫 `worktree`. S: `git rev-parse --show-superproject-working-tree`, 비면 M 에서 같은 질의, 그래도 비면 S = M.
- 설정은 S 의 `.agents/harness-kit.json`(없으면 M)에서 `git.base`(`develop`) · `git.worktreeRoot`(`../{repo}.worktrees`) · `git.maxPerRepo`(3) · `git.ide`(`code`). 개인 `git.ide` 는 `.agents/local/harness-kit.local.json` 의 `git.ide` 문자열만 읽는다(TS `readLocalConfig` 와 같은 규칙: 객체 `git` 안의 `ide` 문자열, 그 밖 키는 무시, JSON 이 깨졌으면 없는 것으로).
- root: `{repo}` = S 폴더 이름, 상대 경로는 S 기준, `~` 는 홈. 이슈 worktree `root/<키>-<이름>`, 도메인 `root/<도메인>/<키>-<이름>`, 임시 `root/_agents/<이름>`.
- 이슈: S 의 `.agents/docs/issues/<키>-*/` 의 `requirements.md` frontmatter(`type`)와 폴더 이름의 slug. 작업 트리에 없으면 `git ls-tree origin/<base>` 로 찾고 `design.md` 도 `git show` 로 읽는다.

## 4. 명령 · 종료 코드

05 §3.2 표 그대로(0 · 1 · 2 · 3 · 5). 인자 오류 2 는 argparse. `--json` 은 `new` · `list` · `done` · `gc` 에서 표준 출력을 JSON 객체 하나로 바꾼다(대시보드용).

`new` 는 05 §3.3 의 순서를 따른다. 상한 · 자리 · design 검사는 만들기 전에 끝난다. worktree 를 만든 뒤(7번)의 복사 · 의존성 · 포트 단계가 실패하면 worktree 는 두고 경고한다(만든 것을 지워 일을 잃지 않는다).

`done` · `gc` · `hook-remove` 는 하나의 끝 조건 판정(변경 줄, 안 올린 커밋, 살아 있는 다른 세션, 부른 폴더가 P 안인지)을 쓴다. 통과하지 못하면 아무것도 지우지 않는다. `git worktree remove P` 가 ignore 파일 때문에 거부되면 그때만 `--force` 로 다시 부른다.

## 5. 훅

`hooks.json` 항목(Claude 만, 디스패처 경유):

| id | event | script | 비고 |
|---|---|---|---|
| `harness-worktree-create` | worktree-create | `scripts/hooks/worktree-create.sh` | `timeoutSec` 60(fetch 10초 + 복사). 표준 출력 = 경로 한 줄 |
| `harness-worktree-remove` | worktree-remove | `scripts/hooks/worktree-remove.sh` | `timeoutSec` 60. 출력 없음 |

`hookMap.events` 에 `worktree-create` → Claude `WorktreeCreate`, `worktree-remove` → Claude `WorktreeRemove`. 다른 하네스는 이벤트가 없어 만들지 않는다(`harnesses: ["claude"]`). 설정은 `.claude/settings.json` 에 병합한다(플러그인이 아니라 프로젝트 설정 — 05 §3.13).

## 6. VS Code 설정 병합(R6.1)

병합 종류 `vscode-settings`(대상 `.vscode/settings.json`, lock 키 `jsonc:git.detectWorktrees`). 조건: `.vscode/` 폴더가 있거나 `harness-kit.json` 에 `git.ide` 가 `code` 로 적혀 있다. 적지 않았으면 만들지 않는다(기본값만으로 파일을 만들면 VS Code 를 안 쓰는 리포에 `.vscode/` 가 생긴다).

JSONC 문자열을 줄 단위로 고친다(주석 · 다른 키 · 들여쓰기를 그대로 둔다):

- 파일이 없으면 만든다(`createdByKit`). 있고 키가 최상위에 없으면 마지막 항목 뒤에(쉼표가 필요하면 붙여) 한 줄을 더한다.
- 키가 이미 있으면 값이 무엇이든 건드리지 않는다. 사람이 `false` 로 둔 것은 사람 뜻이다. 값이 `true` 이고 이전 lock 에 우리가 적은 키였으면 계속 적는다.
- 빼기: 우리가 더한 줄(키가 `true`)만 지운다. 파일이 킷이 만든 것이고 다른 항목 · 주석이 없으면 파일을 지운다. 사람이 마지막 항목 뒤에 쉼표를 둔 채 우리가 더한 줄을 지우면 그 쉼표는 남는다(JSONC 에서 유효).
- 읽을 수 없는 JSONC 면 충돌이고 파일은 그대로다. Python · TS 는 같은 스캐너 알고리즘을 쓴다(동일성 시험).

## 7. 시험(RED 먼저)

| 시험 | 내용 |
|---|---|
| `tests/harness_scripts/test_worktree.py`(설치본) | 임시 리포 + 로컬 bare origin. new(자리 · 브랜치 · upstream 없음 · 상한 3 → exit 3 · design 미승인 exit 1 · `--docs` sparse · `.worktreeinclude` · 포트 +200 · 상태 기록) · list(JSON · 변경 · 안올림 · 세션) · done(clean · push 안 됨 exit 1 · 세션 사용 중 · push 뒤 삭제 · 브랜치 삭제) · gc(목록만 · apply · 임시 · 고아 기록) · hook-create · hook-remove · 도메인(submodule) worktree · open(가짜 `code`) |
| `tests/harness_scripts/test_worktree_hooks.py` | 디스패처를 거친 WorktreeCreate · Remove 입력(JSON)으로 출력 · 종료 코드 |
| `packages/cli/test/vscode-merge.test.ts` · `tests/test_vscode_merge.py` | JSONC 병합 · 빼기 · 충돌 · TS = Python 같은 바이트 |
| 기존 | `projection-parity` · `projection-merge` · `projection-hooks`(fixture 에 새 이벤트) · 세션 시작 예산 · 템플릿 문구 시험 |
