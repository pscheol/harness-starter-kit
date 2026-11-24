---
key: HK-17
area: dashboard
type: feat
title: 관리 페이지 서버 — REST · 읽기 · 쓰기 규칙 · 승인 · 질문 · 세션 · 작업 요청 · 내보내기
state: completed
created: 2026-11-24
---

# Tasks — HK-17

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험 작성(RED): 승인 파서 fixture(Node · Python) · 보안 · 경로 17종 · 저장 · 승인 · 답 · 작업 요청(가짜 소켓) · 자동 요청 없음 · 흐름 · 여러 프로젝트 · 내보내기 · 의존성 · CLI 대응 · 세션 등록 · 대기함 소비 | 전부 | done |
| T2 | `packages/dashboard` 패키지 · 번들 연결(`build.mjs` · 소스 해시 · `__HK_STATIC__`) | §1 | done |
| T3 | `approvals.ts` · `frontmatter.ts` · `questions.ts` · `agent.ts` · `md.ts` | DB-R13 · R14 · R21 · R22 | done |
| T4 | 서버 · guard · `/raw` · 시작 · 끝 · 토큰 · PIN · 기존 서버 | DB-R1~R5 · R12 · R22 · R23 | done |
| T5 | 읽기 모듈 · 캐시 · 이슈 모델 · 처리할 일 · `dashboard_snapshot.py` · `board.sh --json` · `sdd_gates` 앞 조건 칸 | DB-R6 · R24 | done |
| T6 | 쓰기: 문서 저장 · 체크아웃 찾기 · 승인 · 리뷰 판단 · 질문 답 · 제안 | DB-R7~R11 · R14 · R15 · R29 | done |
| T7 | 세션 등록 훅 · 대기함 소비 · 작업 요청(소켓 · deep link · 대기함) · 하네스 등록 | DB-R16~R19 · R25 | done |
| T8 | 여러 프로젝트 모드 · 등록부 · 정적 내보내기 · `history_off` | DB-R20 · R27 · R28 | done |
| T9 | CLI 대응 명령 · 예약 명령 정리 · 사용법 | §3.15 · DB-R26 | done |
| T10 | 생성물 · manifest 수 · 시험 통과(GREEN) · 전체 시험 · 검증 기록 | 완료 기준 | done |

## 요구사항별 결과

| 요구 | 결과 | 근거(시험) |
|---|---|---|
| DB-R1 127.0.0.1 바인드 | 충족 | `security` — 주소 127.0.0.1, LAN 주소 · `::1` 연결 0건 |
| DB-R2 Host 421 | 충족 | `Host: evil.example` · 다른 포트 421, `localhost:<포트>` 200 |
| DB-R3 토큰 401 | 충족 | 토큰 없음 · 틀림 401(상수 시간 비교) |
| DB-R4 토큰 0600 · 폴더 0700 · 끝나면 지움 | 충족 | 32바이트 base64url, 파일 0600 · `.agents/state` 0700, `close` 뒤 두 파일 없음. 스모크(빌드한 `dist/cli.js`, SIGTERM) 도 같다 |
| DB-R5 Content-Type · Origin 403 | 충족 | `Origin: http://evil.example` · Origin 없음 · `text/plain` 의 PUT 403 |
| DB-R6 stat 캐시 · 요청 시점 상태 | 충족 | 파일을 고치면 다음 응답이 바뀌고 같으면 ETag 304. git 작업 트리 상태는 요청마다 다시 구한다 |
| DB-R7 baseSha256 409 | 충족 | 같은 base 로 두 번 저장 → 둘째 409 · 현재 sha · 내용, 첫째 내용 남음 |
| DB-R8 허용 목록 밖 403 | 충족 | 경로 17종(`../` · 절대 · `.git/config` · `..` 마디 · 빈 마디 · `\` · NUL · 심볼릭 링크 마디 · `units.json` · `review.md` · `approvals.md` · `questions.md` · `plans/screens/*.html` · `.agents/rules` · `harness-kit.json` · `scripts/verify.sh` · `docs/features`) 403, 파일 변경 0 |
| DB-R9 이슈 브랜치 체크아웃에 쓴다 | 충족 | worktree 파일만 바뀌고 메인 트리 · `count-objects` · HEAD · refs 그대로, 체크아웃 없음 409 `branch_not_checked_out`, 같은 키 브랜치 둘 409 `ambiguous_branch` |
| DB-R10 커밋 · 브랜치 전환 · worktree 생성 없음 | 충족 | 위 시험의 HEAD · refs · `worktree list` 개수 · git 객체 수 |
| DB-R11 approvers · 비면 누구나 | 충족 | 그룹 밖 403 `not_an_approver`, 게이트 칸이 비면 승인됨 |
| DB-R11a 로그인 없음 · git 사용자 | 충족 | `/session` 의 `user` 는 그 체크아웃의 git `user.email` · `user.name` · 속한 그룹 |
| DB-R12 PIN | 충족 | PIN 없음 403 `pin_required`, 5회 틀리면 맞는 PIN 도 403 `pin_locked`, PIN 은 토큰 파일 · 응답에 없다 |
| DB-R13 NEEDS CLARIFICATION 422 | 충족 | `[NEEDS CLARIFICATION` 문서 승인 422, 기록 0 |
| DB-R14 approvals.md 덧붙이기 · status | 충족 | 승인자 · 시각 · 문구 · sha256 · 기록 ID · 경로 dashboard, 머리 approved, 로그 줄, Python `sdd_gates` 가 requirements 통과 · valid 로 읽음 |
| DB-R15 approved 로 바꾸는 저장 422 | 충족 | 422 `status_change_forbidden`, approved 문서를 고치면 in-review 로 돌림 |
| DB-R16 세션 등록 | 충족 | `test_session_register` 5개 — 파일 0600 · 폴더 0700, worktree 세션도 메인 폴더, role · issue · inbox, 토큰 저장 안 함, prompt · stop · end, 출력 0바이트 |
| DB-R17 한 줄 글만 소켓으로 | 충족 | 가짜 UDS 가 받은 글 1줄, 경로 · "이 글은 승인이 아니다", 문서 내용(XYZZY) 없음 |
| DB-R18 소켓 실패 → 선택지만 | 충족 | 409 `socket_unavailable` + deep link · `queueAvailable`, 대기함 0건 |
| DB-R19 대기함 소비 512바이트 | 충족 | `test_dispatch_inbox` 5개 — 5건에서 세 줄 · 512바이트 이하 · 첫 글 200바이트 이하 · 하나만 consumed, 맞는 항목 없음 0바이트, 만료 → expired, 세션 지정, 두 세션 100회 경합 중복 0 |
| DB-R20 내보내기 0건 | 충족 | 스킬 이름 · 홈 · 리포 절대경로 · `/tmp/cc-socks-` · `uds:` · 토큰 · 대기함 글 · 이메일 · `<script` 0건, 홈 경로가 든 문서면 폴더를 지우고 실패, 빈 폴더가 아니면 거부 |
| DB-R21 원문 HTML 실행 안 함 | 충족 | `<script>` 는 글자, `javascript:` 링크 제거, `/raw` CSP `default-src 'none'` · html 은 `sandbox allow-scripts`, 서명 틀림 · 지남 · 경로 조작 403 |
| DB-R22 에이전트 세션 → 읽기 전용 | 충족 | 판정이 걸리면 PIN null, 승인 · 저장 · 리뷰 판단 403 `read_only`. CLI `approve` · `answer` · `review decide` 는 판정 · TTY 아님 exit 3 |
| DB-R23 기존 서버 주소 | 충족 | 사람은 `#t=` 를 붙인 주소, 에이전트 세션은 토큰 없는 주소, CLI `dashboard` 가 그 주소를 내고 exit 0 |
| DB-R24 처리할 일 순서 · 50건 | 충족(부분) | rank 순 · since 오래된 순 · 50건 뒤 rank 별 수. rank 4 `auto-verify-stopped` · 8 `ops-followup` · 9 `jira-conflict` 는 원본이 없어 뺐다 |
| DB-R25 자동 요청 없음 | 충족 | 저장 20 · 승인 20 · 수정 요청 20 · 답 20 · 제안 20회 뒤 살아 있는 가짜 소켓이 받은 글 0 · 대기함 0 |
| DB-R26 모델 호출 · SDK 없음 | 충족 | 두 패키지 런타임 의존성 0, lock 에 모델 SDK 0, 소스에 모델 API 주소 0, 읽기 API 전부 부르는 동안 밖으로 나간 연결 0(127.0.0.1 · UDS 만) |
| DB-R27 전체 프로젝트 보기 쓰기 0 | 충족 | 등록 3개 + 없는 폴더 1개, 모든 읽기 API 뒤 세 리포 · `~/.config/harness-kit` 파일 · mtime 그대로, 토큰 파일 없음 |
| DB-R28 대화 기록 기본 꺼짐 | 충족 | 설정 없음 · `off` 면 `/history` 404 `history_off`, `~/.claude` · `~/.codex` 경로 열기 0(fs 감시), 켜면 501(HK-18) · 리포에 새 파일 0 |
| DB-R29 제안은 units.json 을 바꾸지 않는다 | 충족 | 제안 저장 뒤 바이트 같음, intent 승인 뒤 제안 반영 · 제안 파일 삭제 · 기록 sha = 파일 sha, 고리 · 없는 Unit · 계약 합치기 422 · sha 다름 409 |
| 06 §3.15 화면 없이 쓰기 | 충족 | 경로 표 40개 모두 CLI 대응 칸, 읽기 경로 19개의 `--json` = API data(시각 칸 제외), 쓰기 명령 · 등록부 · `status --all` · `projects list` 대응 |
| 승인 파서 fixture(HK-23 과 공유) | 충족 | 사례 37 · 질의 · 리뷰 판단 · 승인 sha 4 가 기대값과 같고, 같은 입력의 Python 결과와 같다 |

## 검증 기록

### RED(커밋 `2510144`)

- 대시보드 vitest 94개 중 91개 실패(자리표시 모듈이 "구현 전"을 던진다). 통과 3개는 fixture 사례 수 · 의존성 · 소스 주소 검사(구현 전에도 맞는 지킴 시험)다.
- CLI 대응 시험(`packages/cli/test/dashboard-cli.test.ts`)은 `../src/commands/dashboard` 가 없어 읽기 오류.
- 설치본 Python 시험 10개 모두 실패: `test_session_register` 5개(실패 6 · 오류 2, 하위 시험 포함), `test_dispatch_inbox` 5개.
- 뒤에 더한 RED: `test_protect_approvals` 의 `harness-kit answer` · 답 API · 리뷰 판단 API 명령 3개 × 셸 도구 3개 = 하위 시험 9개 실패.

### GREEN(커밋 `a558c70` · 이 커밋)

- `pnpm -C packages/dashboard test`: 타입 검사 + vitest 94개 통과(파일 10개). `GET /overview` p95 140.4ms(이슈 20 · worktree 3, 캐시가 찬 뒤 100회).
- `pnpm -C packages/cli test`: 타입 검사 + vitest 277개 통과(새 시험 9개 포함).
- 설치본 Python: `test_session_register` 5 · `test_dispatch_inbox` 5 통과, `test_protect_approvals` 의 새 하위 시험 9개 통과.
- GREEN 중 시험 쪽 잘못 5건을 고쳤다: (1) `[NEEDS CLARIFICATION` 문서에 틀린 docSha 를 주면 설계 06 §3.7 순서(5단계 clarify → 6단계 doc_changed)대로 422 가 먼저다 — doc_changed 는 다른 이슈로 시험한다. (2) Node 가 `Socket.prototype.connect` 에 정규화한 인자 배열을 넘긴다. (3) 점유 시험 fixture 에 설치본에 있는 `.agents/harness.json` 이 없었다. (4) CLI 고리 시험의 `U-1:U-3` 은 계약 Unit 이 기능 Unit 에 의존하는 경우라 `contract_dependency` 가 먼저다 — 기능 Unit 끼리 고리로 바꿨다. (5) 처리할 일 시험의 approvers · 50건 상한 기대값.
- 스모크(빌드한 `dist/cli.js`, 이 에이전트 세션 안): 임시 설치본에서 `dashboard` 가 읽기 전용(`CLAUDECODE=1`)으로 열리고, 화면 200 · CSP, 토큰 없는 `/api/v1/session` 401, 두 번째 `dashboard` 가 토큰 없는 주소를 내고, SIGTERM 뒤 `.agents/state/` 의 두 파일이 지워지고, `--export` 가 파일 8개를 만들었다.
- `node scripts/gen-plugins.mjs --check`: 생성물 일치(파일 415개). manifest 파일 수 backend 245 · frontend 249 · common 239.

### 번들 · 토큰

- `packages/cli/dist/cli.js`(= 플러그인 `bin/harness-kit.js`) 219,010 → 423,938바이트. 대시보드 소스 · 화면 자리표시 3파일이 같은 파일에 들어간다. 압축하지 않는다(바이트 결정성 · 읽을 수 있는 번들, HK-8).
- 세션에 덧붙는 것: 세션 등록 훅 표준 출력 0바이트(시험), 대기함 소비는 맞는 항목이 있을 때만 세 줄 · 512바이트 이하(시험). 세션 시작 고정 안내(`session-start.sh`)는 바꾸지 않았다.
- 저장 · 승인 · 답 · 리뷰 판단 · 제안 처리 모듈은 dispatch 모듈을 import 하지 않는다. 서버 · CLI 는 모델을 부르지 않는다.

### 전체 시험

- 이어받은 뒤(2026-11-24, 이 worktree): `pnpm -r build` → `node scripts/gen-plugins.mjs --check` 생성물 일치(파일 415개).
- `pnpm -C packages/dashboard test`: 처음엔 타입 검사가 `test/overview.test.ts` 의 쓰지 않는 `fs` import(TS6133)로 멈췄다. 지운 뒤 vitest 94개 통과(파일 10개).
- `pnpm -C packages/cli test`: 277개 통과(파일 23개).
- `python3 -m unittest discover -s tests -p "test_*.py"`: 106개 OK(1,266초).

## 설계와 다른 점(구현 중)

design.md §13 표 밖에서 구현하며 정한 것:

| design.md | 구현 | 이유 |
|---|---|---|
| §1 파일 표 | `scripts/hooks/protect_approvals.py` · `protect-approvals.sh` 를 고쳤다(`harness-kit answer`, 답 · 리뷰 판단 API) | design §13 마지막 줄들. 06 §3.15 문장 그대로다 |
| §5.1 tasks 게이트 | tasks 는 머리 `status` 를 바꾸지 않는다(기록만) | HK-23 처럼 tasks 진행은 `state` 다 |
| §6 issue 모델 | `boardState`(보드 상태) · `gates`(게이트 판정 원문) · `legacy` 칸을 더했다 | 보드 일치(완료 기준 1)와 흐름 단계 계산이 같은 원본을 쓴다 |
| §9 `review show` | `GET /reviews/{key}` 는 `review_state.py <폴더> --json` 그대로다 | HK-23 판정 원본 |

설계서(docs/design)는 고치지 않았다. 사실과 다른 줄을 찾지 못했다(06 §3.5 표에 없는 경로 · 순서 차이는 구현 보완이라 design.md §13 에 적었다).

## 확인 필요(사람)

- 완료 기준 10(수동): 살아 있는 Claude 세션(v2.1.224+, `acceptEdits`)에 소켓 요청 전달, deep link 가 새 터미널에 프롬프트를 채우는지, Codex 대기함 표시. 이 세션 안에서는 할 수 없었다.
- 완료 기준 1 · 2 · 20: 보드 일치는 v2 5 · v1 1 · worktree 1 · 브랜치 1 의 fixture 로 했다(20개 fixture 는 HK-22 실측과 같이). 기능 문서 · ADR · 기획물 렌더와 흐름 화면(20)은 HK-18 화면과 같이 본다.
- `harness-kit dispatch` 를 에이전트 세션이 불러도 막지 않는다(설계에 금지 문장이 없다). 다른 세션의 턴을 돌려 토큰을 쓰게 되므로 HK-24 의 훅 정리 때 막을지 정한다.
- `init` 의 등록부 자동 등록(06 §3.17)은 HK-22 이전 도구와 같이 넣을지.
- Codex · Kiro 의 프롬프트 제출 · 세션 종료 이벤트 이름(06 §6). 지금은 세션 시작 · 턴 끝만 등록했다.
