"""check_external.py — 외부 도구 파일 sha256 비교(설계 11 §3.9)."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "harness" / "check_external.py"


class CheckExternalTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="check external "))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        entries = [
            {"path": ".aidlc/rules.md", "op": "none", "owner": "external:aidlc"},
            {"path": ".entire/logs/entire.log", "op": "none", "owner": "external:entire"},
            {"path": "AGENTS.md", "op": "copy", "owner": "kit", "sha256": "x"},
        ]
        self.write(".agents/knots-sync.lock", json.dumps({"schema": "knots-sync.lock/v2", "entries": entries}))
        self.write(".aidlc/rules.md", "규칙\n")
        self.write(".entire/logs/entire.log", "첫 줄\n")
        self.write("AGENTS.md", "# 킷\n")

    def write(self, rel: str, text: str) -> None:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def run_script(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(SCRIPT), "--root", str(self.root), *args], capture_output=True, text=True, timeout=60)

    def test_unchanged_passes_and_logs_are_left_out(self):
        snap = self.root / ".agents/state/before.json"
        self.assertEqual(0, self.run_script("--save", str(snap)).returncode)
        self.assertEqual([".aidlc/rules.md"], list(json.loads(snap.read_text(encoding="utf-8"))["files"]))
        self.write(".entire/logs/entire.log", "첫 줄\n둘째 줄\n")
        self.write("AGENTS.md", "# 킷 새 판\n")
        r = self.run_script("--snapshot", str(snap))
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        self.assertIn("외부 파일 1개 그대로", r.stdout)

    def test_changed_or_missing_external_file_fails(self):
        snap = self.root / ".agents/state/before.json"
        self.run_script("--save", str(snap))
        self.write(".aidlc/rules.md", "킷이 고쳤다\n")
        r = self.run_script("--snapshot", str(snap))
        self.assertEqual(1, r.returncode)
        self.assertIn("바뀜: .aidlc/rules.md", r.stdout)
        (self.root / ".aidlc/rules.md").unlink()
        self.assertIn("없어짐: .aidlc/rules.md", self.run_script("--snapshot", str(snap)).stdout)

    def test_module_snapshot_external_table_is_accepted(self):
        snap = self.root / "module.json"
        snap.write_text(json.dumps({"schema": "knots-sync.module-snapshot/v1", "external": {".aidlc/rules.md": "0" * 64}}), encoding="utf-8")
        self.assertEqual(1, self.run_script("--snapshot", str(snap)).returncode)
        bad = self.root / "bad.json"
        bad.write_text("{}", encoding="utf-8")
        self.assertEqual(2, self.run_script("--snapshot", str(bad)).returncode)


if __name__ == "__main__":
    unittest.main()
