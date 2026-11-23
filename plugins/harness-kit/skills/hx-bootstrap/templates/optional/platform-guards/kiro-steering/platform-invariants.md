---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 플랫폼 불변식 (포인터)

원본: `.agents/rules/platform-invariants.md` — 불변식을 발견했거나 가드를 만들 때 연다.

요약:

- 불변식은 **문서 → 경고 가드 → 강제 가드** 3단으로 올린다. 2단계를 건너뛰지 않는다.
- **새 가드는 반드시 `harness-guard-enforce: 0`(경고)으로 시작**한다. 위반 0건이 된 뒤 1로 올린다.
- 가드 추가에 필요한 배선은 **파일을 두는 것뿐**이다 — `scripts/guards/<name>.sh`.
  `verify.sh` 가 `scripts/run-guards.sh` 존재만으로 자동 호출한다.
- 가드는 위반 위치를 `파일:줄` 로 찍고 **고치는 방법**을 한 줄 덧붙인다. 통과 시에는 아무것도 출력하지 않는다.
- 가드로 만들 것: 어겼을 때 **조용히** 나빠지는 것(경계 위반·값의 출처·위험 설정·금지 API).
- 만들지 말 것: 린터가 이미 하는 일, 판단이 필요한 것, 예외가 규칙보다 많은 것.
- 예외는 가드 안에서 표현한다. 가드를 끄지 않는다. 예외가 셋을 넘으면 규칙을 다시 본다.
- `GUARD_ENFORCE=1 bash scripts/run-guards.sh` 로 릴리스 전 경고까지 점검한다.
