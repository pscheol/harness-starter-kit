# harness-starter-kit

Claude Code, Codex, Kiro, Cursor 네 하네스에서 같은 규칙과 같은 슬래시 커맨드를 쓰기 위한 스타터 킷이다.

**처음이라면 [사용 안내서](docs/guide/index.html)부터 본다** — 설치 · 하루 흐름 · 관리 페이지 · 역할별 활용(HTML, 브라우저로 연다).

에이전트마다 규칙 파일을 따로 관리하다 보면 내용이 조금씩 어긋난다. 이 킷은 규칙을 `.agents/rules/`
한 곳에만 두고 나머지 하네스는 그곳을 가리키게 만든다. 백엔드(JVM·Python·Go)든 프론트엔드(Web·Electron)든
리포에 그 골격을 한 번에 깔아주는 `kns:bootstrap` 스킬을 배포한다.

> **이름: knots-sync(약어 `kns`)** — 2026-11-24 옛 이름 harness-kit 에서 바꿨다. CLI 는 `knots-sync`(별칭 `kns`, 한동안 `harness-kit`),
> 플러그인 스킬은 `/kns:<명령>`, 프로젝트 스킬은 `kns-<명령>`, 상태 파일은 `.agents/knots-sync.json` · `.lock` 이다. 저장소 이름은 그대로다.
> 옛 이름으로 깐 리포는 `update` 가 옮긴다 → [이전 안내서 1.1](docs/migration-guide.md#11-이름이-바뀌었다harness-kit--knots-sync).

설치하면 진입점 역할을 하는 `AGENTS.md` 목차, `.agents/rules`의 공통 규칙, SDD 기록 시스템,
`scripts/verify.sh` 검증 게이트, 네 하네스에서 이름이 같은 슬래시 커맨드 11종, 그리고 기능 문서 생성기(`tools/docs`)가 생긴다.

1.0.8부터 SDD는 SDLC 단계(S1 분석 → S2 기획 → S3 설계 → S4 계획 → S5 구현 → S6 테스트 → S7 문서 반영 → S8 완료)를 따른다.
이슈마다 `.agents/docs/<slug>-specs/issues/<key>/`에 requirements·design·tasks를 두고, 구현이 끝나면 `/kns-docs`가
기능 문서(`docs/features/`)를 갱신한다. 기능 문서는 요구사항·정책·화면·시스템 설계·흐름·시퀀스·DB·캐시·API·시험·목업
12단계 페이지와 기능별 페이지로 된 정적 사이트이고, API 명세는 Scalar로 보여 준다. → [기능 문서](#기능-문서--toolsdocs)

## 구조

```
harness-starter-kit/                        ← 마켓플레이스 루트 · pnpm 워크스페이스
├── .claude-plugin/marketplace.json         Claude Code 마켓플레이스 매니페스트
├── .agents/plugins/marketplace.json        Codex 마켓플레이스 매니페스트
├── install-kiro.sh                         Kiro 설치기 (마켓플레이스가 없는 하네스용)
├── packages/                               ← 원본은 여기만 고친다
│   ├── templates/                          common/ + domains/<domain>/ + stacks/<stack>/ + arch/<변형>/ + optional/<module>/
│   ├── legacy-setup/<스킬>/                setup.sh · lib/harness-lib.sh · update.sh · add-agent.sh
│   └── plugin/                             플러그인 매니페스트 · commands/ · skills/kns-*/SKILL.md
├── plugins/
│   └── knots-sync/                        ← 생성물(손으로 고치지 않는다). node scripts/gen-plugins.mjs 가 만든다
│       ├── .claude-plugin/plugin.json      Claude Code 플러그인 매니페스트
│       ├── .codex-plugin/plugin.json       Codex 플러그인 매니페스트
│       ├── commands/                       /kns:{bootstrap,agent-add,update}
│       └── skills/
│           ├── bootstrap/          ← 설치 본체 (모든 스킬이 이것을 호출한다)
│           │   ├── SKILL.md
│           │   ├── setup.sh                스캐폴딩 실행기 (유일한 설치 로직)
│           │   ├── manifest.md             무엇이 어디에 설치되나
│           │   ├── README.md
│           │   ├── lib/harness-lib.sh      경로 매핑 · 치환 · lock 공용 함수
│           │   └── templates/              packages/templates 사본
│           ├── jvm-setup/          ← JVM 전용 진입 (아키텍처 8종 선택)
│           ├── jvm-hexagonal/      ←   헥사고날 3변형 레시피
│           ├── jvm-layered/        ←   단일 모듈 레이어드 레시피
│           ├── jvm-layered-multimodule/  ← 멀티모듈 레이어드 레시피
│           ├── web-setup/          ← 웹 프론트엔드 진입 (아키텍처 3종 선택)
│           ├── electron-setup/     ← Electron 데스크톱 진입 (아키텍처 3종 선택)
│           ├── jira-setup/         ← 이슈 트래커 연동 설정 (선택 모듈을 켠 리포만)
│           ├── agent-add/          에이전트 배선 추가
│           └── update/             킷 새 버전 반영
├── scripts/                                킷 개발 도구: gen-plugins.mjs
├── tests/                                  설치 시험 · 생성물 시험(test_generated.py)
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
/plugin install kns@knots-sync

# GitHub에 올린 뒤에는
/plugin marketplace add <owner>/harness-starter-kit
```

### Codex

```bash
# 로컬 경로로 등록
codex plugin marketplace add /path/to/harness-starter-kit
codex plugin add kns@knots-sync

# GitHub에 올린 뒤에는
codex plugin marketplace add <owner>/harness-starter-kit
```

### Kiro — `install-kiro.sh`

Kiro에는 플러그인 마켓플레이스가 없다. 킷 루트의 `install-kiro.sh`가 그 자리를 대신한다.

```bash
bash install-kiro.sh                      # ~/.kiro/skills/ 에 킷 스킬 10종 설치
bash install-kiro.sh --dry-run            # 계획만 출력
bash install-kiro.sh --force              # 기존 파일도 덮어쓴다
bash install-kiro.sh --uninstall          # 이 스크립트가 깐 것만 제거
bash install-kiro.sh --home=/path/.kiro   # 대상 홈 지정 (환경변수 KIRO_HOME 도 가능)
```

**스킬 디렉터리를 통째로 복사한다.** 포인터가 아니라서 설치 후에는 이 리포가 없어도, 옮겨도 그대로 동작한다.

```text
~/.kiro/skills/
├── bootstrap/     SKILL.md + setup.sh + lib/ + templates/
├── jvm-setup/     SKILL.md
├── jvm-hexagonal/ · jvm-layered/ · jvm-layered-multimodule/
├── web-setup/     SKILL.md
├── electron-setup/ SKILL.md
├── jira-setup/    SKILL.md
├── agent-add/     SKILL.md + add-agent.sh
└── update/        SKILL.md + update.sh
```

Kiro 스킬 규약은 `<홈>/skills/<스킬명>/SKILL.md` 다. 프로젝트 레벨(`.kiro/skills/`)과 같은 구조이며,
**한 겹 더 감싸면(`skills/knots-sync/skills/…`) 인식되지 않는다.** 리포를 통째로 복사해 넣으면 이 함정에 빠진다.

세션이 시작될 때 로드되므로 설치 후 `kiro-cli` 를 다시 켜야 `/kns:bootstrap` · `/kns:jvm-setup` 이 잡힌다.

스크립트를 직접 불러도 된다. 리포 없이 설치본만으로 스캐폴딩까지 끝난다.

```bash
bash ~/.kiro/skills/bootstrap/setup.sh --agents=kiro --dry-run <대상_리포>
```

설치 기록은 `~/.kiro/.knots-sync-manifest.json` 에 남는다.

```json
{
  "kitVersion": "1.0.8",
  "kitPath": "/path/to/harness-starter-kit",
  "agent": "kiro",
  "installedAt": "2026-01-01",
  "managedDirs": ["skills/bootstrap", "…"]
}
```

`--uninstall` 은 **이 기록에 적힌 디렉터리만** 지운다. 같은 폴더에 있는 다른 도구의 스킬은
건드리지 않는다. 킷을 갱신했으면 `--force` 로 다시 깐다.

이 스크립트가 까는 것은 **킷 스킬**(리포에 골격을 깔아주는 쪽)이다. 대상 리포의 Kiro 배선
(`.kiro/steering` · `.kiro/skills` · `.agents/rules`)은 `kns:bootstrap` 이 깐다:

```bash
bash plugins/kns/skills/bootstrap/setup.sh --agents=kiro <대상_리포>
```

### 설치 확인

Claude Code는 `/plugin`, Codex는 `codex plugin list`, Kiro는 `~/.kiro/skills/kns-*` 확인 후 `/kns-` 로 부른다.
플러그인과 스킬 목록은 세션이 시작될 때 로드되기 때문에, 설치 직후에는 재시작해야 보인다.

## 스킬 사용법

이름은 전부 `kns-` 로 시작하지만 **사는 곳이 다른 두 층**이 있다. 먼저 구분하고 넘어간다.

| 층 | 스킬 | 사는 곳 | 언제 쓰나 |
|---|---|---|---|
| 킷 스킬 (10종) | `kns:bootstrap` · `kns:jvm-setup` · `kns:jvm-hexagonal` · `kns:jvm-layered` · `kns:jvm-layered-multimodule` · `kns:web-setup` · `kns:electron-setup` · `kns:jira-setup` · `kns:agent-add` · `kns:update` | 플러그인 — `kns:` 네임스페이스가 붙는다 (Kiro는 `install-kiro.sh` 가 깐 `~/.kiro/skills/kns-*`) | 리포에 골격을 깔거나 유지할 때 |
| 프로젝트 스킬 (11종) | `kns-specify` · `kns-clarify` · `kns-checklist` · `kns-plan` · `kns-tasks` · `kns-analyze` · `kns-implement` · `kns-docs` · `kns-converge` · `kns-harness` · `kns-maintain` | 대상 리포 — `kns:bootstrap` 이 설치해준다 | 깔린 리포에서 개발할 때, 매일 |

플러그인 스킬은 `kns:` 네임스페이스를 갖기 때문에 프로젝트 스킬과 **구조적으로 충돌하지 않는다**.
두 층의 이름도 겹치는 것이 하나도 없어서 짧은 형태(`/kns:jvm-setup`)로도 안전하게 부를 수 있다.

### 킷 스킬 — `kns:bootstrap`

대상 리포에 `AGENTS.md`, `.agents/rules`, SDD 기록 시스템, `scripts/verify.sh`,
`kns-*` 커맨드 11종, 기능 문서 생성기(`tools/docs`)와 원고 골격(`docs/features/_src`)을 한 번에 깐다.

Claude Code에서는 스킬을 슬래시로 바로 부른다. 짧은 형태는 같은 이름의 다른 커맨드가 없을 때 동작한다.

```
/kns:bootstrap                       현재 디렉터리에 설치(스택·변형은 판단 후 질문)
/kns:bootstrap ~/work/api --dry-run              미리보기 (짧은 형태)
/kns:jvm-setup                                   JVM 전용 진입 — 아키텍처 8종 선택
/kns:web-setup                                   웹 프론트엔드 진입 — 아키텍처 3종 선택
/kns:electron-setup                              Electron 데스크톱 진입 — 아키텍처 3종 선택
```

`/kns:bootstrap` · `/kns:agent-add` · `/kns:update` 세 커맨드도 그대로 남아 있다.
스킬을 가리키는 얇은 트리거라 어느 쪽으로 불러도 결과는 같다.

Codex는 플러그인 매니페스트에 커맨드 필드가 없어서 스킬로 부른다(`/skills` 목록 또는 `$kns:bootstrap`).
어느 하네스든 자연어로도 걸린다.

```
kns:bootstrap 스킬로 이 리포에 하네스 골격을 세팅해줘
```

인자는 생략해도 된다. 에이전트가 대상 리포를 보고 판단하되, 애매하면 임의로 정하지 않고 묻는다.

| 인자 | 의미 | 생략 시 |
|---|---|---|
| 첫 위치 인자 | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--stack=` | `jvm` · `python` · `go` · `web` · `electron` | 빌드 파일로 판단(`build.gradle.kts`/`pom.xml`→jvm, `pyproject.toml`→python, `go.mod`→go, `package.json`+`electron` 의존→electron, `package.json`만→web) |
| `--arch=` | 스택별 아키텍처 변형(jvm 8 · python 5 · go 4 · web 3 · electron 3) | 기존 레이아웃에서 추론, 새 리포면 선택 기준을 제시하고 고르게 한다 |
| `--modules=` | 선택 모듈 `jira-workflow`(이슈 트래커 연동) · `multi-harness`(여러 리포·단위 하네스의 공통 파일 배포와 게이트). 고유 불변식 가드(`scripts/run-guards.sh`)는 공통 층이라 늘 깔린다 | **없음**. 필요할 때만 켠다 — 목록은 `--list-modules` |
| `--dry-run` | 설치 없이 파일 목록만 | 실제 설치 |

기존 파일은 덮지 않는다(`↷ skip (존재)`). 덮으려면 `--force`를 명시해야 한다.
플러그인 설치 없이 직접 실행하려면 스킬 폴더 절대경로를 `SKILL_DIR`로 잡는다.

```bash
SKILL_DIR=~/.claude/plugins/.../skills/bootstrap   # 또는 ~/.codex/plugins/...
bash "$SKILL_DIR/setup.sh" --dry-run --stack=python --arch=modular /path/to/project
```

설치되는 파일 수는 **스택군과 고른 에이전트**에 달렸다. 규칙·SDD·게이트(core)는 항상 깔고,
에이전트 배선은 쓰는 것만 얹는다. `.claude/`·`.codex/`·`.cursor/`·`.kiro/` 를 전부 만들지 않는다.
스택군 × 하네스별 파일 수의 원본은 [kns:bootstrap manifest](plugins/kns/skills/bootstrap/manifest.md)의
「에이전트 선택」 · 「선택 모듈」 표다(시험이 템플릿과 맞춘다). 고른 값으로 정확한 수는 `knots-sync plan --json` 의 `counts` 가 낸다.

프론트엔드가 많은 건 `web`·`electron` 이 공유하는 `frontend` 도메인 규칙(디자인 시스템·접근성·
UI 상태·성능) 때문이다. 선택 모듈(`jira-workflow` · `multi-harness`)은 여기에 더해진다.
core 에는 규칙·SDD 템플릿·검증 스크립트·세션 협업 도구·역할 정의와 기능 문서 생성기가 들어 있다.
설치 끝에 `tools/docs/feature_docs.py build`가 한 번 돌아 `docs/features/*.html`이 생긴다(위 수에 없다).

```bash
bash "$SKILL_DIR/setup.sh" --stack=python --arch=modular --list-agents /path/to/project
# 감지 결과와 에이전트별 파일 수를 보여준다(설치하지 않는다)
```

나중에 다른 에이전트를 붙이거나(`kns:agent-add`) 킷 새 버전을 반영하려면(`kns:update`)
설치 때 남는 `.agents/knots-sync.json`·`.agents/knots-sync.lock` 을 쓴다. 둘 다 커밋한다.

처음이라면 [시작 가이드](docs/guides/01-getting-started.md)를 순서대로 따라가면 된다.
아키텍처를 아직 못 골랐으면 [아키텍처 선택 가이드](docs/guides/02-choosing-architecture.md)의 결정 트리를,
JVM이면 [JVM 실전 레시피](docs/guides/03-jvm-architecture-recipes.md)를 본다.

스택·변형 목록과 파일→경로 맵은
[스킬 README](plugins/kns/skills/bootstrap/README.md)와
[manifest.md](plugins/kns/skills/bootstrap/manifest.md)에 정리해 두었다.

### 프로젝트 스킬 — `kns-*` 11종

bootstrap이 끝나면 커맨드 11종이 `kns-` 접두사로 깔린다. 네 하네스에서 이름이 같다.

```
S1·S2 /kns-specify → (/kns-clarify · /kns-checklist) → S3 /kns-plan → S4 /kns-tasks → (/kns-analyze)
      → S5·S6 /kns-implement → S7 /kns-docs → S8 완료(사용자 승인) → (/kns-converge)
```

괄호 안은 선택 단계다. 이와 별개로 `/kns-harness`가 작업 시작 시 규칙 전체를 로드하고,
`/kns-maintain`이 새 코드·리팩터링·리뷰에 코드 유지보수 기준(`.agents/rules/code-maintenance.md`)을 적용한다.

| 단계 | 커맨드 | 남는 것 |
|---|---|---|
| S1 분석 | `/kns-specify` | requirements — User Story(P1/P2/P3) · 요구(R#.#) · Success Criteria |
| S2 기획 | `/kns-specify` | requirements — 정책 표(P-#) · 화면 표(없으면 "화면 없음") · 갱신할 기능 문서 ID |
| S3 설계 | `/kns-plan` | design — 시퀀스 · 순서도(§4.3) · 상태 전이(§4.4) · API · 테이블 · 쿼리→인덱스(§7.1) · 캐시 키(§7.2) · 동시성(§7.3) |
| S4 계획 | `/kns-tasks` | `tasks/active.md` — Polish 에 문서 반영 작업과 문서 검사 명령 |
| S5 구현 · S6 테스트 | `/kns-implement` | 코드 · 시험 · `[VERIFICATION]` 기록 |
| S7 문서 반영 | `/kns-docs` | `docs/features/_src` 원고 · 생성 HTML · `feature_docs.py check` 통과 |
| S8 완료 | 사용자 승인 | `tasks/check.md` → 승인 뒤 `tasks/completed.md` |

단계마다 사용자 승인을 받고 넘어간다. 원본은 `.agents/rules/sdd-workflow.md`의 「SDLC 단계」 절이다.

| 하네스 | 설치 경로 | 호출 |
|---|---|---|
| Claude Code | `.claude/skills/kns-*/SKILL.md`(복사본) | `/kns-specify` |
| Cursor | `.cursor/commands/kns-*.md`(생성물) | `/kns-specify` |
| Kiro (IDE) | `.kiro/steering/kns-*.md` (`inclusion: manual`, 생성물) | 슬래시 메뉴에서 선택 |
| Kiro (CLI) | `.kiro/skills/kns-*/SKILL.md`(복사본) | `/kns-specify` |
| Codex | `.agents/skills/kns-*/SKILL.md` | `$kns-specify` (목록은 `/skills`) |

커맨드 본문은 `.agents/skills/kns-*/SKILL.md` 한 곳에 있고(스킬이 `.agents/rules/sdd-workflow.md`의 해당 절을 읽는다),
하네스 폴더에는 그 원본의 복사본 · 생성물이 있다(링크 · 포인터 파일이 아니다).
`kns-` 접두사를 붙인 건 `/plan`이나 `/analyze` 같은 흔한 이름이 다른 플러그인과 부딪히는 걸 막기 위해서다.

> Codex 경로에 주의한다. 프로젝트 로컬 `.codex/prompts/`는 탐색 경로가 아니다(유저 홈 전용이고
> custom prompts 자체가 deprecated). 그래서 Codex 공식 프로젝트 스킬 경로인 `.agents/skills/`를 쓴다.

## 스킬 목록별 설명

한눈에 보는 표다. 상세는 아래 각 절에 있다.

| 스킬 | 단계 | 하는 일 | 쓰기 | 만들어지는 것 |
|---|---|---|---|---|
| [`kns:bootstrap`](#kns:bootstrap--하네스-골격-설치) | 설치 | 리포에 하네스 골격 스캐폴딩(5스택 공통 진입) | O | core + 고른 에이전트 |
| [`kns:jvm-setup`](#kns:jvm-setup--jvm-전용-진입) | 설치 | JVM 전용 진입 — 아키텍처 8종 선택 + 언어(Kotlin/Java) 확정 | O | 위와 동일(설치는 `setup.sh` 위임) |
| `kns:jvm-hexagonal` | 설치 | 헥사고날 3변형 선택 + 모듈 등록·포트/어댑터·구조 테스트 레시피 | O | 위와 동일 |
| `kns:jvm-layered` | 설치 | 단일 모듈 레이어드 + ArchUnit 구조 테스트 레시피 | O | 위와 동일 |
| `kns:jvm-layered-multimodule` | 설치 | 멀티모듈 레이어드 + 엔티티 노출 범위 결정 레시피 | O | 위와 동일 |
| [`kns:web-setup`](#kns:web-setup--kns-electron-setup--프론트엔드-진입) | 설치 | 웹 전용 진입 — 아키텍처 3종 선택 + ESLint 경계 등록 안내 | O | 위와 동일 |
| [`kns:electron-setup`](#kns:web-setup--kns-electron-setup--프론트엔드-진입) | 설치 | Electron 전용 진입 — 프로세스 경계 + 아키텍처 3종 선택 | O | 위와 동일 |
| `kns:agent-add` | 설치 | 에이전트 배선을 나중에 추가(cursor·kiro…) | O | 해당 에이전트 파일만 |
| `kns:update` | 유지 | 킷 새 버전을 기존 리포에 반영 | O | 변경분 · 충돌은 `.new` |
| [`/kns-harness`](#kns-harness--하네스-컨텍스트-로드) | 상시 | 규칙·가드레일 컨텍스트 로드 | X | — |
| [`/kns-maintain`](#kns-maintain--코드-유지보수-기준) | 상시 | 새 코드·리팩터링·리뷰에 유지보수 기준 적용 | O | 코드 · 시험 |
| [`/kns-specify`](#kns-specify--s1s2-요구사항정책화면) | S1·S2 | 무엇을/왜 + 정책·화면 → requirements | O | `issues/<key>/requirements.md` |
| [`/kns-clarify`](#kns-clarify--모호성-해소선택) | S2 | 모호성 ≤5문답으로 해소 | O | requirements의 `## Clarifications` |
| [`/kns-checklist`](#kns-checklist--스펙-품질-게이트선택) | S2 | 요구사항 문장 품질 판정 | O | `issues/<key>/checklists/<도메인>.md` |
| [`/kns-plan`](#kns-plan--s3-설계) | S3 | 어떻게 → design + 헌법 검사 | O | `issues/<key>/design.md` |
| [`/kns-tasks`](#kns-tasks--s4-작업-분해) | S4 | design → 실행 가능한 작업 목록 | O | `issues/<key>/tasks/active.md` |
| [`/kns-analyze`](#kns-analyze--교차-정합성-검사선택) | S4 | 세 문서 교차 정합성·커버리지 | X | 읽기 전용 리포트 |
| [`/kns-implement`](#kns-implement--s5s6-구현과-시험) | S5·S6 | Phase 순 구현 + 완료 게이트 | O | 코드 + `tasks/check.md` |
| [`/kns-docs`](#kns-docs--s7-문서-반영) | S7 | 기능 문서 원고 갱신 · 생성 · 검사 | O | `docs/features/_src/features/<ID>.md` · HTML |
| [`/kns-converge`](#kns-converge--잔여-작업-회수선택) | 회수 | 잔여·후속 작업 회수 | O(append-only) | `## Phase N: Convergence` |

---

### `kns:bootstrap` — 하네스 골격 설치

스택(`jvm`·`python`·`go`·`web`·`electron`)과 아키텍처 변형을 정한 뒤 `setup.sh`로 골격을 깐다.

깔리는 것은 진입점 목차(`AGENTS.md`/`CLAUDE.md`), 네 하네스가 공유하는 공통 규칙(`.agents/rules`),
하네스 폴더의 규칙 · 스킬 · 역할 복사본 · 생성물(`paths` 자동 로드), SDD 기록 시스템(`.agents/docs`), 검증 게이트(`scripts/verify.sh`),
네 하네스 분의 `kns-*` 커맨드 11종, 그리고 기능 문서 생성기와 원고 골격이다.

설치가 끝나면 스택×변형별 후속 작업이 출력된다. 그다음 `/kns-harness`로 컨텍스트를 로드하고
`/kns-specify`부터 시작하면 된다.

### `kns:jvm-setup` — JVM 전용 진입

JVM(Kotlin/Java + Spring)만 다루는 진입 스킬이다. `kns:bootstrap`이 3스택 공통이라 아키텍처 선택 안내가
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

아키텍처가 정해지면 자식 스킬이 이어받는다 — `kns:jvm-hexagonal`(3변형 선택·`settings.gradle` 등록·포트/어댑터·
구조 테스트) · `kns:jvm-layered`(패키지 생성·ArchUnit) · `kns:jvm-layered-multimodule`(모듈 등록·엔티티
노출 범위 `api()` vs `implementation()` 결정). 자식 스킬만 단독으로 불러도 된다.

**이 스킬들이 만드는 것은 규칙·문서·검증 게이트다.** `build.gradle.kts`와 소스 코드는 만들지 않는다 —
무엇을 손으로 세워야 하는지를 순서와 함정까지 적어 줄 뿐이다.

### `kns:web-setup` · `kns:electron-setup` — 프론트엔드 진입

두 스킬은 `frontend` 도메인 규칙을 공유한다. 디자인 시스템(토큰이 원본), 접근성(시맨틱·키보드·대비·
`prefers-reduced-motion`), UI 상태(서버/클라이언트/URL/폼 **4종을 섞지 않는다**), 성능(예산을 먼저 정하고
**측정 없이 고치지 않는다**) 네 가지다. 스택에 두면 두 벌이 되고 곧 어긋나기 때문에 도메인 레이어에 둔다.

프론트엔드에는 **컴파일 레벨의 레이어 강제가 없다.** 경계를 지키는 건 TypeScript `strict` 와 ESLint
import 규칙뿐이라, 설치 후 그 규칙을 등록하지 않으면 `ARCHITECTURE.md` 는 문서로만 남는다.
**등록하지 않은 경계는 존재하지 않는 경계다.**

| 갈림길 | 가는 곳 |
|---|---|
| (web) 서버 렌더링·서버 액션·서버 전용 데이터 접근이 필요하다 | `nextjs-app` — `server-only`/`client-only` 가 유일한 컴파일 강제 |
| (web) 기능 소유가 팀별로 갈리고 계층을 기계적으로 막고 싶다 | `feature-sliced` — FSD 6계층 + `boundaries/element-types` 허용 행렬 |
| (web) 그 외 | `react-spa` — 라우팅을 한 곳에서 선언 |
| (electron) 데스크톱 말고 다른 배포 단위와 코드를 공유한다 | `monorepo` — `apps/*` + `packages/*`, 의존 방향 단방향 |
| (electron) main/renderer 양쪽에 같은 기능이 짝으로 여럿 생긴다 | `feature` — IPC 계약은 `shared/features/<f>/contract.ts` 한 곳 |
| (electron) 그 외 | `main-renderer` — 프로세스 자체가 구조 |

Electron 은 아키텍처가 폴더가 아니라 **권한 경계**에서 시작한다. main 은 Node 전권, preload 는 화이트리스트
다리, renderer 는 권한 없는 웹이다. `contextIsolation: true` · `nodeIntegration: false` · `sandbox: true`
세 값은 협상 대상이 아니고 — 하나라도 풀면 렌더러의 XSS 하나가 곧바로 로컬 코드 실행이 된다 —
`scripts/verify.sh` 가 `fast` 레벨에서(즉 에이전트 턴마다) grep 으로 막는다. `ipcRenderer` 를 통째로
`window` 에 붙이는 것도 같은 가드가 잡는다.

### `/kns-harness` — 하네스 컨텍스트 로드

작업을 시작하기 전에 규칙을 먼저 읽히는 커맨드다. SDD 단계가 아니라 상시 진입점이다.

읽는 순서는 `AGENTS.md` → `.agents/rules/*` → `.agents/docs/README.md` → `ARCHITECTURE.md` →
`.agents/docs/decisions/core-beliefs.md`이고, 필요하면 `.kiro/steering/*`까지 본다.

이때 주입되는 가드레일은 이렇다. 확인하지 않은 것을 단정하지 않기, 입력은 경계에서 검증하기,
권한과 데이터 격리는 애플리케이션과 저장소 양쪽에서 강제하기, Secret 평문 금지, 복잡한 작업은
이슈 폴더의 `tasks/active.md`에 계획을 남기기, 변경은 `scripts/verify.sh`(기본 changed)로 검증하기.
동시에 여러 세션이 일하면 `scripts/session-coordination.py`로 파일 점유를 등록하고 공지를 확인한다.

### `/kns-maintain` — 코드 유지보수 기준

새 코드·버그 수정·동작 보존 리팩터링·리뷰에 `.agents/rules/code-maintenance.md`를 적용한다.
패키지 책임, 읽히는 이름, 의미 있는 조건 함수(predicate), adapter/mapper 분리, 함수 50줄 상한,
OpenAPI 문서와 계약 테스트를 함께 본다. 신규·버그는 실패하는 시험부터, 리팩터링은 현재 동작을 잡는 시험부터 쓴다.
`python3 scripts/check-maintenance.py --files <파일>`이 후보를 경고로 알려 준다(실패 판정이 아니다).

`/kns-harness <실제 요청>` 형태로 부르면 규칙을 읽은 뒤 이어서 그 요청을 수행한다.

### `/kns-specify` — S1·S2: 요구사항·정책·화면

무엇을, 왜 만드는지와 지켜야 할 정책·화면을 적는 단계다. 스택이나 API, 코드 이야기는 여기 쓰지 않는다.

제품 slug와 기능 short-name을 정하고 `scripts/new-feature.sh <slug> <feature>`를 돌리면
`.agents/docs/<slug>-specs/issues/<N>-<type>-<feature>/requirements.md` **하나만** 스캐폴딩되고
제품 `index.md`에 등록된다(`--type=feat|fix|refactor|…`, 기본 feat). 그다음 requirements를 채운다.

design·tasks는 이 시점에 만들지 않는다. 각각 `/kns-plan`·`/kns-tasks`가 그때 만든다. 빈 문서를 미리 깔면
보드(파일 위치로 상태를 계산한다)가 곧장 🔨 구현으로 뛰고 단계 게이트도 항상 통과해버리기 때문이다.
세 문서를 한 번에 만드는 `--all`은 승인 게이트를 건너뛰므로 지원하지 않는다. requirements·design은 상태가 정확히 `approved`여야 다음 문서를 만든다.

채울 내용은 우선순위가 붙은 User Story(P1/P2/P3, 각각 독립적으로 테스트 가능해야 한다),
측정 가능하고 기술 중립적인 Success Criteria, `[NEEDS CLARIFICATION]` 최대 3개,
그리고 S2 기획인 정책 표(P-#: 규칙·근거·위반 시 동작)와 화면 표(화면이 없으면 "화면 없음"), 갱신할 기능 문서 ID다.

품질 자체검증을 최대 3회 돌린 뒤 상태를 `in-review`로 바꾸고 사용자 승인을 받는다.
그다음은 `/kns-clarify` 또는 `/kns-plan`이다.

### `/kns-clarify` — 모호성 해소(선택)

requirements에 남은 모호함을 질문으로 걷어낸다. `/kns-plan` 전에 돌리는 걸 권장한다.

분류축을 따라 스캔한 뒤 한 번에 하나씩, 최대 5개를 묻는다. 객관식 2~5안이나 5단어 이하로 답할 수 있게
만들고 권장안을 먼저 제시한다. 답을 받을 때마다 `## Clarifications`에 오늘 날짜로 불릿을 추가하고
관련 섹션을 바로 갱신한다.

영향이 큰데 해소하지 못한 항목은 Deferred로 남긴다. 나중에 `/kns-converge`가 이걸 회수 근거로 쓴다.

### `/kns-checklist` — 스펙 품질 게이트(선택)

요구사항의 유닛테스트에 해당한다. 기능이 아니라 스펙 문장 자체의 품질을 본다. 읽기 전용이라
스펙을 고치지 않는다.

`.agents/docs/_spec-templates/checklists/_template.md`를 이슈 폴더의 `checklists/<도메인>.md`로
복제한 뒤, 완결성·명료성·일관성·측정가능성·커버리지 5축을 `CHK-###`로 PASS/FAIL/N·A 판정한다.
근거는 스펙에서 인용하고, 확인할 수 없으면 `[NEEDS CLARIFICATION]`으로 둔다.
도메인 초점(security·api·data·ux)을 주면 해당 항목이 추가된다.

결론은 통과, 조건부, 보류 셋 중 하나다. 핵심 항목이 FAIL이면 `/kns-clarify`나 `/kns-specify`로
되돌린 뒤 다시 돌린다.

한 문서의 품질을 보는 게 `/kns-checklist`, 세 문서 사이의 정합성을 보는 게 `/kns-analyze`다.

### `/kns-plan` — S3: 설계

requirements가 승인되어야 시작할 수 있다(`scripts/check-sdd-prerequisites.sh <slug> <feature> --stage design`).

design 파일은 이 단계에서 만든다 — `scripts/new-feature.sh <slug> <feature> --stage=design`.
requirements가 없으면 스크립트가 거부한다. 이름만 줘도 requirements에서 키를 찾아 같은 파일명을 쓴다.

requirements와 `.agents/rules/*`(guardrails·security·structure·api-standards·reliability), `ARCHITECTURE.md`를 읽고 쓴다.

Constitution Check 게이트가 있다. 규칙 위반 여부를 먼저 점검하고, 어쩔 수 없이 위반해야 한다면
design의 Complexity/대안 섹션에 정당화를 적어야만 진행할 수 있다.

채울 내용은 아키텍처와 시퀀스, 인터페이스 시그니처, API(envelope·error code), 데이터 모델,
오류/보안/관측성, 테스트 전략과 Quickstart, 정확성 속성(PBT), 요구사항 추적 매트릭스다.
S3에서는 순서도(§4.3)·상태 전이(§4.4)·쿼리→인덱스 표(§7.1)·캐시 키와 무효화(§7.2)·동시성(잠금·멱등, §7.3)도 채운다.
이 그림과 표가 S7에서 기능 문서로 옮겨진다.

`NEEDS CLARIFICATION`이 남아 있으면 중단하고 `/kns-clarify`로 간다.
사용자 승인을 받으면 `/kns-tasks`로 넘어간다.

### `/kns-tasks` — S4: 작업 분해

design이 승인되어야 시작한다(`--stage tasks`).

tasks 파일도 이 단계에서 만든다 — `scripts/new-feature.sh <slug> <feature> --stage=tasks`.
design이 없으면 스크립트가 거부한다. 이슈 폴더에 `tasks/active.md`가 생기는 순간 보드가 🔨 구현으로 넘어간다.

작업 한 줄은 `- [ ] T001 [P] [US1] 설명 + 파일/모듈 경로` 형태다. `[P]`는 병렬 가능,
`[US1]`은 User Story 추적용이다.

Phase는 Setup → Foundational(차단 선행) → User Story별(P 순) → Polish 순으로 구성하고,
각 작업에 요구사항 ID와 설계 § 를 표기한다. 의존 그래프, 병렬 실행 예시, 구현 전략(핵심 우선 /
점진 인도)도 함께 넣는다. Polish에는 문서 반영(`/kns-docs`) 작업과 문서 검사 명령을 둔다. 상태는 `active`다.

승인 후 `/kns-analyze`나 `/kns-implement`로 간다.

### `/kns-analyze` — 교차 정합성 검사(선택)

requirements·design·tasks 세 문서 사이의 정합성을 본다. 읽기 전용이며 파일을 절대 수정하지 않는다.

`R#.#`, `SC-###`, 설계 컴포넌트, `T### [US#]`를 ID로 잡아 색인한 뒤 `.agents/rules/*`(헌법)와 대조한다.
탐지 유형은 헌법 충돌(CRITICAL), 커버리지 갭(요구 방향과 역방향 모두), 모순, 중복,
모호함(측정 불가하거나 미해결 마커가 남은 것), 용어 드리프트다.

리포트는 `ID·심각도·유형·위치·발견·권고` 표와 커버리지 매트릭스 요약, 심각도별 집계로 낸다.
보완은 사용자 승인을 받은 뒤 `/kns-specify`·`/kns-clarify`·`/kns-plan`·`/kns-tasks`로 되돌아가 수행한다.

### `/kns-implement` — S5·S6: 구현과 시험

tasks가 승인되어야 시작한다(`--stage implement`).

tasks를 Phase 순서대로 실행한다. `[P]`는 병렬로 돌리되 같은 파일을 건드리는 작업은 순차로 한다.
TDD를 우선하고, 테스트를 요청받았다면 실패를 확인한 뒤 구현한다. 완료한 작업은 `- [X]`로 체크하고
변경할 때마다 `scripts/verify.sh --files <변경 파일> --tests <관련 시험>`을 돌린다.

완료 게이트에는 사용자 승인이 필수다. DoD와 verify를 충족하고 S7(`/kns-docs`)까지 마치면
`tasks/active.md`를 `tasks/check.md`로 옮기고 상태를 `check`로 바꾼 뒤 근거를 기록하고 사용자에게 검증을 요청한다.
승인을 받은 뒤에만 `tasks/completed.md`로 옮기고 상태를 `completed`로 바꾼다. 에이전트가 임의로 completed로 바꾸는 건 금지다.

### `/kns-docs` — S7: 문서 반영

이번 이슈가 바꾼 기능의 문서를 고친다. requirements의 「기능 문서」 칸과 변경 파일로 범위를 정하고,
OpenAPI·마이그레이션이 바뀌었으면 `refresh openapi`·`refresh schema`로 원본을 갱신한다.
새 operation·테이블·캐시·화면은 `catalog.json`의 기능에 배정한다(`stats`의 미배정·중복이 0이어야 한다).
`python3 tools/docs/feature_docs.py brief <기능 ID>`가 그 기능에 닿는 코드 사실을 모아 주고,
그것을 출발점으로 원고 절 12개를 고친 뒤 `build`와 `check`를 통과시킨다. 생성 HTML은 손으로 고치지 않는다.

### `/kns-converge` — 잔여 작업 회수(선택)

구현이 끝난 뒤 발견된 잔여 작업이나 후속 작업을 tasks로 되살린다. append-only라서
기존 Phase나 이력을 다시 쓰거나 지우지 않는다.

회수 근거로는 `/kns-analyze`가 찾은 커버리지 갭, 리뷰 지적, 놓친 버그, requirements의 Deferred 항목,
그리고 `scripts/check-spec-freshness.sh` 리포트(오래된 draft, 미해결 `[NEEDS CLARIFICATION]`,
정체된 active tasks)를 쓴다.

이슈의 `tasks/active.md` 끝에 `## Phase N: Convergence`를 추가하고 T 순번을 이어 붙인다.
각 작업에는 어디서 회수했는지(analyze ID, 이슈, 마커 위치)를 근거로 표기한다.
이미 `tasks/completed.md`로 옮긴 이슈면 같은 이슈의 `tasks/active.md`로 되돌린다. 완료 이력은 커밋에 남으니 괜찮다.

스펙 자체에 결함이 있다면 회수가 아니라 되돌림이다. 요구가 빠졌으면 `/kns-specify`,
모호하면 `/kns-clarify`, 설계가 바뀌어야 하면 `/kns-plan`으로 간다.
`/kns-converge`는 작업 목록을 복구하는 것이지 스펙을 고치는 게 아니다.

승인을 받으면 `/kns-implement`로 회수 Phase를 실행하고 완료 게이트를 다시 탄다.

## 기능 문서 — `tools/docs`

구현한 기능을 개발자가 읽고 코드를 따라갈 수 있게 정리한 정적 사이트를 만든다. 표준 라이브러리만 쓰는 Python 생성기다.

```bash
python3 tools/docs/feature_docs.py build          # docs/features/*.html 생성
python3 tools/docs/feature_docs.py check          # 원고 절·작성 전 표시·미배정·원본 변경·생성물 불일치·끊긴 링크 검사
python3 tools/docs/feature_docs.py stats          # 미배정·중복 operation·테이블·캐시·화면 수
python3 tools/docs/feature_docs.py brief F-NOTE-01  # 한 기능에 닿는 코드 사실 모음(원고 출발점)
python3 tools/docs/feature_docs.py refresh vendor   # Scalar·Mermaid 를 잠금 파일 판으로 받아 리포에 둔다
```

| 사이트 구성 | 내용 |
|---|---|
| 단계 페이지 12개 | 요구사항 정의 · 정책 · IA·화면 목록 · 백로그 추적 · 시스템 설계 · 기능 흐름 · 시퀀스 · DB 설계 · 캐시·동시성 · API 명세 · 시험 명세 · 목업 |
| 기능 페이지 | 기능마다 원고 12절(개요 · 요구사항 · 정책 · 화면 · 흐름 · 시퀀스 · 상태 전이 · 데이터 · 캐시·동시성 · API · 테스트 · 변경 영향) + 코드에서 뽑은 표(operation · 테이블 · 캐시 · 화면 · 시험 · SDD 이슈) |
| API 명세 | 단위별 Scalar 페이지. 태그는 기능 이름이고, operation 설명 끝에 구현 함수 · 호출 경로 · 닿는 테이블과 인덱스 · 캐시 키 · 잠금 · 멱등 · 시퀀스 그림 · 시험을 덧붙인다 |

생성기가 코드에서 읽는 것은 OpenAPI 스냅숏, 마이그레이션을 빈 PostgreSQL에 적용한 DB 카탈로그(테이블·인덱스·제약),
Kotlin 정적 분석(컨트롤러 → 서비스 → 리포지터리 → 테이블, 캐시 어노테이션, 잠금, 멱등 키, 예약 작업),
FastAPI 경로, Next.js 화면과 그 화면이 부르는 API, 시험 파일 수(JUnit · Kotest · pytest · vitest · flutter), SDD 이슈다.
설정은 `docs/features/_src/docs.config.json`(단위·원본 경로·DB)과 `catalog.json`(영역·기능·배정 규칙)이다.
외부 CDN을 부르지 않는다 — Scalar와 Mermaid는 `refresh vendor`가 integrity를 확인해 `docs/features/assets/vendor/`에 둔다.

`.agents/verify-checks.json`이 문서·생성기·소스 경로 변경에 문서 검사를 묶어 두어, changed 게이트가 그 경로를 바꾼 커밋에서 `check`를 함께 고른다.
명령과 배정 규칙은 설치본의 `tools/docs/README.md`에 있다.

## 개발

원본은 `packages/`다. `plugins/kns/`은 마켓플레이스가 git에서 받아 가는 생성물이라 커밋하지만 손으로 고치지 않는다.
원본을 고친 뒤에는 생성물을 다시 만든다(Node 18 이상).

```bash
node scripts/gen-plugins.mjs           # packages/ → plugins/kns/
node scripts/gen-plugins.mjs --check   # 다르면 1 (tests/test_generated.py 가 같은 검사를 한다)
```

매니페스트를 고친 뒤에는 마켓플레이스 스냅샷을 갱신해야 반영된다.

```bash
codex plugin marketplace upgrade                 # Codex
/plugin marketplace update harness-starter-kit   # Claude Code
```

슬래시 커맨드를 고칠 때는 원본 한 곳만 고친다. 설치본의 하네스 폴더 사본은 `npx knots-sync repair`(Node 가 없으면 `python3 scripts/harness/projection.py sync`)가 다시 만든다.
사본을 직접 고치면 배치 검사(`scripts/harness/check_layout.py`)가 `drifted`로 막는다.

```bash
# 1) packages/templates/common/agents-skills/kns-*/SKILL.md 를 고친다 (원본 — 설치 위치 .agents/skills, Codex 가 직접 읽는다)
# 2) 플러그인 생성물을 다시 만든다(하네스 폴더 사본은 설치가 원본에서 만든다)
node scripts/gen-plugins.mjs
```

킷 시험은 빈 임시 폴더에 스택마다 설치해 보고, 설치본 안에서 하네스 검사기 · 기능 문서 build/check ·
하네스 스크립트 시험을 돌린다. 네트워크는 쓰지 않는다(수 분 걸린다).

```bash
python3 -m unittest discover -s tests -p "test_*.py"
```

스킬 폴더명은 `SKILL.md` frontmatter의 `name`과 반드시 같아야 한다(`kns:bootstrap`).
계획과 완료 이력은 [docs/roadmap.md](docs/roadmap.md)에 있다.
