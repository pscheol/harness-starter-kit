# 05. AI-DLC · Entire 실제 도구 시험 기록

- 시험일: 2026-11-24. 시험 폴더는 모두 `/tmp` 아래 일회용 리포였고, 킷 리포나 사용자 리포에서는 돌리지 않았다.
- 목적: 설계 10 §6 "확인 필요" 항목을 실제 도구로 닫고, 모듈 엔진(HK-20)이 읽는 파일 이름 · 형식 · 설정 키를 판 번호와 함께 남긴다.
- 도구 판: AI-DLC(`aidlc`) 2.11.4(runtime 2.11.4, `~/.local/bin/aidlc`), Entire CLI 0.13.4(`brew install --cask entireio/tap/entire`로 설치, darwin/arm64, Go 1.27.4).

## 1. AI-DLC 2.11.4

### 1.1 설치 · 하네스 이름

| 항목 | 확인한 것 |
|---|---|
| 설치 명령(공식 README) | macOS · Linux · WSL: `curl -fsSL https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.sh \| sh`. Windows PowerShell: `irm https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.ps1 \| iex` |
| 업데이트 | `aidlc update`(`--check` 는 새 판이 있으면 exit 5, `--json` 의 `data.latestVersion`) |
| 하네스 이름(`aidlc config --harness`) | `claude` · `codex` · `copilot` · `cursor` · `kiro-v2` · `kiro` · `opencode`. 킷의 claude · codex · cursor · kiro 는 같은 이름이다 |
| 비대화형 설정 | `aidlc config --harness <이름> --yes`(`--dry-run --json` 은 만들 파일 목록을 쓰지 않고 낸다) |
| 설계 단계까지만 돌리는 설정 | **없다.** 범위(scope) 11종(`classic` · `feature` · `mvp` …)은 모두 Construction 단계(`code-generation` · `build-and-test`)를 넣는다. 그래서 킷은 `<Intent>/construction/` 폴더가 생기면 doctor 가 `construction-artifacts` 경고를 낸다(구현은 킷 SDD 가 맡는다) |

### 1.2 `aidlc config --harness claude --yes` 가 만드는 것(405개)

| 자리 | 내용 |
|---|---|
| `.claude/CLAUDE.md`(약 23KB) | 첫 줄 `@.claude/rules/aidlc.md` 로 세션마다 실리는 진입 파일 |
| `.claude/rules/aidlc.md`(약 1.6KB) | `paths` 없는 규칙. `@../../aidlc/active-memory/*.md` 로 약 27KB 를 더 가져온다 |
| `.claude/skills/aidlc*`(43개) · `.claude/agents/aidlc-*`(14개) | 스킬 · 서브에이전트 설명이 세션마다 실린다 |
| `.claude/aidlc-common/` · `sensors/` · `tools/` · `knowledge/` · `scopes/` · `hooks/` | 단계 정의 · 센서 · 도구 · 지식(실행 파일 포함 14MB) |
| `.claude/settings.json` | **킷과 같은 파일을 쓴다.** `companyAnnouncements` · `permissions.allow` · `env` · 훅 17개(PreToolUse 3 · PostToolUse 7 · SessionStart · SessionEnd · UserPromptSubmit · PreCompact · SubagentStart · SubagentStop · Stop). 이미 있던 설정과 훅은 지킨다("your own settings were kept") |
| `.claude/settings.local.json.example` | 개인 설정 예시 |
| `aidlc/active-space` · `aidlc/active-memory/` · `aidlc/spaces/<space>/memory/` | 작업 기억(사람이 고치는 원본은 `spaces/<space>/memory/`) |
| `.gitignore` | `# BEGIN AI-DLC:gitignore … # END` 블록을 **더한다**(킷이 소유한 파일이라 킷 `update` 에서 `.gitignore.new` 충돌이 난다 — 4절) |

다른 하네스: codex 는 `.codex/…` 외에 **`AGENTS.md` 와 `.agents/skills/` 에도 쓴다**(킷 소유 경로와 겹친다). cursor · kiro · kiro-v2 도 `AGENTS.md` 에 쓴다. copilot · opencode 는 `.aidlc/…` · `.github/…`. 검증한 것은 claude 뿐이고 나머지는 `--dry-run --json` 파일 목록 기준이다. `module.json` 의 `harnessWarnings` 가 doctor · add 계획에 이 겹침을 알린다.

### 1.3 Intent 폴더 · 산출물(Units 단계)

`aidlc engine intent create --scope classic --arguments "<설명>" --label <라벨>` 로 Intent 를 만들면(`aidlc config` 뒤, 훅이 아직 안 돌았으면 `orchestrate` 는 "hooks are off" 안내만 낸다):

```text
aidlc/spaces/<space>/intents/<YYMMDD>-<label>/
├── aidlc-state.md              "- **Project**: <제목>" · "- **Scope**: classic" · 단계 진행(체크박스)
├── project-description.json    "Todo CLI with sync"  (JSON 문자열 하나)
├── audit/<사용자>-<clone id>.md   감사 기록(아래 1.4)
├── inception/<stage>/…         단계별 산출물
└── .aidlc-engine/ · .aidlc-sensors/   내부(.gitignore 대상)
aidlc/spaces/<space>/intents/intents.json   [{uuid, slug, dirName, scope, status}]
aidlc/spaces/<space>/intents/active-intent  활성 Intent 폴더 이름
```

Units Generation 단계 정의(`.claude/aidlc-common/stages/inception/units-generation.md`, 2.11.4)가 정한 산출물 — 어댑터(`modules/aidlc/adapter-v2.ts`)가 읽는 파일:

| 파일(`inception/units-generation/`) | 형식 |
|---|---|
| `unit-of-work.md` | `Unit ID`(`U1`) · `Directory`(`u1-ledger`) 열이 있는 표, Unit 별 책임 · 배포 모델 · 복잡도(S/M/L/XL) · kind |
| `unit-of-work-dependency.md` | 의존 DAG 서술 + **필수 ```yaml 블록**: `units:` 목록의 `name` · `kind`(`service`/`spec`/`ui`/`packaging`/`library`, 생략 가능) · `depends_on: [..]` |
| `unit-of-work-story-map.md` | `\| US1.1 \| U1 \| u1-ledger \|` 행(스토리가 없으면 `FR`). 한 칸에 `;` 로 Unit 여럿 |
| `traceability.json` | `{stage, upstream_ids, coverage:[{id, status:"OK"\|"GAP", target}]}` |
| (다른 단계) `inception/user-stories/stories.md` | `US{group}.{seq}` 스토리 + `AC{g}.{s}.{n}` 수용 기준 · MoSCoW |

킷 어댑터의 대응: AI-DLC Unit → `units[]`(`sourceId` = `U1`, 표에 없으면 디렉터리 이름), `kind: spec` → `contract`, 그 밖 → `feature`, `depends_on` → `dependsOn`, 스토리 맵 → `stories`(여러 Unit 이 적히면 첫 Unit 에만 두고 알린다), `order` = 의존 깊이. 알려진 파일이 없거나 Intent 제목 · Unit 목록이 없으면 exit 2 와 빠진 항목.

**한계**: 이 시험에서 LLM 으로 전체 워크플로를 돌리지는 않았다. 위 산출물 형식은 2.11.4 에 들어 있는 단계 정의 파일(도구 자신의 명세)과 `aidlc engine intent create` 의 실제 출력으로 확인했고, 실제 에이전트 세션이 쓴 산출물과의 일치는 사람이 한 번 확인한다(시험 폴더의 어댑터 시험은 이 명세대로 만든 fixture 로 돈다).

### 1.4 승인 기록에 승인자 신원이 있는가

없다. 게이트 승인은 `aidlc engine orchestrate report --stage <slug> --result approved --user-input "<문구>"` 가 감사 기록에 `GATE_APPROVED`(+ `STAGE_COMPLETED`)를 남기고, 사람이 입력했는지는 `UserPromptSubmit` 훅(`record-human-turn`)이 `HUMAN_TURN` 으로 기록해 확인한다. 기록 파일 이름은 `<로컬 사용자>-<clone id>.md` 이고 행에는 시각 · 단계 · 입력 문구뿐이다 — 이메일이 없다. 그래서 설계 10 §3.2 6단계 규칙대로 어댑터는 승인을 `approvals.md` 로 옮기지 않고(개수만 알린다), 그 게이트는 사람이 관리 페이지 · `harness-kit approve` 로 승인한다.

### 1.5 `aidlc doctor`

`aidlc doctor` 는 훅이 아직 한 번도 돌지 않은 프로젝트에서 "AIDLC hooks have not run in this project yet" 경고를 내고 exit 1 이 될 수 있다(Claude Code 를 한 번 열면 사라진다). 그래서 모듈 단계는 `aidlc doctor` 를 `allowFail` 로 두고 출력만 보여 준다.

## 2. Entire CLI 0.13.4

### 2.1 설치 · 이름

| 항목 | 확인한 것 |
|---|---|
| 설치(공식 README) | macOS · Linux: `brew install --cask entireio/tap/entire`(**cask** — 설계 10 예시의 formula `brew install entireio/tap/entire` 와 다르다), 또는 `curl -fsSL https://entire.com/install.sh \| bash`. Windows: `irm https://entire.com/install.ps1 \| iex` |
| 업데이트 | 같은 설치 방식으로 다시(`brew upgrade --cask entireio/tap/entire`). 최신 판은 `brew info --cask entireio/tap/entire --json=v2` 의 `casks.0.version`. 공식 릴리스 최신은 0.13.4(2026-11-13), 그 뒤는 nightly 뿐 |
| 에이전트 이름(`entire agent add` · `entire enable --agent`) | `claude-code` · `codex` · `cursor` · `copilot-cli` · `opencode` · `antigravity` · `factoryai-droid` · `pi`. **kiro 는 없다** — 구현 역할 하네스가 kiro 면 add 는 쓰기 전에 exit 3 |

### 2.2 `entire enable --agent claude-code --project` 가 하는 것

- `.entire/settings.json` 을 만든다: `{"enabled": true, "checkpoints": {"primary": {"type": "git-refs"}}}`. `.entire/.gitignore`(`tmp/` · `settings.local.json` · `metadata/` · `logs/` · `redactors/local/`) · `.entire/logs/`.
- `.claude/settings.json` 에 훅 10개(PostToolUse · PreToolUse · SessionStart · SessionEnd · Stop · …, 명령은 `sh -c '… exec entire hooks claude-code <이벤트>'`)를 더한다. 이미 있는 훅은 지킨다.
- **git 훅 5개(`prepare-commit-msg` · `commit-msg` · `post-commit` · `post-rewrite` · `pre-push`)를 설치한다. 전역 `core.hooksPath` 가 설정돼 있으면 그 폴더(모든 리포가 같이 쓴다)에 설치하고 원래 `pre-push` 를 `pre-push.pre-entire` 로 옮긴다.** 이 시험에서 처음 한 번 실제 홈으로 돌려 사용자의 전역 훅 폴더가 바뀌었고, `entire disable --uninstall --force` 로 원상 복구한 것을 확인했다(`pre-commit` · `pre-push` 의 크기 · 날짜가 같다). 이후 모든 Entire 시험은 `HOME` · `GIT_CONFIG_GLOBAL` 을 일회용 폴더로 바꿔 돌렸다. 킷 doctor 는 `global-hooks-path` 경고로 이를 알린다.
- 체크포인트는 `refs/entire/checkpoints/…` 에 쌓이고 커밋 메시지에 `Entire-Checkpoint: <id>` 트레일러가 붙는다(세션이 있을 때만). 에이전트 세션 없이 커밋하면 트레일러가 없다.

### 2.3 설정 키(설계 10 §6 "실제 키 이름")

| 하고 싶은 것 | 실제 방법 |
|---|---|
| 체크포인트를 원격에 올리지 않기 | `entire configure --project --skip-push-sessions` → `.entire/settings.json` 에 `"strategy_options": {"push_sessions": false}`. `entire enable` 에 같은 플래그도 있다. `--local` 이면 `.entire/settings.local.json` |
| 올리는 시점 | `entire configure --checkpoint-push-policy manual`(`git push` 가 올리지 않고 `entire checkpoint push --all` 로만) — 복제본 전체 설정으로 `.git/entire/checkpoint-push-policy` 에 저장(공유되지 않는다) |
| 별도 비공개 원격 | `entire configure --local --checkpoint-remote github:<owner>/<repo>`(gitlab 도 `gitlab:…`) |
| 커밋 연결 · 비밀값 마스킹 | **설정 키가 없다.** 비밀값은 내장 redaction(best effort)이 가리고, 사용자 정의는 `.entire/redactors/local/`(`.gitignore` 에 있는 폴더, 형식 미확인). 설계 10 §3.3 3단계의 "마스킹 패턴을 설정에 쓴다"는 지금 판에서는 쓸 곳이 없어 하지 않는다 |
| 상태 | `entire status`(`Automatic checkpoint pushing: disabled (push_sessions=false)`) · `entire checkpoint list` · `entire checkpoint explain <id\|sha>`(없는 id 는 "no checkpoint or commit found") |

### 2.4 원격 공개 여부 확인

`gh repo view --json visibility` 가 `{"visibility":"PUBLIC"\|"PRIVATE"\|"INTERNAL"}` 를 낸다(시험은 가짜 `gh` 로 세 값과 실패를 돌렸다). 원격이 없거나 `gh` 가 인증 · 접근에 실패하면 모듈은 공개로 보고 `--skip-push-sessions` 를 쓴다(MD-R13). `glab repo view -F json` 의 `visibility` 는 GitLab 시험 환경이 없어 가짜 응답으로만 확인했다.

## 3. 설계 10 §6 확인 필요 항목 결과

| 항목 | 결과 |
|---|---|
| AI-DLC 설치 · 업데이트 명령 · 지원 OS | 1.1. Linux · macOS 는 `install.sh`, Windows 는 PowerShell 설치기(킷은 Windows 명령을 출력만 한다) |
| Entire 의 Linux · Windows 설치 명령 | 2.1. Linux `install.sh`(brew 도 된다고 문서에 있음), Windows `install.ps1` |
| Claude Code 세션 기록의 훅 출력 항목 | 이번에 시험하지 않았다. S13 의 "훅이 실제로 붙인 글"은 킷 훅의 `hook-output.jsonl` 과 정적 바이트 합계만 쓴다(외부 훅은 "자료 없음") |
| AI-DLC Intent · Unit 산출물 이름 · 형식 | 1.3 |
| `aidlc config --harness` 가 받는 이름 · 설계 단계만 돌리는 설정 | 1.1(이름은 같고, 설계 단계만 돌리는 설정은 없다) |
| AI-DLC 승인자 신원 | 1.4(없다) |
| `.entire/settings.json` 키 · push 끄는 방법 | 2.3 |
| `entire agent add` 가 받는 하네스 이름 | 2.1(kiro 없음) |
| GitLab squash 템플릿 필드 | 시험하지 못했다. `glab api projects/:id` 의 `squash_commit_template` 를 읽고 못 읽으면 안내만 한다(doctor `gitlab-squash-template`) |

## 4. 킷과 겹치는 곳(운영 메모)

1. `.claude/settings.json` 은 킷(병합 키)과 두 도구가 모두 쓴다. 어느 순서로 깔아도 서로의 항목을 지켰다(킷 → AI-DLC → Entire, Entire → AI-DLC, 두 순서에서 `update` · `repair` · `remove` · `uninstall` 뒤에도 외부 훅 항목의 sha256 이 그대로). lock 의 이 파일 항목은 킷 `merge` 이므로 파일 전체 sha256 이 아니라 외부 훅 항목별 sha256 으로 불변을 본다.
2. AI-DLC 가 `.gitignore` 에 블록을 더한다 → 킷이 소유한 `.gitignore` 가 "고친 파일"이 되어 `update` 가 `.gitignore.new` 를 만든다(킷 쪽 기존 규칙, 사용자가 `.gitignore` 에 줄을 더해도 같다).
3. 도구 파일은 크다: AI-DLC 하나가 세션마다 약 73KB(진입 파일 9 · 규칙 1 · 스킬 설명 43 · 에이전트 설명 14 · 훅 17개) 를 싣는다. `add` 가 이 양을 owner 별로 보이고 4,096바이트를 넘으면 TTY 에서 한 번 더 묻는다.
