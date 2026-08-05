<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 스택 무관 공통 규칙 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 하네스 규약 (단일 프로젝트)

{{PROJECT_NAME}} 하네스의 최상위 규약을 담은 원본이다.
하네스는 에이전트(Kiro · Claude Code · Codex)가 안전하고 예측 가능하게 일하도록 리포에 얹어두는 제어 구조다.

여기 있는 규칙은 스택을 가리지 않는다. 빌드 명령이나 디렉터리 레이아웃, 언어별 주석처럼
스택에 묶이는 규약은 `tech.md`·`structure.md`·`code-comments.md`가 맡고, 문체는 `writing-style.md`가 맡는다.

이 리포는 하네스를 하나만 둔다. 서비스마다 하네스를 따로 두거나 루트와 서비스로 2계층을 나누지 않는다.
모노레포가 커지면 그때 따로 설계하면 되고, 지금 필요하지 않은 구조를 미리 만들지 않는다.

## 계층 (세 폴더의 역할)

| 폴더 | 역할 | 원본 여부 |
|---|---|---|
| `.agents/` | 규칙과 기록이 모이는 루트 | ✅ |
| `.agents/rules/` | **공통 규칙 원본**(이 파일 포함). 3 에이전트가 공유하는 헌법·규약 | ✅ 원본 |
| `.agents/docs/` | 기록/SDD 시스템(설계·제품 스펙·실행 계획·결정 로그·생성물·참고) | ✅ 원본(기록) |

- 규칙(rules)은 항상 지켜야 하는 규범이다. 추측 금지, 레이어 책임, 보안, API 표준 같은 것들이며 `.agents/rules/`에 둔다.
- 기록(docs)은 그때그때의 설계와 계획, 결정, 명세다. `.agents/docs/`에 둔다.
- 둘을 섞지 않는다. 규칙은 오래 살아남고, 기록은 특정 작업이나 기능에서 나온 결과물이다.

> 컨텍스트에 들어오지 않은 내용은 에이전트에게 없는 것과 같다. 결정과 배경, 규칙은 반드시 문서로 남긴다.
> 진입 파일(AGENTS.md·CLAUDE.md·kiro 포인터)은 목차일 뿐이라 상세를 여기에 또 적지 않는다.

## 에이전트별 진입점 → 공통 원본

세 에이전트는 서로 다른 파일로 시작하지만 결국 `.agents/rules/`의 같은 원본을 본다.

| 에이전트 | 진입 파일 | 원본 연결 방식 |
|---|---|---|
| Claude Code | `/CLAUDE.md` | → `/AGENTS.md`로 위임, `.agents/rules/` 참조 + `.claude/`(settings·commands·hook) |
| Codex | `/AGENTS.md` | 목차 → `.agents/rules/` 참조 + `.codex/config.toml`(리포 정책) |
| Kiro | `.kiro/steering/*.md` | **얇은 포인터**(항상 로드) → `.agents/rules/`의 해당 원본으로 위임 |

- Kiro steering은 규칙을 복제하지 않는다. `inclusion: always`로 로드되는 얇은 파일이 "원본은 `.agents/rules/<file>.md`"라고 알려주기만 한다.
- Claude Code와 Codex는 `.kiro/`가 자동으로 주입된다고 가정하지 않는다. 작업을 시작할 때 `.agents/rules/`에서 필요한 파일을 직접 연다.
- 어떤 변경이든 최소한 [`guardrails.md`](./guardrails.md)는 보고 시작한다.

## 규칙 원본 목록 (`.agents/rules/`)

| 파일 | 무엇 |
|---|---|
| [`agent-harness.md`](./agent-harness.md) | 이 파일. 하네스 규약·완료 게이트·강제 레이어·규칙 변경 절차 |
| [`sdd-workflow.md`](./sdd-workflow.md) | SDD 워크플로 원본(specify→clarify→plan→tasks→analyze→implement)·문서 위치·게이트 |
| [`guardrails.md`](./guardrails.md) | 행동 헌법(추측 금지) + 주석 규약 요약 + DDD 레이어 책임 |
| [`security.md`](./security.md) | 인증/인가 경계 · 접근 제어 이중 방어선 · secret 처리 · 언어별 고유 위험 · 감사 |
| [`api-standards.md`](./api-standards.md) | 응답 envelope · ErrorCode 매핑 · 예외 변환 · OpenAPI 문서화 |
| [`structure.md`](./structure.md) | 헥사고날 레이아웃 · 패키지/디렉터리 컨벤션 · 새 도메인 착수 |
| [`tech.md`](./tech.md) | 스택 예시(버전은 프로젝트 확정) · 빌드/실행 명령 · 의존성 단일 소스 · 포트 규약 |
| [`product.md`](./product.md) | 제품 정체성·목표·범위·원칙·우선순위·KPI(채우기 템플릿) |
| [`code-comments.md`](./code-comments.md) | 주석 표준(기본은 '없음' — Why·함정만) · 프로젝트 언어별 예시 |
| [`writing-style.md`](./writing-style.md) | 문체 — 스펙·주석·커밋·리포트를 사람이 읽게 쓰는 규칙 |
| [`reliability.md`](./reliability.md) | timeout·retry·서킷브레이커 · 멱등성 · fail-closed · 성능 예산 |
| [`quality-score.md`](./quality-score.md) | 코드 품질 · Story/Epic DoD · 검증 절차 |

## 기록/SDD 시스템 = `.agents/docs/`

기능은 스펙 단위로 다룬다(SDD: requirements → design → tasks).

| 단계 | 위치 |
|---|---|
| requirements | `.agents/docs/product-<slug>-specs/requirements/<feature>.md` (진입 제품 `index.md`) |
| design | `.agents/docs/product-<slug>-specs/design/<feature>.md` (핵심 원칙은 `.agents/docs/decisions/core-beliefs.md`) |
| tasks(실행 계획) | `.agents/docs/product-<slug>-specs/tasks/active/<feature>.md` |

- `generated/`(에이전트가 만드는 문서, 손편집 금지)와 `references/`(압축 참고자료)는 스펙 단계가 아니라 보조 레이어다.
- 기술 부채는 발견하는 대로 `.agents/docs/tech-debt-tracker.md`에 등록하고 미루지 않는다.

## exec-plan 완료 게이트 (사용자 검증 필수)

상태 전이: `active/` → `check/` → `completed/`.

- 복잡한 작업은 착수 전에 `.agents/docs/product-<slug>-specs/tasks/active/<feature>.md`에 계획을 남기고 진행한다.
- DoD와 verify를 충족했다고 해서 바로 `completed/`로 옮기지 않는다. 상태를 `check`로 바꿔 `check/`로 옮기고,
  무엇을 어떻게 확인했는지 요약해 사용자에게 검증을 요청한다.
- 사용자가 명시적으로 승인한 뒤에만 `completed`로 바꾸고 `completed/`로 옮긴다.
- 위치와 상태가 어긋나지 않는지는 `scripts/check-exec-plan-status.sh`가 검사한다.

## 강제 레이어 분리 (문서는 부탁, 스크립트는 강제)

문서와 규칙은 지켜달라는 부탁이고, 스크립트와 hook과 CI는 실제로 막는 장치다. 둘을 구분한다.

1. 어디서나 통하는 강제(모든 에이전트와 사람 공통): `scripts/verify.sh`(스택별 빌드·린트·타입·테스트를 묶은 원본),
   git pre-commit hook, CI 워크플로, 커스텀 린터, 아키텍처 구조 테스트, 스키마 검증.
   강제 로직은 `scripts/verify.sh` 한 곳에만 둔다.
2. **에이전트별 가속기(이식 불가)**: Kiro Hooks, Claude hooks/skills, Codex config.
   로직을 복제하지 말고 `scripts/verify.sh`를 호출하는 얇은 트리거로만 만든다.

원칙은 간단하다. 강제 로직은 `scripts/verify.sh` 한 곳, 트리거는 여러 개.
각 에이전트 설정에 검증 로직을 복붙하지 않는다.

### 검증 레벨 — 트리거마다 무게가 다르다

게이트는 하나지만, 부르는 쪽의 실행 빈도가 다르므로 `HARNESS_VERIFY_LEVEL`로 범위를 나눈다.

| 레벨 | 범위 | 쓰는 트리거 | 대략 소요 |
|---|---|---|---|
| `fast` | 구조 점검(exec-plan 상태) + 프로세스 기동이 싼 정적 검사 | 에이전트 Stop hook | 수 초 이내 |
| `full` (기본) | fast + 컴파일·타입·테스트·커버리지·DB 게이트 | pre-commit(pre-push), CI, 사람이 직접 실행 | 수 분 |

Stop hook은 **에이전트가 턴을 마칠 때마다** 실행된다. 여기에 전체 빌드·테스트를 걸면 두 가지가 깨진다.
앞 실행이 끝나기 전에 다음 실행이 겹쳐 빌드 도구 lock 경합으로 무한 대기에 빠지고,
정상일 때조차 응답마다 수 분을 기다리게 된다. 그래서 hook은 `fast`만 쓴다.
**커밋·푸시 전에는 `bash scripts/verify.sh`를 직접 실행해 `full`을 통과시켜야 한다** — hook 통과는 full 통과가 아니다.

- 변경했으면 항상 `scripts/verify.sh`로 검증하고(기본 `full`) 결과를 함께 제시한다.
- 레이어 의존 방향 같은 아키텍처 불변식은 문서로 부탁하지 말고 도구가 막게 한다
  ([`structure.md`](./structure.md)·[`tech.md`](./tech.md) 참조). 강제 수단은 스택마다 다르다
  (빌드 모듈 그래프, import 계약 린터, 아키텍처 테스트). 기계가 막는 위반은 리뷰 가드보다 우선한다.

## 규칙 변경 절차 (내용이 어긋나지 않게)

규칙이나 지식이 바뀌면 순서를 지킨다.

1. `.agents/rules/`의 원본을 먼저 고친다. 규칙은 여기가 유일한 출처다.
2. `AGENTS.md`·`CLAUDE.md`·`.kiro/steering/`의 얇은 포인터를 원본에 맞춘다. 내용을 복제하지 말고 링크나 한 줄 요약만 둔다.
3. 진입 파일은 계속 짧게 유지한다. 거대한 지침 파일 하나를 만들지 않는다.
4. 규칙이 아니라 특정 기능의 설계나 계획이면 `.agents/rules/`가 아니라 `.agents/docs/`에 기록한다.

## 앞으로 강화할 것

- 아키텍처 불변식은 문서 대신 커스텀 린터나 구조 테스트로 옮겨 기계가 막게 한다.
- 문서가 최신인지는 CI에서 검사한다.
- 이것들이 갖춰지기 전까지는 리뷰와 이 규약으로 일관성을 유지한다.
