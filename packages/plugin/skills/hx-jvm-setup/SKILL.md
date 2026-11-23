---
name: hx-jvm-setup
description: JVM 백엔드(Kotlin/Java + Spring Boot) 리포에 하네스 골격을 세팅한다. 아키텍처 8종(hexagonal · hexagonal-nested · hexagonal-standalone · layered · layered-multimodule · modulith · feature · multimodule) 중에서 프로젝트에 맞는 것을 고르게 하고, 언어(Kotlin/Java)를 확정한 뒤 hx-bootstrap 의 setup.sh 를 jvm 스택으로 실행한다. 아키텍처별 상세 레시피는 자식 스킬(hx-jvm-hexagonal · hx-jvm-layered · hx-jvm-layered-multimodule)에 있다. "JVM 프로젝트 세팅", "Spring 프로젝트 하네스 깔아줘", "Kotlin 백엔드 초기 설정", "아키텍처 골라서 세팅", "gradle 멀티모듈 구조 잡아줘" 요청 시 사용.
---

# hx-jvm-setup — JVM 백엔드 하네스 세팅 (진입 스킬)

JVM 스택에 국한된 진입점이다. 하는 일은 셋이다.

1. **아키텍처를 고르게 한다** — 8종의 선택 기준을 제시하고 사용자가 정한다. 임의로 정하지 않는다.
2. **언어를 확정한다** — Kotlin / Java. 빌드 DSL과 구조 테스트 도구가 여기서 갈린다.
3. **`hx-bootstrap` 의 `setup.sh` 를 실행한다** — 설치 로직은 한 곳뿐이다. 이 스킬은 그것을 복제하지 않는다.

> **이 스킬이 만드는 것은 규칙·문서·검증 게이트다.** `build.gradle.kts`·소스 코드는 만들지 않는다.
> 설치 후 무엇을 손으로 세워야 하는지는 `setup.sh` 가 출력하는 "다음 단계"와 아키텍처별 자식 스킬에 있다.

## 아키텍처 선택 (사용자에게 이 표를 보여주고 고르게 한다)

| ARCH | 한 줄 | 모듈 | 실행 단위 | 강제 수단 |
|---|---|---|---|---|
| `hexagonal` | 도메인 규칙이 복잡하고 저장소·외부 시스템 교체 가능성이 있다 | 컨텍스트당 4 + 전역 core·common·bootstrap | 1 | 모듈 그래프 + Konsist |
| `hexagonal-nested` | 위와 같되 컨텍스트가 많아 리포 루트를 정돈하고 싶다 | 동일(경로만 중첩) | 1 | 동일 |
| `hexagonal-standalone` | **컨텍스트를 독립 배포 단위로** 다룬다(나중에 서비스로 분리) | **컨텍스트당 7**(core·common·bootstrap까지 소유) | **컨텍스트마다 1** | 모듈 그래프 + 구조 테스트(컨텍스트 간) |
| `layered` | 도메인 경계가 하나, CRUD 비중이 높다 | 단일 모듈 | 1 | ArchUnit `layeredArchitecture()` |
| `layered-multimodule` | **레이어를 모듈로** 자른다. API + 배치 + 관리자처럼 **실행 단위가 여럿** | 레이어당 1(api·service·domain·common …) | 1~N | 모듈 그래프 + ArchUnit |
| `modulith` | 도메인이 둘 이상이고 나중에 떼어낼 가능성이 있다 | 단일 모듈 + 모듈 패키지 | 1 | Spring Modulith `verify()` |
| `feature` | 기능 영역이 여럿, 사람마다 다른 영역을 만진다 | 단일 모듈 + 기능 패키지 | 1 | ArchUnit 슬라이스 |
| `multimodule` | 분할 축을 프로젝트가 고른다(도메인·연동 대상·기술 관심사) | 프로젝트가 정함 | 1 | 등급 방향 + ArchUnit |

**고르는 순서로 묻는다.**

1. 배포 단위가 하나인가 여럿인가?
   - 여럿 + 도메인이 무겁다 → `hexagonal-standalone`
   - 여럿 + CRUD 위주(API·배치·관리자) → `layered-multimodule`
   - 하나 → 2번으로.
2. 도메인 규칙이 복잡한가, 저장소·외부 시스템을 교체할 가능성이 있는가?
   - 그렇다 → `hexagonal`(컨텍스트가 많아 루트가 번잡하면 `hexagonal-nested`)
   - 아니다 → 3번으로.
3. 무엇을 기준으로 나누고 싶은가?
   - 나누지 않는다(경계 하나·CRUD) → `layered`
   - 도메인(나중에 분리 가능성) → `modulith`
   - 기능 영역(사람별 소유) → `feature`
   - 그 외 축을 직접 정하겠다 → `multimodule`

**기존 코드가 있으면 그 레이아웃을 따른다**(임의 전환 금지):
`<ctx>/{domain,application,primary,infra}` → `hexagonal` 계열 · `<slug>-<ctx>-domain` 평면 모듈 → `hexagonal-standalone` ·
`api`/`service`/`domain` 모듈 분리 → `layered-multimodule` · `controller`/`service`/`repository` 패키지 → `layered` ·
`@ApplicationModule` → `modulith` · 그 외 Gradle 멀티모듈 → `multimodule`.

## 언어 선택

| 값 | 빌드 DSL | 구조 테스트 | 비고 |
|---|---|---|---|
| `kotlin` | Kotlin DSL (`build.gradle.kts`) | **Konsist**(또는 ArchUnit) | `-Xjsr305=strict` 권장 |
| `java` | Groovy DSL (`build.gradle`) | **ArchUnit** | |
| (생략) | 문서에 "Gradle" 로만 남음 | 문서가 둘 다 안내 | 나중에 확정할 때 |

- **DSL을 섞지 않는다.** 한쪽을 골라 끝까지 간다.
- 언어를 아직 못 정했으면 생략해도 된다. 그 경우 `PRIMARY_LANGUAGE` 가 `Kotlin/Java` 로 남으므로 확정 후 `.agents/rules/tech.md` 를 손본다.

## 절차

1. **킷 위치 확인** — 이 스킬이 로드된 폴더의 형제인 `hx-bootstrap/` 의 절대경로를 `BOOTSTRAP_DIR` 로 잡는다.
   대상 리포의 `pwd` 로 유추하지 않는다(플러그인 스킬은 대상 리포 바깥에 있다).
2. **스택 확인** — `build.gradle(.kts)`·`pom.xml`·`settings.gradle(.kts)` 가 있는지 본다. 없으면 새 리포다(그래도 jvm 으로 진행).
   Python/Go 리포로 보이면 이 스킬이 아니라 `hx-bootstrap` 으로 보낸다.
3. **아키텍처 결정** — 위 선택 순서대로 묻는다. 기존 레이아웃이 있으면 그것을 제시하고 확인받는다.
4. **언어 결정** — `kotlin` / `java` / 나중에.
5. **에이전트 결정** — 감지 결과를 보여주고 확인받는다. 전부 깔지 않는다.
   ```bash
   bash "$BOOTSTRAP_DIR/setup.sh" --stack=jvm --arch=<변형> --list-agents <대상_경로>
   ```
6. **치환값 확정** — `PROJECT_NAME`(표시명) · `PROJECT_SLUG`(모듈 접두사로도 쓰인다) ·
   `PACKAGE_NS`(예: `com.example.myapp`) · `DOMAIN_EXAMPLE`(예시 도메인 — 문서 곳곳에 박힌다) ·
   `PROTECTED_PATH`(기본 `docs/references`). 모르면 합리적 기본을 제안하고 확인받는다.
7. **`--dry-run` 선실행** → 설치될 파일 목록과 선택 결과를 보여준다.
8. **승인 후 실제 설치**:
   ```bash
   BOOTSTRAP_DIR="<플러그인 내 skills/hx-bootstrap 절대경로>"
   STACK=jvm ARCH=<변형> PROJECT_NAME="MyApp" PROJECT_SLUG="my-app" \
   PACKAGE_NS="com.example.myapp" DOMAIN_EXAMPLE="order" \
     bash "$BOOTSTRAP_DIR/setup.sh" --lang=kotlin --agents=claude,kiro <대상_경로>
   ```
9. **아키텍처별 후속 작업** — `setup.sh` 가 출력하는 "다음 단계"를 그대로 전달하고, 해당 자식 스킬을 이어서 로드한다:

   | 고른 ARCH | 이어서 로드할 스킬 |
   |---|---|
   | `hexagonal` · `hexagonal-nested` · `hexagonal-standalone` | `hx-jvm-hexagonal` |
   | `layered` | `hx-jvm-layered` |
   | `layered-multimodule` | `hx-jvm-layered-multimodule` |
   | `modulith` · `feature` · `multimodule` | 자식 스킬 없음 — `ARCHITECTURE.md` 와 `setup.sh` 안내를 따른다 |

10. **채우기·검증** — `.agents/rules/product.md`·`ARCHITECTURE.md`·`.agents/rules/structure.md` 의 `{{플레이스홀더}}` 를 채운 뒤:
    ```bash
    grep -rn '{{' . --include='*.md' | grep -vE '_spec-templates/|\{\{\.\.\.\}\}|PRODUCT_SLUG'   # 미치환 토큰 0 확인
    bash scripts/verify.sh                                          # 게이트 통과 확인
    ```
    `_spec-templates/` 의 `{{PRODUCT_SLUG}}`·`{{FEATURE_NAME}}`·`{{EPIC_ID}}` 는 **의도적으로 남기는 토큰**이다.

## 설치되는 것 (요약)

| 축 | 파일 |
|---|---|
| 진입점 | `AGENTS.md`(목차) · `CLAUDE.md`(리다이렉트) · `ARCHITECTURE.md`(**변형별**) |
| 규칙 원본 | `.agents/rules/` — `guardrails` · `security` · `api-standards` · `structure`(변형별) · `tech`(변형별) · **`design-principles`(객체지향·클린 아키텍처·SOLID)** · `code-comments` · `reliability` · `quality-score` · `product` · `writing-style` · `agent-harness` · `sdd-workflow` |
| SDD 기록 | `.agents/docs/` — `_spec-templates/` 원본 + `decisions/` + 색인 |
| 검증 게이트 | `scripts/verify.sh`(= `./gradlew check`) + hook·CI·pre-commit 얇은 트리거 |
| 에이전트 배선 | 고른 것만(`claude` 14 · `codex` 14 · `cursor` 9 · `kiro` 31) |

core 38개는 항상 깔린다. 총 설치 수 = 38 + 고른 에이전트의 합.

## 원칙

- **아키텍처를 임의로 정하지 않는다.** 선택 기준을 제시하고 사용자가 고른다. 기존 코드가 있으면 그것이 먼저다.
- **설치 로직을 복제하지 않는다.** 파일 복사·치환·lock 기록은 `setup.sh` 한 곳이다.
- 기존 파일은 덮지 않는다(`↷ skip`). `--force` 는 사용자가 명시적으로 요구할 때만.
- 설치 후 `.agents/harness-kit.json`·`.agents/harness-kit.lock` 이 생긴다. **커밋 대상**이다 — `hx-update` 가 이 파일로 사용자 수정본을 가려낸다.

## 관련

- 설치 상세·경로 맵: `../hx-bootstrap/manifest.md`
- 다른 스택(Python·Go): `hx-bootstrap` 스킬
- 에이전트 추가: `hx-agent-add` · 킷 업데이트: `hx-update`
