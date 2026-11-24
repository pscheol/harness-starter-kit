---
key: HK-18
area: dashboard
type: feat
title: 관리 페이지 화면 · 흐름 보기(React Flow) · 전체 프로젝트 · 기록 · 사용량 · 스킬 목록
state: completed
created: 2026-11-24
---

# Tasks — HK-18

> 2026-11-24 방향 바뀜: 화면 층(`static/js` · `pages.css`)은 나중에 React 19 + astryx 디자인 시스템으로 따로 다시 쓴다. 서버 · API · 읽기 모듈 · CLI · 시험은 그대로 둔다. 그래서 화면은 동작하는 상태에서 멈췄고 간격 · 정렬 다듬기는 하지 않았다(아래 "화면 층에서 본 문제").

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험: 스킬 스캐너 · YAML · 사용량 · 기록 · 킷 몫 · 남은 Bolt(서버), 화면 파일 약속(`static.test.ts`), 순수 함수(`format.test.ts`), CLI `skills` · `usage` · `history`, 흐름 번들(`flow-view`) | 전부 | done |
| T2 | 스킬 스캐너 `skills.ts` · `yaml-lite.ts` · `/skills` · CLI `skills` | R5 · R8 | done |
| T3 | 사용량 `usage.ts` · `/usage` `/usage/now` `/usage/kit` `/history` · CLI `usage` `history` | R4 · R8 | done |
| T4 | 남은 Bolt `burn.ts` · `/intents/{key}/burn` · CLI `status --flow --burn` · `/flow` 의 `unitsSha256` | R2 · R8 | done |
| T5 | `packages/flow-view`(React Flow) · `static/vendor/flow.bundle.{js,css}` · 라이선스 문구 | R2 | done |
| T6 | 화면 틀 · S01 홈 · S02 진행 · S03 이슈 · 승인 패널 · S04 질문 · S05 세션 요청 시트 · 문서 목록 | R1 · R6 · R7 | done |
| T7 | S06 검증 · S07 작업 공간 · S08 스킬 · S09 하네스 · S10 운영 · S11 접수 · S12 흐름 · S13 사용량 · S00 전체 프로젝트 | R1 · R3 · R6 | done |
| T8 | 브라우저 확인(Playwright): 렌더 · 승인 PIN 흐름 · 질문 답 · 흐름 키보드 · 제안 저장 · 읽기 전용 · 여러 프로젝트 · 폭 3종 | R6 | done |
| T9 | 생성물(`gen-plugins`) · 전체 시험 · 검증 기록 | 완료 기준 | done |

## 요구사항별 결과

| 요구 | 결과 | 근거 |
|---|---|---|
| R1 화면 S00~S13 · 빌드 단계 없음 · CDN 없음 | 충족(화면 층은 이후 이슈에서 다시 쓴다) | `static.test.ts` — 화면 모듈 16개 · 틀 · 번들 · 라이선스 존재, 인라인 스크립트 · 스타일 0, 외부 주소 · `@import url(http` 0(이름공간 주소만), `innerHTML` · `eval` · `style` 속성 문자열 0. 브라우저로 14개 화면 모두 렌더(`.agents/docs/issues/HK-18-dashboard-ui/screens/` 13장) |
| R2 `packages/flow-view`(React Flow) 미리 묶음 | 충족 | `flow-view/test` 5개 — 소스에서 다시 빌드하면 같은 바이트, 외부 요청 0, 라이선스 문구에 `@xyflow/react` · `react` · `react-dom` · `d3-zoom`. 흐름 번들은 흐름 보기를 열 때만 `import()`(`main.js` 에 번들 이름 없음). 키보드: 노드 Tab · Enter 로 고르고 Esc 로 푼다(브라우저로 확인), 번들을 못 읽으면 표로 보인다 |
| R3 전체 프로젝트(S00) | 충족 | 브라우저: `--all` 로 등록 프로젝트 · 없는 폴더(지우는 명령 복사) · 켜 둔 세션 · 프로젝트별 · 종류별 묶기, 프로젝트 안으로 들어가면 `/p/<id>/` 아래 홈 · 진행. 화면은 쓰기 0(서버 DB-R27 시험은 HK-17) |
| R4 기록 · 사용량 · 기본 꺼짐 | 충족 | `usage.test.ts` 11개 — 꺼짐이면 `enabled:false` · `/history` 404 · fs 접근 0(`projects.test.ts` fs 감시), 켜면 이 리포 · worktree 만 하루 · 이슈 · 역할 · 캐시 비율, 같은 응답 두 줄은 마지막 하나, 덧붙은 줄만 다시 읽음, Codex `token_count`, 프롬프트 기록 거르기 · 복사본 0, 킷 몫 · owner 별 합. 지금 세션 사용률 · warnAt · 비용(`usage.pricing` 있을 때만) |
| R5 스킬 목록(07 SK-R1~R15) | 충족 | `skills.test.ts` 21개 — 위치별 개수 = `find -L`(SK-R15), realpath 묶기(SK-R5), 홈 쓰기 0(SK-R1), 고리 · 머리 없음 · YAML 오류 · 300 KiB · 이름의 `:`(SK-R12 · R13), Claude user loaded / project shadowed · Codex both(SK-R6 · R7), 플러그인은 켠 것의 설치 버전 하나(SK-R4), 지도 > 머리 > 추정과 칸 해석(SK-R8 · R9), 추정 정확도 합성 30개에서 70% 이상 · 미분류 40% 이하 |
| R6 접근성 · 상태 4종 | 충족(자동 시험은 파일 약속까지, 나머지는 브라우저 확인) | 모든 화면이 `loadAll` 로 로딩(뼈대) · 오류(코드 + 할 일) · 빈 · 읽기 전용을 낸다. 탭 목록은 화살표 · Home · End, `:focus-visible`, 본문 건너뛰기, `aria-live`, 상태는 글자 + 모양 + 색, 이동 뒤 `h1` 초점, 차트마다 요약 글 + 표로 보기, 흐름 노드 `aria-label`(`flow-view` 시험). 색 대비는 기획서 토큰을 그대로 썼고 따로 재지 않았다 |
| R7 모델 버튼 없음 · 자동 요청 없음 | 충족 | `static.test.ts` — 모델 호출 문구 · 주소 0, `POST /dispatch` 는 시트 모듈 하나뿐이고 `openDispatch` 호출은 모두 누른 단추 안. 브라우저: 승인 · 답 · 제안 저장 뒤에도 세션 요청은 나가지 않고(시트를 사람이 연다) 소켓이 없으면 409 선택지 두 개만 보인다(자동으로 바꾸지 않는다) |
| R8 화면에만 있는 기능 없음 | 충족 | `dashboard-cli.test.ts` — `skills` · `usage` · `usage --now` · `usage --kit` · `history` · `status --flow --burn` 의 `--json` = API data(경로 표 대응 칸 포함). 사람용 출력 `skills-usage.test.ts` 8개 |

## 검증 기록

### 시험 순서에 대해

서버 모듈(스캐너 · 사용량 · burn)은 코드를 먼저 쓰고 같은 날 시험을 이어서 썼다(RED 를 따로 남기지 못했다). 화면 파일 약속(`static.test.ts`)과 순수 함수 시험은 화면보다 먼저 쓰지 않고 화면 뒤에 썼다. 대신 시험을 쓰다 드러난 틀린 곳을 고쳤다: 날짜 시험의 git 환경(`GIT_*` 가 시험 도우미에서 걸러져 날짜가 오늘로 박힘), 한글 경로 인코딩, 시험 쪽 기대값 3건.

### 시험 결과

| 명령 | 결과 |
|---|---|
| `pnpm -C packages/dashboard test` | 타입 검사 + vitest 14파일 **140개 통과**(HK-17 의 94개 + 새 46개). 처음 CLI 시험과 같이 돌렸을 때(부하 38) 시간 초과 3건이 났고 혼자 돌리니 통과 |
| `pnpm -C packages/cli test` | 타입 검사 + vitest 33파일 **408개 통과**(새 `skills-usage.test.ts` 8개 포함) |
| `pnpm -C packages/flow-view test` | 타입 검사 + vitest **5개 통과** |
| `pnpm -C packages/cli build` → `node scripts/gen-plugins.mjs` → `--check` | 생성물 일치(파일 416개) |
| `python3 -m unittest tests.test_template_wording tests.test_generated` | 23개 통과(템플릿 파일 수는 바뀌지 않아 `manifest.md` 수 행은 그대로) |
| 전체 `python3 -m unittest discover -s tests -p "test_*.py"` | 117개 통과(아래 "전체 킷 시험") |

### 번들 크기

| 파일 | 크기 |
|---|---|
| `static/vendor/flow.bundle.js` | 378,737바이트(gzip 120,948) |
| `static/vendor/flow.bundle.css` | 18,740바이트 |
| `static/vendor/THIRD-PARTY-LICENSES.txt` | 18,828바이트(17개 패키지) |
| 화면 코드 `static/js/**` | 216,894바이트(JS 파일 30개, 3,474줄) · `app.css` 32,808 · `pages.css` 15,115 |
| `packages/cli/dist/cli.js`(= 플러그인 사본) | 526,356 → 1,277,879바이트(+751,523, 화면 파일이 `__HK_STATIC__` 문자열로 들어간다) |
| 시험 예산 | 흐름 번들 JS 450KB · CSS 30KB, 화면 코드 450KB 이하(`static.test.ts` · `flow-view` 시험) |

CLI 런타임 의존성은 여전히 0이다(`react` · `react-dom` · `@xyflow/react` 는 `packages/flow-view` 의 devDependency 이고 번들에만 들어간다, lock 253줄 추가).

### 브라우저 확인(Playwright MCP, `packages/dashboard/scripts/demo-fixture.mjs` + `demo-serve.mjs` 로 연 임시 리포)

- 1440 폭 스크린숏 `.agents/docs/issues/HK-18-dashboard-ui/screens/`: S00 · S01(1440 · 1024) · S02 · S03(보통 · 읽기 전용) · S04 · S05 · S06 · S08 · S09 · S12 · S13. S07 · S10 · S11 은 렌더와 문구만 확인하고 그림은 남기지 않았다.
- 320 · 1024 · 1440: 문서 가로 스크롤 0(`scrollWidth == innerWidth`, 7개 화면). 320 에서 몇몇 구분 선택 · 상태 줄이 작업 영역 안에서 넘쳤다 → `.seg` · `.panel-head` 줄 바꿈 CSS 를 더했고 그림으로는 다시 보지 않았다.
- 승인 PIN 흐름: 승인 문구 → PIN 상자 → `approvals.md` · 머리 `status: approved` · `approvals-log.jsonl` 이 임시 리포에 생김. 질문 답: `questions.md` 에 `- 답: B · jiyoon@acme.dev · 시각`. 흐름 제안: 저장 → `units.proposed.json`(`units.json` 은 그대로).
- 콘솔 오류는 의도한 501(`/ops`)뿐이다. 화면 CSP 위반 0건(React Flow 포함).

### 전체 킷 시험

`python3 -m unittest discover -s tests -p "test_*.py"` — 117개 통과(1,541초, OK). 이 이슈는 템플릿 · Python 을 건드리지 않았고 생성물(`plugins/harness-kit/`)만 바뀌었다.

## 사람 확인 필요

- 화면 모양(간격 · 정렬 · 색 대비)은 사람이 보지 못했다. 화면 층은 다시 쓰기로 했으므로 새 화면에서 확인한다.
- 스킬 수집은 이 컴퓨터의 실제 `~/.claude` 에서 돌려 보지 않았다(07 완료 기준 1 의 "이 컴퓨터 find 와 6/6", 플러그인 합계 488). 시험은 임시 HOME 만 읽는다. 사람이 `npx harness-kit skills --json` 으로 한 번 확인한다.
- 대화 기록 형식은 공식이 아니다. Claude `projects/*.jsonl` · `history.jsonl` 과 Codex `sessions` 파서는 합성 fixture 로만 시험했고, 실제 파일에서 `unreadable` 이 얼마나 나오는지는 사람이 `history: "on"` 으로 본다. Kiro 는 위치를 몰라 "자료 없음"이다.
- 모델별 컨텍스트 창 기본 표는 Claude 계열 200K 하나다(1M 창 모델은 `usage.contextWindows` 로 덮는다).
- S10 운영 · S11 접수는 서버가 501 이라 "제공 예정" 상태다(HK-21 · HK-19). HK-19 가 접수 API 를 채우면 화면의 접수 폼이 그대로 부른다.
- 소켓 글 형식 · Codex/Kiro 훅 이름은 HK-17 의 확인 필요 그대로다.

## 화면 층에서 본 문제(astryx 다시 쓰기에서 피할 것)

- `select` 가 전역 `width: 100%` 라 줄 안(`.flex`)에 놓으면 한 줄을 다 먹는다 — 줄 안 선택 상자는 너비를 따로 줘야 한다.
- 빈 `h1` 초점 링이 머리줄 전체 폭으로 번졌다 — 이동 뒤 `h1` 로 초점을 옮길 때는 링을 끄거나 좁은 요소에 건다.
- 가로 줄바꿈이 없는 `seg` · `panel-head` · 상태 줄이 320 폭에서 넘친다 — 모든 가로 묶음은 `flex-wrap` 으로.
- 막대(`bar-track`)는 `span` 이라 표 칸 안에서 폭 0 이 된다 — `display: block` 이 필요하다.
- 레일 접기(≤1180px)가 `span` 으로 글자를 숨기는 방식이라 글자만 있는 노드(텍스트 노드)는 숨겨지지 않는다 — 글자는 늘 요소로 감싼다.
- React Flow 의 CSS 를 JS 에 넣으면 인라인 `<style>` 이 되어 화면 CSP(`style-src 'self'`)를 어긴다 — CSS 는 파일로 분리했다. 새 화면도 같은 CSP 를 지킨다(`style` 속성 문자열 · 인라인 스크립트 금지).
- 미니맵 기본 색이 흰 바탕에서 안 보인다 — 노드 색을 줘야 한다.
- 계약 Unit · 이슈 없는 Unit 은 Bolt 가 없다 — 노드 · 남은 일 합계가 같은 규칙을 쓴다.
- 서버 응답이 느린 곳(`GET /issues` 가 체크아웃마다 Python)은 첫 그림이 1~3초 늦다. 뼈대(로딩) 상태가 있어야 하고 5초 갱신은 ETag 로 가볍게 한다.
- 전체 프로젝트 ↔ 프로젝트 안은 세션 · 프로젝트 목록이 달라 화면 상태를 새로 읽는다(새 문서 로드).
