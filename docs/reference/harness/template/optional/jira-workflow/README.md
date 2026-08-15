# optional / issue-tracker-workflow

이슈 트래커(Jira 등)를 **작업 큐**로 사용해 에이전트가 티켓을 claim → 구현 → 검토 전이까지 처리하게 만드는 모듈이다.

## 언제 설치하는가

- 팀이 이슈 트래커를 실제 작업 큐로 쓰고 있다
- 에이전트가 티켓 상태를 읽고 쓰는 자동화를 원한다
- 여러 작업자/세션이 동시에 티켓을 집는 상황이 있다

이슈 트래커를 쓰지 않거나 사람이 직접 티켓을 배정한다면 **설치하지 않는다.** 코어의 `agent-task-workflow`만으로 충분하다.

## 설치되는 것

```text
.agents/rules/issue-tracker-workflow.md   # 상태 전이, pull gate, 동시성
.agents/rules/issue-agent-lock.md         # 동시 claim 방지 락 규약
.agents/issue-tracker.yml                 # 상태 ID·전이 ID·필드 매핑
.agents/prompts/issue-intake.md           # 티켓 분해/정리 프롬프트
```

## 설치 후 반드시 채울 것

`.agents/issue-tracker.yml`의 다음 값은 **툴마다 다르고, 표시 이름으로는 자동화할 수 없다.**

- `statusIds` — 표시 이름이 아니라 **ID**로 전이해야 한다. 이름은 언제든 바뀐다.
- `transitionIds` — 상태 ID와 전이 ID는 다른 값이다.
- `lockField` — 동시 claim 방지용 필드. 없으면 코멘트 기반으로 대체한다.

값을 채우지 않은 상태로 자동화를 켜면 **엉뚱한 상태로 전이시킨다.**

## 핵심 설계

1. **한 세션 = 한 활성 티켓.** 여러 티켓 요청은 순차 큐로 처리한다.
2. **Pull gate.** 완료 조건·테스트 방법·근거가 없는 티켓은 구현하지 않고 triage 한다.
3. **에이전트는 검토 전까지만.** 최종 완료 전이는 사람이 실제 테스트를 통과시킨 뒤에 한다.
4. **Debug before new.** 실패한 검토는 기존 브랜치 디버깅이지 새 구현이 아니다.
