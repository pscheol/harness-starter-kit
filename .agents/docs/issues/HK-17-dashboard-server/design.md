---
key: HK-17
area: dashboard
type: feat
title: 관리 페이지 서버 — REST · 읽기 · 쓰기 규칙 · 승인 · 질문 · 세션 · 작업 요청 · 내보내기
status: in-review
created: 2026-11-24
---

# Design — HK-17

근거: [requirements](requirements.md), [설계 06](../../../../docs/design/06-dashboard.md) DB-R1~DB-R29 · §3.1~§3.19 · §5, [README](../../../../docs/design/README.md) §3 · §5 · §7 · 원칙 7 · 9 · 10, [HK-23 design](../HK-23-review-and-approvals/design.md) §2 · §3 · §11. 선행: HK-3(이슈 폴더 · 머리 · 보드), HK-4(`verify-last.json`), HK-13(`projection.json` · lock v2), HK-16(보고서 · 지표), HK-23(승인 형식 · `sdd_gates.py` · `review_state.py`).

관리 페이지 서버와 CLI 는 모델을 부르지 않는다(DB-R26). 저장 · 승인 · 답 · 제안 저장은 세션에 아무것도 보내지 않는다(DB-R25). 세션 요청은 사람이 `POST /dispatch` 또는 `harness-kit dispatch` 를 부를 때만 나간다.

## 1. 구성과 번들

| 자리 | 내용 |
|---|---|
| `packages/dashboard/src/` | 서버 · 읽기 · 쓰기 · 모델 · 렌더 · 내보내기. TS, Node 표준 모듈만 |
| `packages/dashboard/static/` | 화면 파일(이 판은 자리표시 화면 하나, HK-18 이 채운다) |
| `packages/dashboard/test/` | vitest. 서버를 127.0.0.1 임시 포트로 띄워 시험한다 |
| `packages/cli/src/commands/` | `dashboard` · `status` · `projects` · `approve` · `answer` · `review` · `sessions` · `dispatch` · `units` · `flow` · `quality` |

번들은 하나다. CLI 명령이 `packages/dashboard/src` 를 상대 경로로 import 하고 `packages/cli/build.mjs` 가 `dist/cli.js` 한 파일로 묶는다. 화면 파일은 `build.mjs` 가 `static/` 을 읽어 `define` 의 `__HK_STATIC__`(경로 → 내용)로 넣는다. 런타임 의존성은 0 그대로이고 플러그인 사본(`bin/harness-kit.js`)도 한 파일이다.

- 번들 소스 해시(`packages/cli/scripts/src-hash.mjs` · `tests/cli_dist.py`)에 `../dashboard/package.json` · `../dashboard/src/**` · `../dashboard/static/**` 를 더한다. 대시보드 소스만 바꿔도 `gen --check` 가 오래된 빌드를 잡는다.
- 두 번째 번들(dashboard.js)은 두지 않는다. 생성기 · 시험 도우미 · 플러그인 배치가 파일 하나를 전제로 한다.
- 핵심 모듈 자리: README 원칙 9 는 `packages/cli/src/core/` 를 적었고 06 §3.1 은 `packages/dashboard/src/readers · writers` 를 적었다. 06 §3.1 을 따른다. CLI 명령과 서버가 같은 함수(`api.ts` 의 경로 처리)를 부르므로 원칙 9(화면에만 있는 기능 없음)는 그대로다(§11).

`packages/dashboard/src/` 파일:

| 파일 | 하는 일 |
|---|---|
| `server.ts` | `http.createServer`, 127.0.0.1 바인드, 단일 · 여러 프로젝트 모드, 정적 파일, `/raw`, 시작 · 끝 처리 |
| `guard.ts` | Host · 토큰 · Origin · Content-Type · 크기 · PIN(상수 시간, 5회 잠금) |
| `api.ts` | 경로 표(메서드 · 경로 · PIN 필요 · CLI 대응) · 처리 함수. 서버와 CLI 가 같이 부른다 |
| `project.ts` | 프로젝트 하나의 문맥: 메인 폴더 · 메타(공유 층만) · git 사용자 · 캐시 · 읽기 전용 · 경로 |
| `repo.ts` | `git rev-parse --show-toplevel · --git-common-dir`, worktree 목록, 브랜치, 이슈 체크아웃 찾기(DB-R9) |
| `cache.ts` | `{stamp, value, computedAt}` 캐시. stamp 는 파일 `(mtimeMs, size, ino)` 목록 |
| `approvals.ts` | `approvals.md` 파서 · 유효성 · 리뷰 판단 · 승인 sha · 기록 쓰기 · ULID(Python `approvals.py` 와 같은 결과) |
| `frontmatter.ts` | 문서 머리 읽기 · 값 바꾸기(Python `sdd_frontmatter.py` 와 같은 규칙) |
| `questions.ts` | `questions.md`(08 §3.3) 파서 · 답 줄 쓰기 |
| `md.ts` | Markdown → HTML. 원문 HTML 은 글자로 바꾸고, 링크는 `http(s)` · 상대 경로만, 문서 안 이미지는 서명 URL |
| `agent.ts` | 에이전트 세션 판정(06 §3.11, Python `agent_session.py` 와 같은 표지 · 부모 프로세스 20단계) |
| `paths.ts` | 쓰기 허용 경로 · 경로 검사(§4) |
| `readers/*.ts` | config · issues · intents · verify · reports · worktrees · sessions · queue · flow |
| `model.ts` | overview · 처리할 일(§6) · 이슈 모델(06 §3.3) |
| `writers/*.ts` | docs · approvals · answers · reviews · dispatch · proposals |
| `projects.ts` | 등록부 `~/.config/harness-kit/projects.json` 읽기 · 쓰기, `--root` 찾기, `--workspace` 읽기, projectId |
| `export.ts` | 정적 내보내기와 끝 검사(DB-R20) |

## 2. 시작과 끝(06 §3.1)

```text
harness-kit dashboard [--port <n>] [--open] [--read-only] [--export <폴더>] [--all | --root <dir> | --workspace <file>]
```

1. 리포 해석: `--cwd`(기본 현재 폴더)에서 `git rev-parse --show-toplevel` · `--git-common-dir` · `--show-prefix` 로 메인 폴더의 하네스 루트를 찾는다. worktree 에서 실행해도 메인 폴더 기준이다.
2. `.agents/harness-kit.json` 이 없거나 `schema` 가 `harness-kit/v2` 가 아니면 exit 3 과 `npx harness-kit doctor` 안내.
3. `.agents/state/dashboard.json` 의 pid 가 살아 있고 `GET /healthz` 가 200 이면 그 주소를 출력하고 exit 0(DB-R23). 사람 터미널이면 `dashboard.token` 을 읽어 `#t=` 를 붙이고, 에이전트 세션이면 토큰 없는 주소와 "토큰은 서버를 연 터미널의 주소에 있다"만 낸다.
4. 에이전트 세션 판정(§10). 맞으면 읽기 전용이고 PIN 을 만들지 않는다(DB-R22). `--read-only` 도 같다.
5. `.agents/state/` 를 0700 으로 만들고(있으면 0700 으로 맞춘다), 토큰 32바이트(base64url)를 `dashboard.token` 에 `O_CREAT|O_EXCL|O_NOFOLLOW`, 0600 으로 쓴다. 남은 파일(죽은 서버)은 지우고 다시 만든다.
6. 읽기 전용이 아니면 PIN 10자(Crockford base32, 50비트)를 표준 오류에만 출력한다.
7. `127.0.0.1:<포트>`(기본 0)에 바인드하고 `dashboard.json` 에 `{pid, port, startedAt, readOnly}`(0600)를 쓴다.
8. 표준 출력에 `http://127.0.0.1:<포트>/#t=<토큰>`. `--open` 이면 `open` · `xdg-open` · `cmd /c start`.
9. SIGINT · SIGTERM 에서 두 파일을 지우고 끝낸다.

여러 프로젝트 모드(`--all` · `--root` · `--workspace`, 06 §3.17)는 2 · 3 · 5 · 7 단계의 파일을 쓰지 않는다. 토큰은 출력한 주소에만 있다. PIN 은 서버에 하나다.

## 3. 요청 검사(guard, DB-R1~R5 · R12)

순서: Host → 경로 종류 → 토큰 → 쓰기 머리 → 크기 → PIN.

| 검사 | 거부 |
|---|---|
| `Host` 가 `127.0.0.1:<포트>` · `localhost:<포트>` 가 아님 | 421 `misdirected` |
| `/api/` 에 `Authorization: Bearer <토큰>` 없음 · 틀림(상수 시간 비교) | 401 `unauthorized` |
| POST · PUT · DELETE 에서 `Content-Type` 이 `application/json` 아님, 또는 `Origin` 이 `http://127.0.0.1:<포트>` · `http://localhost:<포트>` 아님(없음 포함) | 403 `forbidden_origin` |
| 본문 1 MiB 초과 · JSON 형식 오류 | 400 `bad_request` |
| PIN 필요 경로(답 · 승인 · 리뷰 판단)에 읽기 전용 | 403 `read_only` |
| PIN 없음 · 틀림 | 403 `pin_required`. 틀린 횟수가 5가 되면 서버가 끝날 때까지 403 `pin_locked` |

- 화면 파일(`/` · `/app.js` · `/p/<id>/`)은 토큰 없이 준다. 데이터가 없다.
- 응답 머리: API 는 `Cache-Control: no-store` · `X-Content-Type-Options: nosniff` · `Referrer-Policy: no-referrer`. 화면은 CSP `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` 를 더한다.
- `/raw/<경로>?exp=&sig=`: `sig = HMAC-SHA256(토큰, 경로 + "\n" + exp)`(hex), `exp` 는 발급 뒤 600초. 지났거나 틀리면 403. 경로는 §4 1 · 2단계 검사를 거치고 `.agents/docs/**` 의 이미지(png · jpg · jpeg · gif · webp · svg)와 html 만 준다. CSP `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'`, html 은 `sandbox allow-scripts` 를 더해 주소로 직접 열어도 출처가 없다(DB-R21).
- 오류 응답은 06 §3.5 봉투다. 500 은 메시지에 경로 · 스택을 넣지 않고 서버 표준 오류에만 적는다.

## 4. 쓰기 규칙(06 §3.6, DB-R7~R10 · R15)

허용 경로(체크아웃 루트 기준). 표 밖은 403 `forbidden_path`:

| 경로 | 쓰는 API |
|---|---|
| `.agents/docs/intents/*/{intent,current-state}.md` · `intents/*/plans/**/*.md` | `PUT /docs` |
| `.agents/docs/issues/*/{requirements,design,tasks}.md` | `PUT /docs` |
| `.agents/docs/{decisions/*.md, ops/**/*.md, codebase/*.md, rule-candidates/*.md}` | `PUT /docs` |
| `.agents/docs/**/questions.md` | 답 API |
| `.agents/docs/**/approvals.md` | 승인 · 리뷰 판단 API(덧붙이기) |
| `.agents/docs/intents/*/units.proposed.json` | 제안 API |
| `.agents/docs/intents/*/units.json` | intent 게이트 승인(제안 옮기기)만 |
| `.agents/state/{dispatch-queue/*.json, approvals-log.jsonl, sessions/*.json}` | 서버 내부 |

경로 검사(`PUT /docs` · `GET /docs` · `/raw` 공통):

1. 문자열 · 1,024자 이하 · 상대 경로. `\` · NUL · `..` · 빈 마디 · `.` 마디 · `.git` 마디 · `/` 로 시작은 거부.
2. 체크아웃 루트부터 마디마다 `lstat`. 심볼릭 링크가 하나라도 있으면 거부. 연 뒤 `fstat` 이 `lstat` 과 같은 파일(dev · ino)인지 본다.
3. 대상은 일반 파일. 새 파일은 `plans/**/*.md` · `decisions/*.md` · `ops/records/*.md` 만. UTF-8 · 1 MiB 이하.
4. 저장할 Markdown 의 머리가 읽혀야 한다(형식 오류는 400).

`PUT /docs {path, baseSha256, markdown, force}` 순서:

1. 경로 검사 → 쓸 체크아웃 찾기(아래). 경로별 프로세스 안 잠금.
2. 현재 바이트 sha256 ≠ `baseSha256` → 409 `conflict` + `{currentSha256, currentMarkdown}`(DB-R7).
3. 새 머리 `status` 가 `approved` 로 바뀌면 422 `status_change_forbidden`(DB-R15). 지금 `approved` 인 문서를 고치면 `status: in-review` 로 바꾸고 `statusChanged: "approved→in-review"`.
4. `session-coordination.py context --json` 의 활성 · 만료 전 점유 파일과 겹치면 `force` 없이 409 `lease_held`. `force` 면 저장하고 `leaseHeldBy` 를 돌려준다. 요청은 보내지 않는다(DB-R25).
5. 원래 줄바꿈(CRLF 가 하나라도 있으면 CRLF) · 파일 권한을 지켜 같은 폴더 임시 파일 → `fsync` → `rename`.
6. 변경 요약: 바뀐 줄이 속한 `#` 제목, 바뀐 줄의 `R\d+(\.\d+)*` · `SC-\d+` · `S-\d+` · `U-\d+`, 더한 · 뺀 줄 수(줄 단위 LCS, 2,000줄 넘으면 앞뒤 같은 줄만 뺀 차이).
7. 응답 `{sha256, savedTo(메인 기준 상대), branch, statusChanged, changeSummary, leaseHeldBy}` · `meta.commit = "커밋은 그 이슈의 세션이 한다"`.

쓸 체크아웃 찾기(DB-R9, 06 §3.6 의사 코드 그대로):

- 이슈 문서: 키로 `refs/heads` 의 `^[a-z]+/<키>-` 브랜치를 센다. 둘 이상 409 `ambiguous_branch`. 하나면 그 브랜치가 체크아웃된 worktree(메인 포함), 없으면 409 `branch_not_checked_out`(안내 "wt new <키> 뒤 다시 저장한다"). 브랜치가 없으면 메인 폴더가 `git.base` 이고 문서가 있을 때 메인 폴더, 아니면 409.
- Intent 문서: `docs/<INT 키>-…` 브랜치가 있으면 같은 규칙, 없으면 메인 폴더.
- 그 밖(decisions · ops · codebase · rule-candidates): 메인 폴더.
- 서버는 커밋 · push · 브랜치 전환 · worktree 생성을 하지 않는다(DB-R10). git 은 읽기 명령(`rev-parse` · `worktree list` · `for-each-ref` · `ls-tree` · `show` · `status` · `rev-list` · `merge-base` · `config --get`)만 부른다.

## 5. 승인 · 리뷰 판단 · 질문 답

### 5.1 `POST /approvals`(06 §3.7, DB-R11~R14)

본문 `{target: {issue} | {intent}, gate, decision: approved | changes-requested, phrase, docSha256?, ruleCandidate?, pin}`.

1. 읽기 전용 403 `read_only`, PIN(§3).
2. `gate ∈ flow.gates`(공유 메타만, 개인 층 무시) 아니면 422 `gate_not_in_flow`. `codebase` · `plans` · `deploy` 는 422 `gate_precondition`(`details.later`: HK-19 · HK-21).
3. 대상: `requirements` · `design` · `tasks` 는 이슈 문서, `mr` · `done` 은 `<브랜치> · head: <sha>`(docSha256 없음), `intent` 는 Intent 폴더의 `intent.md` 와 `units.json`.
4. 문서 `status ∈ {draft, in-review}`(HK-23 §11 처럼 기록 없는 `approved` 도 받는다, tasks 는 status 를 보지 않는다) 아니면 422 `gate_precondition`. 같은 승인 sha 의 `approved` 기록이 이미 있으면 409 `already_approved`.
5. `approved` 이고 문서에 `[NEEDS CLARIFICATION` → 422 `needs_clarification`(DB-R13).
6. 파일 sha256 ≠ `docSha256` → 409 `doc_changed`.
7. `approved` 면 게이트 앞 조건: 이슈는 `python3 scripts/harness/sdd_gates.py check <키> --json --root <체크아웃>` 의 `preconditions`(HK-23 판정 원본, 이 이슈에서 칸을 더한다). intent 는 막는 게이트가 `intent` 인 열린 질문 0 · `scripts/harness/intent_check.py` 가 있으면 통과. 아니면 422 `gate_precondition` + 이유 목록.
8. 승인자 = `git -C <체크아웃> config user.email`(비면 403 `not_an_approver`) · `user.name`. `approvals.allowed`(이메일 · 그룹, approvers 가 없거나 그 게이트가 비면 누구나, README §5)가 거짓이면 403 `not_an_approver`. 처음 맞은 그룹을 적는다.
9. 쓰기(체크아웃 안): `approvals.md` 덧붙이기(없으면 머리 · 주석을 만든다, 기존 바이트 그대로) → `approved` 인 문서 게이트는 머리 `status: approved` → intent 는 제안을 `units.json` 에 옮기고 제안 파일을 지운다(DB-R29) → `.agents/state/approvals-log.jsonl` 에 `{entryId, target, gate, sha256, at, path: "dashboard"}`. 뒤 쓰기가 실패하면 앞 파일을 원래 바이트로 되돌리고 500.
10. 201 `{entryId, approvals, approver, group, statusChanged, sessions}`. `sessions` 는 그 이슈의 살아 있는 세션 id 다. 요청은 보내지 않는다(DB-R25).

- 기록의 대상 sha 는 승인 sha(머리 `status` · `state` 줄을 뺀 sha256, HK-23 §2)다. `docSha256` 은 파일 바이트 sha256 이다(`GET /docs` 의 `sha256`).
- intent 승인은 기록 두 개를 같은 시각으로 덧붙인다: `intent.md · sha256: <승인 sha>` 와 `units.json · sha256: <옮긴 뒤 바이트 sha256>`. 기록 형식(대상 sha 하나)을 바꾸지 않고 두 파일의 sha 를 남긴다(§11). `units.json` 이 제안의 `baseSha256` 과 다르면 409 `proposal_stale`.
- `changes-requested` 는 머리를 바꾸지 않는다. `ruleCandidate: true` 면 `- 규칙 후보: 예`.
- 경로 `dashboard`, 문구 필수(빈 문구 400). CLI `approve` 는 같은 처리 함수를 경로 `terminal` 로 부른다(§9).

### 5.2 `POST /reviews/{key}/{F-n}/decision`

본문 `{decision: risk-accepted | fix-required, phrase, pin}`. 보고서 지문은 `python3 scripts/harness/review_state.py <이슈 폴더> --json` 의 `findings[].fp` 에서 찾는다(없으면 404). 승인자는 `approvers.mr` 로 본다. 기록은 `## <시각> · review/F-n · <판단>`, 대상 `.agents/reports/review/<키>.md · 지문: <fp>`. 나머지는 5.1 의 1 · 8 · 9(머리 바꿈 없음) · 10 단계다.

### 5.3 `POST /questions/{target}/{qid}/answer`(06 §3.8)

본문 `{choice: "A"…"D" | "other", text?, baseSha256, pin}`. `target` 은 Intent 키(Intent 폴더) 또는 이슈 키(이슈 폴더의 `questions.md`). 쓸 체크아웃은 §4 규칙.

1. `questions.md` sha256 ≠ `baseSha256` → 409 `conflict`.
2. 질문이 없으면 404. `choice` 가 그 질문의 선택지 글자도 `other` 도 아니면 400. `other` 는 `text` 필수.
3. `답할 직무` 가 `groups` 에 있는 그룹이고 현재 사용자가 그 그룹에 없으면 `- 의견: <글자> · <email> — <text>` 를 덧붙이고 질문은 열린 채다. 아니면 `- 답: <글자> · <email> · <시각>` 으로 채우고 `text` 가 있으면 다음 줄 `- 메모: …`(줄바꿈 제거, 500자).
4. 답이 이미 있으면 새 답으로 바꾸고 옛 값을 `- 이전 답: <옛 값>` 으로 남긴다.
5. 모든 질문의 답이 차면 머리 `status: answered`. 응답 `{sha256, answered, open, statusChanged, kind: answer|opinion}`. 요청은 보내지 않는다.

몹 정리(`by`, 08 §3.14)는 HK-19 몫이라 받지 않는다.

## 6. 읽기 · 데이터 모델

- 캐시(06 §3.2): 읽기마다 stamp(파일 `(mtimeMs, size, ino)`, 폴더는 항목 이름 + stat)만 다시 구하고 같으면 값을 쓴다. git 작업 트리 상태(`dirty` · push 안 된 커밋 · 병합 여부)는 stamp 가 없어 요청마다 비동기로 다시 구한다(체크아웃당 3회).
- 이슈 판정은 체크아웃마다 Python 한 번: 새 `scripts/harness/dashboard_snapshot.py --root <체크아웃>` 이 `{board: board.sh --json 과 같은 값, gates: sdd_gates 모든 이슈 판정, reviews: review_state --all}` 을 낸다. 보드 상태 · 게이트 · 리뷰 판정이 Python 원본 하나에서 온다(06 §3.2 "같은 함수를 쓰므로 진행 탭과 board.sh 의 상태가 같다").
- 이슈 찾기 순서: 이슈 브랜치가 체크아웃된 폴더(`source: worktree`) → 체크아웃 안 된 로컬 이슈 브랜치의 git 객체(`branch`, v2 배치만, 게이트는 Node 가 문서 게이트만 판정) → 메인 폴더 base 작업 트리(`base`, 메인이 base 가 아니면 base 의 git 객체). 같은 키는 앞이 이긴다.
- 이슈 모델은 06 §3.3 그대로이고 `docs.<문서>.approvalSha256` 를 더한다. `stage` 는 `flow.gates` 순서 중 이슈 게이트(requirements · design · tasks · mr · done)에서 처음 통과하지 못한 것, 모두 통과면 `completed`. `waitingOn` 은 그 게이트의 앞 조건이 모두 맞고 자기 기록만 없을 때(문서 게이트는 머리 `in-review` 일 때)다.
- 처리할 일(06 §3.4, DB-R24): rank 1 `review-blocker` · `quality-blocker`, 2 `gate-mine`, 3 `questions`, 4 `verify-failed`, 5 `approval-stale`, 6 `gate-others`, 7 `worktree-cleanup`, 8 `harness`, 9 `dispatch-stale`. 같은 rank 는 `since` 오래된 순, 50건 넘으면 `more: {rank: 수}`. `auto-verify-stopped` · `ops-followup` · `jira-conflict` 는 원본(14 · 10 모듈)이 없어 넣지 않는다.
- worktree: `git worktree list --porcelain` + 체크아웃마다 `status --porcelain`, `rev-list --count HEAD --not --remotes`, base 병합 여부(`merge-base --is-ancestor`). 끝의 정의 = 셋 모두. 리포당 수 > `git.maxPerRepo` 면 초과.
- 세션(06 §3.9): `sessions/*.json` 을 읽고 생존 판정(pid 살아 있음 + `ps -o lstart=` 같음, 소켓은 200ms 연결 후 바로 닫음 — 글을 보내지 않는다). `gone` 이 24시간 지난 파일과 7일 지난 `consumed/` 항목은 단일 프로젝트 · 쓰기 가능 모드에서만 지운다. 응답에 소켓 경로 · pid · 토큰을 넣지 않는다.
- 흐름(06 §3.16): `units.json` 의 `dependsOn` 으로 자리를 정한다. 계약 Unit 은 `y = 0` 띠에 id 순, 기능 · 통합 Unit 은 `x =` 의존 깊이(계약 의존 제외), `y = 1 +` 열 안 id 순. `planned: false` 는 뺀다. 단계는 연결 이슈의 `stage` 에서 `requirements → design → tasks → impl → verify → mr → done(→ deploy)` 로 바꾼다(지난 단계 `:done`, 지금 `:active`). 보드와 같은 원본이다.
- 대화 기록(DB-R28): `~/.config/harness-kit/config.json` 의 `history` 가 `"on"` 이 아니면 `GET /history` 는 404 `history_off` 이고 `~/.claude` · `~/.codex` 를 열지 않는다. 켜져 있어도 읽기는 HK-18 몫이라 501 이다.

## 7. 작업 요청 · 대기함(06 §3.10, DB-R17 · R18 · R19 · R25)

`POST /dispatch {target: {sessionId} | {issue, role}, kind, paths, text?, changeSummary?, via?}`(PIN 없음, 토큰 필요, 읽기 전용이면 403).

- 글: 종류별 틀(`doc-changed` · `answers-ready` · `approved` · `changes-requested` · `review-findings` · `custom`)에 키 · 경로 · 변경 요약만 넣는다. 제어 문자 · 줄바꿈을 지우고 1,000자에서 자른다. `custom` 의 `text` 는 300자 이하. 끝에 "이 글은 승인이 아니다." 문서 내용은 넣지 않는다.
- `via` 없음: 세션이 `alive`(소켓 있음)면 socket, 아니면 409 `socket_unavailable` + `{deeplink, queueAvailable: true}`(자동으로 바꾸지 않는다, DB-R18).
- socket: `net.connect(path)` 2초, `글 + "\n"`(설정 `dashboard.dispatch.socketFormat` 이 `json` 이면 `{"type":"message","text":…}`), `end`, 닫힘 2초. 성공 202 `{method: "socket", status: "sent"}`, 실패 409 `socket_unavailable` + 같은 선택지.
- deeplink: 세션 하네스가 claude 일 때만 `claude-cli://open?cwd=<체크아웃>&q=<글 + " 먼저 경로의 파일을 읽는다.">`(q 5,000자 이하). 202 `{method: "deeplink", url}`.
- queue: 메인 폴더 `.agents/state/dispatch-queue/<ULID>.json`(06 §3.10 형식, `expiresAt` 7일, 0600) 임시 파일 → rename. 202 `{method: "queue", id}`.
- 저장 · 승인 · 답 · 리뷰 판단 · 제안 처리 함수는 dispatch 모듈을 import 하지 않는다. 시험이 소켓 · 대기함 0건으로 확인한다(완료 기준 13).

소비 훅(`scripts/hooks/session-register.py` 가 등록 뒤 `dispatch-inbox.py` 를 부른다): 세션의 `issue` · `role` · `harness` 와 맞는 항목을 만든 순서로 고르고(`sessionId` 가 있으면 그 세션만), 만료 항목은 `expired/` 로 옮기고, 첫 항목 하나만 `rename(queue/<id>.json → queue/consumed/<id>.json)` 으로 가져간다(실패하면 다음 항목). 출력은 06 §3.10 세 줄이고 첫 요청 글은 200바이트, 전체 512바이트에서 자른다. 맞는 항목이 없으면 0바이트.

## 8. 세션 등록 훅(06 §3.9, DB-R16)

`scripts/hooks/session-register.sh` → `session-register.py --root <하네스 루트>`. 이벤트는 훅 입력의 `hook_event_name`(SessionStart · agentSpawn → start, UserPromptSubmit · userPromptSubmit → prompt, Stop · stop → stop, SessionEnd → end), 하네스는 `HX_HARNESS` 환경 변수(등록 명령이 넣는다).

- 세션 id: 입력 `session_id` · `sessionId` → `HARNESS_SESSION_ID` · `CLAUDE_SESSION_ID` · `CODEX_SESSION_ID` · `KIRO_SESSION_ID`, 정규식 `[A-Za-z0-9][A-Za-z0-9_.-]{0,63}`. 없으면 아무것도 하지 않는다.
- 쓰는 곳: `git rev-parse --git-common-dir` 의 부모(메인 폴더) + `--show-prefix`(하네스 루트가 하위 폴더일 때) 의 `.agents/state/sessions/<id>.json`, 파일 0600 · 폴더 0700, 임시 파일 → rename.
- 칸: 06 §3.9 그대로. `role` = `HX_ROLE` → 이슈 브랜치면 `implement` → `docs/` 브랜치면 `docs` → `roles` 에서 그 하네스가 맡은 역할이 하나면 그것 → `unknown`. `issue` = `HX_ISSUE` → 브랜치 키 → null. `pid` 는 부모를 20단계까지 올라가 `claude` · `codex` · `kiro` · `kiro-cli` 를 찾고 `ps -o lstart=` 를 `pidStartedAt` 에. `inbox` 는 `CLAUDE_CODE_MESSAGING_SOCKET` 이 있을 때만이고 `CLAUDE_CODE_MESSAGING_TOKEN` 은 저장하지 않는다. `permissionMode` 는 입력 `permission_mode`.
- prompt: `turn: working` · `lastSeenAt`, stop: `turn: idle`, end: 파일을 지운다. 파일이 없으면 start 와 같이 만든다.
- start · prompt 끝에 대기함 소비(§7). 표준 출력은 그 출력뿐이고 평소 0바이트다.

등록: Claude 는 `projection.json` `claudeSettings.hooks` 에 넷(`harness-session-register` SessionStart · `harness-session-prompt` UserPromptSubmit · `harness-session-idle` Stop · `harness-session-end` SessionEnd, 명령 `HX_HARNESS=claude bash "$CLAUDE_PROJECT_DIR"/scripts/hooks/session-register.sh`). Codex 는 `codex/hooks.json` 의 SessionStart · Stop, Kiro 는 `kiro-agents/__PROJECT_SLUG__.json` 의 `agentSpawn` · `stop` 에 같은 스크립트를 더한다. Codex · Kiro 의 프롬프트 제출 이벤트 이름은 확인 전이라 등록하지 않는다(§12). 역할 에이전트(Kiro `kiroWriteHooks`)는 세션이 아니라 넣지 않는다.

## 9. 화면 없이 쓰기(06 §3.15)

CLI 명령은 `api.ts` 의 같은 처리 함수를 HTTP 없이 부르고, `--json` 은 API 의 `data`(실패면 API 의 `{ok: false, error}`)를 그대로 낸다. 사람용 출력은 표 · 줄.

| API | CLI |
|---|---|
| `GET /session` | `status --session` |
| `GET /overview` | `status` |
| `GET /intents` · `/intents/{key}` | `status --intents` · `status --intent <키>` |
| `GET /issues` · `/issues/{key}` | `status --issues [--area --stage --intent]` · `status --issue <키>` |
| `GET /docs?path=` | `status --doc <경로>` |
| `PUT /docs` | 편집기로 파일을 직접 고친다(06 §3.15 표 S03) |
| `GET /questions?target=` · `POST …/answer` | `answer <대상> --list` · `answer <대상> <Q-n> --choice B [--text …]` |
| `POST /approvals` | `approve <키> --gate <게이트> --phrase … [--changes-requested [--rule-candidate]]` |
| `GET /reviews/{key}` · `POST …/decision` | `review show <키>` · `review decide <키> <F-n> --fix\|--accept-risk --reason …` |
| `GET /verify` · `/worktrees` · `/harness` | `status --verify [--issue]` · `status --worktrees` · `status --harness` |
| `GET /reports/summary` · `/reports/findings` | `quality` · `quality --findings [--issue --severity --new]` |
| `GET /sessions` · `?scope=machine` | `sessions` · `sessions --machine` |
| `POST /dispatch` · `GET /dispatch/queue` · `DELETE /dispatch/queue/{id}` | `dispatch --to <세션 id \| 키:역할> --kind … --path … [--text] [--via]` · `dispatch list` · `dispatch drop <id>` |
| `GET /flow?intent=` · `GET /flow/gates` | `status --flow <INT>` · `flow gates` |
| `POST /units/proposals` · `DELETE …/{intent}` | `units propose <INT> --add-dep U-3:U-1 …` · `units discard <INT>` |
| `GET /projects` · `/projects/overview` | `projects list` · `status --all` |
| `POST /harness/outdated` | `outdated` |
| 501(HK-18 · 19 · 20 · 21): `skills` · `usage*` · `history`(꺼짐이면 404) · `intake` · `ops` · `checkpoints*` · `intents/{key}/burn` | 같은 이름의 예약 명령(exit 2, 제공 이슈를 적는다) |

- `approve` · `answer` · `review decide` 는 에이전트 세션 판정(환경 표지 + 부모 프로세스)에 걸리거나 TTY 가 아니면 exit 3(`read_only`). `approve` · `review decide` 는 요약을 보이고 이슈 키를 입력받는다(approve.py 와 같다). PIN 은 없다(06 §3.15).
- 종료 코드: 성공 0, 400 → 2, 403 `read_only` → 3, 그 밖의 4xx → 1, 501 → 2, 500 → 1.
- `projects add <dir>` · `projects remove <이름|경로>` 만 등록부를 쓴다(임시 파일 → rename, 0600 · 폴더 0700). `init` 의 자동 등록은 이 이슈에 넣지 않는다(§11).
- 등록부 위치: `HOME`(Io 의 환경)에서 `~/.config/harness-kit/`. 시험은 `HOME` 을 임시 폴더로 바꾼다.

## 10. 에이전트 세션 판정(06 §3.11, DB-R22)

`agent.ts` 는 `agent_session.py` 와 같다: `CLAUDECODE=1` · `CLAUDE_CODE_MESSAGING_SOCKET` · `CODEX_*`(`CODEX_HOME` 제외) · `KIRO_*`(`KIRO_HOME` 제외) · `CURSOR_AGENT`, 부모 프로세스 20단계(`ps -o ppid=,comm=` · `args=`)에 `claude` · `codex` · `kiro` · `kiro-cli` · `cursor-agent`(node 로 띄운 스크립트 이름 포함). 서버 시작과 CLI 승인 명령이 부른다. 시험만 처리 함수에 판정 함수를 바꿔 넣는다(프로세스 경계 밖에서는 바꿀 수 없다).

## 11. 정적 내보내기(06 §3.12, DB-R20)

`dashboard --export <폴더>`: 서버를 열지 않고 같은 읽기 함수로 `index.html`(처리할 일 · 단계별 수 · 이슈 표) · `issues/<키>.html`(문서 렌더) · `data/{session,overview,issues,intents,verify,reports-summary,worktrees,flow-<INT>}.json` 을 만든다. 스크립트 · 버튼은 없다.

- 빼는 것: 스킬, 세션, 대기함, 승인 로그, 토큰, 체크포인트, 사용량 · 기록, 전체 프로젝트 · 등록부, 제안 작성자, git 사용자 이메일.
- 경로는 리포 상대, worktree 는 `<worktrees>/<이름>`.
- 끝 검사: 출력 전체에 홈 절대경로(`os.homedir()` 와 `HOME`), `/tmp/cc-socks-`, `uds:`, `dashboard.token` 값(있으면), `~/.claude` · `~/.agents` 가 하나라도 있으면 출력 폴더를 지우고 exit 1. 출력 폴더는 비어 있거나 없을 때만 쓴다(아니면 exit 2).

## 12. 확인 필요

- 소켓 글 형식(06 §6 첫 항목): 기본 `text`(한 줄 평문). 실제 세션 전달은 수동 점검(완료 기준 10)이다.
- Codex · Kiro 의 프롬프트 제출 · 세션 종료 훅 이벤트 이름과 입력의 세션 id 칸. 확인 뒤 HK-24(`.agents/hooks.json`)에서 등록한다.
- Claude 훅 입력에 하네스 판(`harnessVersion`)이 없다. 이 판은 null 로 둔다.
- `dispatch` 의 `--to <이름>`: 06 §3.15 예 `--to design-desk` 는 세션 이름이다. 세션 id · 세션 이름(`HX_SESSION_NAME`) · `<키>:<역할>` 셋을 받는다.

## 13. 설계와 다른 점

| 설계 | 이 구현 | 이유 |
|---|---|---|
| README 원칙 9 핵심 모듈 `packages/cli/src/core/` | `packages/dashboard/src/` 의 처리 함수를 CLI 가 부른다 | 06 §3.1 이 readers · writers 를 dashboard 패키지에 둔다. 같은 함수라 결과가 같다 |
| 06 §3.1 static 은 "CLI 패키지에 포함" | `build.mjs` 가 `static/` 을 번들 안 문자열로 넣는다 | 플러그인 사본이 파일 하나다 |
| 06 §3.2 `board.sh --json` 을 체크아웃마다 | `dashboard_snapshot.py` 한 번(보드 · 게이트 · 리뷰). `board.sh --json` 도 더하고 같은 함수다 | 체크아웃마다 Python 셋을 띄우지 않는다 |
| 06 §3.2 worktrees 원본 `worktree.py list --json`(05) | `git worktree list --porcelain` 과 git 읽기 명령 | `worktree.py` 는 HK-15 다 |
| 06 §3.7 intent 승인 = `intent.md`(+ `units.json` sha 도 기록) | 같은 시각의 기록 두 개(대상 하나씩) | 기록 형식의 대상 칸이 sha 하나다. 형식을 바꾸면 Python 파서 · fixture 를 같이 바꿔야 한다 |
| 06 §3.7 4단계 status ∈ {draft, in-review} | 기록 없는 `approved` 도 받는다(tasks 는 status 를 보지 않는다) | HK-23 §11 과 같은 판정 |
| DB-R22 승인 · 답 · 리뷰 판단만 끈다 | 읽기 전용이면 모든 쓰기 API 가 403 `read_only` | 06 §3.16 제안 저장도 읽기 전용이면 거부한다. 에이전트가 연 서버로 문서를 고칠 이유가 없다 |
| DB-R23 기존 주소 출력 | 에이전트 세션이면 토큰 없는 주소 | 토큰 파일 읽기를 훅이 막는데 명령 출력으로 새면 같은 구멍이다 |
| 06 §3.4 rank 4 `auto-verify-stopped` · 8 `ops-followup` · 9 `jira-conflict` | 넣지 않는다 | 원본(14 · 10)이 아직 없다 |
| 06 §3.5 `/skills` · `/usage*` · `/history` · `/intake` · `/ops` · `/checkpoints*` · `/burn` | 501 `not_implemented` + `details.stage`(HK-18 · 19 · 20 · 21). `/history` 는 꺼져 있으면 404 `history_off` | 범위가 다른 이슈다. 경로는 둔다 |
| 06 §3.5 표에 없음 | `DELETE /dispatch/queue/{id}` · `GET /flow/gates` · `GET /healthz` | CLI `dispatch drop` · `flow gates` 의 API 짝, DB-R23 응답 확인 |
| 06 §3.15 `approve <키> --gate … [--comment …]` | `--comment` 대신 `--changes-requested` · `--rule-candidate`(approve.py 와 같은 플래그) | 승인 기록에 메모 칸이 없다 |
| 06 §3.16 `split` · `merge` 의 반영 규칙(설계에 없음) | split: 원래 Unit `planned: false`, 새 Unit 들이 kind · area · dependsOn 을 받고 첫 Unit 이 스토리를 받으며 원래 Unit 에 의존하던 Unit 은 새 Unit 전부에 의존. merge: 앞 Unit 이 뒤 Unit 의 스토리 · 의존을 받고 뒤 Unit `planned: false` | id 를 지우지 않는다(08 §3.5) |
| 06 §3.17 `init` 이 등록부에 더한다 | 이 이슈는 `projects add\|remove` 만 쓴다 | 시험 · 기존 설치 흐름이 사용자 폴더를 쓰게 된다. 이전 도구(HK-22)와 같이 넣는다 |
| 06 §3.8 몹 정리(`by`) | 받지 않는다 | HK-19(08 §3.14) |
