# 06. 관리 페이지(대시보드)

- 단계: P20(v2.2). 선행: P18(배치 전환). 검증·운영 탭의 내용은 P23·P24에서 채운다.
- 방향과 이유: [02 #dashboard](../harness-next/02-direction.html#dashboard) · [02 #dispatch](../harness-next/02-direction.html#dispatch) · [04 #dashboard](../harness-next/04-usage.html#dashboard) · [05 #people](../harness-next/05-principles.html#people) · [03 #p20](../harness-next/03-plan.html#p20)
- 화면 모양: [screens/index.html](screens/index.html). 이 문서는 화면이 쓰는 데이터와 동작만 정한다.

## 1. 목적·범위

킷을 설치한 리포 하나(메인 폴더와 그 worktree 전부)의 진행 상황·문서·검증 결과를 한 화면에서 보여 주고, 사람이 문서를 고쳐 저장하고, 승인하고, 질문에 답하고, 켜 둔 세션에 작업을 요청하게 한다.

범위에 넣는 것:

- `npx knots-sync dashboard` 서버(Node 표준 `http`), 접속 제한, 토큰, 요청 검사.
- 읽기 모듈과 캐시, 데이터 모델, REST API 전체.
- 쓰기 규칙(허용 경로, 이슈 브랜치를 가진 폴더 찾기, 낙관적 동시성), 승인·질문 답 기록.
- 세션 등록(`.agents/state/sessions/`), 작업 요청(소켓 · deep link · 대기함), 정적 내보내기.
- 흐름 보기(React Flow, §3.16), 전체 프로젝트(전역 등록부, §3.17), 기록 · 사용량(§3.18), 기능별 토큰 영향(§3.19).

범위 밖: 화면 디자인(`screens/`), 네트워크 공개, 화면에서 임의 셸 명령 실행, 커밋·push, Jira 화면 대체, 스킬 수집 로직(07), 품질 게이트 판정 로직(09).

## 2. 요구사항

| ID | 요구사항(EARS) |
|---|---|
| DB-R1 | 대시보드 서버는 `127.0.0.1`에만 바인드한다. `0.0.0.0`·`::`·LAN 주소로 여는 옵션을 두지 않는다. |
| DB-R2 | 요청의 `Host`가 `127.0.0.1:<포트>` 또는 `localhost:<포트>`가 아니면 서버는 421로 거부한다. |
| DB-R3 | `/api/` 요청에 유효한 `Authorization: Bearer <토큰>`이 없으면 서버는 401로 거부한다. |
| DB-R4 | 서버가 시작할 때 서버는 32바이트 난수 토큰을 만들어 `.agents/state/dashboard.token`(권한 0600)에 쓰고, 끝날 때 지운다. |
| DB-R5 | 상태를 바꾸는 요청에서 `Content-Type`이 `application/json`이 아니거나 `Origin`이 서버 자신이 아니면 서버는 403으로 거부한다. |
| DB-R6 | 읽기 요청이 오면 서버는 원본 파일의 stat 값이 바뀐 항목만 다시 읽어 응답한다. 응답은 요청 시점 파일 상태와 같다. |
| DB-R7 | 문서 저장 요청의 `baseSha256`이 현재 파일의 sha256과 다르면 서버는 저장하지 않고 409와 현재 내용을 돌려준다. |
| DB-R8 | 저장 대상 경로가 §3.6 허용 목록 밖이면 서버는 403으로 거부한다. |
| DB-R9 | 이슈 문서를 저장할 때 서버는 그 이슈 브랜치가 체크아웃된 폴더에 쓴다. 그런 폴더가 없으면 409로 거부하고 다른 브랜치의 작업 트리나 git 객체에 쓰지 않는다. |
| DB-R10 | 서버는 커밋·push·브랜치 전환·worktree 생성을 하지 않는다. |
| DB-R11 | 승인 요청이 오면 서버는 git `user.email`이 그 게이트의 approvers(직접 또는 그룹)에 있는지 확인하고, 없으면 403으로 거부한다. 그 게이트의 approvers가 비어 있거나 `approvers` 키가 없으면 git 사용자 누구나 승인할 수 있다. |
| DB-R11a | 관리 페이지는 회원·로그인·프로필 화면을 두지 않는다. 신원은 그 체크아웃의 git `user.name`·`user.email`이고, 승인 버튼 옆과 하네스 화면의 승인 권한 설정에만 보인다. |
| DB-R12 | 승인·질문 답·리뷰 판단 요청에 시작 터미널에만 출력한 승인 PIN이 없으면 서버는 403으로 거부한다. |
| DB-R13 | 대상 문서에 `[NEEDS CLARIFICATION` 표시가 남아 있으면 서버는 승인을 422로 거부한다. |
| DB-R14 | 승인이 받아들여지면 서버는 `approvals.md`에 기록을 덧붙이고 문서 머리의 `status`를 `approved`로 바꾼다. 기존 줄은 바꾸지 않는다. |
| DB-R15 | 문서 저장 요청이 머리의 `status`를 `approved`로 바꾸면 서버는 422로 거부한다. |
| DB-R16 | 세션이 시작될 때 세션 시작 훅은 `.agents/state/sessions/<세션 id>.json`을 메인 폴더에 쓴다. |
| DB-R17 | 사람이 세션을 골라 작업을 요청하면 서버는 경로·변경 요약·요청 문장만 담은 한 줄 글을 그 세션의 수신함 소켓으로 보낸다. 문서 내용은 보내지 않는다. |
| DB-R18 | 고른 세션의 소켓에 연결하지 못하면 서버는 deep link와 대기함 저장 두 가지를 응답으로 내고, 사람이 고른 쪽만 한다. |
| DB-R19 | 세션 시작·프롬프트 제출 훅은 자기 세션에 맞는 대기함 항목이 있으면 건수와 첫 요청 한 줄(200바이트 이하)을 신뢰하지 않는 요청으로 표시해 보여 주고, 그 항목만 원자적 이동으로 소비 처리한다. 출력은 세션 시작 상태 예산 512바이트 안이다(README 원칙 10). |
| DB-R20 | `dashboard --export <폴더>`는 스킬·세션·대기함·토큰·홈 절대경로가 0건인 정적 HTML을 만든다. |
| DB-R21 | 렌더한 문서는 원문 HTML을 실행하지 않는다. 와이어프레임 HTML은 `allow-same-origin` 없는 sandbox iframe 안에서만 연다. |
| DB-R22 | 에이전트 세션 안에서 실행된 것으로 판정되면 서버는 PIN을 만들지 않고 승인·답·리뷰 판단 API를 끈 채로 시작한다. |
| DB-R23 | 같은 리포에서 이미 서버가 돌고 있으면 새 실행은 서버를 하나 더 열지 않고 기존 주소를 출력한다. |
| DB-R24 | "처리할 일" 목록은 §3.4의 규칙과 순서로 만들고 최대 50건을 보여 준다. |
| DB-R25 | 문서 저장 · 승인 · 수정 요청 · 질문 답 · 변경 제안 저장은 세션에 아무것도 보내지 않는다. 세션 요청은 사람이 "저장하고 세션에 요청" · "세션에 요청" · `dispatch`를 고를 때만 간다. |
| DB-R26 | 관리 페이지 서버와 CLI는 모델 API를 부르지 않고 모델 SDK를 의존성에 두지 않는다. |
| DB-R27 | 전체 프로젝트 보기는 아무 파일도 쓰지 않는다. 쓰기는 들어간 리포 안에서 그 리포의 쓰기 검사로만 된다. |
| DB-R28 | 이 컴퓨터 설정 `~/.config/knots-sync/config.json`의 `history`가 `"on"`이 아니면 서버와 CLI는 대화 기록(`~/.claude` · `~/.codex`)을 열지 않는다. 켜져 있어도 복사본을 남기지 않고 내보내기 · 커밋 · 세션 요청에 넣지 않는다. |
| DB-R29 | Unit 변경 제안을 저장해도 `units.json`은 바뀌지 않는다. 제안은 intent 게이트 승인 처리만 `units.json`에 옮긴다. |

## 3. 설계

### 3.1 구성

```text
npx knots-sync dashboard [--port <n>] [--open] [--read-only] [--export <폴더>] [--all | --root <dir> | --workspace <file>]
packages/dashboard/src/
├── server.ts        http.createServer, 127.0.0.1 바인드, 라우팅, ETag
├── guard.ts         Host · Origin · 토큰 · PIN · 크기 제한
├── repo.ts          메인 폴더 · worktree · 브랜치 해석
├── readers/         config · intents · issues · verify · reports · worktrees · sessions · skills · harness · entire · ops · flow · projects · usage
├── model.ts         읽은 값을 화면 단위로 묶는다(overview · board · issue …)
├── routes/          REST 처리
├── writers/         docs · approvals · answers · reviewDecisions · dispatch · proposals
├── render/md.ts     Markdown → HTML(번들, 원문 HTML 끔, 링크 정리)
└── static/          번들한 화면 파일(빌드 단계 없음, CLI 패키지에 포함)
```

시작 순서:

1. 리포 해석: `git rev-parse --show-toplevel`과 `--git-common-dir`로 메인 폴더를 찾는다. worktree 안에서 실행해도 메인 폴더 기준으로 연다.
2. `.agents/knots-sync.json`을 읽는다. 없거나 `schema`가 `knots-sync/v2`가 아니면 exit 3(02 §3.2 리포 상태 오류)과 `npx knots-sync doctor` 안내를 출력한다.
3. `.agents/state/dashboard.json`이 있고 그 pid가 살아 있고 포트가 응답하면 그 주소를 출력하고 exit 0(DB-R23).
4. 에이전트 세션 판정(§3.11). 해당하면 읽기 전용 모드.
5. 토큰 32바이트(`crypto.randomBytes`, base64url)를 만들어 `.agents/state/dashboard.token`에 `O_CREAT|O_EXCL|O_NOFOLLOW`, 0600으로 쓴다. `.agents/state/`는 0700으로 만든다.
6. 승인 PIN 10자(base32, 50비트)를 만들어 표준 오류에만 출력한다. 파일·로그에 쓰지 않는다.
7. `127.0.0.1:<포트>`에 바인드한다. 기본 포트는 0(OS가 고른다). `dashboard.json`에 `{pid, port, startedAt, readOnly}`를 쓴다.
8. 표준 출력에 `http://127.0.0.1:<포트>/#t=<토큰>`을 출력한다. `--open`이면 브라우저를 연다(`open` · `xdg-open` · `start`).
9. SIGINT · SIGTERM에서 `dashboard.token` · `dashboard.json`을 지우고 끝낸다.

화면 파일은 토큰 없이 받는다(데이터가 없다). 화면 스크립트가 주소의 `#t=` 값을 `localStorage["hk-token-<포트>"]`에 옮기고 `history.replaceState`로 주소에서 지운 뒤, 모든 API 요청에 `Authorization` 머리로 붙인다.

### 3.2 읽기 모듈과 캐시

캐시 항목은 `{stamp, value, computedAt}`이다. 요청마다 stamp만 다시 구하고 같으면 값을 쓴다(DB-R6). stat 호출은 파일당 1회다.

| 읽기 모듈 | 원본 | stamp | 비싼 계산 |
|---|---|---|---|
| config | `knots-sync.json` · `local/knots-sync.local.json` · `knots-sync.lock` | 세 파일의 `(mtimeMs, size, ino)` | — |
| intents | `.agents/docs/intents/*/` 의 `intent.md` · `intent.json` · `units.json` · `questions.md` · `approvals.md` · `plans/**` | 폴더 목록 + 파일 stat | — |
| issues | 체크아웃마다 `.agents/docs/issues/*/`, 체크아웃 안 된 이슈 브랜치는 git 객체 | 체크아웃: 파일 stat · 브랜치: tip SHA | `bash scripts/board.sh --json --root <체크아웃>` |
| verify | 체크아웃마다 `.agents/state/verify-last.json`(형식은 01) | 파일 stat | — |
| reports | `.agents/reports/findings-latest.json` · `quality-gate-last.json` · `review/*.md` · `metrics/latest.json`(형식은 09) | 파일 stat | — |
| worktrees | `python3 scripts/harness/worktree.py list --json`(형식은 05) | `.git/worktrees/` 목록 + 각 HEAD stat | 용량: TTL 10분, 비동기 |
| sessions | `.agents/state/sessions/*.json` · `session-coordination.py context --json` | 폴더 stat | 생존 검사 §3.9 |
| skills | 07의 스캐너 모듈 | 07의 stamp | TTL 10분 |
| harness | 02의 doctor 모듈, `outdated`(네트워크) | lock stat · 60초 | outdated: 버튼을 눌렀을 때만, TTL 1시간 |
| entire | `git for-each-ref refs/entire/checkpoints/`, 커밋 트레일러(10) | refs stat | explain: 눌렀을 때만 |
| ops | `.agents/docs/ops/**/*.md` · `ops/metrics-baseline.json` · `rule-candidates/*.md` · `.agents/reports/deploy/*.json` · `.agents/reports/metrics/delivery-*.json`(형식은 14) | 폴더 stat | 전달 지표: TTL 10분 |

이슈 찾기는 세 출처의 합집합이고, 같은 키면 앞의 것이 이긴다:

1. 그 이슈 브랜치가 체크아웃된 폴더(메인 폴더 포함)의 작업 트리. 커밋 안 된 변경까지 보인다. `source: "worktree"`.
2. 체크아웃 안 된 로컬 브랜치 `^(feat|fix|chore|docs|refactor|exp)/<키>-<이름>$`의 tip. `git ls-tree` · `git show <브랜치>:<경로>`로 읽는다. `source: "branch"`.
3. 메인 폴더 base 브랜치의 작업 트리(병합된 이슈). `source: "base"`.

진행 상태 계산은 `board.sh --json`을 체크아웃마다 부른다. 01 §3의 board 상태 계산을 그대로 JSON으로 내는 인자이고 P20에서 더한다. 같은 함수를 쓰므로 진행 탭과 `board.sh`의 상태가 같다. git 객체로만 읽는 이슈는 v2 배치(`tasks.md` 머리의 `state`)만 지원한다. v1 폴더 배치는 base에만 있다.

목표 시간: 이슈 20개 · worktree 3개 fixture에서 `GET /api/v1/overview` p95 500ms 이하(용량 계산 제외, 캐시가 찬 뒤).

### 3.3 데이터 모델

응답 봉투는 하나다. 성공 `{"ok": true, "data": …, "meta": {…}}`, 실패 `{"ok": false, "error": {"code": "…", "message": "…", "details": {…}}}`.

이슈:

```json
{
  "key": "HDRV3D-12",
  "name": "upload-cleanup",
  "dir": ".agents/docs/issues/HDRV3D-12-upload-cleanup",
  "area": "upload", "intent": "INT-3", "unit": "U-2",
  "branch": "feat/HDRV3D-12-upload-cleanup",
  "checkout": { "kind": "worktree", "path": "../hdr.worktrees/HDRV3D-12-upload-cleanup", "dirty": true },
  "source": "worktree",
  "docs": {
    "requirements": { "status": "approved", "sha256": "4be1…", "clarify": 0, "approval": "valid" },
    "design":       { "status": "in-review", "sha256": "9f1c…", "clarify": 0, "approval": "none" },
    "tasks":        { "status": "draft", "state": null, "bolts": { "total": 0, "done": 0 } }
  },
  "stage": "design",
  "waitingOn": { "gate": "design", "approvers": ["dev"], "mine": true },
  "review": { "open": { "CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 0 }, "report": ".agents/reports/review/HDRV3D-12.md" },
  "verify": { "level": "changed", "status": "passed", "finishedAt": "2026-11-23T01:02:11Z", "durationMs": 94000, "slowestStep": "gradle :upload:check 74s" },
  "roles": { "implement": "claude", "review": "codex" },
  "sessions": ["4f0c2d1e"],
  "jira": { "key": "HDRV3D-12", "status": "설계" },
  "checkpoints": 0
}
```

- `approval`: `none` · `valid`(승인 기록의 sha256 = 현재 sha256) · `stale`(승인 뒤 바뀜) · `invalid`(승인자가 approvers에 없음).
- `stage`: `flow.gates` 순서에서 처음으로 통과하지 못한 게이트. 통과 조건은 09 §3.8 게이트 표를 그대로 쓴다.
- `jira`는 jira-workflow 모듈을 켰을 때만, `checkpoints`는 entire 모듈을 켰을 때만 넣는다.

Intent는 `{key, name, dir, source: "kit"|"aidlc", status, units: [{id, title, kind, dependsOn, issue, progress}], questions: {open, total}, plans: [...], stage}`다. `progress`는 연결된 이슈의 `stage`에서 계산하고 `units.json`에 쓰지 않는다(08 §3.5).

### 3.4 "처리할 일" 모으기

목록의 각 항목은 `{rank, kind, target, title, reason, since, link, mine}`이다. 아래 순서(rank)로 정렬하고, 같은 rank 안에서는 `since`가 오래된 것부터다. 50건을 넘으면 rank별 개수만 더 보여 준다(DB-R24).

| rank | kind | 조건 | since |
|---|---|---|---|
| 1 | `review-blocker` | 이슈의 열린 CRITICAL · HIGH 리뷰 지적이 1건 이상(09 §3.1) | 보고서 시각 |
| 1 | `quality-blocker` | 최근 품질 게이트가 `failed`이고 새 CRITICAL이 1건 이상 | 게이트 결과 시각 |
| 2 | `gate-mine` | 현재 게이트 문서가 `in-review`이고 현재 git 사용자가 그 게이트 approvers에 있다 | 문서 mtime |
| 3 | `questions` | 답이 없는 질문이 막는 게이트가 현재 게이트다(08 §3.3), 또는 문서에 `[NEEDS CLARIFICATION` 표시가 있다 | 질문 파일 mtime |
| 4 | `verify-failed` | 진행 중 이슈의 `verify-last.json`이 `failed` 또는 `incomplete` | 검증 시각 |
| 4 | `auto-verify-stopped` | 자동 검증 배포가 `stopped` 또는 연속 실패 1회 이상(14 §3.5) | 마지막 실행 시각 |
| 5 | `approval-stale` | `approval = stale` 인 문서 | 문서 mtime |
| 6 | `gate-others` | rank 2와 같지만 현재 사용자가 approvers에 없다 | 문서 mtime |
| 7 | `worktree-cleanup` | worktree가 끝의 정의(변경 없음 + push 안 된 커밋 0 + 브랜치 병합됨)를 만족, 또는 리포당 개수가 `git.maxPerRepo` 초과 | 마지막 사용 시각 |
| 8 | `harness` | doctor 결과가 `drifted` · `stale` · `symlink-found` · `missing` · 역할 불일치 1건 이상 | doctor 시각 |
| 8 | `ops-followup` | 운영 기록의 `미달` 지표를 장애 · 후보가 가리키지 않음, 또는 14일 넘은 `proposed` 규칙 후보(14 §3.7 · §3.11) | 기록 · 후보 mtime |
| 9 | `dispatch-stale` | 24시간 넘게 소비되지 않은 대기함 항목 | 생성 시각 |
| 9 | `jira-conflict` | Jira 상태와 킷 단계가 어긋난 이슈(10 §3.4) | 동기화 시각 |

`deploy` 승인 대기는 rank 2 · 6(`gate-mine` · `gate-others`)에 배포 기록 단위로 들어간다.

worktree 정리 항목은 명령을 보여 주기만 한다(`python3 scripts/harness/worktree.py gc --apply`). 화면에서 실행하지 않는다.

### 3.5 REST API

기준 경로 `/api/v1`. 모든 요청에 토큰이 필요하다. 목록 응답에 `ETag`를 붙이고 `If-None-Match`가 같으면 304를 낸다. 화면은 5초마다 overview를 다시 묻는다.

| 메서드 · 경로 | 하는 일 | PIN |
|---|---|---|
| `GET /session` | 리포 이름, 메인 폴더, 현재 git 사용자와 속한 그룹, 켠 모듈, `flow`, `readOnly` | — |
| `GET /overview` | 처리할 일, 단계별 이슈 수, 살아 있는 세션 수, doctor 요약 | — |
| `GET /intents` · `GET /intents/{key}` | Intent 목록 · Intent 하나(Unit, 질문 수, 기획물, 승인) | — |
| `GET /issues?area=&stage=&intent=` · `GET /issues/{key}` | 이슈 목록 · 이슈 하나 | — |
| `GET /docs?path=` | 문서 하나: `{path, sha256, frontmatter, html, markdown, writable, checkout}` | — |
| `PUT /docs` | 문서 저장(§3.6) | — |
| `GET /questions?target=` | 질문 목록(08 형식 파싱 결과) | — |
| `POST /questions/{target}/{qid}/answer` | 질문 답 저장(§3.8) | 필요 |
| `POST /approvals` | 승인 · 수정 요청(§3.7) | 필요 |
| `POST /reviews/{key}/{findingId}/decision` | 리뷰 지적 판단(위험 수용 · 수정 필요) | 필요 |
| `GET /verify?issue=` | 체크아웃별 마지막 검증, 단계별 소요 시간 | — |
| `GET /reports/summary` · `GET /reports/findings?issue=&severity=&new=` | 품질 게이트·심각도별·추세 · 발견 목록(09 형식) | — |
| `GET /reviews/{key}` | 리뷰 보고서와 review.md 처리 상태 | — |
| `GET /worktrees` | worktree 목록 · 용량 · 끝의 정의 판정 | — |
| `GET /sessions` | 살아 있는 세션, 점유 파일 | — |
| `GET /skills?stage=&harness=` | 07 스캐너 결과. 내보내기에는 없다 | — |
| `GET /harness` · `POST /harness/outdated` | doctor · 층 · 역할 · 버전 · 토큰 사용량(12) · 최신 버전 조회(네트워크) | — |
| `POST /dispatch` · `GET /dispatch/queue` | 작업 요청(§3.10) · 대기함 목록 | — |
| `GET /checkpoints?issue=` · `GET /checkpoints/{id}` | 체크포인트 목록 · `entire checkpoint explain` 결과(텍스트) | — |
| `GET /ops` | 배포 기록 · 운영 기록 · 장애 · 다음 Intent 후보 · 전달 지표 · 자동 검증 배포 · 규칙 후보(형식 14 §3.12) | — |
| `POST /intake` | 요구사항 접수(§3.8.1, multipart) | — |
| `GET /flow?intent=` · `GET /intents/{key}/burn?days=` | 흐름 보기 nodes · edges(§3.16) · 남은 Bolt 계단선 | — |
| `POST /units/proposals` · `DELETE /units/proposals/{intent}` | Unit 변경 제안 저장 · 버리기(§3.16). 승인이 아니다 | — |
| `GET /projects` · `GET /projects/overview` | 등록부 프로젝트 목록 · 프로젝트를 가로지른 처리할 일(§3.17). 전체 프로젝트 모드에서만 | — |
| `GET /sessions?scope=machine` | 이 컴퓨터의 켜 둔 세션 전부(§3.17) | — |
| `GET /usage?days=&project=&harness=` · `GET /usage/now` · `GET /usage/kit` | 토큰 사용량 · 지금 세션 컨텍스트 · 킷이 덧붙인 양(§3.18) | — |
| `GET /history?q=&session=&role=` | 프롬프트 기록(§3.18). `history`가 꺼져 있으면 404 `history_off` | — |
| `GET /raw/{경로}?exp=&sig=` | 문서 안 이미지·와이어프레임 원본. 서명 URL, 읽기 전용 | — |

`/raw`는 브라우저가 `<img>`·`<iframe>`으로 부르므로 머리를 붙일 수 없다. 대신 `sig = HMAC-SHA256(토큰, 경로 + "\n" + exp)`이고 `exp`는 발급 후 600초다. 문서 응답의 HTML이 이미지 주소를 서명 URL로 바꿔 준다. 응답에는 `Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'`과 `X-Content-Type-Options: nosniff`를 붙인다.

문서 저장 예:

```http
PUT /api/v1/docs
Authorization: Bearer …
Content-Type: application/json

{ "path": ".agents/docs/issues/HDRV3D-12-upload-cleanup/requirements.md",
  "baseSha256": "4be1…", "markdown": "---\nstatus: in-review\n…",
  "force": false }
```

```json
{ "ok": true,
  "data": { "sha256": "7a02…", "savedTo": "../hdr.worktrees/HDRV3D-12-upload-cleanup",
            "branch": "feat/HDRV3D-12-upload-cleanup", "statusChanged": "approved→in-review",
            "changeSummary": { "headings": ["## 4. Acceptance Criteria"], "ids": ["R2.3"], "added": 4, "removed": 1 },
            "leaseHeldBy": null },
  "meta": { "commit": "커밋은 그 이슈의 세션이 한다" } }
```

충돌 예(DB-R7):

```json
{ "ok": false,
  "error": { "code": "conflict", "message": "다른 곳에서 먼저 저장했다",
             "details": { "currentSha256": "c3d9…", "currentMarkdown": "…" } } }
```

승인 예:

```http
POST /api/v1/approvals
{ "target": { "issue": "HDRV3D-12" }, "gate": "design", "decision": "approved",
  "phrase": "B안으로 반영해", "docSha256": "9f1c…", "pin": "K7Q2…" }
```

```json
{ "ok": true, "data": { "entryId": "01JDQ4…", "approvals": ".agents/docs/issues/HDRV3D-12-upload-cleanup/approvals.md",
  "approver": "kim@example.com", "group": "dev", "statusChanged": "in-review→approved" } }
```

오류 코드:

| HTTP | code | 언제 |
|---|---|---|
| 400 | `bad_request` | JSON 형식 오류, 필수 필드 없음, 1 MiB 초과 |
| 401 | `unauthorized` | 토큰 없음·틀림 |
| 403 | `forbidden_path` · `forbidden_origin` · `pin_required` · `pin_locked` · `not_an_approver` · `read_only` | §3.6 · DB-R5 · DB-R12 · PIN 5회 실패 · DB-R11 · 읽기 전용 모드 |
| 404 | `not_found` | 이슈·문서·질문 없음 |
| 409 | `conflict` · `branch_not_checked_out` · `ambiguous_branch` · `doc_changed` · `already_approved` · `lease_held` | DB-R7 · DB-R9 · 브랜치 둘 이상 · 승인 대상 sha 불일치 · 같은 sha 이미 승인 · 다른 세션 점유 중이고 `force` 없음 |
| 421 | `misdirected` | DB-R2 |
| 422 | `status_change_forbidden` · `needs_clarification` · `gate_not_in_flow` · `gate_precondition` | DB-R15 · DB-R13 · `flow.gates`에 없는 게이트 · 09 게이트 조건 미충족 |
| 500 | `internal` | 예상하지 못한 오류. 메시지에 경로·스택을 넣지 않고 서버 터미널에만 출력한다 |

### 3.6 쓰기 규칙

허용 경로(체크아웃 루트 기준, glob):

| 경로 | 방법 |
|---|---|
| `.agents/docs/intents/*/intent.md` · `current-state.md` · `plans/**/*.md` | `PUT /docs` |
| `.agents/docs/issues/*/requirements.md` · `design.md` · `tasks.md` | `PUT /docs` |
| `.agents/docs/decisions/*.md` · `.agents/docs/ops/**/*.md` · `.agents/docs/codebase/*.md` · `.agents/docs/rule-candidates/*.md` | `PUT /docs`(배포 기록의 `RESULT` 구간 · 운영 기록의 `METRICS` 구간은 바꾸면 409) |
| `.agents/docs/**/questions.md` | 답 API만(형식 보존) |
| `.agents/docs/**/approvals.md` | 승인 · 리뷰 판단 API만(덧붙이기) |
| `.agents/docs/intents/*/units.proposed.json` | 변경 제안 API만(§3.16) |
| `.agents/docs/intents/*/units.json` | intent 게이트 승인 처리만(대기 중인 제안을 옮길 때, §3.16) |
| `.agents/state/dispatch-queue/*.json` · `.agents/state/approvals-log.jsonl` · `.agents/state/sessions/*.json`(죽은 세션 정리) | 서버 내부 |

그 밖은 모두 403이다. 위 두 경우 밖의 `units.json` · `intent.json` · `plans/screens/*.html` · `review.md` · `docs/features/**` · 규칙·스킬·설정은 쓰지 않는다. 경로 검사:

1. 상대 경로만, `\`·NUL·`..`·빈 마디·`.git` 마디 거부.
2. 체크아웃 루트부터 마디마다 `lstat`, 심볼릭 링크가 하나라도 있으면 거부.
3. 대상이 일반 파일(새 파일은 `plans/**/*.md` · `decisions/*.md` · `ops/records/*.md`만 만들 수 있다), UTF-8, 1 MiB 이하.
4. Markdown 머리(YAML)가 저장 뒤에도 읽혀야 한다.

이슈 문서를 쓸 체크아웃 찾기(DB-R9):

```text
resolve(issueKey):
  branches = git for-each-ref refs/heads --format=%(refname:short) | /^[a-z]+\/<키>-/
  wts = git worktree list --porcelain            # 메인 폴더가 첫 항목
  if len(branches) > 1: 409 ambiguous_branch (목록)
  if len(branches) == 1:
      wt = wts에서 branch가 같은 항목
      if wt: return wt.path
      409 branch_not_checked_out
          "feat/<키>-… 가 어느 폴더에도 체크아웃돼 있지 않다. wt new <키> 뒤 다시 저장한다"
  # 브랜치가 없다: base에 있는 이슈(병합됨 또는 base에서 만듦)
  if 메인 폴더 현재 브랜치 == git.base and 문서가 있다: return 메인 폴더
  409 branch_not_checked_out
```

Intent 문서는 설계 세션이 쓰는 폴더다. Intent 키를 담은 브랜치(`docs/<INT 키>-…`)가 있으면 이슈와 같은 규칙으로 찾고, 없으면 메인 폴더에 쓴다.

저장 순서:

1. 경로별 프로세스 내 잠금을 잡는다.
2. 현재 바이트의 sha256을 구해 `baseSha256`과 비교(DB-R7).
3. 저장할 내용의 머리 `status`가 `approved`로 바뀌면 422(DB-R15). 현재 `approved`인 문서를 고치면 `status`를 `in-review`로 바꾸고 응답에 `statusChanged`를 넣는다(승인 뒤 내용이 바뀌었으므로 다시 승인한다).
4. `session-coordination.py context --json`의 점유 파일과 겹치고 그 세션이 살아 있으면 `force: true`가 없을 때 409 `lease_held`. `force`면 저장만 하고, 응답의 `leaseHeldBy`로 화면이 그 세션에 `doc-changed` 요청을 보낼지 묻는다. 보내는 것은 사람이 고를 때뿐이다(DB-R25).
5. 원래 줄바꿈(LF·CRLF)과 파일 권한을 지켜 같은 폴더의 임시 파일에 쓰고 `fsync` 뒤 `rename`.
6. 변경 요약을 계산한다: 바뀐 줄이 속한 `#` 제목, 바뀐 줄의 `R\d+(\.\d+)*` · `SC-\d+` · `S-\d+` · `U-\d+` ID, 더한·뺀 줄 수.

### 3.7 승인 기록

`approvals.md`는 이슈 폴더와 Intent 폴더에 하나씩 있다. 덧붙이기만 하고, 에이전트는 쓰지 않는다(09 §3.8). 형식:

```markdown
# 승인 기록 — HDRV3D-12

<!-- 덧붙이기만 한다. 에이전트는 이 파일을 쓰지 않는다. 형식: docs/design/06 §3.7 -->

## 2026-11-23T14:05:12+09:00 · design · approved
- 승인자: kim@example.com (Kim) · 그룹: dev
- 대상: design.md · sha256: 9f1c2ab0…(64자)
- 문구: "B안으로 반영해"
- 경로: dashboard
- 기록 ID: 01JDQ4ZK6B7Y0M9W2S3T4V5X6Y

## 2026-11-24T09:40:02+09:00 · review/F-3 · risk-accepted
- 승인자: kim@example.com (Kim) · 그룹: dev
- 대상: .agents/reports/review/HDRV3D-12.md · 지문: 5d1e…
- 문구: "레거시 경로라 이번 MR에서는 고치지 않는다"
- 경로: dashboard
- 기록 ID: 01JDS…
```

- 제목 줄 정규식: `^## (\S+) · ([a-z]+(?:/F-\d+)?) · (approved|changes-requested|risk-accepted|fix-required)$`.
- `경로`: `dashboard` · `terminal`(사람 터미널의 `npx knots-sync approve` · `approve.py`) · `jira`(10 §3.4, `근거: changelog <id>` 줄을 더한다) · `aidlc`(AI-DLC 사람 입력 확인 훅이 받은 승인을 `sync aidlc`가 옮긴 것. 기록에 승인자가 있을 때만이고 `- source: aidlc` · `- 근거: <AI-DLC 기록 파일 경로>` 줄을 더한다, 10 §3.2). 이 넷 밖의 승인은 없다. 채팅에서 한 말과 AI-DLC 세션의 그 밖의 대화는 승인 기록이 되지 않는다(09 §3.8).
- `문구`는 승인하는 사람이 승인 화면 · 명령에 넣은 말이다. 기록으로 남을 뿐 승인 여부를 정하지 않는다.
- 선택 줄: `- 규칙 후보: 예`(`changes-requested`에만, 14 §3.11), `- 롤백 면제: <사유>`(`deploy`에만, 14 §3.4). 둘 다 승인하는 사람이 넣는다.
- 이 형식을 바꾸면 Node(대시보드)와 Python(`approve.py` · `sdd_gates.py`) 파서 둘을 같이 고친다. 두 구현은 `tests/fixtures/approvals/`의 같은 입력·기대값으로 시험한다.

승인 처리:

```text
POST /approvals {target, gate, decision, phrase, docSha256, pin}
1. readOnly면 403. PIN 비교(상수 시간). 5회 틀리면 서버가 끝날 때까지 PIN API를 막는다.
2. gate ∈ flow.gates(공유 설정만 읽는다. 개인 층의 값은 무시)가 아니면 422.
3. 대상 문서: codebase → current-state.md(+ 머리 models의 모델 파일 sha도 기록), intent → intent.md(+ units.json sha도 기록.
   units.proposed.json이 있으면 승인 화면이 제안을 반영한 결과를 보여 주고, 9단계에서 옮긴 뒤의 units.json sha를 기록한다, §3.16),
   plans → plans/*.md 전부, requirements·design·tasks → 그 문서, deploy → 배포 기록의 계획 구간(14 §3.4, 포함 이슈마다 덧붙인다),
   mr·done → 문서 없음(docSha256 생략).
4. 문서 status ∈ {draft, in-review}가 아니면 422. 같은 sha로 이미 approved 기록이 있으면 409.
5. 문서에 "[NEEDS CLARIFICATION" 이 있으면 422(DB-R13).
6. 현재 sha256 ≠ docSha256 이면 409 doc_changed.
7. 09 §3.8 게이트 조건(앞 게이트 통과, 리뷰 CRITICAL·HIGH 0건 등)을 확인. 아니면 422 gate_precondition.
8. 승인자 = git -C <체크아웃> config user.email. 비어 있으면 403.
   approvers[gate]의 항목이 이메일이면 직접 비교, 그룹 이름이면 groups[그룹]에서 찾는다. 없으면 403(DB-R11).
9. approvals.md에 덧붙이고, decision이 approved면 문서 머리 status를 approved로 바꾼다.
   intent 게이트이고 제안이 있으면 제안을 units.json에 옮기고 제안 파일을 지운다(DB-R29).
   뒤 쓰기가 하나라도 실패하면 앞 파일을 원래 바이트로 되돌리고 500.
10. .agents/state/approvals-log.jsonl에 {entryId, target, gate, sha256, at} 한 줄. 201 응답.
11. 응답에 그 이슈의 살아 있는 세션을 넣는다. 화면은 "세션에 알리기" 버튼만 보이고, 사람이 누를 때 `approved` 요청을 보낸다(§3.10, DB-R25).
```

`changes-requested`는 문서 `status`를 바꾸지 않고 기록만 남긴다. 그 이슈 세션에 `changes-requested` 요청을 보내는 것은 사람이 "세션에 알리기"를 누를 때뿐이다.

### 3.8 질문 답

질문 형식은 08 §3.3이다. `POST /questions/{target}/{qid}/answer` 본문은 `{choice: "A"|"B"|…|"other", text, baseSha256, pin}`이다.

1. `questions.md`의 sha256을 비교한다(DB-R7과 같은 409).
2. 질문의 `답할 직무`가 그룹 이름이고 현재 사용자가 그 그룹에 없으면 `- 의견:` 줄로 저장하고 질문은 열린 채로 둔다. 있으면 `- 답:` 줄을 채운다.
3. 답 줄은 `- 답: B · kim@example.com · 2026-11-23T10:12:40+09:00`, 자유 글은 다음 줄 `- 메모: …`(한 줄, 500자 이하, 줄바꿈 제거). 몹 정리 세션이 열려 있으면 본문의 `by`(참석자 email)를 답한 사람으로 쓰고 2단계 그룹 검사도 `by`로 한다. 줄 끝에 `· 기록: <이 컴퓨터 git user.email>`을 붙인다(08 §3.14).
4. 같은 질문에 답이 이미 있으면 새 답으로 바꾸고 이전 답을 `- 이전 답:` 줄로 남긴다.
5. 모든 질문에 답이 차면 머리 `status: answered`로 바꾼다. 화면은 "설계 세션에 알리기"를 보이고, 사람이 누를 때만 `answers-ready` 요청을 보낸다(DB-R25).

### 3.8.1 요구사항 접수

`POST /api/v1/intake`는 multipart로 받는다. 필드는 `title`, `kind`(product·feature·change·refactor·bug, 08 §3.11), `body`(Markdown), `links[]`, `files[]`이다.

- 토큰이 필요하고 PIN은 필요 없다. 접수는 승인이 아니다.
- 처리 순서:
  1. Intent 키를 만든다. `jira-workflow`가 켜져 있으면 Jira 에픽 키를 받고, 아니면 `INT-<N>`(기본 브랜치 최댓값 + 1)이다.
  2. `intents/<INT>-<이름>/intake.md`와 `attachments/`를 쓴다.
  3. 추출본을 만든다(08 §3.11).
  4. 비밀값을 검사한다.
- 응답: `{ "intent": "INT-8", "path": "…", "files": [{ "name", "size", "sha256", "extracted": true|false }], "warnings": [] }`.
- 제한: 파일 20MB, 합계 100MB. 넘으면 413이고, 비밀값이 나오면 422로 거부한다.
- `kind = bug`면 Intent 대신 이슈 폴더를 만든다(`issues/<키>-<이름>/requirements.md` 초안 + `attachments/`).
- 접수 뒤 화면은 설계 역할 세션에 `/kns-intent <INT>`를 요청할지 묻는다. 사람이 고를 때만 보낸다(§3.10, DB-R25).
- 접수는 모델을 부르지 않는다. 첨부 추출은 킷 스크립트와 설치된 변환기만 쓰고, 이미지 설명은 기본으로 만들지 않는다(08 §3.11).
- 쓰기 허용 경로에 `intents/*/intake.md`와 `intents/*/attachments/**`, `issues/*/attachments/**`를 더한다(§3.6).

### 3.9 세션 등록

세션 시작 훅(`scripts/hooks/session-register.py`, Claude · Codex · Kiro 공통)이 메인 폴더의 `.agents/state/sessions/<세션 id>.json`을 쓴다(0600, 폴더 0700). worktree에서 연 세션도 `git rev-parse --git-common-dir`로 메인 폴더를 찾아 같은 곳에 쓴다.

```json
{
  "schema": "knots-sync.session/v1",
  "id": "4f0c2d1e-…",
  "harness": "claude", "harnessVersion": "2.1.230",
  "name": "api-worker",
  "role": "implement", "roleSource": "branch",
  "issue": "HDRV3D-12",
  "cwd": "/Users/me/dev/hdr.worktrees/HDRV3D-12-upload-cleanup",
  "checkout": "worktree", "branch": "feat/HDRV3D-12-upload-cleanup",
  "pid": 41233, "pidStartedAt": "Mon Nov 23 09:58:01 2026",
  "startedAt": "2026-11-23T09:58:02+09:00", "lastSeenAt": "2026-11-23T10:14:40+09:00",
  "turn": "idle",
  "inbox": { "kind": "uds", "path": "/tmp/cc-socks-501/…" },
  "permissionMode": "acceptEdits"
}
```

- `id`: 훅 입력의 `session_id`(없으면 기존 `session-context.py`의 후보 순서). 정규식 `[A-Za-z0-9][A-Za-z0-9_.-]{0,63}`.
- `role`: `KNS_ROLE` 환경 변수 → 이슈 브랜치 체크아웃이면 `implement` → `--docs` worktree면 `docs` → `roles`에서 그 하네스가 맡은 역할이 하나뿐이면 그것 → `unknown`. `roleSource`에 근거를 적는다.
- `issue`: `KNS_ISSUE` → 브랜치 이름의 키 → `null`.
- `pid`: 훅 프로세스에서 부모를 따라 올라가 하네스 실행 파일(`claude` · `codex` · `kiro-cli`)을 찾는다. `pidStartedAt`은 `ps -o lstart=`로 pid 재사용을 가린다.
- `inbox`: `CLAUDE_CODE_MESSAGING_SOCKET`이 있을 때만. `CLAUDE_CODE_MESSAGING_TOKEN`은 저장하지 않는다(macOS·Linux는 인증 줄이 선택이다. Windows는 v2.2에서 소켓 요청을 쓰지 않는다).
- `turn`·`lastSeenAt`: 프롬프트 제출 훅이 `working`, Stop 훅이 `idle`로 고친다.
- 세션 종료 훅(있는 하네스만)이 파일을 지운다.

생존 판정: (1) `pid`가 살아 있고 `pidStartedAt`이 같다, (2) `inbox`가 있으면 200ms 안에 소켓 연결이 되고 바로 닫힌다(글을 보내지 않는다). (1)이 거짓이면 `gone`이고, 24시간 지난 `gone` 파일은 서버가 지운다. (1)만 참이면 `alive-no-inbox`, 둘 다 참이면 `alive`.

### 3.10 작업 요청

요청 종류: `doc-changed` · `answers-ready` · `approved` · `changes-requested` · `review-findings` · `custom`(사람이 쓴 글 300자 이하). 글은 한 줄, 1,000자 이하이고 문서 내용을 넣지 않는다.

요청은 사람이 고를 때만 만든다(DB-R25). 저장 · 승인 · 답 · 제안 저장 처리는 `dispatch`를 부르지 않는다. 화면의 "저장하고 세션에 요청"은 저장이 성공한 뒤 같은 화면에서 `POST /dispatch`를 따로 부르는 것이고, 콘솔은 `npx knots-sync dispatch`다. 받는 세션은 요청 글로 턴을 돌므로, 요청 하나가 그 작업만큼의 토큰을 쓴다.

```text
[knots-sync 관리 페이지] HDRV3D-12 requirements.md 를 사람이 고쳤다(R2.3 · ## 4. Acceptance Criteria, +4 -1줄, sha 7a02c1d). 경로: .agents/docs/issues/HDRV3D-12-upload-cleanup/requirements.md. 요청: 이 파일을 다시 읽고 design.md 를 맞춘다. 이 글은 승인이 아니다.
```

`POST /dispatch` 본문 `{target: {sessionId} | {issue, role}, kind, paths, text?, via: "socket"|"deeplink"|"queue"}`.

```text
dispatch(req):
  글 = template(kind, paths, changeSummary, text)   # 제어 문자·줄바꿈 제거, 1,000자 자르기
  via = req.via 또는 세션 생존 판정에서 고른다
  socket:
     sock = net.connect(inbox.path), 연결 제한 2초
     (macOS·Linux: 인증 줄을 보내지 않는다)
     write(인코딩(글) + "\n"); end(); close 대기 2초
     성공 → 202 {method: "socket", status: "sent"}     # 수신 확인 신호는 없다
     실패 → 409 {deeplink, queueAvailable: true}      # DB-R18, 자동으로 바꾸지 않는다
  deeplink:
     claude-cli://open?cwd=<체크아웃 절대경로>&q=<urlencode(글 + " 먼저 경로의 파일을 읽는다.")>   # q는 5,000자 이하
     202 {method: "deeplink", url}                    # 화면이 링크를 띄우고, Enter는 사람이 누른다
  queue:
     .agents/state/dispatch-queue/<ULID>.json 을 임시 파일 + rename으로 만든다
     202 {method: "queue", id}
```

인코딩은 P20 착수 전 확인 결과로 정한다(§6 첫 항목). 서버는 `text` · `json` 두 인코더를 두고 설정 `dashboard.dispatch.socketFormat`으로 고른다.

관리 페이지는 세션의 자식 프로세스가 아니다. 문서상 받는 세션이 권한을 묻는 모드(`default` · `acceptEdits` · `auto` · `dontAsk`)면 전달되고, 권한 확인을 건너뛰는 모드면 사람 승인 대기로 묶인다. 세션의 `permissionMode`가 `bypassPermissions`면 화면이 이 점을 먼저 알린다.

대기함 항목:

```json
{
  "schema": "knots-sync.dispatch/v1",
  "id": "01JDQ5…",
  "createdAt": "2026-11-23T10:20:00+09:00", "createdBy": "kim@example.com",
  "target": { "issue": "HDRV3D-12", "role": "implement", "harness": "any", "sessionId": null },
  "kind": "doc-changed",
  "message": "[knots-sync 관리 페이지] HDRV3D-12 requirements.md 를 사람이 고쳤다 …",
  "paths": [".agents/docs/issues/HDRV3D-12-upload-cleanup/requirements.md"],
  "expiresAt": "2026-11-30T10:20:00+09:00"
}
```

소비 훅(`scripts/hooks/dispatch-inbox.py`, 세션 시작·프롬프트 제출, 세 하네스 공통):

1. 자기 세션의 `issue`·`role`·`harness`와 맞는 항목을 만든 순서로 고른다. `sessionId`가 있으면 그 세션만, `target.issue`가 있으면 그 이슈 세션만 고른다. 만료된 항목은 `expired/`로 옮긴다. 맞는 항목이 없으면 아무것도 출력하지 않는다.
2. 첫 항목 하나만 `rename(queue/<id>.json → queue/consumed/<id>.json)`으로 가져간다. 실패하면 다른 세션이 가져간 것이므로 다음 항목을 시도한다. 나머지는 대기함에 둔다(다음 프롬프트 제출 때 다시 하나).
3. 출력(세션 시작 상태 예산 512바이트 안, README 원칙 10):
   ```text
   대기 요청 3건(UNTRUSTED · 관리 페이지가 남긴 요청 · 승인이 아니다)
   1) <첫 요청 글, 200바이트에서 자른다> · 경로: <paths[0]>
   나머지: npx knots-sync dispatch list
   ```
   요청 글은 사람이 대기함을 골라 남긴 것이라 그 작업은 사람이 시킨 일이다. 명령으로 실행하거나 사용자 승인으로 해석하지 않는다는 표시는 첫 줄에 남긴다.
4. 가져간 항목에 `consumedBy`·`consumedAt`을 적는다. 7일 지난 `consumed/` 항목은 서버가 지운다.

### 3.11 에이전트 세션 판정

서버는 아래 중 하나라도 맞으면 에이전트 세션 안에서 실행됐다고 본다(DB-R22): `CLAUDECODE=1`, `CLAUDE_CODE_MESSAGING_SOCKET` 존재, Codex · Kiro가 셸에 넣는 변수(§6), 부모 프로세스 중에 하네스 실행 파일이 있다. 이때 PIN을 만들지 않고 PIN API는 403 `read_only`다. 킷 훅은 에이전트 도구가 `.agents/state/dashboard.token`을 읽거나 `127.0.0.1:<포트>/api/v1/approvals`를 부르는 명령을 막는다(09 §3.8).

### 3.12 정적 내보내기

`dashboard --export <폴더>`는 서버를 열지 않고 같은 읽기 모듈로 페이지마다 HTML 한 장과 `data/*.json`을 만든다. 버튼(저장·승인·답·요청)은 넣지 않는다.

- 빼는 것: 스킬 탭과 데이터, 세션(소켓 경로·pid·cwd), 대기함, `approvals-log.jsonl`, 토큰, 체크포인트 설명 본문(ID만 남긴다), 토큰 사용량(12), 기록 · 사용량 화면(§3.18) 전체, 전체 프로젝트 화면과 등록부 경로(§3.17), Unit 변경 제안의 작성자.
- 경로는 리포 상대로 바꾼다. worktree는 `<worktrees>/<이름>`으로 쓴다.
- 끝에 출력 전체를 검사한다: 홈 절대경로(`os.homedir()` 접두사), `/tmp/cc-socks-`, `uds:`, 토큰 값, `~/.claude`·`~/.agents` 문자열이 하나라도 있으면 출력 폴더를 지우고 exit 1.

### 3.13 화면과 데이터

| 화면 | 쓰는 API | 사람이 하는 일 |
|---|---|---|
| 홈 · 처리할 일 | `overview` · `session` | 항목을 눌러 해당 화면으로 간다 |
| 전체 프로젝트(S00) | `projects` · `projects/overview` · `sessions?scope=machine` | 여러 리포의 처리할 일 · 진행 · 검증 · 킷 버전을 보고 리포로 들어간다(§3.17) |
| 진행 보드 | `intents` · `issues` | Intent → Unit → 이슈, 단계·맡은 하네스·세션을 본다. area·단계로 거른다 |
| 진행 흐름(S12) | `flow` · `intents/{key}/burn` · `POST units/proposals` | Unit 의존을 캔버스로 보고 변경을 제안한다(§3.16) |
| 문서 보기 | `docs` · `raw` | 렌더한 문서, 머리 정보, 승인 상태(`valid`·`stale`) |
| 문서 편집 | `docs` · `PUT docs` · `dispatch` | 고치고 저장, 충돌이면 현재 내용과 비교, 세션 골라 요청 |
| 승인 | `POST approvals` | 승인 · 수정 요청, 문구 입력, PIN 입력(탭마다 한 번) |
| 질문 답 | `questions` · `POST answer` | 선택지 고르기, 권장안 보기, 메모 |
| 검증 | `verify` · `reports/*` · `reviews/*` · `checkpoints` | 마지막 검증과 느린 단계, 품질 게이트, 리뷰 지적과 판단, 체크포인트 |
| 작업 공간 | `worktrees` · `sessions` | worktree 목록·용량·끝의 정의, 정리 명령 복사, 세션과 점유 파일 |
| 운영 | `ops` | 배포 · 장애 · 운영 기록, 다음 요구사항 후보, 전달 지표, 자동 검증 배포 상태, 규칙 후보(14 §3.12) |
| 스킬 | `skills` | 단계·하네스별 내 스킬, 이름 겹침(07) |
| 하네스 | `harness` · `POST harness/outdated` | doctor, 층별 덮어쓴 파일, 역할 배정, 버전, 토큰 사용량(12) |
| 새 요구사항(S11) | `POST intake` | 글 · 첨부로 접수하거나 Jira · Notion에서 가져온다(§3.8.1, 10 §3.6) |
| 기록 · 사용량(S13) | `usage` · `usage/now` · `usage/kit` · `history` | 토큰이 쓰인 곳, 지금 세션 컨텍스트, 킷이 덧붙인 양, 프롬프트 기록(§3.18) |

### 3.14 보안 정리

| 위협 | 대응 |
|---|---|
| 다른 컴퓨터에서 접속 | 127.0.0.1 바인드만(DB-R1) |
| DNS 리바인딩 | Host 검사(DB-R2), 토큰은 다른 출처의 저장소에서 읽을 수 없다 |
| CSRF | 쿠키를 쓰지 않는다. 브라우저가 자동으로 붙이는 자격 증명이 없고, 쓰기는 JSON · 같은 출처 `Origin`만(DB-R5) |
| 같은 컴퓨터의 다른 OS 사용자 | 토큰 파일 0600, 상태 폴더 0700 |
| 에이전트의 자기 승인 | PIN은 사람 터미널에만, 에이전트 세션 안 실행은 읽기 전용, 토큰 파일·승인 API 호출을 훅이 막는다. 같은 OS 사용자 권한의 임의 프로세스는 막지 못한다. 더 강한 증거가 필요한 게이트는 Jira 사람 전이(10)나 MR 플랫폼 승인을 쓴다 |
| 문서를 통한 XSS | Markdown 원문 HTML 끔, 링크는 `http(s)`·상대 경로만, 화면 CSP `script-src 'self'` |
| 와이어프레임 스크립트 | sandbox iframe(`allow-scripts`만), 서명 URL, 별도 CSP(DB-R21) |
| 경로 조작 · 심볼릭 링크 | §3.6 검사, `O_NOFOLLOW` |
| 큰 요청 | 본문 1 MiB, 동시 쓰기는 경로별 잠금 |
| 내보내기 유출 | §3.12 빼기 목록과 끝 검사 |


### 3.15 화면 없이 쓰기

관리 페이지의 모든 기능은 콘솔 명령으로도 된다. 서버의 API 처리와 CLI 명령은 같은 핵심 모듈(`packages/cli/src/core/`)을 부른다. 화면에만 있는 기능은 두지 않는다.

| 화면 | 기능 | 콘솔 |
|---|---|---|
| S00 | 전체 프로젝트 | `npx knots-sync status --all [--json]`, `projects list\|add\|remove` |
| S01 · S02 | 처리할 일, 진행 보드 | `npx knots-sync status [--json]`, `bash scripts/board.sh [--json]` |
| S12 | 진행 흐름 · Unit 변경 제안 | `npx knots-sync status --flow <INT> [--json]`, `units propose <INT> --add-dep U-3:U-1 \| --remove-dep … \| --split … \| --merge … \| --order …`, `units discard <INT>`, `flow gates [--json]` |
| S03 | 문서 보기 · 고치기 | 편집기로 `.agents/docs/issues/<키>-<이름>/*.md`를 직접 고친다 |
| S03 | 승인 | `npx knots-sync approve <키> --gate design --phrase "반영해" [--comment …]` |
| S04 | 질문 답 | `npx knots-sync answer <INT 또는 키> Q-2 --choice B [--text …]` 또는 `questions.md` 직접 편집 |
| S05 | 세션에 작업 요청 | `npx knots-sync sessions`, `npx knots-sync dispatch --to design-desk --path <파일> [--text …]` |
| S06 | 검증 · 품질 · 리뷰 판단 | `bash scripts/verify.sh --summary`, `npx knots-sync quality [--json]`, `npx knots-sync review decide <키> <발견 ID> --fix|--accept-risk --reason …` |
| S07 | 작업 공간 | `python3 scripts/harness/worktree.py list|open|done|gc` |
| S08 | 스킬 | `npx knots-sync skills [--stage 설계]` |
| S09 | 하네스 | `npx knots-sync doctor`, `outdated`, `list` |
| S10 | 운영 기록 | `npx knots-sync status --ops [--json]`, `ops new`, `metrics`, `deploy plan\|check\|record`, `rules candidates\|promote\|reject`(14) |
| S11 | 요구사항 접수 | `npx knots-sync intake --kind feature --title … --body-file req.md --attach 기획서.pdf 화면.png`, 세션에서 `/kns-intent --new <파일…>` |
| S13 | 기록 · 사용량 | `npx knots-sync usage [--days 7] [--kit] [--sources] [--json]`, `history [--q …] [--json]` |
| S05 | 대기함 | `npx knots-sync dispatch list [--json]` · `dispatch drop <id>` |

- 승인·답·리뷰 판단 명령은 사람 터미널에서만 된다. §3.11의 에이전트 세션 판정에 걸리면 `read_only`로 거부한다. PreToolUse 훅도 에이전트의 셸 명령 중 `knots-sync approve|answer|review decide`를 막는다. 화면의 PIN은 웹 요청이 사람에게서 왔는지 확인하는 장치라 콘솔에는 없다.
- 콘솔 명령의 출력은 사람용 표가 기본이고, `--json`은 화면 API 응답과 같은 형식이다.
- 완료 기준에 대응 시험을 둔다. REST API 엔드포인트마다 같은 결과를 내는 CLI 명령이 있어야 하고, 둘의 `--json` 출력이 같아야 한다.

### 3.16 흐름 보기(S12)

Intent 하나의 Unit을 의존 순서대로 캔버스에 그린다. S02 보드와 같은 데이터를 다른 모양으로 보이고, 화면 머리의 "보드 · 흐름"으로 오간다(`/progress?view=flow`). 단계: 보기는 P20, 변경 제안은 P21(`/kns-intent`와 같이).

데이터(`GET /api/v1/flow?intent=INT-7`, 콘솔 `npx knots-sync status --flow INT-7 --json`):

```json
{ "intent": { "key": "INT-7", "title": "결제 개편", "approved": { "at": "2026-11-20", "by": "김지윤" } },
  "nodes": [
    { "id": "U-1", "type": "unit", "position": { "x": 0, "y": 1 },
      "data": { "issue": "HDRV3D-21", "area": "payment", "title": "결제수단 등록",
                "session": { "name": "api-worker", "harness": "claude" },
                "steps": ["requirements:done", "design:done", "tasks:done", "impl:active", "verify", "mr", "done", "deploy"],
                "flags": ["critical:1"], "bolts": { "done": 2, "total": 4, "estimated": false } } },
    { "id": "U-4", "type": "contract-unit", "position": { "x": 0, "y": 0 }, "data": { "contracts": ["api:payments.v2"] } } ],
  "edges": [ { "source": "U-4", "target": "U-1", "kind": "contract" },
             { "source": "U-1", "target": "U-2", "kind": "depends", "label": "환불 API" } ],
  "proposal": null, "readAt": "2026-11-23T10:52:00+09:00" }
```

- 자리: 서버의 `flow` 읽기 모듈이 `units.json`의 `dependsOn`으로 정한다. 기능 Unit은 의존 깊이가 열, 계약 Unit은 위 띠다. 같은 입력이면 같은 자리라서 화면과 `--json`이 같다.
- 상태: `board.sh --json`과 같은 계산(§3.2)에 승인 기록 · 검증 결과 · 세션 목록을 붙인다. 보드와 흐름의 상태가 다르면 결함이다.
- 그리기: React Flow(`@xyflow/react`, MIT, 묶인 d3 모듈은 ISC · d3-ease는 BSD-3)를 킷 릴리스 때 미리 묶은 정적 파일 `packages/dashboard/static/vendor/flow.bundle.js`(소스는 `packages/flow-view`, 02 §3.1)로 싣는다. 설치할 때 빌드하지 않고 CDN을 쓰지 않는다. CLI의 런타임 의존성은 0 그대로다. 흐름 보기를 열 때만 받는다. 라이선스 문구는 `packages/dashboard/static/vendor/THIRD-PARTY-LICENSES.txt`.
- 접근성: 노드는 Tab으로 가고 Enter · Space로 고르고 Esc로 푼다. 색만으로 말하지 않고 단계 · 상태를 글자로 같이 쓴다. 번들을 못 읽으면 보드로 돌린다.

Unit 변경 제안:

```json
{ "schema": "knots-sync.units-proposal/v1", "intent": "INT-7",
  "baseSha256": "<units.json sha256>", "createdBy": "kim@example.com", "createdAt": "2026-11-23T10:40:00+09:00",
  "changes": [ { "op": "add-dep", "unit": "U-3", "dependsOn": "U-1", "reason": "실패 코드를 결제수단 등록에서 받는다" },
               { "op": "remove-dep", "unit": "U-3", "dependsOn": "U-2", "reason": "…" } ] }
```

- `op`: `add-dep` · `remove-dep` · `split`(`into: [제목…]`) · `merge`(`units: [U-a, U-b]`) · `order`(`units: [...]`). 파일은 Intent마다 하나(`intents/<INT>/units.proposed.json`)이고 다시 저장하면 바꾼다.
- 저장(`POST /api/v1/units/proposals {intent, baseSha256, proposalSha256?, changes[]}`, 콘솔 `units propose`): 토큰만 필요하고 PIN은 묻지 않는다. 제안은 승인이 아니다. 읽기 전용 모드면 403 `read_only`.
- 거부: `units.json` sha가 다르면 409 `conflict`, `dependsOn` 고리가 생기면 422 `cycle`, 계약 Unit 합치기는 422 `contract_merge`, 없는 Unit은 422 `unknown_unit`.
- 반영: intent 게이트 승인 처리만 한다(§3.7 3 · 9단계, DB-R29). 승인 화면은 제안을 반영한 Unit 목록과 제안자(`createdBy`)를 보인다. 그 사이 `units.json`이 바뀌었으면 승인은 409 `proposal_stale`이고, 사람이 제안을 다시 저장하거나 버린다(`DELETE /api/v1/units/proposals/INT-7`, 콘솔 `units discard`).
- 저장해도 세션에 보내지 않는다(DB-R25). 설계 세션에 알리려면 사람이 "세션에 요청"을 누른다.

흐름 틀(`flow.gates`)은 팀 설정이라 관리 페이지가 쓰지 않는다. S12의 "흐름 틀" 링크는 지금 게이트와 바닥 4개(requirements · design · mr · done)를 보이고, 바꾸는 명령을 복사하게 한다. 사람 터미널에서 `npx knots-sync flow gates --add <게이트> --after <게이트>`가 `knots-sync.json`을 고치고 MR로 올린다. 바닥 아래로 줄이는 명령은 exit 1이다(04 §3.8).

### 3.17 전체 프로젝트(S00)

이 컴퓨터에 등록한 킷 리포 여러 개를 한 화면에서 본다. 화면 주소는 `/projects`, 콘솔은 `npx knots-sync status --all [--json]`이다.

등록부 `~/.config/knots-sync/projects.json`:

```json
{ "schema": "knots-sync.projects/v1",
  "projects": [ { "path": "/Users/me/work/knots-platform", "name": "knots-platform", "addedAt": "2026-11-02" } ] }
```

- 킷이 프로젝트 밖에 쓰는 파일은 이것 하나다(README 원칙 7). `init`이 설치한 리포를 더하고(`--no-register`로 뺀다), `projects add <dir>` · `projects remove <이름>`이 고친다. 임시 파일 + rename, 파일 0600 · 폴더 0700.
- 경로 · 이름 · 더한 날만 둔다. 리포 안의 상태는 그 리포에서 읽는다.
- 폴더가 없어진 줄은 저절로 지우지 않고 "없음"으로 보이며, 지우는 명령만 복사하게 한다.
- 같은 폴더의 `config.json`은 사람이 쓰는 이 컴퓨터 설정(`history` · `usage.*`)이다. 킷은 읽기만 한다.

서버 모드:

| 실행 | 프로젝트 목록 | 쓰는 파일 |
|---|---|---|
| 리포 안에서 `dashboard` | 그 리포 하나(지금까지의 동작) | 그 리포 `.agents/state/` |
| `dashboard --all` | 등록부 | 없음(DB-R27) |
| `dashboard --root <dir>` | `<dir>` 아래 깊이 3까지 `.agents/knots-sync.json`이 있는 폴더. 등록부에 더하지 않는다 | 없음 |
| `dashboard --workspace <file>` | 파일에 적은 경로 목록 | 없음 |

- 여러 프로젝트 모드에서 리포별 API는 `/api/v1/p/{projectId}/…`(projectId = 실제 경로 sha256의 앞 12자)이고, 화면은 `/p/{projectId}/`부터 지금의 단일 리포 화면(S01~)을 그대로 쓴다. 쓰기는 들어간 리포 안에서 그 리포의 허용 경로 · `baseSha256` · approvers(그 체크아웃의 git 사용자) · PIN 검사를 따로 거친다.
- 토큰과 PIN은 서버에 하나씩이다. 여러 프로젝트 모드는 토큰 파일 · `dashboard.json`을 쓰지 않고 토큰은 출력한 주소에만 있다(DB-R4 · DB-R23은 단일 리포 모드에만 적용). 서버가 둘 열려도 서로 영향이 없다.
- `GET /api/v1/projects/overview`는 프로젝트마다 §3.4 처리할 일을 만들어 합친다. 동시 읽기 4개, 프로젝트당 3초. 못 읽은 프로젝트는 그 줄만 "읽기 실패"와 원인이다.
- 등록부에 따로 있는 submodule 도메인 리포가 다른 등록 리포 폴더 안에 있으면 그 부모 아래 `children`으로 접고, 처리할 일 · 검증은 부모에 묶어 센다.
- `GET /api/v1/sessions?scope=machine`은 등록된 리포마다 `.agents/state/sessions/`를 읽어 합친다. 세션 요청은 그 프로젝트에 들어가서 사람이 고를 때만 보낸다.

### 3.18 기록 · 사용량(S13)

토큰이 어디에 쓰였는지, 지금 세션의 컨텍스트가 얼마나 찼는지, 킷이 세션에 덧붙인 양이 얼마인지를 본다. 관리 페이지는 모델을 부르지 않고 대화 내용을 요약하지 않는다(DB-R26).

두 출처를 나눈다:

| 출처 | 기본 | 읽는 것 | 쓰는 것 |
|---|---|---|---|
| 킷이 덧붙인 양 | 늘 켜짐 | 리포의 `.agents/state/hook-output.jsonl`. 킷 훅이 실행마다 `{at, event, hook, bytes, truncated}` 한 줄을 남긴다(내용은 남기지 않는다, 1 MiB에서 돌린다) | 훅이 그 줄만 |
| 모듈이 덧붙인 양 | 늘 켜짐 | lock의 `owner`별 정적 합계(세션마다 실리는 파일 · 이벤트별 훅 수, 10 §3.7). 대화 기록 읽기를 켜면 외부 훅이 실제로 붙인 글도 owner별로 센다 | 없음 |
| 대화 기록 | 꺼짐(DB-R28, README 원칙 7, 12 MR-R11) | Claude Code `~/.claude/projects/<경로>/*.jsonl`(응답의 `usage` · `model` · `sessionId` · `cwd` · `gitBranch`) · `~/.claude/history.jsonl`(프롬프트 글 · 시각 · 프로젝트), Codex `~/.codex/sessions/**`. Kiro는 기록 위치 확인 전까지 "자료 없음" | 없음. 복사본 · 집계 파일을 남기지 않는다 |

- 켜기: 사람이 `~/.config/knots-sync/config.json`에 `"history": "on"`을 쓴다. 꺼져 있으면 S13은 무엇을 읽는지와 켜는 곳을 보이고, 킷이 덧붙인 양은 그대로 보인다.
- 대화 기록 형식은 공식 형식이 아니다. 하네스 버전별 파서를 두고 모르는 필드는 무시한다. 못 읽은 파일은 수를 세어 "읽지 못함"으로 보인다. 12의 `metrics.tokens: "otel"`이 켜져 있으면 그 값을 먼저 쓴다.
- 프로젝트 거르기: 기록의 `cwd`가 그 리포나 그 리포의 worktree 폴더(`<리포>.worktrees/`) 안인 것.
- 역할 · 이슈: 세션 등록(§3.9)의 `sessionId` → `role` · `issue`, 없으면 `gitBranch`의 이슈 키, 그것도 없으면 "이슈 없음".
- 지금 세션: 이 리포의 가장 최근 세션에서 마지막 응답의 입력 + 캐시 읽기 + 캐시 쓰기 ÷ 모델 컨텍스트 창. 창 크기는 킷 기본 표를 `config.json`의 `usage.contextWindows`가 덮고, 모르면 "기록에 없다". 알림 기준은 `usage.warnAt`(기본 0.8).
- 비용: `config.json`의 `usage.pricing`이 있을 때만 추정한다. 킷은 가격표를 두지 않고 청구 금액이 아니라고 적는다.
- 읽기: 파일마다 `(mtimeMs, size)` stamp와 읽은 바이트 위치를 메모리에만 두고 덧붙은 부분만 더 읽는다. 요청한 기간 안에 바뀐 파일만 연다. 레일의 "지금 세션" 줄은 화면이 열려 있을 때 15초마다 `usage/now`를 묻는다.
- 프롬프트 기록 탭은 글을 보여 주기만 한다. 내보내기 · 커밋 · 세션 요청에 넣지 않는다(§3.12).
- 콘솔: `npx knots-sync usage [--days 7] [--kit] [--sources] [--json]` · `history [--q …] [--json]`.

### 3.19 토큰 영향(README 원칙 10)

이 문서의 기능이 세션에 덧붙이는 것과 세션당 추가 토큰 추정이다. 추정은 한글 위주 글 기준 바이트 ÷ 3이다.

| 기능 | 세션에 덧붙는 것 | 세션당 추가(추정) | 근거 · 측정 |
|---|---|---|---|
| 관리 페이지 화면 전부(S00~S13) | 없음 | 0 | 모델 호출 0(DB-R26). 화면은 세션 컨텍스트에 실리지 않는다 |
| 세션 등록 훅(§3.9) | 없음 | 0 | 표준 출력 0바이트, 파일만 쓴다 |
| 대기함 소비 훅(§3.10) | 대기 요청이 있을 때만 세 줄 | 평소 0, 있을 때 170 이하 | 세션 시작 상태 예산 512바이트 안 |
| 세션 요청(`dispatch`) | 사람이 고른 요청 한 줄(1,000자 이하) + 경로 | 킷이 덧붙이는 양이 아니다. 사람이 시킨 작업의 일부 | DB-R25, 자동 요청 없음 |
| 저장 · 승인 · 답 · 변경 제안 | 없음 | 0 | DB-R25 |
| 흐름 보기 · 전체 프로젝트 · 기록 · 사용량 | 없음 | 0 | 읽기만 한다 |
| `hook-output.jsonl` 기록 | 없음 | 0 | 파일에만 쓴다 |
| 요구사항 접수 | 없음 | 0 | 첨부 추출은 스크립트 · 변환기. 이미지 설명은 기본으로 만들지 않는다(08 §3.11) |
| 선택 모듈(aidlc · entire 등) | 그 도구의 훅 · 규칙 · 스킬 | 킷 몫이 아니다. 켠 사람의 선택이고 `add` 전후 · `doctor` · S13에서 owner별로 보인다 | 10 §3.7 · MD-R16 |

측정: 릴리스마다 같은 fixture에서 v1.0.8과 v2의 세션 시작 출력 바이트를 재고(완료 기준 19), 실제 세션의 값은 S13 "킷이 덧붙인 토큰"에서 본다.

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| 쿠키 세션 + CSRF 토큰 | 쿠키는 브라우저가 자동으로 붙이므로 CSRF 대책이 따로 든다. Bearer 머리는 그 경로가 없다 |
| 파일 감시(fs.watch) + WebSocket 갱신 | 감시 대상이 worktree마다 늘고 macOS·Linux 동작이 다르다. stat 기반 캐시와 5초 ETag 조회로 같은 결과를 낸다 |
| 체크아웃 안 된 브랜치에 git 객체로 저장(hash-object + update-ref) | 그 자체가 커밋이다. 커밋은 그 이슈 세션이 한다는 원칙을 어긴다 |
| 저장할 때 브랜치를 체크아웃하거나 worktree를 자동 생성 | 다른 세션 작업 트리를 바꾸고, worktree 수 상한을 우회한다 |
| React 등 빌드가 필요한 화면 | P20 요구가 "빌드 단계 없음"이다. 번들한 정적 파일로 충분하다. 흐름 보기의 React Flow만 킷 릴리스 때 미리 묶은 정적 파일로 싣는다(§3.16) |
| React Flow를 CDN에서 받기 | 오프라인 · 사내망에서 안 되고, 외부 출처 스크립트가 토큰을 가진 화면에 들어온다 |
| 저장 · 승인 · 답 뒤 세션에 자동 요청 | 받는 세션이 사람 지시 없이 턴을 돌아 토큰을 쓴다(README 원칙 10). "저장하고 세션에 요청" 버튼 하나로 같은 편의를 준다 |
| 관리 페이지의 AI 요약 · 자동 분류 · 답 초안 | 킷이 모델을 부르면 그만큼 토큰이 는다(원칙 10). 필요하면 사람이 세션에 요청한다 |
| 대기함 요청을 세션 시작에 모두 싣기(최대 5건 · 2,000자) | 요청이 남아 있는 동안 세션마다 실린다. 건수와 첫 요청 한 줄이면 된다 |
| 대기함은 건수만 싣기 | 세션이 내용을 보려고 명령을 한 번 더 돌려 한 줄 싣는 것보다 더 쓴다 |
| 대화 기록을 복사해 사용량 DB로 저장 | 두 번째 원본이 생기고 프롬프트 글이 다른 폴더로 퍼진다 |
| 관리 페이지가 `units.json` · `flow.gates`를 직접 고침 | `units.json`은 intent 승인 대상이고 `flow.gates`는 팀 설정(MR)이다. 제안 · 명령 복사로 둔다 |
| 전체 프로젝트용 상태 파일을 사용자 폴더에 두기 | 프로젝트 밖 쓰기는 등록부 하나로 둔다(원칙 7). 여러 프로젝트 모드는 아무것도 쓰지 않는다 |
| channels를 기본 요청 경로로 | 연구 미리보기이고 `--channels`로 연 세션만, 사용자 채널은 조직 허용 목록이나 개발 플래그가 필요하다. 소켓이 안 될 때 다음 선택지로만 둔다 |
| 세션 메시지 토큰을 세션 기록에 저장 | macOS·Linux에서는 필요 없고, 저장하면 다른 프로세스가 그 세션의 자식인 척할 수 있다 |
| 승인을 git 사용자만으로 인정(PIN 없음) | 에이전트도 같은 git 설정으로 API를 부를 수 있다 |
| SQLite 캐시 | 원본은 파일이고 이슈 수가 수백 건 수준이다. 두 번째 원본이 생기고 브랜치 · worktree마다 다른 내용을 담지 못한다 |
| RAG · 벡터 DB로 문서 · 코드 찾기 | 문서 자리가 정해져 있어 경로로 바로 찾는다. 임베딩은 모델 호출이라 원칙 10과 맞지 않고, 색인이 원본보다 늦어진다. 다시 볼 조건은 시스템 설계서 9.4 |

## 5. 완료 기준

1. SDD 이슈 20개 fixture(v2 배치 15 + v1 배치 5)에서 진행 탭의 이슈별 상태가 `board.sh` 결과와 20/20 같다.
2. 문서 탭에서 SDD 세 문서, 기능 문서, ADR, 기획물 4종이 렌더되어 열린다(fixture 항목마다 200 응답과 제목 일치).
3. 시험: 127.0.0.1 밖 주소로 연결 0건 성공, `Host: evil.example`은 421, 토큰 없는 `/api/v1/session`은 401, `Origin: http://evil.example`의 PUT은 403.
4. 시험: 허용 목록 밖 경로 12종(`../`, 절대경로, `.git/config`, 심볼릭 링크 마디, `units.json`, `review.md`, `.agents/rules/*.md` 등) 저장 요청이 모두 403이고 파일 변경 0건.
5. 시험: 같은 `baseSha256`으로 두 번 저장하면 둘째가 409이고 첫째 내용이 남는다.
6. 시험: 이슈 브랜치가 worktree에 체크아웃된 상태에서 저장하면 그 worktree 파일만 바뀌고 메인 폴더 파일·git 객체(`git count-objects`)·HEAD가 그대로다. 체크아웃이 없으면 409.
7. 시험: 승인 버튼이 approvals.md에 승인자·시각·문구·sha256·기록 ID를 남기고 문서 status를 바꾼다. approvers 밖 사용자는 403, `[NEEDS CLARIFICATION` 남은 문서는 422, PIN 없는 요청은 403, `CLAUDECODE=1`로 연 서버는 승인 API가 403.
8. 시험: Node와 Python 승인 파서가 `tests/fixtures/approvals/` 입력 30건에서 같은 결과를 낸다.
9. 내보낸 HTML 폴더에서 스킬 이름·홈 절대경로·소켓 경로·토큰 문자열 grep 결과가 0건이다.
10. 수동 점검: 문서를 저장하고 살아 있는 Claude 세션(v2.1.224+, `acceptEdits`)을 고르면 그 세션이 요청 글을 받아 작업을 시작한다. 소켓이 없는 세션에서 deep link가 새 터미널에 프롬프트를 채운다. Codex 세션은 다음 프롬프트 제출 때 대기함 항목을 보여 준다.
11. 시험: 대기함 항목 하나를 세션 둘이 동시에 가져가면 한쪽만 성공한다(100회 반복 0건 중복).
12. 이슈 20개 · worktree 3개 fixture에서 `GET /overview` p95 500ms 이하(캐시가 찬 뒤, 100회).
13. 시험: 문서 저장 · 승인 · 수정 요청 · 질문 답 · 변경 제안 저장을 각 20회 한 뒤 살아 있는 시험 세션 소켓이 받은 글 0건, 대기함 항목 0건(DB-R25).
14. 시험: 대기함에 요청 5건을 넣고 세션 시작 훅을 돌리면 출력이 512바이트 이하이고 첫 요청 하나만 `consumed/`로 옮겨진다. 맞는 항목이 없으면 출력 0바이트.
15. 시험: CLI 패키지 의존성 트리에 모델 SDK 0개, 시험 중 외부 주소로 나가는 연결 0건(`outdated` 제외, DB-R26).
16. 시험: 등록 프로젝트 3개로 `dashboard --all`을 열고 모든 읽기 API를 부른 뒤 세 리포와 `~/.config/knots-sync/`의 파일 수 · mtime이 그대로다(DB-R27).
17. 시험: `history`가 없거나 `"off"`이면 `~/.claude` · `~/.codex` 아래 파일 열기 0건(fs 모의 객체), `/history`는 404 `history_off`. 켜도 리포 · `~/.config` 아래 새 파일 0건(DB-R28).
18. 시험: 제안 저장 뒤 `units.json` 바이트가 그대로이고, intent 승인 뒤 `units.json`이 제안 반영 결과와 같고 승인 기록의 sha가 그 파일과 같다. `dependsOn` 고리 제안은 422(DB-R29).
19. 측정: 같은 fixture에서 v1.0.8과 v2의 세션 시작 출력 바이트를 재 v2가 2,560바이트 이하이고 v1.0.8 이하다. 값을 릴리스 노트에 적는다.
20. 시험: Unit 30개 Intent에서 흐름 보기가 1초 안에 그려지고 키보드만으로 Unit을 고르고 푼다. `flow.bundle.js`는 흐름 보기를 열 때만 받는다.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| 수신함 소켓에 보내는 글의 형식. 문서에는 인증 줄 `{"type":"auth","token":"…"}`만 있고 그 뒤 줄이 평문인지 JSON인지 없다 | v2.1.224+ 세션에서 `printf '%s\n' '시험 글' \| nc -U "$CLAUDE_CODE_MESSAGING_SOCKET"`와 JSON 줄 두 방식을 보내 전달 여부와 표시를 본다. 결과를 docs/analysis/에 버전·날짜와 남긴다 |
| 자식이 아닌 프로세스의 글이 각 권한 모드에서 전달·보류되는 조건 | `default`·`acceptEdits`·`bypassPermissions` 세션 셋에 관리 페이지 프로세스로 보내고 결과를 표로 남긴다 |
| 글 없이 연결했다 닫는 생존 검사가 세션에 표시나 로그를 남기는지 | 위 세션에서 연결만 10회 하고 `/status`·`--debug` 로그를 본다 |
| 글 안의 줄바꿈 처리(한 줄 = 글 하나인지) | 줄바꿈을 넣은 글을 보내 몇 개로 도착하는지 본다. 그 전까지는 한 줄만 보낸다 |
| Codex · Kiro의 세션 시작·프롬프트 제출·세션 종료 훅 이벤트와 입력의 세션 id | 각 하네스 문서와 시험 세션에서 훅 입력 JSON을 기록한다 |
| Codex · Kiro가 셸에 넣는 환경 변수(에이전트 세션 판정용)와 실행 파일 이름 | 각 하네스 셸 도구에서 `env`·`ps -o comm= -p $PPID`를 본다 |
| `claude-cli://` 링크가 Codex · Kiro에 해당하는 것이 있는지 | 각 하네스 문서 확인. 없으면 대기함만 쓴다 |
| Windows named pipe 소켓 요청 | v2.2 범위 밖. Windows 세션은 deep link·대기함만 쓴다고 적고 v2.3 이후 다시 본다 |
| `worktree.py list --json`(05)의 필드, `board.sh --json` 추가(01 소관) | 05 확정본과 §3.2 표를 대조하고, 01에 `--json` 인자를 더한다 |
| Claude Code 대화 기록(`projects/*.jsonl` 의 `usage`) · `history.jsonl` 형식. 공식 형식이 아니다 | 하네스 버전별 기록으로 파서 fixture를 만들고, 바뀌면 "읽지 못함"으로 보이며 12의 OTel을 쓴다 |
| Codex `sessions` 기록의 토큰 이벤트 이름, Kiro 기록 위치 | 각 하네스 시험 세션의 기록 파일을 본다. 없으면 "자료 없음" |
| 모델별 컨텍스트 창 크기 기본 표 | 킷은 기본 표를 두고 `config.json`의 `usage.contextWindows`가 덮는다. 모르면 "기록에 없다" |
| 여러 프로젝트 모드의 경로 접두(`/api/v1/p/{projectId}/…`)와 화면 주소 | P20 착수 때 S00 · 레일 구현과 같이 확정한다 |
