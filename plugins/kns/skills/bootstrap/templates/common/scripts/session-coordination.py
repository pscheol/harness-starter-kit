#!/usr/bin/env python3
"""공유 체크아웃의 세션별 파일 점유와 공지를 관리한다."""

import sys

sys.dont_write_bytecode = True

if __name__ == "__main__":
    from harness.coordination_cli import main

    raise SystemExit(main())
