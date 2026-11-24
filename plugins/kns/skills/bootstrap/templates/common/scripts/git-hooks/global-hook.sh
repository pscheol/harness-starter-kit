# 사용자 전역 hook 폴더에서 같은 이름의 hook 을 찾는다. pre-commit · pre-push · 설치 스크립트가 source 로 쓴다.
# 리포 로컬 core.hooksPath 가 전역 값을 가리므로, 전역 비밀 값 검사 같은 사용자 hook 은 여기서 이어 부르지 않으면 돌지 않는다.
#
#   global_hook <이름>   → 실행할 경로를 출력하고 0. 없으면 출력 없이 1

global_hook() {
  local name="$1" dir own
  # 전역 설정이 [include]·[includeIf] 로 값을 가져오면 --includes 없이는 보이지 않는다. --type=path 가 ~ 를 펼친다.
  dir="$(git config --global --includes --type=path --get core.hooksPath 2>/dev/null || true)"
  [ -n "$dir" ] || dir="$(git config --system --includes --type=path --get core.hooksPath 2>/dev/null || true)"
  [ -n "$dir" ] && [ -d "$dir" ] || return 1
  # 전역 값이 이 폴더를 가리키면 자기 자신을 다시 부르게 된다.
  own="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  [ "$(cd "$dir" && pwd -P)" != "$own" ] || return 1
  [ -x "$dir/$name" ] || return 1
  printf '%s\n' "$dir/$name"
}
