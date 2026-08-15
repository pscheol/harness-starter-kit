<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}(앱 ID)·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Electron · 아키텍처: monorepo(워크스페이스) -->

# ARCHITECTURE — {{PROJECT_NAME}} (monorepo)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

데스크톱 앱과 웹 앱이 **로직과 UI를 공유**하는 워크스페이스 구조다.
축이 둘이다 — 프로세스 경계(main · preload · renderer)와 **패키지 의존 방향**(apps → packages).
가장 중요한 규칙은 하나다: **`packages/core`는 Electron도 DOM도 모른다.**

스택 기준(버전 기준은 각 `package.json` — 구체 버전은 **예시이며 프로젝트에서 확정**):
Electron · TypeScript(strict) · React · 워크스페이스 도구 · 번들러 · 스키마 파서 · ESLint · Prettier · 테스트 러너 · E2E · 패키징 도구.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 데스크톱과 웹을 **둘 다 만든다**(또는 곧 만든다는 확정된 계획이 있다).
- 도메인 로직·디자인 시스템을 두 앱이 공유해야 한다.
- 공유 코드에 독립적인 테스트·버전 사이클이 필요하다.

**쓰지 않는다:**
- 데스크톱만 만든다 → `main-renderer` 또는 `feature`.
  **"언젠가 웹도"는 근거가 아니다.** 모노레포는 빌드·의존성·CI 복잡도를 즉시 올린다.
- 공유할 로직이 사실상 없다(앱 대부분이 Electron API에 붙어 있다).
- 팀이 워크스페이스 도구에 익숙하지 않고 마감이 급하다.

경계 오류 신호(구조가 아니라 패키지 나누기가 잘못된 것):
- `packages/core`에 Electron·DOM import가 들어간다 → 그 코드는 앱으로 내려가야 한다.
- `packages/*`가 `apps/*`를 참조한다 → 순환이다.
- 웹 앱이 실제로는 안 만들어지고 `apps/web`이 비어 있다 → 단일 앱 변형으로 되돌린다.

전환 절차는 §12.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 프로세스 경계(격리·샌드박스·Node 권한) | **게이트의 경계 가드**(`verify.sh` fast 단계) | 게이트 차단 |
| **`packages/core`는 플랫폼을 모른다** | ESLint import 규칙 + 패키지 `dependencies` 미등록 | 게이트 차단 · 빌드 실패 |
| 의존 방향 apps → packages(단방향) | ESLint 규칙 + 워크스페이스 의존 그래프 | 게이트 차단 |
| 패키지는 공개 API(`exports`)로만 열린다 | `package.json`의 `exports` 필드 | 빌드 실패 |
| 렌더러가 main 모듈을 import하지 않는다 | ESLint import 규칙 + 번들 분리 | 게이트 차단 · 빌드 실패 |
| IPC 인자는 스키마로 파싱 | 리뷰 + 테스트 | 리뷰 차단 |
| 타입 경계 | `strict` + `noUncheckedIndexedAccess` | 타입 검사 실패 |
| 접근성 기본 | `eslint-plugin-jsx-a11y` | 게이트 차단 |
| 테스트 우선(TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80% | 커버리지 게이트 |

> `packages/core`의 순수성은 **의존성 목록으로도 강제된다.** `core/package.json`에 `electron`을
> 넣지 않으면 import 자체가 해석되지 않는다. 규칙보다 강한 강제다 — 이 장치를 먼저 쓴다.

---

## 2. 시스템 경계

```
┌──────────────────────────────────────────────────────────────┐
│ apps/desktop  (Electron: main · preload · renderer)          │
│ apps/web      (브라우저)                                       │
└───────────────────────────┬──────────────────────────────────┘
                            │ 단방향 (apps → packages)
        ┌───────────────────┴────────────────────┐
        ▼                                        ▼
┌──────────────────────┐              ┌──────────────────────┐
│ packages/core         │              │ packages/ui          │
│ 도메인 로직·스키마     │◀─────────────│ 공용 컴포넌트·토큰     │
│ **Electron·DOM 무의존**│              │ (DOM 은 알아도 된다)  │
└──────────────────────┘              └──────────────────────┘
```

- `packages/core`는 **어느 런타임에서나 돈다.** Node에서도 브라우저에서도 테스트가 돈다.
- `packages/ui`는 DOM을 알아도 되지만 **Electron은 모른다.** 웹에서도 그대로 쓰여야 한다.
- 데스크톱 고유 능력(파일·셸·키체인)은 `apps/desktop/main`에만 있다.

---

## 3. 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── pnpm-workspace.yaml           # 워크스페이스 선언(도구에 맞게)
├── package.json                  # 루트: 스크립트 조립만. 런타임 의존성 두지 않는다
├── apps/
│   ├── desktop/
│   │   ├── package.json          #   electron 의존은 여기에만
│   │   └── src/
│   │       ├── main/{index.ts,window/,ipc/,service/,store/,external/,platform/}
│   │       ├── preload/index.ts
│   │       ├── renderer/{main.tsx,shell/,features/,styles/}
│   │       └── shared/{channels.ts,features/<f>/contract.ts}
│   └── web/
│       ├── package.json
│       └── src/{app/,pages/,features/,api/}
├── packages/
│   ├── core/                     # ★ 도메인 로직·스키마·계산. 플랫폼 무의존
│   │   ├── package.json          #   dependencies 에 electron·react 없음
│   │   └── src/{{DOMAIN_EXAMPLE}}/{model.ts,schema.ts,rules.ts,index.ts}
│   └── ui/                       # 공용 컴포넌트·토큰
│       ├── package.json
│       └── src/{components/,tokens/,index.ts}
├── tests/ · e2e/
├── scripts/verify.sh             # 단일 검증 게이트(루트에서 전체를 돈다)
└── docs/
```

- **루트 `package.json`에 런타임 의존성을 두지 않는다.** 두는 순간 모든 앱이 그 의존성을 갖는다.
- `apps/desktop/src/shared/`는 desktop 내부의 프로세스 간 공유다. **패키지 `core`와 다른 것**이다:
  `shared`는 IPC 계약, `core`는 도메인 로직.
- 테스트는 각 패키지·앱 안에 둔다. E2E만 루트 `e2e/`에 모은다.

### 3.1 패키지 규약

| 패키지 | 알아도 되는 것 | 절대 모르는 것 |
|---|---|---|
| `packages/core` | 표준 언어 기능·스키마 파서 | Electron · DOM · React · 파일시스템 |
| `packages/ui` | React · DOM · `core` 타입 | Electron · Node · 앱의 라우팅 |
| `apps/desktop` | 전부 | 다른 앱(`apps/web`) |
| `apps/web` | `core` · `ui` | 다른 앱(`apps/desktop`) |

- **`core`의 순수성이 이 구조 전체의 근거**다. 깨지면 모노레포를 유지할 이유가 사라진다.
- `core`에 파일 읽기·네트워크 호출을 넣지 않는다. **인터페이스를 선언하고 앱이 구현을 주입**한다.
- `ui` 컴포넌트가 데이터를 스스로 가져오지 않는다. props로 받는다.
- 앱끼리 참조하지 않는다. 공유가 필요하면 패키지로 내린다.

### 3.2 패키지 공개 API

```jsonc
// packages/core/package.json — 내부 경로 접근을 막는다
{
  "name": "@{{PROJECT_SLUG}}/core",
  "exports": { ".": "./src/index.ts", "./{{DOMAIN_EXAMPLE}}": "./src/{{DOMAIN_EXAMPLE}}/index.ts" },
  "dependencies": { }        // electron·react 를 넣지 않는다 — 이것이 가장 강한 강제다
}
```

- `exports`에 선언하지 않은 경로는 import되지 않는다. 배럴 파일 하나로 전부 열지 않는다.
- 패키지 간 참조는 **패키지 이름**으로 한다(`@{{PROJECT_SLUG}}/core`). 상대 경로로 워크스페이스를 가로지르지 않는다.

### 3.3 ESLint 경계 규칙 (골격)

```js
// eslint.config.js
{
  files: ['packages/core/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['electron', 'node:*', 'fs', 'path', 'react', 'react-dom'],
          message: 'core 는 플랫폼을 모른다 — 인터페이스를 선언하고 앱이 구현을 주입한다' },
        { group: ['@{{PROJECT_SLUG}}/ui', '**/apps/**'], message: 'core 는 상위를 참조하지 않는다' },
      ],
    }],
  },
},
{
  files: ['packages/ui/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['electron', 'node:*'], message: 'ui 는 Electron·Node 를 모른다(웹에서도 쓰인다)' },
        { group: ['**/apps/**'], message: 'ui 는 앱을 참조하지 않는다' },
      ],
    }],
  },
},
{
  files: ['apps/desktop/src/renderer/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['electron', 'node:*', '**/main/**', '**/preload/**'],
          message: '렌더러는 권한이 없다 — preload 화이트리스트를 경유한다' },
      ],
    }],
  },
},
{
  files: ['apps/desktop/src/shared/**'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ group: ['electron', 'node:*'] }] }],
  },
}
```

### 3.4 경계 검사 자동화

1. **패키지 `dependencies`** — 선언하지 않은 것은 import되지 않는다. 가장 강한 강제.
2. **게이트의 프로세스 경계 가드**(`scripts/verify.sh`) — 위험 설정 grep. `fast`에도 포함.
3. `eslint` — 패키지·프로세스 import 방향.
4. `tsc --noEmit` — 각 패키지·앱을 프로젝트 참조로 검사.
5. **빌드** — 두 앱 모두 빌드해야 공유 코드의 플랫폼 오염이 드러난다.

---

## 4. 공유 코드 나누기

- **`core`로 올리는 기준**: 두 앱이 실제로 쓰고, 플랫폼 API 없이 표현할 수 있는가.
  둘 중 하나라도 아니면 앱에 둔다.
- **"나중에 공유할 것 같아서" 올리지 않는다.** 올라간 코드는 두 앱의 요구를 동시에 만족해야 해서
  내리는 비용이 올리는 비용보다 크다.
- 플랫폼이 필요한 로직은 `core`가 **인터페이스만 선언**하고 각 앱이 구현을 주입한다.

```ts
// packages/core/src/{{DOMAIN_EXAMPLE}}/rules.ts — 저장 방식을 모른다
export interface {{DOMAIN_EXAMPLE}}Repository {
  list(query: ListQuery): Promise<readonly {{DOMAIN_EXAMPLE}}[]>;
}
// apps/desktop 은 파일 구현을, apps/web 은 HTTP 구현을 주입한다.
```

- `ui`로 올리는 기준은 **도메인을 모르는가**. 도메인을 알면 앱의 features에 둔다.

---

## 5. 데스크톱 앱 내부

`apps/desktop` 안의 프로세스 책임·IPC 계약·preload 규약은 `main-renderer` 변형과 **완전히 동일**하다.
원본은 `.agents/rules/structure.md`·`.agents/rules/security.md`·`.agents/rules/api-standards.md`.

- `main/service`는 `packages/core`의 도메인 로직을 호출하고, 저장·외부 호출 구현을 주입한다.
- `renderer`는 `packages/ui` 컴포넌트를 쓰고, 데이터는 `renderer/ipc` 계층을 경유한다.
- `apps/desktop/src/shared`는 **IPC 계약 전용**이다. 도메인 로직을 여기 두지 않는다(그건 `core`).

---

## 6. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. Why · 함정 · 외부 근거 · 억제 이유만 적는다.
- **`packages/core`의 인터페이스에는 "어느 앱이 무엇으로 구현하는지"** 를 남긴다.
- 패키지 `index.ts`에는 그 패키지가 무엇을 소유하는지 한 줄.
- IPC 핸들러에는 신뢰 수준과 부작용을 적는다.
- 한국어로 작성한다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 7. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 도메인 상수·스키마 | 상태·규칙·검증 | `packages/core` |
| (b) 디자인 토큰 | 색·간격·타이포·모션 | `packages/ui/tokens` (두 앱이 공유) |
| (c) IPC 채널 | 채널 이름 | `apps/desktop/src/shared/channels.ts` |
| (d) 환경별 설정 | API 베이스·업데이트 채널 | 각 앱의 config(데스크톱 비밀은 main에만) |
| (e) 경로 | 앱 데이터·로그 | `apps/desktop/src/main/platform/paths` |

- 디자인 토큰을 앱마다 따로 두지 않는다. 두 앱의 화면이 갈라진다.

---

## 8. 성능 예산

- 원본은 `.agents/rules/frontend-performance.md`.
- **`packages/ui`에 무거운 의존성을 넣으면 두 앱이 함께 무거워진다.** 동적 import로 내린다.
- `core`는 트리셰이킹이 되어야 한다. 배럴 파일에서 부수효과 있는 모듈을 re-export하지 않는다.
- 데스크톱 고유(콜드 스타트·main 블로킹·IPC 배치)는 `main-renderer`와 동일하다.

---

## 9. TDD 워크플로 (요약)

| 대상 | 도구 | 비고 |
|---|---|---|
| `packages/core` | 테스트 러너 | **플랫폼 없이** 돈다. 가장 빠르고 가장 많이 |
| `packages/ui` | 테스트 러너 + 렌더 유틸 | 도메인 없이 props 만으로 |
| `apps/desktop/main` | 테스트 러너 | `platform` 어댑터를 대체 |
| `apps/desktop/renderer` | 테스트 러너 + 렌더 유틸 | `window.<api>`를 대체해 주입 |
| `apps/web` | 테스트 러너 | 요청 가로채기로 네트워크 고정 |
| 앱 흐름 | E2E(각 앱) | 데스크톱은 실제 앱 기동 |

- **`core` 테스트가 Electron이나 DOM을 필요로 하면 그 코드는 `core`에 있으면 안 된다.**
  테스트가 곧 순수성 검사다.
- 검증 게이트: `bash scripts/verify.sh`(루트에서 전체 워크스페이스를 돈다).

---

## 10. 새 기능 추가 워크플로

1. **어디에 둘지 먼저 정한다**: 두 앱이 쓰는 도메인 로직인가(`core`) · 공용 UI인가(`ui`) ·
   한 앱의 것인가(`apps/*`). 애매하면 **앱에서 시작해 나중에 올린다**(내리는 것이 더 비싸다).
2. `core`에 필요한 로직·스키마를 만들고 테스트한다(플랫폼 없이 도는 상태로).
3. 데스크톱: `shared/features/<f>/contract.ts` → `main/service`(core 호출 + 구현 주입) →
   `main/ipc` → `preload` → `renderer`.
4. 웹: `api/` 클라이언트가 같은 `core` 로직을 쓰도록 구현을 주입한다.
5. 화면은 **네 상태(loading·empty·error·partial)를 처음부터** 만든다.
6. **검증**: `bash scripts/verify.sh` 통과(두 앱 빌드 포함) + 계약 문서·화면 명세 갱신.

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- `packages/core`에 `electron`·`react`·`fs`·DOM API import(또는 `dependencies`에 추가).
- `packages/*`가 `apps/*`를 참조(순환).
- `apps/desktop`이 `apps/web`을 참조(또는 반대).
- 패키지 내부 경로를 직접 import(`@{{PROJECT_SLUG}}/core/src/...`). `exports`만 쓴다.
- 루트 `package.json`에 런타임 의존성 추가.
- 공유하지 않는 코드를 "나중을 위해" `packages`로 올리기.
- 디자인 토큰을 앱마다 따로 두기.
- `apps/desktop/src/shared`에 도메인 로직 넣기(그건 `core`).
- 프로세스 경계 해제(`contextIsolation: false`·`nodeIntegration: true`·`sandbox: false`).
- `ipcRenderer` 통째 노출, main 핸들러의 인자 파싱 생략.
- `ui` 컴포넌트가 데이터를 스스로 가져오기.
- 한 앱만 빌드하고 게이트를 통과시키기(공유 코드 오염이 다른 앱에서만 드러난다).

---

## 12. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `feature` (웹을 접고 데스크톱만 남길 때) | `apps/desktop/src`를 리포 루트 `src`로 올리고, `packages/core`·`packages/ui`를 그 안으로 흡수한다(`core`는 기능별 `service`로, `ui`는 `renderer/components`로). | 패키지 방향 규칙을 제거하고 기능 독립 규칙으로 교체. 프로세스 경계 규칙은 유지 |
| → `main-renderer` (기능도 적을 때) | 위와 같되 기능 슬라이스 없이 레이어로 펼친다. | 패키지·기능 규칙 제거. 프로세스 경계 규칙만 유지 |

- **웹 앱이 실제로 만들어지지 않았다면 되돌리는 것이 옳다.** 빈 `apps/web`은 비용만 남긴다.
- 전환 전에 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).
- 한 패키지씩 흡수하고 각 단계마다 `scripts/verify.sh`를 통과시킨다.

---

## 13. 관련 문서

- 규칙 원본: `.agents/rules/`(`guardrails.md`·`security.md`·`api-standards.md`·`structure.md`·`tech.md`)
- 프론트엔드 공통: `design-system.md`·`accessibility.md`·`ui-state.md`·`frontend-performance.md`
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
