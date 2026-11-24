---
paths:
  - ".agents/docs/intents/**"
---
# 몹 정리(Mob Elaboration)

결정할 사람들이 같은 시간에 한 화면(관리 페이지 질문 화면)을 보며 Intent 질문 파일에 답하는 회의 규칙이다. 질문 · 답 형식은 `.agents/docs/_spec-templates/intent/questions.md` 그대로다.

| 항목 | 규칙 |
|---|---|
| 진행자 | 1명. 질문 화면을 띄운 컴퓨터의 git 사용자. 답을 대신 고르지 않고, 누가 답했는지 고른다 |
| 참석자 | 열린 질문의 `답할 직무` 그룹마다 1명 이상 + `approvers.intent` 그룹 1명 이상. 빠진 그룹이 있으면 `knots-sync mob start` 가 거부한다 |
| 시간 상자 | 질문 회차 하나 30분(`timeboxMin`) |
| 질문 수 | 회차당 5개 |
| 답 반영 | 진행자가 회차를 닫으면(`knots-sync mob next`) 설계 세션에 다음 회차를 요청할지 사람이 고른다. 자동으로 요청하지 않는다 |
| 미룬 결정 | 시간 안에 답이 안 난 질문은 `intent.md` §11 로 옮기고 주인(git user.email)과 기한을 적는다. 막는 게이트는 계속 막는다 |
| 승인 | 회의에서 한 말은 승인이 아니다. 승인자는 자기 컴퓨터의 관리 페이지 · `knots-sync approve` · Jira 사람 전이로 승인한다 |
| 기록 | 답 줄에 답한 사람과 기록한 git 사용자를 따로 남긴다(`- 답: B · park@example.com · <시각> · 기록: kim@example.com`) |
