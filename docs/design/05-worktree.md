# 05. worktree 운영 — `scripts/harness/worktree.py`

- 단계: P19(v2.1). 계획: [harness-next 03장 P19](../harness-next/03-plan.html#p19).
- 근거: [02장 worktree 운영](../harness-next/02-direction.html#worktree) · D5 · D4(base 추천값 `develop`).
- 외부 근거: Claude Code [worktrees](https://code.claude.com/docs/en/worktrees) · [hooks — WorktreeCreate/WorktreeRemove](https://code.claude.com/docs/en/hooks#worktreecreate)(2026-11-23 확인).
- 이 문서의 `wt`는 `python3 scripts/harness/worktree.py`를 줄여 쓴 것이다.

## 1. 목적·범위

같은 리포에서 동시에 파일을 쓰는 세션이 둘 이상일 때만 worktree를 쓴다. 정해진 자리에, 리포당 3개까지, 끝나면 바로 지운다(D5).

| 범위 | 내용 |
|---|---|
| 넣는다 | `wt new · list · open · done · gc`, 자리·이름 규칙, `--docs` sparse checkout, `.worktreeinclude`, 스택별 의존성 가져오기, 빌드 캐시 공유, 포트 오프셋, 용량 보고, VS Code 설정 병합, IDE 열기, Claude WorktreeCreate·WorktreeRemove 훅, 세션 등록 연결, 점유 기록 정리 |
| 넣지 않는다 | CI·MR 템플릿, `git-workflow.md` 본문 개정(P19의 다른 작업), 대시보드 작업 공간 탭 화면([06](06-dashboard.md)) |
| 실행 환경 | Python 3.9+ 표준 라이브러리, git 2.31 이상(`rev-parse --path-format=absolute`). Node 없이 돈다 |

현장 수치: knots는 작업 공간 규칙 이전 3일 만에 폴더 97개·109GB가 쌓였다(`~/knots-work`, 2026-11-18). 점유 상태 파일은 25MB(`.agents/coordination/state.json` 24MB 실측, 2026-11-23).

## 2. 요구사항

- R1.1 `wt new <이슈키>`는 `<git.worktreeRoot>/<이슈키>-<이름>/`에 `<종류>/<이슈키>-<이름>` 브랜치로 worktree를 만든다. 새 브랜치의 시작점은 `origin/<git.base>`다.
- R1.2 구현 worktree는 그 이슈의 `design.md`가 `approved`일 때만 만든다.
- R1.3 리포 하나에 킷이 만든 이슈 worktree가 `git.maxPerRepo`개 있으면 다음 `wt new`는 exit 3으로 거부한다.
- R1.4 submodule을 가진 상위 리포에서는 `--docs`가 아니면 worktree를 만들지 않는다. 도메인 리포 worktree는 `<root>/<도메인>/<이슈키>-<이름>/`에 만든다.
- R2.1 `wt new --docs`는 sparse checkout으로 `.agents/`·`docs/`·`scripts/`와 루트 파일만 체크아웃한다.
- R2.2 `wt new`는 메인 폴더의 `.worktreeinclude`에 맞고 gitignore된 파일만 복사한다.
- R2.3 macOS npm 프로젝트에서 `node_modules`를 APFS 복제로 가져온다. pnpm·uv는 명령을 안내한다(`--deps`면 실행한다).
- R2.4 `wt new`는 `.env.worktree`에 worktree 번호만큼 민 포트 값을 쓴다.
- R3.1 `wt done`은 `git status --porcelain`이 비어 있고 `git rev-list --count HEAD --not --remotes`가 0일 때만 worktree와 로컬 브랜치를 지운다. 아니면 남은 이유를 출력하고 exit 1.
- R3.2 `wt gc`는 기본으로 목록만 출력한다. `--apply`면 끝난 것만 지운다. 에이전트는 사람이 요청할 때만 `--apply`를 쓴다.
- R4.1 `claude -w <이슈키>`는 WorktreeCreate 훅으로 R1.1과 같은 자리에 만든다. 이슈 키가 아닌 이름은 `<root>/_agents/<이름>/`에 만든다.
- R4.2 WorktreeRemove 훅은 R3.1 검사를 통과할 때만 지우고 브랜치도 지운다.
- R5.1 `wt list`는 worktree마다 브랜치·이슈·변경 수·push 안 된 커밋 수·용량·마지막 사용 시각·살아 있는 세션 수를 출력한다.
- R5.2 킷 worktree 합계가 20GB를 넘거나 디스크 여유가 10GB 아래면 `wt list`가 경고한다.
- R6.1 VS Code를 쓰는 리포에서 `.vscode/settings.json`에 `git.detectWorktrees: true`가 병합된다.

## 3. 설계

### 3.1 자리와 이름

| 값 | 정하는 법 |
|---|---|
| 메인 폴더 M | `git worktree list --porcelain`의 첫 `worktree` 줄. submodule 안에서도 그 리포의 메인 작업 트리를 준다 |
| 상위 리포 S | `git rev-parse --show-superproject-working-tree`. 비어 있으면 S = M |
| `{repo}` | S의 폴더 이름(`knots-platform`) |
| root | `git.worktreeRoot`(기본 `../{repo}.worktrees`)를 S 기준으로 푼다. `~`는 홈, 절대경로는 그대로(knots는 `~/knots-work`를 쓸 수 있다) |
| 이슈 worktree | 단일 리포 `root/<키>-<이름>/`, 도메인 리포 `root/<도메인>/<키>-<이름>/`. `<도메인>`은 S 기준 submodule 경로(`knots-domain-app`) |
| 임시 worktree | `root/_agents/<이름>/`(Claude 하위 에이전트·이슈 키가 아닌 `claude -w` 이름) |
| 상태 기록 | `S/.agents/state/worktrees/<리포 id>/<폴더 이름>.json`. 리포 id는 단일 리포면 `.`, 도메인이면 submodule 경로 |

```text
~/dev/
├── knots-platform/                         S = M(상위)  .agents/docs/issues/KNOTS-17-desktop-parity/
└── knots-platform.worktrees/
    ├── KNOTS-21-board-cleanup/             상위 리포 --docs worktree(문서만, submodule 초기화 없음)
    ├── knots-domain-app/
    │   └── KNOTS-17-desktop-parity/        도메인 리포 worktree   feat/KNOTS-17-desktop-parity
    ├── _agents/bold-oak-a3f2/              Claude 하위 에이전트 임시 worktree   wt/bold-oak-a3f2
    └── .cargo-target/                      Rust 빌드 폴더 공유(3.6)
```

이슈 정보: `S/.agents/docs/issues/<키>-*/requirements.md`의 frontmatter(`type`·`key`)와 폴더 이름의 slug([01 §3.7.4](01-v1.1-verify-and-issues.md)). 작업 트리에 없으면 `git ls-tree origin/<base> .agents/docs/issues/`에서 찾는다. 둘 다 없으면 exit 3: `이슈 폴더가 없다: KNOTS-17 — scripts/new-feature.sh 로 먼저 만든다`.

### 3.2 명령과 종료 코드

```text
wt new  <이슈키> [--docs] [--only <폴더>]… [--domain <submodule 경로>] [--deps] [--open] [--skip-design-check] [--json]
wt list [--all] [--disk] [--refresh-size] [--json]
wt open <이슈키> [--ide code|idea]
wt done [<이슈키> | --path <경로>] [--keep-branch] [--json]
wt gc   [--apply] [--json]
(숨김) wt hook-create · wt hook-remove      Claude 훅 전용(3.13)
```

| 코드 | 뜻 |
|---|---|
| 0 | 성공 |
| 1 | 조건 미달로 거부(끝나지 않음, design 미승인) |
| 2 | 사용법 오류 |
| 3 | 상태 오류(상한 도달, 자리 이미 있음, 이슈 없음, git 리포 아님, 킷 worktree 아님) |
| 5 | 환경 오류(git 2.31 미만, IDE 실행 파일 없음) |

### 3.3 `wt new`

1. M·S·root를 정한다(3.1). S에 submodule이 있고(`.gitmodules`) 현재 리포가 S이며 `--docs`가 아니면: `--domain`이 있으면 그 submodule로 옮겨 계속하고, 없으면 exit 3 `이 리포는 submodule 을 가진 상위 리포다. 도메인 리포 안에서 실행하거나 --domain <경로> 를 준다`.
2. 이슈를 찾고 브랜치 이름 `<type>/<키>-<slug>`를 만든다.
3. `--docs`가 아니면 `design.md`의 `status`를 본다. `approved`가 아니면 exit 1 `design 이 approved 가 아니다(지금 in-review). 문서만 쓰려면 --docs`. `--skip-design-check`는 경고를 내고 상태 기록에 `designCheck: "skipped"`를 남긴다.
4. 상한: 이 리포의 킷 이슈 worktree 수(`kind: issue`, 3.14)가 `git.maxPerRepo` 이상이면 exit 3과 목록(키·마지막 사용·끝남 여부), `wt done <키>` 안내.
5. 자리 `P`가 이미 있으면 exit 3.
6. `git fetch origin <base> --quiet`(10초 상한, 실패하면 경고 후 캐시된 ref).
7. 브랜치:
   - 로컬에 있으면 `git worktree add P <branch>`
   - `origin/<branch>`만 있으면 `git worktree add --track -b <branch> P origin/<branch>`
   - 없으면 `git worktree add --no-track -b <branch> P origin/<base>` — `--no-track`이 없으면 upstream이 `origin/develop`이 되어 `git push`가 이름 불일치로 거부된다
   - `--docs`·`--only`면 `--no-checkout`을 붙이고 3.4를 거친다
8. `df -k root`로 여유 공간을 잰다(9번 뒤 다시 재서 `diskDeltaKB`).
9. `.worktreeinclude`(3.5) → 의존성(3.6) → `.env.worktree`(3.7).
10. 상태 기록을 쓴다(3.14). 세션 안에서 부르면 `createdBy`에 하네스·세션 id.
11. 출력:

```text
✔ worktree: ~/dev/knots-platform.worktrees/knots-domain-app/KNOTS-17-desktop-parity
  브랜치   feat/KNOTS-17-desktop-parity  (origin/develop 9c1e2a4 에서)
  복사     .env · local.properties (2개, .worktreeinclude)
  포트     +200  (.env.worktree: SERVER_PORT=8280)
  의존성   pnpm install --frozen-lockfile --prefer-offline   ← knots-app-web (pnpm 전역 저장소 공유)
  늘어난 용량 412MB
  다음     python3 scripts/harness/worktree.py open KNOTS-17   또는   cd <경로> && claude
```

### 3.4 `--docs` · `--only`

```text
git worktree add --no-checkout --no-track -b <branch> P origin/<base>
git -C P sparse-checkout set --cone .agents docs scripts [<--only 폴더>…]
git -C P checkout <branch>
```

- cone 모드는 루트의 파일(AGENTS.md·CLAUDE.md·빌드 파일)을 항상 포함한다. 결과는 루트 파일 + `.agents/` + `docs/` + `scripts/`다. `scripts/`를 넣는 이유: 문서 세션도 `scripts/new-feature.sh`·`board.sh`·`verify.sh`(changed·fast)를 쓴다.
- `--only <폴더>`는 구현 worktree에 쓴다. 큰 리포에서 고칠 모듈만 받는다. `.agents docs scripts`는 항상 포함한다.
- 상위 리포의 `--docs` worktree는 submodule을 초기화하지 않는다(`git worktree add`는 기본으로 하지 않는다). 도메인 폴더는 빈 폴더로 남는다.
- sparse 설정은 그 worktree에만 적용되어야 한다. git이 `extensions.worktreeConfig`를 켜고 worktree별 설정에 쓰는지 6장에서 확인한다.

### 3.5 `.worktreeinclude`

킷 템플릿(`common/root/.worktreeinclude`, gitignore 문법):

```text
# worktree 를 만들 때 메인 폴더에서 복사할 로컬 설정. gitignore 된 파일만 복사된다.
.env
.env.local
**/local.properties
**/.env.local
```

1. M의 `.worktreeinclude`를 읽는다(없으면 건너뛴다).
2. 패턴마다 M에서 일치하는 경로를 찾는다. `.git`·`node_modules`·`build`·`dist`·`.venv`·`target` 아래는 내려가지 않는다(지금 `IGNORED_DIRECTORIES`와 같다).
3. 찾은 경로 중 `git -C M check-ignore -q <경로>`가 참인 것만 남긴다. 추적 파일은 복사하지 않는다(Claude Code의 규칙과 같다).
4. sparse로 빠진 폴더의 파일은 복사하지 않는다.
5. 파일당 50MB, 합계 200개까지. 넘으면 그 파일을 건너뛰고 경고한다.
6. macOS면 `cp -c`(APFS 복제), 실패하거나 다른 OS면 `shutil.copy2`. worktree에 이미 있는 파일은 덮지 않는다.

Claude Code는 WorktreeCreate 훅이 있으면 `.worktreeinclude`를 처리하지 않는다. 킷 훅(3.13)이 같은 함수를 부른다.

### 3.6 의존성과 빌드 캐시

worktree 안의 단위(`.agents/harness.json` 표지, [01 §3.1](01-v1.1-verify-and-issues.md))마다 판정한다.

| 감지 파일 | 기본 동작 | `--deps` | 늘어나는 용량 |
|---|---|---|---|
| `pnpm-lock.yaml` | 안내 `pnpm install --frozen-lockfile --prefer-offline` | 실행 | 링크·메타데이터(전역 저장소 공유) |
| `uv.lock` | 안내 `uv sync --frozen` | 실행 | 거의 0(uv 캐시에서 복제·하드링크) |
| `package-lock.json`, macOS APFS | M에 `node_modules`가 있고 두 `package-lock.json`의 sha256이 같으면 `cp -c -R M/node_modules P/node_modules` | 같음 | 고치기 전까지 0에 가깝다 |
| `package-lock.json`, 그 밖 | 안내 `npm ci` | 실행 | `node_modules` 전체 |
| Gradle | 없음. `~/.gradle` 캐시·데몬을 같이 쓴다. `build/`는 worktree 안 | — | 빌드 결과물 |
| `go.mod` | 없음. `GOMODCACHE`·`GOCACHE` 공유 | — | 0 |
| `Cargo.toml` | `.env.worktree`에 `CARGO_TARGET_DIR=<root>/.cargo-target` | — | 공유(cargo 잠금으로 순서를 맞춘다) |

- `cp -c`가 실패하면(APFS 아님) 안내로 바꾼다. `du`는 복제 파일도 논리 크기로 세므로, 늘어난 용량은 `df` 차이(`diskDeltaKB`)로 보고한다.
- 킷은 기본으로 설치를 실행하지 않는다. 네트워크와 수 분이 드는 일을 세션 시작마다 하지 않기 위해서다.
- 빌드 폴더를 새로 만들지 않는다. Rust는 `.cargo-target` 하나, 다른 빌드가 잠금을 잡고 있으면 기다린다(knots 작업 공간 규칙 4와 같다).

### 3.7 포트 오프셋 `.env.worktree`

1. 번호 i = 1..`maxPerRepo` 중 이 리포의 다른 킷 worktree 기록이 쓰지 않는 가장 작은 값.
2. 오프셋 = i × 100.
3. P의 `.env`·`.env.local`(3.5에서 복사)과 `.env.example`에서 `^([A-Z0-9_]*_PORT)=([0-9]{2,5})$` 줄을 모은다. 같은 이름은 `.env.local` > `.env` > `.env.example` 순.
4. P에 쓴다(`.gitignore` 템플릿에 `.env.worktree` 추가):

```text
# knots-sync 생성 — worktree 2번, 포트 +200. 앱이 .env 다음에 이 파일을 읽어야 한다.
HARNESS_WT_INDEX=2
HARNESS_WT_KEY=KNOTS-17
HARNESS_PORT_OFFSET=200
SERVER_PORT=8280
DB_PORT=5632
COMPOSE_PROJECT_NAME=knots-platform-knots-17
CARGO_TARGET_DIR=/Users/me/dev/knots-platform.worktrees/.cargo-target
```

- 결과 포트가 65535를 넘으면 그 변수를 쓰지 않고 경고한다.
- 여러 worktree가 같은 값을 써야 하는 포트(공용 원격 DB 등)는 `_PORT`로 끝나지 않는 이름으로 둔다. 킷은 이름 규칙만 본다.
- `.env.worktree`를 읽는 것은 앱·compose 설정의 몫이다. `git-workflow.md`에 읽는 순서를 적는다.

### 3.8 `wt list`와 용량

```text
리포 knots-domain-app  (상한 3)
키          브랜치                              변경  안올림  용량    마지막 사용        세션  상태
KNOTS-17    feat/KNOTS-17-desktop-parity        3     2       0.9GB   2026-11-23 10:14   1     진행
KNOTS-12    fix/KNOTS-12-tray-icon              0     0       1.2GB   2026-11-20 18:02   0     끝남 → wt done KNOTS-12
임시(_agents)
bold-oak-a3f2  wt/bold-oak-a3f2                 0     0       0.4GB   2026-11-23 09:40   0     끝남
합계 2.5GB · 디스크 여유 182GB
```

| 열 | 값 |
|---|---|
| 변경 | `git -C P status --porcelain` 줄 수 |
| 안올림 | `git -C P rev-list --count HEAD --not --remotes`(네트워크를 쓰지 않는다. 다른 장비에서 push했으면 `git fetch` 뒤 정확하다) |
| 용량 | `du -sk P`(20초 상한), 상태 기록에 10분 캐시. `--refresh-size`로 다시 잰다 |
| 마지막 사용 | 상태 기록 `lastUsedAt`, `<git-dir>/index` 수정 시각, 세션 `lastSeenAt` 중 가장 늦은 값 |
| 세션 | `lastSeenAt`이 30분 이내인 세션 기록(3.10) 수 |
| 상태 | 3.11의 끝 조건 |

- `--disk`: worktree마다 소스(추적 파일) · 의존성(`node_modules`·`.venv`) · 빌드(`build`·`dist`·`.next`·`target`) · 그 밖으로 나눠 출력한다. 복제 파일은 논리 크기로 센다는 주의를 한 줄 붙인다.
- 경고: 합계 > 20GB 또는 여유 < 10GB(`HARNESS_WT_WARN_GB`·`HARNESS_WT_MIN_FREE_GB`로 바꾼다).
- `--all`: S와 모든 submodule의 기록을 모아 리포별로 출력한다. 대시보드 작업 공간 탭은 `--all --json`을 읽는다.

### 3.9 IDE

`wt open <키> [--ide code|idea]`. IDE는 플래그 > 개인 `git.ide` > 프로젝트 `git.ide` > `code`.

| IDE | 명령 | 없을 때 |
|---|---|---|
| VS Code | `code -n <P>` | exit 5, 경로 출력 |
| IntelliJ | PATH의 `idea <P>`, 없으면 macOS `open -na "IntelliJ IDEA.app" --args <P>` | exit 5, 경로 출력 |

- VS Code: CLI `add`·`update`가 `.vscode/settings.json`에 `"git.detectWorktrees": true`를 병합한다(lock 키 `jsonc:git.detectWorktrees`, [03 §3.5](03-projection-and-hooks.md#35-병합-규칙)). 조건: `.vscode/`가 있거나 `git.ide`가 `code`. 1.103 이상에서 Source Control → Repositories → Worktrees에 보인다.
- IntelliJ 2026.1+: 파일을 쓰지 않는다. Git 창의 Worktrees 탭에서 보인다. submodule을 가진 프로젝트에서는 탭이 숨겨지므로 도메인 리포 worktree를 `wt open`으로 단독 프로젝트로 연다.
- `wt open`은 상태 기록의 `lastUsedAt`을 갱신한다.

### 3.10 세션 등록

세션 시작 훅(디스패처를 거쳐 worktree를 안다, [03 §3.10](03-projection-and-hooks.md))이 S의 `.agents/state/sessions/<세션 id>.json`을 쓴다. Stop 훅이 `lastSeenAt`을 갱신한다.

```jsonc
{
  "schema": "knots-sync.session/v1",
  "sessionId": "c0ffee…",
  "harness": "claude",
  "role": "implement",                       // roles 배정에서(P21). 모르면 null
  "cwd": "/Users/me/dev/knots-platform.worktrees/knots-domain-app/KNOTS-17-desktop-parity",
  "harnessRoot": "/Users/me/dev/knots-platform.worktrees/knots-domain-app/KNOTS-17-desktop-parity",
  "worktree": { "repo": "knots-domain-app", "key": "KNOTS-17", "folder": "KNOTS-17-desktop-parity",
                "branch": "feat/KNOTS-17-desktop-parity" },          // 메인 폴더 세션이면 null
  "startedAt": "2026-11-23T10:02:11Z",
  "lastSeenAt": "2026-11-23T10:14:40Z"
}
```

- worktree 판정: 하네스 루트의 `git rev-parse --git-dir` ≠ `--git-common-dir`이고 경로가 root 아래면 그 폴더 이름으로 상태 기록을 찾는다.
- `wt list`·`wt done`·대시보드가 이 기록으로 worktree의 살아 있는 세션을 본다.
- 정리: `wt gc --apply`가 `lastSeenAt`이 7일 지난 세션 기록을 지운다. 지금의 점유 저장소(`.agents/coordination/state.json`)는 `scripts/session-coordination.py prune --sessions-days 7 --notices-days 30`을 같이 부른다(P19에 더하는 하위 명령).

### 3.11 `wt done`

대상 P: 인자 키, `--path`, 없으면 현재 폴더가 속한 킷 worktree.

1. P가 메인 폴더거나 root 밖이면 exit 3.
2. 끝 조건(하나라도 어기면 지우지 않는다):
   - a. `git -C P status --porcelain`이 비어 있다(추적 파일 변경과 추적 안 된 파일. ignore된 파일은 세지 않는다).
   - b. `git -C P rev-list --count HEAD --not --remotes`가 0.
   - c. 다른 세션 기록이 P에 있고 `lastSeenAt`이 10분 이내가 아니다.
   - d. 부른 프로세스의 작업 폴더가 P 안이 아니다(에이전트가 자기 worktree를 지우면 세션이 깨진다).
3. 통과: `git worktree remove P`. 남은 ignore 파일(`build/`·`node_modules`·`.env.worktree`) 때문에 거부되면, 2번을 통과했으므로 `--force`로 다시 부른다.
4. 로컬 브랜치: `git rev-list --count <branch> --not --remotes`가 0이면 `git branch -D <branch>`. `--keep-branch`면 남긴다.
5. 상태 기록을 지운다(포트 번호가 풀린다).
6. 도메인 리포 worktree였으면 한 줄 안내: `병합 뒤 메인 폴더에서 상위 포인터를 올린다: git -C <S> add knots-domain-app && git -C <S> commit`.

```text
남김: KNOTS-17-desktop-parity
- 커밋 안 된 변경 3개 (git status --porcelain)
- push 안 된 커밋 2개 (git rev-list --count HEAD --not --remotes)
→ 커밋하고 push 한 뒤 다시 wt done KNOTS-17
```

출력 뒤 exit 1. 세션을 마칠 때 끝내지 못한 worktree는 이 이유를 사람에게 알린다(`git-workflow.md`에 적는다).

### 3.12 `wt gc`

| 항목 | 기본(목록) | `--apply` |
|---|---|---|
| 끝난 이슈·임시 worktree | 목록 | 3.11과 같은 순서로 지운다 |
| 끝나지 않은 worktree | 목록과 이유 | 건드리지 않는다 |
| git이 아는데 폴더가 없는 항목(`git worktree prune --dry-run --verbose`) | 목록 | `git worktree prune` |
| root 아래 git이 모르는 폴더 | 목록 | 빈 폴더만 지운다. 파일이 있으면 남긴다 |
| worktree 없는 상태 기록 | 목록 | 지운다 |
| 7일 지난 세션 기록, 보존 기한 밖 점유 기록 | 개수 | 지운다(3.10) |

에이전트는 사람이 요청할 때만 `--apply`를 쓴다. 이 규칙은 `session-collaboration.md`와 `git-workflow.md`에 적는다.

### 3.13 Claude Code WorktreeCreate · WorktreeRemove

설정은 `.agents/hooks.json`의 `harness-worktree-create`·`harness-worktree-remove`([03 §3.4](03-projection-and-hooks.md#34-hooksjson))에서 `.claude/settings.json`으로 만든다. 플러그인이 아니라 프로젝트 설정에 둔다. `--worktree --tmux`로 시작하면 플러그인 훅이 돌지 않기 때문이다.

문서가 정한 계약(2026-11-23):

| 항목 | WorktreeCreate | WorktreeRemove |
|---|---|---|
| 입력(stdin JSON) | 공통 필드(`session_id` · `cwd` · `hook_event_name` …) + `name`(사용자 지정 또는 `bold-oak-a3f2` 같은 자동 이름) | 공통 필드 + `worktree_path`(Create가 돌려준 절대경로) |
| 출력 | stdout 마지막 비어 있지 않은 줄 = worktree 절대경로. 다른 출력은 stderr | 읽지 않는다 |
| 실패 | exit ≠ 0 또는 경로 없음 → 만들기 실패 | exit ≠ 0이고 폴더가 남아 있으면 지우기 실패(폴더 유지) |
| 주의 | 훅이 있으면 Claude는 `.worktreeinclude`를 처리하지 않는다. `.`·`..`가 든 절대경로와 리포 안 심볼릭 링크를 지나는 경로를 거부한다 | Claude는 훅이 만든 worktree의 브랜치를 지우지 않는다. 하위 에이전트·워크플로 에이전트가 끝나도 이 훅을 부르지 않는다 |

`wt hook-create`:

1. stdin JSON을 읽는다. `cwd`의 리포에서 3.1을 푼다.
2. `name`이 `^[A-Z][A-Z0-9]{1,9}-[0-9]+(-[a-z0-9-]+)?$`이면 이슈 worktree다. 그 키의 킷 worktree가 이미 있으면 그 경로를 출력한다(Claude의 같은 이름 다시 열기와 같다). 없으면 3.3의 2~10번(design 확인·상한 포함)을 돈다. 상위 리포에서 부르면 R1.4대로 실패한다.
3. 그 밖의 이름은 임시 worktree다: 자리 `root/_agents/<name>`, 브랜치 `wt/<name>`, 시작점은 `cwd` 리포의 `HEAD`(하위 에이전트가 진행 중인 작업을 이어받는다). 이슈 상한에 세지 않고, 임시 상한 `2 × maxPerRepo`개를 넘으면 실패한다. 포트는 쓰지 않는다.
4. 경로는 `os.path.realpath(부모) + "/" + 이름`으로 정규화해 출력한다. 모든 진행 메시지는 stderr.
5. 실패하면 stderr에 이유, exit 1.

`wt hook-remove`:

1. `worktree_path`가 root 아래가 아니면 exit 1 `킷이 만든 worktree 가 아니다`(폴더는 남는다).
2. 이슈 worktree는 3.11의 2·3·4번을 돈다. 통과하면 지우고 exit 0, 아니면 이유를 stderr에 내고 exit 1. 사람이 종료 화면에서 "지운다"를 골라도 커밋 안 된 변경이 있으면 남는다.
3. 임시 worktree의 끝 조건 b는 "HEAD의 커밋이 다른 로컬 브랜치나 원격에 있다"로 바꾼다: `git rev-list --count HEAD --not --remotes --exclude=wt/<name> --branches`가 0. 임시 브랜치는 push하지 않기 때문이다.
4. Claude가 하위 에이전트 worktree에는 이 훅을 부르지 않으므로 `wt gc`가 `_agents/`를 정리한다.

Claude 기본값과 다른 점: Claude는 `.claude/worktrees/<name>`에 `worktree-<name>` 브랜치로 만들고 시작점을 `worktree.baseRef`(`fresh` = 원격 기본 브랜치, `head`)로만 고를 수 있다. 킷 훅은 `git.base`(기본 `develop`)를 시작점으로 쓴다. Claude의 주기 정리는 Claude 표지가 없는 worktree(훅이 만든 것)를 지우지 않는다.

### 3.14 상태 기록 형식

`S/.agents/state/worktrees/<리포 id>/<폴더 이름>.json`:

```jsonc
{
  "schema": "knots-sync.worktree/v1",
  "kind": "issue",                       // issue | agent
  "key": "KNOTS-17", "slug": "desktop-parity",
  "repo": "knots-domain-app",            // 단일 리포면 "."
  "path": "/Users/me/dev/knots-platform.worktrees/knots-domain-app/KNOTS-17-desktop-parity",
  "branch": "feat/KNOTS-17-desktop-parity",
  "base": "origin/develop", "baseSha": "9c1e2a4…",
  "docsOnly": false, "only": [],
  "designCheck": "approved",             // approved | skipped | n/a(--docs, agent)
  "portIndex": 2,
  "createdAt": "2026-11-23T10:01:58Z",
  "createdBy": { "harness": "claude", "sessionId": "c0ffee…" },   // 사람이면 { "harness": "human" }
  "diskDeltaKB": 421888,
  "sizeKB": 943104, "sizedAt": "2026-11-23T10:14:40Z",
  "lastUsedAt": "2026-11-23T10:14:40Z"
}
```

worktree가 있는지는 `git worktree list`가 원본이다. 기록은 그 위에 붙는 정보이고, 둘이 다르면 `wt gc`가 보고한다.

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| Claude 기본 자리 `.claude/worktrees/` | 리포 안이라 IDE·검색·`git status`(ignore 필요)에 섞이고, Claude만 쓰는 자리다. JetBrains는 프로젝트 안 worktree를 지원하지 않는다고 적는다 |
| 상위 리포 전체를 worktree로 | git 문서가 submodule이 있는 상위 리포의 여러 checkout을 권하지 않는다. 도메인 리포 단위로 만든다 |
| `git clone`·폴더 복사로 작업 공간 | 원본과 연결이 없어 끝났는지 확인할 수 없고, 지우면 push 안 된 커밋이 같이 사라진다(knots 작업 공간 규칙 1) |
| 모든 세션을 worktree로 | 리뷰·스캔은 읽기만 한다. 원격 브랜치 diff로 충분하다(D5) |
| `wt new`가 의존성을 항상 설치 | 수 분과 네트워크가 든다. pnpm·uv는 전역 저장소라 명령 한 줄로 끝난다 |
| 포트를 무작위로 | 다시 만들 때마다 바뀌어 북마크·설정이 깨진다. 번호 × 100으로 정한다 |
| `wt done`이 `--force`로 바로 지운다 | 커밋 안 된 작업이 사라진다. 끝 조건을 통과한 뒤에만 `--force`를 쓴다 |
| 하위 에이전트 임시 worktree도 이슈 상한에 센다 | 하위 에이전트 몇 개로 상한에 닿아 사람의 `wt new`가 막힌다. 따로 센다 |

## 5. 완료 기준

[03장 P19 완료 기준](../harness-next/03-plan.html#p19)에 측정 방법을 붙인다.

1. 임시 리포에서 구현 세션 둘이 각자 `wt new` → 커밋 → `git diff develop...<상대 브랜치>`에 자기 변경이 0줄.
2. `wt done`은 push 안 된 커밋이 1개 있으면 exit 1과 이유를, push 뒤에는 exit 0과 삭제를 낸다. 리포당 4번째 `wt new`는 exit 3.
3. `wt new --docs`로 만든 worktree의 파일이 루트 파일 + `.agents/`·`docs/`·`scripts/` 아래뿐이고, `diskDeltaKB` ≤ 그 네 묶음의 `du -sk` 합.
4. `claude -w KNOTS-17`이 `../<리포>.worktrees/KNOTS-17-<slug>/`에, `claude -w x`가 `../<리포>.worktrees/_agents/x/`에 만들어진다(수동 점검, Claude Code 버전을 적는다).
5. macOS npm 프로젝트에서 `wt new` 직후 `diskDeltaKB` ≤ 소스 파일 크기 + 50MB.
6. knots 점유 상태 사본(25MB)에 `wt gc --apply` 뒤 보존 기한(세션 7일·공지 30일) 밖 기록이 0건.
7. 상위 리포(submodule 있음)에서 `--docs` 없는 `wt new`는 exit 3, `--domain knots-domain-app`이면 `root/knots-domain-app/<키>-<slug>/`에 만들어진다.
8. `.env`에 `SERVER_PORT=8080`이 있는 리포에서 두 번째 worktree의 `.env.worktree`가 `SERVER_PORT=8280`.
9. `.vscode/`가 있는 리포에서 `update` 뒤 `.vscode/settings.json`의 다른 키·주석이 그대로이고 `git.detectWorktrees: true`가 있다.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| submodule(도메인 리포) 안에서 `git worktree add`·`remove`가 문제없이 도는지(P19 착수 전 확인) | knots 사본의 `knots-domain-app`에서 만들고 지운 뒤 상위 리포 `git status`와 `.git/modules/<도메인>/worktrees/`를 본다 |
| IntelliJ에서 도메인 리포를 단독 프로젝트로 열 때 Worktrees 탭이 보이는지(P19 착수 전 확인) | IntelliJ 2026.1에서 `wt open --ide idea`로 연다 |
| worktree 안 `sparse-checkout set`이 메인 폴더 설정을 바꾸지 않는지 | 실행 뒤 메인 폴더 `git sparse-checkout list`와 `git config --list --show-origin`을 본다 |
| WorktreeCreate 입력에 하위 에이전트 표지(`agent_id`·`agent_type`)가 오는지, `claude -w "#1234"`(PR)일 때 `name` 값 | 입력을 덤프하는 훅으로 세 경우(`-w 이름`, 하위 에이전트 `isolation: worktree`, PR 번호)를 본다 |
| VS Code `git.worktreeIncludeFiles` 설정이 있는지와 형식 | VS Code 설정 문서와 1.103+ 설정 화면. 있으면 `.worktreeinclude`와 같은 목록을 병합한다 |
| `git worktree remove`가 ignore된 파일만 남은 worktree를 거부하는지 | `build/`만 있는 worktree에서 `--force` 없이 실행한다. 거부하지 않으면 3.11의 3번 재시도를 뺀다 |
| knots가 `git.worktreeRoot`를 `~/knots-work`로 둘지, 자리 규칙(`<영역>-<이슈>`)을 이 문서 규칙(`<도메인>/<키>-<이름>`)으로 바꿀지 | 사람 결정. 바꾸면 `knots-work-gc`와 `~/.claude/rules/knots-worktrees.md`를 같이 고친다 |
| `session-coordination.py`에 `prune` 하위 명령을 더할 때 knots 점유 기록 형식(state.json) | knots 사본의 state.json 구조를 읽고 세션·공지 시각 필드를 확인한다 |
