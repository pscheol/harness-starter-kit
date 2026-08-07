#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — 얇은 트리거, 치환 없이 사용 가능.
#
# Stop hook: 리포 검증 스크립트가 있으면 fast 레벨로 호출한다(없으면 no-op).
# 강제 로직은 리포 scripts/verify.sh 하나에만 둔다. 이 hook 은 트리거 + 어댑터일 뿐이다.
# scripts/verify.sh 가 생기는 순간 자동으로 활성화된다.
#
# 이 hook 이 지키는 3가지 — 모두 "Stop hook 은 턴이 끝날 때마다 실행된다"는 성질에서 온다:
#   1. 재진입 방지 — 자신이 유발한 후속 턴에서 다시 돌지 않는다(stop_hook_active).
#   2. 시간 상한   — 게이트가 오래 걸려도 세션을 붙잡지 않는다(HARNESS_VERIFY_TIMEOUT).
#   3. 피드백      — 실패 출력을 stderr 로 넘기고 exit 2 로 알려 에이전트가 고치게 한다.
set -uo pipefail

# hook payload(JSON)를 읽어 stdin 을 비운다.
# 게이트가 stdin 을 상속한 채 입력을 기다리며 매달리는 상황을 막는 목적도 겸한다.
payload="$(cat 2>/dev/null || true)"

# 1) 재진입 방지 — exit 2 로 막은 뒤 이어진 턴에서 또 막으면 같은 자리를 무한히 맴돈다.
case "$payload" in
  *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;;
esac

# 아직 검증 스크립트 없음 → 통과
[ -x "scripts/verify.sh" ] || exit 0

# 2) 시간 상한.
# Stop hook 의 기본은 fast 레벨이다. 전체 빌드·테스트는 pre-push(pre-commit)와 CI 가 책임진다.
# 턴마다 전체 게이트를 돌리면 빌드 도구 프로세스가 겹쳐 lock 경합으로 무한 대기에 빠진다.
limit="${HARNESS_VERIFY_TIMEOUT:-120}"
level="${HARNESS_VERIFY_LEVEL:-fast}"

work="$(mktemp -d 2>/dev/null || echo "/tmp/harness-verify.$$")"
mkdir -p "$work"
out="$work/out"; timedout="$work/timedout"
trap 'rm -rf "$work"' EXIT

if command -v timeout >/dev/null 2>&1; then to=timeout
elif command -v gtimeout >/dev/null 2>&1; then to=gtimeout
else to=""; fi

if [ -n "$to" ]; then
  HARNESS_VERIFY_LEVEL="$level" "$to" -k 5 "$limit" bash scripts/verify.sh </dev/null >"$out" 2>&1
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
    HARNESS_VERIFY_LEVEL="$level" bash scripts/verify.sh </dev/null >"$out" 2>&1 &
    pid=$!
    set +m
    (
      sleep "$limit"
      : >"$timedout"
      kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
      sleep 5
      kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
    ) &
    watchdog=$!
    wait "$pid"; rc=$?
    kill "$watchdog" 2>/dev/null
    wait "$watchdog" 2>/dev/null
  } 2>/dev/null
fi

# 타임아웃은 게이트 실패로 보지 않는다 — 막아 봐야 원인이 코드에 있지 않다.
if [ -e "$timedout" ]; then
  echo "⚠ 검증 게이트가 ${limit}s 를 초과해 중단했다. 'bash scripts/verify.sh' 를 직접 실행해 확인하라." >&2
  exit 0
fi

if [ "$rc" -ne 0 ]; then
  cat "$out" >&2   # stderr 로 넘겨야 에이전트가 실패 내용을 읽는다.
  exit 2           # exit 2 = 턴을 막고 수정을 요구한다.
fi

exit 0
