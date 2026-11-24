"""복사본 동기화 · 생성 파일 보호(설계 03 §3.12 · §5 #5, HK-24 design §5). 설치본을 통째로 복사해 Claude 설정의 훅 명령으로 부른다.

    python3 -m unittest discover -s scripts/tests -p "test_sync_projection.py"
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKERS = ("CLAUDECODE", "CLAUDE_CODE_", "CODEX_", "KIRO_", "HX_", "HARNESS_", "CLAUDE_SESSION_ID", "GIT_")
SKILL = ".agents/skills/hx-plan/SKILL.md"


def clean_env(**extra):
    env = {key: value for key, value in os.environ.items() if not key.startswith(MARKERS)}
    env.update({"PYTHONDONTWRITEBYTECODE": "1"})
    env.update(extra)
    return env


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class SyncProjectionTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="sync projection ")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve() / "repo"
        shutil.copytree(ROOT, self.root, symlinks=True, ignore=shutil.ignore_patterns(".git", "tests", "__pycache__"))
        self.settings = json.loads((self.root / ".claude/settings.json").read_text(encoding="utf-8"))

    def command(self, event, hook_id):
        for group in self.settings["hooks"][event]:
            for hook in group["hooks"]:
                if f" {hook_id} " in hook["command"]:
                    return hook["command"]
        raise AssertionError(f"{event} {hook_id} 없음")

    def run_hook(self, event, hook_id, tool_input, tool="Edit"):
        payload = {"session_id": "s-1", "hook_event_name": event, "cwd": str(self.root), "tool_name": tool, "tool_input": tool_input}
        return subprocess.run(["bash", "-c", self.command(event, hook_id)], cwd=self.root, input=json.dumps(payload),
                              env=clean_env(CLAUDE_PROJECT_DIR=str(self.root)), capture_output=True, text=True, timeout=120)

    def lock_sha(self, path):
        """v1(setup.sh) · v2(CLI) lock 모두 — 킷 판 읽기 함수를 쓴다."""
        sys.path.insert(0, str(self.root / "scripts/harness"))
        try:
            from projection_engine import read_lock
            _, entries, _ = read_lock(self.root)
        finally:
            sys.path.pop(0)
        return next(e.sha for e in entries if e.path == path)

    def stale(self):
        """원본에서 다시 만든 결과와 하네스 폴더의 파일이 다른 경로(check_layout 의 stale 과 같은 뜻)."""
        code = ("import sys, json; sys.path.insert(0, 'scripts/harness'); from projection_wants import *; from pathlib import Path\n"
                "root = Path('.').resolve(); meta = read_meta(root)\n"
                "wants, _ = build_wants(root, load_spec(), {k: v for k, v in (meta.get('tokens') or {}).items()}, meta.get('agents') or [])\n"
                "print(json.dumps([r['path'] for r in records(wants, root) if r['op'] != 'merge' and "
                "(not (root / r['path']).exists() or ((root / r['path']).is_file() and sha256((root / r['path']).read_bytes()) != r['sha256']))]))")
        result = subprocess.run([sys.executable, "-B", "-c", code], cwd=self.root, capture_output=True, text=True, timeout=120)
        self.assertEqual(0, result.returncode, result.stderr)
        return json.loads(result.stdout)

    def test_editing_a_skill_source_rebuilds_copies_silently(self):
        source = self.root / SKILL
        before = self.lock_sha(".claude/rules/git-workflow.md")
        rule = self.root / ".agents/rules/git-workflow.md"
        rule.write_text(rule.read_text(encoding="utf-8") + "\n원본에 더한 줄\n", encoding="utf-8")
        source.write_text(source.read_text(encoding="utf-8") + "\n원본에 더한 줄\n", encoding="utf-8")
        self.assertIn(".claude/rules/git-workflow.md", self.stale())
        self.assertEqual(0, self.run_hook("PostToolUse", "harness-sync-projection", {"file_path": str(rule)}).returncode)
        result = self.run_hook("PostToolUse", "harness-sync-projection", {"file_path": str(source)})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("", result.stdout)
        for copy in (".claude/skills/hx-plan/SKILL.md", ".kiro/skills/hx-plan/SKILL.md"):
            self.assertEqual(source.read_bytes(), (self.root / copy).read_bytes(), copy)
        self.assertIn("원본에 더한 줄", (self.root / ".cursor/commands/hx-plan.md").read_text(encoding="utf-8"))
        self.assertNotEqual(before, self.lock_sha(".claude/rules/git-workflow.md"))
        self.assertEqual([], self.stale())

    def test_editing_hooks_json_rewrites_every_harness_hook_setting(self):
        path = self.root / ".agents/hooks.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for hook in data["hooks"]:
            if hook["id"] == "harness-verify-gate":
                hook["timeoutSec"] = 170
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        result = self.run_hook("PostToolUse", "harness-sync-projection", {"file_path": ".agents/hooks.json"})
        self.assertEqual(("", 0), (result.stdout, result.returncode), result.stderr)
        claude = json.loads((self.root / ".claude/settings.json").read_text(encoding="utf-8"))
        codex = json.loads((self.root / ".codex/hooks.json").read_text(encoding="utf-8"))
        kiro = json.loads((self.root / ".kiro/hooks/harness-verify-gate.json").read_text(encoding="utf-8"))
        self.assertEqual(170, claude["hooks"]["Stop"][0]["hooks"][0]["timeout"])
        self.assertEqual(170, codex["hooks"]["Stop"][0]["hooks"][0]["timeout"])
        self.assertEqual(170, kiro["hooks"][0]["action"]["timeout"])
        coordinator = next(p for p in (self.root / ".kiro/agents").glob("*.json") if "agentSpawn" in p.read_text(encoding="utf-8"))
        self.assertIn(170000, [e["timeout_ms"] for e in json.loads(coordinator.read_text(encoding="utf-8"))["hooks"]["stop"]])
        self.assertEqual([], self.stale())

    def test_writes_outside_sources_do_not_touch_the_lock(self):
        lock = self.root / ".agents/harness-kit.lock"
        before = sha(lock)
        result = self.run_hook("PostToolUse", "harness-sync-projection", {"file_path": "src/app.py"})
        self.assertEqual(("", 0), (result.stdout, result.returncode))
        self.assertEqual(before, sha(lock))

    def test_sync_failure_is_one_short_line_and_does_not_block(self):
        (self.root / ".agents/hooks.json").write_text("{ 깨짐", encoding="utf-8")
        result = self.run_hook("PostToolUse", "harness-sync-projection", {"file_path": ".agents/hooks.json"})
        self.assertEqual(0, result.returncode)
        self.assertEqual(1, len(result.stdout.splitlines()), result.stdout)
        self.assertLessEqual(len(result.stdout.encode("utf-8")), 200)
        self.assertIn("동기화 실패", result.stdout)

    def test_generated_files_are_protected_with_the_source_path(self):
        for rel, origin in ((".claude/skills/hx-plan/SKILL.md", ".agents/skills/hx-plan"), (".kiro/steering/git-workflow.md", ".agents/rules/git-workflow.md"),
                            (".kiro/hooks/harness-verify-gate.json", ".agents/hooks.json")):
            with self.subTest(rel=rel):
                result = self.run_hook("PreToolUse", "harness-protect-generated", {"file_path": rel})
                self.assertEqual(2, result.returncode, result.stdout + result.stderr)
                self.assertIn(f"원본 {origin}", result.stderr)

    def test_codex_patch_to_a_generated_file_is_blocked_too(self):
        patch = "*** Begin Patch\n*** Update File: .cursor/rules/git-workflow.mdc\n@@\n-a\n+b\n*** End Patch"
        result = self.run_hook("PreToolUse", "harness-protect-generated", {"command": patch}, tool="apply_patch")
        self.assertEqual(2, result.returncode, result.stderr)

    def test_sources_and_merge_targets_are_not_blocked(self):
        for rel in (SKILL, ".claude/settings.json", ".codex/hooks.json", "CLAUDE.md", "src/app.py"):
            with self.subTest(rel=rel):
                result = self.run_hook("PreToolUse", "harness-protect-generated", {"file_path": rel})
                self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()
