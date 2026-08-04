<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{PROJECT_NAME}}·{{PRODUCT_SLUG}} 치환 후 사용 -->

# .agents/docs — {{PROJECT_NAME}} 기록 시스템 (System of Record)

이 디렉터리는 사람과 AI 에이전트가 함께 읽는 **이 프로젝트의 단일 진실 소스(SSOT)**다.
"에이전트가 컨텍스트에서 볼 수 없는 것은 존재하지 않는다" — 결정·맥락은 문서로 남긴다.

## 하네스 4대 구성요소 ↔ 위치

| 구성요소 | 위치 | 역할 |
|---|---|---|
| 진입 목차(map) | `AGENTS.md` / `CLAUDE.md` | 에이전트 진입·라우팅 (짧게 유지, 상세는 링크만) |
| 기록 시스템(SSOT) | `.agents/docs/` | 결정·설계·계획의 단일 진실 소스 |
| 규칙 정본 | `.agents/rules/*.md` | 작업 유형별 강제 규약 (guardrails·security·api-standards·sdd-workflow 등, 3 에이전트 공유 공통) |
| 검증 게이트 | `scripts/verify.sh` | 빌드·테스트 단일 검증 진입 (CI·pre-commit·hook 공통 호출) |

에이전트별 진입점:

| 에이전트 | 진입점 | 역할 |
|---|---|---|
| 공통/Codex | `AGENTS.md` (+ 정책 설정) | 목차 + 정책 |
| Claude Code | `CLAUDE.md` (+ `.claude/`) | 진입 + 설정·명령(SDD 슬래시 명령 포함)·hook |
| Kiro | `.kiro/steering/*.md` | `.agents/rules` 를 가리키는 얇은 포인터 + 이 기록 시스템 참조 |

**규칙 변경 시: `.agents/rules/`(규칙 정본) 또는 `.agents/docs/`(기록)를 먼저 고치고 진입 파일(map)·steering 포인터를 동기화한다.**

## 구조 (제품 단위 SDD)

```text
AGENTS.md / CLAUDE.md / ARCHITECTURE.md    진입·아키텍처 정본
.agents/docs/
  README.md                이 문서
  specs-index.md           전 제품 스펙 색인(SDD 최상위 진입점)
  product-<slug>-specs/    제품(바운디드 컨텍스트) 단위 SDD 묶음 — 복수 가능
    index.md                 이 제품의 feature 등록표
    requirements/            SDD requirements 단계 (_template.md + <feature>.md)
    design/                  SDD design 단계 (_template.md + <feature>.md)
    tasks/                   SDD tasks 단계 (= 실행 계획, 완료 게이트)
      _template.md · README.md
      active/ · check/ · completed/
  decisions/               전역 설계 결정(ADR) + core-beliefs (제품 횡단)
  tech-debt-tracker.md     전역 기술 부채 추적기
  generated/               에이전트 생성 산출물(손편집 금지)
  references/              압축 참고자료(*-llms.txt)
```

## 점진적 공개 (Progressive Disclosure)

- 진입 파일(`AGENTS.md`/`CLAUDE.md`)은 **목차**다. 상세를 중복 보관하지 않는다.
- "모든 것이 중요하면 아무것도 중요하지 않다" — 핵심 제약만 항상 로드하고, 나머지는 작업 시 링크를 따라 연다.
- 깊이는 `.agents/docs/`(기록)와 `.agents/rules/`(규칙)에 둔다. 각 문서는 자기 주제의 정본이며 다른 곳(진입 파일·steering 포인터)은 요약·포인터만 둔다.

## SDD (Spec-Driven Development)

기능 개발은 **제품 폴더 안에서** 스펙 단위로 진행한다(requirements → design → tasks). 워크플로 정본은 `.agents/rules/sdd-workflow.md`.

| 단계 | 위치 | 명령 |
|---|---|---|
| requirements | `product-<slug>-specs/requirements/<feature>.md` (진입: 제품 `index.md`) | `/hx-specify` (+ `/hx-clarify`) |
| design | `product-<slug>-specs/design/<feature>.md` | `/hx-plan` |
| tasks | `product-<slug>-specs/tasks/active/<feature>.md` → `check/` → `completed/` | `/hx-tasks` → `/hx-implement` |

각 단계 템플릿은 해당 하위 폴더의 `_template.md`. 정합성 점검은 `/hx-analyze`(읽기 전용). 단계별 사용자 승인 후 진행.
전 제품 목록은 `specs-index.md`, 전역 결정은 `decisions/`.

## 신선도 관리 (Freshness)

- 코드가 바뀌면 관련 문서를 **같은 변경에** 갱신한다(드리프트 금지). 죽은 문서는 없는 문서보다 나쁘다.
- design-doc·ADR 상단에 검증 상태(`제안 | 채택 | 폐기`)를 표기한다(`decisions/core-beliefs.md`).
- 정기 정리(doc-gardening·품질 등급 갱신)를 프로세스로 둔다. 작은 빚을 매일 갚는다.

## 검증 게이트

변경은 `scripts/verify.sh`(빌드/테스트 + exec-plan 위치↔상태 일관성) 하나로 검증한다(CI·pre-commit·hook 공통 호출).
