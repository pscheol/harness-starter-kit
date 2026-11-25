---
key: HK-24
area: hooks
type: feat
title: hooks.json에서 하네스별 훅을 만들고, worktree를 따라가며, 복사본을 원본과 맞춘다
status: approved
created: 2026-11-24
---

# Design — HK-24

근거: [requirements](requirements.md), [설계 03](../../../../docs/design/03-projection-and-hooks.md) §3.4 · §3.5 · §3.10~§3.12 · §5, [설계 12 §3.8](../../../../docs/design/12-model-routing.md)(세션 시작 출력), [06 §3.9 · §3.10 · §3.18](../../../../docs/design/06-dashboard.md), [README](../../../../docs/design/README.md) 원칙 10. 선행: HK-13(배치 엔진 · `projection.json` · lock v2 · 병합 규칙), HK-17(세션 등록 · 대기함 소비), HK-23(`protect-approvals`), HK-25(v1 첫 update 병합).

훅 · 디스패처 · 동기화는 스크립트이고 모델을 부르지 않는다. 세션에 붙는 바이트는 늘지 않고 준다(§7).

## 1. 바뀌는 파일

| 자리 | 내용 |
|---|---|
| `packages/templates/common/agents-root/hooks.json`(새) | 훅 원본. 설치본 `.agents/hooks.json`(킷 파일, 토큰 치환) |
| `scripts/hooks/dispatch.sh` · `hook_root.py`(새) | 모든 킷 훅의 입구: 루트 판정 · 출력 상한 · 실행 기록 |
| `scripts/hooks/hook_paths.py`(새) | 훅 입력에서 쓰는 경로 뽑기(Claude · Codex patch · Kiro). `session-context.py` 의 `tool_paths` 를 옮겨 셋이 같이 쓴다 |
| `scripts/hooks/sync-projection.sh` · `protect-generated.sh` · `protect_generated.py`(새) | 동기화 훅 · 생성 파일 보호 훅 |
| `scripts/hooks/*.sh` | 루트를 `HARNESS_ROOT` 환경변수 우선으로 |
| `session-start.sh` · `session-context.py` | 고정 ≤ 1,024 · 단위 ≤ 1,024 · 상태 ≤ 512. 세션 시작 등록 · 대기함을 상태 예산 안으로. 공지는 제목 + 경로 |
| `scripts/harness/projection.json` | `claudeSettings.hooks` · `kiroWriteHooks` 를 지우고 `hookMap`(추상 이벤트 · 도구 → 하네스) · `kiroCoordinator`(조율 에이전트 본문)를 둔다 |
| `projection_hooks.py`(새) · `projection_wants.py` · `projection_merge.py` / TS `projection/hooks.ts`(새) · `adapters/*` · `projection/merge.ts` | hooks.json → Claude settings(merge) · Codex `.codex/hooks.json`(merge, 새 종류 `codex-hooks`) · Kiro IDE `.kiro/hooks/<id>.json`(render) · Kiro 조율 에이전트 `.kiro/agents/<slug>.json`(render) · Kiro 역할 에이전트 `hooks` |
| `projection.py sync --changed <경로>…`(HK-13) | `.agents/hooks.json` · `model-policy.json` 이 바뀌면 `settings` · `codex-hooks` 병합도 다시 한다 |
| 지우는 템플릿 | `codex/hooks.json`, `kiro-hooks/*.json` 5개, `kiro-agents/__PROJECT_SLUG__.json` |
| `packages/templates/UPGRADE.md`(새) | 버전별 공지 원본(`## 2.0.0`, 절마다 800자 이하). 대상 리포로 복사하지 않는다(층 폴더 밖) |
| CLI `update` · `doctor` / `update.sh` | 공지 쓰기 · 지우기, 만료 알림 |

## 2. hooks.json

설계 03 §3.4 의 형식을 그대로 쓴다. 더한 필드:

| 필드 | 규칙 |
|---|---|
| `title` | Kiro IDE 훅 `name`(사람이 보는 이름). 없으면 id |
| `maxOutputBytes` | 디스패처가 표준 출력을 이 바이트에서 줄 경계로 자른다. 없으면 자르지 않는다(PreToolUse JSON 등) |
| `subagents` | `true` 면 Kiro 쓰기 역할 에이전트 파일의 `hooks` 에도 넣는다(Claude · Codex 하위 에이전트는 프로젝트 훅을 그대로 받는다) |

검사(Python · TS 같은 규칙): `schema` = `harness-kit.hooks/v1`, id 는 `^harness-[a-z0-9-]+$` 이고 하나, `event` 는 §3 표의 값, `tools` 는 `write` · `shell`, `script` 는 `scripts/` 아래 상대 경로(`..` 없음), `env` 값은 하네스 → 문자열, `env` 키는 대문자 · 숫자 · `_`, 모델 환경변수 금지(12 §3.1). 어기면 배치 계획을 세우지 않는다(`ProjectionError` · exit 4). 파일이 없으면 킷 훅을 원하지 않는 것으로 보고 `hooks-missing` 오류 finding 을 낸다(`repair` 가 되살린다).

킷 원본 hooks.json(이 판):

| id | event | tools | script | 하네스 | 비고 |
|---|---|---|---|---|---|
| `harness-session-start` | session-start | | session-start.sh | 전부 | `env.HX_HARNESS` 하네스 이름, `maxOutputBytes` 2,560 |
| `harness-protect-sources` | pre-tool | write | protect-sources.sh | 전부 | floor, subagents |
| `harness-protect-generated` | pre-tool | write | protect-generated.sh | 전부 | subagents |
| `harness-block-full-verify` | pre-tool | shell | block-full-verify.sh | 전부 | floor |
| `harness-protect-approvals` | pre-tool | write · shell | protect-approvals.sh | 전부 | floor, subagents |
| `harness-sync-projection` | post-tool | write | sync-projection.sh | 전부 | subagents, `maxOutputBytes` 200 |
| `harness-session-prompt` | user-prompt | | session-register.sh | claude | `maxOutputBytes` 512 |
| `harness-verify-gate` | stop | | verify-gate.sh | 전부 | floor, `env.HARNESS_VERIFY_FAIL_EXIT.kiro` = 1 |
| `harness-session-idle` | stop | | session-register.sh | 전부 | |
| `harness-session-end` | session-end | | session-register.sh | claude | |

- HK-17 의 `harness-session-register`(SessionStart)는 없앤다. 세션 시작 등록 · 대기함 소비를 `session-start.sh` 가 상태 예산 안에서 한다(§6). 같은 이벤트의 훅은 동시에 돌아 순서가 없으므로, 대기함 → 세션 · 점유 → 공지 순서(03 §3.11)를 지키려면 한 프로세스가 내야 한다.
- `harness-role-readonly` · `harness-worktree-*`(03 §3.4 예시)는 이 이슈에 넣지 않는다(역할 · worktree 운영은 HK-15 · 역할 설계 몫).

## 3. 하네스별 만들기

| 추상 | Claude | Codex | Kiro IDE | Kiro CLI |
|---|---|---|---|---|
| session-start | SessionStart | SessionStart | SessionStart | agentSpawn |
| user-prompt | UserPromptSubmit | — | — | — |
| pre-tool | PreToolUse | PreToolUse | PreToolUse | preToolUse |
| post-tool | PostToolUse | PostToolUse | PostToolUse | postToolUse |
| stop | Stop | Stop | Stop | stop |
| session-end | SessionEnd | — | — | — |
| 도구 write | `Write\|Edit\|MultiEdit\|NotebookEdit` | `apply_patch\|Bash` | `fs_write\|fs_append\|str_replace\|delete_file\|edit_code\|semantic_rename\|smart_relocate` | `write` |
| 도구 shell | `Bash` | `Bash` | `execute_bash\|executeBash\|shell` | `shell` |

- 표는 `projection.json` `hookMap` 에 둔다(새 하네스는 열 하나). Codex 의 write 는 v1 템플릿 그대로 `apply_patch|Bash` 다(Codex 는 셸로도 파일을 쓴다). 여러 도구는 `|` 로 이어 붙이고 겹치는 이름은 한 번만 쓴다. Kiro CLI matcher 는 도구 하나만 받으므로 도구마다 항목을 하나씩 만든다.
- Codex · Kiro 의 user-prompt · session-end 는 이벤트 이름을 확인하지 못했다(03 §6). 비워 두고 확인되면 표에 더한다.
- 명령(모든 하네스가 디스패처를 부르고 명령 안에 ` harness-<id> ` 가 든다):

```text
Claude  [ENV ]bash "$CLAUDE_PROJECT_DIR"/scripts/hooks/dispatch.sh <id> <script>
그 밖   [ENV ]bash -c 'r="$PWD"; while [ "$r" != / ] && [ ! -f "$r/.agents/harness-kit.json" ] && [ ! -f "$r/.agents/harness.json" ]; do r="$(dirname "$r")"; done; [ -f "$r/scripts/hooks/dispatch.sh" ] || exit 0; exec bash "$r/scripts/hooks/dispatch.sh" "$1" "$2"' _ <id> <script>
```

`ENV` 는 그 하네스의 `env` 값을 `KEY=VALUE ` 로 hooks.json 순서대로 붙인다.

| 대상 | 방식 | 내용 |
|---|---|---|
| `.claude/settings.json` | merge(`settings`, HK-13) | 원하는 훅 목록만 hooks.json 에서 온다. 그룹 · 알고리즘 · lock 키(`hooks.<이벤트>:<id>`)는 그대로. `timeout` = `timeoutSec` |
| `.codex/hooks.json` | merge(`codex-hooks`, 새) | settings 의 hooks 부분과 같은 알고리즘. 최상위 `hooks` 밖 키는 두고, 파일이 없으면 만들고 `createdByKit` |
| `.kiro/hooks/<id>.json` | render | `{version: "v1", hooks: [{name, trigger, description, matcher?, action: {type: "command", command, timeout}}]}`. 원본 `.agents/hooks.json` |
| `.kiro/agents/<PROJECT_SLUG>.json` | render | `kiroCoordinator`(토큰 치환) + `hooks`(Kiro CLI 열, `timeout_ms`). 원본 `.agents/hooks.json` |
| `.kiro/agents/<역할>.json`(쓰기 역할) | render(HK-13) | `hooks.preToolUse` · `postToolUse` = `subagents: true` 항목의 Kiro CLI 형태(지금 `kiroWriteHooks` 자리) |

킷 항목 판정(병합 · 빼기): 명령에 ` harness-<소문자 · 숫자 · ->` 토큰이 있거나(HK-13 `TOKEN`), 명령이 킷 스크립트(`scripts/hooks/<이름>.sh`)나 `_ <이름>.sh` 로 끝난다(v1 · HK-13 판 명령). 스크립트 이름은 hooks.json 의 script 와 옛 이름 목록(`session-start.sh` · `session-register.sh` · `protect-sources.sh` · `block-full-verify.sh` · `protect-approvals.sh` · `verify-gate.sh`)이다.

모듈 훅: `module` 값이 있는 항목은 메타의 modules 에 그 모듈이 있을 때만 만든다(R2.3). 이 판의 모듈은 훅이 없다.

## 4. 디스패처 · 루트(03 §3.10)

`dispatch.sh <id> <script>`:

1. 입력을 읽는다(터미널이면 빈 입력).
2. `hook_root.py --fallback <자기 루트> --hook <id>` 가 입력 JSON 을 읽어 네 줄을 낸다: 루트, worktree 여부(0 · 1), 메인 루트, 그 훅의 `maxOutputBytes`(없으면 0). 실패하면 자기 루트 · 0 · 자기 루트 · 0.
3. 스크립트는 `<루트>/<script>`, 없으면 `<자기 루트>/<script>`(옛 브랜치 worktree). 둘 다 없으면 exit 0.
4. `HARNESS_ROOT` · `HARNESS_HOOK_ID` · `HARNESS_WORKTREE` · `HARNESS_MAIN_ROOT` 를 넘겨 부르고 표준 출력을 받는다. 표준 오류 · 종료 코드는 그대로 넘긴다.
5. `maxOutputBytes` 가 0 보다 크고 출력이 넘으면 그 안의 마지막 줄바꿈까지 자른다.
6. **메인 루트**의 `.agents/state/hook-output.jsonl` 에 `{"at","event","hook","bytes","truncated","exit"}` 한 줄을 덧붙인다(내용 없음, 06 §3.18). worktree 세션도 한 곳에 모은다(세션 목록과 같은 자리). `.agents/state` 가 없으면 만들지 않고 건너뛴다(세션 시작 등록이 0700 으로 만든다). 파일이 256KiB 를 넘으면 마지막 1,000줄만 남긴다.

`hook_root.py` 판정은 03 §3.10 그대로다: `cwd` 가 절대경로 폴더면 시작점, 위로 올라가며 `.agents/harness.json` 이나 `.agents/harness-kit.json` 이 있는 첫 폴더, 못 찾으면 fallback(stderr 한 줄). `git rev-parse --git-dir` 과 `--git-common-dir` 이 다르면 worktree.

스크립트 쪽: `session-start.sh` · `protect-sources.sh` · `verify-gate.sh` · `session-register.sh` 의 루트를 `HARNESS_ROOT="${HARNESS_ROOT:-<스크립트 위치>}"` 로 바꾼다. 사람이 직접 불러도 지금처럼 돈다. `block-full-verify.sh` · `protect-approvals.sh` 는 판정이 루트와 무관하다(그대로).

## 5. 동기화 · 생성 파일 보호(03 §3.12)

- `hook_paths.py`: 입력의 `tool_input` 경로 키(`file_path` · `notebook_path` · `path` · `targetFile` · `sourcePath` · `destinationPath`)와 `command` · `patch` · `input` 의 `*** Add|Update|Delete File|Move to:` 줄에서 경로를 뽑아 하네스 루트 상대 경로로 낸다(`cwd` 기준, 루트 밖은 버린다).
- `sync-projection.sh`: 경로 중 `.agents/skills/` · `.agents/rules/` · `.agents/roles/` 아래나 `.agents/hooks.json` · `.agents/model-policy.json` 이 없으면 Python 배치를 띄우지 않고 끝낸다(0바이트). 있으면 `python3 scripts/harness/projection.py sync --root <루트> --changed <경로>…`(그 원본의 대상만 다시 만들고 lock 해시를 고친다). 성공 출력 0바이트, 실패하면 한 줄(200바이트 이하) + exit 0(훅이 턴을 막지 않는다. 남은 어긋남은 fast 검증의 `stale` 이 잡는다).
- `protect-generated.sh` → `protect_generated.py`: lock 의 킷 `mirror` · `render` 항목(폴더 mirror 는 그 아래 전부)과 경로가 겹치면 exit 2 와 `차단: <경로> 는 생성 파일이다. 원본 <from> 을 고친다(고친 뒤 동기화 훅이 다시 만든다).` setup.sh 판 lock(v1 TSV)의 배치 줄에는 원본이 없어 지금 원본에서 원하는 작업을 다시 세워 원본을 찾는다. lock 이 없으면 통과.
- 입력에 `.claude/` · `.codex/` · `.cursor/` · `.kiro/` 가 없으면 Python 을 띄우지 않는다(protect-approvals 와 같은 빠른 길).

## 6. 세션 시작 출력(R5 · 12 §3.8)

`session-start.sh` 가 세 부분을 차례로 낸다:

| 부분 | 상한 | 넘으면 |
|---|---|---|
| 고정 안내 | 1,024바이트 | 시험이 막는다(지금 1,414 → 줄인다) |
| 단위 안내 `.agents/session-context.md` | 1,024바이트 | 줄 경계에서 자르고 `…(이하 생략: .agents/session-context.md)` |
| 바뀌는 상태 | 512바이트 | `session-context.py --event session-start --budget 512` 가 줄 단위로 넣는다 |

상태 줄 순서(03 §3.11): 대기함(세션 등록 · 소비 결과) → 세션 점유 → 세션 공지(UNTRUSTED) → 업그레이드 공지 제목 → 미등록 안내 → 업그레이드 공지 본문. 줄이 남은 예산에 안 들어가면 짧은 꼴(`점유 N건 · 확인: python3 scripts/session-coordination.py context`)을 넣고, 그것도 안 되면 뺀다. 디스패처의 `maxOutputBytes` 2,560 은 안전망이다.

- 등록 · 소비: `session-start.sh` 가 입력을 `session-register.py --event start` 에 넘기고 그 출력(대기함 세 줄, 평소 0바이트)을 상태 맨 앞에 둔다. 등록 실패는 세션 시작을 막지 않는다.
- 업그레이드 공지(R4): `expires` 가 오늘 이후일 때만. 제목 한 줄 `하네스 업데이트 <from> → <to> · 읽을 것: .agents/harness-upgrade-notice.md`, 본문 줄은 예산이 남을 때만 앞에서부터. 지금의 12,000자 통째 싣기를 없앤다.

## 7. 업그레이드 공지 만들기(03 §3.11)

- `packages/templates/UPGRADE.md`: `## <버전>` 절. 절마다 800자 이하(시험).
- `update` 가 킷 판을 올릴 때(`meta.kitVersion` < 새 판) `from` 초과 `to` 이하 절을 판 순서로 모아 `.agents/harness-upgrade-notice.md` 를 쓴다(머리 `kitFrom` · `kitTo` · `date` · `expires = date + 30일`, 본문 `# 하네스 업데이트 <from> → <to>` + 절 내용). 모을 절이 없으면 쓰지 않는다.
- 판 비교: `x.y.z` 정수 셋으로 하고 `-` · `+` 뒤 꼬리는 뗀다. `2.0.0-alpha.0` 으로 올린 사람도 `## 2.0.0` 절을 받고, 같은 판 안(alpha.0 → alpha.1)에서는 다시 받지 않는다. 이전 판을 못 읽으면(`unknown`) 쓰지 않는다.
- 모을 절이 있으면 킷 공지를 새로 쓴다(이전 킷 공지를 바꾼다). 모을 절이 없으면 **만료된** 킷 공지만 지운다(만료 전 공지는 둔다). 사람이 만든 공지(머리에 `kitFrom` · `kitTo` 가 없는 파일)는 쓰지도 지우지도 않는다(`keep-human`). lock 에 넣지 않는다(update 마다 바뀌는 상태 파일). `--dry-run` 은 판정만 낸다.
- `doctor`: 공지가 만료됐으면 정보 한 줄 `upgrade-notice-expired`.
- `uninstall`: 킷이 쓴 공지를 지운다(사람이 만든 공지는 둔다).
- `update.sh`(bash)도 같은 규칙 · 바이트로 쓴다(킷 판 `scripts/harness/upgrade_notice.py` 를 부른다). 날짜는 CLI 와 같은 `today`(시험은 `HARNESS_KIT_TODAY`). 단, 두 경로의 새 판 값이 다르다 — `update.sh` 는 `plugin.json` 판(지금 1.0.8), CLI 는 패키지 판(지금 2.0.0-alpha.0)이다. 그래서 공지 함수 동일성은 같은 입력 fixture 로 묶고(`notice.test.ts` 가 Python 을 부른다), 트리 동일성 시험에서는 공지 파일을 비교에서 뺀다. 판 값은 릴리스 스크립트(HK-22)가 하나로 맞춘다.

## 8. 이전(v1.0.8 · HK-13 판 설치본)

- `.codex/hooks.json` · `.kiro/hooks/harness-*.json` · `.kiro/agents/<slug>.json` 은 lock 에 copy 항목으로 있다. 새 계획에서 copy 가 없어지고 같은 경로를 배치가 가져가므로 HK-13 의 claim 흐름을 탄다: 고치지 않은 파일은 새 결과로 바뀌고, 사람이 고친 파일은 `.codex/hooks.json`(merge)이면 킷 항목만 바뀌고 나머지는 남는다. render 대상(Kiro)은 고쳤으면 `.new`.
- 옛 `.kiro/hooks/harness-session-context.json` 은 새 계획에 없다(id 가 `harness-session-start`). copy 지우기 규칙(고치지 않았으면 지우고 고쳤으면 남긴다)을 따른다.
- `.claude/settings.json` 의 옛 킷 항목(HK-13 판 명령)은 스크립트 이름으로 킷 항목으로 판정해 새 명령으로 바꾼다. 다른 도구 항목과 순서는 그대로다.

## 9. 시험

| 시험 | 내용 |
|---|---|
| `packages/cli/test/projection-hooks.test.ts`(새) | hooks.json 검사 · 하네스별 만들기 · env · 도구 합치기 · 모듈 거르기 · 공용 fixture 기대값 |
| `tests/harness_scripts/test_projection_hooks.py`(새) | 같은 fixture 를 Python 으로. 두 결과가 기대 파일과 바이트로 같다 |
| `packages/cli/test/projection-merge.test.ts` | settings 기대값이 디스패처 명령 · timeout 으로, `codex-hooks` 병합 · 빼기 · 다른 도구 항목 순서 보존(03 §5 #6) |
| `tests/harness_scripts/test_dispatch.py`(새) | 메인 + worktree fixture 에서 `CLAUDE_PROJECT_DIR=<메인>`, 입력 `cwd=<worktree>`: 보호 경로 쓰기 exit 2, Stop 훅의 가짜 `verify.sh` 가 기록한 작업 폴더가 worktree(03 §5 #3). 출력 자르기 · hook-output.jsonl(내용 없음) · 옛 브랜치 worktree 대체 · 루트 못 찾음 |
| `tests/harness_scripts/test_sync_projection.py`(새) | `.agents/skills/hx-plan/SKILL.md` Edit 입력 → 복사본이 원본과 같은 바이트, lock 해시 바뀜, 출력 0바이트. 생성 파일 Edit 입력 exit 2 + 원본 경로. 원본 밖 경로는 Python 을 띄우지 않는다(03 §5 #5) |
| `tests/harness_scripts/test_session_start_budget.py`(새) | 고정 ≤ 1,024, 단위 2,000바이트 → 1,024 이하로 잘림, 점유 50건 · 대기함 · 공지가 함께 있어도 상태 ≤ 512 · 합계 ≤ 2,560, 공지 만료 전후(03 §5 #7) |
| 공지 | CLI `update` 가 공지를 쓰고 `update.sh` 와 바이트가 같다, 다음 update 가 지운다, doctor 만료 알림 |
| 기존 | `test_install` · `test_cli_parity` · `test_projection_upgrade` · `test_session_register` · `test_dispatch_inbox` · `test_protect_approvals` · `block_full_verify` 시험이 새 체계에서 통과(R6) |

## 10. 토큰

- 세션 시작 출력: 고정 안내를 1,414 → 1,024바이트 이하로 줄이고, 공지 통째 싣기(최대 12,000자)를 제목 한 줄로 바꾼다. 합계 상한 2,560 을 훅이 지킨다.
- 새 훅(동기화 · 생성 파일 보호)은 성공 때 0바이트다. hook-output.jsonl 은 세션에 실리지 않는다.
- 훅 한 번에 Python 프로세스(`hook_root.py`)가 하나 더 뜬다. 시간 비용이고 토큰 비용은 0이다.

## 11. 확인 필요

- Codex · Kiro 의 user-prompt · session-end 이벤트 이름(03 §6). 확인되면 `hookMap` 에 더한다.
- Codex PreToolUse 입력에 `cwd` 가 있는지, Kiro 훅 입력 형식(03 §6). 없으면 `hook_root.py` 는 `$PWD` 를 쓴다.
- 살아 있는 세션에서 worktree Stop 훅이 그 worktree 를 검증하는지(수동, 03 §5 #3 의 실제 확인).
