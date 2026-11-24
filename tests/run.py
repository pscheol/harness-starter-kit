"""킷 시험 진입점(`pnpm test` · `pnpm test:e2e`).

git 훅 안에서 불리면(pre-push 가 `pnpm test` 를 돈다) git 이 GIT_DIR 같은 저장소 변수를 넘긴다. 그대로 두면 시험이 임시 폴더에서
부르는 git 명령(`git init --bare <임시>` 등)이 이 저장소를 건드린다 — 실제로 pre-push 중 이 저장소가 bare 로 바뀐 일이 있었다(HK-22b).
그래서 저장소를 가리키는 git 변수를 지운 뒤 unittest discover 를 돈다.

    python3 tests/run.py                 # tests/ 의 test_*.py
    python3 tests/run.py tests/e2e       # 다른 시작 폴더
"""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

REPO_ENV = (
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_PREFIX", "GIT_NAMESPACE", "GIT_QUARANTINE_PATH", "GIT_CEILING_DIRECTORIES", "GIT_DISCOVERY_ACROSS_FILESYSTEM",
)


def clean_git_env(environ: dict) -> list[str]:
    """저장소를 가리키는 git 변수를 지우고 지운 이름을 돌려준다."""
    removed = [name for name in REPO_ENV if name in environ]
    for name in removed:
        del environ[name]
    return removed


def main(argv: list[str]) -> int:
    clean_git_env(os.environ)
    start = Path(argv[0]) if argv else Path(__file__).resolve().parent
    suite = unittest.defaultTestLoader.discover(str(start), pattern="test_*.py", top_level_dir=str(start))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
