---
key: HK-18
area: dashboard
type: feat
title: 관리 페이지 화면 · 흐름 보기(React Flow) · 전체 프로젝트 · 기록 · 사용량 · 스킬 목록
status: in-review
created: 2026-11-24
---

# Design — HK-18

근거: [requirements](requirements.md), [설계 06](../../../../docs/design/06-dashboard.md) §3.13 · §3.15 · §3.16~§3.19, [07](../../../../docs/design/07-skills-inventory.md) SK-R1~R15, [화면기획서](../../../../docs/design/screens/index.html) S00~S13, [README](../../../../docs/design/README.md) 원칙 7 · 9 · 10. 선행: HK-17(서버 · API · 번들 연결, [design](../HK-17-dashboard-server/design.md)), HK-24(`hook-output.jsonl`).

요구사항 문서의 항목에 번호를 붙여 이 문서와 tasks 가 같은 이름으로 부른다.

| ID | 요구 |
|---|---|
| R1 | 화면기획서 S00~S13 을 실제 화면으로. 빌드 단계 없는 번들한 정적 파일, CDN 없음 |
| R2 | 흐름 보기(S12)는 새 패키지 `packages/flow-view`(React Flow)를 미리 묶은 파일로 싣는다 |
| R3 | 전체 프로젝트(S00) 화면. 등록부 · `--all` · `--root` · `--workspace`(서버는 HK-17) |
| R4 | 기록 · 사용량(S13) 서버 · 화면. 대화 기록 읽기는 기본 꺼짐(DB-R28) |
| R5 | 스킬 목록(S08) 서버 · 화면(07 SK-R 전부) |
| R6 | 접근성(키보드 · 색만으로 말하지 않음) · 로딩 · 빈 · 오류 · 읽기 전용 상태 |
| R7 | 화면에 모델을 부르는 버튼이 없다. 세션 요청은 사람이 고를 때만 나간다(DB-R25 · R26) |
| R8 | 화면에만 있는 기능이 없다(원칙 9): `skills` · `usage` · `history` 명령, `/intents/{key}/burn` 의 콘솔 대응 |

## 1. 구성

| 자리 | 내용 |
|---|---|
| `packages/dashboard/static/` | `index.html` · `app.css` · `js/*.js`(ES 모듈, 화면마다 하나) · `vendor/flow.bundle.js` · `vendor/flow.bundle.css` · `vendor/THIRD-PARTY-LICENSES.txt` |
| `packages/flow-view/` | React Flow 소스(`src/`), `build.mjs`(esbuild, 번들 한 파일 + CSS 한 파일). devDependency 로만 react · react-dom · @xyflow/react. `pnpm -C packages/flow-view build` 가 `static/vendor/` 에 쓴다. 번들은 커밋하는 생성물이다 |
| `packages/dashboard/src/skills.ts` · `yaml-lite.ts` | 스킬 스캐너(07) · SKILL.md 머리용 작은 YAML 해석기(런타임 의존성 0) |
| `packages/dashboard/src/usage.ts` | 사용량 · 지금 세션 · 킷이 덧붙인 양 · 프롬프트 기록(06 §3.18) |
| `packages/dashboard/src/burn.ts` | 남은 Bolt 계단선(`/intents/{key}/burn`) |
| `packages/cli/src/commands/{skills,usage}.ts` | `skills` · `usage` · `history` 명령. `reserved.ts` 에서 `skills` · `usage` 를 뺀다 |

화면 파일은 HK-17 방식 그대로 `build.mjs` 가 `__HK_STATIC__` 로 CLI 번들 한 파일에 넣는다. 서버가 `/vendor/flow.bundle.js` 를 흐름 보기를 열 때만 받게 하려고, 화면은 `import()` 로 흐름 보기 모듈을 늦게 불러온다(06 완료 기준 20). 화면 CSP(`script-src 'self'; style-src 'self'`)는 그대로다: 화면 코드는 `style` 속성 문자열 · 인라인 스크립트 · `innerHTML`(서버가 만든 문서 HTML 한 자리만)을 쓰지 않는다. 시험이 이를 지킨다.

## 2. 화면 짜임

- 틀: 왼쪽 레일(제품 표지 · 프로젝트 고르기 · 새 요구사항 · 메뉴 9개 · 바닥에 지금 세션 줄 + 연결 상태) + 머리줄 + 작업 영역. 색 · 글꼴 · 간격은 화면기획서 `assets/app.css` 의 토큰을 가져와 쓴다(설계 · 구현 · 반영 · 처리할 일 네 색을 뜻으로만 쓴다). 라이트가 기본이고 다크는 만들지 않는다(화면기획서 제외 범위).
- 주소: 히스토리 API 경로(`/`, `/progress`, `/issues/<키>`, …). 여러 프로젝트 모드는 `/p/<id>` 접두를 붙이고 `/` 가 S00 이다. 서버가 점(.) 없는 경로에 `index.html` 을 주므로 서버를 바꾸지 않는다.
- 갱신: 홈 · 레일은 5초마다 `overview` 를 `If-None-Match` 로 묻는다. 레일의 "지금 세션" 줄은 화면이 보일 때만 15초마다 `usage/now` 를 묻는다. 탭이 숨겨지면 멈춘다.
- 토큰: 주소 `#t=` → `localStorage["hk-token-<포트>"]` → `Authorization`(HK-17 자리표시 화면과 같다). PIN 은 탭마다 한 번 묻고 `sessionStorage` 에만 둔다. 403 `pin_required` · `pin_locked` 이면 지우고 다시 묻는다.
- 상태 4종: 로딩(뼈대, 움직임 줄이기 설정이면 정지) · 빈 · 오류(원인 코드 + 할 수 있는 일) · 읽기 전용(쓰기 버튼 대신 이유). 모든 데이터 화면이 같은 `viewState()` 를 거쳐 낸다.
- 접근성: 모든 조작은 키보드로(탭 목록은 화살표 · Home · End), `:focus-visible` 링, 상태는 글자 + 모양 + 색, 목록 갱신은 `aria-live="polite"`, 이동 뒤 `h1` 로 초점, 본문 건너뛰기 링크, `prefers-reduced-motion`. 흐름 보기 노드는 Tab · Enter · Space · Esc(06 §3.16).

화면별 데이터(06 §3.13):

| 화면 | 경로 | API | 사람이 하는 일 |
|---|---|---|---|
| S00 전체 프로젝트 | `/` (여러 프로젝트) · `/projects` | `projects` · `projects/overview` · `sessions?scope=machine` | 묶기 · 열기 · 없는 폴더 지우는 명령 복사 |
| S01 홈 | `/` | `overview` · `session` · `sessions` | 처리할 일 → 해당 화면 |
| S02 진행 | `/progress` | `intents` · `issues` | Intent → Unit → 이슈, area · 단계 거르기 |
| S12 흐름 | `/progress?view=flow&intent=` | `flow` · `intents/{key}/burn` · `POST units/proposals` | 캔버스, 변경 제안 저장 · 버리기 |
| S03 이슈 | `/issues/<키>[/docs/<문서>]` | `issues/{key}` · `docs` · `PUT docs` · `approvals` · `reviews` | 읽기 · 고치기 · 승인 · 수정 요청 · 리뷰 판단 |
| S04 질문 | `/questions[?target=]` | `questions` · `POST answer` | 선택지 · 메모 · 답 |
| S05 세션 요청 | 측면 시트(S03 · S04 · S12 에서) | `sessions` · `POST dispatch` · `dispatch/queue` | 사람이 고를 때만 보낸다 |
| S06 검증 | `/verify` | `verify` · `reports/*` · `reviews/*` · `POST decision` | 마지막 검증 · 품질 · 리뷰 판단 |
| S07 작업 공간 | `/workspace` | `worktrees` · `sessions` · `dispatch/queue` | 정리 명령 복사 |
| S08 스킬 | `/skills` | `skills` | 단계 · 하네스로 거르기 |
| S09 하네스 | `/harness` | `harness` · `POST harness/outdated` | doctor · 층 · 역할 · 승인 권한 |
| S10 운영 | `/ops` | `ops`(HK-21, 지금 501) | 501 이면 "HK-21 에서 제공" 상태 |
| S11 새 요구사항 | `/intake` | `POST intake`(HK-19, 지금 501) | 501 이면 "HK-19 에서 제공" 상태, 접수 명령 안내 |
| S13 기록 · 사용량 | `/usage[?tab=history]` | `usage` · `usage/now` · `usage/kit` · `history` | 읽기만 |

체크포인트(S06 영역)는 HK-20(entire 모듈)이라 501 이면 그 영역을 접는다.

## 3. 스킬 목록(07)

`GET /skills?stage=&harness=&all=&refresh=` · `skills` 명령. 스캐너는 `skills.ts` 한 곳이고 서버 · CLI 가 같이 부른다.

- 읽는 곳: 07 §3.1 표 12줄(리포 4곳 + 하위 폴더(깊이 4) + 사용자 6곳 + 플러그인). 사용자 위치는 `HOME` 환경 변수(시험은 임시 폴더)에서, 내보내기 · `--no-user` · 여러 프로젝트의 리포별 읽기에서는 읽지 않는다. 리포에 쓰지 않고 `~/` 아래에 쓰지 않는다(SK-R1).
- 한 스킬 = `<위치>/<이름>/SKILL.md`. 더 깊은 것은 `nested` 로 센다(SK-R3). 파일은 앞 64 KiB 만 읽고 256 KiB 넘으면 `too-large`, 머리가 없으면 `no-frontmatter`, YAML 오류 · 심볼릭 링크 고리 · 일반 파일 아님은 `error` 로 남기고 계속한다(SK-R2 · R12 · R13).
- YAML: `yaml-lite.ts` 가 머리에 쓰이는 부분집합(맵 · 한 단계 안쪽 맵 · 문자열 따옴표 · 흐름 배열 · 블록 배열 · `|` `>` 블록 문자열)만 읽는다. 별칭(`*`) · 앵커(`&`) · 태그(`!`)는 오류로 본다(07 §3.2 "별칭 0개, 태그 금지"). 깊이 8 넘으면 오류.
- 묶기: realpath 가 같으면 한 스킬(SK-R5), sha256 같으면 `copies`, 이름 같고 sha256 다르고 같은 하네스에 `loaded` 후보면 `conflicts`(SK-R6). 하네스 규칙은 07 §3.4 표: Claude 는 user > project(진 쪽 `shadowed`), Gemini 는 project > user · 같은 층에서 `.agents/skills` > `.gemini/skills`, Codex · Cursor · Kiro 는 `both`(Cursor · Kiro 는 문서에 규칙이 없다 → 07 §6).
- 플러그인: `installed_plugins.json`(version 2) + 세 `settings` 의 `enabledPlugins` 덮어 합치기, project · local(이 리포) > user, 같은 scope 는 `lastUpdated` 가 늦은 것. 설치 기록이 없으면 캐시 폴더의 semver 최대(`cache-guess`). `installPath` 가 캐시 밖이면 `install-path` 오류. 꺼 둔 플러그인 · 이전 버전은 읽지 않는다(SK-R4).
- 단계: 지도(`.agents/skill-map.json` + 개인 층 앞 더하기) → `metadata.hx-stages` → 낱말 점수 추정(`추정`, 07 §3.8 표 그대로: 이름 3점 · 설명 1점, 2점 미만이면 `미분류`). 지도 파일이 없으면 지도 단계는 비고 추정만 나온다(기본 지도는 HK-19 가 깐다).
- 응답 형식은 07 §3.6. 경로는 `~/…` · 리포 상대. 캐시는 메모리(TTL 10분, 위치별 디렉터리 이름 + `SKILL.md` stat + 플러그인 설정 stat 이 stamp). 파일 캐시(`.agents/state/skills-cache.json`)는 두지 않는다 → §7 표.
- `GET /skills` 는 서버가 `HOME` 의 사용자 위치를 읽으므로 읽기 전용 · 여러 프로젝트 모드에서도 같다(읽기만). 내보내기에는 없다(HK-17).

## 4. 기록 · 사용량(06 §3.18)

세 출처. 앞 둘은 늘 켜져 있고 셋째는 `~/.config/harness-kit/config.json` 의 `"history": "on"` 일 때만 열린다.

| 출처 | 읽는 것 |
|---|---|
| 킷이 덧붙인 양(`/usage/kit`) | 메인 폴더 `.agents/state/hook-output.jsonl`(`{at, event, hook, bytes, truncated, exit}`) → 훅별 횟수 · 평균 · 마지막 · 최대, 세션 시작 합(평균 합 대 2,560바이트 상한). `.agents/harness-kit.lock` 의 owner 별 세션마다 실리는 파일 크기(`CLAUDE.md` · `AGENTS.md` · `.claude/rules` · `.agents/rules` · `.kiro/steering` 등) · `.agents/hooks.json` 의 owner 별 이벤트 수 |
| 모듈이 덧붙인 양 | 위의 owner 별 정적 합계(`modules[]`) |
| 대화 기록(`history: "on"`) | Claude `~/.claude/projects/<경로>/*.jsonl` 의 `message.usage` · `model` · `sessionId` · `cwd` · `gitBranch` · `timestamp`, `~/.claude/history.jsonl` 의 프롬프트. Codex `~/.codex/sessions/**/*.jsonl`(`session_meta` 의 cwd · `token_count` 이벤트). Kiro 는 위치 확인 전이라 `자료 없음` |

- 꺼져 있으면 `~/.claude` · `~/.codex` 아래를 열지 않는다(fs 접근 0). `GET /usage` 는 200 + `enabled: false` + 무엇을 읽는지와 켜는 곳, `GET /history` 는 404 `history_off`(HK-17). 켜져 있어도 복사본 · 집계 파일을 남기지 않는다(메모리 stamp 만).
- 거르기: 파일 폴더 이름 접두(`<리포 경로를 -로>`)로 미리 줄이고 줄마다 `cwd` 가 리포 또는 `<리포>.worktrees/` 안인지 본다. 기간 안에 바뀐 파일만 연다. 읽은 바이트 위치를 기억해 덧붙은 줄만 더 읽는다.
- 형식은 공식이 아니라 하네스 판마다 바뀐다: 모르는 줄은 건너뛰고 못 읽은 파일 수를 `unreadable` 로 센다.
- 역할 · 이슈: 세션 등록(`sessions/*.json`)의 `sessionId` → `role` · `issue`, 없으면 `gitBranch` 의 이슈 키, 없으면 `이슈 없음`.
- 지금 세션: 이 리포의 가장 최근 응답 하나의 입력 + 캐시 읽기 + 캐시 쓰기 ÷ 창. 창은 `usage.contextWindows[모델]` > 킷 기본 표(Claude 계열 200K, 그 밖은 없음) > "기록에 없다". 알림은 `usage.warnAt`(기본 0.8). 비용은 `usage.pricing` 이 있을 때만 추정한다(청구 금액이 아니다).
- 프롬프트 기록은 글을 보여 주기만 한다(최대 200건, 1건 2,000자). 내보내기 · 커밋 · 세션 요청에 넣지 않는다.
- 콘솔: `usage [--days n] [--kit] [--now] [--sources] [--harness h] [--json]`, `history [--q …] [--session id] [--role r] [--json]`. `--json` 은 API 의 `data` 다.

## 5. 흐름 보기(S12) · 남은 Bolt

- `packages/flow-view`: `FlowView` 컴포넌트가 `GET /flow` 의 `nodes` · `edges` 를 그대로 받아 `@xyflow/react` 로 그린다. 노드는 Unit 카드(키 · 영역 · 제목 · 세션 · 게이트 레일 · Bolt · 플래그), 계약 Unit 은 점선 테두리 띠. 간선은 `depends`(실선) · `contract`(점선), 라벨 있으면 표시. `nodesDraggable={false}` · `nodesConnectable={false}`(자리는 서버가 정한다), 줌 · 맞춤 조절 · 미니맵. 진입 함수 `mount(el, props)` → `{ update, unmount }` 를 `window` 에 걸지 않고 ES 모듈 `export` 로 낸다.
- 번들: esbuild `format: "esm"`, `minify`, `jsx: "automatic"`, `define: { "process.env.NODE_ENV": "\"production\"" }`, CSS 는 `@xyflow/react/dist/style.css` 를 한 파일로. 같은 소스 · 같은 판이면 같은 바이트(시험).
- 화면은 노드를 그린 뒤 DOM 위 바깥 목록(Unit 표)도 같이 둔다: 번들을 못 읽거나 키보드 · 화면 읽기 프로그램에서 쓸 때 쓰는 같은 데이터의 표다(06 §3.16 "번들을 못 읽으면 보드로 돌린다").
- 변경 제안: 노드를 고르고 "의존 더하기 · 빼기 · 나누기 · 합치기 · 순서"를 폼으로 만들어 `POST /units/proposals` 로 저장한다(PIN 없음, 읽기 전용이면 버튼 대신 이유). 승인이 아니다.
- `GET /intents/{key}/burn?days=14`: 연결된 이슈의 `tasks.md` 의 Bolt(체크박스) 합과 완료 수를 날마다 구한다. 날짜별 값은 그 이슈 문서의 git 기록(`git log -- <tasks.md>` 한 번 + 바뀐 판마다 `git show`)에서 구하고, 기록이 없는 날은 앞 날 값을 잇는다. `units.json` 의 `planned` 가 아닌 Unit 은 뺀다. tasks 가 없는 Unit 은 `estimated: true`(추정 Bolt 수, 06 §3.16) 로 센다. 응답 `{intent, days, series: [{date, remaining, total, done}], now: {remaining, total, done, units: {done, total}}, estimated}`. 콘솔 `status --flow <INT> --burn`.

## 6. 전체 프로젝트(S00)

서버(HK-17)는 이미 한다. 화면은 `projects` · `projects/overview` · `sessions?scope=machine` 으로 프로젝트별 · 종류별 묶기, 진행 나눔 막대 · 검증 칩 · 킷 버전 · doctor 경고, 없는 폴더 줄(지우는 명령만 복사), 접힌 하위 리포를 그린다. 단일 리포 모드에서 `/projects` 를 열면 "전체 프로젝트 모드가 아니다" 안내와 `dashboard --all` 명령 복사를 보인다. 여러 프로젝트 모드의 레일은 프로젝트 목록 메뉴가 되고 프로젝트에 들어가면 `/p/<id>/` 아래 S01~ 이 그대로 열린다. 화면 파일은 아무것도 쓰지 않는다(DB-R27).

## 7. 설계와 다르게 한 것

| 설계 | 이 구현 | 이유 |
|---|---|---|
| 06 §3.16 · 07 §3.6: 스킬 캐시 `.agents/state/skills-cache.json`(0600) | 서버 메모리 캐시만 | 읽기 전용 · 여러 프로젝트 모드는 아무것도 쓰지 않는다(DB-R27). 첫 스캔 1.5초 이하라 서버 재시작 뒤 다시 읽어도 된다 |
| 06 §3.16 `flow.bundle.js` 한 파일 | `flow.bundle.js` + `flow.bundle.css` 두 파일 | React Flow 의 CSS 는 JS 에 넣으면 인라인 `<style>` 이 되어 CSP `style-src 'self'` 를 어긴다 |
| 06 §3.1 `routes/` · `render/md.ts` · `readers/skills · usage` 디렉터리 | HK-17 의 `api.ts` · `md.ts` 자리를 그대로 쓰고 `skills.ts` · `usage.ts` · `burn.ts` 를 새로 둔다 | 같은 함수를 서버와 CLI 가 부르는 HK-17 구성을 바꾸지 않는다 |
| 화면기획서 S13 "역할별" 막대 | 역할은 세션 등록이 있는 대화만 붙고 나머지는 `역할 없음` | 대화 기록에 역할이 없다(06 §3.18) |
| 07 §3.8 추정 정확도 70% 이상(라벨 fixture 60개) | 라벨 fixture 는 이 컴퓨터 설명이 없어 합성 30개로 측정하고 tasks 에 값을 적는다 | 개인 스킬 설명을 저장소에 넣지 않는다(07 §3.10) |
