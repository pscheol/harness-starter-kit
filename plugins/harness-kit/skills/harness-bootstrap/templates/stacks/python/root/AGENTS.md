<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Python 백엔드(ASGI) 단일 프로젝트 -->

# AGENTS.md — 에이전트 작업 가이드 (목차)

이 파일은 백과사전이 아니라 **목차(map)**다. 규칙 정본은 `.agents/rules/`, 설계·SDD 기록은 `.agents/docs/`에 있다.
Claude Code · Codex · Kiro가 함께 작업한다. 단일 진실 소스는 **`.agents/rules/`(규칙) + `.agents/docs/`(설계·기록)**이며, 진입 파일은 그 정본으로 유도만 한다.

## 먼저 읽을 것 (순서)

1. `AGENTS.md` — 이 목차(지금 파일)
2. `ARCHITECTURE.md` — 이 프로젝트가 **선택한 아키텍처**의 정본(레이아웃·강제 계약·선택 기준·전환 가이드. 새 도메인/기능 작업 시 필수)
3. `.agents/rules/` — 규칙 정본(가드레일·보안·API·구조·스택·제품·주석·하네스). 작업 유형에 맞는 파일을 직접 연다.
4. `.agents/docs/` — SDD 기록(product-<slug>-specs/{requirements,design,tasks}·decisions). 진입 `.agents/docs/README.md`.

## 에이전트 로딩 규칙 (3 에이전트, 정본 1곳)

규칙 본문은 **어느 에이전트도 소유하지 않는다.** 정본은 `.agents/rules/` 한 곳이고, 각 에이전트 진입 파일은 그 정본으로 유도만 한다.

| 에이전트 | 진입 파일 | 정본 접근 |
|---|---|---|
| Claude Code | `CLAUDE.md` (→ 이 `AGENTS.md` 위임) | `.agents/rules/*` 직접 |
| Codex | 이 `AGENTS.md` + `.codex/config.toml`(리포 정책) | `.agents/rules/*` 직접 |
| Kiro | `.kiro/steering/*.md` (얇은 포인터) | 포인터가 `.agents/rules/*` 정본으로 유도 |

- 어느 에이전트도 `.agents/rules/` 전체가 자동 주입된다고 가정하지 않는다. 작업 시작 시 아래 "규약"의 해당 파일을 직접 연다.
- 모든 코드/문서 변경 전 최소 기준은 `.agents/rules/guardrails.md`다. API·보안·구조 변경은 해당 규칙을 추가로 연다.

## 규약 (반드시 준수 — 정본은 `.agents/rules/`)

| 영역 | 정본 |
|---|---|
| 가드레일(추측 금지·레이어 책임·주석·Python 실수 방지) | `.agents/rules/guardrails.md` |
| 보안·인증/인가 경계·secret·Python 고유 위험 | `.agents/rules/security.md` |
| API 표준(envelope·error code·i18n·인증·OpenAPI) | `.agents/rules/api-standards.md` |
| 리포 구조·패키지 책임·import 계약 | `.agents/rules/structure.md` |
| 기술 스택·빌드·실행 | `.agents/rules/tech.md` |
| 제품·범위·우선순위 | `.agents/rules/product.md` |
| 멀티 에이전트 하네스·SDD·exec-plan 게이트 | `.agents/rules/agent-harness.md` |
| 주석 작성(책임+처리 흐름+Why·타입 반복 금지) | `.agents/rules/code-comments.md` |

## 핵심 가드레일 (요약 — 정본은 위 표)

- **추측 금지**: 확인 후 단정, 미확인은 명시. 파일·함수·스키마는 읽고 말한다. 의존성은 `pyproject.toml`에서 확인한다.
- **경계에서 파싱(Parse, don't guess)**: 외부 입력은 경계에서 Pydantic으로 검증하고 도메인 타입으로 좁혀 안으로 흘린다. `dict`/`Any`를 안쪽으로 넘기지 않는다.
- **권한은 두 곳에서**: 요청 경계(라우터 의존성) 1차 + 유스케이스 진입 2차. 판단 컨텍스트가 없으면 기본 거부. 권한 없는 접근 차단 테스트 필수.
- **Secret 평문 금지**: 자격증명은 해시/암호화 저장 + 발급 시 1회만 원문 반환. 비교는 `hmac.compare_digest`.
- **응답은 공통 envelope**, 도메인은 프레임워크 무의존(import-linter가 강제).
- **async 규약**: `async def` 안 blocking 호출 금지, 외부 호출에 timeout 필수, 참조 없는 `create_task` 금지.
- **주석은 책임+흐름+Why**: 함수 docstring은 책임 한 줄 + `처리 흐름:`(의도를 곁들인 단계) + 비자명한 Why. 타입이 말하는 것을 반복하지 않는다.
- **기능 구현 시 docs 동시 갱신**: 인터페이스·flowchart·sequence·DB/쿼리·캐시·에러 명세를 같은 변경에 포함한다.

## 작업 방식 (SDD)

기능은 스펙 단위(requirements → design → tasks):

| 단계 | 위치 | 무엇 |
|---|---|---|
| requirements | `.agents/docs/product-<slug>-specs/requirements/<feature>.md` (진입 제품 `index.md`) | 무엇을·왜 |
| design | `.agents/docs/product-<slug>-specs/design/<feature>.md` | 어떻게 |
| tasks | `.agents/docs/product-<slug>-specs/tasks/active/<feature>.md` | 실행 단계 |

- 복잡 작업은 exec-plan에 계획을 남기고, 변경은 `bash scripts/verify.sh`(ruff·mypy·lint-imports·pytest)로 검증한다.
- API 변경은 OpenAPI 스냅샷(`.agents/docs/openapi/`)을 함께 갱신한다.
- **exec-plan 완료 게이트**: DoD/검증 충족 시 `check/`로 옮기고(상태 `check`) **사용자 검증 후에만** `completed/`로 이동한다(임의 이동 금지).
- 기술 부채는 `.agents/docs/tech-debt-tracker.md`에 등록한다.

## 규칙 변경 절차 (드리프트 방지)

규칙/지식이 바뀌면 **`.agents/rules/`의 정본을 먼저 고치고**, 이 목차(`AGENTS.md`)·`CLAUDE.md`·Kiro 포인터(`.kiro/steering/*`)를 동기화한다. 규칙 본문은 정본 1곳에만 두고 진입 파일은 항상 짧게 유지한다.
