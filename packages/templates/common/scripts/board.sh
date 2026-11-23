#!/usr/bin/env bash
# SDD 보드(specs-index.md 영역별 표 · 옛 <영역>-specs/index.md) 갱신. --check 는 읽기 전용, --area <영역> 은 그 표만 출력.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sdd-layout.py" board "$@"
