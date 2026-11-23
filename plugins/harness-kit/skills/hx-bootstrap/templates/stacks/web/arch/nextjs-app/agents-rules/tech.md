<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 웹 프론트엔드 · 아키텍처: nextjs-app · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (Next.js App Router)

이 하네스는 **웹 프론트엔드 전용**이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
의존성·버전은 단일 소스 `package.json`이 관리하고 **락파일을 커밋**한다. 임포트 별칭 루트는 `{{PACKAGE_NS}}`.

레이아웃·서버/클라이언트 경계 계약의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | **TypeScript** (strict) | `strict` + `noUncheckedIndexedAccess`. 끄면 경계 타입이 무의미해진다 |
| 프레임워크 | **Next.js App Router** | 서버 컴포넌트 기본. `'use client'`는 잎에만 |
| 서버 경계 | `server-only` · `client-only` | 잘못된 import를 **빌드 에러**로 만든다. 이 변형의 유일한 컴파일 강제 |
| 스키마 파싱 | zod 등 런타임 파서 | 외부 응답·환경변수·라우트 핸들러 입력 |
| 서버 상태 | TanStack Query 등(클라이언트 조회가 필요한 화면만) | 서버 컴포넌트로 되는 조회는 라이브러리를 쓰지 않는다 |
| 클라이언트 상태 | 지역 상태 우선, 필요할 때만 스토어 | 서버 상태를 복사하지 않는다 |
| 폼 | 폼 라이브러리 + 스키마 검증 | 검증 스키마는 서버와 공유 |
| 스타일 | 프로젝트가 고른 방식 + **토큰** | 값은 토큰에서 고른다(`design-system.md`) |
| 린트 | ESLint(+ `jsx-a11y` · `react-hooks` · `no-restricted-imports`) | **import 경계 규칙이 레이어 강제 수단** |
| 포맷 | Prettier | 포맷 드리프트는 게이트에서 차단 |
| 테스트 | 테스트 러너 + 렌더 유틸 + 요청 가로채기 | 사용자가 보는 것으로 단언 |
| E2E | Playwright 등 | 핵심 경로 1개 이상 |
| 패키지 매니저 | 락파일과 일치하는 하나 | 섞으면 재현이 깨진다 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 원칙에 따라 관리한다.

## 의존성 단일 소스 원칙

- 모든 의존성은 `package.json`이 관리하고 **락파일을 커밋**한다. 빌드 재현성은 여기서 나온다.
- 설치는 락 기준 재현 설치(`--frozen-lockfile` 등)로 한다. CI에서 락을 갱신하는 설치를 쓰지 않는다.
- 패키지 매니저를 섞지 않는다(`packageManager` 필드로 고정).
- 의존성을 늘리기 전에 표준 API·이미 있는 의존성을 먼저 본다. 작은 유틸을 위해 패키지를 추가하지 않는다.
- 새 의존성은 **번들 크기**와 `postinstall` 스크립트 유무를 확인한 뒤 넣는다(`frontend-performance.md`·`security.md`).

## package.json 스크립트 (게이트가 부르는 이름)

`scripts/verify.sh`가 아래 이름으로 호출한다. 이름을 바꾸려면 `verify.sh`도 함께 고친다.

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format:check": "prettier --check .",
    "format": "prettier --write .",
    "test": "<러너> run --coverage",
    "e2e": "<E2E 도구> test"
  }
}
```

## tsconfig 핵심 설정

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,   // 배열·인덱스 접근이 undefined 를 포함하게
    "noUncheckedSideEffectImports": true,
    "paths": { "{{PACKAGE_NS}}/*": ["./src/*"] }
  }
}
```

- `strict`를 끄거나 `any`로 우회하지 않는다. 우회가 필요하면 이유를 주석으로 남긴다.
- 경로 별칭을 쓰되 ESLint에서 깊은 상대 경로를 막는다(`ARCHITECTURE.md` §3.2).

## 빌드 / 실행 명령

```bash
pnpm dev                     # 로컬 개발 서버 (3000)
pnpm build                   # 프로덕션 빌드(서버/클라이언트 혼입이 여기서 드러난다)
pnpm start                   # 빌드 결과 실행
pnpm lint                    # ESLint(import 경계 규칙 포함)
pnpm typecheck               # tsc --noEmit
pnpm test                    # 단위·컴포넌트 테스트
pnpm e2e                     # E2E
bash scripts/verify.sh       # 검증 게이트(아래 전부를 묶어 실행)
```

`scripts/verify.sh`가 묶는 것:

```bash
bash scripts/check-exec-plan-status.sh   # 구조 점검
prettier --check .                        # 포맷 드리프트
eslint .                                  # 린트 + import 경계 강제
tsc --noEmit                              # 타입 경계
bash scripts/run-guards.sh                # (선택 모듈) 플랫폼 가드
<러너> test                                # 테스트 + 커버리지 임계
next build                                # 프로덕션 빌드
```

- 강제 게이트는 `scripts/verify.sh` 한 곳이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- **빌드를 게이트에서 빼지 않는다.** 이 변형에서 가장 흔한 결함(서버/클라이언트 혼입)이 빌드에서만 드러난다.
- 커버리지 임계는 테스트 러너 설정에서 강제한다(`quality-score.md` 기준: 전체 80).

## 환경변수

- 서버 전용 값과 공개 값을 **이름으로 구분**한다. 공개 접두사가 붙은 변수는 브라우저 번들에 인라인된다.
- 비밀은 `src/server/config`에서만 읽는다. 기능·컴포넌트에서 `process.env`를 직접 부르지 않는다.
- 시작 시 **스키마로 검증**한다. 누락을 런타임 500이 아니라 기동 실패로 만든다.
- `.env.example`을 유지하고 실값은 커밋하지 않는다.

## 로컬 개발

- dev 서버는 백그라운드로 띄운다. 테스트는 단발 실행(watch 금지).
- 느린 네트워크·오프라인을 **일부러 재현**해 본다. 정상 경로만 만든 화면은 완성이 아니다(`reliability.md`).
- 반복 명령은 스크립트에 모으되, 강제 게이트 로직은 `scripts/verify.sh`에만 둔다(로직 복제 금지).

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (Next.js) | 3000 |
| 백엔드 API(선택) | 8080 |
| E2E 프리뷰 서버 | 프로젝트에서 지정 |
