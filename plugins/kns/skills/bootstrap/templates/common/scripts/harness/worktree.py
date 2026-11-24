#!/usr/bin/env python3
"""worktree 운영(설계 05, HK-15). 같은 리포에서 동시에 파일을 쓰는 세션이 둘 이상일 때만 worktree 를 쓴다.

    python3 scripts/harness/worktree.py new  <이슈키> [--docs] [--only <폴더>]… [--domain <submodule 경로>] [--deps] [--open] [--skip-design-check] [--json]
    python3 scripts/harness/worktree.py list [--all] [--disk] [--refresh-size] [--json]
    python3 scripts/harness/worktree.py open <이슈키> [--ide code|idea]
    python3 scripts/harness/worktree.py done [<이슈키> | --path <경로>] [--keep-branch] [--json]
    python3 scripts/harness/worktree.py gc   [--apply] [--json]
    (숨김) hook-create · hook-remove      Claude WorktreeCreate · WorktreeRemove 훅 전용(표준 입력 JSON)

exit: 0 성공 · 1 조건 미달로 거부(끝나지 않음 · design 미승인) · 2 사용법 · 3 상태 오류(상한 · 자리 · 이슈 없음 · git 리포 아님) · 5 환경 오류(git 2.31 미만 · IDE 없음).
자리 `../<리포>.worktrees/<키>-<이름>/`, 리포당 `git.maxPerRepo`(기본 3)개. 끝나면 `done` 으로 지운다. `gc --apply` 는 사람이 시킬 때만 쓴다.
모델을 부르지 않는다. 표준 라이브러리만 쓴다.
"""

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import worktree_create as creator  # noqa: E402
from harness import worktree_finish as finisher  # noqa: E402
from harness.sdd_keys import is_key  # noqa: E402
from harness.worktree_repo import WtError, git_version, resolve_context, resolve_context_loose  # noqa: E402

MIN_GIT = (2, 31)
SELF = "python3 scripts/harness/worktree.py"


class Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        print(f"worktree.py: {message}", file=sys.stderr)
        raise SystemExit(2)


def build_parser():
    parser = Parser(prog="worktree.py", description="worktree 운영(new · list · open · done · gc)")
    sub = parser.add_subparsers(dest="command", required=True, parser_class=Parser)
    new = sub.add_parser("new", help="이슈 worktree 를 만든다")
    new.add_argument("key")
    new.add_argument("--docs", action="store_true", help="sparse checkout: .agents · docs · scripts 와 루트 파일만")
    new.add_argument("--only", action="append", default=[], metavar="폴더", help="구현 worktree 에서 이 폴더도 받는다(반복)")
    new.add_argument("--domain", metavar="경로", help="submodule(도메인 리포) 경로")
    new.add_argument("--deps", action="store_true", help="의존성 설치 명령을 실행한다")
    new.add_argument("--open", dest="open_ide", action="store_true", help="만든 뒤 IDE 로 연다")
    new.add_argument("--skip-design-check", action="store_true")
    new.add_argument("--json", action="store_true")
    ls = sub.add_parser("list", help="worktree 목록")
    ls.add_argument("--all", action="store_true")
    ls.add_argument("--disk", action="store_true")
    ls.add_argument("--refresh-size", action="store_true")
    ls.add_argument("--json", action="store_true")
    open_ = sub.add_parser("open", help="IDE 로 연다")
    open_.add_argument("key")
    open_.add_argument("--ide", choices=("code", "idea"))
    done = sub.add_parser("done", help="끝난 worktree 를 지운다")
    done.add_argument("key", nargs="?")
    done.add_argument("--path")
    done.add_argument("--keep-branch", action="store_true")
    done.add_argument("--json", action="store_true")
    gc = sub.add_parser("gc", help="정리 대상 목록(--apply 로 지운다)")
    gc.add_argument("--apply", action="store_true")
    gc.add_argument("--json", action="store_true")
    sub.add_parser("hook-create")
    sub.add_parser("hook-remove")
    return parser


def read_payload():
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def check_key(key):
    if not is_key(key):
        raise SystemExit(Parser().error(f"이슈 키 형식이 아니다: {key!r} — 예: KNOTS-17"))


def emit(data, as_json, text):
    print(json.dumps(data, ensure_ascii=False, indent=2) if as_json else text)


def run(options):
    cwd = Path.cwd()
    command = options.command
    if command == "hook-create":
        print(creator.hook_create(read_payload()))
        return 0
    if command == "hook-remove":
        finisher.hook_remove(read_payload())
        return 0
    if command == "new":
        check_key(options.key)
        ctx = resolve_context(cwd, domain=options.domain, docs=options.docs)
        result = creator.create_issue(ctx, options.key, docs=options.docs, only=options.only, run_deps=options.deps, skip_design=options.skip_design_check)
        hint = f"{SELF} open {options.key}   또는   cd {result['path']} && claude"
        emit(result, options.json, creator.render_new(result, hint))
        if options.open_ide:
            finisher.open_ide(ctx, options.key)
        return 0
    ctx = resolve_context_loose(cwd)
    if command == "list":
        data = finisher.list_worktrees(ctx, options.all, options.disk, options.refresh_size)
        emit(data, options.json, finisher.render_list(data))
        return 0
    if command == "open":
        check_key(options.key)
        result = finisher.open_ide(ctx, options.key, options.ide)
        print(f"{result['ide']} 로 연다: {result['path']}")
        return 0
    if command == "done":
        if options.key:
            check_key(options.key)
        result = finisher.done(ctx, options.key, options.path, options.keep_branch)
        emit({k: v for k, v in result.items() if k != "text"}, options.json, result["text"])
        return 0 if result["removed"] else 1
    result = finisher.gc(ctx, options.apply)
    emit(result, options.json, finisher.render_gc(result))
    return 0


def main(argv=None):
    options = build_parser().parse_args(argv)
    version = git_version()
    if version is None or version < MIN_GIT:
        print(f"worktree.py: git {MIN_GIT[0]}.{MIN_GIT[1]} 이상이 필요하다(지금 {'없음' if version is None else '.'.join(map(str, version))})", file=sys.stderr)
        return 5
    try:
        return run(options)
    except WtError as error:
        print(f"{'✖ ' if options.command not in ('hook-create', 'hook-remove') else ''}{error}", file=sys.stderr)
        if error.hint:
            print(f"  → {error.hint}", file=sys.stderr)
        return error.code
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
