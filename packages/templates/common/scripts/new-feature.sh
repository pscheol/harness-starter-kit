#!/usr/bin/env bash
# 이슈 SDD 문서를 단계마다 하나씩 만든다: new-feature.sh <키|--next> <이름> --area <영역> · <키> --stage=design|tasks.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sdd-layout.py" scaffold "$@"
