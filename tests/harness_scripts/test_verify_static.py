"""변경 파일 L0 검사(verify_static.py)의 CLI 계약을 검사한다."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "harness" / "verify_static.py"


class VerifyStaticTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        # macOS 임시 폴더(/var)는 /private/var 의 링크다. 검사기는 링크 대상을 resolve 해 루트와 견주므로 루트도 resolve 한다.
        self.root = Path(directory.name).resolve()

    def check(self, *files):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root), *files],
            capture_output=True,
            text=True,
        )
        return result.returncode, json.loads(result.stdout)

    def test_binary_file_without_parser_is_skipped_not_decoded(self):
        (self.root / "diagram.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\xff\xfe")
        code, report = self.check("diagram.png")
        self.assertEqual(0, code, report)
        self.assertEqual([], report["errors"])
        self.assertEqual(["diagram.png: no built-in syntax parser; L0 content validation skipped"], report["skipped"])

    def test_parsed_document_that_is_not_utf8_is_still_an_error(self):
        (self.root / "config.json").write_bytes(b'{"name": "\xff"}')
        code, report = self.check("config.json")
        self.assertEqual(1, code, report)
        self.assertEqual(1, len(report["errors"]))
        self.assertTrue(report["errors"][0].startswith("config.json: "))

    def test_syntax_errors_are_reported_per_parser(self):
        (self.root / "valid.json").write_text('{"ok": true}', encoding="utf-8")
        (self.root / "broken.json").write_text("{", encoding="utf-8")
        (self.root / "broken.toml").write_text("name = ", encoding="utf-8")
        (self.root / "guide.md").write_text("# 설명\n[누락](missing.md)\n", encoding="utf-8")
        code, report = self.check("valid.json", "broken.json", "broken.toml", "guide.md")
        self.assertEqual(1, code, report)
        self.assertEqual(
            ["broken.json", "broken.toml", "guide.md"],
            [error.split(":", 1)[0] for error in report["errors"]],
        )
        self.assertIn("broken link", report["errors"][2])


if __name__ == "__main__":
    unittest.main()
