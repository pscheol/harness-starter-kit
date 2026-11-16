---
name: hx-plan
description: SDD 2단계 — 설계 생성. issues/<key>/design.md 를 채우고 Constitution Check 게이트를 통과시킨다.
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-plan` 절을 로드해 그대로 수행한다.

전제: requirements 승인(없으면 `scripts/check-sdd-prerequisites.sh <slug> <feature> --stage design`).

핵심:
1. `scripts/new-feature.sh <slug> <feature> --stage=design` 으로 design 파일을 만든다(requirements 가 없으면 스크립트가 거부한다). 그다음 requirements + `.agents/rules/*`(guardrails·security·structure·api-standards·reliability) + `ARCHITECTURE.md` 를 읽는다.
2. **Constitution Check 게이트**: 규칙 원본 위반 여부 점검. 불가피한 위반은 design의 Complexity/대안 섹션에 정당화(없으면 진행 금지).
3. 스캐폴딩의 DESIGN 경로를 채운다: 아키텍처·시퀀스, 인터페이스 시그니처, API(envelope·error code), 데이터 모델, 오류·보안·관측성, 테스트 전략 + Quickstart, 정확성 속성(PBT), 요구사항 추적 매트릭스. 새 형식은 `issues/<key>/design.md`, legacy는 기존 design 경로다.
4. `NEEDS CLARIFICATION` 남으면 중단→`/hx-clarify`. 완료 후 **사용자 승인** → `/hx-tasks`.

입력(기술 방향, 선택): 이 명령 뒤에 이어서 적은 내용

경로: 새 이슈는 `.agents/docs/<slug>-specs/issues/<key>/`, 기존 이슈는 원래 위치를 유지한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 확인하고 full은 `--full`로 명시한다.

SDLC: S3 — design 의 순서도(§4.3)·상태 전이(§4.4)·쿼리→인덱스(§7.1)·캐시(§7.2)·동시성(§7.3)을 채운다.
