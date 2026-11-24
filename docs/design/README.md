# harness-starter-kit v2 설계서

이 묶음은 [harness-next](../harness-next/index.html)(방향·계획)를 구현하기 위한 설계서다. 구현하는 사람과 에이전트가 이 문서만 보고 만들 수 있도록, 설정 형식·파일 위치·명령·알고리즘·완료 기준을 적는다.

- 상태: 설계 초안, 구현 전. 기준일 2026-11-23.
- 대상: 킷을 고치는 개발자와 그 작업을 맡는 에이전트.
- 방향과 이유는 harness-next에 있고, 여기서는 반복하지 않는다. 결정 번호(D1~D10)는 [harness-next 02장 결정 목록](../harness-next/02-direction.html#decisions)을 가리킨다.

## 문서 목록

| 파일 | 다루는 것 | 단계 |
|---|---|---|
| [system/index.html](system/index.html) | 전체 시스템 설계서: 컨텍스트 · 구성요소 · 층과 배치 · 데이터와 게이트 · 주요 흐름 · 신뢰 경계 · 설치·배포 · 토큰 예산과 품질 목표 · 결정 · 문서 지도 | 전 단계 |
| [01-v1.1-verify-and-issues.md](01-v1.1-verify-and-issues.md) | 검증 범위(affected·full 차단), 이슈 단위 SDD, 키 생성, 옮기기 | v1.1 |
| [02-cli-engine.md](02-cli-engine.md) | npx CLI, 명령, `layout.json`, lock v2, update·doctor·repair·uninstall 알고리즘 | P17 |
| [03-projection-and-hooks.md](03-projection-and-hooks.md) | 하네스 어댑터, 배치 방식, `hooks.json`, 역할 생성, 배치 검사, 훅의 worktree 대응 | P18 |
| [04-extension-layers.md](04-extension-layers.md) | 킷·회사 팩·프로젝트·개인 층, 우선순위, 팩 형식, 게이트 하한 | P18 |
| [05-worktree.md](05-worktree.md) | `wt` 명령, 자리, IDE 연결, 용량, submodule | P19 |
| [06-dashboard.md](06-dashboard.md) | 관리 페이지 서버·API·데이터·보안·저장·승인·세션 요청 | P20 |
| [07-skills-inventory.md](07-skills-inventory.md) | 스킬 수집, 스킬 지도, 단계 추정 | P20 |
| [08-design-stage.md](08-design-stage.md) | `/kns-intent`, Intent·Unit 형식, 기획물, 역할·승인자, 기존 코드 역공학(`codebase` 게이트), 몹 정리, 크기·위험 프로필, 도메인 설계 | P21 |
| [09-verification-quality.md](09-verification-quality.md) | `/kns-review`, 정적 분석 파이프라인, SARIF, 품질 게이트, 승인 강제 | P23 |
| [10-modules.md](10-modules.md) | `aidlc` · `entire` · `jira-workflow` · `notion` · `multi-harness` 모듈, 요구사항 접수 출처 | P21·P22·P24 |
| [11-migration-and-release.md](11-migration-and-release.md) | knots·hdr 이전, 두 구성 시험, 릴리스 규칙 | 전 단계 |
| [12-model-routing.md](12-model-routing.md) | 위임 작업의 모델·effort 배정(주 세션은 바꾸지 않음), 토큰 절감, 역할별 사용량 보고 | P18(역할 파일 생성)·P20(보고) |
| [13-aidlc-coverage.md](13-aidlc-coverage.md) | AI-DLC 학습 가이드 대응표(개념 109 · 스테이지 33), 충족·부분·누락·의도적 제외 판정, 보완 목록 | 전 단계(구현 전 점검) |
| [14-deploy-and-ops.md](14-deploy-and-ops.md) | design §13 배포·롤백, 배포 기록, `deploy` 게이트, 검증 환경 자동 배포, 운영 기록, 장애·다음 Intent 경로, 전달 지표·기준선, 규칙 후보, S10 데이터 | P24 |
| [screens/index.html](screens/index.html) | 관리 페이지 화면기획서(디자인 시안 포함) | P20 |

## 공통 계약

아래는 모든 설계 문서가 따르는 형식이다. 문서끼리 다르면 이 절이 이긴다.

### 1. 원칙

1. 원본은 `.agents/` 한 곳. 하네스 폴더의 파일은 원본에서 만든 실제 파일(복사 · 생성 · 병합)이다. 심볼릭 링크와 "원본을 읽어라" 포인터 파일은 쓰지 않는다. 복사본은 동기화 훅 · 보호 훅 · 배치 검사로 원본과 맞춘다(03 §3.12).
2. 완료 판정은 `scripts/verify.sh` 한 곳. 다른 것은 부르기만 한다.
3. 사람이 고친 파일과 다른 도구의 파일은 덮지 않는다.
4. 외부 도구(AI-DLC·Entire)의 원본 파일은 고치지 않는다.
5. AI-DLC·Entire 없이도 전 흐름이 돈다. 둘은 기본 꺼짐인 선택 모듈이다.
6. AI-DLC 원칙 다섯 가지(세 단계, 대화 방향 역전, Unit·Bolt, 단계별 승인 게이트, 문서로 남는 맥락)는 모듈과 상관없이 지킨다.
7. 프로젝트 밖에 쓰는 파일은 전역 등록부 `~/.config/knots-sync/projects.json`(경로 · 이름 · 더한 날) 하나뿐이다. 예외는 사람이 사람 터미널에서 확인한 외부 도구(AI-DLC · Entire) 설치 · 업데이트로, 쓰는 것은 그 도구의 공식 설치기이고 킷은 부르기만 한다(10 MD-R3 · MD-R15). `init` · `projects add|remove`만 고치고, 같은 폴더의 `config.json`은 사람이 쓰는 이 컴퓨터 설정이라 킷은 읽기만 한다(06 §3.17). 사용자 폴더는 읽기만 한다: 스킬 목록, 사람이 `config.json`에서 켰을 때의 대화 기록 읽기(토큰 사용량 · 프롬프트 기록, 06 §3.18).
8. 사람이 연 구현·설계·리뷰 세션의 모델과 effort는 바꾸지 않는다. 모델·effort 조절은 위임 작업에만 한다(12). 킷 스킬은 `context: fork`가 아니면 `model`·`effort`를 두지 않는다. Claude 스킬의 모델·effort는 그 턴 동안 주 세션을 바꾸기 때문이다.
9. 화면 없이도 모든 기능이 돈다. 관리 페이지는 CLI와 같은 핵심 모듈(`packages/cli/src/core/`)을 부르는 화면일 뿐이고, 화면에만 있는 기능은 두지 않는다(06 §3.15).
10. 킷을 도입해도 토큰 소모량이 늘지 않는다. 킷 자체(CLI · 관리 페이지 · 훅 · 스크립트)는 모델을 부르지 않는다. 모델을 쓰는 일은 사람이 시킨 작업 안에서만 돌고 자동으로 돌지 않는다. 킷이 세션에 덧붙이는 것(세션 시작 훅 출력 합계 ≤ 2,560바이트로 v1.0.8 실측 이하(12 §3.8), 상시 진입 파일 ≤ 24KB, 검증·분석은 요약만, 세션 요청 글은 한 줄 + 경로)에 상한을 두고, 기능마다 추가 토큰 추정치와 전후 측정을 완료 기준에 넣는다(제안값).

### 2. 용어

| 용어 | 뜻 |
|---|---|
| Intent | 요구사항 하나를 정리한 설계 단위. Jira 에픽에 대응한다 |
| Unit | 독립적으로 만들고 배포할 수 있는 작업 묶음. 이슈 하나 = SDD 폴더 하나 = 브랜치·MR 하나. Jira 작업 항목에 대응한다 |
| Bolt | Unit 안의 작업 묶음(수 시간~수 일). tasks의 Phase. Jira 하위 작업에 대응한다 |
| 이슈 키 | Unit의 식별자. Jira 키(`HDRV3D-12`) 또는 킷이 만든 키(`KNOTS-17`) |
| Unit 목록 · 단위 등록표 | 다른 파일이다. `intents/<INT>/units.json`(schema `knots-sync.units/v1`, 08 §3.5)은 Intent의 Unit 목록이고, `tools/harness/units.json`(schema `knots-sync.deploy-units/v1`, 10 §3.5)은 multi-harness 모듈의 배포 단위(배포 대상 폴더) 등록표다 |
| 배포 묶음 | 한 번에 내보내는 병합된 이슈의 모음. 배포 기록 `ops/deploys/<날짜>-<키>.md` 하나가 묶음 하나다(14 §3.3). 배포 단위와 다르다 |
| 프로필 · 위험 | 프로필(`trivial` · `bug` · `unit` · `feature` · `product` · `refactor`)은 만드는 산출물과 문서 분량을, 위험(`low` · `medium` · `high`)은 승인 깊이를 정한다(08 §3.15) |
| 게이트 | 사람이 승인해야 다음 단계로 가는 자리 |
| 하네스 | Claude Code · Codex · Cursor · Kiro 같은 에이전트 실행 도구 |
| 쓰는 세션 · 읽는 세션 | 파일을 쓰는 세션(설계 문서·구현·반영)과 읽기만 하는 세션(리뷰·스캔) |

### 3. 흐름과 게이트

```text
요구사항 → (기존 코드면) 역공학 → [현재 상태(codebase) 승인] → [Intent·Unit 승인] → 기획물 → [기획물 승인]
→ requirements → [requirements 승인] → design → [design 승인] → tasks → [tasks 계획 승인] → 구현(Bolt마다 changed 검증)
→ MR(base 판 affected 검증·리뷰·정적 분석) → [MR 승인] → 병합 → [완료 승인] → 반영(문서)
→ (선택) 검증 환경 자동 배포 → 배포 기록 → [배포 승인] → 운영 배포 → 운영 기록 → 다음 Intent · bug 이슈 · 규칙 후보
```

- 게이트 하한(줄일 수 없는 것): requirements · design · MR · 완료.
- 프로필과 위험(08 §3.15): 프로필은 산출물과 문서 분량을, 위험은 승인 깊이를 바꾼다. 하한 네 게이트는 이슈가 있는 모든 프로필에 있고 위험이 낮아도 빠지지 않는다. `high`는 design · MR · 배포에 서로 다른 승인자 2명이 필요하다.
- 사람 식별: 로그인·회원 정보는 없다. 그 컴퓨터의 git `user.name`·`user.email`이 신원이다. 관리 페이지는 폴더 하나를 그 컴퓨터에서만 연다.
- 승인 경로: 승인은 넷으로만 생긴다. 사람 터미널의 `npx knots-sync approve`(Node 없는 리포는 `scripts/harness/approve.py`), 관리 페이지 승인 버튼, Jira에서 사람이 한 승인 전이, AI-DLC를 켰을 때 AI-DLC가 사람 입력 확인 훅으로 받은 승인(10 §3.2, 결정 2026-11-23). 그 밖에 채팅에서 한 말은 어떤 말이든 승인이 아니다. 승인할 때 사람이 넣은 문구는 `approvals.md`의 그 기록에 함께 남는다(09 §3.8).
- 승인 기록: 이슈 폴더의 `approvals.md`. codebase·intent·plans 게이트는 `intents/<INT>/approvals.md`. 배포 승인은 포함 이슈마다 덧붙인다(14 §3.4). 에이전트는 승인을 쓰지 못한다.

### 4. 파일 배치

```text
<repo>/
├── AGENTS.md · CLAUDE.md(= @AGENTS.md + Claude 전용 절)
├── .agents/
│   ├── knots-sync.json · knots-sync.lock     설정 · 설치 기록(둘 다 커밋)
│   ├── rules/ · skills/ · roles/ · hooks.json  원본(킷 · 팩 · 프로젝트)
│   ├── skill-map.json · verify-checks.json · deploy.json
│   ├── analyzers.json · model-policy.json · issue-tracker.yml  정적 분석(09) · 모델 배분(12) · 이슈 트래커(10)
│   ├── quality-gate.json · quality-baseline.json
│   ├── local/                                  개인 층(커밋 안 함)
│   ├── docs/
│   │   ├── intents/<INT-키>-<이름>/
│   │   │   ├── intake.md · attachments/          접수 원문과 첨부(원본 + 텍스트 추출본)
│   │   │   ├── current-state.md                기존 코드일 때 현재 동작·바뀌면 안 되는 동작(08 §3.13)
│   │   │   ├── intent.md                       킷 설계 원본(flow.design = kit)
│   │   │   ├── intent.json                     AI-DLC 경로 링크(flow.design = aidlc)
│   │   │   ├── units.json                      Unit 목록과 의존 순서(두 경우 같은 형식)
│   │   │   ├── questions.md                    질문 파일
│   │   │   ├── approvals.md                    intent·plans 게이트 승인 기록
│   │   │   └── plans/                          requirements-doc.md · screens/ · design-plan.md · backlog.md
│   │   ├── issues/<이슈키>-<이름>/
│   │   │   ├── requirements.md · design.md · tasks.md
│   │   │   └── review.md · approvals.md · handoff-<날짜>.md
│   │   ├── codebase/<영역>.md                  영역별 코드 모델(역공학, 08 §3.13)
│   │   ├── decisions/                          ADR
│   │   ├── ops/
│   │   │   ├── deploys/<날짜>-<키>.md          배포 기록(14 §3.3)
│   │   │   ├── records/<날짜>-<주제>.md        운영 기록(14 §3.7)
│   │   │   └── metrics-baseline.json           전달 지표 기준선(14 §3.10)
│   │   ├── rule-candidates/RC-<n>-<이름>.md    규칙 후보(14 §3.11)
│   │   └── _spec-templates/
│   ├── state/                                  커밋 안 함: verify-last.json · sessions/ · dispatch-queue/ · ci-base/ · usage/(12)
│   └── reports/                                커밋 안 함: *.sarif · review/ · metrics/ · deploy/
├── scripts/verify.sh · scripts/harness/*.py · scripts/hooks/*
└── docs/features/                              기능 문서
```

worktree 자리는 리포 밖: `../<리포>.worktrees/<이슈키>-<이름>/`, submodule 리포는 `../<리포>.worktrees/<도메인>/<이슈키>-<이름>/`.

### 5. `.agents/knots-sync.json`

```jsonc
{
  "schema": "knots-sync/v2",
  "kit": { "version": "2.0.0" },
  "project": { "name": "knots-platform", "slug": "knots" },
  "stack": "jvm", "arch": "hexagonal", "domain": "backend",
  "agents": ["claude", "codex", "kiro"],
  "modules": ["jira-workflow"],                // 켠 선택 모듈
  "flow": {
    "design": "kit",                           // kit | aidlc
    "record": "none",                          // none | entire
    "gates": ["codebase", "intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"]
  },
  "risk": {                                    // 08 §3.15. 프로젝트는 엄하게만 바꾼다
    "highPaths": ["**/auth/**", "**/payment/**", "db/migration/**"],
    "highApprovals": 2
  },
  "codebase": { "staleLines": 200, "staleFiles": 3 },   // 08 §3.13 오래됨 기준
  "roles": {                                   // 실행 배치(D7 기본값)
    "design":    { "harness": "claude" },
    "implement": { "harness": "claude" },
    "review":    { "harness": "codex" },
    "docs":      { "harness": "kiro" }
  },
  "approvers": {                               // 선택. 게이트별 승인자(git user.email 또는 그룹 이름). 없으면 이 리포의 git 사용자 누구나 승인
    "codebase": ["dev"], "intent": ["po"], "plans": ["po"], "requirements": ["po"],
    "design": ["dev"], "tasks": ["dev"], "mr": ["dev"], "done": ["qa", "po"], "deploy": ["ops"]
  },
  "groups": { "po": ["..."], "dev": ["..."], "qa": ["..."], "ops": ["..."] },
  "issueKey": { "source": "jira", "prefix": "KNOTS" },   // jira | kit
  "git": {
    "base": "develop",                         // D4
    "worktreeRoot": "../{repo}.worktrees",
    "maxPerRepo": 3,
    "ide": "code"                              // code | idea
  },
  "intake": { "storeBinaries": true },         // 접수 첨부 원본을 커밋할지
  "notion": { "database": "…", "writeBack": false },  // notion 모듈을 켰을 때(10 §3.6)
  "packs": [],                                 // ["git:gitlab.com/<org>/harness-pack#v1.2.0"]
  "verify": { "fullOnlyInCI": true },
  "versions": { "aidlc": ">=2.11 <3", "entire": ">=0.13 <0.14" },
  "tokens": { "PROJECT_NAME": "knots-platform", "PACKAGE_NS": "com.drimaes.knots" },  // update가 다시 치환할 값
  "installedAt": "2026-11-23", "updatedAt": "2026-11-23"
}
```

- 개인 층(`.agents/local/knots-sync.local.json`)은 `roles`·`git.ide`만 덮을 수 있다. `flow.gates`·`approvers`·`verify`·`risk`·`codebase`는 무시하고 `doctor`가 경고한다.

### 6. `.agents/knots-sync.lock` (v2)

```jsonc
{
  "schema": "knots-sync.lock/v2",
  "kit": { "version": "2.0.0", "source": "github:<owner>/harness-starter-kit#v2.0.0" },
  "packs": [{ "name": "acme", "version": "1.2.0", "source": "..." }],
  "entries": [
    { "path": ".agents/rules/git-workflow.md", "op": "copy", "owner": "kit", "sha256": "…", "layer": "common" },
    { "path": ".claude/skills/kns-plan", "op": "mirror", "owner": "kit", "from": ".agents/skills/kns-plan", "fromSha256": "…", "sha256": "…" },
    { "path": ".kiro/steering/git-workflow.md", "op": "render", "owner": "kit",
      "from": ".agents/rules/git-workflow.md", "fromSha256": "…", "sha256": "…" },
    { "path": ".claude/settings.json", "op": "merge", "owner": "kit", "keys": ["hooks.Stop:harness-verify-gate"] },
    { "path": ".agents/rules/acme-security.md", "op": "copy", "owner": "pack:acme", "sha256": "…" },
    { "path": ".claude/agents/aidlc-planner.md", "op": "none", "owner": "external:aidlc" }
  ]
}
```

- `op`: `copy`(킷 템플릿 설치) · `mirror`(리포 안 원본의 실제 파일 복사, 링크 없음) · `render` · `merge` · `none`(기록만).
- `owner`: `kit` · `user` · `pack:<이름>` · `external:<도구>`.
- v1 lock(TSV: `sha<TAB>layer<TAB>harness<TAB>path`, 세 번째 칸은 `core`·`claude`·`codex`·`cursor`·`kiro`)은 읽어서 v2로 바꾼다.
- 모듈 정의 파일(`module.json`)과 팩 정의 파일(`pack.json`)은 설치 대상이 아니다. 모듈에서 온 항목은 `layer: optional/<id>`로 적는다.

### 7. 명령 이름

| 묶음 | 명령 |
|---|---|
| CLI(Node, `npx knots-sync`) | `init [--install-tools]` · `plan` · `add` · `remove` · `update [--tools]` · `outdated` · `doctor` · `repair` · `uninstall` · `list` · `dashboard [--all\|--root\|--workspace]` · `skills` · `status [--ops\|--all\|--flow <INT>]` · `projects list\|add\|remove` · `intake` · `approve` · `answer` · `mob start\|next\|end` · `review decide` · `sessions` · `dispatch [list\|drop]` · `units propose\|discard` · `flow gates` · `usage` · `history` · `quality` · `deploy plan\|check\|record` · `ops new` · `metrics` · `rules candidates\|promote\|reject` · `sync units\|aidlc\|jira` · `pack new` |
| 리포 스크립트(Python, Node 불필요) | `scripts/verify.sh [--fast\|--affected\|--full] [--files …] [--tests …] [--plan] [--summary] [--from-base <ref>] [--bootstrap]` · `scripts/new-feature.sh` · `scripts/board.sh [--json]` · `scripts/harness/worktree.py new\|list\|open\|done\|gc` · `scripts/harness/check_layout.py` · `scripts/harness/approve.py` · `scripts/harness/deploy.py check\|run\|result\|auto-verify` · `scripts/harness/codebase_scan.py` · `scripts/harness/delivery_metrics.py` |
| 에이전트 명령(스킬) | `/kns-intent` · `/kns-specify [--from-unit]` · `/kns-clarify` · `/kns-checklist` · `/kns-plan` · `/kns-tasks` · `/kns-analyze` · `/kns-implement` · `/kns-review` · `/kns-scan` · `/kns-docs` · `/kns-converge` · `/kns-screen-plan` · `/kns-design-plan` · `/kns-backlog` |

### 8. 검증 레벨

| 레벨 | 범위 | 부르는 곳 |
|---|---|---|
| `fast` | 구조 · SDD 상태 · 배치 검사 · 포맷(빌드 도구 없음) | Stop 훅 |
| `changed`(기본) | 바꾼 파일 + 연결된 테스트 · 정적 분석 | Bolt 끝, 커밋 전, pre-push |
| `affected` | 바꾼 파일이 속한 모듈 + 그 모듈을 쓰는 모듈 | MR 전, MR 파이프라인 |
| `full` | 전체 | CI만. 에이전트 세션에서는 훅이 막는다 |

### 9. 상태 값

- 문서 머리(frontmatter)의 `status`: `draft` → `in-review` → `approved` | `superseded`.
- tasks 진행: `active` → `check` → `completed` | `superseded`(v2부터 폴더 이동 대신 `tasks.md` 머리의 `state`로 둔다. v1 폴더 구조는 읽기만 지원).
- Jira 상태 대응: 백로그 · 요구사항 작성 · 요구사항 승인 대기 · 설계 · 구현 중 · 검증 · 완료 · 배포됨.

### 10. 하네스 루트 찾기

훅과 리포 스크립트는 작업 폴더(훅이면 입력의 `cwd`)에서 위로 올라가며 `.agents/knots-sync.json` 또는 `.agents/harness.json`(multi-harness 하위 단위)이 있는 가장 가까운 폴더를 하네스 루트로 쓴다.

### 11. 결정 D3 · D4 · D6 · D7(정함)

2026-11-23 사용자가 추천안으로 정했다. D3 배포 경로: `npx github:`로 시작하고 v2.2까지 명령이 그대로면 npm에 올린다. D4 base 기본값: 설정값(`git.base`), 기본 `develop`. D6 Entire 기록 push: 비공개 원격이면 같은 원격, 공개 저장소면 올리지 않는다. D7 역할 기본값: 설계 · 구현 Claude Code, 리뷰 Codex, 반영(문서) Kiro, 진행 판정은 사람. 모두 설정으로 바꿀 수 있다. 설계 문서의 "D번호 추천값"은 이 결정과 같다.

함께 정할 것: knots처럼 Jira를 쓰는 리포의 옛 이슈를 옮길 때 킷이 매기는 키의 접두가 Jira 프로젝트 키와 겹치면 안 된다. 옛 이슈 141건의 키 규칙(Jira 키를 찾아 쓰고, 없으면 Jira와 다른 접두)을 이전 전에 정한다(01·11).

## 문체

[킷 문체 규칙](../../plugins/kns/skills/bootstrap/templates/common/agents-rules/writing-style.md)을 따른다. 평서형(`~한다`), 결과와 사실만, 숫자와 조건으로, 비유·상투구 없이.
