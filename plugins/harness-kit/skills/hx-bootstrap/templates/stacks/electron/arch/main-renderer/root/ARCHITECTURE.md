<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}(앱 ID)·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Electron · 아키텍처: main-renderer(프로세스 + 레이어) -->

# ARCHITECTURE — {{PROJECT_NAME}} (main-renderer)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

구조의 1차 축은 **프로세스**(main · preload · renderer)이고, 2차 축은 각 프로세스 안의 **레이어**다.
프로세스 경계는 보안 경계이므로 다른 어떤 설계 논의보다 앞선다.

스택 기준(버전 기준은 `package.json` — 구체 버전은 **예시이며 프로젝트에서 확정**):
Electron · TypeScript(strict) · React · 번들러 · 스키마 파서 · ESLint · Prettier · 테스트 러너 · E2E · 패키징 도구.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- Electron 앱을 처음 세운다. **기본값이다.**
- 기능 수가 아직 많지 않고, 프로세스 경계를 확실히 세우는 것이 우선이다.
- 창이 하나이거나 소수이고 배포 대상이 데스크톱 하나다.

**쓰지 않는다:**
- 기능 영역이 이미 많고 한 기능을 고칠 때 main·renderer 양쪽을 오가는 일이 잦다 → `feature`.
- 웹 버전과 코드를 공유해야 한다 → `monorepo`.

승격 신호(이 중 둘 이상이면 `feature` 전환을 검토한다):
1. `main/ipc/`의 핸들러 파일이 계속 커지고 도메인별로 뒤섞인다.
2. 한 기능을 고칠 때 `main/service`·`main/ipc`·`renderer/features`·`shared`를 매번 함께 연다.
3. 기능별 담당자가 갈리는데 같은 파일을 자주 충돌시킨다.

`monorepo` 신호:
- 같은 로직을 웹에서도 써야 한다는 요구가 실제로 생겼다(가정이 아니라 요구).

전환 절차는 §12.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 렌더러에 Node 권한 없음 | **게이트의 경계 가드**(`verify.sh` fast 단계) | 게이트 차단 |
| 컨텍스트 격리·샌드박스 유지 | **게이트의 경계 가드** | 게이트 차단 |
| 렌더러가 main 모듈을 import하지 않는다 | ESLint import 규칙(§3.3) + 번들 분리 | 게이트 차단 · 빌드 실패 |
| `shared`에 런타임 Node API 없음 | ESLint 규칙 + 렌더러 빌드 | 게이트 차단 · 빌드 실패 |
| IPC 인자는 스키마로 파싱 | 리뷰 + 테스트 | 리뷰 차단 |
| preload는 동작 단위로만 노출 | **게이트의 경계 가드** + 리뷰 | 게이트 차단 |
| 타입 경계 | `strict` + `noUncheckedIndexedAccess` | 타입 검사 실패 |
| 접근성 기본 | `eslint-plugin-jsx-a11y` | 게이트 차단 |
| 테스트 우선(TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80% | 커버리지 게이트 |

> 이 스택에서 가장 비싼 실수는 설계 실수가 아니라 **경계 해제**다. 그래서 그 검사만 `fast` 레벨에
> 넣어 턴마다 돌게 했다(`scripts/verify.sh` §3 단계).

---

## 2. 시스템 경계

```
┌─────────────────────────────────────────────────────────────┐
│ {{PROJECT_NAME}} (앱 ID: {{PACKAGE_NS}})                     │
│                                                             │
│  ┌───────────────┐   contextBridge   ┌────────────────────┐ │
│  │ renderer      │◀─────화이트리스트───▶│ preload            │ │
│  │ (웹·권한 없음) │                    │ (다리 · 로직 없음)  │ │
│  └───────────────┘                    └─────────┬──────────┘ │
│                                        IPC 채널  │            │
│                                       ┌─────────▼──────────┐ │
│                                       │ main (Node 권한)    │ │
│                                       │ 창·파일·외부 호출    │ │
│                                       └─────────┬──────────┘ │
└─────────────────────────────────────────────────┼───────────┘
                                    ┌─────────────┼─────────────┐
                                    ▼             ▼             ▼
                              ┌──────────┐ ┌───────────┐ ┌───────────┐
                              │ 파일·DB   │ │ 외부 API   │ │ OS 키체인  │
                              └──────────┘ └───────────┘ └───────────┘
```

- **렌더러는 신뢰 경계 밖이다.** 렌더러가 보낸 값은 사용자가 만든 값이라고 가정한다.
- 자격증명·비밀은 main에만 있다. 렌더러에는 결과만 준다(`.agents/rules/security.md`).
- 창이 여러 개면 렌더러 프로세스도 여러 개다. main은 그 전부를 상대한다.

---

## 3. 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── src/
│   ├── main/                     # Node 권한. 앱의 실제 능력
│   │   ├── index.ts              #   진입점: 앱 생명주기·창 생성·조립만
│   │   ├── window/               #   창 생성·복원·플랫폼 분기
│   │   ├── ipc/                  #   채널 핸들러(얇게: 파싱 → 정책 → 서비스 호출)
│   │   ├── service/{{DOMAIN_EXAMPLE}}/  #   도메인 로직·오케스트레이션
│   │   ├── store/                #   파일·DB·설정 접근(원자적 쓰기)
│   │   ├── external/             #   외부 API 클라이언트(자격증명은 여기까지)
│   │   └── platform/             #   로깅·경로·업데이트·키체인 어댑터
│   ├── preload/
│   │   └── index.ts              #   화이트리스트 노출만. 로직 금지
│   ├── renderer/                 # 웹. 권한 없음
│   │   ├── main.tsx · App.tsx
│   │   ├── routes/ · features/{{DOMAIN_EXAMPLE}}/
│   │   ├── components/ · hooks/ · lib/ · styles/
│   │   └── ipc/                  #   window.<api> 를 감싼 데이터 접근 계층
│   └── shared/                   # ★ 양쪽이 import. 타입·상수만
│       ├── channels.ts           #   채널 상수 단일 소스
│       └── {{DOMAIN_EXAMPLE}}/contract.ts
├── resources/ · build/           # 아이콘·서명·패키징 설정
├── tests/ · e2e/
├── scripts/verify.sh             # 단일 검증 게이트
└── docs/
```

- `main/index.ts`는 **조립만** 한다. 핸들러 본문·비즈니스 로직을 여기 두지 않는다.
- `renderer/`는 웹 앱이다. 웹 규칙(`.agents/rules/` 프론트엔드 4종)이 그대로 적용된다.
- `shared/`에는 **런타임 Node API를 넣지 않는다.** 렌더러가 함께 import하므로 번들이 깨진다.

### 3.1 main 내부 레이어

| 레이어 | 책임 | 알아도 되는 것 |
|---|---|---|
| `ipc/` | 채널 등록·인자 파싱·정책 확인·응답 변환 | `service` · `shared` |
| `service/` | 도메인 로직·오케스트레이션·트랜잭션 경계 | `store` · `external` · `shared` |
| `store/` | 파일·DB·설정 읽기/쓰기 | `platform` · `shared` |
| `external/` | 외부 API 호출·자격증명 사용 | `platform` · `shared` |
| `platform/` | 로깅·경로·키체인·업데이트 어댑터 | (Electron·Node API) |

- **`ipc`는 얇게.** 파싱 → 정책 → 서비스 호출 → 응답 변환. 비즈니스 로직을 인라인하지 않는다.
- **`service`는 Electron을 모르는 것이 이상적**이다. Electron API가 필요하면 `platform` 어댑터를 거친다.
  그래야 테스트에서 Electron 전체를 흉내 낼 필요가 없다.
- `store`는 원자적 쓰기(임시 파일 → 이름 변경)와 스키마 버전을 책임진다.

### 3.2 preload 규약

```ts
// preload/index.ts — 동작 단위로 좁게. 채널 이름을 인자로 받지 않는다.
contextBridge.exposeInMainWorld('{{PROJECT_SLUG}}', {
  {{DOMAIN_EXAMPLE}}: {
    list: (query: unknown) => ipcRenderer.invoke(channels.{{DOMAIN_EXAMPLE}}.list, query),
    onChanged: (cb: (payload: unknown) => void) => {
      const handler = (_e: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on(channels.{{DOMAIN_EXAMPLE}}.changed, handler);
      return () => ipcRenderer.off(channels.{{DOMAIN_EXAMPLE}}.changed, handler);  // 해제 함수 필수
    },
  },
});
```

- 구독을 노출할 때는 **해제 함수를 반환**한다. 반환하지 않으면 렌더러가 정리할 방법이 없다.
- 이벤트 객체를 그대로 콜백에 넘기지 않는다(내부 참조가 샌다).
- preload에 비즈니스 로직·권한 판정을 넣지 않는다.

### 3.3 ESLint 경계 규칙 (골격)

```js
// eslint.config.js — 등록하지 않은 경계는 존재하지 않는 경계다.
{
  files: ['src/renderer/**'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: 'electron', message: '렌더러는 electron 을 import 하지 않는다(preload 경유)' },
        { name: 'fs' }, { name: 'path' }, { name: 'child_process' }, { name: 'os' },
      ],
      patterns: [
        { group: ['**/main/**', '**/preload/**'], message: '렌더러는 main·preload 모듈을 import 하지 않는다' },
        { group: ['node:*'], message: '렌더러에 Node 내장 모듈 금지' },
      ],
    }],
  },
},
{
  files: ['src/shared/**'],            // 양쪽이 import — 런타임 Node API 금지
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['node:*', 'electron', '**/main/**', '**/renderer/**'] }],
    }],
  },
},
{
  files: ['src/main/**'],              // main 은 화면을 모른다
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['**/renderer/**'], message: 'main 은 렌더러 모듈을 import 하지 않는다' }],
    }],
  },
}
```

### 3.4 경계 검사 자동화

1. **게이트의 프로세스 경계 가드**(`scripts/verify.sh` 3단계) — 위험 설정 grep. `fast`에도 포함.
2. `eslint` — 프로세스 간 import 방향.
3. `tsc --noEmit` — 타입 경계.
4. **빌드** — main·preload·renderer가 각각 번들된다. Node API를 렌더러로 끌어들이는 import는 여기서 드러난다.

---

## 4. IPC 계약

- 채널 상수는 `shared/channels.ts` 한 곳. 형식은 `<도메인>:<동작>`.
- `invoke`/`handle`이 기본. 오류는 `{ ok, code, message }` 형태로 통일한다.
- main 핸들러는 인자를 스키마로 파싱한다. 렌더러는 `renderer/ipc/`의 데이터 접근 계층을 경유한다.
- 상세 규약은 `.agents/rules/api-standards.md`.

---

## 5. 창 · 생명주기

- 창 생성은 `main/window/`에 모은다. `webPreferences`를 여러 곳에서 만들지 않는다 — 한 곳에서 만들어야
  경계 설정이 흩어지지 않는다.
- 플랫폼 분기(메뉴·트레이·창 닫기 동작)를 `main/window/platform.ts` 한 곳에 모은다.
- **모든 기능이 두 번째 창에서도 동작해야 한다.** 전역 싱글턴 가정이 깨지는 지점이다.
- 종료 순서: 진행 중 작업 취소 → 저장 → 워처·워커 종료 → 창 파괴. 저장되지 않은 변경이 있으면 묻는다.
- 상세는 `.agents/rules/reliability.md`.

---

## 6. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. Why · 함정 · 외부 근거 · 억제 이유만 적는다.
- **IPC 핸들러에는 신뢰 수준과 부작용**을 적는다. 파괴적 동작은 표시한다.
- `shared/`의 파일에는 "렌더러가 함께 import한다. Node API 금지" 제약을 명시한다.
- 플랫폼 분기에는 왜 그 OS만 다른지 적는다.
- 한국어로 작성한다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 7. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 채널 | IPC 채널 이름 | `shared/channels.ts` (단일 소스) |
| (b) 디자인 값 | 색·간격·타이포·모션·z-index | `renderer/styles` 토큰 |
| (c) 도메인 상수 | 상태 라벨·역할 | `shared/<domain>/contract.ts` |
| (d) 환경별 설정 | API 베이스·업데이트 채널 | `main/platform/config`(비밀 포함 — 렌더러 유입 금지) |
| (e) 경로 | 앱 데이터·로그·캐시 | `main/platform/paths` (OS API 사용, 하드코딩 금지) |

---

## 8. 성능 예산

- 원본은 `.agents/rules/frontend-performance.md`. 이 변형 고유의 것만 적는다.
- **main을 막지 않는다**: 동기 I/O·큰 파싱·암호 연산은 워커로. main이 멈추면 모든 창이 멈춘다.
- IPC는 왕복 비용이 있다. 루프 안에서 호출하지 말고 배치로.
- 큰 데이터를 IPC로 통째 넘기지 않는다(구조화 복제 비용). 페이지네이션하거나 경로를 넘긴다.
- 콜드 스타트 경로(`main/index.ts` 진입 ~ 첫 창 표시)에서 하는 일을 목록으로 관리한다.
- 창을 늘리면 렌더러 프로세스가 늘어난다. 메모리 예산은 창 수 기준으로 잡는다.

---

## 9. TDD 워크플로 (요약)

| 대상 | 도구 | 비고 |
|---|---|---|
| `main/service` | 테스트 러너 | **Electron 없이** 돈다. `platform` 어댑터를 대체 |
| `main/store` | 테스트 러너 + 임시 디렉터리 | 원자적 쓰기·마이그레이션·손상 복구 |
| `main/ipc` | 테스트 러너 | 파싱 실패·정책 거부·오류 코드 |
| `shared` 스키마 | 테스트 러너 | 계약이 실제로 좁히는지 |
| `renderer` 훅·컴포넌트 | 테스트 러너 + 렌더 유틸 | `window.<api>`를 대체해 주입 |
| 앱 흐름 | E2E(실제 앱 기동) | 핵심 경로 1개 이상 |

- **Electron 전체를 목으로 흉내 내려 하지 않는다.** Electron API는 `platform` 어댑터 뒤에 두고 그것을 대체한다.
- 검증 게이트: `bash scripts/verify.sh`.

---

## 10. 새 기능 추가 워크플로

1. **계약 먼저**: `shared/<domain>/contract.ts`에 채널 상수·요청/응답 스키마를 정의한다.
2. `main/service/`에 로직을 만들고 테스트한다(Electron 없이 도는 상태로).
3. `main/ipc/`에 핸들러를 얇게 붙인다(파싱 → 정책 → 서비스 → 응답 변환).
4. `preload/index.ts`에 **동작 단위로** 노출한다(구독이면 해제 함수 반환).
5. `renderer/ipc/`에 데이터 접근 계층을 만들고 화면에서 그것만 쓴다.
6. 화면은 **네 상태(loading·empty·error·partial)를 처음부터** 만든다.
7. **검증**: `bash scripts/verify.sh` 통과 + 채널 계약 문서·화면 명세 갱신 + 키보드·대비 확인.

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- `contextIsolation: false` · `nodeIntegration: true` · `sandbox: false` · `webSecurity: false`.
- `ipcRenderer`를 통째로 노출하거나, 채널 이름을 인자로 받는 함수를 노출.
- main 핸들러가 렌더러 인자를 파싱 없이 사용.
- 렌더러에서 `electron`·`fs`·`path`·`child_process` import.
- `shared/`에 런타임 Node API·Electron API 넣기.
- preload에 비즈니스 로직·권한 판정 넣기.
- `main/index.ts`에 핸들러 본문·비즈니스 로직 몰아넣기.
- `handle` 중복 등록(핫 리로드에서 예외).
- 렌더러 구독을 해제하지 않기(창 수명 동안 누적).
- main에서 동기 파일 I/O·큰 파싱 수행(모든 창이 멈춘다).
- 경로를 문자열로 조립하거나 앱 데이터 경로를 하드코딩.
- 파일을 제자리에서 덮어쓰기(원자적 쓰기 아님).
- `shell.openExternal`에 검증 없는 URL 전달.

---

## 12. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `feature` (기능이 많아질 때) | `main/{ipc,service,store}`의 도메인별 조각과 `renderer/features/<f>`를 기능 이름으로 묶는다: `main/features/<f>/{ipc,service,store}.ts` · `renderer/features/<f>/` · `shared/features/<f>/contract.ts`. `platform`·`window`는 그대로 남는다. | 프로세스 경계 규칙은 **그대로 유지**하고, 기능 간 직접 import 금지 규칙을 추가 |
| → `monorepo` (웹과 코드를 공유할 때) | `main/service`의 Electron 비의존 로직을 `packages/core`로, `renderer/components`를 `packages/ui`로 올린다. 남은 것이 `apps/desktop`이 된다. | 프로세스 경계 규칙 유지 + 패키지 의존 방향(apps → packages) 규칙 추가 |

- 전환 전에 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).
- 한 기능씩 옮기고 각 단계마다 `scripts/verify.sh`를 통과시킨다.
- **프로세스 경계 규칙은 어느 변형에서도 바뀌지 않는다.** 바뀌는 것은 그 안의 묶는 방식뿐이다.

---

## 13. 관련 문서

- 규칙 원본: `.agents/rules/`(`guardrails.md`·`security.md`·`api-standards.md`·`structure.md`·`tech.md`)
- 프론트엔드 공통: `design-system.md`·`accessibility.md`·`ui-state.md`·`frontend-performance.md`
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
