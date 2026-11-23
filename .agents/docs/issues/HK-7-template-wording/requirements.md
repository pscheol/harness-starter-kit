---
key: HK-7
area: templates
type: docs
title: 킷 템플릿에서 에이전트에게 full을 지시하는 문장을 없앤다
status: approved
created: 2026-11-23
---

# Requirements — HK-7 템플릿 문구 (v1.1)

근거: [설계 01 R6 · §3.6](../../../../docs/design/01-v1.1-verify-and-issues.md).

- **R6.1** 킷 템플릿에서 에이전트에게 full을 지시 · 권고하는 문장은 0개다(CI 템플릿과 `verification-ladder.md`의 레벨 정의 행 제외). 시험이 정규식으로 센다.
- **R6.2** tasks · design 템플릿의 "full 선택/이유" 칸은 "affected 결과 · CI full 링크"가 된다.
- **R6.3** 세션 시작 고정 안내의 검증 줄은 changed · affected 안내로 바꾼다(설치본 세션 시작 출력은 v1.0.8보다 길어지지 않는다 — README 원칙 10).
