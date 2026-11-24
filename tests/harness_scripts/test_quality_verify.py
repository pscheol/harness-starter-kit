"""정적 분석을 검증 레벨에 붙인다(HK-16 설계 09 §3.2 · §3.4 · §3.5 기준선 갱신) — verify-changed.py · verify.sh · quality.py."""

import json
import unittest

from quality_fixture import REPORTS, QualityFixture, analyzer, result
from verify_fixture import GATE_BODY

PASSING_BODY = GATE_BODY + 'echo "검증 통과"\nexit 0\n'


class VerifyLevelTest(QualityFixture):
    def setUp(self):
        super().setUp()
        self.gate(PASSING_BODY)
        self.write("docs/guide.md", "# 안내\n")
        self.commit("base")
        self.gate_config()
        self.fake_analyzer("scan", [result("secret", "docs/guide.md", 1, properties={"security-severity": "9.8"})])
        self.registry(analyzer("scan"))

    def test_changed_and_affected_verification_include_the_analysis(self):
        self.write("docs/guide.md", "# 안내\n바뀐 줄\n")
        changed = self.run_cli("--files", "docs/guide.md", "--summary")
        self.assertEqual(changed.returncode, 0, changed.stdout + changed.stderr)
        self.assertIn("정적 분석(changed)", changed.stdout)
        self.assertIn("scan: 새 1", changed.stdout)
        self.assertEqual(len(self.tool_calls("scan")), 1)
        self.baseline({})
        affected = self.run_cli("--level", "affected", "--files", "docs/guide.md", "--summary")
        self.assertEqual(affected.returncode, 1, affected.stdout + affected.stderr)
        self.assertIn("품질 게이트 failed(affected)", affected.stdout)
        self.assertLessEqual(len(affected.stdout.splitlines()), 40)
        record = json.loads((self.root / ".agents/state/verify-last.json").read_text())
        self.assertEqual(record["status"], "failed")
        self.assertEqual(record["analysis"]["status"], "failed")
        self.assertEqual(record["analysis"]["newIssues"]["CRITICAL"], 1)

    def test_json_output_carries_compact_analysis(self):
        self.write("docs/guide.md", "# 안내\n바뀐 줄\n")
        run = self.run_cli("--files", "docs/guide.md")
        payload = json.loads(run.stdout)
        self.assertEqual(payload["analysis"]["gate"], "warned")
        self.assertNotIn("findings", payload["analysis"])

    def test_stop_hook_changed_run_skips_static_analysis(self):
        self.write("docs/guide.md", "# 안내\n바뀐 줄\n")
        run = self.run_cli("--files", "docs/guide.md", "--summary", env={**self.env, "HARNESS_VERIFY_TRIGGER": "stop-hook"})
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(self.tool_calls("scan"), [])
        self.assertNotIn("정적 분석", run.stdout)

    def test_fast_checks_configuration_without_running_analyzers(self):
        fast = self.run_gate("--fast")
        self.assertEqual(fast.returncode, 0, fast.stdout + fast.stderr)
        self.assertIn("정적 분석 설정", fast.stdout)
        self.assertEqual(self.tool_calls("scan"), [])
        self.gate_config(newIssues={"CRITICAL": 3, "HIGH": None, "MEDIUM": None, "LOW": None})
        lowered = self.run_gate("--fast")
        self.assertEqual(lowered.returncode, 1, lowered.stdout + lowered.stderr)
        self.assertIn("newIssues.CRITICAL", lowered.stdout)
        self.write(".agents/analyzers.json", "{broken")
        self.assertEqual(self.run_gate("--fast").returncode, 1)

    def test_full_runs_every_analyzer_on_the_whole_repo(self):
        self.baseline({})
        full = self.run_gate("--full")
        self.assertEqual(full.returncode, 1, full.stdout + full.stderr)
        self.assertEqual(self.tool_calls("scan")[-1]["arguments"][-1], ".")
        self.assertIn("품질 게이트 failed(full)", full.stdout)
        record = json.loads((self.root / ".agents/state/verify-last.json").read_text())
        self.assertEqual((record["level"], record["status"]), ("full", "failed"))
        self.assertTrue(any("정적 분석" in step["label"] and step["status"] == "failed" for step in record["steps"]))


class BaselineUpdateTest(QualityFixture):
    def setUp(self):
        super().setUp()
        self.gate(PASSING_BODY)
        self.write("src/app.py", "token = 'AKIA0000'\n")
        self.gate_config()
        self.fake_analyzer("scan", [result("secret", "src/app.py", 1, level="error")])
        self.registry(analyzer("scan"))
        self.commit("base")

    def test_agent_session_cannot_update_the_baseline(self):
        run = self.quality("baseline", "--update", extra={"CLAUDECODE": "1"})
        self.assertEqual(run.returncode, 3, run.stdout + run.stderr)
        disguised = self.quality("baseline", "--update", extra={"CLAUDECODE": "1", "CI": "true"})
        self.assertEqual(disguised.returncode, 3, disguised.stdout + disguised.stderr)
        self.assertFalse((self.root / ".agents/quality-baseline.json").exists())

    def test_update_needs_a_full_run_on_the_base_branch(self):
        self.quality("run", "--level", "affected", "--files", "src/app.py")
        refused = self.quality("baseline", "--update")
        self.assertEqual(refused.returncode, 1, refused.stdout + refused.stderr)
        self.assertIn("full", refused.stdout + refused.stderr)
        self.assertEqual(self.quality("run", "--level", "full").returncode, 0)
        updated = self.quality("baseline", "--update")
        self.assertEqual(updated.returncode, 0, updated.stdout + updated.stderr)
        baseline = json.loads((self.root / ".agents/quality-baseline.json").read_text())
        self.assertEqual(baseline["schema"], "knots-sync.quality-baseline/v1")
        self.assertEqual(baseline["commit"], self.git("rev-parse", "--short=7", "HEAD"))
        self.assertEqual([entry["ruleId"] for entry in baseline["findings"]["scan"].values()], ["secret"])
        self.commit("baseline")
        self.assertEqual(self.quality("run", "--level", "affected", "--files", "src/app.py").returncode, 0)
        self.assertEqual([item["new"] for item in self.findings()], [False])

    def test_update_refuses_other_branches(self):
        self.git("checkout", "-q", "-b", "feat/HK-1-x")
        self.assertEqual(self.quality("run", "--level", "full").returncode, 0)
        refused = self.quality("baseline", "--update")
        self.assertEqual(refused.returncode, 1, refused.stdout + refused.stderr)
        self.assertIn("develop", refused.stdout + refused.stderr)


class ScanSummaryTest(QualityFixture):
    def setUp(self):
        super().setUp()
        lines = "".join(f"value_{i} = eval(data_{i})\n" for i in range(7))
        self.write("src/app.py", lines + "password = 'x'\n")
        self.gate_config()
        self.fake_analyzer("scan", [result("python.eval", "src/app.py", i + 1) for i in range(7)] + [result("hardcoded", "src/app.py", 8, level="error")])
        self.registry(analyzer("scan"))
        self.commit("base")

    def test_scan_groups_repeated_rules_and_flags_stale_results(self):
        missing = self.quality("scan")
        self.assertEqual(missing.returncode, 3, missing.stdout + missing.stderr)
        self.assertIn("bash scripts/verify.sh --affected", missing.stdout)
        self.quality("run", "--level", "affected", "--files", "src/app.py")
        scan = self.quality("scan")
        self.assertEqual(scan.returncode, 0, scan.stdout + scan.stderr)
        self.assertIn("python.eval", scan.stdout)
        self.assertIn("7건", scan.stdout)
        self.assertEqual(sum("python.eval" in line for line in scan.stdout.splitlines()), 1)
        self.assertIn("src/app.py:8", scan.stdout)
        self.assertLessEqual(len(scan.stdout.splitlines()), 40)
        self.write("src/other.py", "x = 1\n")
        self.commit("next")
        stale = self.quality("scan")
        self.assertEqual(stale.returncode, 3, stale.stdout)

    def test_reports_folder_is_not_a_change(self):
        self.quality("run", "--level", "affected", "--files", "src/app.py")
        self.assertTrue((self.root / REPORTS / "findings-latest.json").is_file())
        status = self.git("status", "--porcelain")
        self.assertEqual(status, "")


if __name__ == "__main__":
    unittest.main()
