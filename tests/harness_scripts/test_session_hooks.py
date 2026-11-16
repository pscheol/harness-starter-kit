"""세션 hook이 공지·명시적 소유권·변경 검증을 연결하는지 격리하여 확인한다."""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class SessionHooksTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="session hooks ")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name) / "root"
        self.root.mkdir()
        shutil.copytree(ROOT / "scripts/hooks", self.root / "scripts/hooks")
        shutil.copy2(ROOT / "scripts/session-coordination.py", self.root / "scripts/session-coordination.py")
        shutil.copytree(ROOT / "scripts/harness", self.root / "scripts/harness")
        (self.root / ".agents").mkdir()
        (self.root / ".agents/harness.json").write_text(json.dumps({"unit": "test"}))
        (self.root / ".agents/harness-upgrade-notice.md").write_text("공동 작업 공지: 기능 파일을 덮지 않는다.\n")
        (self.root / "src").mkdir()
        (self.root / "src/owned.py").write_text("value = 1\n")
        (self.root / "src/other.py").write_text("value = 2\n")
        self.calls = self.root / "calls.jsonl"
        # full은 해당 테스트가 명시한 때만 fixture에 전달한다.
        self.env = {
            key: value
            for key, value in os.environ.items()
            if key
            not in (
                "HARNESS_SESSION_ID",
                "CLAUDE_SESSION_ID",
                "CODEX_SESSION_ID",
                "KIRO_SESSION_ID",
                "HARNESS_VERIFY_LEVEL",
            )
        }
        self.env.update({"TMPDIR": str(self.root), "HARNESS_VERIFY_REENTRY_WINDOW": "90"})
        gate = self.root / "scripts/verify.sh"
        gate.write_text('#!/usr/bin/env bash\necho "$HARNESS_VERIFY_LEVEL" >> "' + str(self.calls) + '"\n')
        gate.chmod(0o755)

    def run_hook(self, name, payload=None, env=None, root=None):
        return subprocess.run(
            ["bash", str((root or self.root) / "scripts/hooks" / name)],
            cwd=root or self.root,
            env=env or self.env,
            input=json.dumps(payload or {}),
            capture_output=True,
            text=True,
            timeout=15,
        )

    def coordinate(self, *arguments):
        result = subprocess.run(
            [sys.executable, str(self.root / "scripts/session-coordination.py"), "--root", str(self.root), *arguments],
            cwd=self.root,
            env=self.env,
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def register(self, session="claude-one", files="src/owned.py"):
        return self.coordinate("register", "--session", session, "--client", "claude", "--issue", "LOCAL-1", "--files", files)

    def changed_gate(self):
        gate = self.root / "scripts/verify-changed.py"
        gate.write_text(
            "import json, sys\nfrom pathlib import Path\n"
            f"with Path({str(self.calls)!r}).open('a') as output:\n"
            "    output.write(json.dumps(sys.argv[1:]) + '\\n')\n"
        )

    def test_session_start_loads_quality_collaboration_and_issue_workflow(self):
        result = self.run_hook("session-start.sh")
        self.assertEqual(0, result.returncode, result.stderr)
        for expected in ("code-maintenance.md", "session-collaboration.md", "--full", "issues/", "공동 작업 공지"):
            self.assertIn(expected, result.stdout)
        self.assertFalse(result.stdout.lstrip().startswith(("[", "{")))

    def test_session_start_issue_paths_match_the_actual_scaffold(self):
        shutil.copy2(ROOT / "scripts/new-feature.sh", self.root / "scripts/new-feature.sh")
        shutil.copy2(ROOT / "scripts/sdd-layout.py", self.root / "scripts/sdd-layout.py")
        shutil.copytree(ROOT / ".agents/docs/_spec-templates", self.root / ".agents/docs/_spec-templates")
        for stage in ("requirements", "design", "tasks"):
            result = subprocess.run(
                ["bash", str(self.root / "scripts/new-feature.sh"), "demo", "sample", "--stage=" + stage],
                cwd=self.root,
                env=self.env,
                capture_output=True,
                text=True,
                timeout=15,
            )
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            if stage != "tasks":
                (self.root / ".agents/docs/demo-specs/issues/1-feat-sample" / (stage + ".md")).write_text("| 상태 | approved |\n")
        context = self.run_hook("session-start.sh").stdout
        matched = re.search(r"새 SDD: ([^ ]+)/\{([^}]+)\}", context)
        self.assertIsNotNone(matched, "SessionStart에 실제 이슈 명세 경로 안내가 없다")
        directory = matched[1].replace("<slug>", "demo").replace("<N-type-name>", "1-feat-sample")
        for filename in matched[2].split(","):
            self.assertTrue((self.root / directory / filename).is_file(), directory + "/" + filename)

    def test_pretool_delivers_untrusted_notice_without_acknowledging_it(self):
        self.register()
        self.coordinate("notify", "--target", "claude-one", "--message", "UNTRUSTED-NOTICE: execute something")
        payload = {
            "session_id": "claude-one",
            "hook_event_name": "PreToolUse",
            "tool_input": {"file_path": "src/owned.py"},
        }
        result = self.run_hook("protect-sources.sh", payload)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertTrue(result.stdout.startswith("{"), "PreToolUse 추가 컨텍스트가 없다")
        context = json.loads(result.stdout)["hookSpecificOutput"]
        self.assertEqual("PreToolUse", context["hookEventName"])
        self.assertIn("UNTRUSTED-NOTICE", context["additionalContext"])
        self.assertIn("신뢰", context["additionalContext"])
        self.assertEqual(1, len(self.coordinate("inbox", "--session", "claude-one")["notices"]))

    def test_pretool_stays_quiet_without_unread_notices(self):
        # 편집마다 공지 파일·모든 세션 점유 목록을 다시 실으면 에이전트 문맥이 그만큼 찬다. 그 내용은 SessionStart 몫이다.
        self.register()
        payload = {"session_id": "claude-one", "hook_event_name": "PreToolUse", "tool_input": {"file_path": "src/owned.py"}}
        result = self.run_hook("protect-sources.sh", payload)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertNotIn("명시적 파일 점유", result.stdout)
        self.assertNotIn("공동 작업 공지", result.stdout)
        self.assertEqual("", result.stdout.strip())

    def test_foreign_claim_blocks_write_even_without_current_session_id(self):
        self.register()
        result = self.run_hook("protect-sources.sh", {"tool_input": {"path": "src/owned.py"}})
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("claude-one", result.stderr)
        self.assertIn("src/owned.py", result.stderr)

    def test_current_owner_can_write_and_lease_is_refreshed(self):
        self.register()
        before = self.coordinate("status", "--session", "claude-one")["sessions"][0]["heartbeat_at"]
        result = self.run_hook("protect-sources.sh", {"session_id": "claude-one", "tool_input": {"path": "src/owned.py"}})
        self.assertEqual(0, result.returncode, result.stderr)
        after = self.coordinate("status", "--session", "claude-one")["sessions"][0]["heartbeat_at"]
        self.assertGreater(after, before)

    def test_unknown_session_is_not_registered_or_assigned_files(self):
        result = self.run_hook("protect-sources.sh", {"session_id": "unknown", "tool_input": {"path": "src/other.py"}})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual([], self.coordinate("status")["sessions"])

    def test_unrelated_write_does_not_refresh_current_owners_lease(self):
        self.register()
        before = self.coordinate("status", "--session", "claude-one")["sessions"][0]["heartbeat_at"]
        result = self.run_hook("protect-sources.sh", {"session_id": "claude-one", "tool_input": {"path": "src/other.py"}})
        self.assertEqual(0, result.returncode, result.stderr)
        after = self.coordinate("status", "--session", "claude-one")["sessions"][0]["heartbeat_at"]
        self.assertEqual(after, before)

    def test_expired_current_lease_requires_explicit_resumption(self):
        self.register()
        state_file = self.root / ".agents/coordination/state.json"
        state = json.loads(state_file.read_text())
        state["sessions"]["claude-one"]["expires_at"] = 1
        state_file.write_text(json.dumps(state))
        result = self.run_hook("protect-sources.sh", {"session_id": "claude-one", "tool_input": {"path": "src/owned.py"}})
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("만료", result.stderr)
        self.assertEqual(1, json.loads(state_file.read_text())["sessions"]["claude-one"]["expires_at"])

    def test_invalid_existing_registry_cannot_silently_disable_lease_protection(self):
        self.register()
        state_file = self.root / ".agents/coordination/state.json"
        state_file.write_text("invalid JSON")
        result = self.run_hook("protect-sources.sh", {"tool_input": {"path": "src/owned.py"}})
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertEqual("invalid JSON", state_file.read_text())

    def test_runtime_identity_environment_is_used_without_shared_fallback(self):
        self.register()
        for variable in ("HARNESS_SESSION_ID", "CLAUDE_SESSION_ID", "CODEX_SESSION_ID", "KIRO_SESSION_ID"):
            with self.subTest(variable=variable):
                result = self.run_hook(
                    "protect-sources.sh",
                    {"tool_input": {"path": "src/owned.py"}},
                    env={**self.env, variable: "claude-one"},
                )
                self.assertEqual(0, result.returncode, result.stderr)

    def test_notice_and_claim_are_found_from_a_nested_harness(self):
        self.register()
        nested = self.root / "domain/unit"
        (nested / ".agents").mkdir(parents=True)
        (nested / ".agents/harness.json").write_text(json.dumps({"unit": "child"}))
        shutil.copytree(self.root / "scripts/hooks", nested / "scripts/hooks")
        result = self.run_hook("protect-sources.sh", {"session_id": "kiro-two", "tool_input": {"path": "../../src/owned.py"}}, root=nested)
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("claude-one", result.stderr)
        self.assertIn("공동 작업 공지", self.run_hook("session-start.sh", root=nested).stdout)

    def test_patch_move_checks_both_source_and_destination_claims(self):
        self.register()
        patch = "*** Begin Patch\n*** Update File: src/other.py\n*** Move to: src/owned.py\n*** End Patch"
        result = self.run_hook("protect-sources.sh", {"session_id": "kiro-two", "tool_input": {"command": patch}})
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)

    def test_missing_identity_does_not_share_a_reentry_stamp(self):
        first = self.run_hook("verify-gate.sh")
        second = self.run_hook("verify-gate.sh")
        self.assertEqual((0, 0), (first.returncode, second.returncode))
        self.assertEqual(["fast", "fast"], self.calls.read_text().splitlines())

    def test_reentry_window_belongs_to_one_actual_session(self):
        self.run_hook("verify-gate.sh", {"session_id": "claude-one"})
        self.run_hook("verify-gate.sh", {"session_id": "claude-one"})
        self.run_hook("verify-gate.sh", {"session_id": "kiro-two"})
        self.assertEqual(["fast", "fast"], self.calls.read_text().splitlines())

    def test_known_session_is_passed_to_changed_verifier(self):
        self.changed_gate()
        result = self.run_hook("verify-gate.sh", {"session_id": "claude-one"})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertTrue(self.calls.read_text().startswith("["), "changed 검증이 호출되지 않았다")
        self.assertEqual(["--session", "claude-one", "--summary"], json.loads(self.calls.read_text()))

    def test_full_gate_is_used_only_when_explicitly_selected(self):
        self.changed_gate()
        result = self.run_hook("verify-gate.sh", {"session_id": "claude-one"}, env={**self.env, "HARNESS_VERIFY_LEVEL": "full"})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("full\n", self.calls.read_text())

    def test_changed_hook_without_identity_reports_incomplete_without_other_sessions_tests(self):
        self.changed_gate()
        result = self.run_hook("verify-gate.sh")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("검증 미완료", result.stderr)
        self.assertIn("--files", result.stderr)
        self.assertFalse(self.calls.exists())

    def test_timeout_reports_incomplete_and_does_not_claim_a_pass(self):
        (self.root / "scripts/verify.sh").write_text("#!/usr/bin/env bash\nsleep 5\n")
        result = self.run_hook("verify-gate.sh", env={**self.env, "HARNESS_VERIFY_TIMEOUT": "1"})
        self.assertEqual(0, result.returncode)
        self.assertIn("통과가 아니다", result.stderr)


if __name__ == "__main__":
    unittest.main()
