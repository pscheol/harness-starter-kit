#!/usr/bin/env bash
# 두 SDD 구조의 상태·중복 작업·ID·보드 정합성 검사.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sdd-layout.py" plans "$@"
