#!/usr/bin/env bash
# 단계 선행 조건 검사: <키> [--stage design|tasks|implement](새 구조) · <slug> <이름>(옛 구조, 읽기 전용).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sdd-layout.py" prerequisites "$@"
