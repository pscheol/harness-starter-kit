"""feature_docs.py 명령줄 — 검사 범위 인자와 종료 코드.

    cd tools/docs && python3 -m unittest tests.test_cli
"""

import shutil
import subprocess
import sys
import unittest
from pathlib import Path

from tests.test_check import fixture_site

CLI = Path(__file__).resolve().parents[1] / "feature_docs.py"


def run(*arguments: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(CLI), *arguments], capture_output=True, text=True, timeout=120)


class CommandLineTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.site, _ = fixture_site()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def test_assets_check_fails_when_vendored_file_differs_from_the_lock(self):
        # 가짜 사이트의 vendor 파일은 stub 이라 리포 잠금 파일의 sha256 과 다르다.
        result = run("--site", str(self.site), "check", "--assets")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("외부 파일이 잠금과 다르다", result.stdout)
        self.assertIn("사이트 자산 검사 실패", result.stdout)

    def test_assets_check_passes_without_vendor_files(self):
        shutil.rmtree(self.site / "assets" / "vendor")
        result = run("--site", str(self.site), "check", "--assets")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("사이트 자산 검사 통과", result.stdout)
        self.assertIn("refresh vendor", result.stdout)

    def test_unknown_command_exits_2(self):
        result = run("--site", str(self.site), "publish")
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
