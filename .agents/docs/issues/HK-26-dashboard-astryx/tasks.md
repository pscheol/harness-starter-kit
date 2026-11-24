---
key: HK-26
area: dashboard
type: feat
title: 관리 페이지 화면 층을 astryx 디자인 시스템(React 19)으로 다시 쓴다
state: in-review
created: 2026-11-24
---

# Tasks — HK-26

요구는 [requirements](requirements.md)의 R 번호, 설계는 [design](design.md)의 절 번호다. 상태는 `todo · doing · done`.

## 1단계 — 확인(spike)

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | astryx 한 페이지(AppShell · SideNav · Card · Table · Selector · Dialog)를 esbuild 로 묶어 실제 `dashboard` 서버(CSP 그대로)에서 Playwright 로 연다. StyleX · astryx 가 실행 중 `<style>` 을 만드는지, CSS 를 파일로 싣는 방법을 기록한다 | R3 · R4 | done |

결과: 인라인 `<style>` 을 만드는 곳이 둘(Layer 의 슬라이드 규칙, 스크롤 고정 규칙)이라 그대로는 CSP 위반 1건이 났다. 둘 다 CSSOM(constructable stylesheet)으로 바꾸는 esbuild 플러그인(`csp-plugin.mjs`)으로 CSP 를 약하게 하지 않고 해결했다(design §3). 멈출 이유는 없었다.

## 2단계 — 구현

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T2 | `packages/dashboard-ui` 패키지: 워크스페이스 · devDependency 만, `astryx init`(agent 문서), esbuild 빌드(`build.mjs`) · CSP 플러그인 | R1 · R3 | done |
| T3 | 테마 `harness`(astryx theme editor + `defineTheme`): 무채색 바탕 + 강조색 하나, 의미 색 토큰, 시스템 글꼴, 라이트만 | R5 | done |
| T4 | 공용 층: API 클라이언트 · 라우터 · 상태 · 훅 · `Page` · 공용 부품 · 게이트 레일 · 차트 · PIN · 세션 요청 시트 | R2 · R6 | done |
| T5 | S01 홈(숫자 카드 · 처리할 일 · 세션 · Intent) · S02 진행(표 + 이슈 시트) | R7 · R10 | done |
| T6 | S03 이슈 상세(문서 보기 · 편집 · 충돌 · 점유 · 승인 패널 · 리뷰 판단) · S04 질문 | R6 · R7 | done |
| T7 | S12 흐름(React Flow 를 화면 안의 늦게 받는 조각으로, 변경 제안, 남은 Bolt) · `flow-view` 를 소스 패키지로 | R7 | done |
| T8 | S06 검증 · S07 작업 공간 · S08 스킬 · S09 하네스 · S10 운영 · S11 접수 · S13 기록 · 사용량 · S00 전체 프로젝트 · 문서 | R7 | done |
| T9 | 낡은 바닐라 화면 파일 · 흐름 번들 지우기, 서버가 새 번들을 주는지(`static.test.ts` 다시 씀), 루트 스크립트(`build:ui` · `gen`) | R1 · R3 | done |

## 3단계 — 시험

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T10 | vitest: API 클라이언트 · 상태 · 라우터 · 찾기 · PIN · 제안 · 단계 줄 · 포맷, 번들 재현(같은 바이트) · 번들 안 CSP 점검 · 외부 요청 없음 · 크기 · 라이선스 | R3 · R4 · R14 | done |
| T11 | Playwright(데모 리포): 모든 화면 1440 스크린숏, 주요 화면 320 · 768 · 1024, 콘솔 CSP 위반 0, 승인 PIN 키보드 흐름, 흐름 노드 선택(Enter · Esc), 시트 Esc | R4 · R8 · R9 | done |
| T12 | 읽기 전용 · 여러 프로젝트(`--all`) 화면 확인 | R6 | done |
| T13 | 전체 시험: dashboard · cli · flow-view · dashboard-ui, `gen-plugins` · `--check`, `python3 -m unittest tests.test_template_wording tests.test_generated` | 완료 기준 | done |

## 요구사항별 결과

결과 표와 시험 수치는 [design §9](design.md)에 둔다.

## 사람 확인 필요

- 화면 모양(색 · 간격 · 밀도)은 사람이 눈으로 확인한다: 스크린숏은 `screens/` 에 있다. 특히 강조색(graphite)과 의미 색 칩의 낮은 채도가 화면기획서의 의미 색 화면보다 조용해진 점.
- 흐름 캔버스 노드 안(`flow-view/src/flow.css`)은 옛 이름의 변수를 astryx 토큰에 이어 쓴다(design §7). 노드 모양을 astryx 컴포넌트로 다시 그리지는 않았다.
- 초점이 온 요소의 링은 astryx 기본이다. 키보드로 훑을 때 보이는지 한 번 본다.
