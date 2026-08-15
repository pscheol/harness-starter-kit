---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 디자인 시스템 (포인터)

원본: `.agents/rules/design-system.md` — UI 를 만들거나 고치기 전에 연다.

요약:

- 색·간격·타이포·반경·모션 값을 **지어내지 않는다.** 토큰에서 고르고, 없으면 디자인 소스를 본다.
- 기준 문서와 토큰 owner 표는 설치 후 채운다. 비어 있으면 이 규칙은 동작하지 않는다.
- 새 컴포넌트 전에 Inventory(`reuse-before-new.md`). 같은 역할이 다른 이름으로 있으면 기존 것을 고친다.
- 컴포넌트 상태 8종을 빠뜨리지 않는다 — default·hover·focus-visible·active·disabled·loading·empty·error.
- 컴포넌트는 자기 바깥 여백을 갖지 않는다. 바깥 여백은 배치하는 쪽이 정한다.
- 기준이 모호하면 구현하지 말고 묻는다.
