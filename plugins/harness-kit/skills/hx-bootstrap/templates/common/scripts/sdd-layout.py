#!/usr/bin/env python3
"""현재 하네스의 이슈별 SDD 명령 진입점. 외부 리포 파일에 의존하지 않는다."""

import sys
from pathlib import Path

sys.dont_write_bytecode = True

from harness.sdd_commands import main

if __name__ == "__main__":
    sys.exit(main(Path(__file__).resolve().parents[1], sys.argv[1:]))
