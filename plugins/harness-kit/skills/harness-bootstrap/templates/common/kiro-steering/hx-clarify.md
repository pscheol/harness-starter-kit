---
inclusion: manual
description: SDD 보조 — 요구사항의 모호성을 최대 5개 질문으로 해소하고 spec에 반영(plan 전 권장).
---

<!-- HARNESS STARTER KIT · 얇은 트리거. 정본: .agents/rules/sdd-workflow.md (/hx-clarify 절) -->

SDD 워크플로 **정본** `.agents/rules/sdd-workflow.md` 의 **`/hx-clarify`** 절을 로드해 그대로 수행한다.

핵심:
1. 대상 requirements(`.agents/docs/product-<slug>-specs/requirements/<feature>.md`)를 분류축으로 스캔.
2. **한 번에 하나씩**, 최대 5개 질문(객관식 2~5안 또는 ≤5단어). 권장안을 먼저 제시.
3. 답을 받을 때마다 requirements에 `## Clarifications`(오늘 날짜) 불릿 추가 + 관련 섹션 즉시 갱신.
4. 미해소 고영향 항목은 Deferred로 명시. 완료 후 `/hx-plan`.

대상(제품·기능, 생략 시 최근 것): 이 명령 뒤에 이어서 적은 내용
