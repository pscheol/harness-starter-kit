# 코드 유지보수와 공동 세션

새 코드·리팩토링 전에 `.agents/rules/code-maintenance.md`와 `.agents/rules/session-collaboration.md`를 읽는다.
패키지 책임·함수 길이·네이밍·조건 함수·mapper·API 문서와 변경 테스트를 함께 검증한다.
실제 세션 ID로 소유 경로를 등록하고 공지·충돌을 확인한다. 전체 검증(full)은 CI가 돈다. MR 전에는 `bash scripts/verify.sh --affected`.
