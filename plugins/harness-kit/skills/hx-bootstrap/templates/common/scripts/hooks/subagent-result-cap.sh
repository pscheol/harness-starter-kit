#!/usr/bin/env bash
# 위임 결과 크기 상한(설계 12 §3.8 · MR-R10). Claude SubagentStop 에서 디스패처(dispatch.sh)가 부른다.
# 위임 역할의 마지막 응답이 limits.subagentResultMaxChars(기본 6,000자)를 넘으면 exit 2 와 한 줄로 끝내기를 막는다.
# 통과면 출력 0바이트. 하네스가 넘긴 그 위임 기록 경로만 읽고 다른 대화 기록은 열지 않는다. 모델을 부르지 않는다.
set -uo pipefail
HARNESS_ROOT="${HARNESS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
command -v python3 >/dev/null 2>&1 || exit 0
exec python3 -B "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/subagent_result_cap.py" --root "$HARNESS_ROOT"
