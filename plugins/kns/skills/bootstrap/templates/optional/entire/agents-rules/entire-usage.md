---
paths:
  - ".entire/**"
---
<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 선택 모듈: entire -->

# Entire 체크포인트

- 커밋 메시지의 `Entire-Checkpoint:` 트레일러는 Entire 가 붙인다. 지우거나 고치지 않는다(amend · rebase · squash 에서도 남긴다).
- `.entire/` 설정과 체크포인트 ref 는 사람이 `entire` 명령으로 바꾼다. 에이전트는 `entire checkpoint delete` · `entire configure` · `entire disable` 을 실행하지 않는다.
- 기록은 구현 하네스 한 곳에만 켜 있다. 리뷰 세션은 원격 diff 만 읽는다.
