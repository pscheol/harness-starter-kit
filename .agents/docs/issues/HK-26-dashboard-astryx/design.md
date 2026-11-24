---
key: HK-26
area: dashboard
type: feat
title: 관리 페이지 화면 층을 astryx 디자인 시스템(React 19)으로 다시 쓴다
status: in-review
created: 2026-11-24
---

# Design — HK-26

근거: [requirements](requirements.md), [설계 06](../../../../docs/design/06-dashboard.md) §3.13 · §3.16~§3.19, [화면기획서](../../../../docs/design/screens/index.html) S00~S13, [HK-18 design](../HK-18-dashboard-ui/design.md)(데이터 계약 · 화면별 API) · 같은 이슈 `tasks.md` 끝의 "화면 층에서 본 문제". `docs/design/**` 은 사람이 승인한 설계라 고치지 않았고, 달라진 곳은 §8 표에 이유와 함께 적었다.

요구사항 ID(R1~R14)는 requirements 와 같다.

## 1. 한눈에

| 자리 | 내용 |
|---|---|
| `packages/dashboard-ui/` | 새 패키지(`@harness-kit/dashboard-ui`, private). React 19 · astryx · StyleX · lucide · @xyflow/react · esbuild 는 모두 devDependency, 런타임 의존성 0. `pnpm -C packages/dashboard-ui build` 가 `static/` 에 쓴다 |
| `packages/dashboard/static/` | `index.html` · `app/main.js` · `app/main.css` · `app/chunks/*.js`(늦게 받는 화면 · 공유 조각) · `vendor/THIRD-PARTY-LICENSES.txt`. 커밋하는 생성물이다(HK-18 의 `flow.bundle.js` 와 같은 방식) |
| `packages/flow-view/` | 소스 패키지로 바뀌었다(React Flow 컴포넌트 + 시험). 자체 번들 · 빌드 스크립트는 없어졌다. dashboard-ui 가 `@flow-view/*` 별칭으로 소스를 읽어 화면 번들 안의 늦게 받는 조각(`FlowView-*.js`)으로 만든다 → React 복사본 하나 |
| `packages/dashboard/src` · API · 서버 시험 | **바뀐 것 없음**. `static.test.ts` 만 새 파일 배치에 맞게 다시 썼다 |
| `packages/cli/build.mjs` · `scripts/gen-plugins.mjs` | 바뀐 것 없음. `static-map.mjs` 가 `static/` 을 통째로 읽어 `__HK_STATIC__` 로 넣는 방식 그대로다 |
| 루트 `package.json` | `build:ui` · `test:ui` 추가, `gen` 은 `build:ui` → `build` → `gen-plugins` 순서 |

`packages/dashboard-ui/`:

```
build.mjs  csp-plugin.mjs  AGENTS.md(astryx init)  themes/harness/*(theme editor 원본)
src/main.tsx  App.tsx                 진입 · 틀(AppShell + SideNav) · 화면 늦게 불러오기
src/lib/      api · router · store · hooks · format · proposal · search · pin   (DOM 없는 것은 vitest 로 시험)
src/ui/       Page(틀) · common(공용 부품) · charts · GateRail · Pin · Dispatch · ServerHtml · SearchBox · icons
src/views/    Home Projects Progress Flow Issue IssueDetail Approve Docs Questions Verify Workspace Skills Harness Ops Intake Usage
src/themes/harness/*   astryx theme build 산출물(커밋)      src/css/{main,app}.css
test/         api · state · format · build
```

## 2. 방향: 참고 대시보드에 맞춘 구조 · 컴포넌트 쓰임

사용자가 보여 준 참고 대시보드(분석 앱)의 **레이아웃 구조와 컴포넌트 쓰임**을 가져왔다. 상표 · 이름 · 그림은 가져오지 않았다. 맞춘 곳 · 맞추지 않은 곳:

| 참고 화면의 구조 | 이 구현 |
|---|---|
| 왼쪽 레일: 작업 공간 머리 + 작은 대문자 묶음 이름 아래 아이콘 + 글자 + 오른쪽 개수 알약, 선택은 옅은 회색 바탕 굵게, 바닥에 저장 공간 카드 | `AppShell` + `SideNav` + `SideNavSection`(작업 · 품질 · 운영 · 프로젝트). 개수 알약 = 처리할 일 · 승인 · 검증 · 정리(기존 `badges()`). 바닥 카드 = **지금 세션 컨텍스트 사용률**(`/usage/now`, 진짜 값) + 연결 상태 |
| 이동 경로 알약 · 큰 제목 · 한 줄 설명 · 도구 줄 | `Page`: `Breadcrumbs`(supporting) · `Heading` 1 · 설명 · 도구(보기 전환 · 찾기) — 모든 화면이 같은 한 곳에서 |
| 숫자 카드 3~4개(이름 · 큰 숫자+단위 · 증감 알약 · 작은 그림) | `Stat`(홈: 처리할 일 · 승인 대기 · 열린 질문 · 남은 Bolt + 스파크라인, 사용량: 토큰 · 요청 · 캐시 · 추정 비용). **API 가 주는 값만**. 증감 알약은 전 기간 값이 없는 곳에는 두지 않았다 |
| 구역 머리: 굵은 이름 + 흐린 설명 + 오른쪽 링크 | `Section` |
| 큰 차트 카드 + 범위 구분 선택, 실선 + 점선 비교 | S12 "남은 일"(실선 = 남은 Bolt, 점선 = 이상선), S13 "하루 토큰 · 역할별" · "캐시 읽기 비율". 범위 구분 선택(오늘 · 7일 · 30일). 호버 값은 아래 한 줄 + `<title>` |
| 점 격자 달력(덜 ○ 더 ●) | S13 "하루 활동"(`DotMatrix`): 날마다 토큰 합계 — **날마다의 값이 있을 때만**. 승인 기록(`approvals-log`) 쪽 날짜별 집계 API 는 없어 그리지 않았다(R11) |
| 오른쪽에서 밀려 나오는 상세 시트(지표 띠 · 작은 카드 · 팀 표) | S02 에서 이슈를 누르면 `Drawer`(폭 680)에 **이슈 상세**: 게이트 레일 · `StatStrip`(현재 게이트 · 남은 Bolt · 리뷰 지적 · 검증) · 문서 탭 · 승인 패널. `/issues/<키>` 전체 화면 주소도 그대로(같은 `IssueDetail`) |
| 팀 표(아바타 + 역할 + 숫자 + 막대) | S01 · S07 · S00 의 세션 목록(`List`: 하네스 배지 · 역할 · 이슈 · 상태). 줄마다 작은 막대는 활동 기록이 없어 두지 않았다 |
| 3D 막대 | 만들지 않았다(요구 밖, 선택 항목). 격자(점 격자)가 먼저다 |
| 한 가지 강조색(타는 주황), 회색 바탕 | §4: 강조색을 **graphite(따뜻한 먹색)** 로 바꿨다 |

astryx 템플릿(`astryx template shell-side-nav · dashboard-comparison · detail-page · table-page`)은 `--skeleton` 으로 틀 · 간격 · 패딩을 읽고 따랐다(AppShell → Layout → LayoutHeader/Content, 카드 대신 행(`Table` · `List`), `Grid columns={{minWidth}}`, 폭 예산). 파일 그대로 복사하지는 않았다: 템플릿은 StyleX 컴파일러 · recharts · heroicons 를 요구하는데 이 패키지는 컴파일러 없이(미리 빌드된 `astryx.css` + 토큰) 가고 차트는 직접 그린다.

## 3. CSP 확인(spike) 결과

**astryx 는 화면 CSP(`style-src 'self'`)를 약하게 하지 않고 돈다.** 처음 그대로 묶어 실제 `dashboard` 서버에서 열었을 때(Playwright, 서버가 주는 CSP 머리 그대로):

| 항목 | 결과 |
|---|---|
| StyleX | 빌드된 `@astryxdesign/core` 의 JS 는 이미 클래스 이름만 낸다. 실행 중 규칙을 만들지 않는다. StyleX 컴파일러 · 플러그인이 필요 없다(`xstyle` 을 쓰지 않으므로). `@stylexjs/stylex` 는 런타임 헬퍼로만 묶인다 |
| 컴포넌트 CSS | `@astryxdesign/core/astryx.css`(미리 빌드, 314KB) + `reset.css` + 테마 CSS 를 esbuild 가 `app/main.css` 한 파일로 묶는다 → `<link rel="stylesheet">` |
| 테마 | `astryx theme build` 로 CSS 파일 + `__built: true` 모듈을 만든다. `Theme` 은 빌드된 테마에서는 `<style>` 을 만들지 않는다(실행 중 주입은 빌드하지 않은 테마만) |
| React `style` 속성(props) | CSSOM(`element.style.x = …`)이라 막히지 않는다. HTML 문자열로 넣은 `style="…"` 가 아니다 |
| **인라인 `<style>` 두 곳** | `Layer/layerSlideRules.js`(팝오버 · 드롭다운 위치 규칙 17KB, `ensureSlideRules`)가 `<style>` 을 만들어 **CSP 위반 1건**이 났다. `privateAttributes/scrollAnchoring.stylex.js` 도 같은 꼴(채팅 스크롤용, 이 화면에서는 안 불림). 둘 다 `csp-plugin.mjs`(esbuild `onLoad`)가 `new CSSStyleSheet().replaceSync()` + `document.adoptedStyleSheets` 로 바꾼다 — CSSOM 이라 CSP 가 막지 않는다. 바꿀 문장을 못 찾으면 **빌드가 멈춘다**(astryx 판을 올릴 때 알아챈다) |
| 번들에 남은 `createElement("style")` 3곳 | ① astryx `touchActionRule`: constructable stylesheet 이 없는 엔진에서만 가는 대체 경로(`adoptedStyleSheets` 가 먼저) ② react-dom `<style precedence>` 렌더 경로(안 씀) ③ astryx `Theme` 의 빌드하지 않은 테마 주입 경로(우리 테마는 빌드됨, `__built`). 시험(`build.test.ts`)이 이 셋 말고는 없음을 지킨다 |
| 글꼴 | CSP 에 `font-src` 가 없어(`default-src 'none'`) 웹폰트는 data: 도 안 된다. 테마 글꼴은 시스템 글꼴(`system-ui`, Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic …)이다. `static-map` 이 파일을 문자열로 읽으므로 바이너리 자산도 못 싣는다 |
| 결과 | Playwright 로 모든 화면 · 대화상자 · 시트 · 드롭다운을 열었을 때 콘솔 CSP 위반 **0건**(의도한 `/ops` 501 응답 한 줄만). 폭 4종 · 키보드 흐름 포함 |

첫 spike(AppShell · SideNav · Card · Table · Selector · Dialog 한 페이지): JS 1,175,613바이트(gzip 385,146), CSS 356,796바이트(gzip 56,893). astryx 코어가 919KB(minify)로 가장 크다 — Dialog · AppShell 이 gestures · motion · BottomSheet 를 끌고 온다. §5 크기 참고.

## 4. 테마 · 색

테마는 `astryx experimental theme editor` 로 만든 `harness`(`themes/harness/`, 결과는 `src/themes/harness/` 에 `astryx theme build` 산출물로 커밋)에 손으로 더한 것은 `harness.theme.ts` 의 글꼴 · `--hk-*` 토큰뿐이다. 라이트만(`colorModes: ['light']`) — 다크는 만들지 않았다(화면기획서 제외 범위, 요구 R5 의 "선택").

**색 결정**(사용자: "색상은 더 나은 방향이 있다면 개선해도 됩니다"). 기준 4가지와 그 답:

1. 무채색이 이끄는 조용한 바탕 + 강조색 하나 → `neutral #78716c`(따뜻한 회색, 바탕 · 표면 · 글자), **강조색 `accent #2f2b27`(graphite)**: 선택 · 주 단추 · 큰 숫자 · 차트 강조 · 초점. 참고 화면의 주황은 **쓰지 않았다**: 주황은 앰버(구현 · 검증 · 경고)와 가까워 "강조"와 "의미"가 섞이고, 색각 이상에서 구분이 더 어렵다.
2. 의미가 한눈에 읽히되 **색만으로 말하지 않는다** → 설계 / 구현·검증 / 통과·운영 / 처리할 일·실패는 항상 **글자 + 아이콘(또는 모양)과 함께** 쓴다: 상태 칩(`Tag`)은 글자를 담고 실패 · 경고 · 승인 대기는 아이콘이 붙는다. 게이트 레일은 모양(속 찬 마름모 = 지남, 속 빈 굵은 테두리 = 진행 중, 고리 + 속 찬 빨강 = 사람 승인 대기, 옅은 = 아직)과 아래 글자 이름이 같이 간다.
3. 차트 계열은 astryx 데이터 시각화 토큰(`--color-data-*`)을 쓴다: 역할별 막대 = blue-3 · orange-3 · neutral · teal-3, 비교선 = `--color-data-neutral`, 강조 = `--color-accent`. 가로 막대는 가장 큰 값만 강조색, 나머지는 `--color-data-neutral`.
4. 라이트가 먼저, 다크는 선택 → 라이트만.

팔레트(실측 대비는 흰 바탕 기준, WCAG 계산식):

| 토큰 | 값 | 쓰임 | 흰 바탕 대비 |
|---|---|---|---|
| `--color-accent` | `#2f2b27` | 선택 · 주 단추 · 강조 | 14.0:1 |
| `--hk-design` | `#4a5fb8` | 게이트 레일 설계 구간 · 단계 막대 | 5.8:1 |
| `--hk-build` | `#b07a1a` | 구현 · 검증 구간 | 3.7:1 |
| `--hk-ops` | `#2f8a73` | 반영 · 운영 구간 | 4.2:1 |
| `--hk-gate` | `#c0392b` | 사람 승인 대기 · 실패 | 5.4:1 |
| `--hk-todo` | `#87827c` | 아직 | 3.4:1 |
| 칩 | astryx `Badge` 변형 blue · yellow · teal · red · neutral | 작은 상태 칩 | 컴포넌트 기본(4.5:1 이상 검증됨) |

색각 이상 확인(Machado 행렬로 적록색약 · 적색약 시뮬레이션, `--hk-*` 4색): 빨강(gate)과 청록(ops) · 앰버(build)는 두 유형 모두에서 색상으로는 거의 같은 밝기 · 색조로 보인다(명도 대비 1.05~1.9:1). 그래서 위 2번(모양 + 글자 + 아이콘)이 의미를 지는 장치이고 색은 보조다. 차트는 색 말고도 값 글자 · `<title>` · "표로 보기"가 같이 간다.

## 5. 빌드 · 번들 크기 (R3 · R14)

`pnpm -C packages/dashboard-ui build`(esbuild 0.28.2, ESM, `splitting: true`, minify, `process.env.NODE_ENV` 정의, CSS 는 `main.css` 한 파일). 같은 소스 · 같은 판이면 같은 바이트(시험이 지킨다). 설치할 때 빌드하는 것은 없다 — 사용자 설치 · CLI 는 커밋된 `static/` 만 읽는다.

| 파일 | 크기(raw) | gzip |
|---|---|---|
| `app/main.js`(진입 + React 18KB 정도 + 라우터) | 110,092 | 29,173 |
| `app/main.css`(astryx 314KB + 테마 + React Flow + 앱 보정) | 356,094 | 57,497 |
| 공유 조각 중 가장 큰 것(react-dom) | 444,057 | 149,409 |
| `app/chunks/FlowView-*.js`(흐름 보기, 늦게 받음) | 185,541 | 60,998 |
| 화면 JS 전체(조각 합 · 흐름 포함) | 1,712,802 | 590,349 |
| 화면 JS 전체에서 흐름 제외 | 1,527,261 | 529,351 |
| `vendor/THIRD-PARTY-LICENSES.txt` | 28,362 | — |

**예산(app JS < 300KB gzip, 흐름 제외)은 못 맞췄다.** 한 화면을 열 때 브라우저가 받는 JS(Playwright 의 resource 목록으로 센 `main.js` + 공유 조각 + 그 화면, 같은 바이트를 gzip 으로 센 값):

| 화면을 연 직후 받은 JS | 조각 수 | raw | gzip |
|---|---|---|---|
| S01 홈 | 34 | 1,249,931 | 421,947 |
| S12 흐름(캔버스 조각 `FlowView` 제외) | 38 | 1,351,468 | 460,517 |
| S12 흐름의 캔버스 조각(늦게, 흐름을 열 때만) | 1 | 185,541 | 60,998 |

공유 몫이 크다: react-dom 149KB(gzip) + astryx 코어(gestures · motion · BottomSheet · Layer · Selector · Table · AppShell · Dialog)가 합쳐 대부분이다. 안 쓰는 모듈(CodeBlock · DateInput · Chat…)은 이미 빠져 있고, 남은 것은 AppShell · Dialog · Drawer · Selector · Table 이 끌고 오는 것이다. 더 줄이려면 astryx 소스를 swizzle 하거나 컴포넌트를 덜 쓰는 수밖에 없다 — 이번 이슈에서는 하지 않았다. 서버가 `Cache-Control: no-cache` 로 주므로 첫 방문 뒤에는 304 로 다시 받는다. 후속 후보: ① Dialog · Drawer 를 처음 열 때까지 늦게 불러오기(`React.lazy`) ② `Table` 대신 `List` 로 바꿀 수 있는 화면 줄이기. 시험(`build.test.ts`)은 지금 값에서 크게 늘지 않게 상한(조각 합 gzip 520KB)을 지킨다.

CLI 번들: 화면 파일은 `__HK_STATIC__` 문자열로 `packages/cli/dist/cli.js`(= 플러그인 사본)에 들어간다. 옛 화면 파일(216KB) + 흐름 번들(379KB) 대신 새 화면 파일 약 2.1MB 가 들어가 `cli.js` 가 커진다(§9 실측). 런타임 의존성은 여전히 0이다.

## 6. 화면 구성 · 코드 규칙

- 틀: `AppShell`(`sideNav` 슬롯, 좁으면 astryx 가 모바일 드로어를 만든다 · 본문 건너뛰기 링크도 astryx) → `Layout`(`LayoutHeader` + `LayoutContent`) = `Page`. 제목은 모든 화면에서 같은 자리 · 같은 크기이고 이동 뒤 `h1` 로 초점이 가되 링은 끈다(제목은 조작 요소가 아니다).
- 간격: 모든 가로 · 세로 간격은 `VStack` · `HStack` · `Grid` · `Panel` 의 `gap` · `padding` 단계(토큰)이고, 본문 사이 간격은 `Page` 한 곳(`gap={5}`), 패널 안은 `Panel` 한 곳(`gap={3}`, 안쪽 4)이다. 화면 파일에는 간격 숫자가 흩어져 있지 않다.
- 데이터: 줄 단위 기록 = `Table`(열) · `List`/`ListItem`(한 줄), 카드마다 하나씩 쌓지 않는다. 좁은 폭에서는 `Seg` 가 드롭다운으로 바뀌고 `TwoCol` 이 한 칸으로 쌓인다.
- 원시 요소: `div` · `span` 을 쓰지 않는다. 예외 — 차트 폭을 재는 `div`(`hk-chart`), 첨부 파일 `input type=file`(astryx 에 없음), `ServerHtml`(문서 본문 한 자리). SVG(게이트 레일 · 차트 · 점 격자)는 토큰 색 변수(`var(--hk-*)` · `var(--color-*)`)만 쓰고 치수는 그림 안 구조 값이다.
- 앱 CSS(`app.css`, 약 200줄)는 astryx 에 없는 것만: 게이트 레일 · 차트 축 글자 · 막대 · 문서 본문 · 흐름 캔버스 틀 · 흐름 노드가 쓰는 옛 변수를 astryx 토큰에 잇는 표. 하드코딩 색은 없다.
- 서버 HTML 은 `ui/ServerHtml.tsx` 하나(DOMParser 로 풀어 `script · iframe · object · embed · link · meta · style · base · form` 과 `on*` · `style` · `javascript:` 를 지우고 `replaceChildren`). `innerHTML` 은 쓰지 않는다.
- 링크: astryx `LinkProvider` 에 `AppAnchor`(앱 경로 → `/p/<id>` 접두 + 같은 문서 이동)를 넣어 `Button href` · `ListItem href` · `Link` 가 모두 같은 라우터를 쓴다. 모드가 바뀌는 링크(`/p/<id>/…` · `/?hard=1`)는 새 문서로 읽는다.

## 7. 화면별 구성 (S00~S13)

| 화면 | astryx 구성 | 템플릿에서 따른 것 | 데이터(HK-18 과 같음) |
|---|---|---|---|
| 틀(레일) | `AppShell` · `SideNav`(`SideNavHeading` · `SideNavSection` · `SideNavItem` + 개수 `Badge`) · 바닥 `Card` + `ProgressBar` | shell-side-nav | `session` · `overview`(5초, ETag) · `usage/now`(15초) |
| S01 홈 | `Grid` 숫자 `Stat` 4 · `TwoCol`(처리할 일 묶음 `Panel` + `List` / 세션 · Intent · 단계 막대) | dashboard-comparison | `overview` · `issues` · `sessions` · `intents` · `intents/{k}/burn` |
| S02 진행 | `Seg` 거름 · Intent 별 `Panel` + `Table`(게이트 레일 · Bolt `ProgressBar`) · `Drawer`(이슈 상세) | table-page + 오른쪽 시트 | `intents` · `issues` · `sessions` |
| S03 이슈 | `Breadcrumbs` · `TabList` · `StatStrip` · `Panel` · `TextArea`(편집) · 승인 `Panel`(`TextArea` · `Button` · `CheckboxInput`) | detail-page | `issues/{k}` · `docs` · `PUT docs` · `approvals` · `reviews` |
| S04 질문 | `Panel` + `RadioList` + `TextArea` | — | `questions` · `POST answer` |
| S05 세션 요청 | `Drawer` + `RadioList` · `Selector` · `CheckboxInput` · `TextArea` | — | `sessions` · `POST /dispatch`(이 시트에서만) · `dispatch/queue` |
| S06 검증 | `Grid` 검사 타일 · `HBars` 단계 시간 · `Table` · `List` | — | `verify` · `reports/*` · `issues` |
| S07 작업 공간 | `Table`(worktree 판정) · `List`(세션 · 대기함) | — | `worktrees` · `sessions` · `dispatch/queue` |
| S08 스킬 | `Table` · `Seg` · `Selector` · `CheckboxInput` · `TwoCol` | — | `skills` |
| S09 하네스 | `Panel` · `Table`(게이트 · 승인자) · `List`(역할) | settings | `harness` · `usage/kit` · `POST harness/outdated` |
| S10 운영 | `Notice` + `Empty`(501 이면 제공 예정) | — | `ops`(HK-21) |
| S11 새 요구사항 | `TabList` · `TextInput` · `Selector` · `TextArea` · 폭 760 | contact-form | `POST intake`(HK-19, 지금 501) |
| S12 흐름 | `FlowCanvas`(React Flow 조각) · `Panel` · `LineChart` · 변경 제안 폼 · `Dialog`(흐름 틀) | canvas-editor 틀 | `flow` · `intents/{k}/burn` · `POST units/proposals` |
| S13 기록 · 사용량 | `Stat` · `StackedBars` · `HBars` · `LineChart` · `DotMatrix` · `TabList` | dashboard-comparison | `usage` · `usage/now` · `usage/kit` · `history` |
| S00 전체 프로젝트 | `TwoCol`(처리할 일 `List` / 프로젝트 `Card` + `SegBar`) | — | `projects` · `projects/overview` · `sessions?scope=machine` |

## 8. 설계(화면기획서 · 06)와 다르게 한 것

| 설계 | 이 구현 | 이유 |
|---|---|---|
| 화면기획서 `assets/app.css`: 네이비 레일 · 의미 색을 화면 전체에(파랑 = 설계, 앰버 = 구현, 청록 = 통과, 빨강 = 처리할 일) | 레일은 astryx `SideNav` 기본(밝은 면), 바탕은 무채색, 강조색은 graphite 하나, 의미 색은 작은 상태 칩 · 게이트 레일에만(낮은 채도) | 사용자 방향(참고 대시보드 + "색은 더 나은 쪽으로"). 정렬이 깨진 원인이 화면마다 직접 짠 간격 · 색이었다. 의미는 글자 · 아이콘 · 모양과 함께(§4) |
| 06 "빌드 단계 없는 번들한 정적 파일"의 화면 | 같은 약속을 지킨다: 미리 빌드해 커밋. 화면 파일이 JS 1.7MB · CSS 0.36MB 로 커졌다 | astryx 코어가 크다(§5). CLI 런타임 의존성은 0 |
| HK-18: 화면 코드 JS 450KB 이하 시험 | 한 파일 450KB 이하 + 전체 3MB 이하(`static.test.ts`), 번들 안에서는 gzip 상한(`build.test.ts`) | 번들러가 조각으로 쪼개는 구조라 기준을 파일 · 합계로 나눴다 |
| HK-18 레일의 네이비 + 프로젝트 고르기 팝오버 | `SideNavHeading` 에 리포 이름, 전체 프로젝트로 가는 항목은 레일의 "프로젝트" 묶음 | `SideNavHeading.menu` 는 팝오버 안에 링크를 넣는 방식이라 키보드 · 접근성이 단순한 레일 항목이 낫다 |
| S01 영역 13 · 14(14일 추이) · S06 시간 추이 | HK-18 과 같이 두지 않았다 | 날마다 저장하는 원본이 없다(HK-18 §7). S01 의 남은 Bolt 스파크라인은 `burn` API 값이다 |
| 화면기획서 S13 점 격자 · 참고 화면의 점 격자 | `하루 활동`: 하루 토큰 합계(사용량이 켜져 있을 때만) | 승인 기록의 날짜별 집계 API 가 없어 그것으로는 그리지 않았다(R11) |
| 06 `window.mount(el, props)` 식 흐름 번들 | 같은 앱 안의 `React.lazy` 컴포넌트(`FlowView`) | 요구: React 복사본 하나. `mount` 용 진입(`flow-view/src/index.tsx`)과 `flow-view` 의 자체 빌드는 지웠다 |
| HK-18 `flow.bundle.css` 별도 파일 | 화면 CSS 한 파일(`main.css`) 안에 React Flow CSS 포함 | CSP 때문에 CSS 는 파일이어야 하고, 한 파일이 요청이 적다 |
| 흐름 노드 모양(`flow-view/src/flow.css`) | 옛 변수 이름을 astryx 토큰에 잇는 표(`app.css` 의 `.react-flow` 블록)로 색 · 글꼴을 맞췄다. 노드 마크업은 그대로 | 노드를 astryx 컴포넌트로 다시 그리면 flow-view 시험 · 접근성 글을 새로 짜야 한다 — 후속 |
| 06 §3.15 레일의 읽기 전용 표시 | 레일 바닥 글(연결 상태)과 화면 위 안내 띠 | 같은 정보를 `SideNav footer` 로 옮겼다 |

서버에서 바꾼 것: **없음**(`packages/dashboard/src`). 내보내기(`--export`)는 `export.ts` 가 만드는 독립 HTML 이라 화면 층과 무관하게 그대로 동작한다(R12).

## 9. 시험 · 확인 결과

| 명령 | 결과 |
|---|---|
| `pnpm -C packages/dashboard-ui test` | 타입 검사 + vitest 4파일 **30개 통과**(API 클라이언트 · 상태 · 라우터 · 찾기 · PIN · 제안 · 포맷, 번들 같은 바이트 재현 · CSP · 외부 요청 · 라이선스 · 크기) |
| `pnpm -C packages/flow-view test` | 타입 검사 + 4개 통과(소스 외부 요청 없음 · 의존성 포함) |
| `pnpm -C packages/dashboard test` | 타입 검사 + vitest 13파일 **136개 통과**(`static.test.ts` 를 새 배치에 맞게 다시 씀, 서버 시험은 그대로) |
| `pnpm -C packages/cli test` | 타입 검사 + vitest 33파일 **410개 통과** |
| `pnpm -C packages/cli build` → `node scripts/gen-plugins.mjs` → `--check` | 생성물 일치(파일 416개). `dist/cli.js` 2,702,136바이트(HK-18 의 1,277,879 에서 +1.4MB: 화면 파일이 문자열로 들어간다) |
| `python3 -m unittest tests.test_template_wording tests.test_generated` | 23개 통과 |

Playwright(`packages/dashboard/scripts/demo-fixture.mjs` + `demo-serve.mjs` 로 연 임시 리포):

- 1440 폭 스크린숏 `.agents/docs/issues/HK-26-dashboard-astryx/screens/`: S00(단일 · `--all`) · S01 · S02(시트 열림 포함) · S03(읽기 전용 포함) · S04 · S06 · S07 · S08 · S09 · S10 · S11 · S12 · S13(사용량 · 기록) · 문서. 320 · 768 · 1024: S01 · S02 · S03 · S13(+ S12 320).
- 문서 가로 스크롤: 320 · 768 · 1024 · 1440 에서 화면 15곳 모두 `scrollWidth == innerWidth`.
- 콘솔 CSP 위반 **0건**. 콘솔 오류는 의도한 `/ops` 501 한 줄, 전체 프로젝트 모드의 최상위 `/session` 404(모드 판정 요청) 뿐.
- 승인 PIN(키보드): 승인 문구 → "승인하고 기록" → PIN 대화상자(입력 칸에 초점) → 입력 + Enter → 문서 `status: approved`. 흐름: 첫 노드에 초점 → Enter 로 선택(주소에 `sel=`, 곁 칸에 "고름 풀기") → Esc 로 풀림. 시트: 이슈 버튼 → 시트 → Esc 로 닫힘.
- 읽기 전용(`--read-only`): 승인 단추 꺼짐 · 편집 단추 없음 · 홈에 읽기 전용 띠 · 접수 단추 꺼짐. 여러 프로젝트(`--all`): 전체 프로젝트 화면 → 프로젝트 열기(`/p/<id>/`) → 그 안 `/progress` 이어짐.

## 10. 사람이 눈으로 확인할 것

화면 모양(밀도 · 색 · 간격)은 사람이 보지 못했다. 스크린숏을 보고 정한다. 특히: ① graphite 강조색과 낮은 채도 칩이 조용해 보이는지, 처리할 일이 눈에 먼저 들어오는지 ② 320 폭에서 표 안쪽 가로 스크롤(진행 표)이 쓸 만한지 ③ 흐름 캔버스 노드 안쪽(옛 CSS)이 다른 화면과 같은 결인지 ④ 키보드 초점 링.
