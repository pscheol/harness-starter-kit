#!/usr/bin/env bash
# Claude WorktreeCreate 훅(설계 05 §3.13). 디스패처가 부른다. 표준 입력 JSON(name · cwd · session_id)으로 worktree 를 만들고
# 표준 출력 마지막 줄에 절대경로를 낸다. 진행 메시지 · 오류는 표준 오류다. 실패하면 exit 1. 모델을 부르지 않는다.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v python3 >/dev/null 2>&1 || { echo "python3 가 없어 worktree 를 만들지 못한다" >&2; exit 1; }
exec python3 -B "$here/../harness/worktree.py" hook-create
