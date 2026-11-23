---
name: hx-electron-setup
description: Electron 데스크톱(TypeScript) 리포에 하네스 골격을 세팅한다. 아키텍처 3종(main-renderer · feature · monorepo) 중 프로젝트에 맞는 것을 고르게 한 뒤 hx-bootstrap 의 setup.sh 를 electron 스택으로 실행한다. 프로세스 경계(contextIsolation·nodeIntegration·sandbox) 가드가 검증 게이트에 포함된다. "Electron 프로젝트 세팅", "데스크톱 앱 하네스 깔아줘", "IPC 구조 잡아줘" 요청 시 사용.
---

# hx-electron-setup — Electron 데스크톱 하네스 세팅 (진입 스킬)

electron 스택 진입점이다. 하는 일은 둘이다.

1. **아키텍처를 고르게 한다** — 3종의 선택 기준을 제시하고 사용자가 정한다. 임의로 정하지 않는다.
2. **`hx-bootstrap` 의 `setup.sh` 를 실행한다** — 설치 로직은 한 곳뿐이다. 이 스킬은 그것을 복제하지 않는다.

> **이 스킬이 만드는 것은 규칙·문서·검증 게이트다.** `package.json`·`electron-builder` 설정·앱 코드는 만들지 않는다.

## 먼저 못 박는 것: 프로세스 경계

Electron 의 아키텍처는 폴더 구조가 아니라 **권한 경계**에서 시작한다.

| 프로세스 | 권한 | 신뢰 |
|---|---|---|
| main | Node·파일시스템·OS 전부 | 신뢰 경계 **안** |
| preload | 제한된 다리 — 화이트리스트만 노출 | 경계 그 자체 |
| renderer | 웹만. Node 권한 없음 | 신뢰 경계 **밖** |

`BrowserWindow` 는 **`contextIsolation: true` · `nodeIntegration: false` · `sandbox: true`** 로 연다.
이 셋은 협상 대상이 아니다 — 하나라도 풀면 렌더러의 XSS 하나가 곧바로 로컬 코드 실행이 된다.
그래서 `scripts/verify.sh` 는 이 값들을 **`fast` 레벨에서** grep 으로 막는다(에이전트 턴마다 실행된다).
`ipcRenderer` 를 통째로 `window` 에 붙이는 것도 같은 가드에서 잡힌다.

## 아키텍처 선택 (사용자에게 이 표를 보여주고 고르게 한다)

| ARCH | 한 줄 | 축 | 강제 수단 |
|---|---|---|---|
| `main-renderer` (기본) | 프로세스 자체가 구조다. 앱 하나, 기능 수가 적당하다 | `src/{main,preload,renderer,shared}` | 프로세스 가드 + ESLint import 제한 |
| `feature` | 기능이 많고 main/renderer 양쪽에 짝으로 존재한다 | 프로세스 × 기능 격자 | 위 + 기능 간 직접 import 금지 |
| `monorepo` | 데스크톱과 웹이 코드를 공유한다. 배포 단위가 여럿 | `apps/*` + `packages/*` 워크스페이스 | 위 + 워크스페이스 의존 방향 단방향 |

**고르는 순서로 묻는다.**

1. 데스크톱 말고 다른 배포 단위(웹·CLI 등)와 코드를 공유하는가?
   - 그렇다 → `monorepo`
   - 아니다 → 2번으로.
2. main 과 renderer 양쪽에 같은 이름의 기능이 여럿 생기는가?
   - 그렇다 → `feature`
   - 아니다 → `main-renderer`

**기존 코드가 있으면 그 레이아웃을 따른다**(임의 전환 금지):
`apps/` + `packages/` → `monorepo` · `src/*/features/` → `feature` · 그 외 `src/{main,renderer}` → `main-renderer`.

## 함께 깔리는 frontend 도메인 규칙

electron 은 web 과 `frontend` 도메인을 공유한다. 스택 규칙보다 먼저 읽히는 공통층이다.

| 규칙 | 무엇을 고정하나 |
|---|---|
| `design-system.md` | 토큰이 원본이다 — 색·간격·타이포를 컴포넌트에 하드코딩하지 않는다 |
| `accessibility.md` | 시맨틱 우선 · 키보드 도달 · 대비 · `prefers-reduced-motion` |
| `ui-state.md` | 서버/클라이언트/URL/폼 **4종을 섞지 않는다** · 파생 상태를 저장하지 않는다 |
| `frontend-performance.md` | 콜드 스타트·메모리·IPC p95 예산 · **main 프로세스를 막지 않는다** |

## 절차

1. **킷 위치 확인** — 이 스킬이 로드된 폴더의 형제인 `hx-bootstrap/` 의 절대경로를 `BOOTSTRAP_DIR` 로 잡는다.
   대상 리포의 `pwd` 로 유추하지 않는다(플러그인 스킬은 대상 리포 바깥에 있다).
2. **스택 확인** — `package.json` 에 `electron` 의존이 있는지 본다. 없으면 웹 전용일 수 있다 — `hx-web-setup` 인지 확인한다.
3. **아키텍처 결정** — 위 선택 순서대로 묻는다. 기존 레이아웃이 있으면 그것을 제시하고 확인받는다.
4. **선택 모듈 결정** — 기본은 설치하지 않는다.
   ```bash
   bash "$BOOTSTRAP_DIR/setup.sh" --list-modules
   ```
   | 모듈 | 켤 때 |
   |---|---|
   | `jira-workflow` | Jira 등 이슈 트래커를 에이전트가 직접 전이시킬 때 |
   | `platform-guards` | 프로젝트 고유 불변식(예: 특정 Node API 사용 금지)을 grep 가드로 승격시킬 때 |
5. **에이전트 결정** — 감지 결과를 보여주고 확인받는다. 전부 깔지 않는다.
   ```bash
   bash "$BOOTSTRAP_DIR/setup.sh" --stack=electron --arch=<변형> --list-agents <대상_경로>
   ```
6. **치환값 확정** — `PROJECT_NAME`(표시명) · `PROJECT_SLUG` · `PACKAGE_NS`(**앱 ID** — 역 도메인, 예: `com.example.my-app`. `electron-builder` 의 `appId` 로 그대로 쓴다) ·
   `DOMAIN_EXAMPLE` · `PROTECTED_PATH`(기본 `docs/references`).
7. **`--dry-run` 선실행** → 설치될 파일 목록과 선택 결과를 보여준다.
8. **승인 후 실제 설치**:
   ```bash
   BOOTSTRAP_DIR="<플러그인 내 skills/hx-bootstrap 절대경로>"
   STACK=electron ARCH=main-renderer PROJECT_NAME="MyApp" PROJECT_SLUG="my-app" \
   PACKAGE_NS="com.example.my-app" DOMAIN_EXAMPLE="workspace" \
     bash "$BOOTSTRAP_DIR/setup.sh" --agents=claude,codex <대상_경로>
   ```
9. **다음 단계 전달** — `setup.sh` 출력의 "다음 단계"를 그대로 전달한다. 요지:
   프로세스 경계를 먼저 세우고, **IPC 채널 목록을 한 파일에 모아** preload 에서 화이트리스트로만 노출하고,
   main 핸들러는 인자를 스키마로 파싱한 뒤 쓴다(렌더러 입력은 신뢰 경계 밖이다).
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
| 공통 규칙 | `.agents/rules/` — `guardrails` · `security` · `api-standards` · `design-principles` · `code-comments` · `reliability` · `quality-score` · `product` · `writing-style` · `agent-harness` · `sdd-workflow` · `reuse-before-new` · `verification-ladder` · `pr-review-policy` |
| frontend 도메인 | `design-system` · `accessibility` · `ui-state` · `frontend-performance` |
| 스택·변형 | `structure`(변형별) · `tech`(변형별) |
| 검증 게이트 | `scripts/verify.sh`(구조→포맷→**프로세스 경계 가드**→lint→typecheck→가드→test→build) + hook·CI·pre-commit 얇은 트리거 |
| 에이전트 배선 | 고른 것만(`claude` 14 · `codex` 14 · `cursor` 9 · `kiro` 38) |

core 46개는 항상 깔린다. 총 설치 수 = 46 + 고른 에이전트의 합 (+ 선택 모듈).

## 원칙

- **프로세스 경계 셋(`contextIsolation`·`nodeIntegration`·`sandbox`)을 예외로 풀지 않는다.** 게이트가 막는다.
- **아키텍처를 임의로 정하지 않는다.** 선택 기준을 제시하고 사용자가 고른다. 기존 코드가 있으면 그것이 먼저다.
- **설치 로직을 복제하지 않는다.** 파일 복사·치환·lock 기록은 `setup.sh` 한 곳이다.
- 기존 파일은 덮지 않는다(`↷ skip`). `--force` 는 사용자가 명시적으로 요구할 때만.
- 설치 후 `.agents/harness-kit.json`·`.agents/harness-kit.lock` 이 생긴다. **커밋 대상**이다 — `hx-update` 가 이 파일로 사용자 수정본을 가려낸다.

## 관련

- 설치 상세·경로 맵: `../hx-bootstrap/manifest.md`
- 웹 프론트엔드: `hx-web-setup` · 백엔드(JVM): `hx-jvm-setup` · 그 외 스택: `hx-bootstrap`
- 에이전트 추가: `hx-agent-add` · 킷 업데이트: `hx-update`
