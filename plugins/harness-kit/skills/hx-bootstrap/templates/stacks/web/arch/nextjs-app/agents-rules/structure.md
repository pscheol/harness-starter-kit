<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 웹 프론트엔드 · 아키텍처: nextjs-app · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · Next.js App Router — {{PROJECT_NAME}}

이 프로젝트는 **App Router**를 쓰고, 구조의 축은 디렉터리가 아니라 **서버/클라이언트 경계**다.
경계 강제는 `server-only`(빌드 에러) + ESLint import 규칙 + 타입 strict 세 가지뿐이다.
아키텍처 상세 원본(선택 기준·전환 가이드 포함)은 `ARCHITECTURE.md`.

## 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── package.json                  # 의존성 단일 소스 · 게이트가 부르는 스크립트 이름
├── tsconfig.json                 # strict · paths 별칭 루트 {{PACKAGE_NS}}
├── app/                          # 라우트 세그먼트(파일 규약이 곧 라우팅)
│   ├── layout.tsx                #   루트 레이아웃 — 서버 컴포넌트로 유지
│   ├── page.tsx · loading.tsx · error.tsx · not-found.tsx
│   ├── {{DOMAIN_EXAMPLE}}/
│   │   ├── page.tsx              #   서버 컴포넌트: 데이터 조회 + 조립
│   │   ├── loading.tsx · error.tsx
│   │   └── [id]/page.tsx
│   └── api/<resource>/route.ts   #   라우트 핸들러(BFF) — 서버 전용
├── src/
│   ├── server/                   # ★ 서버 전용. 진입 파일 최상단 import 'server-only'
│   │   ├── {{DOMAIN_EXAMPLE}}/   #   조회·변경 함수
│   │   ├── auth/                 #   세션·권한 판정
│   │   └── config/               #   비밀 포함 설정
│   ├── features/{{DOMAIN_EXAMPLE}}/   # 클라이언트 컴포넌트·훅·스키마
│   ├── components/               # 도메인을 모르는 공용 UI
│   ├── lib/                      # 순수 유틸(DOM·네트워크 의존 0)
│   └── styles/                   # 토큰·전역 스타일
├── public/ · tests/ · e2e/
├── scripts/verify.sh             # 단일 검증 게이트
└── docs/
```

- `app/`은 **라우팅과 조립**만 한다. 화면 로직은 `src/features/`, 데이터는 `src/server/`.
- 임포트는 별칭(`{{PACKAGE_NS}}/…`)으로 한다. `../../../`가 나오면 위치가 잘못된 것이다.
- 단위 테스트는 대상 옆(`*.test.ts`)에 둔다. E2E만 `e2e/`에 모은다.

## 디렉터리 책임

| 위치 | 책임 | 알아도 되는 것 |
|---|---|---|
| `app/**` | 라우팅·레이아웃·조립·렌더 전략 | `src/server`(서버 파일에서만) · `src/features` · `src/components` |
| `src/server/**` | 데이터 조회·변경·권한 판정·비밀 | 외부 API·DB. **UI 를 모른다** |
| `src/features/<f>/**` | 한 기능의 화면 로직·클라이언트 컴포넌트·스키마 | `src/components` · `src/lib` |
| `src/components/**` | 도메인을 모르는 공용 UI | `src/lib` · 토큰 |
| `src/lib/**` | 순수 함수·포맷터·계산 | 아무것도 (외부 의존 0) |

- **공용 UI가 도메인을 아는 순간 공용이 아니다.** `Button`이 주문 상태를 알면 `features`로 내린다.
- `src/lib`은 네트워크·DOM·서버 모듈에 의존하지 않는다. 그래야 테스트가 빠르고 어디서나 쓰인다.
- 기능 간 직접 import는 피한다. 공유가 필요하면 `components`·`lib`으로 내리거나 `app`에서 조립한다.

## 서버/클라이언트 경계 (이 변형의 핵심 규칙)

- **기본은 서버 컴포넌트.** `'use client'`는 상호작용이 필요한 **잎**에만 붙이고, 왜 필요한지 한 줄 남긴다.
  위로 올릴수록 그 아래 전체가 클라이언트 번들에 들어간다.
- `src/server/**` 진입 파일 최상단에 `import 'server-only'`. 클라이언트가 import하면 **빌드가 실패한다.**
  이 한 줄이 이 변형에서 유일한 컴파일 수준 경계다. 빼지 않는다.
- 브라우저 API를 쓰는 모듈에는 `import 'client-only'`.
- 서버 → 클라이언트 props는 **직렬화되어 HTML에 실린다.** 보여줄 필드만 골라 넘긴다.
  엔티티를 통째로 넘기면 내부 필드가 페이지 소스에 남는다.
- 비밀 환경변수는 `src/server/config`에서만 읽는다. 공개 접두사 변수는 번들에 인라인된다.
- 라우트 핸들러·서버 액션은 **공개 엔드포인트**다. 입력을 파싱하고 권한을 다시 판정한다.

## 강제 수단

- **`server-only` / `client-only`** — 잘못된 방향의 import를 빌드 에러로 만든다.
- **ESLint `no-restricted-imports`** — `features`·`components`·`app`(클라이언트 파일)에서 `src/server/*` 금지,
  `components`에서 `features/*` 금지, `lib`에서 둘 다 금지. 골격은 `ARCHITECTURE.md` §3.2.
  - 규칙에 **등록하지 않은 경계는 존재하지 않는 경계다.** 새 디렉터리를 만들면 규칙도 늘린다.
- **타입 검사** — `strict` + `noUncheckedIndexedAccess`. 경계 타입이 여기서 의미를 갖는다.
- **`next build`** — 서버/클라이언트 혼입·동적 import 경로·환경변수 누락은 빌드 때만 드러난다.
  그래서 게이트에 빌드가 들어 있다(`scripts/verify.sh`).

## 네이밍 컨벤션

- 컴포넌트 파일·export는 PascalCase(`OrderStatusBadge.tsx`). 훅은 `use` 접두사.
- 라우트 디렉터리는 소문자 케밥(`{{DOMAIN_EXAMPLE}}`·`order-history`). URL이 곧 이름이다.
- 서버 함수는 동사로 시작한다(`get{{DOMAIN_EXAMPLE}}List`·`create{{DOMAIN_EXAMPLE}}`).
- 스키마는 `schema.ts`, 상수는 `constants.ts`, 타입 전용은 `types.ts`로 이름을 고정한다.
- `utils`·`helpers`라는 이름의 잡동사니 파일을 만들지 않는다. 역할로 이름을 짓는다.
- CSS 클래스는 케밥 케이스. 토큰 이름은 역할로 짓는다(`color-danger`, `blue-500` 아님).

## 새 화면 착수 워크플로

1. **라우트 결정** — 공유·새로고침·뒤로가기가 살아야 하는 값은 경로·쿼리에 둔다(`ui-state.md`).
2. `app/<route>/`에 `page.tsx`(서버) + `loading.tsx` + `error.tsx`(클라이언트)를 **함께** 만든다.
   네 상태(loading·empty·error·partial)를 처음부터 만든다.
3. 데이터는 `src/server/<domain>/`에 함수로 추가한다. 응답은 스키마로 파싱한다.
4. 상호작용이 필요한 부분만 `src/features/<f>/`의 클라이언트 컴포넌트로 분리한다.
5. 공용으로 올릴 UI가 있으면 먼저 Inventory([`reuse-before-new.md`](./reuse-before-new.md)).
6. **검증**: `bash scripts/verify.sh` 통과 + 화면 명세 갱신 + 키보드·대비 확인.
7. 복잡 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 승격·경계 오류 신호

- `'use client'`가 루트 근처로 올라간다 → 경계를 다시 그어야 한다(잎으로 내린다).
- `src/features/` 하위가 계속 늘고 서로를 자유롭게 import한다 → `feature-sliced` 검토(`ARCHITECTURE.md` §0·§12).
- 공용 디렉터리가 도메인 지식을 갖기 시작한다 → 그 파일을 `features`로 내린다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: order · catalog · user · notification).
