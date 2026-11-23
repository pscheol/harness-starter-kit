<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 웹 프론트엔드 · 아키텍처: feature-sliced · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (Feature-Sliced Design)

이 하네스는 **웹 프론트엔드 전용**이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
의존성·버전은 단일 소스 `package.json`이 관리하고 **락파일을 커밋**한다. 임포트 별칭 루트는 `{{PACKAGE_NS}}`.

계층·슬라이스 계약의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 언어 | **TypeScript** (strict) | `strict` + `noUncheckedIndexedAccess` |
| 번들러/프레임워크 | Vite 또는 메타프레임워크 | FSD 계층은 둘 중 무엇과도 함께 쓴다 |
| UI | **React** | |
| 라우팅 | 라우터 또는 파일 기반 라우팅 | 선언은 `app` 계층에서 |
| 서버 상태 | TanStack Query 등 | 캐시 키에 사용자 스코프 포함 |
| 스키마 파싱 | zod 등 런타임 파서 | 슬라이스의 `api/` 세그먼트에서 |
| 스타일 | 프로젝트가 고른 방식 + **토큰**(`shared/styles`) | 값은 토큰에서 고른다(`design-system.md`) |
| **경계 강제** | ESLint 경계 플러그인(boundaries 계열) | **이 변형의 핵심 도구.** 없으면 FSD 가 아니다 |
| 린트 | ESLint(+ `jsx-a11y` · `react-hooks` · `no-restricted-imports`) | 계층·공개 API 위반을 게이트에서 차단 |
| 포맷 | Prettier | 포맷 드리프트는 게이트에서 차단 |
| 테스트 | 테스트 러너 + 렌더 유틸 + 요청 가로채기 | 슬라이스 단위로 완결된 테스트 |
| E2E | Playwright 등 | 핵심 경로 1개 이상 |
| 패키지 매니저 | 락파일과 일치하는 하나 | 섞으면 재현이 깨진다 |

> 위 표는 기본 골격이다. 실제 라이브러리·버전은 프로젝트가 확정하고 아래 원칙에 따라 관리한다.

## 의존성 단일 소스 원칙

- 모든 의존성은 `package.json`이 관리하고 **락파일을 커밋**한다.
- 설치는 락 기준 재현 설치(`--frozen-lockfile` 등). CI에서 락을 갱신하는 설치를 쓰지 않는다.
- 패키지 매니저를 섞지 않는다(`packageManager` 필드로 고정).
- **한 슬라이스만 쓰는 무거운 의존성**은 그 슬라이스에서 동적 import로 내린다. `shared`에 두면
  모든 화면이 무거워진다(`frontend-performance.md`).
- `postinstall` 스크립트를 실행하는 새 의존성은 검토 대상이다(`security.md`).

## 경계 플러그인 설정 (이 변형의 필수 도구)

계층 규칙이 자동 검사되지 않으면 디렉터리 이름만 FSD다. 설정 골격은 `ARCHITECTURE.md` §3.3.

```jsonc
// package.json — 경계 검사는 lint 스크립트에 포함되어 게이트에서 돈다
{ "scripts": { "lint": "eslint ." } }
```

- 계층 방향(위→아래), 같은 계층 슬라이스 간 import 금지, 슬라이스 내부 직접 접근 금지 세 가지를 모두 켠다.
- FSD 전용 린터(steiger 등)를 추가로 쓸 수 있다. 쓴다면 `lint` 스크립트에 묶어 게이트 한 곳을 유지한다.
- 새 계층·규칙 밖 디렉터리를 만들면 설정에 등록한다. **등록 누락 = 강제 누락.**

## package.json 스크립트 (게이트가 부르는 이름)

`scripts/verify.sh`가 아래 이름으로 호출한다. 이름을 바꾸려면 `verify.sh`도 함께 고친다.

```jsonc
{
  "scripts": {
    "dev": "<번들러> dev",
    "build": "<번들러> build",
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

- 별칭은 계층 경로를 그대로 드러낸다(`{{PACKAGE_NS}}/entities/{{DOMAIN_EXAMPLE}}`). 그래야 위반이 눈에 보인다.
- 경로 별칭을 번들러 설정에도 같이 등록한다(둘이 어긋나면 빌드에서만 깨진다).

## 빌드 / 실행 명령

```bash
pnpm dev                     # 로컬 개발 서버
pnpm build                   # 프로덕션 빌드
pnpm lint                    # ESLint + 계층 경계 검사
pnpm typecheck               # tsc --noEmit
pnpm test                    # 단위·컴포넌트 테스트
pnpm e2e                     # E2E
bash scripts/verify.sh       # 검증 게이트(아래 전부를 묶어 실행)
```

`scripts/verify.sh`가 묶는 것:

```bash
bash scripts/check-exec-plan-status.sh   # 구조 점검
prettier --check .                        # 포맷 드리프트
eslint .                                  # 린트 + 계층·슬라이스 경계 강제
tsc --noEmit                              # 타입 경계
bash scripts/run-guards.sh                # (선택 모듈) 플랫폼 가드
<러너> test                                # 테스트 + 커버리지 임계
<번들러> build                             # 프로덕션 빌드
```

- 강제 게이트는 `scripts/verify.sh` 한 곳이다. hook/CI/pre-commit은 이를 호출하는 얇은 트리거([`agent-harness.md`](./agent-harness.md)).
- 커버리지 임계는 테스트 러너 설정에서 강제한다(`quality-score.md` 기준: 전체 80).

## 환경변수

- `shared/config` 한 곳에서만 읽고 시작 시 스키마로 검증한다. 슬라이스가 직접 `process.env`를 부르지 않는다.
- 클라이언트 번들에 실리는 변수에는 비밀을 넣지 않는다(`security.md`).
- `.env.example`을 유지하고 실값은 커밋하지 않는다.

## 로컬 개발

- dev 서버는 백그라운드로 띄운다. 테스트는 단발 실행(watch 금지).
- 느린 네트워크·오프라인을 **일부러 재현**해 본다(`reliability.md`).
- 반복 명령은 스크립트에 모으되, 강제 게이트 로직은 `scripts/verify.sh`에만 둔다(로직 복제 금지).

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| {{PROJECT_NAME}} (dev 서버) | 5173 |
| 백엔드 API | 8080 |
| E2E 프리뷰 서버 | 4173 |
