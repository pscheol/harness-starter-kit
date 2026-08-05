---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 가드레일 (포인터)

원본: `.agents/rules/guardrails.md` — Claude·Codex·Kiro 공통. 모든 변경 전 반드시 이 원본을 연다.

요약:
- 추측 금지 — 확인 후 단정, 미확인은 명시(파일·함수·스키마는 읽고 말한다).
- 경계에서 파싱(Parse, don't guess) — 추측한 형태로 빌드하지 않는다.
- 레이어 책임 — 비즈니스 규칙은 domain, 오케스트레이션은 application(anemic 회피).
- 주석은 기본이 '없음' — Why·함정·외부 근거·억제 이유일 때만 쓴다(`code-comments.md`).
- 글은 사람이 읽게 쓴다 — 작업 일지·공허한 문장 금지(`writing-style.md`).
