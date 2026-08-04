<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}) -->

# 전 제품 스펙 색인 (SDD 최상위 진입점)

이 프로젝트의 SDD는 제품(바운디드 컨텍스트) 단위 묶음으로 관리한다.
각 묶음은 `product-<slug>-specs/` 폴더이며 그 안에 `requirements/` · `design/` · `tasks/` 3단계를 둔다.

## 제품 등록표

| 제품 | 폴더 | 요약 | 상태 |
|---|---|---|---|
| _(아직 없음 — 첫 기능을 스캐폴딩하면 추가한다)_ | — | — | — |

> 상태: ☐ 미착수 / ◐ 진행 / ☑ 안정. 각 제품의 기능별 상세는 해당 폴더의 `index.md` 등록표 참고.

## 새 제품·기능 추가

```bash
scripts/new-feature.sh <slug> <feature>   # 제품 폴더가 없으면 골격까지 함께 만든다
```

- 제품 폴더는 설치 시 미리 만들지 않는다. 첫 기능을 스캐폴딩할 때 생긴다
  (빈 껍데기 폴더가 쌓이지 않게 하려는 것이다).
- `<slug>`는 도메인/주요 능력 단위(예: `auth`, `billing`, `order`). 프로젝트명과 같을 필요는 없다.
- 단일 제품이면 하나로 시작하고, 경계가 커지면 분할한다(YAGNI).
- 새 제품이 생기면 위 등록표에 행을 추가한다 — 이 표가 전 제품 진입점이다.
- 단계 템플릿 원본은 `_spec-templates/` 한 곳이다. 제품 폴더에는 템플릿을 복사하지 않는다.

## 원본 링크

- **SDD 워크플로 원본**: `.agents/rules/sdd-workflow.md` (specify → clarify → checklist → plan → tasks → analyze → implement, 구현 후 잔여 작업은 `/hx-converge` 회수).
- **전역 설계 결정(ADR)·핵심 원칙**: `decisions/`.
- **규칙 원본**: `.agents/rules/`. 검증 게이트: `scripts/verify.sh`.
