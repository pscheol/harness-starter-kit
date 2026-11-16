#!/usr/bin/env bash
# 이슈별 SDD 단계 문서 생성. --legacy로 이전 구조 선택.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sdd-layout.py" scaffold "$@"
