---
inclusion: always
---
# 검증 사다리 (포인터)

원본: `.agents/rules/verification-ladder.md` — 작업을 마치고 "검증했다"고 말하기 전에 연다.

요약:

- L0 정적 · L1 단위 · L2 통합/계약 · L3 시스템 · L4 사람 확인. **L0 만 통과한 것은 검증이 아니다**.
- 변경 종류가 최소 레벨을 정한다 — 상태를 바꾸는 로직·외부 연동은 L2, 사용자 흐름은 L3, 눈에 보이는 변경은 L4.
- 생략은 허용하되 `[VERIFICATION]` 블록에 `level`·`ran`·`skipped`·`residualRisk` 를 남긴다. 기록 없는 생략은 거짓 보고다.
- 에이전트 hook은 `changed`가 기본이다. 선택한 정적·단위·관련 통합 검증의 실제 수준을 기록한다. hook 통과는 full 통과가 아니다. MR 전에는 `bash scripts/verify.sh --affected`, 전체 검증(full)은 CI가 돈다.
- 사람 확인(L4)을 에이전트가 대신 선언하지 않는다.
