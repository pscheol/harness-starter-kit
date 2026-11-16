---
name: hx-specify
description: SDD 1단계 — 요구사항 생성. 이슈 폴더에 requirements.md 를 만들고 채운다.
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-specify` 절을 로드해 그대로 수행한다.

핵심:
1. 제품 slug·기능 short-name 확정(기존 `.agents/docs/*-specs/` 중 택 또는 신규).
2. `scripts/new-feature.sh <slug> <feature>` 로 **requirements 하나만** 스캐폴딩 + 제품 `index.md` 등록. design·tasks 는 각각 `/hx-plan`·`/hx-tasks` 가 그때 만든다(빈 문서를 미리 깔면 보드와 단계 게이트가 무력해진다). 제품 폴더가 없으면 골격까지 함께 생성된다(설치가 미리 만들어 두지 않는다). 새 제품이면 `specs-index.md` 등록표에도 행을 추가한다.
3. 스캐폴딩의 REQUIREMENTS 경로를 **무엇을/왜**만으로 채운다(스택·API·코드 금지): 우선순위 User Story(P1/P2/P3, 독립 테스트 기준), 측정가능·기술중립 Success Criteria, `[NEEDS CLARIFICATION]`(≤3). 새 형식은 `issues/<key>/requirements.md`, legacy는 기존 requirements 경로다.
4. 품질 자체검증(최대 3회) 후 상태 `in-review`, **사용자 승인** → `/hx-clarify` 또는 `/hx-plan`.

입력(제품 slug + 기능 설명): 이 명령 뒤에 이어서 적은 내용

경로: 새 이슈는 `.agents/docs/<slug>-specs/issues/<key>/`, 기존 이슈는 원래 위치를 유지한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 확인하고 full은 `--full`로 명시한다.

SDLC: S1·S2 를 함께 쓴다 — requirements 에 정책 표(P-#)와 화면 표(또는 "화면 없음"), 갱신할 기능 문서 ID 를 둔다.
