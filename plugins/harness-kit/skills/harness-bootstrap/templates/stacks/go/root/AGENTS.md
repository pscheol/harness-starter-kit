<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Go 백엔드 단일 프로젝트 -->

# AGENTS.md — 에이전트 작업 가이드 (목차)

이 파일은 상세를 담는 곳이 아니라 목차다. 규칙 원본은 `.agents/rules/`, 설계·SDD 기록은 `.agents/docs/`에 있다.
Claude Code · Codex · Kiro가 함께 작업한다. 규칙은 `.agents/rules/`, 설계와 기록은 `.agents/docs/`가 기준이고, 진입 파일은 그쪽으로 안내만 한다.

## 먼저 읽을 것 (순서)

1. `AGENTS.md` — 이 목차(지금 파일)
2. `ARCHITECTURE.md` — 표준 Go 레이아웃 + 이 프로젝트가 **선택한 아키텍처**의 원본(레이아웃·강제 규칙·선택 기준·전환 가이드. 새 도메인/기능 작업 시 필수)
3. `.agents/rules/` — 규칙 원본(가드레일·보안·API·구조·스택·제품·주석·하네스). 작업 유형에 맞는 파일을 직접 연다.
4. `.agents/docs/` — SDD 기록(product-<slug>-specs/{requirements,design,tasks}·decisions). 진입 `.agents/docs/README.md`.

## 에이전트 로딩 규칙 (3 에이전트, 원본 1곳)

규칙 본문은 어느 에이전트도 소유하지 않는다. 원본은 `.agents/rules/` 한 곳이고, 각 에이전트 진입 파일은 그 원본으로 유도만 한다.

| 에이전트 | 진입 파일 | 원본 접근 |
|---|---|---|
| Claude Code | `CLAUDE.md` (→ 이 `AGENTS.md` 위임) | `.agents/rules/*` 직접 |
| Codex | 이 `AGENTS.md` + `.codex/config.toml`(리포 정책) | `.agents/rules/*` 직접 |
| Kiro | `.kiro/steering/*.md` (얇은 포인터) | 포인터가 `.agents/rules/*` 원본으로 유도 |

- 어느 에이전트도 `.agents/rules/` 전체가 자동 주입된다고 가정하지 않는다. 작업 시작 시 아래 "규약"의 해당 파일을 직접 연다.
- 모든 코드/문서 변경 전 최소 기준은 `.agents/rules/guardrails.md`다. API·보안·구조 변경은 해당 규칙을 추가로 연다.

## 규약 (반드시 준수 — 원본은 `.agents/rules/`)

| 영역 | 원본 |
|---|---|
| 가드레일(추측 금지·레이어 책임·주석·Go 실수 방지) | `.agents/rules/guardrails.md` |
| 보안·인증/인가 경계·secret·Go 고유 위험 | `.agents/rules/security.md` |
| API 표준(envelope·error code·i18n·인증·OpenAPI·서버 타임아웃) | `.agents/rules/api-standards.md` |
| 리포 구조(표준 Go 레이아웃)·패키지 책임·depguard | `.agents/rules/structure.md` |
| 기술 스택·빌드·실행 | `.agents/rules/tech.md` |
| 제품·범위·우선순위 | `.agents/rules/product.md` |
| 멀티 에이전트 하네스·SDD·exec-plan 게이트 | `.agents/rules/agent-harness.md` |
| 주석 작성(Go doc 규약+책임+처리 흐름+Why) | `.agents/rules/code-comments.md` |

## 핵심 가드레일 (요약 — 원본은 위 표)

- 추측 금지: 확인 후 단정, 미확인은 명시. 파일·함수·스키마는 읽고 말한다. 의존성은 `go.mod`에서 확인한다.
- 경계에서 파싱(Parse, don't guess): 외부 입력은 경계에서 DTO로 디코딩하고 도메인 타입으로 좁혀 안으로 흘린다. `map[string]any`를 안쪽으로 넘기지 않는다.
- 에러는 값이다: 모든 error를 처리하거나 `%w`로 래핑해 반환한다. 삼키지 않는다. panic으로 흐름을 제어하지 않는다.
- **context 전파**: 모든 I/O 경로에 `ctx`를 넘긴다. 타임아웃·취소가 닿아야 자원이 회수된다.
- **고루틴 소유권**: 소유자와 종료 조건 없는 고루틴을 만들지 않는다. 팬아웃에는 상한을 둔다.
- **권한은 두 곳에서**: 요청 경계(미들웨어) 1차 + 유스케이스 진입 2차. 판단 컨텍스트가 없으면 기본 거부. 권한 없는 접근 차단 테스트 필수.
- Secret 평문 금지: 해시/암호화 저장 + 발급 시 1회만 원문 반환. 비교는 `subtle.ConstantTimeCompare`, 난수는 `crypto/rand`.
- **응답은 공통 envelope**, 도메인은 프레임워크 무의존(depguard가 강제).
- 주석은 Go doc 규약 + 책임+흐름+Why: 선언 이름으로 시작, 책임 한 줄 + `처리 흐름:`(의도를 곁들인 단계).
- **기능 구현 시 docs 동시 갱신**: 인터페이스·flowchart·sequence·DB/쿼리·캐시·에러 명세를 같은 변경에 포함한다.

## 작업 방식 (SDD)

기능은 스펙 단위(requirements → design → tasks):

| 단계 | 위치 | 무엇 |
|---|---|---|
| requirements | `.agents/docs/product-<slug>-specs/requirements/<feature>.md` (진입 제품 `index.md`) | 무엇을·왜 |
| design | `.agents/docs/product-<slug>-specs/design/<feature>.md` | 어떻게 |
| tasks | `.agents/docs/product-<slug>-specs/tasks/active/<feature>.md` | 실행 단계 |

- 복잡 작업은 exec-plan에 계획을 남기고, 변경은 `bash scripts/verify.sh`(fmt·build·vet·lint·race 테스트)로 검증한다.
- API 변경은 `api/`의 OpenAPI 스펙과 `.agents/docs/openapi/`를 함께 갱신한다.
- **exec-plan 완료 게이트**: DoD/검증 충족 시 `check/`로 옮기고(상태 `check`) 사용자 검증 후에만 `completed/`로 이동한다(임의 이동 금지).
- 기술 부채는 `.agents/docs/tech-debt-tracker.md`에 등록한다.

## 규칙 변경 절차 (드리프트 방지)

규칙/지식이 바뀌면 `.agents/rules/`의 원본을 먼저 고치고, 이 목차(`AGENTS.md`)·`CLAUDE.md`·Kiro 포인터(`.kiro/steering/*`)를 동기화한다. 규칙 본문은 원본 1곳에만 두고 진입 파일은 항상 짧게 유지한다.
