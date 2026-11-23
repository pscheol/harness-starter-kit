#!/usr/bin/env bash
# 턴이 끝날 때(Stop) 해당 세션의 변경 검증(changed)을 부른다. 전체 검증(full)은 CI 가 돈다.
#
# 에이전트 중립이다 — Claude Code, Codex, Kiro가 같은 파일을 부른다.
# 강제 로직은 리포 scripts/verify.sh 하나에만 둔다. 이 파일은 트리거 + 어댑터일 뿐이다.
# scripts/verify.sh 가 생기는 순간 자동으로 활성화된다.
#
# 이 어댑터가 지키는 3가지 — 모두 "Stop hook 은 턴이 끝날 때마다 실행된다"는 성질에서 온다:
#   1. 재진입 방지 — 자신이 유발한 후속 턴에서 다시 돌지 않는다.
#   2. 시간 상한   — 게이트가 오래 걸려도 세션을 붙잡지 않는다(HARNESS_VERIFY_TIMEOUT).
#   3. 피드백      — 실패 출력을 stderr 로 넘기고 실패 코드로 알려 에이전트가 고치게 한다.
#                    실패 코드는 HARNESS_VERIFY_FAIL_EXIT(1 또는 2, 기본 2)다. Claude·Codex 는 2, Kiro V3·IDE 는 1 에서만 이어서 고친다.
set -uo pipefail

# 게이트는 `scripts/verify.sh` 를 상대 경로로 부른다. 에이전트마다 hook 을 실행하는 작업
# 디렉터리가 다르므로(그리고 그것을 보장한다고 문서에 적힌 곳이 없다) 여기서 리포 루트로 맞춘다.
# 맞추지 않으면 verify.sh 를 못 찾고 아래 `-x` 검사에서 조용히 통과한다 — 검증을 돌리지 않은
# 상태가 "통과" 로 보고되는 것이 가장 나쁜 결과다.
cd "$(dirname "$0")/../.." || exit 0
HARNESS_ROOT="$(pwd)"

# hook payload(JSON)를 읽어 stdin 을 비운다.
# 게이트가 stdin 을 상속한 채 입력을 기다리며 매달리는 상황을 막는 목적도 겸한다.
# 터미널에서 직접 부르면 payload 가 없다 — 그때 읽으면 입력을 기다리며 멈춘다.
payload=""
if [ ! -t 0 ]; then payload="$(cat 2>/dev/null || true)"; fi

# 1a) 재진입 방지 — 에이전트가 그 사실을 payload 로 알려주는 경우(Claude Code).
case "$payload" in
  *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;;
esac

# 실제 세션 ID가 없는 호출은 재진입 창을 공유하지 않는다. 빌드 잠금은 하네스별이다.
session_id=""
if [ -f "scripts/hooks/session-context.py" ]; then
  session_id="$(python3 scripts/hooks/session-context.py --root "$HARNESS_ROOT" --event session-id <<<"$payload")"
fi
key="$(printf '%s' "$HARNESS_ROOT" | cksum | cut -d' ' -f1)"
session_key="$(printf '%s:%s' "$HARNESS_ROOT" "$session_id" | cksum | cut -d' ' -f1)"
stamp="${TMPDIR:-/tmp}/harness-verify-gate.$(id -u).$session_key.stamp"
lock="${TMPDIR:-/tmp}/harness-verify-gate.$(id -u).$key.lock"
window="${HARNESS_VERIFY_REENTRY_WINDOW:-90}"
now="$(date +%s)"
if [ -n "$session_id" ] && [ -f "$stamp" ]; then
  last="$(cat "$stamp" 2>/dev/null || echo 0)"
  case "$last" in
    ''|*[!0-9]*) last=0 ;;
  esac
  if [ "$last" -gt 0 ] && [ "$((now - last))" -lt "$window" ]; then
    exit 0
  fi
fi

# 1c) 동시 실행 방지 — Codex 는 리포 루트와 단위의 hook 을 함께 실행하고, 둘이 같은 게이트에
# 닿을 수 있다. mkdir 은 원자적이라 먼저 잡은 쪽만 돈다. 죽은 프로세스가 남긴 잠금은 걷어 낸다.
# pid 가 아직 비어 있으면 막 잠금을 잡은 실행이 있는 것이다. 버려진 잠금은 나이로 판정한다 —
# pid 만 보면 죽은 실행의 pid 를 다른 프로세스가 물려받았을 때 게이트가 영영 꺼진다.
if ! mkdir "$lock" 2>/dev/null; then
  holder="$(cat "$lock/pid" 2>/dev/null || true)"
  locked_at="$(stat -f %m "$lock" 2>/dev/null || stat -c %Y "$lock" 2>/dev/null || echo "$now")"
  if [ "$((now - locked_at))" -lt "$(( ${HARNESS_VERIFY_TIMEOUT:-120} + 30 ))" ] \
    && { [ -z "$holder" ] || kill -0 "$holder" 2>/dev/null; }; then
    echo "↷ 같은 하네스의 검증이 실행 중이라 이번 호출은 생략했다. 이번 호출의 검증 통과를 뜻하지 않는다." >&2
    exit 0
  fi
  rm -rf "$lock"
  mkdir "$lock" 2>/dev/null || exit 0
fi
echo "$$" >"$lock/pid"
if [ -n "$session_id" ]; then echo "$now" >"$stamp" 2>/dev/null || true; fi

# 2) 시간 상한.
# 새 변경 검증기가 배포되기 전에는 기존 fast 검사로 호환한다.
limit="${HARNESS_VERIFY_TIMEOUT:-120}"
level="${HARNESS_VERIFY_LEVEL:-changed}"
gate=(bash scripts/verify.sh)
if [ "$level" = changed ] && [ -f scripts/verify-changed.py ]; then
  if [ -z "$session_id" ]; then
    echo "검증 미완료: 실제 세션 ID를 확인하지 못했다. python3 scripts/verify-changed.py --files <배정한 변경 파일> 로 직접 검증하라. 이번 호출은 통과가 아니다." >&2
    rm -rf "$lock"
    exit 0
  fi
  # --summary: 파일·명령 목록 전체(JSON)를 에이전트 문맥에 싣지 않는다. 전체는 --plan 으로 직접 본다.
  gate=(python3 scripts/verify-changed.py --session "$session_id" --summary)
elif [ "$level" = changed ]; then
  level=fast
fi
if [ ! -f "${gate[1]}" ]; then
  echo "검증 미완료: 검증 스크립트가 없다. 이번 호출은 통과가 아니다." >&2
  rm -rf "$lock"
  exit 0
fi

work="$(mktemp -d 2>/dev/null || echo "/tmp/harness-verify.$$")"
mkdir -p "$work"
out="$work/out"; timedout="$work/timedout"
trap 'rm -rf "$work" "$lock"' EXIT

if command -v timeout >/dev/null 2>&1; then to=timeout
elif command -v gtimeout >/dev/null 2>&1; then to=gtimeout
else to=""; fi

if [ -n "$to" ]; then
  HARNESS_VERIFY_TRIGGER=stop-hook HARNESS_VERIFY_LEVEL="$level" "$to" -k 5 "$limit" "${gate[@]}" </dev/null >"$out" 2>&1
  rc=$?
  [ "$rc" -eq 124 ] && : >"$timedout"
else
  # macOS 기본 환경에는 timeout(coreutils)이 없다. 순수 bash 워치독으로 같은 보장을 만든다.
  # set -m 으로 게이트를 별도 프로세스 그룹에 띄워야 손자 프로세스(gradle·java·pytest)까지
  # 그룹째 정리된다. 게이트만 죽이면 빌드 데몬이 살아남아 다음 실행과 lock 경합을 일으킨다.
  # 블록 전체의 stderr 를 버리는 이유: 게이트 출력은 이미 "$out" 으로 분리돼 있고,
  # 여기 남는 건 bash 의 job 종료 알림("Terminated: 15")뿐이다. 그대로 흘리면
  # 에이전트에게 실패처럼 읽힌다.
  {
    set -m
    HARNESS_VERIFY_TRIGGER=stop-hook HARNESS_VERIFY_LEVEL="$level" "${gate[@]}" </dev/null >"$out" 2>&1 &
    pid=$!
    set +m
    # 워치독의 sleep 이 이 스크립트의 stdout 을 물고 남으면, hook 을 부른 쪽은 출력이 닫히길 기다리며
    # 게이트가 끝난 뒤에도 limit 초를 더 멈춘다. 출력을 버리고, 워치독이 끝날 때 sleep 도 함께 끝낸다.
    (
      sleep "$limit" &
      sleeper=$!
      trap 'kill "$sleeper" 2>/dev/null; exit 0' TERM
      wait "$sleeper" || exit 0
      : >"$timedout"
      kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
      sleep 5
      kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
    ) >/dev/null 2>&1 &
    watchdog=$!
    wait "$pid"; rc=$?
    kill "$watchdog" 2>/dev/null
    wait "$watchdog" 2>/dev/null
  } 2>/dev/null
fi

# 타임아웃은 게이트 실패로 보지 않는다 — 막아 봐야 원인이 코드에 있지 않다.
if [ -e "$timedout" ]; then
  echo "검증 미완료: ${limit}s 를 초과해 중단했다. 이번 호출은 통과가 아니다. python3 scripts/verify-changed.py --files <변경 파일> 로 직접 확인한다. MR 전 범위는 bash scripts/verify.sh --affected 이고, 전체 검증(full)은 CI 가 돈다." >&2
  exit 0
fi

if [ "$rc" -ne 0 ]; then
  cat "$out" >&2   # stderr 로 넘겨야 에이전트가 실패 내용을 읽는다.
  case "${HARNESS_VERIFY_FAIL_EXIT:-2}" in
    1) exit 1 ;;
    *) exit 2 ;;
  esac
fi

exit 0
