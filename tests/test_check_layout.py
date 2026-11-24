"""scripts/harness/check_layout.py — lock 기준 배치 검사(HK-13 R6, 03 §3.9 · §5 #2).

    python3 -m unittest tests.test_check_layout
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cli_dist  # noqa: E402
from projection_kit import TOKENS  # noqa: E402
from test_cli_parity import base_env  # noqa: E402

KIT = cli_dist.KIT
SETUP = KIT / "plugins/kns/skills/bootstrap/setup.sh"
TEMPLATES = cli_dist.PLUGIN_TEMPLATES


def run(args: list[str], cwd: Path, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=300, env=env or {**base_env({}), "PYTHONDONTWRITEBYTECODE": "1"})


@unittest.skipUnless(shutil.which("node"), "Node 18.3 이상이 필요하다")
class CheckLayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cli = cli_dist.cli_bundle()

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="hk-layout-")).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def cli_install(self, agents: str = "all", modules: str = "none", stack: str = "python") -> Path:
        target = self.tmp / "acme-notes"
        # --issue-prefix: CLI 기본값(슬러그 대문자 'ACME-NOTES')은 check_harness 가 받지 않는 형식이다(HK-13 밖 — 보고).
        r = run(["node", str(self.cli), "init", "--yes", "--templates", str(TEMPLATES), "--cwd", str(target),
                 "--stack", stack, "--agents", agents, "--modules", modules, "--issue-prefix", "ACMENOTES"], self.tmp, env=base_env(TOKENS))
        self.assertEqual(r.returncode, 0, r.stdout[-2000:] + r.stderr[-2000:])
        subprocess.run(["git", "init", "-q"], cwd=target, check=True)
        subprocess.run(["git", "add", "-A"], cwd=target, check=True)
        return target

    def check(self, target: Path, *extra: str) -> subprocess.CompletedProcess:
        return run([sys.executable, "-B", "scripts/harness/check_layout.py", *extra], target)

    def test_fresh_install_passes_and_reports_counts(self):
        target = self.cli_install()
        r = self.check(target)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertRegex(r.stdout.strip().splitlines()[-1], r"^배치 검사: 항목 \d+개, 오류 0, 경고 \d+$")

    def test_source_edit_fails_fast_then_repair_passes(self):
        """03 §5 #2: 규칙 원본 한 줄 → verify.sh --fast exit 1(stale) → repair → exit 0."""
        target = self.cli_install()
        fast = ["bash", "scripts/verify.sh", "--fast"]
        before = run(fast, target)
        self.assertEqual(before.returncode, 0, before.stdout[-3000:] + before.stderr[-3000:])
        with (target / ".agents/rules/git-workflow.md").open("a", encoding="utf-8") as f:
            f.write("\n한 줄 더\n")
        broken = run(fast, target)
        self.assertEqual(broken.returncode, 1, broken.stdout[-3000:])
        self.assertIn("stale", broken.stdout + broken.stderr)
        self.assertIn(".agents/rules/git-workflow.md", broken.stdout + broken.stderr)
        repair = run(["node", str(self.cli), "repair", "--templates", str(TEMPLATES), "--cwd", str(target)], target)
        self.assertEqual(repair.returncode, 0, repair.stdout + repair.stderr)
        after = run(fast, target)
        self.assertEqual(after.returncode, 0, after.stdout[-3000:] + after.stderr[-3000:])

    def test_python_sync_repairs_without_node(self):
        target = self.cli_install(agents="claude,kiro")
        with (target / ".agents/skills/kns-plan/SKILL.md").open("a", encoding="utf-8") as f:
            f.write("\n한 줄 더\n")
        self.assertEqual(self.check(target).returncode, 1)
        sync = run([sys.executable, "-B", "scripts/harness/projection.py", "sync"], target)
        self.assertEqual((sync.returncode, sync.stdout), (0, ""), sync.stderr)
        self.assertEqual((target / ".claude/skills/kns-plan/SKILL.md").read_bytes(), (target / ".agents/skills/kns-plan/SKILL.md").read_bytes())
        self.assertEqual(self.check(target).returncode, 0)

    def test_relative_ref_in_kit_source_is_an_error(self):
        target = self.cli_install(agents="claude")
        with (target / ".agents/rules/writing-style.md").open("a", encoding="utf-8") as f:
            f.write("\n[밖](../docs/README.md)\n")
        r = self.check(target, "--json")
        self.assertEqual(r.returncode, 1)
        kinds = {(f["kind"], f["path"]) for f in json.loads(r.stdout)["findings"]}
        self.assertIn(("relative-ref", ".agents/rules/writing-style.md"), kinds)

    def test_v1_lock_is_one_line_and_exit_0(self):
        target = self.tmp / "sh" / "acme-notes"
        r = run(["bash", str(SETUP), "--stack=go", "--agents=claude", str(target)], self.tmp, env=base_env(TOKENS))
        self.assertEqual(r.returncode, 0, r.stderr)
        c = self.check(target)
        self.assertEqual((c.returncode, c.stdout), (0, "lock v1 — 배치 검사는 v2부터\n"))

    def test_five_hundred_entries_in_a_second(self):
        target = self.cli_install(agents="all", modules="all", stack="web")
        entries = len(json.loads((target / ".agents/knots-sync.lock").read_text(encoding="utf-8"))["entries"])
        self.assertGreater(entries, 300)
        started = time.monotonic()
        r = self.check(target)
        took = time.monotonic() - started
        self.assertEqual(r.returncode, 0, r.stdout[-2000:])
        self.assertLess(took * 500 / entries, 1.5, f"{entries}개 {took:.2f}s")


if __name__ == "__main__":
    unittest.main()
