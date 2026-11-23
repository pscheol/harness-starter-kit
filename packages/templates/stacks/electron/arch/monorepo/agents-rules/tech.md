<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Electron · 아키텍처: monorepo · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (monorepo)

이 하네스는 **Electron 데스크톱 + 웹 워크스페이스**를 다룬다. 아래 스택·버전은 예시일 뿐이며,
최신 안정 버전을 프로젝트에서 확정한다. 앱 ID는 `{{PACKAGE_NS}}`(역 도메인).

레이아웃·패키지 의존 방향 계약의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 워크스페이스 | pnpm workspaces(또는 동급) | 락파일은 루트 하나 |
| 런타임(데스크톱) | **Electron** | `apps/desktop` 에만 의존. **최신 안정선 유지** |
| 언어 | **TypeScript** (strict) | 프로젝트 참조로 패키지별 검사 |
| UI | **React** | `packages/ui` 와 두 앱이 공유 |
| 번들 | Electron 대응 번들러 + 웹 번들러 | 데스크톱은 main·preload·renderer **세 타깃** |
| 스키마 파싱 | zod 등 런타임 파서 | `packages/core` 에서 정의(두 앱이 공유) |
| 저장소 | 데스크톱은 파일/SQLite, 웹은 API | `core` 는 인터페이스만 안다 |
| 린트 | ESLint(+ `jsx-a11y` · `react-hooks` · `no-restricted-imports`) | 패키지 방향 + 프로세스 방향 |
| 포맷 | Prettier | 루트에서 전체 |
| 테스트 | 테스트 러너(패키지별) | `core` 는 플랫폼 없이 |
| E2E | Playwright(Electron·웹 지원) | 앱마다 |
| 패키징 | electron-builder 등 | 게이트가 아니라 **릴리스 절차** |

## 의존성 관리 (모노레포의 핵심)

- **락파일은 루트 하나**다. 앱·패키지마다 따로 만들지 않는다.
- **루트 `package.json`에 런타임 의존성을 두지 않는다.** 두면 모든 앱이 그 의존성을 갖는다.
  루트에는 워크스페이스 도구·린터·포매터 같은 개발 도구만.
- **`packages/core/package.json`에 `electron`·`react`를 넣지 않는다.** 이것이 `core` 순수성의
  가장 강한 강제다 — 규칙보다 먼저 이 장치를 쓴다.
- 같은 라이브러리의 버전이 패키지마다 갈리지 않게 한다(중복 번들·타입 충돌의 원인).
  워크스페이스 도구의 버전 고정 기능을 쓴다.
- 앱 간 의존성을 만들지 않는다(`apps/desktop`이 `apps/web`을 의존하지 않는다).
- **Electron 버전 업그레이드를 미루지 않는다.** 오래된 Chromium은 앱 코드가 완벽해도 취약하다.
- `postinstall`을 실행하는 새 의존성은 검토 대상이다([`security.md`](./security.md)).

## 패키지 공개 API

```jsonc
// packages/core/package.json
{
  "name": "@{{PROJECT_SLUG}}/core",
  "exports": { ".": "./src/index.ts", "./{{DOMAIN_EXAMPLE}}": "./src/{{DOMAIN_EXAMPLE}}/index.ts" },
  "dependencies": { }        // electron·react 없음
}
```

- `exports`에 선언하지 않은 경로는 import되지 않는다. 내부 경로 접근을 구조적으로 막는다.
- 패키지 간 참조는 패키지 이름으로. 상대 경로로 워크스페이스를 가로지르지 않는다.

## tsconfig (프로젝트 참조)

```jsonc
// 루트 tsconfig.json — 각 패키지·앱을 참조로 묶는다
{
  "files": [],
  "references": [
    { "path": "./packages/core" }, { "path": "./packages/ui" },
    { "path": "./apps/desktop" },  { "path": "./apps/web" }
  ]
}
```

- 각 패키지가 자기 `tsconfig`를 갖고 `strict` + `noUncheckedIndexedAccess`를 켠다.
- **프로세스·플랫폼마다 `lib`·`types`가 다르다.** `core`에는 DOM 타입을 주지 않는다 —
  주는 순간 DOM API가 타입 검사를 통과해 순수성이 무너진다.
- `apps/desktop`의 renderer에는 DOM, main에는 Node 타입을 준다.

## package.json 스크립트 (게이트가 부르는 이름)

루트 스크립트가 워크스페이스 전체를 돈다. `scripts/verify.sh`는 루트 스크립트만 부른다.

```jsonc
// 루트 package.json
{
  "scripts": {
    "dev": "<워크스페이스 도구> run dev",
    "build": "<워크스페이스 도구> run build",     // ★ 두 앱 모두 빌드해야 한다
    "lint": "eslint .",
    "typecheck": "tsc --build",
    "format:check": "prettier --check .",
    "format": "prettier --write .",
    "test": "<워크스페이스 도구> run test",
    "e2e": "<워크스페이스 도구> run e2e",
    "package": "<워크스페이스 도구> --filter desktop run package"   // 게이트 아님
  }
}
```

## 빌드 / 실행 명령

```bash
pnpm dev                                  # 전체(또는 --filter 로 하나만)
pnpm --filter desktop dev                 # 데스크톱만
pnpm --filter web dev                     # 웹만
pnpm build                                # ★ 두 앱 모두
pnpm --filter @{{PROJECT_SLUG}}/core test # 공유 패키지만
pnpm lint · pnpm typecheck · pnpm test
bash scripts/verify.sh                    # 검증 게이트
```

`scripts/verify.sh`가 묶는 것:

```bash
bash scripts/check-exec-plan-status.sh   # 구조 점검
prettier --check .                        # 포맷 드리프트
# ★ 프로세스 경계 가드(grep) — apps/desktop 의 webPreferences·preload 노출 검사
eslint .                                  # 린트 + 패키지 방향 + 프로세스 방향
tsc --build                               # 타입 경계(프로젝트 참조)
bash scripts/run-guards.sh                # (선택 모듈) 플랫폼 가드
<워크스페이스> test                        # 전체 테스트 + 커버리지 임계
<워크스페이스> build                       # ★ 두 앱 모두 빌드
```

- 강제 게이트는 `scripts/verify.sh` 한 곳이다([`agent-harness.md`](./agent-harness.md)).
- **한 앱만 빌드하고 통과시키지 않는다.** 공유 코드의 플랫폼 오염은 다른 앱에서만 드러난다.
- **프로세스 경계 가드는 `fast` 레벨에도 들어 있다.**
- 커버리지 임계는 테스트 러너 설정에서 강제한다(`quality-score.md` 기준: 전체 80).

## CI 최적화 (선택)

- 워크스페이스 도구의 캐시·영향 범위 감지로 바뀐 패키지만 돌릴 수 있다.
- 다만 **`packages/*`가 바뀌면 두 앱을 모두 검사**해야 한다. 영향 범위 계산이 이 관계를 알게 설정한다.
- 캐시 때문에 검사를 건너뛰는 상황이 생기면 게이트를 신뢰할 수 없다. 릴리스 전에는 전체를 돌린다.

## 패키징 · 서명 · 업데이트 (게이트와 분리)

- 데스크톱 패키징은 OS별 러너와 서명 비밀이 필요하므로 **릴리스 워크플로**로 분리한다.
- `appId`는 `{{PACKAGE_NS}}`. 설정은 `apps/desktop/build/`에서 관리한다.
- **코드 서명 없는 배포는 하지 않는다.** 인증서·비밀번호를 리포에 커밋하지 않는다.
- 웹과 데스크톱의 릴리스 주기가 다르다. **버전 정책을 문서로 정한다**(동기화할지, 독립할지).
- 자동 업데이트는 서명 검증되는 채널로만. 롤백 절차를 남긴다([`reliability.md`](./reliability.md)).

## 환경변수 · 설정

- 앱마다 자기 설정을 갖는다. `packages/*`는 환경변수를 직접 읽지 않는다(주입받는다).
- 데스크톱 비밀은 main에서만. 웹 번들에 들어가는 값에 비밀을 넣지 않는다.
- `.env.example`을 앱마다 유지하고 실값은 커밋하지 않는다.

## 로컬 개발

- dev 서버는 백그라운드로 띄운다. 테스트는 단발 실행(watch 금지).
- 공유 패키지를 고치면 두 앱에 모두 반영된다. **한 앱에서만 확인하고 넘어가지 않는다.**
- 핫 리로드에서 `handle` 중복 등록 예외가 자주 난다. 등록을 한 번만 하도록 유지한다.
- 지원 OS·브라우저 각각에서 최소 1회는 실행해 본다. 확인하지 못한 환경은 명시한다.

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| 데스크톱 렌더러 dev 서버 | 5173 |
| 웹 dev 서버 | 5174 |
| 백엔드 API(선택) | 8080 |
| 원격 디버깅 | 개발 전용. **배포 빌드에서 켜지 않는다** |
