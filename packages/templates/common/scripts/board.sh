#!/usr/bin/env bash
# SDD 보드(specs-index.md 영역별 표 · 옛 <영역>-specs/index.md) 갱신. --check 는 읽기 전용, --area <영역> 은 그 표만, --json 은 상태 JSON(관리 페이지와 같은 계산).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sdd-layout.py" board "$@"
