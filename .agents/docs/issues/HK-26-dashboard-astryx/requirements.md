---
key: HK-26
area: dashboard
type: feat
title: 관리 페이지 화면 층을 astryx 디자인 시스템(React 19)으로 다시 쓴다
status: approved
created: 2026-11-24
---

# Requirements — HK-26 관리 페이지 화면 층 다시 쓰기 (HK-18 의 화면 층 대체)

근거: 사용자 요청(2026-11-24) "관리 화면을 봤더니 디자인이 깨져 있다 — 가로 정렬과 세로 간격이 맞지 않는다. 컴포넌트 · 레이아웃 라이브러리가 있어야 일관되게 유지된다. Meta 의 astryx(`@astryxdesign/core`, MIT)로 화면 층을 다시 만든다." 같은 날 두 번의 디자인 방향 추가(참고 대시보드의 레이아웃 구조 · 컴포넌트 쓰임, 색은 더 나은 쪽으로 바꿔도 된다). 화면 목록과 데이터는 [설계 06](../../../../docs/design/06-dashboard.md) §3.13 · [화면기획서](../../../../docs/design/screens/index.html) S00~S13, 앞선 화면 이슈는 [HK-18](../HK-18-dashboard-ui/design.md).

요구사항에 번호를 붙여 design 과 tasks 가 같은 이름으로 부른다. 문장은 EARS 형식(언제 · 이면 · 항상)이다.

| ID | 요구 |
|---|---|
| R1 | 항상, 화면 층(`packages/dashboard/static/` 의 화면 파일)은 React 19 + astryx 컴포넌트로 만든 번들이다. 서버(`packages/dashboard/src`) · REST API · 서버 시험은 번들을 싣는 데 꼭 필요한 것 말고는 바꾸지 않는다. |
| R2 | 항상, 모든 화면은 같은 틀(`Page`: 이동 경로 · 제목 · 한 줄 설명 · 도구 + 같은 본문 간격)을 쓰고, 간격 · 글자 · 색은 astryx 토큰(컴포넌트 속성 단계 · `var(--spacing-*)` · `var(--color-*)`)으로만 준다. 화면 코드에 하드코딩한 `#hex` · 임의 `px` 간격이 없다(SVG 그림 치수 · 구조 폭 제외). |
| R3 | 사용자가 `npx harness-kit` 을 설치할 때 빌드하는 것은 없다. React · astryx · StyleX · esbuild 는 `packages/dashboard-ui` 의 devDependency 이고, 결과(JS · CSS)는 `packages/dashboard/static/app/` 에 커밋하는 생성물이다. CLI 런타임 의존성은 0 이다. CDN · 원격 글꼴이 없고, 라이선스 문구는 `static/vendor/THIRD-PARTY-LICENSES.txt` 에 모은다. |
| R4 | 화면은 기존 CSP(`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`)를 약하게 하지 않고 돈다: 인라인 `<script>` · 인라인 `<style>` · `style` 속성 문자열이 없고, 브라우저 콘솔의 CSP 위반이 0건이다. |
| R5 | 테마는 astryx `defineTheme` 로 만들어 미리 빌드한 CSS 파일로 싣는다. 라이트가 기본이고(필수) 다크는 만들지 않는다. 의미 색(설계 · 구현 · 반영 · 처리할 일)은 테마 토큰으로 한 곳에서 정한다. |
| R6 | 화면마다 HK-18 과 같은 데이터 계약을 지킨다: 같은 REST 경로, 같은 PIN · 승인 흐름(탭마다 한 번), 읽기 전용이면 쓰기 단추가 꺼진다, 여러 프로젝트 `--all` 모드(`/p/<id>` 접두 · 전체 프로젝트), 서버가 만든 문서 HTML 한 자리만 DOM 으로 옮긴다. |
| R7 | 화면 S00~S13 과 승인 패널 · 세션 요청 시트 · 흐름 보기(React Flow)가 모두 새 화면 층에서 돈다. 흐름 보기는 React 복사본 하나를 공유하는 화면 안의 컴포넌트이고, 열 때만 받는 조각으로 늦게 불러온다. |
| R8 | 접근성: 모든 조작이 키보드로 되고, 초점이 보이고, 상태는 색만으로 말하지 않고(글자 · 아이콘 함께), `prefers-reduced-motion` 을 따른다. |
| R9 | 반응형: 폭 320 · 768 · 1024 · 1440 에서 문서 가로 스크롤이 없다. |
| R10 | 이슈 상세(S03)는 진행 보드(S02)에서 오른쪽 시트로 열리고, 전체 화면 주소(`/issues/<키>`)도 그대로 있다. |
| R11 | 화면에 없는 데이터를 지어내지 않는다. 숫자 카드 · 차트 · 점 격자는 서버 API 가 주는 값으로만 그린다. 날마다의 원본이 없으면 그리지 않는다. |
| R12 | 내보내기(`harness-kit dashboard --export` 정적 HTML)는 새 화면 층에서도 같이 동작하거나, 달라진 점을 design 에 적는다. |
| R13 | 토큰 원칙: 화면 층은 세션에 컨텍스트를 더 싣지 않는다(관리 페이지는 세션에 주입되지 않는다). 화면에서 모델을 부르지 않는다. |
| R14 | 번들 크기 예산: 화면 JS(흐름 보기 제외) gzip 300KB 이하를 목표로 하고, 못 맞추면 크기를 보고한다. |

범위 밖: 서버 · API 변경, Python 스크립트 · CLI 명령 · `packages/templates/**` 변경, `docs/design/**`(사람이 승인한 설계) 수정, 다크 테마, 3D 시각화.
