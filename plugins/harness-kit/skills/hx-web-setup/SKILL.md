---
name: hx-web-setup
description: 웹 프론트엔드(TypeScript + React) 리포에 하네스 골격을 세팅한다. 아키텍처 3종(nextjs-app · react-spa · feature-sliced) 중 프로젝트에 맞는 것을 고르게 한 뒤 hx-bootstrap 의 setup.sh 를 web 스택으로 실행한다. frontend 도메인 규칙(디자인 시스템·접근성·UI 상태·성능)이 함께 깔린다. "웹 프로젝트 세팅", "Next.js 하네스 깔아줘", "React 프론트 초기 설정", "FSD 구조 잡아줘" 요청 시 사용.
---

# hx-web-setup — 웹 프론트엔드 하네스 세팅 (진입 스킬)

web 스택 진입점이다. 하는 일은 둘이다.

1. **아키텍처를 고르게 한다** — 3종의 선택 기준을 제시하고 사용자가 정한다. 임의로 정하지 않는다.
2. **`hx-bootstrap` 의 `setup.sh` 를 실행한다** — 설치 로직은 한 곳뿐이다. 이 스킬은 그것을 복제하지 않는다.

> **이 스킬이 만드는 것은 규칙·문서·검증 게이트다.** `package.json`·컴포넌트 코드는 만들지 않는다.
> 설치 후 무엇을 손으로 세워야 하는지는 `setup.sh` 가 출력하는 "다음 단계"에 있다.

**프론트엔드에는 컴파일 레벨의 레이어 강제가 없다.** 경계를 지키는 수단은 TypeScript `strict` 와 ESLint import 규칙뿐이다.
그래서 이 스택에서는 "규칙 등록"이 곧 강제다 — **등록하지 않은 경계는 존재하지 않는 경계다.**

## 아키텍처 선택 (사용자에게 이 표를 보여주고 고르게 한다)

| ARCH | 한 줄 | 축 | 강제 수단 |
|---|---|---|---|
| `nextjs-app` (기본) | Next.js App Router. **서버/클라이언트 경계**가 설계의 축이다 | 라우트 세그먼트 + `server/` | `server-only`/`client-only`(컴파일) + ESLint import 제한 |
| `react-spa` | 번들 하나로 도는 SPA(Vite 등). 라우팅을 한 곳에서 선언한다 | 화면 + 기능 폴더 | ESLint import 규칙 + `strict` |
| `feature-sliced` | 팀이 크고 기능 소유가 갈린다. 6계층 FSD 로 방향을 고정한다 | `app→pages→widgets→features→entities→shared` | ESLint `boundaries/element-types` 허용 행렬 |

**고르는 순서로 묻는다.**

1. 서버 렌더링·서버 액션·서버 전용 데이터 접근이 필요한가?
   - 그렇다 → `nextjs-app`
   - 아니다 → 2번으로.
2. 기능 소유가 사람·팀별로 갈리고, 계층을 기계적으로 강제하고 싶은가?
   - 그렇다 → `feature-sliced`
   - 아니다 → `react-spa`

**기존 코드가 있으면 그 레이아웃을 따른다**(임의 전환 금지):
`app/` 라우트 세그먼트 → `nextjs-app` · `src/{entities,features,widgets,shared}` → `feature-sliced` · 그 외 `src/` + `main.tsx` → `react-spa`.

## 함께 깔리는 frontend 도메인 규칙

web·electron 은 `frontend` 도메인을 공유한다. 스택 규칙보다 먼저 읽히는 공통층이다.

| 규칙 | 무엇을 고정하나 |
|---|---|
| `design-system.md` | 토큰이 원본이다 — 색·간격·타이포를 컴포넌트에 하드코딩하지 않는다 |
| `accessibility.md` | 시맨틱 우선 · 키보드 도달 · 대비 · `prefers-reduced-motion` |
| `ui-state.md` | 서버/클라이언트/URL/폼 **4종을 섞지 않는다** · 파생 상태를 저장하지 않는다 · 화면 4상태(로딩·비어있음·에러·부분) |
| `frontend-performance.md` | 예산(CWV·번들)을 먼저 정하고 **측정 없이 고치지 않는다** · 합성 가능한 속성만 애니메이션 |

## 절차

1. **킷 위치 확인** — 이 스킬이 로드된 폴더의 형제인 `hx-bootstrap/` 의 절대경로를 `BOOTSTRAP_DIR` 로 잡는다.
   대상 리포의 `pwd` 로 유추하지 않는다(플러그인 스킬은 대상 리포 바깥에 있다).
2. **스택 확인** — `package.json`·`tsconfig.json` 을 본다. `electron` 의존이 보이면 이 스킬이 아니라 `hx-electron-setup` 으로 보낸다.
   JVM/Python/Go 리포로 보이면 `hx-bootstrap` 으로 보낸다.
3. **아키텍처 결정** — 위 선택 순서대로 묻는다. 기존 레이아웃이 있으면 그것을 제시하고 확인받는다.
4. **선택 모듈 결정** — 기본은 설치하지 않는다. 필요할 때만 켠다.
   ```bash
   bash "$BOOTSTRAP_DIR/setup.sh" --list-modules
   ```
   | 모듈 | 켤 때 |
   |---|---|
   | `jira-workflow` | Jira 등 이슈 트래커를 에이전트가 직접 전이시킬 때 |
   | `platform-guards` | 프로젝트 고유 불변식을 grep 가드로 승격시킬 때 |
5. **에이전트 결정** — 감지 결과를 보여주고 확인받는다. 전부 깔지 않는다.
   ```bash
   bash "$BOOTSTRAP_DIR/setup.sh" --stack=web --arch=<변형> --list-agents <대상_경로>
   ```
6. **치환값 확정** — `PROJECT_NAME`(표시명) · `PROJECT_SLUG` · `PACKAGE_NS`(**임포트 별칭 루트** — 예: `@` → `tsconfig` paths 의 `"@/*"`) ·
   `DOMAIN_EXAMPLE`(예시 도메인 — 문서 곳곳에 박힌다) · `PROTECTED_PATH`(기본 `docs/references`).
   모르면 합리적 기본을 제안하고 확인받는다.
7. **`--dry-run` 선실행** → 설치될 파일 목록과 선택 결과를 보여준다.
8. **승인 후 실제 설치**:
   ```bash
   BOOTSTRAP_DIR="<플러그인 내 skills/hx-bootstrap 절대경로>"
   STACK=web ARCH=nextjs-app PROJECT_NAME="MyApp" PROJECT_SLUG="my-app" \
   PACKAGE_NS="@" DOMAIN_EXAMPLE="order" \
     bash "$BOOTSTRAP_DIR/setup.sh" --agents=claude,cursor <대상_경로>
   ```
9. **다음 단계 전달** — `setup.sh` 출력의 "다음 단계"를 그대로 전달한다. 요지:
   `package.json` 스크립트 이름을 게이트(`lint`·`typecheck`·`test`·`build`)에 맞추고,
   `tsconfig` 에 `strict` + `noUncheckedIndexedAccess` 를 켜고,
   **ESLint import 경계 규칙을 등록한다**(골격은 `ARCHITECTURE.md` §4).
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
| 검증 게이트 | `scripts/verify.sh`(구조→포맷→lint→typecheck→가드→test→build) + hook·CI·pre-commit 얇은 트리거 |
| 에이전트 배선 | 고른 것만(`claude` 14 · `codex` 14 · `cursor` 9 · `kiro` 38) |

core 46개는 항상 깔린다. 총 설치 수 = 46 + 고른 에이전트의 합 (+ 선택 모듈).

## 원칙

- **아키텍처를 임의로 정하지 않는다.** 선택 기준을 제시하고 사용자가 고른다. 기존 코드가 있으면 그것이 먼저다.
- **설치 로직을 복제하지 않는다.** 파일 복사·치환·lock 기록은 `setup.sh` 한 곳이다.
- **ESLint 규칙 등록을 미루지 않는다.** 프론트엔드는 그것 말고 경계를 지킬 수단이 없다.
- 기존 파일은 덮지 않는다(`↷ skip`). `--force` 는 사용자가 명시적으로 요구할 때만.
- 설치 후 `.agents/harness-kit.json`·`.agents/harness-kit.lock` 이 생긴다. **커밋 대상**이다 — `hx-update` 가 이 파일로 사용자 수정본을 가려낸다.

## 관련

- 설치 상세·경로 맵: `../hx-bootstrap/manifest.md`
- 데스크톱(Electron): `hx-electron-setup` · 백엔드(JVM): `hx-jvm-setup` · 그 외 스택: `hx-bootstrap`
- 에이전트 추가: `hx-agent-add` · 킷 업데이트: `hx-update`
