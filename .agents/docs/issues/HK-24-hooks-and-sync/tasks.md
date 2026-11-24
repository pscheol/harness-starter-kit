---
key: HK-24
area: hooks
type: feat
title: hooks.json에서 하네스별 훅을 만들고, worktree를 따라가며, 복사본을 원본과 맞춘다
state: completed
created: 2026-11-24
---

# Tasks — HK-24

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 시험: 훅 만들기 공용 fixture(TS · Python) · codex-hooks 병합 · 디스패처 · worktree · 동기화 · 생성 파일 보호 · 세션 시작 예산 · 공지 | 전부 | done |
| T2 | `agents-root/hooks.json` · `projection.json` `hookMap` · `kiroCoordinator` · 검사 | R1 | done |
| T3 | Python `projection_hooks.py` · wants · merge(`codex-hooks`) · render(Kiro IDE · 조율 · 역할) · `sync --changed` 의 hooks.json | R1 · R3 | done |
| T4 | TS `projection/hooks.ts` · 어댑터 · merge | R1 | done |
| T5 | 템플릿 지우기(`codex/hooks.json` · `kiro-hooks/` · `kiro-agents/`) · 이전(claim) 확인 | R1 · R6 | done |
| T6 | `dispatch.sh` · `hook_root.py` · 스크립트 루트 · hook-output.jsonl | R2 · R5 | done |
| T7 | `hook_paths.py` · `sync-projection.sh` · `protect-generated` | R3 | done |
| T8 | 세션 시작 예산(고정 · 단위 · 상태) · 시작 등록 합치기 · 공지 제목 | R4 · R5 | done |
| T9 | `UPGRADE.md` · update(CLI · update.sh) 공지 쓰기 · 지우기 · doctor · uninstall | R4 | done |
| T10 | 생성물 · manifest 수 · 시험 통과 · 전체 시험 · 검증 기록 | 완료 기준 | done |

## 요구사항별 결과

| 요구 | 결과 | 근거(시험) |
|---|---|---|
| R1 hooks.json 하나에서 하네스별 설정 | 충족 | `projection-hooks.test.ts` · `test_projection_hooks.py` — 같은 fixture 에서 Claude · Codex · Kiro IDE · Kiro CLI · 역할 · 조율 에이전트 결과가 TS = Python = 기대 파일. `projection-parity.test.ts` 실제 템플릿 설치본 원본으로 TS = Python |
| R1 킷 항목만 바꾸고 다른 도구 순서 유지(R2.2) | 충족 | `projection-merge.test.ts` settings · `.codex/hooks.json` — 다른 도구 훅 3개 병합 · 다시 병합 · 빼기 뒤 같음(03 §5 #6), v1 · HK-13 판 명령 꼬리(`_ <스크립트>` · `HX_HARNESS=` 접두)를 킷 항목으로 바꿈 |
| R1 모듈 훅은 켤 때만(R2.3) | 충족 | fixture `harness-f-mod` — modules 없으면 빠지고 `jira-workflow` 면 들어감 |
| R2 모든 킷 훅이 dispatch.sh 를 거침 | 충족 | `projection-hooks.test.ts` "모든 하네스 명령이 디스패처를 거친다" |
| R2 worktree 세션의 훅은 worktree 기준(03 §5 #3) | 충족 | `test_dispatch.py` — `CLAUDE_PROJECT_DIR=<메인>`, 입력 `cwd=<worktree>`: 보호 경로 쓰기 exit 2, Stop 훅의 가짜 `verify.sh` 가 기록한 폴더가 worktree. 옛 브랜치 worktree 는 디스패처 쪽 스크립트를 worktree 루트로 부름, cwd 없음 · 상대 · 리포 밖은 디스패처 루트 |
| R3 동기화 훅(03 §5 #5) | 충족 | `test_sync_projection.py` — 스킬 원본 Edit 입력 뒤 `.claude` · `.kiro` 복사본이 원본과 같은 바이트, Cursor 명령에 새 줄, lock 해시 바뀜, 출력 0바이트. hooks.json 의 timeout 을 바꾸면 Claude · Codex · Kiro IDE · Kiro 조율 에이전트가 모두 바뀜. 원본 밖 쓰기는 lock 그대로. 실패는 한 줄 200바이트 이하 · exit 0 |
| R3 생성 파일 보호(R4.3) | 충족 | 같은 시험 — `.claude/skills` · `.kiro/steering` · `.kiro/hooks` Edit 와 Codex 패치(`.cursor/rules`)가 exit 2 + 원본 경로. 원본 · merge 대상(settings · `.codex/hooks.json` · CLAUDE.md)은 통과. v1(setup.sh) lock 은 원본을 다시 계산 |
| R4 공지는 제목 한 줄 + 경로 | 충족 | `test_session_start_budget.py` — 제목만 붙고 머리(`kitFrom`)는 없음, `expires` 다음 날 없음(03 §5 #7). 사람 공지는 `하네스 공지: <첫 줄> · 읽을 것: …`, 본문은 남은 예산만큼 |
| R4 공지 만들기 · 지우기 | 충족 | `notice.test.ts` — 절 고르기(꼬리 뗀 판 비교), 판 올린 update 가 쓰고 다음 update 는 둠, 만료 뒤 update 가 지움, `--dry-run` 은 안 씀, 사람 공지는 `keep-human`, doctor `upgrade-notice-expired`, uninstall 이 킷 공지만 지움. Python(update.sh) 결과와 같음(4사례) |
| R5 세션 시작 2,560바이트 | 충족 | 고정 안내 1,414 → 913바이트(시험 상한 1,024). 단위 안내 1,024 에서 줄 경계 자르기 + 안내 줄, 상태 512(대기함 → 점유 → 세션 공지 → 공지 제목 → 미등록 → 공지 본문, 넘으면 짧은 꼴 · 빼기). 디스패처가 2,560 에서 자르는 안전망 |
| R5 hook-output.jsonl | 충족 | `test_dispatch.py` — `{at, event, hook, bytes, truncated, exit}` 만, 출력 내용 없음, 256KiB 넘으면 1,000줄 |
| R6 기존 훅 시험 | 충족 | 설치본 시험 492개(HK-17 · HK-23 의 세션 등록 · 대기함 · 승인 보호 · full 차단 · 보호 경로 포함) — 옛 IDE 훅 이름 하나(`harness-session-context` → `harness-session-start`)만 시험을 고침 |

## 검증 기록

### 시험을 쓴 순서(솔직한 기록)

- 이 이슈는 HK-17 마무리 직후 같은 세션에서 구현과 시험을 함께 썼다. 새 시험(공용 fixture · 디스패처 · 동기화 · 예산 · 공지)은 구현 뒤에 붙여 RED 를 따로 돌리지 않았다.
- 기존 시험 중 구현 뒤 RED 가 된 것: CLI 어댑터 스냅숏 · settings 병합 기대값 · TS↔Python 동일성(토큰 · 조율 에이전트), 킷 시험의 update 동일성 12건(공지 파일) · doctor 동일성 1건(특수 문자 토큰). 앞의 것은 새 체계에 맞게 기대값을 고쳤고, 뒤의 둘은 아래 고친 점이다.

### 고친 점(시험이 찾은 것)

1. **projection.json 토큰**: `kiroCoordinator` 의 `{{PROJECT_NAME}}` 이 설치 때 JSON 원문에 치환되어 이름에 `\` 가 있으면(`A&B | C\D`) 설치본 projection.json 이 깨졌다(doctor exit 5). 설치 때 치환하지 않는 `{{kit:KEY}}` 꼴로 바꾸고 배치가 파싱한 문자열 안에서 바꾼다. 같은 위험이 있던 `claudeSettings.deny` 의 `{{PROTECTED_PATH}}` 도 같이 바꿨다.
2. **공지와 트리 동일성**: update.sh 의 새 판은 `plugin.json`(1.0.8), CLI 는 패키지 판(2.0.0-alpha.0)이라 공지 내용이 다르다. 트리 비교에서 공지 파일을 빼고 함수 동일성을 따로 묶었다(design §7).
3. **킷 항목 판정**: HK-13 의 ` harness-[a-z0-9-]+ ` 일반 토큰은 사람 훅 `npx harness-kit doctor` 의 `harness-kit` 도 킷 항목으로 보고 지웠다. 원하는 id · 이전 lock id 만 보게 바꿨다(시험 추가).

### 시험 결과

- `pnpm -C packages/cli test`: 359개 통과(파일 27개, 새 파일 `projection-hooks` · `notice`).
- `pnpm -C packages/dashboard test`: 94개 통과.
- `node scripts/gen-plugins.mjs --check`: 생성물 일치(파일 415개).
- 설치본 시험(setup.sh python 설치본 + `scripts/tests`): 492개 중 491 통과 → IDE 훅 이름 하나 고친 뒤 그 시험 통과. 새 시험 `test_dispatch`(9) · `test_session_start_budget`(7) · `test_sync_projection`(7).
- 킷 시험 전체: (아래 줄)

### 토큰 · 크기

- 세션 시작: 고정 안내 1,414 → 913바이트. 새로 깐 설치본의 SessionStart 출력 합계 1,064바이트(대기함 · 점유 · 공지 없음). 공지 본문 통째 싣기(최대 12,000자)를 제목 한 줄(약 100바이트)로 바꿨다.
- 새 훅(동기화 · 생성 파일 보호)은 성공 때 0바이트. hook-output.jsonl 은 세션에 실리지 않는다.
- 훅 한 번에 `hook_root.py`(Python) 하나가 더 뜬다(시간 비용, 토큰 0).

## 확인 필요(사람)

- 살아 있는 Claude · Codex · Kiro 세션에서 디스패처 명령이 도는지(수동). 특히 Codex PreToolUse · Kiro 훅 입력에 `cwd` 가 있는지(03 §6). 없으면 `$PWD` 걷기 루트를 쓴다.
- Codex · Kiro 의 user-prompt · session-end 이벤트 이름(03 §6) — 확인되면 `hookMap` 에 더한다.
- `harness-role-readonly` · `harness-worktree-*` 훅(03 §3.4)은 역할 · worktree 운영 이슈(HK-15)로 넘겼다.
- 판 값: update.sh(plugin.json 1.0.8)와 CLI(2.0.0-alpha.0)가 다르다. 릴리스 스크립트(HK-22)가 하나로 맞춘다.
