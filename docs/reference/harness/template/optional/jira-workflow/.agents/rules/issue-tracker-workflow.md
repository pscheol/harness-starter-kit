---
name: issue-tracker-workflow
description: 이슈 트래커를 작업 큐로 쓸 때의 claim·상태 전이·동시성 규약. 티켓 기반 작업 시 적용.
type: rule
applies_to:
  - claude
  - codex
priority: critical
last_updated: { { TODAY } }
---

# Issue Tracker Workflow — {{PROJECT_NAME}}

이슈 트래커는 **입력과 추적 표면**이다. 엔지니어링 규칙의 출처는 `AGENTS.md`와 `.agents/`다.

상태 ID·전이 ID·필드 키는 [`.agents/issue-tracker.yml`](../issue-tracker.yml)이 단일 진실이다. **표시 이름이 아니라 ID로 전이한다.**

## 상태 흐름

```text
todo -> in_progress                       구현 착수
in_progress -> review                     구현 + push + 기본 게이트 완료
review -> in_progress                     수정이 필요할 때
review -> done                            사람 테스트 통과 + 병합 완료
review -> completion_waiting              병합/이중 확인/일괄 처리 버퍼가 필요할 때만
completion_waiting -> done                버퍼 처리 완료
```

- `review`는 **merge-ready 가 아니다.** 사람이 실제로 실행해 확인하는 단계다.
- `completion_waiting`은 필수 단계가 아니라 **사람이 명시할 때만 쓰는 선택 버퍼**다.
- 에이전트는 사용자 승인 없이 `done`으로 전이하지 않는다.

## Pull Gate

자동으로 구현을 시작하려면 티켓이 다음을 모두 갖춰야 한다.

```text
상태 = todo
대상 저장소 명시
완료 조건 또는 수용 기준
테스트 방법
근거(스크린샷·로그·명세 링크)
살아 있는 락 없음
충돌하는 브랜치/MR 근거 없음
```

하나라도 없으면 **구현하지 않고 triage 또는 block** 한다. 부족한 항목을 명시해 되돌린다.

## 동시성: 한 슬롯

여러 작업자가 각자 하나씩 활성 티켓을 가질 수 있다. 그러나 **한 세션/워크트리는 하나만** 진행 중으로 둔다.

여러 티켓 명령은 순차 큐다.

1. 후보 목록 생성
2. 정확히 하나 claim
3. 완료·차단·해제
4. 트래커 재조회
5. 다음 하나 claim

## Claim 절차

1. 상태와 락을 확인한다 ([`issue-agent-lock.md`](./issue-agent-lock.md)).
2. 락을 설정하고 담당자를 지정한다.
3. 상태를 `in_progress`로 전이한다.
4. 티켓 하나당 브랜치 하나를 만든다.
5. 작업 종료 시 **반드시 락을 해제**한다. 해제되지 않은 락은 다음 세션을 막는다.

## Debug Before New

수정 요청, 검토 실패, 미완료 브랜치 복구는 **기존 근거 위의 디버깅**이다.

기존 브랜치를 되살릴 수 없다는 사실이 기록되기 전에는 병렬 구현을 만들지 않는다.

코딩 전에 티켓 본문, 코멘트, 연결 이슈, 리뷰 노트, 브랜치/MR 근거를 **전부** 읽는다.

## 사람이 위임한 병합

사람이 "테스트 통과했으니 병합해줘"라고 하면 **새 구현이 아니라 병합 작업**으로 처리한다.

1. 티켓·소스 브랜치·대상 브랜치·동작이 모호하지 않은지 확인한다. 모호하면 묻는다.
2. 요청 근거를 티켓에 정규화해 기록한다.
3. 대상 브랜치의 최신 상태를 가져온다.
4. 임시 통합 브랜치에서 충돌·stale 을 확인한다. **소스 브랜치를 rewrite 하지 않는다.**
5. 병합 게이트를 실행한다.
6. push 후 결과를 기록하고 락을 해제한다.
7. 대상 브랜치 병합으로 티켓이 완결될 때만 `done`으로 전이한다.

## 기록 형식

기계가 읽는 블록은 **ASCII key/value 만** 사용한다. 표시 언어가 바뀌어도 파싱이 깨지지 않는다.

```text
[AGENT-RESULT]
result: implemented | blocked | needs-refresh
branch:
commits:
verification:
skipped:
sddSpec:
residualRisk:
```

## 금지

- 승인 없이 트래커에 쓰기 (인증과 명시적 요청이 모두 필요)
- 표시 이름 기반 상태 전이
- 락 해제 없이 세션 종료
- 사람 테스트 없이 `done` 전이
