# v1 → v2 이전 안내서

이미 v1(킷 1.0.x)이 깔린 리포를 v2로 옮기는 사람이 따라 하는 문서다. 설계는 [docs/design/11-migration-and-release.md](design/11-migration-and-release.md), 복사본으로 미리 해 본 결과는 `.agents/docs/issues/HK-22-migration-release-e2e/tasks.md`에 있다.

한 줄 요약: **읽기만 하는 점검 → 바뀔 목록 보기 → 사람 승인 → 적용 → `.new` 병합 → 검증 → 커밋 하나.** 문제가 있으면 그 커밋 하나를 `git revert` 한다.

## 1. 시작하기 전에

| 확인 | 방법 |
|---|---|
| 작업 공간 | 원래 리포 폴더에서 바로 하지 않는다. 아래 2절의 작업 공간을 새로 만든다 |
| Node 18.3 이상 | `node -v`. 없으면 `setup.sh` 로 내려가는 경로가 v2.0.x 동안만 남아 있다(2.1.0 에서 빠진다) |
| 킷 판 | 이전할 리포의 `.agents/harness-kit.json`(v1 · 옛 이름) 의 `kitVersion`. 이미 옮긴 리포는 `.agents/knots-sync.json` 의 `kit.version` |
| 사람이 고친 파일이 많은가 | 점검(3절) 결과의 `drifted` 수. 많을수록 `.new` 병합이 길어진다 |
| 외부 도구(AI-DLC · Entire) | 이미 깔려 있으면 킷은 그 파일을 지우거나 덮지 않는다. 지우는 결정은 사람이 한다 |

원본 리포 폴더는 그대로 두고, 작업 공간에서만 바꾼다. 작업 공간은 끝나면 같은 세션 안에서 지운다.

### 1.1 이름이 바뀌었다(harness-kit → knots-sync)

2026-11-24 제품 이름이 **knots-sync**(약어 `kns`)로 바뀌었다. v1 리포는 옛 이름으로 깔려 있으므로 아래가 함께 바뀐다. 사람이 손으로 옮길 것은 없다 — `update` 가 옮긴다.

| 옛 이름 | 새 이름 | 누가 옮기나 |
|---|---|---|
| CLI `harness-kit` | `knots-sync`(별칭 `kns`, 옛 `harness-kit` 도 한동안 같은 CLI) | — |
| 플러그인 `harness-kit`, 스킬 `/harness-kit:hx-bootstrap` | 플러그인 `kns`, 스킬 `/kns:bootstrap` · `/kns:update` … | 사람이 플러그인을 다시 설치한다(`/plugin install kns@knots-sync`) |
| Kiro 전역 스킬 `~/.kiro/skills/hx-*` | `~/.kiro/skills/kns-*` | `bash install-kiro.sh --force` 가 옛 설치 기록의 `hx-*` 폴더를 치우고 새로 깐다 |
| 상태 파일 `.agents/harness-kit.json` · `.agents/harness-kit.lock` | `.agents/knots-sync.json` · `.agents/knots-sync.lock` | `update`(Node 없으면 `update.sh`)가 쓰기 처음에 옮긴다. `doctor` · `update --dry-run` 은 옛 파일을 읽기만 한다(`legacy-names` 로 알린다) |
| 프로젝트 스킬 `hx-<명령>`(`/hx-specify` …) | `kns-<명령>`(`/kns-specify` …) | `update` 가 새 스킬을 깔고, 고치지 않은 옛 `hx-*` 킷 스킬은 지운다. 고친 것은 남기고 `orphan` 으로 알린다 — 사람이 옮긴 뒤 지운다 |
| 환경 변수 `HX_*` · `HARNESS_KIT_*` | `KNS_*` · `KNOTS_SYNC_*` | CI 변수(예: `HX_DEPLOY_RESUME`)는 사람이 이름을 바꾼다 |

그대로인 것: GitHub 저장소 이름(`harness-starter-kit`), 파일 머리 표지 `HARNESS STARTER KIT`, `scripts/harness/` 폴더, 훅 id `harness-*`. 이것들은 "하네스 엔지니어링"이라는 개념 이름이거나 v1 파일을 알아보는 열쇠다.

가장 쉬운 길은 Claude Code 플러그인이다: 리포 폴더에서 연 Claude Code 에 `/kns:update` 를 입력하면 미리보기 → 요약 → 승인 → 반영을 진행한다. 터미널에서는 CLI 를 GitHub 묶음 주소로 전역 설치해 `knots-sync <명령>` 으로 부른다(결정 D3, npm 에는 v2.2 에 올린다): `npm i -g https://codeload.github.com/pscheol/harness-starter-kit/tar.gz/refs/tags/v2.0.0-alpha.3`. 한 번만 쓸 때는 `npx -y github:pscheol/harness-starter-kit#v2.0.0-alpha.3 <명령>`. `npm i -g github:…` 는 npm 11 에서 명령 링크가 깨지고, `npx knots-sync`(npm 에 없는 이름) · `npx kns`(npm 의 다른 사람 패키지)는 쓰지 않는다. Node 가 없으면 플러그인 안의 `bash <플러그인>/skills/bootstrap/kit.sh <명령>` 이 v1 스크립트로 내려간다.

### 1.2 CI 진입 파일은 선택 모듈 `ci` 다

v2 는 CI 진입 파일(`.gitlab-ci.yml` · `.github/workflows/harness-verify.yml` · `.github/actions/harness-setup/action.yml`)을 `ci` 모듈을 켤 때만 깐다. 진입 파일이 생기면 다음 push 부터 원격 파이프라인이 돌기 때문이다(회사 GitLab 리포가 킷 갱신만으로 파이프라인을 돌리면 안 된다). 진입 파일이 include 하는 단계 템플릿(`ci/knots-sync.gitlab-ci.yml` · `ci/harness.gocd.yaml`)은 늘 깔리지만 진입 파일 없이는 돌지 않는다.

| 지금 리포 | `update` 뒤 | 사람이 할 일 |
|---|---|---|
| v1 의 `.github/workflows/verify.yml` 이 있다 | '킷에서 빠짐'(orphan)으로 남는다. 새 진입 파일은 깔리지 않는다 | 원격 CI 를 계속 쓰면 `knots-sync add ci` 로 새 진입 파일을 받고 옛 `verify.yml` 을 지운다 |
| 2.0.0-alpha.0 · alpha.1 로 진입 파일을 받았다 | 세 파일을 orphan 으로 알리고 "이제 ci 모듈이 깐다"를 붙인다. 지우지 않는다 | 쓰면 `knots-sync add ci`(파일은 그대로, lock 만 모듈로), 안 쓰면 `knots-sync update --prune`(고치지 않은 것만 지운다) |
| 팀이 만든 `.gitlab-ci.yml` 이 있다 | 건드리지 않는다 | 킷 단계가 필요하면 그 파일에 `include: - local: ci/knots-sync.gitlab-ci.yml` 을 더한다(`add ci` 는 있는 파일을 사람 파일로 두고 덮지 않는다) |

## 2. 작업 공간 만들기

knots 계열 리포는 `~/knots-work` 아래에 `git worktree` 로 만든다. `git clone` · 폴더 복사로 만들지 않는다(clone 은 원본과 연결이 없어 끝났는지 확인하기 어렵고, 지우면 push 안 된 커밋이 같이 사라진다).

```bash
git worktree add ~/knots-work/harness-v2-<단계> -b chore/harness-v2-<단계> origin/develop
export CARGO_TARGET_DIR=~/knots-work/.cargo-target   # Rust · Tauri 빌드 폴더는 하나만 같이 쓴다
```

끝의 정의: 변경이 모두 커밋되고 push 됐다 — `git status --porcelain` 이 비고 `git rev-list --count HEAD --not --remotes` 가 0 이다. 끝나면 `git worktree remove <경로>`(서브모듈이 있으면 `rm -rf <경로>` 다음 `git worktree prune`). `knots-work-gc` 로 남은 작업 공간이 없는지 본다.

## 3. 공통 절차(7단계)

```text
1 점검   knots-sync doctor                  읽기만. 결과를 이전 이슈의 handoff 문서에 붙인다
2 계획   knots-sync update --dry-run         바뀔 파일 · .new 가 생길 파일 · 외부 소유로 잡힐 파일 목록
3 승인   사람이 목록을 보고 이전 이슈의 tasks 계획을 승인한다(관리 페이지 또는 knots-sync approve)
4 적용   knots-sync update                  .new 생성, lock v2 쓰기
5 병합   .new 파일을 하나씩 병합 → 원본 자리로   남은 .new 0개
6 검증   bash scripts/verify.sh --full(사람 터미널 또는 CI) · knots-sync doctor --check(exit 0)
7 커밋   이전 커밋 하나. 메시지: "chore: 하네스 v<버전> 이전 — <단계>"   사람 승인 뒤
```

- 대화에서 한 말은 승인이 아니다. 3단계 승인은 관리 페이지(PIN)나 사람 터미널의 `knots-sync approve` 로만 남는다.
- 에이전트 세션은 6단계 `--full` 을 돌리지 않는다. 이전 브랜치를 push 하면 CI 가 `full` 을 돈다.
- v1 설치본의 첫 `update` 는 lock 에 "설치 전부터 있던 파일"과 "킷이 깐 파일"이 구별되어 있지 않아, 사람이 고쳤는지 알 수 없는 문서는 줄 병합 · 키 병합을 하고 원본을 `.agents/state/merge-backup/<시각>/` 에 둔다. 코드 · 그 밖의 파일은 `.new` 로 받는다.

### 3.1 점검 결과를 읽는 법

`doctor` 는 아무것도 쓰지 않는다. 다음을 본다.

| 항목 | 뜻 | 할 일 |
|---|---|---|
| `lock-v1` | v1(TSV) lock 이다. `update` 가 v2 로 바꾼다 | 없음 |
| `drifted` N | 사람이 고친 킷 파일 N개. `update` 때 `.new` 로 받는다 | N 이 많으면 병합 시간을 잡는다 |
| `missing` N | 킷 파일이 지워져 있다 | `knots-sync repair` 로 되살릴지 정한다 |
| `external-hooks-left` | 외부 도구(예: AI-DLC)의 훅이 하네스 설정에 있는데 킷 모듈은 꺼져 있다 | 4절 외부 도구 결정 |
| `세션마다 실리는 양` | 하네스별 진입 파일 · 규칙 · 스킬 설명 바이트와 훅 수(owner 별) | 이전 전후 값을 이전 MR 설명에 나란히 적는다 |

### 3.2 계획에서 확인할 것

`update --dry-run` 의 합계 줄(`new` · `update` · `conflict` · `skip-user` · `orphan`)과 `conflict` 목록을 본다. `--json` 이면 같은 값이 `counts` 에 있다. 승인 대상은 이 목록이다.

### 3.3 병합

```bash
find . -name '*.new' -not -path './.git/*'     # 남은 .new 목록
diff -u <파일> <파일>.new                        # 하나씩 보고 필요한 줄만 원본에 옮긴다
rm <파일>.new                                    # 병합했으면 지운다
```

주의: 리포 `.gitignore` 가 `*.new` 를 무시하면 `git ls-files --others --exclude-standard '*.new'`(설계 11 §3.9 의 점검 명령)가 항상 0줄을 낸다. 위처럼 `find` 로 센다. `verify.sh --fast` 가 남은 `.new` 를 경고한다.

### 3.4 검증

```bash
knots-sync doctor --check --json     # exit 0, drifted · missing · stale · symlink-found 0
bash scripts/board.sh > /tmp/board.after  # 이전 전의 보드 출력과 같은지(차이 0)
git ls-files --others --exclude-standard '*.new'   # 위 주의 때문에 find 결과와 함께 본다
wc -c AGENTS.md CLAUDE.md                 # 진입 파일 합계(24,576바이트 이하가 목표)
```

외부 도구 파일이 안 바뀌었는지는 이전 전후로 비교한다(설계 11 §3.9). `update` 앞에 `python3 scripts/harness/check_external.py --save .agents/state/external-before.json`, 뒤에 `python3 scripts/harness/check_external.py --snapshot .agents/state/external-before.json`(exit 0 = 바뀐 것 없음). lock 의 `owner: external:*` 항목을 보고, 도구가 계속 덧붙이는 기록 파일(`*.log`, `logs/` 아래)은 뺀다. v1 lock 에는 외부 항목이 없으므로 첫 `update` 뒤부터 쓴다.

## 4. 리포별 순서

### 4.1 knots-platform

| 단계 | 킷 판 | 할 일 | 끝의 확인 |
|---|---|---|---|
| K0 | 1.1 | 이슈 단위 SDD: `sdd-layout.py migrate --dry-run` 목록 → 승인 → 적용. tasks 템플릿의 `--full` 지시를 "affected 결과 · CI full 링크"로 | `board.sh` 결과가 이전과 같다 |
| K1 | 2.0 | `knots-sync doctor` 만. 쓰지 않는다 | 보고서에 lock v1 변환 가능, drifted 수, 외부 훅 17개 |
| K2 | 2.4 | 루트 `update`: lock v1 → v2, 포인터 → 복사본, `.claude/settings.json` 은 킷 키만 병합. AI-DLC 결정(아래) | `doctor --check` exit 0, CI `full` 통과, AI-DLC 파일 sha256 불변 |
| K3 | 2.6 | `knots-sync sync units --check` 를 `sync.py --check` 와 나란히 돌려 같아지면 호출을 바꾼다 | 두 출력 일치 |
| K4 | 2.6 | 점유 상태 prune, 진입 파일 61KB → 24KB 이하로 나눔 | `doctor` 의 진입 파일 경고 0 |

K2 의 AI-DLC 결정(사람이 고르고 ADR 로 남긴다):

| 선택 | 할 일 | 결과 |
|---|---|---|
| A. 쓴다 | `knots-sync add aidlc` — 파일을 `external:aidlc` 로 등록, `flow.design = "aidlc"` | AI-DLC 훅 17개는 계속 돈다. 세션마다 약 73KB 가 실린다 |
| B. 쓰지 않는다(Intent 가 0건이면 추천) | `flow.design = "kit"`. AI-DLC 훅은 `aidlc uninstall`(도구 명령) 또는 사람이 설정에서 뺀다. 파일은 남기거나 사람이 지운다 | 훅 17개가 빠진다. 킷은 파일을 지우지 않는다 |

### 4.2 hr-vision-3d(hdr)

| 단계 | 킷 판 | 할 일 | 끝의 확인 |
|---|---|---|---|
| H1 | 2.0 | `knots-sync init --adopt --dry-run` → 목록 검토 → 승인 → `init --adopt` | 기존 파일이 `owner: user` 로 남았는가, `doctor --check` exit 0 |
| H2 | 2.1 | worktree 는 도메인 리포 단위로만. 기존 `.gitlab-ci.yml` 에 킷 CI include 를 더한다(1.2 절 — `ci` 모듈은 켜지 않는다) | MR 파이프라인에 `harness:fast` · `harness:affected` |
| H3 | 2.5 | 승인 강제 켬. 각자 `.claude/settings.local.json` 의 `Bash(git push*)` · `Bash(git commit*)` 무조건 허용을 지운다(개인 파일) | 승인 기록 없는 completed 이동이 막힌다 |
| H4 | 2.6 | multi-harness 모듈: submodule 규칙 사본을 `sync units` 로 합친다 | `sync units --check` exit 0 |

`--adopt` 로 `owner: user` 가 된 파일은 킷 `update` 가 건드리지 않는다. 킷 기본 파일로 바꾸려면 사람이 지운 뒤 `knots-sync repair`.

`init --adopt` 도 기존 파일을 한 번은 바꾼다 — `CLAUDE.md` 에는 킷 블록(`knots-sync:begin claude … end`)이 병합되고, 보드 블록(`BOARD:BEGIN`)이 있는 문서(`.agents/docs/product-specs/index.md` 같은)는 보드를 다시 만들 때 블록이 덧붙는다. 적용 뒤 `git diff --stat` 의 변경(`M`) 파일이 이 둘뿐인지 눈으로 본다.

## 5. 되돌리기(롤백)

| 상황 | 방법 |
|---|---|
| 적용 뒤 · 커밋 전 | 계획 목록(`update --dry-run --json`)의 경로를 `git restore --staged --worktree -- <경로들>` 로 되돌리고, 새로 생긴 파일(`git status --porcelain` 의 `??`)을 지운다. 되돌리기 전 파일 · lock 은 `.agents/state/backup/<시각>/` 에도 있다(커밋 안 함, 최근 5개) |
| 커밋 뒤 | 그 단계의 이전 커밋 하나를 `git revert <커밋>`. lock 은 v1 TSV 로 돌아온다 |
| 외부 도구를 `add` 한 단계 | revert 만으로는 외부 도구가 하네스 설정에 넣은 자기 훅이 돌아오거나 빠지지 않을 수 있다. 그 도구의 명령으로 되돌린다(`aidlc uninstall` · `entire disable`). 이전 MR 설명에 "외부 도구 되돌리기" 줄을 적는다 |
| 릴리스 | 태그를 지우거나 다시 쓰지 않는다. 문제가 있는 버전은 patch 로 고쳐 낸다. `npx github:<owner>/harness-starter-kit#v2.2.1` 처럼 태그를 고정해 쓴다 |

외부 도구 쪽 주의: 이 안내서의 어떤 단계도 외부 도구(AI-DLC · Entire) 명령을 실제 홈에서 처음 돌리지 않는다. 시험은 일회용 HOME 에서 한다 — `entire enable` 이 전역 git 설정에 손댄 일이 있었다.

## 6. 이전 MR 설명에 붙일 숫자

| 점검 | 명령 | 통과 |
|---|---|---|
| 배치 | `knots-sync doctor --check --json` | exit 0 |
| 남은 `.new` | `find . -name '*.new' -not -path './.git/*'` | 0줄 |
| 보드 | 이전 전후 `bash scripts/board.sh` 출력 비교 | 차이 0 |
| 진입 파일 | `wc -c AGENTS.md CLAUDE.md` | 이전 → 이후 |
| 세션마다 실리는 양 | `knots-sync doctor` 의 "세션마다 실리는 양" 줄 | 이전 → 이후(하네스별) |
| 세션 훅 수 | `.claude/settings.json` 의 `hooks.*[].hooks[]` 개수 | 이전 → 이후 |
| 검증 | CI 파이프라인 `full` 결과 링크 | passed |
| 작업 공간 정리(knots) | `git worktree list` · `knots-work-gc` | 이전 작업 공간 0개 |

## 7. 알려진 차이(2.0.0-alpha.0 에서 복사본으로 본 것)

- v1 설치본의 `update` 는 새로 까는 파일이 많다(knots 복사본 141개). 세션마다 실리는 양이 늘 수 있다(claude 61,957 → 76,079바이트, 훅 수 20 → 30). 늘어난 것은 킷 스킬 설명 · 역할 · 규칙 복사본이다. 숫자는 이전 MR 설명에 적고 사람이 받아들인다.
- 사람이 고친 문서가 많은 리포는 `conflict` 가 많다(knots 복사본 47개). 한꺼번에 하지 말고 폴더 단위로 병합 커밋을 나눠도 된다(이전 커밋 하나 원칙은 최종 커밋 기준).
- AI-DLC 파일은 `add aidlc` 를 하기 전에는 lock 에서 `user` 소유로 보인다. 그래서 세션 적재량의 `external:aidlc` 가 0 으로 나오고 `user` 가 크다 — 훅 17개만 `external:aidlc` 로 센다.
