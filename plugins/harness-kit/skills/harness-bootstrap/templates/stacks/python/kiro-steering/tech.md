---
inclusion: always
---
<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 기술 스택 · 실행 (포인터)

원본: `.agents/rules/tech.md` — Claude·Codex·Kiro 공통. 빌드·구조·스택 변경 전 연다. 의존성·버전 기준은 `pyproject.toml` + 잠금 파일. 구체 버전은 예시이며 프로젝트에서 최신 안정 버전으로 확정한다.

요약:
- Python 3.12+ · uv(또는 Poetry) · Ruff(lint+format) · mypy --strict · pytest · import-linter.
- 웹 프레임워크·ORM·직렬화는 아키텍처 변형마다 다르다(ASGI 계열 또는 Django) — 원본 `.agents/rules/tech.md` 를 연다.
- 검증 게이트 `bash scripts/verify.sh`(= ruff → mypy → lint-imports → pytest, 변형별 단계는 존재 감지로 추가).
