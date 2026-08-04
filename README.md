# harness-starter-kit

**Claude Code · Codex · Kiro · Cursor 에서 함께 쓰는 하네스 엔지니어링 스타터 킷 마켓플레이스.**

백엔드 리포에 에이전트 협업 골격을 한 번에 스캐폴딩하는 `harness-bootstrap` 스킬을 배포한다.
설치되는 것: `AGENTS.md` 목차 · `.agents/rules` 공통 규칙 정본 · SDD 기록 시스템 · `scripts/verify.sh` 단일 검증 게이트 ·
**4개 하네스에서 같은 이름으로 쓰는 SDD 슬래시 커맨드 9종**.

## 구조

```
harness-starter-kit/                        ← 마켓플레이스 루트
├── .claude-plugin/marketplace.json         Claude Code 마켓플레이스 매니페스트
├── .agents/plugins/marketplace.json        Codex 마켓플레이스 매니페스트
├── plugins/
│   └── harness-kit/                        ← 플러그인 루트
│       ├── .claude-plugin/plugin.json      Claude Code 플러그인 매니페스트
│       ├── .codex-plugin/plugin.json       Codex 플러그인 매니페스트
│       ├── commands/bootstrap.md           /harness-kit:bootstrap 슬래시 커맨드
│       └── skills/
│           └── harness-bootstrap/          ← 스킬 본체 (양쪽 하네스가 공유)
│               ├── SKILL.md
│               ├── setup.sh                스캐폴딩 실행기
│               ├── manifest.md             무엇이 어디에 설치되나
│               ├── README.md
│               ├── tools/sync-commands.sh  킷 개발용 — 커맨드 파생 트리 재생성
│               └── templates/              common/ + stacks/<stack>/ + arch/<변형>/
└── docs/
    ├── roadmap.md                          계획 정본
    └── analysis/                           설계·분석 문서
```

스킬 본체는 **한 벌뿐**이다. 하네스별로 다른 것은 매니페스트 파일의 위치와 스키마뿐이다.

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

설치 확인: Claude Code는 `/plugin`, Codex는 `codex plugin list`.
플러그인·스킬 목록은 **세션 시작 시점에 로드**되므로 설치 직후에는 재시작해야 보인다.

## 스킬 사용법

이 킷이 다루는 스킬은 **두 층**이다. 헷갈리기 쉬우니 먼저 구분한다.

| 층 | 스킬 | 언제 쓰나 | 어떻게 들어오나 |
|---|---|---|---|
| **킷 스킬** | `harness-bootstrap` (1종) | 리포에 하네스 골격을 **깔 때**, 한 번 | 마켓플레이스에서 플러그인 설치 |
| **프로젝트 스킬** | `hx-*` (9종) | 깔린 리포에서 **개발할 때**, 매일 | `harness-bootstrap` 이 대상 리포에 설치해준다 |

### 킷 스킬 — `harness-bootstrap`

대상 백엔드 리포에 `AGENTS.md` · `.agents/rules` 정본 · SDD 기록 시스템 · `scripts/verify.sh` ·
`hx-*` 커맨드 9종을 한 번에 스캐폴딩한다.

**Claude Code** — 슬래시 커맨드로 부른다.

```
/harness-kit:bootstrap                          현재 디렉터리에 설치(스택·변형은 판단 후 질문)
/harness-kit:bootstrap ~/work/api --dry-run     미리보기
/harness-kit:bootstrap --stack=go --arch=feature
```

**Codex** — 플러그인 매니페스트에 커맨드 필드가 없어 **스킬로 부른다**(`/skills` 목록 또는 `$harness-bootstrap`).
어느 하네스든 자연어로도 걸린다.

```
harness-bootstrap 스킬로 이 리포에 하네스 골격을 세팅해줘
```

인자는 생략해도 된다. 에이전트가 대상 리포를 보고 판단하되, **애매하면 임의로 정하지 않고 묻는다.**

| 인자 | 의미 | 생략 시 |
|---|---|---|
| 첫 위치 인자 | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--stack=` | `jvm` · `python` · `go` | 빌드 파일로 판단(`build.gradle.kts`/`pom.xml`→jvm, `pyproject.toml`→python, `go.mod`→go) |
| `--arch=` | 스택별 아키텍처 변형(jvm 5 · python 5 · go 4) | 기존 레이아웃에서 추론, 새 리포면 선택 기준을 제시하고 고르게 한다 |
| `--dry-run` | 설치 없이 파일 목록만 | 실제 설치 |

기존 파일은 **덮지 않는다**(`↷ skip (존재)`). 덮으려면 `--force` 를 명시해야 한다.
플러그인 설치 없이 직접 실행하려면 스킬 폴더 절대경로를 `SKILL_DIR` 로 잡는다:

```bash
SKILL_DIR=~/.claude/plugins/.../skills/harness-bootstrap   # 또는 ~/.codex/plugins/...
bash "$SKILL_DIR/setup.sh" --dry-run --stack=python --arch=modular /path/to/project
```

스택·변형 목록과 설치 산출물(총 104개, 변형과 무관하게 불변)은
[스킬 README](plugins/harness-kit/skills/harness-bootstrap/README.md)와
[manifest.md](plugins/harness-kit/skills/harness-bootstrap/manifest.md) 참고.

### 프로젝트 스킬 — `hx-*` 9종

bootstrap 이 끝나면 SDD 워크플로 9종이 `hx-` 접두사로 깔린다. **4개 하네스에서 같은 이름**으로 쓴다.

```
/hx-specify → (/hx-clarify · /hx-checklist) → /hx-plan → /hx-tasks → (/hx-analyze) → /hx-implement → (/hx-converge)
```

괄호는 선택 단계다. 별도로 `/hx-harness` 가 규칙 전체를 로드한다(작업 시작 시).

| 하네스 | 설치 경로 | 호출 |
|---|---|---|
| Claude Code | `.claude/commands/hx-*.md` | `/hx-specify` |
| Cursor | `.cursor/commands/hx-*.md` | `/hx-specify` |
| Kiro (IDE) | `.kiro/steering/hx-*.md` (`inclusion: manual`) | 슬래시 메뉴에서 선택 |
| Kiro (CLI) | `.kiro/skills/hx-*/SKILL.md` | `/hx-specify` |
| Codex | `.agents/skills/hx-*/SKILL.md` | `$hx-specify` (목록은 `/skills`) |

본문 정본은 `.agents/rules/sdd-workflow.md` **한 곳**이고 각 하네스 파일은 그 절을 가리키는 얇은 트리거다.
`hx-` 접두사는 `/plan`·`/analyze` 같은 흔한 이름이 다른 플러그인과 충돌하는 것을 막는다.

> **Codex 경로 주의** — 프로젝트 로컬 `.codex/prompts/` 는 탐색 경로가 아니다(유저 홈 전용이고 custom prompts 자체가 deprecated).
> 그래서 Codex 공식 프로젝트 스킬 경로인 `.agents/skills/` 를 쓴다.

## 스킬 목록별 설명

한눈에 보는 표. 상세는 아래 각 절.

| 스킬 | 단계 | 하는 일 | 쓰기 | 산출물 |
|---|---|---|---|---|
| [`harness-bootstrap`](#harness-bootstrap--하네스-골격-설치) | 설치 | 리포에 하네스 골격 스캐폴딩 | O | 104개 파일 |
| [`/hx-harness`](#hx-harness--하네스-컨텍스트-로드) | 상시 | 규칙·가드레일 컨텍스트 로드 | X | — |
| [`/hx-specify`](#hx-specify--sdd-1단계-요구사항) | SDD 1 | 무엇을/왜 → requirements | O | `requirements/<feature>.md` |
| [`/hx-clarify`](#hx-clarify--모호성-해소선택) | SDD 1.5 | 모호성 ≤5문답으로 해소 | O | requirements의 `## Clarifications` |
| [`/hx-checklist`](#hx-checklist--스펙-품질-게이트선택) | SDD 1.5 | 요구사항 문장 품질 판정 | O | `checklists/<feature>-<도메인>.md` |
| [`/hx-plan`](#hx-plan--sdd-2단계-설계) | SDD 2 | 어떻게 → design + 헌법 검사 | O | `design/<feature>.md` |
| [`/hx-tasks`](#hx-tasks--sdd-3단계-작업-분해) | SDD 3 | design → 실행 가능한 작업 목록 | O | `tasks/active/<feature>.md` |
| [`/hx-analyze`](#hx-analyze--교차-정합성-검사선택) | SDD 3.5 | 세 문서 교차 정합성·커버리지 | **X** | 읽기 전용 리포트 |
| [`/hx-implement`](#hx-implement--sdd-4단계-구현) | SDD 4 | Phase 순 구현 + 완료 게이트 | O | 코드 + `tasks/completed/` |
| [`/hx-converge`](#hx-converge--잔여-작업-회수선택) | SDD 5 | 잔여·후속 작업 회수 | O(append-only) | `## Phase N: Convergence` |

---

### `harness-bootstrap` — 하네스 골격 설치

- **역할**: 스택(`jvm`·`python`·`go`)과 아키텍처 변형을 정하고 `setup.sh` 로 골격을 깐다.
- **깔리는 것**: 진입점 목차(`AGENTS.md`/`CLAUDE.md`) · 공통 규칙 정본(`.agents/rules`, 3개 에이전트 공유) ·
  Kiro 얇은 포인터(`.kiro/steering`) · SDD 기록 시스템(`.agents/docs`) · 단일 검증 게이트(`scripts/verify.sh`) ·
  `hx-*` 커맨드 9종(4개 하네스 분).
- **다음**: 출력되는 스택×변형별 후속 작업 → `/hx-harness` 로 컨텍스트 로드 → `/hx-specify` 시작.

### `/hx-harness` — 하네스 컨텍스트 로드

- **역할**: 작업을 시작하기 전에 규칙을 먼저 읽힌다. SDD 단계가 아니라 **상시 진입점**이다.
- **읽는 것**: `AGENTS.md` → `.agents/rules/*` → `.agents/docs/README.md` → `ARCHITECTURE.md` →
  `.agents/docs/decisions/core-beliefs.md` → (필요 시) `.kiro/steering/*`.
- **주입되는 가드레일**: 추측 금지(확인 후 단정) · 입력 경계 검증 · 권한/데이터 격리는 저장소 레벨이 최종 방어선 ·
  Secret 평문 금지 · 복잡한 작업은 `tasks/active/` 에 계획을 남길 것 · 변경은 `scripts/verify.sh` 로 검증.
- **호출**: `/hx-harness <실제 요청>` — 규칙을 읽은 뒤 그대로 요청을 수행한다.

### `/hx-specify` — SDD 1단계: 요구사항

- **역할**: **무엇을/왜**만 적는다. 스택·API·코드는 금지.
- **절차**: 제품 slug·기능 short-name 확정 → `scripts/new-feature.sh <slug> <feature>` 로
  requirements/design/tasks 3종 스캐폴딩 + 제품 `index.md` 등록 → requirements 작성.
- **채우는 것**: 우선순위 User Story(P1/P2/P3, 각각 독립 테스트 가능) · 측정가능하고 기술중립인 Success Criteria ·
  `[NEEDS CLARIFICATION]` 최대 3개.
- **게이트**: 품질 자체검증(최대 3회) → 상태 `in-review` → **사용자 승인**.
- **다음**: `/hx-clarify` 또는 `/hx-plan`.

### `/hx-clarify` — 모호성 해소(선택)

- **역할**: requirements의 모호성을 질문으로 걷어낸다. `/hx-plan` **전에** 돌리는 것을 권장.
- **절차**: 분류축으로 스캔 → **한 번에 하나씩** 최대 5개 질문(객관식 2~5안 또는 ≤5단어, 권장안 먼저 제시) →
  답을 받을 때마다 `## Clarifications`(오늘 날짜) 불릿 추가 + 관련 섹션 즉시 갱신.
- **남는 것**: 미해소 고영향 항목은 Deferred 로 명시(나중에 `/hx-converge` 의 회수 근거가 된다).
- **다음**: `/hx-plan`.

### `/hx-checklist` — 스펙 품질 게이트(선택)

- **역할**: 요구사항의 **"유닛테스트"**. 기능이 아니라 **스펙 문장 자체의 품질**을 본다. **읽기 전용**(스펙 미수정).
- **절차**: `checklists/_template.md` → `checklists/<feature>-<도메인>.md` 복제 →
  **기본 5축**(완결성·명료성·일관성·측정가능성·커버리지)을 `CHK-###` 로 PASS/FAIL/N·A 판정.
  근거는 스펙 인용, 확인 불가는 `[NEEDS CLARIFICATION]`. 도메인 초점(security·api·data·ux)을 주면 해당 항목을 **추가**.
- **결론**: 통과 / 조건부 / 보류. 핵심 FAIL은 `/hx-clarify`·`/hx-specify` 로 되돌린 뒤 재실행.
- **구분**: **한 문서의 품질** = `/hx-checklist`, **세 문서 간 정합성** = `/hx-analyze`.

### `/hx-plan` — SDD 2단계: 설계

- **전제**: requirements 승인 (`scripts/check-sdd-prerequisites.sh <slug> <feature> --stage design`).
- **읽는 것**: requirements + `.agents/rules/*`(guardrails·security·structure·api-standards·reliability) + `ARCHITECTURE.md`.
- **Constitution Check 게이트**: 규칙 정본 위반 여부를 먼저 점검한다. 불가피한 위반은 design의 Complexity/대안 섹션에
  **정당화를 적어야만** 진행할 수 있다.
- **채우는 것**: 아키텍처·시퀀스 · 인터페이스 시그니처 · API(envelope·error code) · 데이터 모델 ·
  오류/보안/관측성 · 테스트 전략 + Quickstart · 정확성 속성(PBT) · 요구사항 추적 매트릭스.
- **중단 조건**: `NEEDS CLARIFICATION` 이 남으면 중단 → `/hx-clarify`.
- **다음**: 사용자 승인 → `/hx-tasks`.

### `/hx-tasks` — SDD 3단계: 작업 분해

- **전제**: design 승인 (`--stage tasks`).
- **작업 포맷**: `- [ ] T001 [P] [US1] 설명 + 파일/모듈 경로` — `[P]`=병렬 가능, `[US1]`=User Story 추적.
- **Phase 구성**: Setup → Foundational(차단 선행) → User Story별(P 순) → Polish.
  각 작업에 요구사항 ID·설계 § 를 표기한다.
- **포함**: 의존 그래프 · 병렬 실행 예시 · 구현 전략(핵심 우선 / 점진 인도). 상태는 `active`.
- **다음**: 사용자 승인 → `/hx-analyze` 또는 `/hx-implement`.

### `/hx-analyze` — 교차 정합성 검사(선택)

- **역할**: requirements·design·tasks **세 문서 사이**의 정합성을 본다. **읽기 전용 — 파일을 절대 수정하지 않는다.**
- **색인**: `R#.#` · `SC-###` · 설계 컴포넌트 · `T### [US#]` 를 ID로 잡고 `.agents/rules/*`(헌법)와 대조.
- **탐지 유형↔심각도**: 헌법 충돌(CRITICAL) · 커버리지 갭(요구/역방향) · 모순 · 중복 ·
  모호(측정 불가·미해결 마커) · 용어 드리프트.
- **리포트**: `ID·심각도·유형·위치·발견·권고` 표 + 커버리지 매트릭스 요약 + 심각도별 집계.
- **보완**: 사용자 승인 후 `/hx-specify`·`/hx-clarify`·`/hx-plan`·`/hx-tasks` 로 되돌려 수행.

### `/hx-implement` — SDD 4단계: 구현

- **전제**: tasks 승인 (`--stage implement`).
- **실행**: tasks를 Phase 순서로. `[P]`는 병렬, 같은 파일은 순차. TDD 우선(테스트 요청 시 실패 확인 후 구현).
- **검증**: 완료 작업은 `- [X]` 체크, 변경마다 `scripts/verify.sh`.
- **완료 게이트(사용자 승인 필수)**: DoD·verify 충족 → task 파일을 `tasks/check/` 로 이동하고 상태 `check`,
  근거 기록 후 **사용자 검증 요청** → **승인 후에만** `tasks/completed/` 이동·상태 `completed`.
  에이전트가 임의로 completed 로 바꾸는 것은 금지.

### `/hx-converge` — 잔여 작업 회수(선택)

- **역할**: 구현 후 발견된 잔여·후속 작업을 tasks로 되살린다. **append-only** — 기존 Phase·이력을 재작성·삭제하지 않는다.
- **회수 근거**: `/hx-analyze` 커버리지 갭 · 리뷰 지적 · escaped 버그 · requirements의 Deferred ·
  `scripts/check-spec-freshness.sh` 리포트(오래된 draft · 미해결 `[NEEDS CLARIFICATION]` · 정체된 active tasks).
- **절차**: `tasks/active/<feature>.md` 끝에 `## Phase N: Convergence` 를 추가하고 T 순번을 이어서 붙인다.
  각 작업에 **회수 출처**(analyze ID·이슈·마커 위치)를 근거로 표기.
  이미 `completed/` 로 옮겨진 기능이면 파일을 `active/` 로 되돌린다(완료 이력은 커밋에 남는다).
- **경계**: **스펙 결함이면 회수가 아니라 되돌림**이다. 요구 누락 → `/hx-specify`, 모호 → `/hx-clarify`,
  설계 변경 → `/hx-plan`. `/hx-converge` 는 **작업 목록 복구**지 스펙 수정이 아니다.
- **다음**: 사용자 승인 → `/hx-implement` 로 회수 Phase 실행 → 완료 게이트를 다시 탄다.

## 개발

매니페스트를 고친 뒤에는 마켓플레이스 스냅샷을 갱신해야 반영된다.

```bash
codex plugin marketplace upgrade                 # Codex
/plugin marketplace update harness-starter-kit   # Claude Code
```

**슬래시 커맨드를 고칠 때**는 정본 한 곳만 고치고 파생 트리를 재생성한다. 직접 고치면 하네스 간 드리프트가 생긴다.

```bash
# 1) templates/common/claude/commands/hx-*.md 를 고친다 (정본)
# 2) 나머지 3하네스(Cursor · Kiro · Codex) 트리를 다시 만든다
bash plugins/harness-kit/skills/harness-bootstrap/tools/sync-commands.sh
```

스킬 폴더명은 `SKILL.md`의 frontmatter `name` 과 **반드시 일치**해야 한다(`harness-bootstrap`).
계획·완료 이력은 [docs/roadmap.md](docs/roadmap.md)가 정본이다.
