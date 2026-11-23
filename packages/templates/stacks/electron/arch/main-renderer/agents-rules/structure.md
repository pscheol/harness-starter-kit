<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Electron · 아키텍처: main-renderer · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · 프로세스 + 레이어 — {{PROJECT_NAME}}

1차 축은 **프로세스**(main · preload · renderer), 2차 축은 각 프로세스 안의 **레이어**다.
프로세스 경계는 보안 경계이므로 다른 설계 논의보다 앞선다.
아키텍처 상세 원본(선택 기준·전환 가이드 포함)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── package.json                  # 의존성 단일 소스 · 게이트가 부르는 스크립트 이름
├── tsconfig.json                 # strict · 프로세스별 tsconfig 분리 가능
├── src/
│   ├── main/                     # Node 권한. 앱의 실제 능력
│   │   ├── index.ts              #   진입점: 생명주기·창 생성·조립만
│   │   ├── window/               #   창 생성·복원·플랫폼 분기
│   │   ├── ipc/                  #   채널 핸들러(얇게)
│   │   ├── service/{{DOMAIN_EXAMPLE}}/  #   도메인 로직
│   │   ├── store/                #   파일·DB·설정(원자적 쓰기)
│   │   ├── external/             #   외부 API(자격증명은 여기까지)
│   │   └── platform/             #   로깅·경로·업데이트·키체인 어댑터
│   ├── preload/index.ts          # 화이트리스트 노출만. 로직 금지
│   ├── renderer/                 # 웹. 권한 없음
│   │   ├── main.tsx · App.tsx · routes/
│   │   ├── features/{{DOMAIN_EXAMPLE}}/
│   │   ├── components/ · hooks/ · lib/ · styles/
│   │   └── ipc/                  #   window.<api> 를 감싼 데이터 접근 계층
│   └── shared/                   # ★ 양쪽이 import. 타입·상수만
│       ├── channels.ts
│       └── {{DOMAIN_EXAMPLE}}/contract.ts
├── resources/ · build/ · tests/ · e2e/
├── scripts/verify.sh             # 단일 검증 게이트
└── docs/
```

- `main/index.ts`는 **조립만** 한다. 핸들러 본문·비즈니스 로직을 두지 않는다.
- `renderer/`는 웹 앱이다. 프론트엔드 공통 규칙 4종이 그대로 적용된다.
- 단위 테스트는 대상 옆(`*.test.ts`)에 둔다. E2E만 `e2e/`에 모은다.

## 프로세스 책임

| 프로세스 | 권한 | 책임 | 하지 않는 것 |
|---|---|---|---|
| `main` | Node 전체 | 창·IPC·파일·외부 호출·업데이트 | 화면 문구·표현 규칙 |
| `preload` | 제한된 다리 | 화이트리스트 API 노출 | 비즈니스 로직·권한 판정 |
| `renderer` | 없음 | 화면·상호작용 | 파일·셸·자격증명 접근 |
| `shared` | — | 타입·채널 상수 | **런타임 Node API**(넣으면 렌더러 번들이 깨진다) |

## main 내부 레이어

| 레이어 | 책임 | 알아도 되는 것 |
|---|---|---|
| `ipc/` | 채널 등록·인자 파싱·정책 확인·응답 변환 | `service` · `shared` |
| `service/` | 도메인 로직·오케스트레이션 | `store` · `external` · `shared` |
| `store/` | 파일·DB·설정 읽기/쓰기 | `platform` · `shared` |
| `external/` | 외부 API 호출·자격증명 사용 | `platform` · `shared` |
| `platform/` | 로깅·경로·키체인·업데이트 어댑터 | Electron·Node API |

- **`ipc`는 얇게**: 파싱 → 정책 → 서비스 호출 → 응답 변환. 로직을 인라인하지 않는다.
- **`service`는 Electron을 모르는 것이 이상적**이다. 필요하면 `platform` 어댑터를 거친다.
  그래야 테스트에서 Electron 전체를 흉내 낼 필요가 없다.
- `store`는 원자적 쓰기(임시 파일 → 이름 변경)와 스키마 버전을 책임진다.
- `platform`은 도메인을 모른다. 역참조하지 않는다.

## preload 규약

- **동작 단위로 좁게** 노출한다. 채널 이름을 인자로 받는 함수를 노출하지 않는다(화이트리스트가 아니다).
- 구독을 노출할 때는 **해제 함수를 반환**한다. 없으면 렌더러가 정리할 방법이 없다.
- main이 보낸 이벤트 객체를 그대로 콜백에 넘기지 않는다. 필요한 데이터만 골라 넘긴다.
- 노출 표면을 최소로 유지한다. 쓰지 않는 API를 미리 열지 않는다.
- 골격은 `ARCHITECTURE.md` §3.2, 보안 근거는 [`security.md`](./security.md).

## 강제 수단

1. **게이트의 프로세스 경계 가드** — `scripts/verify.sh`가 위험 설정을 grep으로 막는다. **`fast` 레벨에도 포함**되어 턴마다 돈다.
2. **ESLint import 규칙** — 렌더러의 `electron`·Node 내장·`main/**` import 금지, `shared`의 Node API 금지,
   main의 `renderer/**` import 금지. 골격은 `ARCHITECTURE.md` §3.3.
3. **타입 검사** — `strict` + `noUncheckedIndexedAccess`.
4. **빌드** — main·preload·renderer가 각각 번들된다. Node API를 렌더러로 끌어들이는 import는 여기서 드러난다.

**규칙에 등록하지 않은 경계는 존재하지 않는 경계다.** 새 디렉터리를 만들면 규칙도 늘린다.

## IPC 계약

- 채널 상수는 `shared/channels.ts` 한 곳. 형식은 `<도메인>:<동작>`.
- `invoke`/`handle`이 기본. 오류는 `{ ok, code, message }` 형태로 통일.
- 렌더러는 `renderer/ipc/`의 데이터 접근 계층을 경유한다. 컴포넌트가 `window.<api>`를 직접 부르지 않는다.
- 상세는 [`api-standards.md`](./api-standards.md).

## 네이밍 컨벤션

- 채널: `<도메인>:<동작>`(`{{DOMAIN_EXAMPLE}}:list`). 상수 객체 키는 camelCase.
- 컴포넌트 파일·export는 PascalCase. 훅은 `use` 접두사.
- main의 서비스 함수는 동사로 시작한다(`list{{DOMAIN_EXAMPLE}}`·`create{{DOMAIN_EXAMPLE}}`).
- `contract.ts`·`channels.ts`·`schema.ts`·`constants.ts`로 이름을 고정한다.
- `utils`·`helpers` 잡동사니를 만들지 않는다. 역할로 이름을 짓는다.
- CSS 클래스는 케밥 케이스. 토큰 이름은 역할로 짓는다.

## 새 기능 착수 워크플로

1. **계약 먼저**: `shared/<domain>/contract.ts`에 채널 상수·요청/응답 스키마를 정의한다.
2. `main/service/`에 로직을 만들고 테스트한다(Electron 없이 도는 상태로).
3. `main/ipc/`에 핸들러를 얇게 붙인다(파싱 → 정책 → 서비스 → 응답 변환).
4. `preload/index.ts`에 동작 단위로 노출한다(구독이면 해제 함수 반환).
5. `renderer/ipc/`에 데이터 접근 계층을 만들고 화면에서 그것만 쓴다.
6. 화면은 네 상태(loading·empty·error·partial)를 처음부터 만든다.
7. **검증**: `bash scripts/verify.sh` 통과 + 채널 계약 문서·화면 명세 갱신 + 키보드·대비 확인.
8. 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 승격 신호

- `main/ipc/`가 커지고 도메인이 뒤섞인다 → `feature` 변형 검토.
- 한 기능을 고칠 때 main·renderer·shared를 매번 함께 연다 → `feature`.
- 같은 로직을 웹에서도 써야 한다는 **요구가 실제로** 생겼다 → `monorepo`.
- 판단 기준과 전환 절차는 `ARCHITECTURE.md` §0·§12.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: document · project · account · sync).
