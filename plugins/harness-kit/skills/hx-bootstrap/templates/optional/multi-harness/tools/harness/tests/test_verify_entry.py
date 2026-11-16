"""변경 검증 진입 설치의 동작과 동시 수정 보존을 확인한다."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


TOOL = Path(__file__).resolve().parents[1]


class VerificationEntryTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="verification entry ")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        (self.root / "tools/harness").mkdir(parents=True)
        (self.root / "scripts").mkdir()
        self.gate = self.root / "scripts/verify.sh"
        self.original = '#!/usr/bin/env bash\nset -uo pipefail\n# user change retained\necho "legacy ${HARNESS_VERIFY_LEVEL:-full}"\n'
        self.gate.write_text(self.original)
        self.gate.chmod(0o755)
        self.baseline = self.root / "baseline.json"
        self.baseline.write_text(json.dumps({"scripts/verify.sh": {"sha256": hashlib.sha256(self.gate.read_bytes()).hexdigest(), "mode": 0o755}}))
        (self.root / "tools/harness/units.json").write_text(json.dumps({"units": [{"id": "root", "path": "."}]}))

    def install(self):
        return subprocess.run(["python3", str(TOOL / "install_verification_entry.py"), "--repo", str(self.root), "--baseline", str(self.baseline)], capture_output=True, text=True)

    def run_gate(self, *arguments, level=None):
        environment = {key: value for key, value in os.environ.items() if key != "HARNESS_VERIFY_LEVEL"}
        if level is not None:
            environment["HARNESS_VERIFY_LEVEL"] = level
        return subprocess.run(["bash", str(self.gate), *arguments], env=environment, capture_output=True, text=True)

    def add_entry(self):
        shutil.copy2(TOOL / "shared/scripts/verify-entry.sh", self.root / "scripts/verify-entry.sh")
        (self.root / "scripts/verify-changed.py").write_text('import sys\nprint("selected", *sys.argv[1:])\n')

    def test_default_runs_selected_only(self):
        self.assertEqual(0, self.install().returncode)
        self.add_entry()
        result = self.run_gate("--files", "src/feature.py", "--plan")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("selected --files src/feature.py --plan", result.stdout)
        self.assertNotIn("legacy", result.stdout)

    def test_explicit_full_and_fast_keep_existing_gate(self):
        self.assertEqual(0, self.install().returncode)
        self.add_entry()
        for arguments, level, expected in [(("--full",), None, "full"), ((), "full", "full"), ((), "fast", "fast")]:
            result = self.run_gate(*arguments, level=level)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual(f"legacy {expected}", result.stdout.strip())

    def test_preserves_existing_body_mode_and_idempotence(self):
        self.assertEqual(0, self.install().returncode)
        first = self.gate.read_bytes()
        self.assertIn("# user change retained", first.decode())
        self.assertTrue(os.access(self.gate, os.X_OK))
        self.assertEqual(0, self.install().returncode)
        self.assertEqual(first, self.gate.read_bytes())

    def test_refuses_a_file_changed_since_snapshot(self):
        self.gate.write_text(self.original + "# other session\n")
        before = self.gate.read_bytes()
        result = self.install()
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(before, self.gate.read_bytes())

    def test_preflights_every_target_before_mutation(self):
        unit = self.root / "unit/scripts"
        unit.mkdir(parents=True)
        (unit / "verify.sh").write_text(self.original)
        (self.root / "tools/harness/units.json").write_text(json.dumps({"units": [{"id": "root", "path": "."}, {"id": "unit", "path": "unit"}]}))
        result = self.install()
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(self.original, self.gate.read_text())

    def test_refuses_symlink_gate(self):
        elsewhere = self.root / "elsewhere.sh"
        elsewhere.write_text(self.original)
        self.gate.unlink()
        self.gate.symlink_to(elsewhere)
        result = self.install()
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(self.original, elsewhere.read_text())

    def test_refuses_symlink_parent_even_inside_repository(self):
        original_directory = self.root / "scripts"
        moved_directory = self.root / "other-scripts"
        original_directory.rename(moved_directory)
        original_directory.symlink_to(moved_directory, target_is_directory=True)
        result = self.install()
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(self.original, self.gate.read_text())

    def test_refuses_permission_change_since_snapshot(self):
        self.gate.chmod(0o700)
        result = self.install()
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(0o700, self.gate.stat().st_mode & 0o777)


if __name__ == "__main__":
    unittest.main()
