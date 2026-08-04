# 매니페스트 — 무엇이 어디에 설치되나 (v3 · 단일 프로젝트 · 다중 스택)

`setup.sh` 가 **`templates/common/`(스택 무관) + `templates/stacks/<STACK>/`(스택 전용, `arch/` 제외) + `templates/stacks/<STACK>/arch/<ARCH>/`(아키텍처 변형 전용)** 을 이 순서로 아래 프로젝트 표준 경로에 복사한다. 뒤 레이어가 앞을 덮는다.

핵심 설계(v3):
- **규칙 정본은 공통** — 가드레일·보안·API 표준 등 규칙은 `.agents/rules/` **한 곳**에 두고 Claude Code·Codex·Kiro **3개 에이전트가 공유**한다.
- **Kiro steering은 얇은 포인터** — `.kiro/steering/*` 는 규칙 본문을 담지 않고 `.agents/rules/*` 정본을 가리키기만 한다.
- **단일 프로젝트** — 멀티 서비스/2계층 없음.
- **스택 오버레이** — 하네스 골격(SDD·게이트 구조·에이전트 배선)은 한 벌, 언어 종속 규약(컨벤션·주석·보안·검증 명령)만 스택별로 갈아 끼운다.
- **아키텍처 변형 레이어** — 아키텍처에 종속되는 파일은 **4개뿐**(`ARCHITECTURE.md`·`agents-rules/structure.md`·`agents-rules/tech.md`·`kiro-steering/structure.md`)이다. 이 4개만 `arch/<variant>/`에 두고 **선택한 하나만 설치**하므로 조합이 늘어도 설치 파일 수는 **104개로 불변**이다.

## 스택 (STACK=…)

| STACK | 스택 | 리포 뼈대 | 레이어 강제 | 게이트 |
|---|---|---|---|---|
| `jvm`(기본) | Kotlin/Java + Spring Boot | 멀티모듈 | Gradle 모듈 그래프(컴파일) + Konsist | `./gradlew check` |
| `python` | Python + FastAPI(ASGI) 또는 Django | src 레이아웃(django 변형은 루트) | import-linter 계약 + mypy strict | ruff→mypy→lint-imports→pytest |
| `go` | Go + net/http | 표준 Go 레이아웃 | `internal/`·import 사이클(컴파일) + depguard | fmt→build→vet→lint→test -race |

`{{PACKAGE_NS}}` 의미도 스택마다 다르다: jvm=패키지 네임스페이스(`com.example.app`) · python=최상위 패키지명(`myapp`) · go=모듈 경로(`github.com/org/app`).

## 아키텍처 변형 (ARCH=…, 기본 `hexagonal`)

| STACK | 사용 가능한 ARCH | 변형별 강제 규칙이 사는 곳 |
|---|---|---|
| `jvm` | `hexagonal` · `layered` · `modulith` · `feature` · `multimodule` | `ARCHITECTURE.md`(hexagonal=Gradle 모듈 그래프+Konsist · multimodule=Gradle 모듈 그래프(등급 단방향)+ArchUnit/Konsist 누출 테스트 · layered/feature=ArchUnit 테스트 · modulith=Spring Modulith `verify()`) |
| `python` | `hexagonal` · `layered` · `modular` · `django` · `ai-service` | `ARCHITECTURE.md`의 `[tool.importlinter]` 계약 골격 → `pyproject.toml` |
| `go` | `hexagonal` · `layered` · `feature` · `flat` | `ARCHITECTURE.md`의 depguard 규칙 골격 → `.golangci.yml` (+ 구조 테스트) |

- 스택에 없는 변형을 주면 사용 가능한 목록을 출력하고 `exit 2`로 중단한다(스택 검사와 동일).
- 변형 문서에는 **선택 기준 · 승격 신호 · 전환 절차**가 함께 들어 있다.
- `verify.sh`는 스택당 하나만 두고, 변형 전용 단계는 **파일 존재 감지**로 흡수한다: `manage.py` → Django 점검 + 마이그레이션 드리프트, `evaluation/`·`evals/` + `EVAL_ON_VERIFY=1` → eval 스모크.

## 경로 매핑

세 템플릿 루트 모두 같은 세그먼트 규칙을 쓴다(공통 → 스택(`arch/` 제외) → `arch/<ARCH>` 순으로 복사).

| 템플릿 세그먼트 | 설치 경로 | 계층 |
|---|---|---|
| `<root>/root/` | `./`(프로젝트 루트) | 진입점 맵 |
| `<root>/agents-rules/` | `./.agents/rules/` | **공통 규칙 정본 (3 에이전트 공유)** |
| `<root>/agents-docs/` | `./.agents/docs/` | SDD 기록 시스템(SSOT) |
| `<root>/kiro-steering/` | `./.kiro/steering/` | Kiro 얇은 포인터(정본 아님) + IDE 슬래시 커맨드(`inclusion: manual`) |
| `<root>/kiro-skills/` | `./.kiro/skills/` | Kiro CLI 슬래시 커맨드 |
| `<root>/agents-skills/` | `./.agents/skills/` | **Codex 스킬 탐색 경로**(`$<name>` 멘션) |
| `<root>/scripts/` | `./scripts/` | 강제 스크립트 |
| `<root>/claude/` | `./.claude/` | Claude Code 트리거·권한·슬래시 커맨드 |
| `<root>/codex/` | `./.codex/` | Codex 트리거·정책 |
| `<root>/cursor/` | `./.cursor/` | Cursor 프로젝트 슬래시 커맨드 |

## 공통 vs 스택별 (무엇이 어디에 있나)

| 영역 | `templates/common/` (87개) | `templates/stacks/<stack>/` (변형 무관 13개) | `templates/stacks/<stack>/arch/<변형>/` (4개) |
|---|---|---|---|
| 진입점 | `.pre-commit-config.yaml` | `AGENTS.md` · `CLAUDE.md` · `.gitignore` · `.github/workflows/verify.yml` | `root/ARCHITECTURE.md` |
| 규칙 | `agent-harness.md` · `sdd-workflow.md` · `product.md` | `code-comments.md` · `api-standards.md` · `security.md` · `reliability.md` · `quality-score.md` · `guardrails.md` | `agents-rules/structure.md` · `agents-rules/tech.md` |
| Kiro 포인터 | agent-harness · sdd-workflow · guardrails · security · api-standards · quality-score · reliability · product | `tech.md` · `code-comments.md` | `kiro-steering/structure.md` |
| 스크립트 | `check-exec-plan-status.sh` · `check-sdd-prerequisites.sh` · `check-spec-freshness.sh` · `new-feature.sh` | `verify.sh` (스택 게이트 정본 — 변형 단계는 존재 감지로 흡수) | — |
| SDD 기록 | `agents-docs/` 전체 | — | — |
| 에이전트 배선 | `claude/`·`codex/` 전체 | — | — |
| 슬래시 커맨드(`hx-` 9종) | `claude/commands/` · `cursor/commands/` · `kiro-steering/hx-*.md` · `kiro-skills/` · `agents-skills/` (4하네스 × 9 = 36) | — | — |

> 규칙 7종이 스택별인 이유: 주석 표준·보안 위험·신뢰성 패턴·DoD가 언어마다 실제로 다르기 때문이다(주석 규약, 동시성 함정, 커버리지 도구 등).
> 반대로 **레이어 책임은 변형 무관 원칙으로 중립화**해 `guardrails.md`에 두고, 구체 경로·계약은 `structure.md`·`ARCHITECTURE.md`(변형별)로 위임한다.
> 설치 합계 = 87 + 13 + 4 = **104개**(모든 스택·변형 동일).
>
> **슬래시 커맨드는 정본 1곳 + 4하네스 트리거.** 본문 정본은 `.agents/rules/sdd-workflow.md` 하나이고,
> `claude/commands/hx-*.md` 9종을 원본으로 나머지 3하네스(Cursor·Kiro·Codex) 트리를 **같은 본문으로 파생**시킨다.
> 커맨드 내용을 고치면 `claude/commands/` 를 고친 뒤 파생 트리를 다시 생성한다(드리프트 방지).

## 3개 에이전트가 규칙을 공유하는 방식

```
                     ┌──────────────────────────┐
   Claude Code  ──▶  │  .agents/rules/*  (정본)  │  ◀── Codex (AGENTS.md 경유)
   (CLAUDE.md→        │  guardrails · security     │
    AGENTS.md,        │  api-standards · tech ...  │
    session-start)    └──────────▲───────────────┘
                                 │ 포인터
                        .kiro/steering/*  (Kiro 얇은 스텁)
```

- Claude/Codex: `AGENTS.md` 규약 링크표 + `session-start` hook 이 `.agents/rules/` 를 가리킨다.
- Kiro: `.kiro/steering/*`(inclusion: always) 얇은 스텁이 `.agents/rules/*` 정본을 열도록 유도한다.

## 파일별 역할 / 작성 주체

| 설치 경로 | 역할 | 스택별? | 작성 주체 |
|---|---|:---:|---|
| `AGENTS.md` | 에이전트 진입 목차(map) | ✅ | 인간(1회) |
| `CLAUDE.md` | AGENTS.md로 위임하는 얇은 리다이렉트 + 스택 한 줄 | ✅ | 인간(1회) |
| `ARCHITECTURE.md` | **변형별** 아키텍처 정본(레이아웃·의존 방향·기계적 강제 수단·선택 기준·승격 신호·전환 절차·Anti-pattern) | ✅ 변형별 | 인간(1회+갱신) |
| `.github/workflows/verify.yml` | CI 트리거(얇음) — `scripts/verify.sh` 한 곳만 호출(런타임 셋업만 스택별) | ✅ | 인간 |
| `.pre-commit-config.yaml` | 로컬 pre-push 트리거(얇음) — `scripts/verify.sh` 한 곳만 호출 | — | 인간 |
| `.gitignore` | 프로젝트 위생(스택별 빌드 산출물·캐시) | ✅ | 인간 |
| `.agents/rules/agent-harness.md` | **하네스 규약 정본**(SSOT·완료 게이트·강제 레이어·1곳+N트리거) | — | 인간 |
| `.agents/rules/sdd-workflow.md` | **SDD 워크플로 정본**(specify→clarify→checklist→plan→tasks→analyze→implement + `/hx-converge`) | — | 인간 |
| `.agents/rules/product.md` | 제품 정체성·원칙·우선순위·KPI(채우기 템플릿) | — | 인간 |
| `.agents/rules/guardrails.md` | 행동 헌법(추측 금지) + **변형 무관 레이어 책임 원칙** + 언어별 실수 방지 | ✅ | 인간 |
| `.agents/rules/security.md` | 인증/인가 경계·접근 제어 이중 방어선·secret·**언어별 고유 위험** | ✅ | 인간 |
| `.agents/rules/api-standards.md` | envelope·ErrorCode 매핑·예외 변환·요청 검증·OpenAPI | ✅ | 인간 |
| `.agents/rules/structure.md` | **변형별** 레이아웃·패키지 컨벤션·통합 규약·착수 워크플로·구조 테스트 | ✅ 변형별 | 인간 |
| `.agents/rules/tech.md` | **변형별** 스택 표·버전 단일 소스·빌드/실행 명령·포트 규약 | ✅ 변형별 | 인간 |
| `.agents/rules/code-comments.md` | 주석 표준(책임+Why+처리 흐름) · **언어별 예시**(KDoc/Javadoc · docstring · Go doc) | ✅ | 인간 |
| `.agents/rules/reliability.md` | timeout·retry·서킷·멱등·**언어별 동시성 함정** | ✅ | 인간 |
| `.agents/rules/quality-score.md` | 코드품질·Story/Epic DoD·커버리지 도구 | ✅ | 인간 |
| `.kiro/steering/*.md` | 위 정본을 가리키는 **얇은 포인터**(inclusion 유지) | 일부 ✅ | 인간 |
| `.agents/docs/README.md` | 기록 시스템 자기서술 + 4대 축 매핑 | — | 인간 |
| `.agents/docs/product-<slug>-specs/{index, requirements/_template, design/_template, checklists/_template, tasks/{_template,README}}.md` | 제품 단위 SDD 색인·템플릿·완료 게이트 | — | 인간→에이전트 실행 |
| `.agents/docs/decisions/{index,_template,core-beliefs}.md` | 전역 설계 결정(ADR)·핵심 신념 | — | 인간 |
| `.agents/docs/{specs-index,tech-debt-tracker}.md` | 전 제품 스펙 색인·전역 기술부채 | — | 인간 |
| `.agents/docs/generated/README.md` | 에이전트 생성 산출물 규약(손편집 금지) | — | 에이전트 |
| `.agents/docs/references/README.md` | 압축 참고자료(*-llms.txt) 규약 | — | 인간/에이전트 |
| `scripts/verify.sh` | **단일 강제 지점**(스택별 빌드·린트·타입·아키텍처·테스트 + 변형 전용 조건부 단계) | ✅ | 인간 |
| `scripts/check-exec-plan-status.sh` | exec-plan(tasks) 위치↔상태 일관성 검사(전 제품 순회) | — | 인간 |
| `scripts/new-feature.sh` | SDD 기능 스캐폴딩(req/design/tasks 3종 생성) | — | 인간/에이전트 |
| `scripts/check-sdd-prerequisites.sh` | SDD 단계 선행조건 검사(design/tasks/implement) | — | 에이전트 |
| `scripts/check-spec-freshness.sh` | 스펙 신선도 리포트(읽기 전용·항상 exit 0). `/hx-converge` 근거 | — | 인간/에이전트 |
| `.claude/settings.json` | 권한(deny) + defaultMode(기본 acceptEdits) + hook 3종 배선 | — | 인간 |
| `.claude/commands/hx-harness.md` | `/hx-harness` 규칙 로드 명령 | — | 인간 |
| `.claude/commands/hx-{specify,clarify,checklist,plan,tasks,analyze,implement,converge}.md` | SDD 슬래시 명령(얇은 트리거 → `sdd-workflow.md` 정본) | — | 인간 |
| `.claude/hooks/{verify,protect-sources,session-start}.sh` | Stop·PreToolUse·SessionStart 트리거 | — | 인간 |
| `.codex/{hooks.json,config.toml}` + `hooks/*.sh` | Codex용 동일 트리거·정책 | — | 인간 |
| `.cursor/commands/hx-*.md` (9종) | Cursor 슬래시 명령 — 같은 얇은 트리거 | — | 인간 |
| `.kiro/steering/hx-*.md` (9종) | Kiro **IDE** 슬래시 명령(`inclusion: manual`) | — | 인간 |
| `.kiro/skills/hx-*/SKILL.md` (9종) | Kiro **CLI** 슬래시 명령 | — | 인간 |
| `.agents/skills/hx-*/SKILL.md` (9종) | **Codex** 스킬(`$hx-specify` 로 멘션, `/skills` 로 목록) | — | 인간 |

## 치환 토큰

| 토큰 | 의미 | setup.sh 치환 |
|---|---|:---:|
| `{{PROJECT_NAME}}` | 제품 표시명 | ✅ |
| `{{PROJECT_SLUG}}` | 리포/모듈 슬러그(기본=대상 폴더명) | ✅ |
| `{{PRODUCT_SLUG}}` | 제품/바운디드 컨텍스트 슬러그(기본=PROJECT_SLUG). SDD 폴더 `product-<slug>-specs` 경로에 사용 | ✅ |
| `{{PACKAGE_NS}}` | **스택별 의미 상이** — jvm=`com.example.app` · python=`myapp` · go=`github.com/org/app` | ✅ |
| `{{SERVICE_NAME}}` | 배포 단위명(단일=프로젝트명) | ✅ |
| `{{PRIMARY_LANGUAGE}}` `{{BUILD_TOOL}}` `{{TEST_CMD}}` | 스택 기본값 자동 설정(환경변수로 덮어쓰기 가능) | ✅ |
| `{{PROTECTED_PATH}}` | 수정 금지 참고 경로(기본 `docs/references`) | ✅ |
| `{{DOMAIN_EXAMPLE}}` | 예시 바운디드 컨텍스트명 | ✅(값 제공 시) |
| `{{EPIC_ID}}` `{{FEATURE_NAME}}` | 스펙/계획 작성 시 채우는 토큰 | ❌(그대로 유지) |

> 스택 구성(프레임워크·빌드 도구)은 플레이스홀더가 아니라 스택 템플릿에 구체적으로 박혀 있다. 버전은 `.agents/rules/tech.md` 의 "기준 버전"을 프로젝트에 맞게 조정한다.
> 설치 후 `grep -rn '{{' .` 로 미치환 토큰을 확인해 채운다(안내 문구의 리터럴 `{{...}}` 는 예외).
