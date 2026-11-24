---
key: HK-23
area: verify
type: feat
title: 자체 리뷰 에이전트와 승인 규칙 강제
status: in-review
created: 2026-11-23
---

# Design — HK-23

근거: [requirements](requirements.md), [설계 09](../../../../docs/design/09-verification-quality.md) §3.1 · §3.8 · §5, [06 §3.3 · §3.7 · §3.11](../../../../docs/design/06-dashboard.md), [README §3 · §9](../../../../docs/design/README.md). 선행: HK-16(스캔 결과 · 게이트), HK-3(이슈 폴더 · 머리), HK-2(에이전트 세션 · 차단 훅).

킷 스크립트는 모델을 부르지 않는다. 리뷰 판단은 사람이 연 리뷰 세션의 모델이 하고, 스크립트는 입력 모으기 · 지문 · ID · 보고서 · 코멘트 · 판정만 한다.

## 1. 파일

| 파일(`packages/templates/common/…`) | 바꿈 |
|---|---|
| `scripts/harness/agent_session.py` | 새로. 에이전트 세션 판정(환경 표지 · 부모 프로세스) |
| `scripts/harness/approvals.py` | 새로. `approvals.md` 파서 · 기록 쓰기 · 승인 sha · 승인 유효성(06 §3.3 `none`·`valid`·`stale`·`invalid`) |
| `scripts/harness/approvals_guard.py` | 새로. pre-commit(색인) · fast(base 대비) 검사: 덧붙이기 전용(VQ-R14), 새 기록 형식, 에이전트 세션의 새 기록, `state: completed` 전환(VQ-R13) |
| `scripts/harness/sdd_gates.py` | 새로. 이슈 게이트 조건(requirements · design · tasks · mr · done)과 `check` 명령 |
| `scripts/harness/approve.py` | 새로. 사람 터미널 승인(VQ-R15) |
| `scripts/harness/review_state.py` | 새로. 열린 리뷰 지적 계산(09 §3.1 끝) |
| `scripts/harness/review.py` | 새로. `/hx-review` 의 결정적 부분: `collect` · `publish` · `comment` |
| `scripts/harness/review_report.py` | 새로. 리뷰 보고서 읽기 · 쓰기 · 지문 · ID 이어 쓰기 |
| `scripts/harness/mr_comment.py` | 새로. MR 요약 코멘트 하나(`gh` · `glab`), 구간 `review` · `scan`, CI 보고(`scan`) |
| `scripts/harness/quality_gate.py` · `quality_run.py` | `review.openMax` 검사(지금 `skipped`)를 `review_state` 로 계산한다 |
| `scripts/verify-changed.py` | affected 끝에 CI · MR 정보가 있으면 요약 코멘트 scan 구간을 고친다 |
| `scripts/check_harness.py` | fast 에 `approvals_guard.base_errors` 를 더한다 |
| `scripts/git-hooks/pre-commit` | 검증 게이트 앞에서 `approvals_guard.py pre-commit` |
| `scripts/hooks/protect-approvals.sh` · `protect_approvals.py` | 새로. PreToolUse 훅(VQ-R12 · VQ-R13, 승인 상태 변경 · 승인 명령 실행 차단) |
| `claude/settings.json` | `permissions.deny` 다섯 줄, PreToolUse 항목 하나 |
| `codex/hooks.json` · `kiro-agents/__PROJECT_SLUG__.json` · `kiro-hooks/harness-protect-approvals.json`(새로) | 같은 훅 등록 |
| `agents-rules/approval-vocabulary.md` · `kiro-steering/approval-vocabulary.md` | 새로. 승인 어휘 규칙과 Kiro 포인터(`fileMatch`) |
| `agents-skills/hx-review/SKILL.md` | 새로. 포인터 넷은 `scripts/sync-commands.sh` 가 만든다 |
| `agents-root/roles/reviewer.md` · `claude/agents/reviewer.md` · `codex/agents/reviewer.toml` | MR 리뷰 모드(점검 ID · 발견 파일 · review.md 를 쓰지 않음) |
| `agents-skills/hx-implement/SKILL.md` · `agents-rules/sdd-workflow.md` | review.md 처리, 승인은 네 경로, `completed` 는 `done` 승인 뒤 |
| `scripts/hooks/session-start.sh` | 협업 줄의 "공지 확인을 사용자 승인으로 해석하지 않는다"를 채팅까지 넓힌다(바이트 늘리지 않음) |
| `root/.github/workflows/harness-verify.yml` · `ci/harness-kit.gitlab-ci.yml` | 코멘트 권한 · 토큰 환경 변수와 주석(명령은 그대로) |

킷: `tests/fixtures/approvals/`(입력 · 기대값), `tests/test_approvals_fixtures.py`, `tests/harness_scripts/test_{approvals,protect_approvals,review}.py`, `packages/plugin/skills/hx-bootstrap/manifest.md` 파일 수.

새 파일은 `layout.json` 세그먼트(`scripts/` · `agents-rules/` · `agents-skills/` · `kiro-*`)로 setup.sh 와 CLI 가 같이 깐다. `layout.json` 은 바꾸지 않는다.

## 2. 승인 기록 `approvals.md`

형식은 06 §3.7 그대로다. 파서(`approvals.py parse`)가 정하는 세부:

- 제목 줄: `^## (\S+) · ([a-z]+(?:/F-\d+)?) · (approved|changes-requested|risk-accepted|fix-required)$`. `## ` 로 시작하는데 맞지 않으면 파일 오류 `bad-heading`.
- 시각: ISO 8601, 시간대 필수(`Z` 또는 `±hh:mm`). 아니면 `bad-time`.
- 게이트: `codebase` · `intent` · `plans` · `requirements` · `design` · `tasks` · `mr` · `done` · `deploy` · `review/F-<n>`. 아니면 `unknown-gate`. `review/F-n` 은 `risk-accepted` · `fix-required` 만, 그 밖의 게이트는 `approved` · `changes-requested` 만(`decision-mismatch`).
- 칸 줄 `- 이름: 값`:

| 칸 | 형식 | 필수 |
|---|---|---|
| 승인자 | `<이메일>[ (<이름>)][ · 그룹: <그룹>]` | 모두(`missing-approver` · `bad-approver`) |
| 대상 | `<이름>` 뒤에 ` · sha256: <64 hex>` · ` · 지문: <12~64 hex>` · ` · head: <7~40 hex>` | 모두. 문서 게이트는 sha256, `review/F-n` 은 지문(`bad-target`) |
| 문구 | `"…"`(바깥 따옴표만 뗀다) | `terminal` · `dashboard`(`missing-phrase`) |
| 경로 | `terminal` · `dashboard` · `jira` · `aidlc` | 모두. 그 밖은 `unknown-path`(채팅은 경로가 아니다) |
| 기록 ID | ULID 26자(Crockford) | 모두(`bad-entry-id`). 같은 ID 두 번이면 뒤 것 `duplicate-entry-id` |
| 근거 | 자유 | `jira`(`changelog <id>`) · `aidlc`(`missing-evidence`) |
| source | `aidlc` | `aidlc`(`missing-source`) |
| 규칙 후보 | `예` | `changes-requested` 에만(`field-not-allowed`) |
| 롤백 면제 | 자유 | `deploy` 에만(`field-not-allowed`) |

- 모르는 칸은 `unknown-field`, 기록 안의 칸이 아닌 줄은 `stray-line`. 첫 제목 줄 앞(`# 승인 기록 — <키>`, 주석, 빈 줄)은 읽지 않는다. 줄 끝 `\r` 은 뗀다.
- 결과: `{"key", "entries": [{line, at, gate, decision, approver{email,name,group}, target{name,sha256,fingerprint,head}, phrase, path, entryId, source, evidence, ruleCandidate, rollbackWaiver, errors[], valid}], "errors": [{line, code}]}`. 기록 오류가 있으면 `valid: false` 이고 판정에서 빠진다.

승인 sha(설계에 없던 정의, §11): 문서 머리의 `status:` · `state:` 줄을 뺀 바이트의 sha256. 승인하면 `status` 가 `approved` 로 바뀌고 tasks 는 진행하며 `state` 가 바뀐다. 두 줄을 넣으면 승인한 순간 기록이 `stale` 이 된다.

유효성 `approval_state(entries, gate, sha, policy)`(06 §3.3):

1. 그 게이트의 `approved` 기록(유효한 것)이 없으면 `none`.
2. sha 가 주어지면(문서 게이트) 현재 sha 와 같은 기록만 남긴다. 없으면 `stale`.
3. 남은 기록 중 승인자가 `approvers[gate]`(이메일 또는 `groups` 의 그룹)에 있는 것이 있으면 `valid`, 없으면 `invalid`. `approvers` 가 없거나 그 게이트 칸이 없으면 누구나 된다(README §5).

fixture(`tests/fixtures/approvals/cases.json`): 파서 사례 30건(네 경로 · 리뷰 판단 · 오류 코드 전부 · CRLF), 유효성 질의(`valid` · `stale` · `invalid` · `none`, 그룹, 같은 게이트 두 번), 승인 sha 사례 4건. Node 파서(HK-17)는 같은 파일을 읽어 같은 결과를 내야 한다. 형식은 파일 첫 칸 `format` 에 적는다.

## 3. 게이트 조건 `sdd_gates.py`

09 §3.8 표의 이슈 게이트만 한다. `codebase` · `intent` · `plans` · `deploy` 는 HK-19 · HK-21 몫이라 `approve.py` 가 exit 2 로 거부한다.

| 게이트 | 앞 조건(`preconditions`) | 통과(`passed`) |
|---|---|---|
| requirements | `[NEEDS CLARIFICATION` 0 | 앞 조건 + 머리 `approved` + `valid` 기록 |
| design | requirements 통과, `[NEEDS CLARIFICATION` 0 | 같음 |
| tasks | design 통과 | 앞 조건 + `approved` 기록이 `valid` 또는 `stale`(§11) |
| mr | tasks 통과, `verify-last.json` 이 같은 HEAD · 깨끗한 트리의 `affected` `passed`, `quality-gate-last.json` 이 같은 HEAD 면 `failed` 아님, 열린 리뷰 CRITICAL · HIGH 0 | 앞 조건 + `mr · approved` `valid` |
| done | `mr · approved` `valid`, base ref(`origin/<base>`, 없으면 `<base>`)의 이 이슈 `approvals.md` 에 `mr · approved` 가 있다(병합됨) | 앞 조건 + `done · approved` `valid` |

- 머리에 `legacy` 가 있는 문서(옮긴 옛 이슈)는 기록 없이 머리 값으로 통과한다.
- `python3 scripts/harness/sdd_gates.py check <키> [--json]` 은 게이트마다 한 줄(통과 · 안 된 이유)을 낸다. 판정 원본은 이 모듈이고 `approve.py` · 훅 · fast 가 부른다.

## 4. 사람 터미널 승인 `approve.py`(VQ-R15)

```text
python3 scripts/harness/approve.py <이슈키> <게이트> --phrase "<문구>" [--changes-requested [--rule-candidate]]
python3 scripts/harness/approve.py <이슈키> review/F-<n> (--risk-accepted | --fix-required) --phrase "<문구>"
exit: 0 기록함 · 1 조건 · 확인 실패 · 2 사용법 · 3 에이전트 세션 또는 TTY 아님
```

1. 에이전트 세션이면 exit 3: 환경 표지(`CLAUDECODE=1` · `CLAUDE_CODE_MESSAGING_SOCKET` · `CODEX_*`(`CODEX_HOME` 제외) · `KIRO_*`(`KIRO_HOME` 제외) · `CURSOR_AGENT`) 또는 부모 프로세스(20단계까지 `ps -o ppid=,comm=,args=`)에 `claude` · `codex` · `kiro` · `kiro-cli` · `cursor-agent`. 메시지에 걸린 표지를 적는다.
2. stdin · stdout 둘 다 TTY 가 아니면 exit 3.
3. 하네스 루트는 현재 폴더에서 위로 찾는다. 이슈 폴더는 `find_issue`. 현재 브랜치 이름에 다른 이슈 키가 있으면 exit 2.
4. 대상: 문서 게이트는 그 문서(머리 `draft` · `in-review`, 또는 `approved` 인데 `valid` 기록이 없을 때 — v1.1 중에 기록 없이 `approved` 가 된 문서를 기록으로 남긴다), 같은 sha 로 이미 `approved` 면 exit 1. `mr` · `done` 은 `<브랜치> · head: <sha>`. `review/F-n` 은 보고서(§6)의 그 발견 · 지문.
5. `approved` 면 앞 조건(§3)과 `[NEEDS CLARIFICATION`. 안 되면 이유를 적고 exit 1.
6. 승인자 = `git config user.email`(비면 exit 2) · `user.name`. `approvers` 밖이면 exit 1. 게이트 조건에 그룹이 걸리면 처음 맞은 그룹을 적는다. `review/F-n` 은 `approvers.mr` 를 쓴다.
7. 요약(대상 · sha 앞 12자 · 게이트 · 판단 · 문구 · 승인자)을 보이고 "확인하려면 이슈 키를 입력한다:" — 다르면 exit 1.
8. `approvals.md` 덧붙이기(없으면 머리와 주석을 만든다), `approved` 인 문서 게이트는 머리 `status: approved`, `.agents/state/approvals-log.jsonl` 에 `{entryId, target, gate, sha256, at, path}`. 각 파일은 임시 파일 → rename, 뒤 쓰기가 실패하면 앞 파일을 원래 바이트로 되돌리고 exit 1. 커밋하지 않는다(사람이 한다).

## 5. 강제 장치

| 막는 것 | PreToolUse 훅(`protect_approvals.py`) | Claude `permissions.deny` | pre-commit | fast(`check_harness.py`) |
|---|---|---|---|---|
| `**/approvals.md` · `.agents/quality-baseline.json` · `.agents/state/dashboard.token` · `.agents/state/approvals-log.jsonl` 쓰기(VQ-R12) | 쓰기 도구 경로, Codex 패치 머리줄, 셸 명령의 쓰기(`>` · `>>` · `tee` · `sed -i` · `perl -i` · `mv` · `cp` · `rm` · `truncate` · `dd of=` · `git checkout|restore|rm|mv`)가 그 이름을 가리킴 | `Edit(//**/approvals.md)` 등 넷 | — | — |
| 토큰 읽기 · 승인 API 부르기 | 셸 명령에 `dashboard.token` · `/api/v1/approvals` | `Read(//**/.agents/state/dashboard.token)` | — | — |
| 승인 명령 실행 | 셸 명령에 `approve.py` · `harness-kit approve` · `harness-kit review decide` | — | — | — |
| 기존 줄 변경 · 삭제(VQ-R14) | — | — | `git diff --cached -M -U0` 의 `-` 줄 · 파일 삭제 | `origin/<base>`(또는 `HX_BASE_REF`) merge-base 대비 같은 검사 |
| 새 기록 형식 | — | — | 덧붙인 기록의 파서 오류 | 모든 `approvals.md` 파서 오류 |
| 에이전트 세션의 새 기록 | — | — | 환경 표지가 있으면 새 기록의 `기록 ID` 가 로컬 `approvals-log.jsonl` 에 있어야 한다 | — |
| `state: completed` 전환(VQ-R13) | 쓸 내용에 `state: completed` 가 있고 지금 파일이 completed 가 아니면 `done` `valid` 기록 검사 | — | HEAD → 색인 전환 | merge-base → 작업 트리 전환(base ref 가 없으면 HEAD 대비) |
| `status: approved` 전환 | 요구 · 설계 · tasks 문서에 `status: approved` 를 쓰는 편집(지금 파일이 approved 가 아님) | — | — | — |

- 훅은 하네스가 부르므로 에이전트 세션에서만 돈다. 막을 때만 stderr 2~3줄을 내고 exit 2, 그 밖에는 출력이 없다. bash 앞단이 입력에 `approvals` · `quality-baseline` · `dashboard.token` · `tasks.md` · `requirements.md` · `design.md` · `approve` · `api/v1` 이 없으면 Python 을 띄우지 않는다. 해석하지 못한 입력은 통과시킨다(HK-2 R2.4).
- 셸 명령에서 읽기(`cat` · `grep` · `git show`)는 막지 않는다. 구현 세션이 승인 상태를 볼 수 있어야 한다.
- pre-commit 의 덧붙이기 검사는 사람에게도 적용한다(09 §3.8). 검사는 `unset $(git rev-parse --local-env-vars)` 앞에서 돈다(`git commit <경로>` 의 임시 색인 `GIT_INDEX_FILE` 을 읽어야 한다).
- 전환 검사: 옮긴 옛 이슈(`legacy` 머리)와 base 에서 이미 `completed` 였던 tasks 는 보지 않는다. v1.0.8 · HK-23 전 이슈가 update 뒤 fast 에서 실패하지 않는다.

## 6. 리뷰

### 6.1 흐름(`/hx-review <MR>`)

```text
1. python3 scripts/harness/review.py collect <!123|#45|브랜치> [--platform github|gitlab]
   플랫폼: 인자 머리(# github · ! gitlab), 아니면 origin URL(github · gitlab), 아니면 exit 2
   MR: gh pr view <n> --json number,url,headRefName,baseRefName,headRefOid · glab mr view <iid> -F json
   git fetch origin +refs/heads/<head>:refs/remotes/origin/<head> +refs/heads/<base>:refs/remotes/origin/<base>
   키 = head 브랜치 이름 <종류>/<키>-…(아니면 exit 2). 체크아웃하지 않는다(VQ-R1)
   .agents/state/review/<키>/ 에 쓴다:
     context.json   플랫폼 · 번호 · URL · head · headSha · base · baseSha · 이슈 폴더 · 파일 수
     diff.patch     git diff --find-renames origin/<base>...origin/<head>
     files.tsv      numstat(추가 · 삭제 · 경로)
     sdd/           git show origin/<head>:<이슈 폴더>/{requirements,design,tasks,review,approvals}.md(있는 것)
     rules/         git show origin/<base>:.agents/rules/{pr-review-policy,security,api-standards,guardrails,code-maintenance}.md(있는 것), ADR 목록
     scan.txt       새 문제 요약: CI 산출물(gh run download -n harness-reports · glab job artifact <head> harness:affected) →
                    없으면 .agents/reports/findings-latest.json(head 가 같을 때만) → 없으면 "스캔 결과 없음"
     previous.md    이전 보고서 .agents/reports/review/<키>.md(있으면)
   화면: 30줄 이하(MR · 파일 상위 15개 · SDD · 규칙 · 스캔 한 줄 · 읽을 경로 · 다음 단계)
2. 리뷰 세션(모델)이 점검표(09 §3.1 RV-COV · RV-ADR · RV-RULE · RV-EDGE · RV-TEST · RV-SCAN · RV-DOC)로 보고
   .agents/state/review/<키>/findings.json 을 쓴다: {"findings": [{severity, check, path, line, title, evidence, scenario, recommendation}], "notes"}
3. python3 scripts/harness/review.py publish <키> [--no-comment]
   형식 검사(심각도 · 점검 ID · 경로가 head 에 있거나 diff 에 있음 · 줄 ≥ 1) → 지문 · ID → 보고서 → 코멘트 review 구간
```

- 리뷰 세션은 이슈 폴더의 `review.md` · `approvals.md` 를 쓰지 않는다(VQ-R3). 브랜치를 체크아웃하지 않으므로 커밋할 자리가 없고, 스킬 · 역할 문서가 금지한다. 처리 결과는 구현 세션이 `review.md` 에 쓴다.
- 지문 = `sha256(check \0 경로 \0 정규화한 해당 줄 ±1줄)`(09 §3.1). 줄 내용은 `git show origin/<head>:<경로>`, 정규화는 줄마다 공백 묶기 · 앞뒤 공백 제거 뒤 `\n` 으로 잇기. 파일이 head 에 없으면(지운 파일) base 판 내용을 쓴다. 같은 (점검 · 경로 · 내용)이 두 번이면 뒤 것에 `\0<순번>` 을 붙인다.
- ID: 이전 보고서의 ID 표(보고서 끝 `<!-- harness-kit:review-ids {...} -->`)에서 같은 지문의 ID 를 이어 쓰고, 새 지문은 지금까지 쓴 가장 큰 번호 + 1. 사라진 지문의 ID 도 표에 남겨 다시 쓰지 않는다.

### 6.2 보고서 `.agents/reports/review/<키>.md`(커밋 안 함)

09 §3.1 형식이다. 머리 `issue` · `mr` · `head`(40자) · `base` · `reviewer: { harness: <판정>, role: reviewer }` · `reviewedAt` · `verdict`(CRITICAL · HIGH 가 있으면 `changes-required`, 아니면 `approve`) · `counts`. 발견은 심각도 → ID 순으로 7개까지 본문(`## F-n · 심각도 · 점검` + 위치 · 근거 · 실패 시나리오 · 권고 · 지문), 나머지는 `## 나머지` 에 `- F-n · 심각도 · 점검 · 경로:줄 — 한 줄`. 끝에 ID 표 주석.

### 6.3 열린 지적 `review_state.py`

```text
python3 scripts/harness/review_state.py <이슈 폴더> [--report <보고서>] [--json]   exit 0 열린 CRITICAL·HIGH 0 · 1 있음 · 2 보고서 없음/형식 오류
python3 scripts/harness/review_state.py --all [--root <루트>]                       로컬 보고서가 있는 이슈 전부
```

- 보고서 찾기: `--report` → `<루트>/.agents/reports/review/<키>.md` → 메인 worktree(`git worktree list --porcelain` 첫 항목)의 같은 경로. 리뷰 세션은 메인 폴더에서 돈다(09 §3.1 "worktree 를 만들지 않는다").
- CI(`CI` 가 있고 MR 정보가 있음)에서 로컬 보고서가 없으면 MR 요약 코멘트 review 구간의 데이터 주석(`<!-- harness-kit:review-data {"head", "findings": [{id, severity, fp}]} -->`)을 읽는다(09 §3.1 끝).
- 보고서에 있는 발견마다: 그 지문 · ID 의 마지막 리뷰 판단 기록이 `risk-accepted`(유효, 승인자 `approvers.mr`)면 닫힘. MEDIUM · LOW 는 `review.md` 표의 처리가 `거절 제안` 이면 닫힘. `수용` 은 다시 돈 리뷰가 그 지문을 보고하지 않을 때 닫히므로 보고서에 남아 있는 동안 열림이다. 결과 `{report, head, stale(보고서 head ≠ HEAD), open{심각도별}, findings[{id, severity, fp, state}]}`.
- `review.md` 표 열: `| ID | 심각도 | 지문 | 처리 | 커밋 | 사유 |`(09 §3.1). 지문 칸은 앞 12자 이상.

### 6.4 VQ-R4

- 품질 게이트 `review.openMax`(지금 `skipped`)를 계산한다. 레벨 affected 는 현재 브랜치(CI 는 `GITHUB_HEAD_REF` · `CI_MERGE_REQUEST_SOURCE_BRANCH_NAME`)의 이슈 하나, full 은 `--all`, changed 는 로컬 보고서만. 검사 ID `review.openMax.CRITICAL` · `review.openMax.HIGH`, 한도 초과면 `enforceAt` 레벨에서 `failed`(기준선 유무와 상관없다 — 기준선은 분석기 발견의 것이다), `warnAt` 에서 `warned`. 보고서가 없으면 `skipped`(`no-review`).
- `analyzers.json` 이 없어도(분석기 0개) 리뷰 검사는 돈다. 이때 화면 줄은 게이트 한 줄뿐이다.
- `mr` 게이트 승인(`approve.py`)은 §3 앞 조건에서 같은 계산으로 거부한다.

### 6.5 MR 요약 코멘트(VQ-R17)

```text
<!-- harness-kit:mr-summary -->
### harness-kit 요약
<!-- section:review -->…<!-- /section:review -->
<!-- section:scan -->…<!-- /section:scan -->
```

- 찾기: GitHub `gh api --paginate repos/{owner}/{repo}/issues/<n>/comments`, GitLab `glab api --paginate projects/<id>/merge_requests/<iid>/notes?per_page=100`(CI 는 `CI_PROJECT_ID`, 아니면 `:id`). 본문에 표시가 있는 것이 킷 코멘트다.
- 없으면 만들고(`POST`), 있으면 그 구간만 바꿔 고친다(GitHub `PATCH repos/{o}/{r}/issues/comments/<id>`, GitLab `PUT …/notes/<id>`). 본문은 `--input <JSON 파일>` 로 넘긴다.
- 킷 코멘트가 둘 이상이면(동시 실행) 가장 오래된 것에 구간을 모으고 나머지를 지운다. 코멘트 수는 항상 1이 된다.
- review 구간: 판정, 심각도별 수와 열린 수, 상위 7개(ID · 심각도 · 위치 · 한 줄), 보고서 · 관리 페이지 안내, 데이터 주석. scan 구간: 검증 상태, 품질 게이트 상태 · 위반 검사, 새 문제 심각도별 수, 상위 7개, 판정 판(base · bootstrap), 미완료 분석기.
- CI 보고(09 §3.7 표의 "보고"): `verify-changed.py` affected 실행 끝에서 `CI` 가 있고 MR 정보(GitHub `GITHUB_EVENT_PATH` 의 `pull_request.number`, GitLab `CI_MERGE_REQUEST_IID`)가 있으면 scan 구간을 고친다. `gh` · `glab` 이 없거나 토큰이 없거나 API 가 실패하면 경고 한 줄이고 판정 · exit 를 바꾸지 않는다.

## 7. 승인 어휘 규칙 `approval-vocabulary.md`

09 §3.8 의 표와 문장: 채팅에서 한 말은 어떤 말이든 승인이 아니다(예시 낱말), 네 경로와 `경로` 값, 문구는 기록일 뿐이다, "반영해 · push해 · 머지해" 는 작업 지시로만 쓴다, AI-DLC 세션의 다른 대화와 몹 회의의 말도 승인이 아니다, 에이전트가 쓰지 않는 파일 넷. Kiro 포인터는 `inclusion: fileMatch`(`**/approvals.md|**/tasks.md|**/requirements.md|**/design.md`)라 SDD 문서를 열 때만 실린다.

## 8. 토큰

- 훅 출력: 통과 0바이트, 차단 3줄 이하. 세션 시작 고정 안내 바이트는 늘리지 않는다(문장 교체).
- `review.py collect` 화면 30줄 이하, `publish` 10줄 이하. diff · 문서는 파일로 두고 리뷰 세션이 필요한 곳만 연다.
- 스킬 description 300자 이하. 새 규칙의 Kiro 포인터는 `fileMatch`. Claude · Codex 는 규칙을 자동으로 싣지 않는다.
- 킷 스크립트는 모델을 부르지 않는다. `/hx-review` 는 사람이 연 리뷰 세션에서만 돈다.

## 9. 시험

킷(`tests/test_approvals_fixtures.py`): fixture 사례마다 Python 파서 결과 = 기대값, 유효성 질의, 승인 sha, 사례 20건 이상 · 네 경로 · 리뷰 판단 둘 · 오류 코드가 모두 한 번 이상 나온다.

설치본(`tests/harness_scripts/`, python 스택):

- `test_approvals.py`: approve.py — `CLAUDECODE=1` exit 3, TTY 없음 exit 3, 부모 프로세스 이름 `claude` exit 3, pty 에서(부모 사슬을 끊은 손자 프로세스) 키 입력 → 기록 · 머리 `approved` · 로그 줄, 키가 다르면 exit 1 무변경, 앞 조건 실패(design 전에 requirements 미승인) exit 1, `approvers` 밖 exit 1, `[NEEDS CLARIFICATION` exit 1. pre-commit — 기존 줄 바꿈 · 지움 · 파일 삭제 거부, 덧붙이기 통과, 형식 틀린 새 기록 거부, 에이전트 표지 + 로그에 없는 새 기록 거부, `git commit <경로>`(임시 색인). fast — 훅을 건너뛴 커밋(`--no-verify`)의 줄 변경을 base 대비로 거부, 승인 없는 `state: completed` 커밋 실패 → done 기록 뒤 통과, `legacy` 문서 · base 에서 이미 completed 는 통과.
- `test_protect_approvals.py`: Claude Write · Edit · MultiEdit, Codex `apply_patch` · Bash, Kiro 쓰기 도구로 네 파일 쓰기 차단, 셸 쓰기 형태(리다이렉션 · tee · sed -i · mv · rm · git checkout) 차단, 읽기(`cat approvals.md` · `grep`) 통과, 토큰 읽기 · 승인 API · `approve.py` 차단, `state: completed` 편집 — 기록 없음 차단 · `done` 기록 있음 통과 · 이미 completed 통과, `status: approved` 편집 차단, 무관한 입력 출력 0바이트, 해석 불가 입력 통과, 하네스 셋 등록.
- `test_review.py`(가짜 `gh` · `glab`, 네트워크 없음): `collect` 가 체크아웃 없이(HEAD · 작업 트리 그대로) 파일을 쓰고 화면 30줄 이하, 키 없는 브랜치 exit 2, `publish` 의 보고서 형식 · 지문(위에 줄 50개를 더해도 같음) · ID 이어 쓰기 · 7개 + 나머지, 코멘트 두 번 → 1개(GitHub · GitLab 각각), 중복 코멘트 정리, review · scan 구간이 서로를 지우지 않음, review_state 닫힘 규칙(risk-accepted · 거절 제안 MEDIUM · 수용은 열림), `verify.sh --full` 이 열린 HIGH 로 exit 1 → `review/F-1 · risk-accepted` 를 더하면 통과(완료 기준 3), affected 게이트 실패, mr 승인 거부, CI affected 가 scan 구간을 쓴다 · gh 가 없으면 경고 한 줄 · exit 같음, 완료 기준 2(`R2.1` 미구현 MR 에서 `RV-COV` 발견이 보고서 · 코멘트에 남는다 — findings.json 은 시험이 쓴다).

원격 e2e: 비공개 저장소 `harness-kit-e2e-sandbox` 에 브랜치 · PR 을 만들고 `review.py publish` 두 번 + `mr_comment.py scan` 한 번 뒤 표시가 있는 코멘트가 1개인지 `gh api` 로 센다(완료 기준 10, GitHub). 저장소에는 비밀값 · 사용자 · 회사 정보를 넣지 않는다.

## 10. 확인 필요

- Codex · Kiro PreToolUse 입력의 쓰기 내용 칸 이름(09 §6). 이 구현은 문자열 칸 전체에서 `state: completed` · `status: approved` 를 찾으므로 칸 이름이 달라도 걸린다. 경로 칸을 못 찾으면 통과한다.
- Kiro 읽기 도구 이름. 토큰 파일 읽기는 셸 명령만 막는다(Claude 는 `permissions.deny`).
- `glab api --input` · `--paginate` 동작과 CI 의 노트 쓰기 권한(`CI_JOB_TOKEN` 은 노트를 못 쓴다 — `GITLAB_TOKEN` 프로젝트 토큰 필요 여부). GitLab 은 가짜 `glab` 으로만 시험했다.
- tasks 게이트의 `stale` 허용(§11)을 대시보드(HK-17)에서 같은 규칙으로 보일지.

## 11. 설계와 다른 점

| 설계 | 이 구현 | 이유 |
|---|---|---|
| 06 §3.3 `valid` = 기록 sha = 현재 sha | 승인 sha 는 머리 `status` · `state` 줄을 뺀 sha256 | 승인이 `status` 를 바꾸므로 그대로면 승인 직후 `stale` 이다 |
| 09 §3.8 `tasks` = sha 같은 유효 기록 | `tasks` 는 `stale` 기록도 통과(앞 게이트 판정용) | 구현 중 체크 · 검증 기록으로 tasks.md 가 계속 바뀐다. 그대로면 `mr` 게이트가 영영 막힌다 |
| 06 §3.7 4단계 status ∈ {draft, in-review} | 기록 없이 `approved` 인 문서도 승인할 수 있다 | v1.1 중(HK-23 전)에 기록 없이 approved 가 된 문서를 기록으로 남길 길이 없다 |
| 09 §3.8 표 "승인 없이 `status: approved`" — pre-commit · fast | 훅만(에이전트 편집 차단) | 기존 리포에 기록 없는 approved 문서가 많아 fast 로 막으면 update 뒤 모두 실패한다. 승인 기록 이전은 HK-22 |
| 09 §3.8 VQ-R13 fast = 모든 completed | base 대비 전환만(`legacy` · base 에서 이미 completed 는 제외) | 같은 이유. 새 전환은 모두 잡는다(완료 기준 4) |
| 09 §3.8 에이전트 세션 판정 = 06 §3.11(부모 프로세스 포함) | approve.py 만 부모 프로세스를 본다. git 훅 · fast 는 환경 표지만 | 사람이 에이전트가 띄운 셸에서 부른 git 이 아닌 이상 사람 커밋을 막지 않는다. 시험을 에이전트 세션 안에서 돌려도 같은 결과가 나온다 |
| 09 §3.8 pre-commit 에이전트 규칙 | 에이전트 세션의 새 기록은 로컬 `approvals-log.jsonl` 에 그 ID 가 있어야 한다 | 사람이 approve.py 로 남긴 기록을 에이전트가 커밋하는 길은 두고, 에이전트가 지어낸 기록은 막는다 |
| 09 §3.8 위조 경고(dashboard 기록 ID 가 로컬 로그에 없음) | 하지 않는다 | 위 pre-commit 규칙이 같은 경우를 막는다. 관리 페이지(HK-17)와 같이 넣는다 |
| 09 §3.8 high risk 승인자 2명 · `risk.highPaths` | 하지 않는다 | 위험 프로필은 HK-19(08 §3.15) |
| 09 §3.1 지문 = 해당 줄 ±1줄 | 같은 (점검 · 경로 · 내용)이 두 번이면 순번을 붙인다 | 같은 줄을 다른 이유로 두 번 지적하면 ID 가 하나로 합쳐진다 |
| 09 §3.1 코멘트 구간 표시 하나씩 | 여는 표시 `<!-- section:x -->` 와 닫는 표시 `<!-- /section:x -->` | 구간 끝이 없으면 다른 구간을 지우지 않고 바꿀 수 없다 |
| 09 §3.7 표 "affected-head 결과 차이를 scan 구간에" | 하지 않는다 | head 판 작업은 따로 돌고 결과를 base 판 작업이 모른다. 차이 비교는 CI 산출물 둘이 필요하다 |
| 09 §3.1 입력 6 "스캔 결과 = CI 산출물" | 산출물 이름은 GitHub `harness-reports`(HK-16 템플릿), GitLab 은 `harness:affected` 작업 산출물 | HK-16 템플릿이 정한 이름이다 |
