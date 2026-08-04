---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 앱 책임 (포인터)

정본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 앱/기능 착수 전 연다. 아키텍처 정본은 `ARCHITECTURE.md`.

요약:
- Django 앱 구조: `config/settings/{base,dev,prod,test}.py` + `{{PACKAGE_NS}}/<app>/{models,selectors,services,serializers,views,urls}.py`.
- **쓰기=`services` / 읽기=`selectors`** 로 분리하고 둘은 서로 import하지 않는다(형제). 뷰는 얇게 — `Model.objects` 직접 호출 금지.
- 의존 방향·앱 간 독립은 **import-linter 계약**이 강제한다. 새 앱은 `containers`·`independence` 양쪽에 등록해야 강제된다.
- 트랜잭션 경계는 `services`의 `transaction.atomic()`. 블록 안에서 외부 호출 금지 — `transaction.on_commit` 사용.
- **시그널로 비즈니스 부수 효과를 엮지 않는다.** 마이그레이션은 코드와 함께 커밋(게이트가 드리프트를 차단).
- API 변경 시 OpenAPI 스냅샷 동기화. 승격 신호가 보이면 `ARCHITECTURE.md` §0·§12.
