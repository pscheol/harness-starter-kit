---
name: hx-specify
description: SDD 1단계 — 요구사항 생성. 이슈 폴더에 requirements.md 를 만들고 채운다.
---


SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 `/hx-specify` 절을 로드해 그대로 수행한다.

핵심:
1. 영역(`--area`, 기존 `specs-index.md` 영역 중 택 또는 신규) · 이슈 키(Jira 키 또는 `--next`) · 이름(2~5단어) 확정.
2. `scripts/new-feature.sh <키|--next> <이름> --area <영역>` 으로 **requirements 하나만** `.agents/docs/issues/<키>-<이름>/` 에 스캐폴딩한다(Jira 키가 있으면 그 키, 없으면 `--next`). design·tasks 는 각각 `/hx-plan`·`/hx-tasks` 가 그때 만든다(빈 문서를 미리 깔면 보드와 단계 게이트가 무력해진다). 새 영역이면 `specs-index.md` 영역 등록표에 행을 추가한다.
3. 스캐폴딩의 REQUIREMENTS 경로를 **무엇을/왜**만으로 채운다(스택·API·코드 금지): 우선순위 User Story(P1/P2/P3, 독립 테스트 기준), 측정가능·기술중립 Success Criteria, `[NEEDS CLARIFICATION]`(≤3). 경로는 `issues/<키>-<이름>/requirements.md`다.
4. 품질 자체검증(최대 3회) 후 상태 `in-review`, **사용자 승인** → `/hx-clarify` 또는 `/hx-plan`.

`/hx-specify --from-unit <Intent 키>/<U-n>`(설계 단계에서 넘어올 때):
1. `python3 scripts/harness/from_unit.py <Intent 키>/<U-n>` — intent 게이트 · 이미 있는 이슈 · 의존 Unit(계약 먼저) · 키를 스크립트가 판정하고, requirements 의 FROM-UNIT 구간 · 머리(`intent` · `unit` · `dependsOn` · `profile` · `risk`)와 units.json 의 `issue` 를 채운다. exit 3 이면 그 이유를 전하고 멈춘다.
2. 만든 requirements 의 템플릿 절을 FROM-UNIT 구간의 스토리 · AC · NFR · 위험으로 다듬는다. Intent ID(S-n · AC · NFR · RISK · KEEP)는 괄호로 남기고 지우지 않는다.
3. jira-workflow 모듈이면 Jira 작업 항목을 먼저 만들고 그 키를 `--key` 로 준다.
4. multi-harness 모듈이고 Unit 에 `repo`(배포 단위 id)가 있으면 스크립트가 그 도메인 폴더에 이슈를 만든다(계약 Unit 은 상위 리포). 출력의 `repo` 를 보고 그 폴더에서 이어 간다.

입력(제품 slug + 기능 설명): 이 명령 뒤에 이어서 적은 내용

경로: 이슈는 `.agents/docs/issues/<키>-<이름>/`. 옛 `<영역>-specs/` 이슈는 읽기만 한다.
`scripts/check-sdd-prerequisites.sh`의 BASE/REQUIREMENTS/DESIGN/TASKS 출력으로 경로를 해석하고, legacy 디렉터리를 새 기본값으로 가정하지 않는다.
검증: `bash scripts/verify.sh --files <변경 경로> --tests <관련 테스트>`부터 실행한다. `--plan`으로 범위를 확인하고, MR 전에는 `bash scripts/verify.sh --affected`를 돌린다. 전체 검증(full)은 CI가 돈다.

SDLC: S1·S2 를 함께 쓴다 — requirements 에 정책 표(P-#)와 화면 표(또는 "화면 없음"), 갱신할 기능 문서 ID 를 둔다.
