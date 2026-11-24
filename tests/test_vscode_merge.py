""".vscode/settings.json 병합, Python 판(HK-15 design §6). TS 시험(vscode-merge.test.ts)과 같은 fixture 를 본다.

    python3 -m unittest tests.test_vscode_merge
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # 템플릿 폴더에 __pycache__ 를 만들지 않는다
KIT = Path(__file__).resolve().parents[1]
HARNESS = KIT / "packages/templates/common/scripts/harness"
FIXTURE = KIT / "packages/cli/test/fixtures/vscode/cases.json"
sys.path.insert(0, str(HARNESS))

import projection_vscode as vscode  # noqa: E402
from projection_merge import MERGE_KIND, MERGERS  # noqa: E402


class SharedFixtureTest(unittest.TestCase):
    def test_every_case_matches_the_shared_expectation(self):
        merge, unmerge, missing = MERGERS["vscode-settings"]
        for case in json.loads(FIXTURE.read_text(encoding="utf-8")):
            with self.subTest(case=case["name"]):
                merged = merge(case["cur"], vscode.want(), case["prev"])
                self.assertEqual(case["merge"], merged)
                if "unmerge" in case:
                    self.assertEqual(case["unmerge"], unmerge(merged["text"], merged["keys"], vscode.want()))
                    self.assertEqual(case["missingAfterMerge"], missing(merged["text"], merged["keys"], vscode.want()))
                    self.assertEqual(case["missingAfterUnmerge"], missing(case["unmerge"]["text"], merged["keys"], vscode.want()))

    def test_registered_for_the_vscode_settings_path(self):
        self.assertEqual("vscode-settings", MERGE_KIND[".vscode/settings.json"])

    def test_wants_vscode_only_when_the_folder_exists(self):
        import tempfile

        from projection_wants import wants_vscode

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertFalse(wants_vscode(root))
            (root / ".agents").mkdir()
            (root / ".agents/knots-sync.json").write_text(json.dumps({"git": {"ide": "code"}}), encoding="utf-8")
            self.assertFalse(wants_vscode(root))  # git.ide 기본값(code)만으로는 만들지 않는다
            (root / ".vscode").mkdir()
            self.assertTrue(wants_vscode(root))


if __name__ == "__main__":
    unittest.main()
