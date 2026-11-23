---
key: HK-18
area: dashboard
type: feat
title: 관리 페이지 화면 · 흐름 보기(React Flow) · 전체 프로젝트 · 기록 · 사용량 · 스킬 목록
status: approved
created: 2026-11-23
---

# Requirements — HK-18 관리 페이지 화면 (P20 둘째 조각)

근거: [설계 06](../../../../docs/design/06-dashboard.md) §3.13 · §3.16~§3.19, [07](../../../../docs/design/07-skills-inventory.md) SK-R 전부, [화면기획서](../../../../docs/design/screens/index.html) S00~S13. 사용자 요청: "대시보드로 진행 상황 · 요구사항 · 문서를 본다", "React Flow로 워크플로를 기능으로", "여러 프로젝트", "질문 히스토리 · 토큰 사용량".

- 화면기획서 S00~S13을 실제 화면(`packages/dashboard/static`)으로 만든다. 빌드 단계 없이 번들한 정적 파일, CDN 없음. 흐름 보기는 `packages/flow-view`(React Flow)를 미리 묶은 번들로 싣는다(06 §3.16).
- 전체 프로젝트(등록부 `~/.config/harness-kit/projects.json`, 06 §3.17), 기록 · 사용량(대화 기록 읽기는 기본 꺼짐, 06 §3.18), 스킬 목록(07 SK-R 전부).
- 접근성(키보드 · 색만으로 말하지 않음), 화면기획서와 같은 상태(로딩 · 빈 · 오류 · 읽기 전용).
- 킷은 모델을 부르지 않는다. 화면에 모델을 부르는 버튼이 없다.
