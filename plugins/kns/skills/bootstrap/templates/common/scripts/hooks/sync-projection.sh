#!/usr/bin/env bash
# 쓰기 도구 실행 뒤(PostToolUse) 배치 원본(.agents/skills · rules · roles · hooks.json · hooks.d · model-policy.json)을 고쳤으면
# 하네스 폴더의 복사본 · 생성물을 다시 만들고 lock 해시를 고친다(설계 03 §3.12 · R4.1). 성공하면 출력이 없다.
# 실패해도 턴을 막지 않는다(exit 0, 한 줄). 남은 어긋남은 fast 검증의 stale 이 잡는다. 모델을 부르지 않는다.
set -uo pipefail
HARNESS_ROOT="${HARNESS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
payload="$(cat 2>/dev/null || true)"
if ! grep -Eq '\.agents/(skills|rules|roles|hooks\.json|hooks\.d|model-policy\.json)' <<<"$payload"; then
  exit 0
fi
command -v python3 >/dev/null 2>&1 || exit 0
changed=()
while IFS= read -r path; do
  case "$path" in
    .agents/skills/*|.agents/rules/*|.agents/roles/*|.agents/hooks.json|.agents/hooks.d/*|.agents/model-policy.json) changed+=(--changed "$path") ;;
  esac
done < <(python3 -B "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/hook_paths.py" --root "$HARNESS_ROOT" <<<"$payload")
[ "${#changed[@]}" -gt 0 ] || exit 0
projection="$HARNESS_ROOT/scripts/harness/projection.py"
[ -f "$projection" ] || exit 0
if ! err="$(python3 -B "$projection" sync --root "$HARNESS_ROOT" "${changed[@]}" 2>&1 >/dev/null)"; then
  # 한 줄 200바이트 이하(hooks.json maxOutputBytes). 이유는 110바이트에서 글자 경계로 자른다.
  python3 -c 'import sys; r = sys.argv[1].encode()[:110].decode(errors="ignore"); print("하네스 복사본 동기화 실패: " + r + " — knots-sync repair")' \
    "$(printf '%s' "$err" | tail -n 1)"
fi
exit 0
