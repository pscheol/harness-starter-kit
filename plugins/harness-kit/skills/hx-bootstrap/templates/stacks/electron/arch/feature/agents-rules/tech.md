<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Electron · 아키텍처: feature · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 기술 스택 / 실행 환경 — {{PROJECT_NAME}} (feature)

이 하네스는 **Electron 데스크톱 앱 전용**이다. 아래 스택·버전은 예시일 뿐이며, 최신 안정 버전을 프로젝트에서 확정한다.
의존성·버전은 단일 소스 `package.json`이 관리하고 **락파일을 커밋**한다. 앱 ID는 `{{PACKAGE_NS}}`(역 도메인).

레이아웃·기능 독립 계약의 원본은 `ARCHITECTURE.md`다. 이 문서는 **무엇으로 만들고 어떻게 돌리는가**만 다룬다.

## 스택 (예시 — 최신 안정 버전을 프로젝트에서 확정)

| 영역 | 선택(예시) | 비고 |
|---|---|---|
| 런타임 | **Electron** | **최신 안정선 유지** — Chromium 보안 패치가 이 경로로 들어온다 |
| 언어 | **TypeScript** (strict) | `strict` + `noUncheckedIndexedAccess` |
| UI | **React** | 렌더러는 웹 앱이다 |
| 번들 | Electron 대응 번들러(electron-vite 등) | main·preload·renderer **세 타깃**을 따로 빌드 |
| 스키마 파싱 | zod 등 런타임 파서 | 기능의 `contract.ts` 에서 요청/응답 스키마 정의 |
| 저장소 | 파일(JSON/SQLite 등) | **기능이 자기 파일을 소유**. 원자적 쓰기 + 스키마 버전 |
| 비밀 보관 | OS 키체인 어댑터 | 평문 파일·localStorage 금지 |
| 로깅 | 파일 로거(회전·상한) | 로그에 기능 이름을 넣어 상관 가능하게 |
| 린트 | ESLint(+ `jsx-a11y` · `react-hooks` · `no-restricted-imports`) | 프로세스 방향 + **기능 독립** 강제 |
| 포맷 | Prettier | 포맷 드리프트는 게이트에서 차단 |
| 테스트 | 테스트 러너 + 렌더 유틸 | 기능 단위로 완결된 테스트 |
| E2E | Playwright(Electron 지원) 등 | 실제 앱을 띄워 확인 |
| 패키징 | electron-builder 등 | 게이트가 아니라 **릴리스 절차** |
| 패키지 매니저 | 락파일과 일치하는 하나 | 섞으면 재현이 깨진다 |

## 의존성 단일 소스 원칙

- 모든 의존성은 `package.json`이 관리하고 **락파일을 커밋**한다. 모듈이 하나이므로 의존성도 하나다.
- 설치는 락 기준 재현 설치(`--frozen-lockfile` 등).
- **`dependencies`와 `devDependencies` 구분이 패키징 크기에 직접 영향을 준다.**
- **한 기능만 쓰는 무거운 의존성이 생기면 그 자체가 분리 신호**다(`ARCHITECTURE.md` §0 — `monorepo` 검토).
- **Electron 버전 업그레이드를 미루지 않는다.** 오래된 Chromium은 앱 코드가 완벽해도 취약하다.
- 네이티브 모듈은 출처·빌드 방식을 확인한다([`security.md`](./security.md)).

## 경로 별칭 (기능 독립 강제의 전제)

기능 간 참조를 ESLint 규칙 하나로 막으려면 **경로 규약**이 먼저 서야 한다.

```jsonc
// tsconfig.json — 자기 기능 안은 상대 경로, 기능 간·계층 간은 별칭만 쓴다
{
  "compilerOptions": {
    "paths": {
      "@shared/*":   ["./src/shared/*"],
      "@main/*":     ["./src/main/*"],
      "@renderer/*": ["./src/renderer/*"]
    }
  }
}
```

- 이 규약이 서 있어야 `@main/features/*` 하나를 막는 것으로 **모든 기능 쌍**이 커버된다.
  기능이 늘어도 ESLint 설정을 고칠 필요가 없다.
- 번들러 설정에도 같은 별칭을 등록한다(둘이 어긋나면 빌드에서만 깨진다).
- 프로세스마다 `lib`·`types`가 다르다. `renderer`에는 DOM, `main`에는 Node 타입을 준다.
  한 tsconfig로 합치면 렌더러에서 Node API가 타입 검사를 통과한다 — **경계가 무너진다.**

## package.json 스크립트 (게이트가 부르는 이름)

```jsonc
{
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "<번들러> dev",
    "build": "<번들러> build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format:check": "prettier --check .",
    "format": "prettier --write .",
    "test": "<러너> run --coverage",
    "e2e": "<E2E 도구> test",
    "package": "electron-builder"        // 게이트에 포함하지 않는다
  }
}
```

## 빌드 / 실행 명령

```bash
pnpm dev                     # 개발 모드(세 타깃 감시)
pnpm build                   # 세 타깃 번들
pnpm lint                    # ESLint(프로세스 경계 + 기능 독립)
pnpm typecheck               # tsc --noEmit
pnpm test                    # 단위 테스트
pnpm test -- features/{{DOMAIN_EXAMPLE}}   # 한 기능만
pnpm e2e                     # 실제 앱 기동 E2E
pnpm package                 # 설치 파일 생성(릴리스 절차 — 게이트 아님)
bash scripts/verify.sh       # 검증 게이트
```

`scripts/verify.sh`가 묶는 것:

```bash
bash scripts/check-exec-plan-status.sh   # 구조 점검
prettier --check .                        # 포맷 드리프트
# ★ 프로세스 경계 가드(grep) — contextIsolation·nodeIntegration·sandbox·ipcRenderer 통째 노출
eslint .                                  # 린트 + 프로세스 방향 + 기능 독립 강제
tsc --noEmit                              # 타입 경계
bash scripts/run-guards.sh                # (선택 모듈) 플랫폼 가드
<러너> test                                # 테스트 + 커버리지 임계
<번들러> build                             # 세 타깃 번들
```

- 강제 게이트는 `scripts/verify.sh` 한 곳이다([`agent-harness.md`](./agent-harness.md)).
- **프로세스 경계 가드는 `fast` 레벨에도 들어 있다.** 이 스택에서 가장 비싼 실수라 턴마다 검사한다.
- 커버리지 임계는 테스트 러너 설정에서 강제한다(`quality-score.md` 기준: 전체 80).

## 패키징 · 서명 · 업데이트 (게이트와 분리)

- 패키징은 OS별 러너와 서명 비밀이 필요하므로 **릴리스 워크플로**로 분리한다.
- `appId`는 `{{PACKAGE_NS}}`. 아이콘·설치 옵션·타깃 OS는 `build/` 설정에서 관리한다.
- **코드 서명 없는 배포는 하지 않는다.** 인증서·비밀번호를 리포에 커밋하지 않는다.
- 자동 업데이트는 서명 검증되는 채널로만. 롤백 절차를 문서로 남긴다([`reliability.md`](./reliability.md)).

## 환경변수 · 설정

- 비밀은 main에서만 읽는다. 렌더러 번들에 들어가는 값에 비밀을 넣지 않는다.
- **기능 고유 설정은 그 기능 소유 구조체로 분리**한다. 기능을 떼어낼 때 설정도 따라가게.
- 앱 데이터·로그·캐시 경로는 OS 표준 경로 API로 얻는다. 하드코딩하지 않는다.
- `.env.example`을 유지하고 실값은 커밋하지 않는다.

## 로컬 개발

- dev 서버는 백그라운드로 띄운다. 테스트는 단발 실행(watch 금지).
- **핫 리로드에서 `handle` 중복 등록 예외**가 자주 난다. 기능의 `register(deps)`가 한 번만 호출되게 유지한다.
- 느린 네트워크·오프라인·디스크 가득 참·구버전 데이터 파일을 **일부러 재현**해 본다([`reliability.md`](./reliability.md)).
- 지원 OS 각각에서 최소 1회는 실행해 본다. 확인하지 못한 OS는 명시한다.

## 개발 포트 규약 (예시 — 프로젝트에 맞게 조정)

| 서비스 | 포트(예시) |
|---|---|
| 렌더러 dev 서버 | 5173 |
| 백엔드 API(선택) | 8080 |
| 원격 디버깅 | 개발 전용. **배포 빌드에서 켜지 않는다** |
