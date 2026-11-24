---
name: hx-plans
description: '기획물 — /hx-plans doc|screen|design|backlog <Intent 키>. 승인된 Intent 로 요구사항 문서 · 화면 기획 · 와이어프레임 · 디자인 기획 · 백로그를 plans/ 에 만든다. 필수 제목 · 와이어프레임 검사를 통과해야 한다.'
---

설계 세션에서 돈다. 템플릿 원본은 `.agents/docs/_spec-templates/plans/`. 킷 스크립트는 모델을 부르지 않는다.

절차(`<종류>` = doc · screen · design · backlog):
1. `python3 scripts/harness/intent.py next <키>` — intent 게이트가 `flow.gates` 에 있고 승인 전이면 멈춘다.
2. 스킬 지도 `.agents/skill-map.json` 의 `design.<종류>` 칸(해석 결과는 `npx harness-kit skills --json` 의 `map.resolved` — 지도에 없으면 템플릿)에 이 컴퓨터에 깔린 스킬이 있으면 그 스킬에 입력(intent.md · units.json · 출력 경로 · 템플릿 경로 · `.agents/rules/writing-style.md`)을 주고, 없으면 템플릿을 복사해 intent.md · units.json 에서 채운다. 머리 `generatedWith` 에 `skill:<이름>` 또는 `template:plans/<파일>` 을 적는다.

| 종류 | 출력 |
|---|---|
| `doc` | `plans/requirements-doc.md` — FROM-INTENT 구간은 intent.md 스토리 · AC 표 |
| `screen` | `plans/screens/index.md` + `plans/screens/SCR-<nn>-<이름>.html`(템플릿 `_wireframe.html` — 파일 하나, 외부 참조 0, 상태 넷, 요소마다 data-el) |
| `design` | `plans/design-plan.md` |
| `backlog` | `plans/backlog.md` — 생성 구간은 `python3 scripts/harness/intent.py backlog <키>` 로만 만든다. 스킬은 구간 밖 설명만 쓴다 |

3. 검사: `python3 scripts/harness/plan_check.py <plans 폴더>` · 와이어프레임은 `python3 scripts/harness/wireframe_check.py <html>…`. 빠진 제목 · 외부 참조를 고친다.
4. 모든 기획물이 draft 이상이면 "plans 게이트 승인 대기" 를 전한다. 승인은 사람이 한다.
