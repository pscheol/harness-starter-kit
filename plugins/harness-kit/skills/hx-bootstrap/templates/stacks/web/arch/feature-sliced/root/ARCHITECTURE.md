<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}(임포트 별칭 루트)·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: 웹 프론트엔드 · 아키텍처: feature-sliced(FSD) -->

# ARCHITECTURE — {{PROJECT_NAME}} (Feature-Sliced Design)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

FSD는 코드를 **계층(layer) → 슬라이스(slice) → 세그먼트(segment)** 세 단계로 나눈다.
계층은 6개로 고정이고, 슬라이스는 도메인이며, 세그먼트는 기술 역할이다.
규칙은 두 줄로 요약된다 — **위 계층만 아래 계층을 import한다**, **슬라이스는 공개 API로만 열린다.**

스택 기준(버전 기준은 `package.json` — 구체 버전은 **예시이며 프로젝트에서 확정**):
TypeScript(strict) · React · 번들러 · 라우터 또는 메타프레임워크 · 서버 상태 라이브러리 · 스키마 파서 · ESLint(+경계 플러그인) · Prettier · 테스트 러너 · E2E.

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 기능 영역이 이미 여러 개이고 앞으로 더 늘어난다.
- 여러 사람·여러 팀이 서로 다른 기능을 동시에 만진다.
- "이 컴포넌트를 어디에 둬야 하나"가 반복되는 논쟁거리가 됐다.
- 공용 디렉터리가 도메인 지식으로 오염되는 것을 막고 싶다.

**쓰지 않는다:**
- 화면이 열 개 남짓이고 한 사람이 만든다 → `react-spa` 또는 `nextjs-app`. **FSD의 규율 비용이 이득을 넘는다.**
- 팀이 FSD를 처음 쓰는데 마감이 급하다 → 규칙을 지키지 못하면 디렉터리만 늘고 경계는 없다.
- 서버 렌더가 핵심인데 FSD 계층까지 동시에 도입한다 → 하나씩. 먼저 `nextjs-app`으로 시작한다.

경계 오류 신호(구조가 아니라 슬라이스 나누기가 잘못된 것):
- `shared/`가 계속 커지고 그 안에 도메인 이름이 등장한다.
- 같은 계층 슬라이스끼리 import하고 싶다는 요구가 반복된다.
- 한 기능을 고치는데 매번 `entities`도 함께 고쳐야 한다(슬라이스가 잘못 잘렸다).

전환 절차는 §12.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 계층 방향(위→아래)만 허용 | ESLint 경계 플러그인(§3.3) | 게이트 차단 |
| 같은 계층 슬라이스 간 직접 import 금지 | ESLint 경계 플러그인 | 게이트 차단 |
| 슬라이스 내부 파일 직접 import 금지(공개 API만) | ESLint 경계 플러그인 + `index.ts` | 게이트 차단 |
| `shared`는 도메인을 모른다 | ESLint 규칙 + 리뷰 | 게이트 차단 |
| 타입 경계 | `strict` + `noUncheckedIndexedAccess` | 타입 검사 실패 |
| 외부 응답은 스키마로 파싱 | 리뷰 + 테스트 | 리뷰 차단 |
| 접근성 기본 | `eslint-plugin-jsx-a11y` | 게이트 차단 |
| 테스트 우선(TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80% | 커버리지 게이트 |

> **FSD의 가치는 규칙이 자동으로 강제될 때만 나온다.** 플러그인 설정이 없으면 디렉터리 이름만
> FSD이고 실제 경계는 없다. 슬라이스를 늘릴 때마다 **규칙에도 등록**한다 — 등록 누락 = 강제 누락.

---

## 2. 시스템 경계

```
 ┌──────────────────────────────┐        ┌──────────────┐
 │ 브라우저                       │───────▶│  백엔드 API   │
 │  {{PROJECT_NAME}}              │        └──────────────┘
 │   app → pages → widgets        │        ┌──────────────┐
 │       → features → entities    │───────▶│ 외부 서비스   │
 │       → shared                 │        └──────────────┘
 └──────────────────────────────┘
```

- 브라우저는 신뢰 경계 밖이다. 권한 판정은 서버가 한다(`.agents/rules/security.md`).
- 서버 렌더를 함께 쓴다면 서버/클라이언트 경계 규약을 FSD 계층 규칙 **위에** 얹는다(둘은 직교한다).

---

## 3. 리포 레이아웃

```
{{PROJECT_SLUG}}/
├── src/
│   ├── app/                      # 계층 1 — 앱 초기화. 라우터·프로바이더·전역 스타일
│   ├── pages/                    # 계층 2 — 라우트 화면(조립만)
│   │   └── {{DOMAIN_EXAMPLE}}-list/{ui,model,index.ts}
│   ├── widgets/                  # 계층 3 — 여러 기능을 조합한 독립 UI 블록
│   │   └── {{DOMAIN_EXAMPLE}}-panel/{ui,model,index.ts}
│   ├── features/                 # 계층 4 — 사용자 행동 하나(생성·필터·결제)
│   │   └── create-{{DOMAIN_EXAMPLE}}/{ui,model,api,index.ts}
│   ├── entities/                 # 계층 5 — 도메인 개념(데이터 모델·표시 단위)
│   │   └── {{DOMAIN_EXAMPLE}}/{ui,model,api,index.ts}
│   └── shared/                   # 계층 6 — 도메인을 모르는 재사용 코드
│       ├── ui/ · lib/ · api/ · config/ · styles/
├── public/ · tests/ · e2e/
├── scripts/verify.sh             # 단일 검증 게이트
└── docs/
```

### 3.1 계층 규칙 (외울 것은 이것뿐)

| 계층 | 무엇 | import 할 수 있는 것 |
|---|---|---|
| `app` | 초기화·라우팅·프로바이더 | 아래 전부 |
| `pages` | 라우트 화면 조립 | widgets · features · entities · shared |
| `widgets` | 여러 기능을 묶은 독립 블록 | features · entities · shared |
| `features` | 사용자 행동 하나 | entities · shared |
| `entities` | 도메인 개념 | shared |
| `shared` | 도메인 무관 재사용 코드 | (없음) |

- **위 계층만 아래를 import한다.** 아래에서 위를 참조하면 순환이고, 그 순간 계층은 의미를 잃는다.
- **같은 계층의 다른 슬라이스를 직접 import하지 않는다.** 두 기능이 협력해야 하면 한 계층 위
  (`widgets`·`pages`)에서 조립한다. 이것이 FSD의 핵심 규칙이고 가장 자주 깨지는 규칙이다.
- 슬라이스는 **공개 API(`index.ts`)로만** 열린다. `features/x/ui/Inner.tsx`를 밖에서 import하지 않는다.

### 3.2 세그먼트 규약

한 슬라이스 안은 기술 역할로 나눈다.

| 세그먼트 | 무엇 |
|---|---|
| `ui/` | 컴포넌트·스타일 |
| `model/` | 상태·스키마·비즈니스 로직 |
| `api/` | 이 슬라이스의 서버 요청·응답 파싱 |
| `lib/` | 이 슬라이스 안에서만 쓰는 유틸 |
| `config/` | 상수·설정 |

- 세그먼트는 **필요한 것만** 만든다. 빈 디렉터리를 미리 만들지 않는다.
- `index.ts`는 밖에서 쓸 것만 내보낸다. 전부 re-export하면 공개 API가 없는 것과 같다.

### 3.3 ESLint 경계 규칙 (골격)

```js
// eslint.config.js — 경계 플러그인으로 계층·슬라이스를 강제한다.
// (eslint-plugin-boundaries 계열. 프로젝트가 고른 플러그인 문법에 맞춘다)
settings: {
  'boundaries/elements': [
    { type: 'app',      pattern: 'src/app/*' },
    { type: 'pages',    pattern: 'src/pages/*' },
    { type: 'widgets',  pattern: 'src/widgets/*' },
    { type: 'features', pattern: 'src/features/*' },
    { type: 'entities', pattern: 'src/entities/*' },
    { type: 'shared',   pattern: 'src/shared/*' },
  ],
},
rules: {
  'boundaries/element-types': ['error', {
    default: 'disallow',
    rules: [
      { from: 'app',      allow: ['pages', 'widgets', 'features', 'entities', 'shared'] },
      { from: 'pages',    allow: ['widgets', 'features', 'entities', 'shared'] },
      { from: 'widgets',  allow: ['features', 'entities', 'shared'] },
      { from: 'features', allow: ['entities', 'shared'] },
      { from: 'entities', allow: ['shared'] },
      { from: 'shared',   allow: [] },
    ],
  }],
  // 같은 계층 슬라이스 간 직접 import 금지 + 슬라이스 내부 경로 직접 접근 금지
  'boundaries/no-private': ['error', { allowUncles: false }],
  'no-restricted-imports': ['error', {
    patterns: [
      { group: ['{{PACKAGE_NS}}/*/*/*'],
        message: '슬라이스 공개 API(index.ts)만 import 한다' },
      { group: ['../../*'], message: '별칭({{PACKAGE_NS}}/…)을 쓴다' },
    ],
  }],
}
```

> **새 슬라이스를 만들면 이 설정이 자동으로 커버하는지 확인한다.** 패턴 기반이라 대개 자동이지만,
> 새 계층을 추가하거나 디렉터리 규칙을 벗어나면 등록이 필요하다. 등록 누락 = 강제 누락.

---

## 4. 슬라이스 나누기 (이 변형에서 가장 어려운 부분)

- **`entities`**: "이 데이터가 무엇인가". 주문·사용자·상품. 표시 단위(카드·배지)와 스키마가 여기 있다.
- **`features`**: "사용자가 무엇을 하는가". 주문 생성·필터 적용·결제. **동사로 이름 짓는다**(`create-order`).
- **`widgets`**: 여러 기능을 묶어 화면 어디에나 놓을 수 있는 블록(주문 패널·헤더).
- **`pages`**: 라우트 하나. 조립만 하고 로직을 갖지 않는다.

판단 기준: **"이걸 지우면 무엇이 사라지는가."** 개념이 사라지면 `entities`, 행동이 사라지면 `features`,
화면 한 덩어리가 사라지면 `widgets`.

- 슬라이스를 잘게 쪼개는 것보다 **잘못된 계층에 두는 것**이 더 비싸다. 애매하면 한 계층 위에서 시작해
  아래로 내린다(위→아래 이동은 쉽고, 아래→위는 순환을 만든다).
- 두 기능이 서로를 필요로 하면 그건 한 기능이거나, 공통 부분이 `entities`로 내려가야 한다는 뜻이다.

---

## 5. 데이터 접근

- HTTP 클라이언트·인증 헤더·타임아웃·에러 매핑은 `shared/api`에 한 번만 둔다.
- 도메인별 요청·응답 스키마는 **그 개념을 소유한 슬라이스**의 `api/`에 둔다(대개 `entities/<x>/api`).
- 행동에 딸린 변경 요청은 `features/<action>/api`에 둔다.
- 서버 상태는 쿼리 라이브러리가 소유한다. 캐시 키에 **사용자 스코프**를 포함한다.
- 상세 규약은 `.agents/rules/api-standards.md`.

### 5.1 SSR을 얹을 때 (FSD × 서버 렌더)

FSD는 렌더 방식과 독립이라 SSR 프레임워크 위에도 그대로 얹힌다. 다만 **계층에 서버/클라이언트 축이
하나 더 생기므로** 아래를 계층 규칙과 함께 못박는다. 원본 규약은 `.agents/rules/guardrails.md`의
"서버 렌더링(SSR)과 하이드레이션" 절이다.

- **`app` 계층이 서버 진입점을 소유한다.** 라우팅·프로바이더 조립과 마찬가지로, 서버에서만 도는 코드
  (세션 판정·서버 전용 설정)의 자리는 `app`이다. 아래 계층으로 내리지 않는다.
- **`shared`에 브라우저 전용 코드를 두지 않는다.** `shared`는 모든 계층이 쓰므로 서버 렌더 경로에도
  끌려 들어간다. `window`·`localStorage`를 쓰는 유틸은 `shared/lib`가 아니라 클라이언트 전용 모듈로
  분리하고, 그 사실을 파일 이름이나 `client-only` import로 드러낸다.
- **`shared/api` 클라이언트에 모듈 최상위 가변 상태를 두지 않는다.** 토큰 캐시·인터셉터 상태가
  서버 프로세스에서 요청 간에 공유되어 **다른 사용자 데이터가 섞인다.** 요청 스코프로 만든다.
- **`'use client'` 경계는 슬라이스 경계와 다르다.** 슬라이스 하나가 통째로 클라이언트일 필요는 없다.
  상호작용이 필요한 `ui/` 잎에만 붙이고, 그 이유를 한 줄 남긴다.
- **엔티티를 서버에서 클라이언트 props로 통째로 넘기지 않는다.** 직렬화되어 HTML 소스에 남는다.
  `entities/<x>`의 스키마에서 화면용 모델로 좁힌 뒤 넘긴다.

---

## 6. 코드 주석 규약 (요약)

- 주석은 기본이 '없음'이다. Why · 함정 · 외부 근거 · 억제 이유만 적는다.
- **슬라이스의 `index.ts`에는 "이 슬라이스가 무엇을 소유하는지" 한 줄**을 남긴다(경계 문서화).
- 계층 규칙을 우회하는 예외(`eslint-disable`)에는 반드시 이유와 해소 계획을 적는다.
- 한국어로 작성한다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 7. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 디자인 값 | 색·간격·타이포·모션·z-index | `shared/styles` 토큰 — `.agents/rules/design-system.md` |
| (b) 도메인 상수 | 상태 라벨·역할 | 그 개념을 소유한 슬라이스의 `config/` |
| (c) 환경별 설정 | API 베이스·기능 플래그 | `shared/config` 한 곳 |
| (d) 게이트 값 | 캐시 수명·페이지 크기·타임아웃 | `shared/config` 이름 있는 상수 |

- 환경변수는 `shared/config`에서만 읽고 시작 시 스키마로 검증한다.
- 슬라이스 고유 상수를 `shared`로 올리지 않는다. 올리는 순간 `shared`가 도메인을 알게 된다.

---

## 8. 성능 예산

- 예산 표와 측정 절차의 원본은 `.agents/rules/frontend-performance.md`다.
- FSD 고유: **`pages` 단위가 코드 스플리팅 단위**다. 라우트 지연 로드를 `app`에서 선언한다.
- `shared/ui`에 무거운 라이브러리를 정적 import하면 **모든 화면이 무거워진다.** 동적 import로 내린다.
- 슬라이스 공개 API를 통해서만 import하므로 번들러의 트리셰이킹이 `index.ts` 구성에 좌우된다.
  배럴 파일에서 부수효과가 있는 모듈을 re-export하지 않는다.

---

## 9. TDD 워크플로 (요약)

| 대상 | 도구 | 비고 |
|---|---|---|
| `shared/lib` 순수 함수 | 테스트 러너 | DOM 없음. 가장 빠르고 가장 많이 |
| `entities/*/model` 스키마·계산 | 테스트 러너 | 잘못된 응답이 에러가 되는지 |
| `features/*` 행동 | 테스트 러너 + 렌더 유틸 | **사용자가 보는 것**으로 단언 |
| `widgets`·`pages` | 테스트 러너 | 조립·상태 4종 |
| 경계 | ESLint(게이트) | 계층·공개 API 위반 |
| 화면 흐름 | E2E | 핵심 경로 1개 이상 |

- 슬라이스 테스트는 **그 슬라이스와 아래 계층만으로** 통과해야 한다. 위 계층을 끌어와야 통과하면 경계가 새고 있다.
- 검증 게이트: `bash scripts/verify.sh`.

---

## 10. 새 기능 추가 워크플로

1. **계층 결정**: 개념인가(`entities`) 행동인가(`features`) 조합인가(`widgets`) 화면인가(`pages`).
   판단 기준은 §4의 "이걸 지우면 무엇이 사라지는가".
2. 슬라이스 디렉터리 + 필요한 세그먼트만 만든다. `index.ts`에 **밖에서 쓸 것만** 내보낸다.
3. 아래 계층을 먼저 만든다(entities → features → widgets → pages). 위에서 아래로 만들면 순환이 생긴다.
4. **네 상태(loading·empty·error·partial)를 처음부터** 만든다.
5. 공용으로 올릴 것이 있으면 먼저 Inventory(`.agents/rules/reuse-before-new.md`). 도메인 냄새가 나면 `shared`로 올리지 않는다.
6. **검증**: `bash scripts/verify.sh` 통과(경계 위반은 여기서 잡힌다) + 화면 명세 갱신.

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- 아래 계층이 위 계층을 import(`entities` → `features` 등).
- 같은 계층의 다른 슬라이스를 직접 import(조립은 한 계층 위에서).
- 슬라이스 내부 파일을 직접 import(`features/x/ui/Inner`). 공개 API만 쓴다.
- `index.ts`에서 내부를 전부 re-export(공개 API가 없는 것과 같다).
- `shared/`에 도메인 이름이 등장(주문·결제 등).
- 새 계층·규칙 벗어난 디렉터리를 만들고 ESLint 설정에 등록하지 않기.
- 경계 위반을 `eslint-disable`로 덮고 이유를 적지 않기.
- `pages`에 비즈니스 로직 넣기(조립만 해야 한다).
- 응답을 `as`로 단정하거나 `any`로 받기.
- 캐시 키에 사용자 스코프 누락.
- 슬라이스가 15개를 넘는데 계층 규칙이 자동 검사되지 않는 상태로 방치.
- 측정 없이 `memo`·`useMemo`·`useCallback`을 습관적으로 붙이기.
- 목록 `key`에 배열 인덱스 사용(정렬·필터 후 입력 상태와 포커스가 엉뚱한 행에 남는다).
- **`shared`에 브라우저 전용 코드나 모듈 최상위 가변 상태 두기**(SSR에서 요청 간 공유 → 사용자 데이터 혼선).
- 렌더 중 `Date.now()`·`Math.random()`·`window` 사용(하이드레이션 불일치).
- 슬라이스 전체에 `'use client'`를 붙여 서버 렌더의 이점을 없애기.

---

## 12. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `nextjs-app` (서버 렌더가 필요해질 때) | `pages` 계층을 `app/` 라우트 세그먼트로 옮기고 나머지 계층은 `src/` 아래에 그대로 둔다. 비밀이 필요한 호출만 `src/server/`로 내린다. | 계층 규칙은 **유지**하고 그 위에 `server-only` 경계 규칙을 추가 |
| → `react-spa` (구조를 단순화할 때) | `entities`+`features`를 `features/`로 합치고 `shared/{ui,lib,api}`를 `components`·`lib`·`api`로 펼친다. `widgets`는 `components` 또는 화면으로 흡수. | 경계 플러그인을 `no-restricted-imports` 기반 규칙으로 교체 |

- **되돌리기가 어려운 방향은 "FSD 도입"이 아니라 "FSD 포기"다.** 슬라이스를 합치면 도메인 경계 정보가 사라진다.
- 전환 전에 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).
- 한 계층씩 옮기고 각 단계마다 `scripts/verify.sh`를 통과시킨다.

---

## 13. 관련 문서

- 규칙 원본: `.agents/rules/`(`guardrails.md`·`security.md`·`api-standards.md`·`structure.md`·`tech.md`)
- 프론트엔드 공통: `design-system.md`·`accessibility.md`·`ui-state.md`·`frontend-performance.md`
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
- 방법론 근거: [Feature-Sliced Design](https://feature-sliced.design)
