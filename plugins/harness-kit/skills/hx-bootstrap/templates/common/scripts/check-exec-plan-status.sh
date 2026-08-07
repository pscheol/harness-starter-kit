#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — {{...}} 치환 후 사용.
#
# exec-plan(=tasks) 위치↔상태 일관성 점검 (완료 게이트의 기계적 보조).
# 제품 단위 SDD 구조를 순회한다: .agents/docs/*-specs/tasks/{active,check,completed}/
# 규칙(원본: 각 제품 tasks/README.md):
#   전이 active/ → check/ → completed/  (상태값도 동일)
#   - active/    : 상태는 active 여야 한다.
#   - check/     : 상태는 check 여야 한다(사용자 검증 대기).
#   - completed/ : 상태는 completed 여야 한다(사용자 승인 완료).
# 이 스크립트는 "사용자 승인 여부"를 강제하지 못한다(사람 단계). 위치/상태 모순만 잡는다.
set -uo pipefail

fail=0
found_any=0

status_of() { # <file> -> active|check|completed (첫 상태 라인 기준)
  grep -E '상태' "$1" 2>/dev/null | grep -ioE 'check|completed|active' | head -1
}

is_meta() { case "$(basename "$1")" in _template.md|README.md) return 0;; *) return 1;; esac }

check_dir() { # <tasks-dir> <expected-status>
  local dir="$1" expected="$2" f s
  for f in "$dir"/*.md; do
    [ -e "$f" ] || continue
    is_meta "$f" && continue
    s="$(status_of "$f")"
    if [ "$s" != "$expected" ]; then
      echo "✖ $f : $(basename "$dir")/ 인데 상태='$s' — '$expected' 여야 함"
      fail=1
    fi
  done
}

# 전 제품 폴더 순회 (<slug>-specs/tasks/…)
for prod in .agents/docs/*-specs; do
  [ -d "$prod/tasks" ] || continue
  found_any=1
  check_dir "$prod/tasks/active"    active
  check_dir "$prod/tasks/check"     check
  check_dir "$prod/tasks/completed" completed
done

if [ "$found_any" -eq 0 ]; then
  echo "ℹ 제품 SDD 폴더(.agents/docs/*-specs/tasks) 없음 — 점검 대상 없음(OK)"
  exit 0
fi

if [ "$fail" -ne 0 ]; then echo "exec-plan(tasks) 상태 일관성 실패"; exit 1; fi

# 상태가 일관되면 보드를 실제 파일 위치에 맞춰 다시 그린다.
# 이 한 줄 덕분에 task 파일을 active→check→completed 로 옮기기만 하면 보드가 따라온다
# (사람이 표의 상태를 손으로 고칠 일이 없다). 실패해도 게이트를 막지 않는다.
[ -f scripts/board.sh ] && { bash scripts/board.sh >/dev/null 2>&1 || true; }

echo "exec-plan(tasks) 상태 일관성 OK"
exit 0
