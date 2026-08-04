---
name: harness-bootstrap
description: 백엔드 단일 프로젝트에 하네스 엔지니어링 기본 골격을 스캐폴딩한다. 스택은 jvm(Kotlin/Java+Spring) · python(FastAPI/ASGI) · go(표준 Go 레이아웃) 중에서 고르고, 아키텍처 변형(ARCH)은 jvm 5종(hexagonal·layered·modulith·feature·multimodule) · python 5종(hexagonal·layered·modular·django·ai-service) · go 4종(hexagonal·layered·feature·flat) 중에서 고른다. 진입점=목차(AGENTS.md/CLAUDE.md), 공통 규칙 정본(.agents/rules — Claude Code·Codex·Kiro 3개 에이전트 공유), Kiro 얇은 포인터(.kiro/steering), SDD 기록 시스템(.agents/docs — 제품 단위 product-<slug>-specs/{requirements,design,tasks} + decisions), 단일 검증 게이트(scripts/verify.sh)와 얇은 트리거(hook)를 한 번에 깐다. "하네스 초기 설정", "AGENTS.md 만들기", "에이전트 규칙 세팅", "harness bootstrap/scaffold", "steering 초기화", "exec-plan/SDD 구조 만들기" 요청 시 사용.
---

# harness-bootstrap — 하네스 엔지니어링 초기 설정 스킬

**AI 에이전트가 실수할 수 없는 작업 환경**(하네스)의 기본 골격을 백엔드 프로젝트에 깐다.
방법론은 OpenAI *Harness Engineering* 모델을 따른다.

## v3 핵심 원칙

- **규칙은 공통 정본 한 곳** — 가드레일·보안·API 표준·기술 규약을 `.agents/rules/` 에 두고 **Claude Code · Codex · Kiro 에이전트가 공유**한다. 특정 에이전트가 소유하지 않는다.
- **Kiro steering = 얇은 포인터** — `.kiro/steering/*` 는 규칙 본문 대신 `.agents/rules/*` 정본을 가리킨다.
- **스택 오버레이** — 스택 무관 골격(`templates/common/`)은 한 벌만 두고, 언어별 규약(`templates/stacks/<stack>/`)을 그 위에 덮는다. 코드 컨벤션·주석 표준·검증 게이트는 **스택마다 다르게** 깔린다.
- **아키텍처 변형(ARCH)** — 한 스택 안에서도 레이아웃은 하나가 아니다. 아키텍처에 종속되는 파일은 **4개뿐**(`ARCHITECTURE.md`·`.agents/rules/structure.md`·`.agents/rules/tech.md`·`.kiro/steering/structure.md`)이라, 이 4개만 `templates/stacks/<stack>/arch/<variant>/`에 두고 **선택한 하나만 설치**한다. 설치 파일 수는 변형과 무관하게 104개로 같다.
- **슬래시 커맨드는 4개 하네스 공통** — SDD 워크플로 9종을 `hx-` 접두사로 깔되(`/hx-specify` → `/hx-plan` → `/hx-tasks` → `/hx-implement`), 본문 정본은 `.agents/rules/sdd-workflow.md` **한 곳**이고 각 하네스 파일은 그것을 가리키는 **얇은 트리거**다. Claude Code(`.claude/commands/`) · Cursor(`.cursor/commands/`) · Kiro(IDE `.kiro/steering/` + CLI `.kiro/skills/`) · Codex(`.agents/skills/`). 접두사는 `/plan` 같은 흔한 이름이 타 플러그인과 충돌하는 것을 막는다.

## 지원 스택

| STACK | 언어/프레임워크 | 리포 뼈대 | 레이어 강제 수단 | 검증 게이트(`scripts/verify.sh`) |
|---|---|---|---|---|
| `jvm` (기본) | Kotlin/Java + Spring Boot | 단일 모듈 또는 멀티모듈(변형에 따름) | 변형별: Gradle 모듈 그래프(컴파일)+Konsist · ArchUnit · Spring Modulith | `./gradlew check` |
| `python` | Python + FastAPI(ASGI) 또는 Django | **src 레이아웃**(django 변형은 프로젝트 루트) | **import-linter 계약** + mypy strict | ruff → mypy → lint-imports → pytest |
| `go` | Go + net/http | **표준 Go 레이아웃**(`cmd/`·`internal/`·`pkg/`·`api/`·`configs/`…) | `internal/` 가시성·import 사이클(컴파일) + **depguard** | gofmt → build → vet → golangci-lint → test -race |

> Go 레이아웃 근거: [golang-standards/project-layout](https://github.com/golang-standards/project-layout). `pkg/`는 실제로 외부 공개할 코드가 있을 때만 만든다.

## 아키텍처 변형 (ARCH=…, 기본 `hexagonal`)

| STACK | ARCH | 언제 고르나 | 강제 규칙 |
|---|---|---|---|
| `jvm` | `hexagonal` | 도메인 규칙이 복잡하고 저장소·외부 시스템 교체 가능성이 있다(**멀티모듈** — 도메인 축으로 자름) | Gradle 모듈 그래프(컴파일) + Konsist |
| `jvm` | `layered` | 도메인 경계가 하나, CRUD 비중이 높다(단일 모듈) | **ArchUnit `layeredArchitecture()`** + 건너뛰기 금지 |
| `jvm` | `modulith` | 도메인이 둘 이상이고 나중에 떼어낼 가능성이 있다(단일 모듈) | **Spring Modulith `ApplicationModules.verify()`**(순환·internal 접근·허용 의존) |
| `jvm` | `feature` | 기능 영역이 여럿, 사람마다 다른 영역을 만진다(단일 모듈) | **ArchUnit 슬라이스**(`beFreeOfCycles`·`notDependOnEachOther`) |
| `jvm` | `multimodule` | 의존 격리를 컴파일러에 맡기고 싶다. **분할 축(도메인·연동 대상·기술 관심사)은 프로젝트가 고른다**(**멀티모듈** — 등급 방향만 강제) | Gradle 모듈 그래프(컴파일) + **ArchUnit/Konsist**(엔티티·SDK 타입 누출 차단) |
| `python` | `hexagonal` | 도메인 규칙이 복잡하고 저장소·외부 시스템 교체 가능성이 있다 | layers 2종 + forbidden + independence |
| `python` | `layered` | 도메인 경계가 하나, CRUD 비중이 높다 | `layers = [api, services, repositories, models]` + forbidden |
| `python` | `modular` | 기능 영역이 여럿, 일부를 떼어낼 가능성이 있다 | `independence`(모듈 간) + 모듈 내부 `layers` |
| `python` | `django` | Admin·인증·마이그레이션 등 배터리 포함이 최대 이득이다 | `layers = [views, "services : selectors", models]` + `independence`(앱 간) |
| `python` | `ai-service` | 제품의 핵심 동작이 모델 호출(생성·RAG·에이전트)이다 | `layers = [api, pipelines, agents, "llm : retrieval", domain]` + 프로바이더 SDK 격리 |
| `go` | `hexagonal` | 도메인 규칙이 복잡하고 포트/어댑터의 실익이 있다 | depguard 3종(domain 순수·app↛infra·primary↮infra) |
| `go` | `layered` | 도메인 경계가 하나, CRUD 비중이 높다 | 레이어 방향 + **handler↛repository**(건너뛰기 금지) |
| `go` | `feature` | 기능 영역이 여럿, 사람마다 다른 영역을 만진다 | **기능 패키지 간 직접 import 금지**(depguard + 구조 테스트) |
| `go` | `flat` | 엔드포인트가 손에 꼽는 소규모·프로토타입 | 최소 규칙 + **파일 수 상한 감시**(승격 신호) |

> 각 변형의 `ARCHITECTURE.md`에는 **선택 기준(언제 쓰나/언제 아닌가)** · **승격 신호** · **다른 변형으로 전환하는 절차**가 함께 들어 있다.
> 새 컨텍스트·모듈·앱·기능을 추가하면 **강제 설정에도 등록**해야 한다(등록 누락 = 강제 누락).

## 언제 쓰나

- 새 백엔드 리포를 시작하며 에이전트 협업 기반(AGENTS.md·공통 규칙·SDD·검증 게이트)을 한 번에 세팅할 때
- 기존 프로젝트에 하네스가 없어 규칙이 프롬프트마다 반복되고 드리프트가 쌓일 때
- 여러 프로젝트(스택이 달라도)에 **동일한 하네스 규약**을 이식할 때

## 이 스킬이 만드는 것 (하네스 4대 축)

| 축 | 산출물 |
|---|---|
| ① 규칙·헌법·가드레일 | `AGENTS.md`(목차), `CLAUDE.md`(리다이렉트), **`.agents/rules/*`(공통 정본 + 스택별 규약)**, `.kiro/steering/*`(얇은 포인터) |
| ② 아키텍처 제약·스캐폴딩 | `ARCHITECTURE.md`(스택별 의존 방향·기계적 강제 수단), `product-<slug>-specs/tasks/_template.md`(작업 지시서), 제품 단위 SDD |
| ③ 검증·피드백 루프 | `scripts/verify.sh`(스택별 단일 게이트) + `check-exec-plan-status.sh` + `.claude`/`.codex` hook(얇은 트리거), 완료 게이트(active→check→completed) |
| ④ 엔트로피 관리 | `tech-debt-tracker.md`, `generated/`·`references/` 규약 |

## 사용 절차

1. **킷 위치 확인** — 이 스킬이 로드된 폴더에 `templates/`·`setup.sh`·`manifest.md` 가 있다. 그 **절대경로**를 `SKILL_DIR` 로 잡는다. 대상 프로젝트의 `pwd` 기준으로 유추하지 않는다 — 플러그인으로 설치된 스킬은 보통 대상 리포 **바깥**(`~/.claude/plugins/…` · `~/.codex/plugins/…`)에 있다.
2. **스택 결정** — 대상 리포를 보고 판단한다(`build.gradle.kts`/`pom.xml`→`jvm`, `pyproject.toml`→`python`, `go.mod`→`go`). 애매하면 사용자에게 묻는다.
2-1. **아키텍처 변형 결정** — 기존 코드가 있으면 그 레이아웃을 따른다(`manage.py`→`django`, `internal/<f>/handler.go`→`feature`, `services/`+`repositories/`→`layered`, `prompts/`·`evaluation/`→`ai-service`, `<ctx>/{domain,application,primary,infra}`→`hexagonal`, 그 규격이 아닌 Gradle 멀티모듈→`multimodule`). 새 리포이거나 애매하면 **위 변형 표의 "언제 고르나"를 사용자에게 제시하고 고르게 한다**. 임의로 정하지 않는다.
3. **치환값 결정** — 사용자에게 물어 확정(모르면 합리적 기본 제안):
   - `PROJECT_NAME`(표시명), `PROJECT_SLUG`(리포 슬러그)
   - `PACKAGE_NS` — **스택마다 의미가 다르다**: jvm=패키지 네임스페이스(`com.example.app`), python=최상위 패키지명(`myapp` → `src/myapp/`), go=모듈 경로(`github.com/org/my-app`)
   - `PROTECTED_PATH`(수정 금지 참고 경로, 기본 `docs/references`), `DOMAIN_EXAMPLE`(예시 도메인)
4. **스캐폴딩 실행**:
   ```bash
   SKILL_DIR="<이 스킬이 로드된 폴더의 절대경로>"
   STACK=python ARCH=modular PROJECT_NAME="MyApp" PROJECT_SLUG="my-app" PACKAGE_NS="myapp" \
     bash "$SKILL_DIR/setup.sh" <대상_프로젝트_경로>
   ```
   - `--stack=<jvm|python|go>` · `--arch=<변형>` 플래그로도 지정할 수 있다(기본 `jvm` · `hexagonal`).
   - 스택에 없는 변형을 주면 사용 가능한 목록을 출력하고 `exit 2`로 중단한다.
   - 기본 **덮어쓰지 않음**(skip). 전체 재생성 `--force`, 미리보기 `--dry-run`.
5. **스택·변형 설정 마무리** — setup.sh가 출력하는 "다음 단계"를 따른다:
   - `jvm`: `verify.sh`의 `GRADLE_DIR`, `tech.md`의 기준 버전. `layered`·`feature`·`multimodule`은 **ArchUnit**, `modulith`는 **Spring Modulith**, `hexagonal`은 **Konsist** 의존성과 구조/모듈 검증 테스트를 함께 넣어야 강제가 작동한다. 멀티모듈 변형(`hexagonal`·`multimodule`)은 `settings.gradle` 모듈 등록 + **Spring Boot 플러그인을 실행 모듈에만 적용**(나머지는 `bootJar`가 안 생긴다)까지 해야 한다. `multimodule`은 추가로 **분할 축·네이밍 결정**과 **구조 테스트 자리표시자 채우기**가 첫 작업이다(안 채우면 아무것도 검사하지 않는다).
   - `python`: `pyproject.toml`의 `[tool.ruff]`·`[tool.mypy]`·`[tool.pytest]`·**`[tool.importlinter]` 계약**(골격은 `ARCHITECTURE.md` — 변형마다 계약이 다르다).
   - `go`: `go mod init`, **`.golangci.yml`의 depguard 규칙**(골격은 `ARCHITECTURE.md` — 변형마다 규칙이 다르다). `feature`·`flat`은 구조 테스트도 함께 둔다.
6. **채우기** — `.agents/rules/product.md`·`ARCHITECTURE.md`·`.agents/rules/structure.md` 의 `{{플레이스홀더}}`, `specs-index.md`·제품 `index.md` 색인.
7. **검증** — `grep -rn '{{' .` 로 미치환 토큰 확인 후 `bash scripts/verify.sh` 통과를 확인하고 사용자에게 보고.

## 원칙 (스캐폴딩 시 반드시 지킬 것)

- **진입점은 목차다** — `AGENTS.md`/`CLAUDE.md` 는 짧게. 규칙 정본은 `.agents/rules/`, 기록은 `.agents/docs/`.
- **규칙은 공통** — kiro에 규칙 본문을 넣지 않는다. 3개 에이전트가 `.agents/rules/` 를 공유한다.
- **문서=부탁, 코드=강제** — 강제는 `scripts/verify.sh` 1곳, hook/CI/pre-commit 은 트리거만.
- **레이어는 기계가 막는다** — 스택마다 수단이 다르다(모듈 그래프 / import-linter / depguard). 새 바운디드 컨텍스트를 추가하면 **강제 설정에도 등록**해야 한다(등록 누락 = 강제 누락).
- **완료 게이트는 사람** — exec-plan은 `check/`까지 에이전트, `completed/`는 사용자 승인 후에만.

## 관련 문서

- 파일→경로 맵·에이전트 공유 구조·스택 오버레이: `./manifest.md`
