---
key: HK-20
area: modules
type: feat
title: 선택 모듈 — module.json · aidlc · entire(선택 설치) · jira-workflow · notion · 모듈 토큰 측정
status: approved
created: 2026-11-23
---

# Requirements — HK-20 선택 모듈 (P22 · P21 일부)

근거: [설계 10](../../../../docs/design/10-modules.md) MD-R1~MD-R16 · §3.1~§3.7, 결정 D2 · D6, [README 원칙 4 · 5 · 7](../../../../docs/design/README.md). 사용자 요청: "AI-DLC · Entire를 원본 그대로 설치하고 업데이트", "킷만으로도 전 흐름이 돈다", "설치할 때 선택으로 같이 설치", "모듈이 덧붙이는 토큰을 보인다".

- 설계 10 MD-R1~MD-R16 전부. AI-DLC 승인 가져오기(§3.2 6단계, `source: aidlc`), Entire 구현 하네스 하나만 · push 정책(D6), jira-workflow 개편(상태 대응 · 사람 전이만 승인), notion 접수 출처, multi-harness, 모듈 토큰 측정(§3.7).
- 사용자가 실제 설치 시험을 허용했다: 시험 폴더에 프로젝트를 처음부터 만들어 AI-DLC · Entire를 공식 설치기로 깔고 `add`부터 `remove`까지 돌린다. 원격이 필요하면 비공개 시험 저장소를 쓴다. 단위 시험은 가짜 도구로도 돈다.
- 두 구성(킷만 / 모두 켬) e2e가 통과한다(11 MG-R7).
