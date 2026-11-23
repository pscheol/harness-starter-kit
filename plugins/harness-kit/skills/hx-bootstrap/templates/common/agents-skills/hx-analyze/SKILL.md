---
name: hx-analyze
description: SDD 검사 — requirements·design·tasks의 정합성/커버리지/규칙 충돌을 읽기 전용으로 분석.
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-analyze` 절을 로드해 그대로 수행한다.

읽기 전용 — 파일을 절대 수정하지 않는다.

핵심:
1. REQUIREMENTS·DESIGN·TASKS 출력으로 해석한 한 이슈의 세 문서와 `.agents/rules/*`(헌법)를 읽어 `R#.#`·`SC-###`·설계 컴포넌트·`T### [US#]`를 ID로 색인한다. 다른 이슈나 legacy 경로를 합쳐 읽지 않는다.
2. 탐지(유형↔심각도): 헌법 충돌(CRITICAL) · 커버리지 갭(요구/역방향) · 모순 · 중복 · 모호(측정 불가·미해결 마커) · 용어 드리프트.
3. **읽기 전용 리포트**: `ID·심각도·유형·위치·발견·권고` 표 + 커버리지 매트릭스 요약 + 심각도별 집계. 파일 수정 금지(보완은 사용자 승인 후 `/hx-specify`·`/hx-clarify`·`/hx-plan`·`/hx-tasks`).

> 한 문서의 품질은 `/hx-checklist`, 세 문서 간 정합성은 `/hx-analyze`(이 명령).

대상(제품·기능): 이 명령 뒤에 이어서 적은 내용

경로: 새 이슈는 `.agents/docs/<slug>-specs/issues/<key>/`, 기존 이슈는 원래 위치를 유지한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 확인하고 full은 `--full`로 명시한다.
