---
key: HK-2
area: verify
type: feat
title: 에이전트 세션의 전체 검증(full)을 훅으로 막는다
status: approved
created: 2026-11-23
---

# Design — HK-2

## 파일

| 파일(`packages/templates/common/…`) | 바꿈 |
|---|---|
| `scripts/hooks/block_full_verify.py` | 새로. 판정 · 안내 · 설정 읽기. `--entry-check` 모드는 R2.6의 환경 판정만 한다 |
| `scripts/hooks/block-full-verify.sh` | 새로. 하네스 훅 진입점(다른 훅과 같이 `bash <파일>`로 부른다). stdin을 Python에 넘긴다 |
| `scripts/verify-entry.sh` | full이면 `block_full_verify.py --entry-check`를 먼저 부른다 |
| `claude/settings.json` | `PreToolUse` · matcher `Bash` 항목 추가 |
| `codex/hooks.json` | `PreToolUse` · matcher `Bash` 항목 추가(지금의 상위 탐색 래퍼) |
| `kiro-hooks/harness-block-full-verify.json` | 새로. 셸 도구 matcher(이름은 §확인 필요) |
| `kiro-agents/__PROJECT_SLUG__.json` | `hooks.preToolUse`에 matcher `shell` 항목 추가 |

## 판정(설계 01 §3.2 그대로)

```python
FULL_ENV  = r'(^|[\s;&|(])(export\s+)?HARNESS_VERIFY_LEVEL=["\']?full\b'
FULL_FLAG = r'verify(-entry)?\.sh\b[^;&|\n]*\s--full\b'
FULL_PY   = r'verify-changed\.py\b[^;&|\n]*--level[= ]full\b'
```

- 셸 도구 이름: `Bash`(Claude · Codex) · `shell` · `execute_bash` · `executeBash`(Kiro). `tool_name`이 없으면 셸로 본다(matcher가 이미 거른다).
- 설정: 하네스 루트(스크립트 위치 `../..`)의 `.agents/harness-kit.json`을 JSON으로 읽고 `verify.fullOnlyInCI`가 `false`일 때만 끈다. 파일이 없거나 깨졌으면 기본값 `true`.
- `--entry-check`: 환경 `CI` · `HARNESS_VERIFY_PARENT`가 비어 있고 `CLAUDECODE=1`이고 설정이 켜져 있으면 exit 3과 안내. 그 밖은 exit 0.

## 시험(`tests/harness_scripts/test_block_full_verify.py`, 설치본 안에서 돈다)

- 막음 6종: `bash scripts/verify.sh --full`, `cd x && bash scripts/verify.sh --fast --full`, `HARNESS_VERIFY_LEVEL=full bash scripts/verify.sh`, `export HARNESS_VERIFY_LEVEL=full; bash scripts/verify.sh`, `python3 scripts/verify-changed.py --level full`, `bash scripts/verify-entry.sh --full`.
- 통과 7종: `bash scripts/verify.sh`, `--affected`, `--affected --plan`, `echo --full`, `grep -- --full README.md`, `HARNESS_VERIFY_LEVEL=fullish`(단어 경계), 셸이 아닌 도구(`tool_name: Write`).
- 해석 실패 2종(JSON 오류, command 없음) → 통과.
- `fullOnlyInCI: false` → 통과. 메타 없음 → 막음.
- 안내 문구에 세 명령 줄과 `verify.fullOnlyInCI`가 있고 "--full" 권고가 없다.
- `--entry-check`: `CLAUDECODE=1` → 3, `CI=1` 더하면 0, `HARNESS_VERIFY_PARENT=1` 더하면 0, 표지 없음 → 0.
- 설치본 `bash scripts/verify.sh --full`을 `CLAUDECODE=1`로 부르면 exit 3(본문을 돌지 않는다).
- 등록: 설치본의 Claude · Codex · Kiro 설정 네 곳에 `block-full-verify.sh`가 있다.

## 확인 필요

- Kiro IDE · CLI의 셸 도구 이름(matcher). 틀리면 훅이 돌지 않을 뿐(통과) 다른 동작은 바뀌지 않는다.
