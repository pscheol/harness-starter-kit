"""선택 모듈 multi-harness 의 시험(tools/harness/tests)을 설치본 안에서 돈다(HK-6).

    python3 -m unittest tests.test_multi_harness_module

모듈 시험은 설치본의 scripts/(verify-changed.py · verify-entry.sh)를 같이 쓰고, 설치가 {{토큰}}을 치환한 뒤의
파일로 돌아야 한다. 템플릿 폴더에서 바로 돌리면 둘 다 맞지 않는다.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
SETUP = KIT / "plugins/kns/skills/bootstrap/setup.sh"


class MultiHarnessModuleTest(unittest.TestCase):
    def test_module_tests_pass_in_install(self):
        tmp = Path(tempfile.mkdtemp(prefix="kit multi-harness "))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        root = tmp / "python"
        env = {
            **os.environ,
            "PROJECT_NAME": "Acme Notes",
            "PROJECT_SLUG": "acme-notes",
            "PACKAGE_NS": "com.acme.notes",
            "SERVICE_NAME": "notes-api",
        }
        result = subprocess.run(
            ["bash", str(SETUP), "--stack=python", "--agents=all", "--modules=multi-harness", str(root)],
            env=env, capture_output=True, text=True, timeout=300,
        )
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
        self.assertTrue((root / "tools/harness/tests").is_dir())
        subprocess.run(["git", "init", "-q"], cwd=root, check=True)
        run = subprocess.run(
            [sys.executable, "-m", "unittest", "discover", "-s", "tools/harness/tests", "-p", "test_*.py"],
            cwd=root, capture_output=True, text=True, timeout=900,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        self.assertEqual(run.returncode, 0, run.stdout[-4000:] + run.stderr[-4000:])


if __name__ == "__main__":
    unittest.main()
