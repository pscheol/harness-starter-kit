# hx-analyze

> SDD 검사 — requirements·design·tasks의 정합성/커버리지/규칙 충돌을 읽기 전용으로 분석.

<!-- HARNESS STARTER KIT · 얇은 트리거. 원본: .agents/rules/sdd-workflow.md (/hx-analyze 절) -->

SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-analyze` 절을 로드해 그대로 수행한다.

읽기 전용 — 파일을 절대 수정하지 않는다.

핵심:
1. `.agents/docs/<slug>-specs/`의 requirements·design·tasks + `.agents/rules/*`(헌법)를 읽어 `R#.#`·`SC-###`·설계 컴포넌트·`T### [US#]`를 ID로 색인.
2. 탐지(유형↔심각도): 헌법 충돌(CRITICAL) · 커버리지 갭(요구/역방향) · 모순 · 중복 · 모호(측정 불가·미해결 마커) · 용어 드리프트.
3. **읽기 전용 리포트**: `ID·심각도·유형·위치·발견·권고` 표 + 커버리지 매트릭스 요약 + 심각도별 집계. 파일 수정 금지(보완은 사용자 승인 후 `/hx-specify`·`/hx-clarify`·`/hx-plan`·`/hx-tasks`).

> 한 문서의 품질은 `/hx-checklist`, 세 문서 간 정합성은 `/hx-analyze`(이 명령).

대상(제품·기능): 이 명령 뒤에 이어서 적은 내용
