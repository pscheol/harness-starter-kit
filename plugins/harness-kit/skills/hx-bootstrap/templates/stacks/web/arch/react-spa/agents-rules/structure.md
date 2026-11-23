<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 웹 프론트엔드 · 아키텍처: react-spa · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · React 단일 페이지 앱 — {{PROJECT_NAME}}

서버 렌더가 없는 SPA다. 모든 코드는 브라우저에 있고 모든 데이터는 API에서 온다.
구조를 지탱하는 축은 둘 — **라우팅 선언 한 곳**과 **네트워크 출입구 한 곳**.
아키텍처 상세 원본(선택 기준·전환 가이드 포함)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── package.json                  # 의존성 단일 소스 · 게이트가 부르는 스크립트 이름
├── tsconfig.json                 # strict · paths 별칭 루트 {{PACKAGE_NS}}
├── index.html
├── src/
│   ├── main.tsx                  # 부트스트랩(마운트만)
│   ├── app/                      # 앱 셸 — 여기만 전역을 안다
│   │   ├── App.tsx
│   │   ├── routes.tsx            #   ★ 라우트 선언 단일 지점
│   │   ├── providers.tsx         #   프로바이더 조립
│   │   └── guards.tsx            #   인증·권한 라우트 가드(UX)
│   ├── pages/{{DOMAIN_EXAMPLE}}/ # 라우트 하나 = 화면 하나. 조립만
│   ├── features/{{DOMAIN_EXAMPLE}}/  # 기능 로직·컴포넌트·훅·스키마
│   ├── components/               # 도메인을 모르는 공용 UI
│   ├── hooks/                    # 도메인을 모르는 공용 훅
│   ├── api/                      # ★ 네트워크 단일 출입구(클라이언트·엔드포인트·스키마)
│   ├── lib/                      # 순수 유틸(앱 모듈 의존 0)
│   └── styles/                   # 토큰·전역 스타일
├── public/ · tests/ · e2e/
├── scripts/verify.sh             # 단일 검증 게이트
└── docs/
```

- `pages/`는 **조립만** 한다. 화면 로직이 길어지면 `features/`로 내린다.
- 임포트는 별칭(`{{PACKAGE_NS}}/…`)으로 한다. `../../../`가 나오면 위치가 잘못된 것이다.
- 단위 테스트는 대상 옆(`*.test.ts`)에 둔다. E2E만 `e2e/`에 모은다.

## 디렉터리 책임

| 위치 | 책임 | 알아도 되는 것 |
|---|---|---|
| `src/app/**` | 라우팅·프로바이더·전역 에러 경계·인증 상태 | 전부 (여기만 전역을 안다) |
| `src/pages/<r>/**` | 라우트 화면 조립 | `features` · `components` |
| `src/features/<f>/**` | 기능 로직·컴포넌트·훅·스키마 | `api` · `components` · `hooks` · `lib` |
| `src/api/**` | 네트워크 출입구·응답 파싱·에러 매핑 | `lib` |
| `src/components/**`·`src/hooks/**` | 도메인을 모르는 공용 UI·훅 | `lib` · 토큰 |
| `src/lib/**` | 순수 함수·포맷터·계산 | 아무것도 |

- **공용 UI가 도메인을 아는 순간 공용이 아니다.** `features`로 내린다.
- `lib`은 앱 모듈에 의존하지 않는다. 그래야 테스트가 빠르고 어디서나 쓰인다.
- 기능 간 직접 import는 피한다. 공유가 필요하면 `components`·`lib`으로 내리거나 `pages`에서 조립한다.

## 라우팅 단일 지점 (이 변형의 핵심 규칙)

- 라우트는 `app/routes.tsx`에서만 선언한다. 화면 곳곳에서 선언하면 **코드 스플리팅 지점이 사라진다.**
- 라우트 단위 지연 로드가 기본이다. 첫 진입 화면만 정적으로 둔다.
- URL이 상태다: 필터·정렬·페이지·탭·검색어는 쿼리스트링에 둔다([`ui-state.md`](./ui-state.md)).
- **라우트 가드는 UX이지 접근 제어가 아니다.** 서버가 권한을 다시 판정한다([`security.md`](./security.md)).
- 지연 로드 청크 404(배포 직후 구버전 청크 소멸)를 처리한다. 재시도가 아니라 **새로고침**이 답이다.
- 정적 호스팅은 모든 경로를 `index.html`로 폴백해야 한다. 없으면 새로고침이 404가 된다.

## 네트워크 출입구 (`src/api`)

- 베이스 URL·인증 헤더·타임아웃·에러 매핑은 **클라이언트 한 곳**에서 한다.
- 엔드포인트 문자열은 `api/endpoints.ts` 한 곳에. 컴포넌트에서 `fetch`를 부르지 않는다.
- 응답은 `api/<domain>/schema.ts`에서 파싱해 타입을 좁힌다. `as` 단정 금지.
- 서버 상태는 쿼리 라이브러리가 소유한다. 캐시 키에 **사용자 스코프**를 포함한다.
- 토큰 갱신은 한 번만 수행하고 나머지 요청은 그 결과를 기다린다(동시 갱신 폭주 방지).
- 상세 규약은 [`api-standards.md`](./api-standards.md).

## 강제 수단

이 변형에는 서버가 없어 `server-only` 같은 컴파일 강제 장치가 **없다.** 경계는 아래 셋이 전부다.

- **ESLint `no-restricted-imports`** — `components`·`hooks`에서 `features`·`pages`·`api` 금지,
  `lib`에서 앱 모듈 전체 금지, 깊은 상대 경로 금지. 골격은 `ARCHITECTURE.md` §3.2.
- **ESLint `no-restricted-globals`** — 화면 계층에서 `fetch` 직접 호출 금지.
- **타입 검사** — `strict` + `noUncheckedIndexedAccess`.

**규칙에 등록하지 않은 경계는 존재하지 않는 경계다.** 새 디렉터리를 만들면 규칙도 늘린다.
프로덕션 빌드도 게이트에 포함한다(동적 import 경로·환경변수 누락은 빌드에서만 드러난다).

## 네이밍 컨벤션

- 컴포넌트 파일·export는 PascalCase(`OrderStatusBadge.tsx`). 훅은 `use` 접두사.
- 라우트 경로·페이지 디렉터리는 소문자 케밥(`{{DOMAIN_EXAMPLE}}`·`order-history`).
- API 함수는 동사로 시작한다(`get{{DOMAIN_EXAMPLE}}List`·`create{{DOMAIN_EXAMPLE}}`).
- 스키마는 `schema.ts`, 상수는 `constants.ts`, 타입 전용은 `types.ts`로 이름을 고정한다.
- `utils`·`helpers`라는 이름의 잡동사니 파일을 만들지 않는다. 역할로 이름을 짓는다.
- CSS 클래스는 케밥 케이스. 토큰 이름은 역할로 짓는다(`color-danger`, `blue-500` 아님).

## 새 화면 착수 워크플로

1. **라우트 결정** — 공유·새로고침·뒤로가기가 살아야 하는 값은 쿼리스트링에 둔다.
2. `app/routes.tsx`에 지연 로드로 등록한다(다른 곳에서 선언하지 않는다).
3. `pages/<route>/`에 화면을 만들고 **네 상태(loading·empty·error·partial)를 처음부터** 만든다.
4. 데이터는 `api/<domain>/`에 함수·스키마로 추가하고 기능 훅에서 호출한다.
5. 공용으로 올릴 UI가 있으면 먼저 Inventory([`reuse-before-new.md`](./reuse-before-new.md)).
6. **검증**: `bash scripts/verify.sh` 통과 + 화면 명세 갱신 + 키보드·대비 확인.
7. 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 승격·경계 오류 신호

- `features/` 하위가 15~20개를 넘고 서로를 자유롭게 import한다 → `feature-sliced` 검토.
- 공용 디렉터리가 도메인 지식을 갖는다 → 그 파일을 `features`로 내린다.
- 라우트 선언이 흩어진다 → 경계가 아니라 규율 문제다. 한 곳으로 되돌린다.
- 브라우저에 내릴 수 없는 자격증명이 필요해진다 → 서버 경로가 필요하다(`ARCHITECTURE.md` §0·§12).

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
