#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — 얇은 트리거, 치환 없이 사용 가능.
#
# Stop hook: 리포 검증 스크립트가 있으면 호출한다(없으면 no-op).
# 강제 로직은 리포 scripts/verify.sh 하나에만 둔다. 이 hook은 트리거일 뿐이다.
# scripts/verify.sh 가 생기는 순간 자동으로 활성화된다.
set -euo pipefail

if [ -x "scripts/verify.sh" ]; then
  exec bash scripts/verify.sh
fi

# 아직 검증 스크립트 없음 → 통과
exit 0
