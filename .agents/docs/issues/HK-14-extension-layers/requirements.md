---
key: HK-14
area: cli
type: feat
title: 확장 층 — 회사 팩 · 프로젝트 · 개인 층과 게이트 하한
status: approved
created: 2026-11-23
---

# Requirements — HK-14 확장 층 (P18 셋째 조각)

근거: [설계 04](../../../../docs/design/04-extension-layers.md) §2 요구사항 전부 · §3, [README §5 · 원칙 3](../../../../docs/design/README.md). 사용자 요청: "사람마다 업체마다 개개인마다 하네스를 추가하고 싶은 것들을 고려".

- 설계 04 §2의 요구사항 전부: 층 순서 킷 → 회사 팩 → 프로젝트 → 개인(`.agents/local`, 더하기만), `pack.json` 형식과 `pack new`, 팩 버전 고정 · 갱신(`update --packs`), 개인 층이 덮을 수 있는 키 제한, 게이트 하한(requirements · design · mr · done, floor 훅)은 어떤 층도 빼지 못한다.
- `doctor`가 `personal-ignored` · `gate-floor` · `approvers` 설정을 검사한다. `approvers`는 선택이고 비면 git 사용자 누구나(README §5).
- 킷은 모델을 부르지 않는다. 층이 늘어도 세션마다 실리는 양은 층이 더한 파일만큼만 는다(doctor가 owner별로 보인다).
