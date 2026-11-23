#!/usr/bin/env bash
# 기존 stage·이슈별 SDD 보드 생성. --check는 읽기 전용.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sdd-layout.py" board "$@"
