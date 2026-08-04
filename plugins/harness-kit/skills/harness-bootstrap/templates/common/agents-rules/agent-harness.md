<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 스택 무관 공통 규칙 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 하네스 규약 (단일 프로젝트)

이 파일은 **{{PROJECT_NAME}} 하네스의 최상위 규약 정본**이다.
하네스는 AI 에이전트(Kiro · Claude Code · Codex)가 안전하고 예측 가능하게 일하도록 리포에 "장착"하는 제어 구조다.

규칙 본문은 스택에 중립적이다. 스택 종속 규약(빌드 명령·레이아웃·언어별 주석)은 `tech.md`·`structure.md`·`code-comments.md` 정본이 담당한다.

이 리포는 **단일 프로젝트 하네스**다. 하나의 리포 = 하나의 하네스이며, 서비스별 자족(self-contained) 하네스나
루트↔서비스 2계층 개념은 두지 않는다(모노레포가 커지면 그때 별도로 설계한다 — 지금은 YAGNI).

## 계층 (세 폴더의 역할)

| 폴더 | 역할 | 정본 여부 |
|---|---|---|
| `.agents/` | 단일 진실 소스(SSOT). 규칙 정본 + 기록/설계 시스템의 루트 | ✅ |
| `.agents/rules/` | **공통 규칙 정본**(이 파일 포함). 3 에이전트가 공유하는 헌법·규약 | ✅ 정본 |
| `.agents/docs/` | 기록/SDD 시스템(설계·제품 스펙·실행 계획·결정 로그·생성물·참고) | ✅ 정본(기록) |

- **규칙(rules)** = 항상 지켜야 하는 헌법·규약(추측 금지·레이어 책임·보안·API 표준 등). 위치는 `.agents/rules/`.
- **기록(docs)** = 그때그때의 설계·계획·결정·명세. 위치는 `.agents/docs/`.
- 규칙과 기록을 섞지 않는다. 규칙은 오래 사는 규범, 기록은 특정 작업/기능의 산출물이다.

> "에이전트가 컨텍스트에서 볼 수 없는 것은 존재하지 않는다." 결정·맥락·규칙은 반드시 문서로 남긴다.
> 진입 파일(AGENTS.md·CLAUDE.md·kiro 포인터)은 **목차(map)**일 뿐, 상세를 중복 보관하지 않는다.

## 에이전트별 진입점 → 공통 정본

3개 에이전트는 서로 다른 진입 파일로 시작하지만, **모두 `.agents/rules/`의 이 정본을 가리킨다**(규칙은 한 곳에만).

| 에이전트 | 진입 파일 | 정본 연결 방식 |
|---|---|---|
| Claude Code | `/CLAUDE.md` | → `/AGENTS.md`로 위임, `.agents/rules/` 참조 + `.claude/`(settings·commands·hook) |
| Codex | `/AGENTS.md` | 목차 → `.agents/rules/` 참조 + `.codex/config.toml`(리포 정책) |
| Kiro | `.kiro/steering/*.md` | **얇은 포인터**(항상 로드) → `.agents/rules/`의 해당 정본으로 위임 |

- Kiro steering은 규칙을 **복제하지 않는다**. `inclusion: always` 로 로드되는 얇은 파일이 "정본은 `.agents/rules/<file>.md`"라고 가리키기만 한다.
- Claude Code·Codex는 `.kiro/`가 자동 주입된다고 가정하지 않는다. 작업 시작 시 이 정본(`.agents/rules/`) 중 필요한 파일을 직접 열어 확인한다.
- **모든 변경 전 최소 기준은 [`guardrails.md`](./guardrails.md)**다.

## 규칙 정본 목록 (`.agents/rules/`)

| 파일 | 무엇 |
|---|---|
| [`agent-harness.md`](./agent-harness.md) | 이 파일. 하네스 규약·SSOT·완료 게이트·강제 레이어·규칙 변경 절차 |
| [`sdd-workflow.md`](./sdd-workflow.md) | SDD 워크플로 정본(specify→clarify→plan→tasks→analyze→implement)·산출 위치·게이트 |
| [`guardrails.md`](./guardrails.md) | 행동 헌법(추측 금지) + 주석 규약 요약 + DDD 레이어 책임 |
| [`security.md`](./security.md) | 인증/인가 경계 · 접근 제어 이중 방어선 · secret 처리 · 언어별 고유 위험 · 감사 |
| [`api-standards.md`](./api-standards.md) | 응답 envelope · ErrorCode 매핑 · 예외 변환 · OpenAPI 문서화 |
| [`structure.md`](./structure.md) | 헥사고날 레이아웃 · 패키지/디렉터리 컨벤션 · 새 도메인 착수 |
| [`tech.md`](./tech.md) | 스택 예시(버전은 프로젝트 확정) · 빌드/실행 명령 · 의존성 단일 소스 · 포트 규약 |
| [`product.md`](./product.md) | 제품 정체성·목표·범위·원칙·우선순위·KPI(채우기 템플릿) |
| [`code-comments.md`](./code-comments.md) | 주석 표준(책임+Why+처리 흐름) · 프로젝트 언어별 예시 |
| [`reliability.md`](./reliability.md) | timeout·retry·서킷브레이커 · 멱등성 · fail-closed · 성능 예산 |
| [`quality-score.md`](./quality-score.md) | 코드 품질 · Story/Epic DoD · 검증 절차 |

## 기록/SDD 시스템 = `.agents/docs/`

기능은 스펙 단위로 다룬다(SDD: requirements → design → tasks).

| 단계 | 위치 |
|---|---|
| requirements | `.agents/docs/product-<slug>-specs/requirements/<feature>.md` (진입 제품 `index.md`) |
| design | `.agents/docs/product-<slug>-specs/design/<feature>.md` (핵심 신념은 `.agents/docs/decisions/core-beliefs.md`) |
| tasks(실행 계획) | `.agents/docs/product-<slug>-specs/tasks/active/<feature>.md` |

- `generated/`(에이전트 생성물·손편집 금지)·`references/`(압축 참고자료)는 보조 레이어(스펙 단계 아님).
- 기술 부채는 `.agents/docs/tech-debt-tracker.md`에 등록한다(고금리 대출은 즉시 상환).

## exec-plan 완료 게이트 (사용자 검증 필수)

상태 전이: **`active/` → `check/` → `completed/`**.

- 복잡한 작업은 착수 전 `.agents/docs/product-<slug>-specs/tasks/active/<feature>.md`에 계획을 남기고 진행한다.
- DoD/verify 충족 시 **임의로 `completed/`로 옮기지 않는다.** 상태를 `check`로 바꿔 `check/`로 이동하고, 검증 근거를 요약해 **사용자 검증을 요청**한다.
- **사용자가 명시 승인(confirm)한 뒤에만** `completed`로 바꿔 `completed/`로 이동한다.
- 위치↔상태 일관성은 `scripts/check-exec-plan-status.sh`로 검사한다.

## 강제 레이어 분리 (문서=부탁 vs 스크립트=강제)

문서·규칙은 "부탁"이고, 스크립트·hook·CI는 "물리적 강제"다. 둘을 구분한다.

1. **이식 가능한 정본 강제 (모든 에이전트+사람 공통)**: `scripts/verify.sh`(스택별 빌드·린트·타입·테스트 게이트를 묶은 정본), git pre-commit hook, CI 워크플로, 커스텀 린터, 아키텍처 구조 테스트, 스키마 검증. **강제 로직은 `scripts/verify.sh` 한 곳에만 둔다.**
2. **에이전트별 가속기 (이식 불가)**: Kiro Hooks, Claude hooks/skills, Codex config. → 로직을 복제하지 않고 **`scripts/verify.sh`를 호출하는 얇은 트리거**로만 만든다.

원칙: **"1곳(`scripts/verify.sh`) + N개 트리거"**. 강제 로직을 각 에이전트 설정에 복붙하지 않는다.

- 변경은 항상 `scripts/verify.sh`로 검증한 뒤 결과를 제시한다.
- 아키텍처 불변식(레이어 의존 방향)은 문서보다 **도구가 기계적으로 강제**한다([`structure.md`](./structure.md)·[`tech.md`](./tech.md) 참조). 강제 수단은 스택마다 다르다(빌드 모듈 그래프 · import 계약 린터 · 아키텍처 테스트). 기계가 막는 위반은 리뷰 가드보다 우선한다.

## 규칙 변경 절차 (드리프트 방지)

규칙/지식이 바뀌면 반드시 순서를 지킨다:

1. **`.agents/rules/`의 정본을 먼저 고친다.** (규칙은 여기가 단일 소스)
2. `AGENTS.md`·`CLAUDE.md`·`.kiro/steering/`의 얇은 포인터를 정본과 동기화한다(내용 복제 금지, 링크/한 줄 요약만).
3. 진입 파일은 항상 짧게 유지한다(거대 단일 지침 금지).
4. 규칙이 아니라 특정 기능의 설계/계획이면 `.agents/rules/`가 아니라 `.agents/docs/`에 기록한다.

## 점진적 강화 (추후)

- 아키텍처 불변식은 문서보다 커스텀 린터/구조 테스트로 기계적 강제한다.
- 문서 신선도는 CI(doc-gardening)로 검사한다.
- 이들이 갖춰지기 전까지는 리뷰와 이 규약으로 일관성을 유지한다.
