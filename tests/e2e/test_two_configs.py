"""두 구성 e2e(e2e-stub) 시험 — 설계 11 §3.4 · MG-R7. 가짜 aidlc · entire 로 세 구성(A · B 두 설치 순서)을 돌린다.

    python3 -m unittest discover -s tests/e2e -p "test_*.py"

일반 시험(`unittest discover -s tests`)에는 들어가지 않는다 — 릴리스 점검(scripts/release.sh)과 MR 의 e2e 단계에서 따로 돈다.
에이전트 세션 안에서 돌리면 승인 API 가 닫혀 승인 이후 단계는 건너뜀으로 기록된다(DB-R22). 사람 터미널 · CI 에서는 끝까지 돈다.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


@unittest.skipUnless(shutil.which("node") and shutil.which("git"), "node · git 이 필요하다")
class TwoConfigsStubTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        out = Path(tempfile.mkdtemp(prefix="hk-e2e-report-")) / "report.json"
        cls.proc = subprocess.run([sys.executable, str(HERE / "two_configs.py"), "--mode", "stub", "--json-out", str(out)], capture_output=True, text=True, timeout=1500)
        cls.report = json.loads(out.read_text(encoding="utf-8")) if out.is_file() else {"results": [], "measurements": {}}
        shutil.rmtree(out.parent, ignore_errors=True)

    def status(self, config: str, cid: str) -> str | None:
        found = [r["status"] for r in self.report["results"] if r["config"] == config and r["id"] == cid]
        return found[0] if found else None

    def test_no_failures_and_exit_code_zero(self):
        failed = [r for r in self.report["results"] if r["status"] == "fail"]
        self.assertEqual([], failed, self.proc.stdout[-1500:])
        self.assertEqual(0, self.proc.returncode, self.proc.stdout[-1500:])

    def test_all_three_configs_installed_and_doctor_is_clean(self):
        for config in ("A", "B-forward", "B-reverse"):
            self.assertEqual("pass", self.status(config, "S0.doctor-check"), config)
            self.assertEqual("pass", self.status(config, "S2.intent-check"), config)

    def test_units_json_has_the_same_keys_in_a_and_b(self):
        for config in ("A↔B-forward", "A↔B-reverse"):
            self.assertEqual("pass", self.status(config, "E1.units-json-keys"), config)

    def test_external_files_survive_kit_commands_and_remove_in_both_orders(self):
        for config in ("B-forward", "B-reverse"):
            for cid in ("E5.after-update", "E5.after-repair", "E5.after-uninstall", "E6.remove-modules"):
                self.assertEqual("pass", self.status(config, cid), f"{config} {cid}")

    def test_per_module_session_load_is_recorded(self):
        load = self.report["measurements"].get("load", {})
        owners = {o for l in load.get("B-forward", []) for o in l["owners"]}
        self.assertTrue({"kit", "external:aidlc", "external:entire"} <= owners, owners)
        a_only = {o for l in load.get("A", []) for o in l["owners"]}
        self.assertEqual({"kit"}, a_only)


if __name__ == "__main__":
    unittest.main()
