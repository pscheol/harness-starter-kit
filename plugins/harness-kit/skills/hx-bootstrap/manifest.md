# 매니페스트 — 무엇이 어디에 설치되나 (v5 · 킷 1.0.8 · 다중 스택 · SDLC 단계형 SDD · 기능 문서)

`setup.sh` 가 아래 **5개 레이어**를 이 순서로 프로젝트 표준 경로에 복사한다. 뒤 레이어가 앞을 덮는다.

| # | 레이어 | 언제 붙나 |
|---|---|---|
| 1 | `templates/common/` | 항상 |
| 2 | `templates/domains/<DOMAIN>/` | 스택에 도메인이 매핑돼 있을 때만 |
| 3 | `templates/stacks/<STACK>/` (`arch/` 제외) | 항상 |
| 4 | `templates/stacks/<STACK>/arch/<ARCH>/` | 항상(변형 하나) |
| 5 | `templates/optional/<MODULE>/` | `--modules=` 로 고른 것만 |

핵심 설계(v4):
- **규칙 원본은 공통** — 가드레일·보안·API 표준 등 규칙은 `.agents/rules/` 한 곳에 두고 Claude Code·Codex·Cursor·Kiro 가 공유한다.
- **Kiro steering은 얇은 포인터** — `.kiro/steering/*` 는 규칙 본문을 담지 않고 `.agents/rules/*` 원본을 가리키기만 한다.
- **기본은 하네스 하나** — 리포를 여럿으로 나누거나 배포 단위가 여럿이면 선택 모듈 `multi-harness`가 메인 → 도메인 → 단위 층의 공통 파일 배포와 게이트를 맡는다.
- **SDLC 단계형 SDD** — 이슈마다 `.agents/docs/issues/<키>-<이름>/{requirements,design,tasks}.md`(상태는 문서 머리 `status` · `state`, 보드는 `specs-index.md` 영역별 표). S1 분석 → S2 기획 → S3 설계 → S4 계획 → S5 구현 → S6 테스트 → S7 문서 반영(`/hx-docs`) → S8 완료. 원본은 `agents-rules/sdd-workflow.md`.
- **기능 문서 생성기** — `tools/docs/feature_docs.py`(표준 라이브러리만)가 OpenAPI·DB 카탈로그·코드 정적 분석·원고(`docs/features/_src`)로 정적 사이트를 만든다. API 명세는 Scalar, 그림은 Mermaid이고 둘 다 리포에 둔 판을 쓴다.
- **스킬 원본은 core** — `.agents/skills/hx-*/SKILL.md`가 커맨드 본문이다. Claude·Cursor 커맨드와 Kiro 스킬·steering 은 그 원본을 가리키는 한 줄 포인터다(`tools/sync-commands.sh`가 만든다).
- **도메인 레이어는 여러 스택이 공유하는 규약만** — `web`·`electron` 은 `frontend` 를 공유한다(디자인 시스템·접근성·UI 상태·성능). `jvm`·`python`·`go` 는 도메인 디렉터리가 **없다** — 규칙이 이미 언어별이라 스택 레이어가 그 역할을 한다. 빈 `backend/` 를 만들지 않는다.
- **스택 오버레이** — 하네스 골격(SDD·게이트 구조·에이전트 배선)은 한 벌, 언어 종속 규약(컨벤션·주석·보안·검증 명령)만 스택별로 갈아 끼운다.
- **아키텍처 변형 레이어** — 아키텍처에 종속되는 파일은 4개뿐(`ARCHITECTURE.md`·`agents-rules/structure.md`·`agents-rules/tech.md`·`kiro-steering/structure.md`)이다. 이 4개만 `arch/<variant>/`에 두고 선택한 하나만 설치하므로 조합이 늘어도 설치 파일 수는 달라지지 않는다.
- **선택 모듈은 기본 꺼짐** — `--modules=` 로 명시할 때만 깔린다. 각 모듈 폴더의 `ABOUT` 첫 줄이 `--list-modules` 설명이며, `ABOUT` 자체는 설치되지 않는다.
- **에이전트 선택 설치** — 템플릿 전체를 다 깔지 않는다. core 는 항상 깔고 에이전트 배선은 고른 것만 얹는다.
- **설치 상태 기록** — `.agents/harness-kit.json`(버전·스택·도메인·변형·에이전트·모듈·치환값) + `.agents/harness-kit.lock`(파일별 설치 시점 해시). `hx-agent-add`·`hx-update` 가 이 둘을 읽는다. 커밋 대상이다.

## 스택 (STACK=…)

| STACK | 도메인 | 스택 | 리포 뼈대 | 레이어 강제 | 게이트 |
|---|---|---|---|---|---|
| `jvm`(기본) | — | Kotlin/Java + Spring Boot | 멀티모듈 | Gradle 모듈 그래프(컴파일) + Konsist | `./gradlew check` |
| `python` | — | Python + FastAPI(ASGI) 또는 Django | src 레이아웃(django 변형은 루트) | import-linter 계약 + mypy strict | ruff→mypy→lint-imports→pytest |
| `go` | — | Go + net/http | 표준 Go 레이아웃 | `internal/`·import 사이클(컴파일) + depguard | fmt→build→vet→lint→test -race |
| `web` | `frontend` | TypeScript + React(Next.js/Vite) | 변형별 | **컴파일 강제 없음** — `strict` + ESLint import 경계 | fmt→lint→typecheck→가드→test→build |
| `electron` | `frontend` | TypeScript + Electron | `src/{main,preload,renderer,shared}` 또는 워크스페이스 | 위 + **프로세스 권한 경계**(게이트가 grep 으로 차단) | 위 + 프로세스 경계 가드(`fast`) |

`{{PACKAGE_NS}}` 의미도 스택마다 다르다: jvm=패키지 네임스페이스(`com.example.app`) · python=최상위 패키지명(`myapp`) · go=모듈 경로(`github.com/org/app`) · web=임포트 별칭 루트(`@`) · electron=앱 ID(`com.example.app`, `electron-builder` 의 `appId`).

## 아키텍처 변형 (ARCH=…)

기본값은 스택마다 다르다 — 백엔드 3종 `hexagonal` · `web` `nextjs-app` · `electron` `main-renderer`.

| STACK | 사용 가능한 ARCH | 변형별 강제 규칙이 사는 곳 |
|---|---|---|
| `jvm` | `hexagonal` · `hexagonal-nested` · `hexagonal-standalone` · `layered` · `layered-multimodule` · `modulith` · `feature` · `multimodule` | `ARCHITECTURE.md`(헥사고날 3종=Gradle 모듈 그래프+Konsist — 셋은 공유 범위·모듈 경로 표기만 다름, `hexagonal-standalone`은 컨텍스트당 7모듈·실행 단위 N개라 컨텍스트 간 의존을 구조 테스트가 맡는다 · layered-multimodule=모듈 그래프(레이어 단방향)+ArchUnit 엔티티 누출 테스트 · multimodule=모듈 그래프(등급 단방향)+ArchUnit/Konsist 누출 테스트 · layered/feature=ArchUnit 테스트 · modulith=Spring Modulith `verify()`) |
| `python` | `hexagonal` · `layered` · `modular` · `django` · `ai-service` | `ARCHITECTURE.md`의 `[tool.importlinter]` 계약 골격 → `pyproject.toml` |
| `go` | `hexagonal` · `layered` · `feature` · `flat` | `ARCHITECTURE.md`의 depguard 규칙 골격 → `.golangci.yml` (+ 구조 테스트) |
| `web` | `nextjs-app` · `react-spa` · `feature-sliced` | `ARCHITECTURE.md`의 ESLint 경계 규칙 골격 → `eslint.config.*` (nextjs-app 은 `server-only`/`client-only` 가 유일한 컴파일 강제, feature-sliced 는 `boundaries/element-types` 허용 행렬) |
| `electron` | `main-renderer` · `feature` · `monorepo` | `ARCHITECTURE.md`의 ESLint 경계 규칙 + **프로세스 경계 가드**(`scripts/verify.sh` 내 grep, `fast` 레벨) |

- 스택에 없는 변형을 주면 사용 가능한 목록을 출력하고 `exit 2`로 중단한다(스택 검사와 동일).
- 변형 문서에는 **선택 기준 · 승격 신호 · 전환 절차**가 함께 들어 있다.
- `verify.sh`는 스택당 하나만 두고, 변형 전용 단계는 **파일 존재 감지**로 흡수한다: `manage.py` → Django 점검 + 마이그레이션 드리프트, `evaluation/`·`evals/` + `EVAL_ON_VERIFY=1` → eval 스모크, `scripts/run-guards.sh` → 플랫폼 가드(5개 스택 전부).

## 에이전트 선택 (AGENTS=…, `--agents=`)

템플릿은 **core 와 에이전트 배선**으로 갈린다. core 는 항상, 배선은 고른 것만 깔린다. 묶음은 템플릿 세그먼트로 결정된다.

| 묶음 | 템플릿 세그먼트 | 설치 여부 |
|---|---|---|
| `core` | `agents-rules/` · `agents-docs/` · `agents-root/` · `agents-skills/` · `scripts/` · `tools/` · `docs/` · `root/`(CLAUDE.md 제외) | 항상 |
| `claude` | `claude/` + `root/CLAUDE.md` | 선택 |
| `codex` | `codex/` | 선택 |
| `cursor` | `cursor/` | 선택 |
| `kiro` | `kiro-steering/` + `kiro-skills/` + `kiro-agents/` + `kiro-hooks/` + `kiro-root/` | 선택 |

파일 수는 스택군에 달렸다(`--modules` 제외):

| 스택군 | core | claude | codex | cursor | kiro | 전부 고를 때 |
|---|---|---|---|---|---|---|
| `jvm` · `python` · `go` | 234 | 20 | 8 | 12 | 56 | **330** |
| `web` · `electron` (`frontend` 도메인 +4 core/+4 kiro) | 238 | 20 | 8 | 12 | 60 | **338** |

- 설치 수 = core + 고른 에이전트의 합. 예(백엔드): claude 만 = 217, claude+kiro = 270, `all` = 289.
- 설치 끝에 `tools/docs/feature_docs.py build`가 한 번 돌아 `docs/features/*.html`이 생긴다. 이 생성물은 lock 에 오르지 않는다.
- 감지 순서: 대상 리포의 `.claude/`·`.codex/`·`.cursor/`·`.kiro/` → 실행 CLI 환경변수 → 없으면 `claude`.
- `--list-agents` 로 감지 결과와 파일 수만 출력할 수 있다(설치하지 않는다).
- 나중에 더하려면 `hx-agent-add`. 빼는 기능은 없다 — 디렉터리를 지우고 메타의 `agents` 에서 이름을 뺀다.

## 선택 모듈 (`--modules=`, 기본 `none`)

모듈도 같은 세그먼트 규칙을 따르므로, 고르지 않은 에이전트의 파일은 모듈에서도 깔리지 않는다.

| 모듈 | 파일 | 무엇을 넣나 |
|---|---|---|
| `jira-workflow` | 15 (core 5 · claude 2 · cursor 2 · kiro 6) | `.agents/issue-tracker.yml`(접근 수단·상태·전이 ID·락 설정, 전부 `TBD`) + `issue-tracker-workflow.md`·`issue-agent-lock.md` 규칙 + 슬래시 커맨드 **2종 × 4하네스** — `/hx-issue`(트래커 단품) · `/hx-ticket`(티켓→SDD→구현→리뷰 전 여정) |
| `platform-guards` | 4 (core 3 · kiro 1) | `scripts/run-guards.sh` 실행기 + `scripts/guards/_template.sh` + `platform-invariants.md` 규칙 |
| `multi-harness` | 9 (core 9) | `tools/harness/sync.py`(공통 파일 원본 `tools/harness/shared/` → 등록표 `tools/harness/units.json`의 하네스로 배포, 지문 충돌 거부) · `sync_safety.py`(배포 잠금) · `gates.py`(메인 게이트가 하위 게이트를 부른다) · `install_verification_entry.py` + 시험 5개 |

- `jira-workflow` 핵심: **한 세션 = 한 활성 티켓** · pull gate · **표시 이름이 아니라 ID 로 전이** · 에이전트는 In Review 까지.
  **킷은 트래커 호출 수단을 제공하지 않는다** — MCP·CLI·REST 중 무엇으로 닿을지는 `access` 절에 프로젝트가 적는다.
  `access.method` 나 ID 가 `TBD` 면 커맨드는 **읽기만** 한다. 설정 절차는 킷 스킬 `hx-jira-setup`.
- `platform-guards` 핵심: 불변식을 **문서 → 경고 가드(`# harness-guard-enforce: 0`) → 강제 가드(`: 1`)** 3단으로 승격시킨다.
  `verify.sh` 는 `scripts/run-guards.sh` 존재만 보고 자동으로 부른다 — 배선 작업이 없다.
- 모듈 폴더의 `ABOUT` 첫 줄이 `--list-modules` 의 설명이다. `ABOUT` 은 템플릿이 아니라 **설치되지 않는다**.

## 상태 파일 (설치 후 생김)

| 파일 | 내용 | 읽는 쪽 |
|---|---|---|
| `.agents/harness-kit.json` | `kitVersion` · `domain` · `stack` · `arch` · `agents[]` · `modules[]` · `installedAt`/`updatedAt` · `tokens{}` | `add-agent.sh`(도메인·스택·변형·모듈·치환값 복원) · `update.sh` |
| `.agents/harness-kit.lock` | TSV `sha256 · layer · agent · path` — 설치 시점 원본 해시 | `update.sh`(수정 여부 판별) · `setup.sh` 재실행(해시 승계) |

> lock 의 해시는 **킷이 준 원본**의 것이다. 리포의 현재 내용이 아니다.
> 업데이트가 충돌을 만나도 원본 해시를 그대로 물려주어야, 다음 실행에서도 그 파일이 수정본으로 인식된다.

## 경로 매핑

다섯 템플릿 루트 모두 같은 세그먼트 규칙을 쓴다(공통 → 도메인 → 스택(`arch/` 제외) → `arch/<ARCH>` → 선택 모듈 순으로 복사).

| 템플릿 세그먼트 | 설치 경로 | 계층 |
|---|---|---|
| `<root>/root/` | `./`(프로젝트 루트) | 진입점 맵 |
| `<root>/agents-rules/` | `./.agents/rules/` | **공통 규칙 원본 (전 에이전트 공유)** |
| `<root>/agents-root/` | `./.agents/` | 에이전트 공용 설정 — 역할 원본 `roles/`(planner·explorer·worker·reviewer·docs-researcher) · `verify-checks.json`(경로별 추가 검사) · `issue-tracker.yml` |
| `<root>/agents-docs/` | `./.agents/docs/` | SDD 기록 시스템 |
| `<root>/kiro-steering/` | `./.kiro/steering/` | Kiro 얇은 포인터(원본 아님) + IDE 슬래시 커맨드(`inclusion: manual`) |
| `<root>/kiro-skills/` | `./.kiro/skills/` | Kiro CLI 슬래시 커맨드(포인터) |
| `<root>/kiro-agents/` · `kiro-hooks/` · `kiro-root/` | `./.kiro/agents/` · `./.kiro/hooks/` · `./.kiro/` | Kiro 조율 에이전트·역할 · hook(보호 경로·세션 컨텍스트·검증 게이트) · 안내 |
| `<root>/agents-skills/` | `./.agents/skills/` | **커맨드 본문 원본**. Codex 스킬 탐색 경로이기도 하다(`$<name>` 멘션) |
| `<root>/scripts/` | `./scripts/` | 검증 게이트·SDD 명령·세션 협업·hook·git hook·가드 |
| `<root>/tools/` | `./tools/` | 기능 문서 생성기(`tools/docs/`) |
| `<root>/docs/` | `./docs/` | 기능 문서 원고 골격(`docs/features/_src/` — 설정·catalog·단계 원고) |
| `<root>/claude/` | `./.claude/` | Claude Code 트리거·권한·슬래시 커맨드 |
| `<root>/codex/` | `./.codex/` | Codex 트리거·정책 |
| `<root>/cursor/` | `./.cursor/` | Cursor 프로젝트 슬래시 커맨드 |

## 공통 vs 스택별 (무엇이 어디에 있나)

| 영역 | `templates/common/` (311개) | `templates/domains/frontend/` (8개 · web·electron 만) | `templates/stacks/<stack>/` (변형 무관 14개) | `templates/stacks/<stack>/arch/<변형>/` (4개) |
|---|---|---|---|---|
| 진입점 | `README.md` | — | `AGENTS.md` · `CLAUDE.md` · `.gitignore` · `.github/actions/harness-setup/action.yml` | `root/ARCHITECTURE.md` |
| 규칙 | `agent-harness.md` · `sdd-workflow.md` · `product.md` · `writing-style.md` · `design-principles.md` · `reuse-before-new.md` · `verification-ladder.md` · `pr-review-policy.md` · `git-workflow.md` · `platform-invariants.md` · **`code-maintenance.md`** · **`session-collaboration.md`** · **`approval-vocabulary.md`** | `design-system.md` · `accessibility.md` · `ui-state.md` · `frontend-performance.md` | `code-comments.md` · `api-standards.md` · `security.md` · `reliability.md` · `quality-score.md` · `guardrails.md` | `agents-rules/structure.md` · `agents-rules/tech.md` |
| Kiro 포인터 | agent-harness · sdd-workflow · guardrails · security · api-standards · quality-score · reliability · product · writing-style · **design-principles** · reuse-before-new · verification-ladder · pr-review-policy(`approval-vocabulary` 는 배치 엔진이 `paths` 로 만든다) | design-system · accessibility · ui-state · frontend-performance | `tech.md` · `code-comments.md` | `kiro-steering/structure.md` |
| 스크립트 | `verify-entry.sh`(진입) · `verify-changed.py`(changed 계획) · `check_harness.py` · `new-feature.sh`·`sdd-layout.py`(이슈 SDD) · `check-sdd-prerequisites.sh` · `check-exec-plan-status.sh` · `check-spec-freshness.sh` · `board.sh` · `session-coordination.py` · `check-maintenance.py` · `hooks/` · `git-hooks/` · `guards/` · `harness/`(파이썬 모듈) | — | `verify.sh` (스택 검증 게이트 — 진입 블록이 changed·fast·full 을 가르고 하네스 검사·문서 검사를 부른다) | — |
| SDD 기록 | `agents-docs/` 전체 — 이슈 폴더 템플릿(requirements 정책·화면 표, design §4.3·§4.4·§7.1~7.3, tasks Polish 문서 반영) | — | — | — |
| 기능 문서 | `tools/docs/`(생성기 · 시험 · `site.json` · `vendor.lock.json` · `schema-snapshot.sh`) · `docs/features/_src/`(catalog · 단계 원고) | — | `docs/features/_src/docs.config.json`(스택에 맞는 단위·원본 경로) | — |
| 에이전트 배선 | `claude/`·`codex/`·`kiro-agents/`·`kiro-hooks/` 전체 · 역할 원본 `agents-root/roles/` | — | — | — |
| 슬래시 커맨드(`hx-` 13종) | 원본 `agents-skills/hx-*/SKILL.md` + 포인터 `claude/commands/` · `cursor/commands/` · `kiro-steering/hx-*.md` · `kiro-skills/`(12종 × 5 = 60. `hx-review` 의 하네스 복사본은 배치 엔진이 만든다) | — | — | — |

> 규칙 7종이 스택별인 이유: 주석 표준·보안 위험·신뢰성 패턴·DoD가 언어마다 실제로 다르기 때문이다(주석 규약, 동시성 함정, 커버리지 도구 등).
> 반대로 **레이어 책임은 변형 무관 원칙으로 중립화**해 `guardrails.md`에 두고, 구체 경로·계약은 `structure.md`·`ARCHITECTURE.md`(변형별)로 위임한다.
> `frontend` 도메인 규칙 4종이 스택이 아니라 도메인에 있는 이유: web 과 electron 이 **같은 규약을 쓴다**. 스택에 두면 두 벌이 되고 곧 어긋난다.
> 템플릿 합계 = 271 + 14 + 4 = **289개**(백엔드 3스택) · 271 + 8 + 14 + 4 = **297개**(web·electron).
> 실제 설치 수는 고른 에이전트에 달렸다 — 백엔드 core 198 + (claude 19 · codex 8 · cursor 11 · kiro 53) · 프론트엔드 core 202 + (19 · 8 · 11 · 57).
> 선택 모듈(`jira-workflow` 15 · `platform-guards` 4 · `multi-harness` 9)은 여기에 더해진다.
> 여기에 상태 파일 2개(`harness-kit.json`·`harness-kit.lock`)가 더해진다.
>
> 슬래시 커맨드는 원본 1곳 + 포인터. 본문 원본은 `agents-skills/hx-*/SKILL.md`(설치 위치 `.agents/skills/`)이고
> 스킬이 `.agents/rules/sdd-workflow.md`의 해당 절을 읽는다. Claude·Cursor·Kiro 파일은 원본 description 을 그대로 쓰는 한 줄 포인터다.
> 커맨드 내용을 고치면 스킬 원본을 고친 뒤 `bash tools/sync-commands.sh`로 포인터를 다시 만든다(`--check`는 어긋나면 1).
> 설치본의 `scripts/check_harness.py`가 스킬마다 고른 에이전트의 포인터가 있는지 검사한다.

## 에이전트가 규칙을 공유하는 방식

```
                     ┌──────────────────────────┐
   Claude Code  ──▶  │  .agents/rules/*  (원본)  │  ◀── Codex (AGENTS.md 경유)
   (CLAUDE.md→        │  guardrails · security     │
    AGENTS.md,        │  api-standards · tech ...  │
    session-start)    └──────────▲───────────────┘
                                 │ 포인터
                        .kiro/steering/*  (Kiro 얇은 스텁)
```

- Claude/Codex: `AGENTS.md` 규약 링크표 + `session-start` hook 이 `.agents/rules/` 를 가리킨다.
- Kiro: `.kiro/steering/*`(inclusion: always) 얇은 스텁이 `.agents/rules/*` 원본을 열도록 유도한다.

## 파일별 역할 / 작성 주체

| 설치 경로 | 역할 | 스택별? | 작성 주체 |
|---|---|:---:|---|
| `AGENTS.md` | 에이전트 진입 목차(map) | ✅ | 인간(1회) |
| `CLAUDE.md` | AGENTS.md로 위임하는 얇은 리다이렉트 + 스택 한 줄 | ✅ | 인간(1회) |
| `ARCHITECTURE.md` | **변형별** 아키텍처 원본(레이아웃·의존 방향·기계적 강제 수단·선택 기준·승격 신호·전환 절차·Anti-pattern) | ✅ 변형별 | 인간(1회+갱신) |
| `.github/workflows/harness-verify.yml` · `.gitlab-ci.yml` · `ci/` | CI 템플릿(GitHub Actions · GitLab CI · GoCD) — 검증 단계는 `scripts/verify.sh` 한 곳만 부른다. 스택별 런타임 셋업은 `.github/actions/harness-setup/action.yml` | ✅ | 인간 |
| `README.md` | 사람이 읽는 리포 안내 — 하네스·SDLC 단계·검증 명령·기능 문서 위치 | — | 인간(1회+갱신) |
| `.gitignore` | 프로젝트 위생(스택별 빌드 결과물·캐시) | ✅ | 인간 |
| `.agents/rules/agent-harness.md` | **하네스 규약 원본**(기준 문서·완료 게이트·강제 레이어·1곳+N트리거) | — | 인간 |
| `.agents/rules/sdd-workflow.md` | **SDD 워크플로 원본** — 이슈 폴더 위치·키·승인, SDLC 단계(S1~S8), specify→clarify→checklist→plan→tasks→analyze→implement→docs + `/hx-converge` | — | 인간 |
| `.agents/rules/code-maintenance.md` | 새 코드·리팩터링·리뷰 기준 — 패키지 책임·이름·함수 길이·조건 함수·mapper·OpenAPI·변경 시험 | — | 인간 |
| `.agents/rules/session-collaboration.md` | 동시 세션 협업 — 실제 세션 ID 로 파일 점유 등록·공지·충돌 확인 | — | 인간 |
| `.agents/rules/git-workflow.md` | 브랜치·커밋 형식·이슈와 브랜치 이름, 여러 리포면 두 단계 커밋 | — | 인간 |
| `.agents/rules/product.md` | 제품 정체성·원칙·우선순위·KPI(채우기 템플릿) | — | 인간 |
| `.agents/rules/guardrails.md` | 행동 헌법(추측 금지) + **변형 무관 레이어 책임 원칙** + 언어별 실수 방지 | ✅ | 인간 |
| `.agents/rules/security.md` | 인증/인가 경계·접근 제어 이중 방어선·secret·**언어별 고유 위험** | ✅ | 인간 |
| `.agents/rules/api-standards.md` | envelope·ErrorCode 매핑·예외 변환·요청 검증·OpenAPI | ✅ | 인간 |
| `.agents/rules/design-principles.md` | **설계 원칙 원본**(클린 아키텍처 의존 규칙 · SOLID 5원칙의 위반 신호와 고치는 법 · 캡슐화/Tell-Don't-Ask/합성 · 과잉 설계 방지). 구조가 아니라 **그 구조 안에서 코드를 어떻게 짤지**를 정한다 | — | 인간 |
| `.agents/rules/structure.md` | **변형별** 레이아웃·패키지 컨벤션·통합 규약·착수 워크플로·구조 테스트 | ✅ 변형별 | 인간 |
| `.agents/rules/tech.md` | **변형별** 스택 표·버전 단일 소스·빌드/실행 명령·포트 규약 | ✅ 변형별 | 인간 |
| `.agents/rules/code-comments.md` | 주석 표준(기본은 '없음' — Why·함정·외부 근거·억제 이유·복잡한 함수의 절차) · **언어별 예시**(KDoc/Javadoc · docstring · Go doc) | ✅ | 인간 |
| `.agents/rules/writing-style.md` | 문체 원본 — 스펙·주석·커밋·리포트를 사람이 읽는 글로 (작업 일지·공허한 문장 금지) | — | 인간 |
| `.agents/rules/reuse-before-new.md` | 새로 만들기 전에 이미 있는 것을 찾는다 — 탐색 순서와 "새로 만들어도 되는" 조건 | — | 인간 |
| `.agents/rules/verification-ladder.md` | 주장의 근거 등급 — 실행해 본 것 > 읽어 본 것 > 짐작. 확인하지 않은 것을 확인한 것처럼 말하지 않는다 | — | 인간 |
| `.agents/rules/pr-review-policy.md` | PR 크기·설명·리뷰 지적의 심각도 등급과 머지 기준 | — | 인간 |
| `.agents/rules/{design-system,accessibility,ui-state,frontend-performance}.md` | **`frontend` 도메인 전용**(web·electron). 토큰이 원본 · 시맨틱/키보드/대비/모션 · 상태 4종 분리 · 예산과 측정 | 도메인별 | 인간 |
| `.agents/issue-tracker.yml` | **모듈 `jira-workflow`**. 상태 ID·전이 ID·락 설정. 설치 시 전부 `TBD` — 채우기 전에는 읽기만 한다 | — | 인간 |
| `.agents/rules/{issue-tracker-workflow,issue-agent-lock}.md` | **모듈 `jira-workflow`**. 한 세션 = 한 활성 티켓 · pull gate · ID 로 전이 · 에이전트는 In Review 까지 · 락 획득/갱신/해제 | — | 인간 |
| `scripts/run-guards.sh` + `scripts/guards/_template.sh` | **모듈 `platform-guards`**. `scripts/guards/*.sh` 를 찾아 실행(`_` 로 시작하면 건너뜀). 가드 헤더 `# harness-guard-enforce: 0\|1` 로 경고/강제 구분, `GUARD_ENFORCE` 로 덮어쓴다 | — | 인간 |
| `.agents/rules/platform-invariants.md` | 불변식을 문서 → 경고 가드 → 강제 가드로 승격시키는 절차(공통). 모듈 `platform-guards` 가 실행기를 더한다 | — | 인간 |
| `.agents/rules/reliability.md` | timeout·retry·서킷·멱등·**언어별 동시성 함정** | ✅ | 인간 |
| `.agents/rules/quality-score.md` | 코드품질·Story/Epic DoD·커버리지 도구 | ✅ | 인간 |
| `.kiro/steering/*.md` | 위 원본을 가리키는 **얇은 포인터**(inclusion 유지) | 일부 ✅ | 인간 |
| `.agents/docs/README.md` | 기록 시스템 자기서술 + 4대 축 매핑 | — | 인간 |
| `.agents/docs/_spec-templates/{README, requirements/_template, design/_template, checklists/_template, tasks/{_template,README}}.md` | SDD 단계 템플릿 **원본 한 벌**(복사 원본). requirements 에 정책·화면·기능 문서 칸, design 에 순서도·상태 전이·쿼리→인덱스·캐시·동시성 절, tasks Polish 에 문서 반영 작업이 있다. 이슈 폴더 `issues/<키>-<이름>/` 는 `new-feature.sh` 가 만들고, 단계 문서는 그 단계에 들어갈 때 하나씩 렌더된다(앞에 문서 머리) | — | 인간→에이전트 실행 |
| `.agents/docs/guides/{sdd-pattern,harness-engineering,doc-standards,…}.md` | 사용 안내 — 이슈 SDD 따라 하기, 하네스 구조·검사 표, 문서 작성 기준 | — | 인간 |
| `.agents/docs/decisions/{index,_template,core-beliefs}.md` | 전역 설계 결정(ADR)·핵심 원칙 | — | 인간 |
| `.agents/docs/{specs-index,tech-debt-tracker}.md` | 영역별 이슈 보드·영역 등록표 · 전역 기술부채 | — | 인간 |
| `.agents/docs/generated/README.md` | 에이전트가 만드는 문서 규약(손편집 금지) | — | 에이전트 |
| `.agents/docs/references/README.md` | 압축 참고자료(*-llms.txt) 규약 | — | 인간/에이전트 |
| `scripts/verify.sh` | **단일 강제 지점**(스택별 빌드·린트·타입·아키텍처·테스트 + 변형 전용 조건부 단계). 앞의 진입 블록(`verify-entry.sh`)이 레벨을 가른다 — 기본 `changed`(바뀐 파일에 필요한 검사만, `verify-changed.py`) / `--fast`(구조 점검 + 가벼운 정적 검사) / `--full`(전체, CI) | ✅ | 인간 |
| `scripts/verify-changed.py` + `scripts/harness/verify_*.py` | changed 계획기 — 바뀐 파일·세션 점유 파일로 검사·시험을 고른다. `--plan` 은 실행 없이 계획만, `.agents/verify-checks.json` 의 경로별 검사(기능 문서 검사 등)를 더한다 | — | 인간 |
| `scripts/check_harness.py` | 하네스 검사 — 필수 파일·설정 파싱·포인터(고른 에이전트만)·이슈 문서 머리(`state` · 작업 ID)·키 충돌·옛 구조 동결 | — | 인간 |
| `scripts/session-coordination.py` + `scripts/harness/coordination_*.py` | 동시 세션의 파일 점유(register·claim·release)·공지(inbox·acknowledge)·상태 | — | 인간/에이전트 |
| `scripts/check-maintenance.py` | 코드 유지보수 후보(긴 함수·이름·조건식) 경고. 실패 판정이 아니다 | — | 에이전트 |
| `scripts/board.sh` | SDD 보드(`specs-index.md`의 영역별 표)를 문서 머리로 다시 만든다. `--check` 는 어긋나면 실패, `--area <영역>` 은 그 표만 | — | 도구 |
| `scripts/hooks/{session-start.sh,session-context.py,protect-sources.sh,verify-gate.sh}` | 에이전트 공용 hook 본문 — 세션 컨텍스트 주입 · 보호 경로 쓰기 차단 · 턴 끝 changed 검증 | — | 인간 |
| `scripts/hooks/{protect-approvals.sh,protect_approvals.py}` | 승인 기록 · 기준선 · 관리 페이지 토큰 쓰기, 승인 명령 실행, done 승인 없는 `completed`, `status: approved` 변경을 에이전트 도구에서 막는다 | — | 인간 |
| `scripts/harness/{approve.py,approvals.py,approvals_guard.py,sdd_gates.py}` | 사람 터미널 승인(에이전트 세션 · TTY 아님 거부) · `approvals.md` 파서 · 덧붙이기 전용과 done 승인 검사(pre-commit · fast) · 이슈 게이트 조건 | — | 인간 |
| `scripts/harness/{review.py,review_report.py,review_state.py,mr_comment.py}` | `/hx-review` 의 결정적 부분(입력 모으기 · 지문 · ID · 보고서) · 열린 리뷰 지적 · MR 요약 코멘트 하나(gh · glab) | — | 인간/에이전트 |
| `scripts/git-hooks/{pre-commit,pre-push,global-hook.sh}` + `scripts/install-git-hooks.sh` | git hook — 커밋·push 때 changed 검증. 전역 `core.hooksPath` 가 있어도 리포 hook 을 부르게 건다 | — | 인간 |
| `scripts/guards/{_template,no-secrets-in-env-example}.sh` | 가드 골격과 `.env.example` 비밀 값 검사 | — | 인간 |
| `.agents/roles/{planner,explorer,worker,reviewer,docs-researcher}.md` | 역할 원본. `.claude/agents/`·`.codex/agents/`·`.kiro/agents/` 가 이 원본을 가리킨다 | — | 인간 |
| `.agents/verify-checks.json` | changed 계획기의 경로별 추가 검사(기본: 문서·생성기·소스 경로 → `feature_docs.py check`). `"covers": true` 규칙은 생성물·외부 라이브러리·fixture 경로를 관련 시험 대신 책임진다(사이트 자산 → `check --assets`) | — | 인간 |
| `tools/docs/` | 기능 문서 생성기(`feature_docs.py` · `docskit/` · 시험 · `README.md`). 명령 `build`·`check`·`stats`·`brief`·`refresh openapi|schema|vendor` | — | 인간 |
| `docs/features/_src/{docs.config.json,catalog.json,stages/*.md,features/*.md}` | 기능 문서 원고 — 단위·원본 경로 설정, 영역·기능·배정 규칙, 단계 원고, 기능 원고 | 설정만 ✅ | 인간/에이전트(`/hx-docs`) |
| `docs/features/*.html` · `docs/features/assets/` | 생성물(손편집 금지)과 사이트 자산. Scalar·Mermaid 는 `refresh vendor` 가 `assets/vendor/` 에 받는다 | — | 도구 |
| `scripts/check-exec-plan-status.sh` | tasks 상태(`state`) · 작업 ID · 보드 일관성 검사(전 이슈 순회) | — | 인간 |
| `scripts/new-feature.sh` | 이슈 SDD 단계 문서 스캐폴딩(`_spec-templates/` → `issues/<키>-<이름>/` 에 **그 단계 하나만**). `new-feature.sh <키\|--next> <이름> --area <영역> [--type feat\|fix\|refactor\|perf\|chore\|docs]` · `new-feature.sh <키> --stage=design\|tasks`. 앞 문서 머리가 `status: approved` 가 아니면 거부한다. `--all` · `--legacy` 는 없다 | — | 인간/에이전트 |
| `scripts/check-sdd-prerequisites.sh` | SDD 단계 선행조건 검사(design/tasks/implement). `--stage` 는 공백·등호 두 표기를 받고 모르는 단계는 거부 | — | 에이전트 |
| `scripts/check-spec-freshness.sh` | 스펙이 최신인지 확인하는 리포트(읽기 전용·항상 exit 0). `/hx-converge` 근거 | — | 인간/에이전트 |
| `.claude/settings.json` | 권한(deny: 보호 경로 · 승인 기록 · 기준선 · 토큰) + defaultMode(기본 acceptEdits) + hook 5개 배선(`scripts/hooks/` 를 부른다 — 세션 시작 · 보호 경로 · full 차단 · 승인 보호 · 턴 끝 검증) | — | 인간 |
| `.claude/agents/*.md` · `.claude/rules/*.md` | 역할 다섯(원본 `.agents/roles/`를 가리킨다) · Claude 가 함께 읽는 규칙 포인터 | — | 인간 |
| `.claude/commands/hx-*.md` (12종) | Claude 슬래시 명령 — 스킬 원본을 가리키는 한 줄 포인터 | — | 도구(`sync-commands.sh`) |
| `.codex/{hooks.json,config.toml,agents/*.toml}` | Codex hook 배선(`scripts/hooks/`)·정책·역할 | — | 인간 |
| `.cursor/commands/hx-*.md` (12종) | Cursor 슬래시 명령 — 같은 포인터 | — | 도구 |
| `.kiro/steering/hx-*.md` (12종) | Kiro **IDE** 슬래시 명령(`inclusion: manual`) | — | 도구 |
| `.kiro/skills/hx-*/SKILL.md` (12종) | Kiro **CLI** 슬래시 명령 | — | 도구 |
| `.kiro/agents/*.json` · `.kiro/hooks/*.json` | Kiro 조율 에이전트(`<slug>.json`)와 역할 다섯 · hook 넷(보호 경로·세션 컨텍스트·검증 게이트·full 차단) | — | 인간 |
| `.agents/skills/hx-*/SKILL.md` (11종) | **커맨드 본문 원본**. Codex 는 이 경로를 직접 읽는다(`$hx-specify` 로 멘션, `/skills` 로 목록) | — | 인간 |
| `.agents/harness-kit.json` | 설치 메타 — 킷 버전·스택·변형·에이전트·치환값. `hx-agent-add`·`hx-update` 의 입력 | — | 도구(손편집 금지) |
| `.agents/harness-kit.lock` | 파일별 설치 시점 원본 해시(TSV). 업데이트가 사용자 수정본을 가려내는 근거 | — | 도구(손편집 금지) |

## 치환 토큰

| 토큰 | 의미 | setup.sh 치환 |
|---|---|:---:|
| `{{PROJECT_NAME}}` | 제품 표시명 | ✅ |
| `{{PROJECT_SLUG}}` | 리포/모듈 슬러그(기본=대상 폴더명) | ✅ |
| `{{ISSUE_KEY}}` `{{AREA}}` `{{TYPE}}` `{{TITLE}}` `{{CREATED}}` `{{PRODUCT_SLUG}}` | 이슈 키 · 영역 · 종류 · 제목 · 날짜. 설치 시점에는 정해지지 않는다 — `_spec-templates/` 안에 남아 있다가 `new-feature.sh <키\|--next> <이름> --area <영역>` 이 문서를 만들 때 채운다(`{{PRODUCT_SLUG}}` 는 영역) | ❌(그대로 유지) |
| `{{PACKAGE_NS}}` | **스택별 의미 상이** — jvm=`com.example.app` · python=`myapp` · go=`github.com/org/app` · web=임포트 별칭 루트(`@`) · electron=앱 ID(`com.example.app`) | ✅ |
| `{{SERVICE_NAME}}` | 배포 단위명(단일=프로젝트명) | ✅ |
| `{{PRIMARY_LANGUAGE}}` `{{BUILD_TOOL}}` `{{TEST_CMD}}` | 스택 기본값 자동 설정(환경변수로 덮어쓰기 가능) | ✅ |
| `{{PROTECTED_PATH}}` | 수정 금지 참고 경로(기본 `docs/references`) | ✅ |
| `{{DOMAIN_EXAMPLE}}` | 예시 바운디드 컨텍스트명 | ✅(값 제공 시) |
| `{{EPIC_ID}}` `{{FEATURE_NAME}}` | 스펙/계획 작성 시 채우는 토큰 | ❌(그대로 유지) |

> 스택 구성(프레임워크·빌드 도구)은 플레이스홀더가 아니라 스택 템플릿에 구체적으로 박혀 있다. 버전은 `.agents/rules/tech.md` 의 "기준 버전"을 프로젝트에 맞게 조정한다.
> 설치 후 `grep -rn '{{' . | grep -vE '_spec-templates/|\{\{\.\.\.\}\}|PRODUCT_SLUG'` 로 미치환 토큰을 확인해 채운다.
> `_spec-templates/` 와 안내 문구의 리터럴 `{{...}}` 는 의도적으로 남기는 토큰이라 제외하고 본다.
