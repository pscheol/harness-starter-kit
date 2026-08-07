#!/usr/bin/env bash
# 킷 개발용 도구 — 대상 프로젝트에 설치되지 않는다(templates/ 밖).
#
# 슬래시 커맨드 원본은 templates/common/claude/commands/hx-*.md 9종이다.
# 이 스크립트가 거기서 나머지 3개 하네스 트리를 파생시킨다:
#
#   .cursor/commands/hx-*.md         Cursor 프로젝트 커맨드 (frontmatter 없이 본문 전체가 프롬프트)
#   .kiro/steering/hx-*.md           Kiro IDE  (inclusion: manual → 슬래시 메뉴 노출)
#   .kiro/skills/hx-*/SKILL.md       Kiro CLI  (스킬명이 곧 슬래시 커맨드)
#   .agents/skills/hx-*/SKILL.md     Codex     ($hx-specify 로 멘션 · /skills 로 목록)
#
# 커맨드 본문을 고쳤으면 claude/commands/ 만 고치고 이 스크립트를 다시 돌린다.
# Codex 는 프로젝트 로컬 .codex/prompts/ 를 탐색하지 않으므로(유저 홈 전용 + deprecated)
# .agents/skills/ 를 쓴다.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMMON="${1:-$SCRIPT_DIR/../templates/common}"
SRC="$COMMON/claude/commands"

[ -d "$SRC" ] || { echo "✗ 원본 없음: $SRC" >&2; exit 2; }

CURSOR="$COMMON/cursor/commands"
KIRO_ST="$COMMON/kiro-steering"
KIRO_SK="$COMMON/kiro-skills"
CODEX_SK="$COMMON/agents-skills"
mkdir -p "$CURSOR" "$KIRO_SK" "$CODEX_SK"

# frontmatter 2행의 description 값
desc_of() { sed -n '2s/^description: //p' "$1"; }

# frontmatter(--- ~ ---)를 걷어낸 본문.
# $ARGUMENTS 는 Claude 전용 치환이라, 인자를 지원하지 않는 하네스용 문구로 바꾼다.
body_of() {
  awk 'BEGIN{n=0} /^---$/{n++; next} n>=2' "$1" \
    | sed 's/\$ARGUMENTS/이 명령 뒤에 이어서 적은 내용/g' \
    | sed '/./,$!d'
}

n=0
for f in "$SRC"/hx-*.md; do
  name="$(basename "$f" .md)"
  desc="$(desc_of "$f")"
  body="$(body_of "$f")"
  [ -n "$desc" ] || { echo "✗ description 없음: $f" >&2; exit 2; }

  { printf '# %s\n\n> %s\n\n' "$name" "$desc"; printf '%s\n' "$body"; } > "$CURSOR/$name.md"

  { printf -- '---\ninclusion: manual\ndescription: %s\n---\n\n' "$desc"; printf '%s\n' "$body"; } > "$KIRO_ST/$name.md"

  mkdir -p "$KIRO_SK/$name" "$CODEX_SK/$name"
  { printf -- '---\nname: %s\ndescription: %s\n---\n\n' "$name" "$desc"; printf '%s\n' "$body"; } > "$KIRO_SK/$name/SKILL.md"
  { printf -- '---\nname: %s\ndescription: %s\n---\n\n' "$name" "$desc"; printf '%s\n' "$body"; } > "$CODEX_SK/$name/SKILL.md"
  n=$((n+1))
done

echo "✔ 원본 ${n}종 → 파생 $((n*4))개 (cursor · kiro-steering · kiro-skills · agents-skills)"
