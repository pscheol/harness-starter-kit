#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — 스펙 신선도 리포트 (읽기 전용).
#
# 오래된 draft/in-review 스펙, 미해결 [NEEDS CLARIFICATION] 마커, 정체된 active tasks 를
# 훑어 리포트한다. **게이트가 아니라 리포트다** — 항상 exit 0(빌드를 막지 않는다).
# /hx-converge 가 잔여 작업 회수의 근거로 이 리포트를 쓴다.
#
# 사용법: scripts/check-spec-freshness.sh [--days N]     (기본 STALE_DAYS=14)
set -uo pipefail

DOCS=".agents/docs"
STALE_DAYS="${STALE_DAYS:-14}"     # 이 일수보다 오래 손대지 않은 draft/active = 정체
while [ $# -gt 0 ]; do case "$1" in --days) STALE_DAYS="${2:-14}"; shift 2;; *) shift;; esac; done

if ! ls -d "$DOCS"/*-specs >/dev/null 2>&1; then
  echo "ℹ 제품 SDD 폴더(.agents/docs/*-specs) 없음 — 신선도 점검 대상 없음(OK)"; exit 0
fi

# 첫 상태 라인에서 draft|in-review|active|... 추출
status_of() { grep -iE '상태|status' "$1" 2>/dev/null | grep -ioE 'draft|in-review|in review|active|check|completed' | head -1; }
is_meta()   { case "$(basename "$1")" in _template.md|README.md) return 0;; *) return 1;; esac; }
is_stale()  { [ -n "$(find "$1" -mtime +"$STALE_DAYS" 2>/dev/null)" ]; }   # mtime 기준 정체 판정

stale=0; markers=0; stuck=0

echo "▶ 스펙 신선도 리포트 (기준: ${STALE_DAYS}일 이상 미변경)"
echo ""

# 1) 정체된 draft/in-review 요구사항·설계
echo "· 정체된 draft/in-review 스펙:"
for f in "$DOCS"/*-specs/requirements/*.md "$DOCS"/*-specs/design/*.md; do
  [ -e "$f" ] || continue
  is_meta "$f" && continue
  case "$(status_of "$f")" in
    draft|in-review|"in review")
      if is_stale "$f"; then echo "  ⏳ $f (상태=draft/in-review, ${STALE_DAYS}일+ 미변경)"; stale=$((stale+1)); fi ;;
  esac
done
[ "$stale" -eq 0 ] && echo "  (없음)"

# 2) 미해결 [NEEDS CLARIFICATION: 질문] 마커
#    실제 마커는 콜론 형식(`[NEEDS CLARIFICATION: 질문]`)이다. 규약 설명문·체크리스트·백틱 예시는
#    콜론 없는 언급이거나 백틱으로 감싼 예시이므로 제외한다(_template 도 제외).
echo ""
echo "· 미해결 [NEEDS CLARIFICATION: …] 마커:"
while IFS= read -r line; do
  [ -n "$line" ] && { echo "  ❓ $line"; markers=$((markers+1)); }
done < <(grep -rnE '\[NEEDS CLARIFICATION:' "$DOCS"/*-specs 2>/dev/null \
           | grep -v '/_template.md:' \
           | grep -v '`\[NEEDS CLARIFICATION')
[ "$markers" -eq 0 ] && echo "  (없음)"

# 3) 정체된 active tasks
echo ""
echo "· 정체된 active tasks:"
for f in "$DOCS"/*-specs/tasks/active/*.md; do
  [ -e "$f" ] || continue
  is_meta "$f" && continue
  if is_stale "$f"; then echo "  ⏳ $f (${STALE_DAYS}일+ 미변경)"; stuck=$((stuck+1)); fi
done
[ "$stuck" -eq 0 ] && echo "  (없음)"

echo ""
echo "요약: 정체 스펙=$stale, 미해결 마커=$markers, 정체 tasks=$stuck"
echo "→ 후속 작업은 /hx-converge 로 tasks에 append-only 회수(원본: .agents/rules/sdd-workflow.md /hx-converge 절)."
exit 0
