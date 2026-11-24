---
key: HK-19
area: design
type: feat
title: 킷 설계 단계 — 요구사항 접수 · /hx-intent · Unit 목록 · 질문 · 기획물 · 역할 배정
status: approved
created: 2026-11-23
---

# Requirements — HK-19 킷 설계 단계 (P21)

근거: [설계 08](../../../../docs/design/08-design-stage.md) DS-R 전부, [12](../../../../docs/design/12-model-routing.md) MR-R 전부(역할 · 위임 배분), 결정 D7(설계 · 구현 Claude, 리뷰 Codex, 반영 Kiro), [13](../../../../docs/design/13-aidlc-coverage.md)(AI-DLC 대응). 사용자 요청: "요구사항이 들어오면 문서 · 화면기획 · 디자인기획 · 백로그를 HTML로", "텍스트 · 파일 첨부로 이슈 추가", "AI-DLC 원칙 준수".

- 설계 08 DS-R 전부: `intake`(글 · 첨부, 신뢰하지 않는 입력 표시 · 제어 문자 제거 · 비밀값 검사, 이미지 설명 기본 안 만듦), Intent 문서 · `units.json` · 질문 파일 · Mob · 위험 프로필 · 역공학(codebase) · 도메인 설계, 기획물(`/hx-screen-plan` · `/hx-design-plan` · `/hx-backlog`), `/hx-specify --from-unit`.
- 설계 12 MR-R 전부: 위임 역할의 모델 · effort 배분(사람이 연 세션은 바꾸지 않음), 위임 결과 크기 상한, 사용량 측정 기본 꺼짐.
- intent · plans 게이트 승인은 HK-23 · HK-17 승인 경로를 쓴다.
- 킷은 모델을 부르지 않는다. 스킬 설명 300자 이하.
