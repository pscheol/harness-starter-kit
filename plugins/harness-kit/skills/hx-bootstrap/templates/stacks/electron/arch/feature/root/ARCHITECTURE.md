<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}(앱 ID)·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Electron · 아키텍처: feature(프로세스 + 기능 슬라이스) -->

# ARCHITECTURE — {{PROJECT_NAME}} (feature)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

프로세스 경계(main · preload · renderer) 위에 **기능 슬라이스**를 얹는다.
한 기능은 프로세스 양쪽에 **같은 이름의 디렉터리**를 갖고, 둘을 잇는 IPC 계약은 `shared`의 한 파일이다.
"이 기능을 고치려면 어디를 열어야 하나"의 답이 세 경로로 고정된다.

스택 기준(버전 기준은 `package.json` — 구체 버전은 **예시이며 프로젝트에서 확정**):
Electron · TypeScript(strict) · React · 번들러 · 스키마 파서 · ESLint · Prettier · 테스트 러너 · E2E · 패키징 도구.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 기능 영역이 이미 여럿이고, 한 기능을 고치는 변경이 그 기능 안에서 끝난다.
- 여러 사람이 서로 다른 기능을 동시에 만져 충돌을 줄이고 싶다.
- main과 renderer를 오가며 같은 기능을 작업하는 일이 잦다(디렉터리를 찾아다니는 비용이 실제 비용이 됐다).

**쓰지 않는다:**
- 기능이 서넛뿐이다 → `main-renderer`. **슬라이스 규율 비용이 이득을 넘는다.**
- 웹 버전과 코드를 공유해야 한다 → `monorepo`.

승격 신호(이 중 둘 이상이면 `monorepo` 전환을 검토한다):
1. 같은 로직을 웹에서도 써야 한다는 **요구가 실제로** 생겼다.
2. 기능 일부를 별도 배포 단위로 떼어낼 계획이 생겼다.
3. 공유 코드에 독립적인 버전·테스트 사이클이 필요해졌다.

경계 오류 신호(전환이 아니라 슬라이스를 다시 그어야 한다):
- 기능 간 직접 import가 필요하다는 요구가 반복된다.
- 한 화면이 세 기능의 상태를 동시에 조작한다.
- `platform`·공용 디렉터리가 기능 이름을 알기 시작한다.

전환 절차는 §12.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 프로세스 경계(격리·샌드박스·Node 권한) | **게이트의 경계 가드**(`verify.sh` fast 단계) | 게이트 차단 |
| 렌더러가 main 모듈을 import하지 않는다 | ESLint import 규칙 + 번들 분리 | 게이트 차단 · 빌드 실패 |
| `shared`에 런타임 Node API 없음 | ESLint 규칙 + 렌더러 빌드 | 게이트 차단 · 빌드 실패 |
| **기능 간 직접 import 금지** | ESLint import 규칙(§3.3) | 게이트 차단 |
| 기능의 IPC 계약은 한 파일 | 리뷰 + 채널 상수 단일 소스 | 리뷰 차단 |
| IPC 인자는 스키마로 파싱 | 리뷰 + 테스트 | 리뷰 차단 |
| 타입 경계 | `strict` + `noUncheckedIndexedAccess` | 타입 검사 실패 |
| 접근성 기본 | `eslint-plugin-jsx-a11y` | 게이트 차단 |
| 테스트 우선(TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80% | 커버리지 게이트 |

> **프로세스 경계 규칙은 `main-renderer`와 동일하다.** 이 변형이 더하는 것은 기능 독립 규칙 하나다.
> 그 규칙이 자동 검사되지 않으면 디렉터리만 기능별이고 실제 결합은 그대로다.

---

## 2. 시스템 경계

```
┌────────────────────────────────────────────────────────────────┐
│ {{PROJECT_NAME}} (앱 ID: {{PACKAGE_NS}})                        │
│                                                                │
│  renderer/features/{{DOMAIN_EXAMPLE}}  ──┐                      │
│  renderer/features/settings           ──┤ preload 화이트리스트   │
│                                          │                      │
│                        shared/features/<f>/contract.ts (계약)   │
│                                          │                      │
│  main/features/{{DOMAIN_EXAMPLE}}      ──┘                      │
│  main/features/settings                                        │
│  main/platform (기능을 모른다) · main/window                    │
└────────────────────────────────────────────────────────────────┘
```

- 기능은 **코드 경계이지 배포 경계가 아니다.** 하나의 앱, 하나의 프로세스 집합으로 배포된다.
- 다만 소유권은 기능에 있다: 다른 기능의 저장소·상태를 직접 건드리지 않는다(§4).

---

## 3. 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── src/
│   ├── main/
│   │   ├── index.ts              # 진입점: 생명주기·기능 등록·조립만
│   │   ├── window/               # 창 생성·플랫폼 분기(기능을 모른다)
│   │   ├── platform/             # 로깅·경로·키체인·업데이트(기능을 모른다)
│   │   └── features/
│   │       └── {{DOMAIN_EXAMPLE}}/
│   │           ├── ipc.ts        #   채널 핸들러 등록(얇게)
│   │           ├── service.ts    #   도메인 로직
│   │           ├── store.ts      #   이 기능이 소유한 저장소 접근
│   │           └── *.test.ts
│   ├── preload/
│   │   ├── index.ts              # 기능별 노출을 조립만 한다
│   │   └── features/{{DOMAIN_EXAMPLE}}.ts   # 이 기능의 화이트리스트 API
│   ├── renderer/
│   │   ├── main.tsx · App.tsx · routes/
│   │   ├── shell/                # 앱 셸: 라우팅·프로바이더·전역 에러 경계
│   │   ├── components/ · hooks/ · lib/ · styles/   # 기능을 모른다
│   │   └── features/
│   │       └── {{DOMAIN_EXAMPLE}}/{ui,hooks,ipc.ts,index.ts}
│   └── shared/
│       ├── channels.ts           # 채널 상수 집계(기능별 상수를 모은다)
│       └── features/{{DOMAIN_EXAMPLE}}/contract.ts   # ★ 이 기능의 계약 단일 소스
├── resources/ · build/ · tests/ · e2e/
├── scripts/verify.sh             # 단일 검증 게이트
└── docs/
```

- **한 기능 = 세 경로**: `main/features/<f>` · `renderer/features/<f>` · `shared/features/<f>`.
  이름을 반드시 같게 유지한다. 다르면 이 변형의 유일한 이점이 사라진다.
- `main/index.ts`·`preload/index.ts`는 **조립만** 한다. 기능 로직을 두지 않는다.
- `main/platform`·`main/window`·`renderer/components`는 **기능을 모른다.** 역참조 금지.
- 테스트는 기능 디렉터리 안에 둔다. 기능을 지우면 테스트도 함께 사라진다.

### 3.1 기능 슬라이스 규약

| 위치 | 책임 | 노출 |
|---|---|---|
| `shared/features/<f>/contract.ts` | 채널 상수·요청/응답 스키마·도메인 타입 | 이 기능의 **공개 표면** |
| `main/features/<f>/ipc.ts` | 채널 등록·파싱·정책·응답 변환 | `register(...)` 하나 |
| `main/features/<f>/service.ts` | 도메인 로직 | 모듈 내부 |
| `main/features/<f>/store.ts` | 이 기능이 소유한 저장소 | 모듈 내부 |
| `preload/features/<f>.ts` | 화이트리스트 API | 노출 객체 하나 |
| `renderer/features/<f>/index.ts` | 화면·훅의 공개 API | 라우트가 쓰는 것만 |

- **`contract.ts`가 기능의 공개 표면**이다. 다른 기능·앱 셸이 이 기능을 알아야 한다면 여기만 본다.
- `main/features/<f>/ipc.ts`는 `register(deps)` 함수 하나를 내보내고 `main/index.ts`가 호출한다.
  등록이 한 곳에 모여야 중복 `handle` 예외를 피할 수 있다.
- 기능 안에서 방향은 `ipc → service → store`. 같은 모듈이라 컴파일러가 막지 못하므로 리뷰로 지킨다.

### 3.2 preload 조립

```ts
// preload/index.ts — 기능별 노출을 조립만 한다.
contextBridge.exposeInMainWorld('{{PROJECT_SLUG}}', {
  {{DOMAIN_EXAMPLE}}: {{DOMAIN_EXAMPLE}}Api,   // preload/features/{{DOMAIN_EXAMPLE}}.ts
  settings: settingsApi,
});
```

- 기능이 늘면 여기에 한 줄이 는다. **노출 표면 전체가 이 파일 하나로 보인다** — 리뷰 지점이 명확해진다.
- 각 기능 파일은 동작 단위로만 노출한다(채널 이름을 인자로 받지 않는다).

### 3.3 ESLint 경계 규칙 (골격)

프로세스 경계 규칙(`main-renderer`와 동일)에 **기능 독립 규칙**을 더한다.

```js
// eslint.config.js
{
  files: ['src/main/features/*/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        // 다른 기능 직접 import 금지 — 자기 기능은 상대 경로로 접근하므로 별칭만 막으면 된다
        { group: ['@main/features/*'], message: '기능 간 직접 import 금지 — contract 경유 또는 index 조립' },
        { group: ['**/renderer/**'], message: 'main 은 렌더러 모듈을 import 하지 않는다' },
      ],
    }],
  },
},
{
  files: ['src/renderer/features/*/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@renderer/features/*'], message: '기능 간 직접 import 금지 — 앱 셸에서 조립한다' },
        { group: ['**/main/**', '**/preload/**'], message: '렌더러는 main·preload 를 import 하지 않는다' },
      ],
    }],
  },
},
{
  files: ['src/main/platform/**', 'src/main/window/**', 'src/renderer/components/**', 'src/renderer/hooks/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['**/features/**'], message: '공용 계층은 기능을 모른다(역참조 금지)' }],
    }],
  },
}
```

> 자기 기능 안은 상대 경로로 접근하고 **기능 간에는 별칭 경로만 쓰이도록** 규약을 맞추면
> 위 규칙 하나로 모든 쌍이 커버된다. 기능이 늘어도 설정을 고칠 필요가 없다 — 이 변형에서
> 가장 흔한 실패(새 기능 등록 누락)를 구조적으로 막는 방법이다.

---

## 4. 기능 간 통합 규약 (이 변형의 핵심 규칙)

기능은 서로를 직접 import하지 않는다. 통합이 필요하면 아래 셋 중 하나를 쓴다.

| 방식 | 언제 | 형태 |
|---|---|---|
| (a) `contract` 경유 | 단방향 읽기·타입 공유 | 제공 기능의 `shared/features/<f>/contract.ts`가 노출한 타입·상수만 |
| (b) `index` 조립 주입 **(기본)** | 쓰기·정책이 얽힐 때 | 소비 기능이 **자기 모듈에 인터페이스를 선언**하고 `main/index.ts`가 구현을 주입 |
| (c) 이벤트 | 부수 효과·비동기 | 제공 기능이 발행, 소비 기능이 구독. 실패·재시도는 소비 쪽 책임 |

```ts
// (b) 소비 기능이 필요한 것만 선언한다 — 제공 기능을 import 하지 않는다.
// main/features/{{DOMAIN_EXAMPLE}}/service.ts
export interface AccountLookup {
  displayName(id: string): Promise<string>;
}
```

- **(b)가 기본값**이다. 유일하게 양방향 의존을 만들지 않는다.
- 렌더러 쪽 통합도 같다: 두 기능이 한 화면에 필요하면 **앱 셸(라우트)에서 조립**한다.
- 다른 기능이 소유한 저장소·파일을 직접 읽지 않는다. 필요하면 경계가 잘못됐다는 신호다.
- 기능 간 호출을 루프 안에서 하지 않는다. 배치 계약(`displayNames(ids)`)을 제공한다.

---

## 5. 프로세스·레이어 책임

프로세스 책임(main/preload/renderer/shared)과 보안 규약은 `main-renderer`와 **완전히 동일**하다.
원본은 `.agents/rules/structure.md`·`.agents/rules/security.md`이며, 이 변형은 그 위에 기능 슬라이스를 얹을 뿐이다.

- 기능 안 방향은 `ipc → service → store`.
- `service`는 Electron을 모르는 것이 이상적이다. 필요하면 `main/platform` 어댑터를 거친다.
- `store`는 원자적 쓰기와 스키마 버전을 책임진다. **저장 파일도 기능이 소유**한다(파일을 섞지 않는다).

---

## 6. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. Why · 함정 · 외부 근거 · 억제 이유만 적는다.
- **`contract.ts`의 각 항목에는 "누가 부르고 무엇을 기대하는지"** 를 남긴다(기능 경계 문서화).
- IPC 핸들러에는 신뢰 수준과 부작용을 적는다. 파괴적 동작은 표시한다.
- 기능 간 통합 지점((a)/(b)/(c) 중 무엇을 왜 골랐는지)을 남긴다.
- 한국어로 작성한다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 7. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 기능 채널·타입 | IPC 계약 | `shared/features/<f>/contract.ts` |
| (b) 채널 집계 | 전체 채널 목록 | `shared/channels.ts`(기능 상수를 모으기만) |
| (c) 디자인 값 | 색·간격·타이포·모션 | `renderer/styles` 토큰 |
| (d) 환경별 설정 | API 베이스·업데이트 채널 | `main/platform/config`(비밀 포함) |
| (e) 경로 | 앱 데이터·로그 | `main/platform/paths`(OS API) |

- **기능 고유 설정은 그 기능 소유 구조체로 분리**한다. 기능을 떼어낼 때 설정도 따라가게.

---

## 8. 성능 예산

- 원본은 `.agents/rules/frontend-performance.md`.
- main을 막지 않는다. IPC는 배치로. 큰 데이터를 통째로 넘기지 않는다.
- **기능 간 호출의 N+1**을 함께 본다(루프 안 contract 호출 금지 — 배치 계약 제공).
- 렌더러는 기능 단위로 코드 스플리팅한다. 앱 셸이 라우트를 지연 로드한다.

---

## 9. TDD 워크플로 (요약)

| 대상 | 도구 | 비고 |
|---|---|---|
| `main/features/<f>/service` | 테스트 러너 | **Electron 없이·다른 기능 없이** 돈다 |
| `main/features/<f>/store` | 테스트 러너 + 임시 디렉터리 | 원자적 쓰기·마이그레이션 |
| `main/features/<f>/ipc` | 테스트 러너 | 파싱 실패·정책 거부·오류 코드 |
| `shared/features/<f>/contract` | 테스트 러너 | 스키마가 실제로 좁히는지 |
| `renderer/features/<f>` | 테스트 러너 + 렌더 유틸 | `window.<api>`를 대체해 주입 |
| 기능 간 통합 | 테스트 러너 | (a)/(b)/(c) 경로 계약 |
| 앱 흐름 | E2E(실제 앱 기동) | 핵심 경로 1개 이상 |

- **기능 테스트는 그 기능만으로 통과해야 한다.** 다른 기능을 조립해야 통과하면 경계가 새고 있다.
- 검증 게이트: `bash scripts/verify.sh`.

---

## 10. 새 기능 추가 워크플로

1. **기능 결정**: 기존 기능 안인지 새 기능인지 먼저 답한다. 기준은 "어느 기능이 이 데이터를 소유하는가".
2. **계약 먼저**: `shared/features/<f>/contract.ts` 생성(채널 상수·스키마) → `shared/channels.ts`에 집계.
3. `main/features/<f>/{service,store}.ts`를 만들고 테스트한다(Electron 없이 도는 상태로).
4. `main/features/<f>/ipc.ts`에 `register(deps)`를 만들고 `main/index.ts`에서 호출한다.
5. `preload/features/<f>.ts`에 동작 단위로 노출하고 `preload/index.ts`에 한 줄 조립한다.
6. `renderer/features/<f>/`에 화면·훅을 만들고 `index.ts`로 공개 API를 좁힌다. 라우트는 앱 셸에서 등록.
7. **다른 기능이 필요하면** §4의 (a)/(b)/(c) 중 하나를 고르고 이유를 `.agents/docs/decisions/`에 남긴다. 기본은 (b).
8. **검증**: `bash scripts/verify.sh` 통과 + 채널 계약 문서·화면 명세 갱신.

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- 프로세스 경계 해제(`contextIsolation: false`·`nodeIntegration: true`·`sandbox: false`).
- `ipcRenderer` 통째 노출, 채널 이름을 인자로 받는 함수 노출.
- **다른 기능을 직접 import**(main·renderer 양쪽 모두).
- 다른 기능이 소유한 저장소·파일 직접 접근.
- 기능 간에 내부 타입·핸들·트랜잭션 객체를 넘기기.
- `main/platform`·`main/window`·`renderer/components`가 기능을 import.
- main과 renderer의 기능 이름이 다름(같은 기능인데 경로가 안 맞음).
- 계약을 `contract.ts` 밖에 두거나 채널 문자열을 기능 안에 하드코딩.
- `main/index.ts`·`preload/index.ts`에 기능 로직 넣기.
- `handle` 중복 등록, 렌더러 구독 미해제.
- main에서 동기 파일 I/O·큰 파싱 수행.
- 렌더러에서 `electron`·`fs`·`path` import, `shared`에 Node API 넣기.

---

## 12. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `monorepo` (웹과 공유·독립 배포가 필요할 때) | 기능의 Electron 비의존 로직(`service` 순수 부분)을 `packages/core/<f>`로, 공용 UI를 `packages/ui`로 올린다. 나머지가 `apps/desktop`이 된다. **기능 이름을 그대로 유지**하면 이동이 기계적이다. | 프로세스 경계·기능 독립 규칙 유지 + 패키지 의존 방향(apps → packages) 규칙 추가 |
| → `main-renderer` (기능이 줄어 규율 비용이 클 때) | `features/<f>/{ipc,service,store}`를 `main/{ipc,service,store}/`로 펼치고 `renderer/features`를 유지하거나 합친다. | 기능 독립 규칙을 제거하고 레이어 규칙만 남긴다 |

- 이 변형의 이점은 여기서 나온다: 독립 규칙을 지켜왔다면 분리 비용이 "디렉터리 이동"으로 끝난다.
- 전환 전에 `.agents/docs/decisions/`에 ADR을 남긴다. 한 기능씩 옮기고 각 단계마다 `scripts/verify.sh`를 통과시킨다.

---

## 13. 관련 문서

- 규칙 원본: `.agents/rules/`(`guardrails.md`·`security.md`·`api-standards.md`·`structure.md`·`tech.md`)
- 프론트엔드 공통: `design-system.md`·`accessibility.md`·`ui-state.md`·`frontend-performance.md`
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
