# 시작 가이드 — 설치부터 첫 기능까지

빈 백엔드 리포에 하네스를 깔고 첫 기능을 SDD로 만들어 내는 데까지를 순서대로 따라간다.
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

아키텍처는 17변형 중 하나다. 결정 트리와 스택별 전체 목록은
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
| `PACKAGE_NS` | 스택마다 의미가 다르다 — jvm=패키지, python=최상위 패키지명, go=모듈 경로 | `com.example.myapi` |
| `DOMAIN_EXAMPLE` | 예시 도메인. 문서 곳곳에 박힌다 | `order` |
| `PROTECTED_PATH` | 수정 금지 참고 경로 | `docs/references`(기본) |

### 에이전트는 쓰는 것만 고른다

```bash
bash "$SKILL_DIR/setup.sh" --stack=jvm --arch=hexagonal --list-agents ~/work/my-api
```

감지 결과와 에이전트별 파일 수를 보여준다(설치하지 않는다). **`.claude`·`.codex`·`.cursor`·`.kiro`
를 전부 만들지 않는다** — 안 쓰는 디렉터리는 리포만 지저분하게 한다. 나중에 `/hx-agent-add` 로 더할 수 있다.

설치 수 = **core 38** + 고른 것(`claude` 14 · `codex` 14 · `cursor` 9 · `kiro` 31) + **상태 파일 2개**.

### 실제 설치

`--dry-run` 을 빼고 다시 실행한다. 기존 파일은 덮지 않는다(`↷ skip (존재)`).
덮으려면 `--force` 를 명시해야 한다.

설치가 끝나면 두 상태 파일이 생긴다. **둘 다 커밋한다.**

| 파일 | 무엇 | 왜 커밋하나 |
|---|---|---|
| `.agents/harness-kit.json` | 킷 버전·스택·변형·에이전트·치환값 | `/hx-agent-add`·`/hx-update` 가 다시 묻지 않는다 |
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

계약·규칙의 골격은 설치된 `ARCHITECTURE.md` 안에 있다. 변형마다 다르다.
JVM 변형별 구체 레시피는 [03-jvm-architecture-recipes.md](03-jvm-architecture-recipes.md).

**붙였으면 한 번 일부러 어겨 본다.** 컨트롤러에서 리포지토리를 직접 부르거나, 도메인에서 프레임워크를
import 해 보고 `bash scripts/verify.sh` 가 **실패하는지** 확인한다. 실패하지 않으면 강제가 안 붙은 것이다.

---

## ⑥ 첫 기능 — SDD 워크플로

이제부터는 대상 리포에 깔린 `hx-*` 커맨드 9종을 쓴다.

```
/hx-specify → (/hx-clarify · /hx-checklist) → /hx-plan → /hx-tasks → (/hx-analyze) → /hx-implement → (/hx-converge)
```

괄호 안은 선택 단계다. 작업 시작 전에 `/hx-harness` 로 규칙을 먼저 로드하면 컨텍스트가 잡힌다.

| 단계 | 산출 | 핵심 |
|---|---|---|
| `/hx-specify` | `requirements/<feature>.md` | 무엇을·왜만. 스택·API·코드 얘기 금지 |
| `/hx-clarify` | `## Clarifications` | 모호함을 최대 5문답으로 |
| `/hx-checklist` | `checklists/<feature>-<도메인>.md` | 요구사항 문장 품질 판정 |
| `/hx-plan` | `design/<feature>.md` | 어떻게 + 헌법 검사 |
| `/hx-tasks` | `tasks/active/<feature>.md` | `T001 [P] [US1]` 실행 단위 |
| `/hx-analyze` | 읽기 전용 리포트 | 세 문서 교차 정합성 |
| `/hx-implement` | 코드 + `tasks/completed/` | Phase 순 구현 |

**제품 폴더도 단계 문서도 설치 산출물이 아니다.** `<slug>-specs/` 는 첫 기능에서 만들어지고,
각 단계 문서는 그 단계에 들어갈 때 하나씩 생긴다.

```bash
bash scripts/new-feature.sh <product-slug> <feature>                  # requirements — /hx-specify 가 대신 실행
bash scripts/new-feature.sh <product-slug> <feature> --stage=design   # 승인 후 — /hx-plan
bash scripts/new-feature.sh <product-slug> <feature> --stage=tasks    # 승인 후 — /hx-tasks
```

임의로 제품 폴더를 만들지 않는다. 템플릿 원본은 `.agents/docs/_spec-templates/` 한 곳뿐이고
제품 폴더로 복사되지 않는다.

빈 design·tasks 를 미리 만들지 않는 이유는 두 강제 장치가 파일의 존재를 신호로 쓰기 때문이다.
보드는 파일이 놓인 위치로 상태를 계산하고, `check-sdd-prerequisites.sh` 는 선행 문서의 존재로
단계 진입을 판정한다. 미리 깔면 모든 기능이 만들자마자 🔨 구현으로 뜨고 게이트는 항상 통과한다.

### 완료 게이트는 사람이 연다

exec-plan(`tasks/`)은 DoD를 채워도 에이전트가 `completed/` 로 옮기지 않는다.
`check/` 까지만 옮기고(상태 `check`) **사용자 검증 후에만** `completed/` 로 간다.

---

## ⑦ 검증 게이트

강제는 `scripts/verify.sh` **한 곳**이다. hook·CI·pre-commit은 전부 이걸 부르는 얇은 트리거다.

```bash
bash scripts/verify.sh            # full — 빌드·테스트 포함
```

**레벨이 둘로 나뉘어 있다.**

| 레벨 | 언제 | 무엇 |
|---|---|---|
| `fast` | 에이전트 Stop hook | 구조 점검 + 가벼운 정적 검사(수 초) |
| `full` | 커밋·푸시 전, CI | 빌드·린트·타입·아키텍처·테스트 전부 |

**hook 통과는 full 통과가 아니다.** hook이 매 턴 full을 돌면 빌드가 겹쳐 lock 경합으로 멈추기 때문에
나눠 둔 것이다. 커밋 전에는 직접 `bash scripts/verify.sh` 를 돌려 통과시킨다.

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
| `verify.sh` 가 hook에서만 돈다 | `fast` 레벨이다 | 커밋 전 `full` 직접 실행 |
| 제품 폴더가 비어 있다 | 설치는 폴더를 만들지 않는다 | `new-feature.sh` 또는 `/hx-specify` |

## 관련 문서

- [02-choosing-architecture.md](02-choosing-architecture.md) — 17변형 결정 트리·전환 신호
- [03-jvm-architecture-recipes.md](03-jvm-architecture-recipes.md) — jvm 8변형 실전 레시피
- [../../README.md](../../README.md) — 스킬·커맨드 레퍼런스
- [../analysis/](../analysis/) — 킷 내부 구조(킷을 고칠 때)
