<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}) -->

# 전 제품 스펙 색인 (SDD 최상위 진입점)

이 프로젝트의 SDD는 제품(바운디드 컨텍스트) 단위 묶음으로 관리한다.
각 묶음은 `<slug>-specs/` 폴더이며 그 안에 `requirements/` · `design/` · `tasks/` 3단계를 둔다.

<!-- BOARD:BEGIN — scripts/board.sh 가 생성합니다. 손으로 고치지 마십시오. -->
<!-- BOARD:END -->

## 제품 등록표

| 제품 | 폴더 | 요약 | 상태 |
|---|---|---|---|
| _(아직 없음 — 첫 기능을 스캐폴딩하면 추가한다)_ | — | — | — |

> 상태: ☐ 미착수 / ◐ 진행 / ☑ 안정. 각 제품의 기능별 상세는 해당 폴더의 `index.md` 등록표 참고.
> 위 **전체 보드**는 파일 위치에서 자동 계산되고, 이 등록표는 사람이 적는 제품 카탈로그다(요약·소유·안정도).
> 둘은 역할이 다르다 — 보드는 지금의 진행 현황, 등록표는 제품이 무엇인지에 대한 설명이다.

## 새 제품·기능 추가

```bash
scripts/new-feature.sh <slug> <feature>                  # requirements — 제품 폴더가 없으면 골격까지 만든다
scripts/new-feature.sh <slug> <feature> --stage=design   # 요구사항 승인 후
scripts/new-feature.sh <slug> <feature> --stage=tasks    # 설계 승인 후
```

- 제품 폴더는 설치 시 미리 만들지 않는다. 첫 기능을 스캐폴딩할 때 생긴다
  (빈 껍데기 폴더가 쌓이지 않게 하려는 것이다).
- 같은 이유로 **단계 문서도 미리 만들지 않는다**. 단계에 들어갈 때 그 단계 것만 만든다 —
  빈 design·tasks 가 깔려 있으면 위 보드가 곧장 🔨 구현으로 뛰고 단계 게이트도 항상 통과한다.
  설계가 이미 확정된 소규모 작업만 `--all` 로 3종을 함께 만든다.
- `<slug>`는 도메인/주요 능력 단위(예: `auth`, `billing`, `order`). 프로젝트명과 같을 필요는 없다.
- 단일 제품이면 하나로 시작하고, 경계가 커지면 분할한다(YAGNI).
- 새 제품이 생기면 위 등록표에 행을 추가한다 — 이 표가 전 제품 진입점이다.
- 단계 템플릿 원본은 `_spec-templates/` 한 곳이다. 제품 폴더에는 템플릿을 복사하지 않는다.

## 원본 링크

- **SDD 워크플로 원본**: `.agents/rules/sdd-workflow.md` (specify → clarify → checklist → plan → tasks → analyze → implement, 구현 후 잔여 작업은 `/hx-converge` 회수).
- **전역 설계 결정(ADR)·핵심 원칙**: `decisions/`.
- **규칙 원본**: `.agents/rules/`. 검증 게이트: `scripts/verify.sh`.
