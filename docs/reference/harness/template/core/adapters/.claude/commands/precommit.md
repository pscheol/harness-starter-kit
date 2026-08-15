---
description: 커밋 전 통합 게이트를 실행하고 결과를 요약 보고
---

# /precommit

`{{CMD_PRECOMMIT}}`를 실행해 포맷·하네스 계약·린트·타입·가드·테스트를 모두 점검한다.

## 절차

1. Bash로 `{{CMD_PRECOMMIT}}` 실행
2. 출력에서 단계별 결과를 추출해 요약:
   - format: 적용된 파일 수
   - harness contract: 통과 / 실패 항목
   - lint / typecheck: 통과 여부와 위반 수
   - guards: 경고 또는 실패 항목
   - test: 통과 여부 또는 생략 사유
3. 실패 항목이 있으면 해결 방법과 관련 정책 파일 링크를 안내
4. 통과 시 한 줄로 보고

## 환경변수

- `SKIP_TEST=1` — 테스트 생략(빠른 검증)
- `SKIP_GUARDS=1` — 도메인 가드 생략
- `SKIP_HARNESS=1` — 하네스 계약 검사 생략

## 금지

- 임의로 `git add` / `git commit` 실행 — 통과해도 커밋은 사용자가 한다
- 검증 실패를 자동 수정 — 보고만 한다
