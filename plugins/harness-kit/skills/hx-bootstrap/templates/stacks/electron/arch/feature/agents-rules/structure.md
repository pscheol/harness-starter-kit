<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Electron · 아키텍처: feature · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 프로세스 + 기능 슬라이스 — {{PROJECT_NAME}}

프로세스 경계(main · preload · renderer) 위에 **기능 슬라이스**를 얹는다.
한 기능은 프로세스 양쪽에 **같은 이름의 디렉터리**를 갖고, 둘을 잇는 계약은 `shared`의 한 파일이다.
아키텍처 상세 원본(선택 기준·기능 간 통합·전환 가이드)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── package.json · tsconfig.json
├── src/
│   ├── main/
│   │   ├── index.ts              # 진입점: 생명주기·기능 등록·조립만
│   │   ├── window/ · platform/   # 공용(기능을 모른다)
│   │   └── features/{{DOMAIN_EXAMPLE}}/{ipc,service,store}.ts
│   ├── preload/
│   │   ├── index.ts              # 기능별 노출 조립만
│   │   └── features/{{DOMAIN_EXAMPLE}}.ts
│   ├── renderer/
│   │   ├── main.tsx · shell/     # 앱 셸: 라우팅·프로바이더·전역 에러 경계
│   │   ├── components/ · hooks/ · lib/ · styles/   # 공용(기능을 모른다)
│   │   └── features/{{DOMAIN_EXAMPLE}}/{ui,hooks,ipc.ts,index.ts}
│   └── shared/
│       ├── channels.ts           # 기능별 채널 상수 집계
│       └── features/{{DOMAIN_EXAMPLE}}/contract.ts   # ★ 계약 단일 소스
├── resources/ · build/ · tests/ · e2e/
├── scripts/verify.sh
└── docs/
```

- **한 기능 = 세 경로**: `main/features/<f>` · `renderer/features/<f>` · `shared/features/<f>`.
  **이름을 반드시 같게** 유지한다. 다르면 이 변형의 유일한 이점이 사라진다.
- `main/index.ts`·`preload/index.ts`는 조립만 한다. 기능 로직을 두지 않는다.
- `main/platform`·`main/window`·`renderer/components`·`renderer/hooks`는 **기능을 모른다.**
- 테스트는 기능 디렉터리 안에 둔다. 기능을 지우면 테스트도 함께 사라진다.

## 프로세스 책임 (main-renderer 와 동일)

| 프로세스 | 권한 | 책임 | 하지 않는 것 |
|---|---|---|---|
| `main` | Node 전체 | 창·IPC·파일·외부 호출 | 화면 문구·표현 규칙 |
| `preload` | 제한된 다리 | 화이트리스트 API 노출 | 비즈니스 로직·권한 판정 |
| `renderer` | 없음 | 화면·상호작용 | 파일·셸·자격증명 접근 |
| `shared` | — | 타입·채널 상수 | **런타임 Node API** |

프로세스 경계 설정(`contextIsolation`·`nodeIntegration`·`sandbox`)과 preload 규약은
[`security.md`](./security.md)가 원본이고, 게이트가 검사한다.

## 기능 슬라이스 규약

| 위치 | 책임 | 노출 |
|---|---|---|
| `shared/features/<f>/contract.ts` | 채널 상수·요청/응답 스키마·도메인 타입 | 이 기능의 **공개 표면** |
| `main/features/<f>/ipc.ts` | 채널 등록·파싱·정책·응답 변환 | `register(deps)` 하나 |
| `main/features/<f>/service.ts` | 도메인 로직 | 모듈 내부 |
| `main/features/<f>/store.ts` | 이 기능이 소유한 저장소 | 모듈 내부 |
| `preload/features/<f>.ts` | 화이트리스트 API | 노출 객체 하나 |
| `renderer/features/<f>/index.ts` | 화면·훅의 공개 API | 라우트가 쓰는 것만 |

- **`contract.ts`가 기능의 공개 표면**이다. 다른 기능·앱 셸은 여기만 본다.
- `ipc.ts`는 `register(deps)` 함수 하나를 내보내고 `main/index.ts`가 호출한다.
  등록이 한 곳에 모여야 중복 `handle` 예외를 피한다.
- 기능 안 방향은 `ipc → service → store`. 같은 모듈이라 컴파일러가 막지 못하므로 리뷰로 지킨다.
- **저장 파일도 기능이 소유**한다. 파일을 섞지 않는다.

## 기능 간 통합 (이 변형의 핵심 규칙)

기능은 서로를 직접 import하지 않는다. 셋 중 하나를 고른다.

| 방식 | 언제 | 형태 |
|---|---|---|
| (a) `contract` 경유 | 단방향 읽기·타입 공유 | 제공 기능의 `contract.ts`가 노출한 것만 |
| (b) `index` 조립 주입 **(기본)** | 쓰기·정책이 얽힐 때 | 소비 기능이 인터페이스를 선언하고 `main/index.ts`가 구현을 주입 |
| (c) 이벤트 | 부수 효과·비동기 | 제공 기능이 발행, 소비 기능이 구독 |

- **(b)가 기본값**이다. 유일하게 양방향 의존을 만들지 않는다.
- 렌더러도 같다: 두 기능이 한 화면에 필요하면 **앱 셸(라우트)에서 조립**한다.
- 다른 기능이 소유한 저장소·파일을 직접 읽지 않는다.
- 기능 간 호출을 루프 안에서 하지 않는다. 배치 계약을 제공한다.

## 강제 수단

1. **게이트의 프로세스 경계 가드** — `scripts/verify.sh`가 위험 설정을 grep으로 막는다(`fast` 포함).
2. **ESLint import 규칙** — 프로세스 간 방향 + **기능 간 직접 import 금지** + 공용 계층의 기능 역참조 금지.
   골격은 `ARCHITECTURE.md` §3.3.
3. **타입 검사** — `strict` + `noUncheckedIndexedAccess`.
4. **빌드** — 세 타깃이 각각 번들된다.

> 자기 기능 안은 상대 경로로, **기능 간에는 별칭 경로만** 쓰이도록 규약을 맞추면 규칙 하나로
> 모든 쌍이 커버된다. 기능이 늘어도 설정을 고칠 필요가 없다 — 이 변형에서 가장 흔한 실패
> (새 기능 등록 누락)를 구조적으로 막는 방법이다.

## 네이밍 컨벤션

- **기능 이름은 세 경로에서 동일**하게. 소문자 케밥 또는 단수 명사(`{{DOMAIN_EXAMPLE}}`·`settings`·`sync`).
- 채널: `<기능>:<동작>`(`{{DOMAIN_EXAMPLE}}:list`). 상수는 기능의 `contract.ts`에 두고 `channels.ts`가 모은다.
- 컴포넌트 파일·export는 PascalCase. 훅은 `use` 접두사.
- main의 서비스 함수는 동사로 시작한다(`list{{DOMAIN_EXAMPLE}}`).
- `contract.ts`·`ipc.ts`·`service.ts`·`store.ts`·`index.ts`로 파일 이름을 고정한다.
- `utils`·`helpers` 잡동사니를 만들지 않는다.

## 새 기능 착수 워크플로

1. **기능 결정**: 기존 기능 안인지 새 기능인지 먼저 답한다. 기준은 "어느 기능이 이 데이터를 소유하는가".
2. **계약 먼저**: `shared/features/<f>/contract.ts` 생성 → `shared/channels.ts`에 집계.
3. `main/features/<f>/{service,store}.ts`를 만들고 테스트한다(Electron 없이 도는 상태로).
4. `main/features/<f>/ipc.ts`에 `register(deps)`를 만들고 `main/index.ts`에서 호출한다.
5. `preload/features/<f>.ts`에 동작 단위로 노출하고 `preload/index.ts`에 한 줄 조립한다.
6. `renderer/features/<f>/`에 화면·훅을 만들고 `index.ts`로 공개 API를 좁힌다. 라우트는 앱 셸에서 등록.
7. **다른 기능이 필요하면** (a)/(b)/(c) 중 하나를 고르고 이유를 `.agents/docs/decisions/`에 남긴다. 기본은 (b).
8. **검증**: `bash scripts/verify.sh` 통과 + 채널 계약 문서·화면 명세 갱신.
9. 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 경계 오류 신호

- 기능 간 직접 import 요구가 반복된다 → 한 기능이거나, 공통 부분을 공용 계층으로 내려야 한다.
- 한 화면이 세 기능의 상태를 동시에 조작한다 → 앱 셸이 너무 많은 일을 한다.
- 공용 계층이 기능 이름을 알기 시작한다 → 그 코드는 기능으로 내린다.
- 같은 로직을 웹에서도 써야 한다는 **요구가 실제로** 생겼다 → `monorepo` 검토(`ARCHITECTURE.md` §0·§12).

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: document · project · account · sync).
