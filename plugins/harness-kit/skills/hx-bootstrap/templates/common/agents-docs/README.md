<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}) -->

# .agents/docs — {{PROJECT_NAME}} 기록 시스템

사람과 에이전트가 같이 읽는 문서를 모아두는 곳이다. 이 프로젝트에서 결정과 설계의 기준이 되는 기록은
여기 있는 것뿐이다. 에이전트는 컨텍스트에 들어온 것만 알기 때문에, 남기지 않은 결정은 없는 것과 같다.

## 하네스 4대 구성요소 ↔ 위치

| 구성요소 | 위치 | 역할 |
|---|---|---|
| 진입 목차(map) | `AGENTS.md` / `CLAUDE.md` | 에이전트 진입·라우팅 (짧게 유지, 상세는 링크만) |
| 기록 시스템 | `.agents/docs/` | 결정·설계·계획이 모이는 곳 |
| 규칙 원본 | `.agents/rules/*.md` | 작업 유형별 강제 규약 (guardrails·security·api-standards·sdd-workflow 등, 3 에이전트 공유 공통) |
| 검증 게이트 | `scripts/verify.sh` | 빌드·테스트 단일 검증 진입 (CI·pre-commit·hook 공통 호출) |

에이전트별 진입점:

| 에이전트 | 진입점 | 역할 |
|---|---|---|
| 공통/Codex | `AGENTS.md` (+ 정책 설정) | 목차 + 정책 |
| Claude Code | `CLAUDE.md` (+ `.claude/`) | 진입 + 설정·명령(SDD 슬래시 명령 포함)·hook |
| Kiro | `.kiro/steering/*.md` | `.agents/rules` 를 가리키는 얇은 포인터 + 이 기록 시스템 참조 |

규칙을 바꿀 때는 `.agents/rules/`(규칙)나 `.agents/docs/`(기록)를 먼저 고치고,
그다음 진입 파일과 steering 포인터를 맞춘다.

## 구조 (제품 단위 SDD)

```text
AGENTS.md / CLAUDE.md / ARCHITECTURE.md    진입·아키텍처 원본
.agents/docs/
  README.md                이 문서
  specs-index.md           전 제품 스펙 색인(SDD 최상위 진입점)
  _spec-templates/         SDD 단계 템플릿 — 복사해서 쓰는 원본 한 벌(제품 아님, 설치 시 생성)
    index.md · requirements/_template.md · design/_template.md
    checklists/_template.md · tasks/{_template.md, README.md}
  <slug>-specs/    제품(바운디드 컨텍스트) 단위 SDD 묶음 — 복수 가능
                           설치가 아니라 new-feature.sh 가 첫 기능에서 만든다
    index.md                 이 제품의 feature 등록표
    requirements/            SDD requirements 단계 (<feature>.md)
    design/                  SDD design 단계 (<feature>.md)
    checklists/              요구사항 품질 판정 (<feature>-<도메인>.md)
    tasks/                   SDD tasks 단계 (= 실행 계획, 완료 게이트)
      README.md
      active/ · check/ · completed/
  decisions/               전역 설계 결정(ADR) + core-beliefs (제품 횡단)
  tech-debt-tracker.md     전역 기술 부채 추적기
  generated/               에이전트가 만드는 문서(손편집 금지)
  references/              압축 참고자료(*-llms.txt)
```

## 필요한 만큼만 열어보게 한다

- 진입 파일(`AGENTS.md`/`CLAUDE.md`)은 목차다. 상세를 여기에 또 적지 않는다.
- 전부 중요하다고 표시하면 무엇이 중요한지 알 수 없다. 핵심 제약만 항상 로드하고
  나머지는 작업할 때 링크를 따라 연다.
- 깊이 있는 내용은 `.agents/docs/`(기록)와 `.agents/rules/`(규칙)에 둔다. 각 문서가 자기 주제의 기준이고,
  진입 파일이나 steering 포인터에는 요약과 링크만 남긴다.

## SDD (Spec-Driven Development)

기능 개발은 제품 폴더 안에서 스펙 단위로 진행한다(requirements → design → tasks).
워크플로 원본은 `.agents/rules/sdd-workflow.md`에 있다.

| 단계 | 위치 | 명령 | 파일이 생기는 시점 |
|---|---|---|---|
| requirements | `<slug>-specs/requirements/<feature>.md` (진입: 제품 `index.md`) | `/hx-specify` (+ `/hx-clarify`) | `new-feature.sh <slug> <feature>` |
| design | `<slug>-specs/design/<feature>.md` | `/hx-plan` | `... --stage=design` |
| tasks | `<slug>-specs/tasks/active/<feature>.md` → `check/` → `completed/` | `/hx-tasks` → `/hx-implement` | `... --stage=tasks` |

단계 템플릿은 `_spec-templates/` 한 곳에만 두고 제품 폴더로 복사하지 않는다.
제품 폴더는 `scripts/new-feature.sh <slug> <feature>`가 첫 기능을 만들 때 생성한다.
**단계 문서도 그 단계에 들어갈 때 하나씩 만든다** — 빈 design·tasks 를 미리 깔면 보드가 곧장
🔨 구현으로 뛰고 단계 게이트가 항상 통과한다(예외: 설계가 확정된 소규모 작업의 `--all`).
정합성 점검은 `/hx-analyze`로 하며 읽기 전용이다. 각 단계는 사용자 승인을 받고 다음으로 넘어간다.
전체 제품 목록은 `specs-index.md`, 제품을 가로지르는 결정은 `decisions/`에 있다.

## 문서를 최신으로 유지하기

- 코드가 바뀌면 관련 문서를 같은 변경에서 함께 고친다. 내용이 어긋난 문서는 없느니만 못하다.
- design-doc과 ADR 상단에는 검증 상태(`제안 | 채택 | 폐기`)를 적는다(`decisions/core-beliefs.md`).
- 문서 정리와 품질 등급 갱신은 생각날 때가 아니라 정기 작업으로 돌린다.

## 검증 게이트

변경은 `scripts/verify.sh` 하나로 검증한다. 빌드와 테스트, exec-plan의 위치와 상태가 맞는지까지
여기서 확인하며 CI·pre-commit·hook이 모두 이 스크립트를 호출한다.
