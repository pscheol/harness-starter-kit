---
description: 대상 리포에 하네스 골격(AGENTS.md · .agents/rules 원본 · SDD 기록 시스템 · 단일 검증 게이트)을 스캐폴딩한다. 스택·아키텍처 변형을 판단해 setup.sh 를 실행한다.
argument-hint: [경로] [--stack=jvm|python|go|web|electron] [--arch=<변형>] [--lang=kotlin|java] [--agents=<claude,codex,cursor,kiro|all>] [--modules=<jira-workflow,platform-guards|all>] [--dry-run]
---

<!-- HARNESS STARTER KIT · 얇은 트리거. 원본: skills/hx-bootstrap/SKILL.md -->

`hx-bootstrap` 스킬을 로드해 그 절차대로 수행한다.

> 이 커맨드는 얇은 트리거다. 스킬을 직접 불러도 결과는 같다 — `/harness-kit:hx-bootstrap` (짧게는 `/hx-bootstrap`).


입력: $ARGUMENTS

## 인자 해석

| 인자 | 의미 | 없을 때 |
|---|---|---|
| 첫 위치 인자 | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--stack=` | `jvm` · `python` · `go` · `web` · `electron` | 대상 리포에서 판단(`build.gradle.kts`/`pom.xml`→jvm, `pyproject.toml`→python, `go.mod`→go, `package.json`+`electron` 의존→electron, `package.json`만→web). 애매하면 묻는다 |
| `--arch=` | 스택별 변형(jvm 8 · python 5 · go 4 · web 3 · electron 3) | 기존 레이아웃에서 추론. 새 리포이거나 애매하면 선택 기준을 제시하고 고르게 한다. 기본값은 스택마다 다르다(백엔드 `hexagonal` · web `nextjs-app` · electron `main-renderer`) |
| `--lang=` | (jvm 전용) `kotlin` · `java` — 빌드 DSL·구조 테스트 도구 안내가 갈린다 | 생략하면 `Kotlin/Java` 로 남는다. jvm 이면 물어보는 편이 낫다 |
| `--agents=` | 설치할 에이전트(`claude`·`codex`·`cursor`·`kiro`, `all` 은 전체) | `--list-agents` 로 감지한 뒤 **사용자에게 확인받는다**. 전부 깔지 않는다 |
| `--modules=` | 선택 모듈(`jira-workflow`·`platform-guards`, `all`·`none`) | **기본 `none`**. 목록은 `--list-modules`. 필요를 확인하고 켠다 |
| `--domain=` | 도메인 레이어(`frontend`) | 스택에서 자동 결정(web·electron→frontend, 나머지는 없음). 건드릴 일이 거의 없다 |
| `--dry-run` | 설치 없이 목록만 | 미지정 시 실제 설치 |

## 수행 순서

1. **스킬 위치 확인** — 이 커맨드가 속한 플러그인의 `skills/hx-bootstrap/` 절대경로를 `SKILL_DIR` 로 잡는다. 대상 리포의 `pwd` 로 유추하지 않는다(플러그인 스킬은 보통 대상 리포 바깥에 있다).
2. **스택·변형 결정** — 위 표대로. 임의로 정하지 않는다.
3. **에이전트 결정** — `--list-agents` 로 감지 결과를 보여주고 확정받는다. 감지가 0건이면 `claude` 로 떨어지므로 반드시 묻는다: `bash "$SKILL_DIR/setup.sh" --stack=<stack> --arch=<variant> --list-agents <대상_프로젝트_경로>`
4. **치환값 확정** — `PROJECT_NAME` · `PROJECT_SLUG` · `PACKAGE_NS`(스택마다 의미가 다르다) · `PROTECTED_PATH` · `DOMAIN_EXAMPLE`. 모르면 합리적 기본값을 제안하고 확인받는다.
5. **`--dry-run` 선실행** — 설치될 파일 목록과 선택된 변형·에이전트를 보여준다.
6. **사용자 승인 후 실제 설치** — `--dry-run` 없이 재실행.
7. **다음 단계 안내** — `setup.sh` 가 출력하는 스택×변형별 후속 작업을 그대로 전달한다.

```bash
SKILL_DIR="<플러그인 내 skills/hx-bootstrap 절대경로>"
STACK=<stack> ARCH=<variant> PROJECT_NAME="<이름>" PROJECT_SLUG="<슬러그>" PACKAGE_NS="<네임스페이스>" \
  bash "$SKILL_DIR/setup.sh" [--lang=kotlin|java] --agents=<목록> [--dry-run] <대상_프로젝트_경로>
```

## 주의

- 기존 파일은 덮지 않는다(`↷ skip (존재)`). 덮으려면 `--force` 를 사용자가 명시적으로 요구할 때만 붙인다.
- **에이전트를 전부 깔지 않는다.** 안 쓰는 `.cursor/`·`.kiro/` 를 만들면 리포만 지저분해진다. 나중에 `/agent-add` 로 더할 수 있다.
- 설치 후 `.agents/harness-kit.json`·`.agents/harness-kit.lock` 이 생긴다. 커밋 대상이다 — `/update` 가 이 파일로 사용자 수정본을 가려낸다.
- 설치 후 프로젝트에는 SDD 워크플로 커맨드 9종이 `hx-` 접두사로 깔린다(`/hx-specify` → `/hx-plan` → `/hx-tasks` → `/hx-implement`). 원본은 `.agents/rules/sdd-workflow.md` 한 곳이다.
- 스택별 진입 스킬이 아키텍처 선택을 순서대로 안내한다(설치는 모두 같은 `setup.sh` 를 쓴다):
  JVM `hx-jvm-setup`(+ 자식 `hx-jvm-hexagonal`·`hx-jvm-layered`·`hx-jvm-layered-multimodule`) · 웹 `hx-web-setup` · Electron `hx-electron-setup`.
- `web`·`electron` 은 **컴파일 레벨 레이어 강제가 없다.** 설치 후 ESLint import 경계 규칙을 등록하지 않으면 `ARCHITECTURE.md` 가 문서로만 남는다.
- `electron` 은 `contextIsolation: true`·`nodeIntegration: false`·`sandbox: true` 를 게이트가 `fast` 레벨에서 막는다. 예외로 풀지 않는다.
- `--modules=jira-workflow` 를 켰다면 `.agents/issue-tracker.yml` 의 `TBD` 를 채우기 전까지 상태 전이를 하지 않는다(표시 이름이 아니라 ID 로 옮긴다).
