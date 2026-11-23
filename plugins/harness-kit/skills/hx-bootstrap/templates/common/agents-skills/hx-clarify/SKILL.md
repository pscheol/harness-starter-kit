---
name: hx-clarify
description: SDD 보조 — 요구사항의 모호성을 최대 5개 질문으로 해소하고 spec에 반영(plan 전 권장).
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-clarify` 절을 로드해 그대로 수행한다.

핵심:
1. REQUIREMENTS 출력으로 해석한 대상 요구사항을 분류축으로 스캔한다. 새 형식은 이슈의 requirements.md, legacy는 기존 기능 문서다.
2. **한 번에 하나씩**, 최대 5개 질문(객관식 2~5안 또는 ≤5단어). 권장안을 먼저 제시.
3. 답을 받을 때마다 requirements에 `## Clarifications`(오늘 날짜) 불릿 추가 + 관련 섹션 즉시 갱신.
4. 미해소 고영향 항목은 Deferred로 명시. 완료 후 `/hx-plan`.

대상(제품·기능, 생략 시 최근 것): 이 명령 뒤에 이어서 적은 내용

경로: 새 이슈는 `.agents/docs/<slug>-specs/issues/<key>/`, 기존 이슈는 원래 위치를 유지한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 범위를 확인하고, MR 전에는 `bash scripts/verify.sh --affected`를 돌린다. 전체 검증(full)은 CI가 돈다.
