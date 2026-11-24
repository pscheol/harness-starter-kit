#!/usr/bin/env bash
# 모든 킷 훅의 입구(설계 03 §3.10, HK-24 design §4). Claude Code · Codex · Kiro 가 `dispatch.sh <훅 id> <스크립트>` 로 부른다.
#
# 1. 훅 입력의 cwd 로 하네스 루트를 정한다(hook_root.py). worktree 에서 연 세션이면 그 worktree 가 루트다.
# 2. 그 루트의 스크립트를 부른다. 옛 브랜치 worktree 에 스크립트가 없으면 이 디스패처 쪽 스크립트를 쓴다.
# 3. 표준 출력이 그 훅의 maxOutputBytes(hooks.json)를 넘으면 줄 경계에서 자른다. 표준 오류 · 종료 코드는 그대로 넘긴다.
# 4. 메인 루트의 .agents/state/hook-output.jsonl 에 {at, event, hook, bytes, truncated, exit} 한 줄을 남긴다(출력 내용은 적지 않는다).
# 모델을 부르지 않는다.
set -uo pipefail

hook_id="${1:-}"
rel="${2:-}"
payload=""
if [ ! -t 0 ]; then payload="$(cat 2>/dev/null || true)"; fi
self_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

root="$self_root"; worktree=0; main_root="$self_root"; max=0; event="-"
if command -v python3 >/dev/null 2>&1; then
  info="$(python3 -B "$self_root/scripts/hooks/hook_root.py" --fallback "$self_root" --hook "$hook_id" <<<"$payload")" && {
    { IFS= read -r root; IFS= read -r worktree; IFS= read -r main_root; IFS= read -r max; IFS= read -r event; } <<<"$info"
  }
fi
case "$max" in ''|*[!0-9]*) max=0 ;; esac
[ -d "$root" ] || root="$self_root"
[ -d "$main_root" ] || main_root="$root"

case "$rel" in
  scripts/*) ;;
  *) echo "dispatch.sh: 스크립트는 scripts/ 아래 상대 경로다: $rel" >&2; exit 0 ;;
esac
script="$root/$rel"
[ -f "$script" ] || script="$self_root/$rel"
[ -f "$script" ] || exit 0

out="$(HARNESS_ROOT="$root" HARNESS_HOOK_ID="$hook_id" HARNESS_WORKTREE="$worktree" HARNESS_MAIN_ROOT="$main_root" \
  bash "$script" <<<"$payload"; printf '\n%s' "$?")"
rc="${out##*$'\n'}"
out="${out%$'\n'*}"
case "$rc" in ''|*[!0-9]*) rc=1 ;; esac

bytes="$(printf '%s' "$out" | wc -c | tr -d ' ')"
truncated=false
if [ "$max" -gt 0 ] && [ "$bytes" -gt "$max" ]; then
  cut="$(printf '%s' "$out" | head -c "$max"; printf x)"
  cut="${cut%x}"
  case "$cut" in
    *$'\n'*) out="${cut%$'\n'*}"$'\n' ;;
    *) out="" ;;
  esac
  truncated=true
fi
printf '%s' "$out"

log_dir="$main_root/.agents/state"
if [ -d "$log_dir" ] && [ -w "$log_dir" ]; then
  case "$hook_id" in harness-*) ;; *) hook_id="-" ;; esac
  case "$hook_id" in *[!a-z0-9-]*) hook_id="-" ;; esac
  case "$event" in *[!A-Za-z0-9_]*|'') event="-" ;; esac
  log="$log_dir/hook-output.jsonl"
  printf '{"at":"%s","event":"%s","hook":"%s","bytes":%s,"truncated":%s,"exit":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$event" "$hook_id" "$bytes" "$truncated" "$rc" >>"$log" 2>/dev/null || true
  size="$(wc -c <"$log" 2>/dev/null | tr -d ' ')"
  if [ "${size:-0}" -gt 262144 ]; then
    tail -n 1000 "$log" >"$log.hk-tmp" 2>/dev/null && mv "$log.hk-tmp" "$log" 2>/dev/null || rm -f "$log.hk-tmp"
  fi
fi
exit "$rc"
