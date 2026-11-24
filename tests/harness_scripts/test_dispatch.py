"""디스패처 · 훅 루트(설계 03 §3.10 · §5 #3, HK-24 design §4). worktree 세션의 훅은 그 worktree 를 기준으로 돈다.

    python3 -m unittest discover -s scripts/tests -p "test_dispatch.py"
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKERS = ("CLAUDECODE", "CLAUDE_CODE_", "CODEX_", "KIRO_", "HX_", "HARNESS_", "CLAUDE_SESSION_ID", "GIT_")


def clean_env(**extra):
    env = {key: value for key, value in os.environ.items() if not key.startswith(MARKERS)}
    env.update({"PYTHONDONTWRITEBYTECODE": "1", "GIT_CONFIG_NOSYSTEM": "1"})
    env.update(extra)
    return env


def git(cwd, *arguments):
    subprocess.run(["git", "-c", "maintenance.auto=false", "-c", "gc.auto=0", *arguments], cwd=cwd, check=True, capture_output=True, text=True)


class DispatchCase(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="dispatch ")
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name).resolve()
        self.main = self.base / "repo"
        (self.main / "scripts").mkdir(parents=True)
        shutil.copytree(ROOT / "scripts/hooks", self.main / "scripts/hooks", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / "scripts/harness", self.main / "scripts/harness", ignore=shutil.ignore_patterns("__pycache__"))
        (self.main / ".agents").mkdir()
        for name in ("hooks.json", "knots-sync.json", "harness.json"):
            if (ROOT / ".agents" / name).is_file():
                shutil.copy2(ROOT / ".agents" / name, self.main / ".agents" / name)
        (self.main / ".gitignore").write_text(".agents/state/\n", encoding="utf-8")
        self.calls = self.base / "calls.txt"
        verify = self.main / "scripts/verify.sh"
        verify.write_text(f'#!/usr/bin/env bash\npwd >> "{self.calls}"\n', encoding="utf-8")
        verify.chmod(0o755)
        git(self.main, "init", "-q", "-b", "develop")
        git(self.main, "config", "user.email", "kim@example.com")
        git(self.main, "config", "user.name", "Kim")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "init")
        self.tree = self.base / "repo.worktrees" / "feat"
        git(self.main, "worktree", "add", "-q", "-b", "feat/HK-1-x", str(self.tree))
        (self.main / ".agents/state").mkdir(mode=0o700)

    def dispatch(self, hook_id, script, payload, cwd=None, **env):
        return subprocess.run(["bash", str(self.main / "scripts/hooks/dispatch.sh"), hook_id, script], cwd=cwd or self.main,
                              input=json.dumps(payload), env=clean_env(CLAUDE_PROJECT_DIR=str(self.main), TMPDIR=str(self.base), **env),
                              capture_output=True, text=True, timeout=60)

    def log(self):
        path = self.main / ".agents/state/hook-output.jsonl"
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] if path.is_file() else []


class WorktreeRootTest(DispatchCase):
    def test_protected_write_from_worktree_session_is_blocked(self):
        payload = {"session_id": "s-1", "hook_event_name": "PreToolUse", "cwd": str(self.tree), "tool_input": {"file_path": "docs/references/a.md"}}
        result = self.dispatch("harness-protect-sources", "scripts/hooks/protect-sources.sh", payload)
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("차단", result.stderr)

    def test_stop_hook_verifies_the_worktree_not_the_main_folder(self):
        payload = {"session_id": "s-1", "hook_event_name": "Stop", "cwd": str(self.tree)}
        result = self.dispatch("harness-verify-gate", "scripts/hooks/verify-gate.sh", payload, HARNESS_VERIFY_LEVEL="fast")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual([str(self.tree)], [str(Path(p).resolve()) for p in self.calls.read_text(encoding="utf-8").splitlines()])

    def test_session_in_main_folder_uses_main_root(self):
        payload = {"session_id": "s-2", "hook_event_name": "Stop", "cwd": str(self.main / "scripts")}
        result = self.dispatch("harness-verify-gate", "scripts/hooks/verify-gate.sh", payload, HARNESS_VERIFY_LEVEL="fast")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual([str(self.main)], [str(Path(p).resolve()) for p in self.calls.read_text(encoding="utf-8").splitlines()])

    def test_old_branch_worktree_falls_back_to_dispatcher_script_with_worktree_root(self):
        echo = self.main / "scripts/hooks/echo-root.sh"
        echo.write_text('#!/usr/bin/env bash\nprintf "%s|%s|%s\\n" "$HARNESS_ROOT" "$HARNESS_WORKTREE" "$HARNESS_MAIN_ROOT"\n', encoding="utf-8")
        self.assertFalse((self.tree / "scripts/hooks/echo-root.sh").exists())
        result = self.dispatch("harness-echo", "scripts/hooks/echo-root.sh", {"cwd": str(self.tree / "scripts")})
        self.assertEqual(0, result.returncode, result.stderr)
        root, worktree, main = result.stdout.strip().split("|")
        self.assertEqual((str(self.tree), "1", str(self.main)), (str(Path(root).resolve()), worktree, str(Path(main).resolve())))

    def test_missing_or_relative_cwd_falls_back_to_dispatcher_root(self):
        echo = self.main / "scripts/hooks/echo-root.sh"
        echo.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$HARNESS_ROOT"\n', encoding="utf-8")
        for payload in ({}, {"cwd": "relative/dir"}, {"cwd": str(self.base / "nowhere")}):
            with self.subTest(payload=payload):
                result = self.dispatch("harness-echo", "scripts/hooks/echo-root.sh", payload)
                self.assertEqual(str(self.main), str(Path(result.stdout.strip()).resolve()))
        outside = self.base / "outside"
        outside.mkdir()
        result = self.dispatch("harness-echo", "scripts/hooks/echo-root.sh", {"cwd": str(outside)})
        self.assertEqual(str(self.main), str(Path(result.stdout.strip()).resolve()))
        self.assertIn("하네스 루트를 못 찾아", result.stderr)

    def test_script_outside_scripts_is_refused(self):
        result = self.dispatch("harness-x", "../etc/passwd", {})
        self.assertEqual(0, result.returncode)
        self.assertEqual("", result.stdout)


class OutputBudgetTest(DispatchCase):
    def test_output_over_max_is_cut_at_a_line_and_logged_without_content(self):
        big = self.main / "scripts/hooks/big.sh"
        big.write_text('#!/usr/bin/env bash\nfor i in $(seq 1 200); do echo "비밀아닌줄-$i 가나다라마바사아자차카타파하"; done\nexit 3\n', encoding="utf-8")
        result = self.dispatch("harness-session-start", "scripts/hooks/big.sh", {"hook_event_name": "SessionStart", "cwd": str(self.main)})
        self.assertEqual(3, result.returncode)
        data = result.stdout.encode("utf-8")
        self.assertLessEqual(len(data), 2560)
        self.assertTrue(result.stdout.endswith("\n"))
        self.assertTrue(result.stdout.startswith("비밀아닌줄-1 "))
        entry = self.log()[-1]
        self.assertEqual({"at", "event", "hook", "bytes", "truncated", "exit"}, set(entry))
        self.assertEqual(("SessionStart", "harness-session-start", True, 3), (entry["event"], entry["hook"], entry["truncated"], entry["exit"]))
        self.assertGreater(entry["bytes"], 2560)
        self.assertNotIn("비밀아닌줄", (self.main / ".agents/state/hook-output.jsonl").read_text(encoding="utf-8"))

    def test_hooks_without_max_are_not_cut_and_quiet_hooks_log_zero_bytes(self):
        result = self.dispatch("harness-protect-sources", "scripts/hooks/protect-sources.sh",
                               {"hook_event_name": "PreToolUse", "cwd": str(self.main), "tool_input": {"file_path": "src/a.py"}})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("", result.stdout)
        entry = self.log()[-1]
        self.assertEqual((0, False, 0), (entry["bytes"], entry["truncated"], entry["exit"]))

    def test_log_is_trimmed_when_large(self):
        log = self.main / ".agents/state/hook-output.jsonl"
        log.write_text(("x" * 300 + "\n") * 1000, encoding="utf-8")
        self.dispatch("harness-protect-sources", "scripts/hooks/protect-sources.sh", {"cwd": str(self.main)})
        lines = log.read_text(encoding="utf-8").splitlines()
        self.assertEqual(1000, len(lines))
        self.assertEqual("harness-protect-sources", json.loads(lines[-1])["hook"])


if __name__ == "__main__":
    unittest.main()
