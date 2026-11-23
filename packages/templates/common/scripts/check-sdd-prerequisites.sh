#!/usr/bin/env bash
# requirements/design 승인과 active tasks 선행 조건 검사.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sdd-layout.py" prerequisites "$@"
