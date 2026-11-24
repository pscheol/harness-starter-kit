---
name: hx-review
description: 'MR 리뷰 — 원격 브랜치 diff·SDD 세 문서·규칙·스캔 결과를 읽고 발견(심각도·위치·근거·권고)을 findings.json 에 쓴다. 보고서·지문·ID·MR 요약 코멘트는 스크립트가 만든다. 체크아웃하지 않고 review.md·approvals.md 를 쓰지 않는다.'
---

리뷰 세션(사람이 연 읽는 세션)에서 돈다. 역할 원본은 `.agents/roles/reviewer.md` 의 "MR 리뷰" 절, 판정 기준은 `.agents/rules/pr-review-policy.md` 다. 킷 스크립트는 모델을 부르지 않는다. 판단은 이 세션이 하고 파일 · 코멘트는 스크립트가 쓴다.

절차:
1. `python3 scripts/harness/review.py collect <MR>` — GitHub `#45`, GitLab `!123`, 또는 브랜치 이름(`--platform github|gitlab`). 원격 브랜치를 받아 diff · SDD 세 문서 · base 규칙 · 스캔 요약을 `.agents/state/review/<키>/` 에 둔다. 기능 브랜치를 체크아웃하지 않는다. exit 2 면 그 출력을 보고하고 멈춘다.
2. 출력의 "읽을 파일"에서 필요한 것만 연다: `diff.patch`(바뀐 곳), `sdd/requirements.md` 의 `R#` · `SC-#`, `sdd/design.md` 의 선택, `rules/`, `scan.txt`, 있으면 `previous.md`(이전 보고서) · `sdd/review.md`(구현 세션의 처리 결과).
3. 점검표로 본다. 발견의 `check` 에 ID 를 쓴다.

| ID | 보는 것 |
|---|---|
| RV-COV | requirements 의 `R#` · `SC-#` 마다 코드 위치와 시험이 있는가. 없으면 그 ID 를 적어 누락으로 보고한다 |
| RV-ADR | design 의 선택 · ADR 을 따르는가, 버린 대안을 구현했는가 |
| RV-RULE | 보안 · API 표준 · 코드 유지 규칙 |
| RV-EDGE | 동시성 · 권한 · 경계값 · 실패 경로 · 재시도 · 시간대 |
| RV-TEST | `R#` 마다 시험 1개 이상, 실패 경로 시험, 고친 버그의 회귀 시험 |
| RV-SCAN | 스캔 새 문제의 해석: 실제 위험인지, 오탐 근거, 우선순위 |
| RV-DOC | 기능 문서 · API 문서 갱신이 필요한 변경인가 |

4. `.agents/state/review/<키>/findings.json` 을 쓴다. 발견 하나는 `{"severity": "CRITICAL|HIGH|MEDIUM|LOW", "check": "RV-…", "path": "<리포 기준 경로>", "line": <head 판 줄>, "title": "한 줄", "evidence": "근거(규칙 · design 절 · 코드)", "scenario": "입력 → 결과", "recommendation": "고칠 방향"}` 이고, 파일은 `{"findings": [...], "notes": "읽지 못한 파일 · 돌리지 못한 검증"}` 이다. 같은 원인은 한 건으로 묶는다. 발견이 없으면 빈 목록이다.
5. `python3 scripts/harness/review.py publish <키>` — 형식 검사 뒤 지문 · ID(이전 리뷰와 같은 지문은 같은 ID)를 붙여 `.agents/reports/review/<키>.md` 를 쓰고 MR 요약 코멘트의 review 구간 하나를 만들거나 고친다. exit 2 면 findings.json 을 고쳐 다시 돈다. exit 1 은 코멘트만 실패한 것이다(`review.py comment <키>` 로 다시).

금지: 기능 브랜치 체크아웃 · 커밋 · push, 이슈 폴더의 `review.md` · `approvals.md` 쓰기(처리 결과는 구현 세션이 review.md 에 쓴다), 승인 판단. CRITICAL · HIGH 를 닫는 것은 구현 세션의 수정과 다시 돈 리뷰, 또는 사람이 남긴 `review/F-n · risk-accepted` 기록뿐이다.

출력(그대로 쓴다):

```text
리뷰: <키> <MR> — approve | changes-required (CRITICAL a · HIGH b · MEDIUM c · LOW d)
- F-n · 심각도 · 점검 — 경로:줄 한 줄(상위 7개)
보고서: .agents/reports/review/<키>.md · 코멘트: 만듦 | 고침 | 실패(이유)
```

대상(MR): 이 명령 뒤에 이어서 적은 내용

위임(설계 12 MR-R6): light 분류 역할(explorer 등)이 같은 작업에서 두 번 실패하거나 결과 끝이 `확신: 낮음` 이면 한 등급 위 모델로 한 번만 더 맡긴다(Claude 는 Agent 호출의 `model` 인자, Codex 는 명시 값, Kiro 는 올리지 않고 사람에게 알린다). `deep` 위로는 올리지 않는다. locked 역할(worker · reviewer · designer)에는 `model` 인자를 주지 않는다 — 이 세션의 모델 · effort 는 바꾸지 않는다.
