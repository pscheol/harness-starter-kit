---
paths:
  - ".agents/docs/issues/**"
  - "scripts/git-hooks/**"
  - ".github/**"
  - ".gitlab-ci.yml"
---
# Git 워크플로 — 브랜치·커밋·PR

**작업 단위는 SDD 기능 하나다.** 브랜치 하나 = 이슈 폴더의 `requirements` → `design` → `tasks` 한 벌 = PR 하나.
SDD 문서 없이 브랜치를 따지 않는다 — 문서가 없으면 무엇을 만드는지 합의되지 않은 것이다.

SDD 워크플로 원본은 `.agents/rules/sdd-workflow.md`, 이 파일은 그 결과물을 어떻게 리포에 싣는지를 정한다.

## 브랜치 이름 — `<종류>/<이슈키>-<이름>`

브랜치는 이슈 폴더 `.agents/docs/issues/<이슈키>-<이름>/` 와 같은 키 · 이름을 쓴다. 키가 리포 전체에서 하나이므로 단위 id 를 앞에 붙이지 않는다.

```text
SDD    .agents/docs/issues/KNOTS-17-desktop-parity/tasks.md
브랜치  feat/KNOTS-17-desktop-parity

SDD    .agents/docs/issues/KNOTS-21-cursor-decode-error/
브랜치  fix/KNOTS-21-cursor-decode-error
```

- 형식: `^(feat|fix|refactor|perf|chore|docs)/([A-Z][A-Z0-9]{1,9}-[0-9]+)-[a-z0-9-]+$`.
- pre-push: 이 형식의 브랜치를 올릴 때 그 커밋에 `.agents/docs/issues/<이슈키>-*` 가 없으면 막는다. 형식이 아니면 경고만 낸다.
- `exp/` 브랜치(병합하지 않는 실험)는 검사하지 않는다.
- 다층 하네스(선택 모듈 `multi-harness`): SDD 폴더는 메인 리포에 있고, 도메인 리포 브랜치도 같은 이름을 쓴다. 도메인 리포의 pre-push 는 메인 리포 작업 트리에서 폴더를 찾는다.

## 여러 리포로 나눈 경우 — 두 단계 커밋

도메인 리포를 메인 리포의 submodule 로 묶었으면(선택 모듈 `multi-harness`) 메인 리포는 도메인 리포의 커밋 하나를 가리킨다.

1. 도메인 리포 안에서 브랜치를 따고 커밋·push 한다.
2. 메인 리포에서 `git add <도메인 폴더>`로 포인터를 올리고 커밋한다. 도메인 리포를 push 한 뒤에 push 한다.
3. 여러 리포에 걸친 기능은 리포마다 같은 브랜치 이름을 쓴다.

| 종류 | 언제 | 예 |
|---|---|---|
| `feat` | 새 기능·마일스톤 | `feat/KNOTS-17-desktop-parity` |
| `fix` | 버그 수정 | `fix/KNOTS-21-cursor-decode-error` |
| `refactor` | 동작 그대로 구조 변경 | `refactor/KNOTS-30-order-port-split` |
| `perf` | 성능 개선 | `perf/transcript-query` |
| `chore` | 빌드·설정·의존성 | `chore/gradle-9-upgrade` |
| `docs` | 문서만 | `docs/erd-index-table` |

- 종류를 이름에 겹쳐 쓰지 않는다: `feat/feat-order` 금지.
- 이름은 kebab-case. 한글·공백·대문자를 쓰지 않는다.
- 한 브랜치에 두 기능을 담지 않는다. 담아야 할 것 같으면 SDD 기능이 잘못 쪼개진 것이다.

## 버그도 SDD를 밟는다

`fix`가 문서를 건너뛰는 통로가 아니다. 규모에 맞게 짧게 쓰되 세 단계를 다 만든다.

| 단계 | 버그에서 담는 것 |
|---|---|
| requirements | 재현 절차 · 기대 동작 · 실제 동작 · 영향 범위 |
| design | 원인 · 수정 범위 · 회귀 위험 · 같은 원인의 다른 자리 |
| tasks | 실패하는 테스트 먼저 → 수정 → 회귀 확인 |

운영 장애로 즉시 고쳐야 하면 수정을 먼저 하고 같은 PR 안에서 세 문서를 채운다. 문서 없는 병합은 없다.

## worktree — 둘째 쓰기 세션부터

같은 리포에서 파일을 쓰는 세션이 둘 이상일 때만 worktree 를 쓴다. 리뷰 · 스캔처럼 읽기만 하는 세션은 만들지 않고 원격 브랜치 diff 를 읽는다. 첫 쓰기 세션은 메인 폴더에서 일한다.

- 만들기: `python3 scripts/harness/worktree.py new <이슈키>` — 자리는 `../<리포>.worktrees/<이슈키>-<이름>/`, 브랜치는 `<종류>/<이슈키>-<이름>`(시작점 `origin/<git.base>`). `git clone` · 폴더 복사로 작업 공간을 만들지 않는다. 원본과 연결이 없어 끝났는지 알 수 없고, 지우면 push 안 된 커밋이 같이 사라진다.
- 구현 worktree 는 그 이슈의 `design.md` 가 `approved` 일 때만 만든다. 문서만 쓰면 `--docs`(sparse: `.agents/` · `docs/` · `scripts/` 와 루트 파일).
- 리포당 `git.maxPerRepo`(기본 3)개까지. 넘으면 만들지 않고(exit 3) 끝낸 것을 `done` 으로 지우라고 알린다. submodule 을 가진 상위 리포는 도메인 리포 안에서 만들거나 `--domain <경로>` 를 준다.
- 앱 포트: `.env.worktree` 가 worktree 번호 × 100 만큼 민 포트(`SERVER_PORT=8280` 등)를 쓴다. 앱 · compose 설정이 `.env` 다음에 이 파일을 읽어야 한다.
- 끝: 변경이 모두 커밋되고 push 되면 끝이다. `git status --porcelain` 이 비고 `git rev-list --count HEAD --not --remotes` 가 0 이면 `python3 scripts/harness/worktree.py done <이슈키>` 로 지운다(다른 세션이 쓰는 중이거나 부른 폴더가 그 worktree 안이면 지우지 않는다).
- 끝내지 못하고 세션을 마칠 때는 남긴 worktree 와 이유(push 안 된 커밋 · 커밋 안 된 변경)를 사용자에게 알린다.
- 정리: `worktree.py list` 로 상태를 본다. `worktree.py gc` 는 목록만 낸다. `gc --apply` 는 사람이 시킬 때만 실행한다.
- Claude Code `claude -w <이름>` 은 같은 자리에 만든다(이슈 키가 아닌 이름은 `_agents/<이름>/`).

## 베이스 브랜치

```text
main <-- develop <-- <종류>/<이름>
```

- 기능 브랜치는 `develop`에서 따고 `develop`으로 되돌린다.
- `main`은 릴리스만 받는다. 기능 브랜치가 `main`을 직접 겨냥하지 않는다.
- 기능 브랜치에서 다시 브랜치를 따지 않는다. 필요하면 SDD 기능을 나눈다.

## 커밋 메시지 — `<종류>: <무엇을 왜>`

```text
feat: Stage 0 M2 스키마와 불변식 — mtg 8테이블·권한 회수·회의 유스케이스

확정 전사 두 테이블의 UPDATE·DELETE 권한을 앱 롤에서 회수했다.
소유자 계정으로 접속하면 회수가 무효라 접속 계정을 app_api 로 분리했다.
```

- 종류는 브랜치와 같은 값을 쓴다.
- 제목은 무엇을 왜 바꿨는지 한 줄. 파일 목록을 쓰지 않는다 — git이 안다.
- 본문은 필요할 때만. 되돌리기 어려운 결정과 그 이유를 남긴다.
- 문체는 `.agents/rules/writing-style.md`. 비유·상투구를 쓰지 않는다(§6).
- 커밋은 사용자가 요청할 때 한다. 에이전트가 임의로 커밋하지 않는다.

## PR

- 제목은 커밋 제목과 같은 형식.
- 본문에 SDD 세 문서 경로를 링크한다. 리뷰어가 요구사항을 열어봐야 정확성을 판정할 수 있다.
- 변경 범위 테스트와 `bash scripts/verify.sh --affected`를 실행하고 검증 수준을 PR에 적는다. 전체 검증(full)은 CI가 돌고, PR에는 그 결과 링크를 적는다. hook 결과와 CI 결과를 구분한다.
- 리뷰 기준은 `.agents/rules/pr-review-policy.md`.

## exec-plan 상태와 브랜치

`tasks.md` 머리의 `state` 가 곧 진행 상태다(`active` → `check` → `completed`).

| 시점 | tasks `state` | 브랜치 |
|---|---|---|
| 구현 중 | `active` | 기능 브랜치 살아 있음 |
| DoD 충족·사용자 검증 대기 | `check` | PR 열림 |
| 사용자 승인 후 | `completed` | 병합·삭제 |

`completed`로 바꾸는 것은 사람이 남긴 `done` 승인 기록 뒤다(`.agents/rules/approval-vocabulary.md`). 에이전트가 임의로 바꾸지 않는다.
