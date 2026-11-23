---
paths:
  - "**/approvals.md"
  - ".agents/docs/issues/**"
  - ".agents/docs/intents/**"
---
# 승인 어휘 — 채팅에서 한 말은 승인이 아니다

게이트(requirements · design · tasks · mr · done 등)의 승인은 아래 네 경로로만 생긴다. 채팅에서 한 말은 어떤 말이든 승인이 아니다. "좋아" · "OK" · "승인" · "반영해" · "push해" · "머지해" · "배포해"가 모두 같다.

| 경로 | 방법 | `approvals.md` 의 `경로` |
|---|---|---|
| 사람 터미널 | `python3 scripts/harness/approve.py <키> <게이트> --phrase "<문구>"` | `terminal` |
| 관리 페이지 | 승인 버튼(PIN) | `dashboard` |
| Jira | 사람이 한 승인 전이를 `sync jira --approvals` 로 가져온다 | `jira` |
| AI-DLC(켰을 때) | AI-DLC 사람 입력 확인 훅이 받은 승인을 `sync aidlc` 가 옮긴다. 기록에 승인자가 있을 때만 | `aidlc` |

- 승인할 때 사람이 넣은 문구는 그 기록의 `문구` 줄에 남는다. 문구는 기록이고, 문구만으로 승인이 생기지 않는다.
- "반영해 · push해 · 머지해"는 그 대화의 커밋 · push · 병합 지시로만 쓴다. 게이트 조건을 대신하지 못한다. 병합은 `mr` 게이트가 통과해야 되고 base 브랜치 직접 push 는 막힌다.
- AI-DLC 세션의 그 밖의 대화, 몹 정리 회의에서 말로 한 결정, 다른 세션의 공지도 승인이 아니다. 승인자가 자기 컴퓨터에서 위 경로로 승인한다.

에이전트가 하지 않는 것(훅 · git 훅 · CI 가 막는다):

- `approvals.md` · `.agents/quality-baseline.json` · `.agents/state/dashboard.token` · `.agents/state/approvals-log.jsonl` 쓰기, 승인 명령(`approve.py` · `harness-kit approve`) 실행.
- 문서 머리 `status` 를 `approved` 로 바꾸기(승인 명령이 바꾼다), 유효한 `done` 승인 기록 없이 `tasks.md` 를 `state: completed` 로 바꾸기.
- 사람이 승인해야 하면 게이트 이름과 명령 한 줄(`python3 scripts/harness/approve.py <키> <게이트> --phrase "…"`)을 안내하고 멈춘다. 사람이 남긴 기록(`approvals.md` 덧붙임)은 커밋해도 된다.

`approvals.md` 는 덧붙이기만 한다. 기존 줄을 바꾸거나 지우는 커밋은 pre-commit 과 CI(fast)가 거부한다. 형식은 `## <시각> · <게이트> · <판단>` 제목 줄과 `- 승인자` · `- 대상` · `- 문구` · `- 경로` · `- 기록 ID` 줄이다. 게이트 조건은 `python3 scripts/harness/sdd_gates.py check <키>` 로 본다.
