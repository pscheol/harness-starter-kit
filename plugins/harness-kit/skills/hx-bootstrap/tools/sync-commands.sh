#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 킷 개발용 — 스킬 원본에서 에이전트별 포인터를 만든다. 대상 리포에 설치되지 않는다.
#
# 원본: templates/common/agents-skills/hx-*/SKILL.md (설치 위치 .agents/skills — core)
# 만드는 것(원본 description 을 그대로 쓰는 한 줄 포인터):
#   templates/common/claude/commands/hx-*.md
#   templates/common/cursor/commands/hx-*.md
#   templates/common/kiro-skills/hx-*/SKILL.md
#   templates/common/kiro-steering/hx-*.md
#
#   bash tools/sync-commands.sh          # 쓴다
#   bash tools/sync-commands.sh --check  # 쓰지 않고 다르면 1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../templates/common"

CHECK=0
[ "${1:-}" = --check ] && CHECK=1
differ=0

emit() {
  local path="$1" content="$2"
  if [ "$CHECK" = 1 ]; then
    if [ ! -f "$path" ] || [ "$(cat "$path")" != "$content" ]; then
      echo "✖ 다름: $path"
      differ=1
    fi
    return 0
  fi
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
}

for skill in agents-skills/hx-*/SKILL.md; do
  name="$(basename "$(dirname "$skill")")"
  description="$(awk -F': ' '/^description:/{sub(/^description: /,""); print; exit}' "$skill")"
  pointer="\`.agents/skills/$name/SKILL.md\`를 읽고 그대로 수행한다. 규칙 원본은 \`.agents/rules/\`다."
  emit "claude/commands/$name.md" "---
description: $description
---

$pointer

입력: \$ARGUMENTS"
  emit "cursor/commands/$name.md" "---
description: $description
---

$pointer

입력: \$ARGUMENTS"
  emit "kiro-skills/$name/SKILL.md" "---
name: $name
description: $description
---

$pointer

입력: \$ARGUMENTS"
  emit "kiro-steering/$name.md" "---
inclusion: manual
description: $description
---

$pointer"
done

if [ "$CHECK" = 1 ]; then
  [ "$differ" = 0 ] && echo "✔ 스킬 포인터 일치"
  exit "$differ"
fi
echo "✔ 스킬 포인터를 만들었다"
