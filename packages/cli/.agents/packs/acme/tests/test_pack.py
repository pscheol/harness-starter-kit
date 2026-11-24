"""팩 자체 검사(설계 04 §3.2 검증) — 이 폴더에서 python3 -m unittest tests.test_pack 으로 돈다. 팩과 함께 설치하지 않는다."""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PackTest(unittest.TestCase):
    def setUp(self):
        self.pack = json.loads((ROOT / "pack.json").read_text(encoding="utf-8"))

    def test_manifest(self):
        self.assertEqual("knots-sync.pack/v1", self.pack["schema"])
        self.assertRegex(self.pack["name"], r"^[a-z][a-z0-9-]{1,30}$")
        self.assertRegex(self.pack["version"], r"^\d+\.\d+\.\d+")
        self.assertTrue(self.pack["requires"]["kit"])

    def test_fragment_ids_match_provides(self):
        name = self.pack["name"]
        hooks = json.loads((ROOT / "fragments/hooks.json").read_text(encoding="utf-8"))["hooks"]
        checks = json.loads((ROOT / "fragments/verify-checks.json").read_text(encoding="utf-8"))["checks"]
        self.assertEqual(sorted(h["id"] for h in hooks), sorted(self.pack["provides"].get("hooks", [])))
        self.assertEqual(sorted(c["id"] for c in checks), sorted(self.pack["provides"].get("verifyChecks", [])))
        for hook in hooks:
            self.assertTrue(hook["id"].startswith(f"harness-{name}-"), hook["id"])
        for check in checks:
            self.assertTrue(check["id"].startswith(f"{name}-"), check["id"])

    def test_no_links_and_shell_scripts_are_executable(self):
        for path in ROOT.rglob("*"):
            self.assertFalse(path.is_symlink(), path)
            if path.suffix == ".sh":
                self.assertTrue(path.stat().st_mode & 0o111, path)


if __name__ == "__main__":
    unittest.main()
