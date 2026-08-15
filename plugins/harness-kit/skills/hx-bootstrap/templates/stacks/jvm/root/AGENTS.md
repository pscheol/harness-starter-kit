<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Kotlin/Java + Spring Boot(JVM) 단일 프로젝트 -->

# AGENTS.md — 에이전트 작업 가이드 (목차)

이 파일은 상세를 담는 곳이 아니라 목차다. 규칙 원본은 `.agents/rules/`, 설계·SDD 기록은 `.agents/docs/`에 있다.
Claude Code · Codex · Kiro가 함께 작업한다. 규칙은 `.agents/rules/`, 설계와 기록은 `.agents/docs/`가 기준이고, 진입 파일은 그쪽으로 안내만 한다.

## 먼저 읽을 것 (순서)

1. `AGENTS.md` — 이 목차(지금 파일)
2. `ARCHITECTURE.md` — 이 프로젝트가 **선택한 아키텍처**의 원본(레이아웃·강제 계약·선택 기준·전환 가이드. 새 도메인/기능 작업 시 필수)
3. `.agents/rules/` — 규칙 원본(가드레일·보안·API·구조·스택·제품·주석·문체·하네스). 작업 유형에 맞는 파일을 직접 연다.
4. `.agents/docs/` — SDD 기록(<slug>-specs/{requirements,design,tasks}·decisions). 진입 `.agents/docs/README.md`.

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
| 가드레일(추측 금지·레이어 책임·주석) | `.agents/rules/guardrails.md` |
| 보안·인증/인가 경계·secret·JVM 고유 위험 | `.agents/rules/security.md` |
| API 표준(envelope·error code·i18n·인증) | `.agents/rules/api-standards.md` |
| 리포 구조·모듈 책임 | `.agents/rules/structure.md` |
| 설계 원칙(객체지향·클린 아키텍처·SOLID) | `.agents/rules/design-principles.md` |
| 기술 스택·빌드·실행 | `.agents/rules/tech.md` |
| 제품·범위·우선순위 | `.agents/rules/product.md` |
| 멀티 에이전트 하네스·SDD·exec-plan 게이트 | `.agents/rules/agent-harness.md` |
| 주석 작성(기본은 '없음' · Why·함정·절차) | `.agents/rules/code-comments.md` |
| 문체(스펙·주석·커밋 — 사람이 읽는 글) | `.agents/rules/writing-style.md` |
| 재사용 우선(새로 만들기 전 Inventory·판정 근거) | `.agents/rules/reuse-before-new.md` |
| 검증 사다리(L0~L4·생략 기록 의무) | `.agents/rules/verification-ladder.md` |
| 리뷰 정책(자동화 위임·심각도·negative knowledge) | `.agents/rules/pr-review-policy.md` |

## 핵심 가드레일 (요약 — 원본은 위 표)

- 추측 금지: 확인 후 단정, 미확인은 명시. 파일·함수·스키마는 읽고 말한다.
- 경계에서 파싱(Parse, don't guess): 추측한 형태로 빌드하지 않는다. 외부/플랫폼 값은 경계에서 non-null로 좁혀 안으로 흘린다.
- **권한은 두 곳에서**: 요청 경계(Spring Security) 1차 + 유스케이스 진입 2차. 판단 컨텍스트가 없으면 기본 거부. 권한 없는 접근 차단 테스트 필수.
- Secret 평문 금지: 자격증명은 hash/암호화 저장 + 발급 시 1회만 원문 반환.
- **응답은 공통 envelope**, 도메인은 프레임워크 무의존(Gradle 모듈 의존으로 컴파일 강제).
- **주석은 기본이 '없음'**: Why·함정·외부 근거·억제 이유·복잡한 함수의 절차일 때만 쓴다. 단계별 흐름은 분기가 얽히거나 순서가 정합성인 함수에 쓴다.
- **글은 사람이 읽게**: 작업 일지(`대조 결과`·`~임을 확인했다`)와 공허한 문장을 쓰지 않는다(`writing-style.md`).
- **기능 구현 시 docs 동시 갱신**: 인터페이스·flowchart·sequence·DB/쿼리·캐시·에러 명세를 같은 변경에 포함한다.

## 작업 방식 (SDD)

기능은 스펙 단위(requirements → design → tasks):

| 단계 | 위치 | 무엇 |
|---|---|---|
| requirements | `.agents/docs/<slug>-specs/requirements/<feature>.md` (진입 제품 `index.md`) | 무엇을·왜 |
| design | `.agents/docs/<slug>-specs/design/<feature>.md` | 어떻게 |
| tasks | `.agents/docs/<slug>-specs/tasks/active/<feature>.md` | 실행 단계 |

- 복잡 작업은 exec-plan에 계획을 남기고, 변경은 `bash scripts/verify.sh`(= exec-plan 점검 + `./gradlew check`)로 검증한다.
- 검증 레벨: Stop hook은 `fast`(구조 점검만, 수 초)로 돈다. 빌드·테스트를 포함한 `full`은 커밋·푸시 전에 직접 `bash scripts/verify.sh`를 실행해 통과시킨다 — **hook 통과는 full 통과가 아니다**(`.agents/rules/agent-harness.md` 참조).
- API 변경은 `.agents/docs/openapi/`를 함께 갱신한다.
- **exec-plan 완료 게이트**: DoD/검증 충족 시 `check/`로 옮기고(상태 `check`) 사용자 검증 후에만 `completed/`로 이동한다(임의 이동 금지).
- 기술 부채는 `.agents/docs/tech-debt-tracker.md`에 등록한다.

## 규칙 변경 절차 (드리프트 방지)

규칙/지식이 바뀌면 `.agents/rules/`의 원본을 먼저 고치고, 이 목차(`AGENTS.md`)·`CLAUDE.md`·Kiro 포인터(`.kiro/steering/*`)를 동기화한다. 규칙 본문은 원본 1곳에만 두고 진입 파일은 항상 짧게 유지한다.
