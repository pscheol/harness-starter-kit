---
name: issue-agent-lock
description: 여러 에이전트/세션이 같은 티켓을 동시에 집는 것을 막는 락 규약.
type: rule
applies_to:
  - claude
  - codex
priority: critical
last_updated: { { TODAY } }
---

# Issue Agent Lock — {{PROJECT_NAME}}

## 문제

에이전트 세션은 서로를 모른다. 두 세션이 같은 티켓을 집으면 **같은 작업을 두 브랜치에서 하고**, 나중에 하나를 버려야 한다.

## 락 = 세 신호의 조합

단일 필드로는 부족하다. 다음 셋이 모두 만족될 때만 "활성 락"으로 본다.

```text
1. 상태가 in_progress
2. 담당자가 지정되어 있음
3. 락 만료 시각이 미래
```

만료 시각이 과거면 **stale 락**이다. 회수할 수 있다. 다만 회수 사실을 기록한다.

## 필드

[`.agents/issue-tracker.yml`](../issue-tracker.yml)의 `lockField`에 정의한다. 커스텀 필드를 만들 수 없으면 코멘트 기반으로 대체한다.

```text
[AGENT-SESSION]
actor: <도구/세션 식별자>
phase: implementation | merge
claimedAt: <ISO8601>
expiresAt: <ISO8601>
```

## 규칙

- 락 기간은 짧게 잡고 필요하면 갱신한다. 긴 락은 stale 회수를 어렵게 만든다.
- **phase 는 상태 필드가 아니라 코멘트에만** 기록한다. 트래커 워크플로에 phase 상태를 추가하면 전이 그래프가 폭발한다.
- 기계가 읽는 블록은 ASCII key/value 만 쓴다.
- 작업 종료(완료·차단·해제) 시 **반드시** 락을 지운다.

## Stale 락 회수

1. 만료 시각이 과거인지 확인한다.
2. 마지막 활동(커밋·코멘트·브랜치 push)을 확인한다.
3. 회수 사유를 코멘트로 남긴다.
4. 새 락을 설정한다.

**만료되지 않은 락은 회수하지 않는다.** 다른 세션이 실제로 작업 중일 수 있다.
