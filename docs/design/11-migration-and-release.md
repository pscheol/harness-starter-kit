# 11. 기존 프로젝트 이전과 릴리스

- 단계: 전 단계(P17~P24). 이전은 단계별 릴리스 뒤에 한 번씩 한다.
- 방향과 이유: [03 #migrate](../harness-next/03-plan.html#migrate) · [03 #release](../harness-next/03-plan.html#release) · [03 #risks](../harness-next/03-plan.html#risks) · [04 #adopt](../harness-next/04-usage.html#adopt) · [04 #rollout](../harness-next/04-usage.html#rollout) · [02 #modes](../harness-next/02-direction.html#modes) · [01 진단](../harness-next/01-diagnosis.html)
- CLI 명령·lock 변환: 02. 모듈 `add`·`remove`: 10. 검증 레벨: 01.

## 1. 목적·범위

현장 리포 두 곳(knots-platform, hr-vision-3d)을 v2로 옮기는 순서와 되돌리는 방법, 모든 릴리스가 통과해야 하는 두 구성 e2e 시험, 버전 올리기 스크립트와 버전 규칙, v1 호환 기간을 정한다.

범위 밖: 각 현장 리포의 제품 코드, CLI 내부 알고리즘(02), 모듈 내부(10).

이전 대상의 현재 상태(2026-11-23):

| 항목 | knots-platform | hr-vision-3d(hdr) |
|---|---|---|
| 하네스 | 킷 1.0.7, v1 lock(TSV) | 손으로 만든 하네스(킷 아님) |
| 다층 배포 | 자체 `sync.py` + `units.json` 배포 단위 23곳 | submodule 2곳에 규칙 사본 |
| AI-DLC | `.claude` 안에 파일 362개 · 훅 17개, Intent 0건 | 없음 |
| 설정 | 루트 `.claude/settings.json`을 손으로 관리 | `.claude/settings.local.json`이 `git push`·`git commit`을 조건 없이 허용 |
| 원격 | gitlab.com | gitlab.com |
| 기타 | 상시 컨텍스트 약 61KB, 점유 상태 `state.json` 25MB, SDD 기록 59곳에 `--full` 지시, recording-specs 이슈 73개 + 옛 구조 문서 60개 | submodule, 리포 간 조율 문서 `cross-repo-orchestration.md` |

## 2. 요구사항

| ID | 요구사항(EARS) |
|---|---|
| MG-R1 | 이전의 모든 단계는 `doctor`(읽기만) → `update --dry-run` → 사람 승인 → 적용 → `.new` 병합 → 검증 → 커밋 하나 순서를 따른다. |
| MG-R2 | knots 이전 작업은 `~/knots-work/<영역>-<이름>`에 `git worktree add … origin/develop`으로 만든 작업 공간에서만 하고, 끝(변경 커밋 + push)나면 같은 세션에서 지운다. |
| MG-R3 | 이전 중 사람이 고친 파일은 덮지 않고 `.new`로 옆에 둔다. `.new`가 남아 있으면 `verify.sh fast`가 경고한다. |
| MG-R4 | 이전 단계마다 되돌리기는 그 단계의 이전 커밋 하나를 `git revert`하는 것으로 끝난다. |
| MG-R5 | 이미 깔린 외부 도구 파일은 이전 중 sha256이 바뀌지 않는다. 지우는 결정은 사람이 하고, 킷은 지우지 않는다. |
| MG-R6 | `init --adopt`는 이미 있는 파일을 모두 `owner: user`로 기록하고 없는 파일만 깐다. |
| MG-R7 | 모든 릴리스는 두 구성(킷만 / 킷 + AI-DLC + Entire)의 e2e 시험을 통과해야 태그를 만든다. |
| MG-R8 | `scripts/release.sh <버전>`은 package.json · 마켓플레이스 파일 2개 · 플러그인 매니페스트 2개의 버전을 한 번에 같은 값으로 바꾸고, 다섯 값이 다르면 `--check`가 실패한다. |
| MG-R9 | 릴리스 스크립트는 push하지 않는다. 태그 push는 사람이 한다. |
| MG-R10 | v2.x CLI는 v1 lock(TSV)을 읽어 v2로 바꾼다. v1 SDD 폴더 배치는 v3.0 전까지 읽기를 지원한다. |
| MG-R11 | v2.0.x 동안 Node가 없는 환경에서 플러그인 스킬은 `setup.sh`로 내려간다. v2.1.0에서 `setup.sh`를 뺀다. |

## 3. 설계

### 3.1 공통 이전 절차

```text
1 점검   npx harness-kit doctor                  읽기만. 결과를 이전 이슈의 handoff 문서에 붙인다
2 계획   npx harness-kit update --dry-run         바뀔 파일 · .new가 생길 파일 · 외부 소유로 잡힐 파일 목록
3 승인   사람이 목록을 보고 이전 이슈의 tasks 계획을 승인한다   관리 페이지 또는 npx harness-kit approve. 대화의 말은 승인이 아니다(09 §3.8)
4 적용   npx harness-kit update                  .new 생성, lock v2 쓰기
5 병합   .new 파일을 하나씩 병합 → 원본 자리로   남은 .new 0개
6 검증   bash scripts/verify.sh --full(사람 터미널 또는 CI) · npx harness-kit doctor --check(exit 0)
7 커밋   이전 커밋 하나. 메시지: "chore: 하네스 v<버전> 이전 — <단계>"   사람 승인 뒤
```

- 에이전트 세션은 6의 `--full`을 돌리지 않는다(D10). 이전 브랜치를 push하면 CI가 `full`을 돈다.
- 4 이후 문제가 보이면 커밋 전이므로 `git restore --staged --worktree -- <update 계획의 경로들>`과 새로 생긴 파일 삭제로 되돌린다. 계획 목록은 `update --dry-run --json`이 낸다.

### 3.2 knots-platform

knots 작업 공간 규칙: `git worktree add ~/knots-work/harness-v2-<단계> -b chore/harness-v2-<단계> origin/develop`. Rust·Tauri 빌드는 `CARGO_TARGET_DIR=~/knots-work/.cargo-target`을 같이 쓴다. 끝의 정의는 `git status --porcelain`이 비고 `git rev-list --count HEAD --not --remotes`가 0이다. 끝나면 `git worktree remove`(submodule이 있으면 `rm -rf` 뒤 `git worktree prune`).

| 단계 | 킷 버전 | 할 일 | 끝의 확인 | 되돌리기 |
|---|---|---|---|---|
| K0 | 1.1 | 이슈 단위 SDD: `sdd-layout.py migrate --dry-run`으로 영역 폴더 13곳의 이슈 목록 → 승인 → 적용. tasks 템플릿의 `--full` 지시 59곳을 "affected 결과 · CI full 링크"로 정리. 에이전트 `--full` 차단 훅 켬 | 적용 뒤 `board.sh` 결과가 이전과 같다. 파일 1개 변경 작업의 changed 검증 3분, affected 15분 이내 | 이전 커밋 revert |
| K1 | 2.0 | `npx harness-kit doctor`만 돌린다. 쓰지 않는다 | 보고서에 lock v1 변환 가능, 포인터 수, `foreign` 파일 362개(AI-DLC 경로), 배포 단위 23곳이 나온다 | 없음(쓰기 0) |
| K2 | 2.4 | 루트 `update`: lock v1 → v2, 포인터 → 링크·생성, 역할 배정 생성, 루트 `.claude/settings.json`을 `op: merge` 대상으로(킷 키만 킷 소유, 나머지는 그대로). AI-DLC 결정(아래) | `doctor --check` exit 0, `verify.sh --full`(CI) 통과, AI-DLC 파일 sha256 불변(MG-R5) | 이전 커밋 revert. lock v1 원본은 `.agents/state/backup/`에도 남긴다 |
| K3 | 2.6 | 배포 단위: `harness-kit sync units --check`를 `sync.py --check`와 나란히 돌린다. 23곳 결과가 같아지면 훅·문서의 호출을 CLI로 바꾸고 `sync.py`는 한 릴리스 동안 남긴다 | 두 `--check` 출력이 23/23 같다(10 MD-R16) | 호출을 `sync.py`로 되돌리는 커밋 revert |
| K4 | 2.6 | 정리: 점유 상태 prune(완료 세션 7일, 공지 30일), 진입 파일 61KB를 24KB 이하로 나눈다(규칙 본문은 `.agents/rules/`로, 진입 파일에는 목차만) | `state.json` 보존 기한 밖 기록 0건, `doctor`의 진입 파일 경고 0건 | revert. prune 전 사본은 `.agents/state/backup/` |

K2의 AI-DLC 결정(사람이 고르고 ADR로 남긴다):

| 선택 | 할 일 | 결과 |
|---|---|---|
| A. 쓴다 | `npx harness-kit add aidlc` — 362개 파일을 `external:aidlc`로 등록, 킷 훅 병합, `flow.design = "aidlc"` | AI-DLC 훅 17개는 계속 돈다 |
| B. 쓰지 않는다(추천: Intent 0건) | `flow.design = "kit"`. AI-DLC 훅 17개는 `aidlc uninstall`(도구 명령) 또는 사람이 설정에서 뺀다. 파일 362개는 남기거나 사람이 지운다 | 매 세션 도는 훅 17개가 빠진다. 킷은 파일을 지우지 않는다 |

K2 전후 비교 자료(이전 MR 설명에 붙인다): 세션 시작 때 도는 훅 수, 진입 파일 바이트, 손으로 관리하는 하네스 파일 수(P18 기준 78 → 0), `doctor` 상태별 개수.

### 3.3 hr-vision-3d

| 단계 | 킷 버전 | 할 일 | 끝의 확인 | 되돌리기 |
|---|---|---|---|---|
| H1 | 2.0 | `npx harness-kit init --adopt --dry-run` → 목록 검토(기존 파일 전부 `owner: user`, 새로 깔 파일만 표시) → 승인 → `init --adopt` | 기존 파일 sha256 변경 0건, `doctor --check` exit 0 | 이전 커밋 revert |
| H2 | 2.1 | worktree는 도메인 리포 단위로만(상위 리포는 만들지 않는다). 기존 `.gitlab-ci.yml`에 킷 CI include를 더한다(09 §3.7) | MR 파이프라인에 `harness:fast`·`harness:affected`가 돈다 | revert |
| H3 | 2.5 | 승인 강제 켬(09 §3.8). 각 개발자가 자기 `.claude/settings.local.json`에서 `Bash(git push*)`·`Bash(git commit*)` 무조건 허용을 지운다(개인 파일이라 커밋 대상이 아니다) | `doctor`가 개인 설정의 base push 허용을 경고하지 않는다(사람마다 확인). 승인 기록 없는 completed 이동이 막힌다 | 승인 강제 설정 커밋 revert |
| H4 | 2.6 | multi-harness 모듈: submodule 2곳 규칙 사본을 `sync units`로 합친다. `cross-repo-orchestration.md`를 킷 `cross-repo.md` 규칙(10 §3.5)으로 바꾸고, 부모 `specs-index.md`에 SHA 열을 더한다 | `sync units --check` exit 0, 이전 규칙 문서와 새 규칙의 단계 대응표가 MR에 있다 | revert |

`--adopt`로 `owner: user`가 된 파일은 킷 `update`가 건드리지 않는다. 킷 기본 파일로 바꾸고 싶은 파일은 사람이 지운 뒤 `npx harness-kit repair`로 다시 깐다(02).

### 3.4 두 구성 e2e 시험

| 구성 | 설정 | 설치 순서 |
|---|---|---|
| A 킷만 | `modules: []`, `flow: {design: kit, record: none}` | 킷 |
| B 킷 + AI-DLC + Entire | `modules: [aidlc, entire]`, `flow: {design: aidlc, record: entire}` | 킷 → aidlc → entire, 그리고 역순(entire → aidlc → 킷)도 따로 |

시나리오(요구사항 하나를 운영 기록까지):

```text
S1 요구사항 접수        tests/e2e/fixtures/requirement.md(스토리 6, 도메인 2)
S2 설계                 A: /hx-intent 산출물(대본 에이전트) · B: AI-DLC 산출물 fixture → sync aidlc
S3 intent·plans 승인    대시보드 API(PIN 포함)
S4 Unit → SDD 이슈       /hx-specify --from-unit 3회(계약 먼저)
S5 requirements·design·tasks 승인
S6 구현 Bolt 2개        대본 에이전트가 코드·시험을 쓰고 커밋. B는 커밋마다 체크포인트
S7 검증                 verify.sh --changed, --affected, 정적 분석, /hx-review 대본, review.md
S8 MR 승인 → 병합 → done 승인
S9 반영 · 배포 · 운영    /hx-docs 대본 → deploy plan → 가짜 CI 산출물로 deploy record(롤백 시험 · full 통과)
                        → deploy 승인(대시보드 API) → deploy.py result → ops 기록 1건 → intake --from ops:…#NX-1 → 다음 Intent 초안
S10 정리                B만: remove entire → remove aidlc → A 시나리오 S4~S9 다시
```

대본 에이전트: CI에서 실제 모델을 부르지 않는다. 각 명령의 출력 파일을 `tests/e2e/fixtures/scripts/<단계>/`의 정해진 파일로 쓰는 스크립트가 에이전트 자리를 맡는다. 이 시험이 보는 것은 킷 장치(형식 · 게이트 · 어댑터 · 훅 · 대시보드 API · verify)이고, 모델 출력 품질은 보지 않는다. 실제 하네스로 하는 점검은 릴리스 점검표(§3.5 6단계)에 따로 둔다.

외부 도구 두 층:

| 층 | 언제 | AI-DLC · Entire |
|---|---|---|
| `e2e-stub` | 모든 MR | 가짜 실행 파일(`tests/e2e/stubs/aidlc`, `…/entire`)이 받은 인자를 기록하고 알려진 산출물 모양의 파일·ref를 만든다 |
| `e2e-real` | 릴리스 전 | `harness-kit.json` `versions` 범위의 실제 도구(고정 버전 설치 스크립트, 네트워크 필요) |

fixture 리포 `tests/e2e/fixtures/sample-repo/`: python 스택(패키지 2개 = 도메인 2개, pytest 시험 10개, 실행 10초 이하). 시험마다 임시 폴더에 복사하고 `git init`, 가짜 원격(bare 리포)을 붙인다.

```text
tests/e2e/
├── test_two_configs.py            구성 A · B(두 설치 순서)를 같은 시나리오 함수로 돈다
├── fixtures/
│   ├── sample-repo/               src/orders/ · src/billing/ · tests/ · pyproject.toml
│   ├── requirement.md             스토리 6 · 도메인 2 · 외부 통합 1
│   ├── aidlc-output/              B 구성 S2: AI-DLC 산출물 모양(aidlc/spaces/main/intents/261123-…/)
│   └── scripts/<단계>/             대본 에이전트가 쓰는 정해진 출력(intent.md · units.json · 코드 diff · review 보고서 …)
├── stubs/
│   ├── aidlc                      인자 기록 → $E2E_LOG, config·doctor·uninstall 흉내
│   ├── entire                     enable · agent add · checkpoint explain 흉내, 커밋 훅이 트레일러와 refs/entire/checkpoints/<id> 생성
│   ├── glab · gh                  MR 정보·코멘트 API 흉내(JSON 파일 응답)
│   └── jira-server.py             REST changelog 모의 서버(127.0.0.1, 10 §3.4 시험 겸용)
└── golden/                        구성별 기대 결과(units.json 키 집합, requirements 절 목록, lock 항목 수)
```

- 대본 에이전트는 `HX_E2E_ROLE=implement`처럼 역할 환경 변수를 두고 커밋한다. 세션 등록 훅·Entire stub이 이 값으로 구현·리뷰 세션을 가른다(E4).
- 승인은 대시보드 서버를 시험 안에서 띄우고 PIN을 표준 오류에서 읽어 API로 한다. 에이전트 세션 판정 변수는 시험 환경에서 지운다.
- 시험 실패 때 임시 폴더를 `tests/e2e/.artifacts/<시각>/`로 옮겨 남긴다(CI 산출물).

판정 항목:

| ID | 확인 | 구성 |
|---|---|---|
| E1 | `units.json`이 `source`·`sourceId`를 빼고 A·B에서 같은 키 집합 | A·B |
| E2 | `/hx-specify --from-unit` requirements 절 구성이 A·B에서 같다 | A·B |
| E3 | 게이트 순서: 앞 승인 없이 다음 승인 API가 422 | A·B |
| E4 | 체크포인트가 구현 하네스 커밋에만 있다(리뷰 세션 커밋 0) | B |
| E5 | 킷 `update`·`uninstall` 뒤 AI-DLC·Entire 파일·훅 sha256 불변 | B 두 순서 |
| E6 | `remove` 뒤 A 시나리오 통과, 지워진 외부 산출물 0개 | B → A |
| E7 | 대시보드 진행 탭 단계가 `board.sh`·`backlog.md`와 같다 | A·B |
| E8 | 운영 기록 NX 행에서 `intake --from ops:`로 다음 Intent의 `intake.md`(`source.type: ops`)가 생긴다 | A·B |
| E9 | 롤백 시험 결과와 면제가 모두 없는 배포 기록은 `deploy` 승인 API가 422이고, 승인 뒤 `deploy.py check --require-approved`가 exit 0이다(14 §3.4) | A·B |

시간: `e2e-stub` 두 구성 합계 5분 이하(CI 러너 1대).

### 3.5 릴리스 스크립트

`scripts/release.sh <버전> [--check] [--dry-run]`:

| 파일 | 바꾸는 값 |
|---|---|
| `packages/cli/package.json` | `.version` |
| `.claude-plugin/marketplace.json` | `plugins[name = "harness-kit"].version` |
| `.agents/plugins/marketplace.json` | `plugins[name = "harness-kit"].version` |
| `plugins/harness-kit/.claude-plugin/plugin.json` | `.version` |
| `plugins/harness-kit/.codex-plugin/plugin.json` | `.version` |

```text
release.sh 2.2.0
1 인자가 semver(사전 릴리스 -alpha.N · -rc.N 허용)인지, 지금 버전보다 큰지
2 작업 트리가 깨끗하고 브랜치가 main 또는 release/*인지
3 다섯 파일 버전 바꾸기: JSON을 읽어 그 키만 바꾸고 2칸 들여쓰기 + 끝 줄바꿈으로 쓴다
  쓴 뒤 git diff가 다섯 파일의 "version" 줄만 바꿨는지 검사(다른 줄이 바뀌면 되돌리고 exit 1)
4 CHANGELOG.md에 "## 2.2.0" 절이 있는지(없으면 exit 1)
4a pnpm -r build 뒤 node scripts/gen-plugins.mjs: packages/ 에서 plugins/harness-kit/ 을 다시 만든다
   (cli 번들 → bin/harness-kit.js, templates/ · legacy-setup/ 사본, 얇은 스킬). 바뀐 파일은 같은 릴리스 커밋에 넣는다
5 시험(tests/test_generated.py 포함: 생성물 = 원본): python3 -m unittest discover -s tests, CLI 시험, e2e-stub 두 구성(MG-R7)
6 릴리스 점검표 출력(사람이 한다): Claude /hx-plan · Codex $hx-plan · Cursor /hx-plan · Kiro 스킬 목록, e2e-real 결과 링크
7 커밋 "chore: release v2.2.0" + 주석 태그 v2.2.0. push는 하지 않는다(MG-R9)
--check: 다섯 값이 같은지만 보고 다르면 exit 1(CI에서 매 MR)
--dry-run: 1~4만, 쓰지 않는다
```

`README.md`·`hx-bootstrap/manifest.md`의 버전 표기는 사람이 읽는 문서라 스크립트가 바꾸지 않는다. `--check`가 두 파일에서 이전 버전 문자열을 찾으면 경고만 한다.

### 3.6 버전 규칙

| 올리는 자리 | 언제 | 예 |
|---|---|---|
| major | 설치 결과의 경로·형식이 바뀐다(lock 스키마, `.agents/` 배치, 설정 키 삭제·이름 변경), 명령 삭제·이름 변경 | v2.0.0(lock v2, 배치 전환) |
| minor | 명령·모듈·설정 키·분석기가 는다(기본 꺼짐이거나 기존 동작 유지) | v2.2(대시보드), v2.4(모듈) |
| patch | 템플릿 문구, 버그 수정, 외부 도구 검증 범위 넓히기 | `versions.entire`를 `<0.15`로 |

- P17은 `2.0.0-alpha.N`, P18 완료가 `2.0.0`이다(03 #overview).
- 기존 동작을 바꾸는 minor는 하지 않는다. 바꿔야 하면 한 minor 전에 `update`가 `.agents/harness-upgrade-notice.md`를 만들고 세션 시작 훅이 그 공지를 보여 준다.
- 외부 도구 검증 범위를 넓히는 patch도 `e2e-real`을 그 버전으로 통과해야 한다.

### 3.7 v1 호환 기간

| 대상 | v2.0 | v2.1~v2.x | v3.0 |
|---|---|---|---|
| v1 lock(TSV) | 읽고 v2로 바꾼다 | 같음 | 읽지 않는다. v2.x로 먼저 올리라고 안내 |
| v1 SDD 배치(단계 폴더, `tasks/active` · `check` · `completed` 폴더) | 읽기만(보드·대시보드) | 같음 | 읽지 않는다. `sdd-layout.py migrate` 안내 |
| `setup.sh` | Node 없는 환경의 대체 경로로 남김 | 뺀다(v2.1.0) | — |
| `.agents/harness.json`(v1 매니페스트, 세션 점유 루트 판정에 쓰인다) | `update`가 지우지 않고 `harness-kit.json`과 같이 둔다 | 점유 코드가 `harness-kit.json`도 루트 표시로 읽는다 | 뺀다 |
| 플러그인 스킬 `hx-bootstrap`·`hx-update`·`hx-agent-add` | Node 18+면 CLI, 아니면 `setup.sh` | CLI만, Node가 없으면 설치 안내 | 같음 |

### 3.8 되돌리기

- 이전 단계: 커밋 하나이므로 `git revert <커밋>`(MG-R4). 그 단계에서 `add`한 모듈이 외부 도구 명령을 실행했다면, 외부 도구 쪽은 그 도구의 명령으로 되돌린다(`aidlc uninstall` · `entire disable`). revert만으로는 외부 도구가 하네스 설정에 넣은 자기 훅이 돌아오거나 빠지지 않는 경우가 있으므로, 이전 MR 설명에 "외부 도구 되돌리기" 줄을 적는다.
- `update`는 바꾸기 전 파일과 이전 lock을 `.agents/state/backup/<시각>/`에 복사한다(커밋 안 함, 최근 5개 유지). 커밋 전 되돌리기와 revert가 꼬였을 때 원본 확인용이다.
- 릴리스: 태그를 지우거나 다시 쓰지 않는다. 문제가 있는 버전은 patch로 고쳐 낸다. 사용자는 `npx github:<owner>/harness-starter-kit#v2.2.1`처럼 태그를 고정해 쓰고, lock의 `kit.source`가 어느 태그로 깔았는지 남긴다. 낮은 버전으로 `update`하는 규칙은 02가 정한다.

### 3.9 단계별 점검 명령

이전 MR 설명에 아래 출력을 붙인다. 숫자는 이전 전후를 나란히 적는다.

| 점검 | 명령 | 통과 |
|---|---|---|
| 배치 | `npx harness-kit doctor --check --json` | exit 0, `drifted`·`missing`·`stale`·`symlink-found` 0 |
| 외부 파일 불변 | `python3 scripts/harness/check_external.py --snapshot .agents/state/module-snapshots/<시각>.json` | 바뀐 sha256 0 |
| 남은 `.new` | `git ls-files --others --exclude-standard '*.new'` | 출력 0줄 |
| 보드 | 이전 전후 `bash scripts/board.sh` 출력 비교(v2.2부터 `--json`) | 상태 차이 0 |
| 진입 파일 | `wc -c AGENTS.md CLAUDE.md` | 합계 24,576바이트 이하(K4 뒤) |
| 세션 훅 수 | `.claude/settings.json`의 `hooks.*[].hooks[]` 개수(`jq`) | K2 선택 B면 이전보다 17 적다 |
| 검증 | CI 파이프라인 `full` 결과 링크 | passed |
| worktree 정리(knots) | `git -C ~/knots-platform worktree list` · `knots-work-gc` | 이전 작업 공간 0개 남음 |

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| knots를 v2.0에서 한 번에 옮긴다 | 배치 · 모듈 · 배포 단위가 서로 다른 릴리스에서 준비된다. 단계마다 되돌릴 수 있는 커밋 하나로 나눈다 |
| knots 이전을 `git clone`한 사본에서 | clone은 원본과 연결이 없어 끝났는지 확인하기 어렵고, 지우면 push 안 된 커밋이 사라진다(knots 작업 공간 규칙) |
| 쓰지 않는 AI-DLC 파일 362개를 킷이 지운다 | 다른 도구 파일은 덮거나 지우지 않는다(원칙 3) |
| e2e에서 실제 모델로 에이전트 단계를 돌린다 | 결과가 실행마다 달라 시험이 흔들리고 비용이 든다. 장치 시험은 대본으로, 모델 점검은 릴리스 점검표로 나눈다 |
| 날짜 버전(2026.11) | 설치 결과 형식이 바뀌는지가 버전에 드러나지 않는다 |
| v1 lock 읽기를 v2.0에서 바로 끊는다 | knots가 v2.4까지 v1 lock으로 남는다 |
| 릴리스 스크립트가 태그까지 push | push는 사람 승인 대상이다 |

## 5. 완료 기준

1. knots 사본에서 K1 `doctor`가 쓰기 0건으로 끝나고, 보고서의 `foreign` 수가 362, 배포 단위 수가 23이다.
2. knots 사본에서 K2 뒤 `doctor --check` exit 0, AI-DLC 파일 362개 sha256 변경 0건, 남은 `.new` 0개. K2 커밋을 revert하면 lock이 v1 TSV로 돌아오고 `doctor`가 K1과 같은 보고를 낸다.
3. hdr 형태 fixture에서 `init --adopt` 뒤 기존 파일 sha256 변경 0건, lock의 기존 파일 항목이 모두 `owner: user`.
4. 두 구성 e2e(`e2e-stub`)의 판정 항목 E1~E9가 모두 통과하고 합계 5분 이하. B 구성은 두 설치 순서 모두 통과.
5. `release.sh 9.9.9 --dry-run`이 다섯 파일을 바꿀 계획을 출력하고 쓰기 0건. 다섯 값 중 하나를 다르게 둔 fixture에서 `--check`가 exit 1.
6. `release.sh` 실행 뒤 `git diff HEAD~1 --stat`이 다섯 파일 · CHANGELOG · `plugins/harness-kit/` 생성물만 보이고, 다섯 파일의 바뀐 줄은 `"version"` 한 줄이다. `plugins/harness-kit/` 안 파일 하나를 손으로 바꾼 fixture에서 `tests/test_generated.py`가 실패한다.
7. v1 설치 fixture(1.0.7)에서 v2 CLI `update`가 lock v1을 읽어 v2로 쓰고, v1 SDD 배치 이슈 5개가 대시보드 진행 탭에 보인다.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| `aidlc uninstall`이 하네스 설정에 넣은 훅까지 빼는지 | P22 착수 전 시험 리포에서 `aidlc config` → `uninstall` 전후 설정 파일 비교 |
| knots K0의 영역 폴더 13곳·이슈 수가 지금도 같은지 | K0 착수 때 `sdd-layout.py migrate --dry-run` 출력으로 다시 센다 |
| hdr submodule 안에서 `git worktree add`·`remove`가 문제없이 도는지(P19 착수 전 확인 항목) | hdr 사본 도메인 리포에서 시험 |
| GitLab CI include를 `local` 대신 별도 프로젝트(`project:` + `ref:`)로 둘지 | 현장 두 곳의 GitLab 그룹 정책 확인 |
| `e2e-real`에서 AI-DLC·Entire를 CI 러너에 설치하는 방법(brew 없음) | 각 도구의 Linux 설치 방법 문서 확인 |
| Codex 매니페스트(`.codex-plugin/plugin.json`)·Codex 마켓플레이스 파일의 버전 키가 Codex 쪽에서 실제로 읽히는지 | Codex 플러그인 문서와 설치 시험 |
