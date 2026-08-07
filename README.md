# harness-starter-kit

Claude Code, Codex, Kiro, Cursor 네 하네스에서 같은 규칙과 같은 슬래시 커맨드를 쓰기 위한 스타터 킷이다.

에이전트마다 규칙 파일을 따로 관리하다 보면 내용이 조금씩 어긋난다. 이 킷은 규칙을 `.agents/rules/`
한 곳에만 두고 나머지 하네스는 그곳을 가리키게 만든다. 백엔드 리포에 그 골격을 한 번에 깔아주는
`hx-bootstrap` 스킬을 배포한다.

설치하면 진입점 역할을 하는 `AGENTS.md` 목차, `.agents/rules`의 공통 규칙, SDD 기록 시스템,
`scripts/verify.sh` 검증 게이트, 그리고 네 하네스에서 이름이 같은 SDD 슬래시 커맨드 9종이 생긴다.

## 구조

```
harness-starter-kit/                        ← 마켓플레이스 루트
├── .claude-plugin/marketplace.json         Claude Code 마켓플레이스 매니페스트
├── .agents/plugins/marketplace.json        Codex 마켓플레이스 매니페스트
├── plugins/
│   └── harness-kit/                        ← 플러그인 루트
│       ├── .claude-plugin/plugin.json      Claude Code 플러그인 매니페스트
│       ├── .codex-plugin/plugin.json       Codex 플러그인 매니페스트
│       ├── commands/                       /harness-kit:{bootstrap,agent-add,update}
│       └── skills/
│           ├── hx-bootstrap/          ← 설치 본체 (모든 스킬이 이것을 호출한다)
│           │   ├── SKILL.md
│           │   ├── setup.sh                스캐폴딩 실행기 (유일한 설치 로직)
│           │   ├── manifest.md             무엇이 어디에 설치되나
│           │   ├── README.md
│           │   ├── lib/harness-lib.sh      경로 매핑 · 치환 · lock 공용 함수
│           │   ├── tools/sync-commands.sh  킷 개발용 — 커맨드 파생 트리 재생성
│           │   └── templates/              common/ + stacks/<stack>/ + arch/<변형>/
│           ├── hx-jvm-setup/          ← JVM 전용 진입 (아키텍처 8종 선택)
│           ├── hx-jvm-hexagonal/      ←   헥사고날 3변형 레시피
│           ├── hx-jvm-layered/        ←   단일 모듈 레이어드 레시피
│           ├── hx-jvm-layered-multimodule/  ← 멀티모듈 레이어드 레시피
│           ├── hx-agent-add/          에이전트 배선 추가
│           └── hx-update/             킷 새 버전 반영
└── docs/
    ├── README.md                           문서 지도 (여기서 시작)
    ├── guides/                             사용 가이드 — 시작·아키텍처 선택·JVM 레시피
    ├── analysis/                           킷 내부 구조 분석
    └── roadmap.md                          계획과 완료 이력
```

스킬 본체는 한 벌뿐이다. 하네스마다 다른 건 매니페스트 파일의 위치와 스키마뿐이다.

## 설치

### Claude Code

```bash
# 로컬 경로로 등록
/plugin marketplace add /path/to/harness-starter-kit
/plugin install harness-kit@harness-starter-kit

# GitHub에 올린 뒤에는
/plugin marketplace add <owner>/harness-starter-kit
```

### Codex

```bash
# 로컬 경로로 등록
codex plugin marketplace add /path/to/harness-starter-kit
codex plugin add harness-kit@harness-starter-kit

# GitHub에 올린 뒤에는
codex plugin marketplace add <owner>/harness-starter-kit
```

설치 확인은 Claude Code에서 `/plugin`, Codex에서 `codex plugin list`로 한다.
플러그인과 스킬 목록은 세션이 시작될 때 로드되기 때문에, 설치 직후에는 재시작해야 보인다.

## 스킬 사용법

이름은 전부 `hx-` 로 시작하지만 **사는 곳이 다른 두 층**이 있다. 먼저 구분하고 넘어간다.

| 층 | 스킬 | 사는 곳 | 언제 쓰나 |
|---|---|---|---|
| 킷 스킬 (7종) | `hx-bootstrap` · `hx-jvm-setup` · `hx-jvm-hexagonal` · `hx-jvm-layered` · `hx-jvm-layered-multimodule` · `hx-agent-add` · `hx-update` | 플러그인 — `harness-kit:` 네임스페이스가 붙는다 | 리포에 골격을 깔거나 유지할 때 |
| 프로젝트 스킬 (9종) | `hx-specify` · `hx-clarify` · `hx-checklist` · `hx-plan` · `hx-tasks` · `hx-analyze` · `hx-implement` · `hx-converge` · `hx-harness` | 대상 리포 — `hx-bootstrap` 이 설치해준다 | 깔린 리포에서 개발할 때, 매일 |

플러그인 스킬은 `harness-kit:` 네임스페이스를 갖기 때문에 프로젝트 스킬과 **구조적으로 충돌하지 않는다**.
두 층의 이름도 겹치는 것이 하나도 없어서 짧은 형태(`/hx-jvm-setup`)로도 안전하게 부를 수 있다.

### 킷 스킬 — `hx-bootstrap`

대상 백엔드 리포에 `AGENTS.md`, `.agents/rules`, SDD 기록 시스템, `scripts/verify.sh`,
`hx-*` 커맨드 9종을 한 번에 깐다.

Claude Code에서는 스킬을 슬래시로 바로 부른다. 짧은 형태는 같은 이름의 다른 커맨드가 없을 때 동작한다.

```
/harness-kit:hx-bootstrap                       현재 디렉터리에 설치(스택·변형은 판단 후 질문)
/hx-bootstrap ~/work/api --dry-run              미리보기 (짧은 형태)
/hx-jvm-setup                                   JVM 전용 진입 — 아키텍처 8종 선택
```

`/harness-kit:bootstrap` · `/harness-kit:agent-add` · `/harness-kit:update` 세 커맨드도 그대로 남아 있다.
스킬을 가리키는 얇은 트리거라 어느 쪽으로 불러도 결과는 같다.

Codex는 플러그인 매니페스트에 커맨드 필드가 없어서 스킬로 부른다(`/skills` 목록 또는 `$hx-bootstrap`).
어느 하네스든 자연어로도 걸린다.

```
hx-bootstrap 스킬로 이 리포에 하네스 골격을 세팅해줘
```

인자는 생략해도 된다. 에이전트가 대상 리포를 보고 판단하되, 애매하면 임의로 정하지 않고 묻는다.

| 인자 | 의미 | 생략 시 |
|---|---|---|
| 첫 위치 인자 | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--stack=` | `jvm` · `python` · `go` | 빌드 파일로 판단(`build.gradle.kts`/`pom.xml`→jvm, `pyproject.toml`→python, `go.mod`→go) |
| `--arch=` | 스택별 아키텍처 변형(jvm 8 · python 5 · go 4) | 기존 레이아웃에서 추론, 새 리포면 선택 기준을 제시하고 고르게 한다 |
| `--dry-run` | 설치 없이 파일 목록만 | 실제 설치 |

기존 파일은 덮지 않는다(`↷ skip (존재)`). 덮으려면 `--force`를 명시해야 한다.
플러그인 설치 없이 직접 실행하려면 스킬 폴더 절대경로를 `SKILL_DIR`로 잡는다.

```bash
SKILL_DIR=~/.claude/plugins/.../skills/hx-bootstrap   # 또는 ~/.codex/plugins/...
bash "$SKILL_DIR/setup.sh" --dry-run --stack=python --arch=modular /path/to/project
```

설치되는 파일 수는 **고른 에이전트**에 달렸다. 규칙·SDD·게이트(core 38개)는 항상 깔고,
에이전트 배선은 쓰는 것만 얹는다 — claude 14 · codex 14 · cursor 9 · kiro 31.
`.claude/`·`.codex/`·`.cursor/`·`.kiro/` 를 전부 만들지 않는다.

```bash
bash "$SKILL_DIR/setup.sh" --stack=python --arch=modular --list-agents /path/to/project
# 감지 결과와 에이전트별 파일 수를 보여준다(설치하지 않는다)
```

나중에 다른 에이전트를 붙이거나(`hx-agent-add`) 킷 새 버전을 반영하려면(`hx-update`)
설치 때 남는 `.agents/harness-kit.json`·`.agents/harness-kit.lock` 을 쓴다. 둘 다 커밋한다.

처음이라면 [시작 가이드](docs/guides/01-getting-started.md)를 순서대로 따라가면 된다.
아키텍처를 아직 못 골랐으면 [아키텍처 선택 가이드](docs/guides/02-choosing-architecture.md)의 결정 트리를,
JVM이면 [JVM 실전 레시피](docs/guides/03-jvm-architecture-recipes.md)를 본다.

스택·변형 목록과 파일→경로 맵은
[스킬 README](plugins/harness-kit/skills/hx-bootstrap/README.md)와
[manifest.md](plugins/harness-kit/skills/hx-bootstrap/manifest.md)에 정리해 두었다.

### 프로젝트 스킬 — `hx-*` 9종

bootstrap이 끝나면 SDD 워크플로 9종이 `hx-` 접두사로 깔린다. 네 하네스에서 이름이 같다.

```
/hx-specify → (/hx-clarify · /hx-checklist) → /hx-plan → /hx-tasks → (/hx-analyze) → /hx-implement → (/hx-converge)
```

괄호 안은 선택 단계다. 이와 별개로 `/hx-harness`가 작업 시작 시 규칙 전체를 로드한다.

| 하네스 | 설치 경로 | 호출 |
|---|---|---|
| Claude Code | `.claude/commands/hx-*.md` | `/hx-specify` |
| Cursor | `.cursor/commands/hx-*.md` | `/hx-specify` |
| Kiro (IDE) | `.kiro/steering/hx-*.md` (`inclusion: manual`) | 슬래시 메뉴에서 선택 |
| Kiro (CLI) | `.kiro/skills/hx-*/SKILL.md` | `/hx-specify` |
| Codex | `.agents/skills/hx-*/SKILL.md` | `$hx-specify` (목록은 `/skills`) |

본문은 `.agents/rules/sdd-workflow.md` 한 곳에만 있고, 각 하네스 파일은 그 절을 가리키는 얇은 트리거다.
`hx-` 접두사를 붙인 건 `/plan`이나 `/analyze` 같은 흔한 이름이 다른 플러그인과 부딪히는 걸 막기 위해서다.

> Codex 경로에 주의한다. 프로젝트 로컬 `.codex/prompts/`는 탐색 경로가 아니다(유저 홈 전용이고
> custom prompts 자체가 deprecated). 그래서 Codex 공식 프로젝트 스킬 경로인 `.agents/skills/`를 쓴다.

## 스킬 목록별 설명

한눈에 보는 표다. 상세는 아래 각 절에 있다.

| 스킬 | 단계 | 하는 일 | 쓰기 | 만들어지는 것 |
|---|---|---|---|---|
| [`hx-bootstrap`](#hx-bootstrap--하네스-골격-설치) | 설치 | 리포에 하네스 골격 스캐폴딩(3스택 공통 진입) | O | core 38 + 고른 에이전트 |
| [`hx-jvm-setup`](#hx-jvm-setup--jvm-전용-진입) | 설치 | JVM 전용 진입 — 아키텍처 8종 선택 + 언어(Kotlin/Java) 확정 | O | 위와 동일(설치는 `setup.sh` 위임) |
| `hx-jvm-hexagonal` | 설치 | 헥사고날 3변형 선택 + 모듈 등록·포트/어댑터·구조 테스트 레시피 | O | 위와 동일 |
| `hx-jvm-layered` | 설치 | 단일 모듈 레이어드 + ArchUnit 구조 테스트 레시피 | O | 위와 동일 |
| `hx-jvm-layered-multimodule` | 설치 | 멀티모듈 레이어드 + 엔티티 노출 범위 결정 레시피 | O | 위와 동일 |
| `hx-agent-add` | 설치 | 에이전트 배선을 나중에 추가(cursor·kiro…) | O | 해당 에이전트 파일만 |
| `hx-update` | 유지 | 킷 새 버전을 기존 리포에 반영 | O | 변경분 · 충돌은 `.new` |
| [`/hx-harness`](#hx-harness--하네스-컨텍스트-로드) | 상시 | 규칙·가드레일 컨텍스트 로드 | X | — |
| [`/hx-specify`](#hx-specify--sdd-1단계-요구사항) | SDD 1 | 무엇을/왜 → requirements | O | `requirements/<feature>.md` |
| [`/hx-clarify`](#hx-clarify--모호성-해소선택) | SDD 1.5 | 모호성 ≤5문답으로 해소 | O | requirements의 `## Clarifications` |
| [`/hx-checklist`](#hx-checklist--스펙-품질-게이트선택) | SDD 1.5 | 요구사항 문장 품질 판정 | O | `checklists/<feature>-<도메인>.md` |
| [`/hx-plan`](#hx-plan--sdd-2단계-설계) | SDD 2 | 어떻게 → design + 헌법 검사 | O | `design/<feature>.md` |
| [`/hx-tasks`](#hx-tasks--sdd-3단계-작업-분해) | SDD 3 | design → 실행 가능한 작업 목록 | O | `tasks/active/<feature>.md` |
| [`/hx-analyze`](#hx-analyze--교차-정합성-검사선택) | SDD 3.5 | 세 문서 교차 정합성·커버리지 | X | 읽기 전용 리포트 |
| [`/hx-implement`](#hx-implement--sdd-4단계-구현) | SDD 4 | Phase 순 구현 + 완료 게이트 | O | 코드 + `tasks/completed/` |
| [`/hx-converge`](#hx-converge--잔여-작업-회수선택) | SDD 5 | 잔여·후속 작업 회수 | O(append-only) | `## Phase N: Convergence` |

---

### `hx-bootstrap` — 하네스 골격 설치

스택(`jvm`·`python`·`go`)과 아키텍처 변형을 정한 뒤 `setup.sh`로 골격을 깐다.

깔리는 것은 진입점 목차(`AGENTS.md`/`CLAUDE.md`), 세 에이전트가 공유하는 공통 규칙(`.agents/rules`),
Kiro용 얇은 포인터(`.kiro/steering`), SDD 기록 시스템(`.agents/docs`), 검증 게이트(`scripts/verify.sh`),
그리고 네 하네스 분의 `hx-*` 커맨드 9종이다.

설치가 끝나면 스택×변형별 후속 작업이 출력된다. 그다음 `/hx-harness`로 컨텍스트를 로드하고
`/hx-specify`부터 시작하면 된다.

### `hx-jvm-setup` — JVM 전용 진입

JVM(Kotlin/Java + Spring)만 다루는 진입 스킬이다. `hx-bootstrap`이 3스택 공통이라 아키텍처 선택 안내가
표 한 장으로 끝나는 데 비해, 이쪽은 **고르는 순서로 묻고** 언어까지 확정한 뒤 같은 `setup.sh`를 호출한다.

묻는 것은 셋이다. 배포 단위가 하나인가 여럿인가, 도메인 규칙이 복잡한가, 무엇을 기준으로 나눌 것인가.
그 답에 따라 jvm 아키텍처 8종 중 하나로 내려간다. 기존 코드가 있으면 그 레이아웃이 먼저다.

| 갈림길 | 가는 곳 |
|---|---|
| 배포 단위 여럿 + 도메인이 무겁다 | `hexagonal-standalone` — 컨텍스트가 `core`·`common`·`bootstrap`까지 소유하는 7모듈 자립형 |
| 배포 단위 여럿 + CRUD 위주(API·배치·관리자) | `layered-multimodule` — 레이어를 모듈로 |
| 배포 단위 하나 + 도메인이 무겁다 | `hexagonal`(컨텍스트가 많으면 `hexagonal-nested`) |
| 배포 단위 하나 + CRUD 위주 | `layered` |
| 분할 축이 도메인/기능이다 | `modulith` · `feature` · `multimodule` |

언어를 `--lang=kotlin|java`로 확정하면 빌드 DSL(Kotlin DSL / Groovy DSL)과 구조 테스트 도구(Konsist / ArchUnit)
안내가 그에 맞춰 출력된다. 아직 못 정했으면 생략해도 된다.

아키텍처가 정해지면 자식 스킬이 이어받는다 — `hx-jvm-hexagonal`(3변형 선택·`settings.gradle` 등록·포트/어댑터·
구조 테스트) · `hx-jvm-layered`(패키지 생성·ArchUnit) · `hx-jvm-layered-multimodule`(모듈 등록·엔티티
노출 범위 `api()` vs `implementation()` 결정). 자식 스킬만 단독으로 불러도 된다.

**이 스킬들이 만드는 것은 규칙·문서·검증 게이트다.** `build.gradle.kts`와 소스 코드는 만들지 않는다 —
무엇을 손으로 세워야 하는지를 순서와 함정까지 적어 줄 뿐이다.

### `/hx-harness` — 하네스 컨텍스트 로드

작업을 시작하기 전에 규칙을 먼저 읽히는 커맨드다. SDD 단계가 아니라 상시 진입점이다.

읽는 순서는 `AGENTS.md` → `.agents/rules/*` → `.agents/docs/README.md` → `ARCHITECTURE.md` →
`.agents/docs/decisions/core-beliefs.md`이고, 필요하면 `.kiro/steering/*`까지 본다.

이때 주입되는 가드레일은 이렇다. 확인하지 않은 것을 단정하지 않기, 입력은 경계에서 검증하기,
권한과 데이터 격리는 저장소 레벨이 최종 방어선이라는 것, Secret 평문 금지, 복잡한 작업은
`tasks/active/`에 계획을 남기기, 변경은 `scripts/verify.sh`로 검증하기.

`/hx-harness <실제 요청>` 형태로 부르면 규칙을 읽은 뒤 이어서 그 요청을 수행한다.

### `/hx-specify` — SDD 1단계: 요구사항

무엇을, 왜 만드는지만 적는 단계다. 스택이나 API, 코드 이야기는 여기 쓰지 않는다.

제품 slug와 기능 short-name을 정하고 `scripts/new-feature.sh <slug> <feature>`를 돌리면
requirements/design/tasks 3종이 스캐폴딩되고 제품 `index.md`에 등록된다. 그다음 requirements를 채운다.

채울 내용은 우선순위가 붙은 User Story(P1/P2/P3, 각각 독립적으로 테스트 가능해야 한다),
측정 가능하고 기술 중립적인 Success Criteria, 그리고 `[NEEDS CLARIFICATION]` 최대 3개다.

품질 자체검증을 최대 3회 돌린 뒤 상태를 `in-review`로 바꾸고 사용자 승인을 받는다.
그다음은 `/hx-clarify` 또는 `/hx-plan`이다.

### `/hx-clarify` — 모호성 해소(선택)

requirements에 남은 모호함을 질문으로 걷어낸다. `/hx-plan` 전에 돌리는 걸 권장한다.

분류축을 따라 스캔한 뒤 한 번에 하나씩, 최대 5개를 묻는다. 객관식 2~5안이나 5단어 이하로 답할 수 있게
만들고 권장안을 먼저 제시한다. 답을 받을 때마다 `## Clarifications`에 오늘 날짜로 불릿을 추가하고
관련 섹션을 바로 갱신한다.

영향이 큰데 해소하지 못한 항목은 Deferred로 남긴다. 나중에 `/hx-converge`가 이걸 회수 근거로 쓴다.

### `/hx-checklist` — 스펙 품질 게이트(선택)

요구사항의 유닛테스트에 해당한다. 기능이 아니라 스펙 문장 자체의 품질을 본다. 읽기 전용이라
스펙을 고치지 않는다.

`.agents/docs/_spec-templates/checklists/_template.md`를 제품 폴더의 `checklists/<feature>-<도메인>.md`로
복제한 뒤, 완결성·명료성·일관성·측정가능성·커버리지 5축을 `CHK-###`로 PASS/FAIL/N·A 판정한다.
근거는 스펙에서 인용하고, 확인할 수 없으면 `[NEEDS CLARIFICATION]`으로 둔다.
도메인 초점(security·api·data·ux)을 주면 해당 항목이 추가된다.

결론은 통과, 조건부, 보류 셋 중 하나다. 핵심 항목이 FAIL이면 `/hx-clarify`나 `/hx-specify`로
되돌린 뒤 다시 돌린다.

한 문서의 품질을 보는 게 `/hx-checklist`, 세 문서 사이의 정합성을 보는 게 `/hx-analyze`다.

### `/hx-plan` — SDD 2단계: 설계

requirements가 승인되어야 시작할 수 있다(`scripts/check-sdd-prerequisites.sh <slug> <feature> --stage design`).

requirements와 `.agents/rules/*`(guardrails·security·structure·api-standards·reliability), `ARCHITECTURE.md`를 읽고 쓴다.

Constitution Check 게이트가 있다. 규칙 위반 여부를 먼저 점검하고, 어쩔 수 없이 위반해야 한다면
design의 Complexity/대안 섹션에 정당화를 적어야만 진행할 수 있다.

채울 내용은 아키텍처와 시퀀스, 인터페이스 시그니처, API(envelope·error code), 데이터 모델,
오류/보안/관측성, 테스트 전략과 Quickstart, 정확성 속성(PBT), 요구사항 추적 매트릭스다.

`NEEDS CLARIFICATION`이 남아 있으면 중단하고 `/hx-clarify`로 간다.
사용자 승인을 받으면 `/hx-tasks`로 넘어간다.

### `/hx-tasks` — SDD 3단계: 작업 분해

design이 승인되어야 시작한다(`--stage tasks`).

작업 한 줄은 `- [ ] T001 [P] [US1] 설명 + 파일/모듈 경로` 형태다. `[P]`는 병렬 가능,
`[US1]`은 User Story 추적용이다.

Phase는 Setup → Foundational(차단 선행) → User Story별(P 순) → Polish 순으로 구성하고,
각 작업에 요구사항 ID와 설계 § 를 표기한다. 의존 그래프, 병렬 실행 예시, 구현 전략(핵심 우선 /
점진 인도)도 함께 넣는다. 상태는 `active`다.

승인 후 `/hx-analyze`나 `/hx-implement`로 간다.

### `/hx-analyze` — 교차 정합성 검사(선택)

requirements·design·tasks 세 문서 사이의 정합성을 본다. 읽기 전용이며 파일을 절대 수정하지 않는다.

`R#.#`, `SC-###`, 설계 컴포넌트, `T### [US#]`를 ID로 잡아 색인한 뒤 `.agents/rules/*`(헌법)와 대조한다.
탐지 유형은 헌법 충돌(CRITICAL), 커버리지 갭(요구 방향과 역방향 모두), 모순, 중복,
모호함(측정 불가하거나 미해결 마커가 남은 것), 용어 드리프트다.

리포트는 `ID·심각도·유형·위치·발견·권고` 표와 커버리지 매트릭스 요약, 심각도별 집계로 낸다.
보완은 사용자 승인을 받은 뒤 `/hx-specify`·`/hx-clarify`·`/hx-plan`·`/hx-tasks`로 되돌아가 수행한다.

### `/hx-implement` — SDD 4단계: 구현

tasks가 승인되어야 시작한다(`--stage implement`).

tasks를 Phase 순서대로 실행한다. `[P]`는 병렬로 돌리되 같은 파일을 건드리는 작업은 순차로 한다.
TDD를 우선하고, 테스트를 요청받았다면 실패를 확인한 뒤 구현한다. 완료한 작업은 `- [X]`로 체크하고
변경할 때마다 `scripts/verify.sh`를 돌린다.

완료 게이트에는 사용자 승인이 필수다. DoD와 verify를 충족하면 task 파일을 `tasks/check/`로 옮기고
상태를 `check`로 바꾼 뒤 근거를 기록하고 사용자에게 검증을 요청한다. 승인을 받은 뒤에만
`tasks/completed/`로 옮기고 상태를 `completed`로 바꾼다. 에이전트가 임의로 completed로 바꾸는 건 금지다.

### `/hx-converge` — 잔여 작업 회수(선택)

구현이 끝난 뒤 발견된 잔여 작업이나 후속 작업을 tasks로 되살린다. append-only라서
기존 Phase나 이력을 다시 쓰거나 지우지 않는다.

회수 근거로는 `/hx-analyze`가 찾은 커버리지 갭, 리뷰 지적, 놓친 버그, requirements의 Deferred 항목,
그리고 `scripts/check-spec-freshness.sh` 리포트(오래된 draft, 미해결 `[NEEDS CLARIFICATION]`,
정체된 active tasks)를 쓴다.

`tasks/active/<feature>.md` 끝에 `## Phase N: Convergence`를 추가하고 T 순번을 이어 붙인다.
각 작업에는 어디서 회수했는지(analyze ID, 이슈, 마커 위치)를 근거로 표기한다.
이미 `completed/`로 옮긴 기능이면 파일을 `active/`로 되돌린다. 완료 이력은 커밋에 남으니 괜찮다.

스펙 자체에 결함이 있다면 회수가 아니라 되돌림이다. 요구가 빠졌으면 `/hx-specify`,
모호하면 `/hx-clarify`, 설계가 바뀌어야 하면 `/hx-plan`으로 간다.
`/hx-converge`는 작업 목록을 복구하는 것이지 스펙을 고치는 게 아니다.

승인을 받으면 `/hx-implement`로 회수 Phase를 실행하고 완료 게이트를 다시 탄다.

## 개발

매니페스트를 고친 뒤에는 마켓플레이스 스냅샷을 갱신해야 반영된다.

```bash
codex plugin marketplace upgrade                 # Codex
/plugin marketplace update harness-starter-kit   # Claude Code
```

슬래시 커맨드를 고칠 때는 원본 한 곳만 고치고 파생 트리를 다시 만든다.
파생 파일을 직접 고치면 하네스 사이에 내용이 어긋난다.

```bash
# 1) templates/common/claude/commands/hx-*.md 를 고친다 (원본)
# 2) 나머지 3하네스(Cursor · Kiro · Codex) 트리를 다시 만든다
bash plugins/harness-kit/skills/hx-bootstrap/tools/sync-commands.sh
```

스킬 폴더명은 `SKILL.md` frontmatter의 `name`과 반드시 같아야 한다(`hx-bootstrap`).
계획과 완료 이력은 [docs/roadmap.md](docs/roadmap.md)에 있다.
