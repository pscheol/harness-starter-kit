<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Electron · 아키텍처: monorepo · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 워크스페이스(apps + packages) — {{PROJECT_NAME}}

데스크톱과 웹이 로직·UI를 공유하는 워크스페이스다. 축이 둘이다 — **프로세스 경계**와 **패키지 의존 방향**.
가장 중요한 규칙은 하나다: **`packages/core`는 Electron도 DOM도 모른다.**
아키텍처 상세 원본(선택 기준·공유 코드 나누기·전환 가이드)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── pnpm-workspace.yaml           # 워크스페이스 선언(도구에 맞게)
├── package.json                  # 루트: 스크립트 조립만. 런타임 의존성 금지
├── apps/
│   ├── desktop/
│   │   ├── package.json          #   electron 의존은 여기에만
│   │   └── src/
│   │       ├── main/{index,window,ipc,service,store,external,platform}
│   │       ├── preload/index.ts
│   │       ├── renderer/{main.tsx,shell,features,styles}
│   │       └── shared/{channels.ts,features/<f>/contract.ts}   # IPC 계약 전용
│   └── web/
│       ├── package.json
│       └── src/{app,pages,features,api}
├── packages/
│   ├── core/                     # ★ 도메인 로직·스키마. 플랫폼 무의존
│   │   └── src/{{DOMAIN_EXAMPLE}}/{model,schema,rules,index}.ts
│   └── ui/                       # 공용 컴포넌트·토큰(DOM 은 알아도 된다)
│       └── src/{components,tokens,index.ts}
├── tests/ · e2e/
├── scripts/verify.sh             # 단일 검증 게이트(루트에서 전체를 돈다)
└── docs/
```

- **루트 `package.json`에 런타임 의존성을 두지 않는다.** 두면 모든 앱이 그 의존성을 갖는다.
- `apps/desktop/src/shared`와 `packages/core`는 **다른 것**이다: `shared`는 IPC 계약, `core`는 도메인 로직.
- 테스트는 각 패키지·앱 안에. E2E만 루트 `e2e/`에 모은다.

## 패키지 책임

| 패키지 | 알아도 되는 것 | 절대 모르는 것 |
|---|---|---|
| `packages/core` | 표준 언어 기능·스키마 파서 | Electron · DOM · React · 파일시스템 |
| `packages/ui` | React · DOM · `core` 타입 | Electron · Node · 앱의 라우팅 |
| `apps/desktop` | 전부 | 다른 앱 |
| `apps/web` | `core` · `ui` | 다른 앱 |

- **`core`의 순수성이 이 구조 전체의 근거**다. 깨지면 모노레포를 유지할 이유가 사라진다.
- `core`에 파일 읽기·네트워크 호출을 넣지 않는다. **인터페이스를 선언하고 앱이 구현을 주입**한다.
- `ui` 컴포넌트가 데이터를 스스로 가져오지 않는다. props로 받는다.
- 앱끼리 참조하지 않는다. 공유가 필요하면 패키지로 내린다.

## 공유 코드 나누기

- **`core`로 올리는 기준**: 두 앱이 실제로 쓰고, 플랫폼 API 없이 표현할 수 있는가. 둘 중 하나라도 아니면 앱에 둔다.
- **"나중에 공유할 것 같아서" 올리지 않는다.** 올라간 코드는 두 앱의 요구를 동시에 만족해야 해서
  내리는 비용이 올리는 비용보다 크다. **앱에서 시작해 나중에 올린다.**
- `ui`로 올리는 기준은 도메인을 모르는가. 도메인을 알면 앱의 features에 둔다.
- 디자인 토큰은 `packages/ui`에 한 벌만. 앱마다 따로 두면 두 앱의 화면이 갈라진다.

## 데스크톱 앱 내부

`apps/desktop` 안의 프로세스 책임·IPC 계약·preload 규약은 **단일 앱 변형과 동일**하다.

| 프로세스 | 권한 | 책임 | 하지 않는 것 |
|---|---|---|---|
| `main` | Node 전체 | 창·IPC·파일·외부 호출 | 화면 문구·표현 규칙 |
| `preload` | 제한된 다리 | 화이트리스트 API 노출 | 비즈니스 로직·권한 판정 |
| `renderer` | 없음 | 화면·상호작용 | 파일·셸·자격증명 접근 |
| `shared` | — | IPC 타입·채널 상수 | 런타임 Node API · **도메인 로직**(그건 `core`) |

- `main/service`는 `core`의 로직을 호출하고 저장·외부 호출 구현을 주입한다.
- `renderer`는 `packages/ui`를 쓰고 데이터는 `renderer/ipc` 계층을 경유한다.
- 프로세스 경계 설정은 [`security.md`](./security.md)가 원본이고 게이트가 검사한다.

## 패키지 공개 API

- `package.json`의 `exports`로 진입점을 선언한다. **선언하지 않은 경로는 import되지 않는다.**
- 패키지 간 참조는 **패키지 이름**으로(`@{{PROJECT_SLUG}}/core`). 상대 경로로 워크스페이스를 가로지르지 않는다.
- 배럴 파일 하나로 전부 열지 않는다. 부수효과 있는 모듈을 re-export하지 않는다(트리셰이킹).

## 강제 수단

1. **패키지 `dependencies`** — `core/package.json`에 `electron`을 넣지 않으면 import 자체가 해석되지 않는다.
   **규칙보다 강한 강제다. 이 장치를 먼저 쓴다.**
2. **게이트의 프로세스 경계 가드** — `scripts/verify.sh`가 위험 설정을 grep(`fast` 포함).
3. **ESLint import 규칙** — `core`의 플랫폼 import 금지, `packages` → `apps` 참조 금지, 앱 간 참조 금지,
   렌더러의 권한 모듈 import 금지. 골격은 `ARCHITECTURE.md` §3.3.
4. **타입 검사** — 각 패키지·앱을 프로젝트 참조로 검사.
5. **빌드** — **두 앱 모두** 빌드해야 공유 코드의 플랫폼 오염이 드러난다. 한 앱만 빌드하고 통과시키지 않는다.

## 네이밍 컨벤션

- 패키지 이름은 `@{{PROJECT_SLUG}}/<name>`. 디렉터리 이름과 같게 유지한다.
- 컴포넌트 파일·export는 PascalCase. 훅은 `use` 접두사.
- 채널: `<기능>:<동작>`. 상수는 `apps/desktop/src/shared/channels.ts`.
- `core`의 함수는 도메인 용어로 짓는다(플랫폼 용어 금지 — `saveToFile`이 아니라 `save`).
- `contract.ts`·`schema.ts`·`index.ts`로 파일 이름을 고정한다.
- `utils`·`helpers` 잡동사니를 만들지 않는다.

## 새 기능 착수 워크플로

1. **어디에 둘지 먼저 정한다**: 두 앱이 쓰는 도메인 로직(`core`) · 공용 UI(`ui`) · 한 앱의 것(`apps/*`).
   애매하면 앱에서 시작한다.
2. `core`에 로직·스키마를 만들고 테스트한다(플랫폼 없이 도는 상태로).
   **테스트가 Electron이나 DOM을 필요로 하면 그 코드는 `core`에 있으면 안 된다.**
3. 데스크톱: `shared/features/<f>/contract.ts` → `main/service`(core 호출 + 구현 주입) → `main/ipc` →
   `preload` → `renderer`.
4. 웹: `api/` 클라이언트가 같은 `core` 로직을 쓰도록 구현을 주입한다.
5. 화면은 네 상태(loading·empty·error·partial)를 처음부터 만든다.
6. **검증**: `bash scripts/verify.sh` 통과(**두 앱 빌드 포함**) + 계약 문서·화면 명세 갱신.
7. 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 경계 오류 신호

- `core`에 Electron·DOM import가 들어간다 → 그 코드는 앱으로 내린다.
- `packages/*`가 `apps/*`를 참조한다 → 순환이다. 즉시 되돌린다.
- 웹 앱이 실제로는 안 만들어지고 `apps/web`이 비어 있다 → 단일 앱 변형으로 되돌린다(`ARCHITECTURE.md` §12).
- 공유 패키지가 두 앱의 요구를 억지로 만족시키느라 옵션 플래그로 뒤덮인다 → 나누는 지점이 잘못됐다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: document · project · account · sync).
