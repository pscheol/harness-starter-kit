<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 웹 프론트엔드 · 아키텍처: feature-sliced · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · Feature-Sliced Design — {{PROJECT_NAME}}

코드를 **계층 → 슬라이스 → 세그먼트** 세 단계로 나눈다. 계층은 6개로 고정, 슬라이스는 도메인, 세그먼트는 기술 역할이다.
규칙은 두 줄이다 — **위 계층만 아래를 import한다**, **슬라이스는 공개 API로만 열린다.**
아키텍처 상세 원본(선택 기준·슬라이스 나누기·전환 가이드)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── package.json                  # 의존성 단일 소스 · 게이트가 부르는 스크립트 이름
├── tsconfig.json                 # strict · paths 별칭 루트 {{PACKAGE_NS}}
├── src/
│   ├── app/                      # 1 — 앱 초기화. 라우터·프로바이더·전역 스타일
│   ├── pages/                    # 2 — 라우트 화면(조립만)
│   │   └── {{DOMAIN_EXAMPLE}}-list/{ui,model,index.ts}
│   ├── widgets/                  # 3 — 여러 기능을 조합한 독립 UI 블록
│   │   └── {{DOMAIN_EXAMPLE}}-panel/{ui,model,index.ts}
│   ├── features/                 # 4 — 사용자 행동 하나(동사로 이름)
│   │   └── create-{{DOMAIN_EXAMPLE}}/{ui,model,api,index.ts}
│   ├── entities/                 # 5 — 도메인 개념(명사로 이름)
│   │   └── {{DOMAIN_EXAMPLE}}/{ui,model,api,index.ts}
│   └── shared/                   # 6 — 도메인을 모르는 재사용 코드
│       └── ui/ · lib/ · api/ · config/ · styles/
├── public/ · tests/ · e2e/
├── scripts/verify.sh             # 단일 검증 게이트
└── docs/
```

- 임포트는 별칭(`{{PACKAGE_NS}}/…`)으로 한다. `../../../`가 나오면 위치가 잘못된 것이다.
- 단위 테스트는 슬라이스 안에 둔다. E2E만 `e2e/`에 모은다.

## 계층 규칙 (외울 것은 이것뿐)

| 계층 | 무엇 | import 할 수 있는 것 |
|---|---|---|
| `app` | 초기화·라우팅·프로바이더 | 아래 전부 |
| `pages` | 라우트 화면 조립 | widgets · features · entities · shared |
| `widgets` | 여러 기능을 묶은 독립 블록 | features · entities · shared |
| `features` | 사용자 행동 하나 | entities · shared |
| `entities` | 도메인 개념 | shared |
| `shared` | 도메인 무관 재사용 코드 | (없음) |

- **위 계층만 아래를 import한다.** 아래에서 위를 참조하면 순환이고 계층이 의미를 잃는다.
- **같은 계층의 다른 슬라이스를 직접 import하지 않는다.** 두 기능이 협력해야 하면 한 계층 위
  (`widgets`·`pages`)에서 조립한다. 가장 자주 깨지는 규칙이다.
- 슬라이스는 **공개 API(`index.ts`)로만** 열린다. `features/x/ui/Inner.tsx`를 밖에서 import하지 않는다.
- `index.ts`는 밖에서 쓸 것만 내보낸다. 전부 re-export하면 공개 API가 없는 것과 같다.

## 세그먼트 규약

| 세그먼트 | 무엇 |
|---|---|
| `ui/` | 컴포넌트·스타일 |
| `model/` | 상태·스키마·비즈니스 로직 |
| `api/` | 이 슬라이스의 서버 요청·응답 파싱 |
| `lib/` | 이 슬라이스 안에서만 쓰는 유틸 |
| `config/` | 상수·설정 |

필요한 세그먼트만 만든다. 빈 디렉터리를 미리 만들지 않는다.

## 슬라이스 나누기

판단 기준은 **"이걸 지우면 무엇이 사라지는가"** 다.

- 개념이 사라진다 → `entities`(명사: `{{DOMAIN_EXAMPLE}}`·`user`).
- 행동이 사라진다 → `features`(동사: `create-{{DOMAIN_EXAMPLE}}`·`filter-list`).
- 화면 한 덩어리가 사라진다 → `widgets`.
- 라우트가 사라진다 → `pages`.

- 애매하면 **한 계층 위에서 시작해 아래로 내린다.** 위→아래 이동은 쉽고 아래→위는 순환을 만든다.
- 두 기능이 서로를 필요로 하면 한 기능이거나, 공통 부분이 `entities`로 내려가야 한다는 뜻이다.
- 슬라이스를 잘게 쪼개는 것보다 **잘못된 계층에 두는 것**이 더 비싸다.

## 데이터 접근

- HTTP 클라이언트·인증 헤더·타임아웃·에러 매핑은 `shared/api`에 한 번만.
- 도메인 스키마는 그 개념을 소유한 슬라이스의 `api/`(대개 `entities/<x>/api`).
- 변경 요청은 `features/<action>/api`.
- 서버 상태는 쿼리 라이브러리가 소유하고 캐시 키에 **사용자 스코프**를 포함한다.
- 상세 규약은 [`api-standards.md`](./api-standards.md).

## 강제 수단

**FSD의 가치는 규칙이 자동으로 강제될 때만 나온다.** 설정이 없으면 디렉터리 이름만 FSD다.

- **ESLint 경계 플러그인** — 계층 방향, 같은 계층 슬라이스 간 import 금지, 슬라이스 내부 직접 접근 금지.
  골격은 `ARCHITECTURE.md` §3.3.
- **`no-restricted-imports`** — 슬라이스 내부 경로(`{{PACKAGE_NS}}/*/*/*`) 차단, 깊은 상대 경로 차단.
- **타입 검사** — `strict` + `noUncheckedIndexedAccess`.
- 새 계층이나 규칙을 벗어난 디렉터리를 만들면 **설정에 등록**한다. 등록 누락 = 강제 누락.
- 경계 위반을 `eslint-disable`로 덮지 않는다. 불가피하면 이유와 해소 계획을 적는다.

## 네이밍 컨벤션

- 슬라이스 디렉터리는 소문자 케밥. `entities`는 명사 단수, `features`는 **동사-목적어**(`create-order`).
- 컴포넌트 파일·export는 PascalCase. 훅은 `use` 접두사.
- `index.ts`는 공개 API 전용이다. 여기에 로직을 넣지 않는다.
- `shared/ui`의 컴포넌트 이름에 도메인이 들어가면 잘못된 위치다(`OrderCard`는 `entities`).
- `utils`·`helpers` 같은 이름의 잡동사니를 만들지 않는다. 역할로 이름을 짓는다.
- CSS 클래스는 케밥 케이스. 토큰 이름은 역할로 짓는다(`color-danger`, `blue-500` 아님).

## 새 기능 착수 워크플로

1. **계층 결정** — 개념/행동/조합/화면 중 무엇인지 §슬라이스 나누기 기준으로 정한다.
2. 슬라이스 디렉터리 + 필요한 세그먼트만 만들고 `index.ts`에 **밖에서 쓸 것만** 내보낸다.
3. **아래 계층부터** 만든다(entities → features → widgets → pages). 위에서 아래로 만들면 순환이 생긴다.
4. 네 상태(loading·empty·error·partial)를 처음부터 만든다.
5. 공용으로 올릴 것이 있으면 먼저 Inventory([`reuse-before-new.md`](./reuse-before-new.md)).
   **도메인 냄새가 나면 `shared`로 올리지 않는다.**
6. **검증**: `bash scripts/verify.sh`(경계 위반이 여기서 잡힌다) + 화면 명세 갱신 + 키보드·대비 확인.
7. 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 경계 오류 신호

- `shared/`가 커지고 그 안에 도메인 이름이 등장한다 → 그 파일은 `entities`로 내린다.
- 같은 계층끼리 import하고 싶다는 요구가 반복된다 → 한 계층 위에서 조립하거나 슬라이스를 합친다.
- 한 기능을 고칠 때마다 `entities`도 함께 고친다 → 슬라이스가 잘못 잘렸다.
- 슬라이스가 15개를 넘는데 경계가 자동 검사되지 않는다 → 그 상태로 두면 FSD가 아니다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
