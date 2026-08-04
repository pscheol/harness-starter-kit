# 하네스 스타터 킷 (harness-starter-kit)

**백엔드 단일 프로젝트용 하네스 엔지니어링 초기 설정 킷.** 스택은 **JVM(Kotlin/Java + Spring) · Python(FastAPI/ASGI) · Go(표준 Go 레이아웃)** 중에서 고른다.
하네스 골격은 한 벌만 두고, 언어별 아키텍처·컨벤션·검증 게이트를 오버레이로 얹는 구조다.

> 하네스 = AI 에이전트가 안전하고 예측 가능하게 일하도록 "장착"하는 제어 구조.

## 설계 원칙

1. **규칙은 공통 정본 한 곳** — 가드레일·보안·API 표준·기술 규약을 `.agents/rules/` 에 두고 **Claude Code · Codex · Kiro 3개 에이전트가 공유**한다.
2. **Kiro steering = 얇은 포인터** — `.kiro/steering/*` 는 규칙 본문 대신 `.agents/rules/*` 정본을 가리키기만 한다.
3. **단일 프로젝트** — 멀티 서비스/2계층 없음.
4. **스택 오버레이** — `templates/common/`(스택 무관, 51개) + `templates/stacks/<stack>/`(언어 전용·변형 무관, 각 13개). 주석 표준·보안 위험·검증 게이트는 스택마다 다르게 깔린다.
5. **아키텍처 변형** — 한 스택 안에서도 레이아웃은 하나가 아니다. 아키텍처에 종속되는 파일은 **4개뿐**이라 `templates/stacks/<stack>/arch/<variant>/`에 그 4개만 두고 선택한 하나를 얹는다. **설치 결과는 변형과 무관하게 104개**로 같다.

## 지원 스택

| STACK | 스택 | 리포 뼈대 | 레이어 강제(기계) | 검증 게이트 |
|---|---|---|---|---|
| `jvm`(기본) | Kotlin/Java + Spring Boot | 단일 모듈 또는 멀티모듈(변형에 따름) | 변형별: Gradle 모듈 그래프(컴파일)+Konsist · ArchUnit · Spring Modulith | `./gradlew check` |
| `python` | Python + FastAPI(ASGI) 또는 Django | src 레이아웃(django 변형은 프로젝트 루트) | **import-linter 계약** + mypy strict | ruff → mypy → lint-imports → pytest |
| `go` | Go + net/http | [표준 Go 레이아웃](https://github.com/golang-standards/project-layout) (`cmd/`·`internal/`·`pkg/`·`api/`…) | `internal/` 가시성·import 사이클(컴파일) + **depguard** | gofmt → build → vet → golangci-lint → test -race |

컴파일러가 레이어를 막아주지 않는 언어(Python)에서는 **린터 계약이 컴파일 강제를 대신한다**는 것이 설계의 핵심이다. Go는 `internal/`과 import 사이클을 컴파일러가 막고, 방향만 depguard가 채운다.

## 아키텍처 변형 (ARCH=…, 기본 `hexagonal`)

| STACK | ARCH | 레이아웃 | 강제 규칙 |
|---|---|---|---|
| `jvm` | `hexagonal` | (멀티모듈) `bootstrap`·`common`·`core` + `domain/<ctx>/{domain,application,primary,infra}` | Gradle 모듈 그래프 + Konsist |
| `jvm` | `layered` | (단일 모듈) `{config,common,controller/{docs,dto},service,repository,entity}` | ArchUnit `layeredArchitecture()` + 건너뛰기 금지 |
| `jvm` | `modulith` | (단일 모듈) `shared/` + `<module>/{공개 API 루트 타입, internal/…}` | Spring Modulith `ApplicationModules.verify()` |
| `jvm` | `feature` | (단일 모듈) `config`·`common` + `<feature>/{api,web,service,repository,domain}` | ArchUnit 슬라이스(순환 금지·기능 독립) |
| `jvm` | `multimodule` | (멀티모듈) **분할 축·이름은 프로젝트가 결정** — 등급만 고정: 실행(1) → 구성(N) → 공유 | Gradle 모듈 그래프 + ArchUnit/Konsist(엔티티·SDK 타입 누출 차단) |
| `python` | `hexagonal` | `src/<pkg>/{core,common,bootstrap}` + `<ctx>/{domain,application,primary,infra}` | layers 2종 + forbidden + independence |
| `python` | `layered` | `src/<pkg>/{core,api,schemas,services,repositories,models}` + `main.py` | `layers = [api, services, repositories, models]` + forbidden |
| `python` | `modular` | `src/<pkg>/shared/` + `modules/<feature>/{router,schema,service,repository,model}.py` | `independence`(모듈 간) + 모듈 내부 `layers` |
| `python` | `django` | `config/settings/*` + `<pkg>/<app>/{models,selectors,services,serializers,views,urls}.py` | `layers = [views, "services : selectors", models]` + `independence`(앱 간) |
| `python` | `ai-service` | `src/<pkg>/{api,pipelines,agents,llm,retrieval,prompts,domain,observability,…}` + `evaluation/` | `layers = [api, pipelines, agents, "llm : retrieval", domain]` + 프로바이더 SDK 격리 |
| `go` | `hexagonal` | `cmd/` + `internal/<ctx>/{domain,app,primary/http,infra}` | depguard 3종 |
| `go` | `layered` | `cmd/` + `internal/{config,database,logger,middleware,handler,service,repository,model}` | 레이어 방향 + **handler↛repository**(건너뛰기 금지) |
| `go` | `feature` | `cmd/` + `internal/platform/*` + `internal/<feature>/{handler,service,store,model}.go` | **기능 패키지 간 직접 import 금지**(depguard + 구조 테스트) |
| `go` | `flat` | `cmd/<binary>/main.go` + `internal/app/{config,handler,service,store,model}.go` | 최소 규칙 + **파일 수 상한 감시**(승격 신호) |

각 변형의 `ARCHITECTURE.md`에는 **언제 쓰나/언제 아닌가** · **승격 신호** · **다른 변형으로 전환하는 절차**가 함께 들어 있다.
`django`는 마이그레이션 드리프트 체크, `ai-service`는 eval 스모크가 `verify.sh`의 **조건부 단계**로 자동 붙는다(파일 존재 감지 기반 — 스크립트는 스택당 하나).

## 구성

```
skills/harness-bootstrap/          ← 스킬 루트 (= SKILL_DIR)
├── README.md · SKILL.md · setup.sh · manifest.md
├── tools/sync-commands.sh         킷 개발용 — 커맨드 정본에서 3하네스 트리 재생성(설치 안 됨)
└── templates/
    ├── common/           ★ 스택 무관 골격 (모든 스택 공통 설치)
    │   ├── agents-rules/  agent-harness · sdd-workflow · product
    │   ├── agents-docs/   SDD 기록 (README · specs-index · product-<slug>-specs/{requirements,design,checklists,tasks} · decisions · tech-debt-tracker · generated · references)
    │   ├── kiro-steering/ 규칙 포인터 8종 + hx-* 9종(Kiro IDE 슬래시 · inclusion: manual)
    │   ├── kiro-skills/   hx-*/SKILL.md 9종 (Kiro CLI 슬래시)
    │   ├── agents-skills/ hx-*/SKILL.md 9종 (Codex — $hx-specify 로 멘션)
    │   ├── claude/        settings.json · commands/(hx- 9종) · hooks/
    │   ├── codex/         hooks.json · config.toml · hooks/
    │   ├── cursor/        commands/(hx- 9종) — Cursor 프로젝트 슬래시
    │   ├── scripts/       check-exec-plan-status · check-sdd-prerequisites · check-spec-freshness · new-feature
    │   └── root/          .pre-commit-config.yaml
    └── stacks/
        ├── jvm/     root(AGENTS·CLAUDE·.gitignore·CI) · agents-rules 6종 · kiro-steering 2종 · scripts/verify.sh
        │   └── arch/{hexagonal,layered,modulith,feature,multimodule}/{root/ARCHITECTURE.md, agents-rules/{structure,tech}.md, kiro-steering/structure.md}
        ├── python/  (동일 구성) + arch/{hexagonal,layered,modular,django,ai-service}/
        └── go/      (동일 구성) + arch/{hexagonal,layered,feature,flat}/
```

스택별 6종 규칙(변형 무관): `code-comments` · `api-standards` · `security` · `reliability` · `quality-score` · `guardrails`.
변형별 4종: `root/ARCHITECTURE.md` · `agents-rules/structure.md` · `agents-rules/tech.md` · `kiro-steering/structure.md`.
설치 순서는 **common → stack(`arch/` 제외) → arch/&lt;ARCH&gt;** 이며, 뒤 레이어가 앞을 덮는다.

## 슬래시 커맨드 (4개 하네스)

SDD 워크플로 9종이 `hx-` 접두사로 깔린다. **본문 정본은 `.agents/rules/sdd-workflow.md` 한 곳**이고, 각 하네스 파일은 그 절을 가리키는 얇은 트리거다.

| 하네스 | 설치 경로 | 호출 |
|---|---|---|
| Claude Code | `.claude/commands/hx-*.md` | `/hx-specify` |
| Cursor | `.cursor/commands/hx-*.md` | `/hx-specify` |
| Kiro (IDE) | `.kiro/steering/hx-*.md` (`inclusion: manual`) | 슬래시 메뉴에서 선택 |
| Kiro (CLI) | `.kiro/skills/hx-*/SKILL.md` | `/hx-specify` |
| Codex | `.agents/skills/hx-*/SKILL.md` | `$hx-specify` (목록은 `/skills`) |

흐름: `/hx-specify` → (`/hx-clarify` · `/hx-checklist`) → `/hx-plan` → `/hx-tasks` → (`/hx-analyze`) → `/hx-implement` → (`/hx-converge`). 별도로 `/hx-harness` 가 규칙을 로드한다.

> **Codex 주의** — 프로젝트 로컬 `.codex/prompts/` 는 탐색 경로가 아니다(유저 홈 전용 + deprecated). 그래서 Codex 공식 프로젝트 스킬 경로인 `.agents/skills/` 를 쓴다.
>
> **커맨드를 고칠 때** — `templates/common/claude/commands/hx-*.md` 만 고치고 `tools/sync-commands.sh` 를 실행해 나머지 3하네스를 재생성한다. 직접 고치면 드리프트가 생긴다.

## 규칙 공유 흐름

```
Claude Code ─(CLAUDE.md→AGENTS.md, session-start)─┐
Codex ──────(AGENTS.md)───────────────────────────┼─▶  .agents/rules/*  (정본)
Kiro ───────(.kiro/steering/* 얇은 포인터)─────────┘
```

## 빠른 시작

```bash
# 이 스킬 폴더의 절대경로 (플러그인 설치본은 대상 리포 바깥에 있다)
SKILL_DIR=/path/to/skills/harness-bootstrap

# 미리보기(아무것도 쓰지 않음)
bash "$SKILL_DIR/setup.sh" --dry-run --stack=python --arch=modular /path/to/project

# 실제 스캐폴딩
STACK=python ARCH=modular PROJECT_NAME="MyApp" PROJECT_SLUG="my-app" PACKAGE_NS="myapp" \
  bash "$SKILL_DIR/setup.sh" /path/to/project

# 설치 후
cd /path/to/project
grep -rn '{{' . --include='*.md' --include='*.sh'   # 미치환 토큰 확인
$EDITOR .agents/rules/tech.md                        # 기준 스택 버전을 프로젝트에 맞게 조정
bash scripts/verify.sh                               # 게이트 통과 확인
```

`PACKAGE_NS`는 스택마다 의미가 다르다: **jvm**=`com.example.myapp`(패키지) · **python**=`myapp`(최상위 패키지 → `src/myapp/`) · **go**=`github.com/org/my-app`(모듈 경로).

`ARCH`는 기본 `hexagonal`이다. 스택에 없는 변형을 주면 사용 가능한 목록을 출력하고 `exit 2`로 중단한다.

기본은 **덮어쓰지 않음**(기존 파일 skip). 재생성은 `--force`, 미리보기는 `--dry-run`.

## 하네스 4대 축 (킷이 강제)

1. **규칙·헌법·가드레일** — 진입점은 목차(`AGENTS.md`/`CLAUDE.md` 짧게), 규칙 정본은 `.agents/rules/`, 기록은 `.agents/docs/`. "추측 금지" 헌법.
2. **아키텍처 제약·스캐폴딩** — `ARCHITECTURE.md`가 스택별 의존 방향과 **기계적 강제 수단**을 정의 + `product-<slug>-specs/tasks/_template.md` 작업 지시서(추적성·DoD·결정 로그).
3. **검증·피드백 루프** — 강제는 `scripts/verify.sh` **한 곳**, hook/CI/pre-commit 은 트리거만("1곳 + N트리거"). exec-plan 완료 게이트(active→check→**사용자 승인**→completed).
4. **엔트로피 관리** — `tech-debt-tracker.md`, `generated/`·`references/` 신선도 규약.

## 스택 노트

- **jvm** — Kotlin/Java · Spring Boot · Gradle(Kotlin DSL, `libs.versions.toml`) · JPA/ORM · 마이그레이션 도구 · Spring Security · ktlint/detekt. 멀티모듈 변형(`hexagonal`=컨텍스트당 4모듈 고정 규격, `multimodule`=분할 축 자유·등급 방향만 강제)은 의존 방향을 Gradle 모듈 경계로 컴파일 타임 강제하고, 단일 모듈 변형(`layered`·`modulith`·`feature`)은 구조 테스트가 강제를 담당한다. 빌드 DSL은 Java=Groovy·Kotlin=Kotlin DSL, 버전은 `libs.versions.toml` 단일 소스. 응답은 공통 envelope.
- **python** — Python 3.12+ · FastAPI · SQLAlchemy 2.0(async) + Alembic · Pydantic v2(경계 전용) · uv · Ruff · mypy strict · pytest · import-linter. 도메인은 프레임워크 무의존(계약 린터가 강제), async 규약(blocking 금지·timeout 필수)을 규칙으로 못박음.
- **go** — Go 1.22+ · net/http · pgx/`database/sql` · golang-migrate/goose · `log/slog` · gofumpt · golangci-lint(depguard·gosec 등) · `go test -race`. 인터페이스는 소비자(`app`)가 선언, 에러는 값으로 전파(`%w`), 고루틴에는 소유자와 종료 조건.

각 스택의 `ARCHITECTURE.md`에 레이어 표·Anti-pattern·성능 예산·TDD 워크플로가 들어 있다.

## Claude Code / Codex 스킬로 재사용

이 폴더는 `harness-kit` 플러그인의 `harness-bootstrap` 스킬 본체다. 두 하네스 모두 같은 파일을 읽는다.
설치 방법은 저장소 루트의 [README.md](../../../../README.md) 참고.

## 관련 문서

- 파일→경로 맵·공통/스택 분리: `./manifest.md`
