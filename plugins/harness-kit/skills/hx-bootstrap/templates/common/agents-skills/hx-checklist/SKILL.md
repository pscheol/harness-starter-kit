---
name: hx-checklist
description: SDD 품질 게이트 — 요구사항의 "유닛테스트". 스펙 문장 자체의 품질을 도메인별 체크리스트로 판정(읽기 전용).
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-checklist` 절을 로드해 그대로 수행한다.

읽기 전용 — 스펙 파일을 수정하지 않는다. (스펙 보완은 `/hx-clarify`·`/hx-specify` 로 되돌려 수행)

핵심:
1. REQUIREMENTS 출력으로 대상 요구사항과 도메인 초점을 확정한다. 새 형식은 이슈의 requirements.md, legacy는 기존 기능 문서다.
2. `.agents/docs/_spec-templates/checklists/_template.md`를 새 형식은 이슈의 `checklists/<도메인>.md`, legacy는 제품의 `checklists/<feature>-<도메인>.md`로 복제해 채운다. 스펙 원본은 수정하지 않고 체크리스트 산출물만 작성한다.
3. **기본 5축**(완결성·명료성·일관성·측정가능성·커버리지)을 `CHK-###` 로 PASS/FAIL/N·A 판정 — 근거는 스펙 인용, 확인 불가는 `[NEEDS CLARIFICATION]`.
4. 도메인 초점(security·api·data·ux 등)이 주어지면 해당 관점 항목을 **추가**.
5. 판정 요약 + 결론(통과/조건부/보류). 핵심 FAIL은 `/hx-clarify`·`/hx-specify` 로 되돌린 뒤 재실행.

> 이 명령은 한 문서의 품질을 본다. requirements↔design↔tasks 교차 정합성은 `/hx-analyze`.

대상(제품·기능 + 도메인, 생략 시 최근 requirements·requirements-quality): 이 명령 뒤에 이어서 적은 내용

경로: 새 이슈는 `.agents/docs/<slug>-specs/issues/<key>/`, 기존 이슈는 원래 위치를 유지한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 확인하고 full은 `--full`로 명시한다.
