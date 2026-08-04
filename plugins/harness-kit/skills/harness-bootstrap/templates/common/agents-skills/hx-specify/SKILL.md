---
name: hx-specify
description: SDD 1단계 — 요구사항 생성. 제품 폴더에 requirements/<feature>.md 를 만들고 채운다.
---

<!-- HARNESS STARTER KIT · 얇은 트리거. 원본: .agents/rules/sdd-workflow.md (/hx-specify 절) -->

SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-specify` 절을 로드해 그대로 수행한다.

핵심:
1. 제품 slug·기능 short-name 확정(기존 `.agents/docs/product-*-specs/` 중 택 또는 신규).
2. `scripts/new-feature.sh <slug> <feature>` 로 requirements/design/tasks 3종 스캐폴딩 + 제품 `index.md` 등록. 제품 폴더가 없으면 골격까지 함께 생성된다(설치가 미리 만들어 두지 않는다). 새 제품이면 `specs-index.md` 등록표에도 행을 추가한다.
3. `requirements/<feature>.md` 를 **무엇을/왜**만으로 채운다(스택·API·코드 금지): 우선순위 User Story(P1/P2/P3, 독립 테스트 기준), 측정가능·기술중립 Success Criteria, `[NEEDS CLARIFICATION]`(≤3).
4. 품질 자체검증(최대 3회) 후 상태 `in-review`, **사용자 승인** → `/hx-clarify` 또는 `/hx-plan`.

입력(제품 slug + 기능 설명): 이 명령 뒤에 이어서 적은 내용
