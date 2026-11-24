#!/usr/bin/env bash
# AI-DLC 산출물이 units.json 보다 새로우면 한 줄을 알린다(설계 10 §3.2 4단계). 새로운 것이 없으면 0바이트.
# 모델을 부르지 않고 AI-DLC 를 실행하지 않는다. 파일 시각만 본다.
set -uo pipefail
HARNESS_ROOT="${HARNESS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
command -v python3 >/dev/null 2>&1 || exit 0
exec python3 -B "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/aidlc-freshness.py" --root "$HARNESS_ROOT"
