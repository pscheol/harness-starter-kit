#!/usr/bin/env python3
"""이슈 SDD 명령 진입점: scaffold · prerequisites · board · plans · freshness · migrate · rekey · branch-check.

외부 리포 파일에 의존하지 않는다. 종료 코드는 harness/sdd_commands.py 머리 주석.
"""

import sys
from pathlib import Path

sys.dont_write_bytecode = True

from harness.sdd_commands import main

if __name__ == "__main__":
    sys.exit(main(Path(__file__).resolve().parents[1], sys.argv[1:]))
