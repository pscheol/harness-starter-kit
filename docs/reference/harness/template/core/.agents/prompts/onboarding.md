# 온보딩 프롬프트

새 저장소 또는 새 작업 환경에서 하네스가 실제로 동작하는지 확인한다.

```text
이 저장소의 하네스 준비 상태를 확인해줘.

1. 구조
   - AGENTS.md 가 있고 .agents/ 를 참조하는가
   - .agents/harness.json 의 값이 이 프로젝트에 맞게 채워졌는가
     (플레이스홀더 {{...}} 가 남아 있으면 실패로 보고)
   - scripts/verify-harness.cjs 를 실행하고 결과를 요약한다

2. 자동화
   - 어댑터(.claude/settings.json, .codex/hooks.json)가 같은 스크립트를 부르는가
   - 심볼릭/미러가 정상인가 (부트스트랩 스크립트 실행)

3. 명령
   - harness.json 의 commands 가 실제로 동작하는가 (lint/typecheck/test 각각 실행)

4. 미완성 항목
   - golden-rules 의 불변 조건 표가 비어 있는가
   - pr-review-policy 의 negative knowledge 표가 비어 있는가
   - architecture.md / conventions.md 가 스텁 상태인가
   - source-index.md 에 TBD 가 남아 있는가

각 항목을 통과/실패/미완성으로 보고하고, 미완성 항목은 무엇을 채워야 하는지 알려줘.
파일을 고치지는 말고 보고만 해.
```
