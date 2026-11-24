# 10. 선택 모듈: aidlc · entire · jira-workflow · notion · multi-harness

- 단계: aidlc · entire는 P22(v2.4), jira-workflow · notion은 P21(v2.3), multi-harness는 P24(v2.6). 선행: P17(CLI · lock v2) · P18(배치).
- 방향과 이유: [02 #aidlc-entire](../harness-next/02-direction.html#aidlc-entire) · [02 #modes](../harness-next/02-direction.html#modes) · [02 #coexist](../harness-next/02-direction.html#coexist) · [02 #fieldwork](../harness-next/02-direction.html#fieldwork) · [05 #jira](../harness-next/05-principles.html#jira) · [05 #extend](../harness-next/05-principles.html#extend) · [04 #entire](../harness-next/04-usage.html#entire) · [04 #multirepo](../harness-next/04-usage.html#multirepo) · [03 #p22](../harness-next/03-plan.html#p22) · [03 #p24](../harness-next/03-plan.html#p24) · D1 · D2 · D6
- CLI 명령과 lock 형식: 02. 훅 병합: 03. 게이트와 승인 강제: 09. Intent·Unit 형식: 08.

## 1. 목적·범위

모듈은 기본 꺼짐이고, 켠 것만 파일·훅·설정을 깐다. 외부 도구(AI-DLC · Entire)는 그 도구의 설치기와 명령으로 깔고, 킷은 생긴 파일을 외부 소유로 기록하고 킷 몫의 훅·설정만 병합한다. 끄면 킷 몫만 빠지고 외부 도구가 만든 산출물은 남는다.

범위에 넣는 것: 모듈 선언 파일 `module.json`, `add` · `remove` 절차, 모듈 넷의 설계. 범위 밖: 외부 도구 자체의 동작, CLI 공통 엔진(02), 하네스 어댑터(03).

외부 도구 이름은 이 문서와 각 모듈 폴더 안에서만 쓴다(D1). 공통 규칙·템플릿 본문에는 넣지 않는다.

## 2. 요구사항

| ID | 요구사항(EARS) |
|---|---|
| MD-R1 | 모든 모듈은 `module.json` 하나로 파일 · 훅 · 설정 키 · 외부 경로 · 요구 · 충돌을 선언하고, CLI는 이 파일에 없는 것을 깔지 않는다. |
| MD-R2 | `add <모듈>`은 적용 전에 바꿀 파일 · 병합할 훅 · 실행할 외부 명령 · 바뀔 설정을 출력하고, `--dry-run`이면 거기서 끝낸다. |
| MD-R3 | 요구 도구가 없을 때, 사람 터미널(TTY)이면 `init` · `add`는 그 도구의 공식 설치 명령을 먼저 보여 주고 설치할지 묻는다. 사람이 고르면 그 명령을 실행하고 버전을 다시 확인한다. `--install-tools`면 묻지 않고 실행한다. 에이전트 세션(06 §3.11 판정)에서는 `--install-tools`가 있어도 실행하지 않고, 설치 명령을 출력하고 exit 5로 끝낸다. TTY가 아니고 `--install-tools`가 없을 때도 같다. `sudo`가 필요한 명령은 실행하지 않고 출력만 한다. 설치는 그 도구의 설치기가 하고, 킷은 설치기를 부르기만 한다. |
| MD-R15 | `update --tools`는 켠 모듈의 도구마다 지금 버전과 최신 버전을 보이고, 사람이 고른 도구만 그 도구의 공식 업데이트 명령을 실행한다. 새 버전이 `versions` 범위 밖이면 경고하고 `--allow-unverified` 없이는 올리지 않는다. 에이전트 세션에서는 목록만 보인다. |
| MD-R16 | `add <모듈>`은 적용 전후로 세션마다 실리는 양을 owner별로 재서 출력하고(§3.7), 늘어난 양이 4,096바이트를 넘으면 TTY에서 한 번 더 확인한다. `doctor`와 관리 페이지 S13은 같은 값을 owner별로 보인다. |
| MD-R4 | 요구 도구 버전이 `knots-sync.json`의 `versions` 범위 밖이면 `add`·`doctor`는 경고하고, `add`는 `--allow-unverified` 없이는 멈춘다. |
| MD-R5 | `add`가 외부 명령을 실행한 뒤 생긴 파일 중 `externalPaths`에 맞는 것은 lock에 `op: none`, `owner: external:<도구>`로 기록한다. |
| MD-R6 | `remove <모듈>`은 lock에서 `layer: optional/<id>`이고 주인이 kit인 항목만 지우거나 빼고, 외부 소유 파일과 산출물은 지우지 않는다. |
| MD-R7 | 킷 `update`·`uninstall`·`remove` 뒤 외부 소유 파일의 sha256은 그 전과 같다. |
| MD-R8 | 충돌하는 모듈이 켜져 있으면 `add`는 거부한다. |
| MD-R9 | aidlc 모듈을 켜면 `flow.design = "aidlc"`가 되고, 끄면 `"kit"`으로 돌아간다. 이미 만든 Unit 목록과 SDD 이슈는 그대로 쓴다. |
| MD-R10 | AI-DLC 어댑터는 같은 입력(sha256)에 같은 `units.json`을 내고, 다시 가져올 때 Unit의 `issue` 연결을 지킨다. |
| MD-R11 | AI-DLC가 깔린 하네스와 `roles.design.harness`가 다르면 doctor가 경고한다. |
| MD-R12 | entire 모듈은 `roles.implement.harness` 하나에만 `entire agent add`를 한다. 리뷰 하네스에는 켜지 않는다. |
| MD-R13 | 원격 저장소 공개 여부를 확인하지 못하면 entire 모듈은 공개로 보고 체크포인트를 올리지 않는 설정을 쓴다. |
| MD-R14 | jira-workflow 모듈에서 승인에 해당하는 상태 전이는 에이전트가 하지 않는다. 사람이 Jira에서 옮긴 기록만 `approvals.md`로 가져온다. |
| MD-R15 | Jira가 없거나 연결 설정이 비어 있어도 킷 흐름과 대시보드 보드는 같은 여덟 상태로 돈다. |
| MD-R16 | `knots-sync sync units --check`는 단위 23곳 fixture에서 `sync.py --check`와 같은 결과를 낸다. |
| MD-R17 | 상위 리포의 커밋은 제공 리포 → 소비 리포 → 상위 포인터 순서를 지키고, 상위 SDD 목록에 도메인별 submodule SHA를 남긴다. |

## 3. 설계

### 3.1 모듈 선언과 수명

자리: `packages/templates/optional/<id>/module.json`. 지금의 `ABOUT` 파일은 `module.json`의 `title`·`summary`로 옮긴다. `module.json`은 설치하지 않는 파일이므로 02 `layout.json`의 `ignore`에 `ABOUT`과 함께 넣는다.

```json
{
  "schema": "knots-sync.module/v1",
  "id": "entire",
  "title": "Entire 대화 기록",
  "summary": "구현 하네스에만 커밋별 체크포인트를 남긴다",
  "kind": "external",
  "requires": {
    "kit": ">=2.4.0 <3",
    "modules": [],
    "tools": [ { "name": "entire", "versionCmd": ["entire", "--version"], "rangeKey": "versions.entire",
                 "install": { "darwin": ["brew", "install", "entireio/tap/entire"], "linux": null, "doc": "<공식 설치 문서 URL>" },
                 "update":  { "darwin": ["brew", "upgrade", "entireio/tap/entire"], "linux": null } } ]
  },
  "conflicts": [],
  "files": [ { "from": "agents-rules/entire-usage.md", "to": ".agents/rules/entire-usage.md", "op": "copy" } ],
  "hooks": [ { "id": "harness-entire-trailer", "event": "PreToolUse", "harnesses": ["claude"], "command": "python3 scripts/hooks/entire-trailer.py" } ],
  "settings": [ { "path": ".claude/settings.json", "keys": ["permissions.allow:Bash(entire checkpoint *)"] } ],
  "externalPaths": [".entire/**", ".claude/hooks/entire*"],
  "config": { "set": { "flow.record": "entire" }, "unset": { "flow.record": "none" } },
  "steps": {
    "add":    [ { "run": ["entire", "enable"], "confirm": true },
                { "run": ["entire", "agent", "add", "{implementHarnessName}"], "confirm": true },
                { "registerExternal": true }, { "applyKit": true }, { "setConfig": true }, { "doctor": "entire" } ],
    "remove": [ { "removeKit": true }, { "unsetConfig": true },
                { "print": "기록을 끄려면 entire agent remove {implementHarnessName} 또는 entire disable(도구 명령, 킷은 실행하지 않는다)" } ]
  },
  "doctor": ["tool-version", "implement-only", "trailer-allowed", "push-policy", "gitlab-squash-template"]
}
```

| 필드 | 뜻 |
|---|---|
| `kind` | `kit`(킷 파일만) · `external`(외부 도구를 쓴다) |
| `files` · `hooks` · `settings` | 킷 몫. lock 항목은 `owner: kit`, `layer: optional/<id>`(02의 레이어 이름 규칙) |
| `externalPaths` | 외부 도구가 만드는 경로 glob. 등록·`foreign` 판정·불변 검사에 쓴다 |
| `steps` | CLI가 순서대로 실행하는 단계. `run`은 TTY를 그대로 넘겨 사람이 외부 도구 질문에 답한다 |
| 자리표 | `{designHarnessName}` · `{implementHarnessName}` 은 03 어댑터가 하네스 id를 도구가 쓰는 이름으로 바꾼다 |

`add` 절차:

```text
add <id> [--dry-run] [--yes] [--allow-unverified]
 1 module.json 읽기, schema 검사
 2 conflicts ∩ modules ≠ ∅ → exit 3(MD-R8). requires.modules 미설치 → exit 3 + "먼저 add <m>"
 3 tools: versionCmd 실행. 없음 → MD-R3(TTY면 설치 명령을 보이고 묻는다 · --install-tools면 실행 · 에이전트 세션이면 출력 후 exit 5).
   설치 뒤 versionCmd 다시 실행. 범위 밖 → 경고, --allow-unverified 없으면 exit 4(MD-R4)
 3a 측정 전: 세션마다 실리는 양을 owner별로 잰다(§3.7)
 4 계획 출력(MD-R2). --dry-run이면 exit 0
 5 스냅숏: externalPaths에 맞는 기존 파일 sha256, 하네스 설정 파일 sha256 → .agents/state/module-snapshots/<id>-<시각>.json
 6 steps.add의 run 단계 실행(--yes가 아니면 단계마다 확인)
 7 registerExternal: 5의 스냅숏과 지금을 비교해 새로 생긴 externalPaths 파일 → lock op none, owner external:<도구>
   externalPaths 밖에 새로 생긴 파일은 등록하지 않고 목록만 출력("알 수 없는 파일 N개")
 8 applyKit: files 복사, hooks를 .agents/hooks.json에 병합 → 03이 하네스별로 생성, settings 키 병합
 9 setConfig: knots-sync.json modules[]에 id, config.set 적용
10 doctor 모듈 검사
11 측정 후: 3a와 비교해 늘어난 양을 출력한다. 4,096바이트를 넘으면 TTY에서 "계속 쓸지"를 한 번 더 묻고, 아니라고 하면 remove 절차로 되돌린다(MD-R16)
 6 이후 실패 → 8·9에서 바꾼 킷 몫만 스냅숏으로 되돌린다. 외부 도구가 만든 파일은 남기고 목록을 출력한다
```

`remove` 절차: lock에서 `layer: optional/<id>` 항목을 02의 uninstall 규칙(고치지 않은 파일은 지우고, 고친 파일은 남기고 경고, 병합 키는 킷 키만 뺀다)으로 처리한다. `owner: external:<도구>` 항목은 lock에서만 빼고 파일은 둔다. 외부 도구의 훅까지 끄려면 그 도구 명령을 사람이 실행한다(CLI가 명령을 출력한다).

### 3.2 aidlc 모듈

`add aidlc`:

1. `aidlc --version`, 범위 `versions.aidlc`(기본 `">=2.11 <3"`).
2. `aidlc config --harness {designHarnessName}`(설계 하네스 하나). `aidlc doctor` 결과를 함께 출력한다.
3. 생긴 파일 등록(§3.1 7단계). AI-DLC 문서상 산출물 자리 `aidlc/spaces/<space>/intents/<YYMMDD>-<label>/`과 하네스 폴더 안 AI-DLC 파일이 `externalPaths`다.
4. 킷 훅 병합: Stop 훅 `harness-aidlc-freshness`(AI-DLC 산출물이 `units.json`보다 새로우면 `sync aidlc` 안내).
5. `flow.design = "aidlc"`.

`remove aidlc`: 킷 훅·등록을 빼고 `flow.design = "kit"`. AI-DLC가 하네스 설정에 넣은 자기 훅은 `aidlc uninstall`(도구 명령)을 사람이 실행해야 빠진다고 출력한다. AI-DLC 산출물과 이미 만든 `intent.json`·`units.json`·SDD 이슈는 남는다(MD-R9). 남은 Intent는 `intent.json`을 그대로 읽어 대시보드에 보인다.

하네스 불일치(MD-R11): doctor가 lock의 `external:aidlc` 항목 경로로 AI-DLC가 깔린 하네스를 판정한다(`.claude/…`면 claude, `.kiro/…`면 kiro). `roles.design.harness`가 그 집합에 없으면 "설계 역할은 kiro인데 AI-DLC는 claude에만 있다"를 경고한다.

범위 검사: AI-DLC v2에는 구현 쪽 스테이지가 있다. 설계 단계까지만 돌리는 설정이 있으면 `add`가 그 설정을 쓴다. 없으면 어댑터는 설계 산출물만 읽고, doctor는 AI-DLC 구현 쪽 산출물이 생기면 "구현은 킷 SDD가 맡는다, 두 곳에서 구현하지 않는다"를 경고한다(02 #modes, P22 착수 전 확인).

어댑터 `npx knots-sync sync aidlc [--intent <AI-DLC 폴더>] [--check]`:

```text
1. 입력 = aidlc/spaces/<space>/intents/<폴더>/ 의 파일 목록(이름 정렬)과 내용 → inputSha256
2. 기존 intents/*/intent.json 중 aidlc.path가 같은 것을 찾는다. 있고 inputSha256이 같으면 변화 없음(exit 0)
3. 버전별 읽기 모듈 packages/cli/src/modules/aidlc/adapter-v2.ts가 알려진 파일만 읽는다
   알려진 파일이 없거나 필수 항목(Intent 제목, Unit 목록)이 없으면 exit 2와 빠진 항목. 추측해서 채우지 않는다
4. 대응: AI-DLC Intent → intent.json(08 §3.10), AI-DLC Unit → units[](sourceId = AI-DLC Unit 식별자),
   스토리 → stories, 의존 → dependsOn, 계약 성격 Unit → kind contract(AI-DLC 쪽 표시가 없으면 feature)
5. 다시 가져올 때: sourceId가 같은 Unit은 id · issue · planned를 지킨다. 새 Unit은 다음 U 번호, 사라진 Unit은 planned false
6. AI-DLC 승인 기록(사람 입력 확인 훅이 남긴 것)이 있으면 승인자·시각·문구를 `intents/<INT>/approvals.md`에 `source: aidlc`로 옮겨 그 게이트 승인으로 인정한다. 승인자가 기록에 없으면 옮기지 않고 사람이 킷 경로로 승인한다. AI-DLC가 승인자를 남기는지는 구현 전 확인한다
   옮기는 항목: {gate, at, by, phrase, record: <AI-DLC 기록 파일 경로>, sha256}, approvals.md의 `경로`는 `aidlc`
   AI-DLC 세션의 그 밖의 대화는 승인이 아니다(README §3)
7. --check: 쓰지 않고 차이만 출력, 차이가 있으면 exit 1
```

### 3.3 entire 모듈

`add entire`(§3.1 예시의 `steps`):

1. `entire --version`, 범위 `versions.entire`(기본 `">=0.13 <0.14"`). 0.x라 범위를 좁게 둔다.
2. `entire enable` → `entire agent add {implementHarnessName}`(MD-R12). 리뷰 하네스가 같은 하네스여도(예: 둘 다 claude) 하나만 추가하고, doctor가 "같은 폴더의 리뷰 세션 대화도 기록된다, 리뷰는 원격 diff만 읽는다"를 알린다.
3. `.entire/settings.json` 기본값(실제 키 이름은 §6): 커밋 연결 켬, 비밀값 마스킹 켬. 마스킹 패턴은 킷 비밀값 가드와 같은 목록을 쓴다: `*_KEY` · `*_SECRET` · `*_TOKEN` · `*_PASSWORD` 형태의 대입, `AKIA[0-9A-Z]{16}`, `-----BEGIN [A-Z ]*PRIVATE KEY-----`, JWT(`eyJ[\w-]+\.[\w-]+\.[\w-]+`), `.env` 파일 내용.
4. push 정책(D6 추천값, MD-R13):

| 원격 공개 여부(확인 방법) | 기본 정책 |
|---|---|
| private · internal(`gh repo view --json visibility` · `glab repo view -F json`의 `visibility`) | 같은 원격에 체크포인트 ref를 올린다 |
| public | 올리지 않는다. 별도 비공개 원격이 있으면 `entire configure --checkpoint-remote gitlab:<그룹>/<리포>`(v0.11.0+, gitlab.com만)를 안내한다 |
| 확인 실패(CLI 없음·인증 없음·자체 호스팅) | public으로 보고 올리지 않는다 |

5. 커밋 트레일러: 킷 커밋 메시지 검사(git 훅·가드)가 `Entire-Checkpoint:` 트레일러를 지우거나 거부하지 않는지 확인한다. 거부 규칙이 있으면 허용 목록에 더한다.
6. GitLab이면 doctor가 squash 커밋 메시지 템플릿을 본다. `%{all_commits}`가 없으면 "Settings → Merge requests → Squash commit message template을 `%{title} (%{reference})` 다음 줄에 `%{all_commits}`로 바꾼다"를 출력한다. 기본값은 커밋 본문을 버려 트레일러가 사라진다. 프로젝트 설정을 API로 읽지 못하면 안내만 한다.

대시보드 체크포인트(06 `GET /checkpoints`):

```text
list(issue):
  커밋 = git log --format=%H%x00%(trailers:key=Entire-Checkpoint,valueonly,separator=%x2C) origin/<base>..<이슈 브랜치>
  ref = git for-each-ref refs/entire/checkpoints/ --format=%(refname)%x00%(objectname)
  각 커밋의 체크포인트 id → ref가 있으면 local, 없으면 "원격에만 또는 없음"
explain(id): entire checkpoint explain <id>, 제한 10초, 출력은 텍스트로 이스케이프해 보여 준다(신뢰하지 않는 내용)
```

entire.io 웹 보기는 GitHub 전용이라 GitLab 리포는 이 목록과 explain만 쓴다. 내보내기에는 체크포인트 id만 넣고 설명 본문은 넣지 않는다(06 §3.12).

동시 세션 경고: 세션 등록(06 §3.9)에서 같은 `cwd`에 살아 있는 `implement` 세션이 둘이면 doctor·대시보드가 "기록이 섞인다, 둘째 세션은 worktree로"를 보여 준다.

### 3.4 jira-workflow 모듈(개편)

대응(05 #jira):

| AI-DLC | Jira | 리포 |
|---|---|---|
| Intent | 에픽 | `intents/<에픽 키>-<이름>/` |
| Unit | 작업 항목(contract·integration → 작업, feature → 스토리, 버그 → 버그). 이 키가 이슈 키 | `issues/<키>-<이름>/`, 브랜치, MR |
| Bolt | 하위 작업(선택, Bolt 2개 이하 Unit은 만들지 않는다) | `tasks.md`의 Phase |
| 승인 게이트 | 상태 전이 | `approvals.md` |

상태와 전이 조건:

| Jira 상태 | 킷 단계 | 이 상태로 옮기는 주체 | 조건 |
|---|---|---|---|
| 백로그 | Unit 목록에 있음 | 에이전트(이슈 생성 시) | `units.json`에 Unit, 사람 요청으로 생성(`mayCreate`) |
| 요구사항 작성 | requirements draft | 에이전트 | `/kns-specify --from-unit` 완료 |
| 요구사항 승인 대기 | requirements in-review | 에이전트 | 막는 질문 0 |
| 설계 | design draft · in-review | 사람(PO) | requirements 승인 — 승인 전이 |
| 구현 중 | tasks active | 사람(개발자) | design · tasks 승인 — 승인 전이 |
| 검증 | MR 열림 | 에이전트 | MR 생성 + affected 통과 |
| 완료 | tasks completed | 사람(QA·PO) | MR 승인 + 병합 + 완료 승인 — 승인 전이 |
| 배포됨 | 운영 기록 | 사람(운영) | 배포 승인 — 승인 전이 |

`.agents/issue-tracker.yml` v2 추가 키(기존 `statusIds`·`transitionIds`·`agentBoundary`는 유지):

```yaml
statusMap:                     # 킷 단계 → Jira 상태 ID
  backlog: "10000"
  requirements-draft: "10101"
  requirements-review: "10102"
  design: "10103"
  implementing: "10104"
  verifying: "10105"
  done: "10106"
  deployed: "10107"
approvalTransitions:           # 사람만 하는 전이(→ approvals.md 게이트)
  "10102>10103": requirements
  "10103>10104": design
  "10105>10106": done
  "10106>10107": deploy
issueTypes: { contract: Task, integration: Task, feature: Story, bug: Bug, bolt: Sub-task }
groupMap: { po: "jira-po", dev: "jira-dev", qa: "jira-qa", ops: "jira-ops" }   # knots-sync groups → Jira 그룹
sync:
  method: rest                 # rest | mcp | none
  mcpServer: atlassian         # method=mcp
  restTokenEnv: JIRA_API_TOKEN
  restUserEnv: JIRA_USER_EMAIL
```

`agentBoundary.maxStatus`는 `verifying`이다. `approvalTransitions`에 있는 전이는 에이전트가 하지 않는다(MD-R14).

동기화:

- 리포 → Jira(에이전트 세션의 `/kns-issue` 또는 `npx knots-sync sync jira`): 상태(에이전트 몫 전이만), 원격 링크(SDD 폴더 웹 URL · MR URL · 체크포인트 id). 설명은 고치지 않는다.
- Jira → 리포(승인 가져오기): `npx knots-sync sync jira --approvals` 또는 대시보드 버튼. REST만 쓴다(정해진 입력·출력이 필요하다).

```text
for 이슈 in Jira 키가 있는 이슈:
  GET /rest/api/3/issue/{key}/changelog  (페이지 끝까지)
  for 기록 in items where field == "status" and (from>to) ∈ approvalTransitions:
     기록 ID가 approvals.md에 이미 있으면 건너뜀(같은 기록은 한 번만)
     작성자 accountId → GET /rest/api/3/user?accountId= 의 emailAddress
     이메일이 없거나(공개 설정) approvers[게이트] 밖이면 경고만, 기록하지 않음
     덧붙임: "## <기록 시각> · <게이트> · approved" · 승인자 · 경로: jira · 근거: changelog <id>
     게이트 문서가 있으면 그 시점 문서 sha는 알 수 없으므로 "대상: <문서> · sha256: (jira)"로 남기고
     대시보드는 이 승인을 그 뒤 문서 변경과 비교하지 않는다(승인 시점 = Jira 기록 시각)
```

이 명령은 에이전트 세션에서도 돈다. 쓰는 내용이 사람 계정의 Jira 서버 기록을 옮긴 것이고, 기록 ID로 다시 검증할 수 있기 때문이다. CI는 `JIRA_API_TOKEN`이 있으면 `경로: jira` 기록을 changelog로 다시 대조한다.

Agentic engineering 템플릿으로 공간 만들기(2026-07-15 공개 템플릿):

1. 조직에 Rovo가 켜져 있는지 본다(꺼져 있으면 템플릿이 보이지 않는다).
2. 새 공간 → Agentic engineering 템플릿. 만들 때 상태를 고르는 화면에서 위 여덟 상태를 고르고, 없는 것은 더한다(기본 상태 목록은 문서에 없어 만들어 보고 대응한다).
3. 워크플로 조건: `approvalTransitions`의 네 전이에 "사용자가 그룹에 속함" 조건으로 `groupMap`의 그룹을 건다.
4. 그룹 `jira-po` · `jira-dev` · `jira-qa` · `jira-ops`를 만들고 `knots-sync.json`의 `groups`와 같은 사람을 넣는다.
5. 작업 유형을 `issueTypes`대로 둔다.
6. `kns:jira-setup` 스킬로 상태·전이 ID를 REST로 읽어 `issue-tracker.yml`을 채운다. TBD가 남으면 모듈은 읽기만 한다(지금 규칙 유지).
7. 작업 항목을 Claude Code · Cursor · Copilot에 배정해 생긴 MR도 같은 CI 템플릿(09 §3.7)과 승인 기록 검사를 거친다. 저장소 보호 규칙으로 CI 통과 없이 병합하지 못하게 한다.

Jira 없이(MD-R15): `issueKey.source = "kit"`, 대시보드 보드는 같은 여덟 상태 이름을 킷 단계에서 계산해 보여 준다(README §9). `sync jira`는 "jira-workflow 모듈이 꺼져 있다"를 출력하고 exit 0.

### 3.5 multi-harness 모듈

여러 리포(상위 리포 + 도메인 submodule)를 하네스 하나로 다룬다. 지금 있는 `tools/harness/{sync.py, sync_safety.py, gates.py}`를 CLI와 리포 스크립트로 옮긴다.

배포 단위 목록 `tools/harness/units.json`(knots 호환 자리 유지):

```json
{
  "schema": "knots-sync.deploy-units/v1",
  "units": [
    { "id": "knots-domain-app", "path": "domains/app", "title": "데스크톱 앱", "stack": "electron", "exclude": ["scripts/release/**"] },
    { "id": "knots-domain-api", "path": "domains/api", "title": "API", "stack": "jvm" }
  ]
}
```

- 이 파일의 "단위"는 배포 대상 폴더다. Intent의 Unit(08 `units.json`)과 다른 것이다. 이름이 같아 헷갈리므로 `schema` 값으로 구별하고, 문서에서는 "배포 단위"라고 쓴다.
- `id` 정규식 `^[a-z][a-z0-9-]*$`, `path`는 리포 안 상대 경로(지금 `load_units` 규칙 유지).

`npx knots-sync sync units [--check] [--unit <id>] [--adopt]`:

- 원본 `tools/harness/shared/` → 단위마다 파일 복사(링크 아님, 단위가 혼자 동작해야 한다), 토큰(`UNIT_ID` · `UNIT_TITLE` · `UNIT_PATH` · `UNIT_STACK`) 치환.
- 단위마다 `<단위>/.agents/knots-sync.lock`에 항목을 쓴다(`owner: kit`, `layer: unit:<id>`). 단위에서 사람이 고친 파일은 `.new`로 옆에 둔다(02 update 규칙).
- `--check`: 쓰지 않고 차이만, 차이가 있으면 exit 1. 출력 형식은 `sync.py --check`와 같은 줄 형식을 유지한다(MD-R16 비교를 위해).
- 동시 실행은 지금의 `deployment_lock`과 같은 잠금 파일로 막는다.

리포 간 조율 규칙(`.agents/rules/cross-repo.md`, hdr `cross-repo-orchestration.md`를 정리):

```text
1 계약 확정   상위 리포에 계약 Unit(08, kind contract) 이슈. design §6 승인 = 계약 승인
2 병렬 구현   도메인 리포마다 구현 세션 1개. 리포가 다르면 worktree 없이 각자 폴더(05)
3 경계 검증   상위 리포: 계약 시험 + check_submodules.py + 도메인 간 경로 가드
4 순서 커밋   제공 도메인 리포 커밋·push → 소비 도메인 리포 → 상위 리포 포인터 커밋
5 기록        상위 specs-index.md의 그 이슈 행에 도메인별 submodule SHA를 적는다
```

상위 SDD 목록 열(템플릿 `specs-index.md`에 더한다):

```markdown
| 이슈 | 단계 | domains/app | domains/api | 병합 |
|---|---|---|---|---|
| KNOTS-17 desktop-parity | done | 4c1d9e0 | a17f2b3 | 2026-11-24 |
```

`scripts/harness/check_submodules.py`(knots `check-submodules.sh`를 옮긴다):

| 검사 | 실패 조건 |
|---|---|
| 초기화 | `git submodule status`가 `-`(초기화 안 됨) |
| 포인터 | submodule HEAD ≠ 상위 리포 gitlink SHA이고, 그 커밋이 원격에 없다 |
| 작업 상태 | submodule에 커밋 안 된 변경이 있는데 상위 리포에서 커밋하려 한다 |
| 브랜치 | 상위 브랜치의 이슈 키와 submodule 브랜치의 이슈 키가 다르다(같은 기능이면 같은 이름, 04 #multirepo) |

`affected` 레벨에서 상위 리포가 바뀐 도메인 submodule에만 이것을 부른다(01의 "바뀐 도메인만").

도메인 간 경로 가드 `scripts/guards/no-cross-domain-paths.sh`: 도메인 리포 파일이 다른 도메인 경로(`../<다른 도메인>/`, 상위 리포 기준 `domains/<다른 도메인>/`, 다른 도메인 패키지 이름의 import)를 참조하면 위반이다. 예외는 `.agents/guards/cross-domain-allow.txt`(경로·사유). 지금 가드 정책대로 경고(exit 0)로 시작하고 위반이 0건이 되면 강제(exit 1)로 올린다.

Unit과의 연결: Intent `units.json`의 Unit `repo` 값이 배포 단위 `id`다. `/kns-specify --from-unit`은 `repo`가 있으면 그 도메인 리포의 이슈 폴더에 SDD를 만들고, 계약 Unit은 상위 리포에 둔다.


### 3.6 접수 출처: jira-workflow · notion 모듈

요구사항을 외부 도구에서 가져오는 방식은 출처와 상관없이 같다.

| 단계 | 하는 일 |
|---|---|
| 가져오기 | 제목·본문·첨부·속성을 읽어 `intents/<INT>-<이름>/intake.md`와 `attachments/`에 쓴다(08 §3.11과 같은 형식·제한·비밀값 검사 · 신뢰하지 않는 입력 표시와 제어 문자 제거) |
| 출처 기록 | `intake.md` 머리에 `source: { type, ref, url, importedAt, version }`를 남긴다. 다시 가져오면 바뀐 부분을 diff로 보여 주고 사람이 반영 여부를 고른다 |
| 원본 기준 | 가져온 뒤의 원본은 리포다. 외부 문서가 바뀌어도 자동으로 덮지 않는다 |
| 되쓰기(선택) | `writeBack: true`면 Intent 키·현재 게이트 상태·SDD 링크를 외부 문서의 속성에 쓴다. 기본은 꺼짐 |

**Jira**(`jira-workflow`): 에픽의 설명·첨부·하위 작업 항목을 가져온다. Intent 키로 에픽 키를 쓸 수 있다. 연결은 Atlassian Rovo MCP(세션) 또는 REST API(콘솔, 토큰은 환경 변수)다. 상태 대응과 승인 전이 규칙은 §3.4와 같다.

**Notion**(`notion`): 페이지 한 장 또는 "요구사항" 데이터베이스의 항목을 가져온다.
- 블록은 Markdown으로 바꾼다. 하위 페이지는 `--depth`만큼 따라간다(기본 1). 파일·이미지 블록은 첨부로 내려받는다. 표·데이터베이스 속성은 `intake.md`의 표로 옮긴다.
- 데이터베이스 속성 대응은 설정으로 정한다.
  ```jsonc
  "notion": {
    "database": "<데이터베이스 ID>",
    "properties": { "title": "제목", "kind": "종류", "status": "상태", "key": "하네스 키" },
    "kindMap": { "신규 기능": "feature", "변경": "change", "버그": "bug", "신규 프로젝트": "product" },
    "writeBack": false
  }
  ```
- 연결: 세션에서는 Notion MCP 서버(Notion 공식 MCP 또는 claude.ai Notion 커넥터)를 쓴다. 콘솔에서는 Notion API 통합 토큰을 환경 변수 `NOTION_TOKEN`으로 받는다. 토큰은 리포·`knots-sync.json`에 쓰지 않는다.
- `status` 대응(`writeBack: true`일 때): Intent 접수 → "접수됨", Unit 분해 승인 → "설계 중", 모든 Unit 완료 → "완료", 배포 승인 → "배포됨". Notion에 없는 상태 이름은 설정에서 고른다.

출처가 없어도 접수는 된다. 두 모듈은 기본 꺼짐이다.

### 3.7 모듈이 세션에 덧붙이는 양

README 원칙 10의 상한(세션 시작 출력 2,560바이트 등)은 킷 몫이다. 외부 도구 모듈은 켜는 순간 자기 훅 · 규칙 · 스킬을 하네스 설정에 넣고, 그것이 세션마다 실린다(예: knots에는 AI-DLC 훅 17개 · 파일 362개가 깔려 있다). 그래서 모듈을 켜는 것은 사람이 고르는 일로 두고, 얼마나 붙는지를 숫자로 보인다. 측정은 스크립트로만 하고 모델을 부르지 않는다.

| 재는 것 | 방법 | 언제 |
|---|---|---|
| 세션마다 실리는 파일 | lock의 `owner`별로 합한다: 진입 파일과 그 `@` 가져오기, `paths` 없는 규칙, 하네스가 세션 시작에 싣는 스킬 설명(`description`) | `add` 전후 · `doctor` · S13 |
| 훅 수 | 하네스 설정의 이벤트별(SessionStart · UserPromptSubmit · PreToolUse · PostToolUse · Stop) 훅 수를 owner별로 센다 | 같다 |
| 훅이 실제로 붙인 글 | 킷 훅은 `hook-output.jsonl`(06 §3.18)에서, 외부 훅은 대화 기록 읽기를 켠 경우 세션 기록에서 owner별로 센다(기록 형식 §6). 외부 도구의 훅을 킷이 대신 실행해 재지 않는다 | S13 |

`add` 출력 예(숫자는 예시):

```text
add aidlc — 세션마다 실리는 양(바이트)
  kit              11,240 → 11,240
  external:aidlc        0 →  9,812   규칙 3 · 스킬 설명 12
  훅  SessionStart 1 → 3 · UserPromptSubmit 1 → 4 · PreToolUse 4 → 11
늘어남 9,812바이트(추정 약 3,300토큰 / 세션). 이 양은 킷 상한 밖이고 켠 모듈 몫이다. 계속할까요? [y/N]
```

- 끄면(`remove aidlc`) 킷 몫은 빠지지만 그 도구가 하네스 설정에 넣은 자기 훅은 그 도구의 명령으로 빼야 한다(§3.2). `doctor`가 남은 외부 훅 수를 보인다.
- 릴리스 e2e의 "모두 켬" 구성(11 MG-R7)은 모듈별 측정값을 릴리스 노트에 적는다.

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| AI-DLC·Entire를 킷 패키지에 넣어 재배포 | 각 도구의 업데이트를 킷 릴리스가 따라가야 하고, 원본을 고치게 된다(원칙 4). 대신 그 도구의 공식 설치기를 사람이 확인한 뒤 부른다(MD-R3) |
| 도구가 없으면 묻지 않고 설치 | 사람이 모르는 사이 전역 프로그램이 깔린다. 에이전트가 설치를 시작할 수도 있다. 사람 터미널에서 명령을 보이고 묻는다 |
| 외부 훅을 킷이 표본 입력으로 실행해 출력 크기 재기 | 외부 도구 훅의 부작용(파일 쓰기 · 네트워크)을 킷이 일으킨다. 세션 기록과 정적 합계로 잰다 |
| 외부 도구의 훅·설정 파일을 킷이 고쳐 원하는 동작으로 | 다음 도구 업데이트에서 덮이거나 충돌한다. 킷 층 규칙·훅과 도구가 연 확장 지점만 쓴다 |
| `add` 전후 차이에서 생긴 파일을 모두 외부 소유로 등록 | 같은 시각에 사람이 만든 파일까지 외부 소유가 된다. `externalPaths`에 맞는 것만 등록한다 |
| 모든 하네스에 Entire 켜기 | 같은 폴더의 동시 세션 기록이 섞인다. 구현 하네스 하나만 켠다 |
| Jira를 문서 원본으로(설명란에 requirements) | Jira 없는 리포가 있고, 에이전트가 설명을 고치지 않는 규칙과 충돌한다 |
| 승인 가져오기를 Rovo MCP로 | MCP 도구 이름·출력은 서버가 정하고 CLI에서 정해진 형식으로 부르기 어렵다. 승인 기록은 REST changelog로만 가져온다 |
| 배포 단위 파일 이름을 `deploy-units.json`으로 바꾼다 | knots의 `sync.py`·훅이 지금 경로를 쓴다. `schema` 값으로 구별하고 경로는 v3에서 다시 본다 |
| 상위 리포까지 worktree로 | git 문서가 submodule 있는 리포의 worktree를 권하지 않는다(02 #worktree) |

## 5. 완료 기준

1. 임시 리포에 킷 → AI-DLC → Entire 순서와 그 역순으로 설치한다. 각 순서에서 킷 `update`·`uninstall` 뒤 AI-DLC·Entire 파일과 그 훅 항목의 sha256이 그대로다(MD-R7).
2. `remove aidlc` · `remove entire` 뒤 두 구성 시험(11 §3.4)의 "킷만" 쪽이 통과하고, 지워진 AI-DLC·Entire 산출물 파일은 0개다.
3. 같은 요구사항을 킷 설계와 AI-DLC 설계로 각각 돌리면 `units.json` 형식이 같고(`source`·`sourceId` 제외 키 집합 동일), `/kns-specify --from-unit` 결과 requirements 절 구성이 같다.
4. 어댑터에 같은 입력을 두 번 주면 두 번째는 쓰기 0건이다. Unit 하나를 AI-DLC 쪽에서 지운 뒤 다시 가져오면 그 Unit이 `planned: false`가 되고 다른 Unit의 `issue`가 그대로다.
5. 체크포인트가 구현 하네스 세션 커밋에만 생긴다. Codex 리뷰 세션에서 만든 커밋의 `Entire-Checkpoint` 트레일러 0건.
6. 공개 원격 fixture(가짜 `gh` 응답 `PUBLIC`)와 확인 실패 fixture에서 push 정책이 "올리지 않음"이다.
7. jira fixture(REST 모의 서버): 사람 계정의 승인 전이 3건이 `approvals.md`에 3건 들어가고, 같은 명령을 다시 돌리면 0건 더해진다. approvers 밖 사람의 전이는 기록되지 않고 경고가 나온다. 에이전트 세션에서 `approvalTransitions` 전이를 요청하면 거부된다.
8. knots 사본에서 `knots-sync sync units --check`와 `sync.py --check`의 출력이 단위 23곳 모두 같다.
9. hdr 형태 fixture(상위 + 도메인 2)에서 계약 → 병렬 → 경계 검증 → 순서 커밋으로 기능 하나를 끝내고, `specs-index.md` SHA 열이 두 도메인 커밋과 같다. 순서를 어긴 커밋(상위 포인터 먼저)을 `check_submodules.py`가 잡는다.
10. 설치: `entire`가 없는 fixture(가짜 PATH)에서 TTY `add entire`가 설치 명령을 보이고 묻는다. "아니오"면 exit 5이고 실행 0건, `--install-tools`면 가짜 설치기가 한 번 불린다. `CLAUDECODE=1`이면 `--install-tools`가 있어도 실행 0건 · exit 5. `sudo`로 시작하는 설치 명령은 실행하지 않는다.
11. 측정: 규칙 2개 · 스킬 5개 · SessionStart 훅 2개를 넣는 가짜 모듈 fixture에서 `add` 출력의 `external:<도구>` 증가량이 그 파일들의 바이트 합과 같고, 훅 수가 2 늘어난다.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| AI-DLC(aidlc-workflows) CLI의 공식 설치 · 업데이트 명령과 지원 OS, Entire의 Linux · Windows 설치 명령 | 각 도구 공식 문서. `module.json`의 `install` · `update`에 OS별로 적고, 없는 OS는 `null`(설치 명령 출력만) |
| Claude Code 세션 기록에서 훅이 붙인 글(SessionStart · UserPromptSubmit 출력)이 어떤 항목으로 남는지 | 훅 하나를 둔 시험 세션의 기록 파일을 본다. 못 찾으면 §3.7 세 번째 줄은 "자료 없음" |
| AI-DLC v2 Intent·Unit 산출물의 파일 이름·형식, 스토리·의존이 구조로 들어 있는지 | P22 착수 전 `aidlc` 최신판으로 예시 Intent 하나를 돌려 산출물을 docs/analysis/에 버전·날짜와 남긴다 |
| `aidlc config --harness`가 받는 하네스 이름(claude-code 등)과 설계 단계까지만 돌리는 설정 | `aidlc config --help`·문서 확인 |
| AI-DLC 사람 입력 확인 훅이 승인자 신원(이메일)을 기록하는지 | 위 시험 실행에서 기록 파일을 본다. 없으면 옮기지 않고(§3.2 6), 그 게이트는 사람이 관리 페이지 · `knots-sync approve` · Jira로 승인한다 |
| `.entire/settings.json`의 실제 키 이름(커밋 연결·마스킹·push) | `entire` 0.13 문서와 `entire configure --help` |
| 체크포인트 ref push를 끄는 방법(설정 키인지 refspec인지) | 시험 리포에서 push 뒤 원격 ref 목록을 본다 |
| `entire agent add`가 받는 하네스 이름 목록 | `entire agent add --help` |
| GitLab 프로젝트 API의 squash 템플릿 필드 이름 | `glab api projects/:id` 응답 확인 |
| Jira changelog 작성자 이메일이 공개 설정에 따라 비는 경우의 비율 | 현장 Jira에서 표본 20건 확인. 비면 `groupMap` 그룹 소속(accountId)으로 판정하는 대안을 정한다 |
| Agentic engineering 템플릿의 기본 상태 목록 | 시험 공간을 만들어 본다(문서에 없다) |
| Rovo MCP 서버의 상태 전이·링크 도구 이름 | 세션에서 서버 도구 목록을 기록한다 |
