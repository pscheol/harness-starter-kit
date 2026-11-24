"""세션 등록 훅(설계 06 §3.9, DB-R16, HK-17 design §8). 표준 출력은 평소 0바이트이고 파일만 쓴다.

    python3 -m unittest discover -s scripts/tests -p "test_session_register.py"
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKERS = ("CLAUDECODE", "CLAUDE_CODE_", "CODEX_", "KIRO_", "CURSOR_AGENT", "HX_", "HARNESS_SESSION_ID", "CLAUDE_SESSION_ID", "GIT_")


def clean_env(**extra):
    env = {key: value for key, value in os.environ.items() if not key.startswith(MARKERS)}
    env.update({"PYTHONDONTWRITEBYTECODE": "1", "GIT_CONFIG_NOSYSTEM": "1"})
    env.update(extra)
    return env


def git(cwd, *arguments):
    subprocess.run(["git", "-c", "maintenance.auto=false", "-c", "gc.auto=0", *arguments], cwd=cwd, check=True, capture_output=True, text=True)


class SessionRegisterCase(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="session register ")
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name).resolve()
        self.root = self.base / "repo"
        (self.root / "scripts").mkdir(parents=True)
        shutil.copytree(ROOT / "scripts/hooks", self.root / "scripts/hooks")
        shutil.copytree(ROOT / "scripts/harness", self.root / "scripts/harness", ignore=shutil.ignore_patterns("__pycache__"))
        meta = {"schema": "harness-kit/v2", "project": {"name": "demo", "slug": "demo"}, "git": {"base": "develop"},
                "roles": {"design": {"harness": "claude"}, "implement": {"harness": "claude"}, "review": {"harness": "codex"}}}
        (self.root / ".agents").mkdir()
        (self.root / ".agents/harness-kit.json").write_text(json.dumps(meta), encoding="utf-8")
        (self.root / ".gitignore").write_text(".agents/state/\n", encoding="utf-8")
        git(self.root, "init", "-q", "-b", "develop")
        git(self.root, "config", "user.email", "kim@example.com")
        git(self.root, "config", "user.name", "Kim")
        git(self.root, "add", "-A")
        git(self.root, "commit", "-q", "-m", "init")
        self.sessions = self.root / ".agents/state/sessions"

    def hook(self, payload, cwd=None, **env):
        cwd = cwd or self.root
        return subprocess.run(["bash", str(cwd / "scripts/hooks/session-register.sh")], cwd=cwd, input=json.dumps(payload),
                              env=clean_env(**env), capture_output=True, text=True, timeout=30)

    def worktree(self, branch, name):
        path = self.base / "repo.worktrees" / name
        git(self.root, "worktree", "add", "-q", "-b", branch, str(path))
        return path

    def session(self, sid):
        return json.loads((self.sessions / f"{sid}.json").read_text(encoding="utf-8"))


class SessionRegisterTest(SessionRegisterCase):
    def test_start_writes_session_file_0600_in_0700_folder_with_no_output(self):
        result = self.hook({"session_id": "s-1", "hook_event_name": "SessionStart", "cwd": str(self.root), "permission_mode": "acceptEdits"},
                           HX_HARNESS="claude", CLAUDE_CODE_MESSAGING_SOCKET="/tmp/cc-socks-501/abc", CLAUDE_CODE_MESSAGING_TOKEN="SECRET-TOKEN")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.stderr, "")
        path = self.sessions / "s-1.json"
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.sessions.stat().st_mode & 0o777, 0o700)
        data = self.session("s-1")
        self.assertEqual(data["schema"], "harness-kit.session/v1")
        self.assertEqual((data["id"], data["harness"], data["turn"], data["permissionMode"]), ("s-1", "claude", "idle", "acceptEdits"))
        self.assertEqual(data["inbox"], {"kind": "uds", "path": "/tmp/cc-socks-501/abc"})
        self.assertEqual((data["checkout"], data["branch"], data["issue"]), ("main", "develop", None))
        self.assertEqual((data["role"], data["roleSource"]), ("unknown", "none"))
        self.assertNotIn("SECRET-TOKEN", path.read_text(encoding="utf-8"))
        for key in ("startedAt", "lastSeenAt", "pid", "pidStartedAt", "cwd", "harnessVersion", "name"):
            self.assertIn(key, data)

    def test_worktree_session_is_written_to_main_folder_with_branch_role_and_issue(self):
        tree = self.worktree("feat/DEMO-3-upload-cleanup", "DEMO-3-upload-cleanup")
        result = self.hook({"session_id": "wt-1", "hook_event_name": "SessionStart", "cwd": str(tree)}, cwd=tree, HX_HARNESS="claude")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((tree / ".agents/state/sessions/wt-1.json").exists())
        data = self.session("wt-1")
        self.assertEqual((data["role"], data["roleSource"], data["issue"], data["checkout"]), ("implement", "branch", "DEMO-3", "worktree"))
        self.assertEqual(data["branch"], "feat/DEMO-3-upload-cleanup")
        self.assertNotIn("inbox", {k for k, v in data.items() if v})

    def test_role_from_config_env_overrides_and_docs_branch(self):
        self.hook({"session_id": "c-1", "hook_event_name": "SessionStart"}, HX_HARNESS="codex")
        self.assertEqual((self.session("c-1")["role"], self.session("c-1")["roleSource"]), ("review", "config"))
        self.hook({"session_id": "e-1", "hook_event_name": "SessionStart"}, HX_HARNESS="claude", HX_ROLE="design", HX_ISSUE="DEMO-9", HX_SESSION_NAME="design-desk")
        data = self.session("e-1")
        self.assertEqual((data["role"], data["roleSource"], data["issue"], data["name"]), ("design", "env", "DEMO-9", "design-desk"))
        docs = self.worktree("docs/INT-2-pay-reform", "INT-2-pay-reform")
        self.hook({"session_id": "d-1", "hook_event_name": "SessionStart"}, cwd=docs, HX_HARNESS="claude")
        self.assertEqual((self.session("d-1")["role"], self.session("d-1")["roleSource"]), ("docs", "branch"))

    def test_prompt_and_stop_update_turn_and_end_removes_file(self):
        self.hook({"session_id": "t-1", "hook_event_name": "SessionStart"}, HX_HARNESS="claude")
        started = self.session("t-1")["startedAt"]
        result = self.hook({"session_id": "t-1", "hook_event_name": "UserPromptSubmit", "prompt": "do it"}, HX_HARNESS="claude")
        self.assertEqual((result.returncode, result.stdout), (0, ""))
        self.assertEqual(self.session("t-1")["turn"], "working")
        self.assertEqual(self.session("t-1")["startedAt"], started)
        self.hook({"session_id": "t-1", "hook_event_name": "Stop"}, HX_HARNESS="claude")
        self.assertEqual(self.session("t-1")["turn"], "idle")
        self.hook({"session_id": "t-1", "hook_event_name": "SessionEnd"}, HX_HARNESS="claude")
        self.assertFalse((self.sessions / "t-1.json").exists())
        self.hook({"session_id": "k-1", "hook_event_name": "agentSpawn"}, HX_HARNESS="kiro")
        self.assertEqual(self.session("k-1")["harness"], "kiro")

    def test_missing_or_bad_session_id_writes_nothing(self):
        for payload in ({"hook_event_name": "SessionStart"}, {"session_id": "../x", "hook_event_name": "SessionStart"}, {"session_id": "a" * 80}):
            with self.subTest(payload=str(payload)[:40]):
                result = self.hook(payload, HX_HARNESS="claude")
                self.assertEqual((result.returncode, result.stdout), (0, ""))
        self.assertFalse(self.sessions.exists() and any(self.sessions.iterdir()))
        result = subprocess.run(["bash", str(self.root / "scripts/hooks/session-register.sh")], cwd=self.root, input="not json",
                                env=clean_env(HX_HARNESS="claude"), capture_output=True, text=True, timeout=30)
        self.assertEqual((result.returncode, result.stdout), (0, ""))


if __name__ == "__main__":
    unittest.main()
