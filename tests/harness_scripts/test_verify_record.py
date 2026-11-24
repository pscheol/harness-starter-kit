"""실행 기록 `.agents/state/verify-last.json`(HK-4 R5) — 네 레벨, 원자적 쓰기, 쓰기 실패, 직전 실행, 차단."""

import json
import sys
import unittest
from pathlib import Path

from verify_fixture import SOURCE, VerifyFixture

RECORD = ".agents/state/verify-last.json"
STEP_KEYS = {"id", "unit", "kind", "label", "command", "cwd", "startedAt", "durationMs", "exitCode", "status"}
STATUSES = {"passed", "failed", "incomplete", "noop", "blocked"}
FAILING_BODY = """#!/usr/bin/env bash
set -uo pipefail
# BEGIN HARNESS VERIFICATION ENTRY
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-entry.sh"
# END HARNESS VERIFICATION ENTRY
echo "▶ 구조"
echo "  구조 이상 없음"
echo "▶ 린트"
echo "✖ 린트 실패"
echo "검증 실패(${HARNESS_VERIFY_LEVEL})"
exit 1
"""


def assert_schema(case, record, level):
    for key, kind in {
        "schema": str, "runId": str, "level": str, "trigger": str, "harness": str, "root": str,
        "head": dict, "startedAt": str, "finishedAt": str, "durationMs": int, "status": str,
        "files": dict, "units": list, "skippedUnits": list, "steps": list, "widened": list,
        "unverified": list, "recommendations": list, "previous": dict,
    }.items():
        case.assertIsInstance(record.get(key), kind, key)
    case.assertEqual("knots-sync.verify-last/v1", record["schema"])
    case.assertRegex(record["runId"], r"^\d{8}T\d{6}Z-[0-9a-f]{4}$")
    case.assertEqual(level, record["level"])
    case.assertIn(record["status"], STATUSES)
    case.assertIn("sessionId", record)
    case.assertIn("base", record)
    case.assertIn("exitCode", record)
    case.assertEqual(record["files"]["count"] >= len(record["files"]["sample"]), True)
    case.assertLessEqual(len(record["files"]["sample"]), 20)
    for step in record["steps"]:
        case.assertTrue(STEP_KEYS.issubset(step), step)
        case.assertIsInstance(step["durationMs"], int)


class RecordTest(VerifyFixture):
    def setUp(self):
        super().setUp()
        self.write("pyproject.toml", "[project]\nname='sample'\nversion='0.1.0'\n[dependency-groups]\ndev=['pytest']\n")
        self.write("src/sample/price.py", "def price():\n    return 1\n")
        self.write("tests/test_price.py", "from sample.price import price\ndef test_price():\n    assert price() == 1\n")
        self.fake(".venv-verify/bin/python")

    def record(self):
        return json.loads((self.root / RECORD).read_text())

    def state_files(self):
        return sorted(path.name for path in (self.root / ".agents/state").iterdir())

    def test_changed_run_writes_a_schema_valid_record_atomically(self):
        result = self.run_cli("--files", "src/sample/price.py")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        record = self.record()
        assert_schema(self, record, "changed")
        self.assertEqual(("passed", 0), (record["status"], record["exitCode"]))
        self.assertEqual({"count": 1, "sample": ["src/sample/price.py"]}, record["files"])
        test_step = next(step for step in record["steps"] if step["kind"] == "test")
        self.assertIn("pytest", test_step["command"])
        self.assertEqual(("passed", 0), (test_step["status"], test_step["exitCode"]))
        self.assertEqual({"run": 1, "failed": 0}, test_step.get("tests"))
        self.assertEqual([".gitignore", "verify-last.json"], self.state_files())
        self.assertEqual("*\n", (self.root / ".agents/state/.gitignore").read_text())

    def test_affected_run_records_modules(self):
        result = self.run_cli("--level", "affected", "--files", "src/sample/price.py")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        record = self.record()
        assert_schema(self, record, "affected")
        self.assertEqual("sample", record["units"][0]["id"])
        self.assertEqual(["."], record["units"][0]["modules"])

    def test_fast_and_full_bodies_are_recorded_through_the_tee(self):
        self.gate(FAILING_BODY)
        for level in ("fast", "full"):
            with self.subTest(level=level):
                result = self.run_gate("--" + level)
                self.assertEqual(1, result.returncode, result.stdout + result.stderr)
                expected = f"▶ 구조\n  구조 이상 없음\n▶ 린트\n✖ 린트 실패\n검증 실패({level})\n"
                self.assertEqual(expected, result.stdout)
                record = self.record()
                assert_schema(self, record, level)
                self.assertEqual(("failed", 1), (record["status"], record["exitCode"]))
                steps = [(step["label"], step["status"], step["exitCode"], step["command"]) for step in record["steps"]]
                self.assertEqual([("구조", "passed", 0, None), ("린트", "failed", 1, None)], steps)

    def test_previous_keeps_the_last_run_of_each_level(self):
        self.gate()
        self.assertEqual(0, self.run_cli("--files", "src/sample/price.py").returncode)
        first = self.record()["runId"]
        self.assertEqual(0, self.run_gate("--fast").returncode)
        record = self.record()
        self.assertEqual(first, record["previous"]["changed"]["runId"])
        self.assertEqual("passed", record["previous"]["changed"]["status"])
        self.assertEqual(0, self.run_cli("--files", "README.md").returncode)
        self.assertEqual({"changed", "fast"}, set(self.record()["previous"]))

    def test_write_failure_keeps_the_exit_code(self):
        self.gate()
        self.write(".agents/state", "파일이라 폴더를 만들 수 없다\n")
        result = self.run_cli("--files", "src/sample/price.py")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("⚠ 검증 기록을 쓰지 못했다", result.stderr)
        result = self.run_gate("--fast")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("⚠ 검증 기록을 쓰지 못했다", result.stderr)

    def test_plan_writes_no_record(self):
        self.plan("--files", "src/sample/price.py")
        self.assertFalse((self.root / RECORD).exists())

    def test_blocked_full_in_an_agent_session_is_recorded(self):
        self.gate()
        result = self.run_gate("--full", extra={"CLAUDECODE": "1"})
        self.assertEqual(3, result.returncode, result.stdout + result.stderr)
        self.assertNotIn("body", result.stdout)
        record = self.record()
        assert_schema(self, record, "full")
        self.assertEqual(("blocked", 3), (record["status"], record["exitCode"]))
        self.assertEqual("claude", record["harness"])

    def test_trigger_and_harness_come_from_the_environment(self):
        result = self.run_cli("--files", "README.md", env={**self.env, "HARNESS_VERIFY_TRIGGER": "stop-hook", "CLAUDECODE": "1"})
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(("stop-hook", "claude"), (self.record()["trigger"], self.record()["harness"]))
        result = self.run_cli("--files", "README.md", env={**self.env, "CI": "true"})
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(("ci", "ci"), (self.record()["trigger"], self.record()["harness"]))
        self.assertEqual(0, self.run_cli("--files", "README.md").returncode)
        self.assertEqual(("cli", "human"), (self.record()["trigger"], self.record()["harness"]))

    def test_error_run_is_recorded_as_incomplete(self):
        result = self.run_cli("--files", "../outside.py")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        record = self.record()
        self.assertEqual(("incomplete", 2), (record["status"], record["exitCode"]))

    def test_oversized_record_is_trimmed_under_the_cap(self):
        sys.path.insert(0, str(self.root / "scripts"))
        self.addCleanup(sys.path.remove, str(self.root / "scripts"))
        from harness import verify_record

        steps = [{"id": index, "command": ["x" * 200] * 50, "label": "step"} for index in range(400)]
        text = verify_record.fit({"steps": steps, "files": {"count": 0, "sample": []}})
        self.assertLessEqual(len(text.encode()), 256 * 1024)
        self.assertTrue(json.loads(text)["truncated"])


class InstalledIgnoreTest(unittest.TestCase):
    def test_installed_gitignore_ignores_the_state_folder(self):
        ignore = Path(SOURCE).parent / ".gitignore"
        self.assertIn(".agents/state/", ignore.read_text().splitlines())


if __name__ == "__main__":
    unittest.main()
