#!/usr/bin/env bash
# 이 하네스가 최상위인 git 리포에 scripts/git-hooks 를 연결한다. 커밋은 fast, push 는 full 게이트가 돈다.
# 리포 로컬 설정(core.hooksPath)만 바꾸고 사용자 전역 설정은 건드리지 않는다. 다시 실행해도 결과가 같다.
#
#   bash scripts/install-git-hooks.sh               # 이 리포
#   bash scripts/install-git-hooks.sh --submodules  # 이 리포와 받은 submodule 각각(그 리포의 이 스크립트를 부른다)
#
# 되돌리기: git config --local --unset core.hooksPath
set -uo pipefail
HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
HOOKS_PATH="scripts/git-hooks"

with_submodules=0
for argument in "$@"; do
  case "$argument" in
    --submodules) with_submodules=1 ;;
    *) echo "✖ 알 수 없는 인자: $argument (--submodules 만 받는다)" >&2; exit 2 ;;
  esac
done

# 도메인 리포 안의 단위 폴더는 리포 최상위가 아니다. 거기서 걸면 도메인 리포 전체의 hook 이 단위 게이트로 바뀐다.
top="$(git -C "$HARNESS_ROOT" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$top" ] || [ "$(cd "$top" && pwd -P)" != "$HARNESS_ROOT" ]; then
  echo "✖ $HARNESS_ROOT 는 git 리포 최상위가 아니다(최상위: ${top:-git 리포 아님}). 그 리포 루트의 scripts/install-git-hooks.sh 를 실행한다" >&2
  exit 1
fi

# 전역 설정의 [includeIf "gitdir:…"] 가 이 리포 기준으로 풀리도록 리포 안에서 git 을 부른다.
cd "$HARNESS_ROOT" || exit 1
previous="$(git -C "$HARNESS_ROOT" config --local --get core.hooksPath || true)"
if [ "$previous" != "$HOOKS_PATH" ]; then
  git -C "$HARNESS_ROOT" config --local core.hooksPath "$HOOKS_PATH" || exit 1
  [ -z "$previous" ] || echo "바꿈: core.hooksPath $previous → $HOOKS_PATH"
fi

. "$HARNESS_ROOT/$HOOKS_PATH/global-hook.sh"
global_dir="$(git config --global --includes --type=path --get core.hooksPath \
  || git config --system --includes --type=path --get core.hooksPath || echo 없음)"
chained=""
for name in pre-commit pre-push; do
  if global_hook "$name" >/dev/null; then chained="$chained $name"; fi
done
echo "✔ $HARNESS_ROOT"
echo "    core.hooksPath=$HOOKS_PATH · 전역 core.hooksPath=$global_dir · 이어 부를 전역 hook:${chained:- 없음}"

fail=0
if [ "$with_submodules" -eq 1 ] && [ -f "$HARNESS_ROOT/.gitmodules" ]; then
  # -z 출력은 "키\n값\0" 이다. 키(submodule 이름)와 값(경로)에 공백이 있어도 나뉜다.
  while IFS= read -r -d '' entry; do
    path="${entry#*$'\n'}"
    [ -n "$path" ] || continue
    sub="$HARNESS_ROOT/$path"
    if [ ! -e "$sub/.git" ]; then
      echo "✖ $path 받지 않음 — git submodule update --init $path" >&2
      fail=1
      continue
    fi
    if [ ! -f "$sub/scripts/install-git-hooks.sh" ]; then
      echo "✖ $path 에 scripts/install-git-hooks.sh 가 없다 — 그 리포를 이 스크립트가 있는 커밋으로 올린다" >&2
      fail=1
      continue
    fi
    bash "$sub/scripts/install-git-hooks.sh" </dev/null || fail=1
  done < <(git -C "$HARNESS_ROOT" config -z --file .gitmodules --get-regexp '^submodule\..*\.path$')
fi
exit "$fail"
