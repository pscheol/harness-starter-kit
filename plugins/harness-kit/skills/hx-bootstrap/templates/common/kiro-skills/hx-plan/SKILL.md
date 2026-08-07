---
name: hx-plan
description: SDD 2단계 — 설계 생성. design/<feature>.md 를 채우고 Constitution Check 게이트를 통과시킨다.
---

<!-- HARNESS STARTER KIT · 얇은 트리거. 원본: .agents/rules/sdd-workflow.md (/hx-plan 절) -->

SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-plan` 절을 로드해 그대로 수행한다.

전제: requirements 승인(없으면 `scripts/check-sdd-prerequisites.sh <slug> <feature> --stage design`).

핵심:
1. requirements + `.agents/rules/*`(guardrails·security·structure·api-standards·reliability) + `ARCHITECTURE.md` 를 읽는다.
2. **Constitution Check 게이트**: 규칙 원본 위반 여부 점검. 불가피한 위반은 design의 Complexity/대안 섹션에 정당화(없으면 진행 금지).
3. `design/<feature>.md` 를 채운다: 아키텍처·시퀀스, 인터페이스 시그니처, API(envelope·error code), 데이터 모델, 오류·보안·관측성, 테스트 전략 + Quickstart, 정확성 속성(PBT), 요구사항 추적 매트릭스.
4. `NEEDS CLARIFICATION` 남으면 중단→`/hx-clarify`. 완료 후 **사용자 승인** → `/hx-tasks`.

입력(기술 방향, 선택): 이 명령 뒤에 이어서 적은 내용
