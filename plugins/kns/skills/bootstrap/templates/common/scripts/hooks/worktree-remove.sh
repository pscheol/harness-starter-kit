#!/usr/bin/env bash
# Claude WorktreeRemove 훅(설계 05 §3.13). 디스패처가 부른다. 표준 입력 JSON(worktree_path · session_id)으로 끝난 worktree 만 지운다.
# 끝 조건(커밋 · push · 다른 세션)을 못 채우면 이유를 표준 오류에 내고 exit 1(폴더는 남는다). 성공 출력 0바이트. 모델을 부르지 않는다.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v python3 >/dev/null 2>&1 || { echo "python3 가 없어 worktree 를 지우지 못한다" >&2; exit 1; }
exec python3 -B "$here/../harness/worktree.py" hook-remove
