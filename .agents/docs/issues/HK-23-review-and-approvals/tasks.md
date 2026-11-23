---
key: HK-23
area: verify
type: feat
title: 자체 리뷰 에이전트와 승인 규칙 강제
state: completed
created: 2026-11-23
---

# Tasks — HK-23

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험 작성(RED): fixture · 파서 · approve.py · pre-commit · fast · 훅 · 리뷰 · 코멘트 · VQ-R4 | 전부 | done |
| T2 | `approvals.py` · fixture 37건 · `agent_session.py` | 06 §3.7 · VQ-R15 | done |
| T3 | `sdd_gates.py` · `approve.py` | VQ-R15 · §3.8 표 | done |
| T4 | `approvals_guard.py` · pre-commit · `check_harness.py` | VQ-R13 · VQ-R14 | done |
| T5 | `protect_approvals.py` · `protect-approvals.sh` · 하네스 셋 등록 · `permissions.deny` | VQ-R12 · VQ-R13 | done |
| T6 | `review.py` · `review_report.py` · `review_state.py` · `mr_comment.py` | VQ-R1 · R2 · R3 · R17 | done |
| T7 | 품질 게이트 `review.openMax` · verify affected scan 구간 · CI 템플릿 권한 | VQ-R4 · R17 | done |
| T8 | `/hx-review` 스킬 · 포인터 · reviewer 역할 · `approval-vocabulary.md` · hx-implement · sdd-workflow · 세션 시작 줄 | VQ-R3 · 어휘 규칙 | done |
| T9 | 생성물 · manifest 수 · 시험 통과(GREEN) · 전체 시험 · 원격 e2e(비공개 시험 저장소) | 완료 기준 10 | done |

## 요구사항별 결과

| 요구 | 결과 | 근거(시험) |
|---|---|---|
| VQ-R1 체크아웃 없이 원격 diff · SDD · 규칙 · 스캔 | 충족 | `test_review.CollectTest` — HEAD · 브랜치 · 작업 트리가 collect 전후 같다, 파일 6종, 화면 30줄 이하, 같은 head 의 로컬 스캔 결과 |
| VQ-R2 발견(ID · 심각도 · 위치 · 근거 · 권고 · 지문) · 코멘트 | 충족 | `PublishTest` — 본문 7개 + 나머지, 64자 지문, 줄 50개를 위에 더해도 같은 지문 · 같은 ID, 새 지적은 다음 번호 |
| VQ-R3 review.md 는 구현 세션이 쓴다 | 충족(절차) | 리뷰 세션은 브랜치를 체크아웃하지 않아 커밋할 자리가 없다. 스킬 · 역할이 금지하고, hx-implement 4단계가 review.md 를 쓴다. `review_state` 가 review.md 표를 읽는다 |
| VQ-R4 열린 CRITICAL · HIGH → mr 승인 거부 · full 실패 | 충족 | `FullVerifyBlocksOpenFindingsTest`(full exit 1 → risk-accepted 뒤 0, affected 실패 · changed 경고), `ReviewStateTest.test_gate_check_refuses_mr_with_open_high_findings` |
| VQ-R12 에이전트가 승인 기록 · 기준선 · 토큰을 못 쓴다 | 충족 | `test_protect_approvals` — Claude Write · Edit · MultiEdit, Kiro 쓰기 둘, Codex 패치 셋, 셸 쓰기 13형태 × 셸 도구 셋, 읽기 7형태 통과, Claude deny 5줄 |
| VQ-R13 done 승인 없는 completed — 훅 · fast | 충족 | 훅 6형태 차단 → done 기록 뒤 통과, 무효 기록(경로 chat)은 안 셈, pre-commit 거부, fast 실패 → done 기록 뒤 통과, approvers 밖 done 은 안 셈, legacy · base 에서 이미 completed 는 통과 |
| VQ-R14 기존 줄 변경 · 삭제 거부 — pre-commit · CI | 충족 | 줄 바꿈 · 줄 지움 · 파일 삭제 · `git commit <경로>`(임시 색인) 거부, 덧붙이기 통과, 형식 틀린 새 기록 거부, `--no-verify` 커밋을 fast 가 base 대비로 거부 |
| VQ-R15 에이전트 세션 · TTY 아님 → approve.py 거부 | 충족 | `CLAUDECODE=1` · 메시지 소켓 · `CODEX_SANDBOX` exit 3, TTY 아님 exit 3, argv[0] 이 claude 인 부모 exit 3, 의사 터미널 성공 경로(기록 · 머리 · 로그) |
| VQ-R17 MR 코멘트 하나 | 충족 | GitHub · GitLab 가짜 CLI 두 번 → 1개, 중복 코멘트 정리, CI scan 구간 두 번 → 1개, 원격 e2e(아래) |
| 승인 파서 fixture(HK-17 Node 와 공유) | 충족 | `tests/fixtures/approvals/cases.json` 사례 37 · 유효성 질의 4종 · 리뷰 판단 · 승인 sha 4, `tests/test_approvals_fixtures.py` |
| 승인 어휘 규칙 | 충족 | `.agents/rules/approval-vocabulary.md`, Kiro 포인터 `fileMatch` |

## 검증 기록

### RED(구현 전, 커밋 `79e4509`)

- 킷 `tests/test_approvals_fixtures.py` 6개: `harness.approvals` 가 없어 모듈 읽기 오류.
- 설치본(python 스택) 새 시험 48개 중 46개 실패: `test_approvals` 21개 중 20, `test_protect_approvals` 9개 중 9, `test_review` 18개 중 17. 통과 2개는 구현과 상관없이 통과하는 경우였다.
- 같은 커밋 뒤 `09dd6ac`: 전역 `core.autocrlf=input` 이 CRLF fixture 를 LF 로 바꿔 넣어 `.gitattributes` 에 `tests/fixtures/approvals/** -text` 를 더했다.

### GREEN(커밋 `714eccd`)

- 킷 fixture 시험 6개 통과(파서 사례 37 · 오류 코드 21종 · 질의 `none` · `valid` · `stale` · `invalid` · 리뷰 판단 · 승인 sha 4).
- 설치본 새 시험 48개 통과: `test_approvals` 21 · `test_protect_approvals` 9 · `test_review` 18.
- 처음 GREEN 실행에서 시험 쪽 잘못 5건을 고쳤다: 이슈 폴더 이름 규칙(2~5단어), 옛 이슈 fixture 의 design 누락, fixture 속성 `state` 와 메서드 이름 겹침, 가짜 CLI 상태의 `calls` 없음, 시험 없는 소스 파일이 `incomplete`(HK-4)가 되는 것(문서 파일로 바꿈).
- 설치본 하네스 시험 전체(459개): 처음 실행에서 `test_issue_keys` 4건(실패 1 · 정리 오류 3)이 났다. git 2.54 가 커밋마다 `git maintenance run --auto --detach` 를 띄워(trace2 로 확인) 시험 폴더 정리 · submodule 복제와 겹친 것이다. HK-23 이 바꾼 파일 두 개를 base 판으로 되돌려도 같은 오류가 났다. `sdd_fixture` gitconfig 에 `maintenance.auto=false` · `gc.auto=0`, `review_fixture` 환경에 `maintenance.auto=false` 를 넣은 뒤 `test_issue_keys` 28개가 두 번 모두 통과했다.
- `pnpm -C packages/cli test` 208개 통과. `node scripts/gen-plugins.mjs --check` 일치(파일 549개). `bash scripts/sync-commands.sh --check` 일치.

### 토큰

- 훅: 통과 0바이트(시험이 stdout · stderr 를 빈 문자열로 확인), 차단 stderr 3줄 이하. bash 앞단이 관련 낱말이 없으면 Python 을 띄우지 않는다.
- 세션 시작 고정 안내 1,422 → 1,414바이트(문장 교체). 스택 진입 파일(AGENTS.md + CLAUDE.md) 다섯 스택 모두 6바이트씩 줄었다.
- `/hx-review` description 156자. 새 규칙의 Kiro 포인터는 `inclusion: fileMatch`(SDD 문서를 열 때만). `review.py collect` 화면 30줄 이하, `publish` 10줄 이하.
- 킷 스크립트는 모델을 부르지 않는다. 리뷰 판단은 findings.json 을 쓰는 리뷰 세션 몫이다.

### 원격 e2e(완료 기준 10, GitHub)

- 비공개 시험 저장소 `harness-kit-e2e-sandbox`(로그인한 gh 계정, 이번에 만들었고 남겨 둔다)에 가짜 이슈 `E2E-1` 과 브랜치 `feat/E2E-1-upload-cleanup-003402` 를 올리고 PR #1 을 만들었다. 커밋 작성자는 `harness-kit e2e <e2e@example.invalid>` 이고 비밀값 · 사용자 · 회사 정보는 넣지 않았다.
- `review.py collect '#1'` → findings.json(HIGH 2: RV-EDGE · RV-COV) → `review.py publish E2E-1` 두 번 → `HX_MR='#1' CI=1 mr_comment.py scan` 한 번.
- 결과: 첫 publish 가 코멘트를 만들고 둘째 publish 와 scan 이 같은 코멘트를 고쳤다. `gh api repos/{owner}/harness-kit-e2e-sandbox/issues/1/comments` 의 표시 있는 코멘트 1개, 그 안의 review 구간 1 · scan 구간 1, `RV-COV` 와 `R2.1` 이 남았다(본문 1,207자).
- GitLab 은 가짜 `glab` 시험만 했다(시험할 GitLab 이 없다).

### 전체 시험

- 첫 실행(커밋 `714eccd`)은 중간에 멈췄다. 새 스크립트를 `uvx ruff check` 로 살필 때 생긴 `.ruff_cache/`(추적 안 됨)가 템플릿 `scripts/` 에 남아 설치본에 복사됐고, `test_cli_parity` 가 그 파일 3개를 바이트 차이로 잡았다. 캐시 두 곳(템플릿 · 생성물)을 지운 뒤 생성물 파일 수는 544개로 돌아왔다(커밋에는 들어가지 않았다).
- 캐시를 지우고 같은 커밋(`714eccd`, 트리 변경 없음)에서 다시 돈 `python3 -m unittest discover -s tests -p "test_*.py"`: `Ran 89 tests in 1110.721s` · `OK`. 설치본 하네스 시험(`test_harness_scripts_suite_passes_in_install`)에 HK-23 새 시험 48개가 들어 있다.
- 뒤에 찾은 것: 킷 fixture 시험이 템플릿 `scripts/harness/` 에서 `harness.approvals` 를 읽어 `__pycache__/*.pyc` 를 남겼고, manifest 파일 수(`714eccd` · `1a413f6`)에 그 파일 하나가 들어갔다. 전체 시험은 fixture 시험이 먼저 돌아 맞았지만 깨끗한 checkout 에서 문구 시험만 돌리면 1이 어긋난다. fixture 시험에 `sys.dont_write_bytecode = True` 를 넣고 수를 고쳤다(backend 329 · frontend 337 · common 310). 두 시험을 두 순서로 돌려 모두 통과한다.

### HK-13(`40f76d6`) 위로 합치기

HK-13 이 합쳐진 뒤 받은 안내(스킬 · 규칙 · 역할의 하네스 복사본은 배치 엔진이 만든다)에 따라 커밋 `1a413f6` 에서 `hx-review` 포인터 넷과 `approval-vocabulary` Kiro 포인터를 지우고, 규칙에 `paths` 머리를 넣었다. HK-13 이 지운 파일(스택 CLAUDE.md 다섯 · Kiro 규칙 포인터 둘)의 문구 변경은 되돌렸다. 이 커밋만으로는 설치본 `check_harness.py` 의 포인터 검사가 hx-review · approval-vocabulary 에서 실패한다(옛 포인터 방식). `40f76d6` 위에서는 배치 엔진이 복사본을 만든다.

`git merge-tree 40f76d6 HEAD` 의 남은 충돌은 둘이다(생성물 사본 제외). 브랜치를 합치지 않고 그 트리를 시험 폴더에 꺼내 아래처럼 풀어 확인했다.

1. `packages/templates/common/claude/settings.json`(HK-13 이 지움 · 여기서 고침): 지우고, 같은 내용을 `scripts/harness/projection.json` 의 `claudeSettings.deny` 다섯 줄과 `hooks` 의 `harness-protect-approvals`(PreToolUse · `Write|Edit|MultiEdit|NotebookEdit|Bash`), `kiroWriteHooks.preToolUse` 의 `protect-approvals.sh` 로 옮긴다.
2. `packages/plugin/skills/hx-bootstrap/manifest.md`: `40f76d6` 판에서 파일 수(backend 241 · 0 · 2 · 0 · 7 = 250, frontend 245 · 0 · 2 · 0 · 7 = 254, common 235), 스킬 13종, 훅 · 스크립트 줄을 고친다.
3. HK-13 CLI 시험 `packages/cli/test/projection-merge.test.ts` 의 settings 기대값에 deny 다섯 줄과 `hooks.PreToolUse:harness-protect-approvals` 를 더한다.
4. `pnpm build` · `node scripts/gen-plugins.mjs` 로 생성물을 다시 만든다.

시험 폴더 결과: `pnpm -C packages/cli test` 268개 통과(3번 전에는 settings 시험 3개 실패), `gen-plugins --check` 일치(411개), 킷 문구 · fixture · 정적 분석 템플릿 시험 24개 통과, 전체 시험은 아래.

## 설계와 다른 점(구현 중)

design.md §11 의 표(설계서 대비) 밖에서 구현하며 정한 것:

| design.md | 구현 | 이유 |
|---|---|---|
| §1 파일 표 | 스택 진입 파일 다섯 쌍의 "사용자 검증 후 completed" 를 "`done` 승인 뒤" 로, `sdd-workflow.md` · `git-workflow.md` · Kiro 포인터 둘의 같은 문장도 바꿨다 | 채팅의 말을 승인으로 읽게 하는 문장이 남으면 어휘 규칙과 어긋난다. 진입 파일 바이트는 줄었다 |
| §6.3 보고서 찾기 | 리뷰 세션이 메인 폴더에서 돌고 구현 세션은 worktree 에서 돌아, 보고서를 메인 worktree 에서도 찾는다 | 보고서는 커밋하지 않는 파일이라 worktree 에 없다 |
| §6.5 GitLab 토큰 | 템플릿에 `GITLAB_HOST: $CI_SERVER_HOST` 와 `GITLAB_TOKEN` 안내 주석을 넣었다. GitHub 는 `pull-requests: write` · `GH_TOKEN` | CI 가 코멘트를 쓰려면 권한이 있어야 한다. 명령은 바꾸지 않았다(VQ-R16) |
| §9 시험 | 시험 fixture 의 git maintenance 를 껐다 | 위 검증 기록의 정리 경합 |

설계서(docs/design)는 고치지 않았다. 사실과 다른 줄은 찾지 못했다. 06 §3.3 의 sha 유효성 · 06 §3.7 의 status 조건은 사실 오류가 아니라 구현에서 보완한 점이라 design.md §11 에 적었다.
