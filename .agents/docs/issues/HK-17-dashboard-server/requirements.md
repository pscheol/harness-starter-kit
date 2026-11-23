---
key: HK-17
area: dashboard
type: feat
title: 관리 페이지 서버 — REST · 읽기 · 쓰기 규칙 · 승인 · 질문 · 세션 · 작업 요청 · 내보내기
status: approved
created: 2026-11-23
---

# Requirements — HK-17 관리 페이지 서버 (P20 첫 조각)

근거: [설계 06](../../../../docs/design/06-dashboard.md) DB-R1~DB-R29, §3.1~§3.15 · §3.19, [README 원칙 7 · 9 · 10](../../../../docs/design/README.md).

- 설계 06 DB-R1~DB-R29 중 서버 · CLI 몫 전부: 127.0.0.1 바인드 · Host · Bearer 토큰 · Origin 검사, stat 캐시, 허용 경로 · baseSha256 · 이슈 브랜치 체크아웃 찾기, 승인(PIN · approvers · NEEDS CLARIFICATION · approvals.md 덧붙이기, HK-23과 같은 fixture로 Node · Python 파서 결과 같음), 질문 답, 세션 등록 훅, 작업 요청(소켓 · deep link · 대기함, 사람이 고를 때만 — DB-R25), 에이전트 세션 판정 → 읽기 전용, 정적 내보내기, 화면 없이 쓰기(모든 API에 같은 결과의 CLI 명령, §3.15).
- 패키지 `packages/dashboard`(서버), CLI `dashboard` 명령이 부른다. 런타임 의존성 0(Node 표준 `http`).
- 킷은 모델을 부르지 않는다(DB-R26). 저장 · 승인 · 답은 세션에 아무것도 보내지 않는다(DB-R25).
