---
description: SDD 3단계 — 작업 생성. design을 실행 가능한 tasks/active/<feature>.md 로 분해한다.
---

<!-- HARNESS STARTER KIT · 얇은 트리거. 원본: .agents/rules/sdd-workflow.md (/hx-tasks 절) -->

SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-tasks` 절을 로드해 그대로 수행한다.

전제: design 승인(없으면 `scripts/check-sdd-prerequisites.sh <slug> <feature> --stage tasks`).

핵심:
1. requirements의 User Story(P1/P2/P3)와 design(컴포넌트·API·데이터)을 작업으로 변환.
2. **작업 포맷**: `- [ ] T001 [P] [US1] 설명 + 파일/모듈 경로`. `[P]`=병렬, `[US1]`=스토리 추적.
3. **Phase**: Setup → Foundational(차단 선행) → User Story별(P 순) → Polish. 각 작업에 요구사항 ID·설계 § 표기.
4. 의존 그래프·병렬 예시·구현 전략(핵심 우선 / 점진 인도) 포함. 상태 `active`. 완료 후 **사용자 승인** → `/hx-analyze` 또는 `/hx-implement`.

입력(맥락, 선택): $ARGUMENTS
