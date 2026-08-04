<!-- HARNESS STARTER KIT · 제품 스펙 색인. {{FEATURE_NAME}}·{{EPIC_ID}} 는 스펙 작성 시 채운다.
     원본 템플릿은 .agents/docs/_spec-templates/index.md (new-feature.sh 가 복사·치환한다). -->

# 제품 스펙 색인 — `product-{{PRODUCT_SLUG}}` (SDD 진입점)

이 폴더는 **하나의 제품/바운디드 컨텍스트(`{{PRODUCT_SLUG}}`)의 SDD 묶음**이다.
한 제품의 requirements → design → tasks 를 **한곳에** 모은다(스테이지별로 흩지 않는다).

| SDD 단계 | 이 제품 안 위치 | 내용 |
|---|---|---|
| requirements | `requirements/<feature>.md` | 사용자 스토리 + EARS 수용 기준 (무엇을/왜) |
| (품질) | `checklists/<feature>-<도메인>.md` | 요구사항의 "유닛테스트" — 완결·명료·일관·측정·커버 판정 (`/hx-checklist`) |
| design | `design/<feature>.md` | 아키텍처·컴포넌트·데이터·오류·테스트·정확성 속성 (어떻게) |
| tasks | `tasks/active/<feature>.md` | 실행 가능한 작업 체크리스트 (요구사항 추적) |

> 세 단계는 **같은 `<feature>` 파일명**을 써서 서로 추적한다(예: `requirements/order.md` ↔ `design/order.md` ↔ `tasks/active/order.md`).
> 전역(제품 횡단) 결정·핵심 신념은 이 폴더가 아니라 `../../decisions/` 에 둔다.

## 워크플로 (단계별 승인)

```
requirements/<feature>.md   (EARS + 우선순위 스토리) → 승인
→ (checklists/<feature>-<도메인>.md  요구사항 품질 판정 · 선택)
→ design/<feature>.md       (design + 정확성 속성 + Constitution Check) → 승인
→ tasks/active/<feature>.md (tasks) → (analyze 정합성 검사 · 선택) → 승인 → 구현
```

완료 처리: task 파일은 DoD/verify 충족 시 `tasks/check/`로 옮기고(상태 `check`) **사용자 검증**을 받는다.
사용자 승인 후에만 `tasks/completed/`로 옮긴다(`active/` → `check/` → `completed/`. 상세: `tasks/README.md`).
각 단계 템플릿 정본은 `../_spec-templates/` 한 곳이다(제품 폴더 안에는 템플릿을 두지 않는다).
새 기능은 `scripts/new-feature.sh {{PRODUCT_SLUG}} <feature>`로 스캐폴딩한다.

## 기준 문서 (원본)

<!-- [STACK 예시] 프로젝트의 기획/분석 원본 목록으로 치환한다. -->
- PRD: `docs/<PRD>.md`
- 요구사항분석서: `docs/<요구사항분석서>.md`
- 개발 백로그(EPIC/Story): `docs/<백로그>.md`
- 도메인 ERD: `docs/<ERD>.md`
- 아키텍처 가이드: `docs/<아키텍처>.md`

## 스펙 등록표 (feature ↔ 상태)

상태: ☐ 미작성 / ◐ 진행 / ☑ 완료. **담당 모듈** = 이 기능을 소유하는 도메인 모듈.

| feature | 출처 EPIC | 담당 모듈 | requirements | design | tasks |
|---|---|---|---|---|---|
| {{FEATURE_NAME}} | {{EPIC_ID}} | {{SERVICE_NAME}} <!-- [STACK 예시] 도메인 모듈: project \| auth \| storage --> | ◐ | ☐ | ☐ |

> **주의(completed ≠ e2e 동작)**: `completed`가 **계약·골격 완료** 수준일 수 있다(기본값 stub·미배선으로
> 실제 클릭 시 동작하지 않는 부분). 상태 ◐→☑(동작)은 **e2e 확인 후에만** 갱신한다.

## 멀티 에이전트

모든 에이전트(Kiro·Claude·Codex)는 이 제품 폴더의 3-하위폴더 스펙을 SDD 정본으로 읽고 따른다(`AGENTS.md` 경유).
전 제품 목록·진입은 `../specs-index.md`, SDD 워크플로 정본은 `.agents/rules/sdd-workflow.md`.
