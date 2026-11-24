---
name: kns-scan
description: '정적 분석 결과 읽기 — 새 문제를 심각도·분석기·규칙으로 묶고 오탐 근거를 찾아 해석한다. 판정은 verify.sh 가 한다.'
---

`/kns-scan` 은 판정하지 않는다. 통과 · 실패는 `bash scripts/verify.sh` 가 정한다(설계 09 §3.2). 분석기 등록은 `.agents/analyzers.json`, 게이트 기준은 `.agents/quality-gate.json` 이다.

절차:
1. `python3 scripts/harness/quality.py scan` 을 실행한다. exit 3 이면 결과가 없거나 HEAD 와 다르다. 그때만 `bash scripts/verify.sh --affected` 를 한 번 돌리고(분석기는 그 안에서 돈다) 다시 `scan` 을 실행한다. 한 번 더 exit 3 이면 멈추고 그 출력을 보고한다.
2. 출력은 새 문제를 심각도 → 분석기 → 규칙으로 묶은 40줄 이하 요약이다. 같은 규칙이 5건을 넘으면 한 줄로 묶여 있다. 전체 목록은 `.agents/reports/findings-latest.json`, SARIF 는 `.agents/reports/sarif/latest/` 에 있다. 필요한 항목만 읽는다.
3. 새 문제마다(묶인 줄은 대표 1건) 해당 코드 위치를 열어 `RV-SCAN` 해석을 쓴다: 실제 위험인지, 오탐이면 그 근거(입력이 상수 · 검증된 경로 · 시험 고정값 등), 우선순위(지금 고침 · 이번 이슈 안 · 다음 이슈).
4. 고칠 것은 이번 이슈의 tasks 에 적고 고친다. 고친 뒤 `bash scripts/verify.sh --affected` 로 확인한다.
5. 오탐 · 위험 수용은 기록하지 않는다. 예외 등록(`.agents/quality-baseline.json` 의 `accepted`)과 기준선 갱신(`python3 scripts/harness/quality.py baseline --update`)은 사람이 한다. 에이전트는 그 파일을 고치지 않는다.

출력 형식(결과에 그대로 쓴다):

```text
스캔: 새 문제 N건(CRITICAL a · HIGH b · MEDIUM c · LOW d), runId <runId>
- [심각도] 분석기 규칙 — 경로:줄 · 판단(실제 위험 | 오탐 근거 …) · 우선순위
게이트: quality-gate-last.json 의 status · 위반 검사 ID
사람에게 넘길 것: 예외 등록 후보(지문 앞 12자 · 근거), 기준선 갱신 필요 여부
```

대상(이슈·경로): 이 명령 뒤에 이어서 적은 내용
