---
key: HK-23
area: verify
type: feat
title: 자체 리뷰 에이전트와 승인 규칙 강제
status: approved
created: 2026-11-23
---

# Requirements — HK-23 리뷰 · 승인 (P23 둘째 조각)

근거: [설계 09](../../../../docs/design/09-verification-quality.md) §3.1 · §3.8, VQ-R1~R4 · R12~R15 · R17, [06 §3.7](../../../../docs/design/06-dashboard.md)(승인 기록 형식), [README §3](../../../../docs/design/README.md)(승인 경로 넷). 사용자 요청: "코드 리뷰 에이전트는 자체적으로 만든다", "대화에서 한 말은 승인이 아니다".

- 설계 09의 VQ-R1 · R2 · R3 · R4 · R12 · R13 · R14 · R15 · R17 전부.
- `/hx-review` 스킬과 리뷰 역할: 원격 브랜치 diff · SDD 세 문서 · 규칙 · HK-16 스캔 결과를 읽어 `.agents/reports/review/<키>.md`에 발견(ID · 심각도 · 위치 · 근거 · 권고 · 지문)을 쓰고 MR 요약 코멘트 하나를 만들거나 고친다(GitLab `glab` · GitHub `gh`, 시험은 가짜 CLI).
- 사람 터미널 승인 `scripts/harness/approve.py`(Node 없는 리포)와 승인 기록 `approvals.md` 형식 파서(06 §3.7). 같은 입력 · 기대값 fixture(`tests/fixtures/approvals/`)를 두어 HK-17 관리 페이지의 Node 파서와 결과가 같게 한다.
- 승인 경로 넷(terminal · dashboard · jira · aidlc)만 인정한다. 채팅의 말은 승인이 아니다(`approval-vocabulary.md` 규칙).
- 킷은 모델을 부르지 않는다. 리뷰는 사람이 연 리뷰 세션 안에서 돈다.
