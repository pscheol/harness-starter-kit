<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{PRODUCT_SLUG}} 치환 후 사용 -->

# 전 제품 스펙 색인 (SDD 최상위 진입점)

이 프로젝트의 SDD는 **제품(바운디드 컨텍스트) 단위 묶음**으로 관리한다.
각 묶음은 `product-<slug>-specs/` 폴더이며 그 안에 `requirements/` · `design/` · `tasks/` 3단계를 둔다.

## 제품 등록표

| 제품 | 폴더 | 요약 | 상태 |
|---|---|---|---|
| {{PRODUCT_SLUG}} | `product-{{PRODUCT_SLUG}}-specs/` | (이 제품의 한 줄 요약) | ◐ 진행 |

> 상태: ☐ 미착수 / ◐ 진행 / ☑ 안정. 각 제품의 기능별 상세는 해당 폴더의 `index.md` 등록표 참고.

## 새 제품 추가

```bash
# 제품 폴더 골격 생성(권장): requirements/ design/ tasks/{active,check,completed} + index.md
scripts/new-product.sh <slug>          # (선택) 또는 아래 new-feature.sh 가 없으면 수동 복제
scripts/new-feature.sh <slug> <feature># 기능 3종(req/design/tasks) 스캐폴딩 + 제품 index 등록
```

- `<slug>`는 도메인/주요 능력 단위(예: `auth`, `billing`, `order`).
- 단일 제품이면 `product-{{PRODUCT_SLUG}}-specs/` 하나로 시작하고, 경계가 커지면 분할한다(YAGNI).

## 정본 링크

- **SDD 워크플로 정본**: `.agents/rules/sdd-workflow.md` (specify → clarify → checklist → plan → tasks → analyze → implement, 구현 후 잔여 작업은 `/hx-converge` 회수).
- **전역 설계 결정(ADR)·핵심 신념**: `decisions/`.
- **규칙 정본**: `.agents/rules/`. **검증 게이트**: `scripts/verify.sh`.
