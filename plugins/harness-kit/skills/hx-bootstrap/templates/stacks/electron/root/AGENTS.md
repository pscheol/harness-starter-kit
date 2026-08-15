<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Electron 데스크톱 앱 -->

# AGENTS.md — 에이전트 작업 가이드 (목차)

이 파일은 상세를 담는 곳이 아니라 목차다. 규칙 원본은 `.agents/rules/`, 설계·SDD 기록은 `.agents/docs/`에 있다.
Claude Code · Codex · Kiro가 함께 작업한다. 규칙은 `.agents/rules/`, 설계와 기록은 `.agents/docs/`가 기준이고, 진입 파일은 그쪽으로 안내만 한다.

## 먼저 읽을 것 (순서)

1. `AGENTS.md` — 이 목차(지금 파일)
2. `ARCHITECTURE.md` — 프로세스 경계와 이 프로젝트가 **선택한 아키텍처**의 원본(레이아웃·IPC 계약·강제 수단·선택 기준·전환 가이드. 새 기능 작업 시 필수)
3. `.agents/rules/` — 규칙 원본(가드레일·보안·IPC/API·구조·스택·제품·주석·문체·하네스 + 프론트엔드 공통 4종). 작업 유형에 맞는 파일을 직접 연다.
4. `.agents/docs/` — SDD 기록(<slug>-specs/{requirements,design,tasks}·decisions). 진입 `.agents/docs/README.md`.

## 에이전트 로딩 규칙 (3 에이전트, 원본 1곳)

규칙 본문은 어느 에이전트도 소유하지 않는다. 원본은 `.agents/rules/` 한 곳이고, 각 에이전트 진입 파일은 그 원본으로 유도만 한다.

| 에이전트 | 진입 파일 | 원본 접근 |
|---|---|---|
| Claude Code | `CLAUDE.md` (→ 이 `AGENTS.md` 위임) | `.agents/rules/*` 직접 |
| Codex | 이 `AGENTS.md` + `.codex/config.toml`(리포 정책) | `.agents/rules/*` 직접 |
| Kiro | `.kiro/steering/*.md` (얇은 포인터) | 포인터가 `.agents/rules/*` 원본으로 유도 |

- 어느 에이전트도 `.agents/rules/` 전체가 자동 주입된다고 가정하지 않는다. 작업 시작 시 아래 "규약"의 해당 파일을 직접 연다.
- 모든 코드/문서 변경 전 최소 기준은 `.agents/rules/guardrails.md`다. **IPC·프로세스 경계·보안 변경은 반드시 `security.md`를 함께 연다.**

## 규약 (반드시 준수 — 원본은 `.agents/rules/`)

| 영역 | 원본 |
|---|---|
| 가드레일(추측 금지·프로세스 책임·경계 파싱·주석) | `.agents/rules/guardrails.md` |
| **보안(프로세스 경계·IPC 화이트리스트·파일/셸 접근)** | `.agents/rules/security.md` |
| IPC 계약·외부 API 연동 표준 | `.agents/rules/api-standards.md` |
| 리포 구조·프로세스 경계·ESLint 강제 | `.agents/rules/structure.md` |
| 설계 원칙(응집·결합·의존 방향) | `.agents/rules/design-principles.md` |
| 기술 스택·빌드·패키징 | `.agents/rules/tech.md` |
| 제품·범위·우선순위 | `.agents/rules/product.md` |
| 멀티 에이전트 하네스·SDD·exec-plan 게이트 | `.agents/rules/agent-harness.md` |
| 주석 작성(TSDoc 규약 + 기본은 '없음') | `.agents/rules/code-comments.md` |
| 문체(스펙·주석·커밋 — 사람이 읽는 글) | `.agents/rules/writing-style.md` |
| 재사용 우선(새로 만들기 전 Inventory·판정 근거) | `.agents/rules/reuse-before-new.md` |
| 검증 사다리(L0~L4·생략 기록 의무) | `.agents/rules/verification-ladder.md` |
| 리뷰 정책(자동화 위임·심각도·negative knowledge) | `.agents/rules/pr-review-policy.md` |
| **디자인 시스템**(토큰에서 고른다·컴포넌트 상태 8종) | `.agents/rules/design-system.md` |
| **접근성**(WCAG 2.2 AA·시맨틱 우선·키보드) | `.agents/rules/accessibility.md` |
| **UI 상태**(서버/클라이언트/URL/폼 분리·파생 금지) | `.agents/rules/ui-state.md` |
| **프론트엔드 성능**(예산·측정 후 최적화) | `.agents/rules/frontend-performance.md` |

## 핵심 가드레일 (요약 — 원본은 위 표)

- 추측 금지: 확인 후 단정, 미확인은 명시. 파일·채널·응답 형태는 읽고 말한다. 의존성은 `package.json`에서 확인한다.
- **프로세스 경계가 이 스택의 전부다.** main(Node 권한) · preload(다리) · renderer(웹, 권한 없음).
  `contextIsolation: true` · `nodeIntegration: false` · `sandbox: true` — **이 셋은 협상 대상이 아니다.**
  하나라도 풀면 렌더러 XSS가 곧바로 로컬 코드 실행이 된다.
- **IPC는 화이트리스트로만** 노출한다. `ipcRenderer`를 통째로 `window`에 붙이지 않는다(= 임의 채널 호출 허용).
- **렌더러 입력은 신뢰 경계 밖이다.** main 핸들러는 인자를 스키마로 파싱한 뒤 쓴다.
- 경계에서 파싱(Parse, don't guess): IPC·외부 응답은 스키마로 좁힌 뒤 안으로 흘린다. `as` 단정·`any` 수용 금지.
- **파일 경로·셸 실행은 main에서만**, 그것도 검증 후에. 사용자 입력으로 경로를 조립하지 않는다.
- **main 프로세스를 막지 않는다**: 동기 I/O·큰 파싱·암호 연산은 워커로. main이 멈추면 모든 창이 멈춘다.
- 강제 수단은 타입 strict + ESLint 경계 규칙 + **게이트의 프로세스 경계 가드**다(`scripts/verify.sh`).
- 디자인 값을 지어내지 않는다. 색·간격·타이포·모션은 토큰에서 고른다.
- 접근성은 사후 보정이 아니다: 시맨틱 요소 우선, 키보드로 도달·조작 가능.
- 주석은 TSDoc 규약 + 기본은 '없음': 공개 API에 한 줄, 더 쓰는 건 Why·함정·외부 근거·억제 이유·복잡한 함수의 절차일 때만.
- 글은 사람이 읽게: 작업 일지(`대조 결과`·`~임을 확인했다`)와 공허한 문장을 쓰지 않는다(`writing-style.md`).
- **기능 구현 시 docs 동시 갱신**: 화면 명세·IPC 채널 계약·상태 전이·에러 표시를 같은 변경에 포함한다.

## 작업 방식 (SDD)

기능은 스펙 단위(requirements → design → tasks):

| 단계 | 위치 | 무엇 |
|---|---|---|
| requirements | `.agents/docs/<slug>-specs/requirements/<feature>.md` (진입 제품 `index.md`) | 무엇을·왜 |
| design | `.agents/docs/<slug>-specs/design/<feature>.md` | 어떻게 |
| tasks | `.agents/docs/<slug>-specs/tasks/active/<feature>.md` | 실행 단계 |

- 복잡 작업은 exec-plan에 계획을 남기고, 변경은 `bash scripts/verify.sh`(포맷·lint·타입·경계 가드·테스트·빌드)로 검증한다.
- 검증 레벨: Stop hook은 `fast`(구조 점검 + 포맷, 수 초)로 돈다. lint·typecheck·가드·test·build까지 도는 `full`은 커밋·푸시 전에 직접 `bash scripts/verify.sh`를 실행해 통과시킨다 — **hook 통과는 full 통과가 아니다**(`.agents/rules/agent-harness.md` 참조).
- **IPC 채널을 추가하면** 채널 목록·계약 문서·preload 화이트리스트·main 핸들러 스키마를 같은 변경에 함께 넣는다.
- **exec-plan 완료 게이트**: DoD/검증 충족 시 `check/`로 옮기고(상태 `check`) 사용자 검증 후에만 `completed/`로 이동한다(임의 이동 금지).
- 기술 부채는 `.agents/docs/tech-debt-tracker.md`에 등록한다.

## 규칙 변경 절차 (드리프트 방지)

규칙/지식이 바뀌면 `.agents/rules/`의 원본을 먼저 고치고, 이 목차(`AGENTS.md`)·`CLAUDE.md`·Kiro 포인터(`.kiro/steering/*`)를 동기화한다. 규칙 본문은 원본 1곳에만 두고 진입 파일은 항상 짧게 유지한다.
