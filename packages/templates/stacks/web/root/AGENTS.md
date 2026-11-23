<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: 웹 프론트엔드(React/TypeScript) 단일 프로젝트 -->

# AGENTS.md — 에이전트 작업 가이드 (목차)

이 파일은 상세를 담는 곳이 아니라 목차다. 규칙 원본은 `.agents/rules/`, 설계·SDD 기록은 `.agents/docs/`에 있다.
Claude Code · Codex · Kiro가 함께 작업한다. 규칙은 `.agents/rules/`, 설계와 기록은 `.agents/docs/`가 기준이고, 진입 파일은 그쪽으로 안내만 한다.

## 먼저 읽을 것 (순서)

1. `AGENTS.md` — 이 목차(지금 파일)
2. `ARCHITECTURE.md` — 이 프로젝트가 **선택한 아키텍처**의 원본(레이아웃·경계 강제 방법·선택 기준·전환 가이드. 새 화면/기능 작업 시 필수)
3. `.agents/rules/` — 규칙 원본(가드레일·보안·API 연동·구조·스택·제품·주석·문체·하네스 + 프론트엔드 공통 4종). 작업 유형에 맞는 파일을 직접 연다.
4. `.agents/docs/` — SDD 기록(<slug>-specs/{requirements,design,tasks}·decisions). 진입 `.agents/docs/README.md`.

## 에이전트 로딩 규칙 (3 에이전트, 원본 1곳)

규칙 본문은 어느 에이전트도 소유하지 않는다. 원본은 `.agents/rules/` 한 곳이고, 각 에이전트 진입 파일은 그 원본으로 유도만 한다.

| 에이전트 | 진입 파일 | 원본 접근 |
|---|---|---|
| Claude Code | `CLAUDE.md` (→ 이 `AGENTS.md` 위임) | `.agents/rules/*` 직접 |
| Codex | 이 `AGENTS.md` + `.codex/config.toml`(리포 정책) | `.agents/rules/*` 직접 |
| Kiro | `.kiro/steering/*.md` (얇은 포인터) | 포인터가 `.agents/rules/*` 원본으로 유도 |

- 어느 에이전트도 `.agents/rules/` 전체가 자동 주입된다고 가정하지 않는다. 작업 시작 시 아래 "규약"의 해당 파일을 직접 연다.
- 모든 코드/문서 변경 전 최소 기준은 `.agents/rules/guardrails.md`다. UI·보안·API 연동 변경은 해당 규칙을 추가로 연다.

## 규약 (반드시 준수 — 원본은 `.agents/rules/`)

| 영역 | 원본 |
|---|---|
| 가드레일(추측 금지·경계 파싱·컴포넌트 책임·주석) | `.agents/rules/guardrails.md` |
| 보안(XSS·CSP·토큰 보관·번들에 secret 금지) | `.agents/rules/security.md` |
| API 연동 표준(경계 파싱·에러 매핑·취소·재시도) | `.agents/rules/api-standards.md` |
| 리포 구조·레이어 경계·ESLint 강제 | `.agents/rules/structure.md` |
| 설계 원칙(응집·결합·의존 방향) | `.agents/rules/design-principles.md` |
| 기술 스택·빌드·실행 | `.agents/rules/tech.md` |
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

- 추측 금지: 확인 후 단정, 미확인은 명시. 파일·컴포넌트·응답 형태는 읽고 말한다. 의존성은 `package.json`에서 확인한다.
- **강제 수단은 두 가지뿐**이다 — 타입 검사(strict)와 ESLint 경계 규칙. 프론트엔드에는 백엔드 같은 컴파일 레벨 레이어 강제가 없다. 규칙에 등록하지 않은 경계는 존재하지 않는 경계다.
- 경계에서 파싱(Parse, don't guess): 외부 응답은 스키마로 파싱해 타입을 좁힌 뒤 안으로 흘린다. `as`로 단정하거나 `any`로 받지 않는다.
- **서버 상태를 클라이언트 스토어로 복사하지 않는다.** 상태는 종류(서버·클라이언트·URL·폼)가 사는 곳을 정한다.
- **디자인 값을 지어내지 않는다**: 색·간격·타이포·모션은 토큰에서 고른다. 없으면 디자인 소스를 확인하고, 거기에도 없으면 묻는다.
- 접근성은 사후 보정이 아니다: 시맨틱 요소 우선, 키보드로 도달·조작 가능, 이름·역할·상태 제공.
- **XSS 차단**: 사용자 입력을 HTML로 주입하지 않는다. `dangerouslySetInnerHTML`은 정제된 값에만, 이유를 주석으로 남긴다.
- **클라이언트 번들에 secret이 없다**: 공개 접두사 환경변수는 브라우저에 그대로 실린다. 비밀은 서버 경로에만 둔다.
- 성능은 예산과 측정으로 다룬다. 측정 없이 메모이제이션을 뿌리지 않는다.
- 주석은 TSDoc 규약 + 기본은 '없음': 공개 API에 한 줄, 더 쓰는 건 Why·함정·외부 근거·억제 이유·복잡한 함수의 절차일 때만.
- 글은 사람이 읽게: 작업 일지(`대조 결과`·`~임을 확인했다`)와 공허한 문장을 쓰지 않는다(`writing-style.md`).
- **기능 구현 시 docs 동시 갱신**: 화면 명세·상태 전이·API 연동·에러 표시를 같은 변경에 포함한다.

## 작업 방식 (SDD)

기능은 스펙 단위(requirements → design → tasks):

| 단계 | 위치 | 무엇 |
|---|---|---|
| requirements | `.agents/docs/<slug>-specs/requirements/<feature>.md` (진입 제품 `index.md`) | 무엇을·왜 |
| design | `.agents/docs/<slug>-specs/design/<feature>.md` | 어떻게 |
| tasks | `.agents/docs/<slug>-specs/tasks/active/<feature>.md` | 실행 단계 |

- 복잡 작업은 exec-plan에 계획을 남기고, 변경은 `bash scripts/verify.sh`(포맷·lint·타입·테스트·빌드)로 검증한다.
- 검증 레벨: Stop hook은 `fast`(구조 점검 + 포맷, 수 초)로 돈다. lint·typecheck·test·build까지 도는 `full`은 커밋·푸시 전에 직접 `bash scripts/verify.sh`를 실행해 통과시킨다 — **hook 통과는 full 통과가 아니다**(`.agents/rules/agent-harness.md` 참조).
- UI 변경은 화면 명세와 상태 목록(loading·empty·error·partial)을 함께 갱신한다.
- **exec-plan 완료 게이트**: DoD/검증 충족 시 `check/`로 옮기고(상태 `check`) 사용자 검증 후에만 `completed/`로 이동한다(임의 이동 금지).
- 기술 부채는 `.agents/docs/tech-debt-tracker.md`에 등록한다.

## 규칙 변경 절차 (드리프트 방지)

규칙/지식이 바뀌면 `.agents/rules/`의 원본을 먼저 고치고, 이 목차(`AGENTS.md`)·`CLAUDE.md`·Kiro 포인터(`.kiro/steering/*`)를 동기화한다. 규칙 본문은 원본 1곳에만 두고 진입 파일은 항상 짧게 유지한다.
