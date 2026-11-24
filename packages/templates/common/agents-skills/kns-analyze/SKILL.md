---
name: kns-analyze
description: SDD 검사 — requirements·design·tasks의 정합성/커버리지/규칙 충돌을 읽기 전용으로 분석.
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/kns-analyze` 절을 로드해 그대로 수행한다.

읽기 전용 — 파일을 절대 수정하지 않는다.

핵심:
1. REQUIREMENTS·DESIGN·TASKS 출력으로 해석한 한 이슈의 세 문서와 `.agents/rules/*`(헌법)를 읽어 `R#.#`·`SC-###`·설계 컴포넌트·`T### [US#]`를 ID로 색인한다. 다른 이슈나 legacy 경로를 합쳐 읽지 않는다.
2. 탐지(유형↔심각도): 헌법 충돌(CRITICAL) · 커버리지 갭(요구/역방향) · 모순 · 중복 · 모호(측정 불가·미해결 마커) · 용어 드리프트.
   불변식 시험 누락: `python3 scripts/harness/invariants.py <키> --json` 의 지적을 그대로 옮긴다(INV · KEEP 시험 연결 없음 · 답 없는 엣지 질문 HIGH, 근거 없는 불변식 MEDIUM).
3. **읽기 전용 리포트**: `ID·심각도·유형·위치·발견·권고` 표 + 커버리지 매트릭스 요약 + 심각도별 집계. 파일 수정 금지(보완은 사용자 승인 후 `/kns-specify`·`/kns-clarify`·`/kns-plan`·`/kns-tasks`).

> 한 문서의 품질은 `/kns-checklist`, 세 문서 간 정합성은 `/kns-analyze`(이 명령).

대상(제품·기능): 이 명령 뒤에 이어서 적은 내용

경로: 이슈는 `.agents/docs/issues/<키>-<이름>/`. 옛 `<영역>-specs/` 이슈는 읽기만 한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 범위를 확인하고, MR 전에는 `bash scripts/verify.sh --affected`를 돌린다. 전체 검증(full)은 CI가 돈다.
