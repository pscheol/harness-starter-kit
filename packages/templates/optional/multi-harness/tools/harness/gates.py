#!/usr/bin/env python3
"""루트 게이트가 부를 하네스 목록 — 등록표에서 다른 등록 항목 안에 들어 있지 않은 항목만 고른다.

하네스는 메인 → 도메인 → 단위 세 층이고, 게이트는 바로 아래 층만 부른다. 단위는 도메인 게이트가 부르므로
루트가 또 부르면 같은 검사가 두 번 돈다. 루트 항목(path ".")은 고르지 않는다.

    python3 tools/harness/gates.py                                  # 줄마다 "<id> <path> <rootVerify(기본 full)>"
    python3 tools/harness/gates.py --changed [--base origin/develop]  # 같은 형식, 바뀌지 않은 도메인 줄을 뺀다
    python3 tools/harness/gates.py --json [--changed …]             # 모든 도메인 [{"id","path","rootVerify","changed","reasons"}]

바뀐 도메인(설계 01 §3.4, 하나라도 참): pointer — 루트 diff 에 submodule 포인터 변경, worktree — submodule 작업 트리 변경,
unmerged — submodule HEAD 에 원격 base 에 없는 커밋(그 ref 가 없으면 unmerged-unknown), path — 도메인 폴더 아래 루트 파일 변경.
"""
import argparse
import json
from pathlib import PurePosixPath
from pathlib import Path
import re
import subprocess
import sys

META = '.agents/harness-kit.json'
DEFAULT_BASE = 'develop'
BRANCH = re.compile(r'\w[\w./-]*')


def top_level(units):
    paths = [PurePosixPath(unit['path']) for unit in units if unit['path'] != '.']
    rows = []
    for unit in units:
        if unit['path'] == '.':
            continue
        path = PurePosixPath(unit['path'])
        if any(other != path and path.is_relative_to(other) for other in paths):
            continue
        rows.append((unit['id'], unit['path'], unit.get('rootVerify', 'full')))
    return rows


class BaseMissing(Exception):
    pass


def git(directory, *arguments, check=True):
    result = subprocess.run(['git', '-C', str(directory), *arguments], capture_output=True, text=True, timeout=30, check=False)
    if check and result.returncode:
        raise BaseMissing(f'git {" ".join(arguments[:2])} failed in {directory.name}: {result.stderr.strip()[:200]}')
    return result


def base_name(directory, default=DEFAULT_BASE):
    """하네스 메타의 git.base. 없거나 틀리면 default."""
    try:
        value = json.loads((directory / META).read_text(encoding='utf-8')).get('git', {}).get('base')
    except (OSError, ValueError, AttributeError):
        return default
    return value if isinstance(value, str) and BRANCH.fullmatch(value) else default


def has_commit(directory, reference):
    return git(directory, 'rev-parse', '--verify', '--quiet', '--end-of-options', reference + '^{commit}', check=False).returncode == 0


def resolve_base(repo, reference):
    if reference is not None and (not reference or reference.startswith('-')):
        raise BaseMissing('invalid git ref for --base')
    candidates = [reference] if reference else [f'origin/{base_name(repo)}', base_name(repo)]
    found = next((candidate for candidate in candidates if has_commit(repo, candidate)), None)
    if found is None:
        missing = candidates[0]
        raise BaseMissing(f'base ref 없음: {missing} — git fetch origin {missing.removeprefix("origin/")} 뒤 다시 실행')
    return found, git(repo, 'merge-base', 'HEAD', found).stdout.strip()


def root_changes(repo, merge_base):
    diff = git(repo, 'diff', '--name-only', '-z', '--ignore-submodules=dirty', merge_base).stdout.split('\0')
    untracked = git(repo, 'ls-files', '--others', '--exclude-standard', '-z').stdout.split('\0')
    return {path for path in diff + untracked if path}


def domain_reasons(repo, path, changes, base):
    reasons = []
    if path in changes:
        reasons.append('pointer')
    folder = repo / path
    if (folder / '.git').exists():
        if git(folder, 'status', '--porcelain', check=False).stdout.strip():
            reasons.append('worktree')
        remote = f'origin/{base_name(folder, base)}'
        if not has_commit(folder, remote):
            reasons.append('unmerged-unknown')
        elif int(git(folder, 'rev-list', '--count', 'HEAD', '--not', remote).stdout.strip() or 0) > 0:
            reasons.append('unmerged')
    if any(changed.startswith(path + '/') for changed in changes):
        reasons.append('path')
    return reasons


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2], help=argparse.SUPPRESS)
    parser.add_argument('--changed', action='store_true', help='바뀐 도메인만(설계 01 §3.4)')
    parser.add_argument('--base', help='비교 기준 ref(기본 origin/<git.base>, 없으면 <git.base>)')
    parser.add_argument('--json', action='store_true', help='모든 도메인과 판정 이유를 JSON 으로')
    args = parser.parse_args()
    repo = args.repo.resolve()
    units = json.loads((repo / 'tools/harness/units.json').read_text())['units']
    rows = [{'id': id_, 'path': path, 'rootVerify': ceiling, 'changed': True, 'reasons': []} for id_, path, ceiling in top_level(units)]
    if args.changed:
        try:
            reference, merge_base = resolve_base(repo, args.base)
            changes = root_changes(repo, merge_base)
            base = reference.removeprefix('origin/')
            for row in rows:
                row['reasons'] = domain_reasons(repo, row['path'], changes, base)
                row['changed'] = bool(row['reasons'])
        except (BaseMissing, OSError, subprocess.TimeoutExpired) as error:
            print(f'✖ {error}', file=sys.stderr)
            return 2
    if args.json:
        print(json.dumps(rows, ensure_ascii=False))
        return 0
    for row in rows:
        if row['changed']:
            print(row['id'], row['path'], row['rootVerify'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
