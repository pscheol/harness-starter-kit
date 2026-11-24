---
key: HK-21
area: ops
type: feat
title: 배포 · 운영 기록 · 전달 지표 · 규칙 후보
status: approved
created: 2026-11-23
---

# Requirements — HK-21 반영 · 운영 (P24)

근거: [설계 14](../../../../docs/design/14-deploy-and-ops.md) DO-R 전부, [09 §3.7](../../../../docs/design/09-verification-quality.md)(CI 템플릿의 배포 단계). 사용자 요청: "승인 · 병합되면 문서 반영하고 운영 기록".

- 설계 14 DO-R 전부: `deploy.json` · `scripts/harness/deploy.py check|run|result|auto-verify`, 배포 기록 · `deploy` 게이트, CI 선택 단계(병합 뒤 검증 환경 배포 · 스모크는 실제 HTTP · 롤백 시험), 운영 기록 · 장애 · 다음 Intent 후보, 전달 지표 기준선, 규칙 후보(승격 · 거절), `docs` 반영(`/hx-docs`).
- 킷은 모델을 부르지 않는다. 배포 명령 자체는 팀의 명령을 부를 뿐이다.
