# 시작 가이드 — 설치부터 첫 기능까지

빈 리포(백엔드든 프론트엔드든)에 하네스를 깔고 첫 기능을 SDD로 만들어 내는 데까지를 순서대로 따라간다.
중간에 판단이 필요한 지점에서는 **무엇을 근거로 정하는지**까지 적었다.

전체 흐름은 이렇다.

```
① 플러그인 설치  →  ② 스택·아키텍처 결정  →  ③ 스캐폴딩  →  ④ 플레이스홀더 채우기
                                                                      ↓
                    ⑦ 검증 게이트 통과  ←  ⑥ 첫 기능(SDD)  ←  ⑤ 스택 설정(빌드·강제 도구)
```

---

## ① 플러그인 설치

### Claude Code

```bash
/plugin marketplace add pscheol/harness-starter-kit
/plugin install harness-kit@harness-starter-kit
```

### Codex

```bash
codex plugin marketplace add pscheol/harness-starter-kit
codex plugin add harness-kit@harness-starter-kit
```

로컬 경로로도 등록할 수 있다(`/plugin marketplace add /path/to/harness-starter-kit`).
**플러그인과 스킬 목록은 세션 시작 시 로드되므로 설치 직후에는 재시작해야 보인다.**

확인: Claude Code `/plugin`, Codex `codex plugin list`.

---

## ② 스택·아키텍처 결정

에이전트가 리포를 보고 판단하되, 애매하면 임의로 정하지 않고 묻는다.

| 스택 | 판단 근거 |
|---|---|
| `jvm` | `build.gradle(.kts)` · `pom.xml` · `settings.gradle(.kts)` |
| `python` | `pyproject.toml` · `manage.py` |
| `go` | `go.mod` |
| `electron` | `package.json` 에 `electron` 의존 |
| `web` | `package.json`(위에 해당하지 않을 때) |

`web`·`electron` 은 `frontend` 도메인을 자동으로 함께 깐다(디자인 시스템·접근성·UI 상태·성능 4종).
백엔드 3종에는 도메인 레이어가 없다 — 규칙이 이미 언어별이다.

아키텍처는 23변형 중 하나다. 결정 트리와 스택별 전체 목록은
[02-choosing-architecture.md](02-choosing-architecture.md) 에 있다. 요약하면 세 질문이다 —
**배포 단위가 몇 개인가 · 도메인 규칙이 복잡한가 · 무엇을 기준으로 나눌 것인가.**

> 확신이 없으면 작은 쪽에서 시작한다. 전환 절차가 각 변형의 `ARCHITECTURE.md` 에 들어 있다.

---

## ③ 스캐폴딩

### 어느 스택이든

```
/harness-kit:hx-bootstrap ~/work/my-api --dry-run
```

### JVM이면 전용 진입이 낫다

```
/hx-jvm-setup
```

아키텍처 8종을 **고르는 순서로** 묻고 언어(Kotlin/Java)까지 확정한 뒤 같은 설치기를 부른다.
아키텍처가 이미 정해졌으면 자식 스킬을 바로 불러도 된다 —
`/hx-jvm-hexagonal` · `/hx-jvm-layered` · `/hx-jvm-layered-multimodule`.

### 웹·Electron도 전용 진입이 있다

```
/hx-web-setup           # nextjs-app · react-spa · feature-sliced
/hx-electron-setup      # main-renderer · feature · monorepo
```

역시 고르는 순서로 묻고 같은 설치기를 부른다. 프론트엔드는 **컴파일 레벨의 레이어 강제가 없어서**
설치 후 ESLint import 경계 규칙을 등록하는 것이 첫 작업이다 — 등록하지 않으면 `ARCHITECTURE.md` 가
문서로만 남는다. Electron 은 여기에 더해 프로세스 경계(`contextIsolation`·`nodeIntegration`·`sandbox`)를
게이트가 `fast` 레벨에서 직접 막는다.

### 직접 실행

플러그인 없이 스크립트를 직접 돌릴 수도 있다.

```bash
SKILL_DIR=~/.claude/plugins/.../skills/hx-bootstrap    # 또는 ~/.codex/plugins/...

STACK=jvm ARCH=hexagonal \
PROJECT_NAME="My API" PROJECT_SLUG="my-api" \
PACKAGE_NS="com.example.myapi" DOMAIN_EXAMPLE="order" \
  bash "$SKILL_DIR/setup.sh" --lang=kotlin --agents=claude,kiro --dry-run ~/work/my-api
```

**치환값 5종**을 미리 정해 두면 되묻지 않는다.

| 토큰 | 의미 | 예 |
|---|---|---|
| `PROJECT_NAME` | 표시명 | `My API` |
| `PROJECT_SLUG` | 리포 슬러그. **모듈 접두사로도 쓰인다** | `my-api` |
| `PACKAGE_NS` | 스택마다 의미가 다르다 — jvm=패키지, python=최상위 패키지명, go=모듈 경로, web=임포트 별칭 루트(`@`), electron=앱 ID | `com.example.myapi` |
| `DOMAIN_EXAMPLE` | 예시 도메인. 문서 곳곳에 박힌다 | `order` |
| `PROTECTED_PATH` | 수정 금지 참고 경로 | `docs/references`(기본) |

### 에이전트는 쓰는 것만 고른다

```bash
bash "$SKILL_DIR/setup.sh" --stack=jvm --arch=hexagonal --list-agents ~/work/my-api
```

감지 결과와 에이전트별 파일 수를 보여준다(설치하지 않는다). **`.claude`·`.codex`·`.cursor`·`.kiro`
를 전부 만들지 않는다** — 안 쓰는 디렉터리는 리포만 지저분하게 한다. 나중에 `/hx-agent-add` 로 더할 수 있다.

설치 수 = **core** + 고른 것 + **상태 파일 2개**. core 와 `kiro` 는 스택군에 따라 다르다.

| 스택군 | core | `claude` | `codex` | `cursor` | `kiro` | 전부 고를 때 |
|---|---|---|---|---|---|---|
| `jvm` · `python` · `go` | 187 | 19 | 8 | 11 | 52 | 277 |
| `web` · `electron` | 191 | 19 | 8 | 11 | 56 | 285 |

프론트엔드가 4개씩 많은 건 `web`·`electron` 이 공유하는 `frontend` 도메인 규칙 4종(디자인 시스템·
접근성·UI 상태·성능)과 그 Kiro 포인터 4종 때문이다.

### 선택 모듈은 필요할 때만 켠다

```bash
bash "$SKILL_DIR/setup.sh" --list-modules
```

| 모듈 | 파일 | 켤 때 |
|---|---|---|
| `jira-workflow` | 10 | Jira 등 이슈 트래커를 에이전트가 직접 전이시킬 때 |
| `platform-guards` | 4 | 프로젝트 고유 불변식을 grep 가드로 승격시킬 때 |

기본은 `none` 이다. `--modules=jira-workflow,platform-guards` 처럼 명시해야 깔린다.
모든 프로젝트가 이슈 트래커를 자동화하지도, 고유 불변식을 갖지도 않는다.

### 실제 설치

`--dry-run` 을 빼고 다시 실행한다. 기존 파일은 덮지 않는다(`↷ skip (존재)`).
덮으려면 `--force` 를 명시해야 한다.

설치가 끝나면 두 상태 파일이 생긴다. **둘 다 커밋한다.**

| 파일 | 무엇 | 왜 커밋하나 |
|---|---|---|
| `.agents/harness-kit.json` | 킷 버전·도메인·스택·변형·에이전트·모듈·치환값 | `/hx-agent-add`·`/hx-update` 가 다시 묻지 않는다 |
| `.agents/harness-kit.lock` | 파일별 **설치 시점 원본 해시** | 업데이트가 "사용자가 고친 파일"을 가려낸다 |

---

## ④ 플레이스홀더 채우기

세 파일에 `{{…}}` 가 남아 있다. 이걸 채우는 것이 실질적인 첫 작업이다.

| 파일 | 채울 것 |
|---|---|
| `.agents/rules/product.md` | 제품 정체성·목표·범위·원칙·우선순위·KPI |
| `ARCHITECTURE.md` | 변형이 비워 둔 결정(모듈 등급표·분할 축·채택 규약 등) |
| `.agents/rules/structure.md` | 실제 도메인·모듈 이름 |

확인:

```bash
grep -rn '{{' . --include='*.md' | grep -vE '_spec-templates/|\{\{\.\.\.\}\}|PRODUCT_SLUG'
```

> `.agents/docs/_spec-templates/` 안의 `{{PRODUCT_SLUG}}`·`{{FEATURE_NAME}}`·`{{EPIC_ID}}` 는
> **의도적으로 남기는 토큰**이다. 스펙을 만들 때 `new-feature.sh` 가 채운다. 손대지 않는다.

---

## ⑤ 스택 설정 — 강제 도구를 실제로 붙인다

**여기를 건너뛰면 하네스가 문서로만 남는다.** `setup.sh` 가 출력한 "다음 단계"가 이 절의 내용이다.

| 스택 | 해야 할 것 |
|---|---|
| `jvm` | `settings.gradle` 모듈 등록 · 의존 방향대로 빌드 스크립트 · **ArchUnit/Konsist 구조 테스트 배치** · Spring Boot 플러그인은 실행 모듈에만 |
| `python` | `pyproject.toml` 의 `[tool.ruff]`·`[tool.mypy]`·`[tool.pytest]`·**`[tool.importlinter]` 계약** |
| `go` | `go mod init` · **`.golangci.yml` 의 depguard 레이어 규칙** |
| `web` | `package.json` 스크립트 이름을 게이트에 맞추기(`lint`·`typecheck`·`test`·`build`) · `tsconfig` 의 `strict` + `noUncheckedIndexedAccess` · **ESLint import 경계 규칙 등록** |
| `electron` | 위 + 프로세스 경계(`contextIsolation: true`·`nodeIntegration: false`·`sandbox: true`) · **IPC 채널 목록을 한 파일에 모아 preload 화이트리스트로만 노출** · `electron-builder` 의 `appId` |

계약·규칙의 골격은 설치된 `ARCHITECTURE.md` 안에 있다. 변형마다 다르다.
JVM 변형별 구체 레시피는 [03-jvm-architecture-recipes.md](03-jvm-architecture-recipes.md).

**붙였으면 한 번 일부러 어겨 본다.** 컨트롤러에서 리포지토리를 직접 부르거나, 도메인에서 프레임워크를
import 해 보고 `bash scripts/verify.sh` 가 **실패하는지** 확인한다. 실패하지 않으면 강제가 안 붙은 것이다.

---

## ⑥ 첫 기능 — SDLC 단계형 SDD

이제부터는 대상 리포에 깔린 `hx-*` 커맨드 11종을 쓴다. 이슈 하나가 아래 여덟 단계를 지나고, 단계마다 사용자 승인을 받는다.

```
S1·S2 /hx-specify → (/hx-clarify · /hx-checklist) → S3 /hx-plan → S4 /hx-tasks → (/hx-analyze)
      → S5·S6 /hx-implement → S7 /hx-docs → S8 완료(사용자 승인) → (/hx-converge)
```

괄호 안은 선택 단계다. 작업 시작 전에 `/hx-harness` 로 규칙을 먼저 로드하면 컨텍스트가 잡히고,
코드를 쓰거나 리팩터링할 때는 `/hx-maintain` 이 유지보수 기준을 적용한다.

| 단계 | 커맨드 | 산출(`.agents/docs/<slug>-specs/issues/<key>/`) | 핵심 |
|---|---|---|---|
| S1 분석 | `/hx-specify` | `requirements.md` | 무엇을·왜. 스택·API·코드 얘기 금지 |
| S2 기획 | `/hx-specify` · `/hx-clarify` · `/hx-checklist` | 같은 requirements 의 정책 표·화면 표 · `checklists/<도메인>.md` | 규칙과 강제 위치, 화면 상태 |
| S3 설계 | `/hx-plan` | `design.md` | 어떻게 + 헌법 검사 · 순서도 · 상태 전이 · 쿼리→인덱스 · 캐시 · 동시성 |
| S4 계획 | `/hx-tasks` · `/hx-analyze` | `tasks/active.md` | `T001 [P] [US1]` 실행 단위, Polish 에 문서 반영 |
| S5·S6 구현·시험 | `/hx-implement` | 코드 · 시험 | Phase 순 구현, 변경마다 changed 검증 |
| S7 문서 반영 | `/hx-docs` | `docs/features/_src/features/<ID>.md` · HTML | 원고 갱신 → `build` → `check` |
| S8 완료 | 사용자 승인 | `tasks/check.md` → `tasks/completed.md` | 승인 뒤에만 completed |

**제품 폴더도 단계 문서도 설치 산출물이 아니다.** `<slug>-specs/` 는 첫 이슈에서 만들어지고,
각 단계 문서는 그 단계에 들어갈 때 하나씩 생긴다. 키는 `<순번>-<종류>-<이름>`(예: `1-feat-folder-bookmark`)이다.

```bash
bash scripts/new-feature.sh <product-slug> <name>                       # requirements — /hx-specify 가 대신 실행
bash scripts/new-feature.sh <product-slug> <key> --stage=design         # requirements approved 뒤 — /hx-plan
bash scripts/new-feature.sh <product-slug> <key> --stage=tasks          # design approved 뒤 — /hx-tasks
bash scripts/check-sdd-prerequisites.sh <product-slug> <key> --stage=implement   # 실제 경로(BASE·REQUIREMENTS·DESIGN·TASKS) 출력
```

임의로 제품 폴더를 만들지 않는다. 템플릿 원본은 `.agents/docs/_spec-templates/` 한 곳뿐이다.
앞 문서의 상태가 정확히 `approved`가 아니면 다음 문서를 만들지 않는다. 파일이 있다는 것을 승인으로 보지 않는다.

### 완료 게이트는 사람이 연다

DoD·verify·S7 문서 검사를 채우면 에이전트는 `tasks/active.md`를 `tasks/check.md`로 옮기고(상태 `check`)
검증 결과를 보여 준다. **사용자가 명시적으로 승인한 뒤에만** `tasks/completed.md`로 간다.

### 기능 문서

`docs/features/`는 구현된 기능의 현재 모습을 보여 주는 정적 사이트다(12단계 페이지 + 기능별 페이지 + Scalar API 명세).
처음 설치하면 기능이 비어 있다. `docs/features/_src/docs.config.json`에 단위(서버·웹)와 OpenAPI·마이그레이션 경로를 적고,
`catalog.json`에 영역과 기능을 더한 뒤 `python3 tools/docs/feature_docs.py build`·`check`를 돌린다.
Scalar·Mermaid 는 `python3 tools/docs/feature_docs.py refresh vendor`가 잠금 파일의 integrity 를 확인해 리포에 받는다(받기 전에는 경고만 낸다).

---

## ⑦ 검증 게이트

강제는 `scripts/verify.sh` **한 곳**이다. hook·git hook·CI는 전부 이걸(또는 그 앞의 changed 계획기를) 부르는 얇은 트리거다.

```bash
bash scripts/verify.sh                                   # changed — 바뀐 파일에 필요한 검사만
bash scripts/verify.sh --files <경로…> --tests <시험…> --plan   # 고를 검사를 먼저 본다(실행 안 함)
bash scripts/verify.sh --full                            # 전체 — 빌드·린트·타입·아키텍처·시험
```

| 레벨 | 언제 | 무엇 |
|---|---|---|
| `changed`(기본) | 에이전트 Stop hook · git pre-commit/pre-push · 손으로 부를 때 | 바뀐 파일·세션 점유 파일에 필요한 검사·시험 |
| `fast` | `--fast` | 구조 점검 + 가벼운 정적 검사(수 초) |
| `full` | `--full` · CI | 빌드·린트·타입·아키텍처·시험 전부 |

**changed·fast 통과는 full 통과가 아니다.** 결과를 말할 때 레벨을 함께 적는다.
git hook 은 `bash scripts/install-git-hooks.sh`로 리포에 건다(새 클론마다 한 번).

여러 세션(또는 여러 에이전트)이 같은 리포에서 일하면 `python3 scripts/session-coordination.py register --files <파일…>`로
실제 세션 ID 와 맡은 파일을 등록한다. 다른 세션이 점유한 파일은 쓰기 hook 이 막는다.

---

## 이후 유지보수

| 하고 싶은 것 | 커맨드 |
|---|---|
| 다른 에이전트도 쓰게 됐다(Cursor 추가 등) | `/hx-agent-add` |
| 킷이 올라갔다 — 변경분 반영 | `/hx-update --dry-run` 먼저 |

업데이트는 `.agents/harness-kit.lock` 의 설치 시점 해시로 **사용자가 고친 파일**을 가려낸다.
고친 파일은 덮지 않고 새 버전을 `.new` 로 옆에 둔다. 그래서 상태 파일 2종을 커밋해야 한다.

---

## 자주 막히는 곳

| 증상 | 원인 | 해결 |
|---|---|---|
| 스킬이 목록에 안 보인다 | 세션 시작 시 로드된다 | 재시작 |
| 미치환 토큰이 남았다고 나온다 | `_spec-templates/` 를 함께 센 것 | `grep -vE '_spec-templates/|\{\{\.\.\.\}\}|PRODUCT_SLUG'` 로 제외 |
| 레이어를 어겼는데 통과한다 | 구조 테스트·계약을 안 붙였다 | ⑤로 돌아간다 |
| 검증이 통과했는데 CI 가 실패한다 | 로컬은 changed 였다 | `bash scripts/verify.sh --full` |
| 커밋해도 검증이 안 돈다 | git hook 을 안 걸었다 · 전역 `core.hooksPath` | `bash scripts/install-git-hooks.sh` |
| 기능 문서 `check` 가 원고 없음으로 실패한다 | catalog 에 기능을 더하고 원고를 안 썼다 | `feature_docs.py brief <ID>` 로 시작해 원고 절 12개를 채운다 |
| 제품 폴더가 비어 있다 | 설치는 폴더를 만들지 않는다 | `new-feature.sh` 또는 `/hx-specify` |
| `--stage=design` 이 거부된다 | requirements 상태가 `approved` 가 아니다 | 승인 뒤 상태를 바꾸고 다시 |

## 관련 문서

- [02-choosing-architecture.md](02-choosing-architecture.md) — 23변형 결정 트리·전환 신호
- [03-jvm-architecture-recipes.md](03-jvm-architecture-recipes.md) — jvm 8변형 실전 레시피
- [../../README.md](../../README.md) — 스킬·커맨드 레퍼런스
- [../analysis/](../analysis/) — 킷 내부 구조(킷을 고칠 때)
