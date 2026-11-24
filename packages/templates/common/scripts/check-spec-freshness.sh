#!/usr/bin/env bash
# 새 · 옛 SDD 구조의 정체 문서 · 미해결 질문 리포트(읽기 전용).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sdd-layout.py" freshness "$@"
