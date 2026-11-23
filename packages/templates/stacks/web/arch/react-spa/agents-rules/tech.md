<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 웹 프론트엔드 · 아키텍처: react-spa · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (React SPA)

이 하네스는 **웹 프론트엔드 전용**이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
의존성·버전은 단일 소스 `package.json`이 관리하고 **락파일을 커밋**한다. 임포트 별칭 루트는 `{{PACKAGE_NS}}`.

레이아웃·라우팅 단일 지점 계약의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | **TypeScript** (strict) | `strict` + `noUncheckedIndexedAccess` |
| 번들러 | **Vite** 등 | 개발 서버 + 프로덕션 빌드 |
| UI | **React** | |
| 라우팅 | 클라이언트 라우터(React Router 등) | 선언은 `app/routes.tsx` 한 곳 |
| 서버 상태 | TanStack Query 등 | 서버 상태의 소유자. 스토어에 복사하지 않는다 |
| 클라이언트 상태 | 지역 상태 우선, 필요할 때만 스토어 | 전역은 승격이지 기본값이 아니다 |
| 스키마 파싱 | zod 등 런타임 파서 | 외부 응답·환경변수 |
| 폼 | 폼 라이브러리 + 스키마 검증 | |
| 스타일 | 프로젝트가 고른 방식 + **토큰** | 값은 토큰에서 고른다(`design-system.md`) |
| 린트 | ESLint(+ `jsx-a11y` · `react-hooks` · `no-restricted-imports`) | **import 경계 규칙이 유일한 레이어 강제 수단** |
| 포맷 | Prettier | 포맷 드리프트는 게이트에서 차단 |
| 테스트 | 테스트 러너 + 렌더 유틸 + 요청 가로채기 | 사용자가 보는 것으로 단언 |
| E2E | Playwright 등 | 핵심 경로 1개 이상 |
| 패키지 매니저 | 락파일과 일치하는 하나 | 섞으면 재현이 깨진다 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 원칙에 따라 관리한다.

## 의존성 단일 소스 원칙

- 모든 의존성은 `package.json`이 관리하고 **락파일을 커밋**한다. 빌드 재현성은 여기서 나온다.
- 설치는 락 기준 재현 설치(`--frozen-lockfile` 등)로 한다. CI에서 락을 갱신하는 설치를 쓰지 않는다.
- 패키지 매니저를 섞지 않는다(`packageManager` 필드로 고정).
- **SPA는 의존성이 곧 첫 화면 시간**이다. 새 의존성은 번들 크기를 확인한 뒤 넣고, 무거운 것은
  동적 import로 내린다(`frontend-performance.md`).
- `postinstall` 스크립트를 실행하는 새 의존성은 검토 대상이다(`security.md`).

## package.json 스크립트 (게이트가 부르는 이름)

`scripts/verify.sh`가 아래 이름으로 호출한다. 이름을 바꾸려면 `verify.sh`도 함께 고친다.

```jsonc
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
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
    "noUncheckedIndexedAccess": true,
    "paths": { "{{PACKAGE_NS}}/*": ["./src/*"] }
  }
}
```

- `strict`를 끄거나 `any`로 우회하지 않는다. 우회가 필요하면 이유를 주석으로 남긴다.
- 경로 별칭은 번들러 설정에도 같이 등록해야 한다(둘이 어긋나면 빌드에서만 깨진다).

## 빌드 / 실행 명령

```bash
pnpm dev                     # 로컬 개발 서버 (5173)
pnpm build                   # 프로덕션 빌드(정적 산출물)
pnpm preview                 # 빌드 결과 로컬 확인
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
vite build                                # 프로덕션 빌드
```

- 강제 게이트는 `scripts/verify.sh` 한 곳이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 커버리지 임계는 테스트 러너 설정에서 강제한다(`quality-score.md` 기준: 전체 80).

## 환경변수 (전부 공개된다)

- SPA의 환경변수는 **빌드 시 번들에 인라인**된다. 비밀을 넣지 않는다 — 넣었다면 유출된 것으로 보고 교체한다.
- 비밀이 필요한 외부 호출은 백엔드가 대신한다.
- 앱 시작 시 스키마로 검증하고 **한 모듈에서만** 읽는다. 컴포넌트에서 직접 접근하지 않는다.
- `.env.example`을 유지하고 실값은 커밋하지 않는다.

## 배포 (정적 호스팅)

- 산출물은 정적 파일이다. **모든 경로를 `index.html`로 폴백**하도록 호스팅을 설정한다.
  이 설정이 없으면 딥링크·새로고침이 404가 된다.
- 해시가 붙은 청크는 장기 캐시, `index.html`은 캐시하지 않는다(새 배포가 즉시 반영돼야 한다).
- 배포 직후 구버전 청크가 사라져 지연 로드가 실패할 수 있다. 새로고침 안내 경로를 둔다(`reliability.md`).
- 소스맵을 공개 배포에 올릴지 의식적으로 정한다(모니터링 도구에는 업로드, 공개 경로에는 비공개 권장).

## 로컬 개발

- dev 서버는 백그라운드로 띄운다. 테스트는 단발 실행(watch 금지).
- API 프록시 설정을 번들러 dev 서버에 둔다(CORS 우회를 코드에 넣지 않는다).
- 느린 네트워크·오프라인을 **일부러 재현**해 본다(`reliability.md`).

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (dev 서버) | 5173 |
| 백엔드 API | 8080 |
| E2E 프리뷰 서버 | 4173 |
