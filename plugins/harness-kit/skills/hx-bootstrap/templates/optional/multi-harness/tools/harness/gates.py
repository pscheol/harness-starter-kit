#!/usr/bin/env python3
"""루트 게이트가 부를 하네스 목록 — 등록표에서 다른 등록 항목 안에 들어 있지 않은 항목만 고른다.

하네스는 메인 → 도메인 → 단위 세 층이고, 게이트는 바로 아래 층만 부른다. 단위는 도메인 게이트가 부르므로
루트가 또 부르면 같은 검사가 두 번 돈다. 루트 항목(path ".")은 고르지 않는다.

    python3 tools/harness/gates.py    # 줄마다 "<id> <path> <rootVerify(기본 full)>"
"""
import argparse
import json
from pathlib import PurePosixPath
from pathlib import Path
import sys


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


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2], help=argparse.SUPPRESS)
    args = parser.parse_args()
    units = json.loads((args.repo / 'tools/harness/units.json').read_text())['units']
    for row in top_level(units):
        print(*row)
    return 0


if __name__ == '__main__':
    sys.exit(main())
